/* Serene Desk chat widget (text). Config: window.SereneWidget, injected from site/data/config.json.
   Voice later: add a mic button in buildUI(), call send({text}) with the transcript, and
   fill in onAgentMessage(m) (called once per new non-user message) to speak it. */
(function () {
  var C = window.SereneWidget || {};
  if (!C.relayUrl) return;
  var KEY = "sd-chat", S = null, seen = {}, lastId = null;
  // a reload starts a fresh conversation (next open calls POST /session); links and the logo keep it
  try { var nav0 = performance.getEntriesByType("navigation")[0]; if (nav0 && nav0.type === "reload") sessionStorage.removeItem(KEY); } catch (e) {}
  var fast = false, fastStart = 0, lastNew = 0, timer = null, open = false, busy = false, backoff = 0, retried = false;
  var el = {};

  function onAgentMessage() {} // voice hook, unused in the text build

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---- safe rendering: text nodes only; links built with createElement ---- */
  var LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g;
  function inline(parent, s) {
    var last = 0, m;
    LINK.lastIndex = 0;
    while ((m = LINK.exec(s))) {
      parent.appendChild(document.createTextNode(s.slice(last, m.index)));
      var a = h("a", "", m[1] || m[3]);
      a.href = m[2] || m[3]; a.target = "_blank"; a.rel = "noopener noreferrer";
      parent.appendChild(a);
      last = LINK.lastIndex;
    }
    parent.appendChild(document.createTextNode(s.slice(last)));
  }
  function body(box, text) {
    text.split(/\n+/).forEach(function (line) {
      if (!line.trim()) return;
      var p = h("p", /^\W*sources?\b/i.test(line) ? "sw-src" : "");
      inline(p, line.trim());
      box.appendChild(p);
    });
  }

  /* ---- UI ---- */
  function buildUI() {
    var root = h("div", "sw");
    el.launch = h("button", "sw-launch"); el.launch.type = "button";
    el.launch.setAttribute("aria-label", "Chat with " + C.agentName);
    var img = h("img"); img.src = C.avatar; img.alt = ""; el.launch.appendChild(img);

    el.panel = h("section", "sw-panel"); el.panel.hidden = true;
    el.panel.setAttribute("role", "dialog");
    el.panel.setAttribute("aria-label", "Chat with " + C.agentName);
    var head = h("div", "sw-head");
    var av = h("img", "sw-av"); av.src = C.avatar; av.alt = "";
    var t = h("div");
    t.appendChild(h("b", "", C.agentName));
    t.appendChild(h("small", "", (C.brandName || "Serene Desk") + " support"));
    var x = h("button", "sw-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close chat");
    head.appendChild(av); head.appendChild(t); head.appendChild(x);

    el.log = h("div", "sw-log");
    el.log.setAttribute("role", "log"); el.log.setAttribute("aria-live", "polite"); el.log.setAttribute("aria-label", "Conversation");
    el.typing = h("div", "sw-typing"); el.typing.hidden = true;
    for (var i = 0; i < 3; i++) el.typing.appendChild(h("i"));
    el.typing.appendChild(h("span", "vh", C.agentName + " is typing"));

    var form = h("form", "sw-form");
    el.input = h("input", "sw-in"); el.input.type = "text"; el.input.placeholder = "Type a message…";
    el.input.setAttribute("aria-label", "Message"); el.input.autocomplete = "off"; el.input.maxLength = 2000;
    el.send = h("button", "sw-send", "Send"); el.send.type = "submit";
    form.appendChild(el.input); form.appendChild(el.send);

    el.panel.appendChild(head); el.panel.appendChild(el.log); el.panel.appendChild(el.typing); el.panel.appendChild(form);
    root.appendChild(el.panel); root.appendChild(el.launch);
    document.body.appendChild(root);

    el.launch.addEventListener("click", openPanel);
    x.addEventListener("click", closePanel);
    el.panel.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = el.input.value.trim();
      if (v) { el.input.value = ""; send({ text: v }); }
    });
  }

  function scroll() { el.log.scrollTop = el.log.scrollHeight; }
  function note(msg) {
    var old = el.log.querySelector(".sw-note"); if (old) old.remove();
    if (msg) { el.log.appendChild(h("div", "sw-note", msg)); scroll(); }
  }
  function disableChips() {
    el.log.querySelectorAll(".sw-chip").forEach(function (b) { b.disabled = true; });
  }

  function addMsg(m) {
    disableChips(); // chips only apply to the latest message
    var box = h("div", "sw-m " + (m.role === "user" ? "sw-me" : "sw-bot"));
    if (m.role === "human") box.appendChild(h("span", "sw-who", "Serene Desk team"));
    var cites = (m.citations || []).filter(function (c) { return c && /^https?:\/\//i.test(c.url); });
    var txt = m.text || "", at = cites.length ? txt.search(/\n\s*Sources?:/i) : -1;
    body(box, at >= 0 ? txt.slice(0, at) : txt); // the relay lifted the "Sources:" block into citations
    if (cites.length) {
      var src = h("p", "sw-src", "Sources: ");
      cites.forEach(function (c, i) {
        if (i) src.appendChild(document.createTextNode(" · "));
        var a = h("a", "", c.title || c.url); a.href = c.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        src.appendChild(a);
      });
      box.appendChild(src);
    }
    if (m.pending) box.classList.add("pending");
    if (m.options && m.options.length) {
      var row = h("div", "sw-chips");
      m.options.forEach(function (o) {
        var b = h("button", "sw-chip", o.label); b.type = "button";
        b.addEventListener("click", function () { disableChips(); send({ label: o.label, payload: o.payload }); });
        row.appendChild(b);
      });
      box.appendChild(row);
    }
    el.log.appendChild(box); scroll();
    return box;
  }

  /* ---- relay ---- */
  function call(method, path, data) {
    var url = C.relayUrl + path, opt = { method: method };
    if (method === "POST") { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(data || {}); }
    else url += "?" + new URLSearchParams(data).toString();
    return fetch(url, opt).then(function (r) {
      if (!r.ok) { var e = new Error("http"); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function auth(extra) {
    var o = { conversationId: S.conversationId, userId: S.userId, token: S.token };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  var pending = null; // in-flight session setup, shared so open + send never create two sessions
  function ensureSession() {
    if (S) return Promise.resolve();
    if (!pending) pending = setup().then(function () { pending = null; }, function (e) { pending = null; throw e; });
    return pending;
  }
  function setup() {
    try { S = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { S = null; }
    if (S && S.token) return poll(true); // re-render history
    S = null;
    return newSession();
  }
  function newSession() {
    return call("POST", "/session").then(function (s) { S = s; retried = false; save(); });
  }

  function fail(e, again) {
    if (e.status === 401 && !retried) { // stale session: start fresh once
      retried = true; S = null; seen = {}; lastId = null; el.log.textContent = "";
      try { sessionStorage.removeItem(KEY); } catch (x) {}
      return newSession().then(again).catch(function () { note("Could not start a new chat. Please try again later."); });
    }
    if (e.status === 429) { backoff = Math.min((backoff || 2000) * 2, 60000); note("Busy right now. Retrying shortly."); return; }
    note("Connection problem. Please try again.");
  }

  function send(p) {
    if (busy) return;
    busy = true; el.send.disabled = true;
    var tmp = addMsg({ role: "user", text: p.label || p.text, pending: true });
    tmp.dataset.opt = "1"; // marked at creation so an early polled echo reconciles
    note("");
    ensureSession().then(function () {
      return call("POST", "/message", auth(p));
    }).then(function () {
      tmp.classList.remove("pending");
      startFast();
    }).catch(function (e) {
      tmp.remove();
      if (p.text && e.status !== 401 && !el.input.value) el.input.value = p.text;
      fail(e, function () { busy = false; el.send.disabled = false; send(p); });
    }).then(function () { busy = false; el.send.disabled = false; });
  }

  /* ---- polling ---- */
  function startFast() {
    fastStart = lastNew = Date.now(); fast = true;
    el.typing.hidden = false; scroll(); schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!open || !S) return;
    timer = setTimeout(function () { poll(false); }, backoff || (fast ? C.pollFastMs : C.pollIdleMs));
  }
  function poll(initial) {
    var q = {}; if (lastId) q.after = lastId;
    return call("GET", "/messages", auth(q)).then(function (r) {
      backoff = 0;
      var got = 0;
      (r.messages || []).forEach(function (m) {
        if (seen[m.id]) return;
        seen[m.id] = 1; lastId = m.id;
        if (m.role === "user") { // server echo replaces the optimistic copy
          var o = el.log.querySelector('.sw-me[data-opt="1"]');
          if (o) { delete o.dataset.opt; return; }
        } else got++;
        addMsg(m);
        if (m.role !== "user") onAgentMessage(m);
      });
      var n = Date.now();
      if (got) { lastNew = n; el.typing.hidden = !fast; note(""); }
      if (fast && (n - lastNew > C.quietMs || n - fastStart > 90000)) { fast = false; el.typing.hidden = true; }
      schedule();
    }).catch(function (e) {
      if (initial || e.status === 401) return fail(e, function () { return poll(true); });
      if (e.status === 429) backoff = Math.min((backoff || 2000) * 2, 60000);
      schedule();
    });
  }

  /* ---- open / close ---- */
  function openPanel() {
    open = true; el.panel.hidden = false; el.launch.hidden = true;
    ensureSession().then(schedule).catch(function (e) { fail(e, openPanel); });
    el.input.focus();
  }
  function closePanel() {
    open = false; clearTimeout(timer);
    el.panel.hidden = true; el.launch.hidden = false; el.launch.focus();
  }

  buildUI();
})();
