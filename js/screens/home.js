/* Home: hero banner + content rows. */
Screens.home = function () {
  var h = UI.h;
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "start" });
  var el = h("div", { class: "home" }, [scroller]);
  var heroItems = [], heroIndex = 0, heroTimer = null, heroEl = null;

  function buildHero(items) {
    heroItems = items.slice(0, 6);
    var bg = h("div", { class: "hero-bg" });
    var titleEl = h("h1", { class: "hero-title" });
    var metaEl = h("div", { class: "hero-meta" });
    var overview = h("p", { class: "hero-overview" });
    var dots = h("div", { class: "hero-dots" });
    heroItems.forEach(function () { dots.appendChild(h("span")); });

    var playBtn = UI.button("Watch now", "play", function () {
      var it = heroItems[heroIndex];
      App.push("details", { type: it.media_type, id: it.id, autoplay: true });
    }, "primary autofocus");
    var infoBtn = UI.button("More info", null, function () {
      var it = heroItems[heroIndex];
      App.push("details", { type: it.media_type, id: it.id });
    });

    heroEl = h("section", { class: "hero", "data-scroll-anchor": "" }, [
      bg,
      h("div", { class: "hero-shade" }),
      h("div", { class: "hero-content" }, [
        titleEl, metaEl, overview,
        h("div", { class: "hero-actions nav-group" }, [playBtn, infoBtn])
      ]),
      dots
    ]);

    function show(i) {
      heroIndex = (i + heroItems.length) % heroItems.length;
      var it = heroItems[heroIndex];
      bg.style.backgroundImage = "url(" + TMDB.img(it.backdrop_path, "w1280") + ")";
      titleEl.textContent = UI.title(it);
      metaEl.textContent = [UI.year(it), it.media_type === "tv" ? "TV Series" : "Movie",
        it.vote_average ? "★ " + it.vote_average.toFixed(1) : ""].filter(Boolean).join("   ·   ");
      overview.textContent = it.overview || "";
      for (var d = 0; d < dots.children.length; d++) dots.children[d].classList.toggle("on", d === heroIndex);
    }
    heroEl.__show = show;
    show(0);
    startRotation();
    return heroEl;
  }

  function startRotation() {
    clearInterval(heroTimer);
    heroTimer = setInterval(function () {
      // Only rotate while the user is not on the hero buttons
      var c = Nav.current();
      if (heroEl && !(c && heroEl.contains(c)) && el.style.display !== "none") heroEl.__show(heroIndex + 1);
    }, 9000);
  }

  var rows = [
    { title: "Trending this week", fn: function (p) { return TMDB.trending("all", p); }, landscape: true },
    { title: "Popular Movies", fn: function (p) { return TMDB.popular("movie", p); } },
    { title: "Popular TV Shows", fn: function (p) { return TMDB.popular("tv", p); } },
    { title: "Popular Anime", fn: function (p) { return TMDB.anime(p); } },
    { title: "Now in Theatres", fn: function (p) { return TMDB.nowPlaying(p); } },
    { title: "Top Rated Movies", fn: function (p) { return TMDB.topRated("movie", p); } },
    { title: "Top Rated TV", fn: function (p) { return TMDB.topRated("tv", p); } },
    { title: "On the Air", fn: function (p) { return TMDB.onTheAir(p); } }
  ];

  function continueRow() {
    var hist = Store.history();
    if (!hist.length) return null;
    var r = UI.row("Continue watching", hist.slice(0, 20), {
      landscape: true,
      onSelect: function (it) {
        App.push("details", { type: it.media_type, id: it.id, autoplay: true });
      }
    });
    // Progress label for TV entries
    var cards = r.querySelectorAll(".card");
    hist.slice(0, 20).forEach(function (it, i) {
      if (it.season) cards[i].querySelector(".card-meta").textContent = "S" + it.season + " · E" + it.episode;
    });
    r.classList.add("continue-row");
    return r;
  }

  function load() {
    scroller.innerHTML = "";
    var placeholders = rows.map(function (r) { return UI.placeholderRow(r.title); });
    var heroSlot = h("section", { class: "hero skeleton-hero", "data-scroll-anchor": "" });
    scroller.appendChild(heroSlot);
    var cont = continueRow();
    if (cont) scroller.appendChild(cont);
    placeholders.forEach(function (p) { scroller.appendChild(p); });

    rows.forEach(function (r, i) {
      r.fn(1).then(function (res) {
        if (i === 0) {
          var hero = buildHero(res.results);
          scroller.replaceChild(hero, heroSlot);
          var cur = Nav.current();
          if (!cur || !document.body.contains(cur) || !el.contains(cur)) Nav.focusFirst();
        }
        var row = UI.row(r.title, res.results, {
          landscape: r.landscape,
          loadMore: r.fn
        });
        scroller.replaceChild(row, placeholders[i]);
      }).catch(function (err) {
        if (i === 0) {
          scroller.innerHTML = "";
          scroller.appendChild(UI.message("Couldn't load content",
            err.message === "NO_KEY" ? "Add a TMDB API key in Settings." : "Check the network connection. (" + err.message + ")",
            UI.button("Retry", "reload", load, "autofocus")));
          Nav.focusFirst();
        } else if (placeholders[i].parentNode) {
          scroller.removeChild(placeholders[i]);
        }
      });
    });
  }

  load();

  return {
    el: el,
    onShow: function (first) {
      if (first) return;
      // Refresh "Continue watching" after returning from the player
      var old = scroller.querySelector(".continue-row");
      var fresh = continueRow();
      if (old && fresh) scroller.replaceChild(fresh, old);
      else if (!old && fresh && scroller.children[0]) scroller.insertBefore(fresh, scroller.children[1] || null);
    },
    onKey: function (key) {
      if (key === "chup" || key === "chdown") {
        // Jump a whole row with CH+/CH-
        Nav.move(key === "chup" ? "up" : "down");
        return true;
      }
      return false;
    },
    destroy: function () { clearInterval(heroTimer); }
  };
};
