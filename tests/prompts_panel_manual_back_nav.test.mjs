import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BACK_NAV_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');
const PROMPTS_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
const PANEL_APP_SRC = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');
const MANUAL_HTML_SRC = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-manual.html'), 'utf8');

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

  function advance(ms) {
    const target = nowMs + Math.max(0, Number(ms) || 0);
    while (true) {
      let next = null;
      for (const [id, entry] of timers.entries()) {
        if (entry.runAt <= target && (!next || entry.runAt < next.entry.runAt)) {
          next = { id, entry };
        }
      }
      if (!next) break;
      timers.delete(next.id);
      nowMs = next.entry.runAt;
      next.entry.fn();
    }
    nowMs = target;
  }

  return {
    now: () => nowMs,
    setTimer,
    clearTimer,
    advance
  };
}

function createFakeDateClass(clock) {
  return class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.now());
      else super(...args);
    }
    static now() {
      return clock.now();
    }
  };
}

function createDomElement(tagName, id = '') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];

  const el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    id,
    value: '',
    type: 'text',
    innerHTML: '',
    textContent: '',
    src: '',
    style: {},
    dataset: {},
    disabled: false,
    parentNode: null,
    children,
    focusCalls: 0,
    blurCalls: 0,
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      for (const token of String(val || '').split(/\s+/).filter(Boolean)) {
        classes.add(token);
      }
    },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
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
    setAttribute(k, v) {
      attrs.set(String(k), String(v));
      if (k === 'id') el.id = String(v);
      if (k === 'src') el.src = String(v);
    },
    getAttribute(k) {
      return attrs.has(String(k)) ? attrs.get(String(k)) : null;
    },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      if (!listeners.has(ev)) return;
      listeners.set(ev, listeners.get(ev).filter((f) => f !== fn));
    },
    dispatchEvent(ev) {
      const list = listeners.get(ev.type) || [];
      for (const fn of list.slice()) fn(ev);
    },
    appendChild(child) {
      if (child) {
        child.parentNode = el;
        children.push(child);
      }
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
      if (idx >= 0) children.splice(idx, 1, newChild);
      else children.push(newChild);
      if (oldChild) oldChild.parentNode = null;
      if (newChild) newChild.parentNode = el;
      return oldChild;
    },
    cloneNode() {
      const cloned = createDomElement(el.tagName, el.id);
      cloned.className = el.className;
      for (const [k, v] of attrs.entries()) cloned.setAttribute(k, v);
      cloned.src = el.src;
      return cloned;
    },
    focus() {
      el.focusCalls++;
    },
    blur() {
      el.blurCalls++;
    },
    select() {}
  };
  return el;
}

function createMockHistoryAndLocation({ origin = 'https://ikerreyna3942-debug.github.io', pathname, search = '', hash = '' }) {
  const location = {
    protocol: 'https:',
    origin,
    pathname,
    search,
    hash,
    get href() {
      return `${location.origin}${location.pathname}${location.search}${location.hash}`;
    }
  };

  function applyUrlToLocation(rawUrl) {
    if (!rawUrl) return;
    const parsed = new URL(String(rawUrl), location.origin);
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  }

  const entries = [{ state: null, url: `${pathname}${search}${hash}`, skippable: false }];
  let index = 0;
  let exitedApp = false;
  let userActivation = true;
  const replaceLog = [];
  const pushLog = [];
  const popListeners = [];

  function firePopstate(state) {
    const ev = { type: 'popstate', state };
    for (const fn of popListeners.slice()) fn(ev);
  }

  const history = {
    get length() {
      return entries.length;
    },
    get state() {
      return index >= 0 && index < entries.length ? entries[index].state : null;
    },
    replaceState(state, _title, url) {
      const nextUrl = url !== undefined ? String(url) : entries[index].url;
      if (url !== undefined) applyUrlToLocation(nextUrl);
      entries[index] = {
        state: state === undefined ? null : structuredClone(state),
        url: nextUrl,
        skippable: entries[index].skippable
      };
      replaceLog.push({ state: entries[index].state, url: nextUrl });
    },
    pushState(state, _title, url) {
      entries.splice(index + 1);
      const nextUrl = url !== undefined ? String(url) : entries[index].url;
      if (url !== undefined) applyUrlToLocation(nextUrl);
      entries.push({
        state: state === undefined ? null : structuredClone(state),
        url: nextUrl,
        skippable: !userActivation
      });
      index = entries.length - 1;
      pushLog.push({ state: entries[index].state, url: nextUrl });
    },
    go(delta) {
      const nextIdx = index + Number(delta || 0);
      if (nextIdx < 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      if (nextIdx >= entries.length) return;
      index = nextIdx;
      firePopstate(entries[index].state);
    },
    back() {
      if (index <= 0) {
        index = -1;
        exitedApp = true;
        return;
      }
      index--;
      firePopstate(entries[index].state);
    }
  };

  function pressPhoneBack() {
    // Emulate Chrome 124+ skipping skippable entries on UI back button
    if (index <= 0) {
      index = -1;
      exitedApp = true;
      return;
    }
    let target = index - 1;
    while (target > 0 && entries[target].skippable) {
      target--;
    }
    index = target;
    firePopstate(entries[index].state);
  }

  return {
    location,
    history,
    popListeners,
    pressPhoneBack,
    setUserActivation: (v) => { userActivation = Boolean(v); },
    getStats: () => ({
      entries: entries.slice(),
      index,
      exitedApp,
      replaceLog: replaceLog.slice(),
      pushLog: pushLog.slice()
    })
  };
}

function createBaseSandbox({ pathname, search = '', hash = '', initialStorage = {}, fetchImpl }) {
  const clock = createFakeClock();
  const FakeDate = createFakeDateClass(clock);
  const { location, history, popListeners, pressPhoneBack, setUserActivation, getStats } =
    createMockHistoryAndLocation({ pathname, search, hash });

  const localStore = new Map(Object.entries(initialStorage));
  const sessionStore = new Map();
  const winListeners = new Map();
  const docListeners = new Map();
  const elementsById = new Map();

  const head = createDomElement('HEAD', '');
  const body = createDomElement('BODY', '');
  const documentElement = createDomElement('HTML', '');
  documentElement.requestFullscreen = () => {
    documentObj.fullscreenElement = documentElement;
    return Promise.resolve();
  };

  function registerElement(el) {
    if (el && el.id) elementsById.set(el.id, el);
    return el;
  }

  function findByIdInTree(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const ch of node.children || []) {
      const hit = findByIdInTree(ch, id);
      if (hit) return hit;
    }
    return null;
  }

  const origBodyAppend = body.appendChild.bind(body);
  body.appendChild = (ch) => {
    registerElement(ch);
    return origBodyAppend(ch);
  };
  const origHeadAppend = head.appendChild.bind(head);
  head.appendChild = (ch) => {
    registerElement(ch);
    return origHeadAppend(ch);
  };

  const documentObj = {
    readyState: 'complete',
    head,
    body,
    documentElement,
    fullscreenElement: null,
    exitFullscreenCalls: 0,
    exitFullscreen() {
      documentObj.exitFullscreenCalls++;
      documentObj.fullscreenElement = null;
      return Promise.resolve();
    },
    getElementById(id) {
      return findByIdInTree(body, id) || findByIdInTree(head, id) || elementsById.get(id) || null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => createDomElement(tag, ''),
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      if (!docListeners.has(ev)) return;
      docListeners.set(ev, docListeners.get(ev).filter((f) => f !== fn));
    },
    dispatchEvent(ev) {
      const list = docListeners.get(ev.type) || [];
      for (const fn of list.slice()) fn(ev);
    },
    execCommand: () => true
  };

  const sandbox = {
    console,
    Date: FakeDate,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Promise,
    Map,
    Set,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout: clock.setTimer,
    clearTimeout: clock.clearTimer,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k)
    },
    sessionStorage: {
      getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
      setItem: (k, v) => sessionStore.set(k, String(v)),
      removeItem: (k) => sessionStore.delete(k)
    },
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      platform: 'Linux',
      maxTouchPoints: 5,
      serviceWorker: { register: () => Promise.resolve() }
    },
    location,
    history,
    document: documentObj,
    fetch: fetchImpl || (async () => ({ ok: true, text: async () => JSON.stringify({ ok: true }), json: async () => ({ ok: true }) })),
    alert: () => {},
    confirm: () => true,
    open: () => {},
    print: () => {}
  };

  sandbox.window = sandbox;
  sandbox.parent = sandbox;
  sandbox.matchMedia = () => ({ matches: false });
  sandbox.addEventListener = (ev, fn) => {
    if (ev === 'popstate') popListeners.push(fn);
    if (!winListeners.has(ev)) winListeners.set(ev, []);
    winListeners.get(ev).push(fn);
  };
  sandbox.removeEventListener = (ev, fn) => {
    if (ev === 'popstate') {
      const idx = popListeners.indexOf(fn);
      if (idx >= 0) popListeners.splice(idx, 1);
    }
    if (winListeners.has(ev)) {
      winListeners.set(ev, winListeners.get(ev).filter((f) => f !== fn));
    }
  };
  sandbox.dispatchWindowEvent = (ev) => {
    const list = winListeners.get(ev.type) || [];
    for (const fn of list.slice()) fn(ev);
  };

  return {
    sandbox,
    clock,
    elementsById,
    registerElement,
    pressPhoneBack,
    setUserActivation,
    getStats,
    localStore,
    sessionStore
  };
}

function setupPromptsEnv(opts = {}) {
  const env = createBaseSandbox({
    pathname: '/MCP-REPOCITORIO/prompts.html',
    search: opts.search || '',
    initialStorage: opts.initialStorage || {},
    fetchImpl: opts.fetchImpl
  });

  const ids = [
    'promptsStatusPill', 'promptsStatusText', 'promptsLoadingOverlay', 'overlaySpinner',
    'overlayTitle', 'overlaySub', 'overlayTimer', 'overlayActions', 'btnInstallPromptsApp',
    'nativeInstallBanner', 'promptsShell', 'floatingExpandBarBtn', 'proptScriptUrlInput',
    'proptOwnerEmailInput', 'proptPinInput', 'proptConnStatus', 'proptFeedback',
    'proptCountBadge', 'proptListCountLabel', 'proptGalleryGrid', 'proptConfigBox',
    'proptDrawer', 'proptDrawerBackdrop', 'proptHealthWarning', 'proptSkuInput',
    'proptSkuResult', 'promptsInstallModal', 'copyAppLinkFeedback'
  ];
  for (const id of ids) {
    const el = createDomElement('DIV', id);
    if (['promptsInstallModal', 'proptDrawer', 'proptDrawerBackdrop', 'proptSkuResult', 'proptConfigBox', 'floatingExpandBarBtn', 'proptFeedback'].includes(id)) {
      el.classList.add('hidden');
    }
    env.sandbox.document.body.appendChild(el);
  }

  const stage = createDomElement('MAIN', 'promptsStage');
  const frame = createDomElement('IFRAME', 'promptsAppFrame');
  frame.src = 'about:blank';
  const iframeReplaceCalls = [];
  let iframeCurrentHref = 'about:blank';
  frame.contentWindow = {
    location: {
      get href() {
        if (iframeCurrentHref.startsWith('https://buena-espero.onrender.com')) {
          throw new Error('Blocked cross-origin frame access');
        }
        return iframeCurrentHref;
      },
      replace(u) {
        iframeReplaceCalls.push(String(u));
        iframeCurrentHref = String(u);
      }
    }
  };
  stage.appendChild(frame);
  env.sandbox.document.body.appendChild(stage);

  const ctx = vm.createContext(env.sandbox);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(PROMPTS_APP_SRC, ctx, { filename: 'prompts-app.js' });

  return {
    ...env,
    stage,
    initialFrame: frame,
    iframeReplaceCalls,
    getToastEl: () => env.sandbox.document.getElementById('creataBackNavToast')
  };
}

test('Prompts + CreataBackNav: ?scriptUrl= is stripped BEFORE CreataBackNav seeds base(0) state with clean URL', () => {
  const env = setupPromptsEnv({
    search: '?scriptUrl=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FNEW_SCRIPT_ID_123%2Fexec',
    initialStorage: {
      creata_prompts_webapp_url_v1: 'https://script.google.com/macros/s/SAVED_ID_111/exec'
    }
  });

  const stats = env.getStats();
  assert.equal(stats.replaceLog.length, 2, 'ingestQueryScriptUrl strips ?scriptUrl= first, then CreataBackNav seeds base(0)');
  assert.equal(stats.replaceLog[0].url, '/MCP-REPOCITORIO/prompts.html');
  assert.equal(stats.replaceLog[1].url, '/MCP-REPOCITORIO/prompts.html');
  assert.equal(stats.replaceLog[1].state.__creataBackNav, true);
  assert.equal(stats.replaceLog[1].state.appId, 'prompts');
  assert.equal(stats.replaceLog[1].state.depth, 0);
  assert.equal(env.sandbox.location.search, '');
  assert.ok(env.sandbox.__CREATA_PROMPTS_BACK_NAV__, 'window.__CREATA_PROMPTS_BACK_NAV__ must be exposed');
  assert.equal(typeof env.sandbox.handlePromptsBackAction, 'function', 'window.handlePromptsBackAction must be exposed');
});

test('Prompts + CreataBackNav: full 5-step priority unwind (install_modal -> propt_config -> propt_sku_search w/ blur -> propt_drawer -> collapsed_topbar -> exit_guard -> exit)', async () => {
  const env = setupPromptsEnv({
    initialStorage: {
      creata_prompts_webapp_url_v1: 'https://script.google.com/macros/s/LEGIT_PROPT_12345/exec',
      creata_prompts_pin_v1: '1234'
    },
    fetchImpl: async (_url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : {};
      if (body.action === 'prompts_health') {
        return { ok: true, text: async () => JSON.stringify({ ok: true, warnings: [] }) };
      }
      if (body.action === 'prompts_propt_list') {
        return { ok: true, text: async () => JSON.stringify({ ok: true, folderId: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX', files: [] }) };
      }
      if (body.action === 'prompts_sku_lookup') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            ok: true,
            found: true,
            match: { sku: 'HAK1PLUM', nombre: 'Sillón Haka', tipo_mueble: 'SILLON', medidas: '90x90' }
          })
        };
      }
      return { ok: true, text: async () => JSON.stringify({ ok: true }) };
    }
  });

  const { sandbox, clock, pressPhoneBack, getStats, getToastEl } = env;
  const doc = sandbox.document;
  const skuInput = doc.getElementById('proptSkuInput');
  const skuResult = doc.getElementById('proptSkuResult');
  const configBox = doc.getElementById('proptConfigBox');
  const drawer = doc.getElementById('proptDrawer');
  const installModal = doc.getElementById('promptsInstallModal');
  const shell = doc.getElementById('promptsShell');

  // Step-by-step user interactions across distinct gestures (advance clock > 80ms each)
  sandbox.togglePromptsTopbar(true);
  clock.advance(200);
  sandbox.toggleProptDrawer(true);
  await Promise.resolve();
  clock.advance(200);
  skuInput.value = 'HAK1PLUM';
  skuInput.dispatchEvent({ type: 'input' });
  clock.advance(200);
  await sandbox.lookupPromptsSku();
  clock.advance(200);
  sandbox.toggleProptConfigPanel(true);
  clock.advance(200);
  sandbox.openPromptsInstallModal();
  clock.advance(200);

  assert.equal(installModal.classList.contains('hidden'), false);
  assert.equal(configBox.classList.contains('hidden'), false);
  assert.equal(skuResult.classList.contains('hidden'), false);
  assert.equal(drawer.classList.contains('hidden'), false);
  assert.equal(shell.classList.contains('is-bar-collapsed'), true);

  // Back #1: install_modal
  pressPhoneBack();
  assert.equal(installModal.classList.contains('hidden'), true, 'Back #1 closes install modal');
  assert.equal(configBox.classList.contains('hidden'), false, 'Config stays open');
  assert.equal(drawer.classList.contains('hidden'), false, 'Drawer stays open');

  // Back #2: propt_config
  pressPhoneBack();
  assert.equal(configBox.classList.contains('hidden'), true, 'Back #2 closes propt_config');
  assert.equal(getToastEl().textContent, 'Configuración cerrada');
  assert.equal(drawer.classList.contains('hidden'), false, 'Drawer stays open');

  // Back #3: propt_sku_search (must clear, blur, and NEVER focus)
  pressPhoneBack();
  assert.equal(skuInput.value, '', 'Back #3 clears SKU input');
  assert.equal(skuResult.classList.contains('hidden'), true, 'Back #3 hides SKU result');
  assert.equal(skuInput.blurCalls, 1, 'Back #3 blurs SKU input to dismiss mobile keyboard');
  assert.equal(skuInput.focusCalls, 0, 'Back #3 must NEVER call focus() on SKU input');
  assert.equal(getToastEl().textContent, 'Consulta SKU limpiada');
  assert.equal(drawer.classList.contains('hidden'), false, 'Drawer stays open');

  // Back #4: propt_drawer
  pressPhoneBack();
  assert.equal(drawer.classList.contains('hidden'), true, 'Back #4 closes propt_drawer');
  assert.equal(getToastEl().textContent, 'Panel SUBIR PROPT cerrado');
  assert.equal(shell.classList.contains('is-bar-collapsed'), true, 'Collapsed topbar still active');

  // Back #5: collapsed_topbar
  pressPhoneBack();
  assert.equal(shell.classList.contains('is-bar-collapsed'), false, 'Back #5 restores topbar');
  assert.equal(getToastEl().textContent, 'Barra superior restaurada');
  assert.equal(getStats().exitedApp, false);

  // Back #6: clean root -> exit guard warning (does NOT exit yet)
  pressPhoneBack();
  assert.equal(getStats().exitedApp, false, 'Back #6 warns before exiting');
  assert.equal(getToastEl().textContent, 'Presiona Atrás otra vez para salir');
  assert.equal(getToastEl().classList.contains('is-visible'), true);

  // Back #7 within 2.5s -> native exit
  clock.advance(800);
  pressPhoneBack();
  assert.equal(getStats().exitedApp, true, 'Back #7 within 2.5s exits app cleanly');
});

test('Prompts + CreataBackNav: unconfigured drawer skips propt_config step and closes propt_drawer directly', () => {
  const env = setupPromptsEnv({ initialStorage: {} });
  const { sandbox, clock, pressPhoneBack } = env;
  const doc = sandbox.document;
  const configBox = doc.getElementById('proptConfigBox');
  const drawer = doc.getElementById('proptDrawer');

  sandbox.toggleProptDrawer(true);
  clock.advance(200);
  assert.equal(drawer.classList.contains('hidden'), false);
  assert.equal(configBox.classList.contains('hidden'), false, 'Unconfigured drawer auto-opens configBox');

  pressPhoneBack();
  assert.equal(drawer.classList.contains('hidden'), true, 'Unconfigured drawer must close directly on 1st Back instead of trapping on propt_config');
});

test('Prompts + CreataBackNav: Escape unwinds strictly 1 layer per press (never double-closes modal + drawer, skips collapsed_topbar, never shows exit toast)', () => {
  const env = setupPromptsEnv({
    initialStorage: {
      creata_prompts_webapp_url_v1: 'https://script.google.com/macros/s/LEGIT_PROPT_12345/exec'
    }
  });
  const { sandbox } = env;
  const doc = sandbox.document;
  const installModal = doc.getElementById('promptsInstallModal');
  const configBox = doc.getElementById('proptConfigBox');
  const skuInput = doc.getElementById('proptSkuInput');
  const drawer = doc.getElementById('proptDrawer');
  const shell = doc.getElementById('promptsShell');

  sandbox.togglePromptsTopbar(true);
  sandbox.toggleProptDrawer(true);
  skuInput.value = 'SOFA';
  sandbox.toggleProptConfigPanel(true);
  sandbox.openPromptsInstallModal();

  // Escape #1 -> ONLY install_modal
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(installModal.classList.contains('hidden'), true);
  assert.equal(configBox.classList.contains('hidden'), false);
  assert.equal(drawer.classList.contains('hidden'), false, 'Escape #1 must NOT double-close drawer');

  // Escape #2 -> ONLY propt_config
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(configBox.classList.contains('hidden'), true);
  assert.equal(skuInput.value, 'SOFA');
  assert.equal(drawer.classList.contains('hidden'), false);

  // Escape #3 -> ONLY propt_sku_search
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(skuInput.value, '');
  assert.equal(drawer.classList.contains('hidden'), false);

  // Escape #4 -> ONLY propt_drawer
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(drawer.classList.contains('hidden'), true);
  assert.equal(shell.classList.contains('is-bar-collapsed'), true, 'Collapsed topbar stays collapsed');

  // Escape #5 -> no-op (escapeAllowed: false on collapsed_topbar, no exit guard toast)
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(shell.classList.contains('is-bar-collapsed'), true);
  assert.notEqual(env.getToastEl() && env.getToastEl().textContent, 'Presiona Atrás otra vez para salir');
});

test('Prompts + CreataBackNav: loadGeneratorFrame uses replaceIframeUrl without pushing joint history and rebinds load on cross-origin reload & offline->online reconnect', () => {
  const env = setupPromptsEnv();
  const { sandbox, initialFrame, iframeReplaceCalls, stage, clock } = env;
  const overlay = sandbox.document.getElementById('promptsLoadingOverlay');
  const statusText = sandbox.document.getElementById('promptsStatusText');

  // Initial load from about:blank used contentWindow.location.replace (zero joint-history push)
  assert.equal(iframeReplaceCalls.length, 1);
  assert.match(iframeReplaceCalls[0], /^https:\/\/buena-espero\.onrender\.com\/\?embed=true/);
  assert.equal(initialFrame.src, 'about:blank', 'Did not directly assign frame.src on initial about:blank replace');

  // Firing load on initial frame hides loading overlay even though frame.src attr remained about:blank
  initialFrame.dispatchEvent({ type: 'load' });
  clock.advance(400);
  assert.equal(statusText.textContent, 'En línea');
  assert.equal(overlay.classList.contains('hidden'), true);

  // Triggering offline -> online reconnect (loadGeneratorFrame(false)) on cross-origin iframe MUST use replaceChild and NOT directly reassign old frame.src
  let replaceChildCount = 0;
  let directSrcMutationsOnOldFrame = 0;
  const origReplaceChild = stage.replaceChild.bind(stage);
  stage.replaceChild = (newCh, oldCh) => {
    replaceChildCount++;
    return origReplaceChild(newCh, oldCh);
  };
  let trackedSrc = initialFrame.src;
  Object.defineProperty(initialFrame, 'src', {
    configurable: true,
    get: () => trackedSrc,
    set: (v) => { directSrcMutationsOnOldFrame++; trackedSrc = String(v); }
  });
  sandbox.navigator.onLine = false;
  sandbox.dispatchWindowEvent({ type: 'offline' });
  sandbox.navigator.onLine = true;
  sandbox.dispatchWindowEvent({ type: 'online' });

  const reconnectedFrame = sandbox.document.getElementById('promptsAppFrame');
  assert.equal(replaceChildCount, 1, 'Offline->online reconnect must swap cross-origin iframe via replaceChild');
  assert.equal(directSrcMutationsOnOldFrame, 0, 'Offline->online reconnect must NOT directly reassign old frame.src');
  assert.notEqual(reconnectedFrame, initialFrame);
  assert.equal(stage.children[0], reconnectedFrame);
  reconnectedFrame.dispatchEvent({ type: 'load' });
  clock.advance(400);
  assert.equal(overlay.classList.contains('hidden'), true);

  // Ensure subsequent cross-origin reload also clones via replaceChild (simulate cross-origin contentWindow on cloned frame)
  reconnectedFrame.contentWindow = {
    location: {
      get href() { throw new Error('Blocked cross-origin frame access'); }
    }
  };
  sandbox.reloadPromptsGenerator();
  const currentFrame = sandbox.document.getElementById('promptsAppFrame');
  assert.equal(replaceChildCount, 2, 'Manual cross-origin reload also uses replaceChild');
  assert.notEqual(currentFrame, reconnectedFrame, 'Cross-origin reload clones iframe cleanly without pushing joint history');
  assert.equal(stage.children[0], currentFrame);
  assert.match(currentFrame.src, /&_r=\d+/);

  // Cloned iframe load handler is rebound and hides overlay
  currentFrame.dispatchEvent({ type: 'load' });
  clock.advance(400);
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('Panel + CreataBackNav: locked login gate never traps Back; unlocked double-back exit guard warns then exits; lockHubPortal resets to base(0)', async () => {
  const env = createBaseSandbox({
    pathname: '/MCP-REPOCITORIO/panel.html',
    initialStorage: {},
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true, authToken: 'OWNER_TOK_123' })
    })
  });

  const { sandbox, clock, pressPhoneBack, getStats } = env;
  const doc = sandbox.document;
  for (const id of ['hubGateBackdrop', 'hubMainShell', 'hubGateAlert', 'hubOwnerEmail', 'hubOwnerPassword', 'btnToggleHubPwd', 'btnHubLoginSubmit', 'projectsGridContainer', 'sheetsGridContainer']) {
    const el = createDomElement('DIV', id);
    if (id === 'hubMainShell' || id === 'hubGateAlert') el.classList.add('hidden');
    if (id === 'hubOwnerEmail') el.value = 'kevin.reyna@grupoanipa.com';
    doc.body.appendChild(el);
  }

  const ctx = vm.createContext(sandbox);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(PANEL_APP_SRC, ctx, { filename: 'panel-app.js' });

  const ctrl = sandbox.__CREATA_PANEL_BACK_NAV__;
  assert.ok(ctrl, 'window.__CREATA_PANEL_BACK_NAV__ must be exposed');
  assert.equal(typeof sandbox.handlePanelBackAction, 'function');

  // 1) Locked gate: interacting on login form must NOT push history or trap Back
  assert.equal(ctrl.getDebugState().enabled, false);
  doc.dispatchEvent({ type: 'click' });
  assert.equal(ctrl.getDebugState().currentDepth, 0, 'Locked panel must remain at depth 0');

  // 2) Unlock via user login -> arms back guard immediately
  doc.getElementById('hubOwnerPassword').value = 'valid_key';
  await sandbox.submitHubOwnerLogin({ preventDefault: () => {} });
  assert.equal(ctrl.getDebugState().enabled, true);
  assert.equal(ctrl.getDebugState().currentDepth, 1, 'User login syncs depth to 1');

  // Back #1 while unlocked -> warns with exit guard toast, does NOT exit
  pressPhoneBack();
  const toast = doc.getElementById('creataBackNavToast');
  assert.equal(getStats().exitedApp, false);
  assert.equal(toast.textContent, 'Presiona Atrás otra vez para salir');
  assert.equal(toast.classList.contains('is-visible'), true);

  // Let exit guard expire (> 2500ms), then lockHubPortal() -> resets to base(0)
  clock.advance(2600);
  assert.equal(ctrl.getDebugState().exitArmedUntil, 0);
  doc.dispatchEvent({ type: 'click' });
  assert.equal(ctrl.getDebugState().currentDepth, 1);

  sandbox.lockHubPortal();
  assert.equal(ctrl.getDebugState().enabled, false);
  assert.equal(ctrl.getDebugState().currentDepth, 0, 'lockHubPortal must call resetToBase() to collapse depth to 0');

  // Pressing Back on locked login gate exits immediately with NO toast
  pressPhoneBack();
  assert.equal(getStats().exitedApp, true, 'Locked login gate must never trap Back');
});

test('Panel + CreataBackNav: unlocked Back #1 warns and Back #2 within 2.5s exits natively', async () => {
  const env = createBaseSandbox({
    pathname: '/MCP-REPOCITORIO/panel.html',
    initialStorage: {
      creata_private_kevin_panel_v1: JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com', verifiedAt: Date.now() })
    }
  });
  const { sandbox, clock, pressPhoneBack, getStats } = env;
  const doc = sandbox.document;
  for (const id of ['hubGateBackdrop', 'hubMainShell', 'hubGateAlert', 'hubOwnerEmail', 'hubOwnerPassword', 'projectsGridContainer', 'sheetsGridContainer']) {
    doc.body.appendChild(createDomElement('DIV', id));
  }

  const ctx = vm.createContext(sandbox);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(PANEL_APP_SRC, ctx, { filename: 'panel-app.js' });

  const ctrl = sandbox.__CREATA_PANEL_BACK_NAV__;
  assert.equal(ctrl.getDebugState().enabled, true);
  assert.equal(ctrl.getDebugState().currentDepth, 0, 'Auto-unlock waits for user gesture (no push without gesture)');

  // User taps hub -> arms guard
  doc.dispatchEvent({ type: 'click' });
  assert.equal(ctrl.getDebugState().currentDepth, 1);

  // Back #1 -> warns
  pressPhoneBack();
  assert.equal(getStats().exitedApp, false);
  assert.equal(doc.getElementById('creataBackNavToast').textContent, 'Presiona Atrás otra vez para salir');

  // Back #2 within 2.5s -> exits natively
  clock.advance(500);
  pressPhoneBack();
  assert.equal(getStats().exitedApp, true);
});

test('Seguimiento Manual + CreataBackNav: unwinds async fullscreen -> edit_mode -> slides backward stopping at Slide 1 (never wrapping to Slide 15) -> exit_guard -> exit, plus Escape exits edit_mode', async () => {
  // Extract the inline <script> block from seguimiento-manual.html
  const scriptMatches = [...MANUAL_HTML_SRC.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scriptMatches.length >= 1, 'seguimiento-manual.html must contain its inline <script>');
  const inlineScript = scriptMatches[scriptMatches.length - 1][1];

  const env = createBaseSandbox({
    pathname: '/MCP-REPOCITORIO/seguimiento-manual.html'
  });
  const { sandbox, clock, pressPhoneBack, getStats } = env;
  const doc = sandbox.document;

  // Simulate realistic async browser requestFullscreen() where fullscreenElement updates only on Promise resolution
  doc.documentElement.requestFullscreen = () => Promise.resolve().then(() => {
    doc.fullscreenElement = doc.documentElement;
  });

  for (const id of ['slideViewport', 'slideCounter', 'slideSelector', 'btnEdit', 'print-container', 'btnPptx']) {
    doc.body.appendChild(createDomElement('DIV', id));
  }

  const ctx = vm.createContext(sandbox);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(inlineScript, ctx, { filename: 'seguimiento-manual.inline.js' });

  // Fire DOMContentLoaded
  sandbox.dispatchWindowEvent({ type: 'DOMContentLoaded' });

  const ctrl = sandbox.__CREATA_MANUAL_BACK_NAV__;
  assert.ok(ctrl, 'window.__CREATA_MANUAL_BACK_NAV__ must be exposed');
  assert.equal(typeof sandbox.handleManualBackAction, 'function');
  assert.equal(doc.getElementById('slideCounter').textContent, '1 / 15');

  // Navigate slides 1 -> 2 -> 3 -> 4 -> 5
  for (let i = 0; i < 4; i++) {
    sandbox.nextSlide();
    clock.advance(200);
  }
  assert.equal(doc.getElementById('slideCounter').textContent, '5 / 15');

  // Enter edit mode and async fullscreen -> verify depth increments after Promise resolution
  sandbox.toggleEditMode();
  clock.advance(200);
  const depthBeforeFs = ctrl.getDebugState().currentDepth;
  sandbox.toggleFullScreen();
  assert.equal(doc.fullscreenElement, null, 'Async requestFullscreen has not resolved synchronously');
  await Promise.resolve();
  await Promise.resolve();
  clock.advance(200);
  assert.ok(doc.fullscreenElement, 'Fullscreen should be active after Promise resolution');
  assert.equal(ctrl.getDebugState().currentDepth, depthBeforeFs + 1, 'Async requestFullscreen().then() must sync back depth');

  // Back #1: exits fullscreen
  pressPhoneBack();
  assert.equal(doc.fullscreenElement, null, 'Back #1 exits fullscreen');
  assert.equal(doc.exitFullscreenCalls, 1);
  assert.equal(doc.getElementById('slideViewport').classList.contains('editing-active'), true, 'Edit mode still active');

  // Back #2: exits edit mode
  pressPhoneBack();
  assert.equal(doc.getElementById('slideViewport').classList.contains('editing-active'), false, 'Back #2 disables edit mode');
  assert.equal(doc.getElementById('creataBackNavToast').textContent, 'Modo edición desactivado');
  assert.equal(doc.getElementById('slideCounter').textContent, '5 / 15');

  // Back #3..#6: unwinds slides 5 -> 4 -> 3 -> 2 -> 1
  for (const expectedSlide of [4, 3, 2, 1]) {
    pressPhoneBack();
    assert.equal(doc.getElementById('slideCounter').textContent, `${expectedSlide} / 15`);
    assert.equal(doc.getElementById('creataBackNavToast').textContent, `Diapositiva ${expectedSlide} / 15`);
  }

  // Back #7 at Slide 1: MUST NOT wrap to Slide 15; shows exit guard
  pressPhoneBack();
  assert.equal(doc.getElementById('slideCounter').textContent, '1 / 15', 'MUST stop at Slide 1 and NEVER wrap to Slide 15');
  assert.equal(doc.getElementById('creataBackNavToast').textContent, 'Presiona Atrás otra vez para salir');
  assert.equal(getStats().exitedApp, false);

  // Test Escape turns off edit_mode cleanly without altering slide
  sandbox.toggleEditMode();
  clock.advance(200);
  assert.equal(doc.getElementById('slideViewport').classList.contains('editing-active'), true);
  sandbox.dispatchWindowEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
  assert.equal(doc.getElementById('slideViewport').classList.contains('editing-active'), false, 'Escape disables edit mode');
  assert.equal(doc.getElementById('slideCounter').textContent, '1 / 15');

  // Now arm exit guard at Slide 1 and double-Back to exit
  pressPhoneBack();
  assert.equal(getStats().exitedApp, false);
  assert.equal(doc.getElementById('creataBackNavToast').textContent, 'Presiona Atrás otra vez para salir');
  clock.advance(500);
  pressPhoneBack();
  assert.equal(getStats().exitedApp, true, '2nd Back within 2.5s at Slide 1 exits cleanly');
});

test('Seguimiento Manual + CreataBackNav: slideHistory is bounded (<= 20) and Back from Slide 15 reached via prevSlide() returns to Slide 1 without re-wrapping', () => {
  const scriptMatches = [...MANUAL_HTML_SRC.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  const inlineScript = scriptMatches[scriptMatches.length - 1][1];
  const env = createBaseSandbox({ pathname: '/MCP-REPOCITORIO/seguimiento-manual.html' });
  const { sandbox, clock, pressPhoneBack } = env;
  const doc = sandbox.document;
  for (const id of ['slideViewport', 'slideCounter', 'slideSelector', 'btnEdit', 'print-container', 'btnPptx']) {
    doc.body.appendChild(createDomElement('DIV', id));
  }

  const ctx = vm.createContext(sandbox);
  vm.runInContext(BACK_NAV_SRC, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(inlineScript, ctx, { filename: 'seguimiento-manual.inline.js' });
  sandbox.dispatchWindowEvent({ type: 'DOMContentLoaded' });

  // From Slide 1, user clicks prevSlide() (wraps UI to Slide 15); Back must return directly to Slide 1
  sandbox.prevSlide();
  clock.advance(200);
  assert.equal(doc.getElementById('slideCounter').textContent, '15 / 15');
  pressPhoneBack();
  assert.equal(doc.getElementById('slideCounter').textContent, '1 / 15');

  // Next Back at Slide 1 triggers exit guard (does NOT wrap back to Slide 15)
  pressPhoneBack();
  assert.equal(doc.getElementById('slideCounter').textContent, '1 / 15');
  assert.equal(doc.getElementById('creataBackNavToast').textContent, 'Presiona Atrás otra vez para salir');

  // Navigating 25 slides keeps slideHistory bounded (<= 20) and CreataBackNav stack bounded (<= 13 entries)
  clock.advance(2600);
  for (let i = 0; i < 25; i++) {
    sandbox.nextSlide();
    clock.advance(150);
  }
  const histLen = vm.runInContext('slideHistory.length', ctx);
  assert.ok(histLen <= 20, `slideHistory must stay <= 20, got ${histLen}`);
  assert.ok(env.getStats().entries.length <= 13, `History stack must stay <= 13 entries, got ${env.getStats().entries.length}`);
});

test('Static coverage check: fotos-productos.html, prompts.html, panel.html, and seguimiento-manual.html load ./creata-back-nav.js?v=1 before app logic', () => {
  const checks = [
    { file: 'fotos-productos.html', appPattern: /fotos-productos-app\.js\?v=29/ },
    { file: 'prompts.html', appPattern: /prompts-app\.js\?v=11/ },
    { file: 'panel.html', appPattern: /panel-app\.js\?v=12/ },
    { file: 'seguimiento-manual.html', appPattern: /<script>\s*\r?\n\s*let isEditMode/ }
  ];

  for (const { file, appPattern } of checks) {
    const html = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const backNavIdx = html.indexOf('<script src="./creata-back-nav.js?v=1"></script>');
    assert.ok(backNavIdx >= 0, `${file} must load ./creata-back-nav.js?v=1`);
    const appMatch = appPattern.exec(html);
    assert.ok(appMatch, `${file} must contain expected app script`);
    assert.ok(backNavIdx < appMatch.index, `${file} must load creata-back-nav.js?v=1 BEFORE its app script`);
  }
});
