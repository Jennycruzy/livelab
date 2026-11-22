#!/usr/bin/env python3
"""Wait until Cerebras is quiet: a tiny Kimi call every 5 minutes; exit once the queue is under the threshold twice
in a row. Usage: quiet-wait.py [threshold_seconds=5]. Reads CEREBRAS_API_KEY from the environment."""
import json, os, sys, time, urllib.request
limit = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
key, good = os.environ["CEREBRAS_API_KEY"], 0
while True:
    body = {"model": "moonshotai-kimi-k3.1-pro-trial", "reasoning_effort": "low", "max_completion_tokens": 20,
            "messages": [{"role": "user", "content": "Say ok."}]}
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.cerebras.ai/v1/chat/completions",
            data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + key, "content-type": "application/json"}), timeout=300))
        q = r["time_info"]["queue_time"]
        good = good + 1 if q < limit else 0
        print(time.strftime("%H:%M:%SZ", time.gmtime()), "queue", round(q, 2), "good", good, flush=True)
    except Exception as e:
        good = 0
        print(time.strftime("%H:%M:%SZ", time.gmtime()), "busy", str(e)[:60], flush=True)
    if good >= 2:
        sys.exit(0)
    time.sleep(300)
