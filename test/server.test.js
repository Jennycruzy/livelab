// The build server: visitors always build on Cerebras and are rate limited; only the operator's key lifts the limit
// and can build on the GPU provider's agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const ADMIN = 'k'.repeat(32);
const free = () => new Promise((ok) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

test('build server: visitors stay on Cerebras and rate limited; the operator key can build on the GPU side', async () => {
  const models = [], ids = [];
  const gw = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    models.push(JSON.parse(body).model);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"cards": []}' } }], usage: {} }));
  });
  await new Promise((ok) => gw.listen(0, '127.0.0.1', ok));
  const port = await free();
  const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port), OPENCLAW_GATEWAY_TOKEN: 't',
    LIVELAB_GATEWAY: `http://127.0.0.1:${gw.address().port}`, LIVELAB_ADMIN: ADMIN }, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) { if (await fetch(base + '/').then(() => true, () => false)) break; await new Promise((ok) => setTimeout(ok, 100)); }
    const post = async (body, headers = {}) => {
      const r = await fetch(base + '/api/walls', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
      const j = await r.clone().json().catch(() => ({}));
      if (j.id) ids.push(j.id);
      return r;
    };
    const settle = () => new Promise((ok) => setTimeout(ok, 1500));

    assert.equal((await post({ lecture: 'oyc-phys200-16', side: 'gpu' })).status, 202, 'a visitor can build');
    await settle();
    assert.ok(models.length > 0 && models.every((m) => m === 'openclaw/livelab-finder'), `a visitor asking for gpu still gets Cerebras: ${[...new Set(models)]}`);
    assert.equal((await post({ lecture: 'oyc-phys200-16' })).status, 429, 'a second visitor build is rate limited');
    assert.equal((await post({ lecture: 'oyc-phys200-16', side: 'gpu' }, { 'x-livelab-admin': 'k'.repeat(31) + 'x' })).status, 429, 'a wrong key is a visitor');

    models.length = 0;
    assert.equal((await post({ lecture: 'oyc-phys200-16', side: 'gpu' }, { 'x-livelab-admin': ADMIN })).status, 202, 'the operator is not rate limited');
    await settle();
    assert.ok(models.length > 0 && models.every((m) => m === 'openclaw/livelab-finder-gpu'), `the operator's gpu build uses the gpu agents: ${[...new Set(models)]}`);
  } finally {
    srv.kill(); gw.close();
    for (const id of ids) for (const f of [`data/walls/${id}.json`, `data/runs/${id}.jsonl`]) rmSync(new URL(`../${f}`, import.meta.url), { force: true });
  }
});
