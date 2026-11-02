import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
// Package only app assets. Backups, tests, and development files must stay out.
const assets = ['storage.js', 'libheif-bundle.js', 'icon-180.png', 'icon-512.png'];
const html = await readFile(resolve(root, 'studio.html'), 'utf8');
const anchor = '<script src="storage.js"></script>';
if (!html.includes(anchor)) throw new Error('Could not find the app script entry point');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await Promise.all(assets.map(file => copyFile(resolve(root, file), resolve(out, file))));
await writeFile(resolve(out, 'index.html'), html.replace(anchor,
  '<script src="native.js"></script>\n' + anchor));
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
manifest.start_url = './index.html';
await writeFile(resolve(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
await build({
  absWorkingDir: root,
  entryPoints: ['native/entry.mjs'],
  outfile: resolve(out, 'native.js'),
  bundle: true,
  format: 'iife',
  target: 'safari15',
  minify: true,
  legalComments: 'inline'
});
console.log('Packaged Studio and its local assets in dist/.');
