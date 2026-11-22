// Evidence tables, computed here from the saved walls, their run logs and the labels written in advance.
import { evaluateWall, probeStats, callStats } from '/lib/evaluate.js';

const $ = (s) => document.querySelector(s);
const fmt = (x) => (Number.isFinite(x) ? Number(x.toPrecision(3)).toString() : '—');
const row = (tbody, cells) => {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const td = document.createElement('td');
    if (typeof c === 'object' && c !== null) { td.append(c.node); if (c.num) td.className = 'num'; }
    else { td.textContent = String(c); if (typeof c === 'number') td.className = 'num'; }
    tr.append(td);
  }
  tbody.append(tr);
};
const link = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };

const lib = await fetch('/api/library').then((r) => r.json());
for (const l of lib.filter((x) => x.wall)) {
  const [wall, labels, logText] = await Promise.all([
    fetch(`/api/walls/${l.wall}`).then((r) => r.json()),
    fetch(`/labels/${l.lecture}.json`).then((r) => r.json()),
    fetch(`/runs/${l.wall}.jsonl`).then((r) => r.text()),
  ]);
  const log = logText.trim().split('\n').filter(Boolean).map((x) => JSON.parse(x));
  const name = l.title.replace(/^PHYS 200 - /, '');
  const e = evaluateWall(wall, labels);
  row($('#finding tbody'), [{ node: link(`/w/${l.wall}`, name) }, e.labels, e.found, e.cards, e.matched, e.shown]);
  if (e.missed.length || e.unlabelled.length) {
    const box = document.createElement('details');
    box.className = 'skips';
    const s = document.createElement('summary');
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    s.textContent = `${name}: ${n(e.missed.length, 'labelled rule', 'labelled rules')} missed, ${n(e.unlabelled.length, 'card', 'cards')} not matching a label`;
    const ul = document.createElement('ul');
    for (const m of e.missed) { const li = document.createElement('li'); li.textContent = `Missed: ~${m.minute} min, ${m.rule} (${m.note})`; ul.append(li); }
    for (const u of e.unlabelled) { const li = document.createElement('li'); li.textContent = `Not in the labels: ${u.rule} — “${u.quote}”`; ul.append(li); }
    box.append(s, ul);
    $('#unlabelled').append(box);
  }
  const p = probeStats(log);
  row($('#probe tbody'), [name, p.labs, p.wrongFirst, p.fixed, p.neverRight]);
  const c = callStats(log);
  const files = document.createElement('span');
  files.append(link(`/runs/${l.wall}.jsonl`, 'run log'), ' · ', link(`/labels/${l.lecture}.json`, 'labels'));
  row($('#runs tbody'), [name, wall.startedAt.slice(0, 16).replace('T', ' '), { node: document.createTextNode(`${fmt(wall.timings.firstTile)} s`), num: true },
    { node: document.createTextNode(`${fmt(wall.timings.wallSeconds)} s`), num: true }, c.calls, c.inTokens.toLocaleString(), c.outTokens.toLocaleString(), { node: files }]);
}

// The model on its own, from the saved, graded replies.
const base = await fetch('/baseline/model-alone-low.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (base) {
  const S = base.summary;
  const fig = (big, small, label) => { const d = document.createElement('div'); d.className = 'fig'; const b = document.createElement('b'); b.textContent = big; if (small) { const s2 = document.createElement('small'); s2.textContent = small; b.append(s2); } const sp = document.createElement('span'); sp.textContent = label; d.append(b, sp); return d; };
  $('#baseline-figs').append(fig(String(S.bothRight), `of ${S.moments}`, 'moments fully right on its own'), fig(String(S.verdictRight), `of ${S.moments}`, 'verdicts right'), fig(String(S.moments - S.bothRight), null, 'confident answers that were wrong'), fig(String(S.moments), `of ${S.moments}`, 'right with the physics library'));
  const unit = (u) => (u === 'fraction of c' ? 'c' : u === 'deg' ? '°' : u ? ` ${u}` : '');
  for (const r of base.rows.filter((x) => !(x.grade.verdictRight && x.grade.limitWithin5pct))) {
    const a = r.grade.answer || {};
    const said = a.verdict === 'holds' ? 'holds' : `breaks at ${a.limit}${a.unit ? ' ' + a.unit : ''}`;
    const truth = r.key.verdict === 'holds' ? 'holds' : `breaks at ${Number(r.key.limit.toPrecision(3))}${unit(r.key.unit)}`;
    row($('#baseline tbody'), [`“${r.line}”`, said, truth, r.grade.verdictRight ? 'limit wrong' : 'verdict wrong']);
  }
}
