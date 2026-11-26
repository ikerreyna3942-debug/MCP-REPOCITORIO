import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const INV_HTML = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
const INV_CSS = fs.readFileSync(path.join(REPO_ROOT, 'inventario-ui.css'), 'utf8');
const INV_JS = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
const BACK_NAV_JS = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');

function assertBalancedCssBraces(css, label) {
  let depth = 0;
  let inComment = false;
  let inStr = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const nxt = css[i + 1];
    if (inComment) {
      if (ch === '*' && nxt === '/') { inComment = false; i++; }
      continue;
    }
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && nxt === '*') { inComment = true; i++; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, `${label}: unmatched closing brace at index ${i}`);
    }
  }
  assert.equal(depth, 0, `${label}: unbalanced CSS braces (remaining depth=${depth})`);
}

function makeFakeElement(tag, id = '') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    id,
    value: '',
    checked: false,
    disabled: false,
    options: [],
    selectedIndex: 0,
    style: {
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; }
    },
    children: [],
    _innerHTML: '',
    _textContent: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v || ''); },
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v || ''); },
    classList: {
      add(...cs) { cs.forEach((c) => c && classes.add(c)); },
      remove(...cs) { cs.forEach((c) => classes.delete(c)); },
      toggle(c, force) {
        if (force === undefined) {
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c); return true;
        }
        if (force) classes.add(c); else classes.delete(c);
        return !!force;
      },
      contains(c) { return classes.has(c); }
    },
    setAttribute(k, v) { attrs.set(String(k), String(v)); },
    getAttribute(k) { return attrs.has(String(k)) ? attrs.get(String(k)) : null; },
    removeAttribute(k) { attrs.delete(String(k)); },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      const e = Object.assign({ preventDefault() {}, stopPropagation() {}, target: el }, ev || {});
      const list = listeners.get(e.type) || [];
      for (const fn of list) fn.call(el, e);
    },
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) {
      const idx = el.children.indexOf(child);
      if (idx >= 0) el.children.splice(idx, 1);
      return child;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() { el._doc && (el._doc.activeElement = el); el.dispatchEvent({ type: 'focus' }); },
    blur() { if (el._doc && el._doc.activeElement === el) el._doc.activeElement = el._doc.body; el.dispatchEvent({ type: 'blur' }); },
    select() { el._selected = true; },
    scrollTo() {},
    scrollIntoView() {}
  };
  return el;
}

function bootRuntime({ userAgent, products = [], advisorSession = null } = {}) {
  const byId = new Map();
  const docListeners = new Map();
  const winListeners = new Map();
  const timers = [];
  let timerSeq = 1;
  let fakeNow = 1764000000000;

  const viewportMeta = makeFakeElement('META', '');
  viewportMeta.setAttribute('name', 'viewport');
  viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');

  const body = makeFakeElement('BODY', '');
  const head = makeFakeElement('HEAD', '');
  const doc = {
    body,
    head,
    documentElement: makeFakeElement('HTML', ''),
    activeElement: body,
    visibilityState: 'visible',
    createElement(tag) {
      const el = makeFakeElement(tag);
      el._doc = doc;
      return el;
    },
    createDocumentFragment() {
      return { children: [], appendChild(c) { this.children.push(c); return c; } };
    },
    getElementById(id) { return byId.get(id) || null; },
    querySelector(sel) {
      if (sel === 'meta[name="viewport"]') return viewportMeta;
      if (sel && sel.startsWith('#')) return byId.get(sel.slice(1).split(' ')[0]) || null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      const e = Object.assign({ preventDefault() {}, stopPropagation() {} }, ev || {});
      const list = docListeners.get(e.type) || [];
      for (const fn of list) fn.call(doc, e);
    },
    execCommand() { return true; }
  };
  body._doc = doc;

  // Hydrate all IDs from inventario.html
  const idTagRe = /<([a-zA-Z0-9]+)[^>]*?\bid="([^"]+)"[^>]*>/g;
  let m;
  while ((m = idTagRe.exec(INV_HTML)) !== null) {
    const [, tag, id] = m;
    if (!byId.has(id)) {
      const el = makeFakeElement(tag, id);
      el._doc = doc;
      if (/\bclass="[^"]*\bhidden\b/.test(m[0])) el.classList.add('hidden');
      const im = m[0].match(/\binputmode="([^"]+)"/i);
      if (im) el.setAttribute('inputmode', im[1]);
      if (/\bchecked\b/i.test(m[0])) el.checked = true;
      byId.set(id, el);
    }
  }

  const storage = new Map();
  if (advisorSession) {
    storage.set('creata_inv_advisor_session_v1', JSON.stringify(advisorSession));
  }
  const localStorage = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); }
  };

  function FakeDate(...args) {
    if (!(this instanceof FakeDate)) return new Date(fakeNow).toString();
    return args.length ? new Date(...args) : new Date(fakeNow);
  }
  FakeDate.now = () => fakeNow;
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;

  const setTimeoutFn = (fn, ms = 0) => {
    const id = timerSeq++;
    timers.push({ id, fn, runAt: fakeNow + Number(ms || 0), cleared: false });
    return id;
  };
  const clearTimeoutFn = (id) => {
    const t = timers.find((x) => x.id === id);
    if (t) t.cleared = true;
  };

  const navObj = {
    userAgent: userAgent || 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    onLine: true,
    vibrate() { return true; },
    clipboard: { writeText: async () => {} }
  };

  const win = {
    document: doc,
    navigator: navObj,
    localStorage,
    sessionStorage: localStorage,
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', origin: 'https://ikerreyna3942-debug.github.io', protocol: 'https:', pathname: '/MCP-REPOCITORIO/inventario.html', search: '', hash: '' },
    history: { state: null, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; }, back() {} },
    innerWidth: 390,
    innerHeight: 844,
    isSecureContext: true,
    CREATA_INV_DATA: products,
    CREATA_INV_META: {
      warehouses: [
        'LPPT',
        'CEDIS (BODEGA)', 'CEDIS (PISO)',
        'CASA CREATA (BODEGA)', 'CASA CREATA (PISO)',
        'PUERTO CANCUN (BODEGA)', 'PUERTO CANCUN (PISO)',
        'COLOSIO (BODEGA)', 'COLOSIO (PISO)',
        'PLAYA (BODEGA)', 'PLAYA (PISO)'
      ]
    },
    CSS: { escape: (s) => String(s) },
    URL,
    Date: FakeDate,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => setTimeoutFn(fn, 16),
    fetch: async () => ({ ok: false, status: 503, text: async () => '', json: async () => ({}) }),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      const list = winListeners.get(ev.type) || [];
      for (const fn of list) fn.call(win, ev);
    },
    matchMedia: () => ({ matches: false, addEventListener() {} })
  };
  const ctxObj = Object.assign(win, {
    console,
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
    Promise,
    Error,
    Uint8Array,
    TextDecoder
  });
  const ctx = vm.createContext(ctxObj);
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInContext(BACK_NAV_JS, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(INV_JS, ctx, { filename: 'inventario-app.js' });
  doc.dispatchEvent({ type: 'DOMContentLoaded' });

  function advanceMs(delta) {
    fakeNow += delta;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const t of timers) {
        if (!t.cleared && t.runAt <= fakeNow) {
          t.cleared = true;
          t.fn();
          progressed = true;
        }
      }
    }
  }

  return { win, doc, byId, viewportMeta, advanceMs };
}

function makeSession(overrides = {}) {
  return Object.assign({
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'Kevin Reyna',
    rol: 'ADMIN',
    isAdmin: true,
    isManager: true,
    es_gerente: true,
    es_admin: true,
    isGuest: false,
    mustChangeKey: false,
    sheetTab: 'PTC',
    branchKey: 'PTC',
    branchLabel: 'Puerto Cancún',
    erpStore: 'CREATA PUERTO CANCUN',
    orderPrefix: 'PTC',
    authToken: 'tok_test'
  }, overrides);
}

test('Static Contracts: Restored header logo/search sizing, compact unified Cotización scale, and zero extra BT UI', () => {
  assertBalancedCssBraces(INV_CSS, 'inventario-ui.css');

  // 1. ALL visible Bluetooth scanner UI must be completely removed
  const forbiddenIdsAndClasses = [
    'headerBtScanBtn',
    'cartBtScanBar',
    'cartBtScanInput',
    'scanTabBt',
    'scanTabCam',
    'scanPanelBt',
    'btScanCaptureInput',
    'btnConnectBleScanner',
    'btScanResultCard',
    'btScanHistoryList',
    'inv-hdr-btn-bt',
    'inv-cart-bt-bar',
    'inv-scan-tabs',
    'inv-bt-capture-wrap'
  ];
  for (const token of forbiddenIdsAndClasses) {
    assert.ok(!INV_HTML.includes(token), `inventario.html must NOT contain removed BT UI token: ${token}`);
    assert.ok(!INV_CSS.includes(token), `inventario-ui.css must NOT contain removed BT UI token: ${token}`);
  }

  // Original clean camera #scanModal & #fabScanBtn restored
  assert.ok(INV_HTML.includes('Escanear código / SKU'), '#scanModal must keep original camera title');
  assert.ok(INV_HTML.includes('id="scanReader"') && INV_HTML.includes('id="scanStatus"'), '#scanModal must preserve camera reader elements');
  assert.match(INV_HTML, /id="fabScanBtn"[^>]*onclick="closeFabMenu\(\);\s*openBarcodeScanner\(\);"/, 'FAB scan button must call openBarcodeScanner() cleanly');
  assert.match(INV_HTML, /id="fabScanBtn"[\s\S]*?<span class="inv-fab-item-label">Escanear<\/span>/, 'FAB scan label must be restored to Escanear');

  // 2. Original #invHeader logo & search bar dimensions untouched (no 38px or 16px mobile bloat)
  assert.match(INV_CSS, /#invHeader #headerLogoImg\.logo-img\s*\{\s*height:\s*44px;/);
  assert.match(INV_CSS, /#invHeader \.inv-search-box\s*\{[\s\S]*?height:\s*32px;/);
  assert.match(INV_CSS, /#invHeader #invSearchInput\s*\{[\s\S]*?font-size:\s*10\.5px;/);
  assert.ok(!/#invHeader\s+\.inv-search-box\s*\{\s*height:\s*38px/.test(INV_CSS), 'Header search box must NOT be bloated to 38px on mobile');
  assert.ok(!/#invHeader\s+#invSearchInput,[\s\S]*?font-size:\s*16px !important/.test(INV_CSS), 'Header search input must NOT be bloated to 16px on mobile');

  // 3. Entire Cotización (#cartModal) matches compact app typography scale (11px inputs/selects, 1-line client search, responsive cards)
  assert.match(INV_CSS, /#cartModal select\s*\{[\s\S]*?font-size:\s*11px !important;/);
  assert.match(INV_CSS, /#cartModal input\[type="text"\],[\s\S]*?#cartModal textarea\s*\{[\s\S]*?font-size:\s*11px !important;/);
  assert.match(INV_CSS, /#cartModal \.inv-erp-client-search-row\s*\{[\s\S]*?flex-direction:\s*row !important;/);
  assert.match(INV_CSS, /#cartItemsContainer\s+\.inv-cart-item-card\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(INV_CSS, /#cartItemsContainer\s+\.inv-cart-item-title\s*\{[\s\S]*?font-size:\s*11px;/);
  assert.match(INV_CSS, /#cartModal\s+\.inv-cart-modal-footer\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(INV_JS, /function applyIosNoAutoZoomViewportGuard\(/, 'iOS no-auto-zoom viewport guard must exist');

  // Cache versions
  assert.ok(INV_HTML.includes('./inventario-ui.css?v=29'), 'inventario.html must load inventario-ui.css?v=29');
  assert.ok(INV_HTML.includes('inventario-app.js?v=114'), 'inventario.html must load inventario-app.js?v=114');
});

test('Runtime: universal zoom-lock viewport guard applies on both Apple iOS/iPadOS and Android, and renderCartItems renders compact responsive cards', async () => {
  const sampleProducts = [
    { s: 'CARRARAIZQ', tp: 'SILLON', mo: 'CARRARA', n: 'CARRARA SILLON IZQUIERDO ALTMAN COTTON COORD A ALANIS BEIGE', pr: '26630.06', st: [0, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0] },
    { s: 'LENYMUST', tp: 'SILLON', mo: 'LENY', n: 'LENY SILLON QUEENS MUSTARD PATA NOGAL', pr: '10588.90', st: [0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0] }
  ];

  // Apple iPhone: viewport gets maximum-scale=1.0, user-scalable=no so app zoom is locked
  const sbIos = bootRuntime({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    products: sampleProducts,
    advisorSession: makeSession()
  });
  assert.match(sbIos.viewportMeta.getAttribute('content'), /maximum-scale=1\.0/, 'iPhone/iPad must receive maximum-scale=1.0 zoom lock guard');
  assert.match(sbIos.viewportMeta.getAttribute('content'), /user-scalable=no/, 'iPhone/iPad must receive user-scalable=no zoom lock guard');

  // Android: viewport ALSO receives universal zoom-lock guard
  const sbAndroid = bootRuntime({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    products: sampleProducts,
    advisorSession: makeSession()
  });
  assert.match(sbAndroid.viewportMeta.getAttribute('content'), /maximum-scale=1\.0/, 'Android must also receive maximum-scale=1.0 zoom lock guard');
  assert.match(sbAndroid.viewportMeta.getAttribute('content'), /user-scalable=no/, 'Android must also receive user-scalable=no zoom lock guard');

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  sbAndroid.win.addToCart('CARRARAIZQ', 1);
  sbAndroid.win.addToCart('LENYMUST', 2);
  sbAndroid.win.openCartModal();

  const html = sbAndroid.byId.get('cartItemsContainer').innerHTML;
  assert.ok(html.includes('inv-cart-item-card'), 'Cart items must use responsive .inv-cart-item-card');
  assert.ok(html.includes('inv-cart-item-main'), 'Cart items must separate top info section .inv-cart-item-main');
  assert.ok(html.includes('inv-cart-item-controls'), 'Cart items must separate bottom controls bar .inv-cart-item-controls');
  assert.ok(html.includes('inputmode="decimal"'), 'Discount inputs must use inputmode="decimal" for mobile keypads');
  assert.ok(html.includes('CARRARA SILLON IZQUIERDO ALTMAN COTTON COORD A ALANIS BEIGE'), 'Full product name must be rendered');
  assert.ok(html.includes('SKU: CARRARAIZQ'), 'SKU tag must be shown inside cart item card');
});

test('Runtime Silent P2300L Bluetooth Scanner: Android/iOS HID keydown, search-bar scans, US->ES layout repair, QR URLs & [BLOQUEADO] 0-stock guard', async () => {
  const sampleProducts = [
    { s: 'API1P', tp: 'SILLON', mo: 'APIANO', n: 'SILLON APIANO BEIGE', pr: '14990', st: [2, 1, 1, 0, 0, 2, 0, 0, 0, 0, 0], fe: '2026-12-10' },
    { s: 'GF-WG1291', tp: 'ACCESORIO', mo: 'WG1291', n: 'FLORERO WG1291 CERAMICA', pr: '1850', st: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'BOT18209C&H', tp: 'ACCESORIO', mo: 'BOT18209', n: 'BOTELLA DECORATIVA C&H', pr: '990', st: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ZEROSTOCK99', tp: 'MESA', mo: 'ZERO', n: 'MESA SIN EXISTENCIA', pr: '9500', st: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];

  // 1. Android P2300L HID scan without any extra scanner UI open
  const sbAndroid = bootRuntime({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    products: sampleProducts,
    advisorSession: makeSession({ correo: 'asesor@casacreata.com', nombre: 'Asesor Android', rol: 'ASESOR', isAdmin: false, isManager: false, es_gerente: false, es_admin: false })
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const bt = sbAndroid.win.__creataBtScanner;
  assert.ok(bt, 'window.__creataBtScanner must remain exposed for silent scanning verification');

  // AIM symbology prefix + CR/LF stripping
  assert.equal(bt.normalizeScannedBarcodeText(']C1API1P\r\n'), 'API1P');
  assert.equal(bt.normalizeScannedBarcodeText(']Q1GF-WG1291\x1d'), 'GF-WG1291');

  // US-layout P2300L -> Spanish Android/iPhone layout repair: "'" -> "-" and "/" -> "&"
  const rHyphen = bt.resolveScannedBarcode("GF'WG1291");
  assert.equal(rHyphen.status, 'quotable');
  assert.equal(rHyphen.item.s, 'GF-WG1291');

  const rAmp = bt.resolveScannedBarcode('BOT18209C/H');
  assert.equal(rAmp.status, 'quotable');
  assert.equal(rAmp.item.s, 'BOT18209C&H');

  // QR Code URL (normal & Spanish-mangled) + SKU: prefix
  const rUrl = bt.resolveScannedBarcode('https://creata.mx/catalogo/?sku=API1P');
  assert.equal(rUrl.status, 'quotable');
  assert.equal(rUrl.item.s, 'API1P');

  const rMangledUrl = bt.resolveScannedBarcode('httpsÑ--creata.mx-catalogo-?sku¡API1P');
  assert.equal(rMangledUrl.status, 'quotable');
  assert.equal(rMangledUrl.item.s, 'API1P');

  const rPref = bt.resolveScannedBarcode('SKU: GF-WG1291');
  assert.equal(rPref.status, 'quotable');
  assert.equal(rPref.item.s, 'GF-WG1291');

  // Global Bluetooth HID keydown with 180ms jitter + Shift modifier + Enter -> opens product detail directly
  sbAndroid.doc.activeElement = sbAndroid.doc.body;
  for (const ch of "GF'WG1291") {
    sbAndroid.doc.dispatchEvent({ type: 'keydown', key: 'Shift' });
    sbAndroid.doc.dispatchEvent({ type: 'keydown', key: ch });
    sbAndroid.advanceMs(180);
  }
  sbAndroid.doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  assert.equal(sbAndroid.byId.get('productDetailModal').classList.contains('open'), true, 'Silent HID scan with Enter must open product detail');
  assert.equal(sbAndroid.byId.get('invSearchInput').value, 'GF-WG1291');
  assert.equal(sbAndroid.byId.get('scanModal').classList.contains('open'), false, 'Silent scan must NOT open #scanModal');

  // Global HID scan WITHOUT Enter suffix -> auto-flushes after 280ms
  sbAndroid.win.closeProductDetail();
  sbAndroid.advanceMs(600);
  for (const ch of 'API1P') {
    sbAndroid.doc.dispatchEvent({ type: 'keydown', key: ch });
    sbAndroid.advanceMs(35);
  }
  sbAndroid.advanceMs(320);
  assert.equal(sbAndroid.byId.get('productDetailModal').classList.contains('open'), true, 'No-Enter fast P2300L HID burst must auto-open product detail');
  assert.equal(sbAndroid.byId.get('invSearchInput').value, 'API1P');

  // [BLOQUEADO] 0-stock SKU guard: must NEVER open product detail or #scanModal
  sbAndroid.win.closeProductDetail();
  sbAndroid.advanceMs(600);
  const rZero = bt.processScannedBarcode('ZEROSTOCK99', { source: 'Bluetooth HID (P2300L)' });
  assert.equal(rZero.status, 'out_of_stock');
  assert.equal(sbAndroid.byId.get('productDetailModal').classList.contains('open'), false, '0-stock SKU must NOT open quotable product detail');
  assert.equal(sbAndroid.byId.get('scanModal').classList.contains('open'), false, '0-stock SKU must NOT open #scanModal');

  // Unknown external barcode -> filters search bar cleanly without opening any extra modal
  sbAndroid.advanceMs(600);
  const rRaw = bt.processScannedBarcode('7501234567890', { source: 'Bluetooth HID (P2300L)' });
  assert.equal(rRaw.status, 'raw_only');
  assert.equal(sbAndroid.byId.get('invSearchInput').value, '7501234567890');
  assert.equal(sbAndroid.byId.get('scanModal').classList.contains('open'), false, 'Unknown barcode must NOT open #scanModal');

  // 2. Apple iPhone iOS: scanning directly into #invSearchInput (both Enter and rapid no-Enter burst)
  const sbIos = bootRuntime({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    products: sampleProducts,
    advisorSession: makeSession()
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const searchInp = sbIos.byId.get('invSearchInput');
  searchInp.focus();
  searchInp.value = 'BOT18209C/H';
  sbIos.doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  assert.equal(sbIos.byId.get('productDetailModal').classList.contains('open'), true, 'iPhone P2300L Enter scan in #invSearchInput must open repaired SKU detail');
  assert.equal(searchInp.value, 'BOT18209C&H');
  assert.equal(searchInp._selected, true, 'Search text must be selected after scan so next P2300L scan overwrites cleanly');

  // iPhone P2300L rapid no-Enter burst inside #invSearchInput
  sbIos.win.closeProductDetail();
  sbIos.advanceMs(600);
  searchInp._selected = false;
  let typed = '';
  for (const ch of 'API1P') {
    typed += ch;
    searchInp.value = typed;
    searchInp.dispatchEvent({ type: 'input' });
    sbIos.advanceMs(30);
  }
  sbIos.advanceMs(300);
  assert.equal(sbIos.byId.get('productDetailModal').classList.contains('open'), true, 'iPhone P2300L no-Enter rapid burst in #invSearchInput must auto-open matched SKU');
  assert.equal(searchInp.value, 'API1P');
});
