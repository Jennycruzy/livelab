// Drop a lecture: send a transcript (or a library lecture) to the build server, then follow the build on its wall.
import { LIVE } from '/static/config.js';

const $ = (s) => document.querySelector(s);
const MAX_WORDS = 20000;
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function showCount() {
  const n = words($('#text').value);
  $('#count').textContent = n ? `${n.toLocaleString()} words${n > MAX_WORDS ? ' — over the 20,000 limit' : ''}` : '';
}
$('#text').addEventListener('input', showCount);
$('#file').addEventListener('change', () => {
  const f = $('#file').files[0];
  if (!f) return;
  if (f.size > 2_000_000) { $('#msg').textContent = 'That file is over 2 MB.'; return; }
  const r = new FileReader();
  r.onload = () => { $('#text').value = String(r.result); if (!$('#title').value) $('#title').value = f.name.replace(/\.(vtt|srt|txt)$/i, ''); showCount(); };
  r.readAsText(f);
});

async function start(body, button) {
  button.disabled = true;
  $('#msg').textContent = 'Starting…';
  let res, j = {};
  try {
    res = await fetch(`${LIVE}/api/walls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    j = await res.json().catch(() => ({}));
  } catch { j = { error: 'Could not reach the build server. Try again in a moment.' }; }
  if (res?.ok && j.id) { location.href = `/w/${j.id}`; return; }
  $('#msg').textContent = j.error || `The build server answered ${res?.status ?? 'nothing'}.`;
  button.disabled = false;
}

$('#drop').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#text').value;
  const n = words(text);
  if (n < 20) { $('#msg').textContent = 'Paste a transcript first (at least a few sentences).'; return; }
  if (n > MAX_WORDS) { $('#msg').textContent = 'That is over 20,000 words. Paste a single lecture.'; return; }
  start({ text, title: $('#title').value.trim() || undefined }, $('#go'));
});

const lib = await fetch('/api/library').then((r) => r.json()).catch(() => []);
for (const l of lib) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.type = 'button';
  b.textContent = l.title.replace(/^PHYS 200 - /, '');
  b.addEventListener('click', () => start({ lecture: l.lecture }, b));
  $('#lib').append(b);
}

// Scroll reveals (the landing page's motion); everything shows at once under reduced motion.
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
