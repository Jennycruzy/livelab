// Run a model-written sim's probe() away from everything else: a worker thread with a memory cap and a fresh,
// empty vm context (its own built-in Math; nothing from outside, so no route to require, process or the network),
// string code generation off, and a time limit per call and overall. Parameters go in as a JSON string and come
// out as a number, so no object from outside the context is ever reachable from inside it.
import { Worker } from 'node:worker_threads';

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const { source, calls, perCallMs } = workerData;
(function main() {
const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
let probe;
try {
  vm.runInContext(source + '\\n;globalThis.__probe = typeof probe === "function" ? probe : undefined;', context, { timeout: perCallMs });
  probe = context.__probe;
} catch (e) { parentPort.postMessage({ error: 'sim did not load: ' + String(e && e.message || e).slice(0, 200) }); return; }
if (typeof probe !== 'function') { parentPort.postMessage({ error: 'sim has no probe(params) function' }); return; }
const values = [];
for (const params of calls) {
  try {
    context.__p = JSON.stringify(params);
    const v = vm.runInContext('(function(){ var r = __probe(JSON.parse(__p)); return typeof r === "number" ? r : NaN; })()', context, { timeout: perCallMs });
    values.push(typeof v === 'number' ? v : NaN);
  } catch (e) { values.push(NaN); }
}
// draw() must also run: three frames on a stand-in canvas context, each inside the time limit.
let drawError = null;
try {
  context.__p = JSON.stringify(calls[0] || {});
  vm.runInContext('(function(){' +
    'if (typeof draw !== "function") throw new Error("no draw(ctx, state) function");' +
    'var noop = function(){ return { addColorStop: function(){}, width: 0 }; };' +
    'var ctx = new Proxy({}, { get: function(t, k){ return k === "canvas" ? { width: 600, height: 400 } : noop; }, set: function(){ return true; } });' +
    'for (var i = 0; i < 3; i++) draw(ctx, { params: JSON.parse(__p), t: i * 0.4, w: 600, h: 400, dark: i === 2 });' +
    '})()', context, { timeout: perCallMs });
} catch (e) { drawError = 'draw() failed: ' + String(e && e.message || e).slice(0, 200); }
parentPort.postMessage(drawError ? { values, error: drawError } : { values });
})();
`;

/** Call probe(params) for each params object. Resolves { values } or { error }; never throws. */
export function runProbe(source, calls, { perCallMs = 200, totalMs = 3000 } = {}) {
  if (typeof source !== 'string' || source.length > 12000) return Promise.resolve({ error: 'sim source missing or over 12,000 characters' });
  return new Promise((resolve) => {
    const w = new Worker(WORKER, { eval: true, workerData: { source, calls, perCallMs },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
    const done = (r) => { clearTimeout(timer); w.terminate().catch(() => {}); resolve(r); };
    const timer = setTimeout(() => done({ error: `sim ran past ${totalMs} ms` }), totalMs);
    w.once('message', done);
    w.once('error', (e) => done({ error: 'sim crashed: ' + String(e.message || e).slice(0, 200) }));
    w.once('exit', (code) => done({ error: `sim stopped (exit ${code})` }));
  });
}
