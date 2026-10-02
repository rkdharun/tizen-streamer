/* Movies / TV Shows / Anime: genre filter chips + infinite poster grid. */
function BrowseScreen(kind) {
  var h = UI.h;
  var type = kind === "movies" ? "movie" : "tv";
  var heading = { movies: "Movies", tv: "TV Shows", anime: "Anime" }[kind];

  var chips = h("div", { class: "chips nav-group", "data-scroll": "x" });
  var grid = h("div", { class: "grid nav-group", "data-no-memory": "" });
  var status = h("div", { class: "grid-status" });
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    h("div", { class: "page-head", "data-scroll-anchor": "" }, [h("h1", { text: heading }), chips]),
    grid, status
  ]);
  var el = h("div", { class: "browse" }, [scroller]);

  var state = { genre: null, sort: "popular", page: 0, total: 1, loading: false, token: 0 };

  function fetchPage(page) {
    if (kind === "anime") return TMDB.anime(page, state.genre);
    if (state.genre) {
      return TMDB.discover(type, { page: page, with_genres: state.genre, sort_by: "popularity.desc", "vote_count.gte": 50 });
    }
    if (state.sort === "top") return TMDB.topRated(type, page);
    if (state.sort === "trending") return TMDB.trending(type, page);
    return TMDB.popular(type, page);
  }

  function loadMore() {
    if (state.loading || state.page >= state.total) return;
    state.loading = true;
    var token = state.token;
    status.textContent = "Loading…";
    fetchPage(state.page + 1).then(function (res) {
      if (token !== state.token) return;
      state.page = res.page || state.page + 1;
      state.total = Math.min(res.totalPages || 1, 500);
      res.results.forEach(function (it) {
        var c = UI.card(it);
        c.__onFocus = maybeLoad;
        grid.appendChild(c);
      });
      status.textContent = grid.children.length ? "" : "Nothing found.";
      state.loading = false;
    }).catch(function (err) {
      state.loading = false;
      status.textContent = "Couldn't load (" + err.message + ")";
    });
  }

  function maybeLoad() {
    var c = Nav.current();
    var idx = Array.prototype.indexOf.call(grid.children, c);
    if (idx >= grid.children.length - 14) loadMore();
  }

  function reset() {
    state.token++;
    state.page = 0; state.total = 1; state.loading = false;
    grid.innerHTML = "";
    loadMore();
  }

  function chip(label, active, onPick) {
    var c = h("div", { class: "chip focusable" + (active ? " active" : ""), text: label });
    c.addEventListener("click", function () {
      var all = chips.querySelectorAll(".chip");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("active");
      c.classList.add("active");
      onPick();
      reset();
    });
    return c;
  }

  function buildChips(genres) {
    chips.innerHTML = "";
    if (kind === "anime") {
      chips.appendChild(chip("All", true, function () { state.genre = null; }));
    } else {
      chips.appendChild(chip("Popular", true, function () { state.genre = null; state.sort = "popular"; }));
      chips.appendChild(chip("Trending", false, function () { state.genre = null; state.sort = "trending"; }));
      chips.appendChild(chip("Top Rated", false, function () { state.genre = null; state.sort = "top"; }));
    }
    genres.forEach(function (g) {
      if (kind === "anime" && g.id === 16) return;
      chips.appendChild(chip(g.name, false, function () { state.genre = g.id; }));
    });
    chips.firstChild.classList.add("autofocus");
  }

  buildChips([]);
  TMDB.genres(type).then(function (genres) {
    var focusedChip = Nav.current() && chips.contains(Nav.current());
    buildChips(genres);
    if (focusedChip) Nav.focus(chips.firstChild);
  }).catch(function () {});
  reset();

  return {
    el: el,
    onKey: function (key) {
      if (key === "chup" || key === "chdown") {
        for (var i = 0; i < 3; i++) Nav.move(key === "chup" ? "up" : "down");
        return true;
      }
      return false;
    }
  };
}

Screens.movies = function () { return BrowseScreen("movies"); };
Screens.tv = function () { return BrowseScreen("tv"); };
Screens.anime = function () { return BrowseScreen("anime"); };
