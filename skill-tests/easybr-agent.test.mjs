import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { client, localOrigin, metadata, download } from '../skills/easybr-agent/scripts/easybr.mjs';

const id = '000000000000000000000001';
const reply = v => ({ ok: true, status: 200, json: async () => v });
function fixture({ profiles = [{ browerid: id, browername: 'isolated-test' }], opened = [], browsers = [], mutate, failPost = false, status = { code: 0 } } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url), body = options.body && JSON.parse(options.body);
    calls.push({ path: u.pathname, query: u.searchParams, options, body });
    if (options.method === 'POST') {
      if (failPost) throw Error('lost response');
      if (mutate) return reply(await mutate(u.pathname, body));
      if (u.pathname === '/auto/addBrowers') return reply({ code: 0, data: { browerid: '000000000000000000000002' } });
      if (u.pathname === '/auto/openBrower') { opened.push({ browerid: body.browerid, isopen: true }); browsers.push({ browserId: `easybr-${body.browerid}`, online: true }); return reply({ code: 0, data: { browerid: body.browerid } }); }
      if (u.pathname.includes('/commands')) return reply({ ok: true, result: { tabId: 123 } });
    }
    if (u.pathname === '/auto/status') return reply(status);
    if (u.pathname === '/auto/getBrowerList') return reply({ code: 0, data: profiles, count: profiles.length });
    if (u.pathname === '/auto/openedList') return reply({ code: 0, data: opened });
    if (u.pathname === '/v1/browsers') return reply({ ok: true, browsers });
    if (u.pathname === '/health') return reply({ service: 'easy-webbridge' });
    throw Error('unexpected test request');
  };
  return { calls, c: client({ fetcher, token: async () => 'private-test-token', base: 'http://127.0.0.1:3001', bridge: 'http://127.0.0.1:17777' }) };
}

test('only HTTP loopback origins are accepted', () => {
  for (const v of ['https://127.0.0.1', 'http://example.com', 'http://user:pw@localhost', 'http://localhost/path', 'http://localhost/?token=value']) assert.throws(() => localOrigin(v));
  assert.equal(localOrigin('http://[::1]:3001'), 'http://[::1]:3001');
});
test('doctor is read-only and separates manager, environment access and Bridge authentication', async () => {
  const { c, calls } = fixture(); const v = await c.doctor();
  assert.equal(v.manager_ready, true); assert.equal(v.environment_list_available, true); assert.equal(v.bridge_authenticated, true);
  assert.ok(calls.every(x => x.options.method === 'GET'));
  assert.ok(!JSON.stringify(v).includes('private-test-token'));
});
test('legacy status availability and list access do not verify login or invent an account', async () => {
  const { c } = fixture(); const v = await c.doctor();
  assert.equal(v.manager_ready, true); assert.equal(v.environment_list_available, true);
  assert.equal(v.login_status, 'unknown'); assert.equal(v.username, null); assert.equal(v.client_version, null);
  assert.equal(v.api_login_verified, false); assert.equal(v.ui_login_verified, false);
  assert.equal(v.next, 'verify_client_ui_account_or_upgrade_status_support');
});
test('confirmed current login returns only the public account fields and can proceed to environment selection', async () => {
  const { c, calls } = fixture({ status: { code: 0, data: { appVersion: '1.7.13', loginStatus: 'logged_in', loggedIn: true, username: ' demo@example.com ', token: 'private-status-token', userInfo: { password: 'private-status-password' } } } });
  const v = await c.doctor();
  assert.equal(v.login_status, 'logged_in'); assert.equal(v.api_login_verified, true);
  assert.equal(v.username, 'demo@example.com'); assert.equal(v.client_version, '1.7.13');
  assert.equal(v.ui_login_verified, false); assert.equal(v.next, 'select_exact_environment');
  assert.ok(calls.every(x => x.options.method === 'GET'));
  assert.ok(!JSON.stringify(v).includes('private-status-'));
});
test('logged-out status suppresses a stale username and does not read profiles through an old manager session', async () => {
  const { c, calls } = fixture({ status: { code: 0, data: { appVersion: '1.7.13', loginStatus: 'logged_out', loggedIn: false, username: 'stale-account@example.com' } } });
  const v = await c.doctor();
  assert.equal(v.login_status, 'logged_out'); assert.equal(v.username, null); assert.equal(v.api_login_verified, false);
  assert.equal(v.next, 'login_or_register_in_client'); assert.equal(v.environment_list_available, false);
  assert.ok(!calls.some(x => x.path === '/auto/getBrowerList'));
});
test('unknown and inconsistent status never leak a stale username or imply login', async () => {
  for (const data of [null, [], 'invalid', { loginStatus: 'unknown', loggedIn: null, username: 'stale-account' }, { loginStatus: 'logged_in', loggedIn: false, username: 'stale-account' }, { loginStatus: 'logged_out', loggedIn: true, username: 'stale-account' }, { loggedIn: true, username: 'stale-account' }]) {
    const v = await fixture({ status: { code: 0, data } }).c.doctor();
    assert.equal(v.login_status, 'unknown'); assert.equal(v.username, null); assert.equal(v.api_login_verified, false);
    assert.equal(v.ui_login_verified, false);
  }
});
test('confirmed login without a usable username preserves login status without exposing malformed values', async () => {
  for (const username of [null, {}, 123, '', '   ', 'x'.repeat(321), 'private\nvalue']) {
    const v = await fixture({ status: { code: 0, data: { appVersion: '1.7.13', loginStatus: 'logged_in', loggedIn: true, username } } }).c.doctor();
    assert.equal(v.login_status, 'logged_in'); assert.equal(v.api_login_verified, true); assert.equal(v.username, null);
  }
});
test('HTTP 200 with business rejection does not become success', async () => {
  const c = client({ fetcher: async () => reply({ code: -1, msg: 'rejected' }) });
  await assert.rejects(c.create({ name: 'new-test' }), /api_rejected/);
});
test('list never returns raw profile secrets', async () => {
  const { c } = fixture({ profiles: [{ browerid: id, browername: 'isolated-test', cookie: 'secret', proxyPassword: 'secret', webpass: 'secret' }] });
  const out = await c.statuses(); assert.equal(out[0].environment_id, id); assert.ok(!JSON.stringify(out).includes('secret'));
});
test('same exact name is reused without creating or updating', async () => {
  const { c, calls } = fixture(); const v = await c.create({ name: 'isolated-test' });
  assert.equal(v.created, false); assert.equal(v.environment_id, id); assert.ok(calls.every(x => x.options.method === 'GET'));
});
test('duplicate exact names cannot pick the first profile', async () => {
  const { c } = fixture({ profiles: [{ browerid: id, browername: 'same' }, { browerid: 'other', browername: 'same' }] });
  await assert.rejects(c.open({ name: 'same' }), /ambiguous/); await assert.rejects(c.create({ name: 'same' }), /ambiguous/);
});
test('new profile payload has fixed Mac defaults and never supplies an old id', async () => {
  const { c, calls } = fixture(); const result = await c.create({ name: 'new-test' });
  const posts = calls.filter(x => x.options.method === 'POST'); assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/auto/addBrowers'); assert.equal(posts[0].body.openmodel, '2'); assert.equal(posts[0].body.osName, 'MacOS');
  assert.equal(posts[0].body.cloudSync, false); assert.equal(posts[0].body.browerid, undefined); assert.equal(result.created, true);
});
test('lost mutation response is never automatically retried', async () => {
  const { c, calls } = fixture({ failPost: true });
  await assert.rejects(c.create({ name: 'new-test' }), /outcome_unknown/); assert.equal(calls.filter(x => x.options.method === 'POST').length, 1);
});
test('opening targets the selected identity and awaits matching Bridge connection', async () => {
  const { c, calls } = fixture(); const result = await c.open({ id }, { waitMs: 0 });
  assert.equal(result.ready, true); assert.equal(result.browser_id, `easybr-${id}`);
  const posts = calls.filter(x => x.options.method === 'POST'); assert.deepEqual(posts[0].body, { browerid: id }); assert.equal(posts.length, 1);
});
test('opened profile without Bridge is not reopened or silently switched', async () => {
  const { c, calls } = fixture({ opened: [{ browerid: id, isopen: true }], browsers: [{ browserId: 'unrelated', online: true }] });
  const result = await c.open({ id }, { waitMs: 0 }); assert.equal(result.ready, false); assert.equal(result.browser_id, `easybr-${id}`);
  assert.ok(calls.every(x => x.options.method === 'GET'));
});
test('client close requires explicit opt-in because client can force terminate', async () => {
  const { c, calls } = fixture(); await assert.rejects(c.close({ id }), /force_after_timeout/); assert.ok(calls.every(x => x.options.method === 'GET'));
});
test('Bridge transport uses existing exact route, token header, action and args', async () => {
  const { c, calls } = fixture({ browsers: [{ browserId: `easybr-${id}`, online: true }] });
  await c.command(`easybr-${id}`, 'snapshot', { tabId: 123 });
  const post = calls.find(x => x.options.method === 'POST'); assert.equal(post.path, `/v1/browsers/easybr-${id}/commands`);
  assert.equal(post.options.headers.Authorization, 'Bearer private-test-token'); assert.deepEqual(post.body.args, { tabId: 123 });
  await assert.rejects(c.command('different', 'snapshot', { tabId: 123 }), /not_online/);
});
test('installer metadata needs HTTPS, exact positive size and SHA256', () => {
  const v = { code: 200, data: { version: '1.2.3', loadurl: 'https://example.com/app.zip', size: 12, sha256: 'a'.repeat(64) } };
  assert.equal(metadata(v).size, 12);
  assert.throws(() => metadata({ ...v, data: { ...v.data, sha256: undefined } }));
  assert.throws(() => metadata({ ...v, data: { ...v.data, loadurl: 'http://example.com/app.zip' } }));
});
test('download verifies actual content and falls back only to matching official metadata', { skip: process.platform !== 'darwin' }, async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'easybr-download-test-'));
  const bytes = Buffer.from('test installer content'), hash = createHash('sha256').update(bytes).digest('hex'), calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('/getInstaller')) return reply({ code: 200, data: { version: '1.2.3', loadurl: url.includes('back=1') ? 'https://backup.invalid/mac.zip' : 'https://primary.invalid/mac.zip', sha256: hash, size: bytes.length } });
    if (url.includes('primary.invalid')) return new Response('unavailable', { status: 503 });
    return new Response(bytes);
  };
  try {
    const v = await download({ directory: tmp, fetcher });
    assert.equal(v.sha256, hash); assert.equal(v.size, bytes.length); assert.deepEqual(await readFile(v.path), bytes);
    assert.ok(calls.some(x => x.includes('back=1'))); assert.equal(v.source, 'https://backup.invalid/mac.zip');
    await assert.rejects(download({ directory: tmp, fetcher }), /file_exists/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('download refuses mismatched backup and never saves corrupt content as final ZIP', { skip: process.platform !== 'darwin' }, async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'easybr-download-corrupt-'));
  const bytes = Buffer.from('wrong bytes'), hash = createHash('sha256').update(Buffer.from('right bytes')).digest('hex');
  const fetcher = async url => url.includes('/getInstaller') ? reply({ code: 200, data: { version: url.includes('back=1') ? '1.2.4' : '1.2.3', loadurl: 'https://test.invalid/mac.zip', sha256: hash, size: bytes.length } }) : new Response(bytes);
  try {
    await assert.rejects(download({ directory: tmp, fetcher }), /matching_backup/);
    await assert.rejects(readFile(join(tmp, 'easybrmac-1.2.3.zip')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(tmp, 'easybrmac-1.2.3.zip.part')), { code: 'ENOENT' });
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('Skill copied to independent directory can execute without repository dependency', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'easybr-skill-install-'));
  try {
    await cp(resolve('skills/easybr-agent'), join(tmp, 'easybr-agent'), { recursive: true });
    const independent = await import(pathToFileURL(join(tmp, 'easybr-agent/scripts/easybr.mjs')).href);
    const { c } = fixture(); assert.equal(typeof independent.client, 'function');
    const own = independent.client({ fetcher: async url => reply(new URL(url).pathname === '/health' ? { service: 'easy-webbridge' } : new URL(url).pathname === '/v1/browsers' ? { browsers: [] } : { code: 0, data: [] }), token: async () => 'test' });
    assert.equal((await own.doctor()).manager_ready, true);
    assert.match(await readFile(join(tmp, 'easybr-agent/SKILL.md'), 'utf8'), /name: easybr-agent/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('CLI through a real symlink prints doctor JSON from an independent Skill directory', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'easybr-skill-symlink-')), calls = [];
  const server = createServer((req, res) => {
    calls.push({ method: req.method, path: new URL(req.url, 'http://localhost').pathname });
    const data = req.url === '/auto/status' ? { code: 0, data: { appVersion: '1.7.13', loginStatus: 'logged_in', loggedIn: true, username: 'demo@example.com' } }
      : req.url === '/health' ? { service: 'easy-webbridge' }
      : req.url === '/v1/browsers' ? { browsers: [] } : { code: 0, data: [] };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await cp(resolve('skills/easybr-agent'), join(tmp, 'easybr-agent'), { recursive: true });
    await symlink(join(tmp, 'easybr-agent'), join(tmp, 'linked-skill'), 'dir');
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [join(tmp, 'linked-skill/scripts/easybr.mjs'), 'doctor'], {
      cwd: tmp, timeout: 5000, env: { ...process.env, EASYBR_API_BASE_URL: origin, EASY_WEBBRIDGE_URL: origin, EASY_WEBBRIDGE_TOKEN: 'private-test-token' },
    });
    const v = JSON.parse(stdout);
    assert.equal(stderr, ''); assert.equal(v.manager_ready, true); assert.equal(v.api_login_verified, true);
    assert.equal(v.login_status, 'logged_in'); assert.equal(v.username, 'demo@example.com');
    assert.ok(!stdout.includes('private-test-token')); assert.ok(calls.every(x => x.method === 'GET'));
    assert.ok(calls.some(x => x.path === '/auto/status'));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(tmp, { recursive: true, force: true });
  }
});
