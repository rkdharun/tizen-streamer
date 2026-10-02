/*
 * Stream + subtitle addons (Stremio addon protocol), for the built-in player.
 *   streams:   {base}/stream/{movie|series}/{imdb}[:{season}:{episode}].json -> {streams:[...]}
 *   subtitles: {base}/subtitles/{movie|series}/{id}.json                     -> {subtitles:[{id,url,lang}]}
 * Defaults come from CONFIG.STREAM_ADDONS (with optional limits); extras are added in Settings.
 */
var Addons = (function () {
  var TIMEOUT_MS = 15000;

  // "stremio://host/path/manifest.json" -> "https://host/path"
  function normalize(u) {
    u = String(u || "").trim();
    if (!u) return "";
    u = u.replace(/^stremio:\/\//i, "https://");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u.replace(/\/manifest\.json.*$/i, "").replace(/\/+$/, "");
  }

  // Built-in defaults (with optional limits) + the user's own addons from Settings.
  function defaults() {
    return (CONFIG.STREAM_ADDONS || []).map(function (a) {
      return typeof a === "string" ? { url: normalize(a) } :
        { url: normalize(a.url), name: a.name, maxYear: a.maxYear, movieOnly: a.movieOnly };
    }).filter(function (a) { return a.url; });
  }

  function userList() { return (Store.getSetting("addons", null) || []).map(normalize).filter(Boolean); }

  function all() {
    var out = defaults(), seen = {};
    out.forEach(function (a) { seen[a.url] = 1; });
    var info = Store.getSetting("addonInfo", {});
    userList().forEach(function (u) {
      if (seen[u]) return;
      seen[u] = 1;
      var i = info[u];
      if (i && i.stream === false) return;          // catalog/subtitle-only addon: nothing to play
      out.push({ url: u, name: i && i.name });
    });
    return out;
  }

  // Addons worth asking about this title (respects maxYear / movieOnly limits).
  function forItem(item, type) {
    var year = parseInt(String(item.release_date || item.first_air_date || "").slice(0, 4), 10);
    return all().filter(function (a) {
      if (a.movieOnly && type === "tv") return false;
      if (a.maxYear && (!year || year > a.maxYear)) return false;
      return true;
    });
  }

  function list() { return all().map(function (a) { return a.url; }); }

  function setFromText(text) {
    var defs = {};
    defaults().forEach(function (a) { defs[a.url] = 1; });
    var arr = String(text || "").split(/[\s,]+/).map(normalize).filter(function (u) { return u && !defs[u]; });
    Store.setSetting("addons", arr);
    return arr;
  }

  // Read each addon's manifest: does it serve streams? (Remembered per URL.)
  function inspect(urls) {
    var info = Store.getSetting("addonInfo", {});
    return Promise.all(urls.map(function (u) {
      return getJson(u + "/manifest.json").then(function (m) {
        var res = (m.resources || []).map(function (r) { return typeof r === "string" ? r : r && r.name; });
        var bh = m.behaviorHints || {};
        info[u] = { name: m.name || host(u), stream: res.indexOf("stream") >= 0, resources: res, needsSetup: !!bh.configurationRequired };
      }).catch(function () { info[u] = { name: host(u), stream: null, error: true }; });
    })).then(function () {
      Store.setSetting("addonInfo", info);
      return urls.map(function (u) { return { url: u, info: info[u] }; });
    });
  }

  function getJson(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error("timeout")); } }, TIMEOUT_MS);
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (j) { if (!done) { done = true; clearTimeout(t); resolve(j); } })
        .catch(function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  function stremioId(imdb, type, season, episode) {
    return type === "tv" ? imdb + ":" + season + ":" + episode : imdb;
  }

  function host(u) { var m = /^https?:\/\/([^\/]+)/.exec(u); return m ? m[1] : u; }

  // All directly playable streams from every addon, playable-looking ones first.
  function streams(imdb, type, season, episode, item) {
    var bases = (item ? forItem(item, type) : all()).map(function (a) { return a.url; });
    if (!bases.length || !imdb) return Promise.resolve([]);
    var id = stremioId(imdb, type, season, episode);
    var kind = type === "tv" ? "series" : "movie";
    return Promise.all(bases.map(function (base) {
      return getJson(base + "/stream/" + kind + "/" + encodeURIComponent(id) + ".json").then(function (j) {
        return (j.streams || []).filter(function (s) { return s && s.url && /^https?:/i.test(s.url); }).map(function (s) {
          var hints = s.behaviorHints || {};
          var headers = hints.proxyHeaders && hints.proxyHeaders.request;
          return {
            url: s.url,
            name: (s.name || host(base)).replace(/\s+/g, " ").trim(),
            title: String(s.description || s.title || "").split("\n")[0],
            addon: host(base),
            needsHeaders: !!(headers && Object.keys(headers).length),
            subtitles: s.subtitles || []
          };
        });
      }).catch(function () { return []; });
    })).then(function (groups) {
      var all = [].concat.apply([], groups);
      // Streams that need special request headers usually fail on Tizen: try them last.
      return all.filter(function (s) { return !s.needsHeaders; }).concat(all.filter(function (s) { return s.needsHeaders; }));
    });
  }

  function subtitles(imdb, type, season, episode, extra) {
    var id = stremioId(imdb, type, season, episode);
    var kind = type === "tv" ? "series" : "movie";
    var bases = (CONFIG.SUBTITLE_ADDONS || []).map(normalize);
    return Promise.all(bases.map(function (base) {
      return getJson(base + "/subtitles/" + kind + "/" + encodeURIComponent(id) + ".json")
        .then(function (j) { return j.subtitles || []; }).catch(function () { return []; });
    })).then(function (groups) {
      var all = (extra || []).concat([].concat.apply([], groups));
      return all.filter(function (s) { return s && s.url && s.lang; });
    });
  }

  // ISO 639-2/B/T (and Stremio's 'pob') -> display name; 2-letter -> 3-letter for defaults.
  var LANGS = {
    eng: "English", spa: "Spanish", fre: "French", fra: "French", ger: "German", deu: "German",
    ita: "Italian", por: "Portuguese", pob: "Portuguese (BR)", rus: "Russian", ara: "Arabic",
    hin: "Hindi", tam: "Tamil", tel: "Telugu", mal: "Malayalam", kan: "Kannada", ben: "Bengali",
    jpn: "Japanese", kor: "Korean", chi: "Chinese", zho: "Chinese", tur: "Turkish", pol: "Polish",
    dut: "Dutch", nld: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish", fin: "Finnish",
    cze: "Czech", ces: "Czech", ell: "Greek", gre: "Greek", heb: "Hebrew", hun: "Hungarian",
    rum: "Romanian", ron: "Romanian", ind: "Indonesian", may: "Malay", msa: "Malay", tha: "Thai",
    vie: "Vietnamese", ukr: "Ukrainian", slv: "Slovenian", srp: "Serbian", hrv: "Croatian",
    bul: "Bulgarian", ice: "Icelandic", isl: "Icelandic", per: "Persian", fas: "Persian"
  };
  var TWO = { en: "eng", es: "spa", fr: "fre", de: "ger", it: "ita", pt: "por", ru: "rus", ar: "ara",
    hi: "hin", ta: "tam", te: "tel", ml: "mal", kn: "kan", bn: "ben", ja: "jpn", ko: "kor", zh: "chi",
    tr: "tur", pl: "pol", nl: "dut", sv: "swe", no: "nor", da: "dan", fi: "fin", cs: "cze", el: "ell",
    he: "heb", hu: "hun", ro: "rum", id: "ind", ms: "may", th: "tha", vi: "vie", uk: "ukr" };

  function langName(code) { return LANGS[code] || TWO[code] && LANGS[TWO[code]] || String(code).toUpperCase(); }
  function lang3(code2) { return TWO[code2] || code2; }

  return { inspect: inspect, list: list, all: all, defaults: defaults, userList: userList, forItem: forItem, setFromText: setFromText, normalize: normalize, streams: streams, subtitles: subtitles, langName: langName, lang3: lang3 };
})();
