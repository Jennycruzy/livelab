// The wall: a lecture's checked labs on its timeline, the bench for one lab, and the review of wrong predictions.
// Every number on the bench is computed here by the same physics library that decided the verdict on the server.
import { MODELS } from '/lib/check.js';
import { relErr } from '/lib/num.js';
import { LIVE } from '/static/config.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k === 'left') el.style.left = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid);
  return el;
};
const fmt = (x) => {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return x.toExponential(2);
  return Number(x.toPrecision(4)).toString();
};
const minute = (t) => (t === null || t === undefined ? '' : `~${Math.floor(t / 60)} min`);
const dark = () => document.documentElement.dataset.theme === 'dark' ||
  (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

function verdictPill(c) {
  if (c.verdict === 'holds') return { cls: 'ok', text: 'holds' };
  if (c.verdict === 'breaks') return { cls: 'warn', text: `breaks at ${fmt(c.limit)} ${c.unit}` };
  if (c.verdict === 'band') return { cls: 'warn', text: `holds ${fmt(c.lo)}–${fmt(c.hi)} ${c.unit}` };
  return { cls: 'warn', text: 'does not hold' };
}
function verdictText(c) {
  const [lo, hi] = c.range;
  if (c.verdict === 'holds') return `Holds across ${fmt(lo)}–${fmt(hi)} ${c.unit}: the rule stays within 1% of the exact answer everywhere (largest gap ${fmt(c.maxError * 100)}%).`;
  if (c.verdict === 'breaks') return `Holds up to ${fmt(c.limit)} ${c.unit}. Past that, the rule is off by more than 1%.`;
  if (c.verdict === 'band') return `Holds only between ${fmt(c.lo)} and ${fmt(c.hi)} ${c.unit}; outside that band it is off by more than 1%.`;
  return `Off by more than 1% everywhere in ${fmt(lo)}–${fmt(hi)} ${c.unit}.`;
}

// ---------- sandboxed lab frames ----------
// Each frame says hello as soon as its script runs, which can be before its load event, so frames are found by
// their window at the moment a message arrives.
const frames = new Set(); // { el, sim, params }
const frameFor = (win) => { for (const f of frames) { if (!f.el.isConnected) { frames.delete(f); continue; } if (f.el.contentWindow === win) return f; } return null; };
addEventListener('message', (e) => {
  const f = frameFor(e.source);
  if (!f || !e.data || typeof e.data.type !== 'string') return;
  if (e.data.type === 'hello') e.source.postMessage({ type: 'load', sim: f.sim, params: f.params, dark: dark() }, '*');
  if (e.data.type === 'error' && f.el) f.el.closest('.screen')?.setAttribute('data-error', e.data.error);
});
function labFrame(sim, params) {
  const el = h('iframe', { src: '/frame', sandbox: 'allow-scripts', title: 'lab animation', tabindex: '-1' });
  frames.add({ el, sim, params });
  return el;
}
const setParams = (el, params, restart = false) => {
  for (const f of frames) if (f.el === el) f.params = params;
  el.contentWindow?.postMessage({ type: 'params', params, restart }, '*');
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  for (const f of frames) f.el.contentWindow?.postMessage({ type: 'dark', dark: dark() }, '*');
});
// Pause animations that are off screen.
const seen = new IntersectionObserver((entries) => {
  for (const en of entries) en.target.contentWindow?.postMessage({ type: 'run', on: en.isIntersecting }, '*');
});

// ---------- state ----------
const id = location.pathname.split('/').pop();
let wall = null; // saved or live wall
let duration = null;
let base = ''; // where this wall's files live: this site, or the build server for walls built live
const storeKey = `livelab:review:${id}`;
const loadReview = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; } };
const saveReview = (v) => { try { localStorage.setItem(storeKey, JSON.stringify(v)); } catch {} };

const cardFor = (tile) => wall.cards.find((c) => c.id === tile.card);
const ruleFor = (card) => MODELS[card.model]?.rules[card.rule];

// ---------- render ----------
function renderHeader() {
  $('#title').textContent = wall.title || 'Lecture';
  const s = wall.source;
  const credit = $('#credit');
  credit.textContent = '';
  if (s?.credit) credit.append(s.credit);
  if (s?.url) credit.append(' · ', h('a', { href: s.url, target: '_blank', rel: 'noopener', text: 'watch the lecture' }));
  document.title = `${wall.title || 'Wall'} · LIVE LAB`;
}

function renderStats(live = false) {
  const el = $('#stats');
  el.textContent = '';
  const n = wall.tiles.length;
  el.append(h('span', {}, h('b', { text: String(n) }), n === 1 ? ' lab checked' : ' labs checked'));
  if (wall.timings?.wallSeconds !== undefined) el.append(h('span', {}, 'built in ', h('b', { text: `${fmt(wall.timings.wallSeconds)} s` })));
  else if (live) el.append(h('span', { class: 'muted', text: 'building now…' }));
  if (wall.timings?.firstTile !== undefined) el.append(h('span', {}, 'first lab at ', h('b', { text: `${fmt(wall.timings.firstTile)} s` })));
  if (wall.startedAt) el.append(h('span', { class: 'muted', text: `run ${wall.startedAt.slice(0, 16).replace('T', ' ')} UTC` }));
  if (wall.runLog?.file) el.append(h('a', { href: `${base}/runs/${wall.runLog.file.split('/').pop()}`, text: 'run log' }));
}

function renderTimeline() {
  const tl = $('#timeline');
  tl.querySelectorAll('.mark').forEach((m) => m.remove());
  const end = duration || Math.max(60, ...wall.cards.map((c) => c.t || 0)) * 1.05;
  for (const tile of wall.tiles) {
    const c = cardFor(tile);
    if (c?.t === null || c?.t === undefined) continue;
    const pill = verdictPill(tile.check);
    tl.append(h('button', { class: `mark ${pill.cls}`, left: `${(100 * c.t) / end}%`, title: `${minute(c.t)}: ${c.plain || c.rule}`,
      'aria-label': `${minute(c.t)}, ${pill.text}`, onclick: () => openBench(tile) }));
  }
  const ticks = $('#ticks');
  ticks.textContent = '';
  const mins = Math.round(end / 60);
  for (let i = 0; i <= 4; i++) ticks.append(h('span', { text: `${Math.round((mins * i) / 4)} min` }));
}

function tileEl(tile) {
  const c = cardFor(tile);
  const pill = verdictPill(tile.check);
  const params = { ...c.fixed, [tile.check.param]: tile.predict.p0 };
  const frame = labFrame(tile.lab.sim, params);
  const el = h('button', { class: 'tile pop', 'data-card': c.id, onclick: () => openBench(tile), 'aria-label': `${tile.lab.title}, ${pill.text}` },
    h('div', { class: 'screen' }, frame),
    h('div', { class: 'meta' }, h('span', { class: 'ts', text: minute(c.t) }), h('span', { class: `pill ${pill.cls}`, text: pill.text })),
    h('div', { class: 'plain', text: c.plain || tile.lab.title }),
    h('div', { class: 'quote', text: `“${c.quote}”` }));
  seen.observe(frame);
  return el;
}

function renderTiles() {
  const box = $('#wall');
  box.textContent = '';
  const sorted = [...wall.tiles].sort((a, b) => (cardFor(a).t ?? 0) - (cardFor(b).t ?? 0));
  for (const t of sorted) box.append(tileEl(t));
}

function renderSkipped() {
  const box = $('#skipped');
  box.textContent = '';
  const s = wall.skipped || [];
  if (!s.length) return;
  const list = h('ul');
  for (const x of s) list.append(h('li', {}, x.quote ? `“${String(x.quote).slice(0, 160)}” — ` : '', h('span', { class: 'muted', text: x.why || '' })));
  box.append(h('details', { class: 'skips' }, h('summary', { text: `${s.length} statements not turned into labs, and why` }), list));
}

// ---------- bench ----------
let benchTile = null;
function openBench(tile, startAt) {
  benchTile = tile;
  document.querySelectorAll('.tile').forEach((t) => t.classList.toggle('sel', t.dataset.card === tile.card));
  const c = cardFor(tile), rule = ruleFor(c), chk = tile.check;
  const bench = $('#bench');
  bench.hidden = false;
  bench.textContent = '';
  const [lo, hi] = chk.range;
  const p0 = startAt ?? tile.predict.p0;
  const params = (p) => ({ ...c.fixed, [chk.param]: p });
  const frame = labFrame(tile.lab.sim, params(p0));

  const quotes = h('div', { class: 'side' },
    h('blockquote', {}, `“${c.quote}”`, h('span', { class: 'ts', text: `${minute(c.t)} · word for word from the transcript` })),
    ...(tile.also || []).map((a) => h('blockquote', {}, `“${a.quote}”`, h('span', { class: 'ts', text: minute(a.t) }))));

  // Predict first: the slider unlocks after a choice. The answer comes from the library.
  const reviewed = loadReview().find((r) => r.card === c.id);
  const slider = h('input', { type: 'range', min: lo, max: hi, step: (hi - lo) / 400, value: p0, 'aria-label': tile.lab.slider || chk.param, disabled: !reviewed });
  const out = h('output', { text: `${fmt(p0)} ${chk.unit}` });
  const result = h('div', { class: 'result', hidden: true });
  const pr = tile.predict;
  const choices = h('div', { class: 'choices' }, ...pr.options.map((o, i) => h('button', { 'aria-pressed': reviewed?.chosen === i ? 'true' : 'false', onclick: (e) => choose(i, e.currentTarget) }, o)));
  function choose(i, btn) {
    choices.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    const right = i === pr.answer;
    result.hidden = false;
    result.className = `result ${right ? 'right' : 'wrong'}`;
    result.textContent = `${right ? 'Right.' : `Not quite: it will ${pr.options[pr.answer]}.`} From ${fmt(pr.p0)} to ${fmt(pr.p1)} ${chk.unit}, the ${chk.quantity} goes from ${fmt(pr.q0)} to ${fmt(pr.q1)}${chk.quantityUnit ? ` ${chk.quantityUnit}` : ''}. Now drag the slider.`;
    slider.disabled = false;
    const rv = loadReview().filter((r) => r.card !== c.id);
    rv.push({ card: c.id, chosen: i, right, at: Date.now() });
    saveReview(rv);
    renderReview();
  }

  const dl = h('dl', { class: 'readout' });
  const status = h('div', { class: 'mono' });
  let pending = null;
  function update(p) {
    out.textContent = `${fmt(p)} ${chk.unit}`;
    setParams(frame, params(p));
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const r = rule.rule(p, c.fixed), e = rule.exact(p, c.fixed), err = relErr(r, e);
      dl.textContent = '';
      const q = chk.quantityUnit ? ` ${chk.quantityUnit}` : '';
      dl.append(h('dt', { text: 'the rule says' }), h('dd', { text: fmt(r) + q }),
        h('dt', { text: 'exact physics' }), h('dd', { text: fmt(e) + q }),
        h('dt', { text: 'gap' }), h('dd', { text: `${fmt(err * 100)}%` }));
      status.textContent = err <= chk.tol ? 'inside the 1% line' : 'past the 1% line';
      status.className = `mono ${err <= chk.tol ? 'inside' : 'past'}`;
    });
  }
  slider.addEventListener('input', () => update(Number(slider.value)));

  const pill = verdictPill(chk);
  const verdict = h('div', { class: `verdict ${pill.cls}` },
    h('strong', { text: verdictText(chk) }),
    h('span', { class: 'muted', text: `Decided by plain code, not by the model: ${chk.method}${chk.verdict === 'breaks' || chk.verdict === 'band' ? '; the edge found by bisection' : ''}. Tolerance 1%.` }),
    ...(c.notes || []).map((n) => h('span', { class: 'muted', text: n })));

  bench.append(
    h('div', { class: 'row spread' }, h('h2', { text: tile.lab.title }),
      h('button', { onclick: () => { bench.hidden = true; document.querySelectorAll('.tile').forEach((t) => t.classList.remove('sel')); }, text: 'Close' })),
    h('div', { class: 'bench' },
      h('div', { class: 'side' }, h('div', { class: 'screen' }, frame), quotes),
      h('div', { class: 'side' },
        h('div', { class: 'predict' }, h('span', { class: 'label', text: 'Predict first' }), h('div', { text: tile.lab.question }), choices, result),
        h('label', { class: 'slider' }, h('span', {}, `${tile.lab.slider || chk.param}: `, out), slider),
        dl, status, verdict)));
  update(p0);
  if (reviewed) { result.hidden = false; result.className = `result ${reviewed.right ? 'right' : 'wrong'}`; result.textContent = reviewed.right ? 'You predicted this one right.' : `Earlier guess: ${pr.options[reviewed.chosen]}. It will ${pr.options[pr.answer]}.`; }
  bench.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ---------- review ----------
function renderReview() {
  const box = $('#review');
  const wrong = loadReview().filter((r) => !r.right);
  box.textContent = '';
  box.hidden = !wrong.length;
  if (!wrong.length) return;
  box.append(h('span', { class: 'label', text: 'Review: the ones you got wrong' }));
  for (const r of wrong) {
    const tile = wall.tiles.find((t) => t.card === r.card);
    if (!tile) continue;
    const c = cardFor(tile);
    box.append(h('div', { class: 'row' }, h('span', { text: c.plain || tile.lab.title }),
      h('button', { text: 'See why', onclick: () => openBench(tile, tile.predict.p1) })));
  }
}

// ---------- live build and replay ----------
function renderAll(live = false) {
  renderHeader(); renderStats(live); renderTimeline(); renderTiles(); renderSkipped(); renderReview();
}

function scanTo(seconds, total) {
  $('#scan').style.width = total ? `${Math.min(100, (100 * seconds) / total)}%` : '0';
}

async function replay() {
  const full = wall;
  const order = [...full.tiles].sort((a, b) => a.at - b.at);
  const total = full.timings.wallSeconds;
  wall = { ...full, tiles: [], timings: {} };
  renderAll(true);
  $('#bench').hidden = true;
  const btn = $('#replay');
  btn.disabled = true;
  const t0 = performance.now();
  const clock = $('#clock');
  clock.hidden = false;
  await new Promise((done) => {
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      clock.textContent = `${fmt(Math.min(s, total))} s`;
      scanTo(s, total);
      let changed = false;
      while (order.length && order[0].at <= s) { wall.tiles.push(order.shift()); changed = true; }
      if (changed) { renderTimeline(); renderTiles(); renderStats(true); }
      if (s >= total) return done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  wall = full;
  renderAll();
  btn.disabled = false;
}

function followLive() {
  wall = { id, title: '', source: null, cards: [], tiles: [], skipped: [], timings: {} };
  const es = new EventSource(`${LIVE}/api/walls/${id}/events`);
  const t0 = performance.now();
  const clock = $('#clock');
  clock.hidden = false;
  const timer = setInterval(() => { clock.textContent = `${fmt((performance.now() - t0) / 1000)} s`; }, 100);
  es.addEventListener('start', (e) => { const d = JSON.parse(e.data); wall.title = d.title; wall.source = { credit: d.credit }; duration = d.duration; renderAll(true); });
  es.addEventListener('cards', (e) => { $('#phase').textContent = `Rule finder found ${JSON.parse(e.data).count} rules. Building and checking labs…`; });
  es.addEventListener('card', (e) => { wall.cards.push(JSON.parse(e.data)); renderTimeline(); });
  es.addEventListener('skip', (e) => { wall.skipped.push(JSON.parse(e.data)); renderSkipped(); });
  es.addEventListener('tile', (e) => { const t = JSON.parse(e.data); wall.tiles.push(t); if (wall.timings.firstTile === undefined) wall.timings.firstTile = t.at; renderTimeline(); renderTiles(); renderStats(true); });
  es.addEventListener('done', (e) => { wall.timings.wallSeconds = JSON.parse(e.data).wallSeconds; clearInterval(timer); renderStats(); $('#phase').textContent = ''; });
  es.addEventListener('saved', async () => { es.close(); const r = await fetch(`${LIVE}/api/walls/${id}`); if (r.ok) { base = LIVE; wall = await r.json(); renderAll(); $('#replay').hidden = false; } });
  es.addEventListener('failed', (e) => { es.close(); clearInterval(timer); $('#phase').textContent = `The build stopped: ${JSON.parse(e.data).error}`; });
  es.onerror = () => { if (wall.timings.wallSeconds === undefined) $('#phase').textContent = 'Lost the connection to this build. Reload to see it once it is saved.'; };
  $('#phase').textContent = 'Reading the lecture for rules…';
}

// ---------- start ----------
$('#share').addEventListener('click', async () => {
  const btn = $('#share');
  try { await navigator.clipboard.writeText(location.href.split('#')[0]); btn.textContent = 'Link copied'; }
  catch { const i = $('#sharelink'); i.hidden = false; i.value = location.href.split('#')[0]; i.select(); }
  setTimeout(() => { btn.textContent = 'Share'; }, 2000);
});
$('#replay').addEventListener('click', replay);

// Saved walls ship with the site; walls built live are saved on the build server.
let res = await fetch(`/api/walls/${id}`);
if (!res.ok && LIVE) { res = await fetch(`${LIVE}/api/walls/${id}`).catch(() => ({ ok: false })); if (res.ok) base = LIVE; }
if (res.ok) {
  wall = await res.json();
  duration = wall.duration ?? null;
  if (!duration && wall.lecture) {
    const lec = await fetch(`/lectures/${wall.lecture}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    duration = lec?.duration ?? null;
  }
  renderAll();
  $('#replay').hidden = false;
  if (location.hash === '#review') $('#review').scrollIntoView();
} else {
  followLive();
}
