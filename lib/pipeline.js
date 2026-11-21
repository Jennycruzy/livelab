// Lecture in, checked labs out. The model finds rules and writes labs; plain code decides everything else:
// whether a quote is real, when it was said, whether the rule holds and where it breaks, and whether a lab's
// physics matches the exact answer.
import { check, resolve, CardError, TOLERANCE } from './check.js';
import { findQuote, forFinder } from './transcript.js';
import { runProbe } from './sandbox.js';
import { relErr } from './num.js';

const now = () => Date.now();

/** Call an OpenClaw agent through the Gateway's chat completions endpoint. */
export async function callAgent(gateway, agent, content, { timeoutMs = 300000 } = {}) {
  const started = now();
  const res = await fetch(`${gateway.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: `openclaw/${agent}`, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  const ended = now();
  if (!res.ok) throw new Error(`${agent}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return { content: body.choices?.[0]?.message?.content ?? '', usage: body.usage ?? {}, started, ended, ms: ended - started };
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

function builderInput(card, resolved) {
  const { model, rule, fixed, range } = resolved;
  return JSON.stringify({ quote: card.quote, model: model.id, rule: card.rule, claim: rule.claim, param: rule.param,
    unit: rule.unit, range, fixed, quantity: rule.quantity, quantityUnit: rule.quantityUnit, statement: rule.statement });
}

/**
 * Build a wall for a transcript document. Calls onEvent(type, data) for: cards, card, skip, tile, done.
 * Returns { wall, log } where log holds one entry per model call and per check.
 */
export async function buildWall(doc, { gateway, onEvent = () => {}, maxBuilders = 12 } = {}) {
  const t0 = now();
  const log = [];
  const at = () => (now() - t0) / 1000;
  const wall = { title: doc.title, source: doc.source ?? null, transcriptHash: doc.transcriptHash ?? null,
    provider: 'cerebras/moonshotai-kimi-k3.1-pro-trial via OpenClaw', startedAt: new Date(t0).toISOString(),
    cards: [], tiles: [], skipped: [], timings: {} };

  // 1. Find rules.
  const found = await callAgent(gateway, 'livelab-finder', forFinder(doc));
  log.push({ kind: 'model', agent: 'livelab-finder', ms: found.ms, usage: found.usage, at: at() });
  let reply;
  try { reply = parseReply(found.content); } catch (e) { throw new Error(`rule finder reply was not JSON: ${e.message}`); }
  for (const s of reply.skipped || []) wall.skipped.push({ stage: 'finder', sentence: s.sentence, quote: s.quote, why: s.why });
  wall.timings.cards = at();
  onEvent('cards', { count: (reply.cards || []).length, at: at() });

  // 2. Verify each card in plain code: real quote, real time, a library rule that exists.
  const ready = [];
  (reply.cards || []).forEach((c, k) => {
    const id = `r${k + 1}`;
    const hit = typeof c.quote === 'string' ? findQuote(doc, c.quote) : null;
    if (!hit) { const s = { id, stage: 'quote', quote: c.quote, why: 'quote not found word for word in the transcript' }; wall.skipped.push(s); onEvent('skip', s); return; }
    let resolved;
    try { resolved = resolve({ model: c.model, rule: c.rule, range: c.range, fixed: c.fixed }); }
    catch (e) { const s = { id, stage: 'library', quote: c.quote, model: c.model, rule: c.rule, why: e instanceof CardError ? e.message : String(e) }; wall.skipped.push(s); onEvent('skip', s); return; }
    const card = { id, sentence: hit.sentence, t: hit.t, chapter: hit.chapter, quote: c.quote, plain: c.plain ?? '',
      model: c.model, rule: c.rule, range: resolved.range, fixed: resolved.fixed, notes: resolved.notes,
      modelSentence: c.sentence, ambiguous: hit.ambiguous };
    wall.cards.push(card);
    ready.push({ card, resolved });
    onEvent('card', card);
  });

  // 3. For every card at once: the library's verdict, then a lab whose physics must match it.
  const queue = [...ready];
  const workers = Array.from({ length: Math.min(maxBuilders, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { card, resolved } = job;
      const verdict = check({ model: card.model, rule: card.rule, range: card.range, fixed: card.fixed });
      log.push({ kind: 'check', card: card.id, verdict: verdict.verdict, limit: verdict.limit ?? null, lo: verdict.lo ?? null, hi: verdict.hi ?? null });
      let lab = null, probe = null, attempts = 0, lastErr = null, feedback = '';
      while (attempts < 2 && !lab) {
        attempts++;
        try {
          const r = await callAgent(gateway, 'livelab-builder', builderInput(card, resolved) + feedback);
          log.push({ kind: 'model', agent: 'livelab-builder', card: card.id, attempt: attempts, ms: r.ms, usage: r.usage, at: at() });
          const out = parseReply(r.content);
          probe = await probeLab(resolved, out.sim);
          log.push({ kind: 'probe', card: card.id, attempt: attempts, agrees: probe.agrees, reason: probe.reason, rows: probe.rows });
          if (probe.agrees) lab = { title: out.title, slider: out.slider, question: out.question, sim: out.sim };
          else feedback = `\n\nYour previous sim was rejected: ${probe.reason}. At ${JSON.stringify(probe.rows.map((x) => ({ [resolved.rule.param]: x.p, yours: x.got, exact: x.want })))}. Fix probe() so it computes the real physics.`;
        } catch (e) { lastErr = e.message; feedback = `\n\nYour previous reply could not be used: ${e.message}. Reply with the JSON object only.`; }
      }
      if (!lab) {
        const s = { id: card.id, stage: 'lab', quote: card.quote, why: probe?.reason ?? lastErr ?? 'no lab' };
        wall.skipped.push(s); onEvent('skip', s); continue;
      }
      const { samples, ...v } = verdict;
      const tile = { card: card.id, check: { ...v, samples }, lab, predict: prediction(resolved), attempts, at: at() };
      wall.tiles.push(tile);
      if (wall.timings.firstTile === undefined) wall.timings.firstTile = tile.at;
      onEvent('tile', tile);
    }
  });
  await Promise.all(workers);
  wall.tiles.sort((a, b) => wall.cards.find((c) => c.id === a.card).t - wall.cards.find((c) => c.id === b.card).t);
  wall.timings.wallSeconds = at();
  wall.tokens = log.filter((x) => x.kind === 'model').reduce((s, x) => ({
    in: s.in + (x.usage.prompt_tokens || 0), out: s.out + (x.usage.completion_tokens || 0) }), { in: 0, out: 0 });
  onEvent('done', { tiles: wall.tiles.length, skipped: wall.skipped.length, wallSeconds: wall.timings.wallSeconds });
  return { wall, log };
}
