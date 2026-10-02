/*
 * Spatial focus engine for D-pad navigation.
 *
 * - Focusable elements: any element with class "focusable" inside the current root.
 * - Groups: an ancestor with class "nav-group" remembers its last focused child, so
 *   moving back into a row/sidebar restores the previous position (TV convention).
 * - Scroll containers: ancestors with data-scroll="x" or "y" are scrolled to keep the
 *   focused element visible. data-scroll-anchor marks what to align in "y" containers.
 */
var Nav = (function () {
  var root = document.body;
  var current = null;
  var PAD = 60;

  function isVisible(el) {
    if (!el || !document.body.contains(el)) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
    if (el.classList.contains("disabled")) return false;
    return true;
  }

  function focusables() {
    var list = root.querySelectorAll(".focusable");
    var out = [];
    for (var i = 0; i < list.length; i++) if (isVisible(list[i])) out.push(list[i]);
    return out;
  }

  function group(el) { return el ? el.closest(".nav-group") : null; }

  /*
   * Scrolling uses GPU transforms instead of scrollLeft/scrollTop: an element with
   * data-scroll is the *moving content*, its parent is the clipping viewport.
   * Positions are measured relative to the moving element itself, so values stay
   * correct even while a previous transition is still animating.
   */
  function setOffset(node, axis, off) {
    if (node.__off === off) return;
    node.__off = off;
    node.style.transform = axis === "x" ? "translate3d(" + (-off) + "px,0,0)" : "translate3d(0," + (-off) + "px,0)";
  }

  function resetScroll(node) {
    node.__off = 0;
    node.style.transform = "";
  }

  function ensureVisible(el) {
    var k = 1 / (window.__scale || 1);   // rects are scaled on desktop, layout px are not
    var node = el.parentElement;
    while (node && node !== document.body) {
      var axis = node.getAttribute && node.getAttribute("data-scroll");
      if (axis) {
        var clip = node.parentElement;
        var nr = node.getBoundingClientRect();
        var target = el;
        if (axis === "y") {
          var anchor = el.closest("[data-scroll-anchor]");
          if (anchor && node.contains(anchor)) target = anchor;
        }
        var r = target.getBoundingClientRect();
        var x = axis === "x";
        var pos = ((x ? r.left - nr.left : r.top - nr.top)) * k;      // position inside content
        var size = (x ? r.width : r.height) * k;
        var base = node.offsetParent === clip ? (x ? node.offsetLeft : node.offsetTop) : 0;
        var view = x ? clip.clientWidth : clip.clientHeight;
        var extent = x ? node.scrollWidth : node.scrollHeight;
        var off = node.__off || 0;
        var mode = x ? "nearest" : (node.getAttribute("data-scroll-mode") || "start");

        if (mode === "start") {
          // Classic TV rows: focused row sits near the top; first row stays at 0.
          off = target === node.firstElementChild ? 0 : base + pos - PAD;
        } else {
          var screenPos = base + pos - off;
          if (screenPos < PAD) off = base + pos - PAD;
          else if (screenPos + size > view - PAD) off = base + pos + size - view + PAD;
        }
        var max = Math.max(0, base + extent - view);
        setOffset(node, axis, Math.round(Math.max(0, Math.min(off, max))));
      }
      node = node.parentElement;
    }
  }

  function focus(el, opts) {
    if (!el) return;
    if (current && current !== el) {
      current.classList.remove("focused");
      if (current.__onBlur) current.__onBlur();
    }
    current = el;
    el.classList.add("focused");
    var g = group(el);
    if (g) g.__last = el;
    if (primary && primary.contains(el)) primary.__last = el;
    if (!opts || !opts.noScroll) ensureVisible(el);
    if (el.__onFocus) el.__onFocus();
  }

  function centre(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function findBest(dir, pool) {
    var from = current.getBoundingClientRect();
    var fc = centre(from);
    var best = null, bestScore = Infinity;

    pool.forEach(function (el) {
      if (el === current) return;
      var r = el.getBoundingClientRect();
      var c = centre(r);
      var primary, secondary;
      switch (dir) {
        case "right":
          if (c.x <= fc.x + 1 || r.left < from.left + 1) return;
          primary = Math.max(0, r.left - from.right); secondary = Math.abs(c.y - fc.y); break;
        case "left":
          if (c.x >= fc.x - 1 || r.right > from.right - 1) return;
          primary = Math.max(0, from.left - r.right); secondary = Math.abs(c.y - fc.y); break;
        case "down":
          if (c.y <= fc.y + 1 || r.top < from.top + 1) return;
          primary = Math.max(0, r.top - from.bottom); secondary = Math.abs(c.x - fc.x); break;
        case "up":
          if (c.y >= fc.y - 1 || r.bottom > from.bottom - 1) return;
          primary = Math.max(0, from.top - r.bottom); secondary = Math.abs(c.x - fc.x); break;
      }
      var score = primary + secondary * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function move(dir) {
    if (!current || !root.contains(current) || !isVisible(current)) {
      focusFirst();
      return true;
    }
    // Per-element override: data-nav-<dir>="#selector" or "none"
    var override = current.getAttribute("data-nav-" + dir);
    if (override === "none") return false;
    if (override) {
      var target = root.querySelector(override);
      if (target) {
        var tg = target.classList.contains("nav-group") ? target : null;
        focus(tg && tg.__last && isVisible(tg.__last) ? tg.__last
              : tg ? tg.querySelector(".focusable") : target);
        return true;
      }
    }

    // Leaving a group marked data-return-<dir>="primary" (the sidebar) goes back to
    // wherever the user last was on the current screen.
    var cg = group(current);
    if (cg && cg.getAttribute("data-return-" + dir) === "primary" && primary &&
        primary.__last && primary.contains(primary.__last) && isVisible(primary.__last)) {
      focus(primary.__last);
      return true;
    }

    // Left/right: try the current row/group first; only scan the whole screen if needed.
    var best = null;
    if ((dir === "left" || dir === "right") && cg) {
      var inGroup = [];
      var nodes = cg.querySelectorAll(".focusable");
      for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i])) inGroup.push(nodes[i]);
      best = findBest(dir, inGroup);
    }
    if (!best) best = findBest(dir, focusables());
    if (!best) return false;

    var curGroup = group(current), bestGroup = group(best);
    if (bestGroup && bestGroup !== curGroup && bestGroup.__last &&
        bestGroup.contains(bestGroup.__last) && isVisible(bestGroup.__last) &&
        !bestGroup.hasAttribute("data-no-memory")) {
      best = bestGroup.__last;
    }
    focus(best);
    return true;
  }

  // Prefer the active screen's content over the sidebar when picking a default.
  var primary = null;
  function focusFirst() {
    var scope = primary && root.contains(primary) ? primary : root;
    var prefs = scope.querySelectorAll(".focusable.autofocus");
    for (var i = 0; i < prefs.length; i++) if (isVisible(prefs[i])) { focus(prefs[i]); return; }
    var all = focusables();
    for (var j = 0; j < all.length; j++) if (scope.contains(all[j])) { focus(all[j]); return; }
    if (all[0]) focus(all[0]);
  }

  // Pointer (Samsung Smart Remote / mouse) support: hover moves focus.
  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest && e.target.closest(".focusable");
    if (el && root.contains(el) && el !== current) focus(el, { noScroll: true });
  });

  return {
    setRoot: function (el, keepFocus) {
      root = el || document.body;
      if (!keepFocus) current = null;
    },
    getRoot: function () { return root; },
    setPrimary: function (el) { primary = el; },
    focus: focus,
    focusFirst: focusFirst,
    move: move,
    current: function () { return current; },
    restoreOr: function (el) {
      if (el && root.contains(el) && isVisible(el)) focus(el); else focusFirst();
    },
    ensureVisible: ensureVisible,
    resetScroll: resetScroll
  };
})();
