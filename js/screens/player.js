/*
 * Player: full-screen embed iframe with ad/popup protection.
 *
 * Protection layers ("Shield", on by default, per source):
 *  1. sandbox without allow-popups / allow-top-navigation / allow-modals
 *     -> window.open, target=_blank, top.location redirects and alert() spam all fail,
 *        for the embed AND every nested iframe inside it.
 *  2. Redirect guard: if the embed frame itself navigates somewhere new after it has
 *     settled (typical "click anywhere -> ad page" hijack), the source is reloaded.
 *  3. Focus guard: the app keeps the remote focus, so a provider can't steal the Back
 *     key. "Interact" hands the remote to the player for a few seconds on purpose.
 *  4. A transparent click shield covers the iframe while the menu is in control,
 *     so stray pointer clicks don't land on hidden ad overlays.
 */
Screens.player = function (params) {
  var h = UI.h;
  var item = params.item;
  var type = params.type;
  var season = params.season || 1, episode = params.episode || 1;
  var seasons = params.seasons || [];

  var SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock";
  var REDIRECT_GRACE_MS = 5000;

  var sources = CONFIG.SOURCES;
  var sourceIdx = Math.max(0, indexOfSource(Store.getSetting("source", sources[0].id)));

  var frameHost = h("div", { class: "frame-host" });
  var loader = h("div", { class: "player-loader" }, [UI.spinner(), h("div", { class: "loader-text" })]);
  var clickShield = h("div", { class: "click-shield", onclick: function () { showOverlay(); } });
  var interactPill = h("div", { class: "interact-pill" });

  // Remote-control OSD (only for sources with a postMessage control API, e.g. VidFast)
  var osdIcon = h("span", { class: "osd-icon" });
  var osdTime = h("span", { class: "osd-time" });
  var osdFill = h("div", { class: "osd-fill" });
  var osdSeek = h("div", { class: "osd-seek" });
  var osd = h("div", { class: "rc-osd" }, [
    h("div", { class: "osd-row" }, [osdIcon, osdSeek, osdTime]),
    h("div", { class: "osd-bar" }, [osdFill])
  ]);

  var titleEl = h("div", { class: "pl-title" });
  var subEl = h("div", { class: "pl-sub" });
  var sourceLabel = h("div", { class: "pl-source" });
  var controls = h("div", { class: "pl-controls nav-group" });
  var sourcePanel = h("div", { class: "source-panel nav-group" });

  var overlay = h("div", { class: "pl-overlay" }, [
    h("div", { class: "pl-top" }, [titleEl, subEl]),
    h("div", { class: "pl-bottom" }, [sourceLabel, controls, sourcePanel])
  ]);

  // Loader sits *behind* the iframe: it shows until the embed paints its own background.
  var holder = h("div", { class: "player", tabindex: "-1" }, [loader, frameHost, clickShield, osd, overlay, interactPill]);

  var iframe = null;
  var loads = 0, firstLoadAt = 0, blockedCount = 0, guardOff = false;
  var overlayTimer = null, interactTick = null, focusGuard = null, loadTimeout = null;
  var interacting = false;
  var episodeName = "";

  // Remote control state, fed by the embed's PLAYER_EVENT messages.
  var rc = { active: false, playing: false, t: 0, dur: 0, pending: null, sendTimer: null, osdTimer: null, holdStart: 0, saveAt: 0 };

  function indexOfSource(id) {
    for (var i = 0; i < sources.length; i++) if (sources[i].id === id) return i;
    return -1;
  }

  // Shield levels: "strict" (no popups), "popups" (popups allowed - still sandboxed,
  // no top-frame redirects), "off" (no sandbox). Remembered per source.
  var LEVELS = ["strict", "popups", "off"];
  var LEVEL_LABEL = { strict: "Shield: strict", popups: "Shield: popups ok", off: "Shield off" };

  function shieldLevel() {
    var src = sources[sourceIdx];
    var v = Store.getSetting("shield." + src.id, null);
    if (v === true) return "strict";          // values saved by older versions
    if (v === false) return "off";
    if (LEVELS.indexOf(v) >= 0) return v;
    if (src.sandbox === false) return "off";
    if (LEVELS.indexOf(src.shield) >= 0) return src.shield;
    return Store.getSetting("shieldDefault", true) ? "strict" : "off";
  }

  function shieldOn() { return shieldLevel() !== "off"; }

  function buildUrl(src) {
    var tpl = type === "tv" ? src.tv : src.movie;
    if (!tpl) return null;
    var imdb = (item.external_ids && item.external_ids.imdb_id) || item.imdb_id || "";
    if (tpl.indexOf("{imdb}") >= 0 && !imdb) return null;
    var start = Math.floor(Store.position(item, type === "tv" ? { season: season, episode: episode } : null) || 0);
    var slug = (UI.title(item) || "title").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + item.id;
    return tpl.replace(/\{start\}/g, start)
              .replace(/\{slug\}/g, slug)
              .replace(/\{sub\}/g, encodeURIComponent(Store.getSetting("subLang", "")))
              .replace(/\{tmdb\}/g, item.id)
              .replace(/\{imdb\}/g, imdb)
              .replace(/\{season\}/g, season)
              .replace(/\{episode\}/g, episode);
  }

  function load() {
    var src = sources[sourceIdx];
    var url = buildUrl(src);
    if (iframe) { iframe.src = "about:blank"; frameHost.removeChild(iframe); iframe = null; }
    loads = 0; firstLoadAt = 0;
    clearTimeout(loadTimeout);
    resetRc();

    if (!url) {
      loader.style.display = "";
      loader.querySelector(".loader-text").textContent = src.name + " can't play this title. Pick another source.";
      return;
    }

    iframe = document.createElement("iframe");
    var level = shieldLevel();
    if (level === "strict") iframe.setAttribute("sandbox", SANDBOX);
    else if (level === "popups") iframe.setAttribute("sandbox", SANDBOX + " allow-popups");
    iframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("tabindex", "-1");
    iframe.addEventListener("load", onFrameLoad);
    iframe.src = url;
    frameHost.appendChild(iframe);

    loader.style.display = "";
    loader.querySelector(".loader-text").textContent = "Loading " + src.name + "…";
    loadTimeout = setTimeout(function () {
      loader.querySelector(".loader-text").textContent = "Still loading… try another source if nothing appears.";
    }, 12000);
    renderInfo();
    reclaimFocus();
  }

  function onFrameLoad() {
    loads++;
    var now = Date.now();
    if (loads === 1) {
      firstLoadAt = now;
      clearTimeout(loadTimeout);
      loader.style.display = "none";
      return;
    }
    // Redirect guard: a top-level navigation of the embed after it settled = hijack.
    if (shieldOn() && !guardOff && now - firstLoadAt > REDIRECT_GRACE_MS) {
      blockedCount++;
      if (blockedCount > 3) {
        guardOff = true;
        UI.toast("This source keeps navigating; redirect guard paused for it", 4000);
        return;
      }
      UI.toast("Blocked a redirect, reloading the player");
      load();
    }
  }

  function renderInfo() {
    titleEl.textContent = UI.title(item);
    subEl.textContent = type === "tv"
      ? "Season " + season + " · Episode " + episode + (episodeName ? " — " + episodeName : "")
      : [UI.year(item), item.runtime ? item.runtime + " min" : ""].filter(Boolean).join(" · ");
    sourceLabel.textContent = "Source: " + sources[sourceIdx].name + "   ·   " + LEVEL_LABEL[shieldLevel()];
    buildControls();
  }

  function fetchEpisodeName() {
    if (type !== "tv") return;
    var s = season, e = episode;
    TMDB.season(item.id, s).then(function (data) {
      if (s !== season || e !== episode) return;
      var ep = (data.episodes || []).filter(function (x) { return x.episode_number === e; })[0];
      episodeName = ep ? ep.name : "";
      renderInfo();
    }).catch(function () {});
  }

  function episodeCount(n) {
    var s = seasons.filter(function (x) { return x.season_number === n; })[0];
    return s ? s.episode_count : 0;
  }

  function neighbour(dir) {
    var s = season, e = episode + dir;
    if (e < 1) {
      var prevSeasons = seasons.filter(function (x) { return x.season_number < s; });
      if (!prevSeasons.length) return null;
      s = prevSeasons[prevSeasons.length - 1].season_number;
      e = episodeCount(s);
    } else if (e > episodeCount(s)) {
      var nextSeasons = seasons.filter(function (x) { return x.season_number > s; });
      if (!nextSeasons.length) return null;
      s = nextSeasons[0].season_number; e = 1;
    }
    return { season: s, episode: e };
  }

  function goEpisode(dir) {
    var n = neighbour(dir);
    if (!n) { UI.toast(dir > 0 ? "This is the last episode" : "This is the first episode"); return; }
    season = n.season; episode = n.episode; episodeName = "";
    Store.pushHistory(item, { season: season, episode: episode });
    load();
    fetchEpisodeName();
    showOverlay();
  }

  function buildControls() {
    var keep = Nav.current() && controls.contains(Nav.current()) ? Nav.current().getAttribute("data-id") : null;
    controls.innerHTML = "";
    function add(id, label, iconName, fn, disabled) {
      var b = UI.button(label, iconName, fn, disabled ? "disabled" : "");
      b.setAttribute("data-id", id);
      controls.appendChild(b);
      return b;
    }
    if (rc.active) add("playpause", rc.playing ? "Pause" : "Play", rc.playing ? "pause" : "play", function () { togglePlay(); buildControls(); });
    add("interact", "Interact", "hand", startInteract);
    if (type === "tv") {
      add("prev", "Prev", "prev", function () { goEpisode(-1); }, !neighbour(-1));
      add("next", "Next episode", "next", function () { goEpisode(1); }, !neighbour(1));
    }
    if (supportsSubs()) add("subs", "Subtitles", "cc", toggleSubsPanel);
    add("sources", "Sources", "server", toggleSourcePanel);
    add("shield", LEVEL_LABEL[shieldLevel()], "shield", toggleShield).classList.toggle("off", shieldLevel() !== "strict");
    add("reload", "Reload", "reload", function () { guardOff = false; blockedCount = 0; load(); });
    add("close", "Close", "close", function () { App.back(); });
    if (keep && overlay.classList.contains("show")) {
      var again = controls.querySelector('[data-id="' + keep + '"]');
      if (again) Nav.focus(again);
    }
  }

  function toggleShield() {
    var next = LEVELS[(LEVELS.indexOf(shieldLevel()) + 1) % LEVELS.length];
    Store.setSetting("shield." + sources[sourceIdx].id, next);
    guardOff = false; blockedCount = 0;
    UI.toast({
      strict: "Shield strict: popups, new tabs & redirects blocked",
      popups: "Popups allowed (still sandboxed, redirects blocked) - for sources that refuse strict",
      off: "Shield off: no protection - use only if nothing else plays"
    }[next], 4000);
    load();
  }

  // Generic picker panel above the control bar (sources, subtitles).
  // items: [{label, icon, active, pick}]
  function openPanel(owner, items) {
    if (sourcePanel.classList.contains("open") && sourcePanel.__owner === owner) { closePanel(); return; }
    sourcePanel.innerHTML = "";
    sourcePanel.__owner = owner;
    var activeBtn = null;
    items.forEach(function (it) {
      var b = UI.button(it.label, it.active ? "check" : it.icon, function () { closePanel(); it.pick(); }, it.active ? "active" : "");
      sourcePanel.appendChild(b);
      if (it.active) activeBtn = b;
    });
    sourcePanel.classList.add("open");
    Nav.focus(activeBtn || sourcePanel.firstChild);
    bumpOverlay();
  }

  function closePanel() {
    sourcePanel.classList.remove("open");
    var b = controls.querySelector('[data-id="' + (sourcePanel.__owner || "sources") + '"]');
    if (b) Nav.focus(b);
  }

  function toggleSourcePanel() {
    openPanel("sources", sources.map(function (src, i) {
      return {
        label: src.name, icon: "server", active: i === sourceIdx,
        pick: function () {
          sourceIdx = i;
          Store.setSetting("source", src.id);
          guardOff = false; blockedCount = 0;
          load();
        }
      };
    }));
  }

  // ---- subtitles (sources whose URL takes {sub}) ----
  var SUB_FALLBACK = [
    ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"],
    ["pt", "Portuguese"], ["ar", "Arabic"], ["hi", "Hindi"], ["ta", "Tamil"], ["te", "Telugu"],
    ["ml", "Malayalam"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"]
  ];
  var subCache = {};

  function supportsSubs() {
    var src = sources[sourceIdx];
    return (src.movie || "").indexOf("{sub}") >= 0 || (src.tv || "").indexOf("{sub}") >= 0;
  }

  // Ask the source which languages exist for this title; fall back to a fixed list.
  function subLanguages() {
    var src = sources[sourceIdx];
    if (!src.subsList) return Promise.resolve(SUB_FALLBACK);
    var url = src.subsList.replace(/\{tmdb\}/g, item.id) +
      (type === "tv" ? "&season=" + season + "&episode=" + episode : "");
    if (subCache[url]) return Promise.resolve(subCache[url]);
    return fetch(url).then(function (r) { return r.json(); }).then(function (list) {
      var seen = {}, langs = [];
      (list || []).forEach(function (x) {
        if (x && x.language && !seen[x.language]) { seen[x.language] = 1; langs.push([x.language, x.display || x.language]); }
      });
      langs.sort(function (a, b) { return a[1].localeCompare(b[1]); });
      if (!langs.length) throw new Error("empty");
      subCache[url] = langs;
      return langs;
    }).catch(function () { return SUB_FALLBACK; });
  }

  function toggleSubsPanel() {
    if (sourcePanel.classList.contains("open") && sourcePanel.__owner === "subs") { closePanel(); return; }
    var current = Store.getSetting("subLang", "");
    subLanguages().then(function (langs) {
      var items = [{ label: "Off", icon: "close", active: !current, pick: function () { setSub(""); } }];
      langs.forEach(function (l) {
        items.push({ label: l[1], icon: "cc", active: current === l[0], pick: function () { setSub(l[0]); } });
      });
      openPanel("subs", items);
    });
  }

  function setSub(code) {
    if (code === Store.getSetting("subLang", "")) return;
    Store.setSetting("subLang", code);
    // Reload the player at the current position with the new subtitle language
    if (rc.t > 0) Store.setPosition(item, type === "tv" ? { season: season, episode: episode } : null, rc.t, rc.dur);
    UI.toast(code ? "Subtitles: " + code.toUpperCase() : "Subtitles off");
    load();
  }

  function nextSource() {
    sourceIdx = (sourceIdx + 1) % sources.length;
    Store.setSetting("source", sources[sourceIdx].id);
    guardOff = false; blockedCount = 0;
    UI.toast("Source: " + sources[sourceIdx].name);
    load();
  }

  // ---- overlay visibility ----
  function showOverlay() {
    holder.classList.remove("osd-show");
    var wasHidden = !overlay.classList.contains("show");
    overlay.classList.add("show");
    if (wasHidden || !Nav.current() || !overlay.contains(Nav.current())) {
      var first = rc.active ? "playpause" : (type === "tv" ? "next" : "interact");
      Nav.focus(controls.querySelector('[data-id="' + first + '"]:not(.disabled)') ||
                controls.querySelector(".btn"));
    }
    bumpOverlay();
    return wasHidden;
  }

  function bumpOverlay() {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(hideOverlay, 6000);
  }

  function hideOverlay() {
    clearTimeout(overlayTimer);
    overlay.classList.remove("show");
    sourcePanel.classList.remove("open");
  }

  // ---- focus handling ----
  function reclaimFocus() {
    try { window.focus(); holder.focus(); } catch (e) {}
  }

  // ---- remote control (postMessage API) ----
  function supportsControl() { return !!sources[sourceIdx].control; }

  function resetRc() {
    clearTimeout(rc.sendTimer); clearTimeout(rc.osdTimer);
    rc.active = false; rc.playing = false; rc.t = 0; rc.dur = 0; rc.pending = null;
    holder.classList.remove("rc-on", "osd-show");
  }

  function send(msg) {
    try { iframe.contentWindow.postMessage(msg, "*"); } catch (e) {}
  }

  function onMessage(e) {
    if (!iframe || e.source !== iframe.contentWindow) return;
    var msg = e.data;
    if (typeof msg === "string") { try { msg = JSON.parse(msg); } catch (x) { return; } }
    if (!msg || msg.type !== "PLAYER_EVENT" || !msg.data) return;
    var d = msg.data;
    // Any source that reports progress gets resume + auto-next; only sources with a
    // control API (supportsControl) get remote play/pause/seek and the time bar.
    if (!supportsControl()) { trackProgress(d); return; }
    if (!rc.active) {
      rc.active = true;
      holder.classList.add("rc-on");
      loader.style.display = "none";
      UI.toast("Remote connected · OK play/pause · ◀ ▶ seek · ▲ menu", 4000);
      hideOverlay();               // keys go straight to the player from now on
      buildControls();
    }
    if (typeof d.currentTime === "number" && rc.pending === null) rc.t = d.currentTime;
    if (typeof d.duration === "number" && d.duration > 0) rc.dur = d.duration;
    if (d.event === "play") rc.playing = true;
    else if (d.event === "pause") rc.playing = false;
    else if (typeof d.playing === "boolean") rc.playing = d.playing;
    renderOsd();
    if (!rc.playing) showOsd(true);
    trackProgress(d);
  }

  function trackProgress(d) {
    if (typeof d.currentTime === "number" && rc.pending === null) rc.t = d.currentTime;
    if (typeof d.duration === "number" && d.duration > 0) rc.dur = d.duration;
    // Remember the position for resume (throttled)
    var now = Date.now();
    if (rc.t > 0 && now - rc.saveAt > 5000) {
      rc.saveAt = now;
      Store.setPosition(item, type === "tv" ? { season: season, episode: episode } : null, rc.t, rc.dur);
    }
    if (d.event === "ended" && type === "tv" && neighbour(1)) {
      UI.toast("Playing next episode");
      goEpisode(1);
    }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
    return (hh ? hh + ":" + (mm < 10 ? "0" : "") : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function renderOsd() {
    var t = rc.pending !== null ? rc.pending : rc.t;
    osdTime.textContent = fmt(t) + " / " + (rc.dur ? fmt(rc.dur) : "--:--");
    osdFill.style.transform = "scaleX(" + (rc.dur ? Math.min(1, t / rc.dur) : 0) + ")";
    osdIcon.innerHTML = "";
    osdIcon.appendChild(UI.icon(rc.playing ? "play" : "pause"));
    if (rc.pending !== null) {
      var delta = Math.round(rc.pending - rc.t);
      osdSeek.textContent = (delta >= 0 ? "+" : "−") + fmt(Math.abs(delta));
    } else osdSeek.textContent = "";
  }

  function showOsd(stay) {
    holder.classList.add("osd-show");
    clearTimeout(rc.osdTimer);
    if (!stay) rc.osdTimer = setTimeout(function () { if (rc.playing) holder.classList.remove("osd-show"); }, 2500);
  }

  function togglePlay(force) {
    var play = force === undefined ? !rc.playing : force;
    send({ command: play ? "play" : "pause" });
    rc.playing = play;           // optimistic; corrected by the next event
    renderOsd();
    showOsd(!play);
  }

  // Seek accumulates while keys are pressed, then sends one absolute seek.
  function seekBy(delta) {
    var base = rc.pending !== null ? rc.pending : rc.t;
    var target = Math.max(0, base + delta);
    if (rc.dur) target = Math.min(target, rc.dur - 1);
    rc.pending = target;
    renderOsd();
    showOsd();
    clearTimeout(rc.sendTimer);
    rc.sendTimer = setTimeout(function () {
      send({ command: "seek", time: rc.pending });
      rc.t = rc.pending;
      rc.pending = null;
      renderOsd();
    }, 450);
  }

  function rcKey(key, evt) {
    var repeat = evt && evt.repeat;
    if (key === "enter" || key === "playpause") { togglePlay(); return true; }
    if (key === "play") { togglePlay(true); return true; }
    if (key === "pause") { togglePlay(false); return true; }
    if (key === "left" || key === "right") {
      if (!repeat) rc.holdStart = Date.now();
      var held = Date.now() - rc.holdStart;
      var step = held > 3000 ? 60 : held > 1200 ? 30 : 10;     // accelerate while held
      seekBy(key === "right" ? step : -step);
      return true;
    }
    if (key === "ff" || key === "rew") { seekBy(key === "ff" ? 30 : -30); return true; }
    if (key === "up" || key === "down") { showOverlay(); return true; }
    return false;
  }

  function startInteract() {
    if (!iframe) return;
    hideOverlay();
    interacting = true;
    holder.classList.add("interacting");
    var left = CONFIG.INTERACT_SECONDS;
    interactPill.textContent = "Remote is controlling the player · menu returns in " + left + "s";
    clearInterval(interactTick);
    interactTick = setInterval(function () {
      left--;
      interactPill.textContent = "Remote is controlling the player · menu returns in " + left + "s";
      if (left <= 0) endInteract();
    }, 1000);
    try { iframe.focus(); iframe.contentWindow.focus(); } catch (e) {}
  }

  function endInteract() {
    if (!interacting) return;
    interacting = false;
    clearInterval(interactTick);
    holder.classList.remove("interacting");
    reclaimFocus();
  }

  function startFocusGuard() {
    clearInterval(focusGuard);
    focusGuard = setInterval(function () {
      if (interacting) return;
      if (document.activeElement === iframe || !document.hasFocus()) reclaimFocus();
    }, 700);
  }

  function onWindowBlur() {
    // The embed grabbed focus without being asked (would swallow the Back key)
    if (!interacting) setTimeout(reclaimFocus, 0);
  }

  function onWindowFocus() { if (interacting) endInteract(); }

  // ---- lifecycle ----
  Store.pushHistory(item, type === "tv" ? { season: season, episode: episode } : null);
  renderInfo();
  load();
  fetchEpisodeName();
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("message", onMessage);
  startFocusGuard();
  setTimeout(showOverlay, 0);

  return {
    el: holder,
    fullscreen: true,
    onKey: function (key, evt) {
      if (interacting) { endInteract(); showOverlay(); return true; }
      if (!key) return false;

      if (key === "back") {
        if (sourcePanel.classList.contains("open")) { closePanel(); return true; }
        return false;   // App.back() closes the player
      }
      // Remote-control mode: with the menu hidden, keys drive the player directly.
      if (rc.active && !overlay.classList.contains("show") && rcKey(key, evt)) return true;

      if (key === "chup" || key === "ff") { if (type === "tv") goEpisode(1); return true; }
      if (key === "chdown" || key === "rew") { if (type === "tv") goEpisode(-1); return true; }
      if (key === "yellow") { nextSource(); return true; }
      if (key === "red") { toggleShield(); return true; }
      if (key === "blue" || key === "playpause" || key === "play" || key === "pause") { startInteract(); return true; }

      if (["up", "down", "left", "right", "enter"].indexOf(key) >= 0) {
        // First press only reveals the menu
        if (showOverlay()) return true;
        bumpOverlay();
        return false;    // let Nav handle movement / Enter
      }
      return false;
    },
    destroy: function () {
      clearTimeout(overlayTimer); clearTimeout(loadTimeout);
      clearInterval(interactTick); clearInterval(focusGuard);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("message", onMessage);
      clearTimeout(rc.sendTimer); clearTimeout(rc.osdTimer);
      if (rc.t > 0) Store.setPosition(item, type === "tv" ? { season: season, episode: episode } : null, rc.t, rc.dur);
      if (iframe) { iframe.src = "about:blank"; }
    }
  };
};
