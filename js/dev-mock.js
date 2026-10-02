/* Dev only: open index.html?mock to try the UI without a TMDB key (fake data, no images). */
(function () {
  if (location.search.indexOf("mock") < 0) return;

  function items(type, n, off) {
    var r = [];
    for (var i = 0; i < n; i++) {
      var id = off + i + 1;
      r.push({
        id: id, media_type: type,
        title: type === "movie" ? "Movie " + id : undefined,
        name: type === "tv" ? "Show " + id : undefined,
        poster_path: "/p" + id + ".jpg", backdrop_path: "/b" + id + ".jpg",
        vote_average: 7.3, release_date: "2024-01-01", first_air_date: "2023-05-01",
        overview: "Overview for item " + id + ". A thrilling tale of something happening to someone somewhere."
      });
    }
    return r;
  }

  function respond(url) {
    var page = +((url.match(/page=(\d+)/) || [0, 1])[1]);
    if (url.indexOf("/genre/") >= 0) return { genres: [{ id: 28, name: "Action" }, { id: 35, name: "Comedy" }, { id: 18, name: "Drama" }] };
    if (/\/tv\/\d+\/season\//.test(url)) {
      return { episodes: [1, 2, 3, 4, 5, 6, 7, 8].map(function (e) { return { episode_number: e, name: "Episode " + e, runtime: 45, air_date: "2023-01-0" + e }; }) };
    }
    var m = url.match(/\/(movie|tv)\/(\d+)\?/);
    if (m) {
      var t = m[1], id = +m[2];
      return {
        id: id, title: t === "movie" ? "Movie " + id : undefined, name: t === "tv" ? "Show " + id : undefined,
        overview: "Long overview.", vote_average: 8.1, runtime: 128, genres: [{ name: "Drama" }, { name: "Action" }],
        release_date: "2024-03-01", first_air_date: "2022-03-01", number_of_seasons: 2,
        seasons: [{ season_number: 0, episode_count: 2, name: "Specials" }, { season_number: 1, episode_count: 8, name: "Season 1" }, { season_number: 2, episode_count: 8, name: "Season 2" }],
        external_ids: { imdb_id: "tt0137523" }, credits: { cast: [{ name: "Actor A" }, { name: "Actor B" }] },
        recommendations: { results: items(t, 10, 100) }, similar: { results: [] }
      };
    }
    var type = /\/tv\/|discover\/tv/.test(url) ? "tv" : /\/movie/.test(url) ? "movie" : null;
    var res = type ? items(type, 20, (page - 1) * 20) : items("movie", 10, (page - 1) * 20).concat(items("tv", 10, (page - 1) * 20 + 10));
    return { page: page, total_pages: 5, results: res };
  }

  window.fetch = function (url) {
    var json = respond(String(url));
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(json); } });
  };
  try { localStorage.setItem("reeltv.settings", JSON.stringify({ tmdbKey: "mock" })); } catch (e) {}
})();
