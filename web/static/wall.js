// The wall: a lecture's checked labs on its timeline, the bench for one lab (a focus panel), and the review of wrong
// predictions. Every number on the bench is computed here by the same physics library that decided the verdict.
import { MODELS } from '/lib/check.js';
import { relErr } from '/lib/num.js';
import { LIVE } from '/static/config.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k === 'left') el.style.left = v; else if (k === 'width') el.style.width = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid);
  return el;
};
const fmt = (x, p = 4) => {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return x.toExponential(2);
  return Number(x.toPrecision(p)).toString();
};
const unitOf = (u) => (u === 'fraction of c' ? 'c' : u === 'deg' ? '°' : u ? ` ${u}` : '');
const minute = (t) => (t === null || t === undefined ? '' : `~${Math.floor(t / 60)} min`);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function pillOf(c) {
  if (c.verdict === 'holds') return { cls: 'ok', text: 'holds' };
  if (c.verdict === 'breaks') return { cls: 'warn', text: `breaks at ${fmt(c.limit, 3)}${unitOf(c.unit)}` };
  if (c.verdict === 'band') return { cls: 'warn', text: `holds ${fmt(c.lo, 3)}–${fmt(c.hi, 3)}${unitOf(c.unit)}` };
  return { cls: 'warn', text: 'does not hold' };
}
function verdictText(c) {
  const [lo, hi] = c.range;
  if (c.verdict === 'holds') return `Holds across ${fmt(lo)}–${fmt(hi)}${unitOf(c.unit)}: within 1% of exact physics everywhere (largest gap ${c.maxError * 100 < 0.001 ? 'under 0.001' : fmt(c.maxError * 100, 3)}%).`;
  if (c.verdict === 'breaks') return `Holds up to ${fmt(c.limit)}${unitOf(c.unit)}. Past that, the rule is off by more than 1%.`;
  if (c.verdict === 'band') return `Holds only between ${fmt(c.lo)} and ${fmt(c.hi)}${unitOf(c.unit)}; outside that band it is off by more than 1%.`;
  return `Off by more than 1% everywhere in ${fmt(lo)}–${fmt(hi)}${unitOf(c.unit)}.`;
}

// ---------- sandboxed lab frames ----------
const frames = new Set(); // { el, sim, params }
const frameFor = (win) => { for (const f of frames) { if (!f.el.isConnected) { frames.delete(f); continue; } if (f.el.contentWindow === win) return f; } return null; };
addEventListener('message', (e) => {
  const f = frameFor(e.source);
  if (!f || !e.data || typeof e.data.type !== 'string') return;
  if (e.data.type === 'hello') e.source.postMessage({ type: 'load', sim: f.sim, params: f.params, dark: true }, '*');
});
function labFrame(sim, params) {
  const el = h('iframe', { src: '/frame', sandbox: 'allow-scripts', title: 'lab animation', tabindex: '-1' });
  frames.add({ el, sim, params });
  return el;
}
const setParams = (el, params) => {
  for (const f of frames) if (f.el === el) f.params = params;
  el.contentWindow?.postMessage({ type: 'params', params }, '*');
};
const seen = new IntersectionObserver((entries) => {
  for (const en of entries) en.target.contentWindow?.postMessage({ type: 'run', on: en.isIntersecting }, '*');
});

// ---------- state ----------
const id = location.pathname.split('/').pop();
let wall = null;
let duration = null;
let base = ''; // where this wall's files live: this site, or the build server for walls built live
const storeKey = `livelab:review:${id}`;
const loadReview = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; } };
const saveReview = (v) => { try { localStorage.setItem(storeKey, JSON.stringify(v)); } catch {} };
const cardOf = (tile) => wall.cards.find((c) => c.id === tile.card);
const ruleOf = (card) => MODELS[card.model]?.rules[card.rule];

/** One tile per statement: tiles for the same library rule and settings said within 5 minutes of each other. */
function groups() {
  const key = (c) => JSON.stringify([c.model, c.rule, c.range, c.fixed]);
  const tiles = [...wall.tiles].sort((a, b) => (cardOf(a).t ?? 0) - (cardOf(b).t ?? 0));
  const out = [];
  for (const t of tiles) {
    const c = cardOf(t);
    const g = [...out].reverse().find((x) => x.key === key(c));
    if (g && (c.t ?? 0) - g.last <= 300) {
      g.quotes.push({ quote: c.quote, t: c.t }, ...(t.also || []).map((a) => ({ quote: a.quote, t: a.t })));
      g.last = c.t ?? g.last;
    } else {
      out.push({ key: key(c), tile: t, card: c, last: c.t ?? 0,
        quotes: [{ quote: c.quote, t: c.t }, ...(t.also || []).map((a) => ({ quote: a.quote, t: a.t }))] });
    }
  }
  return out;
}

// ---------- render ----------
function renderHead() {
  const raw = wall.title || 'Your lecture';
  const m = raw.match(/^(PHYS \d+) - Lecture (\d+) - (.*)$/);
  $('#title').textContent = m ? m[3] : raw;
  const mins = duration ? `${Math.round(duration / 60)} min` : null;
  $('#crumbs').textContent = [m ? m[1] : null, m ? `Lecture ${m[2]}` : null, mins].filter(Boolean).join(' · ') || 'Lecture';
  const credit = $('#credit');
  credit.textContent = '';
  if (wall.source?.credit) credit.append(wall.source.credit);
  if (wall.source?.url) credit.append(' · ', h('a', { href: wall.source.url, target: '_blank', rel: 'noopener', text: 'watch the lecture' }));
  document.title = `${m ? m[3] : raw} · LIVE LAB`;
}

function renderFigures(live = false) {
  const g = groups().length;
  const t = wall.timings || {};
  const fig = (big, small, label, extra) => h('div', { class: 'fig' }, h('b', {}, big, small ? h('small', { text: small }) : null), h('span', { text: label }), extra || null);
  $('#figures').replaceChildren(
    fig(String(g), null, g === 1 ? 'lab, checked by maths' : 'labs, each checked by maths'),
    fig(t.firstTile !== undefined ? fmt(t.firstTile, 3) : '—', 's', 'to the first lab'),
    fig(t.wallSeconds !== undefined ? fmt(t.wallSeconds, 3) : (live ? '…' : '—'), 's', live && t.wallSeconds === undefined ? 'building now' : 'to every lab checked'),
    fig(String(wall.skipped?.length ?? 0), null, 'statements skipped, with reasons',
      wall.runLog?.file ? h('a', { href: `${base}/runs/${wall.runLog.file.split('/').pop()}`, text: 'full call log →' }) : null),
  );
}

function renderTimeline() {
  const end = duration || Math.max(60, ...wall.cards.map((c) => c.t || 0)) * 1.05;
  const marks = $('#marks');
  marks.textContent = '';
  for (const g of groups()) {
    if (g.card.t === null || g.card.t === undefined) continue;
    const p = pillOf(g.tile.check);
    marks.append(h('button', { class: `mark on ${p.cls}`, left: `${(100 * g.card.t) / end}%`, type: 'button',
      title: `${minute(g.card.t)} · ${g.card.plain || g.tile.lab.title} · ${p.text}`, 'aria-label': `${minute(g.card.t)}, ${p.text}`,
      onclick: () => openBench(g) }));
  }
  const ticks = $('#ticks');
  ticks.textContent = '';
  const mins = Math.round(end / 60);
  for (let i = 0; i <= 4; i++) ticks.append(h('span', { text: `${Math.round((mins * i) / 4)} min` }));
  $('#scan').hidden = true;
}

function cardEl(g, i) {
  const t = g.tile, c = g.card, p = pillOf(t.check);
  const frame = labFrame(t.lab.sim, { ...c.fixed, [t.check.param]: t.predict.p0 });
  const el = h('button', { class: 'card pop', type: 'button', onclick: () => openBench(g), 'aria-label': `${c.plain || t.lab.title}, ${p.text}` },
    h('div', { class: 'screen' }, frame),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-meta' }, h('span', { class: 'ts', text: minute(c.t) }),
        g.quotes.length > 1 ? h('span', { class: 'times', text: `said ${g.quotes.length}×` }) : null,
        h('span', { class: `pill ${p.cls}`, text: p.text })),
      h('h3', { text: c.plain || t.lab.title }),
      h('p', { class: 'quote', text: `“${c.quote}”` })));
  if (!reduced) el.style.animationDelay = `${Math.min(i, 12) * 0.05}s`;
  seen.observe(frame);
  return el;
}

function renderCards() {
  $('#wall').replaceChildren(...groups().map(cardEl));
}

function renderSkipped() {
  const box = $('#skipped');
  box.textContent = '';
  const s = wall.skipped || [];
  if (!s.length) return;
  const list = h('ul');
  for (const x of s) list.append(h('li', {}, x.quote ? `“${String(x.quote).slice(0, 180)}” ` : '', h('span', { class: 'why', text: x.why ? `— ${x.why}` : '' })));
  box.append(h('details', { class: 'skips' }, h('summary', { text: `${s.length} statements were not turned into labs. Here is why.` }), list));
}

// ---------- bench (focus panel) ----------
let lastFocus = null;
function closeBench() {
  $('#sheet').hidden = true;
  $('#bench').textContent = '';
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
$('#sheet-back').addEventListener('click', closeBench);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeBench(); });

function openBench(g, startAt) {
  lastFocus = document.activeElement;
  const t = g.tile, c = g.card, rule = ruleOf(c), chk = t.check;
  const [lo, hi] = chk.range;
  const p0 = startAt ?? t.predict.p0;
  const params = (p) => ({ ...c.fixed, [chk.param]: p });
  const frame = labFrame(t.lab.sim, params(p0));
  const pct = (v) => Math.max(0, Math.min(100, (100 * (v - lo)) / (hi - lo)));
  const pos = (v) => `${pct(v)}%`;
  const u = unitOf(chk.unit);

  // Predict first; the slider unlocks after a choice. The answer comes from the library.
  const pr = t.predict;
  const reviewed = loadReview().find((r) => r.card === c.id);
  const result = h('div', { class: 'result', hidden: true, role: 'status' });
  const choices = h('div', { class: 'choices' }, ...pr.options.map((o, i) => h('button', { class: 'choice', type: 'button',
    'aria-pressed': reviewed?.chosen === i ? 'true' : 'false', onclick: (e) => choose(i, e.currentTarget), text: o })));

  const slider = h('input', { type: 'range', min: lo, max: hi, step: (hi - lo) / 500, value: p0, 'aria-label': t.lab.slider || chk.param });
  const out = h('output', { class: 'mono', text: `${fmt(p0, 3)}${u}` });
  const zone = chk.verdict === 'holds' ? h('div', { class: 'gauge-band', left: '0%', width: '100%' })
    : chk.verdict === 'breaks' ? h('div', { class: 'gauge-band', left: '0%', width: pos(chk.limit) })
    : chk.verdict === 'band' ? h('div', { class: 'gauge-band', left: pos(chk.lo), width: `${pct(chk.hi) - pct(chk.lo)}%` }) : null;
  const edgeVal = chk.verdict === 'breaks' ? chk.limit : null;
  const thumb = h('div', { class: 'gauge-thumb' });
  const gauge = h('div', { class: 'gauge', 'aria-hidden': 'true' }, zone, edgeVal !== null ? h('div', { class: 'gauge-edge', left: pos(edgeVal) }) : null, thumb);
  const scale = h('div', { class: 'gauge-scale mono', 'aria-hidden': 'true' }, h('span', { text: `${fmt(lo, 3)}${u}` }),
    h('span', { text: edgeVal !== null ? `holds to ${fmt(edgeVal, 4)}${u}` : chk.verdict === 'band' ? `holds ${fmt(chk.lo, 3)}–${fmt(chk.hi, 3)}${u}` : chk.verdict === 'holds' ? 'holds across the range' : 'never within 1%' }),
    h('span', { text: `${fmt(hi, 3)}${u}` }));
  const q = chk.quantityUnit ? ` ${chk.quantityUnit}` : '';
  const rRule = h('b'), rExact = h('b'), rGap = h('b');
  const readings = h('div', { class: 'readings mono' },
    h('div', {}, h('span', { text: 'the rule says' }), rRule), h('div', {}, h('span', { text: 'exact physics' }), rExact), h('div', {}, h('span', { text: 'gap' }), rGap));
  const state = h('div', { class: 'state', role: 'status' });
  const instrument = h('div', { class: `step ${reviewed ? '' : 'locked'}` },
    h('label', { class: 'inst-label' }, h('span', { text: t.lab.slider || chk.param }), out), slider, gauge, scale, readings, state);

  function choose(i, btn) {
    choices.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    const right = i === pr.answer;
    result.hidden = false;
    result.className = `result ${right ? 'right' : 'wrong'}`;
    result.textContent = `${right ? 'Right.' : `Not quite: it will ${pr.options[pr.answer]}.`} From ${fmt(pr.p0, 3)} to ${fmt(pr.p1, 3)}${u}, the ${chk.quantity} goes from ${fmt(pr.q0)} to ${fmt(pr.q1)}${q}. Now drag the slider.`;
    instrument.classList.remove('locked');
    const rv = loadReview().filter((r) => r.card !== c.id);
    rv.push({ card: c.id, chosen: i, right, at: Date.now() });
    saveReview(rv);
    renderReview();
  }

  let raf = 0;
  function update(p) {
    out.textContent = `${fmt(p, 3)}${u}`;
    thumb.style.left = pos(p);
    setParams(frame, params(p));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = rule.rule(p, c.fixed), e = rule.exact(p, c.fixed), gap = relErr(r, e);
      rRule.textContent = `${fmt(r)}${q}`;
      rExact.textContent = `${fmt(e)}${q}`;
      rGap.textContent = gap * 100 < 0.001 ? '< 0.001%' : `${fmt(gap * 100, 3)}%`;
      state.className = `state ${gap <= chk.tol ? 'ok' : 'warn'}`;
      state.textContent = gap <= chk.tol ? 'Inside the 1% line: the rule holds here.' : 'Past the 1% line: the rule stops holding here.';
    });
  }
  slider.addEventListener('input', () => update(Number(slider.value)));

  const p = pillOf(chk);
  const quotes = h('div', { class: 'quotes' }, ...g.quotes.map((x, i) => h('blockquote', {}, `“${x.quote}”`,
    h('span', { text: `${minute(x.t)}${i === 0 ? ' · word for word from the transcript' : ''}` }))));
  const bench = $('#bench');
  bench.replaceChildren(
    h('div', { class: 'sheet-top' }, h('h2', { id: 'sheet-title', text: c.plain || t.lab.title }),
      h('button', { class: 'btn x', type: 'button', 'aria-label': 'Close', onclick: closeBench, text: '✕' })),
    h('div', { class: 'sheet-grid' },
      h('div', { class: 'sheet-left' }, h('div', { class: 'screen' }, frame), quotes),
      h('div', { class: 'sheet-right' },
        h('div', { class: 'step' }, h('span', { class: 'step-label', text: 'Predict first' }), h('p', { class: 'question', text: t.lab.question }), choices, result),
        h('div', { class: 'step' }, h('span', { class: 'step-label', text: 'Then test it' }), instrument),
        h('div', { class: `verdict ${p.cls}` }, h('strong', { text: verdictText(chk) }),
          h('span', { text: `Decided by plain code, not by the model: ${chk.method}${chk.verdict === 'breaks' || chk.verdict === 'band' ? '; the edge found by bisection' : ''}. Tolerance 1%.` }),
          ...(c.notes || []).map((n) => h('span', { text: n }))))));
  if (reviewed) {
    result.hidden = false;
    result.className = `result ${reviewed.right ? 'right' : 'wrong'}`;
    result.textContent = reviewed.right ? 'You predicted this one right.' : `Your guess: ${pr.options[reviewed.chosen]}. It will ${pr.options[pr.answer]}.`;
  }
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  update(p0);
  bench.querySelector('.choice')?.focus();
}

// ---------- review ----------
function renderReview() {
  const box = $('#review');
  const wrong = loadReview().filter((r) => !r.right);
  box.textContent = '';
  box.hidden = !wrong.length;
  if (!wrong.length) return;
  box.append(h('h2', { text: 'Review: the ones you got wrong' }));
  for (const r of wrong) {
    const g = groups().find((x) => x.card.id === r.card);
    if (!g) continue;
    box.append(h('div', { class: 'review-row' }, h('span', { text: g.card.plain || g.tile.lab.title }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'See why', onclick: () => openBench(g, g.tile.predict.p1) })));
  }
}

// ---------- live build and replay ----------
function renderAll(live = false) { renderHead(); renderFigures(live); renderTimeline(); renderCards(); renderSkipped(); renderReview(); }

async function replay() {
  const full = wall;
  const order = [...full.tiles].sort((a, b) => a.at - b.at);
  const total = full.timings.wallSeconds;
  wall = { ...full, tiles: [], timings: {} };
  renderAll(true);
  const btn = $('#replay');
  btn.disabled = true;
  const scan = $('#scan');
  scan.hidden = false;
  const t0 = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      $('#clock').textContent = `${fmt(Math.min(s, total), 3)} s of ${fmt(total, 3)} s`;
      scan.style.left = `${Math.min(100, (100 * s) / total)}%`;
      let changed = false;
      while (order.length && order[0].at <= s) { wall.tiles.push(order.shift()); changed = true; }
      if (changed) { if (wall.timings.firstTile === undefined) wall.timings.firstTile = wall.tiles[0].at; renderTimeline(); scan.hidden = false; renderCards(); renderFigures(true); }
      if (s >= total) return done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  wall = full;
  renderAll();
  $('#clock').textContent = 'replayed at its recorded timing';
  btn.disabled = false;
}

function followLive() {
  wall = { id, title: '', source: null, cards: [], tiles: [], skipped: [], timings: {} };
  const es = new EventSource(`${LIVE}/api/walls/${id}/events`);
  const t0 = performance.now();
  const timer = setInterval(() => { $('#clock').textContent = `${fmt((performance.now() - t0) / 1000, 3)} s`; }, 100);
  es.addEventListener('start', (e) => { const d = JSON.parse(e.data); wall.title = d.title; wall.source = { credit: d.credit }; duration = d.duration; renderAll(true); });
  es.addEventListener('cards', (e) => { $('#phase').textContent = `The rule finder found ${JSON.parse(e.data).count} rules. Building and checking their labs…`; });
  es.addEventListener('card', (e) => { wall.cards.push(JSON.parse(e.data)); });
  es.addEventListener('skip', (e) => { wall.skipped.push(JSON.parse(e.data)); renderSkipped(); renderFigures(true); });
  es.addEventListener('tile', (e) => { const t = JSON.parse(e.data); wall.tiles.push(t); if (wall.timings.firstTile === undefined) wall.timings.firstTile = t.at; renderTimeline(); renderCards(); renderFigures(true); });
  es.addEventListener('done', (e) => { wall.timings.wallSeconds = JSON.parse(e.data).wallSeconds; clearInterval(timer); renderFigures(); $('#phase').textContent = ''; });
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
