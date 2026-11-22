# Santa's shopper

An OpenClaw agent on Kimi K3.1 Pro (Cerebras) that answers one request:

> Find 5 Christmas gifts for my family from real shops, with product links.

It searches five real shops' public product search in one turn (five searches at once), then answers with one gift
per shop: name, price and product page link. Each link is then opened in a real browser by `checklinks.mjs` to confirm
it is a live product page with a price.

## Best run

**1,073 tokens per second**, the mean of the run's two model calls (1,163 for the faster), run on 22 November 2026
at 15:40 UTC. The official speed patch readout for the session: `1,073 tok/s mean · 1,163 p90 (server)`. Every call, as
Cerebras returned it:

| Call | Cerebras response ID | Tokens | Decode time | Tokens/s |
|---|---|---|---|---|
| Search five shops at once | `chatcmpl-d1f6ae4e-a10c-4b8b-a9e7-49c37af03aa0` | 403 | 0.346 s | 1,163 |
| Answer with the five gifts | `chatcmpl-92eca7da-2244-4a26-84fc-5f11e1fad6b1` | 170 | 0.173 s | 983 |

- **Tokens/s** for a call is its completion tokens divided by Cerebras's completion time for that call. Queueing,
  network and tool time are not counted. The run's number is the plain mean of its calls, each call counted once.
- **The response IDs** are Cerebras's own, so each call can be looked up in Cerebras's records.
- **The five gifts** (each a live product page with a price, opened in a real browser):
  [Death Wish Coffee](https://www.deathwishcoffee.com/products/medium-roast) ·
  [Fellow](https://www.fellowproducts.com/products/carter-wide-mug) ·
  [Muji](https://www.muji.us/products/gel-ink-cap-type-ballpoint-pen-10-color-set) ·
  [Parachute](https://www.parachutehome.com/products/fireside-wool-throw-garnet) ·
  [Stanley 1913](https://www.stanley1913.com/products/the-everyday-tumbler-20-oz)

The same record is in [`results/best-run.json`](results/best-run.json); `npm test` recomputes the number from it.

## Files

| File | What it is |
|---|---|
| `workspace-g/` | the agent behind the best run: five shop searches in one turn, then the answer (the default in `openclaw.json`) |
| `workspace/` | an earlier version: opens the 5 product pages together before answering |
| `workspace-d/` | the same agent, checking one product page per turn before opening the next, with a shorter table |
| `openclaw.json` | the OpenClaw config: Kimi K3.1 Pro on Cerebras; its only tool is fetching a web page |
| `shops.txt` | the shops it searches |
| `run.py` | runs the request once in a fresh session and prints every call's tokens and decode time, and the links |
| `batch.py` | repeats `run.py` with a pause between runs |
| `calls.mjs` | reads every model call's timing from an OpenClaw session |
| `checklinks.mjs` | opens each link and checks it is a live single-product page with a price |
| `quiet-wait.py` | waits until the Cerebras queue is short before a batch |
| `results/best-run.json` | the best run: calls, response IDs, timings, links |
