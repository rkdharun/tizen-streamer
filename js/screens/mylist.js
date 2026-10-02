/* My List (watchlist) + recently watched. */
Screens.mylist = function () {
  var h = UI.h;
  var scroller = h("div", { class: "scroller", "data-scroll": "y", "data-scroll-mode": "start" });
  var el = h("div", { class: "mylist" }, [scroller]);

  function render() {
    scroller.innerHTML = "";
    scroller.appendChild(h("div", { class: "page-head", "data-scroll-anchor": "" }, [
      h("h1", { text: "My List" }),
      h("div", { class: "hint", text: "Press GREEN on a title to remove it" })
    ]));
    var list = Store.watchlist();
    var hist = Store.history();
    if (!list.length && !hist.length) {
      scroller.appendChild(UI.message("Nothing here yet", "Add titles with “My List” on any details page."));
      return;
    }
    if (list.length) {
      var grid = h("div", { class: "grid nav-group", "data-no-memory": "" });
      list.forEach(function (it) { grid.appendChild(UI.card(it)); });
      scroller.appendChild(h("section", { class: "row", "data-scroll-anchor": "" }, [h("h2", { class: "row-title", text: "Saved" }), grid]));
    }
    if (hist.length) {
      scroller.appendChild(UI.row("Recently watched", hist, { landscape: true }));
    }
  }

  render();

  return {
    el: el,
    onShow: function (first) { if (!first) render(); },
    onKey: function (key) {
      if (key !== "green") return false;
      var c = Nav.current();
      if (!c || !c.__item) return true;
      var inHistory = c.closest(".row-track");
      if (inHistory) Store.removeHistory(c.__item);
      else Store.toggleWatchlist(c.__item);
      UI.toast("Removed “" + UI.title(c.__item) + "”");
      render();
      Nav.focusFirst();
      return true;
    }
  };
};
