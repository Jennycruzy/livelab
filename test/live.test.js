// Live class: rules said aloud become checked labs, each stamped with when it was said and when it landed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { LiveSession } from '../lib/live.js';

function gateway(reply) {
  const server = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const { model, messages } = JSON.parse(body);
    const out = await reply(model, messages[0].content);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: {} }));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('live class: a rule said aloud becomes a checked lab once, with its lag; chatter and invented quotes do not', async () => {
  let finderCalls = 0;
  const gw = await gateway(async (model, text) => {
    if (model === 'openclaw/livelab-finder') {
      finderCalls++;
      await new Promise((ok) => setTimeout(ok, 30));
      const cards = [{ quote: 'The pendulum on the moon is made of cheese.', model: 'series', rule: 'sin_x' }]; // never said
      if (text.includes('sin x is just x')) cards.push({ quote: 'For small angles, sin x is just x.', model: 'series', rule: 'sin_x', plain: 'sin x ≈ x' });
      return { cards, skipped: [] };
    }
    return { title: 'sin', slider: 'Angle', question: 'q', sim: 'function probe(p){ return Math.sin(p.x*Math.PI/180); } function draw(){}' };
  });
  const events = [];
  const live = new LiveSession({ gateway: { url: gw.url, token: 't' }, onEvent: (type, d) => events.push([type, d]) });
  live.say('Good morning everyone.');
  live.say('For small angles, sin x is just x.');
  live.say('Remember, for small angles, sin x is just x.');
  live.say('Any questions so far?');
  for (let i = 0; i < 100 && !events.some(([t]) => t === 'tile'); i++) await new Promise((ok) => setTimeout(ok, 20));
  await new Promise((ok) => setTimeout(ok, 300));
  live.close();
  gw.server.close();
  const tiles = events.filter(([t]) => t === 'tile').map(([, d]) => d);
  assert.equal(tiles.length, 1, 'one lab for the rule, however often it is said');
  assert.equal(tiles[0].check.verdict, 'breaks');
  assert.ok(tiles[0].lag >= 0 && tiles[0].landed >= tiles[0].said, 'lag is landing time minus speaking time');
  assert.equal(events.filter(([t]) => t === 'heard').length, 4);
  assert.ok(finderCalls < 4, 'sentences arriving while the finder works are read together, not one call each');
});

test('live class: limits are enforced', async () => {
  const live = new LiveSession({ gateway: { url: 'http://127.0.0.1:1', token: 't' }, onEvent: () => {} });
  live.schedule = () => {};
  assert.equal(live.say('   '), null, 'empty speech is ignored');
  live.close();
  assert.throws(() => live.say('hello'), /ended/);
});
