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

  /* ---- voice (Web Speech API, Chrome). Ideas from MIT voice-chat demos (see commit); code is original.
     Echo strategy: recognition stays on while speaking so the user can barge in; results whose words
     all occur in the text being spoken are treated as echo and ignored. ---- */
  var SR = window.webkitSpeechRecognition || window.SpeechRecognition, TTS = window.speechSynthesis;
  var voiceOn = false, rec = null, recRun = false, speaking = false, queue = [], cur = "", curUtt = null;
  var fillerT = null, restartT = null, fails = 0, recent = "", endAt = 0, awaiting = false, voices = [], voiceName = "", VKEY = "sd-voice";
  try { voiceName = localStorage.getItem(VKEY) || ""; } catch (e) {}
  function status(t) { if (el.status) el.status.textContent = t; }
  function words(t) { return (t.toLowerCase().match(/[a-z0-9']+/g) || []); }
  function pickVoice() {
    var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
    var by = function (f) { return en.filter(f)[0]; };
    return by(function (v) { return voiceName && v.name === voiceName; }) ||
      by(function (v) { return /Online \(Natural\)/i.test(v.name) && /en-US/i.test(v.lang); }) ||
      by(function (v) { return /Google US English/i.test(v.name); }) ||
      by(function (v) { return /en-US/i.test(v.lang); }) || en[0] || null;
  }
  function loadVoices() {
    if (!TTS) return;
    voices = TTS.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    if (!el.voiceSel) return;
    el.voiceSel.textContent = "";
    var pv = pickVoice();
    voices.forEach(function (v) {
      var o = h("option", "", v.name + " (" + v.lang + ")"); o.value = v.name;
      if (pv && pv.name === v.name) o.selected = true;
      el.voiceSel.appendChild(o);
    });
  }
  function speakText(t) { // Chrome cuts long utterances (~15 s): queue by sentence
    (t.match(/[^.!?\n]+[.!?]*/g) || []).forEach(function (x) { x = x.trim(); if (/\w/.test(x)) queue.push(x); });
    next();
  }
  function next() {
    if (!voiceOn || speaking) return;
    if (!queue.length) { status("Listening"); return; }
    cur = queue.shift(); speaking = true; status("Speaking");
    var u = new SpeechSynthesisUtterance(cur), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    var done = function () { if (curUtt !== u) return; curUtt = null; speaking = false; recent = cur; endAt = Date.now(); cur = ""; next(); };
    u.onend = done; u.onerror = done;
    curUtt = u; // keep a reference: Chrome can garbage-collect a playing utterance
    TTS.speak(u);
  }
  function stopSpeech() {
    queue = []; curUtt = null; speaking = false; cur = "";
    if (TTS) TTS.cancel();
    if (voiceOn) status("Listening");
  }
  function speechText(m) {
    var t = (m.text || "").replace(/\n[ \t]*Sources?:[\s\S]*$/i, "")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*/g, "").replace(/^\s*[*-]\s+/gm, "");
    return t.trim();
  }
  function startRec() {
    if (!voiceOn || recRun || !open) return;
    try { rec.start(); recRun = true; status(speaking ? "Speaking" : "Listening"); } catch (e) {}
  }
  function voiceOff(msg) {
    voiceOn = false; awaiting = false; clearTimeout(fillerT); clearTimeout(restartT); fails = 0; stopSpeech();
    if (rec) { try { rec.abort(); } catch (e) {} }
    recRun = false; el.input.value = ""; el.mic.setAttribute("aria-pressed", "false");
    el.mic.setAttribute("aria-label", "Turn on voice"); el.panel.classList.remove("sw-voice");
    status(msg || "Voice off");
  }
  function voiceStart() {
    voiceOn = true; el.mic.setAttribute("aria-pressed", "true"); el.mic.setAttribute("aria-label", "Turn off voice");
    el.panel.classList.add("sw-voice"); startRec();
  }
  function initVoice() {
    rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = function (e) {
      var fin = "", itm = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else itm += r[0].transcript;
      }
      var heard = (fin || itm).trim(); if (!heard) return;
      fails = 0;
      if (speaking || Date.now() - endAt < 400) { // echo filter stays on ~400 ms after speech ends
        var spoken = " " + words(cur + " " + queue.join(" ") + " " + recent).join(" ") + " ";
        if (words(heard).every(function (w) { return spoken.indexOf(" " + w + " ") >= 0; })) return; // echo of our own voice
        if (speaking) stopSpeech(); // barge-in
      }
      if (!fin) { el.input.value = heard; return; }
      el.input.value = "";
      awaiting = true; clearTimeout(fillerT);
      fillerT = setTimeout(function () { // filler once, only if no reply yet
        if (awaiting && voiceOn && C.voiceFiller) { awaiting = false; speakText(C.voiceFiller); }
      }, 2500);
      send({ text: heard.trim() });
    };
    rec.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") voiceOff("Microphone access is blocked");
      else if (e.error !== "no-speech" && e.error !== "aborted") fails++; // network, audio-capture, ...
    };
    rec.onend = function () { // Chrome ends recognition on silence: restart while voice is on
      recRun = false;
      if (!voiceOn) return;
      if (fails >= 3) return voiceOff("Voice unavailable");
      clearTimeout(restartT); restartT = setTimeout(startRec, [250, 1000, 3000][fails] || 250);
    };
  }
  function onAgentMessage(m) {
    if (!voiceOn) return;
    awaiting = false; clearTimeout(fillerT);
    var low = (m.text || "").toLowerCase();
    if ((C.voiceSkipPatterns || []).some(function (p) { return p && low.indexOf(String(p).toLowerCase()) >= 0; })) return;
    var t = speechText(m); if (t) speakText(t);
  }

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
  function bold(parent, s) { // **bold** as <strong>, rest autolinked; text nodes only
    s.split(/(\*\*[^*]+\*\*)/).forEach(function (t, i) {
      if (i % 2) parent.appendChild(h("strong", "", t.slice(2, -2))); else inline(parent, t);
    });
  }
  function body(box, text) {
    var ul = null;
    text.split(/\n+/).forEach(function (line) {
      if (!line.trim()) return;
      var li = /^\s*[*-]\s+(.*)$/.exec(line);
      if (li) {
        if (!ul) { ul = h("ul", "sw-ul"); box.appendChild(ul); }
        bold(ul.appendChild(h("li")), li[1].trim()); return;
      }
      ul = null;
      var p = h("p", /^\W*sources?\b/i.test(line) ? "sw-src" : "");
      bold(p, line.trim());
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
    head.appendChild(av); head.appendChild(t);
    if (TTS) {
      el.gear = h("button", "sw-x sw-gear", "\u2699"); el.gear.type = "button";
      el.gear.setAttribute("aria-label", "Voice settings"); el.gear.setAttribute("aria-expanded", "false");
      head.appendChild(el.gear);
      el.menu = h("div", "sw-menu"); el.menu.hidden = true;
      var lab = h("label", "", "Voice"); el.voiceSel = h("select"); lab.appendChild(el.voiceSel);
      el.menu.appendChild(lab);
      el.voiceSel.addEventListener("change", function () {
        voiceName = el.voiceSel.value;
        try { localStorage.setItem(VKEY, voiceName); } catch (e) {}
      });
      el.gear.addEventListener("click", function () {
        el.menu.hidden = !el.menu.hidden; el.gear.setAttribute("aria-expanded", String(!el.menu.hidden));
        if (!el.menu.hidden) loadVoices();
      });
    }
    head.appendChild(x);

    el.log = h("div", "sw-log");
    el.log.setAttribute("role", "log"); el.log.setAttribute("aria-live", "polite"); el.log.setAttribute("aria-label", "Conversation");
    el.typing = h("div", "sw-typing"); el.typing.hidden = true;
    for (var i = 0; i < 3; i++) el.typing.appendChild(h("i"));
    el.typing.appendChild(h("span", "vh", C.agentName + " is typing"));

    var form = h("form", "sw-form");
    el.input = h("input", "sw-in"); el.input.type = "text"; el.input.placeholder = "Type a message…";
    el.input.setAttribute("aria-label", "Message"); el.input.autocomplete = "off"; el.input.maxLength = 2000;
    el.send = h("button", "sw-send", "Send"); el.send.type = "submit";
    if (SR && TTS) {
      el.mic = h("button", "sw-mic"); el.mic.type = "button";
      el.mic.setAttribute("aria-pressed", "false"); el.mic.setAttribute("aria-label", "Turn on voice");
      el.mic.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12z"/></svg>';
      el.status = h("span", "vh"); el.status.setAttribute("role", "status");
      form.appendChild(el.mic); form.appendChild(el.status);
      initVoice();
      el.mic.addEventListener("click", function () {
        if (!voiceOn) voiceStart();
        else if (speaking || queue.length) stopSpeech(); // barge-in: stop playback, keep listening
        else voiceOff();
      });
    }
    form.appendChild(el.input); form.appendChild(el.send);

    el.panel.appendChild(head); if (el.menu) el.panel.appendChild(el.menu); el.panel.appendChild(el.log); el.panel.appendChild(el.typing); el.panel.appendChild(form);
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
    var txt = m.text || "", at = -1;
    if (cites.length) txt.replace(/\n[ \t]*Sources?:[ \t]*(?=\n)/gi, function (x, i) { at = i; return x; }); // last heading: the relay validated the block after it
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
    if (voiceOn) voiceOff();
    open = false; clearTimeout(timer);
    el.panel.hidden = true; el.launch.hidden = false; el.launch.focus();
  }

  buildUI();
  if (TTS) { TTS.addEventListener("voiceschanged", loadVoices); loadVoices(); }
})();
