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
  var holder = h("div", { class: "player", tabindex: "-1" }, [loader, frameHost, clickShield, overlay, interactPill]);

  var iframe = null;
  var loads = 0, firstLoadAt = 0, blockedCount = 0, guardOff = false;
  var overlayTimer = null, interactTick = null, focusGuard = null, loadTimeout = null;
  var interacting = false;
  var episodeName = "";

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
    return tpl.replace(/\{tmdb\}/g, item.id)
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
    add("interact", "Interact", "hand", startInteract);
    if (type === "tv") {
      add("prev", "Prev", "prev", function () { goEpisode(-1); }, !neighbour(-1));
      add("next", "Next episode", "next", function () { goEpisode(1); }, !neighbour(1));
    }
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

  function toggleSourcePanel() {
    if (sourcePanel.classList.contains("open")) { closeSourcePanel(); return; }
    sourcePanel.innerHTML = "";
    sources.forEach(function (s, i) {
      var b = UI.button(s.name, i === sourceIdx ? "check" : "server", function () {
        sourceIdx = i;
        Store.setSetting("source", s.id);
        guardOff = false; blockedCount = 0;
        closeSourcePanel();
        load();
      }, i === sourceIdx ? "active" : "");
      sourcePanel.appendChild(b);
    });
    sourcePanel.classList.add("open");
    Nav.focus(sourcePanel.children[sourceIdx]);
    bumpOverlay();
  }

  function closeSourcePanel() {
    sourcePanel.classList.remove("open");
    var b = controls.querySelector('[data-id="sources"]');
    if (b) Nav.focus(b);
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
    var wasHidden = !overlay.classList.contains("show");
    overlay.classList.add("show");
    if (wasHidden || !Nav.current() || !overlay.contains(Nav.current())) {
      Nav.focus(controls.querySelector('[data-id="' + (type === "tv" ? "next" : "interact") + '"]:not(.disabled)') ||
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
  startFocusGuard();
  setTimeout(showOverlay, 0);

  return {
    el: holder,
    fullscreen: true,
    onKey: function (key) {
      if (interacting) { endInteract(); showOverlay(); return true; }
      if (!key) return false;

      if (key === "back") {
        if (sourcePanel.classList.contains("open")) { closeSourcePanel(); return true; }
        return false;   // App.back() closes the player
      }
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
      if (iframe) { iframe.src = "about:blank"; }
    }
  };
};
