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
    select() {},
    scrollTo() {},
    scrollIntoView() {}
  };
  return el;
}

function bootRuntime({ userAgent, hasWebBluetooth = false, products = [], advisorSession = null } = {}) {
  const byId = new Map();
  const docListeners = new Map();
  const winListeners = new Map();
  const timers = [];
  let timerSeq = 1;
  let fakeNow = 1764000000000;

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
  if (hasWebBluetooth) {
    navObj.bluetooth = { requestDevice: async () => { throw Object.assign(new Error('cancel'), { name: 'NotFoundError' }); } };
  }

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

  return { win, doc, byId, advanceMs };
}

test('Static Contracts: Mobile Cotización card layout, balanced footer, iOS anti-zoom, and P2300L Bluetooth scanner UI', () => {
  assertBalancedCssBraces(INV_CSS, 'inventario-ui.css');

  // Mobile Cotización product card classes (fixes squished narrow text in mobile quote modal)
  assert.match(INV_CSS, /#cartItemsContainer\s+\.inv-cart-item-card\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(INV_CSS, /#cartItemsContainer\s+\.inv-cart-item-controls\s*\{[\s\S]*?border-top:\s*1px solid/);
  assert.match(INV_CSS, /#cartModal\s+\.inv-cart-modal-footer\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(INV_CSS, /#cartModal\s+\.inv-cart-footer-secondary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(INV_CSS, /#cartModal\s+\.inv-cart-footer-primary\s*\{[\s\S]*?grid-template-columns:/);

  // Mobile Cotización proportional typography, 1-line client search bar, and iOS viewport anti-zoom guard
  assert.match(INV_CSS, /#cartModal\s+select\s*\{[\s\S]*?font-size:\s*11px\s*!important;/);
  assert.match(INV_CSS, /#cartModal\s+\.inv-erp-client-search-row\s*\{[\s\S]*?flex-direction:\s*row\s*!important;/);
  assert.match(INV_CSS, /#scanModal\s+input\s*\{[\s\S]*?font-size:\s*13px\s*!important;/);
  assert.match(INV_CSS, /#scanModal\.modal-backdrop\s*\{[\s\S]*?align-items:\s*flex-end;/);
  assert.match(INV_JS, /function applyIosNoAutoZoomViewportGuard\(/);

  // HTML elements for P2300L Bluetooth scanner & mobile Cotización
  assert.ok(INV_HTML.includes('id="headerBtScanBtn"'), 'Header must include quick BT scanner button');
  assert.ok(INV_HTML.includes('id="cartBtScanBar"'), 'Cotización Section 3 must include inline BT P2300L scan bar');
  assert.ok(INV_HTML.includes('id="cartBtScanInput"') && INV_HTML.includes('inputmode="none"'), 'BT capture inputs must declare inputmode="none" for mobile keyboard suppression');
  assert.ok(INV_HTML.includes('id="btScanCaptureInput"'), 'Scanner modal must include dedicated P2300L capture input');
  assert.ok(INV_HTML.includes('id="btnConnectBleScanner"'), 'Scanner modal must include Web Bluetooth BLE button for Android/PC');
  assert.ok(INV_HTML.includes('id="btScanResultCard"'), 'Scanner modal must include scanned product/info result card');
  assert.ok(INV_HTML.includes('P2300L'), 'Scanner UI must guide Pocket 2D P2300L Bluetooth setup for Android & Apple');
  assert.ok(INV_HTML.includes('./inventario-ui.css?v=27'), 'inventario.html must load inventario-ui.css?v=27');
  assert.ok(INV_HTML.includes('inventario-app.js?v=112'), 'inventario.html must load inventario-app.js?v=112');
});

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

test('Runtime: renderCartItems renders stacked mobile-safe cards and hides BT bar when locked/guest', async () => {
  const sampleProducts = [
    { s: 'CARRARAIZQ', tp: 'SILLON', mo: 'CARRARA', n: 'CARRARA SILLON IZQUIERDO ALTMAN COTTON COORD A ALANIS BEIGE', pr: '26630.06', st: [0, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0] },
    { s: 'LENYMUST', tp: 'SILLON', mo: 'LENY', n: 'LENY SILLON QUEENS MUSTARD PATA NOGAL', pr: '10588.90', st: [0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0] }
  ];
  const sb = bootRuntime({
    products: sampleProducts,
    advisorSession: makeSession()
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  sb.win.addToCart('CARRARAIZQ', 1);
  sb.win.addToCart('LENYMUST', 2);
  sb.win.openCartModal();

  const html = sb.byId.get('cartItemsContainer').innerHTML;
  assert.ok(html.includes('inv-cart-item-card'), 'Cart items must use responsive .inv-cart-item-card');
  assert.ok(html.includes('inv-cart-item-main'), 'Cart items must separate top info section .inv-cart-item-main');
  assert.ok(html.includes('inv-cart-item-controls'), 'Cart items must separate bottom controls bar .inv-cart-item-controls');
  assert.ok(html.includes('inputmode="decimal"'), 'Discount inputs must use inputmode="decimal" for mobile keypads');
  assert.ok(html.includes('CARRARA SILLON IZQUIERDO ALTMAN COTTON COORD A ALANIS BEIGE'), 'Full product name must be rendered');
  assert.ok(html.includes('SKU: CARRARAIZQ'), 'SKU tag must be shown inside cart item card');
  assert.equal(sb.byId.get('cartBtScanBar').classList.contains('hidden'), false, 'Active advisor must see inline BT scan bar');
});

test('Runtime P2300L Bluetooth Scanner: normalization, US->ES layout repair, QR URLs, [BLOQUEADO] 0-stock guard, continuous scan, cart scan & BLE chunks', async () => {
  const sampleProducts = [
    { s: 'API1P', tp: 'SILLON', mo: 'APIANO', n: 'SILLON APIANO BEIGE', pr: '14990', st: [2, 1, 1, 0, 0, 2, 0, 0, 0, 0, 0], fe: '2026-12-10' },
    { s: 'GF-WG1291', tp: 'ACCESORIO', mo: 'WG1291', n: 'FLORERO WG1291 CERAMICA', pr: '1850', st: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'BOT18209C&H', tp: 'ACCESORIO', mo: 'BOT18209', n: 'BOTELLA DECORATIVA C&H', pr: '990', st: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ZEROSTOCK99', tp: 'MESA', mo: 'ZERO', n: 'MESA SIN EXISTENCIA', pr: '9500', st: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];

  // 1. Test on Android Chrome with Web Bluetooth support
  const sbAndroid = bootRuntime({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
    hasWebBluetooth: true,
    products: sampleProducts,
    advisorSession: makeSession({ correo: 'asesor@casacreata.com', nombre: 'Asesor Android', rol: 'ASESOR', isAdmin: false, isManager: false, es_gerente: false, es_admin: false })
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const bt = sbAndroid.win.__creataBtScanner;
  assert.ok(bt, 'window.__creataBtScanner must be exposed');

  // Open scanner modal -> BT tab active, BLE button visible on Android Chrome
  await sbAndroid.win.openBarcodeScanner('bt');
  assert.equal(sbAndroid.byId.get('scanModal').classList.contains('open'), true);
  assert.equal(sbAndroid.byId.get('btnConnectBleScanner').classList.contains('hidden'), false, 'BLE button must be visible on Android Chrome');

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

  const rUrlEs = bt.resolveScannedBarcode('httpsÑ--creata.mx/catalogo/?sku¡API1P');
  assert.equal(rUrlEs.status, 'quotable');
  assert.equal(rUrlEs.item.s, 'API1P');

  const rPref = bt.resolveScannedBarcode('SKU: API1P');
  assert.equal(rPref.status, 'quotable');
  assert.equal(rPref.item.s, 'API1P');

  // Strict [BLOQUEADO] Rule 2: 0 stock in Bodega/Piso and 0 LPPT must return out_of_stock and NEVER add to cart
  const rZero = bt.processScannedBarcode('ZEROSTOCK99', { source: 'Bluetooth HID (P2300L)', force: true });
  assert.equal(rZero.status, 'out_of_stock');
  const cardZeroHtml = sbAndroid.byId.get('btScanResultCard').innerHTML;
  assert.ok(cardZeroHtml.includes('ZEROSTOCK99'), 'Zero-stock card must display read SKU');
  assert.ok(cardZeroHtml.includes('Sin stock disponible'), 'Zero-stock card must warn user');
  assert.equal(cardZeroHtml.includes('bt-add-cart'), false, 'Zero-stock SKU must NEVER expose Add to Cart button');

  // Continuous scan inside #scanModal: displays full product info & keeps modal open
  sbAndroid.byId.get('btScanContinuousToggle').checked = true;
  const capInp = sbAndroid.byId.get('btScanCaptureInput');
  capInp.value = 'API1P';
  capInp.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  assert.equal(sbAndroid.byId.get('scanModal').classList.contains('open'), true, 'Continuous mode keeps scanModal open');
  assert.equal(capInp.value, '', 'Capture input must clear after scan for next trigger pull');
  const cardHitHtml = sbAndroid.byId.get('btScanResultCard').innerHTML;
  assert.ok(cardHitHtml.includes('SILLON APIANO BEIGE'), 'Result card must display full product name');
  assert.ok(cardHitHtml.includes('PUERTO CANCUN (BODEGA)'), 'Result card must display warehouse breakdown');
  assert.ok(cardHitHtml.includes('LPPT'), 'Result card must display LPPT availability');
  assert.ok(bt.getHistory().length >= 2, 'Scan history must track recent scans');

  // Non-catalog external barcode/QR: displays exact raw text read from P2300L
  sbAndroid.advanceMs(600);
  capInp.value = 'EXT-QR-99887766';
  capInp.dispatchEvent({ type: 'input' }); // Simulate Android IME without Enter key
  sbAndroid.advanceMs(300); // Auto-flush after 260ms
  const cardRawHtml = sbAndroid.byId.get('btScanResultCard').innerHTML;
  assert.ok(cardRawHtml.includes('EXT-QR-99887766'), 'Non-catalog scan must display exact raw scanned data');
  assert.ok(cardRawHtml.includes('bt-copy-raw'), 'Non-catalog scan must include Copy action');

  // Close scan modal -> open Cotización -> scan inside #cartBtScanInput with auto-add ON
  sbAndroid.win.closeBarcodeScanner();
  sbAndroid.win.openCartModal();
  sbAndroid.advanceMs(600);
  const cartInp = sbAndroid.byId.get('cartBtScanInput');
  sbAndroid.byId.get('cartBtAutoAddToggle').checked = true;
  cartInp.value = 'GF-WG1291';
  cartInp.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  assert.ok(sbAndroid.byId.get('cartItemsContainer').innerHTML.includes('GF-WG1291'), 'Cart BT scan with auto-add must add product directly to Cotización');
  assert.ok(sbAndroid.byId.get('cartBtScanFeedback').innerHTML.includes('Agregado a cotización'), 'Inline cart BT feedback must confirm addition');

  // BLE chunked packet assembly (P2300L BLE mode on Android/PC)
  sbAndroid.advanceMs(600);
  bt.processBleBarcodeChunk('BOT18');
  bt.processBleBarcodeChunk('209C&H\r\n');
  assert.ok(sbAndroid.byId.get('cartItemsContainer').innerHTML.includes('BOT18209C&amp;H'), 'BLE chunked scan must assemble and add product inside open Cotización');

  // Global HID keydown with mobile Bluetooth jitter (170ms gaps + Shift key + no-Enter auto-flush)
  sbAndroid.win.closeCartModal();
  sbAndroid.doc.activeElement = sbAndroid.doc.body;
  sbAndroid.advanceMs(600);
  const seq = ['Shift', 'A', 'P', 'I', '1', 'P'];
  for (const k of seq) {
    sbAndroid.doc.dispatchEvent({ type: 'keydown', key: k });
    sbAndroid.advanceMs(45);
  }
  sbAndroid.advanceMs(320); // Trigger 280ms no-Enter auto-flush
  assert.equal(sbAndroid.byId.get('productDetailModal').classList.contains('open'), true, 'Global HID scan with no-Enter auto-flush must open product detail');

  // 2. Test on Apple iPhone Safari (Web Bluetooth unsupported -> HID mode highlighted, BLE button hidden)
  const sbIos = bootRuntime({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    hasWebBluetooth: true, // Even if spoofed, iOS helper keeps BLE hidden because Apple blocks Web Bluetooth
    products: sampleProducts,
    advisorSession: makeSession({ correo: 'asesor@casacreata.com', nombre: 'Asesor iPhone', rol: 'ASESOR', isAdmin: false, isManager: false, es_gerente: false, es_admin: false })
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await sbIos.win.openBarcodeScanner('bt');
  assert.equal(sbIos.byId.get('btnConnectBleScanner').classList.contains('hidden'), true, 'BLE button must be hidden on Apple iOS Safari');
  assert.ok(sbIos.byId.get('btScanPlatformHint').textContent.includes('Apple iOS'), 'Platform tag must indicate Apple iOS HID BT');

  // iPhone HID scan inside focused #btScanCaptureInput (inputmode="none") works seamlessly
  const iosCap = sbIos.byId.get('btScanCaptureInput');
  assert.equal(iosCap.getAttribute('inputmode'), 'none', 'Capture input must default to inputmode="none"');
  iosCap.value = 'API1P';
  iosCap.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  assert.ok(sbIos.byId.get('btScanResultCard').innerHTML.includes('SILLON APIANO BEIGE'), 'iPhone HID scan must display full product info');
});
