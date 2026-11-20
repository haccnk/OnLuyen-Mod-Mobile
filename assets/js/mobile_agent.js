((globalScope) => {
  if (typeof globalScope.__autoSolverMobileCleanup === "function") {
    try { globalScope.__autoSolverMobileCleanup(); } catch (e) {}
  }

  const EXT = globalScope.__OnLuyenExtractor || (typeof require === "function" ? require("./dom_extractor_mobile.js") : null);
  if (!EXT) {
    console.warn("[OnLuyen Mod Mobile] Không tìm thấy __OnLuyenExtractor!");
    return;
  }

  const WATCHDOG_TIMEOUT_MS = 55000;
  const POST_CLICK_VERIFY_DELAY_MS = 320;

  let runEpoch = 0;
  let isProcessing = false;
  let isSelfAdvancing = false;
  let solvedSignature = "";
  let debounceTimer = null;
  let maxWaitTimer = null;
  let retrySyncTimer1 = null;
  let retrySyncTimer2 = null;
  let platformReadyHandler = null;
  let routeChangeHandler = null;
  let configSynced = false;
  let lastRouteKey = normalizeRouteKey();
  let isExtensionEnabled = false;
  let autoAdvanceEnabled = true;
  let intelligenceMode = "smart";
  let domObserver = null;
  let heartbeatTimer = null;
  let processingWatchdog = null;
  let hasAutoExported = false;
  let lastWaitingStatusAt = 0;
  let _cachedBodyTxt = "";
  let _cachedBodyTxtAt = 0;
  let _cachedBodyDoc = null;
  let lastClickInfo = null;

  const managedTimers = new Set();
  const solvedListKeys = new Set();
  let solvedBlockEls = new WeakSet();
  const skippedFailedListKeys = new Set();
  const failCountMap = new Map();
  const attemptedSingleQuestions = new Set();
  const solvedSingleFingerprints = new Set();
  const solvedExplicitQCodes = new Set();
  const clickedNavNums = new Set();
  const rejectedHistoryMap = new Map();

  function isRunAlive(epoch, requireEnabled = true) {
    return epoch === runEpoch && (!requireEnabled || isExtensionEnabled);
  }

  function scheduleManagedTimeout(fn, ms, epoch = null, requireEnabled = true) {
    let timerId = null;
    timerId = setTimeout(() => {
      managedTimers.delete(timerId);
      if (epoch !== null && !isRunAlive(epoch, requireEnabled)) return;
      fn();
    }, ms);
    managedTimers.add(timerId);
    return timerId;
  }

  function clearAllManagedTimers() {
    for (const id of managedTimers) {
      clearTimeout(id);
    }
    managedTimers.clear();
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  }

  function invalidateBodyTextCache() {
    _cachedBodyTxt = "";
    _cachedBodyTxtAt = 0;
    _cachedBodyDoc = null;
  }

  function cancelActiveWork() {
    runEpoch += 1;
    isProcessing = false;
    isSelfAdvancing = false;
    lastClickInfo = null;
    clearProcessingWatchdog();
    clearAllManagedTimers();
    invalidateBodyTextCache();
  }

  function normalizeRouteKey(rawUrl = "") {
    if (typeof rawUrl === "string" && rawUrl) {
      try {
        const u = new URL(rawUrl, globalScope.location?.href || "https://app.onluyen.vn/");
        return ((u.pathname || "") + (u.hash || "")).toLowerCase();
      } catch (e) {
        return rawUrl.split("?")[0].toLowerCase();
      }
    }
    const loc = globalScope.location || {};
    return ((loc.pathname || "") + (loc.hash || "")).toLowerCase();
  }

  function getVisibleBodyText(scopeDoc = globalScope.document) {
    const body = scopeDoc?.body;
    if (!body) return "";
    const now = Date.now();
    if (_cachedBodyDoc === scopeDoc && now - _cachedBodyTxtAt <= 400) {
      return _cachedBodyTxt;
    }
    const txt = typeof body.innerText === "string" ? body.innerText : (body.textContent || "");
    _cachedBodyDoc = scopeDoc;
    _cachedBodyTxt = txt;
    _cachedBodyTxtAt = now;
    return txt;
  }

  function waitMs(ms) {
    return new Promise((resolve) => scheduleManagedTimeout(resolve, ms));
  }

  function waitNextTwoFrames() {
    if (typeof globalScope.requestAnimationFrame === "function") {
      return new Promise((resolve) => {
        globalScope.requestAnimationFrame(() => {
          globalScope.requestAnimationFrame(() => resolve());
        });
      });
    }
    return waitMs(34);
  }

  async function callNative(handlerName, payload) {
    try {
      if (typeof globalScope.__MockFlutterBridge === "function") {
        return await globalScope.__MockFlutterBridge(handlerName, payload);
      }
      const bridge = globalScope.flutter_inappwebview;
      if (bridge && typeof bridge.callHandler === "function") {
        return await bridge.callHandler(handlerName, payload);
      }
    } catch (err) {
      console.warn(`[OnLuyen Mod Mobile] callNative(${handlerName}) error:`, err);
    }
    return null;
  }

  function startProcessingWatchdog(label = "", epoch = runEpoch) {
    if (processingWatchdog) clearTimeout(processingWatchdog);
    processingWatchdog = setTimeout(() => {
      processingWatchdog = null;
      if (epoch === runEpoch && isProcessing) {
        isProcessing = false;
        isSelfAdvancing = false;
        syncStatus(`⚠️ Quá thời gian chờ phản hồi${label ? ` (${label})` : ""}, đã tự mở khóa!`);
      }
    }, WATCHDOG_TIMEOUT_MS);
  }

  function clearProcessingWatchdog() {
    if (processingWatchdog) {
      clearTimeout(processingWatchdog);
      processingWatchdog = null;
    }
  }

  function recordRejectedAnswer(sig, ans) {
    if (!sig || !ans) return [];
    if (!rejectedHistoryMap.has(sig)) rejectedHistoryMap.set(sig, new Set());
    rejectedHistoryMap.get(sig).add(String(ans).trim());
    return Array.from(rejectedHistoryMap.get(sig));
  }

  function getRejectedAnswers(sig, oldUiAns) {
    if (oldUiAns) return recordRejectedAnswer(sig, oldUiAns);
    return rejectedHistoryMap.has(sig) ? Array.from(rejectedHistoryMap.get(sig)) : [];
  }

  function syncStatus(solverStatus, lastSolvedAnswer = null, lastSolvedMeta = null) {
    callNative("syncStatus", {
      solverStatus,
      lastSolvedAnswer,
      lastSolvedMeta
    });
  }

  function saveCleanExportItem(entry) {
    callNative("saveHistoryItem", entry);
  }

  function triggerAutoExportNotification() {
    if (hasAutoExported) return;
    hasAutoExported = true;
    callNative("onQuizCompleted", { timestamp: Date.now() });
  }

  function scrollTargetIntoCenter(el) {
    if (!el || typeof el.scrollIntoView !== "function") return;
    try {
      el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    } catch (e) {
      try {
        el.scrollIntoView(true);
      } catch (e2) {}
    }
  }

  function scrollIfOffScreen(el) {
    if (!el) return;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0, bottom: 0, height: 0 };
    const vh = globalScope.innerHeight || 800;
    if (r.height === 0 || r.top < 60 || r.bottom > vh - 60) {
      scrollTargetIntoCenter(el);
    }
  }

  function dispatchClick(el, { scroll = true } = {}) {
    if (!el) return;
    if (scroll) scrollIfOffScreen(el);
    invalidateBodyTextCache();
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
    const cx = (r.left || 0) + Math.max((r.width || 20) / 2, 4);
    const cy = (r.top || 0) + Math.max((r.height || 20) / 2, 4);
    const downInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: globalScope,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: cx,
      clientY: cy
    };
    const upInit = {
      ...downInit,
      buttons: 0
    };
    try {
      if (typeof globalScope.PointerEvent === "function") {
        el.dispatchEvent(
          new globalScope.PointerEvent("pointerdown", {
            ...downInit,
            pointerId: 1,
            isPrimary: true,
            pointerType: "touch"
          })
        );
      }
      if (typeof globalScope.MouseEvent === "function") {
        el.dispatchEvent(new globalScope.MouseEvent("mousedown", downInit));
      }
      if (typeof globalScope.PointerEvent === "function") {
        el.dispatchEvent(
          new globalScope.PointerEvent("pointerup", {
            ...upInit,
            pointerId: 1,
            isPrimary: true,
            pointerType: "touch"
          })
        );
      }
      if (typeof globalScope.MouseEvent === "function") {
        el.dispatchEvent(new globalScope.MouseEvent("mouseup", upInit));
      }
    } catch (e) {}

    const tag = (el.tagName || "").toLowerCase();
    const isNativeControl = tag === "input" || tag === "label" || tag === "button" || tag === "a";
    if (isNativeControl && typeof el.click === "function") {
      el.click();
      if (tag === "input" && (el.type === "radio" || el.type === "checkbox") && el.checked !== true) {
        try {
          el.checked = true;
          if (typeof globalScope.Event === "function") {
            el.dispatchEvent(new globalScope.Event("input", { bubbles: true }));
            el.dispatchEvent(new globalScope.Event("change", { bubbles: true }));
          }
        } catch (e) {}
      }
    } else if (typeof globalScope.MouseEvent === "function") {
      try {
        el.dispatchEvent(new globalScope.MouseEvent("click", upInit));
      } catch (e) {}
    } else if (typeof el.click === "function") {
      el.click();
    }
  }

  function isDisabledButton(el) {
    if (!el) return true;
    if (el.disabled === true || el.getAttribute?.("aria-disabled") === "true") return true;
    const cls = String(el.className || "");
    return /\b(disabled|is-disabled|ant-btn-disabled)\b/i.test(cls);
  }

  function findActionButtons(doc = globalScope.document) {
    let submitBtn = null;
    let nextBtn = null;
    const nodes = doc?.querySelectorAll?.("button, [role='button'], a, div, span") || [];
    for (const el of nodes) {
      if ((el.children?.length || 0) > 2) continue;
      const raw = (el.textContent || el.innerText || "").trim();
      if (raw.length === 0 || raw.length > 24) continue;
      const t = raw.replace(/[←→➔▸▶›»<>]+/g, "").trim().toUpperCase();
      if (!t || t.length > 18) continue;

      const isSubmit = t === "TRẢ LỜI" || t === "KIỂM TRA" || t === "XÁC NHẬN";
      const clickTarget = el.closest ? el.closest("button, [role='button'], a") || el : el;
      const targetTag = (clickTarget.tagName || "").toLowerCase();
      const isControlTarget = targetTag === "button" || targetTag === "a" || clickTarget.getAttribute?.("role") === "button";
      const isShortNext = isControlTarget && (t === "TIẾP" || t === "SAU" || t === "NEXT");
      const isNext =
        t === "TIẾP TỤC" ||
        t === "TIẾP THEO" ||
        t === "CÂU TIẾP" ||
        t === "CÂU TIẾP THEO" ||
        t === "CÂU SAU" ||
        t === "CÂU KẾ" ||
        t === "CÂU KẾ TIẾP" ||
        isShortNext;

      if (!isSubmit && !isNext) continue;
      if (EXT.isEffectivelyHidden?.(el) || EXT.isInsideNavOrChrome(el)) continue;
      if (isDisabledButton(el) || isDisabledButton(clickTarget)) continue;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (r.width === 0 || r.height === 0) continue;

      if (isSubmit && !submitBtn) submitBtn = clickTarget;
      if (isNext && !nextBtn) nextBtn = clickTarget;
      if (submitBtn && nextBtn) break;
    }

    if (!nextBtn && doc?.querySelectorAll) {
      const iconControls = doc.querySelectorAll("button, [role='button'], a") || [];
      for (const el of iconControls) {
        if (EXT.isEffectivelyHidden?.(el) || EXT.isInsideNavOrChrome(el)) continue;
        if (isDisabledButton(el)) continue;
        const raw = (el.textContent || el.innerText || "").trim();
        const aria = (el.getAttribute?.("aria-label") || "").trim();
        const title = (el.getAttribute?.("title") || "").trim();
        const cls = String(el.className || "");
        const combined = `${raw} ${aria} ${title} ${cls}`;
        if (/(trước|lùi|quay lại|nộp|prev|back|submit|top|up)/i.test(combined)) continue;

        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0, width: 0, height: 0 };
        if (r.width === 0 || r.height === 0) continue;

        const hasNextLabel = /(câu\s*(sau|tiếp|kế)|tiếp\s*(theo|tục)|next)/i.test(`${aria} ${title}`);
        const hasNextClass = /(next-question|btn-next|next-btn|quiz-next|arrow-next)/i.test(cls);
        const hasRightChevron =
          r.top > 120 &&
          Boolean(
            el.querySelector?.(
              ".fa-chevron-right, .fa-angle-right, .fa-arrow-right, .anticon-right, .mdi-chevron-right, .icon-next"
            )
          );
        if (hasNextLabel || hasNextClass || hasRightChevron) {
          nextBtn = el;
          break;
        }
      }
    }

    return { submitBtn, nextBtn };
  }

  function findContinueButton(scopeDoc = document) {
    return findActionButtons(scopeDoc).nextBtn;
  }

  function stripVolatileUiText(raw = "") {
    return String(raw || "")
      .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, " ")
      .replace(/(?:^|\n)\s*\d{1,2}:\d{2}\s*(?=\n|$)/g, "\n")
      .replace(/(?:\s*\|\s*(?:Báo lỗi|Báo cáo|Đánh dấu(?:\s+câu\s+hỏi)?|Bỏ đánh dấu))+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function computeQuestionFingerprint(type, payload) {
    return [
      type || "",
      stripVolatileUiText(payload?.stemText || "").slice(0, 140),
      stripVolatileUiText(payload?.extraDetails || "").slice(0, 140),
      String(payload?.visualSignature || "").slice(0, 60)
    ].join("|");
  }

  function computeLiveQuestionFingerprint(scopeDoc = globalScope.document) {
    if (!scopeDoc || !scopeDoc.body) return "";
    if (typeof EXT.beginScanCache === "function") EXT.beginScanCache();
    try {
      const cls = EXT.classifyQuestionInScope(scopeDoc, true);
      if (!cls || !cls.type) return "";
      const p = EXT.extractQuestionPayload(scopeDoc, cls);
      return computeQuestionFingerprint(cls.type, p);
    } catch (e) {
      return "";
    } finally {
      if (typeof EXT.endScanCache === "function") EXT.endScanCache();
    }
  }

  function resolveAndDetect() {
    const doc = globalScope.document;
    if (!doc) return { scopeDoc: null, blocks: [], classified: { type: null, shortInp: null, tf: null, mcq: [] } };
    if (typeof EXT.beginScanCache === "function") EXT.beginScanCache();
    try {
      let blocks = EXT.getMultiBlocks(doc);
      if (blocks.length >= 2) {
        return { scopeDoc: doc, blocks, classified: { type: null, shortInp: null, tf: null, mcq: [] } };
      }
      let classified = EXT.classifyQuestionInScope(doc, true);
      if (classified.type) {
        return { scopeDoc: doc, blocks: [], classified };
      }

      const iframes = Array.from(doc.querySelectorAll?.("iframe") || []);
      for (const ifr of iframes) {
        try {
          const r = ifr.getBoundingClientRect();
          if (r.width < 120 || r.height < 120) continue;
          const innerDoc = ifr.contentDocument || ifr.contentWindow?.document;
          if (!innerDoc || !innerDoc.body) continue;
          blocks = EXT.getMultiBlocks(innerDoc);
          if (blocks.length >= 2) {
            return { scopeDoc: innerDoc, blocks, classified: { type: null, shortInp: null, tf: null, mcq: [] } };
          }
          classified = EXT.classifyQuestionInScope(innerDoc, true);
          if (classified.type) {
            return { scopeDoc: innerDoc, blocks: [], classified };
          }
        } catch (e) {}
      }
      return { scopeDoc: doc, blocks: [], classified };
    } finally {
      if (typeof EXT.endScanCache === "function") EXT.endScanCache();
    }
  }

  function resolveTargetScopeDoc() {
    return resolveAndDetect().scopeDoc;
  }

  function isQuizPage(scopeDoc = globalScope.document, preDetectedType = undefined) {
    if (!scopeDoc || !scopeDoc.body) return false;
    const loc = globalScope.location || { pathname: "", hash: "", search: "" };
    const routePath = ((loc.pathname || "") + (loc.hash || "")).toLowerCase();
    const routeOnly = routePath.split("?")[0];
    const searchLower = (loc.search || "").toLowerCase();

    if (/(\/|^)(login|sign-in|signin|auth|register|forgot-password)(\/|\?|#|$)/i.test(routePath)) {
      return false;
    }

    const txt = getVisibleBodyText(scopeDoc);
    if (routePath.includes("result")) return false;
    if (/Kết quả chi tiết|Số câu đúng|Tổng điểm/i.test(txt) && /Đáp án của bạn/i.test(txt)) {
      if (!findContinueButton(scopeDoc)) return false;
    }

    if (!preDetectedType && /(^|\/)(home-student|dashboard|profile|ranking)\/?$/i.test(routeOnly)) {
      return false;
    }
    if (preDetectedType) {
      return true;
    }

    if (
      /(practice|exam|test|step|assignment|docx|homework|bai-tap|kiem-tra|luyen-tap|de-thi|quiz|contest|arena|study|learn|doing|do-exam|do-test|adaptive|self-study|student\/(exam|practice|test|assignment))/.test(
        routePath + searchLower
      )
    ) {
      return true;
    }
    if (/#\d{5,}/.test(txt) || /(?:Câu(?:\s+hỏi)?|Question)\s+\d+/i.test(txt) || /Nộp bài|Phiếu trả lời/i.test(txt)) {
      return true;
    }
    if (preDetectedType === undefined) {
      return EXT.classifyQuestionInScope(scopeDoc, true).type !== null;
    }
    return false;
  }

  function dismissSubmitModal() {
    const doc = globalScope.document;
    const bodyTxt = getVisibleBodyText(doc);
    if (/chắc chắn muốn nộp bài|xác nhận nộp bài|kết thúc bài làm|nộp bài thi/i.test(bodyTxt)) {
      const cancelBtn = Array.from(doc.querySelectorAll?.("button, [role='button'], div, span") || []).find((el) => {
        const t = (el.innerText || el.textContent || "").trim().toUpperCase();
        return (el.children?.length || 0) === 0 && (t === "HỦY" || t === "HỦY BỎ" || t === "QUAY LẠI" || t === "ĐÓNG" || t === "KHÔNG");
      });
      if (cancelBtn) {
        dispatchClick(cancelBtn.closest ? cancelBtn.closest("button") || cancelBtn : cancelBtn);
        triggerAutoExportNotification();
        return true;
      }
    }
    return false;
  }

  function isVisibleInteractiveChoiceChild(el, c) {
    if (!el || isDisabledButton(el) || EXT.isEffectivelyHidden?.(el)) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || el.getAttribute?.("role") === "radio") {
      return true;
    }
    const containsBadge = Boolean(c.badgeEl && typeof el.contains === "function" && el.contains(c.badgeEl));
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
    return containsBadge || r.width >= 60;
  }

  function getMcqClickCandidates(c, scopeDoc = globalScope.document) {
    if (!c) return [];
    const out = [];
    const docBody = scopeDoc?.body || globalScope.document?.body;
    const docHtml = scopeDoc?.documentElement || globalScope.document?.documentElement;
    const addUnique = (el) => {
      if (!el || el === docBody || el === docHtml) return;
      if (!out.includes(el)) out.push(el);
    };

    // 1. Control tương tác thực sự trong rowEl (bỏ qua icon/tooltip nhỏ)
    const innerControls = Array.from(
      c.rowEl?.querySelectorAll?.('input[type="radio"], [role="radio"], button, label') || []
    );
    for (const ctrl of innerControls) {
      if (isVisibleInteractiveChoiceChild(ctrl, c)) {
        addUnique(ctrl);
        break;
      }
    }

    // 2. Đi ngược từ badgeEl lên trong phạm vi rowEl tìm card clickable (.answer-card / cursor:pointer)
    const canWalkInsideRow =
      c.badgeEl &&
      c.rowEl &&
      c.badgeEl !== c.rowEl &&
      typeof c.rowEl.contains === "function" &&
      c.rowEl.contains(c.badgeEl);

    if (canWalkInsideRow) {
      let cur = c.badgeEl.parentElement;
      let foundCard = null;
      while (cur && cur !== c.rowEl && cur !== docBody && cur !== docHtml) {
        let isPointer = false;
        try {
          const cs = typeof globalScope.getComputedStyle === "function" ? globalScope.getComputedStyle(cur) : cur.style;
          if (cs && cs.cursor === "pointer") isPointer = true;
        } catch (e) {}
        const cls = String(cur.className || "");
        if (
          isPointer ||
          cur.getAttribute?.("role") === "button" ||
          typeof cur.onclick === "function" ||
          /(answer|option|choice|item|card|box)/i.test(cls)
        ) {
          foundCard = cur;
          break;
        }
        cur = cur.parentElement;
      }
      if (foundCard) {
        addUnique(foundCard);
      } else if (c.badgeEl.parentElement && c.badgeEl.parentElement !== c.rowEl) {
        addUnique(c.badgeEl.parentElement);
      }
    }

    // 3. Điểm chạm trực quan ngay giữa thẻ c.rowEl qua elementFromPoint
    if (c.rowEl && typeof scopeDoc?.elementFromPoint === "function" && typeof c.rowEl.getBoundingClientRect === "function") {
      try {
        const rr = c.rowEl.getBoundingClientRect();
        if (rr && rr.width > 0 && rr.height > 0) {
          const cx = rr.left + rr.width / 2;
          const cy = rr.top + rr.height / 2;
          let hit = scopeDoc.elementFromPoint(cx, cy);
          while (
            hit &&
            hit !== c.rowEl &&
            hit !== docBody &&
            hit !== docHtml &&
            typeof c.rowEl.contains === "function" &&
            c.rowEl.contains(hit)
          ) {
            const cls = String(hit.className || "");
            const tag = (hit.tagName || "").toLowerCase();
            if (!/\b(katex|mjx-)/i.test(cls) && !tag.startsWith("mjx-") && tag !== "math" && tag !== "svg" && tag !== "path") {
              break;
            }
            hit = hit.parentElement;
          }
          if (
            hit &&
            hit !== docBody &&
            hit !== docHtml &&
            (hit === c.rowEl || (typeof c.rowEl.contains === "function" && c.rowEl.contains(hit)))
          ) {
            addUnique(hit);
          }
        }
      } catch (e) {}
    }

    // 4. badgeEl
    if (c.badgeEl) addUnique(c.badgeEl);

    // 5. rowEl và input dự phòng (Antd opacity:0)
    if (c.rowEl) addUnique(c.rowEl);
    const fallbackInput = c.rowEl?.querySelector?.('input[type="radio"]');
    if (fallbackInput) addUnique(fallbackInput);

    return out;
  }

  function clickMCQ(c, { candidateIndex = 0 } = {}) {
    if (!c) return null;
    const candidates = getMcqClickCandidates(c);
    const target = candidates[candidateIndex] || candidates[0] || null;
    if (!target) return null;
    scrollIfOffScreen(c.rowEl || target);
    dispatchClick(target, { scroll: false });
    return target;
  }

  function fillInput(inputEl, rawVal, answerKind, cb, opts = {}) {
    if (!inputEl) {
      if (typeof cb === "function") cb();
      return;
    }

    const epoch = opts.epoch !== undefined ? opts.epoch : null;
    const requireEnabled = opts.requireEnabled !== undefined ? opts.requireEnabled : false;
    if (epoch !== null && !isRunAlive(epoch, requireEnabled)) return;

    scrollIfOffScreen(inputEl);
    const rawStr = String(rawVal ?? "").trim();
    const isTextMode = answerKind === "TEXT" || /[A-Za-zÀ-ỹ]/.test(rawStr);
    const val = isTextMode ? rawStr.replace(/\s+/g, " ").trim() : rawStr.replace(/\s+/g, "");

    const isCE = Boolean(inputEl.isContentEditable || inputEl.getAttribute?.("contenteditable") === "true");

    const apply = (v) => {
      try {
        if (typeof inputEl.focus === "function") inputEl.focus();
        if (isCE) {
          inputEl.textContent = v;
        } else {
          const isTA = typeof globalScope.HTMLTextAreaElement === "function" && inputEl instanceof globalScope.HTMLTextAreaElement;
          const proto = isTA
            ? globalScope.HTMLTextAreaElement?.prototype
            : globalScope.HTMLInputElement?.prototype;
          const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : null;
          if (nativeSetter) {
            nativeSetter.call(inputEl, v);
          } else {
            inputEl.value = v;
          }
        }
      } catch (err) {
        if (isCE) inputEl.textContent = v;
        else inputEl.value = v;
      }

      try {
        if (typeof globalScope.InputEvent === "function") {
          inputEl.dispatchEvent(new globalScope.InputEvent("input", { bubbles: true, inputType: "insertText", data: v }));
        } else if (typeof globalScope.Event === "function") {
          inputEl.dispatchEvent(new globalScope.Event("input", { bubbles: true }));
        }
        if (typeof globalScope.Event === "function") {
          inputEl.dispatchEvent(new globalScope.Event("change", { bubbles: true }));
        }
        if (typeof inputEl.blur === "function") inputEl.blur();
      } catch (e) {}
    };

    apply(val);
    scheduleManagedTimeout(() => {
      const currentVal = isCE ? (inputEl.textContent || "") : (inputEl.value || "");
      if (!isTextMode && (!currentVal || !String(currentVal).trim())) {
        const altVal = val.includes(",") ? val.replace(",", ".") : val.replace(".", ",");
        apply(altVal);
      }
      scheduleManagedTimeout(() => {
        let detected = EXT.detectUIAns("SHORT_ANSWER", null, inputEl, null);
        if (!detected) {
          apply(val);
          detected = EXT.detectUIAns("SHORT_ANSWER", null, inputEl, null);
        }
        if (typeof cb === "function") cb(Boolean(detected));
      }, POST_CLICK_VERIFY_DELAY_MS, epoch, requireEnabled);
    }, 180, epoch, requireEnabled);
  }

  function formatCleanAnswerForExport(type, normAns, mcq) {
    if (type === "MCQ") {
      const idx = normAns.charCodeAt(0) - 65;
      const choiceTxt = EXT.sanitizeChoiceText(mcq?.[idx]?.text || "", normAns);
      return choiceTxt ? `${normAns}. ${choiceTxt}` : normAns;
    }
    if (type === "TRUE_FALSE" && normAns.includes("-")) {
      return normAns
        .split("-")
        .map((v, i) => `${String.fromCharCode(97 + i)}) ${v === "Đ" ? "Đúng" : "Sai"}`)
        .join(" | ");
    }
    return normAns;
  }

  // =========================================================================
  // TÍCH ĐÁP ÁN + POST-CLICK VERIFICATION + BẢO VỆ TỰ CHUYỂN CÂU
  // =========================================================================
  function captureChoiceSnapshot(choice) {
    const root = choice?.rowEl || choice?.badgeEl;
    if (!root || root.nodeType !== 1) return "";
    const parts = [];
    const queue = [root];
    const seen = new Set();
    while (queue.length > 0 && parts.length < 24) {
      const node = queue.shift();
      if (!node || node.nodeType !== 1 || seen.has(node)) continue;
      seen.add(node);
      const tag = (node.tagName || "").toLowerCase();
      const cls = String(node.className || "");
      if (tag.startsWith("mjx-") || /\b(katex|mathjax)\b/i.test(cls)) continue;

      let sig = `${tag}:${cls}`;
      for (const attr of ["aria-checked", "aria-pressed", "aria-selected", "data-selected", "data-checked", "data-state"]) {
        const v = node.getAttribute?.(attr);
        if (v !== null && v !== undefined && v !== "") sig += `|${attr}=${v}`;
      }
      if (tag === "input") {
        sig += `|chk=${Boolean(node.checked)}`;
      }
      try {
        const cs = typeof globalScope.getComputedStyle === "function" ? globalScope.getComputedStyle(node) : node.style;
        if (cs) {
          sig += `|${cs.backgroundColor || ""}|${cs.borderColor || cs.borderTopColor || ""}|${cs.color || ""}`;
        }
      } catch (e) {}
      parts.push(sig);

      const kids = node.children || [];
      for (let i = 0; i < kids.length; i++) {
        queue.push(kids[i]);
      }
    }
    return parts.join(";");
  }

  function captureMcqVisualSnapshots(mcq) {
    if (!Array.isArray(mcq)) return [];
    return mcq.map((c) => captureChoiceSnapshot(c));
  }

  function didTargetChoiceChange(beforeSnaps, afterSnaps, targetIdx) {
    if (!Array.isArray(beforeSnaps) || !Array.isArray(afterSnaps)) return false;
    if (targetIdx < 0 || targetIdx >= beforeSnaps.length || targetIdx >= afterSnaps.length) return false;
    if (!beforeSnaps[targetIdx] || !afterSnaps[targetIdx]) return false;
    if (beforeSnaps[targetIdx] === afterSnaps[targetIdx]) return false;
    let otherChangedCount = 0;
    for (let i = 0; i < beforeSnaps.length; i++) {
      if (i === targetIdx) continue;
      if (beforeSnaps[i] !== afterSnaps[i]) otherChangedCount += 1;
    }
    return otherChangedCount <= 1;
  }

  function applyAnswerToDOM(type, ansStr, answerKind, mcq, shortInp, tf, onDone, opts = {}) {
    const finish = typeof onDone === "function" ? onDone : () => {};
    const epoch = opts.epoch !== undefined ? opts.epoch : null;
    const requireEnabled = opts.requireEnabled !== undefined ? opts.requireEnabled : false;
    const expectedFingerprint = opts.expectedFingerprint || "";
    const expectedQCode = opts.expectedQCode || "";
    const scopeDoc = opts.scopeDoc || globalScope.document;

    if (epoch !== null && !isRunAlive(epoch, requireEnabled)) return;

    if (type === "MCQ" && ansStr) {
      const idx = ansStr.charCodeAt(0) - 65;
      if (mcq[idx]) {
        scrollIfOffScreen(mcq[idx].rowEl || mcq[idx].badgeEl);
        const rawCandidates = getMcqClickCandidates(mcq[idx], scopeDoc);
        const candidates = rawCandidates.length === 1 ? [rawCandidates[0], rawCandidates[0]] : rawCandidates;
        const preClickFp = expectedFingerprint ? computeLiveQuestionFingerprint(scopeDoc) || expectedFingerprint : "";
        const beforeSnaps = captureMcqVisualSnapshots(mcq);

        const tryCandidate = (candIdx, attemptsSoFar) => {
          const target = candidates[candIdx];
          if (!target) {
            lastClickInfo = {
              ans: ansStr,
              attempts: attemptsSoFar,
              verified: false,
              via: "none",
              candidateCount: candidates.length,
              targetTag: "",
              targetClass: ""
            };
            finish({ autoAdvanced: false, verified: false });
            return;
          }
          scrollIfOffScreen(mcq[idx].rowEl || target);
          dispatchClick(target, { scroll: false });
          const nextAttempts = attemptsSoFar + 1;
          const waitDelay = candIdx === 0 ? POST_CLICK_VERIFY_DELAY_MS : 220;

          scheduleManagedTimeout(() => {
            const rowEl = mcq[idx].rowEl;
            const rowDetached =
              rowEl &&
              (rowEl.isConnected === false ||
                (typeof scopeDoc?.body?.contains === "function" && !scopeDoc.body.contains(rowEl)));
            if (rowDetached) {
              lastClickInfo = {
                ans: ansStr,
                attempts: nextAttempts,
                verified: true,
                via: "rowDetached",
                candidateCount: candidates.length,
                targetTag: target.tagName || "",
                targetClass: String(target.className || "").slice(0, 60)
              };
              finish({ autoAdvanced: true, verified: true });
              return;
            }
            if (preClickFp) {
              const postClickFp = computeLiveQuestionFingerprint(scopeDoc);
              const sameExplicitCode = Boolean(
                expectedQCode &&
                  /^#\d{5,}$/.test(expectedQCode) &&
                  getVisibleBodyText(scopeDoc).includes(expectedQCode)
              );
              if (postClickFp && postClickFp !== preClickFp && !sameExplicitCode) {
                lastClickInfo = {
                  ans: ansStr,
                  attempts: nextAttempts,
                  verified: true,
                  via: "fpChanged",
                  candidateCount: candidates.length,
                  targetTag: target.tagName || "",
                  targetClass: String(target.className || "").slice(0, 60)
                };
                finish({ autoAdvanced: true, verified: true });
                return;
              }
            }
            const nowSelected = EXT.detectUIAns("MCQ", mcq, null, null);
            if (nowSelected === ansStr) {
              lastClickInfo = {
                ans: ansStr,
                attempts: nextAttempts,
                verified: true,
                via: "detectUIAns",
                candidateCount: candidates.length,
                targetTag: target.tagName || "",
                targetClass: String(target.className || "").slice(0, 60)
              };
              finish({ autoAdvanced: false, verified: true });
              return;
            }
            const afterSnaps = captureMcqVisualSnapshots(mcq);
            if (didTargetChoiceChange(beforeSnaps, afterSnaps, idx)) {
              lastClickInfo = {
                ans: ansStr,
                attempts: nextAttempts,
                verified: true,
                via: "snapshotDiff",
                candidateCount: candidates.length,
                targetTag: target.tagName || "",
                targetClass: String(target.className || "").slice(0, 60)
              };
              finish({ autoAdvanced: false, verified: true });
              return;
            }
            if (candIdx + 1 < Math.min(candidates.length, 6)) {
              tryCandidate(candIdx + 1, nextAttempts);
              return;
            }
            lastClickInfo = {
              ans: ansStr,
              attempts: nextAttempts,
              verified: false,
              via: "none",
              candidateCount: candidates.length,
              targetTag: target.tagName || "",
              targetClass: String(target.className || "").slice(0, 60)
            };
            finish({ autoAdvanced: false, verified: false });
          }, waitDelay, epoch, requireEnabled);
        };

        tryCandidate(0, 0);
        return;
      }
    } else if (type === "SHORT_ANSWER" && ansStr !== "") {
      fillInput(
        shortInp,
        ansStr,
        answerKind,
        (filledOk) => finish({ autoAdvanced: false, verified: Boolean(filledOk) }),
        {
          epoch,
          requireEnabled
        }
      );
      return;
    } else if (type === "TRUE_FALSE" && ansStr.includes("-")) {
      const parts = ansStr.split("-").slice(0, 4);
      const initialUi = EXT.detectUIAns("TRUE_FALSE", null, null, tf);
      const initialParts = initialUi ? initialUi.split("-") : [];
      const selectedBtns = parts.map((p, idx) => (p === "Đ" ? tf.trueBtns[idx] : tf.falseBtns[idx]));
      const beforeTfSnaps = selectedBtns.map((b) => (b ? captureChoiceSnapshot({ rowEl: b }) : ""));
      let clickDelay = 0;
      let clickedCount = 0;

      parts.forEach((p, idx) => {
        const btn = selectedBtns[idx];
        if (!btn) return;
        const alreadyMatched =
          initialParts[idx] === p ||
          btn.checked === true ||
          btn.getAttribute?.("aria-checked") === "true" ||
          btn.getAttribute?.("aria-pressed") === "true";
        if (alreadyMatched) return;

        const scheduledAt = clickDelay;
        clickDelay += 220;
        clickedCount += 1;
        scheduleManagedTimeout(() => {
          dispatchClick(btn);
        }, scheduledAt, epoch, requireEnabled);
      });

      const isTfVerified = (verifiedStr) => {
        if (verifiedStr === parts.join("-")) return true;
        return selectedBtns.every(
          (b, i) => !b || (beforeTfSnaps[i] && captureChoiceSnapshot({ rowEl: b }) !== beforeTfSnaps[i])
        );
      };

      const lastClickAt = clickedCount > 0 ? Math.max(0, clickDelay - 220) : 0;
      scheduleManagedTimeout(() => {
        const verified = EXT.detectUIAns("TRUE_FALSE", null, null, tf);
        if (!isTfVerified(verified)) {
          const verifiedParts = verified ? verified.split("-") : [];
          let retried = false;
          parts.forEach((p, idx) => {
            if (verifiedParts[idx] !== p) {
              const btn = selectedBtns[idx];
              if (btn) {
                dispatchClick(btn);
                retried = true;
              }
            }
          });
          if (retried) {
            scheduleManagedTimeout(() => {
              const afterRetry = EXT.detectUIAns("TRUE_FALSE", null, null, tf);
              finish({ autoAdvanced: false, verified: isTfVerified(afterRetry) });
            }, 220, epoch, requireEnabled);
            return;
          }
        }
        finish({ autoAdvanced: false, verified: isTfVerified(verified) });
      }, lastClickAt + POST_CLICK_VERIFY_DELAY_MS, epoch, requireEnabled);
      return;
    }

    finish({ autoAdvanced: false, verified: false });
  }

  // =========================================================================
  // HỆ THỐNG XỬ LÝ HÌNH ẢNH 3 LỚP (LỚP 1 -> AUTO CAPTURE STAGE -> MULTI-SCROLL)
  // =========================================================================
  async function prepareVisualAttachments(payload, classified, isManualRetry = false) {
    if (!payload?.hasVisuals && !isManualRetry) {
      return [];
    }

    const images = [];
    const layer1 = await EXT.extractVisualAssetsLayer1(payload.visualDescriptors || []);
    for (const img of layer1.inlineImages) {
      images.push({ label: img.label, mimeType: img.mimeType, data: img.data });
    }

    const stageTargets = [...layer1.stageTargets];

    if (layer1.remoteUrls.length > 0) {
      const fetched = await callNative("fetchImagesWithCookies", {
        pageUrl: globalScope.location?.href || "https://app.onluyen.vn/",
        items: layer1.remoteUrls
      });
      const fetchedMap = new Map();
      if (Array.isArray(fetched)) {
        for (const item of fetched) {
          if (item && item.id) fetchedMap.set(item.id, item);
        }
      }
      for (const reqItem of layer1.remoteUrls) {
        const resItem = fetchedMap.get(reqItem.id);
        if (resItem && resItem.ok && resItem.data) {
          images.push({
            label: reqItem.label,
            mimeType: resItem.mimeType || "image/png",
            data: resItem.data
          });
        } else if (layer1.elMap[reqItem.id]) {
          stageTargets.push({
            id: reqItem.id,
            label: reqItem.label,
            el: layer1.elMap[reqItem.id],
            reason: "cookie_fetch_failed"
          });
        }
      }
    }

    // LỚP 2: Auto Capture Stage (Bẻ HTML dựng sân khấu phóng lớn nền trắng để chụp)
    if (stageTargets.length > 0) {
      await callNative("setFloatingPillVisible", { visible: false });
      try {
        await waitMs(60);
        for (const target of stageTargets.slice(0, 3)) {
          const stage = EXT.mountCaptureStage(target.el, target.label);
          if (!stage) continue;
          try {
            await waitNextTwoFrames();
            const shot = await callNative("takeScreenshot", { quality: 92, label: target.label });
            if (shot && shot.data) {
              images.push({
                label: target.label,
                mimeType: shot.mimeType || "image/jpeg",
                data: shot.data
              });
            }
          } finally {
            stage.unmount();
          }
        }
      } finally {
        await callNative("setFloatingPillVisible", { visible: true });
      }
    }

    // LỚP 3: Cuộn gom đa khung (Fallback cuối khi không clone/bóc được ảnh hoặc câu giải lại thủ công)
    if (images.length === 0 && (payload.hasVisuals || isManualRetry)) {
      const zones = EXT.collectScrollFallbackZones(payload, classified);
      if (zones.length > 0) {
        const prevScrollX = globalScope.scrollX || globalScope.pageXOffset || 0;
        const prevScrollY = globalScope.scrollY || globalScope.pageYOffset || 0;
        await callNative("setFloatingPillVisible", { visible: false });
        try {
          await waitMs(60);
          for (const z of zones) {
            scrollTargetIntoCenter(z.el);
            await waitNextTwoFrames();
            const shot = await callNative("takeScreenshot", { quality: 92, label: z.label });
            if (shot && shot.data) {
              images.push({
                label: z.label,
                mimeType: shot.mimeType || "image/jpeg",
                data: shot.data
              });
            }
          }
        } finally {
          try {
            if (typeof globalScope.scrollTo === "function") {
              globalScope.scrollTo({ left: prevScrollX, top: prevScrollY, behavior: "instant" });
            }
          } catch (e) {}
          await callNative("setFloatingPillVisible", { visible: true });
        }
      }
    }

    return images;
  }

  function getNavState() {
    const doc = globalScope.document;
    const map = new Map();
    let activeNum = null;
    if (!doc) return { map, activeNum };

    for (const el of doc.querySelectorAll?.("button, a, div, span, li") || []) {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (r.width < 18 || r.width > 68 || r.height < 18 || r.height > 68) continue;
      if ((el.children?.length || 0) === 0 && /^\d{1,3}$/.test((el.innerText || el.textContent || "").trim())) {
        const num = parseInt((el.innerText || el.textContent || "").trim(), 10);
        if (num >= 1 && num <= 150 && !map.has(num)) {
          map.set(num, el);
          const cls = String(el.className || "") + " " + String(el.parentElement?.className || "");
          if (/active|current|selected|focus/i.test(cls)) {
            activeNum = num;
          }
        }
      }
    }
    return { map, activeNum };
  }

  function buildMetaFromResult(qLabel, res) {
    return {
      qLabel,
      subject: res.subject || "Tổng hợp",
      confidence: res.confidence ?? 90,
      riskScore: res.riskScore ?? 0,
      verifiedTwoPass: Boolean(res.verifiedTwoPass),
      verifiedThreeAgent: Boolean(res.verifiedThreeAgent),
      pipelineLabel: res.pipelineLabel || (res.verifiedThreeAgent ? "3-Agent Trọng tài ✔" : res.verifiedTwoPass ? "Agent 1 -> Agent 2 ✔" : "Agent 1"),
      step: res.step || "",
      selfCheck: res.selfCheck || "",
      auditNote: res.auditNote || "",
      modelUsed: res.modelUsed || "",
      normalizedAns: res.normalizedAns || ""
    };
  }

  async function requestNativeSolve(solveData) {
    const resp = await callNative("solveQuiz", solveData);
    return resp;
  }

  // =========================================================================
  // GIẢI LẠI CÂU CHỈ ĐỊNH / CÂU HIỆN TẠI (CỘNG DỒN LỊCH SỬ ĐÁP ÁN SAI)
  // =========================================================================
  async function handleManualRetryQuestion(targetQNum) {
    cancelActiveWork();
    const myEpoch = runEpoch;
    isProcessing = true;
    startProcessingWatchdog("Giải lại", myEpoch);

    try {
      const scopeDoc = resolveTargetScopeDoc() || globalScope.document;
      const blocks = EXT.getMultiBlocks(scopeDoc);

      if (blocks.length >= 2) {
        let targetBlock = null;
        if (targetQNum) {
          targetBlock = blocks.find((b) => b.qNum === Number(targetQNum));
        } else {
          const viewportCenter = (globalScope.innerHeight || 800) / 2;
          targetBlock = blocks.reduce((best, cur) => {
            const r = cur.blockEl.getBoundingClientRect();
            const dist = Math.abs((r.top + r.bottom) / 2 - viewportCenter);
            return !best || dist < best.dist ? { item: cur, dist } : best;
          }, null)?.item;
        }

        if (!targetBlock) {
          if (isRunAlive(myEpoch, false)) {
            clearProcessingWatchdog();
            syncStatus(`⚠️ Không tìm thấy Câu ${targetQNum} trên trang!`);
            isProcessing = false;
          }
          return;
        }

        scrollIfOffScreen(targetBlock.blockEl);
        const classified = EXT.classifyQuestionInScope(targetBlock.blockEl, true);
        if (!classified.type) {
          if (isRunAlive(myEpoch, false)) {
            clearProcessingWatchdog();
            isProcessing = false;
          }
          return;
        }

        const { type, shortInp, tf, mcq } = classified;
        const payload = EXT.extractQuestionPayload(targetBlock.blockEl, classified);
        const oldUiAns = EXT.detectUIAns(type, mcq, shortInp, tf);
        const qKey = `LIST_Q${targetBlock.qNum}_${type}_${stripVolatileUiText(payload.stemText).slice(0, 50)}`;
        skippedFailedListKeys.delete(qKey);
        failCountMap.delete(qKey);
        const rejectedList = getRejectedAnswers(qKey, oldUiAns);

        syncStatus(`🔄 Đang giải lại Câu ${targetBlock.qNum} (Tránh: ${rejectedList.join(", ") || "trống"})...`);
        await waitMs(220);
        if (!isRunAlive(myEpoch, false)) return;

        const images = await prepareVisualAttachments(payload, classified, true);
        if (!isRunAlive(myEpoch, false)) return;

        const res = await requestNativeSolve({
          questionType: type,
          qCode: `Câu ${targetBlock.qNum}`,
          rawScreenText: payload.stemText,
          contextPassage: payload.contextPassage,
          extraDetails: payload.extraDetails,
          hasVisuals: payload.hasVisuals || images.length > 0,
          hasUnderline: payload.hasUnderline,
          hasTable: payload.hasTable,
          visualSignature: payload.visualSignature,
          images,
          intelligenceMode,
          isManualRetry: true,
          rejectedAnswers: rejectedList
        });

        if (!isRunAlive(myEpoch, false)) return;
        clearProcessingWatchdog();
        if (res?.cancelled) {
          isProcessing = false;
          return;
        }
        isProcessing = false;
        if (!res?.success || !res.result) {
          syncStatus(`⚠️ Giải lại Câu ${targetBlock.qNum} thất bại: ${res?.error || "Lỗi không xác định"}`);
          return;
        }

        const r = res.result;
        const normAns = r.normalizedAns || "";
        const cleanExportAns = formatCleanAnswerForExport(type, normAns, mcq);
        solvedListKeys.add(qKey);

        saveCleanExportItem({
          signature: qKey,
          qLabel: `Câu ${targetBlock.qNum}`,
          question: payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText,
          answer: cleanExportAns,
          step: r.step || "",
          subject: r.subject || "",
          confidence: r.confidence ?? 90,
          verifiedTwoPass: Boolean(r.verifiedTwoPass),
          verifiedThreeAgent: Boolean(r.verifiedThreeAgent),
          auditNote: r.auditNote || "",
          modelUsed: r.modelUsed || ""
        });

        await new Promise((resolve) => {
          applyAnswerToDOM(
            type,
            normAns,
            r.answerKind,
            mcq,
            shortInp,
            tf,
            () => {
              if (isRunAlive(myEpoch, false)) {
                syncStatus(
                  `✅ Đã giải lại Câu ${targetBlock.qNum}: [${oldUiAns || "?"}] ➔ [${normAns}]`,
                  `Câu ${targetBlock.qNum} (Giải lại): ${cleanExportAns}`,
                  buildMetaFromResult(`Câu ${targetBlock.qNum}`, r)
                );
              }
              resolve();
            },
            { epoch: myEpoch, requireEnabled: false }
          );
        });
        return;
      }

      // Single-Step Mode Retry
      if (targetQNum) {
        const { map } = getNavState();
        const targetBtn = map.get(Number(targetQNum));
        if (targetBtn) {
          dispatchClick(targetBtn);
          await waitMs(600);
          if (!isRunAlive(myEpoch, false)) return;
        }
      }

      const activeDoc = resolveTargetScopeDoc() || globalScope.document;
      const classified = EXT.classifyQuestionInScope(activeDoc, true);
      if (!classified.type) {
        if (isRunAlive(myEpoch, false)) {
          clearProcessingWatchdog();
          syncStatus("⚠️ Không nhận diện được câu hỏi hiện tại để giải lại!");
          isProcessing = false;
        }
        return;
      }

      const { type, shortInp, tf, mcq } = classified;
      const payload = EXT.extractQuestionPayload(activeDoc, classified);
      const oldUiAns = EXT.detectUIAns(type, mcq, shortInp, tf);
      const bodyTxt = getVisibleBodyText(activeDoc);
      const qCode = (bodyTxt.match(/#\d{5,}/) || [])[0] || (targetQNum ? `Câu ${targetQNum}` : "Câu hiện tại");
      const cleanQuestionFull = payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText;
      const curSig = computeQuestionFingerprint(type, payload);
      solvedSingleFingerprints.delete(curSig);
      if (/^#\d{5,}$/.test(qCode)) solvedExplicitQCodes.delete(qCode);
      failCountMap.delete(curSig);
      const rejectedList = getRejectedAnswers(curSig, oldUiAns);

      syncStatus(`🔄 Đang giải lại ${qCode} (Tránh: ${rejectedList.join(", ") || "trống"})...`);
      await waitMs(220);
      if (!isRunAlive(myEpoch, false)) return;

      const images = await prepareVisualAttachments(payload, classified, true);
      if (!isRunAlive(myEpoch, false)) return;

      const res = await requestNativeSolve({
        questionType: type,
        qCode,
        rawScreenText: payload.stemText,
        contextPassage: payload.contextPassage,
        extraDetails: payload.extraDetails,
        hasVisuals: payload.hasVisuals || images.length > 0,
        hasUnderline: payload.hasUnderline,
        hasTable: payload.hasTable,
        visualSignature: payload.visualSignature,
        images,
        intelligenceMode,
        isManualRetry: true,
        rejectedAnswers: rejectedList
      });

      if (!isRunAlive(myEpoch, false)) return;
      clearProcessingWatchdog();
      if (res?.cancelled) {
        isProcessing = false;
        return;
      }
      isProcessing = false;
      if (!res?.success || !res.result) {
        syncStatus(`⚠️ Giải lại ${qCode} thất bại: ${res?.error || "Lỗi không xác định"}`);
        return;
      }

      const r = res.result;
      const normAns = r.normalizedAns || "";
      const cleanExportAns = formatCleanAnswerForExport(type, normAns, mcq);
      solvedSignature = curSig;
      solvedSingleFingerprints.add(curSig);
      if (/^#\d{5,}$/.test(qCode)) solvedExplicitQCodes.add(qCode);

      saveCleanExportItem({
        signature: curSig,
        qLabel: qCode,
        question: cleanQuestionFull,
        answer: cleanExportAns,
        step: r.step || "",
        subject: r.subject || "",
        confidence: r.confidence ?? 90,
        verifiedTwoPass: Boolean(r.verifiedTwoPass),
        verifiedThreeAgent: Boolean(r.verifiedThreeAgent),
        auditNote: r.auditNote || "",
        modelUsed: r.modelUsed || ""
      });

      await new Promise((resolve) => {
        applyAnswerToDOM(
          type,
          normAns,
          r.answerKind,
          mcq,
          shortInp,
          tf,
          () => {
            if (isRunAlive(myEpoch, false)) {
              syncStatus(
                `✅ Đã giải lại ${qCode}: [${oldUiAns || "?"}] ➔ [${normAns}]`,
                `${qCode} (Giải lại): ${cleanExportAns}`,
                buildMetaFromResult(qCode, r)
              );
            }
            resolve();
          },
          { epoch: myEpoch, requireEnabled: false }
        );
      });
    } catch (err) {
      if (isRunAlive(myEpoch, false)) {
        clearProcessingWatchdog();
        isProcessing = false;
        syncStatus(`⚠️ Lỗi giải lại: ${err?.message || err}`);
      }
    }
  }

  // =========================================================================
  // CHẾ ĐỘ DANH SÁCH NHIỀU CÂU (LIST MODE)
  // =========================================================================
  async function processListMode(blocks, myEpoch = runEpoch) {
    if (isProcessing || !isRunAlive(myEpoch, true)) return;

    let task = null;
    if (typeof EXT.beginScanCache === "function") EXT.beginScanCache();
    try {
      for (const b of blocks) {
        if (solvedBlockEls.has(b.blockEl)) continue;

        const classified = EXT.classifyQuestionInScope(b.blockEl, true);
        if (!classified.type) continue;

        const { type, shortInp, tf, mcq } = classified;
        const payload = EXT.extractQuestionPayload(b.blockEl, classified);
        const qKey = `LIST_Q${b.qNum}_${type}_${stripVolatileUiText(payload.stemText).slice(0, 50)}`;
        if (skippedFailedListKeys.has(qKey)) {
          solvedBlockEls.add(b.blockEl);
          continue;
        }

        const uiAns = EXT.detectUIAns(type, mcq, shortInp, tf);
        if (solvedListKeys.has(qKey) || uiAns) {
          if (uiAns && !solvedListKeys.has(qKey)) {
            saveCleanExportItem({
              signature: qKey,
              qLabel: `Câu ${b.qNum}`,
              question: payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText,
              answer: formatCleanAnswerForExport(type, uiAns, mcq)
            });
          }
          solvedListKeys.add(qKey);
          solvedBlockEls.add(b.blockEl);
          continue;
        }

        task = {
          qNum: b.qNum,
          blockEl: b.blockEl,
          qKey,
          classified,
          type,
          payload,
          tf,
          mcq,
          shortInp
        };
        break;
      }
    } finally {
      if (typeof EXT.endScanCache === "function") EXT.endScanCache();
    }

    if (!task) {
      if (skippedFailedListKeys.size > 0) {
        syncStatus(`⚠️ Đã xong phần đạt yêu cầu (còn ${skippedFailedListKeys.size} câu lỗi tạm bỏ qua, bấm 🔍 Quét ngay để thử lại)`);
      } else {
        syncStatus(`✅ Đã hoàn thành ${blocks.length} câu! Sẵn sàng xuất file đáp án.`);
        triggerAutoExportNotification();
      }
      return;
    }

    isProcessing = true;
    startProcessingWatchdog(`Câu ${task.qNum}`, myEpoch);
    scrollIfOffScreen(task.blockEl);
    syncStatus(`🧠 Đang phân tích Câu ${task.qNum}/${blocks.length} (${task.type})...`);

    await waitMs(40);
    if (!isRunAlive(myEpoch, true)) return;

    const images = await prepareVisualAttachments(task.payload, task.classified, false);
    if (!isRunAlive(myEpoch, true)) return;

    const res = await requestNativeSolve({
      questionType: task.type,
      qCode: `Câu ${task.qNum}`,
      rawScreenText: task.payload.stemText,
      contextPassage: task.payload.contextPassage,
      extraDetails: task.payload.extraDetails,
      hasVisuals: task.payload.hasVisuals || images.length > 0,
      hasUnderline: task.payload.hasUnderline,
      hasTable: task.payload.hasTable,
      visualSignature: task.payload.visualSignature,
      images,
      intelligenceMode
    });

    if (!isRunAlive(myEpoch, true)) return;
    clearProcessingWatchdog();

    if (res?.cancelled) {
      isProcessing = false;
      return;
    }

    if (!res?.success || !res.result) {
      const fails = (failCountMap.get(task.qKey) || 0) + 1;
      failCountMap.set(task.qKey, fails);
      if (fails >= 3) {
        skippedFailedListKeys.add(task.qKey);
        solvedBlockEls.add(task.blockEl);
        syncStatus(`⚠️ Câu ${task.qNum} lỗi 3 lần, tạm bỏ qua để giải tiếp câu khác...`);
        isProcessing = false;
        scheduleManagedTimeout(() => processScreen(false), 150, myEpoch, true);
      } else {
        syncStatus(`⚠️ Lỗi tạm thời Câu ${task.qNum} (lần ${fails}/3), thử lại sau 3.5s...`);
        scheduleManagedTimeout(() => {
          isProcessing = false;
          processScreen(false);
        }, 3500, myEpoch, true);
      }
      return;
    }

    failCountMap.delete(task.qKey);
    const r = res.result;
    const normAns = r.normalizedAns || "";
    const cleanExportAns = formatCleanAnswerForExport(task.type, normAns, task.mcq);

    solvedListKeys.add(task.qKey);
    solvedBlockEls.add(task.blockEl);
    saveCleanExportItem({
      signature: task.qKey,
      qLabel: `Câu ${task.qNum}`,
      question: task.payload.extraDetails
        ? `${task.payload.stemText}\n${task.payload.extraDetails}`
        : task.payload.stemText,
      answer: cleanExportAns,
      step: r.step || "",
      subject: r.subject || "",
      confidence: r.confidence ?? 90,
      verifiedTwoPass: Boolean(r.verifiedTwoPass),
      verifiedThreeAgent: Boolean(r.verifiedThreeAgent),
      auditNote: r.auditNote || "",
      modelUsed: r.modelUsed || ""
    });

    syncStatus(
      `Đã giải Câu ${task.qNum}/${blocks.length}`,
      `Câu ${task.qNum}: ${cleanExportAns}`,
      buildMetaFromResult(`Câu ${task.qNum}`, r)
    );

    applyAnswerToDOM(
      task.type,
      normAns,
      r.answerKind,
      task.mcq,
      task.shortInp,
      task.tf,
      () => {
        scheduleManagedTimeout(() => {
          isProcessing = false;
          processScreen(false);
        }, 180, myEpoch, true);
      },
      { epoch: myEpoch, requireEnabled: true }
    );
  }

  // =========================================================================
  // CHẾ ĐỘ TỪNG CÂU (SINGLE-STEP MODE)
  // =========================================================================
  function advanceSingleStep(
    currentFingerprint,
    myEpoch = runEpoch,
    { alreadyAutoAdvanced = false, qLabel = "" } = {}
  ) {
    attemptedSingleQuestions.add(currentFingerprint);
    isSelfAdvancing = true;

    scheduleManagedTimeout(async () => {
      try {
        if (!isRunAlive(myEpoch, true)) return;
        const doc = globalScope.document;
        if (!isQuizPage(doc, "ACTIVE")) return;
        if (dismissSubmitModal()) return;

        const preFp = alreadyAutoAdvanced ? "__AUTO_ADVANCED__" : computeLiveQuestionFingerprint(doc);
        if (alreadyAutoAdvanced || (preFp && preFp !== currentFingerprint)) {
          await waitMs(350);
          if (!isRunAlive(myEpoch, true)) return;
          isSelfAdvancing = false;
          isProcessing = false;
          scheduleManagedTimeout(() => processScreen(false), 180, myEpoch, true);
          return;
        }

        await waitMs(260);
        if (!isRunAlive(myEpoch, true)) return;
        invalidateBodyTextCache();
        if (dismissSubmitModal()) return;

        const { submitBtn, nextBtn } = findActionButtons(doc);
        let changed = false;

        const waitForFingerprintChange = async (maxPolls, intervalMs, checkNextIfAppears = false) => {
          let clickedAppearNext = false;
          for (let i = 0; i < maxPolls; i++) {
            await waitMs(intervalMs);
            if (!isRunAlive(myEpoch, true)) return false;
            invalidateBodyTextCache();
            if (dismissSubmitModal()) return false;

            const liveFp = computeLiveQuestionFingerprint(doc);
            if (liveFp && liveFp !== currentFingerprint) {
              return true;
            }
            if (checkNextIfAppears && !clickedAppearNext) {
              const { nextBtn: appearedNext } = findActionButtons(doc);
              if (appearedNext) {
                clickedAppearNext = true;
                dispatchClick(appearedNext);
                for (let j = 0; j < 7; j++) {
                  await waitMs(220);
                  if (!isRunAlive(myEpoch, true)) return false;
                  invalidateBodyTextCache();
                  if (dismissSubmitModal()) return false;
                  const afterNextFp = computeLiveQuestionFingerprint(doc);
                  if (afterNextFp && afterNextFp !== currentFingerprint) {
                    return true;
                  }
                }
                return false;
              }
            }
          }
          return false;
        };

        if (submitBtn) {
          dispatchClick(submitBtn);
          changed = await waitForFingerprintChange(6, 220, true);
        } else if (nextBtn) {
          dispatchClick(nextBtn);
          changed = await waitForFingerprintChange(8, 200, false);
        }

        if (!changed) {
          if (!isRunAlive(myEpoch, true)) return;
          invalidateBodyTextCache();
          const liveNowFp = computeLiveQuestionFingerprint(doc);
          const nowTxt = getVisibleBodyText(doc);
          const isExplanation = /Đáp án đúng|Lời giải chi tiết/i.test(nowTxt);

          if (!isExplanation && (!liveNowFp || liveNowFp === currentFingerprint) && isQuizPage(doc, liveNowFp ? "ACTIVE" : null)) {
            const { map, activeNum } = getNavState();
            const maxQ = map.size > 0 ? Math.max(...map.keys()) : 0;
            const nextNum = activeNum !== null ? activeNum + 1 : null;

            if (nextNum !== null && maxQ > 0 && nextNum <= maxQ && map.has(nextNum)) {
              dispatchClick(map.get(nextNum));
              await waitMs(450);
            } else if (activeNum === null && maxQ > 0) {
              const fallbackNum = attemptedSingleQuestions.size + 1;
              if (fallbackNum <= maxQ && map.has(fallbackNum) && !clickedNavNums.has(fallbackNum)) {
                clickedNavNums.add(fallbackNum);
                dispatchClick(map.get(fallbackNum));
                await waitMs(450);
              } else if (attemptedSingleQuestions.size >= maxQ) {
                syncStatus("✅ Đã hoàn thành toàn bộ đề! Sẵn sàng xuất file đáp án.");
                triggerAutoExportNotification();
                return;
              } else {
                syncStatus(`✅ Đã chọn ${qLabel || "câu hiện tại"} — Chưa thấy nút chuyển câu, hãy tự chuyển câu tiếp`);
                return;
              }
            } else if (
              maxQ > 0 &&
              ((activeNum !== null && activeNum >= maxQ) || attemptedSingleQuestions.size >= maxQ)
            ) {
              syncStatus("✅ Đã hoàn thành toàn bộ đề! Sẵn sàng xuất file đáp án.");
              triggerAutoExportNotification();
              return;
            } else {
              syncStatus(`✅ Đã chọn ${qLabel || "câu hiện tại"} — Chưa thấy nút chuyển câu, hãy tự chuyển câu tiếp`);
              return;
            }
          }
        }

        await waitMs(300);
        if (!isRunAlive(myEpoch, true)) return;
      } finally {
        if (myEpoch === runEpoch) {
          isSelfAdvancing = false;
          isProcessing = false;
        }
      }
      scheduleManagedTimeout(() => processScreen(false), 180, myEpoch, true);
    }, 100, myEpoch, true);
  }

  function processScreen(forceDiagnostic = false) {
    if (!isExtensionEnabled) return { reason: "disabled" };
    if (isProcessing && !forceDiagnostic) return { reason: "busy" };

    const myEpoch = runEpoch;
    const { scopeDoc, blocks, classified } = resolveAndDetect();
    const hasAnyDetected = blocks.length >= 2 || Boolean(classified.type);
    if (!scopeDoc || !isQuizPage(scopeDoc, hasAnyDetected ? (classified.type || "LIST") : null)) {
      if (forceDiagnostic) syncStatus("ℹ️ Trang hiện tại không phải giao diện làm bài.");
      return {
        reason: "not_quiz_page",
        url: globalScope.location?.href || "",
        diag: forceDiagnostic ? EXT.inspectDomSummary?.(scopeDoc || globalScope.document) : undefined
      };
    }
    if (dismissSubmitModal()) return { reason: "submit_modal_dismissed" };

    const bodyTxt = getVisibleBodyText(scopeDoc);
    if (bodyTxt.includes("Tạm dừng") && bodyTxt.includes("Bạn có muốn tiếp tục")) {
      const resumeBtn = Array.from(scopeDoc.querySelectorAll?.("button, [role='button'], div") || []).find(
        (b) => (b.textContent || "").trim() === "Tiếp tục"
      );
      if (resumeBtn) {
        dispatchClick(resumeBtn);
        return { reason: "resumed" };
      }
    }

    if (autoAdvanceEnabled && /Đáp án đúng|Lời giải chi tiết/i.test(bodyTxt)) {
      const nextBtn = findContinueButton(scopeDoc);
      if (nextBtn) {
        isProcessing = true;
        isSelfAdvancing = true;
        syncStatus("⏭️ Đang chuyển qua bước giải thích sang câu tiếp...");
        dispatchClick(nextBtn);
        scheduleManagedTimeout(() => {
          if (myEpoch === runEpoch) {
            isSelfAdvancing = false;
            isProcessing = false;
          }
          processScreen(false);
        }, 550, myEpoch, true);
        return { reason: "step_explanation_advanced" };
      }
    }

    if (blocks.length >= 2) {
      processListMode(blocks, myEpoch);
      return { reason: "list_mode", blocks: blocks.length };
    }

    if (!classified.type) {
      const now = Date.now();
      if (forceDiagnostic || now - lastWaitingStatusAt > 6000) {
        lastWaitingStatusAt = now;
        syncStatus("🔍 Đang chờ câu hỏi hiển thị trên trang...");
      }
      return {
        reason: "no_question_detected",
        url: globalScope.location?.href || "",
        diag: forceDiagnostic ? EXT.inspectDomSummary?.(scopeDoc) : undefined
      };
    }

    const { type, shortInp, tf, mcq } = classified;
    const payload = EXT.extractQuestionPayload(scopeDoc, classified);
    const qCode = (bodyTxt.match(/#\d{5,}/) || [])[0] || `Câu_${attemptedSingleQuestions.size + 1}`;
    const hasExplicitCode = /^#\d{5,}$/.test(qCode);
    const cleanQuestionFull = payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText;

    const curSig = computeQuestionFingerprint(type, payload);
    if (
      !forceDiagnostic &&
      (curSig === solvedSignature ||
        solvedSingleFingerprints.has(curSig) ||
        (hasExplicitCode && solvedExplicitQCodes.has(qCode)))
    ) {
      return { reason: "already_solved_sig", qCode, type };
    }

    const existingUIAns = EXT.detectUIAns(type, mcq, shortInp, tf);
    if (existingUIAns && /Đáp án của bạn/i.test(bodyTxt)) {
      solvedSignature = curSig;
      solvedSingleFingerprints.add(curSig);
      if (hasExplicitCode) solvedExplicitQCodes.add(qCode);
      const cleanExportAns = formatCleanAnswerForExport(type, existingUIAns, mcq);
      saveCleanExportItem({
        signature: curSig,
        qLabel: qCode,
        question: cleanQuestionFull,
        answer: cleanExportAns
      });
      syncStatus(`Bỏ qua ${qCode} (Đã làm)`, `${qCode}: ${cleanExportAns}`);
      if (autoAdvanceEnabled) {
        isProcessing = true;
        advanceSingleStep(curSig, myEpoch, { qLabel: qCode });
      }
      return { reason: "skipped_already_answered", qCode, type };
    }

    isProcessing = true;
    startProcessingWatchdog(qCode, myEpoch);
    solvedSignature = curSig;
    syncStatus(`🧠 Đang giải ${qCode} (${type})...`);

    (async () => {
      try {
        await waitMs(40);
        if (!isRunAlive(myEpoch, true)) return;

        const images = await prepareVisualAttachments(payload, classified, false);
        if (!isRunAlive(myEpoch, true)) return;

        const res = await requestNativeSolve({
          questionType: type,
          qCode,
          rawScreenText: payload.stemText,
          contextPassage: payload.contextPassage,
          extraDetails: payload.extraDetails,
          hasVisuals: payload.hasVisuals || images.length > 0,
          hasUnderline: payload.hasUnderline,
          hasTable: payload.hasTable,
          visualSignature: payload.visualSignature,
          images,
          intelligenceMode
        });

        if (!isRunAlive(myEpoch, true)) return;
        clearProcessingWatchdog();

        if (res?.cancelled) {
          isProcessing = false;
          return;
        }

        if (!res?.success || !res.result) {
          const fails = (failCountMap.get(curSig) || 0) + 1;
          failCountMap.set(curSig, fails);
          if (fails >= 3) {
            solvedSignature = curSig;
            solvedSingleFingerprints.add(curSig);
            if (hasExplicitCode) solvedExplicitQCodes.add(qCode);
            isProcessing = false;
            syncStatus("⚠️ Câu này lỗi 3 lần (kiểm tra API Key / bấm 🔍 Quét ngay hoặc chuyển câu kế)");
          } else {
            syncStatus(`⚠️ Lỗi tạm thời (lần ${fails}/3), tự thử lại sau 5s...`);
            scheduleManagedTimeout(() => {
              solvedSignature = "";
              isProcessing = false;
            }, 5000, myEpoch, true);
          }
          return;
        }

        failCountMap.delete(curSig);
        solvedSignature = curSig;
        solvedSingleFingerprints.add(curSig);
        if (hasExplicitCode) solvedExplicitQCodes.add(qCode);

        const r = res.result;
        const normAns = r.normalizedAns || "";
        const cleanExportAns = formatCleanAnswerForExport(type, normAns, mcq);

        saveCleanExportItem({
          signature: curSig,
          qLabel: qCode,
          question: cleanQuestionFull,
          answer: cleanExportAns,
          step: r.step || "",
          subject: r.subject || "",
          confidence: r.confidence ?? 90,
          verifiedTwoPass: Boolean(r.verifiedTwoPass),
          verifiedThreeAgent: Boolean(r.verifiedThreeAgent),
          auditNote: r.auditNote || "",
          modelUsed: r.modelUsed || ""
        });

        const preApplyFp = computeLiveQuestionFingerprint(scopeDoc);
        if (
          preApplyFp &&
          preApplyFp !== curSig &&
          !(hasExplicitCode && getVisibleBodyText(scopeDoc).includes(qCode))
        ) {
          isProcessing = false;
          syncStatus(
            `⚠️ Câu ${qCode} đã đổi trước khi tích — dừng tích nhầm`,
            `${qCode}: ${cleanExportAns}`,
            buildMetaFromResult(qCode, r)
          );
          return;
        }

        syncStatus(
          autoAdvanceEnabled ? `Đã giải ${qCode}` : `✅ Đã tích ${qCode} (Chờ bấm Tiếp)`,
          `${qCode}: ${cleanExportAns}`,
          buildMetaFromResult(qCode, r)
        );

        applyAnswerToDOM(
          type,
          normAns,
          r.answerKind,
          mcq,
          shortInp,
          tf,
          (applyOutcome) => {
            if (!isRunAlive(myEpoch, true)) return;
            if (applyOutcome?.verified === false) {
              isProcessing = false;
              syncStatus(
                `⚠️ Đã giải ${qCode}: ${normAns} nhưng web chưa nhận click — chọn tay hoặc bấm 🔄 Giải lại`,
                `${qCode}: ${cleanExportAns}`,
                buildMetaFromResult(qCode, r)
              );
              return;
            }
            if (autoAdvanceEnabled) {
              advanceSingleStep(curSig, myEpoch, {
                alreadyAutoAdvanced: Boolean(applyOutcome?.autoAdvanced),
                qLabel: qCode
              });
            } else {
              isProcessing = false;
            }
          },
          {
            epoch: myEpoch,
            requireEnabled: true,
            expectedFingerprint: curSig,
            expectedQCode: hasExplicitCode ? qCode : "",
            scopeDoc
          }
        );
      } catch (err) {
        if (!isRunAlive(myEpoch, true)) return;
        clearProcessingWatchdog();
        isProcessing = false;
        syncStatus(`⚠️ Lỗi xử lý ${qCode}: ${err?.message || err}`);
      }
    })();

    return { reason: "solving_started", qCode, type };
  }

  async function syncConfigFromNative() {
    const cfg = await callNative("getConfig", {});
    if (cfg && typeof cfg === "object") {
      configSynced = true;
      const wasEnabled = isExtensionEnabled;
      updateConfig(cfg);
      if (isExtensionEnabled && wasEnabled && !isProcessing) {
        processScreen(false);
      }
      return true;
    }
    return false;
  }

  function onRouteChanged(newUrl = "") {
    const nextKey = normalizeRouteKey(newUrl);
    if (nextKey === lastRouteKey) return { changed: false, routeKey: nextKey };
    lastRouteKey = nextKey;
    invalidateBodyTextCache();
    if (isSelfAdvancing) {
      return { changed: true, routeKey: nextKey, deferredToAdvance: true };
    }
    cancelActiveWork();
    hasAutoExported = false;
    solvedSignature = "";
    solvedListKeys.clear();
    solvedBlockEls = new WeakSet();
    skippedFailedListKeys.clear();
    failCountMap.clear();
    attemptedSingleQuestions.clear();
    solvedSingleFingerprints.clear();
    solvedExplicitQCodes.clear();
    clickedNavNums.clear();
    if (isExtensionEnabled) {
      scheduleManagedTimeout(() => {
        if (!isProcessing) processScreen(false);
      }, 180, runEpoch, true);
    }
    return { changed: true, routeKey: nextKey };
  }

  function updateConfig(cfg = {}) {
    if (typeof cfg.autoSolverEnabled === "boolean") {
      const changed = isExtensionEnabled !== cfg.autoSolverEnabled;
      isExtensionEnabled = cfg.autoSolverEnabled;
      if (!isExtensionEnabled) {
        cancelActiveWork();
      } else if (changed) {
        solvedSignature = "";
        solvedSingleFingerprints.clear();
        solvedExplicitQCodes.clear();
        isProcessing = false;
        isSelfAdvancing = false;
        processScreen(false);
      }
    }
    if (typeof cfg.autoAdvanceEnabled === "boolean") {
      autoAdvanceEnabled = cfg.autoAdvanceEnabled;
    }
    if (["fast", "smart", "ultra"].includes(cfg.intelligenceMode)) {
      intelligenceMode = cfg.intelligenceMode;
    }
  }

  function forceScanNow() {
    cancelActiveWork();
    solvedSignature = "";
    failCountMap.clear();
    skippedFailedListKeys.clear();
    solvedSingleFingerprints.clear();
    solvedExplicitQCodes.clear();
    solvedBlockEls = new WeakSet();
    return processScreen(true);
  }

  function cleanupSelf() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (platformReadyHandler && typeof globalScope.removeEventListener === "function") {
      globalScope.removeEventListener("flutterInAppWebViewPlatformReady", platformReadyHandler);
      platformReadyHandler = null;
    }
    if (routeChangeHandler && typeof globalScope.removeEventListener === "function") {
      globalScope.removeEventListener("popstate", routeChangeHandler);
      globalScope.removeEventListener("hashchange", routeChangeHandler);
      routeChangeHandler = null;
    }
    cancelActiveWork();
    clearTimeout(retrySyncTimer1);
    clearTimeout(retrySyncTimer2);
    retrySyncTimer1 = null;
    retrySyncTimer2 = null;
  }

  globalScope.__autoSolverMobileCleanup = cleanupSelf;

  const agentApi = {
    updateConfig,
    forceScanNow,
    onRouteChanged,
    retryQuestion: handleManualRetryQuestion,
    getDiagnostics: () => ({
      url: globalScope.location?.href || "",
      isQuiz: isQuizPage(),
      isProcessing,
      isSelfAdvancing,
      runEpoch,
      lastClick: lastClickInfo,
      isExtensionEnabled,
      configSynced,
      autoAdvanceEnabled,
      intelligenceMode,
      solvedSingleCount: solvedSingleFingerprints.size,
      solvedListCount: solvedListKeys.size,
      skippedListCount: skippedFailedListKeys.size,
      sigHead: String(solvedSignature || "").slice(0, 60),
      dom: EXT.inspectDomSummary?.(globalScope.document)
    }),
    cleanup: cleanupSelf,
    _internalForTest: {
      applyAnswerToDOM,
      clickMCQ,
      getMcqClickCandidates,
      findActionButtons,
      advanceSingleStep,
      prepareVisualAttachments,
      processListMode,
      processScreen,
      handleManualRetryQuestion,
      getRejectedAnswers,
      syncConfigFromNative,
      getVisibleBodyText,
      isTimerOnlyMutationList,
      computeQuestionFingerprint,
      getRunEpoch: () => runEpoch,
      resetState: () => {
        cancelActiveWork();
        solvedSignature = "";
        lastClickInfo = null;
        configSynced = false;
        lastRouteKey = normalizeRouteKey();
        isExtensionEnabled = true;
        autoAdvanceEnabled = true;
        intelligenceMode = "smart";
        hasAutoExported = false;
        solvedListKeys.clear();
        solvedBlockEls = new WeakSet();
        skippedFailedListKeys.clear();
        failCountMap.clear();
        attemptedSingleQuestions.clear();
        solvedSingleFingerprints.clear();
        solvedExplicitQCodes.clear();
        clickedNavNums.clear();
        rejectedHistoryMap.clear();
      }
    }
  };

  globalScope.__OnLuyenMobileAgent = agentApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = agentApi;
  }

  function isTimerOnlyNode(node) {
    if (!node) return false;
    if (node.nodeType === 3) {
      const p = node.parentElement;
      if (!p) return false;
      const t = (node.nodeValue || "").trim();
      return t.length <= 16 && (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t) || EXT.isInsideNavOrChrome(p));
    }
    if (node.nodeType === 1) {
      const tag = (node.tagName || "").toLowerCase();
      if (["button", "input", "textarea", "table", "li", "label", "form", "iframe"].includes(tag)) return false;
      const txt = (node.textContent || "").trim();
      if (txt.length <= 16 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(txt)) return true;
      return EXT.isInsideNavOrChrome(node);
    }
    return false;
  }

  function isTimerOnlyMutationList(mutations) {
    if (!Array.isArray(mutations) || mutations.length === 0) return false;
    for (const m of mutations) {
      if (!isTimerOnlyNode(m?.target)) return false;
      const added = m.addedNodes || [];
      for (let i = 0; i < added.length; i++) {
        const n = added[i];
        if (n.nodeType === 1) {
          const tag = (n.tagName || "").toLowerCase();
          if (["button", "input", "textarea", "table", "li", "label", "div", "form", "iframe"].includes(tag)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // Chỉ khởi chạy Observer & Heartbeat trong môi trường trình duyệt thực (có MutationObserver)
  const doc = globalScope.document;
  if (doc && typeof globalScope.MutationObserver === "function") {
    syncConfigFromNative();
    if (typeof globalScope.addEventListener === "function") {
      platformReadyHandler = () => {
        syncConfigFromNative();
      };
      routeChangeHandler = () => {
        onRouteChanged();
      };
      globalScope.addEventListener("flutterInAppWebViewPlatformReady", platformReadyHandler);
      globalScope.addEventListener("popstate", routeChangeHandler);
      globalScope.addEventListener("hashchange", routeChangeHandler);
    }
    retrySyncTimer1 = setTimeout(() => {
      if (!configSynced) syncConfigFromNative();
    }, 400);
    retrySyncTimer2 = setTimeout(() => {
      if (!configSynced) syncConfigFromNative();
    }, 1400);

    const triggerDebouncedScan = (mutations) => {
      const curKey = normalizeRouteKey();
      if (curKey !== lastRouteKey) {
        onRouteChanged();
        return;
      }
      if (!isExtensionEnabled || isProcessing || isSelfAdvancing) return;
      if (isTimerOnlyMutationList(mutations)) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
        processScreen(false);
      }, 320);
      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(() => {
          maxWaitTimer = null;
          clearTimeout(debounceTimer);
          processScreen(false);
        }, 700);
      }
    };

    domObserver = new globalScope.MutationObserver(triggerDebouncedScan);
    if (doc.documentElement) {
      domObserver.observe(doc.documentElement, { childList: true, subtree: true });
    }

    heartbeatTimer = setInterval(() => {
      const curKey = normalizeRouteKey();
      if (curKey !== lastRouteKey) {
        onRouteChanged();
        return;
      }
      if (isExtensionEnabled && !isProcessing && !isSelfAdvancing) {
        processScreen(false);
      }
    }, 1500);
  }
})(typeof window !== "undefined" ? window : globalThis);
