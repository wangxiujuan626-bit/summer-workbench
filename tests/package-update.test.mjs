import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packagePath = fileURLToPath(new URL('../Summer工作台-Lite.zip', import.meta.url));

test('mac launcher upgrades a previous package without losing legacy records', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'summer-update-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'Summer工作台-Lite');
  const bin = join(temporary, 'bin');
  await mkdir(root);
  await mkdir(bin);
  await writeFile(join(root, 'VERSION'), '1.0.0\n');
  await writeFile(join(root, 'index.html'), 'old');
  await writeFile(join(root, '.summer-workbench-local.json'), '{"workspaces":{"fake":{"state":{"tasks":[{"id":"fake-only"}]}}},"devices":{},"pairCodes":{}}');
  const updateScript = execFileSync('unzip', ['-p', packagePath, 'Summer工作台-Lite/update.sh'], { encoding: 'utf8' });
  await writeFile(join(root, 'update.sh'), updateScript);
  const manifest = join(temporary, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ version: '1.1.0', packageUrl: 'https://example.invalid/fake.zip' }));
  const fakeCurl = join(bin, 'curl');
  await writeFile(fakeCurl, '#!/bin/sh\nfor last do :; done\ncase "$*" in *update.json*) cp "$TEST_MANIFEST" "$last" ;; *) cp "$TEST_PACKAGE" "$last" ;; esac\n');
  await chmod(fakeCurl, 0o755);
  execFileSync('sh', [join(root, 'update.sh')], {
    cwd: temporary,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_MANIFEST: manifest, TEST_PACKAGE: packagePath },
    timeout: 15000,
  });
  assert.equal((await readFile(join(root, 'VERSION'), 'utf8')).trim(), '1.1.0');
  assert.ok((await readFile(join(root, 'index.html'), 'utf8')).includes('工作台'));
  assert.ok((await readFile(join(root, '.summer-workbench-local.json'), 'utf8')).includes('fake-only'));
  const backups = (await readdir(temporary)).filter(name => name.startsWith('.summer-workbench-previous.'));
  assert.equal(backups.length, 1);
  assert.ok((await readFile(join(temporary, backups[0], '.summer-workbench-local.json'), 'utf8')).includes('fake-only'));
});
