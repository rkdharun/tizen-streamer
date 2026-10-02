/* TMDB API client. Accepts either a v3 API key or a v4 read access token. */
var TMDB = (function () {
  var cache = {};

  function apiKey() {
    return Store.getSetting("tmdbKey", "") || CONFIG.TMDB_API_KEY;
  }

  function get(path, params) {
    var key = apiKey();
    if (!key) return Promise.reject(new Error("NO_KEY"));

    var q = ["language=" + encodeURIComponent(CONFIG.LANGUAGE)];
    var isBearer = key.indexOf("eyJ") === 0;
    if (!isBearer) q.push("api_key=" + encodeURIComponent(key));
    if (params) {
      Object.keys(params).forEach(function (k) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
          q.push(k + "=" + encodeURIComponent(params[k]));
        }
      });
    }
    var url = CONFIG.TMDB_BASE + path + "?" + q.join("&");
    if (cache[url]) return Promise.resolve(cache[url]);

    var headers = { accept: "application/json" };
    if (isBearer) headers.Authorization = "Bearer " + key;

    return fetch(url, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error("TMDB " + res.status);
      return res.json();
    }).then(function (json) {
      cache[url] = json;
      return json;
    });
  }

  // Normalise list results so every item has media_type.
  function list(path, params, forcedType) {
    return get(path, params).then(function (data) {
      var results = (data.results || []).filter(function (r) {
        var t = forcedType || r.media_type;
        return (t === "movie" || t === "tv") && (r.poster_path || r.backdrop_path);
      }).map(function (r) {
        if (forcedType) r.media_type = forcedType;
        return r;
      });
      return { results: results, page: data.page, totalPages: data.total_pages };
    });
  }

  return {
    hasKey: function () { return !!apiKey(); },
    img: function (path, size) {
      return path ? CONFIG.IMG_BASE + (size || "w342") + path : "";
    },

    trending: function (type, page) { return list("/trending/" + (type || "all") + "/week", { page: page }, type === "all" ? null : type); },
    popular: function (type, page) { return list("/" + type + "/popular", { page: page }, type); },
    topRated: function (type, page) { return list("/" + type + "/top_rated", { page: page }, type); },
    nowPlaying: function (page) { return list("/movie/now_playing", { page: page }, "movie"); },
    onTheAir: function (page) { return list("/tv/on_the_air", { page: page }, "tv"); },
    discover: function (type, params) { return list("/discover/" + type, params, type); },
    anime: function (page, genre) {
      return list("/discover/tv", {
        page: page,
        with_genres: genre ? "16," + genre : "16",
        with_original_language: "ja",
        include_adult: "false",
        "vote_count.gte": 100,
        sort_by: "popularity.desc"
      }, "tv");
    },
    search: function (query, page) { return list("/search/multi", { query: query, page: page, include_adult: "false" }); },

    details: function (type, id) {
      return get("/" + type + "/" + id, {
        append_to_response: "external_ids,credits,recommendations,similar"
      }).then(function (d) { d.media_type = type; return d; });
    },
    season: function (id, seasonNumber) { return get("/tv/" + id + "/season/" + seasonNumber); },

    collection: function (id) {
      return get("/collection/" + id).then(function (c) {
        (c.parts || []).forEach(function (p) { p.media_type = "movie"; });
        // Release order; unreleased (no date) last
        c.parts = (c.parts || []).sort(function (a, b) {
          return (a.release_date || "9999").localeCompare(b.release_date || "9999");
        });
        return c;
      });
    },
    person: function (id) { return get("/person/" + id, { append_to_response: "combined_credits" }); },

    // Streaming services available in a region, most prominent first.
    providers: function (region) {
      return get("/watch/providers/movie", { watch_region: region }).then(function (d) {
        return (d.results || []).filter(function (p) { return p.logo_path; })
          .sort(function (a, b) { return (a.display_priority || 99) - (b.display_priority || 99); });
      });
    },
    byProvider: function (type, providerId, region, page) {
      return list("/discover/" + type, {
        page: page, with_watch_providers: providerId, watch_region: region,
        with_watch_monetization_types: "flatrate", sort_by: "popularity.desc"
      }, type);
    },
    genres: function (type) { return get("/genre/" + type + "/list").then(function (d) { return d.genres || []; }); }
  };
})();
