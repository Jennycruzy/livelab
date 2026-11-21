// Lecture transcripts: read an Open Yale Courses lecture page or a plain/caption file into sentences with an
// estimated time, and find a quoted sentence word for word.
//
// Open Yale transcripts carry timestamps only at chapter headings ("Chapter 2. Title [00:10:49]"), so a sentence's
// time is estimated from its word position between its chapter's start and the next chapter's start. The last
// chapter runs at the lecture's average speaking rate.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’',
  lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', omega: 'ω', pi: 'π', theta: 'θ' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const toSeconds = (hms) => hms.split(':').reduce((t, x) => t * 60 + Number(x), 0);

/** Normalise text for word-for-word matching: case, curly quotes, dashes and whitespace do not count. */
export function normalise(s) {
  return s.toLowerCase()
    .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  // Break after . ! ? when followed by a space and a capital, a quote or a digit. Keeps "e.g." and "x = 0." mostly whole.
  return text.split(/(?<=[.!?])\s+(?=["'“‘(\[]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
}

/** Read an Open Yale Courses lecture page. */
export function parseOycPage(html) {
  const start = html.indexOf('id="transcript-top"');
  const end = html.indexOf('[end of transcript]', start);
  if (start < 0 || end < 0) throw new Error('no Open Yale transcript found on this page');
  const body = html.slice(start, end);
  const title = decode((body.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '').trim();
  const course = decode((body.match(/id="transcript-top">([\s\S]*?)<\/h1>/) || [])[1] || '').trim();
  const parts = body.split(/<h3>([\s\S]*?)<\/h3>/);
  const chapters = [];
  for (let i = 1; i < parts.length; i += 2) {
    const head = decode(parts[i].replace(/<[^>]+>/g, '')).trim();
    const m = head.match(/^(.*?)\s*\[(\d{1,2}:\d{2}:\d{2})\]$/);
    if (!m) throw new Error(`chapter heading without a timestamp: "${head}"`);
    const text = decode(parts[i + 1]
      .replace(/<strong>[^<]*:<\/strong>/g, ' ')    // speaker labels
      .replace(/<br\s*\/?>|<\/p>|<p>/g, ' ')
      .replace(/<[^>]+>/g, ''))                     // italics around formulas etc.
      .replace(/\s+/g, ' ').trim();
    chapters.push({ title: m[1], t: toSeconds(m[2]), text });
  }
  const speaker = decode((body.match(/<strong>([^<]*?):<\/strong>/) || [])[1] || '').trim();
  return withTimes({ title, course, speaker, chapters });
}

/** Read a WebVTT/SRT caption file (line timestamps) or plain text (no times). */
export function parseCaptions(text) {
  const cues = [];
  const re = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*[^\n]*\n([\s\S]*?)(?:\n\s*\n|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const t = (m[1] ? Number(m[1].slice(0, -1)) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
    const line = m[5].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (line) cues.push({ t, text: line });
  }
  if (!cues.length) {
    return withTimes({ title: '', course: '', speaker: '', chapters: [{ title: '', t: null, text: text.replace(/\s+/g, ' ').trim() }] });
  }
  return withTimes({ title: '', course: '', speaker: '', chapters: cues.map((c) => ({ title: '', t: c.t, text: c.text })) });
}

// Estimate a time for every sentence from word positions between chapter (or cue) timestamps.
function withTimes(doc) {
  const timed = doc.chapters.filter((c) => c.t !== null);
  const totalWords = doc.chapters.reduce((n, c) => n + c.text.split(' ').length, 0);
  let rate = null; // words per second, from chapters that have a next timestamp
  if (timed.length > 1) {
    let w = 0;
    for (let i = 0; i < doc.chapters.length - 1; i++) w += doc.chapters[i].text.split(' ').length;
    const span = doc.chapters[doc.chapters.length - 1].t - doc.chapters[0].t;
    rate = span > 0 ? w / span : null;
  }
  const sentences = [];
  doc.chapters.forEach((c, ci) => {
    const next = doc.chapters[ci + 1];
    const words = c.text.split(' ').length;
    const span = c.t === null ? null : next ? next.t - c.t : rate ? words / rate : null;
    let seen = 0;
    for (const s of splitSentences(c.text)) {
      const t = c.t === null || span === null ? null : Math.round(c.t + (span * seen) / words);
      sentences.push({ i: sentences.length, chapter: ci, t, text: s });
      seen += s.split(' ').length;
    }
  });
  const duration = timed.length && rate ? Math.round(doc.chapters[doc.chapters.length - 1].t +
    doc.chapters[doc.chapters.length - 1].text.split(' ').length / rate) : null;
  return { ...doc, sentences, words: totalWords, duration, timesEstimated: true };
}

/**
 * Find a quote word for word (after normalising). Returns the sentence it starts in, with its estimated time and
 * chapter, or null. A quote may run across sentence boundaries.
 */
export function findQuote(doc, quote) {
  const q = normalise(quote);
  if (q.length < 12) return null; // too short to pin to one place
  const joined = [];
  let pos = 0;
  for (const s of doc.sentences) {
    const n = normalise(s.text);
    joined.push({ start: pos, s });
    pos += n.length + 1;
  }
  const all = doc.sentences.map((s) => normalise(s.text)).join(' ');
  const at = all.indexOf(q);
  if (at < 0) return null;
  if (all.indexOf(q, at + 1) >= 0) return { ...locate(joined, at), ambiguous: true };
  return locate(joined, at);
}
function locate(joined, at) {
  let hit = joined[0];
  for (const j of joined) { if (j.start <= at) hit = j; else break; }
  return { sentence: hit.s.i, chapter: hit.s.chapter, t: hit.s.t, ambiguous: false };
}

/** Text for the rule finder: one sentence per line, prefixed with its index and estimated minute. */
export function forFinder(doc) {
  return doc.sentences.map((s) => `[${s.i}${s.t === null ? '' : ` ~${Math.floor(s.t / 60)}m`}] ${s.text}`).join('\n');
}
