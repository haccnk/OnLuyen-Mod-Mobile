((globalScope) => {
  const DEFAULT_BG_SET = new Set([
    "",
    "rgba(0, 0, 0, 0)",
    "transparent",
    "rgb(255, 255, 255)",
    "rgb(248, 250, 252)",
    "rgb(241, 245, 249)"
  ]);

  const UI_NOISE_LINE_RE =
    /^(Nộp bài|Thời gian(?:\s+còn\s+lại)?|Thống kê|Phiếu trả lời|Danh sách câu hỏi|Câu đã làm|Câu chưa làm|Tiếp tục|Trả lời|Quay lại|Đáp án của bạn|Đáp án đúng|Báo cáo|Báo lỗi|Góp ý|Lưu bài|Thoát)$/i;

  function getFastText(el) {
    if (!el) return "";
    return el.textContent || "";
  }

  function getText(el) {
    if (!el) return "";
    if (typeof el.textContent === "string" && el.textContent.length > 0) return el.textContent;
    return el.innerText || "";
  }

  let _scanCache = null;

  function beginScanCache() {
    _scanCache = {
      rect: new WeakMap(),
      cs: new WeakMap(),
      hidden: new WeakMap(),
      navSelf: new WeakMap(),
      navInside: new WeakMap()
    };
  }

  function endScanCache() {
    _scanCache = null;
  }

  function safeRect(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
    if (_scanCache && _scanCache.rect.has(el)) {
      return _scanCache.rect.get(el);
    }
    const r = el.getBoundingClientRect();
    const out = {
      top: r.top ?? 0,
      left: r.left ?? 0,
      right: r.right ?? (r.left ?? 0) + (r.width ?? 0),
      bottom: r.bottom ?? (r.top ?? 0) + (r.height ?? 0),
      width: r.width ?? 0,
      height: r.height ?? 0
    };
    if (_scanCache) _scanCache.rect.set(el, out);
    return out;
  }

  function safeComputedStyle(el) {
    if (!el || el.nodeType !== 1) return null;
    if (_scanCache && _scanCache.cs.has(el)) {
      return _scanCache.cs.get(el);
    }
    let cs = el.style || null;
    try {
      if (typeof globalScope.getComputedStyle === "function") {
        cs = globalScope.getComputedStyle(el);
      }
    } catch (e) {}
    if (_scanCache) _scanCache.cs.set(el, cs);
    return cs;
  }

  function getEffectiveRect(el) {
    const r = safeRect(el);
    if (r.width > 0 && r.height > 0) return r;
    let cur = el?.parentElement;
    for (let depth = 0; depth < 3 && cur && cur.nodeType === 1; depth++) {
      const pr = safeRect(cur);
      if (pr.width > 0 && pr.height > 0) return pr;
      cur = cur.parentElement;
    }
    return r;
  }

  function isHiddenElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (_scanCache && _scanCache.hidden.has(el)) {
      return _scanCache.hidden.get(el);
    }
    let hidden = false;
    if (el.hidden) {
      hidden = true;
    } else {
      const cls = String(el.className || "");
      if (/\b(MathJax_Preview|sr-only|visually-hidden)\b/i.test(cls) || el.id === "__onluyen_capture_stage") {
        hidden = true;
      } else {
        const inlineStyle = el.style || {};
        if (inlineStyle.display === "none" || inlineStyle.visibility === "hidden") {
          hidden = true;
        } else {
          const cs = safeComputedStyle(el);
          if (cs && (cs.display === "none" || cs.visibility === "hidden")) {
            hidden = true;
          }
        }
      }
    }
    if (_scanCache) _scanCache.hidden.set(el, hidden);
    return hidden;
  }

  function closestMatching(el, predicate) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (predicate(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function containsAny(container, targets) {
    if (!container || !targets || targets.length === 0) return false;
    for (const t of targets) {
      if (t && container !== t && typeof container.contains === "function" && container.contains(t)) {
        return true;
      }
    }
    return false;
  }

  function dedupeNestedControls(els) {
    if (!Array.isArray(els) || els.length <= 1) return els || [];
    const outerOnly = els.filter(
      (el) => !els.some((other) => other !== el && typeof other.contains === "function" && other.contains(el))
    );
    const seenWrappers = new Set();
    const out = [];
    for (const el of outerOnly) {
      const wrapper = closestMatching(el, (n) => {
        const cls = String(n.className || "");
        const t = (n.tagName || "").toLowerCase();
        if (/\b(ant-radio-wrapper|mat-radio-button|el-radio)\b/i.test(cls)) return true;
        if (t === "label") {
          const innerCount = n.querySelectorAll?.('input[type="radio"], [role="radio"], .ant-radio')?.length || 0;
          return innerCount <= 2;
        }
        return false;
      });
      if (wrapper) {
        if (seenWrappers.has(wrapper)) continue;
        seenWrappers.add(wrapper);
      }
      out.push(el);
    }
    return out;
  }

  // =========================================================================
  // 1. CHUYỂN ĐỔI MATHML -> LATEX (CHỐNG LẶP CHỮ & MẤT PHÂN SỐ/CĂN/MŨ)
  // =========================================================================
  const MO_MAP = {
    "×": "\\times ",
    "⋅": "\\cdot ",
    "·": "\\cdot ",
    "÷": "\\div ",
    "≤": "\\le ",
    "≥": "\\ge ",
    "≠": "\\ne ",
    "≈": "\\approx ",
    "∞": "\\infty ",
    "±": "\\pm ",
    "∓": "\\mp ",
    "∈": "\\in ",
    "∉": "\\notin ",
    "∪": "\\cup ",
    "∩": "\\cap ",
    "⊂": "\\subset ",
    "⊆": "\\subseteq ",
    "∅": "\\emptyset ",
    "⇒": "\\Rightarrow ",
    "⇔": "\\Leftrightarrow ",
    "→": "\\to ",
    "∀": "\\forall ",
    "∃": "\\exists ",
    "∑": "\\sum ",
    "∫": "\\int ",
    "∏": "\\prod ",
    "−": "-"
  };

  function getElementChildren(node) {
    if (!node || !node.childNodes) return [];
    const out = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === 1) out.push(node.childNodes[i]);
    }
    return out;
  }

  function mathMLToLatex(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return (node.nodeValue || "").replace(/\s+/g, " ");
    }
    if (node.nodeType !== 1) return "";

    const tag = (node.localName || node.tagName || "").toLowerCase();
    if (tag === "mphantom" || tag === "annotation" || tag === "annotation-xml") {
      return "";
    }

    if (tag === "semantics") {
      const children = getElementChildren(node);
      for (const ch of children) {
        const cTag = (ch.localName || ch.tagName || "").toLowerCase();
        if (cTag === "annotation" && /x-tex|latex/i.test(ch.getAttribute?.("encoding") || "")) {
          return (ch.textContent || "").trim();
        }
      }
      if (children.length > 0) return mathMLToLatex(children[0]);
      return "";
    }

    if (tag === "mi" || tag === "mn" || tag === "mtext" || tag === "ms") {
      const txt = (node.textContent || "").replace(/\u200B|\uFEFF/g, "").trim();
      if (tag === "mtext" && txt) return `\\text{${txt}}`;
      return txt;
    }

    if (tag === "mo") {
      const op = (node.textContent || "").replace(/\u200B|\uFEFF/g, "").trim();
      return MO_MAP[op] || op;
    }

    if (tag === "mspace") return " ";

    const kids = getElementChildren(node);

    if (tag === "mfrac" && kids.length >= 2) {
      return `\\frac{${mathMLToLatex(kids[0]).trim()}}{${mathMLToLatex(kids[1]).trim()}}`;
    }
    if (tag === "msqrt") {
      const inner = kids.map(mathMLToLatex).join("").trim();
      return `\\sqrt{${inner}}`;
    }
    if (tag === "mroot" && kids.length >= 2) {
      return `\\sqrt[${mathMLToLatex(kids[1]).trim()}]{${mathMLToLatex(kids[0]).trim()}}`;
    }
    if (tag === "msup" && kids.length >= 2) {
      return `{${mathMLToLatex(kids[0]).trim()}}^{${mathMLToLatex(kids[1]).trim()}}`;
    }
    if (tag === "msub" && kids.length >= 2) {
      return `{${mathMLToLatex(kids[0]).trim()}}_{${mathMLToLatex(kids[1]).trim()}}`;
    }
    if (tag === "msubsup" && kids.length >= 3) {
      return `{${mathMLToLatex(kids[0]).trim()}}_{${mathMLToLatex(kids[1]).trim()}}^{${mathMLToLatex(kids[2]).trim()}}`;
    }
    if (tag === "mover" && kids.length >= 2) {
      const base = mathMLToLatex(kids[0]).trim();
      const overRaw = (kids[1].textContent || "").trim();
      if (overRaw === "→" || overRaw === "\u2192" || overRaw === "\u20d7") {
        return `\\vec{${base}}`;
      }
      if (overRaw === "¯" || overRaw === "‾" || overRaw === "\u00af" || overRaw === "\u0304" || overRaw === "-") {
        return `\\overline{${base}}`;
      }
      if (overRaw === "^" || overRaw === "ˆ") {
        return `\\hat{${base}}`;
      }
      return `\\overset{${mathMLToLatex(kids[1]).trim()}}{${base}}`;
    }
    if (tag === "munder" && kids.length >= 2) {
      return `\\underset{${mathMLToLatex(kids[1]).trim()}}{${mathMLToLatex(kids[0]).trim()}}`;
    }
    if (tag === "munderover" && kids.length >= 3) {
      return `{${mathMLToLatex(kids[0]).trim()}}_{${mathMLToLatex(kids[1]).trim()}}^{${mathMLToLatex(kids[2]).trim()}}`;
    }
    if (tag === "mfenced") {
      const open = node.getAttribute?.("open") ?? "(";
      const close = node.getAttribute?.("close") ?? ")";
      const sepAttr = node.getAttribute?.("separators");
      const sep = sepAttr && sepAttr.length > 0 ? sepAttr[0] : ",";
      const parts = kids.map((k) => mathMLToLatex(k).trim());
      return `${open}${parts.join(`${sep} `)}${close}`;
    }
    if (tag === "mtable") {
      const rows = kids.map((r) => mathMLToLatex(r).trim()).filter(Boolean);
      return `\\begin{matrix} ${rows.join(" \\\\ ")} \\end{matrix}`;
    }
    if (tag === "mtr" || tag === "mlabeledtr") {
      return kids.map((c) => mathMLToLatex(c).trim()).join(" & ");
    }
    if (tag === "mtd") {
      return kids.map(mathMLToLatex).join("").trim();
    }

    if (node.childNodes && node.childNodes.length > 0) {
      let buf = "";
      for (let i = 0; i < node.childNodes.length; i++) {
        buf += mathMLToLatex(node.childNodes[i]);
      }
      return buf;
    }
    return "";
  }

  // =========================================================================
  // 2. SERIALIZER HỌC THUẬT (LATEX + GẠCH CHÂN + CHỈ SỐ + BẢNG + ẢNH)
  // =========================================================================
  function isMeaningfulAlt(alt) {
    if (!alt) return false;
    const t = alt.trim();
    if (!t || t.length < 1) return false;
    if (/^(image|img|pic|picture|photo|icon|logo|avatar|thumbnail|hình|ảnh)(\s*[-_#]?\s*\d+)?(\.(png|jpe?g|gif|webp|svg))?$/i.test(t)) {
      return false;
    }
    if (/^[\w\-]+\.(png|jpe?g|gif|webp|svg)$/i.test(t)) return false;
    return true;
  }

  function extractTexFromImageSrc(src) {
    if (!src) return "";
    try {
      if (/codecogs\.com|mimetex|latex\.|wiris/i.test(src)) {
        const qIdx = src.indexOf("?");
        if (qIdx !== -1) {
          const rawQ = src.slice(qIdx + 1);
          const m = rawQ.match(/(?:^|&)(?:tex|chl|formula)=([^&]+)/i);
          if (m) return decodeURIComponent(m[1]).trim();
          const cleaned = decodeURIComponent(rawQ).trim();
          if (cleaned && !cleaned.includes("=")) return cleaned;
        }
      }
    } catch (e) {}
    return "";
  }

  function isUnderlinedInlineElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "u" || tag === "ins") return true;

    const inlineTags = new Set(["span", "b", "strong", "em", "i", "font", "mark", "a"]);
    if (!inlineTags.has(tag)) return false;

    const inlineDec = String(el.style?.textDecoration || el.style?.textDecorationLine || "");
    if (/underline/i.test(inlineDec)) return true;

    if ((el.children?.length || 0) > 2) return false;
    const txt = getFastText(el).trim();
    if (txt.length === 0 || txt.length > 40 || !/[A-Za-zÀ-ỹ]/.test(txt)) return false;

    const cs = safeComputedStyle(el);
    if (cs) {
      const dec = String(cs.textDecorationLine || cs.textDecoration || "");
      if (/underline/i.test(dec)) return true;

      const bStyle = String(cs.borderBottomStyle || el.style?.borderBottomStyle || "");
      const bWidth = parseFloat(cs.borderBottomWidth || el.style?.borderBottomWidth || "0");
      if (bStyle && bStyle !== "none" && bWidth >= 0.8 && bWidth <= 3.5) {
        return true;
      }
    }
    return false;
  }

  function isTableAnswerMatrix(tableEl) {
    if (!tableEl || typeof tableEl.querySelectorAll !== "function") return false;
    const radios = tableEl.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"]');
    if (radios.length >= 4) return true;
    const btns = Array.from(tableEl.querySelectorAll("button, [role='button'], td, span"))
      .filter((el) => /^(Đúng|Sai|Đ|S)$/i.test(getText(el).trim()));
    return btns.length >= 6;
  }

  function isVariationOrDiagramTable(tableEl) {
    if (!tableEl || tableEl.nodeType !== 1) return false;
    const clsId = `${tableEl.className || ""} ${tableEl.id || ""}`.toLowerCase();
    if (/(variation|bang-bien-thien|bbt|diagram|chart|graph)/.test(clsId)) return true;
    const txt = getText(tableEl);
    if (/[↗↘↑↓↗️↘️]/.test(txt)) return true;
    if (tableEl.querySelector?.("svg, canvas")) return true;
    return false;
  }

  function serializeTableToMarkdown(tableEl, opts, state) {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    if (rows.length === 0) return "";
    if (Array.isArray(state.visuals) && isVariationOrDiagramTable(tableEl)) {
      const r = safeRect(tableEl);
      state.visuals.push({
        type: "html_diagram",
        sig: `bbt#${Math.round(r.width)}x${Math.round(r.height)}#${rows.length}`,
        w: Math.round(r.width),
        h: Math.round(r.height),
        el: tableEl
      });
    }

    const mdLines = [];
    for (const tr of rows) {
      if (opts.excludeNodes.has(tr) || isHiddenElement(tr)) continue;
      const cells = Array.from(tr.children).filter((c) => {
        const t = (c.tagName || "").toLowerCase();
        return (t === "td" || t === "th") && !opts.excludeNodes.has(c);
      });
      if (cells.length === 0) continue;
      const cellTexts = cells.map((cell) =>
        walkSerialize(cell, opts, state)
          .replace(/\s*\n+\s*/g, " ")
          .replace(/\|/g, "\\|")
          .trim()
      );
      if (cellTexts.some(Boolean)) {
        mdLines.push(`| ${cellTexts.join(" | ")} |`);
      }
    }
    return mdLines.length > 0 ? `\n${mdLines.join("\n")}\n` : "";
  }

  const BLOCK_TAGS = new Set([
    "p", "div", "section", "article", "header", "footer", "aside", "main",
    "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr"
  ]);

  function walkSerialize(node, opts, state) {
    if (!node) return "";
    if (opts.excludeNodes.has(node)) return "";

    if (node.nodeType === 3) {
      return (node.nodeValue || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
    }
    if (node.nodeType !== 1) return "";

    const tag = (node.tagName || "").toLowerCase();
    const cls = String(node.className || "");

    if (tag === "br") return "\n";

    if (tag === "script") {
      const tp = String(node.getAttribute?.("type") || "");
      if (tp.startsWith("math/")) {
        const tex = (node.textContent || "").trim();
        return tex ? ` $${tex}$ ` : "";
      }
      return "";
    }
    if (tag === "style" || tag === "noscript" || tag === "template") return "";

    if (/\bkatex\b/i.test(cls) && !/\bkatex-(html|mathml|display)\b/i.test(cls)) {
      const dataTex = node.getAttribute?.("data-tex") || node.getAttribute?.("data-latex");
      if (dataTex) return ` $${dataTex.trim()}$ `;
      const ann = node.querySelector?.('annotation[encoding="application/x-tex"]');
      if (ann && ann.textContent) return ` $${ann.textContent.trim()}$ `;
      const mathEl = node.querySelector?.(".katex-mathml math, math");
      if (mathEl) {
        const mTex = mathMLToLatex(mathEl).trim();
        if (mTex) return ` $${mTex}$ `;
      }
      const htmlEl = node.querySelector?.(".katex-html");
      if (htmlEl) return ` ${getText(htmlEl).trim()} `;
    }

    if (tag === "mjx-container" || /\bMathJax\b/.test(cls)) {
      const dataTex = node.getAttribute?.("data-tex") || node.getAttribute?.("data-latex");
      if (dataTex) return ` $${dataTex.trim()}$ `;
      const mathEl = node.querySelector?.("mjx-assistive-mml math, .MJX_Assistive_MathML math, math");
      if (mathEl) {
        const mTex = mathMLToLatex(mathEl).trim();
        if (mTex) return ` $${mTex}$ `;
      }
    }

    if (tag === "mjx-assistive-mml" || /\bMJX_Assistive_MathML\b/.test(cls)) {
      return "";
    }

    if (isHiddenElement(node)) return "";
    if (node.getAttribute?.("aria-hidden") === "true" && !/\bkatex\b/i.test(cls)) {
      return "";
    }

    if ((tag === "button" || node.getAttribute?.("role") === "button") &&
        /^(Báo cáo|Báo lỗi|Góp ý|Nghe lại)$/i.test(getText(node).trim())) {
      return "";
    }

    if (tag === "img") {
      const dataTex = node.getAttribute?.("data-latex") || node.getAttribute?.("data-tex") || "";
      if (dataTex.trim()) return ` $${dataTex.trim()}$ `;

      const src = node.getAttribute?.("src") || node.src || "";
      const urlTex = extractTexFromImageSrc(src);
      if (urlTex) return ` $${urlTex}$ `;

      const alt = (node.getAttribute?.("alt") || node.alt || "").trim();
      const r = safeRect(node);
      const w = Math.round(r.width || Number(node.getAttribute?.("width")) || node.width || 0);
      const h = Math.round(r.height || Number(node.getAttribute?.("height")) || node.height || 0);

      if (w > 24 || h > 20 || (w === 0 && h === 0 && src)) {
        state.visuals.push({
          type: "img",
          sig: `${src.slice(-64)}#${w}x${h}`,
          src,
          w,
          h,
          el: node
        });
        if (isMeaningfulAlt(alt)) return ` ${alt} [HÌNH_MINH_HỌA] `;
        return " [HÌNH_MINH_HỌA] ";
      }
      return isMeaningfulAlt(alt) ? ` ${alt} ` : "";
    }

    if (tag === "svg") {
      const r = safeRect(node);
      const w = Math.round(r.width || Number(node.getAttribute?.("width")) || 0);
      const h = Math.round(r.height || Number(node.getAttribute?.("height")) || 0);
      if (w > 40 && h > 30) {
        state.visuals.push({ type: "svg", sig: `svg#${w}x${h}`, w, h, el: node });
        return " [HÌNH_ĐỒ_THỊ] ";
      }
      return "";
    }

    if (tag === "canvas") {
      const r = safeRect(node);
      const w = Math.round(r.width || Number(node.getAttribute?.("width")) || 0);
      const h = Math.round(r.height || Number(node.getAttribute?.("height")) || 0);
      state.visuals.push({ type: "canvas", sig: `canvas#${w}x${h}`, w, h, el: node });
      return " [HÌNH_ĐỒ_THỊ] ";
    }

    if (tag === "sup") {
      const inner = walkChildren(node, opts, state).trim();
      return inner ? `^{${inner}}` : "";
    }
    if (tag === "sub") {
      const inner = walkChildren(node, opts, state).trim();
      return inner ? `_{${inner}}` : "";
    }

    if (tag === "table" && !isTableAnswerMatrix(node)) {
      return serializeTableToMarkdown(node, opts, state);
    }

    // Sơ đồ / bảng biến thiên dựng bằng HTML+CSS thuần (không dùng <table>)
    if (tag !== "table" && /\b(bang-bien-thien|variation-table|diagram-box|chart-container)\b/i.test(cls)) {
      const r = safeRect(node);
      state.visuals.push({
        type: "html_diagram",
        sig: `diagram#${Math.round(r.width)}x${Math.round(r.height)}`,
        w: Math.round(r.width),
        h: Math.round(r.height),
        el: node
      });
    }

    const shouldUnderline = !state.inUnderline && isUnderlinedInlineElement(node);
    if (shouldUnderline) {
      const prev = state.inUnderline;
      state.inUnderline = true;
      const inner = walkChildren(node, opts, state).replace(/\s+/g, " ").trim();
      state.inUnderline = prev;
      if (!inner) return "";
      return `[GẠCH_CHÂN: ${inner}]`;
    }

    const inner = walkChildren(node, opts, state);
    if (BLOCK_TAGS.has(tag)) {
      return `\n${inner}\n`;
    }
    if (tag === "td" || tag === "th") {
      return `${inner} `;
    }
    return inner;
  }

  function walkChildren(node, opts, state) {
    let out = "";
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      out += walkSerialize(children[i], opts, state);
    }
    return out;
  }

  function postProcessSerializedText(raw) {
    if (!raw) return "";
    let txt = raw.replace(/[\u200B-\u200D\uFEFF]/g, "");

    let prev;
    do {
      prev = txt;
      txt = txt.replace(/\[GẠCH_CHÂN:\s*([^\]]+)\]\[GẠCH_CHÂN:\s*([^\]]+)\]/g, (_, a, b) => {
        return `[GẠCH_CHÂN: ${a}${b}]`;
      });
    } while (txt !== prev);

    const lines = txt
      .split("\n")
      .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
      .filter((l) => l.length > 0 && !UI_NOISE_LINE_RE.test(l));

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function serializeAcademicDOM(rootNode, options = {}) {
    if (!rootNode) return "";
    const excludeSet = options.excludeNodes instanceof Set
      ? options.excludeNodes
      : new Set(Array.isArray(options.excludeNodes) ? options.excludeNodes : []);
    const state = {
      inUnderline: false,
      visuals: Array.isArray(options.collectVisuals) ? options.collectVisuals : []
    };
    const raw = walkSerialize(rootNode, { excludeNodes: excludeSet }, state);
    return postProcessSerializedText(raw);
  }

  // =========================================================================
  // 3. NHẬN DIỆN VÙNG ĐIỀU HƯỚNG / CHROME (VÁ LỖI MÀN HÌNH DỌC MOBILE 360-430px)
  // =========================================================================
  function countNumericPills(container) {
    if (!container || typeof container.querySelectorAll !== "function") return 0;
    let count = 0;
    let scanned = 0;
    const nodes = container.querySelectorAll("button, a, span, div, li");
    for (const n of nodes) {
      if (++scanned > 120) break;
      if (n.children && n.children.length > 0) continue;
      const t = getFastText(n).trim();
      if (t.length >= 1 && t.length <= 3 && /^\d{1,3}$/.test(t)) {
        const num = parseInt(t, 10);
        if (num >= 1 && num <= 150) count++;
      }
      if (count >= 6) return count;
    }
    return count;
  }

  function computeIsNavPanelContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "body" || tag === "html") return false;

    const vw = globalScope.innerWidth || 1280;
    const isMobile = vw < 700;
    const r = safeRect(el);
    const cs = safeComputedStyle(el);
    const pos = String((cs && cs.position) || el.style?.position || "").toLowerCase();
    const isFixedOverlay = pos === "fixed";
    const clsId = `${el.className || ""} ${el.id || ""}`.toLowerCase();

    // Luật hình học tương đối theo viewport:
    // Trên màn hình dọc mobile (vw < 700), bất kỳ khối nội dung chính không phải Drawer fixed
    // có chiều rộng > 62% màn hình và cao > 160px TUYỆT ĐỐI KHÔNG BAO GIỜ là thanh điều hướng.
    if (isMobile) {
      if (!isFixedOverlay && r.width > vw * 0.62 && r.height > 160) {
        return false;
      }
    } else {
      if (r.width > Math.max(460, vw * 0.48) && r.height > 105) {
        return false;
      }
    }

    if (tag === "header" || tag === "nav") {
      if (isMobile) {
        return r.height === 0 || r.height <= 115 || isFixedOverlay;
      }
      return r.height === 0 || r.height <= 115 || r.width <= vw * 0.46;
    }
    if (tag === "aside") {
      return r.width === 0 || isFixedOverlay || r.width <= (isMobile ? vw * 0.62 : Math.max(460, vw * 0.48));
    }

    if (/(answer-sheet|question-palette|question-nav|quiz-sidebar|nav-panel|mobile-drawer|ant-drawer)/.test(clsId)) {
      if (isFixedOverlay) return true;
      return r.width === 0 || r.width <= (isMobile ? vw * 0.62 : Math.max(460, vw * 0.48));
    }

    const maxNavWidth = isMobile ? vw * 0.62 : Math.max(450, vw * 0.45);
    if (isFixedOverlay || r.width === 0 || r.width <= maxNavWidth) {
      const pills = countNumericPills(el);
      if (pills >= 5) {
        const text = getFastText(el);
        const nonDigitText = text.replace(/\d+/g, "").trim();
        if (/Phiếu trả lời|Danh sách câu|Câu đã làm|Câu chưa làm/i.test(text) && nonDigitText.length < 320) {
          return true;
        }
        if (nonDigitText.length < 260 && !/\b[A-D][\.\)]/.test(text)) {
          return true;
        }
      }
    }
    return false;
  }

  function isNavPanelContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (_scanCache && _scanCache.navSelf.has(el)) {
      return _scanCache.navSelf.get(el);
    }
    const res = computeIsNavPanelContainer(el);
    if (_scanCache) _scanCache.navSelf.set(el, res);
    return res;
  }

  function isInsideNavOrChrome(el) {
    if (!el) return false;
    if (_scanCache && _scanCache.navInside.has(el)) {
      return _scanCache.navInside.get(el);
    }
    const chain = [];
    let cur = el;
    let found = false;
    while (cur && cur.nodeType === 1) {
      const tag = (cur.tagName || "").toLowerCase();
      if (tag === "body" || tag === "html") break;
      if (_scanCache && _scanCache.navInside.has(cur)) {
        found = _scanCache.navInside.get(cur);
        break;
      }
      chain.push(cur);
      if (isNavPanelContainer(cur)) {
        found = true;
        break;
      }
      cur = cur.parentElement;
    }
    if (_scanCache) {
      if (found && chain.length > 0) {
        // Chỉ nút chạm nav (cuối chain) và con cháu phía dưới nó chắc chắn nằm trong nav
        for (const n of chain) _scanCache.navInside.set(n, true);
      } else {
        for (const n of chain) _scanCache.navInside.set(n, false);
      }
    }
    return found;
  }

  // =========================================================================
  // 4. PHÂN LOẠI CÂU HỎI & BẮT CHÍNH XÁC NÚT ĐIỀU KHIỂN (BỎ GIỚI HẠN r.top < 40)
  // =========================================================================
  function getInteractiveTarget(el) {
    if (!el) return el;
    return closestMatching(el, (n) => {
      const t = (n.tagName || "").toLowerCase();
      return t === "button" || t === "label" || n.getAttribute?.("role") === "radio" || n.getAttribute?.("role") === "button";
    }) || el;
  }

  function extractTFStatementsFromRows(rowsData) {
    return rowsData.map((item, idx) => {
      const labelChar = String.fromCharCode(97 + idx);
      const exclude = new Set(item.excludeEls || []);
      let stmt = serializeAcademicDOM(item.rowEl, { excludeNodes: exclude })
        .replace(/\s*\n+\s*/g, " ")
        .trim();
      if (stmt && !new RegExp(`^${labelChar}[\\.\\)]\\s*`, "i").test(stmt)) {
        stmt = `${labelChar}) ${stmt}`;
      }
      return stmt || `${labelChar}) (Xem hình ảnh mệnh đề ${labelChar})`;
    });
  }

  function findTF(root = document, _ignoreTop = true) {
    const tables = Array.from(root.querySelectorAll?.("table") || []);
    for (const table of tables) {
      if (isInsideNavOrChrome(table) || isHiddenElement(table)) continue;
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 4) continue;

      let dungColIdx = -1;
      let saiColIdx = -1;

      for (const tr of rows) {
        const isHead = closestMatching(tr, (n) => (n.tagName || "").toLowerCase() === "thead") !== null;
        const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName || ""));
        const hasInputs = tr.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], button');
        if (isHead || cells.some((c) => (c.tagName || "").toLowerCase() === "th") || !hasInputs) {
          cells.forEach((c, ci) => {
            const ct = getText(c).trim();
            if (/^(Đúng|Đ)$/i.test(ct)) dungColIdx = ci;
            else if (/^(Sai|S)$/i.test(ct)) saiColIdx = ci;
          });
        }
      }

      const dataRows = [];
      for (const tr of rows) {
        if (closestMatching(tr, (n) => (n.tagName || "").toLowerCase() === "thead")) continue;
        const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName || ""));
        if (cells.length < 2) continue;
        if (cells.every((c) => (c.tagName || "").toLowerCase() === "th")) continue;

        const rowControls = dedupeNestedControls(
          Array.from(
            tr.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], button, [role="button"]')
          ).filter((el) => !isHiddenElement(el))
        );

        let tBtn = null;
        let fBtn = null;

        const rowTextBtns = Array.from(tr.querySelectorAll("button, label, td, span, div"))
          .filter((el) => (el.children?.length || 0) <= 2 && !isHiddenElement(el));
        const tTextEl = rowTextBtns.find((el) => /^(Đúng|Đ)$/i.test(getText(el).trim()));
        const fTextEl = rowTextBtns.find((el) => /^(Sai|S)$/i.test(getText(el).trim()));

        if (tTextEl && fTextEl && tTextEl !== fTextEl) {
          tBtn = getInteractiveTarget(tTextEl);
          fBtn = getInteractiveTarget(fTextEl);
        } else if (rowControls.length >= 2) {
          if (dungColIdx >= 0 && saiColIdx >= 0 && cells[dungColIdx] && cells[saiColIdx]) {
            tBtn = cells[dungColIdx].querySelector('input, [role="radio"], button') || cells[dungColIdx];
            fBtn = cells[saiColIdx].querySelector('input, [role="radio"], button') || cells[saiColIdx];
          } else {
            tBtn = rowControls[0];
            fBtn = rowControls[1];
          }
        } else if (cells.length >= 3 && dungColIdx >= 0 && saiColIdx >= 0 && !tr.querySelector("th")) {
          const rowPlainTxt = getText(tr).trim();
          if (rowPlainTxt.length > 10 && !/^(Mệnh đề|Nội dung|Câu hỏi)?\s*(Đúng|Đ)\s*(Sai|S)$/i.test(rowPlainTxt)) {
            tBtn = cells[dungColIdx];
            fBtn = cells[saiColIdx];
          }
        }

        if (tBtn && fBtn && tBtn !== fBtn) {
          const exSet = [];
          const tCell = closestMatching(tBtn, (n) => (n.tagName || "").toLowerCase() === "td");
          const fCell = closestMatching(fBtn, (n) => (n.tagName || "").toLowerCase() === "td");
          exSet.push(tCell || tBtn, fCell || fBtn);
          dataRows.push({ rowEl: tr, trueBtn: tBtn, falseBtn: fBtn, excludeEls: exSet });
        }
      }

      if (dataRows.length >= 4) {
        const picked = dataRows.slice(0, 4);
        return {
          trueBtns: picked.map((d) => d.trueBtn),
          falseBtns: picked.map((d) => d.falseBtn),
          statements: extractTFStatementsFromRows(picked),
          rowEls: picked.map((d) => d.rowEl),
          rowExcludeEls: picked.map((d) => d.excludeEls),
          containerEl: table
        };
      }
    }

    // Chiến lược B: Lọc chuỗi ngắn trước khi kiểm tra Nav/Style/Rect để đạt O(1) reflow
    const leafCandidates = Array.from(root.querySelectorAll?.("button, label, span, div, td") || []).filter((el) => {
      const childLen = el.children?.length || 0;
      const tag = (el.tagName || "").toLowerCase();
      if (childLen > 0 && !((tag === "button" || tag === "label") && childLen <= 2)) return false;
      const txt = getFastText(el).trim();
      if (txt.length === 0 || txt.length > 6 || !/^(Đúng|Sai|Đ|S)$/i.test(txt)) return false;
      if (isHiddenElement(el) || isInsideNavOrChrome(el)) return false;
      if (closestMatching(el, (n) => /^(thead|th)$/i.test(n.tagName || ""))) return false;
      const r = getEffectiveRect(el);
      return r.width >= 12 && r.height >= 12 && r.width <= 220;
    });

    const tBtnsRaw = dedupeNestedControls(leafCandidates.filter((e) => /^(Đúng|Đ)$/i.test(getText(e).trim())));
    const fBtnsRaw = dedupeNestedControls(leafCandidates.filter((e) => /^(Sai|S)$/i.test(getText(e).trim())));

    if (tBtnsRaw.length >= 4 && fBtnsRaw.length >= 4) {
      const usedF = new Set();
      const pairs = [];
      for (const tEl of tBtnsRaw) {
        const tr = getEffectiveRect(tEl);
        let bestF = null;
        let bestDy = 28;
        for (const fEl of fBtnsRaw) {
          if (usedF.has(fEl)) continue;
          const dy = Math.abs(getEffectiveRect(fEl).top - tr.top);
          if (dy <= bestDy) {
            bestDy = dy;
            bestF = fEl;
          }
        }
        if (bestF) {
          usedF.add(bestF);
          pairs.push({
            top: tr.top,
            trueBtn: getInteractiveTarget(tEl),
            falseBtn: getInteractiveTarget(bestF)
          });
        }
      }

      pairs.sort((a, b) => a.top - b.top);

      if (pairs.length >= 5) {
        const p0 = pairs[0];
        const lca0 = findLCA(p0.trueBtn, p0.falseBtn);
        const txt0 = lca0
          ? getText(lca0).replace(/(Mệnh đề|Nội dung|Phát biểu|Câu hỏi|Đúng|Sai|Ý|Đ|S)/gi, "").trim()
          : "";
        if (txt0.length < 4) {
          pairs.shift();
        }
      }

      if (pairs.length >= 4) {
        const picked = pairs.slice(0, 4);
        const allBtns = picked.flatMap((p) => [p.trueBtn, p.falseBtn]);
        const rowsData = picked.map((p) => {
          const rowEl = findRowForPair(p.trueBtn, p.falseBtn, allBtns, root);
          return { rowEl, trueBtn: p.trueBtn, falseBtn: p.falseBtn, excludeEls: [p.trueBtn, p.falseBtn] };
        });
        return {
          trueBtns: picked.map((p) => p.trueBtn),
          falseBtns: picked.map((p) => p.falseBtn),
          statements: extractTFStatementsFromRows(rowsData),
          rowEls: rowsData.map((d) => d.rowEl),
          rowExcludeEls: rowsData.map((d) => d.excludeEls),
          containerEl: findCommonAncestorOfList(allBtns)
        };
      }
    }

    // Chiến lược C: 8 radio inputs (4 hàng x 2 cột), lọc trùng Ant Design
    const radios = dedupeNestedControls(
      Array.from(
        root.querySelectorAll?.('input[type="radio"], [role="radio"], .ant-radio, .mat-radio-button') || []
      ).filter((e) => {
        if (isInsideNavOrChrome(e) || isHiddenElement(e)) return false;
        const r = getEffectiveRect(e);
        return r.width > 0 && r.height > 0;
      })
    );

    if (radios.length === 8) {
      const sorted = radios.slice().sort((a, b) => {
        const dy = getEffectiveRect(a).top - getEffectiveRect(b).top;
        if (Math.abs(dy) > 15) return dy;
        return getEffectiveRect(a).left - getEffectiveRect(b).left;
      });
      const picked = [];
      for (let i = 0; i < 4; i++) {
        const a = sorted[i * 2];
        const b = sorted[i * 2 + 1];
        const [tBtn, fBtn] = getEffectiveRect(a).left <= getEffectiveRect(b).left ? [a, b] : [b, a];
        picked.push({ trueBtn: tBtn, falseBtn: fBtn });
      }
      const allBtns = picked.flatMap((p) => [p.trueBtn, p.falseBtn]);
      const rowsData = picked.map((p) => ({
        rowEl: findRowForPair(p.trueBtn, p.falseBtn, allBtns, root),
        trueBtn: p.trueBtn,
        falseBtn: p.falseBtn,
        excludeEls: [p.trueBtn, p.falseBtn]
      }));
      return {
        trueBtns: picked.map((p) => p.trueBtn),
        falseBtns: picked.map((p) => p.falseBtn),
        statements: extractTFStatementsFromRows(rowsData),
        rowEls: rowsData.map((d) => d.rowEl),
        rowExcludeEls: rowsData.map((d) => d.excludeEls),
        containerEl: findCommonAncestorOfList(allBtns)
      };
    }

    return null;
  }

  function findLCA(a, b) {
    if (!a || !b) return a || b;
    let cur = a;
    while (cur && cur.nodeType === 1) {
      if (cur === b || (typeof cur.contains === "function" && cur.contains(b))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function findCommonAncestorOfList(els) {
    if (!els || els.length === 0) return null;
    let cur = els[0];
    while (cur && cur.nodeType === 1) {
      if (els.every((el) => cur === el || (typeof cur.contains === "function" && cur.contains(el)))) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findRowForPair(tBtn, fBtn, allBtns, root) {
    const lca = findLCA(tBtn, fBtn);
    if (!lca) return tBtn.parentElement || tBtn;
    let cur = lca;
    let best = lca;
    while (cur && cur !== root && cur.tagName?.toLowerCase() !== "body") {
      const p = cur.parentElement;
      if (!p || p === root || p.tagName?.toLowerCase() === "body") break;
      const otherBtns = allBtns.filter((x) => x !== tBtn && x !== fBtn);
      if (containsAny(p, otherBtns)) {
        best = cur;
        break;
      }
      cur = p;
      best = cur;
    }
    return best;
  }

  function sanitizeChoiceText(rawText, letter) {
    if (!rawText) return "";
    return rawText
      .replace(/Đáp án của bạn\s*/gi, "")
      .replace(/Đáp án đúng\s*/gi, "")
      .replace(new RegExp(`^\\(?${letter}\\)?[\\.\\)\\:\\s]+`), "")
      .replace(new RegExp(`^${letter}(?=[A-ZÀ-Ỹ0-9$\\[])`), "")
      .trim();
  }

  function isValidReadingOrder(rects) {
    for (let i = 1; i < rects.length; i++) {
      const prev = rects[i - 1];
      const curr = rects[i];
      const sameRow = Math.abs(curr.top - prev.top) <= 24;
      if (sameRow) {
        if (curr.left <= prev.left + 8) return false;
      } else {
        if (curr.top < prev.top - 10) return false;
      }
    }
    return true;
  }

  function findDistinctRowEls(els, root) {
    return els.map((b, i) => {
      let cur = b;
      let row = b.parentElement || b;
      while (cur && cur !== root && cur.tagName?.toLowerCase() !== "body") {
        const p = cur.parentElement;
        if (
          !p ||
          p === root ||
          p.tagName?.toLowerCase() === "body" ||
          els.some((o, oi) => oi !== i && typeof p.contains === "function" && p.contains(o))
        ) {
          row = cur;
          break;
        }
        cur = p;
        row = cur;
      }
      return row;
    });
  }

  function scoreAndBuildMCQ(badges, rows, rects, isBadgeTier, rowTextCache = null) {
    const letters = ["A", "B", "C", "D"];
    let score = 0;

    const parents = rows.map((r) => r.parentElement);
    if (parents[0] && parents.every((p) => p === parents[0])) score += 50;
    if (badges.every((b) => b.tagName === badges[0].tagName)) score += 25;

    const sameLeftCount = rects.filter((r) => Math.abs(r.left - rects[0].left) <= 18).length;
    if (sameLeftCount === 4) score += 25;
    else if (Math.abs(rects[0].left - rects[2].left) <= 18 && Math.abs(rects[1].left - rects[3].left) <= 18) {
      score += 20;
    }

    const texts = rows.map((r, i) => {
      let cached = rowTextCache ? rowTextCache.get(r) : null;
      if (!cached) {
        cached = {
          serialized: serializeAcademicDOM(r),
          plain: getFastText(r).trim()
        };
        if (rowTextCache) rowTextCache.set(r, cached);
      }
      return sanitizeChoiceText(cached.serialized, letters[i]);
    });
    const nonEmpty = texts.filter((t) => t.length > 0).length;

    if (
      isBadgeTier &&
      nonEmpty === 0 &&
      badges.some(
        (b) =>
          !/^(button|label)$/i.test(b.tagName || "") &&
          getFastText(b.parentElement).trim().length > 20 &&
          !b.parentElement?.querySelector?.('input, [role="radio"]')
      )
    ) {
      return null;
    }

    for (let i = 0; i < 4; i++) {
      const rr = getEffectiveRect(rows[i]);
      const br = rects[i];
      const rowTxt = rowTextCache ? rowTextCache.get(rows[i]).plain : getFastText(rows[i]).trim();
      const bTxt = getFastText(badges[i]).trim();

      if (isBadgeTier) {
        if (rr.width === 0 || br.left - rr.left <= 120) score += 15;
        if (bTxt && rowTxt.startsWith(bTxt)) score += 15;
        else if (rowTxt.length > bTxt.length + 10) score -= 15;
      }

      if (rr.height > 420) score -= 40;
      const qMatches = rowTxt.match(/Câu\s+\d+/gi);
      if (qMatches && qMatches.length >= 2) score -= 50;
    }

    score += nonEmpty * 8;
    score += Math.min(20, Math.max(0, rects[0].top) / 50);

    return {
      score,
      choices: badges.map((b, i) => ({
        letter: letters[i],
        badgeEl: b,
        rowEl: rows[i],
        text: texts[i]
      }))
    };
  }

  function isInsideMathContainer(el) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const tag = (cur.tagName || "").toLowerCase();
      if (tag === "mjx-container") return true;
      const cls = String(cur.className || "");
      if (/\b(katex|MathJax)\b/i.test(cls)) return true;
      if (tag === "body" || tag === "html") break;
      cur = cur.parentElement;
    }
    return false;
  }

  function findMCQ(root = document, _ignoreTop = true) {
    // TẦNG 1: Lọc nhanh text A/B/C/D trước khi kiểm tra math/nav/hidden/rect
    const map = { A: [], B: [], C: [], D: [] };
    const nodes = root.querySelectorAll?.("span, div, b, strong, label, button, p") || [];

    for (const el of nodes) {
      if (el.children && el.children.length > 2) continue;
      const raw = getFastText(el).trim();
      if (raw.length === 0 || raw.length > 5) continue;
      const m = raw.match(/^\(?([A-D])\)?[\.\)\:]?$/);
      if (!m) continue;
      if (isInsideMathContainer(el) || isHiddenElement(el) || isInsideNavOrChrome(el)) continue;
      const r = getEffectiveRect(el);
      if (r.width < 6 || r.height < 10 || r.width > 115 || r.height > 90) {
        continue;
      }
      map[m[1]].push(el);
    }

    const rowTextCache = new WeakMap();

    if (map.A.length && map.B.length && map.C.length && map.D.length) {
      const lim = (arr) => (arr.length <= 8 ? arr : [...arr.slice(0, 5), ...arr.slice(-3)]);
      const cA = lim(map.A);
      const cB = lim(map.B);
      const cC = lim(map.C);
      const cD = lim(map.D);

      let bestChoiceSet = null;
      let bestScore = -Infinity;

      for (const bA of cA) {
        for (const bB of cB) {
          for (const bC of cC) {
            for (const bD of cD) {
              const badges = [bA, bB, bC, bD];
              const rects = badges.map(getEffectiveRect);
              if (!isValidReadingOrder(rects)) continue;

              const rows = findDistinctRowEls(badges, root);
              if (
                rows.some(
                  (row) =>
                    row === root ||
                    (row.tagName || "").toLowerCase() === "body" ||
                    (row.tagName || "").toLowerCase() === "html"
                )
              ) {
                continue;
              }

              const scored = scoreAndBuildMCQ(badges, rows, rects, true, rowTextCache);
              if (scored && scored.score > bestScore) {
                bestScore = scored.score;
                bestChoiceSet = scored.choices;
              }
            }
          }
        }
      }
      if (bestChoiceSet && bestChoiceSet.length === 4) return bestChoiceSet;
    }

    // TẦNG 2: Khối đáp án viết liền "A. Nội dung" — lọc text prefix trước khi kiểm tra layout
    const inlineOptMap = { A: [], B: [], C: [], D: [] };
    const INLINE_OPT_RE = /^\(?([A-D])\)?[\.\)\:]\s+\S/;
    const rowCandidates = Array.from(root.querySelectorAll?.("div, label, li, button, p, td, span") || []);
    const matchedInline = rowCandidates.filter((el) => {
      const txt = getFastText(el).trim();
      if (txt.length < 3 || txt.length > 1200 || !INLINE_OPT_RE.test(txt)) return false;
      if (isHiddenElement(el) || isInsideNavOrChrome(el)) return false;
      const r = getEffectiveRect(el);
      return r.width >= 20 && r.height >= 12 && r.height <= 420;
    });

    const leafInline = matchedInline.filter(
      (el) => !matchedInline.some((other) => other !== el && typeof el.contains === "function" && el.contains(other))
    );
    for (const el of leafInline) {
      const m = getFastText(el).trim().match(INLINE_OPT_RE);
      if (m) inlineOptMap[m[1]].push(el);
    }

    if (inlineOptMap.A.length && inlineOptMap.B.length && inlineOptMap.C.length && inlineOptMap.D.length) {
      const lim = (arr) => (arr.length <= 6 ? arr : [...arr.slice(0, 3), ...arr.slice(-3)]);
      let bestSet = null;
      let bestScore = -Infinity;
      for (const rA of lim(inlineOptMap.A)) {
        for (const rB of lim(inlineOptMap.B)) {
          for (const rC of lim(inlineOptMap.C)) {
            for (const rD of lim(inlineOptMap.D)) {
              const rows = [rA, rB, rC, rD];
              const rects = rows.map(getEffectiveRect);
              if (!isValidReadingOrder(rects)) continue;
              const scored = scoreAndBuildMCQ(rows, rows, rects, false, rowTextCache);
              if (scored && scored.score > bestScore) {
                bestScore = scored.score;
                bestSet = scored.choices;
              }
            }
          }
        }
      }
      if (bestSet && bestSet.length === 4) return bestSet;
    }

    // TẦNG 3: 4 nút radio không gắn chữ cái A, B, C, D
    const radios4 = dedupeNestedControls(
      Array.from(root.querySelectorAll?.('input[type="radio"], [role="radio"], .ant-radio, .mat-radio-button') || []).filter(
        (e) => {
          if (isInsideNavOrChrome(e) || isHiddenElement(e)) return false;
          const r = getEffectiveRect(e);
          return r.width > 0 && r.height > 0;
        }
      )
    );

    if (radios4.length === 4) {
      const sorted = radios4.slice().sort((a, b) => {
        const ra = getEffectiveRect(a);
        const rb = getEffectiveRect(b);
        if (Math.abs(ra.top - rb.top) > 18) return ra.top - rb.top;
        return ra.left - rb.left;
      });
      const rows = findDistinctRowEls(sorted, root);
      const letters = ["A", "B", "C", "D"];
      return sorted.map((rad, i) => ({
        letter: letters[i],
        badgeEl: rad,
        rowEl: rows[i],
        text: sanitizeChoiceText(serializeAcademicDOM(rows[i]), letters[i])
      }));
    }

    return [];
  }

  function findShort(root = document, _ignoreTop = true) {
    const inputs = Array.from(
      root.querySelectorAll?.('input[type="text"], input[type="number"], input[type="tel"], input:not([type]), textarea') || []
    );
    return (
      inputs.find((el) => {
        if (el.disabled || el.readOnly) return false;
        const tp = String(el.type || "").toLowerCase();
        if (["hidden", "checkbox", "radio", "submit", "button", "search"].includes(tp)) return false;
        if (isInsideNavOrChrome(el) || isHiddenElement(el)) return false;
        const r = safeRect(el);
        const ph = (el.placeholder || "").toLowerCase();
        const aria = (el.getAttribute?.("aria-label") || "").toLowerCase();
        if (/(tìm|search|mật khẩu|password|nhảy câu|số câu|ghi chú)/i.test(`${ph} ${aria}`)) return false;
        if (el.getAttribute?.("min") === "1" && el.getAttribute?.("max") === "150") return false;
        return r.width >= 28 && r.height >= 16;
      }) || null
    );
  }

  function classifyQuestionInScope(root = document, ignoreTop = true) {
    const tf = findTF(root, ignoreTop);
    if (tf) {
      return { type: "TRUE_FALSE", shortInp: null, tf, mcq: [] };
    }
    const mcq = findMCQ(root, ignoreTop);
    if (mcq.length === 4) {
      return { type: "MCQ", shortInp: null, tf: null, mcq };
    }
    const shortInp = findShort(root, ignoreTop);
    if (shortInp) {
      return { type: "SHORT_ANSWER", shortInp, tf: null, mcq: [] };
    }
    return { type: null, shortInp: null, tf: null, mcq: [] };
  }

  // =========================================================================
  // 5. TRÍCH XUẤT TOÀN DIỆN ĐỀ BÀI, NGỮ CẢNH & MÔ TẢ ẢNH 3 LỚP
  // =========================================================================
  function isPassageSibling(sib, cur) {
    if (!sib || sib === cur || isHiddenElement(sib) || isNavPanelContainer(sib)) return false;
    const vw = globalScope.innerWidth || 1280;
    const minW = Math.min(180, Math.floor(vw * 0.55));
    const sr = safeRect(sib);
    const cr = safeRect(cur);
    if (sr.width < minW || sr.height < 60) return false;
    if (getText(sib).trim().length < 120) return false;
    return sr.right <= cr.left + 40 || sr.bottom <= cr.top + 80;
  }

  function findQuestionContainer(scopeRoot, classified) {
    if (scopeRoot !== document && scopeRoot.nodeType === 1) return scopeRoot;

    let anchors = [];
    if (classified.type === "MCQ") anchors = classified.mcq.map((c) => c.rowEl);
    else if (classified.type === "TRUE_FALSE") anchors = [...classified.tf.trueBtns, ...classified.tf.falseBtns];
    else if (classified.type === "SHORT_ANSWER" && classified.shortInp) anchors = [classified.shortInp];

    const lca = findCommonAncestorOfList(anchors);
    if (!lca) return document.body;

    const anchorSet = new Set(anchors);
    let cur = lca;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const p = cur.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      if (isNavPanelContainer(p)) break;

      const childArr = Array.from(p.children || []);
      const pullsInNav = childArr.some((ch) => ch !== cur && isNavPanelContainer(ch));
      if (pullsInNav) break;

      // Nếu khối hiện tại đã chứa đề bài (ngoài các đáp án) thì dừng lại trước khi nuốt mất khung Đoạn văn ngữ cảnh đặt cạnh/trên
      const hasOwnStem = serializeAcademicDOM(cur, { excludeNodes: anchorSet }).trim().length >= 12;
      if (hasOwnStem && childArr.some((ch) => isPassageSibling(ch, cur))) {
        break;
      }

      cur = p;
    }
    return cur || lca;
  }

  function findContextPassageElements(questionContainer) {
    if (!questionContainer || !questionContainer.parentElement) return [];
    const vw = globalScope.innerWidth || 1280;
    const minW = Math.min(180, Math.floor(vw * 0.55));
    const qRect = safeRect(questionContainer);
    const siblings = Array.from(questionContainer.parentElement.children || []);
    const candidates = [];

    for (const sib of siblings) {
      if (sib === questionContainer || isHiddenElement(sib) || isNavPanelContainer(sib)) continue;
      const sr = safeRect(sib);
      if (sr.width < minW || sr.height < 60) continue;
      const rawTxt = getText(sib).trim();
      if (rawTxt.length < 120) continue;
      const isLeftOrTopPane = sr.right <= qRect.left + 40 || sr.bottom <= qRect.top + 80;
      if (isLeftOrTopPane) {
        candidates.push(sib);
      }
    }
    return candidates;
  }

  function extractContextPassage(questionContainer, collectVisuals = null) {
    const candidates = findContextPassageElements(questionContainer);
    if (candidates.length === 0) return "";
    return candidates
      .map((c) => serializeAcademicDOM(c, { collectVisuals }))
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 5500);
  }

  function formatIndexedLabel(baseLabel, idx, total) {
    return total <= 1 ? `[${baseLabel}]` : `[${baseLabel} #${idx + 1}]`;
  }

  function buildVisualDescriptors(stemVisuals, contextVisuals, choiceVisualGroups, tfVisualGroups) {
    const descriptors = [];
    let counter = 0;
    const pushList = (list, baseLabel) => {
      list.forEach((v, idx) => {
        counter += 1;
        descriptors.push({
          id: `vis_${counter}`,
          label: formatIndexedLabel(baseLabel, idx, list.length),
          type: v.type,
          sig: v.sig,
          src: v.src || "",
          w: v.w || 0,
          h: v.h || 0,
          el: v.el || null
        });
      });
    };

    pushList(contextVisuals, "Ảnh Ngữ cảnh");
    pushList(stemVisuals, "Ảnh Đề bài");
    choiceVisualGroups.forEach((grp) => pushList(grp.visuals, `Ảnh Đáp án ${grp.letter}`));
    tfVisualGroups.forEach((grp) => pushList(grp.visuals, `Ảnh Mệnh đề ${grp.letter}`));
    return descriptors;
  }

  function extractQuestionPayload(scopeRoot, classified) {
    const container = findQuestionContainer(scopeRoot, classified);
    const excludeNodes = new Set();

    if (classified.type === "MCQ") {
      classified.mcq.forEach((c) => excludeNodes.add(c.rowEl));
    } else if (classified.type === "TRUE_FALSE" && classified.tf) {
      if (classified.tf.containerEl && classified.tf.containerEl !== container) {
        excludeNodes.add(classified.tf.containerEl);
      } else {
        if (Array.isArray(classified.tf.rowEls)) {
          classified.tf.rowEls.forEach((r) => {
            if (r && r !== container) excludeNodes.add(r);
          });
        }
        classified.tf.trueBtns.forEach((b) => excludeNodes.add(b));
        classified.tf.falseBtns.forEach((b) => excludeNodes.add(b));
      }
    } else if (classified.type === "SHORT_ANSWER" && classified.shortInp) {
      excludeNodes.add(classified.shortInp);
    }

    const stemVisuals = [];
    let stemText = serializeAcademicDOM(container, { excludeNodes, collectVisuals: stemVisuals });
    stemText = stemText
      .replace(/^Câu\s+\d+\s*[:\.]?\s*/i, "")
      .replace(/Đáp án của bạn\s*/gi, "")
      .trim();

    if (stemText.length < 6 && scopeRoot === document && document.body) {
      stemText = serializeAcademicDOM(document.body, { excludeNodes, collectVisuals: stemVisuals }).slice(0, 3000);
    }

    const contextVisuals = [];
    const contextPassage = scopeRoot === document ? extractContextPassage(container, contextVisuals) : "";

    const choiceVisualGroups = [];
    const tfVisualGroups = [];

    let extraDetails = "";
    if (classified.type === "MCQ") {
      const choiceLines = classified.mcq.map((c) => {
        const cv = [];
        serializeAcademicDOM(c.rowEl, { collectVisuals: cv });
        if (cv.length > 0) choiceVisualGroups.push({ letter: c.letter, visuals: cv });
        return `${c.letter}. ${c.text}`;
      });
      extraDetails = "Các lựa chọn:\n" + choiceLines.join("\n");
    } else if (classified.type === "TRUE_FALSE" && classified.tf?.statements?.length) {
      if (Array.isArray(classified.tf.rowEls)) {
        classified.tf.rowEls.forEach((rowEl, idx) => {
          const rv = [];
          const ex = new Set(classified.tf.rowExcludeEls?.[idx] || []);
          serializeAcademicDOM(rowEl, { excludeNodes: ex, collectVisuals: rv });
          if (rv.length > 0) tfVisualGroups.push({ letter: String.fromCharCode(97 + idx), visuals: rv });
        });
      }
      extraDetails = "4 mệnh đề cần xét Đúng/Sai:\n" + classified.tf.statements.join("\n");
    }

    const visualDescriptors = buildVisualDescriptors(stemVisuals, contextVisuals, choiceVisualGroups, tfVisualGroups);
    const fullText = `${contextPassage}\n${stemText}\n${extraDetails}`;
    const hasUnderline = /\[GẠCH_CHÂN:/.test(fullText);
    const hasTable = /\n\|[^\n]+\|/.test(fullText) || Boolean(container.querySelector?.("table") && !classified.tf?.containerEl);

    // QUAN TRỌNG: Câu chỉ có chữ / LaTeX / gạch chân sẽ có hasVisuals = false (tiết kiệm token & không chụp ảnh thừa)
    const hasVisuals = visualDescriptors.length > 0;
    const visualSignature = visualDescriptors.map((v) => `${v.label}:${v.sig}`).join("|");

    return {
      stemText: stemText.slice(0, 5000),
      contextPassage,
      extraDetails,
      hasVisuals,
      hasUnderline,
      hasTable,
      visualSignature,
      visualDescriptors,
      containerEl: container
    };
  }

  // =========================================================================
  // 6. TRÍCH XUẤT ẢNH 3 LỚP (LỚP 1 NATIVE/INLINE -> LỚP 2 STAGE -> LỚP 3 CUỘN)
  // =========================================================================
  function resolveAbsoluteUrl(rawUrl) {
    if (!rawUrl) return "";
    if (/^(data:|blob:)/i.test(rawUrl)) return rawUrl;
    try {
      const base = globalScope.location?.href || "https://app.onluyen.vn/";
      return new URL(rawUrl, base).href;
    } catch (e) {
      return rawUrl;
    }
  }

  function isTinyOrClippedVisual(el, w, h) {
    if (!el) return false;
    if (w > 0 && h > 0 && (w < 60 || h < 45)) return true;
    const r = safeRect(el);
    const vh = globalScope.innerHeight || 800;
    if (r.height > 0 && (r.top < 42 && r.bottom > 0)) return true;
    if (r.height > 0 && (r.bottom > vh - 42 && r.top < vh)) return true;
    return false;
  }

  function parseDataImageUrl(dataUrl) {
    const m = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
    if (!m) return null;
    return { mimeType: m[1].toLowerCase(), data: m[2] };
  }

  function renderSvgToPngDataUrl(svgEl) {
    try {
      const doc = globalScope.document;
      if (!doc || typeof doc.createElement !== "function") return null;
      const r = safeRect(svgEl);
      const w = Math.max(240, Math.round(r.width || Number(svgEl.getAttribute?.("width")) || 400));
      const h = Math.max(160, Math.round(r.height || Number(svgEl.getAttribute?.("height")) || 280));
      const scale = 2;

      if (typeof globalScope.XMLSerializer === "function" && typeof globalScope.Image === "function") {
        // Khi có canvas synchronous export không cần async load (fallback kiểm tra getContext)
        const clone = svgEl.cloneNode ? svgEl.cloneNode(true) : svgEl;
        if (clone.setAttribute) {
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          clone.setAttribute("width", String(w));
          clone.setAttribute("height", String(h));
        }
        const svgStr = new globalScope.XMLSerializer().serializeToString(clone);
        return {
          svgMarkup: svgStr,
          width: w * scale,
          height: h * scale
        };
      }
    } catch (e) {}
    return null;
  }

  async function rasterizeSvgTo2xPng(svgEl) {
    const info = renderSvgToPngDataUrl(svgEl);
    if (!info || !info.svgMarkup) return null;
    const doc = globalScope.document;
    const canvas = doc?.createElement?.("canvas");
    if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.toDataURL !== "function") {
      return null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = info.width;
    canvas.height = info.height;

    if (typeof globalScope.Image !== "function") return null;
    return new Promise((resolve) => {
      try {
        const img = new globalScope.Image();
        const encoded = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(info.svgMarkup);
        const timer = setTimeout(() => resolve(null), 1500);
        img.onload = () => {
          clearTimeout(timer);
          try {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const pngUrl = canvas.toDataURL("image/png");
            resolve(parseDataImageUrl(pngUrl));
          } catch (err) {
            resolve(null);
          }
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        img.src = encoded;
      } catch (err) {
        resolve(null);
      }
    });
  }

  async function extractVisualAssetsLayer1(descriptors) {
    const inlineImages = [];
    const remoteUrls = [];
    const stageTargets = [];
    const elMap = {};

    for (const d of descriptors || []) {
      if (d.el) elMap[d.id] = d.el;

      if (d.type === "html_diagram") {
        if (d.el) {
          stageTargets.push({ id: d.id, label: d.label, el: d.el, reason: "html_diagram" });
        }
        continue;
      }

      if (d.type === "canvas" && d.el) {
        try {
          if (typeof d.el.toDataURL === "function") {
            const url = d.el.toDataURL("image/png");
            const parsed = parseDataImageUrl(url);
            if (parsed && parsed.data.length >= 8) {
              inlineImages.push({
                id: d.id,
                label: d.label,
                mimeType: parsed.mimeType,
                data: parsed.data
              });
              continue;
            }
          }
        } catch (e) {}
        stageTargets.push({ id: d.id, label: d.label, el: d.el, reason: "canvas_fallback" });
        continue;
      }

      if (d.type === "svg" && d.el) {
        const png = await rasterizeSvgTo2xPng(d.el);
        if (png) {
          inlineImages.push({
            id: d.id,
            label: d.label,
            mimeType: png.mimeType,
            data: png.data
          });
        } else {
          stageTargets.push({ id: d.id, label: d.label, el: d.el, reason: "svg_stage" });
        }
        continue;
      }

      if (d.type === "img") {
        const rawSrc = d.src || d.el?.getAttribute?.("src") || d.el?.src || "";
        if (rawSrc.startsWith("data:image/")) {
          const parsed = parseDataImageUrl(rawSrc);
          if (parsed && !isTinyOrClippedVisual(d.el, d.w, d.h)) {
            inlineImages.push({
              id: d.id,
              label: d.label,
              mimeType: parsed.mimeType,
              data: parsed.data
            });
            continue;
          }
        }
        const absUrl = resolveAbsoluteUrl(rawSrc);
        if (/^https?:\/\//i.test(absUrl) && !isTinyOrClippedVisual(d.el, d.w, d.h)) {
          remoteUrls.push({ id: d.id, label: d.label, url: absUrl });
          continue;
        }
        if (d.el) {
          stageTargets.push({ id: d.id, label: d.label, el: d.el, reason: "img_stage" });
        }
      }
    }

    return { inlineImages, remoteUrls, stageTargets, elMap };
  }

  function mountCaptureStage(targetEl, label = "") {
    const doc = globalScope.document;
    if (!doc || !doc.body || !targetEl) return null;

    const existing = doc.getElementById?.("__onluyen_capture_stage");
    if (existing && typeof existing.remove === "function") existing.remove();

    const prevScrollX = globalScope.scrollX || globalScope.pageXOffset || 0;
    const prevScrollY = globalScope.scrollY || globalScope.pageYOffset || 0;
    const prevOverflow = doc.documentElement?.style?.overflow || "";

    const stage = doc.createElement("div");
    stage.id = "__onluyen_capture_stage";
    stage.setAttribute("data-label", label);
    Object.assign(stage.style, {
      position: "fixed",
      inset: "0",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box",
      overflow: "hidden"
    });

    const badge = doc.createElement("div");
    badge.textContent = label || "Capture Stage";
    Object.assign(badge.style, {
      color: "#0f172a",
      fontSize: "14px",
      fontWeight: "700",
      marginBottom: "10px",
      fontFamily: "sans-serif"
    });
    stage.appendChild(badge);

    const frame = doc.createElement("div");
    Object.assign(frame.style, {
      width: "100%",
      maxWidth: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transformOrigin: "center center"
    });

    const clone = typeof targetEl.cloneNode === "function" ? targetEl.cloneNode(true) : targetEl;
    if (clone && clone.style) {
      clone.style.maxWidth = "100%";
      clone.style.width = "auto";
      clone.style.height = "auto";
      clone.style.margin = "0 auto";
    }

    const vw = globalScope.innerWidth || 390;
    const vh = globalScope.innerHeight || 844;
    const tr = safeRect(targetEl);
    if (tr.width > 0 && tr.height > 0) {
      const targetScale = Math.min((vw * 0.94) / tr.width, (vh * 0.78) / tr.height, 2.5);
      if (targetScale > 1.05 && frame.style) {
        frame.style.transform = `scale(${targetScale.toFixed(2)})`;
      }
    }

    frame.appendChild(clone);
    stage.appendChild(frame);
    if (doc.documentElement?.style) doc.documentElement.style.overflow = "hidden";
    doc.body.appendChild(stage);

    return {
      stageEl: stage,
      unmount() {
        try {
          if (typeof stage.remove === "function") stage.remove();
          else if (stage.parentElement) stage.parentElement.removeChild(stage);
        } catch (e) {}
        try {
          if (doc.documentElement?.style) doc.documentElement.style.overflow = prevOverflow;
          if (typeof globalScope.scrollTo === "function") {
            globalScope.scrollTo({ left: prevScrollX, top: prevScrollY, behavior: "instant" });
          }
        } catch (e) {}
      }
    };
  }

  function collectScrollFallbackZones(payload, classified) {
    const zones = [];
    const seen = new Set();
    const pushZone = (el, label) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      zones.push({ el, label });
    };

    for (const d of payload?.visualDescriptors || []) {
      if (d.el && zones.length < 3) pushZone(d.el, d.label);
    }
    if (zones.length === 0 && payload?.containerEl) {
      pushZone(payload.containerEl, "[Ảnh Toàn bộ Câu hỏi]");
    }
    if (zones.length < 3 && classified?.type === "MCQ" && classified.mcq?.length === 4) {
      pushZone(classified.mcq[0].rowEl, "[Ảnh Vùng Đáp án]");
    }
    return zones.slice(0, 3);
  }

  // =========================================================================
  // 7. NHẬN DIỆN TRẠNG THÁI ĐÁP ÁN ĐANG CHỌN TƯƠNG ĐỐI THEO NHÓM
  // =========================================================================
  function getStyleSignature(el) {
    if (!el) return "";
    const cs = safeComputedStyle(el);
    if (!cs) return "";
    const bg = String(cs.backgroundColor || "").trim();
    const bd = String(cs.borderColor || cs.borderTopColor || "").trim();
    const col = String(cs.color || "").trim();
    return `${bg}|${bd}|${col}`;
  }

  function hasExplicitCheckedAttr(el) {
    if (!el) return false;
    if (el.checked === true || el.getAttribute?.("aria-checked") === "true" || el.getAttribute?.("aria-pressed") === "true") {
      return true;
    }
    const inp = el.querySelector?.('input[type="radio"], input[type="checkbox"]');
    if (inp && inp.checked === true) return true;
    return false;
  }

  function hasExplicitActiveClass(el) {
    if (!el) return false;
    const cls = String(el.className || "");
    return /\b(active|selected|checked|is-selected|is-active|ant-radio-checked|ant-radio-wrapper-checked)\b/i.test(cls);
  }

  function findUniqueOutlierIndex(sigs) {
    if (sigs.length < 2) return -1;
    const freq = new Map();
    for (const s of sigs) freq.set(s, (freq.get(s) || 0) + 1);
    if (freq.size !== 2) return -1;
    for (let i = 0; i < sigs.length; i++) {
      if (freq.get(sigs[i]) === 1) return i;
    }
    return -1;
  }

  function detectUIAns(type, mcq, shortInp, tf) {
    if (type === "SHORT_ANSWER" && shortInp) {
      const raw = (shortInp.value || "").trim();
      if (!raw) return "";
      if (/^-?\d+([.,]\d+)?$/.test(raw)) return raw.replace(".", ",");
      return raw;
    }

    if (type === "MCQ" && mcq?.length === 4) {
      const explicitIdx = mcq.findIndex(
        (c) =>
          hasExplicitCheckedAttr(c.badgeEl) ||
          hasExplicitCheckedAttr(c.rowEl) ||
          hasExplicitActiveClass(c.badgeEl) ||
          hasExplicitActiveClass(c.rowEl) ||
          /Đáp án của bạn/i.test(getText(c.rowEl))
      );
      if (explicitIdx !== -1) {
        const allSame = mcq.every((c) => hasExplicitActiveClass(c.rowEl)) && !hasExplicitCheckedAttr(mcq[explicitIdx].rowEl);
        if (!allSame) return mcq[explicitIdx].letter;
      }

      const badgeOutlier = findUniqueOutlierIndex(mcq.map((c) => getStyleSignature(c.badgeEl)));
      if (badgeOutlier !== -1) return mcq[badgeOutlier].letter;

      const rowOutlier = findUniqueOutlierIndex(mcq.map((c) => getStyleSignature(c.rowEl)));
      if (rowOutlier !== -1) return mcq[rowOutlier].letter;

      return "";
    }

    if (type === "TRUE_FALSE" && tf?.trueBtns?.length === 4 && tf?.falseBtns?.length === 4) {
      const allBtns = [...tf.trueBtns, ...tf.falseBtns];
      const allSigs = allBtns.map(getStyleSignature);
      const sigCounts = new Map();
      for (const s of allSigs) sigCounts.set(s, (sigCounts.get(s) || 0) + 1);

      let dominantSig = "";
      let maxCount = 0;
      for (const [s, cnt] of sigCounts.entries()) {
        if (cnt > maxCount) {
          maxCount = cnt;
          dominantSig = s;
        }
      }

      const result = [];
      for (let i = 0; i < 4; i++) {
        const tBtn = tf.trueBtns[i];
        const fBtn = tf.falseBtns[i];
        const tExp = hasExplicitCheckedAttr(tBtn) || hasExplicitActiveClass(tBtn);
        const fExp = hasExplicitCheckedAttr(fBtn) || hasExplicitActiveClass(fBtn);

        if (tExp && !fExp) {
          result.push("Đ");
          continue;
        }
        if (fExp && !tExp) {
          result.push("S");
          continue;
        }

        const tSig = getStyleSignature(tBtn);
        const fSig = getStyleSignature(fBtn);
        if (tSig !== fSig && maxCount >= 4) {
          if (tSig !== dominantSig && fSig === dominantSig) {
            result.push("Đ");
            continue;
          }
          if (fSig !== dominantSig && tSig === dominantSig) {
            result.push("S");
            continue;
          }
        }
        return "";
      }
      return result.length === 4 ? result.join("-") : "";
    }

    return "";
  }

  function getMultiBlocks(root = document) {
    const map = new Map();
    const HEADER_EXACT_RE = /^(?:Câu(?:\s+hỏi)?|Question)\s+(\d+)(?:\s*\([^)]*\))?\s*[:\.\-]?$/i;
    const HEADER_PREFIX_RE = /^(?:Câu(?:\s+hỏi)?|Question)\s+(\d+)(?:\s*\([^)]*\))?\s*[:\.]/i;

    const nodes = root.querySelectorAll?.("b, strong, span, div, p, h1, h2, h3, h4, h5") || [];
    for (const el of nodes) {
      const txt = getFastText(el).trim();
      if (txt.length < 5 || txt.length > 1500 || !/^(?:Câu|Question)/i.test(txt)) continue;

      let m = txt.match(HEADER_EXACT_RE);
      if (!m && HEADER_PREFIX_RE.test(txt)) {
        const descendants = Array.from(el.querySelectorAll?.("b, strong, span, div, p, h1, h2, h3, h4, h5") || []);
        const childHasHeader = descendants.some(
          (ch) => HEADER_PREFIX_RE.test(getFastText(ch).trim()) || HEADER_EXACT_RE.test(getFastText(ch).trim())
        );
        if (!childHasHeader) {
          m = txt.match(HEADER_PREFIX_RE);
        }
      }

      if (m) {
        if (isHiddenElement(el) || isInsideNavOrChrome(el)) continue;
        const r = getEffectiveRect(el);
        if (r.width === 0 || r.height === 0) continue;
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 200 && !map.has(n)) {
          map.set(n, el);
        }
      }
    }

    if (map.size < 2) return [];

    const headers = Array.from(map.keys())
      .sort((a, b) => a - b)
      .map((n) => ({ qNum: n, headerEl: map.get(n) }));

    return headers.map((item, idx) => {
      let cur = item.headerEl;
      let block = cur.parentElement || cur;
      while (cur && cur !== root && (cur.tagName || "").toLowerCase() !== "body") {
        const p = cur.parentElement;
        if (
          !p ||
          p === root ||
          (p.tagName || "").toLowerCase() === "body" ||
          headers.some((o, oi) => oi !== idx && typeof p.contains === "function" && p.contains(o.headerEl))
        ) {
          block = cur;
          break;
        }
        cur = p;
        block = cur;
      }
      return { qNum: item.qNum, blockEl: block };
    });
  }

  const api = {
    beginScanCache,
    endScanCache,
    mathMLToLatex,
    serializeAcademicDOM,
    getEffectiveRect,
    dedupeNestedControls,
    isNavPanelContainer,
    isInsideNavOrChrome,
    findTF,
    findMCQ,
    findShort,
    getMultiBlocks,
    classifyQuestionInScope,
    extractQuestionPayload,
    extractVisualAssetsLayer1,
    mountCaptureStage,
    collectScrollFallbackZones,
    detectUIAns,
    sanitizeChoiceText,
    DEFAULT_BG_SET
  };

  globalScope.__OnLuyenExtractor = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
