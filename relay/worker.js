// Serene Desk relay: holds the Zendesk Conversations API keys, exposes /session /message /messages.
const enc = new TextEncoder();
let sessionHits = []; // ponytail: crude per-isolate cap on POST /session; Cloudflare rate-limiting rules are the upgrade
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
    if (r.status === 429 && i < 3) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; } // backoff
    if (!r.ok) throw { status: 502, error: `zendesk ${r.status}`, step };
    return r.json();
  }
  throw { status: 503, error: "zendesk rate limited", step };
}

// AI agent = business author whose source.type is "ultimate"; any other business author is a human.
function normalize(m) {
  const c = m.content || {};
  const role = m.author?.type === "user" ? "user" : m.source?.type === "ultimate" ? "agent" : "human";
  const options = (Array.isArray(c.actions) ? c.actions : []).filter((a) => a?.type === "reply")
    .map((a) => ({ label: a.text, payload: a.payload ?? a.text }));
  // The AI agent ends answers with a trailing "Sources:" block of lines like " * Title [https://url]".
  const citations = [];
  const t = typeof c.text === "string" ? c.text : "";
  let at = -1;
  for (const k of t.matchAll(/\n[ \t]*Sources?:[ \t]*(?=\n)/gi)) at = k.index; // last heading
  if (at >= 0) {
    const ls = t.slice(at + 1).split("\n").slice(1).filter((l) => l.trim());
    const xs = ls.map((l) => /^\W*(.+?)\s*\[(https?:\/\/[^\]\s]+)\]\s*$/.exec(l));
    if (ls.length && xs.every(Boolean)) for (const x of xs) citations.push({ title: x[1], url: x[2] });
  }
  return { id: m.id, role, text: c.text || c.altText || "", options, received: m.received, citations };
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
    if (h.length >= 150) { hits.set(ip, h); return fail(429, "rate limited", "limit", cors); } // widget polls every 1.5 s
    h.push(now); hits.set(ip, h);
    if (hits.size > 1000) for (const [k, v] of hits) if (now - v[v.length - 1] >= 60000) hits.delete(k);

    const { pathname, searchParams } = new URL(req.url);
    try {
      if (req.method === "POST" && pathname === "/session") {
        sessionHits = sessionHits.filter((t) => now - t < 60000);
        if (sessionHits.length >= 30) return fail(429, "rate limited", "limit", cors);
        sessionHits.push(now);
        const user = (await zd(env, "POST", "/users", { externalId: "web-" + crypto.randomUUID().slice(0, 12) }, "create user")).user;
        const conv = (await zd(env, "POST", "/conversations", {
          type: "personal", participants: [{ userId: user.id }],
          activeSwitchboardIntegrationId: env.ZD_AI_AGENT_INTEGRATION_ID,
        }, "create conversation")).conversation;
        return json({ conversationId: conv.id, userId: user.id, token: await sign(env, conv.id, user.id) }, 200, cors);
      }

      let p = {};
      if (req.method === "POST" && pathname === "/message") {
        p = await req.json().catch(() => null);
        if (!p || typeof p !== "object" || Array.isArray(p)) return fail(400, "json object required", "validate", cors);
      }
      else if (req.method === "GET" && pathname === "/messages") p = Object.fromEntries(searchParams);
      else return fail(404, "not found", "route", cors);

      const { conversationId, userId, token } = p;
      if (!conversationId || !userId || !token || !same(token, await sign(env, conversationId, userId)))
        return fail(401, "bad token", "auth", cors);

      if (pathname === "/message") {
        if (p.payload !== undefined && (typeof p.payload !== "string" || p.payload.length > 2000))
          return fail(400, "bad payload", "validate", cors);
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
      if (p.after && i < 0) return json({ messages: [] }, 200, cors); // unknown cursor: nothing new
      const out = [];
      for (const m of list.slice(i + 1)) { try { out.push(normalize(m)); } catch { /* skip malformed message */ } }
      return json({ messages: out }, 200, cors);
    } catch (e) {
      return fail(e.status || 500, e.error || "internal error", e.step || "unknown", cors); // never log secrets
    }
  },
};
