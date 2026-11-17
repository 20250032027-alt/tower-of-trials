// Packs the built site (dist/) into ONE html file you can open anywhere: dist/tower-demo.html
// Run via:  npm run single
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const read = (name) => readFileSync(join(dist, 'assets', name));

// CSS (fonts inside it become data URIs)
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/, (_, file) => {
  let css = read(file).toString('utf8');
  css = css.replace(/url\(\s*["']?(?:\.\/|\/)?(?:assets\/)?([^"')]+\.(?:ttf|woff2?|png))["']?\s*\)/g, (m, f) => {
    const name = assets.find((a) => a === f);
    if (!name) return m;
    const mime = name.endsWith('.ttf') ? 'font/ttf' : name.endsWith('.png') ? 'image/png' : 'font/woff2';
    return `url(data:${mime};base64,${read(name).toString('base64')})`;
  });
  return `<style>${css}</style>`;
});

// JS (module scripts are deferred, so it still runs after the page body exists)
let jsName;
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/, (_, file) => { jsName = file; return ''; });
const js = read(jsName).toString('utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);

writeFileSync(join(dist, 'tower-demo.html'), html);
console.log(`dist/tower-demo.html  ${(html.length / 1048576).toFixed(2)} MB`);
