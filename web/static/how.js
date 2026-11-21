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
