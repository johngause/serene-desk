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
  var clickUrl = d.currentScript ? d.currentScript.src.replace(/site.js.*$/, "sounds/chain-pull.mp3") : null, clickAudio = null;
  function chainClick() {
    try {
      if (!clickUrl) return;
      if (!clickAudio) clickAudio = new Audio(clickUrl);
      clickAudio.currentTime = 0;
      var p = clickAudio.play(); if (p && p.catch) p.catch(function () {});
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

  /* ---- lamp: abrupt on/off, chain pull, click on manual pulls ---- */
  var btn = d.getElementById("pullbtn"), chain = d.getElementById("chain");
  if (btn && chain) {
    btn.setAttribute("role", "button"); btn.setAttribute("tabindex", "0");
    var isOn = function () { return root.getAttribute("data-lamp") !== "off"; };
    var sync = function () { btn.setAttribute("aria-pressed", String(isOn())); btn.setAttribute("aria-label", isOn() ? "Lamp is on. Pull the chain to turn it off" : "Lamp is off. Pull the chain to turn it on"); };
    var timer = null;
    var pull = function (silent) {
      if (!silent) chainClick();
      chain.classList.remove("pulled"); void chain.getBoundingClientRect(); chain.classList.add("pulled");
      // the lamp clicks at the bottom of the pull, like a real switch
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (isOn()) root.setAttribute("data-lamp", "off"); else root.removeAttribute("data-lamp");
        sync();
      }, 110);
    };
    var auto = null;
    sync();
    if (root.getAttribute("data-lamp") === "off") {
      // every load: let the dark room paint, then pull the chain (silent: browsers block audio before a gesture)
      var go = function () { auto = setTimeout(function () { auto = null; pull(true); }, 700); };
      if (d.readyState === "complete") go(); else addEventListener("load", go);
    }
    var manual = function () { if (auto) { clearTimeout(auto); auto = null; } pull(false); };
    btn.addEventListener("click", manual);
    btn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); manual(); } });
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
