/* shop: add-to-cart acknowledgement, sticky bar hides near the footer */
(function () {
  var d = document, btn = d.getElementById("addbtn"), live = d.getElementById("addlive"), form = btn && btn.form;
  if (form) {
    var label = btn.textContent;
    var vc = d.getElementById("viewcart"), t;
    form.addEventListener("submit", function () { // site.js saves the cart and keeps us on the page
      btn.textContent = "Added"; btn.classList.add("added"); if (live) live.textContent = "Added";
      if (vc) vc.hidden = false;
      clearTimeout(t); t = setTimeout(function () { btn.textContent = label; btn.classList.remove("added"); }, 2500);
    });
    addEventListener("pageshow", function () { btn.textContent = label; btn.classList.remove("added"); if (live) live.textContent = ""; if (vc) vc.hidden = true; });
  }
  var sb = d.getElementById("stickybar"), foot = d.querySelector("footer.foot");
  if (sb && foot && "IntersectionObserver" in window)
    new IntersectionObserver(function (es) { sb.classList.toggle("nearfoot", es[0].isIntersecting); }, { rootMargin: "0px 0px 80px 0px" }).observe(foot);
})();
