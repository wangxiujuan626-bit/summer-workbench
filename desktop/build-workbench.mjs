import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const projectRoot = resolve(desktopRoot, '..');
const outputRoot = join(desktopRoot, '.build', 'workbench');
const files = [
  'app.js', 'ai-connector.js', 'avatar-default.svg', 'cola.js', 'day-rollover.js',
  'favicon.svg', 'file.svg', 'globe.svg', 'icon-192.png', 'icon-512.png',
  'manifest.webmanifest', 'qr.js', 'styles.css', 'sw.js', 'sync.js',
  'update.json', 'window.svg',
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(projectRoot, 'app', 'workbench.html'), join(outputRoot, 'index.html'));
for (const file of files) await cp(join(projectRoot, 'public', file), join(outputRoot, file));
const version = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')).version;
await writeFile(join(outputRoot, 'VERSION'), `${version}\n`, 'utf8');
