// Build a wall for a saved lecture through the OpenClaw Gateway and save it with its run log.
// Usage: OPENCLAW_GATEWAY_TOKEN=... node scripts/run-wall.js oyc-phys200-16 [--gpu] [gateway-url]
// --gpu runs the same agents and prompts on Kimi K3.1 Pro through OpenRouter, pinned to Moonshot AI's own API.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildWall } from '../lib/pipeline.js';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const [id, urlArg] = args.filter((a) => a !== '--gpu');
const url = urlArg || process.env.LIVELAB_GATEWAY || 'http://127.0.0.1:18790';
const side = gpu
  ? { agents: { finder: 'livelab-finder-gpu', builder: 'livelab-builder-gpu' }, provider: 'openrouter/moonshotai/kimi-k3.1-pro pinned to Moonshot AI (moonshotai/mxfp4) via OpenClaw' }
  : {};
const token = process.env.OPENCLAW_GATEWAY_TOKEN;
if (!id || !token) { console.error('usage: OPENCLAW_GATEWAY_TOKEN=... node scripts/run-wall.js <lecture id> [--gpu] [gateway url]'); process.exit(2); }

const doc = JSON.parse(readFileSync(new URL(`../data/lectures/${id}.json`, import.meta.url), 'utf8'));
const t = (s) => `${String(s.toFixed(1)).padStart(6)}s`;
const { wall, log } = await buildWall(doc, {
  gateway: { url, token },
  ...side,
  onEvent: (type, d) => {
    if (type === 'cards') console.log(`${t(d.at)}  rule finder: ${d.count} rules`);
    if (type === 'tile') console.log(`${t(d.at)}  lab ${d.card}: ${d.check.verdict}${d.check.limit !== undefined ? ` at ${d.check.limit.toFixed(3)} ${d.check.unit}` : ''}${d.check.lo !== undefined ? ` ${d.check.lo.toFixed(2)}–${d.check.hi.toFixed(2)} ${d.check.unit}` : ''} (${d.lab.title})`);
    if (type === 'skip') console.log(`         skipped ${d.id ?? ''}: ${d.why}`);
    if (type === 'done') console.log(`${t(d.wallSeconds)}  done: ${d.tiles} labs, ${d.skipped} skipped`);
  },
});
const stamp = wall.startedAt.replace(/[:.]/g, '-');
const runId = `${id}-${stamp}${gpu ? '-gpu' : ''}`;
mkdirSync(new URL('../data/runs/', import.meta.url), { recursive: true });
mkdirSync(new URL('../data/walls/', import.meta.url), { recursive: true });
const logText = log.map((x) => JSON.stringify(x)).join('\n') + '\n';
wall.id = runId;
wall.lecture = id;
wall.runLog = { file: `data/runs/${runId}.jsonl`, sha256: createHash('sha256').update(logText).digest('hex') };
writeFileSync(new URL(`../data/runs/${runId}.jsonl`, import.meta.url), logText);
writeFileSync(new URL(`../data/walls/${runId}.json`, import.meta.url), JSON.stringify(wall, null, 1) + '\n');
console.log(`saved data/walls/${runId}.json`);
