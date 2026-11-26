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
    advanceNow(ms) {
      fakeNow += ms;
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
  };
}

test('Static Contracts: Calculadora button inside floating + menu, ZERO Tope role/cap info, auto-scan hooks, BackNav, and PC webcam scanner fallback', () => {
  // 1. Button inside #invFabMenu right below Cotización
  assert.match(
    INV_HTML,
    /id="invFabMenu"[\s\S]*?id="fabQuoteBtn"[\s\S]*?<button type="button" id="fabCalculatorBtn" class="inv-fab-item" role="menuitem" onclick="closeFabMenu\(\); openPriceCalculatorModal\(\);">[\s\S]*?<span class="inv-fab-item-label">Calculadora<\/span>[\s\S]*?id="fabScanBtn"/,
    '#fabCalculatorBtn ("Calculadora") must live inside #invFabMenu'
  );
  assert.ok(INV_HTML.includes('id="priceCalculatorModal"'), 'Missing #priceCalculatorModal');
  assert.ok(INV_HTML.includes('id="calcCameraScanBtn"'), 'Missing inline camera scan button inside Calculator');
  assert.ok(INV_HTML.includes('Solo informativo'), 'Calculator modal must explicitly state it is informative only');
  assert.match(INV_HTML, /id="scanModal"[^>]*z-index:94/, '#scanModal must sit above #priceCalculatorModal (z-index:91)');

  // 2. ZERO "Tope ADMINISTRADOR GENERAL: 100%" or role/cap warning elements inside Calculator
  assert.ok(!INV_HTML.includes('id="calcRoleRef"'), '#calcRoleRef ("Tope ...") must be completely removed from inventario.html');
  assert.ok(!INV_HTML.includes('id="calcCapWarn"'), '#calcCapWarn must be completely removed from inventario.html');
  assert.ok(!INV_CSS.includes('.inv-calc-role-ref'), '.inv-calc-role-ref must be removed from inventario-ui.css');
  assert.ok(!INV_CSS.includes('.inv-calc-cap-warn'), '.inv-calc-cap-warn must be removed from inventario-ui.css');
  assert.ok(!INV_JS.includes("'Tope ' + data.rolePuesto"), 'Calculator JS must not render Tope role info');

  // 3. Unified typography lock includes #priceCalculatorModal #calcTotalFinal and balanced braces
  assert.match(INV_CSS, /#priceCalculatorModal #calcTotalFinal/, 'inventario-ui.css must include #calcTotalFinal in unified title lock');
  let depth = 0;
  for (const ch of INV_CSS) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0, 'inventario-ui.css must have balanced braces');

  // 4. BackNav + Escape + role gating + auto-scan hook in processScannedBarcode
  assert.match(INV_JS, /id:\s*'price_calculator_modal'/, 'CreataBackNav must register price_calculator_modal');
  assert.match(INV_JS, /if\s*\(isModalOpenById\('priceCalculatorModal'\)\)/, 'Escape fallback must close priceCalculatorModal');
  assert.match(INV_JS, /if\s*\(isModalOpenById\('priceCalculatorModal'\) && typeof handleScannedBarcodeForPriceCalculator === 'function'\)/, 'processScannedBarcode must auto-route scans into open Calculator');
  assert.match(INV_JS, /if\s*\(fabCalculatorBtn\)\s*fabCalculatorBtn\.classList\.toggle\('hidden',\s*!isAuthed \|\| guestMode\);/, 'Calculator button must show for authenticated non-guests and hide for Solo Ver guests');

  // 5. PC Webcam fallback in startLiveBarcodeCamera()
  assert.match(INV_JS, /window\.Html5Qrcode\.getCameras/, 'startLiveBarcodeCamera must fall back to Html5Qrcode.getCameras() on PC webcams');
  assert.match(INV_JS, /facingMode:\s*'user'/, 'startLiveBarcodeCamera must fall back to front/user webcam if rear camera fails');

  // 6. Delegated buttons & speed regression locks inside #priceCalculatorModal
  const calcModalMatch = INV_HTML.match(/<div id="priceCalculatorModal"[\s\S]*?<\/div>\s*<script src="creata-finishes\.js/);
  assert.ok(calcModalMatch, 'Must locate full #priceCalculatorModal markup block');
  const calcModalHtml = calcModalMatch[0];
  assert.ok(calcModalHtml.includes('id="calcModalCard"'), '#priceCalculatorModal card must have id="calcModalCard"');
  assert.ok(!/stopPropagation/i.test(calcModalHtml), '#priceCalculatorModal must NEVER call stopPropagation() because it blocks delegated button clicks');
  for (const pct of [0, 5, 10, 15, 20, 25, 30]) {
    assert.ok(
      calcModalHtml.includes(`onclick="applyPriceCalcGlobalDiscount(${pct}, true)"`),
      `Preset ${pct}% button must pass fromPreset=true so iOS Safari always syncs #calcGlobalDiscountInput`
    );
  }
  assert.ok(
    calcModalHtml.includes('oninput="applyPriceCalcGlobalDiscount(this.value, false)"') &&
    calcModalHtml.includes('onchange="applyPriceCalcGlobalDiscount(this.value, true)"'),
    '#calcGlobalDiscountInput must handle live oninput without yanking cursor and normalize on onchange'
  );
  assert.match(INV_CSS, /#priceCalculatorModal\s*\{[\s\S]*?backdrop-filter:\s*none;/, '#priceCalculatorModal must disable expensive backdrop-filter blur');
  assert.match(INV_CSS, /#priceCalculatorModal button,[\s\S]*?touch-action:\s*manipulation;/, '#priceCalculatorModal controls must enforce touch-action: manipulation');
  assert.match(INV_CSS, /#priceCalculatorModal #calcSearchInput::-webkit-search-cancel-button/, '#calcSearchInput must hide native WebKit cancel button so #calcSearchClearBtn is never overlapped');
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

test('Runtime: Informative Calculadora sums multiple pieces of multiple products (e.g. modular Sala), auto-adds ANY scan while open, shows zero Tope text, and NEVER alters Cotización cart', async () => {
  const sampleProducts = [
    { s: 'ARIA-BI', n: 'SALA ARIA MODULO BRAZO IZQUIERDO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-BD', n: 'SALA ARIA MODULO BRAZO DERECHO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-SB', n: 'SALA ARIA MODULO SIN BRAZOS FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$14,000.00', st: [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-ESQ', n: 'SALA ARIA MODULO ESQUINERO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$16,000.00', st: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'MESA-LUNA', n: 'MESA DE CENTRO LUNA NOGAL', tp: 'MESAS', mo: 'LUNA', vr: 'NOGAL', pr: '$10,000.00', st: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'SILLA-CART', n: 'SILLA REAL EN COTIZACION', tp: 'SILLAS', mo: 'REAL', vr: 'BEIGE', pr: '$5,500.00', st: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];

  const adminSession = makeAdvisorSession({
    nombre: 'Kevin Reyna',
    correo: 'kevin.reyna@grupoanipa.com',
    puesto: 'ADMINISTRADOR GENERAL',
    rol: 'ADMIN',
    isAdmin: true,
    isManager: true,
    es_admin: true,
    es_gerente: true,
    maxDiscountPct: 100
  });

  const realQuoteCart = {
    'SILLA-CART': { sku: 'SILLA-CART', name: 'SILLA REAL EN COTIZACION', price: '$5,500.00', qty: 2, discountPct: 5 }
  };

  const { win, doc, byId, storage, advanceNow } = bootPcRuntime({
    products: sampleProducts,
    advisorSession: adminSession,
    initialCart: realQuoteCart
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const cartSnapshotBefore = storage.get('creata_inv_open_cart_v1');
  const draftsSnapshotBefore = storage.get('creata_inv_quote_drafts_v1');

  assert.equal(byId.get('fabCalculatorBtn').classList.contains('hidden'), false, '#fabCalculatorBtn must be visible');

  // Open calculator modal
  win.openPriceCalculatorModal();
  assert.equal(byId.get('priceCalculatorModal').classList.contains('open'), true, '#priceCalculatorModal must open');
  assert.equal(byId.get('calcRoleRef'), undefined, 'calcRoleRef must not exist in DOM');
  assert.equal(byId.get('calcCapWarn'), undefined, 'calcCapWarn must not exist in DOM');

  // Search for modular Sala Aria
  const matches = win.__creataPriceCalc.findMatches('SALA ARIA');
  assert.equal(matches.length, 4, 'Searching SALA ARIA must find all 4 modular pieces');

  // AUTO-SCAN 1: Global HID scan (P2300L / USB) while #priceCalculatorModal is open & focus on body
  doc.activeElement = doc.body;
  for (const ch of 'ARIA-BI') {
    advanceNow(18);
    doc.dispatchEvent({ type: 'keydown', key: ch, keyCode: ch.charCodeAt(0) });
  }
  advanceNow(18);
  doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });

  let bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 1, 'Global HID scan must auto-add ARIA-BI to open Calculator');
  assert.equal(bd.totalPieces, 1);
  assert.equal(byId.get('productDetailModal').classList.contains('open'), false, 'Scan inside Calculator must NOT open productDetailModal');
  assert.equal(byId.get('invSearchInput').value, '', 'Scan inside Calculator must NOT overwrite main search bar');
  assert.equal(win.__creataBtScanner.getLastResult().addedToCalculator, true);

  // AUTO-SCAN 2: Scan same SKU again (after dedup window) -> increments qty 1 -> 2
  advanceNow(600);
  for (const ch of 'ARIA-SB') {
    advanceNow(18);
    doc.dispatchEvent({ type: 'keydown', key: ch, keyCode: ch.charCodeAt(0) });
  }
  advanceNow(18);
  doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });
  advanceNow(600);
  for (const ch of 'ARIA-SB') {
    advanceNow(18);
    doc.dispatchEvent({ type: 'keydown', key: ch, keyCode: ch.charCodeAt(0) });
  }
  advanceNow(18);
  doc.dispatchEvent({ type: 'keydown', key: 'Enter', keyCode: 13 });

  // AUTO-SCAN 3: Camera scan (with #scanModal open on top of #priceCalculatorModal) -> closes #scanModal & auto-adds ARIA-ESQ
  byId.get('scanModal').classList.add('open');
  advanceNow(600);
  win.__creataBtScanner.processScannedBarcode('ARIA-ESQ', { source: 'Cámara' });
  assert.equal(byId.get('scanModal').classList.contains('open'), false, '#scanModal must close after scanning into Calculator');

  // AUTO-SCAN 4: Manual add ARIA-BD so we have complete 5-piece Sala (1 BI + 1 BD + 2 SB + 1 ESQ = $80,000)
  assert.equal(win.addPriceCalcItem('ARIA-BD', 1), true);

  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 4);
  assert.equal(bd.totalPieces, 5);
  assert.equal(bd.sumList, 80000);
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

  // Customize individual piece discount (Esquinero to 10% while others stay 20%)
  win.setPriceCalcItemDiscount('ARIA-ESQ', 10, false);
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalDiscount, 14400);
  assert.equal(bd.totalFinal, 65600);
  assert.equal(Math.round(bd.effectiveDiscountPct * 10) / 10, 18);

  // AUTO-SCAN 5: Out-of-stock priced catalog item scanned with Tab inside #calcSearchInput -> auto-added!
  advanceNow(600);
  byId.get('calcSearchInput').value = 'MESA-LUNA';
  win.onCalcSearchKeydown({ key: 'Tab', keyCode: 9, preventDefault() {} });
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalProducts, 5);
  assert.equal(bd.totalPieces, 6);
  assert.equal(byId.get('calcSearchInput').value, '');

  // AUTO-SCAN 6: Rapid no-Enter burst inside #calcSearchInput -> auto-added after 260ms settle!
  advanceNow(600);
  let typed = '';
  for (const ch of 'MESA-LUNA') {
    typed += ch;
    byId.get('calcSearchInput').value = typed;
    advanceNow(18);
    win.searchPriceCalculatorProducts(typed);
  }
  advanceNow(300);
  bd = win.__creataPriceCalc.getBreakdown();
  assert.equal(bd.totalPieces, 7, 'Rapid no-Enter scan burst inside #calcSearchInput must auto-add +1 piece');
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

  // 2. Simulate silent USB/Bluetooth HID scanner on Windows PC typing "ARIA-BI" + Enter (Calculator closed -> normal product detail flow)
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

test('Runtime: ALL Calculadora buttons work via #calcModalCard delegation (add/inc/dec/remove/qty/disc), iOS presets sync focused input, and 3,000-item search is cached/debounced with zero re-renders on taps', async () => {
  const bigCatalog = [
    { s: 'ARIA-BI', n: 'SALA ARIA MODULO BRAZO IZQUIERDO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
    { s: 'ARIA-BD', n: 'SALA ARIA MODULO BRAZO DERECHO FLAX', tp: 'SALAS', mo: 'ARIA', vr: 'FLAX', pr: '$18,000.00', st: [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0] }
  ];
  for (let i = 1; i <= 2998; i++) {
    bigCatalog.push({
      s: `CAT-${String(i).padStart(4, '0')}`,
      n: `MUEBLE CATALOGO MODELO ${i} BEIGE`,
      tp: 'SALAS',
      mo: `MOD${i}`,
      vr: 'BEIGE',
      pr: `$${(5000 + (i % 50) * 100).toLocaleString('en-US')}.00`,
      st: [0, i % 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
  }

  const { win, doc, byId, advanceNow } = bootPcRuntime({
    products: bigCatalog,
    advisorSession: makeAdvisorSession({ nombre: 'Asesor Movil', correo: 'movil@grupoanipa.com' })
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  win.openPriceCalculatorModal();
  const card = byId.get('calcModalCard');
  assert.ok(card, '#calcModalCard must exist in DOM');

  const makeActionTarget = (action, sku) => {
    const btn = {
      getAttribute(k) {
        if (k === 'data-calc-action') return action;
        if (k === 'data-sku') return sku;
        return null;
      },
      closest(sel) {
        return sel === '[data-calc-action]' ? btn : null;
      }
    };
    return btn;
  };
  const makeInputTarget = (kind, sku, value) => ({
    tagName: 'INPUT',
    type: 'number',
    value: String(value),
    getAttribute(k) {
      if (k === 'data-calc-input') return kind;
      if (k === 'data-sku') return sku;
      return null;
    }
  });

  // 1. Type "SALA ARIA" char-by-char across 3,000 items -> must debounce to 1 single search render!
  const rendersBeforeSearch = win.__creataPriceCalc.getSearchRenderCount();
  let typed = '';
  for (const ch of 'SALA ARIA') {
    typed += ch;
    byId.get('calcSearchInput').value = typed;
    advanceNow(15);
    win.searchPriceCalculatorProducts(typed);
  }
  assert.equal(win.__creataPriceCalc.getSearchRenderCount(), rendersBeforeSearch, 'Typing fast must wait for 90ms debounce instead of thrashing on every keystroke');

  const t0 = Date.now();
  advanceNow(100);
  const elapsedMs = Date.now() - t0;
  assert.equal(win.__creataPriceCalc.getSearchRenderCount(), rendersBeforeSearch + 1, 'Debounced search must execute exactly once after settling');
  assert.equal(win.__creataPriceCalc.getSearchIndexSize(), 3000, 'Search index must cache all 3,000 priced products');
  assert.ok(elapsedMs < 250, `Cached 3,000-item search must stay fast (took ${elapsedMs}ms)`);
  assert.ok(byId.get('calcSearchResults').innerHTML.includes('data-calc-action="add"'), 'Search results must render + Agregar buttons');
  assert.equal(byId.get('calcSearchClearBtn').classList.contains('hidden'), false, '#calcSearchClearBtn must become visible when query is non-empty');

  const rendersAfterSearch = win.__creataPriceCalc.getSearchRenderCount();

  // 2. Real delegated click on #calcModalCard: + Agregar (twice), +, -, qty input/change, disc input/change, remove
  card.dispatchEvent({ type: 'click', target: makeActionTarget('add', 'ARIA-BI') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 1, 'Delegated + Agregar click must add ARIA-BI');

  card.dispatchEvent({ type: 'click', target: makeActionTarget('add', 'ARIA-BI') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 2, 'Second delegated + Agregar click must increment ARIA-BI to 2');

  card.dispatchEvent({ type: 'click', target: makeActionTarget('inc', 'ARIA-BI') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 3, 'Delegated + button must increment qty to 3');

  card.dispatchEvent({ type: 'click', target: makeActionTarget('dec', 'ARIA-BI') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 2, 'Delegated − button must decrement qty to 2');

  card.dispatchEvent({ type: 'input', target: makeInputTarget('qty', 'ARIA-BI', '5') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 5, 'Delegated qty input must update qty to 5');

  card.dispatchEvent({ type: 'change', target: makeInputTarget('qty', 'ARIA-BI', '4') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 4, 'Delegated qty change must commit qty to 4');

  card.dispatchEvent({ type: 'input', target: makeInputTarget('disc', 'ARIA-BI', '12.5') });
  assert.equal(win.__creataPriceCalc.getItems()[0].discountPct, 12.5, 'Delegated item discount input must apply 12.5%');

  card.dispatchEvent({ type: 'change', target: makeInputTarget('disc', 'ARIA-BI', '15') });
  assert.equal(win.__creataPriceCalc.getItems()[0].discountPct, 15, 'Delegated item discount change must commit 15%');

  // 3. iOS Safari quirk: tapping 20% preset while #calcGlobalDiscountInput still has focus MUST update input value & blur it!
  const globalInp = byId.get('calcGlobalDiscountInput');
  globalInp.value = '5';
  globalInp.focus();
  assert.equal(doc.activeElement, globalInp, '#calcGlobalDiscountInput should be focused before preset tap');
  win.applyPriceCalcGlobalDiscount(20, true);
  assert.equal(globalInp.value, '20', 'Preset button tap (fromPreset=true) MUST sync #calcGlobalDiscountInput even when focused on iOS');
  assert.notEqual(doc.activeElement, globalInp, 'Preset button tap should blur #calcGlobalDiscountInput on mobile');
  assert.equal(win.__creataPriceCalc.getItems()[0].discountPct, 20, 'Preset 20% must apply to all items');

  // 4. Delegated remove ✕ click
  card.dispatchEvent({ type: 'click', target: makeActionTarget('remove', 'ARIA-BI') });
  assert.equal(win.__creataPriceCalc.getBreakdown().totalProducts, 0, 'Delegated ✕ remove button must remove ARIA-BI');

  // 5. ZERO wasted full-catalog re-searches across ALL those button taps!
  assert.equal(
    win.__creataPriceCalc.getSearchRenderCount(),
    rendersAfterSearch,
    'Clicking + Agregar, +, −, qty, disc, presets, and ✕ MUST trigger 0 search re-renders'
  );

  // 6. Search clear button ✕, Limpiar, and Cerrar
  win.clearCalcSearchInput();
  assert.equal(byId.get('calcSearchInput').value, '', 'clearCalcSearchInput must clear query');
  assert.equal(byId.get('calcSearchResults').classList.contains('hidden'), true, 'clearCalcSearchInput must hide results');

  win.addPriceCalcItem('ARIA-BD', 2);
  win.clearPriceCalculator(true);
  assert.equal(win.__creataPriceCalc.getBreakdown().totalPieces, 0, 'Limpiar must reset all pieces');
  assert.equal(byId.get('calcGlobalDiscountInput').value, '0', 'Limpiar must reset global discount input to 0');

  win.closePriceCalculatorModal();
  assert.equal(byId.get('priceCalculatorModal').classList.contains('open'), false, 'Cerrar must close #priceCalculatorModal');
});

