// LIVE LAB web server. Serves the site, saved walls and their run logs, and builds new walls through the OpenClaw
// Gateway, streaming progress to the browser. The Gateway and its token never leave this process.
// Usage: OPENCLAW_GATEWAY_TOKEN=... PORT=8080 node server/server.js
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { buildWall } from '../lib/pipeline.js';
import { parseCaptions } from '../lib/transcript.js';
import { library } from '../lib/library.js';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);
const GATEWAY = { url: process.env.LIVELAB_GATEWAY || 'http://127.0.0.1:18790', token: process.env.OPENCLAW_GATEWAY_TOKEN || '' };
const MAX_WORDS = 20000;
const RATE_MS = 10 * 60 * 1000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const PAGES = { '/': 'index.html', '/new': 'new.html', '/how': 'how.html', '/evidence': 'evidence.html' };
const SECURITY = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
};

const live = new Map(); // id -> { events: [], clients: Set, done }
const lastBuild = new Map(); // ip -> time

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, ...SECURITY, ...extra });
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), TYPES['.json'], extra);

function serveFile(res, path, cache = 'no-cache') {
  const p = normalize(path);
  if (!p.startsWith(ROOT) || !existsSync(p) || !statSync(p).isFile()) return send(res, 404, 'Not found');
  const headers = { 'cache-control': cache };
  // The sim frame runs model-written code: give it its own locked-down policy and no same-origin access.
  if (p.endsWith('/web/frame.html')) Object.assign(headers, { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'", 'x-frame-options': 'SAMEORIGIN' });
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', ...SECURITY, ...headers });
  res.end(readFileSync(p));
}


async function readBody(req, limit = 2_000_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

/** Start a build from pasted text, a caption file, or a library lecture. */
async function startBuild(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const last = lastBuild.get(ip);
  if (last && Date.now() - last < RATE_MS) return json(res, 429, { error: 'One new wall per visitor every 10 minutes. Saved walls are always open.' });
  if (!GATEWAY.token) return json(res, 503, { error: 'Live building is switched off on this server; saved walls are open.' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'Send JSON: {"text": "..."} or {"lecture": "<id>"}' }); }
  let doc;
  if (typeof body.lecture === 'string' && /^[a-z0-9-]+$/.test(body.lecture) && existsSync(join(ROOT, 'data/lectures', `${body.lecture}.json`))) {
    doc = JSON.parse(readFileSync(join(ROOT, 'data/lectures', `${body.lecture}.json`), 'utf8'));
  } else if (typeof body.text === 'string' && body.text.trim()) {
    const words = body.text.trim().split(/\s+/).length;
    if (words > MAX_WORDS) return json(res, 413, { error: `That transcript has ${words} words; the limit is ${MAX_WORDS} (about 90 minutes).` });
    doc = parseCaptions(body.text);
    doc.title = String(body.title || 'Your lecture').slice(0, 120);
    doc.source = { url: null, licence: null, credit: 'Transcript supplied by the visitor' };
    doc.transcriptHash = createHash('sha256').update(doc.sentences.map((s) => s.text).join('\n')).digest('hex');
  } else return json(res, 400, { error: 'Paste a transcript or pick a library lecture.' });
  if (doc.sentences.length < 2) return json(res, 400, { error: 'That transcript is too short to find rules in.' });

  lastBuild.set(ip, Date.now());
  const id = `${body.lecture || 'drop'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  const job = { events: [], clients: new Set(), done: false };
  live.set(id, job);
  const emit = (type, data) => {
    const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    job.events.push(line);
    for (const c of job.clients) c.write(line);
  };
  emit('start', { id, title: doc.title, credit: doc.source?.credit ?? null, duration: doc.duration ?? null,
    lecture: body.lecture ?? null, sentences: doc.sentences.length });
  json(res, 202, { id });
  buildWall(doc, { gateway: GATEWAY, onEvent: emit }).then(({ wall, log }) => {
    wall.id = id; wall.lecture = body.lecture ?? null; wall.duration = doc.duration ?? null;
    const logText = log.map((x) => JSON.stringify(x)).join('\n') + '\n';
    wall.runLog = { file: `data/runs/${id}.jsonl`, sha256: createHash('sha256').update(logText).digest('hex') };
    mkdirSync(join(ROOT, 'data/runs'), { recursive: true }); mkdirSync(join(ROOT, 'data/walls'), { recursive: true });
    writeFileSync(join(ROOT, 'data/runs', `${id}.jsonl`), logText);
    writeFileSync(join(ROOT, 'data/walls', `${id}.json`), JSON.stringify(wall, null, 1) + '\n');
    emit('saved', { id });
  }).catch((e) => emit('failed', { error: String(e.message || e).slice(0, 300) }))
    .finally(() => { job.done = true; for (const c of job.clients) c.end(); setTimeout(() => live.delete(id), 600000); });
}

function streamEvents(req, res, id) {
  const job = live.get(id);
  if (!job) return json(res, 404, { error: 'No build in progress with that id.' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...SECURITY });
  for (const e of job.events) res.write(e);
  if (job.done) return res.end();
  job.clients.add(res);
  req.on('close', () => job.clients.delete(res));
}

// Origins allowed to call the API from a browser: the site's own static host(s). The API is public either way;
// this only lets those pages read the answers.
const ORIGINS = new RegExp(process.env.LIVELAB_ORIGINS || '^https://[a-z0-9-]+\\.vercel\\.app$');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const origin = req.headers.origin;
    if (origin && ORIGINS.test(origin) && (path.startsWith('/api/') || path.startsWith('/runs/'))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
        return res.end();
      }
    }
    if (req.method === 'GET' && PAGES[path]) return serveFile(res, join(ROOT, 'web', PAGES[path]));
    if (req.method === 'GET' && /^\/w\/[A-Za-z0-9-]+$/.test(path)) return serveFile(res, join(ROOT, 'web', 'wall.html'));
    if (req.method === 'GET' && (path === '/frame' || path === '/frame.html')) return serveFile(res, join(ROOT, 'web', 'frame.html'));
    if (req.method === 'GET' && path.startsWith('/static/')) return serveFile(res, join(ROOT, 'web', path), 'public, max-age=300');
    if (req.method === 'GET' && path.startsWith('/lib/') && path.endsWith('.js')) return serveFile(res, join(ROOT, path), 'public, max-age=300');
    if (req.method === 'GET' && path === '/api/library') return json(res, 200, library(ROOT));
    let m;
    if (req.method === 'GET' && (m = path.match(/^\/api\/walls\/([A-Za-z0-9-]+)$/))) {
      const f = join(ROOT, 'data/walls', `${m[1]}.json`);
      return existsSync(f) ? serveFile(res, f, 'public, max-age=60') : json(res, 404, { error: 'No saved wall with that id.' });
    }
    if (req.method === 'GET' && (m = path.match(/^\/api\/walls\/([A-Za-z0-9-]+)\/events$/))) return streamEvents(req, res, m[1]);
    if (req.method === 'GET' && (m = path.match(/^\/runs\/([A-Za-z0-9-]+\.jsonl)$/))) return serveFile(res, join(ROOT, 'data/runs', m[1]), 'public, max-age=3600');
    if (req.method === 'GET' && (m = path.match(/^\/lectures\/([a-z0-9-]+\.json)$/))) return serveFile(res, join(ROOT, 'data/lectures', m[1]), 'public, max-age=3600');
    if (req.method === 'GET' && (m = path.match(/^\/labels\/([a-z0-9-]+\.json)$/))) return serveFile(res, join(ROOT, 'data/labels', m[1]), 'public, max-age=3600');
    if (req.method === 'POST' && path === '/api/walls') return await startBuild(req, res);
    return send(res, 404, 'Not found');
  } catch (e) {
    return send(res, 500, 'Server error');
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`LIVE LAB on http://127.0.0.1:${PORT}`));
