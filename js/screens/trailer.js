/*
 * Trailer: official YouTube trailer (from TMDB), fully remote-controlled.
 * Talks to the YouTube embed through its iframe postMessage protocol (no extra library):
 *   -> {event:"listening"} subscribes; <- {event:"infoDelivery", info:{currentTime, duration, playerState}}
 *   -> {event:"command", func:"playVideo"|"pauseVideo"|"seekTo", args:[...]}
 */
Screens.trailer = function (params) {
  var h = UI.h;
  var origin = /^https?:/.test(location.protocol) ? "&origin=" + encodeURIComponent(location.origin) : "";
  var keys = params.keys || [params.key], keyIdx = 0;
  function srcFor(key) {
    return "https://www.youtube.com/embed/" + encodeURIComponent(key) +
      "?autoplay=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=0&disablekb=1" + origin;
  }
  var iframe = h("iframe", {
    class: "trailer-frame",
    src: srcFor(keys[0]),
    allow: "autoplay; encrypted-media; picture-in-picture",
    sandbox: "allow-scripts allow-same-origin allow-presentation",
    frameborder: "0",
    tabindex: "-1"
  });
  var loader = h("div", { class: "player-loader" }, [UI.spinner(), h("div", { class: "loader-text", text: "Loading trailer…" })]);
  var osdIcon = h("span", { class: "osd-icon" });
  var osdTime = h("span", { class: "osd-time" });
  var osdTitle = h("span", { class: "osd-seek", text: params.title });
  var osdFill = h("div", { class: "osd-fill" });
  var osd = h("div", { class: "rc-osd" }, [
    h("div", { class: "osd-row" }, [osdIcon, osdTitle, osdTime]),
    h("div", { class: "osd-bar" }, [osdFill])
  ]);
  var holder = h("div", { class: "player trailer", tabindex: "-1" }, [loader, h("div", { class: "frame-host" }, [iframe]), h("div", { class: "click-shield" }), osd]);

  var st = { t: 0, dur: 0, state: -1, ready: false, pending: null };
  var listenTimer = null, sendTimer = null, osdTimer = null, failTimer = null;

  function send(func, args) {
    try { iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: func, args: args || [] }), "*"); } catch (e) {}
  }

  function listen() {
    try { iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch (e) {}
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60);
  }

  function render() {
    var t = st.pending !== null ? st.pending : st.t;
    osdTime.textContent = fmt(t) + " / " + (st.dur ? fmt(st.dur) : "--:--");
    osdFill.style.transform = "scaleX(" + (st.dur ? Math.min(1, t / st.dur) : 0) + ")";
    osdIcon.innerHTML = "";
    osdIcon.appendChild(UI.icon(st.state === 1 ? "play" : "pause"));
  }

  function showOsd(stay) {
    holder.classList.add("osd-show");
    clearTimeout(osdTimer);
    if (!stay) osdTimer = setTimeout(function () { if (st.state === 1) holder.classList.remove("osd-show"); }, 2500);
  }

  function onMessage(e) {
    if (e.source !== iframe.contentWindow) return;
    var msg = e.data;
    if (typeof msg === "string") { try { msg = JSON.parse(msg); } catch (x) { return; } }
    if (!msg || !msg.event) return;
    if (!st.ready) {
      st.ready = true;
      clearTimeout(failTimer);
    }
    if (msg.event === "infoDelivery" || msg.event === "initialDelivery") {
      clearInterval(listenTimer);              // subscribed; stop pinging
      loader.style.display = "none";
    }
    var info = msg.info;
    // Owner disabled embedding (101/150), video removed (100), etc. -> try the next trailer.
    if (msg.event === "onError") { nextTrailer(); return; }
    if (msg.event === "onStateChange" && typeof info === "number") st.state = info;
    if (msg.event === "infoDelivery" && info) {
      if (typeof info.currentTime === "number" && st.pending === null) st.t = info.currentTime;
      if (typeof info.duration === "number" && info.duration > 0) st.dur = info.duration;
      if (typeof info.playerState === "number") st.state = info.playerState;
    }
    render();
    if (st.state === 2) showOsd(true);
    if (st.state === 0) App.back();            // trailer finished
  }

  function nextTrailer() {
    keyIdx++;
    if (keyIdx >= keys.length) {
      loader.style.display = "";
      loader.querySelector(".spinner").style.display = "none";
      loader.querySelector(".loader-text").textContent = "None of this title's trailers can be played outside YouTube. Press BACK.";
      iframe.style.visibility = "hidden";
      return;
    }
    st = { t: 0, dur: 0, state: -1, ready: true, pending: null };
    loader.style.display = "";
    loader.querySelector(".loader-text").textContent = "That trailer can't be embedded, trying another (" + (keyIdx + 1) + "/" + keys.length + ")…";
    iframe.src = srcFor(keys[keyIdx]);
    render();
  }

  function toggle() {
    if (st.state === 1) { send("pauseVideo"); st.state = 2; showOsd(true); }
    else { send("playVideo"); st.state = 1; showOsd(); }
    render();
  }

  function seekBy(delta) {
    var base = st.pending !== null ? st.pending : st.t;
    st.pending = Math.max(0, Math.min(base + delta, st.dur ? st.dur - 1 : base + delta));
    render(); showOsd();
    clearTimeout(sendTimer);
    sendTimer = setTimeout(function () {
      send("seekTo", [st.pending, true]);
      st.t = st.pending; st.pending = null; render();
    }, 400);
  }

  iframe.addEventListener("load", function () {
    listen();
    clearInterval(listenTimer);
    listenTimer = setInterval(listen, 500);     // YouTube needs a few pings before it answers
  });
  failTimer = setTimeout(function () {
    if (!st.ready) loader.querySelector(".loader-text").textContent =
      "The trailer isn't responding. YouTube may block embeds from this app. Press BACK.";
  }, 12000);
  window.addEventListener("message", onMessage);
  render();
  showOsd();

  return {
    el: holder,
    fullscreen: true,
    onKey: function (key) {
      if (key === "enter" || key === "playpause" || key === "play" || key === "pause") { toggle(); return true; }
      if (key === "left" || key === "rew") { seekBy(key === "rew" ? -30 : -10); return true; }
      if (key === "right" || key === "ff") { seekBy(key === "ff" ? 30 : 10); return true; }
      if (key === "up" || key === "down") { showOsd(); return true; }
      return false;   // BACK closes
    },
    destroy: function () {
      clearInterval(listenTimer); clearTimeout(sendTimer); clearTimeout(osdTimer); clearTimeout(failTimer);
      window.removeEventListener("message", onMessage);
      iframe.src = "about:blank";
    }
  };
};
