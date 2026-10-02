/*
 * Built-in player: plays direct streams from your addons in our own <video> (hls.js for HLS),
 * so every control is ours and works with the remote:
 *   OK play/pause · ◀ ▶ seek (accelerates) · FF/REW ±30s · ▲▼ menu · CH± next/prev episode
 * Menu: Subtitles (OpenSubtitles + stream subs) · Quality · Audio · Streams · Embed sources.
 * If no addon returns a playable stream, it falls back to the embed player.
 */
Screens.watch = function (params) {
  var h = UI.h;
  var item = params.item, type = params.type;
  var season = params.season || 1, episode = params.episode || 1;
  var seasons = params.seasons || [];
  var imdb = (item.external_ids && item.external_ids.imdb_id) || item.imdb_id || "";

  var video = h("video", { class: "watch-video", preload: "auto", playsinline: true });
  var loader = h("div", { class: "player-loader" }, [UI.spinner(), h("div", { class: "loader-text", text: "Finding streams…" })]);

  var osdIcon = h("span", { class: "osd-icon" });
  var osdSeek = h("span", { class: "osd-seek" });
  var osdTime = h("span", { class: "osd-time" });
  var osdFill = h("div", { class: "osd-fill" });
  var osdBuf = h("div", { class: "osd-buf" });
  var osd = h("div", { class: "rc-osd" }, [
    h("div", { class: "osd-row" }, [osdIcon, osdSeek, osdTime]),
    h("div", { class: "osd-bar" }, [osdBuf, osdFill])
  ]);

  var titleEl = h("div", { class: "pl-title", text: UI.title(item) });
  var subEl = h("div", { class: "pl-sub" });
  var infoEl = h("div", { class: "pl-source" });
  var controls = h("div", { class: "pl-controls nav-group" });
  var panel = h("div", { class: "source-panel nav-group" });
  var menu = h("div", { class: "pl-overlay" }, [
    h("div", { class: "pl-top" }, [titleEl, subEl]),
    h("div", { class: "pl-bottom" }, [infoEl, controls, panel])
  ]);
  var holder = h("div", { class: "player watch", tabindex: "-1" }, [loader, video, osd, menu]);

  var hls = null, streams = [], streamIdx = -1, subs = [], subIdx = -1, subTrack = null;
  var pendingSeek = null, sendTimer = null, osdTimer = null, menuTimer = null, saveTimer = null;
  var holdStart = 0, episodeName = "", destroyed = false, startAt = 0;

  // ---------- helpers ----------
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
    return (hh ? hh + ":" + (mm < 10 ? "0" : "") : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function ep() { return type === "tv" ? { season: season, episode: episode } : null; }
  function status(t) { loader.style.display = ""; loader.querySelector(".loader-text").textContent = t; }

  function renderOsd() {
    var t = pendingSeek !== null ? pendingSeek : video.currentTime;
    var d = video.duration || 0;
    osdTime.textContent = fmt(t) + " / " + (d ? fmt(d) : "--:--");
    osdFill.style.transform = "scaleX(" + (d ? Math.min(1, t / d) : 0) + ")";
    var b = 0;
    try { if (video.buffered.length) b = video.buffered.end(video.buffered.length - 1); } catch (e) {}
    osdBuf.style.transform = "scaleX(" + (d ? Math.min(1, b / d) : 0) + ")";
    osdIcon.innerHTML = "";
    osdIcon.appendChild(UI.icon(video.paused ? "pause" : "play"));
    if (pendingSeek !== null) {
      var delta = Math.round(pendingSeek - video.currentTime);
      osdSeek.textContent = (delta >= 0 ? "+" : "−") + fmt(Math.abs(delta));
    } else osdSeek.textContent = "";
  }

  function showOsd(stay) {
    holder.classList.add("osd-show");
    clearTimeout(osdTimer);
    if (!stay) osdTimer = setTimeout(function () { if (!video.paused) holder.classList.remove("osd-show"); }, 2500);
  }

  function renderInfo() {
    subEl.textContent = type === "tv"
      ? "Season " + season + " · Episode " + episode + (episodeName ? " — " + episodeName : "")
      : [UI.year(item), item.runtime ? item.runtime + " min" : ""].filter(Boolean).join(" · ");
    var s = streams[streamIdx];
    var parts = [];
    if (s) parts.push("Stream: " + s.name + (s.title ? " · " + s.title : ""));
    if (hls && hls.currentLevel >= 0 && hls.levels[hls.currentLevel]) parts.push(hls.levels[hls.currentLevel].height + "p");
    else if (hls) parts.push("Auto quality");
    parts.push(subIdx >= 0 && subs[subIdx] ? "Subtitles: " + Addons.langName(subs[subIdx].lang) : "Subtitles off");
    infoEl.textContent = parts.join("   ·   ");
    buildControls();
  }

  // ---------- menu ----------
  function buildControls() {
    var keep = Nav.current() && controls.contains(Nav.current()) ? Nav.current().getAttribute("data-id") : null;
    controls.innerHTML = "";
    function add(id, label, icon, fn, disabled) {
      var b = UI.button(label, icon, fn, disabled ? "disabled" : "");
      b.setAttribute("data-id", id);
      controls.appendChild(b);
    }
    add("play", video.paused ? "Play" : "Pause", video.paused ? "play" : "pause", function () { toggle(); renderInfo(); });
    add("subs", "Subtitles", "cc", openSubs);
    if (hls && hls.levels.length > 1) add("quality", "Quality", "settings", openQuality);
    if (hls && hls.audioTracks && hls.audioTracks.length > 1) add("audio", "Audio", "tv", openAudio);
    add("streams", "Streams (" + streams.length + ")", "server", openStreams);
    if (type === "tv") {
      add("prev", "Prev", "prev", function () { goEpisode(-1); }, !neighbour(-1));
      add("next", "Next", "next", function () { goEpisode(1); }, !neighbour(1));
    }
    add("embed", "Embed sources", "globe", toEmbed);
    if (keep && menu.classList.contains("show")) {
      var again = controls.querySelector('[data-id="' + keep + '"]');
      if (again) Nav.focus(again);
    }
  }

  function showMenu() {
    holder.classList.remove("osd-show");
    var was = menu.classList.contains("show");
    menu.classList.add("show");
    if (!was || !menu.contains(Nav.current())) Nav.focus(controls.querySelector(".btn:not(.disabled)"));
    bumpMenu();
  }
  function bumpMenu() { clearTimeout(menuTimer); menuTimer = setTimeout(hideMenu, 7000); }
  function hideMenu() { clearTimeout(menuTimer); menu.classList.remove("show"); panel.classList.remove("open"); }

  function openPanel(owner, items) {
    if (panel.classList.contains("open") && panel.__owner === owner) { closePanel(); return; }
    panel.innerHTML = "";
    panel.__owner = owner;
    var active = null;
    items.forEach(function (it) {
      var b = UI.button(it.label, it.active ? "check" : it.icon, function () { closePanel(); it.pick(); }, it.active ? "active" : "");
      panel.appendChild(b);
      if (it.active) active = b;
    });
    panel.classList.add("open");
    Nav.focus(active || panel.firstChild);
    bumpMenu();
  }
  function closePanel() {
    panel.classList.remove("open");
    var b = controls.querySelector('[data-id="' + panel.__owner + '"]');
    if (b) Nav.focus(b);
  }

  // ---------- streams ----------
  function loadStreams() {
    status("Finding streams…");
    if (!imdb) { fallback("This title has no IMDb id, so addons can't look it up."); return; }
    Addons.streams(imdb, type, season, episode).then(function (list) {
      if (destroyed) return;
      streams = list;
      if (!streams.length) { fallback("No direct streams from your addons for this title."); return; }
      playStream(0);
    });
  }

  function playStream(i) {
    if (i >= streams.length) { fallback("None of the " + streams.length + " streams would play on this TV."); return; }
    streamIdx = i;
    var s = streams[i];
    status("Loading " + s.name + "…" + (s.needsHeaders ? " (this stream may need headers Tizen can't send)" : ""));
    teardownVideo();
    var isHls = /\.m3u8(\?|$)/i.test(s.url) || /m3u8|hls/i.test(s.url);
    if (isHls && window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, backBufferLength: 30, startPosition: startAt || -1 });
      hls.on(Hls.Events.MANIFEST_PARSED, function () { video.play().catch(function () {}); renderInfo(); });
      hls.on(Hls.Events.LEVEL_SWITCHED, renderInfo);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, renderInfo);
      hls.on(Hls.Events.ERROR, function (e, data) {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        UI.toast("Stream failed, trying the next one");
        playStream(streamIdx + 1);
      });
      hls.loadSource(s.url);
      hls.attachMedia(video);
    } else {
      video.src = s.url;     // MP4 / native HLS on Tizen
      video.play().catch(function () {});
    }
    // Stream-provided subtitles join the list
    if (s.subtitles && s.subtitles.length) loadSubs(s.subtitles);
  }

  function teardownVideo() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    try { video.removeAttribute("src"); video.load(); } catch (e) {}
  }

  function openStreams() {
    openPanel("streams", streams.map(function (s, i) {
      return {
        label: (s.name + (s.title ? " · " + s.title : "")).slice(0, 34) + (s.needsHeaders ? " ⚠" : ""),
        icon: "server", active: i === streamIdx,
        pick: function () { startAt = video.currentTime || startAt; playStream(i); }
      };
    }));
  }

  function fallback(why) {
    if (destroyed) return;
    UI.toast(why + " Using embed sources.", 5000);
    toEmbed();
  }

  function toEmbed() {
    savePosition();
    var p = { item: item, type: type, season: season, episode: episode, seasons: seasons };
    App.back();
    setTimeout(function () { App.push("player", p); }, 50);
  }

  // ---------- subtitles ----------
  function loadSubs(extra) {
    if (!imdb) return;
    Addons.subtitles(imdb, type, season, episode, extra).then(function (list) {
      if (destroyed) return;
      var seen = {};
      subs = list.filter(function (s) { var k = s.url; if (seen[k]) return false; seen[k] = 1; return true; });
      // Auto-pick the preferred language (Settings subtitle choice), if any
      var pref = Store.getSetting("subLang", "");
      if (pref && subIdx < 0) {
        var want = Addons.lang3(pref);
        for (var i = 0; i < subs.length; i++) if (subs[i].lang === want || subs[i].lang === pref) { setSub(i, true); break; }
      }
      renderInfo();
    });
  }

  function srtToVtt(text) {
    text = String(text).replace(/^﻿/, "").replace(/\r+/g, "");
    if (/^WEBVTT/.test(text)) return text;
    return "WEBVTT\n\n" + text.replace(/(\d+:\d+:\d+),(\d+)/g, "$1.$2");
  }

  function setSub(i, quiet) {
    subIdx = i;
    if (subTrack) { try { subTrack.parentNode.removeChild(subTrack); } catch (e) {} subTrack = null; }
    for (var t = 0; t < video.textTracks.length; t++) video.textTracks[t].mode = "disabled";
    if (i < 0) { if (!quiet) UI.toast("Subtitles off"); renderInfo(); return; }
    var s = subs[i];
    fetch(s.url).then(function (r) { return r.text(); }).then(function (text) {
      if (destroyed || subIdx !== i) return;
      var url = URL.createObjectURL(new Blob([srtToVtt(text)], { type: "text/vtt" }));
      subTrack = h("track", { kind: "subtitles", src: url, srclang: s.lang, label: Addons.langName(s.lang), default: true });
      video.appendChild(subTrack);
      setTimeout(function () {
        for (var t = 0; t < video.textTracks.length; t++) video.textTracks[t].mode = video.textTracks[t].label === subTrack.label ? "showing" : "disabled";
      }, 50);
      if (!quiet) UI.toast("Subtitles: " + Addons.langName(s.lang));
      Store.setSetting("subLang", s.lang);
      renderInfo();
    }).catch(function () { UI.toast("Couldn't load those subtitles"); });
  }

  function openSubs() {
    if (!subs.length) { UI.toast("No subtitles found for this title"); return; }
    // One entry per language (+ numbered alternatives), languages sorted by name
    var byLang = {};
    subs.forEach(function (s, i) { (byLang[s.lang] = byLang[s.lang] || []).push(i); });
    // Your last-used language first, then English, then the rest alphabetically
    var pref = Store.getSetting("subLang", "");
    var first = [Addons.lang3(pref), pref, "eng"];
    var rank = function (l) { var i = first.indexOf(l); return i < 0 ? 9 : i; };
    var langs = Object.keys(byLang).sort(function (a, b) {
      return rank(a) - rank(b) || Addons.langName(a).localeCompare(Addons.langName(b));
    });
    var items = [{ label: "Off", icon: "close", active: subIdx < 0, pick: function () { setSub(-1); } }];
    langs.forEach(function (l) {
      byLang[l].slice(0, 2).forEach(function (idx, n) {
        items.push({ label: Addons.langName(l) + (n ? " #" + (n + 1) : ""), icon: "cc", active: idx === subIdx, pick: function () { setSub(idx); } });
      });
    });
    openPanel("subs", items.slice(0, 30));
  }

  // ---------- quality / audio ----------
  function openQuality() {
    var items = [{ label: "Auto", icon: "settings", active: hls.autoLevelEnabled, pick: function () { hls.currentLevel = -1; renderInfo(); } }];
    hls.levels.map(function (l, i) { return { l: l, i: i }; })
      .sort(function (a, b) { return (b.l.height || 0) - (a.l.height || 0); })
      .forEach(function (x) {
        items.push({
          label: (x.l.height ? x.l.height + "p" : "Level " + (x.i + 1)) + (x.l.bitrate ? " · " + (x.l.bitrate / 1e6).toFixed(1) + " Mbps" : ""),
          icon: "settings", active: !hls.autoLevelEnabled && hls.currentLevel === x.i,
          pick: function () { hls.currentLevel = x.i; UI.toast("Quality: " + (x.l.height || "?") + "p"); renderInfo(); }
        });
      });
    openPanel("quality", items);
  }

  function openAudio() {
    openPanel("audio", hls.audioTracks.map(function (a, i) {
      return {
        label: a.name || Addons.langName(a.lang || "") || "Track " + (i + 1), icon: "tv", active: hls.audioTrack === i,
        pick: function () { hls.audioTrack = i; renderInfo(); }
      };
    }));
  }

  // ---------- playback control ----------
  function toggle() {
    if (video.paused) video.play().catch(function () {}); else video.pause();
    showOsd(video.paused);
  }

  function seekBy(delta) {
    var base = pendingSeek !== null ? pendingSeek : video.currentTime;
    var d = video.duration || Infinity;
    pendingSeek = Math.max(0, Math.min(base + delta, d - 1));
    renderOsd(); showOsd();
    clearTimeout(sendTimer);
    sendTimer = setTimeout(function () {
      video.currentTime = pendingSeek;
      pendingSeek = null;
      renderOsd();
    }, 350);
  }

  function savePosition() {
    if (video.currentTime > 0) Store.setPosition(item, ep(), video.currentTime, video.duration || 0);
  }

  function episodeCount(n) { var s = seasons.filter(function (x) { return x.season_number === n; })[0]; return s ? s.episode_count : 0; }
  function neighbour(dir) {
    if (type !== "tv") return null;
    var s = season, e = episode + dir;
    if (e < 1) {
      var prev = seasons.filter(function (x) { return x.season_number < s; });
      if (!prev.length) return null;
      s = prev[prev.length - 1].season_number; e = episodeCount(s);
    } else if (e > episodeCount(s)) {
      var next = seasons.filter(function (x) { return x.season_number > s; });
      if (!next.length) return null;
      s = next[0].season_number; e = 1;
    }
    return { season: s, episode: e };
  }

  function goEpisode(dir) {
    var n = neighbour(dir);
    if (!n) { UI.toast(dir > 0 ? "This is the last episode" : "This is the first episode"); return; }
    savePosition();
    season = n.season; episode = n.episode; episodeName = ""; startAt = 0;
    subs = []; subIdx = -1;
    Store.pushHistory(item, ep());
    fetchEpisodeName();
    renderInfo();
    loadStreams();
    loadSubs();
  }

  function fetchEpisodeName() {
    if (type !== "tv") return;
    var s = season, e = episode;
    TMDB.season(item.id, s).then(function (d) {
      if (s !== season || e !== episode) return;
      var x = (d.episodes || []).filter(function (q) { return q.episode_number === e; })[0];
      episodeName = x ? x.name : "";
      renderInfo();
    }).catch(function () {});
  }

  // ---------- video events ----------
  video.addEventListener("loadedmetadata", function () {
    if (!hls && startAt > 0 && startAt < (video.duration || 0) - 5) video.currentTime = startAt;
  });
  video.addEventListener("playing", function () { loader.style.display = "none"; renderOsd(); renderInfo(); });
  video.addEventListener("waiting", function () { status("Buffering…"); });
  video.addEventListener("pause", function () { renderOsd(); showOsd(true); });
  video.addEventListener("timeupdate", renderOsd);
  video.addEventListener("error", function () {
    if (hls || destroyed) return;          // hls.js reports its own errors
    UI.toast("Stream failed, trying the next one");
    playStream(streamIdx + 1);
  });
  video.addEventListener("ended", function () {
    Store.setPosition(item, ep(), video.duration, video.duration);   // counts as finished
    if (neighbour(1)) { UI.toast("Playing next episode"); goEpisode(1); } else App.back();
  });

  // ---------- start ----------
  startAt = Math.floor(Store.position(item, ep()) || 0);
  Store.pushHistory(item, ep());
  saveTimer = setInterval(savePosition, 5000);
  fetchEpisodeName();
  renderInfo();
  renderOsd();
  loadStreams();
  loadSubs();

  return {
    el: holder,
    fullscreen: true,
    onKey: function (key, evt) {
      if (!key) return false;
      var menuOpen = menu.classList.contains("show");
      if (key === "back") {
        if (panel.classList.contains("open")) { closePanel(); return true; }
        if (menuOpen) { hideMenu(); return true; }
        return false;                                 // close the player
      }
      if (menuOpen) {
        bumpMenu();
        if (key === "playpause") { toggle(); return true; }
        return false;                                 // Nav moves through the menu
      }
      if (key === "enter" || key === "playpause") { toggle(); return true; }
      if (key === "play") { video.play().catch(function () {}); return true; }
      if (key === "pause") { video.pause(); return true; }
      if (key === "left" || key === "right") {
        if (!(evt && evt.repeat)) holdStart = Date.now();
        var held = Date.now() - holdStart;
        var step = held > 3000 ? 60 : held > 1200 ? 30 : 10;
        seekBy(key === "right" ? step : -step);
        return true;
      }
      if (key === "ff" || key === "rew") { seekBy(key === "ff" ? 30 : -30); return true; }
      if (key === "chup") { goEpisode(1); return true; }
      if (key === "chdown") { goEpisode(-1); return true; }
      if (key === "up" || key === "down") { showMenu(); return true; }
      if (key === "red") { showMenu(); openSubs(); return true; }
      return false;
    },
    destroy: function () {
      destroyed = true;
      savePosition();
      clearTimeout(sendTimer); clearTimeout(osdTimer); clearTimeout(menuTimer); clearInterval(saveTimer);
      teardownVideo();
    }
  };
};
