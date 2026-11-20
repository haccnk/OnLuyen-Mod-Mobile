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
  const POST_CLICK_VERIFY_DELAY_MS = 200;

  let isProcessing = false;
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

  const solvedListKeys = new Set();
  let solvedBlockEls = new WeakSet();
  const skippedFailedListKeys = new Set();
  const failCountMap = new Map();
  const attemptedSingleQuestions = new Set();
  const rejectedHistoryMap = new Map();

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
    if (typeof body.innerText === "string") return body.innerText;
    return body.textContent || "";
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function startProcessingWatchdog(label = "") {
    if (processingWatchdog) clearTimeout(processingWatchdog);
    processingWatchdog = setTimeout(() => {
      processingWatchdog = null;
      if (isProcessing) {
        isProcessing = false;
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

  function dispatchClick(el) {
    if (!el) return;
    scrollTargetIntoCenter(el);
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
    const init = {
      bubbles: true,
      cancelable: true,
      view: globalScope,
      clientX: (r.left || 0) + Math.min(Math.max((r.width || 20) / 2, 4), 20),
      clientY: (r.top || 0) + Math.max((r.height || 20) / 2, 4)
    };
    try {
      if (typeof globalScope.PointerEvent === "function") {
        el.dispatchEvent(new globalScope.PointerEvent("pointerdown", { ...init, pointerId: 1, isPrimary: true }));
      }
      if (typeof globalScope.MouseEvent === "function") {
        el.dispatchEvent(new globalScope.MouseEvent("mousedown", init));
      }
      if (typeof globalScope.PointerEvent === "function") {
        el.dispatchEvent(new globalScope.PointerEvent("pointerup", { ...init, pointerId: 1, isPrimary: true }));
      }
      if (typeof globalScope.MouseEvent === "function") {
        el.dispatchEvent(new globalScope.MouseEvent("mouseup", init));
        el.dispatchEvent(new globalScope.MouseEvent("click", init));
      }
    } catch (e) {}
    if (typeof el.click === "function") el.click();
  }

  function findContinueButton(scopeDoc = document) {
    const nodes = scopeDoc.querySelectorAll?.("button, [role='button'], a, div, span") || [];
    for (const el of nodes) {
      if ((el.children?.length || 0) > 2) continue;
      const raw = (el.textContent || el.innerText || "").trim();
      if (raw.length === 0 || raw.length > 14) continue;
      const t = raw.toUpperCase();
      if (t !== "TIẾP TỤC" && t !== "CÂU TIẾP" && t !== "TIẾP THEO" && t !== "CÂU SAU") continue;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (r.width === 0 || r.height === 0) continue;
      if (EXT.isInsideNavOrChrome(el)) continue;
      return el;
    }
    return null;
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

  function clickMCQ(c) {
    if (!c) return;
    if (c.rowEl) scrollTargetIntoCenter(c.rowEl);
    else if (c.badgeEl) scrollTargetIntoCenter(c.badgeEl);

    if (c.badgeEl) dispatchClick(c.badgeEl);
    if (c.badgeEl?.parentElement && c.badgeEl.parentElement !== c.rowEl) {
      dispatchClick(c.badgeEl.parentElement);
    }
    if (c.rowEl) {
      dispatchClick(c.rowEl);
      const inp = c.rowEl.querySelector?.("input, label, [role='radio'], [role='button']");
      if (inp) dispatchClick(inp);
    }
  }

  function fillInput(inputEl, rawVal, answerKind, cb) {
    if (!inputEl) {
      if (typeof cb === "function") cb();
      return;
    }

    scrollTargetIntoCenter(inputEl);
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
        if (typeof globalScope.KeyboardEvent === "function") {
          inputEl.dispatchEvent(new globalScope.KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
          inputEl.dispatchEvent(new globalScope.KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
        }
        if (typeof inputEl.blur === "function") inputEl.blur();
      } catch (e) {}
    };

    apply(val);
    setTimeout(() => {
      const currentVal = isCE ? (inputEl.textContent || "") : (inputEl.value || "");
      if (!isTextMode && (!currentVal || !String(currentVal).trim())) {
        const altVal = val.includes(",") ? val.replace(",", ".") : val.replace(".", ",");
        apply(altVal);
      }
      setTimeout(() => {
        // Post-fill verification
        const detected = EXT.detectUIAns("SHORT_ANSWER", null, inputEl, null);
        if (!detected) {
          apply(val);
        }
        if (typeof cb === "function") cb();
      }, POST_CLICK_VERIFY_DELAY_MS);
    }, 180);
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
  // TÍCH ĐÁP ÁN + SCROLL INTO VIEW + POST-CLICK DOM VERIFICATION (250ms)
  // =========================================================================
  function applyAnswerToDOM(type, ansStr, answerKind, mcq, shortInp, tf, onDone) {
    const finish = typeof onDone === "function" ? onDone : () => {};

    if (type === "MCQ" && ansStr) {
      const idx = ansStr.charCodeAt(0) - 65;
      if (mcq[idx]) {
        clickMCQ(mcq[idx]);
        setTimeout(() => {
          const nowSelected = EXT.detectUIAns("MCQ", mcq, null, null);
          if (nowSelected !== ansStr) {
            clickMCQ(mcq[idx]);
            setTimeout(finish, 150);
          } else {
            finish();
          }
        }, POST_CLICK_VERIFY_DELAY_MS);
        return;
      }
    } else if (type === "SHORT_ANSWER" && ansStr !== "") {
      fillInput(shortInp, ansStr, answerKind, finish);
      return;
    } else if (type === "TRUE_FALSE" && ansStr.includes("-")) {
      const parts = ansStr.split("-").slice(0, 4);
      parts.forEach((p, idx) => {
        setTimeout(() => {
          const btn = p === "Đ" ? tf.trueBtns[idx] : tf.falseBtns[idx];
          if (btn) dispatchClick(btn);
        }, idx * 180);
      });

      const lastClickAt = Math.max(0, parts.length - 1) * 180;
      setTimeout(() => {
        const verified = EXT.detectUIAns("TRUE_FALSE", null, null, tf);
        if (verified !== parts.join("-")) {
          const verifiedParts = verified ? verified.split("-") : [];
          let retried = false;
          parts.forEach((p, idx) => {
            if (verifiedParts[idx] !== p) {
              const btn = p === "Đ" ? tf.trueBtns[idx] : tf.falseBtns[idx];
              if (btn) {
                dispatchClick(btn);
                retried = true;
              }
            }
          });
          if (retried) {
            setTimeout(finish, 180);
            return;
          }
        }
        finish();
      }, lastClickAt + POST_CLICK_VERIFY_DELAY_MS);
      return;
    }

    finish();
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
    isProcessing = true;
    startProcessingWatchdog("Giải lại");

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
          clearProcessingWatchdog();
          syncStatus(`⚠️ Không tìm thấy Câu ${targetQNum} trên trang!`);
          isProcessing = false;
          return;
        }

        scrollTargetIntoCenter(targetBlock.blockEl);
        const classified = EXT.classifyQuestionInScope(targetBlock.blockEl, true);
        if (!classified.type) {
          clearProcessingWatchdog();
          isProcessing = false;
          return;
        }

        const { type, shortInp, tf, mcq } = classified;
        const payload = EXT.extractQuestionPayload(targetBlock.blockEl, classified);
        const oldUiAns = EXT.detectUIAns(type, mcq, shortInp, tf);
        const qKey = `LIST_Q${targetBlock.qNum}_${type}_${payload.stemText.slice(0, 50)}`;
        skippedFailedListKeys.delete(qKey);
        failCountMap.delete(qKey);
        const rejectedList = getRejectedAnswers(qKey, oldUiAns);

        syncStatus(`🔄 Đang giải lại Câu ${targetBlock.qNum} (Tránh: ${rejectedList.join(", ") || "trống"})...`);
        await waitMs(220);

        const images = await prepareVisualAttachments(payload, classified, true);
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

        clearProcessingWatchdog();
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
          applyAnswerToDOM(type, normAns, r.answerKind, mcq, shortInp, tf, () => {
            syncStatus(
              `✅ Đã giải lại Câu ${targetBlock.qNum}: [${oldUiAns || "?"}] ➔ [${normAns}]`,
              `Câu ${targetBlock.qNum} (Giải lại): ${cleanExportAns}`,
              buildMetaFromResult(`Câu ${targetBlock.qNum}`, r)
            );
            resolve();
          });
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
        }
      }

      const activeDoc = resolveTargetScopeDoc() || globalScope.document;
      const classified = EXT.classifyQuestionInScope(activeDoc, true);
      if (!classified.type) {
        clearProcessingWatchdog();
        syncStatus("⚠️ Không nhận diện được câu hỏi hiện tại để giải lại!");
        isProcessing = false;
        return;
      }

      const { type, shortInp, tf, mcq } = classified;
      const payload = EXT.extractQuestionPayload(activeDoc, classified);
      const oldUiAns = EXT.detectUIAns(type, mcq, shortInp, tf);
      const bodyTxt = getVisibleBodyText(activeDoc);
      const qCode = (bodyTxt.match(/#\d{5,}/) || [])[0] || (targetQNum ? `Câu ${targetQNum}` : "Câu hiện tại");
      const cleanQuestionFull = payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText;
      const curSig = `${qCode}_${type}_${payload.stemText.slice(0, 80)}_${payload.visualSignature.slice(0, 40)}`;
      failCountMap.delete(curSig);
      const rejectedList = getRejectedAnswers(curSig, oldUiAns);

      syncStatus(`🔄 Đang giải lại ${qCode} (Tránh: ${rejectedList.join(", ") || "trống"})...`);
      await waitMs(220);

      const images = await prepareVisualAttachments(payload, classified, true);
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

      clearProcessingWatchdog();
      isProcessing = false;
      if (!res?.success || !res.result) {
        syncStatus(`⚠️ Giải lại ${qCode} thất bại: ${res?.error || "Lỗi không xác định"}`);
        return;
      }

      const r = res.result;
      const normAns = r.normalizedAns || "";
      const cleanExportAns = formatCleanAnswerForExport(type, normAns, mcq);
      solvedSignature = curSig;

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
        applyAnswerToDOM(type, normAns, r.answerKind, mcq, shortInp, tf, () => {
          syncStatus(
            `✅ Đã giải lại ${qCode}: [${oldUiAns || "?"}] ➔ [${normAns}]`,
            `${qCode} (Giải lại): ${cleanExportAns}`,
            buildMetaFromResult(qCode, r)
          );
          resolve();
        });
      });
    } catch (err) {
      clearProcessingWatchdog();
      isProcessing = false;
      syncStatus(`⚠️ Lỗi giải lại: ${err?.message || err}`);
    }
  }

  // =========================================================================
  // CHẾ ĐỘ DANH SÁCH NHIỀU CÂU (LIST MODE)
  // =========================================================================
  async function processListMode(blocks) {
    if (isProcessing || !isExtensionEnabled) return;

    let task = null;
    if (typeof EXT.beginScanCache === "function") EXT.beginScanCache();
    try {
      for (const b of blocks) {
        if (solvedBlockEls.has(b.blockEl)) continue;

        const classified = EXT.classifyQuestionInScope(b.blockEl, true);
        if (!classified.type) continue;

        const { type, shortInp, tf, mcq } = classified;
        const payload = EXT.extractQuestionPayload(b.blockEl, classified);
        const qKey = `LIST_Q${b.qNum}_${type}_${payload.stemText.slice(0, 50)}`;
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
    startProcessingWatchdog(`Câu ${task.qNum}`);
    scrollTargetIntoCenter(task.blockEl);
    syncStatus(`🧠 Đang phân tích Câu ${task.qNum}/${blocks.length} (${task.type})...`);

    await waitMs(40);
    const images = await prepareVisualAttachments(task.payload, task.classified, false);
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

    clearProcessingWatchdog();

    if (!res?.success || !res.result) {
      const fails = (failCountMap.get(task.qKey) || 0) + 1;
      failCountMap.set(task.qKey, fails);
      if (fails >= 3) {
        skippedFailedListKeys.add(task.qKey);
        solvedBlockEls.add(task.blockEl);
        syncStatus(`⚠️ Câu ${task.qNum} lỗi 3 lần, tạm bỏ qua để giải tiếp câu khác...`);
        isProcessing = false;
        if (isExtensionEnabled) setTimeout(() => processScreen(false), 150);
      } else {
        syncStatus(`⚠️ Lỗi tạm thời Câu ${task.qNum} (lần ${fails}/3), thử lại sau 3.5s...`);
        setTimeout(() => {
          isProcessing = false;
          if (isExtensionEnabled) processScreen(false);
        }, 3500);
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

    applyAnswerToDOM(task.type, normAns, r.answerKind, task.mcq, task.shortInp, task.tf, () => {
      setTimeout(() => {
        isProcessing = false;
        if (isExtensionEnabled) processScreen(false);
      }, 150);
    });
  }

  // =========================================================================
  // CHẾ ĐỘ TỪNG CÂU (SINGLE-STEP MODE)
  // =========================================================================
  function findFastNextActionButton(doc, includeTraLoi = false) {
    const nodes = doc.querySelectorAll?.("button, [role='button'], a, div, span") || [];
    let match = null;
    for (const el of nodes) {
      if ((el.children?.length || 0) > 2) continue;
      const raw = (el.textContent || el.innerText || "").trim();
      if (raw.length === 0 || raw.length > 14) continue;
      const t = raw.toUpperCase();
      const isOk =
        t === "TIẾP TỤC" ||
        t === "TIẾP THEO" ||
        t === "CÂU TIẾP" ||
        t === "CÂU SAU" ||
        (includeTraLoi && t === "TRẢ LỜI");
      if (!isOk) continue;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (r.width === 0 || r.height === 0) continue;
      if (EXT.isInsideNavOrChrome(el)) continue;
      match = el;
      if (!includeTraLoi) return el;
    }
    return match;
  }

  function advanceSingleStep(currentQKey) {
    attemptedSingleQuestions.add(currentQKey);

    setTimeout(async () => {
      if (!isExtensionEnabled || !isQuizPage()) {
        isProcessing = false;
        return;
      }
      if (dismissSubmitModal()) {
        isProcessing = false;
        return;
      }

      const doc = globalScope.document;
      const snap = getVisibleBodyText(doc).slice(0, 350);

      const actionBtn = findFastNextActionButton(doc, true);
      if (actionBtn) {
        dispatchClick(actionBtn.closest ? actionBtn.closest("button") || actionBtn : actionBtn);
      }

      await waitMs(220);
      if (dismissSubmitModal()) {
        isProcessing = false;
        return;
      }

      const followUpBtn = findFastNextActionButton(doc, false);
      if (followUpBtn) {
        dispatchClick(followUpBtn.closest ? followUpBtn.closest("button") || followUpBtn : followUpBtn);
      }

      let changed = false;
      for (let i = 0; i < 4; i++) {
        await waitMs(120);
        if (dismissSubmitModal()) {
          isProcessing = false;
          return;
        }
        const nowSnap = getVisibleBodyText(doc).slice(0, 350);
        if (nowSnap !== snap) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        const { map, activeNum } = getNavState();
        const maxQ = map.size > 0 ? Math.max(...map.keys()) : 0;
        const nextNum = activeNum ? activeNum + 1 : attemptedSingleQuestions.size + 1;

        if (maxQ > 0 && nextNum <= maxQ && map.has(nextNum)) {
          dispatchClick(map.get(nextNum));
        } else {
          syncStatus("✅ Đã hoàn thành toàn bộ đề! Sẵn sàng xuất file đáp án.");
          triggerAutoExportNotification();
          isProcessing = false;
          return;
        }
      }

      isProcessing = false;
      if (isExtensionEnabled) setTimeout(() => processScreen(false), 120);
    }, 120);
  }

  function processScreen(forceDiagnostic = false) {
    if (!isExtensionEnabled) return { reason: "disabled" };
    if (isProcessing && !forceDiagnostic) return { reason: "busy" };

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
        syncStatus("⏭️ Đang chuyển qua bước giải thích sang câu tiếp...");
        dispatchClick(nextBtn.closest ? nextBtn.closest("button") || nextBtn : nextBtn);
        setTimeout(() => {
          if (isExtensionEnabled) processScreen(false);
        }, 250);
        return { reason: "step_explanation_advanced" };
      }
    }

    if (blocks.length >= 2) {
      processListMode(blocks);
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
    const cleanQuestionFull = payload.extraDetails ? `${payload.stemText}\n${payload.extraDetails}` : payload.stemText;

    const curSig = `${qCode}_${type}_${payload.stemText.slice(0, 80)}_${payload.visualSignature.slice(0, 40)}`;
    if (!forceDiagnostic && curSig === solvedSignature) return { reason: "already_solved_sig", qCode, type };

    const existingUIAns = EXT.detectUIAns(type, mcq, shortInp, tf);
    if (existingUIAns && /Đáp án của bạn/i.test(bodyTxt)) {
      solvedSignature = curSig;
      const cleanExportAns = formatCleanAnswerForExport(type, existingUIAns, mcq);
      saveCleanExportItem({
        signature: curSig,
        qLabel: qCode,
        question: cleanQuestionFull,
        answer: cleanExportAns
      });
      syncStatus(`Bỏ qua ${qCode} (Đã làm)`, `${qCode}: ${cleanExportAns}`);
      if (autoAdvanceEnabled) advanceSingleStep(curSig);
      return { reason: "skipped_already_answered", qCode, type };
    }

    isProcessing = true;
    startProcessingWatchdog(qCode);
    solvedSignature = curSig;
    syncStatus(`🧠 Đang giải ${qCode} (${type})...`);

    (async () => {
      try {
        await waitMs(40);
        const images = await prepareVisualAttachments(payload, classified, false);
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

        clearProcessingWatchdog();
        if (!res?.success || !res.result) {
          const fails = (failCountMap.get(curSig) || 0) + 1;
          failCountMap.set(curSig, fails);
          if (fails >= 3) {
            isProcessing = false;
            syncStatus("⚠️ Câu này lỗi 3 lần (kiểm tra API Key / bấm 🔍 Quét ngay hoặc chuyển câu kế)");
          } else {
            syncStatus(`⚠️ Lỗi tạm thời (lần ${fails}/3), tự thử lại sau 5s...`);
            setTimeout(() => {
              solvedSignature = "";
              isProcessing = false;
            }, 5000);
          }
          return;
        }

        failCountMap.delete(curSig);
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

        syncStatus(
          autoAdvanceEnabled ? `Đã giải ${qCode}` : `✅ Đã tích ${qCode} (Chờ bấm Tiếp)`,
          `${qCode}: ${cleanExportAns}`,
          buildMetaFromResult(qCode, r)
        );

        applyAnswerToDOM(type, normAns, r.answerKind, mcq, shortInp, tf, () => {
          if (autoAdvanceEnabled) {
            advanceSingleStep(curSig);
          } else {
            isProcessing = false;
          }
        });
      } catch (err) {
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
    clearProcessingWatchdog();
    isProcessing = false;
    solvedSignature = "";
    hasAutoExported = false;
    solvedListKeys.clear();
    solvedBlockEls = new WeakSet();
    skippedFailedListKeys.clear();
    failCountMap.clear();
    attemptedSingleQuestions.clear();
    if (isExtensionEnabled) {
      setTimeout(() => {
        if (isExtensionEnabled && !isProcessing) processScreen(false);
      }, 160);
    }
    return { changed: true, routeKey: nextKey };
  }

  function updateConfig(cfg = {}) {
    if (typeof cfg.autoSolverEnabled === "boolean") {
      const changed = isExtensionEnabled !== cfg.autoSolverEnabled;
      isExtensionEnabled = cfg.autoSolverEnabled;
      if (changed) {
        if (isExtensionEnabled) {
          solvedSignature = "";
          isProcessing = false;
          processScreen(false);
        } else {
          isProcessing = false;
          clearProcessingWatchdog();
          clearTimeout(debounceTimer);
        }
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
    clearProcessingWatchdog();
    isProcessing = false;
    solvedSignature = "";
    failCountMap.clear();
    skippedFailedListKeys.clear();
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
    clearProcessingWatchdog();
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    clearTimeout(retrySyncTimer1);
    clearTimeout(retrySyncTimer2);
    maxWaitTimer = null;
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
      isExtensionEnabled,
      configSynced,
      autoAdvanceEnabled,
      intelligenceMode,
      solvedListCount: solvedListKeys.size,
      skippedListCount: skippedFailedListKeys.size,
      dom: EXT.inspectDomSummary?.(globalScope.document)
    }),
    cleanup: cleanupSelf,
    _internalForTest: {
      applyAnswerToDOM,
      prepareVisualAttachments,
      processListMode,
      processScreen,
      handleManualRetryQuestion,
      getRejectedAnswers,
      syncConfigFromNative,
      getVisibleBodyText,
      resetState: () => {
        clearProcessingWatchdog();
        isProcessing = false;
        solvedSignature = "";
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
        rejectedHistoryMap.clear();
      }
    }
  };

  globalScope.__OnLuyenMobileAgent = agentApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = agentApi;
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

    const triggerDebouncedScan = () => {
      const curKey = normalizeRouteKey();
      if (curKey !== lastRouteKey) {
        onRouteChanged();
        return;
      }
      if (!isExtensionEnabled || isProcessing) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
        processScreen(false);
      }, 150);
      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(() => {
          maxWaitTimer = null;
          clearTimeout(debounceTimer);
          processScreen(false);
        }, 350);
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
      if (isExtensionEnabled && !isProcessing) {
        processScreen(false);
      }
    }, 850);
  }
})(typeof window !== "undefined" ? window : globalThis);
