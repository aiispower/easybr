#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output || !output.endsWith('.zip')) throw Error('Supply an output ZIP path outside the Skill directory.');
const destination = resolve(output), source = resolve('skills/easybr-agent');
if (destination.startsWith(source + '/')) throw Error('Output cannot be inside the Skill.');
try { await stat(destination); throw Error('Output already exists; choose a new path.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await promisify(execFile)('python3', ['-c', `import os,sys,zipfile
source,destination=sys.argv[1:]
with zipfile.ZipFile(destination,'x',zipfile.ZIP_DEFLATED) as z:
 for root,dirs,files in os.walk(source):
  dirs[:]=sorted(d for d in dirs if not d.startswith('.'))
  for name in sorted(files):
   if not name.startswith('.'):
    path=os.path.join(root,name)
    z.write(path,os.path.relpath(path,os.path.dirname(source)))
`, source, destination]);
const data = await readFile(destination);
console.log(JSON.stringify({ path: destination, size: data.length, sha256: createHash('sha256').update(data).digest('hex') }, null, 2));
