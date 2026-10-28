/* Progressive enhancement only: every page is complete without this file. */
(function () {
  var d = document, root = d.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = function (k, v) { try { v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };

  /* ---- sound: tiny Web Audio synth, created on first user gesture, fails silently ---- */
  var ac = null, noiseBuf = null;
  function ctx() {
    try {
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ac = new AC();
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
        var ch = noiseBuf.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      if (ac.state === "suspended") ac.resume();
      return ac;
    } catch (e) { return null; }
  }
  function burst(t, freq, q, vol, dur, type) { // filtered noise burst
    var s = ac.createBufferSource(); s.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    var g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur + 0.02);
  }
  function ping(t, freq, vol, dur, type) { // short tonal tick
    var o = ac.createOscillator(); o.type = type || "sine"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    var g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  /* chain click: decoded once (file is pre-trimmed and 2x faster), played from a Web Audio buffer so it starts on the pull's frame */
  var clickUrl = d.currentScript ? d.currentScript.src.replace(/site.js.*$/, "sounds/chain-pull.mp3") : null, clickBuf = null, clickLoading = false;
  function loadClick() {
    if (clickBuf || clickLoading || !clickUrl) return; clickLoading = true;
    try {
      var c = ctx(); if (!c) return;
      fetch(clickUrl).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return c.decodeAudioData(b); })
        .then(function (buf) { clickBuf = buf; }).catch(function () {});
    } catch (e) {}
  }
  function chainClick(auto) {
    try {
      // auto-pull: Chrome only lets audio run if the visitor already interacted with the site; otherwise stay silent
      if (auto && !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      var c = ctx(); if (!c) return;
      if (!clickBuf) { loadClick(); return; }
      if (c.state !== "running") return; // never queue a sound that would fire late
      var s = c.createBufferSource(); s.buffer = clickBuf; s.connect(c.destination); s.start();
    } catch (e) {}
  }
  function cubeTick() {
    if (!ctx()) return; try {
      var t = ac.currentTime;
      ping(t, 520, 0.12, 0.05, "sine"); burst(t, 1800, 2, 0.05, 0.02);
      ping(t + 0.26, 380, 0.07, 0.06, "sine");           // soft landing
    } catch (e) {}
  }

  /* ---- header: shadow once scrolled; dismissible banner ---- */
  var nav = d.getElementById("nav");
  if (nav) { var onS = function () { nav.classList.toggle("stuck", scrollY > 4); }; addEventListener("scroll", onS, { passive: true }); onS(); }
  var annx = d.getElementById("annx");
  if (annx) annx.addEventListener("click", function () {
    root.classList.add("ann-closed");
    try { localStorage.setItem("sd-ann-closed", "1"); } catch (e) {}
  });

  /* ---- light follows the clock: warmer after (approximate) local sunset ---- */
  var now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  var sunset = 18 + 1.6 * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  if (h >= sunset || h < 5.5) root.setAttribute("data-dusk", "");

  var deskRise = null;
  /* ---- lamp: abrupt on/off, chain pull, click on manual pulls ---- */
  var btn = d.getElementById("pullbtn"), chain = d.getElementById("chain");
  if (btn && chain) {
    btn.setAttribute("role", "button"); btn.setAttribute("tabindex", "0");
    var isOn = function () { return root.getAttribute("data-lamp") !== "off"; };
    var sync = function () { btn.setAttribute("aria-pressed", String(isOn())); btn.setAttribute("aria-label", isOn() ? "Lamp is on. Pull the chain to turn it off" : "Lamp is off. Pull the chain to turn it on"); };
    var timer = null, pullEls = [chain, d.querySelector(".chainline")];
    loadClick();
    var pull = function (silent) {
      chainClick(silent);
      pullEls.forEach(function (e) { e.classList.remove("pulled"); }); void chain.getBoundingClientRect(); pullEls.forEach(function (e) { e.classList.add("pulled"); });
      // the lamp clicks at the bottom of the pull, like a real switch
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (isOn()) root.setAttribute("data-lamp", "off"); else { root.removeAttribute("data-lamp"); if (deskRise) setTimeout(deskRise, 450); }
        sync();
      }, 110);
    };
    var auto = null;
    sync();
    if (root.getAttribute("data-lamp") === "off") {
      // every load: let the dark room paint, then pull the chain (sound only if the browser already allows audio)
      var go = function () { auto = setTimeout(function () { auto = null; pull(true); }, 700); };
      if (d.readyState === "complete") go(); else addEventListener("load", go);
    }
    var manual = function () { if (auto) { clearTimeout(auto); auto = null; } pull(false); };
    btn.addEventListener("click", manual);
    btn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); manual(); } });
  }

  /* ---- hero desk + Still Dial: 25-51 in, soft start / soft stop ---- */
  var lift = d.getElementById("lift"), dial = d.getElementById("dial");
  if (lift && dial) {
    var MIN = 25, MAX = 51, H0 = 40, K = 2.45; // H0 = the static drawing; K = scene px per inch
    var follow = [lift, d.getElementById("lift2")].concat([].slice.call(d.querySelectorAll(".lift-follow")));
    var mid = d.getElementById("liftmid"), dimline = d.getElementById("dimline"), dimtext = d.getElementById("dimtext"), notch = d.getElementById("dialnotch"), glow = d.getElementById("floorglow");
    var touched = false, cur = H0, target = H0, raf = 0, fade = null, hum = null;
    var clamp = function (v) { return Math.max(MIN, Math.min(MAX, v)); };
    var paint = function () {
      var dy = -(cur - H0) * K;
      follow.forEach(function (e) { e.setAttribute("transform", "translate(0 " + dy.toFixed(2) + ")"); });
      mid.setAttribute("transform", "translate(0 " + (dy / 2).toFixed(2) + ")"); // middle leg stage runs at half the desktop's travel
      dimline.setAttribute("d", "M612 " + (290 + dy).toFixed(2) + " V388");
      notch.setAttribute("transform", "rotate(" + ((cur - H0) * 18).toFixed(1) + " 520 322)");
      var n = Math.round(cur); if (dimtext) dimtext.textContent = n + " in";
      dial.setAttribute("aria-valuenow", n); dial.setAttribute("aria-valuetext", "Desk height " + n + " in");
    };
    var ease = function (t) { return t * t * (3 - 2 * t); }; // smoothstep: slow start, slow stop
    var light = function () {
      dial.classList.add("on"); glow.classList.add("on");
      clearTimeout(fade); fade = setTimeout(function () { dial.classList.remove("on"); glow.classList.remove("on"); }, 10000); // 10 s after the last input
    };
    var humStop = function () {
      if (!hum) return; var h = hum, t = h.c.currentTime; hum = null;
      try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, 0.12); h.o.stop(t + 0.6); h.o2.stop(t + 0.6); } catch (e) {}
    };
    var humStart = function () { // a very faint low hum while moving; silent if audio isn't allowed yet
      if (hum || reduce || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      try {
        var c = ctx(); if (!c || c.state !== "running") return;
        var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = "sine"; o.frequency.value = 62; o2.type = "triangle"; o2.frequency.value = 124.7;
        f.type = "lowpass"; f.frequency.value = 220; g.gain.value = 0; g.gain.setTargetAtTime(0.012, c.currentTime, 0.15);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination); o.start(); o2.start(); hum = { c: c, o: o, o2: o2, g: g };
      } catch (e) {}
    };
    var move = function (to, ms) {
      touched = true;
      target = clamp(to); light();
      if (reduce || target === cur) { cancelAnimationFrame(raf); cur = target; raf = 0; paint(); humStop(); return; }
      var from = cur, dist = Math.abs(target - from);
      var moving = raf !== 0, dur = ms || Math.min(1800, Math.max(350, dist * 350)), t0 = performance.now();
      cancelAnimationFrame(raf); humStart();
      var step = function (now) {
        var p = Math.min(1, (now - t0) / dur);
        cur = from + (target - from) * (moving ? 1 - (1 - p) * (1 - p) : ease(p)); paint(); // already moving: no second soft start, just a soft stop
        if (p < 1) raf = requestAnimationFrame(step); else { raf = 0; humStop(); }
      };
      raf = requestAnimationFrame(step);
    };
    deskRise = function () { if (reduce || touched) return; touched = true; move(H0, 1200); };
    // before the lamp comes on, the desk waits low; JS-off keeps the static drawing
    if (root.getAttribute("data-lamp") === "off" && !reduce) { cur = H0 - 6; target = cur; }
    dial.setAttribute("role", "slider"); dial.setAttribute("tabindex", "0");
    dial.setAttribute("aria-label", "Still Dial: desk height");
    dial.setAttribute("aria-valuemin", MIN); dial.setAttribute("aria-valuemax", MAX); dial.setAttribute("aria-orientation", "vertical");
    paint();
    dial.addEventListener("keydown", function (e) {
      var by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (e.key === "Home") by = MIN - target; if (e.key === "End") by = MAX - target;
      if (by === undefined) return; e.preventDefault(); move(target + by);
    });
    var drag = null;
    dial.addEventListener("pointerdown", function (e) { drag = { y: e.clientY, h: target, moved: false }; dial.setPointerCapture(e.pointerId); dial.focus({ preventScroll: true }); });
    dial.addEventListener("pointermove", function (e) {
      if (!drag) return; var dy = drag.y - e.clientY;
      if (Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) { var px = dial.ownerSVGElement.getBoundingClientRect().height / 460; move(drag.h + dy / (K * px), 160); }
    });
    var up = function (e) { // a click without drag: top half raises 2 in, bottom half lowers 2 in
      if (drag && !drag.moved) { var r = dial.getBoundingClientRect(); move(target + (e.clientY < r.top + r.height / 2 ? 2 : -2)); }
      drag = null;
    };
    dial.addEventListener("pointerup", up); dial.addEventListener("pointercancel", function () { drag = null; });
  }

  /* ---- Hour Cube ---- */
  var cube = d.getElementById("cube");
  if (cube) {
    var names = ["25 minutes", "50 minutes", "90 minutes", "the Serene Desk mark"];
    cube.addEventListener("click", function () {
      var n = (+cube.dataset.face + 1) % 4; cube.dataset.face = n; cubeTick();
      cube.setAttribute("aria-label", "Hour Cube showing " + names[n] + ". Press to turn to the next face.");
    });
  }

  /* ---- product page: width/finish, views, zoom, sticky bar ---- */
  var price = d.getElementById("price"), sku = d.getElementById("sku"), sbp = d.getElementById("sb-price");
  var widths = d.querySelectorAll('input[name="width"]');
  var upd = function () {
    var w = d.querySelector('input[name="width"]:checked'), f = d.querySelector('input[name="finish"]:checked');
    if (w) { if (price) price.textContent = "$" + w.dataset.price; if (sbp) sbp.textContent = "$" + w.dataset.price; }
    if (sku && /^SD-DSK/.test(sku.textContent)) {
      var parts = sku.textContent.split("-").slice(0, 3);
      if (w) parts.push(w.value); if (f) parts.push(f.value.toUpperCase());
      sku.textContent = parts.join("-");
    }
  };
  d.querySelectorAll('input[name="width"],input[name="finish"]').forEach(function (i) { i.addEventListener("change", upd); });
  if (widths.length || d.querySelector('input[name="finish"]')) upd();

  var stage = d.getElementById("stage"), zoom = d.getElementById("zoom");
  if (stage) {
    var zsvg = d.getElementById("zoom-svg");
    if (zoom && zoom.showModal) {
      stage.addEventListener("click", function () { zoom.showModal(); });
      zoom.addEventListener("click", function (e) { if (e.target === zoom || e.target === zsvg) zoom.close(); });
      d.getElementById("zclose").addEventListener("click", function () { zoom.close(); });
    }
  }
  var sb = d.getElementById("stickybar"), addbtn = d.getElementById("addbtn");
  if (sb && addbtn && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { sb.classList.toggle("hide", es[0].isIntersecting); }).observe(addbtn);
    sb.classList.add("hide");
  }

  /* ---- checkout: deterministic fake errors ---- */
  var errs = d.querySelectorAll(".errbox");
  if (errs.length) {
    var show = function (code) {
      errs.forEach(function (e) { e.classList.toggle("on", e.id === "err-" + code); });
      var t = d.getElementById("err-" + code); if (t) t.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    };
    var q = new URLSearchParams(location.search).get("error");
    if (q && d.getElementById("err-" + q)) show(q);
    d.querySelectorAll(".errx").forEach(function (b) { b.addEventListener("click", function () { var pc = d.getElementById("promo-code"); if (b.dataset.clear && pc) { pc.value = ""; pc.focus(); } errs.forEach(function (e) { e.classList.remove("on"); }); }); });
    var order = d.getElementById("order"), promo = d.getElementById("promo");
    if (order) order.addEventListener("submit", function (e) { e.preventDefault(); show(q && d.getElementById("err-" + q) && q !== "PROMO-04" ? q : "PAY-201"); });
    if (promo) promo.addEventListener("submit", function (e) { e.preventDefault(); show("PROMO-04"); });
  }

  /* ---- help page: open whichever widget is present ---- */
  d.querySelectorAll("[data-open-chat]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (window.zE) { try { window.zE("messenger", "open"); } catch (x) {} }
      else if (window.SereneWidget && window.SereneWidget.open) window.SereneWidget.open();
    });
  });
})();
