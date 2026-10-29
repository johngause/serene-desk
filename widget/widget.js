/* Serene Desk chat widget (text). Config: window.SereneWidget, injected from site/data/config.json.
   Voice later: add a mic button in buildUI(), call send({text}) with the transcript, and
   fill in onAgentMessage(m) (called once per new non-user message) to speak it. */
(function () {
  var C = window.SereneWidget || {};
  if (!C.relayUrl) return;
  var KEY = "sd-chat", S = null, seen = {}, lastId = null;
  // a reload starts a fresh conversation (next open calls POST /session); links and the logo keep it
  try { var nav0 = performance.getEntriesByType("navigation")[0]; if (nav0 && nav0.type === "reload") { sessionStorage.removeItem(KEY); sessionStorage.removeItem("sd-tab"); } } catch (e) {}
  var fast = false, fastStart = 0, lastNew = 0, timer = null, open = false, busy = false, backoff = 0, retried = false;
  var el = {};

  /* ---- voice (Web Speech API, Chrome). Ideas from MIT voice-chat demos (see commit); code is original.
     Always half-duplex (speakers): recognition is off while Wren speaks (+ TAIL) and results in that window are dropped.
     Chat tab = silent text; Voice tab = ring + hands-free. The mic button there only mutes; Stop is the only interrupt. ---- */
  var SR = window.webkitSpeechRecognition || window.SpeechRecognition, TTS = window.speechSynthesis;
  var voiceOn = false, rec = null, recRun = false, speaking = false, queue = [], cur = "", curUtt = null;
  var fillerT = null, restartT = null, fails = 0, recent = "", endAt = 0, awaiting = false, voices = [], voiceName = "", VKEY = "sd-voice";
  // half-duplex: no recognition while Wren speaks (+ TAIL after).
  var TAIL = 600, muted = false, TABK = "sd-tab";
  var echoT = null, echoFor = "", held = [], hush = false, awaitEcho = false, thinking = false, quiet = false, polled = false;
  try { voiceName = localStorage.getItem(VKEY) || ""; } catch (e) {}
  function lab() { return speaking ? (C.agentName || "Wren") + " is speaking" : thinking ? "Thinking" : muted ? (C.agentName || "Wren") + " can't hear you" : "Listening"; }
  function status(t) {
    if (el.status) el.status.textContent = t;
    if (el.vlabel) { el.vlabel.textContent = t; el.viz.dataset.s = speaking ? "speaking" : thinking ? "thinking" : muted ? "muted" : "listening"; }
    if (el.stop) el.stop.hidden = !(speaking || queue.length > 0);
    if (voiceOn && REDUCED && vizOn) vizDraw(0, 0, true);
  }
  function blocked() { return (speaking || queue.length > 0 || Date.now() - endAt < TAIL); }
  function interrupt() { // stops everything; later agent/human messages stay visible but are not spoken until the next send
    hush = true; thinking = false; awaiting = false; clearTimeout(fillerT);
    stopSpeech(); endAt = 0; startRec();
  }

  /* ---- ring visualizer (canvas). Geometry and animation feel follow the ring visualizer mockup, recoloured to the
     site palette. speechSynthesis audio can't be analysed, so amplitude is faked: syllable pulses while speaking,
     kicked by utterance start/boundary events. Idle = slow breathing. rAF runs only while the voice view is up. ---- */
  var REDUCED = false; try { REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var vizOn = false, raf = 0, vLast = 0, vW = 0, vH = 0, ctx = null, VN = 64, BARS = 112;
  var spec = new Float32Array(VN), vamp = 0, venergy = 0, sylT = 0, sylLen = 0.2, sgap = 0, f1 = 10, f2 = 26, kick = 0, sparks = [], COL = null;
  function hex(v, d) { var n = parseInt(String(v || d).replace("#", ""), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
  function tok() {
    var cs = getComputedStyle(document.documentElement), g = function (n, d) { return hex(cs.getPropertyValue(n).trim(), d); };
    COL = { lamp: g("--lamp", "F3C26B"), sage: g("--sage", "9DB4A3"), mist: g("--mist", "E3E7EA"), oak: g("--oak", "C99A68"), slate: g("--slate", "28323E"), deep: g("--deep", "171D25"), line: g("--line", "3A4756") };
  }
  function vizKick(k) { kick = Math.max(kick, k); sylT = 1e9; } // new syllable on the next frame
  function vizVoice(dt, t) {
    var a = 0;
    if (speaking) {
      sylT += dt;
      if (sylT > sylLen + sgap) {
        sylT = 0; sylLen = 0.14 + Math.random() * 0.12;
        var r = Math.random();
        sgap = r < 0.12 ? 0.35 + Math.random() * 0.3 : r < 0.35 ? 0.08 + Math.random() * 0.1 : 0.02;
        f1 = 6 + Math.random() * 10; f2 = 20 + Math.random() * 16;
      }
      if (sylT < sylLen) a = Math.sin(Math.PI * sylT / sylLen) * (0.65 + 0.35 * Math.random());
      a = Math.max(a, kick * 0.9);
    }
    kick *= Math.exp(-dt * 7);
    for (var i = 0; i < VN; i++) {
      var v = 0.004 * Math.random();
      if (a > 0) {
        var base = Math.exp(-i / 22) * 0.6;
        var m1 = Math.exp(-Math.pow(i - f1 - Math.sin(t * 3) * 2, 2) / 18);
        var m2 = 0.6 * Math.exp(-Math.pow(i - f2 - Math.sin(t * 2.3) * 3, 2) / 30);
        v += a * (base + m1 + m2) * (0.8 + 0.4 * Math.random());
      }
      v = Math.min(1, v);
      spec[i] += (v - spec[i]) * (v > spec[i] ? 0.55 : 0.09);
    }
    vamp += (a - vamp) * (a > vamp ? 0.5 : 0.07);
  }
  function vizDraw(t, dt, still) {
    if (!ctx || !COL) return;
    if (still) { // reduced motion: one static frame per state, opacity changes in CSS
      for (var k = 0; k < VN; k++) spec[k] = speaking ? 0.4 * Math.exp(-k / 30) : 0;
      vamp = speaking ? 0.3 : 0; venergy = speaking ? 1 : 0; sparks = [];
    } else {
      vizVoice(dt, t);
      venergy += ((speaking ? 1 : 0) - venergy) * 0.04;
    }
    var cx = vW / 2, cy = vH * 0.45, R0 = Math.min(vW, vH) * 0.19 * (1 + vamp * 0.06 + (still ? 0 : 0.015 * Math.sin(t * 1.1)));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(COL.slate, still ? 1 : 0.35); ctx.fillRect(0, 0, vW, vH); // slight trail
    ctx.globalCompositeOperation = "lighter";
    var bA = 0.07 + venergy * 0.12 + vamp * 0.25;
    var bloom = ctx.createRadialGradient(cx, cy, R0 * 0.4, cx, cy, R0 * (2.6 + vamp));
    bloom.addColorStop(0, rgba(COL.lamp, bA)); bloom.addColorStop(0.5, rgba(COL.oak, bA * 0.4)); bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, vW, vH);
    var rot = still ? 0 : t * (0.08 + venergy * 0.05), strong = [], br = thinking ? 2.4 : 1.3;
    ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, (Math.PI * 2 * R0 / BARS) * 0.45);
    for (var b = 0; b < BARS; b++) {
      var frac = b / BARS, ang = frac * Math.PI * 2 + rot - Math.PI / 2;
      var fold = frac < 0.5 ? frac * 2 : (1 - frac) * 2, band = Math.min(VN - 1, Math.floor(fold * VN * 0.85));
      var breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * br - frac * Math.PI * 6);
      var len = 2 + breath * 4 + spec[band] * R0 * 1.3 * venergy, r1 = R0 + 8, r2 = r1 + len;
      var c = mix(mix(COL.lamp, COL.sage, fold), COL.mist, Math.min(1, spec[band] * 0.3)), cs = Math.cos(ang), sn = Math.sin(ang);
      ctx.strokeStyle = rgba(c, 0.4 + venergy * 0.15 + spec[band] * 0.2);
      ctx.beginPath(); ctx.moveTo(cx + cs * r1, cy + sn * r1); ctx.lineTo(cx + cs * r2, cy + sn * r2); ctx.stroke();
      if (spec[band] > 0.55 && venergy > 0.5) strong.push([cs, sn, r2, c]);
    }
    if (!still) {
      strong.forEach(function (s) {
        if (Math.random() < 0.06 && sparks.length < 160)
          sparks.push({ x: cx + s[0] * s[2], y: cy + s[1] * s[2], vx: s[0] * (60 + Math.random() * 90), vy: s[1] * (60 + Math.random() * 90), life: 1, c: s[3] });
      });
      for (var i = sparks.length - 1; i >= 0; i--) {
        var p = sparks[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = rgba(p.c, p.life); ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    var disc = ctx.createRadialGradient(cx - R0 * 0.3, cy - R0 * 0.35, R0 * 0.05, cx, cy, R0);
    disc.addColorStop(0, rgba(mix(COL.line, COL.lamp, 0.15 + vamp * 0.25), 1)); disc.addColorStop(0.7, rgba(COL.deep, 1)); disc.addColorStop(1, rgba(mix(COL.deep, COL.slate, 0.2), 1));
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(COL.lamp, 0.15 + vamp * 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    var shine = ctx.createLinearGradient(cx, cy - R0, cx, cy);
    shine.addColorStop(0, "rgba(255,255,255,0.08)"); shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine; ctx.beginPath(); ctx.ellipse(cx, cy - R0 * 0.45, R0 * 0.7, R0 * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    el.canvas.dataset.amp = vamp.toFixed(2);
  }
  function vizFrame(now) {
    raf = requestAnimationFrame(vizFrame);
    var dt = Math.min(0.05, (now - vLast) / 1000); vLast = now; vizDraw(now / 1000, dt, false);
  }
  function vizStart() {
    if (vizOn || !el.canvas) return;
    vizOn = true; if (!COL) tok();
    var r = el.viz.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    vW = r.width; vH = r.height; el.canvas.width = vW * d; el.canvas.height = vH * d;
    ctx = el.canvas.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    if (REDUCED) vizDraw(0, 0, true); else { vLast = performance.now(); raf = requestAnimationFrame(vizFrame); }
  }
  function vizStop() { vizOn = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
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
    if (!queue.length) { status(lab()); return; }
    clearTimeout(restartT);
    cur = queue.shift(); speaking = true; thinking = false; status(lab());
    if (recRun) { try { rec.abort(); } catch (e) {} } // half-duplex: stop listening while Wren talks
    var u = new SpeechSynthesisUtterance(cur), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    var done = function () {
      if (curUtt !== u) return; curUtt = null; speaking = false; recent = cur; endAt = Date.now(); cur = "";
      if (queue.length) return next();
      status(lab());
      clearTimeout(restartT); restartT = setTimeout(startRec, TAIL + 30);
    };
    u.onend = done; u.onerror = done;
    u.onstart = function () { if (curUtt === u) vizKick(1); };
    u.onboundary = function () { if (curUtt === u) vizKick(0.6); };
    curUtt = u; // keep a reference: Chrome can garbage-collect a playing utterance
    TTS.speak(u);
  }
  function stopSpeech() {
    queue = []; curUtt = null; speaking = false; cur = "";
    if (TTS) TTS.cancel();
    if (voiceOn) status(lab());
  }
  function speechText(m) {
    var t = (m.text || "").replace(/\n[ \t]*Sources?:[\s\S]*$/i, "")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*/g, "").replace(/^\s*[*-]\s+/gm, "");
    return t.trim();
  }
  function startRec() {
    if (!voiceOn || recRun || !open || muted) return;
    if (blocked()) { // wait out the tail; done() reschedules after speech
      if (!speaking && !queue.length) { clearTimeout(restartT); restartT = setTimeout(startRec, Math.max(50, TAIL - (Date.now() - endAt) + 30)); }
      return;
    }
    try { rec.start(); recRun = true; status(lab()); } catch (e) {}
  }
  function voiceOff(msg) {
    voiceOn = false; awaiting = false; thinking = false; vizStop(); clearTimeout(fillerT); clearTimeout(restartT); fails = 0; stopSpeech();
    if (rec) { try { rec.abort(); } catch (e) {} }
    recRun = false; el.input.value = ""; el.panel.classList.remove("sw-voice"); tabsSync();
    status(msg || "Voice off");
  }
  function voiceStart() {
    voiceOn = true; muted = false; el.mic.setAttribute("aria-pressed", "true");
    el.panel.classList.add("sw-voice"); tabsSync(); vizStart(); startRec(); status(lab());
    if (S) { quiet = true; poll(false).then(function () { quiet = false; }); } // what is already there is not spoken
  }
  function initVoice() {
    rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = function (e) {
      var fin = "", itm = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else itm += r[0].transcript;
      }
      var heard = (fin || itm).trim(); if (!heard) return;
      if (blocked()) return; // half-duplex: anything heard while Wren speaks (or just after) is her own voice
      fails = 0;
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
    if (hush || quiet) return; // interrupted, or already there when voice came on
    if (awaitEcho) { held.push(m); return; } // before the echo of the latest send: stale if the echo shows up, spoken if the safety timer fires
    var low = (m.text || "").toLowerCase();
    if ((C.voiceSkipPatterns || []).some(function (p) { return p && low.indexOf(String(p).toLowerCase()) >= 0; })) { status(lab()); return; }
    thinking = false; var t = speechText(m); if (t) speakText(t); else status(lab());
  }

  function clearEcho(speakHeld) { // one timer; held messages are stale once the echo arrives, newer if the timer fires
    clearTimeout(echoT); awaitEcho = false;
    var hm = held; held = [];
    if (speakHeld && !hush) hm.forEach(onAgentMessage);
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
      var vl = h("label", "", "Voice"); el.voiceSel = h("select"); vl.appendChild(el.voiceSel);
      el.menu.appendChild(vl);
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
      el.mic.setAttribute("aria-pressed", "true"); el.mic.setAttribute("aria-label", "Microphone");
      el.mic.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12z"/></svg>';
      el.status = h("span", "vh"); el.status.setAttribute("role", "status");
      el.vizbox = h("div", "sw-vizbox");
      el.viz = h("div", "sw-viz"); el.viz.setAttribute("aria-hidden", "true"); el.viz.dataset.s = "listening";
      el.canvas = h("canvas"); el.vlabel = h("span", "sw-vlabel", "Listening");
      el.viz.appendChild(el.canvas); el.viz.appendChild(el.vlabel);
      el.stop = h("button", "sw-stop", "Stop"); el.stop.type = "button"; el.stop.hidden = true;
      el.stop.setAttribute("aria-label", "Stop " + (C.agentName || "Wren") + " speaking");
      el.stop.addEventListener("click", interrupt);
      el.vizbox.appendChild(el.viz); el.vizbox.appendChild(el.stop);
      el.tabs = h("div", "sw-tabs"); el.tabs.setAttribute("role", "tablist"); el.tabs.setAttribute("aria-label", "Chat mode");
      el.tabBtn = ["chat", "voice"].map(function (m) {
        var b = h("button", "sw-tab", m === "chat" ? "Chat" : "Voice"); b.type = "button"; b.id = "sw-tab-" + m; b.dataset.m = m;
        b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "sw-body"); el.tabs.appendChild(b);
        b.addEventListener("click", function () { pickTab(m); });
        return b;
      });
      el.tabs.addEventListener("keydown", function (e) {
        var i = el.tabBtn.indexOf(document.activeElement); if (i < 0) return;
        var n = e.key === "ArrowRight" ? (i + 1) % 2 : e.key === "ArrowLeft" ? (i + 1) % 2 : e.key === "Home" ? 0 : e.key === "End" ? 1 : -1;
        if (n < 0) return; e.preventDefault(); pickTab(el.tabBtn[n].dataset.m); el.tabBtn[n].focus();
      });
      form.appendChild(el.mic); form.appendChild(el.status);
      initVoice();
      el.mic.addEventListener("click", function () { // mute toggle only: never touches Wren's speech
        if (!voiceOn) return;
        muted = !muted; el.mic.setAttribute("aria-pressed", String(!muted));
        if (muted) { if (rec) { try { rec.abort(); } catch (e) {} } } else startRec();
        status(lab());
      });
    }
    form.appendChild(el.input); form.appendChild(el.send);

    var bodyEl = h("div", "sw-body"); bodyEl.id = "sw-body"; if (el.tabs) bodyEl.setAttribute("role", "tabpanel");
    if (el.vizbox) bodyEl.appendChild(el.vizbox); bodyEl.appendChild(el.log); bodyEl.appendChild(el.typing); bodyEl.appendChild(form);
    el.panel.appendChild(head); if (el.menu) el.panel.appendChild(el.menu); if (el.tabs) el.panel.appendChild(el.tabs); el.panel.appendChild(bodyEl); tabsSync();
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

  function tabsSync() {
    if (!el.tabBtn) return;
    el.tabBtn.forEach(function (b) {
      var on = (b.dataset.m === "voice") === voiceOn;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      var bd = document.getElementById("sw-body"); if (on && bd) bd.setAttribute("aria-labelledby", b.id);
    });
  }
  function pickTab(m) {
    try { sessionStorage.setItem(TABK, m); } catch (e) {}
    if (m === "voice" && !voiceOn) voiceStart(); else if (m === "chat" && voiceOn) voiceOff("Chat mode");
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
    hush = false; awaitEcho = true; held = []; echoFor = (p.label || p.text || "").trim(); clearTimeout(echoT); // replies after this message are spoken; anything polled before its echo is older
    if (voiceOn) { if (speaking || queue.length) stopSpeech(); thinking = true; status(lab()); }
    var tmp = addMsg({ role: "user", text: p.label || p.text, pending: true });
    tmp.dataset.opt = "1"; // marked at creation so an early polled echo reconciles
    note("");
    ensureSession().then(function () {
      return call("POST", "/message", auth(p));
    }).then(function () {
      tmp.classList.remove("pending");
      clearTimeout(echoT); echoT = setTimeout(function () { clearEcho(true); }, 6000); // ponytail: safety net if the relay never echoes the user message
      startFast();
    }).catch(function (e) {
      tmp.remove(); clearEcho(false); thinking = false;
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
    polled = true;
    var q = {}; if (lastId) q.after = lastId;
    return call("GET", "/messages", auth(q)).then(function (r) {
      backoff = 0;
      var got = 0;
      (r.messages || []).forEach(function (m) {
        if (seen[m.id]) return;
        seen[m.id] = 1; lastId = m.id;
        if (m.role === "user") { // server echo replaces the optimistic copy
          var o = el.log.querySelector('.sw-me[data-opt="1"]');
          if (awaitEcho && (m.text || "").trim() === echoFor) clearEcho(false);
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
    ensureSession().then(function () { return polled ? null : poll(false); }).then(function () {
      if (!lastId) startFast(); else schedule(); // fresh chat: poll fast so the greeting shows quickly
      try { if (el.tabs && !voiceOn && open && sessionStorage.getItem(TABK) === "voice") voiceStart(); } catch (e) {}
    }).catch(function (e) { fail(e, openPanel); });
    el.input.focus();
  }
  function closePanel() {
    if (voiceOn) voiceOff();
    open = false; clearTimeout(timer);
    el.panel.hidden = true; el.launch.hidden = false; el.launch.focus();
  }

  buildUI();
  // create the session while the page is idle so the greeting is already waiting when the panel opens
  try { if (!JSON.parse(sessionStorage.getItem(KEY) || "null")) (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(function () { ensureSession().catch(function () {}); }); } catch (e) {}
  if (TTS) { TTS.addEventListener("voiceschanged", loadVoices); loadVoices(); }
})();
