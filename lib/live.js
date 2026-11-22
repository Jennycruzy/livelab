// Live class: labs from a lecture as it is spoken. Sentences arrive one at a time (from a microphone or a replayed
// transcript); the rule finder re-reads the last few sentences whenever new ones arrive, and each new rule is
// verified, checked and built with exactly the same code as a saved wall. Every lab records when its rule was said
// and when the lab landed, so the page can show whether it kept up with the teacher.
import { callAgent, parseReply, buildLab, MERGE_GAP_S } from './pipeline.js';
import { resolve, CardError } from './check.js';
import { findQuote } from './transcript.js';

export const LIVE_LIMITS = { sentences: 500, sentenceChars: 600, minutes: 15 };

export class LiveSession {
  constructor({ gateway, agents = { finder: 'livelab-finder', builder: 'livelab-builder' }, onEvent = () => {}, windowSize = 8 }) {
    Object.assign(this, { gateway, agents, onEvent, windowSize });
    this.t0 = Date.now();
    this.doc = { title: 'Live class', chapters: [{ title: '', t: 0 }], sentences: [] };
    this.log = [];
    this.groups = []; // { key, last, card }
    this.tiles = [];
    this.running = false;
    this.pending = false;
    this.building = 0;
    this.nextId = 0;
    this.closed = false;
  }

  at() { return (Date.now() - this.t0) / 1000; }

  /** A sentence was said. Returns its index. */
  say(text) {
    if (this.closed) throw new Error('this live class has ended');
    if (this.doc.sentences.length >= LIVE_LIMITS.sentences) throw new Error('this live class has reached its length limit');
    const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, LIVE_LIMITS.sentenceChars);
    if (!clean) return null;
    const s = { i: this.doc.sentences.length, chapter: 0, t: Math.round(this.at() * 10) / 10, text: clean };
    this.doc.sentences.push(s);
    this.onEvent('heard', s);
    this.schedule();
    return s.i;
  }

  schedule() {
    if (this.running) { this.pending = true; return; }
    this.run().catch((e) => this.onEvent('skip', { stage: 'finder', why: String(e.message || e).slice(0, 200) }));
  }

  async run() {
    this.running = true;
    try {
      do {
        this.pending = false;
        const all = this.doc.sentences;
        const from = Math.max(0, all.length - this.windowSize);
        const lines = all.slice(from).map((s) => `[${s.i} ~${Math.floor(s.t / 60)}m] ${s.text}`).join('\n');
        const intro = 'Live class: these are the last sentences the teacher said, in order. List only rules stated in these lines.\n';
        let reply;
        const started = this.at();
        this.onEvent('finding', { from, to: all.length - 1, at: started });
        try {
          const r = await callAgent(this.gateway, this.agents.finder, intro + lines, { onBusy: (w) => this.onEvent('wait', { what: 'rule finder', seconds: w }) });
          this.onEvent('found', { seconds: Math.round((this.at() - started) * 10) / 10 });
          this.log.push({ kind: 'model', agent: this.agents.finder, ms: r.ms, usage: r.usage, retries: r.retries, at: this.at(), window: [from, all.length - 1] });
          reply = parseReply(r.content);
        } catch (e) {
          this.onEvent('skip', { stage: 'finder', why: String(e.message || e).slice(0, 200) });
          continue;
        }
        for (const c of reply.cards || []) this.take(c);
      } while (this.pending && !this.closed);
    } finally {
      this.running = false;
    }
  }

  take(c) {
    const hit = typeof c.quote === 'string' ? findQuote(this.doc, c.quote) : null;
    if (!hit) return; // not something that was said: ignored
    let resolved;
    try { resolved = resolve({ model: c.model, rule: c.rule, range: c.range, fixed: c.fixed }); }
    catch (e) { if (e instanceof CardError) return; throw e; }
    const key = JSON.stringify([c.model, c.rule, resolved.range, resolved.fixed]);
    const g = this.groups.find((x) => x.key === key && Math.abs(hit.t - x.last) <= MERGE_GAP_S);
    if (g) {
      if (!g.card.also.some((a) => a.sentence === hit.sentence) && g.card.sentence !== hit.sentence) {
        g.card.also.push({ sentence: hit.sentence, t: hit.t, quote: c.quote });
        g.last = Math.max(g.last, hit.t);
      }
      return;
    }
    const card = { id: `r${++this.nextId}`, sentence: hit.sentence, t: hit.t, quote: c.quote, plain: c.plain ?? '',
      model: c.model, rule: c.rule, range: resolved.range, fixed: resolved.fixed, notes: resolved.notes, also: [] };
    this.groups.push({ key, last: hit.t, card });
    this.onEvent('card', card);
    this.building++;
    buildLab({ gateway: this.gateway, agents: this.agents, card, resolved, log: this.log, at: () => this.at(),
      onBusy: (what) => (w) => this.onEvent('wait', { what, seconds: w }) })
      .then(({ tile, skip }) => {
        if (skip) { this.onEvent('skip', skip); return; }
        const landed = { ...tile, card: card.id, cardInfo: card, said: card.t, landed: tile.at, lag: Math.round((tile.at - card.t) * 10) / 10 };
        this.tiles.push(landed);
        this.onEvent('tile', landed);
      })
      .catch((e) => this.onEvent('skip', { stage: 'lab', why: String(e.message || e).slice(0, 200) }))
      .finally(() => { this.building--; });
  }

  close() { this.closed = true; }
}
