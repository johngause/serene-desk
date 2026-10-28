/* Progressive enhancement only: every page is complete without this file. */
(function () {
  var d = document, root = d.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Light follows the clock: warmer glow after (approximate) local sunset.
  var now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  var sunset = 18 + 1.6 * Math.sin((2 * Math.PI * (doy - 80)) / 365); // rough mid-latitude curve
  if (h >= sunset || h < 5.5) root.setAttribute("data-dusk", "");

  // Lamp chain: drag down to toggle (tap is handled by the label/checkbox).
  var hit = d.querySelector(".chain-hit"), pull = d.getElementById("pull");
  if (hit && pull) {
    var y0 = null;
    hit.addEventListener("pointerdown", function (e) { y0 = e.clientY; });
    hit.addEventListener("pointerup", function (e) {
      if (y0 !== null && e.clientY - y0 > 12) { pull.checked = !pull.checked; e.preventDefault(); }
      y0 = null;
    });
    hit.addEventListener("click", function (e) { if (hit.dataset.dragged) { e.preventDefault(); } });
  }

  // Hour Cube: tip to the next face.
  var cube = d.getElementById("cube");
  if (cube) {
    var names = ["25", "50", "90", "the Serene Desk mark"];
    cube.addEventListener("click", function () {
      var n = (+cube.dataset.face + 1) % 4;
      cube.dataset.face = n;
      cube.setAttribute("aria-label", "Hour Cube showing " + (n < 3 ? names[n] + " minutes" : names[n]) + ". Press to turn to the next face.");
    });
  }

  // Desk width selector updates the displayed price and SKU (all values are also listed in the page tables).
  var widths = d.querySelectorAll('input[name="width"]');
  if (widths.length) {
    var price = d.getElementById("price"), sku = d.getElementById("sku");
    var upd = function () {
      var w = d.querySelector('input[name="width"]:checked'), f = d.querySelector('input[name="finish"]:checked');
      if (price) price.textContent = "$" + w.dataset.price;
      if (sku && f) sku.textContent = sku.textContent.replace(/-\d+-[A-Z]+$/, "-" + w.value + "-" + f.value.toUpperCase());
    };
    d.querySelectorAll('input[name="width"],input[name="finish"]').forEach(function (i) { i.addEventListener("change", upd); });
    upd();
  } else {
    var fins = d.querySelectorAll('input[name="finish"]'), sk = d.getElementById("sku");
    if (sk && fins.length && /^SD-DSK-NOK/.test(sk.textContent)) {
      fins.forEach(function (i) { i.addEventListener("change", function () { sk.textContent = "SD-DSK-NOK-" + i.value.toUpperCase(); }); });
      sk.textContent = "SD-DSK-NOK-" + d.querySelector('input[name="finish"]:checked').value.toUpperCase();
    }
  }

  // Checkout: deterministic fake errors.
  var errs = d.querySelectorAll(".errbox");
  if (errs.length) {
    var show = function (code) {
      errs.forEach(function (e) { e.classList.toggle("on", e.id === "err-" + code); });
      var t = d.getElementById("err-" + code); if (t) t.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    };
    var q = new URLSearchParams(location.search).get("error");
    if (q && d.getElementById("err-" + q)) show(q);
    var order = d.getElementById("order"), promo = d.getElementById("promo");
    if (order) order.addEventListener("submit", function (e) { e.preventDefault(); show(q && d.getElementById("err-" + q) && q !== "PROMO-04" ? q : "PAY-201"); });
    if (promo) promo.addEventListener("submit", function (e) { e.preventDefault(); show("PROMO-04"); });
  }

  // Help page: open whichever widget is present.
  d.querySelectorAll("[data-open-chat]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (window.zE) { try { window.zE("messenger", "open"); } catch (x) {} }
      else if (window.SereneWidget && window.SereneWidget.open) window.SereneWidget.open();
    });
  });
})();
