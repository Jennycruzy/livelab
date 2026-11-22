// Landing page. Everything shown comes from the saved hero run: its labs, its verdicts, its call log, the hand
// labels and the transcript. The instrument's numbers are computed live by the same physics library as the check.
import { MODELS } from '/lib/check.js';
import { relErr } from '/lib/num.js';
import { evaluateWall, probeStats } from '/lib/evaluate.js';
import { findQuote } from '/lib/transcript.js';
import { LIVE } from '/static/config.js';

const $ = (s) => document.querySelector(s);
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
const fmt = (x, p = 4) => (Number.isFinite(x) ? Number(x.toPrecision(p)).toString() : '—');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const pillOf = (c) => c.verdict === 'holds' ? ['ok', 'holds'] : c.verdict === 'breaks' ? ['warn', `breaks at ${fmt(c.limit, 3)} ${c.unit === 'fraction of c' ? 'c' : c.unit}`]
  : c.verdict === 'band' ? ['warn', `holds ${fmt(c.lo, 3)}–${fmt(c.hi, 3)}`] : ['warn', 'does not hold'];

// ---- sandboxed lab frames (model-written code: opaque origin, no network) ----
const frames = new Set();
addEventListener('message', (e) => {
  if (e.data?.type !== 'hello') return;
  for (const f of frames) if (f.el.contentWindow === e.source) e.source.postMessage({ type: 'load', sim: f.sim, params: f.params, dark: window.liveLabDark() }, '*');
});
function frame(sim, params) {
  const el = h('iframe', { src: window.liveLabFrame(), sandbox: 'allow-scripts', title: 'lab animation', tabindex: '-1', loading: 'eager' });
  const f = { el, sim, params };
  frames.add(f);
  return f;
}
const pause = new IntersectionObserver((es) => { for (const e of es) e.target.contentWindow?.postMessage({ type: 'run', on: e.isIntersecting }, '*'); });

// ---- scroll reveals ----
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---- data ----
const lib = await fetch('/api/library').then((r) => r.json());
const hero = lib.find((l) => l.wall && l.lecture === 'oyc-phys200-16') || lib.find((l) => l.wall);
const [wall, labels, logText, lecture] = hero ? await Promise.all([
  fetch(`/api/walls/${hero.wall}`).then((r) => r.json()),
  fetch(`/labels/${hero.lecture}.json`).then((r) => r.json()),
  fetch(`/runs/${hero.wall}.jsonl`).then((r) => r.text()),
  fetch(`/lectures/${hero.lecture}.json`).then((r) => r.json()),
]) : [];

if (wall) {
  const card = (t) => wall.cards.find((c) => c.id === t.card);
  const n = hero.tiles; // labs as the wall shows them: one per statement
  $('#headline').replaceChildren('One lecture in.', h('br'), h('span', { class: 'dim', text: `${WORDS[n] ?? n} labs out.` }));
  $('#open-hero').href = `/w/${hero.wall}`;

  // Product window: the lecture's timeline; each rule's lab lights at the minute it was said.
  const dur = lecture.duration;
  $('#win-title').textContent = hero.title.replace(/^PHYS 200 - /, 'PHYS 200 · ');
  $('#win-meta').textContent = `${Math.round(dur / 60)} min · ${n} labs · built ${fmt(wall.timings.wallSeconds, 3)} s`;
  const ticks = $('#ticks');
  for (let i = 0; i <= 4; i++) ticks.append(h('span', { text: `${Math.round((dur / 60) * i / 4)} min` }));
  const seen = new Set();
  const picks = [...wall.tiles].sort((a, b) => card(a).t - card(b).t).filter((t) => {
    const c = card(t); const k = `${c.model}/${c.rule}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  const showcase = [...picks].filter((t) => ['series', 'relativity', 'pendulum', 'spring'].includes(card(t).model));
  const chosen = [];
  for (const model of ['series', 'relativity', 'spring', 'pendulum']) { const t = showcase.find((x) => card(x).model === model && !chosen.includes(x)); if (t) chosen.push(t); }
  chosen.sort((a, b) => card(a).t - card(b).t);
  const marks = $('#marks');
  const markEls = wall.tiles.map((t) => { const c = card(t); const m = h('i', { class: `mark ${pillOf(t.check)[0]}`, left: `${(100 * c.t) / dur}%` }); marks.append(m); return { m, t: c.t }; });
  const labEls = chosen.map((t) => {
    const c = card(t);
    const f = frame(t.lab.sim, { ...c.fixed, [t.check.param]: t.predict.p0 });
    const [cls, text] = pillOf(t.check);
    const el = h('div', { class: 'lab' }, h('div', { class: 'screen' }, f.el),
      h('div', { class: 'lab-meta' }, h('span', { class: 'lab-name', text: `~${Math.floor(c.t / 60)} min · ${c.plain || t.lab.title}` }), h('span', { class: `pill ${cls}`, text })));
    $('#labs').append(el);
    pause.observe(f.el);
    return { el, t: c.t };
  });
  $('#win-caption').textContent = `The playhead sweeps the lecture's ${Math.round(dur / 60)} minutes; each lab lights at the minute the rule was said. Real labs from the run of ${wall.startedAt.slice(0, 16).replace('T', ' ')} UTC.`;
  const head = $('#playhead');
  const show = (sec) => {
    head.style.left = `${(100 * sec) / dur}%`;
    for (const x of markEls) x.m.classList.toggle('on', x.t <= sec);
    for (const x of labEls) x.el.classList.toggle('on', x.t <= sec);
  };
  if (reduced) show(dur);
  else {
    const LOOP = 11000, HOLD = 2600;
    let t0 = performance.now();
    const tick = (now) => {
      const p = (now - t0) % (LOOP + HOLD);
      show(Math.min(1, p / LOOP) * dur);
      requestAnimationFrame(tick);
    };
    setTimeout(() => { t0 = performance.now(); requestAnimationFrame(tick); }, 900);
  }

  // Instrument: the pendulum lab from this lecture, with live numbers from the library.
  const pend = wall.tiles.find((t) => card(t).model === 'pendulum' && card(t).rule === 'amplitude_independence');
  if (pend) {
    const c = card(pend), rule = MODELS.pendulum.rules.amplitude_independence, edge = pend.check.limit;
    const [lo, hi] = pend.check.range;
    const f = frame(pend.lab.sim, { ...c.fixed, amplitude_deg: 10 });
    $('#inst-screen').append(f.el);
    pause.observe(f.el);
    const pos = (v) => `${(100 * (v - lo)) / (hi - lo)}%`;
    $('#gauge-ok').style.width = pos(edge);
    $('#gauge-edge').style.left = pos(edge);
    $('#edge-label').textContent = `holds to ${fmt(edge, 4)}°`;
    const amp = $('#amp');
    amp.min = lo; amp.max = hi;
    let raf = 0;
    const update = () => {
      const v = Number(amp.value);
      $('#amp-out').textContent = `${fmt(v, 3)}°`;
      $('#gauge-thumb').style.left = pos(v);
      f.el.contentWindow?.postMessage({ type: 'params', params: { ...c.fixed, amplitude_deg: v } }, '*');
      f.params = { ...c.fixed, amplitude_deg: v };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = rule.rule(v, c.fixed), e = rule.exact(v, c.fixed), g = relErr(r, e);
        $('#r-rule').textContent = `${fmt(r)} s`;
        $('#r-exact').textContent = `${fmt(e)} s`;
        $('#r-gap').textContent = g * 100 < 0.001 ? '< 0.001%' : `${fmt(g * 100, 3)}%`;
        const st = $('#state');
        st.className = `state ${g <= 0.01 ? 'ok' : 'warn'}`;
        st.textContent = g <= 0.01 ? 'Inside the 1% line: the rule holds here.' : `Past the 1% line: the rule stops holding at ${fmt(edge, 4)}°.`;
      });
    };
    amp.addEventListener('input', update);
    update();
  } else $('#check').hidden = true;

  // Proof: computed from the saved run, its call log, the labels and the transcript.
  const log = logText.trim().split('\n').filter(Boolean).map((x) => JSON.parse(x));
  const e = evaluateWall(wall, labels);
  const p = probeStats(log);
  let quotes = 0, matched = 0;
  for (const c of wall.cards) for (const q of [c, ...(c.also || [])]) { quotes++; if (findQuote(lecture, q.quote)?.sentence === q.sentence) matched++; }
  const stat = (big, small, text) => h('div', { class: 'stat reveal' }, h('div', { class: 'big' }, big, small ? h('small', { text: small }) : null), h('p', { text }));
  const stats = [
    stat(String(e.found), `of ${e.labels}`, 'rules the teacher stated were found. The labels were written before Kimi read the lecture.'),
    stat(String(p.wrongFirst), `of ${p.labs}`, 'labs the model wrote had the wrong physics on the first try. The check caught every one before anyone saw it.'),
    stat(String(matched), `of ${quotes}`, 'quotes matched the transcript word for word. A quote that does not match is thrown away.'),
  ];
  $('#stats').append(...stats);
  stats.forEach((s, i) => { s.style.transitionDelay = `${i * 0.08}s`; io.observe(s); });
}

// Library
lib.forEach((l, i) => {
  const name = l.title.replace(/^PHYS 200 - Lecture \d+ - /, '');
  const num = l.title.match(/Lecture (\d+)/)?.[1];
  const body = [h('span', { class: 'num', text: `Lecture ${num} · ${l.minutes} min` }), h('h3', { text: name }), h('span', { class: 'credit', text: 'Prof. Ramamurti Shankar · Open Yale Courses · CC BY-NC-SA 3.0' })];
  let el;
  if (l.wall) {
    body.push(h('div', { class: 'row' }, h('span', { text: `${l.tiles} labs · built ${fmt(l.wallSeconds, 3)} s` }), h('span', { text: 'Open →' })));
    el = h('a', { class: 'lecture reveal', href: `/w/${l.wall}` }, ...body);
  } else {
    const btn = h('button', { type: 'button', text: 'Build it live' });
    const note = h('span', { class: 'note' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Starting…';
      const r = await fetch(`${LIVE}/api/walls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lecture: l.lecture }) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : { error: 'Could not reach the build server.' };
      if (r?.ok && j.id) location.href = `/w/${j.id}`; else { note.textContent = j.error || 'Could not start a build.'; btn.disabled = false; btn.textContent = 'Build it live'; }
    });
    body.push(h('div', { class: 'row' }, h('span', { text: 'No saved wall yet' }), btn), note);
    el = h('div', { class: 'lecture reveal' }, ...body);
  }
  el.style.transitionDelay = `${i * 0.08}s`;
  $('#lectures').append(el);
  io.observe(el);
});
