# LIVE LAB

**One lecture in. Labs out.**

A physics lecture says "for small angles, sin x is just x." Where does that stop being true? LIVE LAB reads the
lecture, finds every rule the teacher states, and turns each one into a lab you can play with. Kimi K3.1 Pro on
Cerebras, running in OpenClaw, does the reading and the writing. Plain-code physics decides where each rule holds and
checks every lab before anyone sees it.

**Try it:** https://livelab-delta.vercel.app — no sign-up, works on a phone.

| | |
|---|---|
| **Walls** | A lecture's rules as checked labs, each pinned to the minute it was said and quoted word for word. |
| **The bench** | Predict first, then drag the slider and watch the rule hold, then stop holding at the point the physics decides. |
| **Live class** | Talk through a lesson, or replay a real lecture at its speaking pace: each lab lands while the teacher is still on the point, stamped with how many seconds after the words it arrived. |
| **Drop a lecture** | Paste a transcript or upload `.vtt` / `.srt` captions and watch the wall build. |

## What a student does

1. Opens a lecture's wall: every rule the teacher stated, one card per rule, with the teacher's exact words.
2. Opens a lab. Predicts first: "Pull it back twice as far. The period will get smaller, stay the same, or get larger?"
3. Drags the slider. The bench shows what the rule says, what exact physics says and the gap between them, live,
   against a 1% line, with a gauge marking exactly where the rule holds.
4. Comes back to the review: only the predictions they got wrong, each opened at the point that shows why.

## The model finds the rules. Plain code decides.

```
lecture ─► rule finders   OpenClaw agents on Kimi K3.1 Pro (Cerebras), one per part of the lecture, all at once
        ─► quote check    each quote must be in the transcript word for word; the minute comes from the transcript
        ─► merge          one card per statement, however many times the teacher repeats it
        ─► library        holds · breaks at X · holds between A and B · does not hold   (1% relative error)
        ─► lab builders   one OpenClaw agent per rule, all at once, each starting as soon as its rule is found
        ─► probe check    the lab's own physics must match the exact answer within 0.5% at five points,
                          with one repair round, or the lab is not shown
```

- **The physics library** (`lib/`) has twelve models: pendulum, falling with drag, springs, projectiles, gravity with
  height, orbits, relativity, small-number approximations, compound interest, capacitors, gases and lenses. Each
  compares the rule's value with a first-principles value (RK4 integration of the motion, or an exact closed form);
  limits are found by bisection. The same library runs in your browser on every bench, so the numbers you see are
  computed by the code that decided the verdict.
- **Model-written lab code is sandboxed twice.** On the server, each lab's probe and drawing run in a worker thread
  with a memory cap and an empty JavaScript context (no process, files or network; no string code generation; time
  limits). In the browser, each lab runs in a sandboxed frame with its own origin and no network, and model-written
  text is always shown as text.
- **Transcripts are data.** Instructions written inside a transcript change nothing.
- **Busy provider, no dead ends.** When the provider's queue is full, calls wait and retry, and the page says so.

## Measured, not claimed

Each library lecture was labelled in advance, from a full reading of its transcript, before Kimi K3.1 Pro read it: every rule the teacher
states and whether the library can check it (`data/labels/`). Every saved wall keeps its full call log
(`data/runs/`). On the first full run of PHYS 200 lecture 16 (73 minutes):

- **10 of 10** labelled rules found, and no rule invented; every quote matched the transcript word for word.
- **5 of 18** labs the model wrote computed the wrong physics on the first try. The probe check caught every one and
  each was fixed in one repair round; none reached the wall.

**The model on its own.** Asked directly about 20 frozen lecture moments, with no library, Kimi K3.1 Pro answered 17
fully right (verdict and limit). The three it missed were confident and specific: for a heavy and a light ball dropped
together it said they part by 1% at 5.96 m, where the physics says 3.13 m. With the library, all 20 match
(`data/baseline/`, `test/key.test.js`).

```
npm test         # physics against textbook values and a second method, 20 frozen lecture moments,
                 # sandbox attacks, the pipeline, live classes
npm run verify   # every saved wall, offline, no keys: call-log fingerprint, every quote, every verdict and limit,
                 # the score against the labels
```

The site's **Evidence** page computes the same numbers in your browser from the same files.

## Run it

Needs Node 24 and an OpenClaw Gateway with Kimi K3.1 Pro on Cerebras.

```
npm install -g openclaw
cp deploy/openclaw.json ~/.openclaw/openclaw.json      # the finder and builder agents (paths point at ~/livelab/agents)
node scripts/build-agents.js                           # writes the agents' instructions from the library
export CEREBRAS_API_KEY=...  OPENCLAW_GATEWAY_TOKEN=...
openclaw gateway --port 18790 &
PORT=8080 npm start                                    # the site, saved walls, live building and live classes
node scripts/run-wall.js oyc-phys200-16                # build and save a wall from the command line
node scripts/run-wall.js oyc-phys200-16 --gpu          # the same agents and prompts on another provider (OpenRouter)
npm run build                                          # a static copy of the site in public/ (vercel.json included)
```

`deploy/openclaw.json` also defines GPU-provider copies of both agents (same instructions, Kimi K3.1 Pro through
OpenRouter pinned to Moonshot AI's own endpoint), used for side-by-side comparisons; they need `OPENROUTER_API_KEY`.

## Repository

| Path | What it is |
|---|---|
| `lib/` | the physics library and check (`check.js`, `models/`), transcript reading and word-for-word quotes (`transcript.js`), the pipeline (`pipeline.js`), live classes (`live.js`), the sandbox (`sandbox.js`), scoring (`evaluate.js`) |
| `agents/` | the two OpenClaw agents' instructions, generated by `scripts/build-agents.js` |
| `server/` | the web server: pages, saved walls, live building and live classes (no framework) |
| `web/` | the site |
| `data/` | lectures, the labels written in advance, saved walls, their call logs, the model-alone baseline |
| `scripts/` | fetch the lectures, build a wall, the static build, `verify`, the baseline |
| `test/` | everything `npm test` runs |
| `santa/` | a separate OpenClaw agent that finds Christmas gifts in real shops (below) |

## Also here: a gift-finding agent

`santa/` holds a small OpenClaw agent that finds five Christmas gifts in real online shops through their public
product search (five searches in one turn) and answers with one gift per shop and its product link;
`santa/checklinks.mjs` then opens each link in a real browser to confirm it is a live product page with a price.

Its best run: **1,317 tokens per second** (mean of its two model calls; 1,429 for the faster), Kimi K3.1 Pro on
Cerebras. Each call is listed with its Cerebras response ID, so the numbers can be checked against Cerebras's own
records (`santa/results/best-run.json`):

| Call | Cerebras response ID | Tokens | Decode time | Tokens/s |
|---|---|---|---|---|
| Search five shops at once | `chatcmpl-0aede3d7-e20d-4126-9a2a-52d825b0c6ec` | 316 | 0.221 s | 1,429 |
| Answer with the five gifts | `chatcmpl-8c2f58be-b11c-4db0-a0fb-3442b8349052` | 170 | 0.141 s | 1,206 |

Decode time is Cerebras's own completion time for the call, so queueing, network and tool time are not counted.
More in [`santa/README.md`](santa/README.md).

## What it works on

Spoken physics and maths rules that have a formula the library covers. Other statements are listed under each wall as
skipped, with the reason. Open Yale transcripts are timed by chapter, so a rule's minute is estimated from its word
position inside the chapter. Live building runs on Kimi K3.1 Pro on Cerebras during its access period; saved walls
stay open and playable after it. Live class listening uses the browser's speech recognition (Chrome, Edge, Safari).

## Credits and licence

Lectures: Prof. Ramamurti Shankar, Fundamentals of Physics I (PHYS 200), Open Yale Courses, licensed
[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). Walls built from them carry the same licence
and credit. Code: MIT.
