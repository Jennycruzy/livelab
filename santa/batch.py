#!/usr/bin/env python3
"""Run the gift task repeatedly through the Gateway and append each result to a JSON-lines log.

Usage: batch.py <label> <runs> <pause_seconds> [log_path]
SANTA_AGENTS="main,other" alternates the agent run by run, so variants share the same platform load.
Each line is run.py's output plus the UTC time. Failed runs are logged with their error and the batch goes on."""
import json, os, subprocess, sys, time

label, runs, pause = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
log = sys.argv[4] if len(sys.argv) > 4 else os.path.expanduser("~/runs.jsonl")
here = os.path.dirname(os.path.abspath(__file__))
agents = os.environ.get("SANTA_AGENTS", os.environ.get("SANTA_AGENT", "main")).split(",")
for i in range(runs):
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        agent = agents[i % len(agents)]
        out = subprocess.run([sys.executable, os.path.join(here, "run.py"), f"{label}-{i}"],
                             capture_output=True, text=True, timeout=400, env={**os.environ, "SANTA_AGENT": agent})
        row = json.loads(out.stdout) if out.returncode == 0 and out.stdout.strip() else \
            {"label": f"{label}-{i}", "agent": agent, "error": (out.stderr or out.stdout)[-400:]}
    except Exception as e:  # keep the batch going through timeouts and bad output
        row = {"label": f"{label}-{i}", "error": repr(e)[:400]}
    row["started"] = started
    with open(log, "a") as f:
        f.write(json.dumps(row) + "\n")
    print(row.get("label"), row.get("agent"), row.get("mean"), row.get("error", "")[:80], flush=True)
    if i < runs - 1:
        time.sleep(pause)
