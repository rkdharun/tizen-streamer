/* Collections (franchises): grid of curated collections, and a page per collection. */
var Collections = (function () {
  var cache = {};

  // Resolve a collection id to {id, name, poster_path, backdrop_path, count}.
  function info(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return TMDB.collection(id).then(function (c) {
      cache[id] = { id: c.id, name: c.name, poster_path: c.poster_path, backdrop_path: c.backdrop_path, count: (c.parts || []).length };
      return cache[id];
    });
  }

  // Fill a container with collection cards in curated order as they resolve.
  function fill(container, ids) {
    var slots = ids.map(function () {
      var s = UI.h("div", { class: "card landscape skeleton" }, [UI.h("div", { class: "card-img" })]);
      container.appendChild(s);
      return s;
    });
    ids.forEach(function (id, i) {
      info(id).then(function (c) {
        if (slots[i].parentNode) container.replaceChild(UI.collectionCard(c), slots[i]);
      }).catch(function () {
        if (slots[i].parentNode) container.removeChild(slots[i]);
      });
    });
  }

  return { info: info, fill: fill };
})();

Screens.collections = function () {
  var h = UI.h;
  var grid = h("div", { class: "grid collections-grid nav-group", "data-no-memory": "" });
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    h("div", { class: "page-head", "data-scroll-anchor": "" }, [
      h("h1", { text: "Collections" }),
      h("div", { class: "hint", text: "Franchises in release order" })
    ]),
    grid
  ]);
  Collections.fill(grid, CONFIG.COLLECTIONS);
  return { el: h("div", { class: "browse" }, [scroller]) };
};

Screens.collection = function (params) {
  var h = UI.h;
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "start" });
  var bg = h("div", { class: "details-bg" });
  var el = h("div", { class: "details" }, [bg, h("div", { class: "details-shade" }), scroller]);
  scroller.appendChild(h("div", { class: "center-fill" }, [UI.spinner()]));

  function render(c) {
    scroller.innerHTML = "";
    if (c.backdrop_path) {
      var url = TMDB.img(c.backdrop_path, "w1280"), pre = new Image();
      pre.onload = function () { bg.style.backgroundImage = "url(" + url + ")"; bg.classList.add("on"); };
      pre.src = url;
    }
    var parts = c.parts || [];
    var released = parts.filter(function (p) { return p.release_date && p.release_date <= new Date().toISOString().slice(0, 10); });
    var years = released.length ? UI.year(released[0]) + "–" + UI.year(released[released.length - 1]) : "";

    // "Start watching": first part not yet in history, else the first part.
    var hist = Store.history();
    var next = released.filter(function (p) {
      return !hist.some(function (x) { return x.media_type === "movie" && x.id === p.id; });
    })[0] || released[0] || parts[0];

    var actions = h("div", { class: "details-actions nav-group" }, [
      next ? UI.button(next === released[0] ? "Start from the first" : "Continue: " + UI.title(next), "play", function () {
        App.push("details", { type: "movie", id: next.id, autoplay: true });
      }, "primary autofocus") : null
    ]);

    scroller.appendChild(h("section", { class: "details-info", "data-scroll-anchor": "" }, [
      h("h1", { class: "details-title", text: c.name }),
      h("div", { class: "details-meta", text: [parts.length + " movies", years].filter(Boolean).join("   ·   ") }),
      h("p", { class: "details-overview", text: c.overview || "" }),
      actions
    ]));
    var row = UI.row("In release order", parts, {
      onSelect: function (it) { App.push("details", { type: "movie", id: it.id }); }
    });
    // Number the parts
    var cards = row.querySelectorAll(".card");
    parts.forEach(function (p, i) { cards[i].querySelector(".card-meta").textContent = "#" + (i + 1) + " · " + (UI.year(p) || "TBA"); });
    scroller.appendChild(row);
    Nav.focusFirst();
  }

  function load() {
    TMDB.collection(params.id).then(render).catch(function (err) {
      scroller.innerHTML = "";
      scroller.appendChild(UI.message("Couldn't load collection", err.message, UI.button("Retry", "reload", load, "autofocus")));
      Nav.focusFirst();
    });
  }
  load();

  return { el: el, fullscreen: true };
};
