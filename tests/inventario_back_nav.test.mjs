import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BACK_NAV_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');
const INV_HTML_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
const INV_SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario-sw.js'), 'utf8');
const INV_UI_CSS_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario-ui.css'), 'utf8');
const MODULES_CSS_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creata-modules.css'), 'utf8');
const INV_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
const SEG_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-app.js'), 'utf8');
const HIST_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'historial-app.js'), 'utf8');

function createFakeClock(startMs = 1_730_000_000_000) {
  let nowMs = startMs;
  let nextId = 1;
  const timers = new Map();

  function setTimer(fn, delayMs = 0) {
    const id = nextId++;
    timers.set(id, { fn, runAt: nowMs + Math.max(0, Number(delayMs) || 0) });
    return id;
  }

  function clearTimer(id) {
    timers.delete(id);
  }

  function advanceTime(ms) {
    const target = nowMs + Math.max(0, Number(ms) || 0);
    while (true) {
      let nextEntry = null;
      for (const [id, entry] of timers.entries()) {
        if (entry.runAt <= target && (!nextEntry || entry.runAt < nextEntry.entry.runAt)) {
          nextEntry = { id, entry };
        }
      }
      if (!nextEntry) break;
      timers.delete(nextEntry.id);
      nowMs = nextEntry.entry.runAt;
      nextEntry.entry.fn();
    }
    nowMs = target;
  }

  return { now: () => nowMs, setTimer, clearTimer, advanceTime };
}

function createClassList(initial = []) {
  const set = new Set(initial.filter(Boolean));
  return {
    add(...names) {
      for (const n of names) if (n) set.add(String(n));
    },
    remove(...names) {
      for (const n of names) if (n) set.delete(String(n));
    },
    toggle(name, force) {
      const k = String(name);
      if (force === undefined) {
        if (set.has(k)) { set.delete(k); return false; }
        set.add(k); return true;
      }
      if (force) { set.add(k); return true; }
      set.delete(k); return false;
    },
    contains(name) {
      return set.has(String(name));
    },
    toString() {
      return Array.from(set).join(' ');
    }
  };
}

function createMockElement(tagName, id = '', initialClasses = [], ownerDoc = null) {
  const attrs = new Map();
  if (id) attrs.set('id', id);
  const listeners = new Map();
  const children = [];
  const dataset = {};
  const classList = createClassList(initialClasses);
  let _innerHTML = '';
  let _textContent = '';
  let _value = '';
  let focusCalls = 0;

  const el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    nodeName: String(tagName || 'DIV').toUpperCase(),
    get id() { return attrs.get('id') || ''; },
    set id(v) {
      attrs.set('id', String(v || ''));
      if (ownerDoc && v) ownerDoc._registerId(String(v), el);
    },
    get className() { return classList.toString(); },
    set className(v) {
      const next = String(v || '').split(/\s+/).filter(Boolean);
      const cur = classList.toString().split(/\s+/).filter(Boolean);
      for (const c of cur) classList.remove(c);
      for (const n of next) classList.add(n);
    },
    classList,
    dataset,
    style: {
      setProperty(k, v) { this[k] = String(v); },
      removeProperty(k) { delete this[k]; }
    },
    children,
    parentNode: null,
    options: [],
    files: [],
    checked: false,
    disabled: false,
    scrollTop: 0,
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 390,
    clientHeight: 844,
    get value() { return _value; },
    set value(v) { _value = v === null || v === undefined ? '' : String(v); },
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = v === null || v === undefined ? '' : String(v); },
    get innerHTML() { return _innerHTML; },
    set innerHTML(html) {
      _innerHTML = String(html || '');
      children.length = 0;
      if (ownerDoc && _innerHTML) {
        // Parse elements with id="..." or key data-* attributes into lightweight child registry
        const tagRe = /<(div|section|header|main|input|select|button|span|table|tbody|ul|li|h1|h2|textarea|p|form|iframe)\b([^>]*)>/gi;
        let m;
        while ((m = tagRe.exec(_innerHTML)) !== null) {
          const tName = m[1];
          const attrStr = m[2] || '';
          const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrStr);
          const clsMatch = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrStr);
          const classes = clsMatch ? clsMatch[1].split(/\s+/).filter(Boolean) : [];
          const child = createMockElement(tName, idMatch ? idMatch[1] : '', classes, ownerDoc);
          const dataRe = /\b(data-[a-z0-9-]+|type|value|src|href)\s*=\s*["']([^"']*)["']/gi;
          let dm;
          while ((dm = dataRe.exec(attrStr)) !== null) {
            child.setAttribute(dm[1], dm[2]);
            if (dm[1] === 'value') child.value = dm[2];
          }
          if (tName.toLowerCase() === 'select') {
            // Find default first option value
            const afterIdx = m.index + m[0].length;
            const closeIdx = _innerHTML.indexOf('</select>', afterIdx);
            const slice = closeIdx > afterIdx ? _innerHTML.slice(afterIdx, closeIdx) : '';
            const optRe = /<option\b[^>]*value\s*=\s*["']([^"']*)["'][^>]*>/gi;
            let om;
            const opts = [];
            while ((om = optRe.exec(slice)) !== null) {
              opts.push({ value: om[1] });
            }
            child.options = opts;
            if (opts.length > 0) child.value = opts[0].value;
          }
          el.appendChild(child);
        }
      }
    },
    get focusCalls() { return focusCalls; },
    focus() { focusCalls++; },
    blur() {},
    select() {},
    scrollTo() {},
    scrollIntoView() {},
    setAttribute(k, v) {
      const key = String(k);
      const val = String(v);
      attrs.set(key, val);
      if (key === 'id' && ownerDoc) ownerDoc._registerId(val, el);
      if (key.startsWith('data-')) {
        const camel = key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        dataset[camel] = val;
      }
      if (key === 'src') el._src = val;
    },
    getAttribute(k) {
      return attrs.has(String(k)) ? attrs.get(String(k)) : null;
    },
    removeAttribute(k) {
      attrs.delete(String(k));
    },
    appendChild(child) {
      if (!child) return child;
      child.parentNode = el;
      children.push(child);
      if (ownerDoc && child.id) ownerDoc._registerId(child.id, child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
      if (child) child.parentNode = null;
      return child;
    },
    replaceChild(newChild, oldChild) {
      const idx = children.indexOf(oldChild);
      if (idx >= 0) children[idx] = newChild;
      if (newChild) newChild.parentNode = el;
      return oldChild;
    },
    cloneNode() {
      return createMockElement(el.tagName, el.id, classList.toString().split(/\s+/), ownerDoc);
    },
    addEventListener(type, fn) {
      const k = String(type);
      if (!listeners.has(k)) listeners.set(k, []);
      listeners.get(k).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(String(type));
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const eventObj = Object.assign({
        target: el,
        currentTarget: el,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      }, ev || {});
      const arr = listeners.get(String(eventObj.type || '')) || [];
      for (const fn of arr.slice()) fn.call(el, eventObj);
      return true;
    },
    closest(selector) {
      if (matchesSimpleSelector(el, selector)) return el;
      let p = el.parentNode;
      while (p) {
        if (matchesSimpleSelector(p, selector)) return p;
        p = p.parentNode;
      }
      return null;
    },
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (matchesSimpleSelector(ch, selector)) out.push(ch);
          walk(ch);
        }
      };
      walk(el);
      return out;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 390, height: 100, right: 390, bottom: 100 };
    }
  };
  if (ownerDoc && id) ownerDoc._registerId(id, el);
  return el;
}

function matchesSimpleSelector(el, selector) {
  if (!el || !selector) return false;
  const sel = String(selector).trim();
  if (sel.startsWith('#')) {
    const idPart = sel.slice(1).split(/[\s.>]/)[0];
    return el.id === idPart;
  }
  const attrMatch = /^\[([a-z0-9-]+)(?:=["']?([^"'\]]+)["']?)?\]$/i.exec(sel);
  if (attrMatch) {
    const attrVal = el.getAttribute ? el.getAttribute(attrMatch[1]) : null;
    if (attrVal === null) return false;
    return attrMatch[2] === undefined ? true : attrVal === attrMatch[2];
  }
  if (sel.startsWith('.')) {
    return Boolean(el.classList && el.classList.contains(sel.slice(1)));
  }
  return el.tagName === sel.toUpperCase();
}

function createMockDocument() {
  const byId = new Map();
  const docListeners = new Map();
  const doc = {
    visibilityState: 'visible',
    readyState: 'complete',
    activeElement: null,
    referrer: '',
    _registerId(id, el) {
      if (id) byId.set(String(id), el);
    },
    getElementById(id) {
      return byId.get(String(id)) || null;
    },
    createElement(tag) {
      return createMockElement(tag, '', [], doc);
    },
    createDocumentFragment() {
      return createMockElement('FRAGMENT', '', [], doc);
    },
    querySelector(sel) {
      if (sel.startsWith('#') && !sel.includes(' ')) {
        return byId.get(sel.slice(1)) || null;
      }
      return doc.body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return doc.body.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      const k = String(type);
      if (!docListeners.has(k)) docListeners.set(k, []);
      docListeners.get(k).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = docListeners.get(String(type));
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const eventObj = Object.assign({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      }, ev || {});
      const arr = docListeners.get(String(eventObj.type || '')) || [];
      for (const fn of arr.slice()) fn(eventObj);
    },
    _getListeners(type) {
      return (docListeners.get(String(type)) || []).slice();
    }
  };
  doc.documentElement = createMockElement('HTML', '', [], doc);
  doc.head = createMockElement('HEAD', '', [], doc);
  doc.body = createMockElement('BODY', '', [], doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

function createMockStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

function createMockHistory(opts = {}) {
  const initialUrl = opts.url || '/MCP-REPOCITORIO/inventario.html';
  const chrome124Skippable = Boolean(opts.chrome124Skippable);
  let userActivation = true;

  const entries = [{ state: opts.initialState ?? null, url: initialUrl, skippable: false }];
  let index = 0;
  let pushCount = 0;
  let replaceCount = 0;
  let backCount = 0;
  let goCount = 0;
  let exitedApp = false;
  const popstateListeners = [];
  const replaceStateCalls = [];

  function dispatchPopstate(state) {
    const ev = { type: 'popstate', state };
    for (const fn of popstateListeners.slice()) fn(ev);
  }

  const history = {
    get length() { return entries.length; },
    get state() { return index >= 0 && index < entries.length ? entries[index].state : null; },
    pushState(state, _title, url) {
      entries.splice(index + 1);
      entries.push({
        state: state === undefined ? null : structuredClone(state),
        url: url || entries[index].url,
        skippable: chrome124Skippable && !userActivation
      });
      index = entries.length - 1;
      pushCount++;
    },
    replaceState(state, _title, url) {
      const cloned = state === undefined ? null : structuredClone(state);
      entries[index] = {
        state: cloned,
        url: url || entries[index].url,
        skippable: entries[index].skippable
      };
      replaceCount++;
      replaceStateCalls.push({ state: cloned, url: url || '' });
    },
    go(delta) {
      goCount++;
      const nextIndex = index + Number(delta || 0);
      if (nextIndex < 0) { index = -1; exitedApp = true; return; }
      if (nextIndex >= entries.length) return;
      index = nextIndex;
      dispatchPopstate(entries[index].state);
    },
    back() {
      backCount++;
      if (index <= 0) { index = -1; exitedApp = true; return; }
      index -= 1;
      dispatchPopstate(entries[index].state);
    }
  };

  function pressHardwareBack() {
    const prev = userActivation;
    userActivation = false;
    try {
      let target = index - 1;
      if (chrome124Skippable) {
        while (target >= 0 && entries[target].skippable) target -= 1;
      }
      if (target < 0) { index = -1; exitedApp = true; return; }
      index = target;
      dispatchPopstate(entries[index].state);
    } finally {
      userActivation = prev;
    }
  }

  return {
    history,
    popstateListeners,
    pressHardwareBack,
    get stats() {
      return {
        index,
        length: entries.length,
        pushCount,
        replaceCount,
        backCount,
        goCount,
        exitedApp,
        currentState: history.state,
        currentUrl: index >= 0 && index < entries.length ? entries[index].url : '',
        replaceStateCalls: replaceStateCalls.slice()
      };
    }
  };
}

function hydrateInventarioDomFromHtml(doc) {
  // Parse all elements with id="..." in inventario.html so DOM queries hit real IDs & initial classes
  const tagRe = /<(header|main|section|div|input|select|button|span|iframe|img|h1|h2|form|textarea)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(INV_HTML_SRC)) !== null) {
    const tag = m[1];
    const attrs = m[2] || '';
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (doc.getElementById(id)) continue;
    const clsMatch = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const classes = clsMatch ? clsMatch[1].split(/\s+/).filter(Boolean) : [];
    const el = createMockElement(tag, id, classes, doc);
    const srcMatch = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (srcMatch) el.setAttribute('src', srcMatch[1]);
    doc.body.appendChild(el);
  }
}

function createSandbox(opts = {}) {
  const clock = createFakeClock();
  const doc = createMockDocument();
  const fullUrl = opts.url || 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html';
  const parsedUrl = new URL(fullUrl);
  const mockHist = createMockHistory({
    url: parsedUrl.pathname + parsedUrl.search + parsedUrl.hash,
    initialState: opts.initialState ?? null,
    chrome124Skippable: Boolean(opts.chrome124Skippable)
  });

  const winListeners = new Map();
  const localStorage = createMockStorage();
  const sessionStorage = createMockStorage();

  if (opts.advisorSession) {
    localStorage.setItem('creata_inv_advisor_session_v1', JSON.stringify(opts.advisorSession));
  }

  const location = {
    href: parsedUrl.href,
    origin: parsedUrl.origin,
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    hash: parsedUrl.hash,
    replace(next) { this.href = String(next); }
  };

  const win = {
    document: doc,
    location,
    history: mockHist.history,
    localStorage,
    sessionStorage,
    innerWidth: opts.innerWidth || 390,
    innerHeight: opts.innerHeight || 844,
    isSecureContext: true,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/126.0.0.0 Mobile' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    scrollTo() {},
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    setInterval: () => 999999,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => clock.setTimer(fn, 16),
    cancelAnimationFrame: clock.clearTimer,
    fetch: opts.fetch || (() => new Promise(() => {})),
    URL,
    URLSearchParams,
    Date: class extends Date {
      static now() { return clock.now(); }
    },
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    CSS: { escape: (s) => String(s) },
    console: { log() {}, warn() {}, error() {}, info() {} },
    addEventListener(type, fn) {
      const k = String(type);
      if (k === 'popstate') mockHist.popstateListeners.push(fn);
      if (!winListeners.has(k)) winListeners.set(k, []);
      winListeners.get(k).push(fn);
    },
    removeEventListener(type, fn) {
      const k = String(type);
      if (k === 'popstate') {
        const i = mockHist.popstateListeners.indexOf(fn);
        if (i >= 0) mockHist.popstateListeners.splice(i, 1);
      }
      const arr = winListeners.get(k);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const arr = winListeners.get(String(ev && ev.type)) || [];
      for (const fn of arr.slice()) fn(ev);
    }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.parent = opts.embeddedParent ? { postMessage() {} } : win;

  if (opts.hydrateInventarioHtml) {
    hydrateInventarioDomFromHtml(doc);
    // Attach mock contentWindow.location.replace to #invSplitFotosFrame
    const frame = doc.getElementById('invSplitFotosFrame');
    if (frame) {
      const replaceCalls = [];
      frame._replaceCalls = replaceCalls;
      frame.contentWindow = {
        location: {
          href: 'about:blank',
          replace(url) {
            replaceCalls.push(String(url));
            this.href = new URL(String(url), parsedUrl.href).href;
          }
        },
        postMessage() {}
      };
    }
  }

  if (opts.sampleProducts) {
    win.CREATA_INV_DATA = opts.sampleProducts;
  }

  const context = vm.createContext(win);
  return { win, doc, context, clock, mockHist, localStorage, sessionStorage };
}

function makeAdminSession(overrides = {}) {
  return Object.assign({
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'Kevin Reyna',
    rol: 'ADMIN',
    isAdmin: true,
    isManager: true,
    es_gerente: true,
    es_admin: true,
    is_master: true,
    isGuest: false,
    mustChangeKey: false,
    sheetTab: 'PLAYA',
    branchKey: 'PLAYA',
    branchLabel: 'Playa del Carmen',
    erpStore: 'CREATA LIVING PLAYA',
    orderPrefix: 'PL',
    allLocations: [
      { correo: 'kevin.reyna@grupoanipa.com', sheetTab: 'PLAYA', branchLabel: 'Playa del Carmen', erpStore: 'CREATA LIVING PLAYA', isAdmin: true },
      { correo: 'kevin.reyna@grupoanipa.com', sheetTab: 'COLOSIO', branchLabel: 'Colosio', erpStore: 'CREATA LIVING COLOSIO', isAdmin: true }
    ]
  }, overrides);
}

// ============================================================================
// 1. STATIC CONTRACT, CACHE VERSIONING & INVENTARIO-SW.JS DISCOVERY TESTS
// ============================================================================

test('inventario-sw.js dynamic discovery regex matches all updated inventario.html assets without editing inventario-sw.js', () => {
  const reMatch = INV_SW_SRC.match(/const re = (\/.*\/[a-z]*);/);
  assert.ok(reMatch, 'inventario-sw.js must contain asset discovery regex');
  const re = new RegExp(reMatch[1].slice(1, reMatch[1].lastIndexOf('/')), reMatch[1].slice(reMatch[1].lastIndexOf('/') + 1));

  const origin = 'https://ikerreyna3942-debug.github.io';
  const baseHref = origin + '/MCP-REPOCITORIO/inventario.html';
  const discovered = new Set();
  let m;
  while ((m = re.exec(INV_HTML_SRC)) !== null) {
    const u = new URL(m[1], baseHref);
    if (u.origin === origin && /\.(?:js|css|json|png)$/i.test(u.pathname)) {
      discovered.add(u.pathname + u.search);
    }
  }

  const requiredAssets = [
    '/MCP-REPOCITORIO/creata-back-nav.js?v=1',
    '/MCP-REPOCITORIO/seguimiento-app.js?v=6',
    '/MCP-REPOCITORIO/historial-app.js?v=5',
    '/MCP-REPOCITORIO/inventario-app.js?v=84',
    '/MCP-REPOCITORIO/inventario-ui.css?v=12',
    '/MCP-REPOCITORIO/creata-modules.css?v=6'
  ];
  for (const asset of requiredAssets) {
    assert.ok(discovered.has(asset), `Expected inventario-sw.js regex to discover ${asset}`);
  }

  // Verify load order: creata-back-nav.js BEFORE seguimiento-app.js, historial-app.js, inventario-app.js
  const idxBackNav = INV_HTML_SRC.indexOf('./creata-back-nav.js?v=1');
  const idxSeg = INV_HTML_SRC.indexOf('./seguimiento-app.js?v=6');
  const idxHist = INV_HTML_SRC.indexOf('./historial-app.js?v=5');
  const idxInv = INV_HTML_SRC.indexOf('inventario-app.js?v=84');
  assert.ok(idxBackNav > 0 && idxBackNav < idxSeg && idxSeg < idxHist && idxHist < idxInv, 'Script order must load creata-back-nav.js before module scripts and inventario-app.js');
});

test('CSS safe-area tokens clear mobile FAB and Android/iOS bottom bars in inventario-ui.css and creata-modules.css', () => {
  assert.match(INV_UI_CSS_SRC, /--creata-back-toast-bottom:\s*calc\(20px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(INV_UI_CSS_SRC, /@media\s*\(max-width:\s*1023px\)[\s\S]*?--creata-back-toast-bottom:\s*calc\(74px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(MODULES_CSS_SRC, /\.cm-toast\s*\{[\s\S]*?bottom:\s*calc\(18px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(MODULES_CSS_SRC, /\.cm-modal-backdrop\s*\{[\s\S]*?env\(safe-area-inset-top,\s*0px\)[\s\S]*?env\(safe-area-inset-bottom,\s*0px\)/);
});

// ============================================================================
// 2. CREATASEGUIMIENTOMODULE.HANDLEBACKACTION() UNIT TESTS (node:vm)
// ============================================================================

test('CreataSeguimientoModule.handleBackAction unwinds overlays (preview -> cerrar -> audit) and views (search w/o focus -> filters -> onClose)', () => {
  const { win, doc, context } = createSandbox();
  vm.runInContext(SEG_APP_SRC, context, { filename: 'seguimiento-app.js' });

  const root = doc.createElement('div');
  root.id = 'inAppSeguimientoRoot';
  doc.body.appendChild(root);

  const pushReasons = [];
  let closedCount = 0;

  const mountedOk = win.CreataSeguimientoModule.mount(root, {
    session: makeAdminSession(),
    onBackStatePush: (r) => pushReasons.push(r),
    backNavManaged: true,
    onClose: () => { closedCount++; }
  });
  assert.equal(mountedOk, true);
  assert.equal(typeof win.CreataSeguimientoModule.handleBackAction, 'function');

  // Open all 3 overlays via DOM + verify exact priority: preview -> cerrar -> audit
  const mPrev = root.querySelector('#seg_previewModal');
  const mCerr = root.querySelector('#seg_modalCerrarCotizacion');
  const mAud = root.querySelector('#seg_modalKevinAudit');
  mPrev.classList.remove('cm-hidden');
  mCerr.classList.remove('cm-hidden');
  mAud.classList.remove('cm-hidden');

  assert.equal(win.CreataSeguimientoModule.hasActiveOverlay(), true);

  let r = win.CreataSeguimientoModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_preview_modal');
  assert.equal(mPrev.classList.contains('cm-hidden'), true);
  assert.equal(mCerr.classList.contains('cm-hidden'), false);

  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_cerrar_modal');
  assert.equal(mCerr.classList.contains('cm-hidden'), true);
  assert.equal(mAud.classList.contains('cm-hidden'), false);

  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_audit_modal');
  assert.equal(mAud.classList.contains('cm-hidden'), true);
  assert.equal(win.CreataSeguimientoModule.hasActiveOverlay(), false);

  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, false);

  // Set search + dropdown filters via DOM input/change events to test push hooks & view unwind
  const searchInp = root.querySelector('#seg_filterSearch');
  const selUrg = root.querySelector('#seg_filterUrgencia');
  const selSuc = root.querySelector('#seg_filterSucursal');
  searchInp.value = 'Sofa Roma';
  root.dispatchEvent({ type: 'input', target: searchInp });
  selUrg.value = 'CRITICO';
  root.dispatchEvent({ type: 'change', target: selUrg });
  selSuc.value = 'PLAYA';
  root.dispatchEvent({ type: 'change', target: selSuc });

  assert.ok(pushReasons.includes('seg_search'), 'Typing search should call onBackStatePush');
  assert.ok(pushReasons.includes('seg_filter'), 'Changing filter should call onBackStatePush');

  // View unwind 1: clear search WITHOUT calling .focus()
  const focusBefore = searchInp.focusCalls;
  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'view' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_search');
  assert.equal(searchInp.value, '');
  assert.equal(searchInp.focusCalls, focusBefore, 'Clearing search must NOT call .focus()');

  // View unwind 2: reset dropdown filters
  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'view' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_filters');
  assert.equal(selUrg.value, 'TODOS');
  assert.equal(selSuc.value, 'TODAS');

  // View unwind 3: close module via onClose
  r = win.CreataSeguimientoModule.handleBackAction({ phase: 'view' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'seg_close_module');
  assert.equal(closedCount, 1);

  // Verify Escape yields when backNavManaged: true (does not close modal on its own)
  mPrev.classList.remove('cm-hidden');
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(mPrev.classList.contains('cm-hidden'), false, 'Seguimiento Escape must yield when backNavManaged is true');

  win.CreataSeguimientoModule.unmount();
});

// ============================================================================
// 3. CREATAHISTORIALMODULE.HANDLEBACKACTION() UNIT TESTS (node:vm)
// ============================================================================

test('CreataHistorialModule.handleBackAction unwinds overlays (photo -> quote) and views (search w/o focus -> active tab filters -> tab history -> onClose)', () => {
  const { win, doc, context } = createSandbox();
  vm.runInContext(HIST_APP_SRC, context, { filename: 'historial-app.js' });

  const root = doc.createElement('div');
  root.id = 'inAppHistorialRoot';
  doc.body.appendChild(root);

  const pushReasons = [];
  let closedCount = 0;

  const mountedOk = win.CreataHistorialModule.mount(root, {
    session: makeAdminSession(),
    onBackStatePush: (r) => pushReasons.push(r),
    backNavManaged: true,
    onClose: () => { closedCount++; }
  });
  assert.equal(mountedOk, true);
  assert.equal(typeof win.CreataHistorialModule.handleBackAction, 'function');

  // Open both overlays -> photo lightbox must close BEFORE quote inspect modal
  const mPhoto = root.querySelector('#hist_photoPreviewModal');
  const mQuote = root.querySelector('#hist_quoteInspectModal');
  mPhoto.classList.remove('cm-hidden');
  mQuote.classList.remove('cm-hidden');

  let r = win.CreataHistorialModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'hist_photo_modal');
  assert.equal(mPhoto.classList.contains('cm-hidden'), true);
  assert.equal(mQuote.classList.contains('cm-hidden'), false);

  r = win.CreataHistorialModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, true);
  assert.equal(r.action, 'hist_quote_modal');
  assert.equal(mQuote.classList.contains('cm-hidden'), true);

  r = win.CreataHistorialModule.handleBackAction({ phase: 'overlay' });
  assert.equal(r.handled, false);

  // Switch tabs: overview (default) -> quotes -> seguimiento
  const btnQuotes = root.querySelector('#hist_tabBtn_quotes');
  const btnSeg = root.querySelector('#hist_tabBtn_seguimiento');
  root.dispatchEvent({ type: 'click', target: btnQuotes });
  root.dispatchEvent({ type: 'click', target: btnSeg });
  assert.ok(pushReasons.includes('hist_tab'), 'Tab switch should notify onBackStatePush');

  // Apply filter on active tab (seguimiento) + global search
  const statusSel = root.querySelector('#hist_segStatusSelect');
  statusSel.value = 'GANADA';
  root.dispatchEvent({ type: 'change', target: statusSel });

  const gSearch = root.querySelector('#hist_globalSearch');
  gSearch.value = 'PL-100';
  root.dispatchEvent({ type: 'input', target: gSearch });

  assert.ok(pushReasons.includes('hist_filter'));
  assert.ok(pushReasons.includes('hist_search'));

  // View unwind 1: clear global search WITHOUT .focus()
  const focusBefore = gSearch.focusCalls;
  r = win.CreataHistorialModule.handleBackAction({ phase: 'view' });
  assert.equal(r.action, 'hist_search');
  assert.equal(gSearch.value, '');
  assert.equal(gSearch.focusCalls, focusBefore, 'Clearing historial search must NOT call .focus()');

  // View unwind 2: reset active tab filters
  r = win.CreataHistorialModule.handleBackAction({ phase: 'view' });
  assert.equal(r.action, 'hist_filters');
  assert.equal(statusSel.value, 'ALL');

  // View unwind 3: return to previous tab in tabHistory (seguimiento -> quotes)
  r = win.CreataHistorialModule.handleBackAction({ phase: 'view' });
  assert.equal(r.action, 'hist_tab');
  assert.equal(root.querySelector('#hist_tabPanel_quotes').classList.contains('cm-hidden'), false);

  // View unwind 4: return to default tab (quotes -> overview)
  r = win.CreataHistorialModule.handleBackAction({ phase: 'view' });
  assert.equal(r.action, 'hist_tab');
  assert.equal(root.querySelector('#hist_tabPanel_overview').classList.contains('cm-hidden'), false);

  // View unwind 5: exit Historial module
  r = win.CreataHistorialModule.handleBackAction({ phase: 'view' });
  assert.equal(r.action, 'hist_close_module');
  assert.equal(closedCount, 1);

  // Verify Escape yields when backNavManaged: true
  mPhoto.classList.remove('cm-hidden');
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(mPhoto.classList.contains('cm-hidden'), false, 'Historial Escape must yield when backNavManaged is true');

  win.CreataHistorialModule.unmount();
});

// ============================================================================
// 4. FULL INVENTARIO-APP.JS INTEGRATION TESTS (17-LEVEL PRIORITY, ESCAPE, MODES)
// ============================================================================

async function bootInventarioApp(opts = {}) {
  const sampleProducts = opts.sampleProducts || [
    { s: 'SOF-001', tp: 'SALA', mo: 'ROMA', n: 'SOFA ROMA BEIGE', vr: 'BEIGE', c: 'SALAS', pr: '$18,500', st: [0, 3, 2, 0, 0, 0, 0, 0] },
    { s: 'SOF-002', tp: 'SALA', mo: 'ROMA', n: 'SOFA ROMA GRIS', vr: 'GRIS', c: 'SALAS', pr: '$18,900', st: [0, 2, 1, 0, 0, 0, 0, 0] },
    { s: 'SIL-001', tp: 'SILLON', mo: 'MILAN', n: 'SILLON MILAN CREMA', vr: 'CREMA', c: 'SALAS', pr: '$9,200', st: [0, 4, 0, 0, 0, 0, 0, 0] }
  ];

  const sb = createSandbox(Object.assign({
    hydrateInventarioHtml: true,
    chrome124Skippable: true,
    sampleProducts
  }, opts));

  if (opts.loadBackNav !== false) {
    vm.runInContext(BACK_NAV_SRC, sb.context, { filename: 'creata-back-nav.js' });
  }
  vm.runInContext(SEG_APP_SRC, sb.context, { filename: 'seguimiento-app.js' });
  vm.runInContext(HIST_APP_SRC, sb.context, { filename: 'historial-app.js' });
  vm.runInContext(INV_APP_SRC, sb.context, { filename: 'inventario-app.js' });

  // Trigger DOMContentLoaded and let async unpack/init settle
  sb.doc.dispatchEvent({ type: 'DOMContentLoaded' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return sb;
}

test('inventario-app.js preserves history.state in readAndConsumeOpenModuleIntent replaceState', async () => {
  const initialState = { preservedMarker: 'keep-me' };
  const sb = await bootInventarioApp({
    url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?openModule=seguimiento',
    advisorSession: makeAdminSession(),
    initialState
  });

  // First replaceState call strips ?openModule=seguimiento while preserving existing state
  const calls = sb.mockHist.stats.replaceStateCalls;
  assert.ok(calls.length >= 2, 'Expected replaceState from readAndConsumeOpenModuleIntent followed by back-nav init');
  assert.deepEqual(calls[0].state, initialState, 'readAndConsumeOpenModuleIntent must preserve existing history.state');
  assert.equal(calls[0].url.includes('openModule='), false, 'openModule query param must be stripped');
  assert.equal(calls[1].state.__creataBackNav, true, 'creata-back-nav init should run AFTER openModule cleanup');
});

test('Priority 0: Mandatory #authModal (login and mustChangeKey) is never bypassed by Back or Escape', async () => {
  // Case A: unauthenticated login gate
  const sbLogin = await bootInventarioApp({ advisorSession: null });
  const authModal = sbLogin.doc.getElementById('authModal');
  const stepLogin = sbLogin.doc.getElementById('authStepLogin');
  assert.equal(authModal.classList.contains('open'), true);
  assert.equal(stepLogin.classList.contains('hidden'), false);
  assert.equal(sbLogin.win.__CREATA_INV_BACK_NAV__.getDebugState().enabled, false, 'isEnabled() must be false on mandatory login gate');

  // Escape must NEVER close mandatory #authModal
  sbLogin.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(authModal.classList.contains('open'), true, 'Escape must not close mandatory login modal');

  // Hardware popstate must NOT trap user or close mandatory #authModal
  sbLogin.mockHist.pressHardwareBack();
  assert.equal(authModal.classList.contains('open'), true, 'popstate must not close mandatory login modal');
  assert.equal(sbLogin.mockHist.stats.exitedApp, true, 'User must not be trapped on mandatory login screen');

  // Case B: mustChangeKey gate
  const sbKey = await bootInventarioApp({ advisorSession: makeAdminSession({ mustChangeKey: true }) });
  const keyModal = sbKey.doc.getElementById('authModal');
  const stepNewKey = sbKey.doc.getElementById('authStepNewKey');
  assert.equal(keyModal.classList.contains('open'), true);
  assert.equal(stepNewKey.classList.contains('hidden'), false);
  assert.equal(sbKey.win.__CREATA_INV_BACK_NAV__.getDebugState().enabled, false, 'isEnabled() must be false on mustChangeKey gate');
  sbKey.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(keyModal.classList.contains('open'), true);
});

test('17-level unwind order: scan -> install -> authBranch -> uploadDropdown -> uploadInFlightBlock -> uploadClose -> fab -> cartNewClient -> cart -> detail 3-step -> splitDock (replaceIframeUrl) -> home search/subcat/cat -> 2.5s exit guard', async () => {
  const sb = await bootInventarioApp({ advisorSession: makeAdminSession() });
  const { win, doc, clock, mockHist } = sb;

  assert.ok(win.__CREATA_INV_BACK_NAV__, 'Back-nav controller must be initialized');
  assert.equal(win.__CREATA_INV_BACK_NAV__.getDebugState().enabled, true);

  // Set up home filters & search (advance fake clock >= 100ms between distinct user gestures)
  win.setInvCategory('SALAS');
  clock.advanceTime(100);
  win.setInvSubCategory('SOFA');
  clock.advanceTime(100);
  const searchInp = doc.getElementById('invSearchInput');
  searchInp.value = 'ROMA';
  searchInp.dispatchEvent({ type: 'input' });
  clock.advanceTime(100);

  // Open split dock -> verify replaceIframeUrl used and dataset.loadedSrc populated
  win.toggleInvSplitFotosDock();
  clock.advanceTime(100);
  const splitFrame = doc.getElementById('invSplitFotosFrame');
  assert.deepEqual(splitFrame._replaceCalls, ['./fotos-productos.html?embed=1'], 'Split dock must use replaceIframeUrl instead of pushing iframe history');
  assert.equal(splitFrame.dataset.loadedSrc, './fotos-productos.html?embed=1');

  // Open multi-variant group -> single variant -> related in-stock panel
  assert.equal(win.openGroupModal(Object.keys ? undefined : ''), false);
  // Open product detail from multi-variant group
  const openedDetail = win.openProductDetail('SOF-001', false);
  assert.equal(openedDetail, true);
  clock.advanceTime(100);
  // Simulate coming from group list so #detGroupCrumb is visible
  const openedFromGroup = win.openProductDetail('SOF-001', true);
  assert.equal(openedFromGroup, true);
  clock.advanceTime(100);
  assert.equal(doc.getElementById('detSingleStep').classList.contains('hidden'), false);
  assert.equal(doc.getElementById('detGroupCrumb').classList.contains('hidden'), false);
  // Expand related stock panel
  win.toggleRelatedInStockProducts();
  clock.advanceTime(100);
  assert.equal(doc.getElementById('detRelatedStockPanel').classList.contains('hidden'), false);

  // Open cart modal + new ERP client form
  await win.openCartModal();
  clock.advanceTime(100);
  win.toggleNewErpClientForm(true);
  clock.advanceTime(100);
  assert.equal(doc.getElementById('cartModal').classList.contains('open'), true);
  assert.equal(doc.getElementById('quoteNewErpClientPanel').classList.contains('hidden'), false);

  // Open FAB menu
  win.openFabMenu();
  clock.advanceTime(100);
  assert.equal(doc.getElementById('invFabRoot').classList.contains('is-open'), true);

  // Open upload photo modal + dropdown
  win.openUploadPhotoModal();
  clock.advanceTime(100);
  win.filterUploadPhotoModelOptions('ROMA');
  clock.advanceTime(100);
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), true);
  assert.equal(doc.getElementById('uploadPhotoModelDropdown').classList.contains('hidden'), false);

  // Open branch switch modal (optional auth modal)
  win.openSwitchBranchSelector();
  clock.advanceTime(100);
  assert.equal(doc.getElementById('authModal').classList.contains('open'), true);
  assert.equal(doc.getElementById('authStepBranch').classList.contains('hidden'), false);

  // Open install modal & scan modal
  win.openInstallAppModal();
  clock.advanceTime(100);
  await win.openBarcodeScanner();
  clock.advanceTime(100);

  // NOW UNWIND STEP BY STEP VIA HARDWARE BACK (popstate) — VERIFY EXACT PRIORITY ORDER!
  // Priority 1: #scanModal
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('scanModal').classList.contains('open'), false, 'P1 must close scanModal');
  assert.equal(doc.getElementById('installAppModal').classList.contains('open'), true);

  // Priority 2: #installAppModal
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('installAppModal').classList.contains('open'), false, 'P2 must close installAppModal');
  assert.equal(doc.getElementById('authModal').classList.contains('open'), true);

  // Priority 3: #authModal (#authStepBranch)
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('authModal').classList.contains('open'), false, 'P3 must cancel branch selection');
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), true);

  // Priority 4: #uploadPhotoModelDropdown
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('uploadPhotoModelDropdown').classList.contains('hidden'), true, 'P4 must hide uploadPhotoModelDropdown');
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), true);

  // Priority 5: #uploadPhotoModal close
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), false, 'P5 must close uploadPhotoModal');
  assert.equal(doc.getElementById('invFabRoot').classList.contains('is-open'), true);

  // Priority 9: FAB menu
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('invFabRoot').classList.contains('is-open'), false, 'P9 must close FAB menu');
  assert.equal(doc.getElementById('quoteNewErpClientPanel').classList.contains('hidden'), false);

  // Priority 10: #cartModal new ERP client inline form
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('quoteNewErpClientPanel').classList.contains('hidden'), true, 'P10 must close new client form');
  assert.equal(doc.getElementById('cartModal').classList.contains('open'), true);

  // Priority 11: #cartModal
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('cartModal').classList.contains('open'), false, 'P11 must close cartModal');
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), true);

  // Priority 12a: #productDetailModal -> collapse related in-stock panel
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('detRelatedStockPanel').classList.contains('hidden'), true, 'P12a must collapse related stock panel');
  assert.equal(doc.getElementById('detSingleStep').classList.contains('hidden'), false);

  // Priority 12b: #productDetailModal -> back to group variants
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('detSingleStep').classList.contains('hidden'), true, 'P12b must return to variants step');
  assert.equal(doc.getElementById('detVariantsStep').classList.contains('hidden'), false);
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), true);

  // Priority 12c: #productDetailModal -> close detail modal
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), false, 'P12c must close productDetailModal');
  assert.equal(doc.getElementById('invSplitFotosDock').classList.contains('hidden'), false);

  // Priority 13: #invSplitFotosDock -> close split dock
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('invSplitFotosDock').classList.contains('hidden'), true, 'P13 must close split fotos dock');

  // Priority 16a: Home search
  const searchFocusBefore = searchInp.focusCalls;
  mockHist.pressHardwareBack();
  assert.equal(searchInp.value, '', 'P16a must clear invSearchInput');
  assert.equal(searchInp.focusCalls, searchFocusBefore, 'clearInvSearch must NOT call .focus()');

  // Priority 16b: Home subcategory
  mockHist.pressHardwareBack();
  assert.equal(win.__CREATA_INV_BACK_NAV__.getDebugState().activeStepIds.includes('inv_subcategory'), false, 'P16b must reset subcategory');
  assert.equal(win.__CREATA_INV_BACK_NAV__.getDebugState().activeStepIds.includes('inv_category'), true);

  // Priority 16c: Home category
  mockHist.pressHardwareBack();
  assert.equal(win.__CREATA_INV_BACK_NAV__.getDebugState().activeStepIds.length, 0, 'P16c must reset category to clean root');

  // Priority 17: Clean-root 2.5s double-back exit guard
  mockHist.pressHardwareBack();
  assert.equal(mockHist.stats.exitedApp, false, '1st Back at root must NOT exit immediately');
  const toastEl = doc.getElementById('creataBackNavToast');
  assert.ok(toastEl && toastEl.textContent.includes('Presiona Atrás otra vez para salir'), '1st Back at root must show exit-guard toast');

  // Let 2.6s pass -> guard expires, so another Back re-arms instead of exiting
  clock.advanceTime(2600);
  mockHist.pressHardwareBack();
  assert.equal(mockHist.stats.exitedApp, false, 'Expired guard must re-arm rather than exiting');

  // 2nd Back within 2.5s -> exits cleanly
  clock.advanceTime(800);
  mockHist.pressHardwareBack();
  assert.equal(mockHist.stats.exitedApp, true, '2nd Back within 2.5s must exit cleanly');
});

test('Priority 5 in-flight guard blocks closing #uploadPhotoModal while upload is active', async () => {
  const sb = await bootInventarioApp({
    advisorSession: makeAdminSession(),
    // Never-resolving fetch keeps managerPhotoUploadInFlight === true during the test
    fetch: () => new Promise(() => {})
  });
  const { win, doc } = sb;

  win.openUploadPhotoModal();
  const modal = doc.getElementById('uploadPhotoModal');
  assert.equal(modal.classList.contains('open'), true);

  // Set up minimal SKU + 1 pending file and trigger submitMultiProductPhotos to genuinely set managerPhotoUploadInFlight = true
  doc.getElementById('uploadPhotoSelectedSku').value = 'SOF-001';
  doc.getElementById('uploadPhotoModelInput').value = 'SOF-001';
  // FileReader mock inside sandbox to feed handleUploadPhotoFiles
  sb.win.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/jpeg;base64,AAAA';
      if (this.onload) this.onload({ target: this });
    }
  };
  sb.win.Image = class {
    set src(_) {
      this.naturalWidth = 100;
      this.naturalHeight = 100;
      if (this.onload) this.onload();
    }
  };
  const fakeFile = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
  fakeFile.name = 'sofa.jpg';
  if (typeof win.onUploadPhotoFilesSelected === 'function') {
    win.onUploadPhotoFilesSelected([fakeFile]);
  }
  // Fire upload (does not resolve because fetch hangs -> managerPhotoUploadInFlight === true)
  win.submitMultiProductPhotos();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const res = win.handleInventarioBackAction();
  assert.equal(res.handled, true);
  assert.equal(res.blocked, true, 'Back action must be blocked while photo upload is in flight');
  assert.equal(res.toast, 'Subida en curso...');
  assert.equal(modal.classList.contains('open'), true, 'uploadPhotoModal must stay open while upload is in flight');
});

test('Priority 8: #quoteAcceptedModal unwinds before FAB and #cartModal via acceptGeneratedQuoteAndReset()', async () => {
  const sb = await bootInventarioApp({ advisorSession: makeAdminSession() });
  const { win, doc, clock, mockHist } = sb;

  await win.openCartModal();
  clock.advanceTime(100);
  win.openFabMenu();
  clock.advanceTime(100);
  const accModal = doc.getElementById('quoteAcceptedModal');
  accModal.classList.add('open');
  win.__CREATA_INV_BACK_NAV__.syncDepthOnUserAction('quote_accepted_modal');
  clock.advanceTime(100);

  // Priority 8 fires BEFORE Priority 9 (FAB) and Priority 11 (#cartModal)
  mockHist.pressHardwareBack();
  assert.equal(accModal.classList.contains('open'), false, 'P8 must close quoteAcceptedModal via acceptGeneratedQuoteAndReset()');
  assert.equal(doc.getElementById('cartModal').classList.contains('open'), false, 'acceptGeneratedQuoteAndReset() also closes cartModal');
  assert.equal(doc.getElementById('invFabRoot').classList.contains('is-open'), true, 'FAB remains open until next Back press');

  // Next Back closes FAB (Priority 9)
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('invFabRoot').classList.contains('is-open'), false, 'P9 closes FAB menu');
});

test('Priorities 6, 7, 14, 15: Seguimiento and Historial delegate overlays then view steps to modules, and consolidated Escape closes only 1 topmost layer', async () => {
  const sb = await bootInventarioApp({ advisorSession: makeAdminSession() });
  const { win, doc, clock, mockHist } = sb;

  // --- Seguimiento ---
  win.openInAppSeguimiento();
  clock.advanceTime(100);
  assert.equal(doc.getElementById('inAppSeguimientoView').classList.contains('hidden'), false);
  const segRoot = doc.getElementById('inAppSeguimientoRoot');
  const segPrev = segRoot.querySelector('#seg_previewModal');
  const segCerr = segRoot.querySelector('#seg_modalCerrarCotizacion');
  segPrev.classList.remove('cm-hidden');
  segCerr.classList.remove('cm-hidden');

  // Single Escape must close ONLY #seg_previewModal (NOT both modals — proves zero double-fire!)
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(segPrev.classList.contains('cm-hidden'), true, '1st Escape closes seg_previewModal');
  assert.equal(segCerr.classList.contains('cm-hidden'), false, '1st Escape must NOT double-fire and close seg_modalCerrarCotizacion');

  // Back #1 (P6): closes remaining #seg_modalCerrarCotizacion
  mockHist.pressHardwareBack();
  assert.equal(segCerr.classList.contains('cm-hidden'), true);
  assert.equal(doc.getElementById('inAppSeguimientoView').classList.contains('hidden'), false);

  // Add search in Seguimiento -> Back #2 (P14a) clears search -> Back #3 (P14c) exits Seguimiento to home
  const segSearch = segRoot.querySelector('#seg_filterSearch');
  segSearch.value = 'Cliente X';
  segRoot.dispatchEvent({ type: 'input', target: segSearch });
  clock.advanceTime(100);

  mockHist.pressHardwareBack();
  assert.equal(segSearch.value, '', 'P14a clears Seguimiento search');
  assert.equal(doc.getElementById('inAppSeguimientoView').classList.contains('hidden'), false);

  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('inAppSeguimientoView').classList.contains('hidden'), true, 'P14c returns to Inventario home');

  // --- Historial ---
  clock.advanceTime(100);
  win.openInAppHistorial();
  clock.advanceTime(100);
  assert.equal(doc.getElementById('inAppHistorialView').classList.contains('hidden'), false);
  const histRoot = doc.getElementById('inAppHistorialRoot');
  const histPhoto = histRoot.querySelector('#hist_photoPreviewModal');
  const histQuote = histRoot.querySelector('#hist_quoteInspectModal');
  histPhoto.classList.remove('cm-hidden');
  histQuote.classList.remove('cm-hidden');

  // Single Escape closes ONLY #hist_photoPreviewModal (zero double-fire!)
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(histPhoto.classList.contains('cm-hidden'), true);
  assert.equal(histQuote.classList.contains('cm-hidden'), false);

  // Back closes #hist_quoteInspectModal, then Back exits Historial to home
  mockHist.pressHardwareBack();
  assert.equal(histQuote.classList.contains('cm-hidden'), true);
  mockHist.pressHardwareBack();
  assert.equal(doc.getElementById('inAppHistorialView').classList.contains('hidden'), true);

  // --- Consolidated Escape on overlapping Inventario modals ---
  clock.advanceTime(100);
  win.openProductDetail('SOF-001', false);
  clock.advanceTime(100);
  win.openUploadPhotoModal();
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), true);
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), true);

  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(doc.getElementById('uploadPhotoModal').classList.contains('open'), false, '1st Escape closes topmost uploadPhotoModal only');
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), true, 'productDetailModal remains open after 1st Escape');

  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(doc.getElementById('productDetailModal').classList.contains('open'), false, '2nd Escape closes productDetailModal');
});

test('?embed=1 iframe mode is a safe no-op for history/popstate, and ?cotizacion= mode excludes back-nav controller', async () => {
  // Embedded iframe (?embed=1)
  const sbEmbed = await bootInventarioApp({
    url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?embed=1',
    advisorSession: makeAdminSession(),
    embeddedParent: true
  });
  assert.ok(sbEmbed.win.__CREATA_INV_BACK_NAV__, 'Controller exists in embed mode as safe no-op');
  assert.equal(sbEmbed.win.__CREATA_INV_BACK_NAV__.getDebugState().embedded, true);
  assert.equal(sbEmbed.mockHist.popstateListeners.length, 0, 'Embedded iframe must NOT register popstate listener');
  assert.equal(sbEmbed.mockHist.stats.pushCount, 0, 'Embedded iframe must NOT push history entries');
  assert.equal(sbEmbed.mockHist.stats.replaceCount, 0, 'Embedded iframe must NOT call replaceState');

  // Shared client quote (?cotizacion=...) with real base64url-encoded quote payload
  const quotePayload = { v: 1, f: 'PL-2026-001', c: 'Cliente Demo', s: 'CREATA LIVING PLAYA', i: [['SOF-001', 'SOFA ROMA', 1, 18500, 0, 18500, '220x95']] };
  const quoteToken = Buffer.from(JSON.stringify(quotePayload), 'utf8').toString('base64url');
  const sbQuote = await bootInventarioApp({
    url: `https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?cotizacion=${quoteToken}`,
    advisorSession: null
  });
  assert.equal(sbQuote.win.__CREATA_INV_BACK_NAV__, undefined, '?cotizacion= mode must NOT initialize back-nav controller');
  assert.equal(sbQuote.mockHist.popstateListeners.length, 0, '?cotizacion= mode must NOT register popstate listener');

  // Offline-safe degradation when creata-back-nav.js is missing
  const sbOffline = await bootInventarioApp({
    advisorSession: makeAdminSession(),
    loadBackNav: false
  });
  assert.equal(sbOffline.win.__CREATA_INV_BACK_NAV__, undefined);
  sbOffline.win.openInstallAppModal();
  assert.equal(sbOffline.doc.getElementById('installAppModal').classList.contains('open'), true);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('installAppModal').classList.contains('open'), false, 'Offline Escape fallback must still close modals');

  // Offline Escape closes Seguimiento overlays one layer at a time (no stuck modal, no double-close)
  sbOffline.win.openInAppSeguimiento();
  const offSegRoot = sbOffline.doc.getElementById('inAppSeguimientoRoot');
  const offSegPrev = offSegRoot.querySelector('#seg_previewModal');
  const offSegCerr = offSegRoot.querySelector('#seg_modalCerrarCotizacion');
  offSegPrev.classList.remove('cm-hidden');
  offSegCerr.classList.remove('cm-hidden');
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(offSegPrev.classList.contains('cm-hidden'), true, 'Offline Escape must close #seg_previewModal');
  assert.equal(offSegCerr.classList.contains('cm-hidden'), false, 'Offline Escape must NOT double-close #seg_modalCerrarCotizacion');
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(offSegCerr.classList.contains('cm-hidden'), true, '2nd offline Escape closes #seg_modalCerrarCotizacion');
  sbOffline.win.closeInAppModules();

  // Offline Escape closes Historial overlays one layer at a time (no stuck modal, no double-close)
  sbOffline.win.openInAppHistorial();
  const offHistRoot = sbOffline.doc.getElementById('inAppHistorialRoot');
  const offHistPhoto = offHistRoot.querySelector('#hist_photoPreviewModal');
  const offHistQuote = offHistRoot.querySelector('#hist_quoteInspectModal');
  offHistPhoto.classList.remove('cm-hidden');
  offHistQuote.classList.remove('cm-hidden');
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(offHistPhoto.classList.contains('cm-hidden'), true, 'Offline Escape must close #hist_photoPreviewModal');
  assert.equal(offHistQuote.classList.contains('cm-hidden'), false, 'Offline Escape must NOT double-close #hist_quoteInspectModal');
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(offHistQuote.classList.contains('cm-hidden'), true, '2nd offline Escape closes #hist_quoteInspectModal');
  sbOffline.win.closeInAppModules();

  // Offline Escape unwinds inner sub-layers before parent modals (upload dropdown, cart new-client form, detail 3-step)
  sbOffline.win.openUploadPhotoModal();
  sbOffline.win.filterUploadPhotoModelOptions('ROMA');
  assert.equal(sbOffline.doc.getElementById('uploadPhotoModelDropdown').classList.contains('hidden'), false);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('uploadPhotoModelDropdown').classList.contains('hidden'), true, 'Offline Escape closes upload dropdown first');
  assert.equal(sbOffline.doc.getElementById('uploadPhotoModal').classList.contains('open'), true);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('uploadPhotoModal').classList.contains('open'), false);

  await sbOffline.win.openCartModal();
  sbOffline.win.toggleNewErpClientForm(true);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('quoteNewErpClientPanel').classList.contains('hidden'), true, 'Offline Escape closes quoteNewErpClientPanel first');
  assert.equal(sbOffline.doc.getElementById('cartModal').classList.contains('open'), true);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('cartModal').classList.contains('open'), false);

  sbOffline.win.openProductDetail('SOF-001', false);
  sbOffline.win.openProductDetail('SOF-001', true);
  sbOffline.win.toggleRelatedInStockProducts();
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('detRelatedStockPanel').classList.contains('hidden'), true, 'Offline Escape collapses related stock first');
  assert.equal(sbOffline.doc.getElementById('detSingleStep').classList.contains('hidden'), false);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('detSingleStep').classList.contains('hidden'), true, 'Offline Escape returns to group variants');
  assert.equal(sbOffline.doc.getElementById('productDetailModal').classList.contains('open'), true);
  sbOffline.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(sbOffline.doc.getElementById('productDetailModal').classList.contains('open'), false);
});
