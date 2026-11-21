// Pack the site as static files in public/ for a static host (Vercel): pages, scripts, the physics library,
// saved walls, run logs, lectures and labels. Live building stays on the build server (web/static/config.js).
// Usage: node scripts/build-static.js
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { library } from '../lib/library.js';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}public`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(`${root}web`).filter((f) => f.endsWith('.html'))) cpSync(`${root}web/${f}`, `${out}/${f}`);
cpSync(`${root}web/static`, `${out}/static`, { recursive: true });
mkdirSync(`${out}/lib/models`, { recursive: true });
for (const f of ['check.js', 'num.js', 'evaluate.js']) cpSync(`${root}lib/${f}`, `${out}/lib/${f}`);
cpSync(`${root}lib/models`, `${out}/lib/models`, { recursive: true });
for (const [from, to] of [['data/walls', 'walls'], ['data/runs', 'runs'], ['data/lectures', 'lectures'], ['data/labels', 'labels']]) {
  cpSync(`${root}${from}`, `${out}/${to}`, { recursive: true });
}
writeFileSync(`${out}/library.json`, JSON.stringify(library(root)));
console.log('public/ ready:', readdirSync(out).join(' '));
