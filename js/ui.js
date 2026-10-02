/* DOM helpers and shared UI components. */
var UI = (function () {
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "style" && typeof v === "object") Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
        else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  var ICONS = {
    home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/>',
    search: '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    movie: '<path d="M4 5h16v14H4z M4 9h16 M8 5v4 M12 5v4 M16 5v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8 M9 2l3 4 3-4" fill="none" stroke="currentColor" stroke-width="2"/>',
    anime: '<path d="M12 2l2.9 6.9L22 9.6l-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6l7.1-.7z"/>',
    list: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1" stroke="currentColor" stroke-width="2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M6 4h4v16H6z M14 4h4v16h-4z"/>',
    cc: '<rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 10.2a2.5 2.5 0 100 3.6 M17.5 10.2a2.5 2.5 0 100 3.6" fill="none" stroke="currentColor" stroke-width="2"/>',
    plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
    check: '<path d="M9 16.2l-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
    star: '<path d="M12 2l2.9 6.9L22 9.6l-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6l7.1-.7z"/>',
    next: '<path d="M5 4l10 8-10 8z M16 4h3v16h-3z"/>',
    prev: '<path d="M19 4L9 12l10 8z M5 4h3v16H5z"/>',
    close: '<path d="M6 6l12 12 M18 6L6 18" stroke="currentColor" stroke-width="2.5"/>',
    hand: '<path d="M9 11V5a1.5 1.5 0 013 0v5 M12 10V4a1.5 1.5 0 013 0v6 M15 10V6a1.5 1.5 0 013 0v8c0 4-3 7-7 7s-6-2-7.5-5L2 12a1.5 1.5 0 012.5-1.5L7 13V7a1.5 1.5 0 013 0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z"/>',
    reload: '<path d="M20 12a8 8 0 11-2.3-5.7 M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="18" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="7.5" r="1.2"/><circle cx="7" cy="16.5" r="1.2"/>'
  };

  function icon(name) {
    var span = document.createElement("span");
    span.className = "icon";
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + (ICONS[name] || "") + "</svg>";
    return span;
  }

  // Lazy image loading - big win on TV hardware.
  var observer = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        var img = e.target;
        img.src = img.getAttribute("data-src");
        observer.unobserve(img);
      }
    });
  }, { rootMargin: "400px 800px" }) : null;

  function lazyImg(src, cls) {
    var img = h("img", { class: cls, alt: "" });
    img.decoding = "async";   // decode posters off the main thread so scrolling doesn't hitch
    img.onload = function () { img.classList.add("loaded"); };
    img.onerror = function () { img.style.visibility = "hidden"; };
    if (!src) return img;
    if (observer) { img.setAttribute("data-src", src); observer.observe(img); }
    else img.src = src;
    return img;
  }

  function year(item) {
    var d = item.release_date || item.first_air_date || "";
    return d ? d.slice(0, 4) : "";
  }

  function title(item) { return item.title || item.name || ""; }

  // Poster card. opts.landscape -> backdrop card, opts.subtitle -> override meta line.
  function card(item, opts) {
    opts = opts || {};
    var landscape = !!opts.landscape;
    var src = landscape ? TMDB.img(item.backdrop_path || item.poster_path, "w500")
                        : TMDB.img(item.poster_path || item.backdrop_path, "w342");
    var rating = item.vote_average ? (Math.round(item.vote_average * 10) / 10).toFixed(1) : "";
    var meta = opts.subtitle || [year(item), item.media_type === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ");

    var el = h("div", { class: "card focusable" + (landscape ? " landscape" : "") }, [
      h("div", { class: "card-img" }, [
        lazyImg(src),
        rating ? h("div", { class: "badge-rating" }, [icon("star"), rating]) : null,
        opts.progress ? h("div", { class: "card-progress", text: opts.progress }) : null
      ]),
      h("div", { class: "card-title", text: title(item) }),
      h("div", { class: "card-meta", text: meta })
    ]);
    el.__item = item;
    el.addEventListener("click", function () {
      if (opts.onSelect) opts.onSelect(item);
      else App.push("details", { type: item.media_type, id: item.id });
    });
    return el;
  }

  // Horizontal row of cards.
  function row(heading, items, opts) {
    opts = opts || {};
    var track = h("div", { class: "row-track nav-group", "data-scroll": "x" });
    var wrap = h("section", { class: "row", "data-scroll-anchor": "" }, [
      h("h2", { class: "row-title", text: heading }),
      track
    ]);

    // Infinite horizontal loading when focus nears the end of the row.
    var page = 1, loading = false, done = !opts.loadMore;
    function checkMore(el) {
      if (done || loading) return;
      if (Array.prototype.indexOf.call(track.children, el) < track.children.length - 5) return;
      loading = true;
      opts.loadMore(++page).then(function (res) {
        if (!res.results.length || page >= res.totalPages) done = true;
        res.results.forEach(add);
        loading = false;
      }).catch(function () { loading = false; done = true; });
    }
    function add(it) {
      var c = card(it, opts);
      c.__onFocus = function () { checkMore(c); };
      track.appendChild(c);
    }
    items.forEach(add);
    return wrap;
  }

  function placeholderRow(heading) {
    var track = h("div", { class: "row-track" });
    for (var i = 0; i < 8; i++) track.appendChild(h("div", { class: "card skeleton" }, [h("div", { class: "card-img" })]));
    return h("section", { class: "row" }, [h("h2", { class: "row-title", text: heading }), track]);
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, ms || 2500);
  }

  function spinner() { return h("div", { class: "spinner" }); }

  function message(titleText, body, extra) {
    return h("div", { class: "message" }, [
      h("h2", { text: titleText }),
      body ? h("p", { text: body }) : null,
      extra || null
    ]);
  }

  function button(label, iconName, onClick, cls) {
    return h("div", { class: "btn focusable" + (cls ? " " + cls : ""), onclick: onClick }, [
      iconName ? icon(iconName) : null,
      h("span", { class: "btn-label", text: label })
    ]);
  }

  return {
    h: h, icon: icon, lazyImg: lazyImg, card: card, row: row, placeholderRow: placeholderRow,
    toast: toast, spinner: spinner, message: message, button: button, year: year, title: title
  };
})();
