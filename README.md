# LIVE LAB

**One lecture in. Labs out.** Drop in a physics lecture. Kimi K3.1 Pro on Cerebras, running in OpenClaw, finds every
rule the teacher states and turns each one into a lab you can play with. Plain-code physics checks every lab and
shows exactly where each rule stops holding.

Try it: **https://livelab.38-49-216-59.sslip.io**

## What a student does

1. Opens a lecture's wall: every rule the teacher stated, pinned to the minute it was said, each with the teacher's
   words quoted exactly.
2. Taps a lab. Predicts first: "Pull the pendulum back twice as far. The period will get smaller, stay the same or
   get larger?"
3. Drags the slider and watches the rule hold, then stop holding. The bench shows what the rule says, what exact
   physics says, and the gap, live, against a 1% line.
4. Reviews only the predictions they got wrong.

Teachers and self-learners can drop their own transcript or captions and watch the wall build.

## The model finds the rules. Plain code decides.

```
transcript ─► rule finder (OpenClaw agent, Kimi K3.1 Pro on Cerebras)
          ─► quote check        every quote must be in the transcript word for word; the minute comes from the transcript
          ─► physics library    holds / breaks at X / holds between A and B / does not hold, at 1% relative error
          ─► lab builders       one OpenClaw agent per rule, all at once: an animation and a probe
          ─► probe check        the lab's own physics must match the exact answer within 0.5% at five points,
                                or it gets one repair round, or it is not shown
```

- The physics library (`lib/`) has twelve models (pendulum, falling with drag, springs, projectiles, gravity with
  height, orbits, relativity, small-number approximations, compound interest, capacitors, gases, lenses). Each
  compares the rule's value with a first-principles value: RK4 integration of the motion or an exact closed form.
  Limits are found by bisection.
- The same library runs in the browser on every bench, so the numbers a student sees are computed by the code that
  decided the verdict.
- Model-written lab code runs on the server in a worker thread with a memory cap and an empty JavaScript context
  (no process, no files, no network, no string code generation, time limits), and in the browser in sandboxed frames
  with their own origin and no network. Model-written text is shown as text.
- Transcripts are data: instructions written inside a transcript change nothing.

## Evidence you can re-check

Each lecture in `data/lectures/` was labelled by hand, from a full reading, before any model run: every rule the
teacher states and which ones the library can check (`data/labels/`). Every saved wall in `data/walls/` keeps its
full call log in `data/runs/`.

```
npm test         # library vs textbook values and a second method, 20 frozen lecture moments, sandbox attacks, pipeline
npm run verify   # every saved wall, offline, no keys: log fingerprint, every quote, every verdict and limit, label scores
```

The site's **Evidence** page computes the same numbers in the browser from the same files.

## Run it

Needs Node 24 and an OpenClaw Gateway with Kimi K3.1 Pro on Cerebras.

```
npm install -g openclaw
cp deploy/openclaw.json ~/.openclaw/openclaw.json      # two agents: livelab-finder and livelab-builder
node scripts/build-agents.js                           # writes the agents' instructions from the library
export CEREBRAS_API_KEY=...  OPENCLAW_GATEWAY_TOKEN=...
openclaw gateway --port 18790 &
PORT=8080 npm start                                    # the site, saved walls and live building
node scripts/run-wall.js oyc-phys200-16                # build and save a wall from the command line
npm run build                                          # static copy of the site in public/ (vercel.json included)
```

The agents' workspaces in `deploy/openclaw.json` point at `~/livelab/agents/`; adjust the paths to your checkout.

## What it works on

Spoken physics and maths rules that have a formula the library covers. Other statements are listed under each wall
as skipped, with the reason. Open Yale transcripts are timed by chapter, so a rule's minute is estimated from its
word position inside the chapter. Live building runs on Kimi K3.1 Pro on Cerebras during its access period; saved
walls stay open and playable after it.

## Also in this repository

`santa/`: a small OpenClaw agent that finds Christmas gifts in real online shops through their public product
search, opens every product page to confirm it before answering, and a link checker that verifies each result is a
live product page.

## Credits and licence

Lectures: Prof. Ramamurti Shankar, Fundamentals of Physics I (PHYS 200), Open Yale Courses, licensed
[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). Walls built from them carry the same licence
and credit. Code: MIT.
