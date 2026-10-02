/* Details: backdrop, info, actions, seasons/episodes (TV), recommendations. */
Screens.details = function (params) {
  var h = UI.h;
  var type = params.type, id = params.id;
  var data = null;

  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "start" });
  var bg = h("div", { class: "details-bg" });
  var el = h("div", { class: "details" }, [bg, h("div", { class: "details-shade" }), scroller]);
  scroller.appendChild(h("div", { class: "center-fill" }, [UI.spinner()]));

  var seasonState = { season: 1, episodes: [] };
  var episodesRow = null, seasonChips = null, playBtn = null;

  function meta(d) {
    var parts = [];
    var y = UI.year(d); if (y) parts.push(y);
    if (type === "movie" && d.runtime) parts.push(Math.floor(d.runtime / 60) + "h " + (d.runtime % 60) + "m");
    if (type === "tv" && d.number_of_seasons) parts.push(d.number_of_seasons + " Season" + (d.number_of_seasons > 1 ? "s" : ""));
    if (d.vote_average) parts.push("★ " + d.vote_average.toFixed(1));
    if (d.genres && d.genres.length) parts.push(d.genres.slice(0, 3).map(function (g) { return g.name; }).join(", "));
    return parts.join("   ·   ");
  }

  function play(season, episode) {
    App.push("player", {
      item: data,
      type: type,
      season: season,
      episode: episode,
      seasons: type === "tv" ? (data.seasons || []).filter(function (s) { return s.season_number > 0; }) : null
    });
  }

  function resumeTarget() {
    var p = Store.lastProgress({ id: id, media_type: type });
    return p || { season: firstSeason(), episode: 1 };
  }

  function firstSeason() {
    var s = (data.seasons || []).filter(function (x) { return x.season_number > 0; })[0];
    return s ? s.season_number : 1;
  }

  function updatePlayLabel() {
    if (!playBtn) return;
    var label = playBtn.querySelector(".btn-label");
    if (type === "movie") { label.textContent = "Play"; return; }
    var p = Store.lastProgress({ id: id, media_type: type });
    label.textContent = p ? "Resume S" + p.season + " E" + p.episode : "Play S" + firstSeason() + " E1";
  }

  function render(d) {
    data = d;
    bg.style.backgroundImage = d.backdrop_path ? "url(" + TMDB.img(d.backdrop_path, "w1280") + ")" : "";
    scroller.innerHTML = "";

    playBtn = UI.button("Play", "play", function () {
      if (type === "movie") play();
      else { var r = resumeTarget(); play(r.season, r.episode); }
    }, "primary autofocus");

    var listBtn = UI.button(Store.inWatchlist(d) ? "In My List" : "My List", Store.inWatchlist(d) ? "check" : "plus", function () {
      var added = Store.toggleWatchlist(d);
      listBtn.querySelector(".btn-label").textContent = added ? "In My List" : "My List";
      listBtn.replaceChild(UI.icon(added ? "check" : "plus"), listBtn.querySelector(".icon"));
      UI.toast(added ? "Added to My List" : "Removed from My List");
    });

    var actions = h("div", { class: "details-actions nav-group" }, [playBtn, listBtn]);
    var tagline = d.tagline ? h("div", { class: "tagline", text: d.tagline }) : null;
    var cast = (d.credits && d.credits.cast || []).slice(0, 5).map(function (c) { return c.name; }).join(", ");

    scroller.appendChild(h("section", { class: "details-info", "data-scroll-anchor": "" }, [
      h("h1", { class: "details-title", text: UI.title(d) }),
      h("div", { class: "details-meta", text: meta(d) }),
      tagline,
      h("p", { class: "details-overview", text: d.overview || "" }),
      cast ? h("div", { class: "details-cast", text: "Starring: " + cast }) : null,
      actions
    ]));
    updatePlayLabel();

    if (type === "tv") buildSeasons(d);

    var recs = ((d.recommendations && d.recommendations.results) || []).concat(
      (d.similar && d.similar.results) || []).filter(function (r) { return r.poster_path; });
    var seen = {};
    recs = recs.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; r.media_type = r.media_type || type; return true; }).slice(0, 20);
    if (recs.length) {
      scroller.appendChild(UI.row("More like this", recs, {
        onSelect: function (it) { App.push("details", { type: it.media_type, id: it.id }); }
      }));
    }

    Nav.focusFirst();
    if (params.autoplay) { params.autoplay = false; playBtn.click(); }
  }

  function buildSeasons(d) {
    var seasons = (d.seasons || []).filter(function (s) { return s.season_number > 0 && s.episode_count > 0; });
    if (!seasons.length) return;
    var p = Store.lastProgress({ id: id, media_type: type });
    seasonState.season = p ? p.season : seasons[0].season_number;

    seasonChips = h("div", { class: "chips nav-group", "data-scroll": "x" });
    seasons.forEach(function (s) {
      var c = h("div", { class: "chip focusable" + (s.season_number === seasonState.season ? " active" : ""), text: s.name || "Season " + s.season_number });
      c.addEventListener("click", function () {
        var all = seasonChips.querySelectorAll(".chip");
        for (var i = 0; i < all.length; i++) all[i].classList.remove("active");
        c.classList.add("active");
        loadSeason(s.season_number);
      });
      seasonChips.appendChild(c);
    });
    // Keep the active season remembered for D-pad memory
    seasonChips.__last = seasonChips.querySelector(".chip.active");

    episodesRow = h("div", { class: "row-track episodes nav-group", "data-scroll": "x" });
    scroller.appendChild(h("section", { class: "row season-block", "data-scroll-anchor": "" }, [
      h("h2", { class: "row-title", text: "Episodes" }), seasonChips, episodesRow
    ]));
    loadSeason(seasonState.season);
  }

  function loadSeason(n) {
    seasonState.season = n;
    episodesRow.innerHTML = "";
    episodesRow.scrollLeft = 0;
    episodesRow.__last = null;
    episodesRow.appendChild(h("div", { class: "card landscape skeleton" }, [h("div", { class: "card-img" })]));
    TMDB.season(id, n).then(function (s) {
      if (seasonState.season !== n) return;
      episodesRow.innerHTML = "";
      var p = Store.lastProgress({ id: id, media_type: type });
      var today = new Date().toISOString().slice(0, 10);
      (s.episodes || []).forEach(function (ep) {
        var unaired = ep.air_date && ep.air_date > today;
        var watchedHere = p && p.season === n && p.episode === ep.episode_number;
        var c = h("div", { class: "card landscape episode focusable" + (unaired ? " unaired" : "") + (watchedHere ? " current" : "") }, [
          h("div", { class: "card-img" }, [
            UI.lazyImg(TMDB.img(ep.still_path || data.backdrop_path, "w500")),
            h("div", { class: "ep-num", text: "E" + ep.episode_number }),
            watchedHere ? h("div", { class: "card-progress", text: "Last watched" }) : null
          ]),
          h("div", { class: "card-title", text: ep.name || "Episode " + ep.episode_number }),
          h("div", { class: "card-meta", text: unaired ? "Airs " + ep.air_date : (ep.runtime ? ep.runtime + " min" : (ep.air_date || "")) })
        ]);
        c.addEventListener("click", function () { play(n, ep.episode_number); });
        episodesRow.appendChild(c);
        if (watchedHere) episodesRow.__last = c;
      });
    }).catch(function () {
      episodesRow.innerHTML = "";
      episodesRow.appendChild(h("div", { class: "grid-status", text: "Couldn't load episodes." }));
    });
  }

  function load() {
    TMDB.details(type, id).then(render).catch(function (err) {
      scroller.innerHTML = "";
      scroller.appendChild(UI.message("Couldn't load title", err.message, UI.button("Retry", "reload", load, "autofocus")));
      Nav.focusFirst();
    });
  }
  load();

  return {
    el: el,
    fullscreen: true,
    onShow: function (first) {
      if (first || !data) return;
      updatePlayLabel();
      // Refresh the "last watched" marker after returning from the player
      var p = Store.lastProgress({ id: id, media_type: type });
      if (episodesRow && p) {
        // Switch to (and re-render) the season of the last watched episode
        var chips = seasonChips.querySelectorAll(".chip");
        var seasons = (data.seasons || []).filter(function (s) { return s.season_number > 0 && s.episode_count > 0; });
        seasons.forEach(function (s, idx) {
          var on = s.season_number === p.season;
          chips[idx].classList.toggle("active", on);
          if (on) seasonChips.__last = chips[idx];
        });
        loadSeason(p.season);
      }
    },
    onKey: function (key) {
      if (key === "green" && data) {   // Green = toggle My List
        var added = Store.toggleWatchlist(data);
        UI.toast(added ? "Added to My List" : "Removed from My List");
        return true;
      }
      return false;
    }
  };
};
