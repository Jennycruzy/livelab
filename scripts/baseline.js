// Model alone: ask Kimi K3.1 Pro (no physics library, no tools) whether each of the 20 frozen lecture moments holds
// and where it stops holding within 1%, then grade against the frozen key. Saves every reply in data/baseline/.
// Usage: CEREBRAS_API_KEY=... node scripts/baseline.js [reasoning_effort=low] [--regrade]  (--regrade re-scores saved replies)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const KEY = createRequire(import.meta.url)('../test/fixtures/key.cjs');
const effort = process.argv[2] || 'low';
const MODEL = 'moonshotai-kimi-k3.1-pro-trial';
const SYSTEM = `A physics teacher states a rule. Decide, as precisely as you can, whether the rule stays within 1% relative
error of the exact physics over the situation described (|rule - exact| / |exact| <= 0.01), and if it stops holding,
the value of the varying quantity where the error first passes 1%. Reply with one JSON object and nothing else:
{"verdict": "holds" or "breaks", "limit": number or null, "unit": "unit of the limit or null",
 "limit_low": number or null (only if the rule holds only inside a band: the lower edge)}`;

async function ask(line) {
  const body = { model: MODEL, reasoning_effort: effort, max_completion_tokens: 16000, temperature: 1.0,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: line }] };
  for (let attempt = 0; attempt < 8; attempt++) {
    const t0 = Date.now();
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', { method: 'POST',
      headers: { authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 20000)); continue; }
    if (!r.ok) return { error: `HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}` };
    return { content: j.choices?.[0]?.message?.content ?? '', usage: j.usage, time_info: j.time_info, ms: Date.now() - t0 };
  }
  return { error: 'queue full after 8 tries' };
}

function grade(k, reply) {
  let o;
  try { const t = reply.content; o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return { parsed: false }; }
  // Put the model's number into the key's unit when it answered in another one (radians, m/s, metres, a fraction).
  const conv = (v, unit) => {
    const u = String(unit ?? '').toLowerCase(), want = k.unit;
    if (!Number.isFinite(+v)) return NaN;
    if (want === 'deg' && /rad/.test(u)) return (+v * 180) / Math.PI;
    if (want === 'fraction of c' && /m\s*\/\s*s|metres? per second|meters? per second/.test(u)) return +v / 299792458;
    if (want === 'fraction of c' && /km\s*\/\s*s/.test(u)) return (+v * 1000) / 299792458;
    if (want === 'km' && /^(m|metres?|meters?)$/.test(u.trim())) return +v / 1000;
    if (want === 'm' && /^km|kilomet/.test(u.trim())) return +v * 1000;
    if (want === '% rate' && /fraction|decimal/.test(u)) return +v * 100;
    return +v;
  };
  const close = (a, b, tol) => Number.isFinite(conv(a, o.unit)) && b !== null && Math.abs(conv(a, o.unit) / b - 1) <= tol;
  const band = k.limitLow !== undefined;
  const verdict = band ? o.verdict === 'breaks' || o.verdict === 'band' : o.verdict === k.verdict;
  let limit;
  if (k.limit === null) limit = o.limit === null || o.limit === undefined;
  else if (band) limit = close(o.limit, k.limit, 0.05) && close(o.limit_low, k.limitLow, 0.05);
  else limit = close(o.limit, k.limit, 0.05);
  return { parsed: true, answer: o, verdictRight: verdict, limitWithin5pct: limit };
}

if (process.argv.includes('--regrade')) {
  const file = new URL(`../data/baseline/model-alone-${effort}.json`, import.meta.url);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of saved.rows) { const k = KEY.find((x) => x.id === r.id); r.grade = r.reply.error ? { parsed: false } : grade(k, r.reply); }
  const rows = saved.rows;
  saved.summary = { ...saved.summary, regradedAt: new Date().toISOString(), unitsConverted: true,
    verdictRight: rows.filter((r) => r.grade.verdictRight).length, limitWithin5pct: rows.filter((r) => r.grade.limitWithin5pct).length,
    bothRight: rows.filter((r) => r.grade.verdictRight && r.grade.limitWithin5pct).length };
  writeFileSync(file, JSON.stringify(saved, null, 1) + '\n');
  for (const r of rows) console.log(String(r.id).padStart(2), r.grade.verdictRight ? 'verdict ok' : 'VERDICT WRONG', r.grade.limitWithin5pct ? 'limit ok' : 'LIMIT OFF', '|', r.grade.answer?.limit, r.grade.answer?.unit ?? '', '| key', r.key.limit, r.key.unit ?? '');
  console.log(saved.summary);
  process.exit(0);
}
const rows = [];
const queue = [...KEY];
await Promise.all(Array.from({ length: 5 }, async () => {
  for (let k = queue.shift(); k; k = queue.shift()) {
    const reply = await ask(k.line);
    const g = reply.error ? { parsed: false } : grade(k, reply);
    rows.push({ id: k.id, line: k.line, key: { verdict: k.verdict, limit: k.limit, limitLow: k.limitLow ?? null, unit: k.unit }, reply, grade: g });
    console.log(String(k.id).padStart(2), g.parsed ? `${g.answer.verdict} ${g.answer.limit ?? '-'} ${g.answer.unit ?? ''}` : reply.error ?? 'unparsed',
      '| key', k.verdict, k.limit === null ? '-' : k.limit.toFixed(3), '|', g.verdictRight ? 'verdict ok' : 'VERDICT WRONG', g.limitWithin5pct ? 'limit ok' : 'LIMIT OFF');
  }
}));
rows.sort((a, b) => a.id - b.id);
const summary = { model: MODEL, reasoning_effort: effort, at: new Date().toISOString(), moments: rows.length,
  verdictRight: rows.filter((r) => r.grade.verdictRight).length, limitWithin5pct: rows.filter((r) => r.grade.limitWithin5pct).length,
  bothRight: rows.filter((r) => r.grade.verdictRight && r.grade.limitWithin5pct).length };
mkdirSync(new URL('../data/baseline/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../data/baseline/model-alone-${effort}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 1) + '\n');
console.log(summary);
