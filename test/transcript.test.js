// Transcript reading, time estimates, word-for-word quote matching, and the saved lectures and labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCaptions, findQuote, normalise, forFinder } from '../lib/transcript.js';
import { MODELS } from '../lib/check.js';

const lecture = (id) => JSON.parse(readFileSync(new URL(`../data/lectures/${id}.json`, import.meta.url), 'utf8'));
const labels = (id) => JSON.parse(readFileSync(new URL(`../data/labels/${id}.json`, import.meta.url), 'utf8'));
const IDS = readdirSync(new URL('../data/lectures/', import.meta.url)).map((f) => f.replace(/\.json$/, ''));

test('saved lectures: credit, chapters in time order, sentence times inside their chapter', () => {
  assert.ok(IDS.length >= 3);
  for (const id of IDS) {
    const d = lecture(id);
    assert.match(d.source.credit, /Open Yale Courses, CC BY-NC-SA 3\.0$/);
    for (let i = 1; i < d.chapters.length; i++) assert.ok(d.chapters[i].t > d.chapters[i - 1].t, `${id} chapter order`);
    for (const s of d.sentences) {
      const c = d.chapters[s.chapter], next = d.chapters[s.chapter + 1];
      assert.ok(s.t >= c.t && (!next || s.t <= next.t), `${id} sentence ${s.i} time outside its chapter`);
    }
    const hash = createHash('sha256').update(d.sentences.map((s) => s.text).join('\n')).digest('hex');
    assert.equal(hash, d.transcriptHash, `${id} transcript hash`);
  }
});

test('quotes are found word for word; case and spacing do not matter; invented text is not found', () => {
  const d = lecture('oyc-phys200-16');
  const s = d.sentences[687];
  assert.equal(findQuote(d, s.text).sentence, 687);
  assert.equal(findQuote(d, `  ${s.text.toUpperCase()}  `).sentence, 687);
  assert.equal(findQuote(d, 'For small angles, sin θ is exactly θ at every angle.'), null);
  assert.equal(findQuote(d, 'Okay.'), null, 'too short to pin to one place');
  const across = `${d.sentences[705].text} ${d.sentences[706].text}`;
  assert.equal(findQuote(d, across).sentence, 705, 'a quote may run across sentences');
});

test('normalise treats curly quotes, dashes and spacing as the same', () => {
  assert.equal(normalise('It’s  “small” – very\nsmall'), normalise("it's \"small\" - very small"));
});

test('captions: VTT cues keep their own times; plain text has no times', () => {
  const vtt = 'WEBVTT\n\n00:01:05.000 --> 00:01:09.000\nFor small angles, sin x is just x.\n\n00:01:09.500 --> 00:01:12.000\nThat is the trick.\n';
  const d = parseCaptions(vtt);
  assert.equal(d.sentences[0].t, 65);
  assert.equal(findQuote(d, 'For small angles, sin x is just x.').t, 65);
  const plain = parseCaptions('Energy is conserved in a frictionless pendulum. Next topic.');
  assert.equal(plain.sentences[0].t, null);
  assert.match(forFinder(plain), /^\[0\] Energy/);
});

test('labels: frozen against the transcript, every quote is the sentence it points to, every rule exists', () => {
  for (const id of IDS) {
    const d = lecture(id), L = labels(id);
    assert.equal(L.transcriptHash, d.transcriptHash, `${id} labels were made on this transcript`);
    for (const l of L.labels) {
      l.sentences.forEach((i, k) => assert.equal(d.sentences[i].text, l.quotes[k], `${l.id} quote`));
      if (l.inLibrary) assert.ok(MODELS[l.model]?.rules[l.rule], `${l.id} rule ${l.model}/${l.rule}`);
    }
  }
});
