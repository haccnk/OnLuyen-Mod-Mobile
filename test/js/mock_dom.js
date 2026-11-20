// Pure Node.js lightweight DOM mock supporting querySelectorAll, rects, styles, cloning, and scroll tracking.

class MockElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = String(tagName || "div").toUpperCase();
    this.localName = this.tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.style = {};
    this._computedStyle = null;
    this._rect = { top: 100, left: 20, width: 320, height: 36 };
    this._listeners = new Map();
    this.id = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.checked = false;
    this.value = "";
    this.type = "";
    this.placeholder = "";
    this.src = "";
    this.alt = "";
    this.width = 0;
    this.height = 0;
    this.clickCount = 0;
    this.scrollIntoViewCalls = [];
    this._toDataURL = null;
  }

  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }

  get isContentEditable() {
    return this.getAttribute("contenteditable") === "true";
  }

  get textContent() {
    return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join("");
  }

  set textContent(v) {
    this.childNodes = [];
    if (v !== null && v !== undefined && String(v) !== "") {
      this.childNodes.push({ nodeType: 3, nodeValue: String(v), parentElement: this });
    }
  }

  get innerText() {
    if (this._innerText !== undefined) return this._innerText;
    return this.textContent;
  }

  set innerText(v) {
    this._innerText = v;
    this.textContent = v;
  }

  appendChild(child) {
    if (!child) return child;
    if (typeof child === "string") {
      child = { nodeType: 3, nodeValue: child, parentElement: this };
    } else {
      child.parentElement = this;
    }
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
    }
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  setAttribute(name, value) {
    const k = String(name);
    const v = String(value);
    this.attributes.set(k, v);
    if (k === "id") this.id = v;
    else if (k === "class") this.className = v;
    else if (k === "type") this.type = v;
    else if (k === "placeholder") this.placeholder = v;
    else if (k === "src") this.src = v;
    else if (k === "alt") this.alt = v;
    else if (k === "width") this.width = Number(v) || 0;
    else if (k === "height") this.height = Number(v) || 0;
  }

  getAttribute(name) {
    const k = String(name);
    if (k === "id" && this.id) return this.id;
    if (k === "class" && this.className) return this.className;
    if (k === "type" && this.type) return this.type;
    if (k === "placeholder" && this.placeholder) return this.placeholder;
    if (k === "src" && this.src) return this.src;
    if (k === "alt" && this.alt) return this.alt;
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  setRect(r) {
    this._rect = {
      top: r.top ?? 0,
      left: r.left ?? 0,
      width: r.width ?? 0,
      height: r.height ?? 0,
      right: r.right ?? (r.left ?? 0) + (r.width ?? 0),
      bottom: r.bottom ?? (r.top ?? 0) + (r.height ?? 0)
    };
    return this;
  }

  getBoundingClientRect() {
    return {
      ...this._rect,
      right: this._rect.right ?? this._rect.left + this._rect.width,
      bottom: this._rect.bottom ?? this._rect.top + this._rect.height
    };
  }

  setComputedStyle(cs) {
    this._computedStyle = { ...(this._computedStyle || {}), ...cs };
    return this;
  }

  contains(other) {
    if (!other) return false;
    if (this === other) return true;
    for (const ch of this.childNodes) {
      if (ch === other) return true;
      if (ch.nodeType === 1 && ch.contains(other)) return true;
    }
    return false;
  }

  closest(selector) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchesSimpleSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selectorString) {
    const selectors = String(selectorString || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const out = [];
    const visit = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1) {
          if (selectors.some((sel) => matchesSelectorChain(ch, sel))) {
            out.push(ch);
          }
          visit(ch);
        }
      }
    };
    visit(this);
    return out;
  }

  querySelector(selectorString) {
    return this.querySelectorAll(selectorString)[0] || null;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  dispatchEvent(evt) {
    const type = evt?.type;
    if (!type) return true;
    const list = this._listeners.get(type) || [];
    for (const fn of list) fn(evt);
    if (evt.bubbles && this.parentElement) {
      this.parentElement.dispatchEvent(evt);
    }
    return true;
  }

  click() {
    this.clickCount += 1;
    this.dispatchEvent({ type: "click", bubbles: true, target: this });
  }

  focus() {}
  blur() {}

  scrollIntoView(opts) {
    this.scrollIntoViewCalls.push(opts || true);
  }

  toDataURL(mime = "image/png") {
    if (typeof this._toDataURL === "function") return this._toDataURL(mime);
    if (typeof this._toDataURL === "string") return this._toDataURL;
    throw new Error("SecurityError: tainted canvas");
  }

  cloneNode(deep = false) {
    const copy = new MockElement(this.tagName, this.ownerDocument);
    copy.id = this.id;
    copy.className = this.className;
    copy.style = { ...this.style };
    copy._computedStyle = this._computedStyle ? { ...this._computedStyle } : null;
    copy._rect = { ...this._rect };
    copy.src = this.src;
    copy.alt = this.alt;
    copy.width = this.width;
    copy.height = this.height;
    for (const [k, v] of this.attributes.entries()) copy.attributes.set(k, v);
    if (deep) {
      for (const ch of this.childNodes) {
        if (ch.nodeType === 3) {
          copy.appendChild(ch.nodeValue);
        } else if (ch.nodeType === 1) {
          copy.appendChild(ch.cloneNode(true));
        }
      }
    }
    return copy;
  }
}

function matchesSelectorChain(el, chain) {
  const parts = chain.trim().split(/\s+/);
  if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false;
  if (parts.length === 1) return true;
  let cur = el.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cur && !matchesSimpleSelector(cur, parts[i])) {
      cur = cur.parentElement;
    }
    if (!cur) return false;
    cur = cur.parentElement;
  }
  return true;
}

function matchesSimpleSelector(el, sel) {
  if (!el || el.nodeType !== 1 || !sel) return false;
  let rest = sel.trim();

  // :not(...) first so nested [attr] inside :not() is not treated as positive filter
  const notMatches = [];
  rest = rest.replace(/:not\(([^)]+)\)/g, (_, inner) => {
    notMatches.push(inner);
    return "";
  });

  // Attribute filters (= and *=)
  const attrMatches = [];
  rest = rest.replace(/\[([^\]]+)\]/g, (_, inner) => {
    attrMatches.push(inner);
    return "";
  });

  // Class filters
  const classMatches = [];
  rest = rest.replace(/\.([a-zA-Z0-9_-]+)/g, (_, cls) => {
    classMatches.push(cls);
    return "";
  });

  // Id filter
  let idTarget = null;
  rest = rest.replace(/#([a-zA-Z0-9_-]+)/g, (_, id) => {
    idTarget = id;
    return "";
  });

  // Tag
  if (rest && rest !== "*") {
    if (el.localName !== rest.toLowerCase()) return false;
  }
  if (idTarget && el.id !== idTarget) return false;

  const clsTokens = String(el.className || "").split(/\s+/).filter(Boolean);
  for (const c of classMatches) {
    if (!clsTokens.includes(c)) return false;
  }

  for (const attrExpr of attrMatches) {
    const containsIdx = attrExpr.indexOf("*=");
    if (containsIdx !== -1) {
      const name = attrExpr.slice(0, containsIdx).trim();
      const expected = attrExpr.slice(containsIdx + 2).trim().replace(/^["']|["']$/g, "");
      const actual = el.getAttribute(name) || "";
      if (!actual.includes(expected)) return false;
      continue;
    }
    const eqIdx = attrExpr.indexOf("=");
    if (eqIdx === -1) {
      if (el.getAttribute(attrExpr.trim()) === null) return false;
    } else {
      const name = attrExpr.slice(0, eqIdx).trim();
      const expected = attrExpr.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      const actual = el.getAttribute(name);
      if (actual !== expected) return false;
    }
  }

  for (const neg of notMatches) {
    if (matchesSimpleSelector(el, neg)) return false;
  }

  return true;
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html", this);
    this.body = new MockElement("body", this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this.documentElement.querySelector(`#${id}`);
  }

  querySelectorAll(sel) {
    return this.documentElement.querySelectorAll(sel);
  }

  querySelector(sel) {
    return this.documentElement.querySelector(sel);
  }
}

function createTestEnvironment({ innerWidth = 1280, innerHeight = 800, url = "https://app.onluyen.vn/practice/123" } = {}) {
  const doc = new MockDocument();
  const scrollState = { x: 0, y: 0 };
  const parsedUrl = new URL(url);

  const env = {
    document: doc,
    innerWidth,
    innerHeight,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    location: {
      href: parsedUrl.href,
      pathname: parsedUrl.pathname,
      hash: parsedUrl.hash,
      search: parsedUrl.search
    },
    scrollTo(opts) {
      if (typeof opts === "object" && opts !== null) {
        scrollState.x = opts.left ?? scrollState.x;
        scrollState.y = opts.top ?? scrollState.y;
      }
      env.scrollX = scrollState.x;
      env.scrollY = scrollState.y;
      env.pageXOffset = scrollState.x;
      env.pageYOffset = scrollState.y;
    },
    getComputedStyle(el, pseudo = null) {
      if (pseudo) {
        return (el._pseudoStyles && el._pseudoStyles[pseudo]) || {};
      }
      return el._computedStyle || el.style || {};
    },
    requestAnimationFrame(cb) {
      return setTimeout(() => cb(Date.now()), 5);
    },
    XMLSerializer: class {
      serializeToString(node) {
        return `<${node.localName} width="${node.width || 300}" height="${node.height || 200}">${node.textContent || ""}</${node.localName}>`;
      }
    },
    HTMLInputElement: MockElement,
    HTMLTextAreaElement: MockElement,
    Event: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
      }
    },
    InputEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
        this.data = init.data;
      }
    },
    KeyboardEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
        this.key = init.key;
      }
    },
    MouseEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
      }
    },
    PointerEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        this.bubbles = Boolean(init.bubbles);
      }
    }
  };

  return { doc, env, scrollState };
}

function el(doc, tag, opts = {}, children = []) {
  const node = doc.createElement(tag);
  if (opts.id) node.setAttribute("id", opts.id);
  if (opts.className) node.setAttribute("class", opts.className);
  if (opts.type) node.setAttribute("type", opts.type);
  if (opts.placeholder) node.setAttribute("placeholder", opts.placeholder);
  if (opts.src) node.setAttribute("src", opts.src);
  if (opts.alt) node.setAttribute("alt", opts.alt);
  if (opts.width) node.width = opts.width;
  if (opts.height) node.height = opts.height;
  if (opts.value !== undefined) node.value = opts.value;
  if (opts.checked !== undefined) node.checked = opts.checked;
  if (opts.style) Object.assign(node.style, opts.style);
  if (opts.cs) node.setComputedStyle(opts.cs);
  if (opts.pseudo) node._pseudoStyles = opts.pseudo;
  if (opts.rect) node.setRect(opts.rect);
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const ch of children) {
    if (typeof ch === "string") node.appendChild(ch);
    else if (ch) node.appendChild(ch);
  }
  return node;
}

module.exports = {
  MockElement,
  MockDocument,
  createTestEnvironment,
  el
};
