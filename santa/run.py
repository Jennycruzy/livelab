#!/usr/bin/env python3
"""Run the gift task once through the OpenClaw Gateway in a fresh session, then report each model call's
server decode speed (completion tokens / Cerebras completion time, as recorded on the session's assistant
messages) and the product links the agent returned.

Usage: run.py <label> [message]   (SANTA_AGENT picks the OpenClaw agent, default main)
Prints one JSON line: label, session, per-call [tokens, seconds], mean and p90 tok/s, links, answer text."""
import json, os, re, subprocess, sys, time

label = sys.argv[1]
message = sys.argv[2] if len(sys.argv) > 2 else "Find 5 Christmas gifts for my family from real shops, with product links."
home = os.path.expanduser("~")
agent = os.environ.get("SANTA_AGENT", "main")
key = f"agent:{agent}:{label}-{int(time.time())}"
t0 = time.time()
out = subprocess.run(["node", "openclaw.mjs", "agent", "--agent", agent, "--session-key", key, "-m", message,
                      "--json", "--timeout", "300"], cwd=f"{home}/openclaw", capture_output=True, text=True, timeout=330)
wall = round(time.time() - t0, 1)
res = json.loads(out.stdout)
meta = res["result"]["meta"]["agentMeta"]
text = "\n".join(p.get("text") or "" for p in res["result"]["payloads"])

# Every model call's server timing, from plain and compressed transcript records (calls.mjs).
here = os.path.dirname(os.path.abspath(__file__))
calls = json.loads(subprocess.run(["node", os.path.join(here, "calls.mjs"), agent, meta["sessionId"], "--json"],
                                  capture_output=True, text=True, timeout=60).stdout.strip().splitlines()[-1])
rates = sorted(t / s for t, s in calls)
mean = round(sum(rates) / len(rates), 1) if rates else None
p90 = round(rates[max(0, -(-9 * len(rates) // 10) - 1)], 1) if rates else None
links = sorted(set(re.findall(r"https://[^\s|)\]>]+/products/[^\s|)\]>]+", text)))
print(json.dumps({"label": label, "agent": agent, "session": meta["sessionId"], "calls": calls, "mean": mean, "p90": p90,
                  "wall_s": wall, "turns": meta.get("assistantTurns"), "links": links, "answer": text}))
