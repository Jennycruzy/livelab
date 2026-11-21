// Model-written code must not reach the network, files, process or the host, and must not hang or eat memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProbe } from '../lib/sandbox.js';

const good = `function probe(p){ return 2*Math.PI*Math.sqrt(p.L_m/9.81); } function draw(ctx, s){ ctx.beginPath(); ctx.arc(s.w/2, s.h/2, 10, 0, 7); ctx.fill(); }`;

test('a normal sim runs and returns numbers', async () => {
  const r = await runProbe(good, [{ L_m: 1 }, { L_m: 4 }]);
  assert.ok(Math.abs(r.values[0] - 2.006) < 1e-3 && Math.abs(r.values[1] / r.values[0] - 2) < 1e-12);
});

const escapes = {
  'process global': `function probe(){ return process.pid; }`,
  'require': `function probe(){ return require('fs').readFileSync('/etc/passwd').length; }`,
  'fetch': `function probe(){ fetch('http://example.com'); return 1; }`,
  'Function from Math': `function probe(){ return Math.constructor.constructor('return process')().pid; }`,
  'Function from params': `function probe(p){ return p.constructor.constructor('return process')().pid; }`,
  'eval': `function probe(){ return eval('1+1'); }`,
  'new Function': `function probe(){ return new Function('return 7')(); }`,
  'globalThis lookups': `function probe(){ return (globalThis.process||globalThis.require||globalThis.fetch) ? 1 : NaN; }`,
};
for (const [name, src] of Object.entries(escapes)) {
  test(`blocked: ${name}`, async () => {
    // With a valid draw(), the only thing that can fail is the escape itself.
    const r = await runProbe(src + ' function draw(){}', [{ L_m: 1 }]);
    assert.ok(/did not load/.test(r.error ?? '') || Number.isNaN(r.values?.[0]), `${name} returned ${JSON.stringify(r)}`);
    assert.doesNotMatch(r.error ?? '', /draw/, 'draw() was valid, so a draw error would hide the result');
  });
}

test('an endless loop is stopped', async () => {
  const t0 = Date.now();
  const r = await runProbe(`function probe(){ for(;;){} }`, [{}, {}, {}], { perCallMs: 100, totalMs: 2000 });
  assert.ok(r.values.every(Number.isNaN) && Date.now() - t0 < 2500);
});

test('an endless loop at load time is stopped', async () => {
  const r = await runProbe(`for(;;){} function probe(){ return 1; }`, [{}], { perCallMs: 100 });
  assert.match(r.error, /did not load/);
});

test('a memory bomb is stopped', async () => {
  const r = await runProbe(`function probe(){ const a=[]; for(;;) a.push(new Array(1e6).fill(1)); }`, [{}], { perCallMs: 2000, totalMs: 4000 });
  assert.ok(r.error || Number.isNaN(r.values[0]));
});

test('missing probe, syntax errors and oversize code are refused', async () => {
  assert.match((await runProbe(`function draw(){}`, [{}])).error, /no probe/);
  assert.match((await runProbe(`function probe( {`, [{}])).error, /did not load/);
  assert.match((await runProbe('x'.repeat(12001), [{}])).error, /12,000/);
});

test('draw() must exist and must not hang', async () => {
  assert.match((await runProbe(`function probe(){ return 1; }`, [{}])).error, /no draw/);
  assert.match((await runProbe(`function probe(){ return 1; } function draw(){ for(;;){} }`, [{}], { perCallMs: 100 })).error, /draw\(\) failed/);
  assert.equal((await runProbe(`function probe(){ return 1; } function draw(c){ c.fillStyle = "#000"; c.fillRect(0,0,1,1); c.createLinearGradient(0,0,1,1).addColorStop(0,"#fff"); }`, [{}])).error, undefined);
});
