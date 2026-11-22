// The rule list, straight from the physics library the check uses.
import { MODELS } from '/lib/check.js';

const body = document.querySelector('#catalogue tbody');
for (const m of Object.values(MODELS)) {
  for (const r of Object.values(m.rules)) {
    const tr = document.createElement('tr');
    for (const text of [r.statement, `${r.param.replace(/_/g, ' ')} (${r.unit}), ${r.range[0]}–${r.range[1]}`, r.method]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
}

// Scroll reveals (the landing page's motion); everything shows at once under reduced motion.
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
