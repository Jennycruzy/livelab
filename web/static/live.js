// Live class: send sentences as they are said (a replayed lecture at its own pace, or the browser's speech
// recognition), and show each checked lab as it lands, with how long after the words it arrived.
import { LIVE } from '/static/config.js';

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid);
  return el;
};
const fmt = (x, p = 3) => (Number.isFinite(x) ? Number(x.toPrecision(p)).toString() : '—');
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const unitOf = (u) => (u === 'fraction of c' ? 'c' : u === 'deg' ? '°' : u ? ` ${u}` : '');
const pillOf = (c) => c.verdict === 'holds' ? ['ok', 'holds'] : c.verdict === 'breaks' ? ['warn', `breaks at ${fmt(c.limit)}${unitOf(c.unit)}`]
  : c.verdict === 'band' ? ['warn', `holds ${fmt(c.lo)}–${fmt(c.hi)}${unitOf(c.unit)}`] : ['warn', 'does not hold'];

const PASSAGES = [
  { lecture: 'oyc-phys200-16', from: 67 * 60, to: 70 * 60 + 45, label: 'Lecture 16, minutes 67–71: the pendulum' },
  { lecture: 'oyc-phys200-16', from: 13 * 60 + 40, to: 16 * 60 + 40, label: 'Lecture 16, minutes 14–17: (1 + x)ⁿ and ½mv²' },
  { lecture: 'oyc-phys200-18', from: 60 * 60 + 20, to: 62 * 60 + 40, label: 'Lecture 18, minutes 60–63: small angles' },
];
for (const [i, p] of PASSAGES.entries()) $('#passage').append(h('option', { value: String(i), text: p.label }));

// ---------- lab frames (sandboxed, as on the wall) ----------
const frames = new Set();
addEventListener('message', (e) => {
  if (e.data?.type !== 'hello') return;
  for (const f of frames) if (f.el.contentWindow === e.source) e.source.postMessage({ type: 'load', sim: f.sim, params: f.params, dark: true }, '*');
});

// ---------- state ----------
let id = null, es = null, t0 = 0, timer = null, stopReplay = null, recog = null;
const sentences = new Map(); // i -> li
const cards = new Map();     // card id -> element
const lags = [];
let heard = 0;

function figures() {
  const sorted = [...lags].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
  const fig = (big, small, label) => h('div', { class: 'fig' }, h('b', {}, big, small ? h('small', { text: small }) : null), h('span', { text: label }));
  $('#figs').replaceChildren(
    fig(String(heard), null, 'sentences heard'),
    fig(String(cards.size), null, 'rules found'),
    fig(String(lags.length), null, 'labs checked and landed'),
    fig(lags.length ? fmt(median) : '—', lags.length ? 's' : null, 'typical time from words to lab'));
}
function emptyStates() {
  $('#ticker').replaceChildren(h('li', { class: 'empty', text: 'Nothing heard yet. Play a passage or start listening.' }));
  $('#labs').replaceChildren(h('div', { class: 'empty', text: 'Labs land here as rules are said.' }));
}

async function startClass() {
  if (id) return true;
  const r = await fetch(`${LIVE}/api/live`, { method: 'POST' }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : { error: 'Could not reach the build server.' };
  if (!r?.ok) { $('#phase').textContent = j.error || 'Could not start a live class.'; return false; }
  id = j.id;
  sentences.clear(); cards.clear(); lags.length = 0; heard = 0;
  $('#ticker').replaceChildren(); $('#labs').replaceChildren(h('div', { class: 'empty', text: 'Labs land here as rules are said.' }));
  t0 = performance.now();
  clearInterval(timer);
  timer = setInterval(() => { $('#clock').textContent = clock((performance.now() - t0) / 1000); }, 250);
  es = new EventSource(`${LIVE}/api/live/${id}/events`);
  es.addEventListener('heard', (e) => {
    const s = JSON.parse(e.data);
    heard++;
    const li = h('li', {}, h('span', { class: 'ts', text: clock(s.t) }), h('span', { text: s.text }));
    sentences.set(s.i, li);
    $('#ticker').append(li);
    li.scrollIntoView({ block: 'nearest' });
    figures();
  });
  es.addEventListener('card', (e) => {
    const c = JSON.parse(e.data);
    sentences.get(c.sentence)?.classList.add('rule');
    $('#labs').querySelector('.empty')?.remove();
    const el = h('div', { class: 'card building' }, h('div', { class: 'screen' }),
      h('div', { class: 'card-body' }, h('div', { class: 'card-meta' }, h('span', { class: 'ts', text: `said at ${clock(c.t)}` }), h('span', { class: 'lag', text: 'building…' })),
        h('h3', { text: c.plain || c.rule }), h('p', { class: 'quote', text: `“${c.quote}”` })));
    cards.set(c.id, el);
    $('#labs').prepend(el);
    $('#phase').textContent = 'A rule was said: its lab is being built and checked…';
    figures();
  });
  es.addEventListener('tile', (e) => {
    const t = JSON.parse(e.data);
    const c = t.cardInfo;
    const el = cards.get(t.card);
    if (!el) return;
    const frame = h('iframe', { src: '/frame', sandbox: 'allow-scripts', title: 'lab animation', tabindex: '-1' });
    frames.add({ el: frame, sim: t.lab.sim, params: { ...c.fixed, [t.check.param]: t.predict.p0 } });
    const [cls, text] = pillOf(t.check);
    el.classList.remove('building');
    el.querySelector('.screen').replaceChildren(frame);
    el.querySelector('.lag').textContent = `landed +${fmt(t.lag)} s`;
    el.querySelector('.card-meta').append(h('span', { class: `pill ${cls}`, text }));
    lags.push(t.lag);
    $('#phase').textContent = `Lab landed ${fmt(t.lag)} s after the words were said.`;
    figures();
  });
  let findingSince = null, findTimer = null;
  es.addEventListener('finding', () => {
    findingSince = performance.now();
    clearInterval(findTimer);
    findTimer = setInterval(() => {
      const s = (performance.now() - findingSince) / 1000;
      if (s > 10) $('#phase').textContent = `Waiting on Cerebras, which is very busy right now: ${Math.round(s)} s. The sentences keep arriving and will be read together.`;
    }, 1000);
    $('#phase').textContent = 'Reading what was just said for rules…';
  });
  es.addEventListener('found', () => { clearInterval(findTimer); $('#phase').textContent = 'Listening…'; });
  es.addEventListener('wait', (e) => { $('#phase').textContent = `Cerebras is busy right now: retrying in ${JSON.parse(e.data).seconds} s.`; });
  es.addEventListener('ended', () => { stop(); $('#phase').textContent = 'This live class reached its time limit.'; });
  figures();
  return true;
}

async function say(text) {
  if (!id) return;
  const r = await fetch(`${LIVE}/api/live/${id}/say`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
  if (r && !r.ok) { const j = await r.json().catch(() => ({})); $('#phase').textContent = j.error || 'The class stopped.'; stop(); }
}

function stop() {
  stopReplay?.(); stopReplay = null;
  if (recog) { recog.onend = null; recog.stop(); recog = null; }
  $('#mic').textContent = 'Start listening'; $('#mic').classList.remove('listening');
  $('#replay').disabled = false;
}

// ---------- replay a real passage at its speaking pace ----------
$('#replay').addEventListener('click', async () => {
  stop();
  const p = PASSAGES[Number($('#passage').value)];
  $('#replay').disabled = true;
  $('#phase').textContent = 'Starting…';
  const lec = await fetch(`/lectures/${p.lecture}.json`).then((r) => r.json());
  const lines = lec.sentences.filter((s) => s.t >= p.from && s.t < p.to);
  if (!(await startClass())) { $('#replay').disabled = false; return; }
  $('#ticker-title').textContent = `Replaying: ${p.label} (at its speaking pace)`;
  $('#phase').textContent = 'Listening…';
  const timers = lines.map((s) => setTimeout(() => say(s.text), (s.t - lines[0].t) * 1000));
  const end = setTimeout(() => { $('#replay').disabled = false; }, (lines.at(-1).t - lines[0].t) * 1000 + 500);
  stopReplay = () => { timers.forEach(clearTimeout); clearTimeout(end); };
});

// ---------- the microphone, through the browser's speech recognition ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { $('#mic').disabled = true; $('#mic-note').textContent = 'This browser has no speech recognition. Chrome, Edge and Safari do; the replay works everywhere.'; }
$('#mic').addEventListener('click', async () => {
  if (recog) { stop(); return; }
  stop();
  if (!(await startClass())) return;
  $('#ticker-title').textContent = 'Listening to your microphone';
  recog = new SR();
  recog.continuous = true;
  recog.interimResults = false;
  recog.lang = 'en-US';
  recog.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) say(e.results[i][0].transcript.trim());
  };
  recog.onerror = (e) => { $('#phase').textContent = e.error === 'not-allowed' ? 'Microphone access was refused. The replay works without it.' : `Speech recognition stopped: ${e.error}.`; };
  recog.onend = () => { if (recog) recog.start(); }; // keep listening until stopped
  recog.start();
  $('#mic').textContent = 'Stop listening'; $('#mic').classList.add('listening');
  $('#phase').textContent = 'Listening. Say a rule, for example: “for small angles, sin x is just x”.';
});

emptyStates();
figures();
