import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BACK_NAV_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');
const FOTOS_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
const FOTOS_HTML_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
const INV_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
const INV_HTML_SRC = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
const SEG_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-app.js'), 'utf8');
const HIST_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'historial-app.js'), 'utf8');

function createFakeClock(startMs = 1_760_000_000_000) {
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

function createSharedBroadcastBus() {
  const channelsByName = new Map();

  return function MockBroadcastChannel(name) {
    const chName = String(name || '');
    if (!channelsByName.has(chName)) channelsByName.set(chName, new Set());
    const peers = channelsByName.get(chName);
    const self = {
      name: chName,
      onmessage: null,
      postMessage(data) {
        const cloned = structuredClone(data);
        for (const peer of Array.from(peers)) {
          if (peer !== self && typeof peer.onmessage === 'function') {
            peer.onmessage({ data: structuredClone(cloned) });
          }
        }
      },
      close() {
        peers.delete(self);
      }
    };
    peers.add(self);
    return self;
  };
}

function createClassList(initial = []) {
  const set = new Set(initial.filter(Boolean));
  return {
    add(...cs) { cs.forEach((c) => c && set.add(String(c))); },
    remove(...cs) { cs.forEach((c) => c && set.delete(String(c))); },
    toggle(c, force) {
      const k = String(c);
      if (typeof force === 'boolean') {
        if (force) set.add(k);
        else set.delete(k);
        return force;
      }
      if (set.has(k)) {
        set.delete(k);
        return false;
      }
      set.add(k);
      return true;
    },
    contains(c) { return set.has(String(c)); },
    toString() { return Array.from(set).join(' '); }
  };
}

function makeMockElement(tagName = 'DIV', id = '', initialClasses = [], ownerDoc = null) {
  const attrs = new Map();
  if (id) attrs.set('id', id);
  const listeners = new Map();
  const children = [];
  const classList = createClassList(initialClasses);
  let _innerHTML = '';
  let _textContent = '';

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
      cur.forEach((c) => classList.remove(c));
      next.forEach((c) => classList.add(c));
    },
    classList,
    dataset: {},
    value: '',
    src: '',
    href: '',
    type: 'text',
    checked: false,
    disabled: false,
    options: [],
    files: [],
    scrollTop: 0,
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 320,
    parentNode: null,
    children,
    style: {
      setProperty(k, v) { this[k] = String(v); },
      removeProperty(k) { delete this[k]; }
    },
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) { _innerHTML = String(v ?? ''); },
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = String(v ?? ''); },
    setAttribute(k, v) {
      const sv = String(v);
      attrs.set(k, sv);
      if (k === 'src') el.src = sv;
      if (k === 'href') el.href = sv;
      if (k === 'id' && ownerDoc) ownerDoc._registerId(sv, el);
    },
    getAttribute(k) {
      if (k === 'src' && !attrs.has('src')) return el.src || '';
      if (k === 'href' && !attrs.has('href')) return el.href || '';
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(child) {
      if (child && typeof child === 'object') {
        child.parentNode = el;
        children.push(child);
        if (ownerDoc && child.id) ownerDoc._registerId(child.id, child);
      }
      return child;
    },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      if (child) child.parentNode = null;
      return child;
    },
    replaceChild(newChild, oldChild) {
      const i = children.indexOf(oldChild);
      if (i >= 0) children[i] = newChild;
      else children.push(newChild);
      if (newChild) newChild.parentNode = el;
      if (oldChild) oldChild.parentNode = null;
      return oldChild;
    },
    cloneNode() {
      const copy = makeMockElement(el.tagName, el.id, classList.toString().split(/\s+/).filter(Boolean), ownerDoc);
      for (const [k, v] of attrs.entries()) copy.setAttribute(k, v);
      return copy;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const arr = listeners.get(ev.type) || [];
      for (const fn of arr.slice()) fn(ev);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => null,
    focus() {},
    blur() {},
    scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 320, bottom: 48, width: 320, height: 48 })
  };
  return el;
}

function hydrateDomFromHtml(htmlSrc) {
  const elsById = new Map();
  const docListeners = new Map();
  const doc = {
    _registerId(id, el) {
      if (id) elsById.set(id, el);
    },
    head: null,
    body: null,
    documentElement: null,
    activeElement: null,
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: (id) => elsById.get(id) || null,
    createElement: (tag) => makeMockElement(tag, '', [], doc),
    createDocumentFragment: () => makeMockElement('FRAGMENT', '', [], doc),
    querySelector: (sel) => {
      if (sel && sel.startsWith('#') && !/\s/.test(sel)) {
        return elsById.get(sel.slice(1)) || null;
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = docListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent(ev) {
      const arr = docListeners.get(ev.type) || [];
      for (const fn of arr.slice()) fn(ev);
    }
  };

  doc.head = makeMockElement('HEAD', 'head', [], doc);
  doc.body = makeMockElement('BODY', 'body', [], doc);
  doc.documentElement = makeMockElement('HTML', 'html', [], doc);

  const tagRe = /<(header|main|section|div|nav|input|select|button|span|strong|a|iframe|img|h1|h2|form|textarea)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(htmlSrc)) !== null) {
    const tag = m[1];
    const attrs = m[2] || '';
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (elsById.has(id)) continue;
    const clsMatch = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const classes = clsMatch ? clsMatch[1].split(/\s+/).filter(Boolean) : [];
    const el = makeMockElement(tag, id, classes, doc);
    const srcMatch = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (srcMatch) el.setAttribute('src', srcMatch[1]);
    const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (hrefMatch) el.setAttribute('href', hrefMatch[1]);
    const valMatch = /\bvalue\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (valMatch) el.value = valMatch[1];
    doc.body.appendChild(el);
  }

  return { doc, elsById };
}

function createMockHistory(initialUrl) {
  const entries = [{ state: null, url: initialUrl }];
  let index = 0;
  let pushCount = 0;
  const popstateListeners = [];

  const history = {
    get length() { return entries.length; },
    get state() { return entries[index] ? entries[index].state : null; },
    pushState(state, _t, url) {
      entries.splice(index + 1);
      entries.push({ state: state === undefined ? null : structuredClone(state), url: url || entries[index].url });
      index = entries.length - 1;
      pushCount++;
    },
    replaceState(state, _t, url) {
      entries[index] = { state: state === undefined ? null : structuredClone(state), url: url || entries[index].url };
    },
    back() {
      if (index <= 0) return;
      index -= 1;
      const ev = { type: 'popstate', state: entries[index].state };
      for (const fn of popstateListeners.slice()) fn(ev);
    },
    go(delta) {
      const next = index + Number(delta || 0);
      if (next < 0 || next >= entries.length) return;
      index = next;
      const ev = { type: 'popstate', state: entries[index].state };
      for (const fn of popstateListeners.slice()) fn(ev);
    }
  };

  return {
    history,
    popstateListeners,
    pressHardwareBack() {
      if (index <= 0) return;
      index -= 1;
      const ev = { type: 'popstate', state: entries[index].state };
      for (const fn of popstateListeners.slice()) fn(ev);
    },
    getStats: () => ({ index, length: entries.length, pushCount })
  };
}

function createSharedStorage() {
  const map = new Map();
  return {
    map,
    makeView() {
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k)
      };
    }
  };
}

function rowsToCsv(rows) {
  return rows.map((r) => r.map((cell) => {
    const s = cell === null || cell === undefined ? '' : String(cell);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',')).join('\n');
}

function createFotosVm(opts = {}) {
  const clock = opts.clock || createFakeClock();
  const sharedStorage = opts.sharedStorage || createSharedStorage();
  const BroadcastChannelImpl = opts.BroadcastChannel || createSharedBroadcastBus();
  const fullUrl = opts.url || 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html';
  const parsed = new URL(fullUrl);
  const mockHist = createMockHistory(parsed.pathname + parsed.search);
  const { doc } = hydrateDomFromHtml(FOTOS_HTML_SRC);

  const filterPills = ['ALL', 'NO_PHOTO', 'HAS_PHOTO', 'IN_INV'].map((f) => {
    const b = makeMockElement('BUTTON', 'filter_' + f, f === 'ALL' ? ['filter-pill', 'active'] : ['filter-pill'], doc);
    b.setAttribute('data-filter', f);
    return b;
  });
  const jumpBtns = ['secSkuFinder', 'secProductStage', 'secGalleryInbox'].map((sec) => {
    const b = makeMockElement('BUTTON', 'jump_' + sec, sec === 'secSkuFinder' ? ['mobile-jump-btn', 'active'] : ['mobile-jump-btn'], doc);
    b.setAttribute('data-jump', sec);
    return b;
  });
  doc.querySelectorAll = (sel) => {
    if (sel === '.filter-pill[data-filter]') return filterPills;
    if (sel === '#mobileFotosJumpBar .mobile-jump-btn') return jumpBtns;
    return [];
  };

  const localStorage = sharedStorage.makeView();
  const sessionStorage = createSharedStorage().makeView();
  if (opts.unlocked !== false) {
    localStorage.setItem('creata_private_kevin_fotos_v1', JSON.stringify({
      correo: 'kevin.reyna@grupoanipa.com',
      nombre: 'Kevin Reyna',
      authToken: 'tok_kevin_valid',
      verifiedAt: clock.now()
    }));
  }

  const winListeners = new Map();
  const postedToParent = [];
  const postedToSplitChild = [];

  const splitFrame = doc.getElementById('fotosSplitCotizadorFrame');
  if (splitFrame) {
    splitFrame.contentWindow = {
      location: {
        href: 'about:blank',
        replace(u) { this.href = String(u); }
      },
      postMessage(msg) {
        postedToSplitChild.push(structuredClone(msg));
        if (opts.onPostToSplitChild) opts.onPostToSplitChild(structuredClone(msg));
      }
    };
  }

  const win = {
    console,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) super(clock.now());
        else super(...args);
      }
      static now() { return clock.now(); }
    },
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Map,
    Set,
    Promise,
    Uint8Array,
    Blob: globalThis.Blob,
    DecompressionStream: globalThis.DecompressionStream,
    Response: globalThis.Response,
    URL,
    URLSearchParams,
    AbortController,
    BroadcastChannel: BroadcastChannelImpl,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    innerWidth: opts.innerWidth || 1280,
    innerHeight: opts.innerHeight || 820,
    scrollY: 0,
    localStorage,
    sessionStorage,
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0 Chrome/126.0.0.0',
      serviceWorker: { register: () => Promise.resolve() }
    },
    history: mockHist.history,
    location: {
      protocol: parsed.protocol,
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      href: parsed.href
    },
    document: doc,
    confirm: () => true,
    matchMedia: () => ({ matches: false }),
    fetch: opts.fetch || (async () => ({
      ok: true,
      json: async () => ({ ok: true, files: [] }),
      text: async () => ''
    })),
    addEventListener(type, fn) {
      if (type === 'popstate') mockHist.popstateListeners.push(fn);
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'popstate') {
        const i = mockHist.popstateListeners.indexOf(fn);
        if (i >= 0) mockHist.popstateListeners.splice(i, 1);
      }
      const arr = winListeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) {
      const arr = winListeners.get(ev.type) || [];
      for (const fn of arr.slice()) fn(ev);
    },
    postMessage(msg) {
      const arr = winListeners.get('message') || [];
      const cloned = structuredClone(msg);
      for (const fn of arr.slice()) fn({ type: 'message', origin: win.location.origin, data: structuredClone(cloned) });
    }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.parent = opts.embeddedInParent
    ? {
        postMessage(msg) {
          postedToParent.push(structuredClone(msg));
          if (opts.onPostToParent) opts.onPostToParent(structuredClone(msg));
        }
      }
    : win;

  if (opts.CREATA_INV_GZ) {
    win.CREATA_INV_GZ = opts.CREATA_INV_GZ;
  }

  const ctx = vm.createContext(win);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(FOTOS_APP_SRC, ctx, { filename: 'fotos-productos-app.js' });

  return { win, doc, clock, mockHist, localStorage, postedToParent, postedToSplitChild };
}

async function createCotizadorVm(opts = {}) {
  const clock = opts.clock || createFakeClock();
  const sharedStorage = opts.sharedStorage || createSharedStorage();
  const BroadcastChannelImpl = opts.BroadcastChannel || createSharedBroadcastBus();
  const fullUrl = opts.url || 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html';
  const parsed = new URL(fullUrl);
  const mockHist = createMockHistory(parsed.pathname + parsed.search);
  const { doc } = hydrateDomFromHtml(INV_HTML_SRC);

  const localStorage = sharedStorage.makeView();
  const sessionStorage = createSharedStorage().makeView();
  localStorage.setItem('creata_inv_advisor_session_v1', JSON.stringify({
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
    authToken: 'tok_kevin_valid',
    sheetTab: 'PLAYA',
    branchKey: 'PLAYA',
    branchLabel: 'Playa del Carmen',
    erpStore: 'CREATA LIVING PLAYA',
    orderPrefix: 'PL',
    allLocations: [
      { correo: 'kevin.reyna@grupoanipa.com', sheetTab: 'PLAYA', branchLabel: 'Playa del Carmen', erpStore: 'CREATA LIVING PLAYA', isAdmin: true }
    ]
  }));

  const postedToParent = [];
  const postedToSplitChild = [];
  const splitFrame = doc.getElementById('invSplitFotosFrame');
  if (splitFrame) {
    splitFrame.contentWindow = {
      location: {
        href: 'about:blank',
        replace(u) { this.href = String(u); }
      },
      postMessage(msg) {
        postedToSplitChild.push(structuredClone(msg));
        if (opts.onPostToSplitChild) opts.onPostToSplitChild(structuredClone(msg));
      }
    };
  }

  const winListeners = new Map();
  const win = {
    document: doc,
    location: {
      href: parsed.href,
      origin: parsed.origin,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      replace(next) { this.href = String(next); }
    },
    history: mockHist.history,
    localStorage,
    sessionStorage,
    innerWidth: opts.innerWidth || 1280,
    innerHeight: opts.innerHeight || 820,
    isSecureContext: true,
    navigator: { userAgent: 'Mozilla/5.0 Chrome/126.0.0.0' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    scrollTo() {},
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    setInterval: () => 999999,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => clock.setTimer(fn, 16),
    cancelAnimationFrame: clock.clearTimer,
    fetch: opts.fetch || (() => new Promise(() => {})),
    BroadcastChannel: BroadcastChannelImpl,
    URL,
    URLSearchParams,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) super(clock.now());
        else super(...args);
      }
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
    },
    postMessage(msg) {
      const arr = winListeners.get('message') || [];
      const cloned = structuredClone(msg);
      for (const fn of arr.slice()) fn({ type: 'message', origin: win.location.origin, data: structuredClone(cloned) });
    }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.parent = opts.embeddedInParent
    ? {
        postMessage(msg) {
          postedToParent.push(structuredClone(msg));
          if (opts.onPostToParent) opts.onPostToParent(structuredClone(msg));
        }
      }
    : win;

  win.CREATA_INV_DATA = opts.sampleProducts || [
    {
      s: 'SKU-SALA-01',
      tp: 'SALA',
      mo: 'MILAN',
      n: 'SALA MILAN 3P LINO BEIGE',
      vr: '3P',
      f: '',
      c: 'SALAS',
      tl: 'LINO',
      ct: 'BEIGE',
      md: 'PAROTA',
      cm: 'NATURAL',
      mt: '',
      m: '220x95x80',
      fe: '',
      st: [2, 3, 1, 0, 0, 0, 2, 0, 0, 4, 1],
      pr: '$24,900.00'
    },
    {
      s: 'SKU-COM-02',
      tp: 'COMEDOR',
      mo: 'VERONA',
      n: 'COMEDOR VERONA 6P PAROTA',
      vr: '6P',
      f: 'https://drive.google.com/file/d/ExistingPhotoFileId_002/view?usp=sharing',
      c: 'COMEDORES',
      tl: '',
      ct: '',
      md: 'PAROTA',
      cm: 'TABACO',
      mt: '',
      m: '180x100x76',
      fe: '',
      st: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1],
      pr: '$31,500.00'
    }
  ];

  const ctx = vm.createContext(win);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(SEG_APP_SRC, ctx, { filename: 'seguimiento-app.js' });
  vm.runInContext(HIST_APP_SRC, ctx, { filename: 'historial-app.js' });
  vm.runInContext(INV_APP_SRC, ctx, { filename: 'inventario-app.js' });

  doc.dispatchEvent({ type: 'DOMContentLoaded' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  clock.advanceTime(120);

  return { win, doc, clock, mockHist, localStorage, postedToParent, postedToSplitChild };
}

test('LINK-1: App de Fotos loads INVENTARIO_EN_VIVO!A1:AX5500 + LPPT Proveedores (read-only), renders all 11 official Ubicaciones, filters by location, and unwinds sku_location on Back', async () => {
  const fetchedUrls = [];

  // Build INVENTARIO_EN_VIVO header A..AX (50 columns) matching official Google Sheet layout
  const invHeader = new Array(50).fill('');
  invHeader[0] = 'SKU';
  invHeader[1] = 'TIPO';
  invHeader[2] = 'MODELO';
  invHeader[3] = 'NOMBRE DEL PRODUCTO';
  invHeader[4] = 'VARIANTE';
  invHeader[5] = 'FOTO';
  invHeader[6] = 'CATEGORIA';
  invHeader[7] = 'TELA';
  invHeader[8] = 'COLOR TELA';
  invHeader[9] = 'MADERA';
  invHeader[10] = 'COLOR MADERA';
  invHeader[11] = 'MATERIAL';
  invHeader[12] = 'MEDIDAS';
  invHeader[15] = 'LPPT';
  invHeader[16] = 'FECHA ESTIMADA DE LLEGADA';
  invHeader[20] = 'CEDIS (BODEGA)';
  invHeader[21] = 'CEDIS (PISO)';
  invHeader[22] = 'CASA CREATA (BODEGA)';
  invHeader[23] = 'CASA CREATA (PISO)';
  invHeader[24] = 'PUERTO CANCUN (BODEGA)';
  invHeader[25] = 'PUERTO CANCUN (PISO)';
  invHeader[26] = 'COLOSIO (BODEGA)';
  invHeader[27] = 'COLOSIO (PISO)';
  invHeader[28] = 'PLAYA (BODEGA)';
  invHeader[29] = 'PLAYA (PISO)';
  invHeader[48] = 'PRECIO DE LISTA';

  const rowSala = new Array(50).fill('');
  rowSala[0] = 'SKU-SALA-01';
  rowSala[1] = 'SALA';
  rowSala[2] = 'MILAN';
  rowSala[3] = 'SALA MILAN 3P';
  rowSala[4] = '3P';
  rowSala[5] = '';
  rowSala[6] = 'SALAS';
  rowSala[7] = 'LINO';
  rowSala[12] = '220x95';
  rowSala[15] = '1'; // overridden by live LPPT Proveedores (5 free = 7 cant - 2 reserved)
  rowSala[20] = '3'; // CEDIS BODEGA
  rowSala[25] = '1'; // PUERTO CANCUN PISO
  rowSala[28] = '4'; // PLAYA BODEGA
  rowSala[48] = '24900';

  const rowZero = new Array(50).fill('');
  rowZero[0] = 'SKU-MESA-ZERO';
  rowZero[1] = 'MESA DE CENTRO';
  rowZero[2] = 'OSLO';
  rowZero[3] = 'MESA CENTRO OSLO';
  rowZero[6] = 'MESA DE CENTRO';
  rowZero[48] = '8900';

  const sheet1Rows = [
    ['SKU', 'NOMBRE', 'CAT', 'FOTO'],
    ['SKU-SALA-01', 'SALA MILAN 3P', 'SALAS', ''],
    ['SKU-MESA-ZERO', 'MESA CENTRO OSLO', 'MESA DE CENTRO', '']
  ];

  // LPPT Proveedores read-only CSV (rows start at index 2; OC=[3], FCOMP=[5], CANT=[6], NOM=[8], SKU=[9], COM_ASES=[19])
  const lpptRow = new Array(21).fill('');
  lpptRow[3] = 'OC-7788';
  lpptRow[5] = '10/12/2026'; // +14 buffer => 24/12/2026
  lpptRow[6] = '7';
  lpptRow[8] = 'SALA MILAN 3P';
  lpptRow[9] = 'SKU-SALA-01';
  lpptRow[19] = 'APARTADO (2)'; // 7 - 2 = 5 free LPPT units

  const lpptOnlyRow = new Array(21).fill('');
  lpptOnlyRow[3] = 'OC-9900';
  lpptOnlyRow[5] = '01/12/2026'; // +14 buffer => 15/12/2026
  lpptOnlyRow[6] = '2';
  lpptOnlyRow[8] = 'SILLON LPPT TRANSITO';
  lpptOnlyRow[9] = 'SKU-LPPT-ONLY';

  const fotosVm = createFotosVm({
    fetch: async (url, init) => {
      const u = String(url);
      fetchedUrls.push({ url: u, method: (init && init.method) || 'GET' });
      if (u.includes('1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE')) {
        assert.equal((init && init.method) || 'GET', 'GET', 'LPPT Proveedores must strictly use read-only GET');
        return { ok: true, text: async () => rowsToCsv([new Array(21).fill('TITLE'), new Array(21).fill('HDR'), lpptRow, lpptOnlyRow]) };
      }
      if (u.includes('INVENTARIO_EN_VIVO')) {
        assert.match(u, /A1%3AAX5500|A1:AX5500/, 'Must request INVENTARIO_EN_VIVO through column AX');
        return { ok: true, text: async () => rowsToCsv([invHeader, rowSala, rowZero]) };
      }
      if (u.includes('gid=620514545') || u.includes('sheet=1')) {
        return { ok: true, text: async () => rowsToCsv(sheet1Rows) };
      }
      return { ok: true, json: async () => ({ ok: true, files: [] }), text: async () => '' };
    }
  });

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  fotosVm.clock.advanceTime(400);

  // Verify LPPT Proveedores was queried via read-only GET and INVENTARIO_EN_VIVO!A1:AX5500 was fetched
  assert.ok(fetchedUrls.some((f) => f.url.includes('1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE') && f.method === 'GET'));
  assert.ok(fetchedUrls.some((f) => f.url.includes('INVENTARIO_EN_VIVO')));

  // Location filter bar rendered with En Cotizador (2 quotable SKUs: SKU-SALA-01 and SKU-LPPT-ONLY) and individual warehouses
  const locRowHtml = fotosVm.doc.getElementById('skuLocationFilterRow').innerHTML;
  assert.match(locRowHtml, /En Cotizador<\/span><span class="cat-cnt">2<\/span>/);
  assert.match(locRowHtml, /CEDIS Bod\.<\/span><span class="cat-cnt">1<\/span>/);
  assert.match(locRowHtml, /Pto\. Cancún Piso<\/span><span class="cat-cnt">1<\/span>/);
  assert.match(locRowHtml, /Playa Bod\.<\/span><span class="cat-cnt">1<\/span>/);
  assert.match(locRowHtml, /LPPT<\/span><span class="cat-cnt">2<\/span>/);

  // Select SKU-SALA-01 and inspect 11-warehouse stage breakdown
  fotosVm.win.selectSkuProduct('SKU-SALA-01');
  const summaryText = fotosVm.doc.getElementById('selLocationsSummaryBadge').textContent;
  const gridHtml = fotosVm.doc.getElementById('selLocationsGrid').innerHTML;
  assert.match(summaryText, /Bodega\/Piso: 8/); // 3 + 1 + 4 = 8
  assert.match(summaryText, /LPPT: 5/);         // 7 - 2 = 5
  assert.match(summaryText, /\$24,900\.00/);

  // Count all 11 official location chips in #selLocationsGrid
  const chipMatches = gridHtml.match(/class="loc-stock-chip\b/g) || [];
  assert.equal(chipMatches.length, 11, 'Stage must render all 11 official locations (LPPT + 10 Bodega/Piso)');
  assert.match(gridHtml, /24\/12\/2026/, 'LPPT chip must show +14-day buffered arrival date');

  // Filter by En Cotizador (QUOTABLE) -> excludes SKU-MESA-ZERO (0 stock everywhere)
  fotosVm.win.setSkuLocationFilter('QUOTABLE');
  const quotableListHtml = fotosVm.doc.getElementById('skuResultsList').innerHTML;
  assert.match(quotableListHtml, /SKU-SALA-01/);
  assert.match(quotableListHtml, /SKU-LPPT-ONLY/);
  assert.doesNotMatch(quotableListHtml, /SKU-MESA-ZERO/);

  // Filter by WH_9 (PLAYA BODEGA) -> shows only SKU-SALA-01
  fotosVm.win.setSkuLocationFilter('WH_9');
  const playaListHtml = fotosVm.doc.getElementById('skuResultsList').innerHTML;
  assert.match(playaListHtml, /SKU-SALA-01/);
  assert.doesNotMatch(playaListHtml, /SKU-LPPT-ONLY/);
  assert.doesNotMatch(playaListHtml, /SKU-MESA-ZERO/);

  // Clear selected SKU, then press hardware Back -> unwinds sku_location back to 'ALL'
  fotosVm.win.clearSelectedSku();
  fotosVm.mockHist.pressHardwareBack();
  const restoredListHtml = fotosVm.doc.getElementById('skuResultsList').innerHTML;
  assert.match(restoredListHtml, /SKU-MESA-ZERO/, 'Hardware Back must reset skuLocationFilter to ALL');
});

test('LINK-2: App de Fotos unpacks real top-level 21-column window.CREATA_INV_GZ bundle (photos + 11 Ubicaciones + price + arrival date) when offline', async () => {
  const cols = new Array(21).fill(null).map(() => []);
  // Row 0: SKU-GZ-100 with photo and stocks matching exact inventario-data-1/2/3.js layout
  cols[0].push('SKU-GZ-100');
  cols[1].push('RECAMARA');
  cols[2].push('CAPRI');
  cols[3].push('RECAMARA CAPRI KING');
  cols[4].push('KING');
  cols[5].push('https://drive.google.com/file/d/GzPhotoDriveFile_777/view?usp=sharing');
  cols[6].push('RECAMARAS');
  cols[7].push('TERCIOPELO');
  cols[8].push('GRIS');
  cols[9].push('ENCINO');
  cols[10].push('NOGAL');
  cols[11].push('');
  cols[12].push('200x200');
  cols[13].push('CREATA');
  cols[14].push(2);
  cols[15].push([3, 0, 0, 2, 1, 0, 0, 0, 0, 5, 0]);
  cols[16].push('$19,800.00');
  cols[17].push('18/01/2027');
  cols[18].push('OC-101');
  cols[19].push('18/01/2027');
  cols[20].push(2);

  const gzBase64 = zlib.gzipSync(Buffer.from(JSON.stringify(cols), 'utf8')).toString('base64');

  const fotosVm = createFotosVm({
    CREATA_INV_GZ: gzBase64,
    fetch: async () => ({ ok: false, status: 503, text: async () => '', json: async () => ({ ok: false }) })
  });

  // Allow Web Streams DecompressionStream('gzip') promise pipeline to settle
  await new Promise((r) => setTimeout(r, 30));
  fotosVm.clock.advanceTime(300);

  fotosVm.win.selectSkuProduct('SKU-GZ-100');
  const stageSku = fotosVm.doc.getElementById('selColASku').textContent;
  const curCanvas = fotosVm.doc.getElementById('curPhotoCanvas').innerHTML;
  const summary = fotosVm.doc.getElementById('selLocationsSummaryBadge').textContent;
  const grid = fotosVm.doc.getElementById('selLocationsGrid').innerHTML;

  assert.equal(stageSku, 'SKU-GZ-100');
  assert.match(curCanvas, /GzPhotoDriveFile_777/, 'Columnar GZ photo cols[5] must hydrate into App de Fotos');
  assert.match(summary, /Bodega\/Piso: 8/); // 2 + 1 + 5 = 8
  assert.match(summary, /LPPT: 3/);
  assert.match(summary, /\$19,800\.00/);
  assert.match(grid, /18\/01\/2027/);
});

test('LINK-3: Real-time photo save & delete in App de Fotos immediately updates Cotizador (split postMessage, BroadcastChannel, and localStorage overrides) without ReferenceError', async () => {
  const clock = createFakeClock();
  const sharedStorage = createSharedStorage();
  const BroadcastChannel = createSharedBroadcastBus();

  const inboxSampleFile = {
    id: 'AssignedDrivePhotoId_555',
    name: 'sala_milan_nueva.jpg',
    viewUrl: 'https://drive.google.com/file/d/AssignedDrivePhotoId_555/view?usp=sharing',
    sizeBytes: 42000
  };

  // Seed fast cache in shared storage with an inbox file ready to assign to SKU-SALA-01
  sharedStorage.map.set('creata_fotos_fast_cache_v6', JSON.stringify({
    ts: clock.now(),
    p: [
      ['SKU-SALA-01', 'SALA MILAN 3P LINO BEIGE', 'SALA MILAN 3P LINO BEIGE', '', 2, 1, 1, 'SALAS', 'SALA', '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', 'MILAN', '3P', '220x95x80', 'LINO', [2, 3, 1, 0, 0, 0, 2, 0, 0, 4, 1], '$24,900.00', ''],
      ['SKU-COM-02', 'COMEDOR VERONA 6P PAROTA', 'COMEDOR VERONA 6P PAROTA', 'https://drive.google.com/file/d/ExistingPhotoFileId_002/view?usp=sharing', 3, 1, 1, 'COMEDORES', 'COMEDOR', '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', 'VERONA', '6P', '180x100x76', 'PAROTA', [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1], '$31,500.00', '']
    ],
    inb: [inboxSampleFile],
    fn: []
  }));

  let cotizadorVm;
  const fotosVm = createFotosVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    embeddedInParent: true,
    onPostToParent: (msg) => {
      if (cotizadorVm) cotizadorVm.win.postMessage(msg);
    },
    fetch: async (_url, init) => {
      if (init && init.method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        if (body.action === 'fotos_subir_list') {
          return { ok: true, json: async () => ({ ok: true, files: [inboxSampleFile] }) };
        }
        if (body.action === 'fotos_subir_assign') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              rowNumber: 2,
              fileId: 'AssignedDrivePhotoId_555',
              photoUrl: 'https://drive.google.com/file/d/AssignedDrivePhotoId_555/view?usp=sharing',
              destFolderUrl: 'https://drive.google.com/drive/folders/1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb'
            })
          };
        }
        if (body.action === 'fotos_delete') {
          return { ok: true, json: async () => ({ ok: true }) };
        }
      }
      return { ok: true, json: async () => ({ ok: true, files: [inboxSampleFile] }), text: async () => '' };
    }
  });

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  cotizadorVm = await createCotizadorVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?splitFotos=1'
  });

  // Open SKU-SALA-01 detail modal in Cotizador (starts WITHOUT photo -> #detPhotoEmpty visible)
  assert.equal(cotizadorVm.win.openProductDetail('SKU-SALA-01', false, true), true);
  assert.equal(cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), false);

  // 1) Cross-window ephemeral blob: URLs must be ignored by Cotizador (never poison crossOrigin=anonymous canvas)
  cotizadorVm.win.postMessage({
    type: 'CREATA_SPLIT_PHOTO_SAVED',
    sku: 'SKU-SALA-01',
    photoUrl: 'blob:https://ikerreyna3942-debug.github.io/fake-uuid',
    fileId: ''
  });
  assert.equal(cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), false, 'Cotizador must ignore cross-window blob: URLs');

  // 2) Assign real photo in App de Fotos -> notifies Cotizador in real time
  fotosVm.win.selectSkuProduct('SKU-SALA-01');
  fotosVm.win.selectInboxPhoto('AssignedDrivePhotoId_555');
  await fotosVm.win.assignSelectedPhotoToProduct();
  clock.advanceTime(100);

  // Detail modal in Cotizador immediately shows the new photo (#detPhotoEmpty hidden) without reload
  assert.equal(
    cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'),
    true,
    'Cotizador detail empty placeholder must hide immediately when photo is saved in App de Fotos'
  );
  const savedOverridesRaw = sharedStorage.map.get('creata_fotos_saved_overrides_v1') || '[]';
  assert.match(savedOverridesRaw, /AssignedDrivePhotoId_555/);
  assert.doesNotMatch(savedOverridesRaw, /blob:/);

  // 3) Delete loaded photo on SKU-COM-02 in App de Fotos -> notifies Cotizador with deleted:true and clears photo in Cotizador
  assert.equal(cotizadorVm.win.openProductDetail('SKU-COM-02', false, true), true);
  assert.equal(cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), true, 'SKU-COM-02 initially has a photo in Cotizador');

  await fotosVm.win.deleteLoadedPhotoBySku('SKU-COM-02', 'ExistingPhotoFileId_002');
  clock.advanceTime(100);

  assert.equal(
    cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'),
    false,
    'Deleting photo in App de Fotos must clear photo in Cotizador in real time'
  );
});

test('LINK-4: Bidirectional SKU selection works in BOTH split-screen directions without history bloat or ping-pong loops, plus ?sku= deep link and storage sync', async () => {
  const clock = createFakeClock();
  const sharedStorage = createSharedStorage();
  const BroadcastChannel = createSharedBroadcastBus();

  // Case A: App de Fotos is PARENT, Cotizador is CHILD iframe (?embed=1, _invSplitActive === false)
  let embeddedCotizador;
  let parentFotos;
  let messagesCount = 0;

  parentFotos = createFotosVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html?sku=SKU-COM-02',
    onPostToSplitChild: (msg) => {
      messagesCount++;
      assert.ok(messagesCount < 10, 'Must never enter a postMessage ping-pong loop');
      if (embeddedCotizador) embeddedCotizador.win.postMessage(msg);
    }
  });

  // Verify ?sku=SKU-COM-02 pre-selected SKU-COM-02 on boot in App de Fotos
  assert.equal(parentFotos.doc.getElementById('selColASku').textContent, 'SKU-COM-02');

  embeddedCotizador = await createCotizadorVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    embeddedInParent: true,
    url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?embed=1',
    onPostToParent: (msg) => {
      messagesCount++;
      assert.ok(messagesCount < 10, 'Must never enter a postMessage ping-pong loop');
      parentFotos.win.postMessage(msg);
    }
  });

  // 1) Clicking "Ver en Cotizador" in App de Fotos opens split dock AND opens SKU-COM-02 detail in embedded Cotizador
  parentFotos.win.openSelectedSkuInCotizador();
  clock.advanceTime(550);
  assert.equal(parentFotos.doc.getElementById('fotosSplitCotizadorDock').classList.contains('hidden'), false, 'Split Cotizador dock must open');
  assert.equal(embeddedCotizador.doc.getElementById('productDetailModal').classList.contains('open'), true, 'Cotizador detail modal must open on SKU from App de Fotos');
  assert.match(embeddedCotizador.doc.getElementById('detSku').textContent, /SKU-COM-02/);

  // 2) Now user clicks SKU-SALA-01 inside embedded Cotizador -> parent App de Fotos receives SKU + 11-warehouse meta and updates stage with 0 history pushes
  const pushBefore = parentFotos.mockHist.getStats().pushCount;
  assert.equal(embeddedCotizador.win.openProductDetail('SKU-SALA-01', false), true);
  assert.equal(parentFotos.doc.getElementById('selColASku').textContent, 'SKU-SALA-01', 'Embedded Cotizador must sync selected SKU up to parent App de Fotos');
  assert.match(parentFotos.doc.getElementById('selLocationsSummaryBadge').textContent, /Bodega\/Piso: 11/, 'Live 11-location stock meta from Cotizador must hydrate into App de Fotos');
  assert.equal(parentFotos.mockHist.getStats().pushCount, pushBefore, 'Incoming peer SKU sync must not bloat browser history');

  // 3) Upload modal link in Cotizador includes ?sku=SKU-SALA-01
  embeddedCotizador.win.openUploadPhotoModal('SKU-SALA-01');
  const appFotosLink = embeddedCotizador.doc.getElementById('uploadPhotoAppFotosLink');
  assert.equal(appFotosLink.getAttribute('href'), './fotos-productos.html?sku=SKU-SALA-01');

  // 4) Cross-tab storage event updates standalone Cotizador immediately when creata_fotos_saved_overrides_v1 changes
  const standaloneStorage = createSharedStorage();
  const standaloneCotizador = await createCotizadorVm({
    clock,
    sharedStorage: standaloneStorage
  });
  assert.equal(standaloneCotizador.win.openProductDetail('SKU-SALA-01', false, true), true);
  assert.equal(standaloneCotizador.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), false);

  standaloneStorage.map.set('creata_fotos_saved_overrides_v1', JSON.stringify([
    {
      sku: 'SKU-SALA-01',
      newUrl: 'https://drive.google.com/file/d/CrossTabSavedPhoto_888/view?usp=sharing',
      fileId: 'CrossTabSavedPhoto_888',
      ts: clock.now()
    }
  ]));
  standaloneCotizador.win.dispatchEvent({
    type: 'storage',
    key: 'creata_fotos_saved_overrides_v1'
  });

  assert.equal(
    standaloneCotizador.doc.getElementById('detPhotoEmpty').classList.contains('hidden'),
    true,
    'Cross-tab storage event must hydrate saved photo override into standalone Cotizador immediately'
  );
});

test('LINK-5: App de Fotos refuses legacy plaintext accessKey replay on expired token (P0-07), authenticates via inv_login to load Drive SUBIR PREN (11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p), AND reads local PC folder with deduplication', async () => {
  const clock = createFakeClock();
  const sharedStorage = createSharedStorage();

  // Simulate expired authToken + legacy plaintext accessKey in localStorage (P0-07: must NEVER auto-replay plaintext accessKey!)
  sharedStorage.map.set('creata_private_kevin_fotos_v1', JSON.stringify({
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'Kevin Reyna',
    authToken: 'stale_expired_token',
    accessKey: 'KEVIN2026',
    verifiedAt: clock.now()
  }));

  const driveSubirPrenFiles = [
    {
      id: '16MjrOynaZahLUKU86UHPDxKX60YEaepH',
      name: 'ATXSILENLBPED SILLA ENNA PINO LACA BELLOTA G2 PEARL DRILL.jpg',
      viewUrl: 'https://drive.google.com/file/d/16MjrOynaZahLUKU86UHPDxKX60YEaepH/view?usp=sharing',
      sizeBytes: 405289
    }
  ];
  const uploadedToDriveInbox = [];
  let loginRenewCalls = 0;

  const fotosVm = createFotosVm({
    clock,
    sharedStorage,
    unlocked: false, // use the custom session seeded above
    fetch: async (_url, init) => {
      if (init && init.method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        if (body.action === 'inv_login' && body.accessKey === 'KEVIN2026') {
          loginRenewCalls++;
          return {
            ok: true,
            json: async () => ({
              ok: true,
              user: {
                correo: 'kevin.reyna@grupoanipa.com',
                nombre: 'Kevin Reyna',
                isAdmin: true,
                authToken: 'fresh_hmac_token_999',
                adminPermissions: { fotosApp: true }
              },
              locations: [{ correo: 'kevin.reyna@grupoanipa.com', authToken: 'fresh_hmac_token_999' }]
            })
          };
        }
        if (body.action === 'fotos_subir_list') {
          if (body.authToken !== 'fresh_hmac_token_999') {
            return { ok: true, json: async () => ({ ok: false, authRequired: true }) };
          }
          return { ok: true, json: async () => ({ ok: true, inboxFolderId: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p', files: driveSubirPrenFiles }) };
        }
        if (body.action === 'fotos_subir_upload_inbox') {
          uploadedToDriveInbox.push(body.fileName);
          return {
            ok: true,
            json: async () => ({
              ok: true,
              file: {
                id: 'UploadedFromLocalGDriveDesktop_001',
                name: body.fileName,
                viewUrl: 'https://drive.google.com/file/d/UploadedFromLocalGDriveDesktop_001/view?usp=sharing'
              }
            })
          };
        }
      }
      return { ok: true, json: async () => ({ ok: true, files: [] }), text: async () => '' };
    }
  });

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  clock.advanceTime(200);

  // 1) P0-07: Must NOT silently replay plaintext accessKey from localStorage on expired token
  assert.equal(loginRenewCalls, 0, 'Must NOT replay legacy plaintext accessKey from localStorage (P0-07)');

  // 2) Explicit login via form mints fresh HMAC token without persisting plaintext accessKey and loads Drive SUBIR PREN
  fotosVm.doc.getElementById('ownerEmailInput').value = 'kevin.reyna@grupoanipa.com';
  fotosVm.doc.getElementById('ownerPasswordInput').value = 'KEVIN2026';
  await fotosVm.win.submitOwnerFotosLogin();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  clock.advanceTime(200);

  assert.equal(loginRenewCalls, 1, 'Explicit login must authenticate via inv_login');
  const savedRaw = sharedStorage.map.get('creata_private_kevin_fotos_v1') || '';
  assert.ok(!savedRaw.includes('KEVIN2026'), 'Persisted session must NEVER contain plaintext accessKey (P0-07)');
  assert.equal(fotosVm.doc.getElementById('inboxHeaderBadge').textContent, '1');
  assert.match(fotosVm.doc.getElementById('inboxGalleryContainer').innerHTML, /16MjrOynaZahLUKU86UHPDxKX60YEaepH/);
  assert.equal(
    fotosVm.doc.getElementById('linkOpenDriveSubirPren').getAttribute('href'),
    'https://drive.google.com/drive/folders/11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'
  );

  // 2) Mock window.showDirectoryPicker for G:\Mi unidad\DOC ANIPA\Fotos general\Fotos de del proyeto\SUBIR PREN
  //    containing 1 file already in Drive (must NOT duplicate) + 1 brand-new file (must stage & upload)
  fotosVm.win.FileReader = class MockFileReader {
    readAsDataURL(file) {
      this.result = 'data:image/jpeg;base64,dGVzdA==';
      if (typeof this.onload === 'function') this.onload();
    }
  };
  fotosVm.win.showDirectoryPicker = async () => ({
    name: 'SUBIR PREN',
    queryPermission: async () => 'granted',
    async *values() {
      yield {
        kind: 'file',
        getFile: async () => ({ name: 'ATXSILENLBPED SILLA ENNA PINO LACA BELLOTA G2 PEARL DRILL.jpg', type: 'image/jpeg', size: 12000 })
      };
      yield {
        kind: 'file',
        getFile: async () => ({ name: 'SKU-SALA-01 SALA MILAN NUEVA.jpg', type: 'image/jpeg', size: 15000 })
      };
    }
  });

  await fotosVm.win.loadFromLocalSubirPrenFolder(false);
  await new Promise((r) => setImmediate(r));
  clock.advanceTime(200);

  assert.deepEqual(uploadedToDriveInbox, ['SKU-SALA-01 SALA MILAN NUEVA.jpg'], 'Must upload only brand-new file and deduplicate already-synced SUBIR PREN file');
  assert.equal(fotosVm.doc.getElementById('inboxHeaderBadge').textContent, '2');
});

test('LINK-6: Cotizador (#uploadPhotoModal) loads Drive SUBIR PREN (11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p) and assigns photo directly to Hoja 1 + live Cotizador & App de Fotos', async () => {
  const clock = createFakeClock();
  const sharedStorage = createSharedStorage();
  const BroadcastChannel = createSharedBroadcastBus();

  sharedStorage.map.set('creata_fotos_fast_cache_v6', JSON.stringify({
    ts: clock.now(),
    p: [
      ['SKU-SALA-01', 'SALA MILAN 3P LINO BEIGE', 'SALA MILAN 3P LINO BEIGE', '', 2, 1, 1, 'SALAS', 'SALA', '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', 'MILAN', '3P', '220x95x80', 'LINO', [2, 3, 1, 0, 0, 0, 2, 0, 0, 4, 1], '$24,900.00', '']
    ],
    inb: [],
    fn: []
  }));

  const fotosPeer = createFotosVm({
    clock,
    sharedStorage,
    BroadcastChannel
  });
  fotosPeer.win.selectSkuProduct('SKU-SALA-01');

  let assignPayloadReceived = null;
  const cotizadorVm = await createCotizadorVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    fetch: async (_url, init) => {
      if (init && init.method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        if (body.action === 'fotos_subir_list') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              inboxFolderId: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p',
              files: [
                {
                  id: 'DriveSubirPrenSala01_ID',
                  name: 'SKU-SALA-01 SALA MILAN LINO BEIGE.jpg',
                  thumbUrl: 'https://lh3.googleusercontent.com/d/DriveSubirPrenSala01_ID=w320'
                }
              ]
            })
          };
        }
        if (body.action === 'fotos_subir_assign') {
          assignPayloadReceived = body;
          return {
            ok: true,
            json: async () => ({
              ok: true,
              fileId: 'DriveSubirPrenSala01_ID',
              photoUrl: 'https://drive.google.com/file/d/DriveSubirPrenSala01_ID/view?usp=sharing'
            })
          };
        }
      }
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  // Open detail modal & upload modal for SKU-SALA-01 in Cotizador
  assert.equal(cotizadorVm.win.openProductDetail('SKU-SALA-01', false, true), true);
  assert.equal(cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), false);

  cotizadorVm.win.openUploadPhotoModal('SKU-SALA-01');
  assert.equal(cotizadorVm.doc.getElementById('uploadPhotoSubirPrenSources').classList.contains('hidden'), false, 'Kevin must see SUBIR PREN PC & Drive sources in Cotizador upload modal');

  // Load Drive SUBIR PREN inside Cotizador upload modal -> auto-selects matching SKU-SALA-01 photo!
  await cotizadorVm.win.loadDriveSubirPrenInCotizador(true);
  assert.match(cotizadorVm.doc.getElementById('uploadPhotoDriveInboxGrid').innerHTML, /DriveSubirPrenSala01_ID/);
  assert.equal(cotizadorVm.doc.getElementById('uploadPhotoCountLabel').textContent, '1 de Drive SUBIR PREN');

  // Click Subir a categoría -> assigns Drive SUBIR PREN photo to SKU-SALA-01, updates Cotizador AND syncs to App de Fotos!
  await cotizadorVm.win.submitMultiProductPhotos();
  clock.advanceTime(100);

  assert.ok(assignPayloadReceived, 'Must call fotos_subir_assign for selected Drive SUBIR PREN file');
  assert.equal(assignPayloadReceived.sku, 'SKU-SALA-01');
  assert.equal(assignPayloadReceived.driveFileId, 'DriveSubirPrenSala01_ID');
  assert.equal(cotizadorVm.doc.getElementById('detPhotoEmpty').classList.contains('hidden'), true, 'Cotizador detail photo must update immediately');
  assert.match(fotosPeer.doc.getElementById('curPhotoCanvas').innerHTML, /DriveSubirPrenSala01_ID/, 'App de Fotos must also receive real-time photo update via BroadcastChannel');
});

test('LINK-7: App de Fotos auto-clears selected product on save, never switches selected SKU when picking inbox photo, shows exact uploaded filename in Cargadas, and matches uploaded fabrics on existing SKUs', async () => {
  const clock = createFakeClock();
  const sharedStorage = createSharedStorage();
  const BroadcastChannel = createSharedBroadcastBus();

  sharedStorage.map.set('creata_fotos_fast_cache_v6', JSON.stringify({
    ts: clock.now(),
    p: [
      ['SKU-SALA-01', 'SALA MILAN 3P', 'SALA MILAN 3P', '', 2, 1, 1, 'SALAS', 'SALA', '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', 'MILAN', '3P', '220x95', 'LINO BEIGE', [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], '$24,900', '', 'LINO', 'BEIGE'],
      ['SKU-COM-02', 'COMEDOR ALBA', 'COMEDOR ALBA', '', 3, 1, 1, 'COMEDORES', 'COMEDOR', '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', 'ALBA', '6P', '180x100', 'PAROTA', [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], '$19,500', '', '', '']
    ],
    inb: [
      { id: 'DriveInboxComedor_01', name: 'SKU-COM-02 Foto Original Alba.jpg', sizeBytes: 12000, viewUrl: 'https://drive.google.com/file/d/DriveInboxComedor_01/view?usp=sharing' }
    ],
    fn: []
  }));
  sharedStorage.map.set('creata_inv_product_overrides_v1', JSON.stringify({
    'VFAB:LINO BEIGE': {
      sku: 'VFAB:LINO BEIGE',
      status: 'VISIBLE',
      name: 'LINO BEIGE',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1FabricLinoBeigeTest99/view?usp=sharing'
    }
  }));

  const fotosVm = createFotosVm({
    clock,
    sharedStorage,
    BroadcastChannel,
    customFetch: async (_url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : {};
      if (body.action === 'fotos_subir_assign') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            fileId: body.driveFileId,
            fileName: 'SKU-COM-02 Foto Original Alba.jpg',
            newUrl: 'https://drive.google.com/file/d/' + body.driveFileId + '/view?usp=sharing',
            rowNumber: 2,
            destFolderId: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb',
            destFolderName: 'FOTOS SALAS'
          })
        };
      }
      if (body.action === 'fotos_subir_list') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            files: [{ id: 'DriveInboxComedor_01', name: 'SKU-COM-02 Foto Original Alba.jpg', sizeBytes: 12000 }],
            loadedFileNames: { DriveInboxComedor_01: 'SKU-COM-02 Foto Original Alba.jpg' }
          })
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  // 1) Selecting SKU-SALA-01 shows linked uploaded fabric chip automatically
  fotosVm.win.selectSkuProduct('SKU-SALA-01');
  assert.equal(fotosVm.doc.getElementById('selColASku').textContent, 'SKU-SALA-01');
  const fabChip = fotosVm.doc.getElementById('skuLinkedFabricChip');
  assert.equal(fabChip.classList.contains('hidden'), false, 'Uploaded VFAB:LINO BEIGE must attach automatically to SKU-SALA-01');
  assert.match(fabChip.innerHTML, /LINO BEIGE/);

  // 2) Picking an inbox photo named "SKU-COM-02 ..." while SKU-SALA-01 is ALREADY selected MUST NOT silently switch SKU!
  fotosVm.win.selectInboxPhoto('DriveInboxComedor_01');
  assert.equal(fotosVm.doc.getElementById('selColASku').textContent, 'SKU-SALA-01', 'Selected SKU must NEVER switch silently on inbox photo click');

  // 3) Saving photo immediately auto-clears the selected SKU so it cannot be overwritten by mistake
  await fotosVm.win.assignSelectedPhotoToProduct();
  assert.equal(fotosVm.doc.getElementById('selColASku').textContent, '—', 'Selected SKU must auto-clear immediately after saving');
  assert.equal(fotosVm.doc.getElementById('btnClearSelectedSku').classList.contains('hidden'), true);

  // 4) Switching to Cargadas tab shows exact original uploaded fileName
  fotosVm.win.setGalleryMode('LOADED');
  const loadedHtml = fotosVm.doc.getElementById('inboxGalleryContainer').innerHTML;
  assert.match(loadedHtml, /SKU-COM-02 Foto Original Alba\.jpg/, 'Cargadas tab must show exact uploaded filename');
});


