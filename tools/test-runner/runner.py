#!/usr/bin/env python3
"""Serene Desk test runner: plays tests.csv against the Zendesk AI agent (no scoring). See README.md."""
import argparse, base64, csv, json, os, sys, threading, time, urllib.error, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

QUIET, MAX_WAIT, POLL = 12, 120, 2  # s of agent silence ends a turn; cap per turn; poll interval
GREETING_WAIT = 8  # s to wait for the greeting before the first turn
HERE = Path(__file__).parent
COLS = {"id", "category", "turns", "expected", "source", "set"}


def parse_turns(s):
    """'a || b' -> ['a', 'b'] (blank parts dropped)."""
    return [t.strip() for t in s.split("||") if t.strip()]


def read_tests(path, which="all", only=None):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit(f"{path}: no rows")
    missing = COLS - set(rows[0])
    if missing:
        sys.exit(f"{path}: missing columns {sorted(missing)}")
    for i, r in enumerate(rows, 2):
        bad = [c for c in COLS if r.get(c) is None]  # short row -> DictReader gives None
        if bad:
            sys.exit(f"{path} line {i}: missing field(s) {sorted(bad)}")
        r["turns"] = parse_turns(r["turns"])
        if not r["id"].strip() or not r["turns"]:
            sys.exit(f"{path} line {i}: needs an id and at least one turn")
    if len({r["id"] for r in rows}) != len(rows):
        sys.exit(f"{path}: duplicate test ids")
    if which != "all":
        rows = [r for r in rows if r["set"].strip() == which]
    if only:
        unknown = set(only) - {r["id"] for r in rows}
        if unknown:
            sys.exit(f"--only ids not found (in this set): {sorted(unknown)}")
        rows = [r for r in rows if r["id"] in only]
    return rows


class Zd:
    def __init__(self, sub, app, key, secret):
        self.base = f"https://{sub}.zendesk.com/sc/v2/apps/{app}"
        self.auth = "Basic " + base64.b64encode(f"{key}:{secret}".encode()).decode()

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(6):
            req = urllib.request.Request(self.base + path, data=data, method=method,
                                         headers={"Authorization": self.auth, "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 5:  # back off, honour Retry-After
                    time.sleep(float(e.headers.get("Retry-After") or 2 ** (attempt + 1)))
                    continue
                raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
            except urllib.error.URLError as e:
                if attempt < 5:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"{method} {path} -> {e.reason}")


def text_of(m):
    c = m.get("content", {})
    return c.get("text") or json.dumps(c)[:500]


def stamp(m, t0):
    """Seconds since t0 from Zendesk's own receive time, so polling lag doesn't skew latency."""
    try:
        return round(datetime.fromisoformat(m["received"].replace("Z", "+00:00")).timestamp() - t0, 2)
    except (KeyError, ValueError):
        return round(time.time() - t0, 2)


def handed_off(zd, cid, responder):
    """Control passed on = the active switchboard integration is no longer the AI agent.
    Verified live: GET /conversations/{id} has `activeSwitchboardIntegration` {id,name,integrationType};
    its id equals ZD_AI_AGENT_INTEGRATION_ID until a handoff, then becomes e.g. zd:agentWorkspace.
    Fallback if the field is absent: any business message whose source.type isn't "ultimate"."""
    asi = zd.call("GET", f"/conversations/{cid}").get("conversation", {}).get("activeSwitchboardIntegration")
    if asi:
        return asi.get("id") != responder
    return any(m.get("author", {}).get("type") == "business" and m.get("source", {}).get("type") != "ultimate"
               for m in list_messages(zd, cid))


def list_messages(zd, cid):
    """All messages, following meta.hasMore with the `after` cursor (last message id)."""
    out, after = [], None
    while True:
        r = zd.call("GET", f"/conversations/{cid}/messages" + (f"?after={after}" if after else ""))
        page = r.get("messages", [])
        out += page
        if not page or not r.get("meta", {}).get("hasMore"):
            return out
        after = page[-1]["id"]


def run_test(zd, test, responder):
    user = zd.call("POST", "/users", {"externalId": "test-" + uuid.uuid4().hex[:10],
                                      "profile": {"givenName": "Test", "surname": "Runner"}})["user"]
    cid = zd.call("POST", "/conversations", {"type": "personal", "participants": [{"userId": user["id"]}],
                                             "activeSwitchboardIntegrationId": responder})["conversation"]["id"]
    t0 = time.time()
    seen, msgs, handoff = set(), [], False
    # Let the AI agent's greeting land first, like a real visitor, so it isn't timed as a reply.
    while time.time() - t0 < GREETING_WAIT:
        time.sleep(POLL)
        new = [m for m in list_messages(zd, cid) if m["id"] not in seen]
        for m in new:
            seen.add(m["id"])
            msgs.append({"t": stamp(m, t0), "author": m.get("author", {}).get("type"),
                         "text": text_of(m), "id": m["id"], "greeting": True})
        if new:
            break
    for turn in test["turns"]:
        sent = time.time()
        zd.call("POST", f"/conversations/{cid}/messages",
                {"author": {"type": "user", "userId": user["id"]}, "content": {"type": "text", "text": turn}})
        last_agent = None
        while time.time() - sent < MAX_WAIT:
            time.sleep(POLL)
            for m in list_messages(zd, cid):
                if m["id"] in seen:
                    continue
                seen.add(m["id"])
                who = m.get("author", {}).get("type")
                msgs.append({"t": stamp(m, t0), "author": who, "text": text_of(m), "id": m["id"]})
                if who == "business":
                    last_agent = time.time()
            if last_agent and time.time() - last_agent >= QUIET:
                break
            if handed_off(zd, cid, responder):
                break
        handoff = handed_off(zd, cid, responder)
        if handoff:
            break  # a human owns it now; the AI agent won't answer further turns
    agent = [m for m in msgs if m["author"] == "business" and not m.get("greeting")]
    users = [m["t"] for m in msgs if m["author"] == "user"]
    first = [m for m in agent if users and m["t"] >= users[0]]
    last = [m for m in agent if users and m["t"] >= users[-1]]
    return {"id": test["id"], "category": test["category"], "set": test["set"], "conversation_id": cid,
            "turns": test["turns"], "messages": msgs, "handoff": handoff,
            # seconds from sending the first turn to its first reply, and from the last turn to the final reply
            "first_reply_s": round(first[0]["t"] - users[0], 2) if first else None,
            "final_reply_s": round(last[-1]["t"] - users[-1], 2) if last else None,
            "final_answer": agent[-1]["text"] if agent else ""}


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default="tests.csv")
    ap.add_argument("--label", default="run")
    ap.add_argument("--set", dest="which", choices=["main", "holdout", "all"], default="all")
    ap.add_argument("--only", help="comma-separated test ids")
    ap.add_argument("--concurrency", type=int, default=2)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    load_dotenv(HERE / ".env")
    load_dotenv(HERE.parent.parent / ".env")  # real env vars win (override=False)
    keys = ["ZD_SUBDOMAIN", "ZD_APP_ID", "ZD_KEY_ID", "ZD_SECRET", "ZD_AI_AGENT_INTEGRATION_ID"]
    cfg = {k: os.environ.get(k, "").strip() for k in keys}
    missing = [k for k, v in cfg.items() if not v]
    if missing:
        sys.exit(f"Missing config in .env: {', '.join(missing)}")
    tests = read_tests(a.csv, a.which, [x.strip() for x in a.only.split(",") if x.strip()] if a.only else None)
    if not tests:
        sys.exit("No tests selected.")

    print(f"Plan: {len(tests)} test(s) from {a.csv}, set={a.which}, concurrency={a.concurrency}, label={a.label}")
    for t in tests:
        print(f"  {t['id']:<8} [{t['set']}] {t['category']:<10} {len(t['turns'])} turn(s): {t['turns'][0][:60]}")
    if a.dry_run:
        print("Dry run: CSV and config OK, no API calls made.")
        return

    zd = Zd(cfg["ZD_SUBDOMAIN"], cfg["ZD_APP_ID"], cfg["ZD_KEY_ID"], cfg["ZD_SECRET"])
    try:
        zd.call("GET", "/switchboards")
    except RuntimeError as e:
        sys.exit(f"Credential check failed, nothing was run.\n{e}\nCheck ZD_SUBDOMAIN, ZD_APP_ID, ZD_KEY_ID, ZD_SECRET.")
    responder = cfg["ZD_AI_AGENT_INTEGRATION_ID"]

    out = HERE / "runs"
    out.mkdir(exist_ok=True)
    stem = out / f"{a.label}-{datetime.now():%Y%m%d-%H%M%S}"
    lock, results = threading.Lock(), []

    def work(t):
        try:
            r = run_test(zd, t, responder)
        except Exception as e:  # keep the batch going; record the failure
            r = {"id": t["id"], "category": t["category"], "set": t["set"], "turns": t["turns"], "messages": [],
                 "handoff": False, "conversation_id": "", "first_reply_s": None, "final_reply_s": None,
                 "final_answer": "", "error": str(e)}
        with lock:
            results.append(r)
            with open(f"{stem}.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(f"  done {r['id']}: first={r['first_reply_s']}s final={r['final_reply_s']}s "
                  f"handoff={r['handoff']}" + (f" ERROR {r['error']}" if "error" in r else ""), flush=True)

    with ThreadPoolExecutor(max(1, a.concurrency)) as ex:
        list(ex.map(work, tests))
    order = {t["id"]: i for i, t in enumerate(tests)}
    results.sort(key=lambda r: order[r["id"]])

    cols = ["id", "category", "set", "final_answer", "first_reply_s", "final_reply_s", "handoff", "conversation_id", "error"]
    with open(f"{stem}.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(results)
    print(f"Wrote {stem}.jsonl and {stem}.csv")


if __name__ == "__main__":
    assert parse_turns("a||b") == ["a", "b"] and parse_turns(" a  ") == ["a"] and parse_turns("a|| ||b") == ["a", "b"]
    main()
