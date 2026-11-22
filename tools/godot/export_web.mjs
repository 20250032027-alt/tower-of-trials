// Exports the Godot game for the browser into public/godot/  (then `vite build` copies it to dist/godot/ and it is served at /godot/):
//   npm run godot:web
// Needs Godot 4.4+ on your PATH (or set GODOT=full\path\to\godot.exe) WITH its Web export templates installed:
//   Godot editor > Editor > Manage Export Templates > Download and Install.
// It is a single-threaded build, so it runs on any static host (Vercel, GitHub Pages, itch.io) with no special headers.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const godot = process.env.GODOT || 'godot';
mkdirSync(join(root, 'public', 'godot'), { recursive: true });
const imp = spawnSync(godot, ['--headless', '--path', join(root, 'godot'), '--import'], { stdio: 'inherit' });
if (imp.error) { console.error(`Could not start "${godot}". Put Godot on your PATH or set GODOT.`); process.exit(1); }
const r = spawnSync(godot, ['--headless', '--path', join(root, 'godot'), '--export-release', 'Web', '../public/godot/index.html'], { stdio: 'inherit' });
if (r.status !== 0) { console.error('\nThe export failed. Most likely the Web export templates are missing: Godot editor > Editor > Manage Export Templates.'); process.exit(1); }
console.log('\nDone: public/godot/index.html. Try it:  npx vite preview   then open /godot/');
