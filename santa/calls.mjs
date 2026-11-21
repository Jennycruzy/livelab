// List every model call's server decode timing in an OpenClaw session, reading both plain and zstd-compressed
// transcript events. Usage: node calls.mjs <agent> <session id> [--json]
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import { homedir } from 'node:os';

export function sessionCalls(agent, sid) {
  const db = new DatabaseSync(`${homedir()}/.openclaw/agents/${agent}/agent/openclaw-agent.sqlite`, { readOnly: true });
  const rows = db.prepare('select seq, event_json, event_zstd from transcript_events where session_id=? order by seq').all(sid);
  const seen = new Set();
  const calls = [];
  for (const r of rows) {
    const txt = r.event_json ?? (r.event_zstd ? zlib.zstdDecompressSync(Buffer.from(r.event_zstd)).toString() : '');
    for (const m of txt.matchAll(/"serverGeneration":(\{[^}]*\})/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const g = JSON.parse(m[1]);
      calls.push({ seq: r.seq, stored: r.event_json ? 'plain' : 'compressed', outputTokens: g.outputTokens, seconds: g.completionMs / 1000 });
    }
  }
  db.close();
  return { calls, rows: rows.length, compressed: rows.filter((r) => !r.event_json).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { calls, rows, compressed } = sessionCalls(process.argv[2], process.argv[3]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(calls.map((c) => [c.outputTokens, Number(c.seconds.toFixed(6))])));
  else {
    for (const c of calls) console.log(c.seq, c.stored, c.outputTokens, 'tok', Math.round(c.outputTokens / c.seconds), 'tok/s');
    console.log('rows', rows, 'compressed', compressed);
  }
}
