"""
Zendesk Conversations API proof of concept (Cobalt / Sven live-demo check).

Question it answers: if a conversation is created through the API with the AI agent
put in control, does the Zendesk AI agent actually reply?

Run (Windows PowerShell), no installs needed (standard library only):
    $env:ZD_SUBDOMAIN="your-subdomain"      # the part before .zendesk.com
    $env:ZD_APP_ID="..."                    # Admin Center > Apps and integrations > APIs > Conversations API
    $env:ZD_KEY_ID="app_..."
    $env:ZD_SECRET="..."
    python conversations_poc.py
Optional:
    $env:ZD_MESSAGE="My product feed was rejected. How do I fix it?"
    $env:ZD_RESPONDER_ID="..."   # skip auto-pick and force a specific switchboard integration
    $env:ZD_HANDOFF="1"          # after the reply, pass control to the next responder (human)

Every request and response is printed, so a failure shows exactly which step broke.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

SUB = os.environ.get("ZD_SUBDOMAIN", "").strip()
APP = os.environ.get("ZD_APP_ID", "").strip()
KEY = os.environ.get("ZD_KEY_ID", "").strip()
SECRET = os.environ.get("ZD_SECRET", "").strip()
MSG = os.environ.get("ZD_MESSAGE", "Hi, my product feed was rejected. How do I fix it?")
FORCE_RESPONDER = os.environ.get("ZD_RESPONDER_ID", "").strip()
HANDOFF = os.environ.get("ZD_HANDOFF", "") == "1"

if not all([SUB, APP, KEY, SECRET]):
    sys.exit("Set ZD_SUBDOMAIN, ZD_APP_ID, ZD_KEY_ID and ZD_SECRET first.")

BASE = f"https://{SUB}.zendesk.com/sc/v2/apps/{APP}"
AUTH = "Basic " + base64.b64encode(f"{KEY}:{SECRET}".encode()).decode()


def call(method, path, body=None, step=""):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": AUTH, "Content-Type": "application/json"})
    print(f"\n=== {step}: {method} {path}")
    if body is not None:
        print("body:", json.dumps(body))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read() or b"{}")
            print("status:", r.status)
            return out
    except urllib.error.HTTPError as e:
        print("status:", e.code)
        print(e.read().decode(errors="replace"))
        sys.exit(f"STOPPED at step: {step}")


def text_of(m):
    c = m.get("content", {})
    return c.get("text") or json.dumps(c)[:300]


# 1. Keys work + find the switchboard
sb = call("GET", "/switchboards", step="1 list switchboards (proves keys work)")
boards = sb.get("switchboards", [])
print(json.dumps(boards, indent=2))
if not boards:
    sys.exit("No switchboard found. Is messaging (Web Widget) turned on?")
board = boards[0]

# 2. Find the AI agent's responder ID
si = call("GET", f"/switchboards/{board['id']}/switchboardIntegrations", step="2 list responders")
integrations = si.get("switchboardIntegrations", [])
for i in integrations:
    print(f"  - id={i.get('id')} name={i.get('name')} type={i.get('integrationType')} "
          f"next={i.get('nextSwitchboardIntegrationId')}")
print("  default responder:", board.get("defaultSwitchboardIntegrationId"))
# Prefer the AI agent ("ultimate"); the global default is often the legacy answer bot.
ai_agent = next((i.get("id") for i in integrations if i.get("integrationType") == "ultimate"), None)
responder = FORCE_RESPONDER or ai_agent or board.get("defaultSwitchboardIntegrationId")
print("  using responder:", responder, "(set ZD_RESPONDER_ID to pick another from the list)")

# 3. Create a test customer
ext = "poc-" + uuid.uuid4().hex[:8]
user = call("POST", "/users", {"externalId": ext, "profile": {"givenName": "Poc", "surname": "Tester"}},
            step="3 create user")["user"]
print("  userId:", user["id"])

# 4. Create a conversation with the AI agent in control
convo_body = {"type": "personal", "participants": [{"userId": user["id"]}]}
if responder:
    convo_body["activeSwitchboardIntegrationId"] = responder
convo = call("POST", "/conversations", convo_body, step="4 create conversation")["conversation"]
print("  conversationId:", convo["id"])

# 5. Post a message as the customer
call("POST", f"/conversations/{convo['id']}/messages",
     {"author": {"type": "user", "userId": user["id"]}, "content": {"type": "text", "text": MSG}},
     step="5 post message as customer")
sent_at = time.time()

# 6. Poll for the AI agent's replies until it goes quiet (or 90 seconds)
QUIET = 12  # seconds with no new agent message = the agent has finished its turn
print(f"\n=== 6 waiting for replies (polling every 2s; stops after {QUIET}s of quiet, max 90s)")
seen, first_at, last_at, replies = set(), None, None, []
while time.time() - sent_at < 90:
    msgs = call("GET", f"/conversations/{convo['id']}/messages", step="6 poll").get("messages", [])
    for m in msgs:
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        who = m.get("author", {}).get("type")
        t = time.time() - sent_at
        print(f"  [{t:5.1f}s] {who}: {text_of(m)}")
        if who == "business":
            replies.append((t, text_of(m)))
            first_at = first_at or t
            last_at = t
    if last_at is not None and (time.time() - sent_at) - last_at >= QUIET:
        break
    time.sleep(2)

print("\nRESULT:", "AI AGENT REPLIED" if replies else "NO REPLY in 90s")
if replies:
    print(f"First message after {first_at:.1f}s; final message after {last_at:.1f}s ({len(replies)} messages)")
    print("Final answer:", replies[-1][1])

# 7. Optional: hand off to a human
if HANDOFF:
    call("POST", f"/conversations/{convo['id']}/passControl",
         {"switchboardIntegration": "next", "metadata": {"poc_reason": "handoff test"}},
         step="7 pass control to next responder")
    print("Now check Agent Workspace for a new ticket/conversation from 'Poc Tester'.")
