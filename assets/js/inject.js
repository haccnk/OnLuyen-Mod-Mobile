(() => {
  const host = (window.location.hostname || "").toLowerCase();
  if (host && !host.endsWith("app.onluyen.vn")) return;

  if (window.__onluyenModInjected) return;
  window.__onluyenModInjected = true;

  try {
    Object.defineProperty(Document.prototype, "hidden", {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(Document.prototype, "visibilityState", {
      get: () => "visible",
      configurable: true
    });
    Object.defineProperty(Document.prototype, "webkitVisibilityState", {
      get: () => "visible",
      configurable: true
    });
    Document.prototype.hasFocus = () => true;
  } catch (e) {}

  const isAuthRoute = () => {
    const p = ((window.location.pathname || "") + (window.location.hash || "")).toLowerCase();
    return /\/(login|sign-in|auth)(\/|\?|#|$)/i.test(p);
  };

  const stopEvent = (e) => {
    if (isAuthRoute()) return;
    if ((e.type === "blur" || e.type === "focusout") && e.target !== window && e.target !== document) {
      return;
    }
    try {
      e.stopImmediatePropagation();
      e.stopPropagation();
    } catch (err) {}
  };

  [
    "blur",
    "focusout",
    "visibilitychange",
    "webkitvisibilitychange",
    "mouseleave",
    "pagehide",
    "freeze"
  ].forEach((evt) => {
    window.addEventListener(evt, stopEvent, true);
    document.addEventListener(evt, stopEvent, true);
  });

  try {
    Object.defineProperty(window, "onblur", {
      get: () => null,
      set: () => {},
      configurable: true
    });
    Object.defineProperty(document, "onvisibilitychange", {
      get: () => null,
      set: () => {},
      configurable: true
    });
  } catch (e) {}
})();
