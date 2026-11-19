import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BACK_NAV_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');
const FOTOS_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
const FOTOS_HTML_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
const FOTOS_CSS_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-styles.css'), 'utf8');
const FOTOS_SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-sw.js'), 'utf8');
const FOTOS_MANIFEST_SRC = fs.readFileSync(path.join(REPO_ROOT, 'fotos-manifest.json'), 'utf8');

function createFakeClock(startMs = 1_700_000_000_000) {
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

  return {
    now: () => nowMs,
    setTimer,
    clearTimer,
    advanceTime
  };
}

function createMockHistory(opts = {}) {
  const initialUrl = opts.url || '/MCP-REPOCITORIO/fotos-productos.html';
  const chrome124Skippable = Boolean(opts.chrome124Skippable);
  let userActivation = true;

  const entries = [{ state: null, url: initialUrl, skippable: false }];
  let index = 0;
  let maxEntriesObserved = 1;
  let pushCount = 0;
  let replaceCount = 0;
  let backCount = 0;
  let goCount = 0;
  let exitedApp = false;
  const popstateListeners = [];

  function dispatchPopstate(state) {
    const ev = { type: 'popstate', state };
    for (const fn of popstateListeners.slice()) {
      fn(ev);
    }
  }

  const history = {
    get length() {
      return entries.length;
    },
    get state() {
      return index >= 0 && index < entries.length ? entries[index].state : null;
    },
    pushState(state, _title, url) {
      entries.splice(index + 1);
      const isSkippable = chrome124Skippable && !userActivation;
      entries.push({
        state: state === undefined ? null : structuredClone(state),
        url: url || entries[index].url,
        skippable: isSkippable
      });
      index = entries.length - 1;
      pushCount++;
      maxEntriesObserved = Math.max(maxEntriesObserved, entries.length);
    },
    replaceState(state, _title, url) {
      entries[index] = {
        state: state === undefined ? null : structuredClone(state),
        url: url || entries[index].url,
        skippable: entries[index].skippable
      };
      replaceCount++;
    },
    go(delta) {
      goCount++;
      const nextIndex = index + Number(delta || 0);
      if (nextIndex < 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      if (nextIndex >= entries.length) return;
      index = nextIndex;
      dispatchPopstate(entries[index].state);
    },
    back() {
      backCount++;
      if (index <= 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      index -= 1;
      dispatchPopstate(entries[index].state);
    }
  };

  function pressHardwareBack() {
    const prevActivation = userActivation;
    // Inside hardware back (popstate), Chrome 124+ has NO fresh DOM user gesture
    userActivation = false;
    try {
      let target = index - 1;
      if (chrome124Skippable) {
        while (target >= 0 && entries[target].skippable) {
          target -= 1;
        }
      }
      if (target < 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      index = target;
      dispatchPopstate(entries[index].state);
    } finally {
      userActivation = prevActivation;
    }
  }

  function pressHardwareForward() {
    if (index + 1 >= entries.length) return;
    index += 1;
    dispatchPopstate(entries[index].state);
  }

  function withUserGesture(fn) {
    const prev = userActivation;
    userActivation = true;
    try {
      return fn();
    } finally {
      userActivation = prev;
    }
  }

  return {
    history,
    entries,
    popstateListeners,
    pressHardwareBack,
    pressHardwareForward,
    withUserGesture,
    setUserActivation: (v) => { userActivation = Boolean(v); },
    getStats: () => ({
      index,
      length: entries.length,
      maxEntriesObserved,
      pushCount,
      replaceCount,
      backCount,
      goCount,
      exitedApp,
      currentState: index >= 0 && index < entries.length ? entries[index].state : null
    })
  };
}

function makeMockElement(id, tagName = 'DIV') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];
  let _innerHTML = '';
  let _textContent = '';

  const el = {
    id: id || '',
    tagName: tagName.toUpperCase(),
    value: '',
    src: '',
    type: 'text',
    disabled: false,
    scrollTop: 0,
    dataset: {},
    parentNode: null,
    children,
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
      removeProperty(k) {
        delete this[k];
      }
    },
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        if (typeof force === 'boolean') {
          if (force) classes.add(c);
          else classes.delete(c);
          return force;
        }
        if (classes.has(c)) {
          classes.delete(c);
          return false;
        }
        classes.add(c);
        return true;
      },
      contains: (c) => classes.has(c)
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    get innerHTML() {
      return _innerHTML;
    },
    set innerHTML(v) {
      _innerHTML = String(v || '');
    },
    get textContent() {
      return _textContent;
    },
    set textContent(v) {
      _textContent = String(v || '');
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === 'src') el.src = String(v);
      if (k === 'id') el.id = String(v);
    },
    getAttribute(k) {
      if (k === 'src' && !attrs.has('src')) return el.src || '';
      return attrs.has(k) ? attrs.get(k) : null;
    },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    replaceChild(newChild, oldChild) {
      const idx = children.indexOf(oldChild);
      if (idx >= 0) {
        children[idx] = newChild;
      } else {
        children.push(newChild);
      }
      newChild.parentNode = el;
      oldChild.parentNode = null;
      return oldChild;
    },
    cloneNode() {
      const copy = makeMockElement(el.id, el.tagName);
      copy.className = el.className;
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
    _focusCount: 0,
    _blurCount: 0,
    focus() {
      el._focusCount++;
    },
    blur() {
      el._blurCount++;
    },
    _scrollIntoViewCalls: 0,
    scrollIntoView() {
      el._scrollIntoViewCalls++;
    }
  };
  return el;
}

function createCoreEngineSandbox(opts = {}) {
  const clock = createFakeClock();
  const mockHist = createMockHistory({
    url: opts.url || '/MCP-REPOCITORIO/fotos-productos.html',
    chrome124Skippable: Boolean(opts.chrome124Skippable)
  });

  const head = makeMockElement('head', 'HEAD');
  const body = makeMockElement('body', 'BODY');
  const docEl = makeMockElement('html', 'HTML');
  const elsById = new Map();
  const docListeners = new Map();
  const winListeners = new Map();

  function registerEl(el) {
    if (el && el.id) elsById.set(el.id, el);
    return el;
  }

  const origHeadAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    registerEl(child);
    return origHeadAppend(child);
  };
  const origBodyAppend = body.appendChild.bind(body);
  body.appendChild = (child) => {
    registerEl(child);
    return origBodyAppend(child);
  };

  const document = {
    head,
    body,
    documentElement: docEl,
    readyState: 'complete',
    getElementById: (id) => elsById.get(id) || null,
    createElement: (tag) => makeMockElement('', tag),
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

  const location = {
    protocol: 'https:',
    origin: 'https://ikerreyna3942-debug.github.io',
    pathname: '/MCP-REPOCITORIO/fotos-productos.html',
    search: opts.search || '',
    hash: opts.hash || '',
    href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html' + (opts.search || '') + (opts.hash || '')
  };

  const sandbox = {
    console,
    Date: Object.assign(function (...args) { return new Date(...args); }, { now: clock.now }),
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
    URL,
    URLSearchParams,
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    document,
    location,
    history: mockHist.history
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.embeddedParent ? {} : sandbox;
  sandbox.addEventListener = (type, fn) => {
    if (type === 'popstate') mockHist.popstateListeners.push(fn);
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  };
  sandbox.removeEventListener = (type, fn) => {
    if (type === 'popstate') {
      const idx = mockHist.popstateListeners.indexOf(fn);
      if (idx >= 0) mockHist.popstateListeners.splice(idx, 1);
    }
    const arr = winListeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  };

  vm.runInNewContext(BACK_NAV_SRC, sandbox, { filename: 'creata-back-nav.js' });

  return {
    sandbox,
    clock,
    mockHist,
    document,
    head,
    body,
    elsById
  };
}

function createFotosAppHarness(opts = {}) {
  const clock = createFakeClock();
  const mockHist = createMockHistory({
    url: '/MCP-REPOCITORIO/fotos-productos.html' + (opts.search || ''),
    chrome124Skippable: Boolean(opts.chrome124Skippable)
  });

  const head = makeMockElement('head', 'HEAD');
  const body = makeMockElement('body', 'BODY');
  const docEl = makeMockElement('html', 'HTML');
  const els = new Map();
  const docListeners = new Map();
  const winListeners = new Map();

  function addEl(id, tag = 'DIV', hidden = false) {
    const el = makeMockElement(id, tag);
    if (hidden) el.classList.add('hidden');
    els.set(id, el);
    return el;
  }

  const origHeadAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    if (child && child.id) els.set(child.id, child);
    return origHeadAppend(child);
  };
  const origBodyAppend = body.appendChild.bind(body);
  body.appendChild = (child) => {
    if (child && child.id) els.set(child.id, child);
    return origBodyAppend(child);
  };

  // All interactive DOM elements referenced by fotos-productos.html & fotos-productos-app.js
  addEl('privateGateBackdrop', 'SECTION', false);
  addEl('privateAppShell', 'DIV', true);
  addEl('privateGateMsg', 'DIV', true);
  const ownerEmail = addEl('ownerEmailInput', 'INPUT', false);
  ownerEmail.value = 'kevin.reyna@grupoanipa.com';
  addEl('ownerPasswordInput', 'INPUT', false);
  addEl('btnToggleOwnerPwd', 'BUTTON', false);
  addEl('btnOwnerLoginSubmit', 'BUTTON', false);
  addEl('btnInstallFotosApp', 'BUTTON', true);
  addEl('btnSplitWithCotizador', 'BUTTON', false);
  addEl('btnHeaderSyncSkus', 'BUTTON', false);
  addEl('btnHeaderRefreshFotos', 'BUTTON', false);
  addEl('btnSyncSkusCard', 'BUTTON', false);
  addEl('skuListCountBadge', 'SPAN', false);
  addEl('skuSearchInput', 'INPUT', false);
  addEl('skuSearchClearBtn', 'BUTTON', true);
  addEl('skuCategoryFilterRow', 'DIV', false);
  addEl('skuLocationFilterRow', 'DIV', false);
  addEl('skuResultsList', 'DIV', false);
  addEl('secSkuFinder', 'DIV', false);
  addEl('secProductStage', 'DIV', false);
  addEl('secGalleryInbox', 'DIV', false);
  addEl('sessionHistoryPanel', 'DIV', true);
  addEl('sessionSavedCountBadge', 'SPAN', false);
  addEl('sessionSavedList', 'DIV', false);
  addEl('btnOpenInCotizadorStage', 'BUTTON', false);
  addEl('selectedRowBadge', 'SPAN', false);
  addEl('selColASku', 'DIV', false);
  addEl('selCategoryLabel', 'DIV', false);
  addEl('selColBName', 'DIV', false);
  addEl('selModelVariantVal', 'DIV', false);
  addEl('selDimsFinishVal', 'DIV', false);
  addEl('selLocationsWrap', 'DIV', false);
  addEl('selLocationsSummaryBadge', 'SPAN', false);
  addEl('selLocationsGrid', 'DIV', false);
  addEl('selSiblingVariantsWrap', 'DIV', true);
  addEl('selSiblingVariantsList', 'DIV', false);
  addEl('curPhotoTakeBtn', 'BUTTON', true);
  addEl('curPhotoDeleteBtn', 'BUTTON', true);
  addEl('curPhotoOpenLink', 'A', true);
  addEl('curPhotoCanvas', 'DIV', false);
  addEl('newPhotoStageCard', 'DIV', false);
  addEl('newPhotoStageTitle', 'SPAN', false);
  addEl('deleteSelectedPhotoBtn', 'BUTTON', true);
  addEl('clearSelectedInboxBtn', 'BUTTON', true);
  addEl('newPhotoCanvas', 'DIV', false);
  addEl('newPhotoFootWrap', 'DIV', true);
  addEl('newPhotoFileText', 'SPAN', false);
  addEl('destFolderSelect', 'SELECT', false);
  const assignBtn = addEl('btnAssignPhotoNow', 'BUTTON', false);
  assignBtn.disabled = true;
  addEl('assignFeedbackBox', 'DIV', true);
  addEl('tabGalleryInbox', 'BUTTON', false);
  addEl('tabGalleryLoaded', 'BUTTON', false);
  addEl('inboxHeaderBadge', 'SPAN', false);
  addEl('loadedHeaderBadge', 'SPAN', false);
  addEl('inboxSearchInput', 'INPUT', false);
  addEl('inboxSearchClearBtn', 'BUTTON', true);
  addEl('btnRefreshInbox', 'BUTTON', false);
  addEl('inboxGalleryContainer', 'DIV', false);
  addEl('mobileQuickSaveBar', 'DIV', true);
  addEl('mobileQuickSaveSku', 'STRONG', false);
  const quickSaveBtn = addEl('btnMobileQuickSaveNow', 'BUTTON', false);
  quickSaveBtn.disabled = true;
  addEl('mobileFotosJumpBar', 'NAV', false);
  addEl('fotosSplitCotizadorDock', 'DIV', true);
  addEl('fotosSplitResizerBar', 'DIV', false);
  addEl('fotosSplitRatioBadge', 'SPAN', false);

  const iframeReplaceCalls = [];
  const splitFrame = addEl('fotosSplitCotizadorFrame', 'IFRAME', false);
  splitFrame.setAttribute('src', 'about:blank');
  splitFrame.contentWindow = {
    location: {
      href: 'about:blank',
      replace(u) {
        iframeReplaceCalls.push(u);
        this.href = u;
      }
    },
    postMessage: () => {}
  };

  addEl('fotosInstallModal', 'DIV', true);
  addEl('photoLightbox', 'DIV', true);
  addEl('photoLightboxImg', 'IMG', false);

  // Filter pill buttons & mobile jump buttons for querySelectorAll
  const filterPills = ['ALL', 'NO_PHOTO', 'HAS_PHOTO', 'IN_INV'].map((f) => {
    const b = makeMockElement('filter_' + f, 'BUTTON');
    b.setAttribute('data-filter', f);
    if (f === 'ALL') b.classList.add('active');
    return b;
  });

  const jumpBtns = ['secSkuFinder', 'secProductStage', 'secGalleryInbox'].map((sec) => {
    const b = makeMockElement('jump_' + sec, 'BUTTON');
    b.setAttribute('data-jump', sec);
    if (sec === 'secSkuFinder') b.classList.add('active');
    return b;
  });

  const storage = new Map();
  if (!opts.locked) {
    storage.set('creata_private_kevin_fotos_v1', JSON.stringify({
      correo: 'kevin.reyna@grupoanipa.com',
      nombre: 'Kevin Reyna',
      authToken: 'test_token_ok',
      verifiedAt: clock.now()
    }));
  }

  storage.set('creata_fotos_fast_cache_v6', JSON.stringify({
    savedAt: clock.now(),
    p: [
      [
        'SKU-SALA-01',
        'SALA MILAN 3P',
        'SALA MILAN 3P',
        '',
        3,
        1,
        1,
        'SALAS',
        'SALA',
        '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb',
        'MILAN',
        '3P',
        '220x95',
        'LINO'
      ],
      [
        'SKU-COM-02',
        'COMEDOR VERONA 6P',
        'COMEDOR VERONA 6P',
        'https://drive.google.com/file/d/LoadedPhotoId_999/view?usp=sharing',
        4,
        1,
        1,
        'COMEDORES',
        'COMEDOR',
        '1iaZaA1TXcGVL9WABWi656Xouzviiog6K',
        'VERONA',
        '6P',
        '180x100',
        'PAROTA'
      ]
    ],
    inb: [
      {
        id: 'InboxFileDriveId_0001',
        name: 'foto_sala_01.jpg',
        viewUrl: 'https://drive.google.com/file/d/InboxFileDriveId_0001/view?usp=sharing',
        sizeBytes: 12000
      },
      {
        id: 'InboxFileDriveId_0002',
        name: 'foto_comedor_02.jpg',
        viewUrl: 'https://drive.google.com/file/d/InboxFileDriveId_0002/view?usp=sharing',
        sizeBytes: 15000
      }
    ],
    fn: []
  }));

  const sessionMap = new Map();

  const document = {
    head,
    body,
    documentElement: docEl,
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: (id) => els.get(id) || null,
    createElement: (tag) => makeMockElement('', tag),
    querySelectorAll: (sel) => {
      if (sel === '.filter-pill[data-filter]') return filterPills;
      if (sel === '#mobileFotosJumpBar .mobile-jump-btn') return jumpBtns;
      return [];
    },
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

  const searchStr = opts.embedded ? '?embed=1' : (opts.search || '');
  const location = {
    protocol: 'https:',
    origin: 'https://ikerreyna3942-debug.github.io',
    pathname: '/MCP-REPOCITORIO/fotos-productos.html',
    search: searchStr,
    hash: '',
    href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html' + searchStr
  };

  const sandbox = {
    console,
    Date: Object.assign(function (...args) { return new Date(...args); }, { now: clock.now }),
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
    URL,
    URLSearchParams,
    AbortController,
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    cancelAnimationFrame: () => {},
    innerWidth: opts.innerWidth || 390,
    innerHeight: opts.innerHeight || 844,
    scrollY: 0,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    sessionStorage: {
      getItem: (k) => (sessionMap.has(k) ? sessionMap.get(k) : null),
      setItem: (k, v) => sessionMap.set(k, String(v)),
      removeItem: (k) => sessionMap.delete(k)
    },
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      serviceWorker: { register: () => Promise.resolve() }
    },
    history: mockHist.history,
    location,
    document,
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, files: [] }),
      text: async () => ''
    })
  };
  sandbox.window = sandbox;
  sandbox.parent = opts.embedded ? { postMessage: () => {} } : sandbox;
  sandbox.matchMedia = () => ({ matches: false });
  sandbox.addEventListener = (type, fn) => {
    if (type === 'popstate') mockHist.popstateListeners.push(fn);
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  };
  sandbox.removeEventListener = (type, fn) => {
    if (type === 'popstate') {
      const idx = mockHist.popstateListeners.indexOf(fn);
      if (idx >= 0) mockHist.popstateListeners.splice(idx, 1);
    }
    const arr = winListeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  };

  vm.runInNewContext(BACK_NAV_SRC, sandbox, { filename: 'creata-back-nav.js' });
  vm.runInNewContext(FOTOS_APP_SRC, sandbox, { filename: 'fotos-productos-app.js' });

  return {
    sandbox,
    window: sandbox.window,
    document,
    els,
    filterPills,
    jumpBtns,
    clock,
    mockHist,
    iframeReplaceCalls,
    pressHardwareBack: mockHist.pressHardwareBack,
    pressHardwareForward: mockHist.pressHardwareForward,
    withUserGesture: mockHist.withUserGesture,
    dispatchEscape: () => document.dispatchEvent({ type: 'keydown', key: 'Escape' }),
    dispatchWindowEvent: (ev) => {
      const arr = winListeners.get(ev.type) || [];
      for (const fn of arr.slice()) fn(ev);
    },
    getToastText: () => {
      const el = els.get('fotosBackToast');
      if (!el || el.classList.contains('hidden')) return '';
      return el.textContent || '';
    }
  };
}

// ============================================================================
// PART 0: SHARED creata-back-nav.js CORE ENGINE UNIT TESTS
// ============================================================================

test('Core Engine: exports CreataBackNav API, self-contained safe-area toast CSS, and replaceIframeUrl', () => {
  const { sandbox, document, head, elsById, clock } = createCoreEngineSandbox();

  assert.equal(typeof sandbox.window.createCreataBackNavController, 'function');
  assert.ok(Object.isFrozen(sandbox.window.CreataBackNav));
  assert.equal(sandbox.window.CreataBackNav.version, '1.0.0');
  assert.equal(typeof sandbox.window.CreataBackNav.createController, 'function');
  assert.equal(typeof sandbox.window.CreataBackNav.showToast, 'function');
  assert.equal(typeof sandbox.window.CreataBackNav.hideToast, 'function');
  assert.equal(typeof sandbox.window.CreataBackNav.replaceIframeUrl, 'function');

  // Toast injects #creata-back-nav-style once into head with safe-area & max z-index
  const toastEl = sandbox.window.CreataBackNav.showToast('Prueba atrás', {
    doc: document,
    win: sandbox.window,
    durationMs: 1200,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  assert.ok(toastEl);
  assert.equal(toastEl.textContent, 'Prueba atrás');
  assert.equal(toastEl.classList.contains('hidden'), false);
  assert.equal(toastEl.classList.contains('is-visible'), true);

  const styleEl = elsById.get('creata-back-nav-style');
  assert.ok(styleEl, '#creata-back-nav-style must be injected');
  assert.match(styleEl.textContent, /z-index:\s*2147483000/);
  assert.match(styleEl.textContent, /--creata-back-toast-bottom/);
  assert.match(styleEl.textContent, /env\(safe-area-inset-bottom/);
  assert.match(styleEl.textContent, /pointer-events:\s*none/);

  // Calling showToast again does not duplicate style tag
  sandbox.window.CreataBackNav.showToast('Segunda', {
    doc: document,
    win: sandbox.window,
    durationMs: 1200,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  assert.equal(head.children.filter((c) => c.id === 'creata-back-nav-style').length, 1);

  // Auto-hides after duration
  clock.advanceTime(1300);
  assert.equal(toastEl.classList.contains('hidden'), true);

  // replaceIframeUrl: same-origin about:blank uses contentWindow.location.replace
  const replaceCalls = [];
  const sameOriginFrame = makeMockElement('f1', 'IFRAME');
  sameOriginFrame.contentWindow = {
    location: {
      href: 'about:blank',
      replace(u) { replaceCalls.push(u); }
    }
  };
  sandbox.window.CreataBackNav.replaceIframeUrl(sameOriginFrame, './inventario.html?embed=1');
  assert.deepEqual(replaceCalls, ['./inventario.html?embed=1']);

  // replaceIframeUrl: cross-origin forceReload clones/swaps detached iframe and re-binds onLoad
  const container = makeMockElement('wrap', 'DIV');
  const crossFrame = makeMockElement('f2', 'IFRAME');
  crossFrame.contentWindow = {
    location: {
      get href() { throw new Error('SecurityError'); }
    }
  };
  container.appendChild(crossFrame);
  let loadFired = false;
  const swapped = sandbox.window.CreataBackNav.replaceIframeUrl(crossFrame, 'https://buena-espero.onrender.com/?t=1', {
    forceReload: true,
    onLoad: () => { loadFired = true; }
  });
  assert.notEqual(swapped, crossFrame);
  assert.equal(container.children[0], swapped);
  assert.equal(swapped.getAttribute('src'), 'https://buena-espero.onrender.com/?t=1');
  swapped.dispatchEvent({ type: 'load' });
  assert.equal(loadFired, true);

  // replaceIframeUrl: minimal mock fallback sets src attribute
  const minimalFrame = makeMockElement('f3', 'IFRAME');
  sandbox.window.CreataBackNav.replaceIframeUrl(minimalFrame, './panel.html');
  assert.equal(minimalFrame.getAttribute('src'), './panel.html');
});

test('Core Engine: Chrome 124+ skippable-entry simulation unwinds 4 consecutive Back taps without premature exit', () => {
  const { sandbox, mockHist, clock } = createCoreEngineSandbox({ chrome124Skippable: true });

  const ui = { filter: false, sku: false, photo: false, lightbox: false };
  const unwindOrder = [];

  const ctrl = sandbox.window.CreataBackNav.createController({
    appId: 'test_c124',
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    steps: [
      { id: 'lightbox', isActive: () => ui.lightbox, undo: () => { ui.lightbox = false; unwindOrder.push('lightbox'); }, escapeAllowed: true },
      { id: 'photo', isActive: () => ui.photo, undo: () => { ui.photo = false; unwindOrder.push('photo'); }, escapeAllowed: true },
      { id: 'sku', isActive: () => ui.sku, undo: () => { ui.sku = false; unwindOrder.push('sku'); }, escapeAllowed: true },
      { id: 'filter', isActive: () => ui.filter, undo: () => { ui.filter = false; unwindOrder.push('filter'); }, escapeAllowed: false }
    ]
  });
  ctrl.init();

  // Simulate 4 user-gesture interactions + 1 initial click gesture so exit guard also has a gesture-backed slot
  mockHist.withUserGesture(() => {
    ctrl.armOnUserGesture({ type: 'click' });
    clock.advanceTime(100);
    ui.filter = true; ctrl.syncDepthOnUserAction('filter');
    clock.advanceTime(100);
    ui.sku = true; ctrl.syncDepthOnUserAction('sku');
    clock.advanceTime(100);
    ui.photo = true; ctrl.syncDepthOnUserAction('photo');
    clock.advanceTime(100);
    ui.lightbox = true; ctrl.syncDepthOnUserAction('lightbox');
  });

  // 4 consecutive hardware Back taps with ZERO taps in between
  mockHist.pressHardwareBack();
  mockHist.pressHardwareBack();
  mockHist.pressHardwareBack();
  mockHist.pressHardwareBack();

  assert.deepEqual(unwindOrder, ['lightbox', 'photo', 'sku', 'filter']);
  assert.equal(mockHist.getStats().exitedApp, false);

  // 5th Back at clean root triggers exit guard warning (still stays!)
  mockHist.pressHardwareBack();
  assert.equal(mockHist.getStats().exitedApp, false);

  // 6th Back within 2500ms exits natively
  clock.advanceTime(400);
  mockHist.pressHardwareBack();
  assert.equal(mockHist.getStats().exitedApp, true);
});

test('Core Engine: bounded MAX_DEPTH=12 under 50 mutations, clean-root collapse, forward ignore, Escape, and embedded no-op', () => {
  const { sandbox, mockHist, clock, elsById } = createCoreEngineSandbox();

  let stackCount = 0;
  let modalOpen = false;
  let tabActive = false;

  const ctrl = sandbox.window.CreataBackNav.createController({
    appId: 'test_bounds',
    maxDepth: 12,
    exitGuardMs: 2500,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    steps: [
      { id: 'modal', isActive: () => modalOpen, undo: () => { modalOpen = false; }, escapeAllowed: true },
      { id: 'tab', isActive: () => tabActive, undo: () => { tabActive = false; }, escapeAllowed: false },
      { id: 'stack', isActive: () => stackCount > 0, depthWeight: () => stackCount, undo: () => { stackCount--; }, escapeAllowed: false }
    ]
  });
  ctrl.init();

  // 50 distinct user-gesture mutations must stay strictly bounded <= 13 entries (base + MAX_DEPTH=12)
  for (let i = 0; i < 50; i++) {
    clock.advanceTime(100);
    stackCount = Math.min(25, stackCount + 1);
    modalOpen = i % 2 === 0;
    ctrl.syncDepthOnUserAction('mut_' + i);
  }
  assert.ok(mockHist.getStats().maxEntriesObserved <= 13, `maxEntriesObserved=${mockHist.getStats().maxEntriesObserved} must be <= 13`);
  assert.equal(ctrl.getDebugState().currentDepth, 12);

  // Forward navigation never undoes state
  modalOpen = true;
  tabActive = true;
  stackCount = 0;
  mockHist.pressHardwareBack(); // closes modal (depth 12 -> 11)
  assert.equal(modalOpen, false);
  assert.equal(tabActive, true);
  mockHist.pressHardwareForward(); // forward (11 -> 12) must NOT undo tab
  assert.equal(tabActive, true);

  // Escape skips escapeAllowed:false steps and never triggers exit toast
  const escRes = ctrl.handleEscape();
  assert.equal(escRes.handled, false);
  assert.equal(tabActive, true);

  // Clean root with deep currentDepth (12): Back #1 warns & collapses to depth 1; timeout resets; rapid Back #2 exits
  tabActive = false;
  mockHist.pressHardwareBack(); // 12 -> 11 -> collapses via go(-10) to 1
  assert.equal(mockHist.getStats().exitedApp, false);
  assert.equal(ctrl.getDebugState().currentDepth, 1);
  assert.match(elsById.get('creataBackNavToast').textContent, /Presiona Atrás otra vez para salir/);

  // Wait past exitGuardMs -> timeout resets guard
  clock.advanceTime(2600);
  assert.equal(elsById.get('creataBackNavToast').classList.contains('hidden'), true);
  mockHist.pressHardwareBack(); // 1 -> 0 -> warns again & pushes 1
  assert.equal(mockHist.getStats().exitedApp, false);
  assert.equal(ctrl.getDebugState().currentDepth, 1);

  // Rapid 2nd Back within exitGuardMs -> exits cleanly
  clock.advanceTime(500);
  mockHist.pressHardwareBack();
  assert.equal(mockHist.getStats().exitedApp, true);

  // Embedded iframe mode: ZERO history mutations, ZERO popstate listener, local Escape still works
  const emb = createCoreEngineSandbox({ embeddedParent: true, search: '?embed=1' });
  let localModal = true;
  const embCtrl = emb.sandbox.window.CreataBackNav.createController({
    appId: 'emb_test',
    steps: [{ id: 'm', isActive: () => localModal, undo: () => { localModal = false; }, escapeAllowed: true }]
  });
  embCtrl.init();
  embCtrl.syncDepthOnUserAction('open');
  assert.equal(emb.mockHist.getStats().replaceCount, 0);
  assert.equal(emb.mockHist.getStats().pushCount, 0);
  assert.equal(emb.mockHist.popstateListeners.length, 0);
  assert.equal(embCtrl.handleEscape().handled, true);
  assert.equal(localModal, false);
});

test('Core Engine (Item 1): syncDepthOnUserAction enforces 80ms sameGestureWindowMs against rapid double-push and armOnUserGesture overlap', () => {
  const { sandbox, mockHist, clock } = createCoreEngineSandbox({ chrome124Skippable: true });

  let layerCount = 0;
  const ctrl = sandbox.window.CreataBackNav.createController({
    appId: 'test_gesture_window',
    sameGestureWindowMs: 80,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    steps: [
      { id: 'layers', isActive: () => layerCount > 0, depthWeight: () => layerCount, undo: () => { layerCount--; }, escapeAllowed: true }
    ]
  });
  ctrl.init();

  // (a) Two syncDepthOnUserAction() calls 10ms apart emit strictly 1 pushState
  layerCount = 2;
  const firstPush = ctrl.syncDepthOnUserAction('a');
  clock.advanceTime(10);
  layerCount = 3;
  const secondPush = ctrl.syncDepthOnUserAction('b');
  assert.equal(firstPush, true);
  assert.equal(secondPush, false, 'Second syncDepthOnUserAction within 80ms must be throttled');
  assert.equal(mockHist.getStats().pushCount, 1);

  // (b) After >= 80ms, armOnUserGesture() + syncDepthOnUserAction() 20ms apart emit strictly 1 pushState
  clock.advanceTime(100);
  const armPush = ctrl.armOnUserGesture({ type: 'click' });
  clock.advanceTime(20);
  layerCount = 4;
  const followPush = ctrl.syncDepthOnUserAction('c');
  assert.equal(armPush, true);
  assert.equal(followPush, false, 'syncDepthOnUserAction 20ms after armOnUserGesture must be throttled');
  assert.equal(mockHist.getStats().pushCount, 2);
});

test('Core Engine (Item 2): async history.go collapse race with Forward clears exitArmedUntil and suppresses queued collapse without exiting app', () => {
  const { sandbox, clock, elsById } = createCoreEngineSandbox();

  // Async history mock: history.go(delta) queues popstate instead of firing synchronously
  const entries = [{ state: null, url: '/MCP-REPOCITORIO/fotos-productos.html' }];
  let index = 0;
  let exitedApp = false;
  const queuedGoOps = [];
  const popListeners = [];

  const asyncHistory = {
    get length() { return entries.length; },
    get state() { return index >= 0 && index < entries.length ? entries[index].state : null; },
    replaceState(st, _t, url) {
      entries[index] = { state: structuredClone(st), url: url || entries[index].url };
    },
    pushState(st, _t, url) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(st), url: url || entries[index].url });
      index = entries.length - 1;
    },
    go(delta) {
      const targetIndex = index + Number(delta || 0);
      queuedGoOps.push({ delta, targetIndex });
    },
    back() {
      if (index <= 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      index--;
      for (const fn of popListeners.slice()) fn({ type: 'popstate', state: entries[index].state });
    }
  };

  function firePopstateAt(nextIdx) {
    if (nextIdx < 0) {
      index = -1;
      exitedApp = true;
      return;
    }
    index = nextIdx;
    for (const fn of popListeners.slice()) fn({ type: 'popstate', state: entries[index].state });
  }

  const fakeWin = {
    location: sandbox.location,
    history: asyncHistory,
    parent: null,
    addEventListener(type, fn) { if (type === 'popstate') popListeners.push(fn); },
    removeEventListener(type, fn) {
      const i = popListeners.indexOf(fn);
      if (i >= 0) popListeners.splice(i, 1);
    }
  };
  fakeWin.parent = fakeWin;

  let activeCount = 0;
  const ctrl = sandbox.window.CreataBackNav.createController({
    appId: 'test_async_collapse',
    win: fakeWin,
    doc: sandbox.document,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    steps: [
      { id: 'modal', isActive: () => activeCount > 0, depthWeight: () => activeCount, undo: () => { activeCount--; }, escapeAllowed: true }
    ]
  });
  ctrl.init();

  // Build depth=5 over 5 distinct gestures
  for (let i = 1; i <= 5; i++) {
    clock.advanceTime(100);
    activeCount = i;
    ctrl.syncDepthOnUserAction('open_' + i);
  }
  assert.equal(ctrl.getDebugState().currentDepth, 5);

  // User closes all 5 overlays manually, then presses Back #1 (5 -> 4 -> arms exit guard, queues go(-3) to depth 1)
  activeCount = 0;
  firePopstateAt(4);
  assert.equal(exitedApp, false);
  assert.ok(ctrl.getDebugState().exitArmedUntil > 0, 'Back #1 arms exit guard');
  assert.equal(queuedGoOps.length, 1);
  assert.equal(queuedGoOps[0].delta, -3);
  assert.equal(queuedGoOps[0].targetIndex, 1);

  // Intervening Forward navigation (4 -> 5) arrives BEFORE async go(-3) completes
  firePopstateAt(5);
  assert.equal(ctrl.getDebugState().exitArmedUntil, 0, 'Forward navigation MUST clear exitArmedUntil');
  assert.equal(elsById.get('creataBackNavToast').classList.contains('hidden'), true, 'Forward navigation hides exit toast');

  // Now flush the queued programmatic collapse go(-3) -> lands at depth=1 (MUST be suppressed, MUST NOT exit!)
  const op = queuedGoOps.shift();
  firePopstateAt(op.targetIndex);
  assert.equal(exitedApp, false, 'Queued programmatic collapse after Forward MUST NOT exit app');
  assert.equal(ctrl.getDebugState().currentDepth, 1);
  assert.equal(queuedGoOps.length, 0, 'No history.go(-2) exit call emitted');
});

// ============================================================================
// PART A: REAL fotos-productos-app.js VM BEHAVIORAL TESTS (BN-1..BN-10)
// ============================================================================

test('BN-1: Priority 1 — Photo lightbox (including data: URL) closes first without affecting underlying layers', () => {
  const h = createFotosAppHarness();

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.selectInboxPhoto('InboxFileDriveId_0001');
  h.clock.advanceTime(100);
  h.window.toggleSplitCotizadorInFotos();
  h.clock.advanceTime(100);
  h.window.triggerInstallFotosApp();
  h.clock.advanceTime(100);
  h.window.openPhotoLightbox('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');

  assert.equal(h.els.get('photoLightbox').classList.contains('hidden'), false);
  h.pressHardwareBack();

  assert.equal(h.els.get('photoLightbox').classList.contains('hidden'), true);
  assert.equal(h.els.get('photoLightboxImg').src, '');
  assert.equal(h.mockHist.getStats().exitedApp, false);
  // Underlying layers remain active
  assert.equal(h.els.get('fotosInstallModal').classList.contains('hidden'), false);
  assert.equal(h.els.get('fotosSplitCotizadorDock').classList.contains('hidden'), false);
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), false);
});

test('BN-2: Priority 2 — Install modal closes before split dock and selections', () => {
  const h = createFotosAppHarness();

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.toggleSplitCotizadorInFotos();
  h.clock.advanceTime(100);
  h.window.triggerInstallFotosApp();
  assert.equal(h.els.get('fotosInstallModal').classList.contains('hidden'), false);

  h.pressHardwareBack();

  assert.equal(h.els.get('fotosInstallModal').classList.contains('hidden'), true);
  assert.equal(h.els.get('fotosSplitCotizadorDock').classList.contains('hidden'), false);
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-3: Priority 3 — Split-screen Cotizador dock closes before selection, uses replaceIframeUrl, and toggles mobileQuickSaveBar', () => {
  const h = createFotosAppHarness();

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.selectInboxPhoto('InboxFileDriveId_0001');
  h.clock.advanceTime(100);
  assert.equal(h.els.get('mobileQuickSaveBar').classList.contains('hidden'), false);

  h.window.toggleSplitCotizadorInFotos();
  assert.deepEqual(h.iframeReplaceCalls, ['./inventario.html?embed=1']);
  assert.equal(h.els.get('fotosSplitCotizadorDock').classList.contains('hidden'), false);
  assert.equal(h.document.body.classList.contains('fotos-split-active'), true);
  assert.equal(h.els.get('mobileQuickSaveBar').classList.contains('hidden'), true);

  h.pressHardwareBack();

  assert.equal(h.els.get('fotosSplitCotizadorDock').classList.contains('hidden'), true);
  assert.equal(h.document.body.classList.contains('fotos-split-active'), false);
  assert.equal(h.els.get('mobileQuickSaveBar').classList.contains('hidden'), false);
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-4: Priority 4 — Selected photo clears before selected SKU and disables Guardar/QuickSave', () => {
  const h = createFotosAppHarness();

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.selectInboxPhoto('InboxFileDriveId_0001');
  assert.equal(h.els.get('btnAssignPhotoNow').disabled, false);
  assert.equal(h.els.get('mobileQuickSaveBar').classList.contains('hidden'), false);

  h.pressHardwareBack();

  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), true);
  assert.equal(h.els.get('btnAssignPhotoNow').disabled, true);
  assert.equal(h.els.get('mobileQuickSaveBar').classList.contains('hidden'), true);
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-5: Priorities 5-8 — Inbox search (blur, no focus), gallery LOADED->INBOX, mobile sections, and clearSelectedSku', () => {
  const h = createFotosAppHarness({ innerWidth: 390 });

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.jumpToFotosSection('secProductStage');
  h.clock.advanceTime(100);
  h.window.jumpToFotosSection('secGalleryInbox');
  h.clock.advanceTime(100);
  h.window.setGalleryMode('LOADED');
  h.clock.advanceTime(100);
  const inboxInp = h.els.get('inboxSearchInput');
  inboxInp.value = 'VERONA';
  inboxInp.dispatchEvent({ type: 'input' });

  // 1) Inbox search clears WITHOUT focusing input
  const focusBefore = inboxInp._focusCount;
  h.pressHardwareBack();
  assert.equal(inboxInp.value, '');
  assert.equal(inboxInp._focusCount, focusBefore, 'Back clearing inbox search must NOT pop mobile keyboard');
  assert.ok(inboxInp._blurCount >= 1);
  assert.equal(h.els.get('inboxSearchClearBtn').classList.contains('hidden'), true);

  // 2) Gallery mode LOADED -> INBOX
  h.pressHardwareBack();
  assert.equal(h.els.get('tabGalleryInbox').classList.contains('active'), true);
  assert.equal(h.els.get('tabGalleryLoaded').classList.contains('active'), false);

  // 3) Mobile section secGalleryInbox -> secProductStage -> secSkuFinder
  h.pressHardwareBack();
  assert.equal(h.jumpBtns[1].classList.contains('active'), true);
  h.pressHardwareBack();
  assert.equal(h.jumpBtns[0].classList.contains('active'), true);

  // 4) Selected SKU clears to '—'
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  h.pressHardwareBack();
  assert.equal(h.els.get('selColASku').textContent, '—');
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-6: Priorities 9-11 — SKU search (blur, no focus), category filter, and status filter reset cleanly', () => {
  const h = createFotosAppHarness();

  h.window.setSkuFilterMode('NO_PHOTO');
  h.clock.advanceTime(100);
  h.window.setSkuCategoryFilter('SALAS');
  h.clock.advanceTime(100);
  const skuInp = h.els.get('skuSearchInput');
  skuInp.value = 'MILAN';
  skuInp.dispatchEvent({ type: 'input' });

  // 1) SKU search clears without calling focus()
  const focusBefore = skuInp._focusCount;
  h.pressHardwareBack();
  assert.equal(skuInp.value, '');
  assert.equal(skuInp._focusCount, focusBefore, 'Back clearing SKU search must NOT call .focus()');
  assert.ok(skuInp._blurCount >= 1);
  assert.equal(h.els.get('skuSearchClearBtn').classList.contains('hidden'), true);

  // 2) Category filter resets SALAS -> ALL
  h.pressHardwareBack();
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().activeStepIds.includes('sku_category'), false);

  // 3) Status filter resets NO_PHOTO -> ALL
  h.pressHardwareBack();
  assert.equal(h.filterPills[0].classList.contains('active'), true);
  assert.equal(h.filterPills[1].classList.contains('active'), false);
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-7: Full stacked end-to-end 11-layer monotonic unwind under Chrome 124+ skippable-entry simulation', () => {
  const h = createFotosAppHarness({ chrome124Skippable: true, innerWidth: 390 });

  h.withUserGesture(() => {
    h.window.setSkuFilterMode('NO_PHOTO');
    h.clock.advanceTime(100);
    h.window.setSkuCategoryFilter('SALAS');
    h.clock.advanceTime(100);
    const skuInp = h.els.get('skuSearchInput');
    skuInp.value = 'MILAN';
    skuInp.dispatchEvent({ type: 'input' });
    h.clock.advanceTime(100);
    h.window.selectSkuProduct('SKU-SALA-01');
    h.clock.advanceTime(100);
    h.window.jumpToFotosSection('secGalleryInbox');
    h.clock.advanceTime(100);
    h.window.setGalleryMode('LOADED');
    h.clock.advanceTime(100);
    const inboxInp = h.els.get('inboxSearchInput');
    inboxInp.value = 'SALA';
    inboxInp.dispatchEvent({ type: 'input' });
    h.clock.advanceTime(100);
    h.window.selectInboxPhoto('InboxFileDriveId_0001');
    h.clock.advanceTime(100);
    h.window.toggleSplitCotizadorInFotos();
    h.clock.advanceTime(100);
    h.window.triggerInstallFotosApp();
    h.clock.advanceTime(100);
    h.window.openPhotoLightbox('https://lh3.googleusercontent.com/d/abc123456789012345=w800');
  });

  const expectedOrder = [
    'lightbox',
    'install_modal',
    'split_cotizador',
    'selected_photo',
    'inbox_search',
    'gallery_mode',
    'mobile_section',
    'selected_sku',
    'sku_search',
    'sku_category',
    'sku_filter'
  ];

  for (const expectedTop of expectedOrder) {
    const beforeIds = h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().activeStepIds;
    assert.equal(beforeIds[0], expectedTop, `Expected topmost active step to be ${expectedTop}, got ${beforeIds[0]}`);
    h.pressHardwareBack();
    assert.equal(h.mockHist.getStats().exitedApp, false, `Must NOT exit while unwinding ${expectedTop}`);
    const afterIds = h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().activeStepIds;
    assert.ok(!afterIds.includes(expectedTop), `Step ${expectedTop} must be cleared after Back`);
  }

  assert.deepEqual(Array.from(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().activeStepIds), []);
});

test('BN-8: UI close & Escape single-layer sync leaves zero ghost back presses', () => {
  const h = createFotosAppHarness();

  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.triggerInstallFotosApp();
  h.clock.advanceTime(100);
  h.window.openPhotoLightbox('https://lh3.googleusercontent.com/d/abc123456789012345=w800');

  // Escape closes ONLY lightbox (NOT install modal underneath)
  h.dispatchEscape();
  assert.equal(h.els.get('photoLightbox').classList.contains('hidden'), true);
  assert.equal(h.els.get('fotosInstallModal').classList.contains('hidden'), false);

  // Close install modal via UI button
  h.window.closeFotosInstallModal();
  assert.equal(h.els.get('fotosInstallModal').classList.contains('hidden'), true);

  // Very next hardware Back immediately acts on underlying selected_sku (no wasted ghost press!)
  h.pressHardwareBack();
  assert.equal(h.els.get('selColASku').textContent, '—');
  assert.equal(h.mockHist.getStats().exitedApp, false);
});

test('BN-9: Clean-root double-back exit guard warns on 1st press, resets after 2500ms timeout, exits on rapid 2nd press', () => {
  const h = createFotosAppHarness();

  // Arm guard via a single user gesture at clean root
  h.document.dispatchEvent({ type: 'click' });
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().currentDepth, 1);

  // 1st Back at clean root -> warns & stays
  h.pressHardwareBack();
  assert.equal(h.mockHist.getStats().exitedApp, false);
  assert.match(h.getToastText(), /otra vez|salir/i);

  // Advance past 2500ms timeout -> guard resets
  h.clock.advanceTime(2600);
  assert.equal(h.getToastText(), '');

  // Back again after timeout -> STILL warns & stays
  h.pressHardwareBack();
  assert.equal(h.mockHist.getStats().exitedApp, false);
  assert.match(h.getToastText(), /otra vez|salir/i);

  // Rapid 2nd Back within 2500ms -> exits cleanly
  h.clock.advanceTime(500);
  h.pressHardwareBack();
  assert.equal(h.mockHist.getStats().exitedApp, true);
});

test('BN-10: Bounded MAX_DEPTH=12 under 50 mutations + Locked gate Escape safety & Embedded iframe safety', () => {
  const h = createFotosAppHarness();
  for (let i = 0; i < 50; i++) {
    h.clock.advanceTime(100);
    h.window.selectSkuProduct(i % 2 === 0 ? 'SKU-SALA-01' : 'SKU-COM-02');
    h.clock.advanceTime(100);
    h.window.setGalleryMode(i % 2 === 0 ? 'LOADED' : 'INBOX');
    if (i < 15) {
      h.clock.advanceTime(100);
      h.window.openPhotoLightbox('https://lh3.googleusercontent.com/d/abc123456789012345=w800');
      h.window.closePhotoLightbox();
    }
  }
  assert.ok(h.mockHist.getStats().maxEntriesObserved <= 13, `maxEntriesObserved=${h.mockHist.getStats().maxEntriesObserved} must be <= 13`);

  // Select SKU + Photo, then lockFotosPortal -> resets history depth to 0 so login gate never traps Back
  h.clock.advanceTime(100);
  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  h.window.selectInboxPhoto('InboxFileDriveId_0001');
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), false);

  h.window.lockFotosPortal();
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().currentDepth, 0);
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().enabled, false);
  assert.equal(h.els.get('privateAppShell').classList.contains('hidden'), true);

  // Item 3 regression: pressing Escape (or calling handleFotosBackAction) while locked MUST NOT mutate selected_photo/selected_sku or show any toast over #privateGateBackdrop
  h.dispatchEscape();
  h.dispatchEscape();
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01', 'Escape while locked must NOT mutate selected_sku');
  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), false, 'Escape while locked must NOT mutate selected_photo');
  assert.equal(h.getToastText(), '', 'Escape while locked must NOT show any toast over #privateGateBackdrop');
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.handleEscape().handled, false, 'Controller handleEscape() must respect isEnabled() === false');
  assert.equal(h.window.handleFotosBackAction().handled, false, 'handleFotosBackAction() must no-op while locked');

  // Locked boot: Back does not throw or unlock app
  const lockedH = createFotosAppHarness({ locked: true });
  lockedH.document.dispatchEvent({ type: 'click' });
  assert.equal(lockedH.mockHist.getStats().pushCount, 0);
  assert.equal(lockedH.els.get('privateAppShell').classList.contains('hidden'), true);

  // Embedded iframe boot (?embed=1, parent !== window): ZERO history mutations
  const embH = createFotosAppHarness({ embedded: true });
  embH.window.selectSkuProduct('SKU-SALA-01');
  embH.window.openPhotoLightbox('https://lh3.googleusercontent.com/d/abc123456789012345=w800');
  assert.equal(embH.mockHist.getStats().replaceCount, 0);
  assert.equal(embH.mockHist.getStats().pushCount, 0);
  assert.equal(embH.mockHist.popstateListeners.length, 0);
  // Local Escape still closes lightbox in embedded mode
  embH.dispatchEscape();
  assert.equal(embH.els.get('photoLightbox').classList.contains('hidden'), true);
});

test('BN-11 (Item 6): CREATA_SPLIT_SELECT_SKU postMessage selects SKU with skipBackSync and emits 0 history.pushState calls', () => {
  const h = createFotosAppHarness();
  const pushesBefore = h.mockHist.getStats().pushCount;
  assert.equal(pushesBefore, 0);

  h.dispatchWindowEvent({
    type: 'message',
    data: { type: 'CREATA_SPLIT_SELECT_SKU', source: 'cotizador', sku: 'SKU-SALA-01' }
  });

  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01', 'postMessage must still select target SKU');
  assert.equal(h.mockHist.getStats().pushCount, 0, 'CREATA_SPLIT_SELECT_SKU postMessage MUST emit 0 history.pushState calls');
});

test('BN-12 (Item 9): uploadLocalFilesToSubir syncs selected_photo back-nav depth once even without suggested SKU', () => {
  const h = createFotosAppHarness();
  h.window.selectSkuProduct('SKU-SALA-01');
  h.clock.advanceTime(100);
  const depthBefore = h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().currentDepth;
  const pushesBefore = h.mockHist.getStats().pushCount;

  // Mock URL.createObjectURL & FileReader/Image in sandbox for instant local staging
  h.sandbox.URL = Object.assign(URL, {
    createObjectURL: () => 'blob:mock-local-photo-1',
    revokeObjectURL: () => {}
  });
  h.sandbox.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/jpeg;base64,AAAA';
      if (this.onload) this.onload({ target: this });
    }
  };
  h.sandbox.Image = class {
    set src(_) {
      this.naturalWidth = 100;
      this.naturalHeight = 100;
      if (this.onload) this.onload();
    }
  };

  // Trigger upload with a filename that has NO suggested SKU (and SKU already selected)
  h.window.uploadLocalFilesToSubir({ files: [{ name: 'sin_sku_demo.jpg', type: 'image/jpeg', size: 1024 }] });

  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), false, 'Uploaded photo should be staged as selected_photo');
  assert.equal(h.mockHist.getStats().pushCount, pushesBefore + 1, 'uploadLocalFilesToSubir must sync selected_photo depth once');
  assert.equal(h.window.__CREATA_FOTOS_BACK_NAV__.getDebugState().currentDepth, depthBefore + 1);

  // Pressing Back clears the newly staged uploaded photo without losing selected SKU
  h.pressHardwareBack();
  assert.equal(h.els.get('clearSelectedInboxBtn').classList.contains('hidden'), true);
  assert.equal(h.els.get('selColASku').textContent, 'SKU-SALA-01');
});

// ============================================================================
// PART B: MOBILE UX, SAFE AREAS, TOUCH TARGETS, CSS VARS, SW v5 & REGRESSIONS
// ============================================================================

test('UX-1: Viewport & PWA mobile meta tags + fotos-manifest.json display_override & scope', () => {
  assert.match(FOTOS_HTML_SRC, /<meta\s+name="viewport"[^>]*width=device-width[^>]*viewport-fit=cover[^>]*interactive-widget=resizes-content/);
  assert.match(FOTOS_HTML_SRC, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/);
  assert.match(FOTOS_HTML_SRC, /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/);
  assert.match(FOTOS_HTML_SRC, /<meta\s+name="mobile-web-app-capable"\s+content="yes"/);
  assert.match(FOTOS_HTML_SRC, /noindex,\s*nofollow/);

  const manifest = JSON.parse(FOTOS_MANIFEST_SRC);
  assert.equal(manifest.scope, './fotos-productos');
  assert.equal(manifest.start_url, './fotos-productos.html');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.display_override, ['standalone', 'minimal-ui']);
});

test('UX-2: Safe-area insets (top, bottom, left, right) across header, workspace, gate, modals, lightbox, split dock, and bottom bars', () => {
  assert.match(FOTOS_CSS_SRC, /env\(safe-area-inset-top/);
  assert.match(FOTOS_CSS_SRC, /env\(safe-area-inset-bottom/);
  assert.match(FOTOS_CSS_SRC, /env\(safe-area-inset-left/);
  assert.match(FOTOS_CSS_SRC, /env\(safe-area-inset-right/);
  assert.match(FOTOS_CSS_SRC, /--creata-back-toast-bottom:\s*calc\(/);
  assert.match(FOTOS_CSS_SRC, /scroll-margin-top:\s*calc\(/);

  // #mobileFotosJumpBar moved out of <header> to bottom of #privateAppShell
  const headerMatch = FOTOS_HTML_SRC.match(/<header[\s\S]*?<\/header>/);
  assert.ok(headerMatch);
  assert.ok(!headerMatch[0].includes('mobileFotosJumpBar'), '#mobileFotosJumpBar must be moved out of <header>');
  assert.match(FOTOS_HTML_SRC, /id="mobileQuickSaveBar"/);
  assert.match(FOTOS_HTML_SRC, /id="mobileFotosJumpBar"/);
  assert.match(FOTOS_HTML_SRC, /id="btnClosePhotoLightbox"/);
  assert.match(FOTOS_HTML_SRC, /id="inboxSearchClearBtn"/);
});

test('UX-3: Mobile touch targets >= 44px, 1024px jump-bar parity (Item 5), 768px stage-action-btn specificity (Item 8), and zero inline height locks', () => {
  const m1024Idx = FOTOS_CSS_SRC.indexOf('@media (max-width: 1024px)');
  const m768Idx = FOTOS_CSS_SRC.indexOf('@media (max-width: 768px)');
  const m640Idx = FOTOS_CSS_SRC.indexOf('@media (max-width: 640px)');
  assert.ok(m1024Idx > 0 && m768Idx > m1024Idx && m640Idx > m768Idx, 'Expected @media 1024px, 768px, and 640px blocks in order');

  const m1024Block = FOTOS_CSS_SRC.slice(m1024Idx, m768Idx);
  const m768Block = FOTOS_CSS_SRC.slice(m768Idx, m640Idx);
  const mobileCss = FOTOS_CSS_SRC.slice(m1024Idx);

  // Item 5: 769px-1024px breakpoint parity (landscape phones & portrait tablets)
  assert.match(m1024Block, /\.mobile-jump-bar\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0/);
  assert.match(m1024Block, /\.mobile-jump-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(m1024Block, /\.mobile-quick-save-bar\s*\{[^}]*position:\s*fixed/);
  assert.match(m1024Block, /\.mobile-quick-save-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(m1024Block, /--creata-back-toast-bottom:\s*calc\(/);
  assert.match(m1024Block, /scroll-margin-top:\s*calc\(/);
  assert.match(m1024Block, /\.workspace-shell\s*\{[^}]*padding-bottom:\s*calc\(140px/);

  // Item 8: .hdr-btn.stage-action-btn override inside @media (max-width: 768px) (covers 481px-768px)
  assert.match(m768Block, /\.hdr-btn\.stage-action-btn\s*\{[^}]*min-height:\s*36px[^}]*font-size:\s*11px/);

  assert.match(mobileCss, /#btnAssignPhotoNow\s*\{[^}]*min-height:\s*46px/);
  assert.match(mobileCss, /\.gallery-tab-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(FOTOS_CSS_SRC, /\.lightbox-close-btn\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.match(FOTOS_CSS_SRC, /\.modal-close-btn\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  // Must NEVER shrink #btnAssignPhotoNow back to 38px
  assert.ok(!/#btnAssignPhotoNow\s*\{[^}]*height:\s*38px/.test(mobileCss));

  // Verify inline height/font-size locks removed from HTML and dynamic JS .hdr-btn elements
  assert.ok(!/id="inboxSearchInput"[^>]*style=/.test(FOTOS_HTML_SRC), '#inboxSearchInput must not have inline style lock');
  assert.ok(!/id="btnSyncSkusCard"[^>]*style=/.test(FOTOS_HTML_SRC), '#btnSyncSkusCard must not have inline style lock');
  assert.ok(!/id="btnDirectUploadLabel"[^>]*style=/.test(FOTOS_HTML_SRC), '#btnDirectUploadLabel must not have inline style lock');
  assert.ok(!/class="hdr-btn[^"]*"\s+style="height:(?:24|28|30)px/.test(FOTOS_APP_SRC), 'Dynamic JS .hdr-btn elements must use semantic classes instead of inline height locks');
});

test('UX-4: 100dvh, overflow-x: clip, hover guard, split selector fix, and ZERO undefined CSS custom properties', () => {
  assert.match(FOTOS_CSS_SRC, /min-height:\s*100dvh/);
  assert.match(FOTOS_CSS_SRC, /overflow-x:\s*clip/);
  assert.match(FOTOS_CSS_SRC, /touch-action:\s*manipulation/);
  assert.match(FOTOS_CSS_SRC, /@media\s*\(\s*hover:\s*hover\s*\)/);
  assert.match(FOTOS_CSS_SRC, /body\.fotos-split-active:not\(\.fotos-split-vertical\)\s+\.workbench-grid/);
  assert.match(FOTOS_CSS_SRC, /\.lightbox-backdrop\s*\{[^}]*z-index:\s*1200/);

  // Extract all :root defined custom properties
  const rootMatch = FOTOS_CSS_SRC.match(/:root\s*\{([\s\S]*?)\}/);
  assert.ok(rootMatch, ':root block must exist');
  const definedVars = new Set();
  for (const m of rootMatch[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    definedVars.add(m[1]);
  }
  assert.ok(definedVars.has('--gold-accent'));
  assert.ok(definedVars.has('--gold-light'));
  assert.ok(definedVars.has('--bg-card'));

  // Every var(--name) WITHOUT a fallback must be defined in :root
  const undefinedVars = [];
  for (const m of FOTOS_CSS_SRC.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
    if (!definedVars.has(m[1])) undefinedVars.push(m[1]);
  }
  assert.deepEqual(undefinedVars, [], `Undefined CSS variables found: ${undefinedVars.join(', ')}`);
});

test('UX-5: Mobile inputs & selects enforce font-size: 16px (anti-iOS auto-zoom) and zero inline font-size on inputs', () => {
  const mobileBlockIdx = FOTOS_CSS_SRC.indexOf('@media (max-width: 768px)');
  const mobileCss = FOTOS_CSS_SRC.slice(mobileBlockIdx);
  assert.match(mobileCss, /\.field-input,\s*\.search-input,\s*\.inbox-search-input,\s*\.dest-select\s*\{[^}]*font-size:\s*16px[^}]*min-height:\s*44px/);
  assert.ok(!/<(?:input|select)\b[^>]*style=["'][^"']*font-size/i.test(FOTOS_HTML_SRC));
});

test('UX-6: Cache version consistency (v6/img-v6, CSS?v=16, JS?v=17, manifest?v=3, back-nav?v=1) & fotos-sw.js VM lifecycle', async () => {
  assert.match(FOTOS_HTML_SRC, /fotos-manifest\.json\?v=3/);
  assert.match(FOTOS_HTML_SRC, /fotos-productos-styles\.css\?v=16/);
  assert.match(FOTOS_HTML_SRC, /creata-back-nav\.js\?v=1/);
  assert.match(FOTOS_HTML_SRC, /fotos-productos-app\.js\?v=17/);
  assert.match(FOTOS_SW_SRC, /CACHE_PREFIX\s*\+\s*['"]v6['"]/);
  assert.match(FOTOS_SW_SRC, /CACHE_PREFIX\s*\+\s*['"]img-v6['"]/);
  assert.match(FOTOS_APP_SRC, /register\(['"]\.\/fotos-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/fotos-productos['"]\s*\}/);

  // Execute fotos-sw.js inside node:vm
  const listeners = {};
  const deletedKeys = [];
  const openedCaches = [];
  const existingKeys = [
    'creata-fotos-app-v4',
    'creata-fotos-app-img-v4',
    'creata-fotos-app-v5',
    'creata-fotos-app-img-v5',
    'creata-fotos-app-v6',
    'creata-fotos-app-img-v6',
    'creata-prompts-app-v3',
    'creata-inventario-v1'
  ];

  const swSandbox = {
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    Response: { error: () => ({ ok: false }) },
    Request: function (u, o) { return { url: u, ...(o || {}) }; },
    caches: {
      keys: async () => existingKeys.slice(),
      delete: async (k) => { deletedKeys.push(k); return true; },
      open: async (name) => {
        openedCaches.push(name);
        return {
          put: async () => {},
          match: async () => null,
          keys: async () => [],
          delete: async () => true
        };
      }
    },
    fetch: async () => ({ ok: true, type: 'basic', clone: () => ({ ok: true }) }),
    self: {
      location: {
        origin: 'https://ikerreyna3942-debug.github.io',
        href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-sw.js'
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (ev, fn) => { listeners[ev] = fn; }
    }
  };
  vm.runInNewContext(FOTOS_SW_SRC, swSandbox, { filename: 'fotos-sw.js' });

  // Activate evicts v4 and v5 while preserving v6, img-v6, and sibling app caches
  let activatePromise;
  listeners.activate({ waitUntil: (p) => { activatePromise = p; } });
  await activatePromise;
  assert.deepEqual(deletedKeys.sort(), [
    'creata-fotos-app-img-v4',
    'creata-fotos-app-img-v5',
    'creata-fotos-app-v4',
    'creata-fotos-app-v5'
  ]);

  // Fetch handler checks
  const checkFetch = async (url, method = 'GET') => {
    let intercepted = false;
    let respPromise = null;
    listeners.fetch({
      request: { url, method, mode: 'cors' },
      respondWith: (p) => {
        intercepted = true;
        respPromise = p;
      }
    });
    if (respPromise) await respPromise;
    return intercepted;
  };

  assert.equal(await checkFetch('https://script.google.com/macros/s/ABC/exec', 'GET'), false);
  assert.equal(await checkFetch('https://script.google.com/macros/s/ABC/exec', 'POST'), false);
  assert.equal(await checkFetch('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos-app.js?v=17', 'POST'), false);
  assert.equal(await checkFetch('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/creata-back-nav.js?v=1', 'GET'), true);
  assert.equal(await checkFetch('https://lh3.googleusercontent.com/d/abc12345=w400', 'GET'), true);
  assert.ok(openedCaches.includes('creata-fotos-app-img-v6'));
  assert.ok(openedCaches.includes('creata-fotos-app-v6'));
});

test('UX-7: Preserved Kevin exclusive auth, Project A (SUBIR PREN) isolation, F8 removal, and pendingDeletes reliability', () => {
  assert.match(FOTOS_HTML_SRC, /id="ownerEmailInput"[\s\S]*?value="kevin\.reyna@grupoanipa\.com"[\s\S]*?readonly/);
  assert.match(FOTOS_APP_SRC, /OWNER_EMAIL\s*=\s*['"]kevin\.reyna@grupoanipa\.com['"]/);
  assert.match(FOTOS_APP_SRC, /SUBIR_FOLDER_ID\s*=\s*['"]11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p['"]/);
  assert.match(FOTOS_HTML_SRC, /id="btnAssignPhotoNow"[\s\S]*?onclick="assignSelectedPhotoToProduct\(\)"[\s\S]*?>\s*Guardar\s*</);

  const combined = [FOTOS_HTML_SRC, FOTOS_APP_SRC, FOTOS_CSS_SRC, FOTOS_SW_SRC, FOTOS_MANIFEST_SRC].join('\n');
  const forbidden = [
    '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
    '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ',
    '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B',
    '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg',
    'SUBIR PROPT',
    'SUBIR COTIZACION',
    'Auto-acomodar',
    'btnAutoAssignByCategory'
  ];
  for (const token of forbidden) {
    assert.ok(!combined.includes(token), `Forbidden Project B / F8 token found in fotos-productos.*: ${token}`);
  }

  // PR #3 pendingDeletes / retry fixes intact
  assert.match(FOTOS_APP_SRC, /DELETED_QUEUE_TTL_MS/);
  assert.match(FOTOS_APP_SRC, /drainPendingDeletedQueueAsync/);
});

test('UX-8: Zero locked-file modifications and zero tracked metadata (.agents/ or PROJECT.md)', () => {
  const diffOut = execFileSync('git', ['diff', '--name-only', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  const changed = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const lockedRes = [
    /^index\.html$/,
    /^catalog-/,
    /^admin/,
    /^inventario-sw\.js$/,
    /^ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO\.txt$/
  ];
  const violations = changed.filter((f) => lockedRes.some((re) => re.test(f)));
  assert.deepEqual(violations, [], `Locked files modified: ${violations.join(', ')}`);

  const trackedOut = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  const tracked = trackedOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const leaked = tracked.filter((f) => f.startsWith('.agents/') || f === 'PROJECT.md');
  assert.deepEqual(leaked, [], `Metadata files must never be tracked in git: ${leaked.join(', ')}`);
});
