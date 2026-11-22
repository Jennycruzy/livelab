// Lecture in, checked labs out. The model finds rules and writes labs; plain code decides everything else:
// whether a quote is real, when it was said, whether the rule holds and where it breaks, and whether a lab's
// physics matches the exact answer.
import { check, resolve, CardError, TOLERANCE } from './check.js';
import { findQuote, forFinder } from './transcript.js';
import { runProbe } from './sandbox.js';
import { relErr } from './num.js';

const now = () => Date.now();
export const MERGE_GAP_S = 300;

/** Merge cards that test the same library rule with the same settings and were said close together. */
export function mergeCards(ready, gap = MERGE_GAP_S) {
  const key = ({ card }) => JSON.stringify([card.model, card.rule, card.range, card.fixed]);
  const sorted = [...ready].sort((a, b) => (a.card.t ?? a.card.sentence) - (b.card.t ?? b.card.sentence));
  const out = [];
  for (const job of sorted) {
    const prev = [...out].reverse().find((o) => key(o) === key(job));
    const last = prev && prev.card.also.length ? prev.card.also.at(-1) : prev?.card;
    const close = prev && (job.card.t === null || last.t === null ? job.card.sentence - last.sentence <= 20 : job.card.t - last.t <= gap);
    if (close) prev.card.also.push({ id: job.card.id, sentence: job.card.sentence, t: job.card.t, quote: job.card.quote });
    else out.push({ ...job, card: { ...job.card, also: [] } });
  }
  return out;
}

const BUSY = /traffic|queue|rate.?limit|too many|overload|capacity|temporarily|unavailable|internal error/i;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Call an OpenClaw agent through the Gateway's chat completions endpoint. When the provider is busy (queue full,
 * rate limited, or a passing internal error) the call waits and retries, calling onBusy(seconds) before each wait.
 */
export async function callAgent(gateway, agent, content, { timeoutMs = 300000, retries = 6, onBusy = () => {}, backoff = [5, 10, 20, 30, 30, 30] } = {}) {
  for (let attempt = 0; ; attempt++) {
    const started = now();
    const res = await fetch(`${gateway.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: `openclaw/${agent}`, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    const ended = now();
    if (res.ok) return { content: body.choices?.[0]?.message?.content ?? '', usage: body.usage ?? {}, started, ended, ms: ended - started, retries: attempt };
    const busy = res.status === 429 || res.status === 503 || ([500, 502, 504].includes(res.status) && BUSY.test(text));
    if (!busy || attempt >= retries) throw new Error(`${agent}: HTTP ${res.status} ${text.slice(0, 200)}`);
    const wait = backoff[Math.min(attempt, backoff.length - 1)];
    onBusy(wait);
    await sleep(wait * 1000);
  }
}

/** Parse the one JSON object an agent replies with (tolerates a code fence around it). */
export function parseReply(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('reply has no JSON object');
  return JSON.parse(t.slice(a, b + 1));
}

/** Five evenly spaced parameter values inside the checked range, as the probe sees them. */
function probePoints(resolved) {
  const { rule, fixed, range: [lo, hi] } = resolved;
  return Array.from({ length: 5 }, (_, i) => {
    const p = lo + ((hi - lo) * (i + 0.5)) / 5;
    return { p, params: { ...fixed, [rule.param]: p }, want: rule.exact(p, fixed) };
  });
}

/** Does the lab's own physics give the library's exact answer (within 0.5%) at five points? */
export async function probeLab(resolved, sim) {
  const pts = probePoints(resolved);
  const r = await runProbe(sim, pts.map((x) => x.params));
  if (r.error) return { agrees: false, reason: r.error, rows: [] };
  const rows = pts.map((x, i) => ({ p: x.p, got: r.values[i], want: x.want, error: relErr(r.values[i], x.want) }));
  const agrees = rows.every((x) => x.error <= 0.005);
  return { agrees, rows, reason: agrees ? null : 'probe disagrees with the exact answer' };
}

/** Predict-first: what happens to the quantity when the slider value doubles? Answered by the library. */
export function prediction(resolved) {
  const { rule, fixed, range: [lo, hi] } = resolved;
  const p0 = Math.max(lo, Math.min(hi / 2, lo + (hi - lo) / 4));
  const p1 = Math.min(hi, 2 * p0);
  const q0 = rule.exact(p0, fixed), q1 = rule.exact(p1, fixed);
  const answer = relErr(q1, q0) <= TOLERANCE ? 1 : q1 < q0 ? 0 : 2;
  return { p0, p1, q0, q1, options: ['get smaller', 'stay the same', 'get larger'], answer };
}

export function builderInput(card, resolved) {
  const { model, rule, fixed, range } = resolved;
  return JSON.stringify({ quote: card.quote, model: model.id, rule: card.rule, claim: rule.claim, param: rule.param,
    unit: rule.unit, range, fixed, quantity: rule.quantity, quantityUnit: rule.quantityUnit, statement: rule.statement });
}

/**
 * Decide a card's verdict with the library, then have a builder write its lab and keep it only if the lab's own
 * physics matches the exact answer (one repair round). Returns { tile } or { skip }.
 */
export async function buildLab({ gateway, agents, card, resolved, log, at, onBusy = () => () => {} }) {
  const verdict = check({ model: card.model, rule: card.rule, range: card.range, fixed: card.fixed });
  log.push({ kind: 'check', card: card.id, verdict: verdict.verdict, limit: verdict.limit ?? null, lo: verdict.lo ?? null, hi: verdict.hi ?? null });
  let lab = null, probe = null, attempts = 0, lastErr = null, feedback = '';
  while (attempts < 2 && !lab) {
    attempts++;
    try {
      const r = await callAgent(gateway, agents.builder, builderInput(card, resolved) + feedback, { onBusy: onBusy(`lab ${card.id}`) });
      log.push({ kind: 'model', agent: agents.builder, card: card.id, attempt: attempts, ms: r.ms, usage: r.usage, retries: r.retries, at: at() });
      const out = parseReply(r.content);
      probe = await probeLab(resolved, out.sim);
      log.push({ kind: 'probe', card: card.id, attempt: attempts, agrees: probe.agrees, reason: probe.reason, rows: probe.rows });
      if (probe.agrees) lab = { title: out.title, slider: out.slider, question: out.question, sim: out.sim };
      else feedback = `\n\nYour previous sim was rejected: ${probe.reason}. At ${JSON.stringify(probe.rows.map((x) => ({ [resolved.rule.param]: x.p, yours: x.got, exact: x.want })))}. Fix probe() so it computes the real physics.`;
    } catch (e) { lastErr = e.message; feedback = `\n\nYour previous reply could not be used: ${e.message}. Reply with the JSON object only.`; }
  }
  if (!lab) return { skip: { id: card.id, stage: 'lab', quote: card.quote, why: probe?.reason ?? lastErr ?? 'no lab' } };
  const { samples, ...v } = verdict;
  return { tile: { card: card.id, also: card.also, check: { ...v, samples }, lab, predict: prediction(resolved), attempts, at: at() } };
}

/** Split a transcript into overlapping chunks of sentence lines for parallel rule finding. */
export function chunks(doc, { size = 110, overlap = 6 } = {}) {
  const lines = forFinder(doc).split('\n');
  if (lines.length <= size + 20) return [{ from: 0, to: lines.length, text: lines.join('\n') }];
  const n = Math.ceil(lines.length / size);
  const step = Math.ceil(lines.length / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i * step - overlap), to = Math.min(lines.length, (i + 1) * step);
    out.push({ from, to, text: lines.slice(from, to).join('\n') });
  }
  return out;
}

/**
 * Build a wall for a transcript document. Rule finders read overlapping chunks of the lecture at once; each rule is
 * verified in plain code and merged with repeats of the same statement as it arrives, and its lab starts building
 * straight away. Calls onEvent(type, data) for: cards, card, skip, tile, wait, done.
 * Returns { wall, log } where log holds one entry per model call and per check.
 */
export async function buildWall(doc, { gateway, onEvent = () => {}, maxBuilders = 12, chunkSize = 110,
  agents = { finder: 'livelab-finder', builder: 'livelab-builder' }, provider = 'cerebras/moonshotai-kimi-k3.1-pro-trial via OpenClaw' } = {}) {
  const t0 = now();
  const log = [];
  const at = () => (now() - t0) / 1000;
  const wall = { title: doc.title, source: doc.source ?? null, transcriptHash: doc.transcriptHash ?? null,
    provider, agents, startedAt: new Date(t0).toISOString(),
    cards: [], tiles: [], skipped: [], timings: {} };
  const onBusy = (what) => (seconds) => { log.push({ kind: 'busy', what, wait: seconds, at: at() }); onEvent('wait', { what, seconds, at: at() }); };

  // Building: a pool of builders fed as rules arrive.
  const queue = [];
  let active = 0, findersDone = false, finish;
  const allBuilt = new Promise((ok) => { finish = ok; });
  const settle = () => { if (findersDone && active === 0 && queue.length === 0) finish(); };
  const pump = () => {
    while (active < maxBuilders && queue.length) {
      const job = queue.shift();
      active++;
      buildOne(job).catch((e) => { const s = { id: job.card.id, stage: 'lab', quote: job.card.quote, why: String(e.message || e) }; wall.skipped.push(s); onEvent('skip', s); })
        .finally(() => { active--; pump(); settle(); });
    }
    settle();
  };

  async function buildOne(job) {
    const { tile, skip } = await buildLab({ gateway, agents, ...job, log, at, onBusy });
    if (skip) { wall.skipped.push(skip); onEvent('skip', skip); return; }
    wall.tiles.push(tile);
    if (wall.timings.firstTile === undefined) wall.timings.firstTile = tile.at;
    onEvent('tile', tile);
  }

  // Verifying and merging, as each finder reply arrives.
  const groups = []; // { key, last, card }
  let nextId = 0, found = 0;
  const seenQuote = new Set();
  const take = (c) => {
    const id = `r${++nextId}`;
    const hit = typeof c.quote === 'string' ? findQuote(doc, c.quote) : null;
    if (!hit) { const s = { id, stage: 'quote', quote: c.quote, why: 'quote not found word for word in the transcript' }; wall.skipped.push(s); onEvent('skip', s); return; }
    let resolved;
    try { resolved = resolve({ model: c.model, rule: c.rule, range: c.range, fixed: c.fixed }); }
    catch (e) { const s = { id, stage: 'library', quote: c.quote, model: c.model, rule: c.rule, why: e instanceof CardError ? e.message : String(e) }; wall.skipped.push(s); onEvent('skip', s); return; }
    const card = { id, sentence: hit.sentence, t: hit.t, chapter: hit.chapter, quote: c.quote, plain: c.plain ?? '',
      model: c.model, rule: c.rule, range: resolved.range, fixed: resolved.fixed, notes: resolved.notes,
      modelSentence: c.sentence, ambiguous: hit.ambiguous };
    const key = JSON.stringify([card.model, card.rule, card.range, card.fixed]);
    const dup = `${key}|${card.sentence}`;
    if (seenQuote.has(dup)) return; // the same statement found again in an overlapping chunk
    seenQuote.add(dup);
    wall.cards.push(card);
    found++;
    onEvent('card', card);
    const pos = card.t ?? card.sentence * 10;
    const g = groups.find((x) => x.key === key && Math.abs(pos - x.last) <= MERGE_GAP_S);
    if (g) {
      g.card.also.push({ id: card.id, sentence: card.sentence, t: card.t, quote: card.quote });
      g.last = Math.max(g.last, pos);
      wall.merged = (wall.merged || 0) + 1;
      return;
    }
    card.also = [];
    groups.push({ key, last: pos, card });
    queue.push({ card, resolved });
    pump();
  };

  const parts = chunks(doc, { size: chunkSize });
  let partsDone = 0;
  await Promise.all(parts.map(async (part, i) => {
    const intro = parts.length > 1 ? `Part ${i + 1} of ${parts.length} of the lecture (sentences ${part.from}-${part.to - 1}).\n` : '';
    let reply;
    try {
      const r = await callAgent(gateway, agents.finder, intro + part.text, { onBusy: onBusy(`rule finder ${i + 1}`) });
      log.push({ kind: 'model', agent: agents.finder, part: i + 1, of: parts.length, ms: r.ms, usage: r.usage, retries: r.retries, at: at() });
      reply = parseReply(r.content);
    } catch (e) {
      const s = { stage: 'finder', part: i + 1, why: `rule finder for part ${i + 1} failed: ${String(e.message || e).slice(0, 200)}` };
      wall.skipped.push(s); onEvent('skip', s); return;
    }
    for (const s of reply.skipped || []) wall.skipped.push({ stage: 'finder', sentence: s.sentence, quote: s.quote, why: s.why });
    for (const c of reply.cards || []) take(c);
    partsDone++;
    if (wall.timings.firstCards === undefined) wall.timings.firstCards = at();
    onEvent('cards', { count: found, parts: parts.length, partsDone, at: at() });
  }));
  wall.timings.cards = at();
  findersDone = true;
  settle();
  await allBuilt;

  wall.tiles.sort((a, b) => wall.cards.find((c) => c.id === a.card).t - wall.cards.find((c) => c.id === b.card).t);
  wall.timings.wallSeconds = at();
  wall.tokens = log.filter((x) => x.kind === 'model').reduce((s, x) => ({
    in: s.in + (x.usage.prompt_tokens || 0), out: s.out + (x.usage.completion_tokens || 0) }), { in: 0, out: 0 });
  onEvent('done', { tiles: wall.tiles.length, skipped: wall.skipped.length, wallSeconds: wall.timings.wallSeconds });
  return { wall, log };
}
