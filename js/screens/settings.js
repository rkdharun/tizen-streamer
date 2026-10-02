/* Settings: TMDB key, default source, shield, interaction time, data reset. */
Screens.settings = function () {
  var h = UI.h;
  var list = h("div", { class: "settings-list nav-group" });
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    h("div", { class: "page-head" }, [h("h1", { text: "Settings" })]), list
  ]);
  var el = h("div", { class: "settings" }, [scroller]);
  var editing = null;

  function row(label, valueFn, onEnter, desc) {
    var val = h("div", { class: "setting-value" });
    var r = h("div", { class: "setting focusable" }, [
      h("div", { class: "setting-text" }, [h("div", { class: "setting-label", text: label }), desc ? h("div", { class: "setting-desc", text: desc }) : null]),
      val
    ]);
    r.__refresh = function () { val.textContent = valueFn(); };
    r.__refresh();
    r.addEventListener("click", function () { onEnter(r); r.__refresh(); });
    list.appendChild(r);
    return r;
  }

  // --- TMDB key (native input -> Samsung on-screen IME) ---
  var keyInput = h("input", { class: "text-input", type: "text", placeholder: "Paste or type your TMDB API key", autocomplete: "off", spellcheck: "false" });
  var keyRow = h("div", { class: "setting focusable autofocus input-row" }, [
    h("div", { class: "setting-text" }, [
      h("div", { class: "setting-label", text: "TMDB API key" }),
      h("div", { class: "setting-desc", text: "Free at themoviedb.org → Settings → API. v3 key or v4 read token." })
    ]),
    keyInput
  ]);
  keyInput.value = Store.getSetting("tmdbKey", "") || CONFIG.TMDB_API_KEY || "";
  keyRow.addEventListener("click", function () {
    if (editing) return;
    editing = keyInput;
    keyRow.classList.add("editing");
    keyInput.focus();
  });
  list.appendChild(keyRow);

  function finishEdit(save) {
    if (!editing) return;
    keyRow.classList.remove("editing");
    editing.blur();
    editing = null;
    if (!save) { keyInput.value = Store.getSetting("tmdbKey", "") || CONFIG.TMDB_API_KEY || ""; return; }
    var v = keyInput.value.trim();
    Store.setSetting("tmdbKey", v);
    UI.toast(v ? "API key saved" : "API key cleared");
    if (v) App.modal({
      title: "Key saved",
      body: "Go to Home now?",
      buttons: [{ label: "Go Home", autofocus: true, action: function () { App.go("home"); } }, { label: "Stay" }]
    });
  }

  // --- other settings ---
  row("Preferred source", function () {
    var id = Store.getSetting("source", CONFIG.SOURCES[0].id);
    var s = CONFIG.SOURCES.filter(function (x) { return x.id === id; })[0] || CONFIG.SOURCES[0];
    return s.name;
  }, function () {
    var id = Store.getSetting("source", CONFIG.SOURCES[0].id);
    var idx = 0;
    CONFIG.SOURCES.forEach(function (s, i) { if (s.id === id) idx = i; });
    Store.setSetting("source", CONFIG.SOURCES[(idx + 1) % CONFIG.SOURCES.length].id);
  }, "Press OK to cycle. You can also switch live in the player (YELLOW).");

  row("Ad & popup shield (default)", function () {
    return Store.getSetting("shieldDefault", true) ? "On" : "Off";
  }, function () {
    Store.setSetting("shieldDefault", !Store.getSetting("shieldDefault", true));
  }, "Sandboxes the player: blocks popups, new tabs and redirects. Per source, RED in the player cycles strict → popups ok → off.");

  row("Interact time", function () {
    return CONFIG.INTERACT_SECONDS + " s";
  }, function () {
    var opts = [8, 12, 20, 30];
    var next = opts[(opts.indexOf(CONFIG.INTERACT_SECONDS) + 1) % opts.length] || 12;
    CONFIG.INTERACT_SECONDS = next;
    Store.setSetting("interactSeconds", next);
  }, "How long the remote controls the embedded player after choosing Interact.");

  row("Clear watch history", function () { return Store.history().length + " items"; }, function (r) {
    App.modal({
      title: "Clear watch history?",
      buttons: [{ label: "Clear", action: function () { localStorage.removeItem("reeltv.history"); r.__refresh(); UI.toast("History cleared"); } },
                { label: "Cancel", autofocus: true }]
    });
  });

  row("Clear My List", function () { return Store.watchlist().length + " items"; }, function (r) {
    App.modal({
      title: "Clear My List?",
      buttons: [{ label: "Clear", action: function () { localStorage.removeItem("reeltv.watchlist"); r.__refresh(); UI.toast("My List cleared"); } },
                { label: "Cancel", autofocus: true }]
    });
  });

  list.appendChild(h("div", { class: "about" }, [
    h("p", { text: "Remote: ◀▲▼▶ move · OK select · BACK go back · CH+/CH− jump rows / next-prev episode" }),
    h("p", { text: "Player: YELLOW next source · RED cycle shield level · BLUE or ▶❙❙ interact with the player" }),
    h("p", { text: "This product uses the TMDB API but is not endorsed or certified by TMDB." })
  ]));

  return {
    el: el,
    onKey: function (key, evt) {
      if (!editing) return false;
      var code = evt.keyCode;
      if (code === 65376 || code === 13) { finishEdit(true); return true; }       // IME Done / Enter
      if (code === 65385 || code === 10009 || code === 27) { finishEdit(false); return true; } // IME Cancel / Back
      return "pass";   // let the input receive the keystroke
    },
    onHide: function () { finishEdit(false); }
  };
};
