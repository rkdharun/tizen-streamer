/* Person (cast / crew): photo, bio, and their movies & shows. */
Screens.person = function (params) {
  var h = UI.h;
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "start" });
  var el = h("div", { class: "details person-page" }, [scroller]);
  scroller.appendChild(h("div", { class: "center-fill" }, [UI.spinner()]));

  function age(birthday, deathday) {
    if (!birthday) return "";
    var end = deathday ? new Date(deathday) : new Date();
    var b = new Date(birthday);
    var a = end.getFullYear() - b.getFullYear() - (end < new Date(end.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
    return deathday ? "Died at " + a : "Age " + a;
  }

  // Deduplicate credits (same title can appear as several roles) and keep posters only.
  function uniq(list) {
    var seen = {};
    return list.filter(function (c) {
      var k = c.media_type + ":" + c.id;
      if (seen[k] || !c.poster_path || !(c.media_type === "movie" || c.media_type === "tv")) return false;
      seen[k] = 1;
      return true;
    });
  }

  function byDate(a, b) {
    return (b.release_date || b.first_air_date || "").localeCompare(a.release_date || a.first_air_date || "");
  }

  function render(p) {
    scroller.innerHTML = "";
    var credits = p.combined_credits || {};
    var all = uniq((credits.cast || []).concat(credits.crew || []));
    var known = all.slice().sort(function (a, b) { return (b.vote_count || 0) - (a.vote_count || 0); }).slice(0, 20);
    var movies = all.filter(function (c) { return c.media_type === "movie"; }).sort(byDate);
    var shows = all.filter(function (c) { return c.media_type === "tv"; }).sort(byDate);

    var meta = [p.known_for_department, age(p.birthday, p.deathday), p.place_of_birth].filter(Boolean).join("   ·   ");
    scroller.appendChild(h("section", { class: "person-head", "data-scroll-anchor": "" }, [
      h("div", { class: "person-photo" }, [
        p.profile_path ? UI.lazyImg(TMDB.img(p.profile_path, "h632")) : h("div", { class: "initials", text: (p.name || "?").charAt(0) })
      ]),
      h("div", { class: "person-text" }, [
        h("h1", { class: "details-title", text: p.name }),
        h("div", { class: "details-meta", text: meta }),
        h("p", { class: "details-overview person-bio", text: p.biography || "No biography available." }),
        h("div", { class: "details-actions nav-group" }, [
          UI.button(movies.length + " movies · " + shows.length + " shows", "movie", function () {
            var row = scroller.querySelector(".row .card");
            if (row) Nav.focus(row);
          }, "autofocus")
        ])
      ])
    ]));

    var open = function (it) { App.push("details", { type: it.media_type, id: it.id }); };
    if (known.length) scroller.appendChild(UI.row("Known for", known, { onSelect: open }));
    if (movies.length) scroller.appendChild(UI.row("Movies", movies.slice(0, 40), { onSelect: open }));
    if (shows.length) scroller.appendChild(UI.row("TV Shows", shows.slice(0, 40), { onSelect: open }));
    Nav.focusFirst();
  }

  function load() {
    TMDB.person(params.id).then(render).catch(function (err) {
      scroller.innerHTML = "";
      scroller.appendChild(UI.message("Couldn't load person", err.message, UI.button("Retry", "reload", load, "autofocus")));
      Nav.focusFirst();
    });
  }
  load();

  return { el: el, fullscreen: true };
};
