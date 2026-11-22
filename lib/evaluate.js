// Score a wall against the labels written for its lecture before any model run.
// A card matches a label when it names the same library rule and its quote sits within NEAR sentences of the
// label's sentences. Labels the library cannot check are counted separately: a wall should skip those.

export const NEAR = 3;

/** Labs as a wall shows them: one per statement (same library rule and settings said within 5 minutes). */
export function distinctLabs(w) {
  const card = (t) => w.cards.find((c) => c.id === t.card);
  const key = (c) => JSON.stringify([c.model, c.rule, c.range, c.fixed]);
  const last = new Map();
  let n = 0;
  for (const t of [...w.tiles].sort((a, b) => (card(a).t ?? 0) - (card(b).t ?? 0))) {
    const c = card(t), k = key(c), prev = last.get(k);
    if (prev === undefined || (c.t ?? 0) - prev > 300) n++;
    last.set(k, c.t ?? 0);
  }
  return n;
}


const near = (sentence, label) => label.sentences.some((s) => Math.abs(s - sentence) <= NEAR);

export function evaluateWall(wall, labelFile) {
  const labels = labelFile.labels.filter((l) => l.inLibrary);
  const outside = labelFile.labels.filter((l) => !l.inLibrary);
  const tileCards = new Set(wall.tiles.map((t) => t.card));
  const cards = wall.cards.map((c) => {
    const sentences = [c.sentence, ...(c.also || []).map((a) => a.sentence)];
    const label = labels.find((l) => l.model === c.model && l.rule === c.rule && sentences.some((s) => near(s, l)));
    const outsideLabel = !label && outside.find((l) => sentences.some((s) => near(s, l)));
    return { id: c.id, sentence: c.sentence, t: c.t, model: c.model, rule: c.rule, quote: c.quote, shown: tileCards.has(c.id),
      label: label?.id ?? null, outsideLabel: outsideLabel?.id ?? null };
  });
  const found = labels.filter((l) => cards.some((c) => c.label === l.id));
  return {
    labels: labels.length,
    found: found.length,
    missed: labels.filter((l) => !found.includes(l)).map((l) => ({ id: l.id, minute: l.minute, rule: `${l.model}/${l.rule}`, note: l.note })),
    cards: cards.length,
    matched: cards.filter((c) => c.label).length,
    unlabelled: cards.filter((c) => !c.label).map((c) => ({ id: c.id, sentence: c.sentence, rule: `${c.model}/${c.rule}`, quote: c.quote, outsideLabel: c.outsideLabel })),
    tiles: wall.tiles.length,
    shown: distinctLabs(wall),
  };
}

/** From a run log: how many generated labs disagreed with the exact physics, and how many were then fixed. */
export function probeStats(logLines) {
  const probes = logLines.filter((x) => x.kind === 'probe');
  const byCard = new Map();
  for (const p of probes) { if (!byCard.has(p.card)) byCard.set(p.card, []); byCard.get(p.card).push(p); }
  const first = [...byCard.values()].map((ps) => ps.sort((a, b) => a.attempt - b.attempt));
  return {
    labs: first.length,
    wrongFirst: first.filter((ps) => !ps[0].agrees).length,
    fixed: first.filter((ps) => !ps[0].agrees && ps.some((p) => p.agrees)).length,
    neverRight: first.filter((ps) => !ps.some((p) => p.agrees)).length,
  };
}

/** Time and tokens per model call, from a run log. */
export function callStats(logLines) {
  const calls = logLines.filter((x) => x.kind === 'model');
  const sum = (f) => calls.reduce((s, x) => s + (f(x) || 0), 0);
  return { calls: calls.length, inTokens: sum((x) => x.usage?.prompt_tokens), outTokens: sum((x) => x.usage?.completion_tokens),
    reasoningTokens: sum((x) => x.usage?.completion_tokens_details?.reasoning_tokens) };
}
