# Santa's shopper

An OpenClaw agent on Kimi K3.1 Pro (Cerebras) that answers one request:

> Find 5 Christmas gifts for my family from real shops, with product links.

It searches the public product search of several real online shops in one turn, opens each candidate's product page
to confirm it exists and has a price, and answers with a table: gift, price, shop, product link, who it suits. It
never answers with a link it has not opened.

## Best run

**809 tokens per second**, the mean of the run's three model calls (1,187 for the fastest), run on 22 November 2026
at 00:49 UTC. Every call, as Cerebras returned it:

| Call | Cerebras response ID | Tokens | Decode time | Tokens/s |
|---|---|---|---|---|
| Search the shops | `chatcmpl-26142479-541f-4b48-8f31-d1bad824a79e` | 878 | 1.406 s | 624 |
| Open the 5 product pages | `chatcmpl-b081e176-3c5b-4400-9d85-ecea85d9ca7a` | 425 | 0.358 s | 1,187 |
| Answer with the table | `chatcmpl-0e63c26b-a371-4826-8263-9515dc25cd8e` | 288 | 0.468 s | 615 |

- **Tokens/s** for a call is its completion tokens divided by Cerebras's completion time for that call. Queueing,
  network and tool time are not counted. The run's number is the plain mean of its calls, each call counted once.
- **The response IDs** are Cerebras's own, so each call can be looked up in Cerebras's records.
- **The five gifts** (each a live product page with a price):
  [The Sill](https://www.thesill.com/products/ficus-assortment) ·
  [Taylor Stitch](https://www.taylorstitch.com/products/seafarer-beanie-in-atlantic-blue-donegal-2611) ·
  [Stanley 1913](https://www.stanley1913.com/products/the-stay-hot-camp-mug-24-oz) ·
  [Parachute](https://www.parachutehome.com/products/organic-rib-knit-throw-dusk) ·
  [Bokksu](https://www.bokksu.com/products/gift-classic-bokksu)

The same record is in [`results/best-run.json`](results/best-run.json); `npm test` recomputes the number from it.

## Files

| File | What it is |
|---|---|
| `workspace/` | the agent's instructions |
| `openclaw.json` | the OpenClaw config: Kimi K3.1 Pro on Cerebras; its only tool is fetching a web page |
| `shops.txt` | the shops it searches |
| `run.py` | runs the request once in a fresh session and prints every call's tokens and decode time, and the links |
| `batch.py` | repeats `run.py` with a pause between runs |
| `calls.mjs` | reads every model call's timing from an OpenClaw session |
| `checklinks.mjs` | opens each link and checks it is a live single-product page with a price |
| `quiet-wait.py` | waits until the Cerebras queue is short before a batch |
| `results/best-run.json` | the best run: calls, response IDs, timings, links |
