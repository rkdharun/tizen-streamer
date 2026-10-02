/* App shell: router (screen stack), sidebar, modal dialogs, key dispatch. */
var Screens = {};

var App = (function () {
  var stack = [];          // [{name, params, screen, lastFocus}]
  var modalState = null;   // {el, prevRoot, prevFocus}
  var appEl, stageEl, overlayEl, sidebarEl;

  var MENU = [
    { name: "home", label: "Home", icon: "home" },
    { name: "search", label: "Search", icon: "search" },
    { name: "movies", label: "Movies", icon: "movie" },
    { name: "tv", label: "TV Shows", icon: "tv" },
    { name: "anime", label: "Anime", icon: "anime" },
    { name: "mylist", label: "My List", icon: "list" },
    { name: "settings", label: "Settings", icon: "settings" }
  ];

  function buildSidebar() {
    var h = UI.h;
    sidebarEl = document.getElementById("sidebar");
    var group = h("div", { class: "menu nav-group", "data-return-right": "primary" });
    MENU.forEach(function (m) {
      var item = h("div", { class: "menu-item focusable", "data-screen": m.name, onclick: function () { go(m.name); } }, [
        UI.icon(m.icon), h("span", { class: "menu-label", text: m.label })
      ]);
      item.__onFocus = function () { sidebarEl.classList.add("expanded"); };
      item.__onBlur = function () { sidebarEl.classList.remove("expanded"); };
      group.appendChild(item);
    });
    sidebarEl.appendChild(h("div", { class: "brand" }, [h("span", { class: "brand-mark", text: "R" }), h("span", { class: "brand-name", text: "ReelTV" })]));
    sidebarEl.appendChild(group);
  }

  function markMenu(name) {
    var items = sidebarEl.querySelectorAll(".menu-item");
    for (var i = 0; i < items.length; i++) {
      var on = items[i].getAttribute("data-screen") === name;
      items[i].classList.toggle("active", on);
      if (on) items[i].parentNode.__last = items[i];
    }
  }

  function top() { return stack[stack.length - 1]; }

  function applyRoot() {
    var t = top();
    var full = t && t.screen.fullscreen;
    appEl.classList.toggle("fullscreen-mode", !!full);
    Nav.setRoot(full ? t.screen.el : appEl);
    Nav.setPrimary(t ? t.screen.el : null);
  }

  function mount(name, params) {
    var factory = Screens[name];
    var screen = factory(params || {});
    screen.el.classList.add("screen");
    (screen.fullscreen ? overlayEl : stageEl).appendChild(screen.el);
    var entry = { name: name, params: params, screen: screen, lastFocus: null };
    stack.push(entry);
    applyRoot();
    if (screen.onShow) screen.onShow(true);
    if (!Nav.current() || !Nav.getRoot().contains(Nav.current())) Nav.focusFirst();
    return entry;
  }

  function unmount(entry) {
    if (entry.screen.destroy) entry.screen.destroy();
    if (entry.screen.el.parentNode) entry.screen.el.parentNode.removeChild(entry.screen.el);
  }

  function hideTop() {
    var t = top();
    if (!t) return;
    t.lastFocus = Nav.current();
    if (t.screen.onHide) t.screen.onHide();
    t.screen.el.style.display = "none";
  }

  function go(name, params) {
    closeModal();
    while (stack.length) unmount(stack.pop());
    markMenu(name);
    mount(name, params);
  }

  function push(name, params) {
    hideTop();
    mount(name, params);
  }

  function back() {
    if (modalState) { closeModal(); return; }
    var t = top();
    if (t && t.screen.onBack && t.screen.onBack()) return;
    if (stack.length > 1) {
      unmount(stack.pop());
      var prev = top();
      prev.screen.el.style.display = "";
      applyRoot();
      if (prev.screen.onShow) prev.screen.onShow(false);
      Nav.restoreOr(prev.lastFocus);
    } else if (t && t.name !== "home") {
      go("home");
    } else {
      confirmExit();
    }
  }

  function confirmExit() {
    modal({
      title: "Exit ReelTV?",
      buttons: [
        { label: "Exit", action: Keys.exitApp },
        { label: "Cancel", autofocus: true }
      ]
    });
  }

  // opts: {title, body (string|Node), buttons:[{label, icon, action, autofocus, keepOpen}], className}
  function modal(opts) {
    closeModal();
    var h = UI.h;
    var btns = h("div", { class: "modal-actions nav-group" });
    (opts.buttons || []).forEach(function (b) {
      var el = UI.button(b.label, b.icon, function () {
        if (!b.keepOpen) closeModal();
        if (b.action) b.action(el);
      }, (b.autofocus ? "autofocus " : "") + (b.className || ""));
      btns.appendChild(el);
    });
    var box = h("div", { class: "modal-box " + (opts.className || "") }, [
      opts.title ? h("h2", { text: opts.title }) : null,
      typeof opts.body === "string" ? h("p", { text: opts.body }) : (opts.body || null),
      btns
    ]);
    var el = h("div", { class: "modal" }, [box]);
    document.getElementById("app").appendChild(el);
    modalState = { el: el, prevRoot: Nav.getRoot(), prevFocus: Nav.current(), onClose: opts.onClose };
    Nav.setRoot(el);
    Nav.focusFirst();
    return el;
  }

  function closeModal() {
    if (!modalState) return;
    var m = modalState;
    modalState = null;
    m.el.parentNode.removeChild(m.el);
    Nav.setRoot(m.prevRoot);
    Nav.restoreOr(m.prevFocus);
    if (m.onClose) m.onClose();
  }

  function onKey(evt) {
    var key = Keys.name(evt);
    var t = top();

    // Screen gets first look (search typing, player controls, etc.)
    // Returning "pass" stops app handling but keeps the browser default (text inputs).
    var handled = !modalState && t && t.screen.onKey ? t.screen.onKey(key, evt) : false;
    if (handled) {
      if (handled !== "pass") evt.preventDefault();
      return;
    }
    if (!key) return;
    evt.preventDefault();

    switch (key) {
      case "up": case "down": case "left": case "right":
        Nav.move(key); break;
      case "enter":
        var c = Nav.current();
        if (c) c.click();
        break;
      case "back":
        back(); break;
      case "exit":
        Keys.exitApp(); break;
    }
  }

  // Scale the fixed 1920x1080 canvas to whatever window we're in (desktop testing).
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    window.__scale = s;
    appEl.style.transform = s === 1 ? "" : "scale(" + s + ")";
  }

  function init() {
    appEl = document.getElementById("app");
    stageEl = document.getElementById("stage");
    overlayEl = document.getElementById("overlay");
    Keys.register();
    CONFIG.INTERACT_SECONDS = Store.getSetting("interactSeconds", CONFIG.INTERACT_SECONDS);
    buildSidebar();
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", fit);
    fit();

    // Never let anything replace the app document (popups/redirect defence in depth).
    window.open = function () { UI.toast("Blocked a popup"); return null; };

    go(TMDB.hasKey() ? "home" : "settings");
    if (!TMDB.hasKey()) UI.toast("Add your TMDB API key to get started", 5000);
  }

  return {
    init: init, go: go, push: push, back: back, modal: modal, closeModal: closeModal,
    top: top, isModalOpen: function () { return !!modalState; }
  };
})();

window.addEventListener("load", App.init);
