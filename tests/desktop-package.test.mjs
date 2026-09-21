import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('desktop package includes a self-contained launcher and release updater', async () => {
  const packageJson = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'));
  const rootPackageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const main = await readFile(resolve(root, 'desktop/main.mjs'), 'utf8');
  const preload = await readFile(resolve(root, 'desktop/preload.mjs'), 'utf8');
  const server = await readFile(resolve(root, 'desktop/local-server.mjs'), 'utf8');
  const afterPack = await readFile(resolve(root, 'desktop/after-pack.mjs'), 'utf8');
  const workflow = await readFile(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8');

  assert.equal(packageJson.version, rootPackageJson.version);
  assert.match(main, /startLocalServer/);
  assert.match(main, /autoUpdater\.checkForUpdates/);
  assert.match(main, /autoUpdater\.autoDownload = false/);
  assert.match(main, /preload: join\(here, 'preload\.mjs'\)/);
  assert.match(preload, /desktop-update-download/);
  assert.match(server, /api\/local\/pair\/start/);
  assert.match(server, /workspace\.json/);
  assert.equal(packageJson.build.afterPack, 'after-pack.mjs');
  assert.match(afterPack, /codesign/);
  assert.match(afterPack, /--sign/);
  assert.match(afterPack, /--timestamp=none/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /softprops\/action-gh-release/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']false["']/g);
  assert.equal((workflow.match(/CSC_IDENTITY_AUTO_DISCOVERY:\s*["']false["']/g) || []).length, 2);
});
