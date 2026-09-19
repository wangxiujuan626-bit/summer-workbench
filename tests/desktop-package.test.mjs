import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('desktop package includes a self-contained launcher and release updater', async () => {
  const packageJson = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'));
  const rootPackageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const main = await readFile(resolve(root, 'desktop/main.mjs'), 'utf8');
  const server = await readFile(resolve(root, 'desktop/local-server.mjs'), 'utf8');
  const workflow = await readFile(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8');

  assert.equal(packageJson.version, rootPackageJson.version);
  assert.match(main, /startLocalServer/);
  assert.match(main, /autoUpdater\.checkForUpdatesAndNotify/);
  assert.match(server, /api\/local\/pair\/start/);
  assert.match(server, /workspace\.json/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /softprops\/action-gh-release/);
});
