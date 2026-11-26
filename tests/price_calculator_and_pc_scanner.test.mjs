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

function bootPcRuntime({ userAgent, products = [], advisorSession = null, initialCart = null } = {}) {
  const byId = new Map();
  const docListeners = new Map();
  const winListeners = new Map();
  const timers = [];
  let timerSeq = 1;
  let fakeNow = 1764000000000;

  const viewportMeta = makeFakeElement('META', '');
  viewportMeta.setAttribute('name', 'viewport');
  viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover');

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
    storage.set('creata_inv_session_started_ms_v1', String(fakeNow));
  }
  if (initialCart) {
    storage.set('creata_inv_open_cart_v1', JSON.stringify(initialCart));
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
    userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    onLine: true,
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] })
    },
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
    innerWidth: 1366,
    innerHeight: 768,
    isSecureContext: true,
    CREATA_INV_DATA: products,
    CREATA_INV_META: {
      warehouses: [
        'LPPT',
        'CEDIS BODEGA', 'CEDIS PISO',
        'CASA CREATA BODEGA', 'CASA CREATA PISO',
        'PUERTO CANCUN BODEGA', 'PUERTO CANCUN PISO',
        'COLOSIO BODEGA', 'COLOSIO PISO',
        'PLAYA BODEGA', 'PLAYA PISO'
      ]
    },
    CSS: { escape: (s) => String(s) },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    dispatchEvent(ev) {
      const e = Object.assign({ preventDefault() {}, stopPropagation() {} }, ev || {});
      const list = winListeners.get(e.type) || [];
      for (const fn of list) fn.call(win, e);
    },
    scrollTo() {},
    alert() {},
    confirm() { return true; },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    requestAnimationFrame(fn) { return setTimeoutFn(fn, 0); },
    cancelAnimationFrame(id) { clearTimeoutFn(id); },
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setInterval: () => 0,
    clearInterval: () => {},
    URL,
    Date: FakeDate,
    console
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const ctx = vm.createContext(win);
  vm.runInContext(BACK_NAV_JS, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(INV_JS, ctx, { filename: 'inventario-app.js' });
  doc.dispatchEvent({ type: 'DOMContentLoaded' });

  return {
    win,
    doc,
    byId,
    storage,
    advanceNow(ms) { fakeNow += ms; }
  };
}

test('Static Contracts: Calculadora button inside floating + menu, isolated modal markup, unified typography, BackNav, and PC webcam scanner fallback', () => {
  // 1. Button inside #invFabMenu right below Cotización
  assert.match(
    INV_HTML,
    /id="invFabMenu"[\s\S]*?id="fabQuoteBtn"[\s\S]*?<button type="button" id="fabCalculatorBtn" class="inv-fab-item" role="menuitem" onclick="closeFabMenu\(\); openPriceCalculatorModal\(\);">[\s\S]*?<span class="inv-fab-item-label">Calculadora<\/span>[\s\S]*?id="fabScanBtn"/,
    '#fabCalculatorBtn ("Calculadora") must live inside #invFabMenu'
  );
  assert.ok(INV_HTML.includes('id="priceCalculatorModal"'), 'Missing #priceCalculatorModal');
  assert.ok(INV_HTML.includes('Solo informativo'), 'Calculator modal must explicitly state it is informative only');

  // 2. Unified typography lock includes #priceCalculatorModal #calcTotalFinal and zero forbidden sizes
  assert.match(INV_CSS, /#priceCalculatorModal #calcTotalFinal/, 'inventario-ui.css must include #calcTotalFinal in unified title lock');
  let depth = 0;
  for (const ch of INV_CSS) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, 'inventario-ui.css must have balanced braces');

  // 3. BackNav + Escape + role gating
  assert.match(INV_JS, /id:\s*'price_calculator_modal'/, 'CreataBackNav must register price_calculator_modal');
  assert.match(INV_JS, /if\s*\(isModalOpenById\('priceCalculatorModal'\)\)/, 'Escape fallback must close priceCalculatorModal');
  assert.match(INV_JS, /if\s*\(fabCalculatorBtn\)\s*fabCalculatorBtn\.classList\.toggle\('hidden',\s*!isAuthed \|\| guestMode\);/, 'Calculator button must show for authenticated non-guests and hide for Solo Ver guests');

  // 4. PC Webcam fallback in startLiveBarcodeCamera()
  assert.match(INV_JS, /window\.Html5Qrcode\.getCameras/, 'startLiveBarcodeCamera must fall back to Html5Qrcode.getCameras() on PC webcams');
  assert.match(INV_JS, /facingMode:\s*'user'/, 'startLiveBarcodeCamera must fall back to front/user webcam if rear camera fails');
});

function makeAdvisorSession(overrides = {}) {
  return Object.assign({
    nombre: 'Asesor Prueba',
    correo: 'asesor@grupoanipa.com',
    puesto: 'ASESOR',
    rol: 'ASESOR',
    isAdmin: false,
    isManager: false,
    es_gerente: false,
    es_admin: false,
    isGuest: false,
    mustChangeKey: false,
    sheetTab: 'PLAYA',
    branchKey: 'PLAYA',
    branchLabel: 'Playa del Carmen',
    erpStore: 'CREATA LIVING PLAYA',
    orderPrefix: 'PLY',
    authToken: 'tok_test_123',
    maxDiscountPct: 24
  }, overrides);
}

test('Runtime: Informative Calculadora sums multiple pieces of multiple products (e.g. modular Sala), applies global & per-item discounts, and NEVER alters Cotización cart', async () => {
  const sampleProducts = [
    { s: 'ARIA-BI', n: 'SALA ARIA MODULO BRAZO IZQUIERDO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-BD', n: 'SALA ARIA MODULO BRAZO DERECHO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-SB', n: 'SALA ARIA MODULO SIN BRAZOS FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$14,000.00', st: [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-ESQ', n: 'SALA ARIA MODULO ESQUINERO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$16,000.00', st: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'MESA-LUNA', n: 'MESA DE CENTRO LUNA NOGAL', tp: 'MESAS', mo: 'LUNA', vr: 'NOGAL', pr: '$10,000.00', st: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'SILLA-CART', n: 'SILLA REAL EN COTIZACION', tp: 'SILLAS', mo: 'REAL', vr: 'BEIGE', pr: '$5,500.00', st: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];

  const advisorSession = makeAdvisorSession();

  const realQuoteCart = {
    'SILLA-CART': { sku: 'SILLA-CART', name: 'SILLA REAL EN COTIZACION', price: '$5,500.00', qty: 2, discountPct: 5 }
  };

  const { win, byId, storage } = bootPcRuntime({
    products: sampleProducts,
    advisorSession,
    initialCart: realQuoteCart
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const cartSnapshotBefore = storage.get('creata_inv_open_cart_v1');
  const draftsSnapshotBefore = storage.get('creata_inv_quote_drafts_v1');

  // Verify FAB button is visible for Advisor
  assert.equal(byId.get('fabCalculatorBtn').classList.contains('hidden'), false, '#fabCalculatorBtn must be visible for Advisor');

  // Open calculator modal
  win.openPriceCalculatorModal();
  assert.equal(byId.get('priceCalculatorModal').classList.contains('open'), true, '#priceCalculatorModal must open');

  // Search for modular Sala Aria
  const matches = win.__creataPriceCalc.findMatches('SALA ARIA');
  assert.equal(matches.length, 4, 'Searching SALA ARIA must find all 4 modular pieces');

  // Even out-of-stock priced catalog items can be found in the informative calculator
  const oosMatches = win.__creataPriceCalc.findMatches('MESA LUNA');
  assert.equal(oosMatches.length, 1, 'Out-of-stock priced catalog item must still be searchable in informative calculator');

  // Add a complete 5-piece Sala (1x BI, 1x BD, 2x SB, 1x ESQ)
  assert.equal(win.addPriceCalcItem('ARIA-BI', 1), true);
  assert.equal(win.addPriceCalcItem('ARIA-BD', 1), true);
  assert.equal(win.addPriceCalcItem('ARIA-SB', 1), true);
  assert.equal(win.addPriceCalcItem('ARIA-SB', 1), true); // adding same SKU increments qty to 2
  assert.equal(win.addPriceCalcItem('ARIA-ESQ', 1), true);

  let bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 4);
  assert.equal(bd.totalPieces, 5);
  assert.equal(bd.sumList, 80000);
  assert.equal(bd.totalDiscount, 0);
  assert.equal(bd.totalFinal, 80000);
  assert.equal(byId.get('fabCalcCount').textContent, '5');
  assert.equal(byId.get('calcTotalFinal').textContent, '$80,000.00');

  // Apply 20% global discount across all 5 pieces
  win.applyPriceCalcGlobalDiscount(20);
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.sumList, 80000);
  assert.equal(bd.totalDiscount, 16000);
  assert.equal(bd.totalFinal, 64000);
  assert.equal(Math.round(bd.effectiveDiscountPct * 10) / 10, 20);
  assert.equal(byId.get('calcSumDiscount').textContent, '-$16,000.00');
  assert.equal(byId.get('calcTotalFinal').textContent, '$64,000.00');
  assert.equal(byId.get('calcCapWarn').classList.contains('hidden'), true, '20% is within advisor cap, no warning');

  // Customize individual piece discount (Esquinero to 10% while others stay 20%)
  win.setPriceCalcItemDiscount('ARIA-ESQ', 10, false);
  bd = win.__creataPriceCalc.getBreakdown();
  // Discount: 20% of 64,000 (12,800) + 10% of 16,000 (1,600) = 14,400 -> final = 65,600 (18.0%)
  assert.equal(bd.totalDiscount, 14400);
  assert.equal(bd.totalFinal, 65600);
  assert.equal(Math.round(bd.effectiveDiscountPct * 10) / 10, 18);

  // Test exceeding advisor cap shows informative warning without blocking calculation
  win.applyPriceCalcGlobalDiscount(35);
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalFinal, 52000);
  assert.equal(byId.get('calcCapWarn').classList.contains('hidden'), false, 'Exceeding role cap should show informative warning');

  // Scanning/Enter inside #calcSearchInput adds item straight into calculator
  byId.get('calcSearchInput').value = 'MESA-LUNA';
  win.onCalcSearchKeydown({ key: 'Enter', preventDefault() {} });
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 5);
  assert.equal(bd.totalPieces, 6);
  assert.equal(byId.get('calcSearchInput').value, '');

  // Clear calculator
  win.clearPriceCalculator();
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 0);
  assert.equal(bd.totalPieces, 0);
  assert.equal(bd.totalFinal, 0);
  assert.equal(byId.get('fabCalcCount').classList.contains('hidden'), true);

  // STRICT ISOLATION: Real Cotización cart & drafts MUST be 100% untouched!
  assert.equal(storage.get('creata_inv_open_cart_v1'), cartSnapshotBefore, 'Calculator MUST NOT mutate creata_inv_open_cart_v1');
  assert.equal(storage.get('creata_inv_quote_drafts_v1'), draftsSnapshotBefore, 'Calculator MUST NOT mutate creata_inv_quote_drafts_v1');

  // Close modal via closePriceCalculatorModal
  win.closePriceCalculatorModal();
  assert.equal(byId.get('priceCalculatorModal').classList.contains('open'), false);

  // Guest Solo Ver MUST NOT see or open the calculator
  const guestEnv = bootPcRuntime({
    products: sampleProducts,
    advisorSession: makeAdvisorSession({
      nombre: 'Invitado',
      correo: 'inv@cliente.com',
      puesto: 'INVITADO (SOLO VER)',
      rol: 'INVITADO',
      sheetTab: 'SOLO LECTURA',
      branchKey: 'SOLO LECTURA',
      isGuest: true,
      authToken: 'tok_guest_1'
    })
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(guestEnv.byId.get('fabCalculatorBtn').classList.contains('hidden'), true, 'Guest Solo Ver must not see #fabCalculatorBtn');
  guestEnv.win.openPriceCalculatorModal();
  assert.equal(guestEnv.byId.get('priceCalculatorModal').classList.contains('open'), false, 'Guest Solo Ver must not open #priceCalculatorModal');
});

test('Runtime: PC Scanner supports both Webcam fallback (when facingMode:environment fails on PC) AND silent USB/Bluetooth HID P2300L scanning', async () => {
  const sampleProducts = [
    { s: 'ARIA-BI', n: 'SALA ARIA MODULO BRAZO IZQUIERDO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];
  const advisorSession = makeAdvisorSession({ nombre: 'Asesor PC', correo: 'pc@grupoanipa.com' });

  const { win, doc, byId, advanceNow } = bootPcRuntime({
    products: sampleProducts,
    advisorSession
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  // 1. Mock Html5Qrcode on PC where { facingMode: 'environment' } fails and USB webcam ID succeeds
  const startCalls = [];
  class FakeHtml5Qrcode {
    constructor(elId) {
      this.elId = elId;
      this.isScanning = false;
    }
    async start(cameraIdOrConfig) {
      startCalls.push(cameraIdOrConfig);
      if (cameraIdOrConfig && typeof cameraIdOrConfig === 'object' && cameraIdOrConfig.facingMode === 'environment') {
        throw new Error('OverconstrainedError: no rear camera on PC');
      }
      this.isScanning = true;
    }
    async stop() { this.isScanning = false; }
    clear() {}
  }
  FakeHtml5Qrcode.getCameras = async () => [{ id: 'pc-webcam-0', label: 'Integrated Webcam HD' }];
  win.Html5Qrcode = FakeHtml5Qrcode;

  await win.openBarcodeScanner();
  assert.equal(startCalls.length, 2, 'Scanner must retry with PC webcam after environment camera fails');
  assert.equal(startCalls[0] && startCalls[0].facingMode, 'environment');
  assert.equal(startCalls[1], 'pc-webcam-0', 'Scanner must fall back to PC webcam device ID');
  assert.match(byId.get('scanStatus').textContent, /Apunta la cámara/i, 'PC webcam should start cleanly without error');
  win.closeBarcodeScanner();

  // 2. Simulate silent USB/Bluetooth HID scanner on Windows PC typing "ARIA-BI" + Enter
  doc.activeElement = doc.body;
  for (const ch of 'ARIA-BI') {
    advanceNow(18);
    doc.dispatchEvent({ type: 'keydown', key: ch, keyCode: ch.charCodeAt(0) });
  }
  advanceNow(18);
  doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });

  const lastScan = win.__creataBtScanner.getLastResult();
  assert.ok(lastScan, 'PC HID scanner must produce a scan result');
  assert.equal(lastScan.status, 'quotable');
  assert.equal(lastScan.matchedCode, 'ARIA-BI');
});
