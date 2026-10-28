// Serene Desk relay: holds the Zendesk Conversations API keys, exposes /session /message /messages.
const enc = new TextEncoder();
const hits = new Map(); // ponytail: per-isolate in-memory rate limit; use a Durable Object/KV if it must be global

const json = (o, status, cors) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...cors } });
const fail = (status, error, step, cors) => json({ error, step }, status, cors);

async function sign(env, conversationId, userId) {
  const k = await crypto.subtle.importKey("raw", enc.encode(env.SESSION_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(`${conversationId}:${userId}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) { // constant-time compare
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function zd(env, method, path, body, step) {
  const url = `https://${env.ZD_SUBDOMAIN}.zendesk.com/sc/v2/apps/${env.ZD_APP_ID}${path}`;
  const auth = "Basic " + btoa(`${env.ZD_KEY_ID}:${env.ZD_SECRET}`);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, {
      method, headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; } // backoff
    if (!r.ok) throw { status: 502, error: `zendesk ${r.status}`, step };
    return r.json();
  }
  throw { status: 503, error: "zendesk rate limited", step };
}

// AI agent = business author whose source.type is "ultimate"; any other business author is a human.
function normalize(m) {
  const c = m.content || {};
  const role = m.author?.type === "user" ? "user" : m.source?.type === "ultimate" ? "agent" : "human";
  const options = (c.actions || []).filter((a) => a.type === "reply")
    .map((a) => ({ label: a.text, payload: a.payload ?? a.text }));
  return { id: m.id, role, text: c.text || c.altText || "", options, received: m.received };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const ok = origin === env.ALLOWED_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
    const cors = ok ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : {};
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const now = Date.now();
    const h = (hits.get(ip) || []).filter((t) => now - t < 60000);
    h.push(now); hits.set(ip, h);
    if (h.length > 60) return fail(429, "rate limited", "limit", cors);

    const { pathname, searchParams } = new URL(req.url);
    try {
      if (req.method === "POST" && pathname === "/session") {
        const user = (await zd(env, "POST", "/users", { externalId: "web-" + crypto.randomUUID().slice(0, 12) }, "create user")).user;
        const conv = (await zd(env, "POST", "/conversations", {
          type: "personal", participants: [{ userId: user.id }],
          activeSwitchboardIntegrationId: env.ZD_AI_AGENT_INTEGRATION_ID,
        }, "create conversation")).conversation;
        return json({ conversationId: conv.id, userId: user.id, token: await sign(env, conv.id, user.id) }, 200, cors);
      }

      let p = {};
      if (req.method === "POST" && pathname === "/message") p = await req.json().catch(() => ({}));
      else if (req.method === "GET" && pathname === "/messages") p = Object.fromEntries(searchParams);
      else return fail(404, "not found", "route", cors);

      const { conversationId, userId, token } = p;
      if (!conversationId || !userId || !token || !same(token, await sign(env, conversationId, userId)))
        return fail(401, "bad token", "auth", cors);

      if (pathname === "/message") {
        const text = p.label || p.text || p.payload;
        if (typeof text !== "string" || !text || text.length > 2000) return fail(400, "text or payload required", "validate", cors);
        // Chip taps: send the reply's label as the text, carrying the payload alongside.
        const content = { type: "text", text };
        if (p.payload) content.payload = p.payload;
        await zd(env, "POST", `/conversations/${conversationId}/messages`,
          { author: { type: "user", userId }, content }, "post message");
        return json({ ok: true }, 200, cors);
      }

      // ponytail: first page only (100 msgs); follow meta.hasMore if conversations get long
      const list = (await zd(env, "GET", `/conversations/${conversationId}/messages`, null, "list messages")).messages || [];
      const i = p.after ? list.findIndex((m) => m.id === p.after) : -1;
      return json({ messages: list.slice(i + 1).map(normalize) }, 200, cors);
    } catch (e) {
      return fail(e.status || 500, e.error || "internal error", e.step || "unknown", cors); // never log secrets
    }
  },
};
