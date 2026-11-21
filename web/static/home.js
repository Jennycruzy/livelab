// Home: headline from the hero wall's real tile count, a live preview of its labs, and the lecture library.
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
const fmt = (x) => (Number.isFinite(x) ? Number(x.toPrecision(3)).toString() : '—');
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const pillOf = (c) => c.verdict === 'holds' ? ['ok', 'holds'] : c.verdict === 'breaks' ? ['warn', `breaks at ${fmt(c.limit)} ${c.unit}`]
  : c.verdict === 'band' ? ['warn', `holds ${fmt(c.lo)}–${fmt(c.hi)} ${c.unit}`] : ['warn', 'does not hold'];

// Lab frames for the preview (same sandbox as the wall page).
const frames = new Set();
addEventListener('message', (e) => {
  for (const f of frames) if (f.el.contentWindow === e.source && e.data?.type === 'hello') {
    e.source.postMessage({ type: 'load', sim: f.sim, params: f.params, dark: matchMedia('(prefers-color-scheme: dark)').matches }, '*');
  }
});

const lib = await fetch('/api/library').then((r) => r.json());
const hero = lib.find((l) => l.wall && l.lecture === 'oyc-phys200-16') || lib.find((l) => l.wall);

if (hero) {
  const wall = await fetch(`/api/walls/${hero.wall}`).then((r) => r.json());
  const n = wall.tiles.length;
  $('#headline').textContent = `One lecture in. ${WORDS[n] ?? n} labs out.`;
  $('#open-hero').href = `/w/${hero.wall}`;
  $('#open-hero').textContent = 'Open the labs';
  $('#hero-stats').append(
    h('span', {}, h('b', { text: hero.title.replace(/^PHYS 200 - /, '') })),
    h('span', {}, `${hero.minutes} min lecture · `, h('b', { text: String(n) }), ' labs checked · built in ', h('b', { text: `${fmt(wall.timings.wallSeconds)} s` })),
    h('span', { class: 'muted', text: `run ${wall.startedAt.slice(0, 16).replace('T', ' ')} UTC` }));
  const byTime = [...wall.tiles].sort((a, b) => a.at - b.at).slice(0, 4);
  for (const t of byTime) {
    const c = wall.cards.find((x) => x.id === t.card);
    const el = h('iframe', { src: '/frame.html', sandbox: 'allow-scripts', title: 'lab animation', tabindex: '-1' });
    frames.add({ el, sim: t.lab.sim, params: { ...c.fixed, [t.check.param]: t.predict.p0 } });
    const [cls, text] = pillOf(t.check);
    $('#preview').append(h('a', { class: 'tile', href: `/w/${hero.wall}` },
      h('div', { class: 'screen' }, el),
      h('div', { class: 'meta' }, h('span', { class: 'ts', text: `~${Math.floor(c.t / 60)} min` }), h('span', { class: `pill ${cls}`, text })),
      h('div', { class: 'plain', text: c.plain || t.lab.title }),
      h('div', { class: 'quote', text: `“${c.quote}”` })));
  }
}

for (const l of lib) {
  const body = [
    h('span', { class: 'label', text: `${l.minutes} min` }),
    h('strong', { text: l.title.replace(/^PHYS 200 - /, '') }),
    h('span', { class: 'credit', text: l.credit }),
  ];
  if (l.wall) {
    body.push(h('span', { class: 'mono', text: `${l.tiles} labs · built in ${fmt(l.wallSeconds)} s` }));
    $('#library').append(h('a', { class: 'panel card', href: `/w/${l.wall}` }, ...body));
  } else {
    const btn = h('button', { class: 'primary', text: 'Build it live' });
    const note = h('span', { class: 'muted' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; note.textContent = 'Starting…';
      const r = await fetch(`${LIVE}/api/walls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lecture: l.lecture }) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : { error: 'Could not reach the build server.' };
      if (r?.ok && j.id) location.href = `/w/${j.id}`; else { note.textContent = j.error || 'Could not start a build.'; btn.disabled = false; }
    });
    body.push(h('div', { class: 'row' }, btn, note));
    $('#library').append(h('div', { class: 'panel card' }, ...body));
  }
}
