// Re-check every saved wall offline, with no keys: run log fingerprint, every quote word for word in its
// transcript, every verdict and limit recomputed by the physics library, and the score against the labels written in advance.
// Usage: npm run verify
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { check } from '../lib/check.js';
import { findQuote } from '../lib/transcript.js';
import { evaluateWall, probeStats } from '../lib/evaluate.js';

const root = new URL('..', import.meta.url).pathname;
const t0 = Date.now();
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const same = (a, b) => (a === undefined || a === null ? b === undefined || b === null : Math.abs(a / b - 1) < 1e-9);

const walls = readdirSync(`${root}data/walls`).filter((f) => f.endsWith('.json')).sort();
for (const f of walls) {
  const wall = JSON.parse(readFileSync(`${root}data/walls/${f}`, 'utf8'));
  console.log(`\n${f.replace(/\.json$/, '')}`);

  const logPath = `${root}${wall.runLog.file}`;
  const logText = readFileSync(logPath, 'utf8');
  const sha = createHash('sha256').update(logText).digest('hex');
  if (sha !== wall.runLog.sha256) fail(`run log fingerprint ${sha.slice(0, 12)} ≠ ${wall.runLog.sha256.slice(0, 12)}`);
  else console.log(`  run log fingerprint matches (${sha.slice(0, 12)})`);
  const log = logText.trim().split('\n').map((x) => JSON.parse(x));

  const lecture = wall.lecture && existsSync(`${root}data/lectures/${wall.lecture}.json`)
    ? JSON.parse(readFileSync(`${root}data/lectures/${wall.lecture}.json`, 'utf8')) : null;
  if (lecture) {
    if (lecture.transcriptHash !== wall.transcriptHash) fail('wall was built on a different transcript');
    let ok = 0;
    for (const c of wall.cards) {
      for (const q of [c, ...(c.also || [])]) {
        const hit = findQuote(lecture, q.quote);
        if (!hit) fail(`${c.id}: quote not in the transcript: “${q.quote.slice(0, 60)}”`);
        else if (hit.sentence !== q.sentence) fail(`${c.id}: quote found at sentence ${hit.sentence}, wall says ${q.sentence}`);
        else ok++;
      }
    }
    console.log(`  ${ok} quotes found word for word at the sentence the wall shows`);
  }

  let verdicts = 0;
  for (const t of wall.tiles) {
    const c = wall.cards.find((x) => x.id === t.card);
    const r = check({ model: c.model, rule: c.rule, range: c.range, fixed: c.fixed });
    const okVerdict = r.verdict === t.check.verdict && same(t.check.limit, r.limit) && same(t.check.lo, r.lo) && same(t.check.hi, r.hi);
    if (!okVerdict) fail(`${c.id} ${c.model}/${c.rule}: wall shows ${t.check.verdict} ${t.check.limit ?? ''}, library gives ${r.verdict} ${r.limit ?? ''}`);
    else verdicts++;
  }
  console.log(`  ${verdicts} of ${wall.tiles.length} verdicts and limits recomputed exactly by the library`);

  const p = probeStats(log);
  console.log(`  labs: ${p.labs} written, ${p.wrongFirst} wrong on first try, ${p.fixed} fixed, ${p.neverRight} never shown`);
  if (wall.lecture && existsSync(`${root}data/labels/${wall.lecture}.json`)) {
    const e = evaluateWall(wall, JSON.parse(readFileSync(`${root}data/labels/${wall.lecture}.json`, 'utf8')));
    console.log(`  labels: ${e.found} of ${e.labels} found; ${e.matched} of ${e.cards} cards match a label`);
  }
  console.log(`  timing from the log: first lab ${wall.timings.firstTile?.toFixed(1)} s, all labs ${wall.timings.wallSeconds.toFixed(1)} s`);
}
console.log(`\n${walls.length} walls checked in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${failures ? `${failures} FAILED` : 'all checks pass'}`);
process.exit(failures ? 1 : 0);
