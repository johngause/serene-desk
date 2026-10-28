# Test runner

Plays customer questions against the Zendesk AI agent through the Conversations API (not the relay). It records answers and timing; it does not score.

```
pip install -r requirements.txt
python runner.py --csv tests.sample.csv --dry-run
python runner.py --csv tests.csv --label baseline --set main --concurrency 2
```

Config comes from the repo-root `.env` (`ZD_SUBDOMAIN`, `ZD_APP_ID`, `ZD_KEY_ID`, `ZD_SECRET`, `ZD_AI_AGENT_INTEGRATION_ID`); real environment variables override it.

Flags: `--csv` (default `tests.csv`), `--label`, `--set main|holdout|all`, `--only id1,id2`, `--concurrency` (default 2), `--dry-run` (validate CSV and config, no API calls).

CSV columns: `id, category, turns, expected, source, set`. Separate multiple customer turns with `||`.

Each turn is sent after the agent has been quiet for 12 s (capped at 120 s per turn). Output goes to `runs/<label>-<YYYYMMDD-HHMM>.jsonl` (all messages with timestamps) and `.csv` (final answer, first/final reply seconds from conversation start, handoff flag). Handoff is true when the conversation's active responder is no longer the AI agent. Running the file also self-checks the turn parser.

Latency: `first_reply_s` is from the first customer message to the first agent reply (often a "one moment" stall); `final_reply_s` is from the last customer message to the last agent reply. Both use Zendesk receive times. The greeting is recorded but never timed.
