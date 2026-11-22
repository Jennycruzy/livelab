// The gift agent's best run: the published number must follow from the calls as Cerebras returned them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const run = JSON.parse(readFileSync(new URL('../santa/results/best-run.json', import.meta.url), 'utf8'));

test('santa best run: the mean and fastest call follow from the recorded calls', () => {
  const rates = run.calls.map((c) => c.completion_tokens / c.completion_seconds);
  assert.equal(run.calls.length, 2);
  assert.equal(new Set(run.calls.map((c) => c.cerebras_response_id)).size, run.calls.length, 'every call is a different request');
  for (const c of run.calls) assert.match(c.cerebras_response_id, /^chatcmpl-[0-9a-f-]{36}$/);
  assert.equal(Math.round(rates.reduce((a, b) => a + b, 0) / rates.length), 1286);
  assert.equal(Math.round(Math.max(...rates)), 1385);
  assert.equal(Math.round(run.mean_tok_per_s), 1286);
});

test('santa best run: five different product links in five different shops', () => {
  assert.equal(run.links.length, 5);
  assert.equal(new Set(run.links.map((l) => new URL(l).hostname)).size, 5);
  for (const l of run.links) assert.match(l, /^https:\/\/[^/]+\/products\/[^/]+$/);
});
