/* Samsung remote key mapping. Desktop keyboard equivalents work for testing. */
var Keys = (function () {
  var MAP = {
    37: "left", 38: "up", 39: "right", 40: "down",
    13: "enter", 29443: "enter",
    10009: "back", 27: "back", 8: "back", 461: "back",
    403: "red", 404: "green", 405: "yellow", 406: "blue",
    82: "red", 71: "green", 89: "yellow", 66: "blue",          // R G Y B on keyboard
    427: "chup", 428: "chdown", 33: "chup", 34: "chdown",      // CH+/CH- and PageUp/Down
    10252: "playpause", 415: "play", 19: "pause", 413: "stop",
    417: "ff", 412: "rew",
    10182: "exit"
  };

  // Keys that must be registered on Tizen before the app receives them.
  var TIZEN_KEYS = [
    "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
    "ChannelUp", "ChannelDown",
    "MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop",
    "MediaFastForward", "MediaRewind"
  ];

  function register() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        TIZEN_KEYS.forEach(function (k) {
          try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* unsupported on model */ }
        });
      }
    } catch (e) { /* not on Tizen */ }
  }

  function name(evt) {
    // Backspace inside a real text input should stay a character delete
    if (evt.keyCode === 8 && evt.target && evt.target.tagName === "INPUT") return null;
    // Letter shortcuts for colour keys only when no modifier is held (desktop testing)
    if ((evt.keyCode >= 65 && evt.keyCode <= 90) && (evt.ctrlKey || evt.metaKey || evt.altKey)) return null;
    return MAP[evt.keyCode] || null;
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); }
    catch (e) { window.close(); }
  }

  return { register: register, name: name, exitApp: exitApp };
})();
