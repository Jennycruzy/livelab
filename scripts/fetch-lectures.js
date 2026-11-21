// Fetch the library lectures from Open Yale Courses and save each transcript as JSON in data/lectures/.
// Usage: node scripts/fetch-lectures.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseOycPage } from '../lib/transcript.js';

const LICENCE = 'CC BY-NC-SA 3.0';
const LECTURES = [
  { id: 'oyc-phys200-17', url: 'https://oyc.yale.edu/physics/phys-200/lecture-17' },
  { id: 'oyc-phys200-16', url: 'https://oyc.yale.edu/physics/phys-200/lecture-16' },
  { id: 'oyc-phys200-18', url: 'https://oyc.yale.edu/physics/phys-200/lecture-18' },
];

mkdirSync(new URL('../data/lectures/', import.meta.url), { recursive: true });
for (const l of LECTURES) {
  const res = await fetch(l.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; livelab lecture fetch)' } });
  if (!res.ok) throw new Error(`${l.url}: HTTP ${res.status}`);
  const html = await res.text();
  const doc = parseOycPage(html);
  const out = {
    id: l.id,
    source: { url: l.url, licence: LICENCE, licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
      credit: `Lecture: ${doc.speaker.replace(/^Professor /, 'Prof. ')}, ${doc.course} (PHYS 200), Open Yale Courses, ${LICENCE}`,
      fetched: new Date().toISOString().slice(0, 10) },
    ...doc,
  };
  out.transcriptHash = createHash('sha256').update(out.sentences.map((s) => s.text).join('\n')).digest('hex');
  writeFileSync(new URL(`../data/lectures/${l.id}.json`, import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log(l.id, out.title, `${out.sentences.length} sentences, ~${Math.round(out.duration / 60)} min`);
}
