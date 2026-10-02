/* Streaming services: list of services in your region, and a page per service. */
var Services = (function () {
  var cache = {};

  // Services for the current region: preferred subscription services first.
  function list() {
    var region = Store.region();
    if (cache[region]) return Promise.resolve(cache[region]);
    return TMDB.providers(region).then(function (all) {
      var skip = CONFIG.SKIP_PROVIDERS, pref = CONFIG.PREFERRED_PROVIDERS;
      var ok = all.filter(function (p) { return skip.indexOf(p.provider_id) < 0; });
      var rank = function (p) { var i = pref.indexOf(p.provider_id); return i < 0 ? 100 + (p.display_priority || 99) : i; };
      ok.sort(function (a, b) { return rank(a) - rank(b); });
      cache[region] = ok;
      return ok;
    });
  }

  // Movies + shows on a service, interleaved by popularity.
  function popular(p, page) {
    var region = Store.region();
    return Promise.all([
      TMDB.byProvider("movie", p.provider_id, region, page).catch(function () { return { results: [] }; }),
      TMDB.byProvider("tv", p.provider_id, region, page).catch(function () { return { results: [] }; })
    ]).then(function (r) {
      var mixed = r[0].results.concat(r[1].results).sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
      return { results: mixed, page: page, totalPages: Math.max(r[0].totalPages || 1, r[1].totalPages || 1) };
    });
  }

  return { list: list, popular: popular };
})();

Screens.services = function () {
  var h = UI.h;
  var grid = h("div", { class: "grid services-grid nav-group", "data-no-memory": "" });
  var status = h("div", { class: "grid-status", text: "Loading…" });
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    h("div", { class: "page-head", "data-scroll-anchor": "" }, [
      h("h1", { text: "Streaming services" }),
      h("div", { class: "hint", text: "What's popular on each service in " + Store.region() + " · change the region in Settings" })
    ]),
    grid, status
  ]);
  Services.list().then(function (list) {
    status.textContent = list.length ? "" : "No services found for this region.";
    list.slice(0, 30).forEach(function (p) { grid.appendChild(UI.providerTile(p)); });
    if (!Nav.current() || !scroller.contains(Nav.current())) Nav.focusFirst();
  }).catch(function (err) { status.textContent = "Couldn't load services (" + err.message + ")"; });
  return { el: h("div", { class: "browse" }, [scroller]) };
};

Screens.provider = function (params) {
  var h = UI.h;
  var p = { provider_id: params.id, provider_name: params.name, logo_path: params.logo };
  var type = "all", page = 0, total = 1, loading = false, token = 0;

  var chips = h("div", { class: "chips nav-group", "data-scroll": "x" });
  var grid = h("div", { class: "grid nav-group", "data-no-memory": "" });
  var status = h("div", { class: "grid-status" });
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    h("div", { class: "page-head provider-head", "data-scroll-anchor": "" }, [
      h("div", { class: "provider-title" }, [
        params.logo ? UI.lazyImg(TMDB.img(params.logo, "w92"), "provider-logo") : null,
        h("h1", { text: params.name })
      ]),
      chips
    ]),
    grid, status
  ]);

  function fetchPage(n) {
    if (type === "all") return Services.popular(p, n);
    return TMDB.byProvider(type, p.provider_id, Store.region(), n);
  }

  function more() {
    if (loading || page >= total) return;
    loading = true;
    var t = token;
    status.textContent = "Loading…";
    fetchPage(page + 1).then(function (res) {
      if (t !== token) return;
      page = res.page || page + 1;
      total = Math.min(res.totalPages || 1, 100);
      res.results.forEach(function (it) {
        var c = UI.card(it);
        c.__onFocus = function () {
          if (Array.prototype.indexOf.call(grid.children, c) >= grid.children.length - 14) more();
        };
        grid.appendChild(c);
      });
      status.textContent = grid.children.length ? "" : "Nothing found on " + params.name + " in " + Store.region() + ".";
      loading = false;
    }).catch(function (err) { loading = false; status.textContent = "Couldn't load (" + err.message + ")"; });
  }

  function reset() { token++; page = 0; total = 1; loading = false; grid.innerHTML = ""; more(); }

  [["all", "Popular"], ["movie", "Movies"], ["tv", "TV Shows"]].forEach(function (c, i) {
    var chip = h("div", { class: "chip focusable" + (i === 0 ? " active autofocus" : ""), text: c[1] });
    chip.addEventListener("click", function () {
      var all = chips.querySelectorAll(".chip");
      for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
      chip.classList.add("active");
      type = c[0];
      reset();
    });
    chips.appendChild(chip);
  });
  reset();

  return { el: h("div", { class: "browse provider-page" }, [scroller]), fullscreen: true };
};
