/* Search: on-screen keyboard (D-pad friendly) + results grid. */
Screens.search = function () {
  var h = UI.h;
  var query = "";
  var timer = null, token = 0, page = 0, total = 1, loading = false;

  var display = h("div", { class: "search-display" });
  var keyboard = h("div", { class: "keyboard nav-group" });
  var results = h("div", { class: "grid search-grid nav-group", "data-no-memory": "" });
  var resultsTitle = h("h2", { class: "results-title" });
  var status = h("div", { class: "grid-status" });
  var resultsPane = h("div", { class: "scroller search-results", "data-scroll": "y", "data-scroll-mode": "nearest" }, [
    resultsTitle, results, status
  ]);

  var el = h("div", { class: "search" }, [
    h("div", { class: "search-left" }, [h("h1", { text: "Search" }), display, keyboard,
      h("div", { class: "hint", text: "Tip: you can also type with a keyboard" })]),
    resultsPane
  ]);

  var LAYOUT = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
  LAYOUT.forEach(function (ch, i) {
    keyboard.appendChild(h("div", { class: "key focusable" + (i === 0 ? " autofocus" : ""), text: ch.toUpperCase(), onclick: function () { type(ch); } }));
  });
  keyboard.appendChild(h("div", { class: "key wide focusable", text: "Space", onclick: function () { type(" "); } }));
  keyboard.appendChild(h("div", { class: "key wide focusable", text: "⌫ Delete", onclick: backspace }));
  keyboard.appendChild(h("div", { class: "key wide focusable", text: "Clear", onclick: clear }));

  function render() {
    display.innerHTML = "";
    display.appendChild(document.createTextNode(query));
    display.appendChild(h("span", { class: "caret" }));
    if (!query) display.appendChild(h("span", { class: "placeholder", text: "Movies, shows, anime…" }));
  }

  function type(ch) { query += ch; changed(); }
  function backspace() { query = query.slice(0, -1); changed(); }
  function clear() { query = ""; changed(); }

  function changed() {
    render();
    clearTimeout(timer);
    timer = setTimeout(run, 450);
  }

  function run() {
    token++;
    page = 0; total = 1; loading = false;
    results.innerHTML = "";
    if (!query.trim()) { showTrending(); return; }
    resultsTitle.textContent = "Results for “" + query.trim() + "”";
    more();
  }

  function more() {
    if (loading || page >= total) return;
    loading = true;
    var t = token;
    status.textContent = "Searching…";
    TMDB.search(query.trim(), page + 1).then(function (res) {
      if (t !== token) return;
      page = res.page; total = res.totalPages || 1; loading = false;
      res.results.forEach(add);
      status.textContent = results.children.length ? "" : "No results.";
    }).catch(function (err) {
      loading = false;
      status.textContent = "Search failed (" + err.message + ")";
    });
  }

  function add(it) {
    var c = UI.card(it);
    c.__onFocus = function () {
      var idx = Array.prototype.indexOf.call(results.children, c);
      if (query.trim() && idx >= results.children.length - 10) more();
    };
    results.appendChild(c);
  }

  function showTrending() {
    var t = token;
    resultsTitle.textContent = "Trending searches";
    status.textContent = "";
    TMDB.trending("all", 1).then(function (res) {
      if (t !== token) return;
      res.results.forEach(add);
    }).catch(function () {});
  }

  render();
  showTrending();

  return {
    el: el,
    onKey: function (key, evt) {
      // Physical keyboard typing (desktop / USB keyboard on TV)
      if (evt.key && evt.key.length === 1 && /[a-z0-9 ]/i.test(evt.key) && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
        type(evt.key.toLowerCase());
        return true;
      }
      if (evt.keyCode === 8 && query) { backspace(); return true; }
      if (key === "red") { backspace(); return true; }   // Remote red key deletes
      return false;
    },
    destroy: function () { clearTimeout(timer); }
  };
};
