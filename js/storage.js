/* Persistent state: settings, watchlist, continue-watching. */
var Store = (function () {
  var PREFIX = "reeltv.";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* storage full or unavailable */ }
  }

  // Minimal item shape kept in lists.
  function slim(item) {
    return {
      id: item.id,
      media_type: item.media_type,
      title: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date || ""
    };
  }

  function key(item) { return item.media_type + ":" + item.id; }

  return {
    getSetting: function (name, fallback) {
      var s = read("settings", {});
      return s.hasOwnProperty(name) ? s[name] : fallback;
    },
    setSetting: function (name, value) {
      var s = read("settings", {});
      s[name] = value;
      write("settings", s);
    },

    watchlist: function () { return read("watchlist", []); },
    inWatchlist: function (item) {
      var k = key(item);
      return this.watchlist().some(function (w) { return key(w) === k; });
    },
    toggleWatchlist: function (item) {
      var list = this.watchlist();
      var k = key(item);
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (key(list[i]) === k) idx = i;
      if (idx >= 0) list.splice(idx, 1);
      else list.unshift(slim(item));
      write("watchlist", list);
      return idx < 0;
    },

    history: function () { return read("history", []); },
    // progress: {season, episode} for TV
    pushHistory: function (item, progress) {
      var list = this.history();
      var k = key(item);
      list = list.filter(function (h) { return key(h) !== k; });
      var prev = this.history().filter(function (h) { return key(h) === k; })[0];
      var entry = slim(item);
      if (progress) { entry.season = progress.season; entry.episode = progress.episode; }
      var sameEp = prev && (!progress || (prev.season === progress.season && prev.episode === progress.episode));
      if (sameEp && prev.pos) { entry.pos = prev.pos; entry.dur = prev.dur; }
      entry.watchedAt = Date.now();
      list.unshift(entry);
      write("history", list.slice(0, 40));
    },
    lastProgress: function (item) {
      var k = key(item);
      var h = this.history().filter(function (x) { return key(x) === k; })[0];
      return h && h.season ? { season: h.season, episode: h.episode } : null;
    },
    // Playback position (seconds) for resume. ep = {season, episode} for TV.
    setPosition: function (item, ep, pos, dur) {
      var list = this.history();
      var k = key(item);
      for (var i = 0; i < list.length; i++) {
        if (key(list[i]) !== k) continue;
        if (ep && (list[i].season !== ep.season || list[i].episode !== ep.episode)) return;
        // Finished (last 3%)? Start from the beginning next time.
        list[i].pos = dur && pos > dur * 0.97 ? 0 : Math.floor(pos);
        list[i].dur = Math.floor(dur || 0);
        write("history", list);
        return;
      }
    },
    position: function (item, ep) {
      var k = key(item);
      var h = this.history().filter(function (x) { return key(x) === k; })[0];
      if (!h || !h.pos) return 0;
      if (ep && (h.season !== ep.season || h.episode !== ep.episode)) return 0;
      return h.pos;
    },
    removeHistory: function (item) {
      var k = key(item);
      write("history", this.history().filter(function (h) { return key(h) !== k; }));
    }
  };
})();
