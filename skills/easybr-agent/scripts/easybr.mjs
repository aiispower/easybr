#!/usr/bin/env node
// HTTP client for existing EasyBR Local API and Easy WebBridge. No browser executor.
import { readFile, mkdir, rename, unlink, stat, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const pause = ms => new Promise(r => setTimeout(r, ms));
export function localOrigin(value, fallback) {
  const u = new URL(value || fallback);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('loopback_http_origin_required');
  return u.origin;
}
export function client({ base = process.env.EASYBR_API_BASE_URL, bridge = process.env.EASY_WEBBRIDGE_URL, fetcher = fetch, token = async () => process.env.EASY_WEBBRIDGE_TOKEN || (await readFile(join(homedir(), '.easy-webbridge', 'bridge-token'), 'utf8')).trim() } = {}) {
  base = localOrigin(base, 'http://127.0.0.1:3001');
  bridge = localOrigin(bridge, 'http://127.0.0.1:17777');
  async function request(origin, endpoint, { body, auth = false, timeout = 15000, local = true } = {}) {
    const mutating = body !== undefined;
    let res;
    try {
      res = await fetcher(origin + endpoint, { method: mutating ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${await token()}` } : {}) }, ...(mutating ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) });
    } catch { throw Error(mutating ? 'operation_outcome_unknown_check_state_before_retry' : 'service_unavailable_or_auth_missing'); }
    const v = await res.json().catch(() => null);
    if (!res.ok || !v || (local ? v.code !== undefined && ![0, '0'].includes(v.code) : v.ok === false)) throw Error(`api_rejected_${Number(v?.code) || res.status}`);
    return v;
  }
  const api = (p, o) => request(base, p, o);
  const br = (p, o = {}) => request(bridge, p, { ...o, auth: true, local: false });
  const rows = v => Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.data?.items) ? v.data.items : [];
  async function list() {
    const out = [];
    for (let page = 1; page <= 100; page++) {
      const v = await api(`/auto/getBrowerList?${new URLSearchParams({ page: String(page), limit: '100', browername: '' })}`);
      if (!Array.isArray(v) && !Array.isArray(v.data) && !Array.isArray(v.data?.items)) throw Error('environment_list_shape_unknown');
      const items = rows(v), fresh = items.filter(x => !out.some(y => y.browerid === x.browerid));
      out.push(...fresh);
      if (!fresh.length || items.length < 100 || (Number(v.count) > 0 && out.length >= Number(v.count))) return out;
    }
    throw Error('pagination_limit_reached_incomplete_list');
  }
  async function browsers() { const v = await br('/v1/browsers'); return v.browsers || v.data || []; }
  async function opened() { return rows(await api('/auto/openedList')); }
  function summary(x, open = [], online = []) { return { environment_id: x.browerid, name: x.browername, browser_id: `easybr-${x.browerid}`, opened: open.some(y => y.browerid === x.browerid && y.isopen !== false && y.isopen !== 0), bridge_online: online.some(y => y.browserId === `easybr-${x.browerid}` && y.online !== false) }; }
  async function select({ id, name }) {
    if (!!id === !!name) throw Error('choose_exactly_one_id_or_name');
    const matches = (await list()).filter(x => id ? x.browerid === id : x.browername === name);
    if (matches.length !== 1) throw Error(matches.length ? 'environment_name_ambiguous' : 'environment_not_found');
    return matches[0];
  }
  async function statuses() { const [all, open, online] = await Promise.all([list(), opened(), browsers().catch(() => [])]); return all.map(x => summary(x, open, online)); }
  async function create({ name, kernel = '146', siteurl = 'https://www.example.com' }) {
    if (!name || name.trim() !== name || name.length > 100) throw Error('nonempty_trimmed_name_required_max_100');
    if (!['119', '146'].includes(kernel)) throw Error('supported_kernel_required');
    if (!['http:', 'https:'].includes(new URL(siteurl).protocol)) throw Error('http_site_url_required');
    const matches = (await list()).filter(x => x.browername === name);
    if (matches.length > 1) throw Error('environment_name_ambiguous');
    if (matches.length === 1) return { ...summary(matches[0]), created: false, existing: true };
    const result = await api('/auto/addBrowers', { body: { browername: name, openmodel: '2', kernel, osName: 'MacOS', siteurl, proxyType: '1', lastSession: true, cloudSync: false }, timeout: 90000 });
    const id = result.data?.browerid;
    if (!id) throw Error('create_result_missing_id_check_list_before_retry');
    return { environment_id: id, name, browser_id: `easybr-${id}`, created: true };
  }
  async function open(target, { waitMs = 15000 } = {}) {
    const x = await select(target), before = summary(x, await opened(), await browsers().catch(() => []));
    if (before.bridge_online) return { ...before, ready: true, reused: true };
    if (!before.opened) {
      const r = await api('/auto/openBrower', { body: { browerid: x.browerid }, timeout: 90000 });
      if (r.data?.browerid && r.data.browerid !== x.browerid) throw Error('opened_environment_identity_mismatch');
    }
    const deadline = Date.now() + waitMs;
    do {
      const s = summary(x, await opened(), await browsers().catch(() => []));
      if (s.bridge_online) return { ...s, ready: true, reused: before.opened };
      if (Date.now() >= deadline) return { ...s, ready: false, reason: 'environment_open_bridge_not_ready_do_not_restart' };
      await pause(500);
    } while (true);
  }
  async function close(target, allowClientClose = false) {
    const x = await select(target);
    if (!allowClientClose) throw Error('client_close_can_force_after_timeout_use_normal_browser_quit_or_explicit_allow_client_close');
    await api('/auto/closeBrower', { body: { browerid: x.browerid }, timeout: 90000 });
    return { environment_id: x.browerid, closed: !(await opened()).some(y => y.browerid === x.browerid && y.isopen !== false && y.isopen !== 0) };
  }
  async function doctor() {
    let manager = false, authenticatedList = false, health = false, bridgeAuth = false, environmentCount, onlineCount;
    let loginStatus = 'unknown', username = null, clientVersion = null;
    try {
      const { data } = await api('/auto/status'); manager = true;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (typeof data.appVersion === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(data.appVersion)) clientVersion = data.appVersion;
        if (data.loginStatus === 'logged_in' && data.loggedIn === true) loginStatus = 'logged_in';
        else if (data.loginStatus === 'logged_out' && data.loggedIn === false) loginStatus = 'logged_out';
        if (loginStatus === 'logged_in' && typeof data.username === 'string' && data.username.trim() && data.username.length <= 320 && !/[\u0000-\u001f\u007f]/.test(data.username)) username = data.username.trim();
      }
    } catch {}
    if (manager && loginStatus !== 'logged_out') try { environmentCount = (await list()).length; authenticatedList = true; } catch {}
    try { const v = await request(bridge, '/health', { local: false }); health = v.service === 'easy-webbridge'; } catch {}
    try { onlineCount = (await browsers()).filter(x => x.online !== false).length; bridgeAuth = true; } catch {}
    return { read_only: true, platform: process.platform, architecture: process.arch, node: process.versions.node, manager_ready: manager, client_version: clientVersion, login_status: loginStatus, username, api_login_verified: loginStatus === 'logged_in', environment_list_available: authenticatedList, ui_login_verified: false, ...(environmentCount === undefined ? {} : { environment_count: environmentCount }), bridge_healthy: health, bridge_authenticated: bridgeAuth, ...(onlineCount === undefined ? {} : { connected_browser_count: onlineCount }), next: !manager ? 'start_installed_manager_or_install_mac_app' : loginStatus === 'logged_out' ? 'login_or_register_in_client' : loginStatus === 'unknown' ? 'verify_client_ui_account_or_upgrade_status_support' : !authenticatedList ? 'check_client_account_access' : !health ? 'check_embedded_bridge_and_port_17777' : !bridgeAuth ? 'check_local_bridge_token_without_printing_it' : 'select_exact_environment' };
  }
  async function command(browserId, action, args = {}) {
    if (!browserId || !action || !args || typeof args !== 'object' || Array.isArray(args)) throw Error('browser_id_action_and_args_object_required');
    const found = (await browsers()).filter(x => x.browserId === browserId && x.online !== false);
    if (found.length !== 1) throw Error('exact_browser_not_online');
    return br(`/v1/browsers/${encodeURIComponent(browserId)}/commands`, { body: { action, args, timeoutMs: 30000 }, timeout: 35000 });
  }
  return { statuses, select, create, open, close, doctor, browsers, command };
}
export function metadata(v) {
  const d = v?.data;
  if (![0, 200].includes(Number(v?.code)) || !d || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(d.version || '') || !/^[a-f0-9]{64}$/i.test(d.sha256 || '') || !Number.isSafeInteger(Number(d.size)) || Number(d.size) <= 0) throw Error('installer_metadata_missing_version_sha256_or_size');
  const u = new URL(d.loadurl);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('https_installer_url_required');
  return { version: d.version, url: u.href, sha256: d.sha256.toLowerCase(), size: Number(d.size) };
}
export async function download({ directory, fetcher = fetch } = {}) {
  if (process.platform !== 'darwin') throw Error('mac_only');
  if (!directory) throw Error('download_directory_required');
  const dir = resolve(directory); await mkdir(dir, { recursive: true });
  const endpoint = 'https://www.ebrower.com/comapi/update/getInstaller?osInfo=macos';
  async function getMeta(url) { const r = await fetcher(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw Error('installer_metadata_unavailable'); return metadata(await r.json()); }
  const main = await getMeta(endpoint);
  const output = join(dir, `easybrmac-${main.version}.zip`), temporary = output + '.part';
  try { await stat(output); throw Error('download_file_exists_choose_new_directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  try { await stat(temporary); throw Error('partial_file_exists_choose_new_directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  async function retrieve(m) {
    const r = await fetcher(m.url, { signal: AbortSignal.timeout(300000) });
    if (!r.ok || !r.body) throw Error('installer_download_failed');
    const fh = await import('node:fs/promises').then(x => x.open(temporary, 'wx', 0o600));
    let bytes = 0; const hash = createHash('sha256');
    try { for await (const chunk of r.body) { bytes += chunk.length; if (bytes > main.size) throw Error('installer_size_mismatch'); hash.update(chunk); await fh.writeFile(chunk); } } finally { await fh.close(); }
    if (bytes !== main.size || hash.digest('hex') !== main.sha256) throw Error('installer_size_or_sha256_mismatch');
    await rename(temporary, output);
    return { downloaded: true, path: output, version: main.version, size: bytes, sha256: main.sha256, source: m.url };
  }
  try { return await retrieve(main); } catch (e) {
    if (e.code === 'EEXIST') throw Error('partial_file_exists_choose_new_directory');
    await unlink(temporary).catch(() => {});
    const backup = await getMeta(endpoint + '&back=1');
    if (backup.version !== main.version || backup.sha256 !== main.sha256 || backup.size !== main.size || backup.url === main.url) throw Error('no_verified_matching_backup_installer');
    try { return await retrieve(backup); } catch (backupError) { await unlink(temporary).catch(() => {}); throw backupError; }
  }
}
export async function verifyApp(app) {
  if (process.platform !== 'darwin') throw Error('mac_only');
  const p = resolve(app || '');
  if (!app || !p.endsWith('.app') || !(await stat(p)).isDirectory()) throw Error('app_directory_required');
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', p]);
  await exec('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', p]);
  const { stdout } = await exec('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleShortVersionString', join(p, 'Contents', 'Info.plist')]);
  return { app: p, version: stdout.trim(), codesign_valid: true, gatekeeper_accepted: true };
}
async function main(argv) {
  const [verb = 'doctor', ...tail] = argv, options = {};
  for (let i = 0; i < tail.length; i++) {
    const key = tail[i];
    if (key === '--allow-client-close') { options.allowClientClose = true; continue; }
    if (!['--id', '--name', '--kernel', '--url', '--dir', '--app', '--browser-id', '--action', '--args-file'].includes(key) || !tail[i + 1] || tail[i + 1].startsWith('--')) throw Error('unknown_or_missing_option');
    options[key.slice(2)] = tail[++i];
  }
  const c = client(); let result;
  if (verb === 'doctor') result = await c.doctor();
  else if (verb === 'list') result = { read_only: true, environments: await c.statuses() };
  else if (verb === 'create') result = await c.create({ name: options.name, kernel: options.kernel, siteurl: options.url });
  else if (verb === 'open') result = await c.open(options);
  else if (verb === 'close') result = await c.close(options, options.allowClientClose);
  else if (verb === 'bridge-list') result = { browsers: await c.browsers() };
  else if (verb === 'bridge-command') {
    let args = {};
    if (options['args-file']) { const text = await readFile(options['args-file'], 'utf8'); try { args = JSON.parse(text); } catch { throw Error('invalid_args_json_file_contents_not_logged'); } }
    result = await c.command(options['browser-id'], options.action, args);
  }
  else if (verb === 'download') result = await download({ directory: options.dir });
  else if (verb === 'verify-app') result = await verifyApp(options.app);
  else if (verb === 'start-manager') {
    if (process.platform !== 'darwin') throw Error('mac_only');
    let app = options.app;
    if (!app) { const matches = (await readdir('/Applications')).filter(n => /easybr.*\.app$/i.test(n)); if (matches.length !== 1) throw Error('installed_app_not_unique_supply_app'); app = join('/Applications', matches[0]); }
    if (!app.endsWith('.app') || !(await stat(app)).isDirectory()) throw Error('app_directory_required');
    await exec('/usr/bin/open', ['-g', '-a', resolve(app)]); result = { manager_launch_requested: true, next: 'run_doctor_then_check_client_login' };
  } else throw Error('commands_doctor_list_create_open_close_download_verify-app_start-manager_bridge-list_bridge-command');
  console.log(JSON.stringify(result, null, 2));
  if (result.ready === false || result.closed === false) process.exitCode = 1;
}
const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entryPath === await realpath(new URL(import.meta.url))) main(process.argv.slice(2)).catch(e => { console.error(JSON.stringify({ error: String(e.message).split('\n')[0], automatic_mutation_retry: false })); process.exitCode = 1; });
