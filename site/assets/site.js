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
      var play = function () { var s = c.createBufferSource(); s.buffer = clickBuf; s.connect(c.destination); s.start(); };
      if (c.state === "running") play();
      else if (!auto) c.resume().then(play).catch(function () {}); // context made before any gesture: resume() is async, so wait for it on the click
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
    var mid = d.getElementById("liftmid"), dimline = d.getElementById("dimline"), dimtext = d.getElementById("dimtext"), notch = d.getElementById("dialnotch");
    var touched = false, cur = H0, target = H0, raf = 0, fade = null, hum = null;
    var clamp = function (v) { return Math.max(MIN, Math.min(MAX, v)); };
    var paint = function () {
      var dy = -(cur - H0) * K;
      follow.forEach(function (e) { e.setAttribute("transform", "translate(0 " + dy.toFixed(2) + ")"); });
      mid.setAttribute("transform", "translate(0 " + (dy / 2).toFixed(2) + ")"); // middle leg stage runs at half the desktop's travel
      dimline.setAttribute("d", "M612 " + (290 + dy).toFixed(2) + " V388");
      notch.setAttribute("transform", "rotate(" + ((cur - H0) * 18).toFixed(1) + " 520 322)");
      var n = Math.round(cur); if (dimtext) dimtext.textContent = n + " in";
      var bu = d.getElementById("deskup"), bd = d.getElementById("deskdn");
      if (bu) { bu.setAttribute("aria-disabled", cur >= MAX - 0.05); bd.setAttribute("aria-disabled", cur <= MIN + 0.05); }
      dial.setAttribute("aria-valuenow", n); dial.setAttribute("aria-valuetext", "Desk height " + n + " in");
    };
    var ease = function (t) { return t * t * (3 - 2 * t); }; // smoothstep: slow start, slow stop
    var light = function () {
      dial.classList.add("on");
      clearTimeout(fade); fade = setTimeout(function () { dial.classList.remove("on"); }, 10000); // 10 s after the last input
    };
    var humStop = function () {
      if (!hum) return; var h = hum, t = h.c.currentTime; hum = null;
      try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, 0.12); h.o.stop(t + 0.6); h.o2.stop(t + 0.6); } catch (e) {}
    };
    var humStart = function () { // a very faint low hum while moving; silent if audio isn't allowed yet
      if (hum || reduce || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      try {
        var c = ctx(); if (!c) return;
        if (c.state !== "running") { c.resume().then(function () { if (dir || raf || loop) humStart(); }).catch(function () {}); return; } // resume() is async: retry once running
        var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = "sine"; o.frequency.value = 62; o2.type = "triangle"; o2.frequency.value = 124.7;
        f.type = "lowpass"; f.frequency.value = 220; g.gain.value = 0; g.gain.setTargetAtTime(0.024, c.currentTime, 0.15);
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
    // up/down buttons: hold to keep moving (speed eases in and out); a quick tap or key press nudges 2 in
    var btns = d.querySelector(".deskbtns");
    if (btns) {
      btns.hidden = false;
      var dir = 0, vel = 0, last = 0, held = 0, loop = 0, MAXV = 9; // MAXV in inches per second
      var tick = function (now) {
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        vel += (dir * MAXV - vel) * (1 - Math.exp(-dt / (dir ? 0.35 : 0.2))); // soft start / soft stop
        cur = clamp(cur + vel * dt); if (cur === MIN || cur === MAX) vel = 0; target = cur; paint();
        if (dir || Math.abs(vel) > 0.05) loop = requestAnimationFrame(tick); else { loop = 0; humStop(); }
      };
      var hold = function (d_) {
        if (reduce) { move(target + d_ * 2); return; }
        touched = true; cancelAnimationFrame(raf); raf = 0; dir = d_; held = performance.now(); light(); humStart();
        if (!loop) { last = held; vel = 0; loop = requestAnimationFrame(tick); }
      };
      var release = function () {
        if (!dir) return; var d_ = dir; dir = 0;
        if (performance.now() - held < 220) { cancelAnimationFrame(loop); loop = 0; vel = 0; humStop(); move(cur + d_ * 2); }
      };
      [["deskup", 1], ["deskdn", -1]].forEach(function (x) {
        var b = d.getElementById(x[0]);
        b.addEventListener("pointerdown", function (e) { if (e.button) return; b.setPointerCapture(e.pointerId); hold(x[1]); });
        b.addEventListener("pointerup", release); b.addEventListener("pointercancel", release); b.addEventListener("lostpointercapture", release);
        b.addEventListener("click", function (e) { if (e.detail === 0) move(target + x[1] * 2); }); // keyboard
      });
    }
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

  /* ---- cart: sessionStorage state; absent/empty = the demo preset that the HTML already shows ---- */
  var CK = "sd-cart";
  var catEl = d.getElementById("catalog"), cat = catEl ? JSON.parse(catEl.textContent) : null;
  // keep only well-formed lines (known id, integer qty clamped to 1..99); a non-empty cart with no valid line falls back to the preset
  var readCart = function () {
    try {
      var c = JSON.parse(sessionStorage.getItem(CK)); if (!Array.isArray(c)) return null;
      var ok = c.filter(function (l) { return l && typeof l === "object" && typeof l.id === "string" && Number.isInteger(l.qty) && (!cat || cat[l.id]); })
        .map(function (l) { l.qty = Math.max(1, Math.min(99, l.qty)); if (typeof l.sku !== "string") delete l.sku; if (typeof l.price !== "number") delete l.price; return l; });
      return ok.length || !c.length ? ok : null;
    } catch (e) { return null; }
  };
  var saveCart = function (c) { try { c ? sessionStorage.setItem(CK, JSON.stringify(c)) : sessionStorage.removeItem(CK); } catch (e) {} };
  var badge = d.querySelector(".badge"), setBadge = function (c) { // header count follows the cart; default stays as rendered
    try { if (badge && c) badge.firstChild.nodeValue = c.reduce(function (n, l) { return n + l.qty; }, 0); } catch (e) {}
  };
  setBadge(readCart());
  var lines = d.getElementById("lines");
  var onCartChange = function () {};
  var optForm = d.querySelector("form.opts[data-id]");
  if (optForm) optForm.addEventListener("submit", function (e) { // product page: add to the same cart, then show it
    var cart = readCart() || presetCart(), id = optForm.dataset.id, w = d.querySelector('input[name="width"]:checked');
    var l = cart.filter(function (x) { return x.id === id && x.sku === (sku ? sku.textContent : undefined); })[0];
    if (l) l.qty++; else cart.push({ id: id, qty: 1, sku: sku ? sku.textContent : undefined, price: w ? +w.dataset.price : undefined });
    saveCart(cart); setBadge(cart);
    e.preventDefault(); // stay on the page; without JS the form still goes to /cart/
  });
  var presetIds = null; // read once, before the first redraw replaces the server-rendered lines
  function presetCart() { // ids come from site.json via the server-rendered HTML (summary.njk li[data-id], or the product form's data-preset)
    var ids = presetIds || (presetIds = optForm ? optForm.dataset.preset.split(" ") : [].map.call(d.querySelectorAll("#lines li[data-id]"), function (li) { return li.dataset.id; }));
    return ids.map(function (id) { return { id: id, qty: 1 }; });
  }
  if (lines) presetCart();
  if (lines && catEl) {
    var money = function (n) { return "$" + n; };
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var siteBase = lines.querySelector("a") ? lines.querySelector("a").getAttribute("href").replace(/products\/[^/]+\/$/, "") : "/";
    var rest = d.getElementById("restore"), skus = {};
    lines.querySelectorAll("li[data-id]").forEach(function (li) { skus[li.dataset.id] = li.querySelector(".sku").textContent.replace(/ · Qty \d+$/, ""); });
    var promoOn = false, promoDropped = false; // SERENE10 applied (memory only); dropped = a sale item arrived after it
    var draw = function () {
      var cart = readCart(), total = 0;
      if (!cart) { cart = presetCart(); }
      lines.innerHTML = cart.map(function (l, i) {
        var p = cat[l.id]; if (!p) return "";
        var unit = l.price != null ? l.price : (p.sale || p.price), sale = !!p.sale, was = sale && l.price == null; total += unit * l.qty;
        var sk = l.sku || skus[l.id] || l.id;
        return '<li class="line" data-i="' + i + '" data-id="' + esc(l.id) + '" data-qty="' + l.qty + '" data-price="' + unit + '">' +
          '<div class="lineart grain"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#a-' + esc(p.art) + '"/></svg></div>' +
          '<div><p class="name"><a href="' + esc(siteBase) + 'products/' + esc(p.slug) + '/">' + esc(p.name) + '</a></p>' +
          '<p class="sku mono">' + esc(sk) + ' · Qty ' + l.qty + '</p>' + (sale ? '<p class="saletag mono">Sale price</p>' : '') +
          '<div class="qty"><button type="button" data-d="-1" aria-label="Decrease quantity of ' + esc(p.name) + '"' + (l.qty < 2 ? " disabled" : "") + '>−</button><output aria-live="polite">' + l.qty + '</output><button type="button" data-d="1" aria-label="Increase quantity of ' + esc(p.name) + '"' + (l.qty > 98 ? " disabled" : "") + '>+</button>' +
          '<button type="button" class="rm" data-rm="1" aria-label="Remove ' + esc(p.name) + '">Remove</button></div></div>' +
          '<p class="price' + (sale ? ' on' : '') + '">' + money(unit * l.qty) + (was ? '<s><span class="vh">was </span>' + money(p.price * l.qty) + '</s>' : '') + '</p></li>';
      }).join("");
      if (!cart.length) {
        var li = d.createElement("li"), h = d.createElement("h2"), t = d.createElement("p"), a = d.createElement("a");
        li.className = "empty"; h.textContent = "Your cart is empty."; t.textContent = "Nothing here yet. Start with a desk, or something small for the one you have.";
        a.className = "btn lamp"; a.href = lines.dataset.shop; a.textContent = "Shop desks";
        li.append(h, t, a); lines.replaceChildren(li);
      }
      d.querySelectorAll(".totals").forEach(function (e) { e.hidden = !cart.length; });
      setBadge(cart);
      d.querySelectorAll(".subtotal").forEach(function (e) { e.textContent = money(total); });
      if (promoOn && cart.some(function (l) { return cat[l.id] && cat[l.id].sale; })) { promoOn = false; promoDropped = true; }
      d.querySelectorAll(".totals .promo-rows").forEach(function (e) { e.remove(); });
      if (promoOn) { // 10% off; cents shown only when needed
        var off = Math.round(total * 10) / 100, tt = d.querySelector(".co-sum .totals");
        var m2 = function (n) { return "$" + (Number.isInteger(n) ? n : n.toFixed(2)); };
        if (tt) tt.insertAdjacentHTML("beforeend", '<div class="promo-rows"><dt>SERENE10 (10% off)</dt><dd class="mono">−' + m2(off) + '</dd></div><div class="promo-rows"><dt>Total</dt><dd class="mono">' + m2(Math.round((total - off) * 100) / 100) + '</dd></div>');
      }
      if (rest) rest.hidden = false;
    };
    // the prices on the page are read from the catalog (built from products.json), never typed here
    var mutate = function (fn) { var c = readCart() || presetCart(); fn(c); saveCart(c); draw(); onCartChange(); };
    lines.addEventListener("click", function (e) {
      var b = e.target.closest("button"), li = e.target.closest("li"); if (!b || !li) return;
      var i = +li.dataset.i;
      mutate(function (c) { if (b.dataset.rm) c.splice(i, 1); else c[i].qty = Math.max(1, Math.min(99, c[i].qty + +b.dataset.d)); });
      var again = lines.querySelector('li[data-i="' + Math.min(i, lines.children.length - 1) + '"] ' + (b.dataset.rm ? "" : 'button[data-d="' + b.dataset.d + '"]'));
      if (again) again.focus(); else if (rest) rest.focus();
    });
    if (rest) rest.addEventListener("click", function () { var pc = d.getElementById("promo-code"); if (pc) pc.value = "SERENE10"; promoOn = false; saveCart(null); draw(); onCartChange(); });
    if (readCart()) draw(); else if (rest) { rest.hidden = false; draw(); }
  }

  /* ---- checkout: deterministic fake errors ---- */
  var errs = d.querySelectorAll(".errbox");
  if (errs.length) {
    var show = function (code) {
      errs.forEach(function (e) { e.classList.toggle("on", e.id === "err-" + code); });
      var t = d.getElementById("err-" + code); if (t) t.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    };
    var q = new URLSearchParams(location.search).get("error"), q0 = function () { return q; };
    var clearErrs = function () { errs.forEach(function (e) { e.classList.remove("on"); }); };
    onCartChange = function () { clearErrs(); if (promoDropped) { promoDropped = false; show("PROMO-04"); } }; // changing the cart clears any error; a dropped code says why
    // errors never persist: drop a stale #err- hash (it would re-show the box on reload) unless ?error= asks for one
    if (/^#err-/.test(location.hash) && !q0()) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (q && d.getElementById("err-" + q)) show(q);
    d.querySelectorAll(".errx").forEach(function (b) { b.addEventListener("click", function () { var pc = d.getElementById("promo-code"); if (b.dataset.clear && pc) { pc.value = ""; pc.focus(); } errs.forEach(function (e) { e.classList.remove("on"); }); }); });
    var order = d.getElementById("order"), promo = d.getElementById("promo");
    // SERENE10 only when every line is full price; anything else (SPRINGQUIET, unknown) is PROMO-04. One code per order.
    var applyPromo = function () {
      var code = (d.getElementById("promo-code").value || "").trim().toUpperCase(), cart = readCart() || presetCart();
      promoOn = code === "SERENE10" && cart.length > 0 && !cart.some(function (l) { return cat[l.id] && cat[l.id].sale; });
      draw(); if (promoOn) clearErrs(); else show("PROMO-04");
    };
    if (order) order.addEventListener("submit", function (e) {
      e.preventDefault();
      if (q && d.getElementById("err-" + q) && q !== "PROMO-04") return show(q);
      var zip = (d.getElementById("co-zip").value || "").trim();
      if (zip === "00000") return show("PAY-201");
      if (!/^\d{5}(-\d{4})?$/.test(zip)) return show("ADDR-12");
      var n = "SD-2" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      saveCart([]); promoOn = false; draw(); clearErrs();
      d.getElementById("conf-no").textContent = n;
      d.querySelector(".co-grid").hidden = true; d.getElementById("confirmed").hidden = false;
      d.querySelector(".checkout h1").textContent = "Order placed"; d.getElementById("confirmed").focus();
    });
    if (promo) promo.addEventListener("submit", function (e) { e.preventDefault(); applyPromo(); });
    // the form's GET fallback (script late or cached) lands here with ?promo=: show the same error, then drop the param so a reload is clean
    if (promo && new URLSearchParams(location.search).has("promo")) { applyPromo(); try { var u = new URLSearchParams(location.search); u.delete("promo"); history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "") + location.hash); } catch (e) {} }
  }

  /* ---- help page: open whichever widget is present ---- */
  d.querySelectorAll("[data-open-chat]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (window.zE) { try { window.zE("messenger", "open"); } catch (x) {} }
      else if (window.SereneWidget && window.SereneWidget.open) window.SereneWidget.open();
    });
  });
})();
