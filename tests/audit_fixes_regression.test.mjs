import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = process.cwd();
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

function extractFunctionSource(src, fnName) {
  const re = new RegExp(`^function ${fnName}\\([^\\n]*\\{[\\s\\S]*?^\\}`, 'm');
  const m = re.exec(src);
  assert.ok(m, `Could not find top-level function ${fnName}`);
  return m[0];
}

test('Project A Apps Script: resolveCategoryDestFolderForProduct_ routes MESA DE CENTRO, NIDO, and modular SALAS accurately (100% parity with Parche V2 and frontend)', () => {
  const gsMain = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const gsPatch = readRepo('AppsScript_Parche_Fotos_V2.gs');
  const fotosJs = readRepo('fotos-productos-app.js');

  // Verify Parche V2 has zero top-level const/let declarations (GAS global collision guard)
  assert.ok(!/^(?:const|let)\s+/m.test(gsPatch), 'AppsScript_Parche_Fotos_V2.gs must have zero top-level const/let');
  new vm.Script(gsMain, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });
  new vm.Script(gsPatch, { filename: 'AppsScript_Parche_Fotos_V2.gs' });

  // Execute backend resolver in VM
  const foldersMatch = gsMain.match(/const CATEGORIAS_DEST_FOLDERS_\s*=\s*\[[\s\S]*?\];/);
  assert.ok(foldersMatch, 'CATEGORIAS_DEST_FOLDERS_ must exist');
  const normFn = extractFunctionSource(gsMain, 'normPlainFotoCat_');
  const resolveFn = extractFunctionSource(gsMain, 'resolveCategoryDestFolderForProduct_');

  const ctx = {};
  vm.runInNewContext(`${foldersMatch[0]}\n${normFn}\n${resolveFn}\nthis.resolve = resolveCategoryDestFolderForProduct_;`, ctx);

  // Execute frontend resolver in VM
  const feFolders = fotosJs.match(/const CATEGORIAS_DEST_FOLDERS\s*=\s*\[[\s\S]*?\];/);
  const feNorm = fotosJs.match(/function normPlainCat\([\s\S]*?\n    \}/);
  const feResolve = fotosJs.match(/function resolveCategoryDestFolderForProduct\([\s\S]*?\n    \}/);
  assert.ok(feFolders && feNorm && feResolve, 'Frontend category routing helpers must exist');
  const feCtx = {};
  vm.runInNewContext(`${feFolders[0]}\n${feNorm[0]}\n${feResolve[0]}\nthis.resolve = resolveCategoryDestFolderForProduct;`, feCtx);

  const cases = [
    ['MESAS DE CENTRO & LATERALES', 'MESA DE CENTRO', 'MESA DE CENTRO NIDO MARMOL', 'MESA_CENTRO'],
    ['MESAS DE CENTRO & LATERALES', 'MESA DE CENTRO', 'MESA DE CENTRO CON CUBIERTA', 'MESA_CENTRO'],
    ['MESAS DE CENTRO & LATERALES', 'MESA LATERAL', 'MESA LATERAL HAK', 'MESA_LATERAL'],
    ['MESAS DE CENTRO & LATERALES', 'MESA AUXILIAR', 'MESA AUXILIAR REDONDA', 'MESA_LATERAL'],
    ['SILLONES', 'SILLON', 'SILLON NIDO BOUCLE', 'SILLONES'],
    ['ESPEJOS & ARTE', 'CUADRO', 'CUADRO NIDO 80X80', 'ACCESORIOS'],
    ['SALAS & SOFAS', 'SILLON', 'GALARDI SILLON SIN BRAZOS', 'SALAS'],
    ['SALAS & SOFAS', 'MODULO', 'MODULO BRAZO DER MILAN', 'SALAS'],
    ['SILLAS & SILLONES', 'SILLON', 'SILLON GIRATORIO MILAN', 'SILLONES'],
    ['COMEDORES', 'SILLA', 'SILLA DE COMEDOR ROMA', 'COMEDORES']
  ];

  for (const [cat, tipo, nom, expectedKey] of cases) {
    const beRes = ctx.resolve(cat, tipo, nom);
    const feRes = feCtx.resolve(cat, tipo, nom);
    assert.equal(beRes.key, expectedKey, `Backend routed (${cat}, ${tipo}, ${nom}) to ${beRes.key} instead of ${expectedKey}`);
    assert.equal(feRes.key, expectedKey, `Frontend routed (${cat}, ${tipo}, ${nom}) to ${feRes.key} instead of ${expectedKey}`);
    assert.equal(feRes.id, beRes.id, `Backend and frontend folder IDs must match for ${nom}`);
  }
});

test('Project A Apps Script: ERP sync uses CacheService lease (never ScriptLock), safeSheetCellText_ escapes formulas, visual overrides protected on delete', () => {
  const gsMain = readRepo('AppsScript_Creata_Drive_Sheets.gs');

  // 1) sincronizarInventarioEnVivoDesdeERP must NOT call LockService.getScriptLock()
  const erpSyncFn = extractFunctionSource(gsMain, 'sincronizarInventarioEnVivoDesdeERP');
  assert.ok(!/LockService\.getScriptLock/.test(erpSyncFn), 'ERP 5-min sync must NOT block global ScriptLock');
  assert.match(erpSyncFn, /CREATA_ERP_SYNC_IN_FLIGHT_V1/, 'ERP 5-min sync must use CacheService single-flight lease');

  // 2) safeSheetCellText_ escapes spreadsheet formula prefixes (+52, =, -, @)
  const safeCellFn = extractFunctionSource(gsMain, 'safeSheetCellText_');
  const ctx = {};
  vm.runInNewContext(`${safeCellFn}\nthis.safe = safeSheetCellText_;`, ctx);
  assert.equal(ctx.safe('+52 55 8805 8703', 80), "'+52 55 8805 8703");
  assert.equal(ctx.safe('=SUM(A1:A5)', 80), "'=SUM(A1:A5)");
  assert.equal(ctx.safe('-100', 80), "'-100");
  assert.equal(ctx.safe('@alert', 80), "'@alert");
  assert.equal(ctx.safe('Juan Perez', 80), 'Juan Perez');

  // 3) handleFotosUploadVisualOverride_ acquires lock BEFORE creating Drive file and checks VER_GESTION_PRODUCTOS
  const visFn = extractFunctionSource(gsMain, 'handleFotosUploadVisualOverride_');
  const lockIdx = visFn.indexOf('acquireScriptLockSafe_');
  const createIdx = visFn.indexOf('.createFile(');
  assert.ok(lockIdx > 0 && createIdx > lockIdx, 'handleFotosUploadVisualOverride_ must acquire ScriptLock BEFORE targetFolder.createFile');
  assert.match(visFn, /VER_GESTION_PRODUCTOS/, 'handleFotosUploadVisualOverride_ must enforce VER_GESTION_PRODUCTOS');

  // 4) handleFotosDelete_ checks _INV_PRODUCT_OVERRIDES via readProductOverridesMap_ before trashing Drive file
  const delFn = extractFunctionSource(gsMain, 'handleFotosDelete_');
  assert.match(delFn, /readProductOverridesMap_\(ss\)/, 'handleFotosDelete_ must inspect active _INV_PRODUCT_OVERRIDES');
  assert.match(delFn, /!usedByVisualOverride/, 'handleFotosDelete_ must guard files referenced by _INV_PRODUCT_OVERRIDES');

  // 5) handleInvSubmitQuote_ enforces VER_COTIZADOR, VER_CAMBIAR_TIENDA, and ERP sumListErp extra-discount cap
  const quoteFn = extractFunctionSource(gsMain, 'handleInvSubmitQuote_');
  assert.match(quoteFn, /VER_COTIZADOR/);
  assert.match(quoteFn, /VER_CAMBIAR_TIENDA/);
  assert.match(quoteFn, /sumListErp/);
  assert.match(quoteFn, /safeSheetCellText_\(/);
});

test('Project B Apps Script: HEIC support, safe ScriptLock, TELAS cache invalidation, and FOTOS NORMALIZADAS fallback when SKU is missing from DATOS GENERAL', () => {
  const gsB = readRepo('AppsScript_Prompts_Odoo.gs');
  new vm.Script(gsB, { filename: 'AppsScript_Prompts_Odoo.gs' });

  assert.match(gsB, /'image\/heic':\s*'heic'/);
  assert.match(gsB, /'image\/heif':\s*'heif'/);
  assert.ok(!/lock\.waitLock\(25000\)/.test(gsB), 'All bare lock.waitLock(25000) calls must be replaced with acquirePromptsScriptLockSafe_');

  const directFn = extractFunctionSource(gsB, 'handleOdooDirectUploadAndRegister_');
  assert.match(directFn, /PROMPTS_MATERIALS_CACHE_KEY_/, 'Uploading to TELAS must invalidate materials cache');
  assert.match(directFn, /updateDatosGeneral:\s*false/, 'Must fallback to FOTOS NORMALIZADAS when SKU is missing in DATOS GENERAL');
  assert.match(directFn, /promptsPin/, 'Must forward promptsPin alias to handleOdooRegisterFoto_');
});

test('Cotizador, Historial & Panel fixes: no password self-lockout, ev.key guard, btnSend restore, override re-index, GUESTS filter, dual Render origins', () => {
  const invJs = readRepo('inventario-app.js');
  const invHtml = readRepo('inventario.html');
  const histJs = readRepo('historial-app.js');
  const panelJs = readRepo('panel-app.js');

  assert.match(invJs, /pMap\[activeAdvisorSession\.correo\]\s*=\s*\{\s*newKey:\s*newPass,\s*prevKey:\s*currPass,\s*synced:\s*true/);
  assert.match(invJs, /typeof ev\.key === 'string' && ev\.key\.length === 1/);
  assert.match(invJs, /btnSend\.textContent = 'Crear Cotización'/);
  assert.match(invJs, /window\.openInAppHistorial\s*=\s*function\s*\(\)[\s\S]{0,320}isEffectiveAdminSession\(\)[\s\S]{0,80}hasAdminPerm\('historial'\)/);
  assert.match(invJs, /function rerenderCatalogAfterOverrideChange\(\)[\s\S]{0,250}indexItemsAndGroups\(\)/);
  assert.ok(!invJs.includes('syncCartQuoteMetaControls('), 'Dead syncCartQuoteMetaControls call must be removed');
  assert.ok(!invJs.includes('renderCartModal('), 'Dead renderCartModal call must be removed');

  assert.match(invHtml, /value="CREATA LIVING COLOSIO"/);
  assert.match(invHtml, /value="CREATA LIVING PLAYA"/);
  assert.match(invHtml, /value="CASA CREATA BONAMPAK"/);
  assert.match(invHtml, /value="PROYECTOS ANIPA INTERIOR"/);

  const guestMatches = histJs.match(/presenceFilter === 'GUESTS'/g) || [];
  assert.ok(guestMatches.length >= 2, 'historial-app.js must allow GUESTS in both presenceFilter whitelists');
  assert.match(panelJs, /https:\/\/app-1-3y7y\.onrender\.com/);
});

test('Fotos SW & App fixes: opaque lh3.googleusercontent.com images cache properly, rollback on visual error, 80-batch repair cap', async () => {
  const swSrc = readRepo('fotos-sw.js');
  const fotosJs = readRepo('fotos-productos-app.js');

  // Execute fotos-sw.js and verify opaque image response IS cached
  const listeners = {};
  const putCalls = [];
  const swSandbox = {
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    Response: { error: () => ({ ok: false }) },
    Request: function (u, o) { return { url: u, ...(o || {}) }; },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => ({
        put: async (req, res) => { putCalls.push({ url: req.url, type: res.type }); },
        match: async () => null,
        keys: async () => [],
        delete: async () => true
      })
    },
    fetch: async () => ({ ok: false, status: 0, type: 'opaque', headers: { get: () => '' }, clone: () => ({ type: 'opaque' }) }),
    self: {
      location: { origin: 'https://ikerreyna3942-debug.github.io', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-sw.js' },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (ev, fn) => { listeners[ev] = fn; }
    }
  };
  vm.runInNewContext(swSrc, swSandbox, { filename: 'fotos-sw.js' });

  let respPromise = null;
  listeners.fetch({
    request: { url: 'https://lh3.googleusercontent.com/d/opaqueImg123456=w400', method: 'GET', mode: 'no-cors' },
    respondWith: (p) => { respPromise = p; }
  });
  await respPromise;
  assert.equal(putCalls.length, 1, 'Opaque lh3.googleusercontent.com image must be stored in IMG_CACHE_NAME');
  assert.equal(putCalls[0].type, 'opaque');

  assert.match(fotosJs, /for \(let batch = 0; batch < 80; batch\+\+\)/);
  assert.match(fotosJs, /rollbackVisualUpload/);
  assert.match(fotosJs, /rollbackVisualAssign/);
  assert.match(fotosJs, /bloqueo\|bloquear/);
});

test('Turn 2 — Cotizador Wood Swatches (VWOD:), zero fabric false-positives on BARMESSAN8PRM wood table, and Fotos Maderas tab', () => {
  const invJs = readRepo('inventario-app.js');
  const invCss = readRepo('inventario-ui.css');
  const fotosHtml = readRepo('fotos-productos.html');
  const fotosJs = readRepo('fotos-productos-app.js');
  const gasMain = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const gasPatch = readRepo('AppsScript_Parche_Fotos_V2.gs');

  // 1) Execute inventario-app.js in VM to test real matching functions
  const store = new Map();
  const invSandbox = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, setAttribute: () => {} }),
      body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {} }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', search: '', hash: '' },
    URL,
    URLSearchParams,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console
  };
  invSandbox.window = invSandbox;
  invSandbox.window.addEventListener = () => {};
  invSandbox.window.CREATA_INV_DATA = [];
  invSandbox.window.CREATA_INV_META = { sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8' };
  vm.runInNewContext(invJs, invSandbox, { filename: 'inventario-app.js' });
  const hooks = invSandbox.window.__CREATA_INV_AUDIT__;
  assert.ok(hooks, '__CREATA_INV_AUDIT__ must be exposed');

  // Seed the exact live fabric override that caused the false positive in Kevin's screenshot
  hooks.saveLocalProductOverridesMap({
    'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL': {
      sku: 'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL',
      status: 'VISIBLE',
      name: 'OCASIONAL SAND 07 ROSA MORADA TONO NATURAL',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1FabricSand07ExampleId999/view?usp=sharing'
    }
  });

  // Kevin's screenshot SKU: MESA SANTORINI 8P ROSA MORADA (wood-only table, NO fabric!)
  const mesaSantorini = {
    s: 'BARMESSAN8PRM',
    n: 'MESA SANTORINI 8P ROSA MORADA',
    c: 'MESAS',
    tp: 'MESA DE COMEDOR',
    p: 'BARSA',
    md: 'ROSA MORADA',
    cm: 'ROSA MORADA BARSA',
    vr: 'ROSA MORADA BARSA',
    tl: '',
    ct: ''
  };
  assert.equal(hooks.findMatchingFabricSwatchForItem(mesaSantorini, null), null, 'Wood table BARMESSAN8PRM must NEVER match a fabric swatch');
  const mesaWood = hooks.findMatchingWoodSwatchForItem(mesaSantorini, null);
  assert.ok(mesaWood, 'Wood table BARMESSAN8PRM MUST match a wood swatch');
  assert.equal(mesaWood.overrideKey, 'VWOD:ROSA MORADA BARSA');
  assert.match(mesaWood.url, /11mtWQdUDna0NY7H8ByqsDcirfM0vlc7J/);

  // Upholstered chair with BOTH fabric (SAND 07) AND wood (ROSA MORADA YOI)
  const sillonZurich = {
    s: 'YO1PZURSA07RM',
    n: 'SILLON OCASIONAL ZURICH SAND 07 ROSA MORADA',
    c: 'SILLONES',
    tp: 'SILLON OCASIONAL',
    p: 'YOI',
    md: 'ROSA MORADA',
    cm: 'TONO NATURAL',
    vr: 'SAND 07',
    tl: 'SAND 07',
    ct: ''
  };
  const sillonFab = hooks.findMatchingFabricSwatchForItem(sillonZurich, null);
  assert.ok(sillonFab, 'Upholstered YO1PZURSA07RM must STILL match SAND 07 fabric swatch');
  assert.equal(sillonFab.overrideKey, 'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL');
  const sillonWood = hooks.findMatchingWoodSwatchForItem(sillonZurich, null);
  assert.ok(sillonWood, 'Upholstered YO1PZURSA07RM with wood legs must ALSO match ROSA MORADA YOI wood swatch');
  assert.equal(sillonWood.overrideKey, 'VWOD:ROSA MORADA YOI');
  assert.match(sillonWood.url, /1q9h-KKXsLWV1ayMsjnalnsGA5j5OVU-W/);

  // Non-wood marble table must match NEITHER fabric nor wood
  const mesaMarmol = {
    s: 'MESAMARMOL01',
    n: 'MESA DE CENTRO TRAVERTINO',
    c: 'MESAS DE CENTRO & LATERALES',
    tp: 'MESA DE CENTRO',
    p: 'BARSA',
    md: 'MARMOL',
    cm: 'TRAVERTINO',
    vr: 'TRAVERTINO',
    tl: '',
    ct: ''
  };
  assert.equal(hooks.findMatchingFabricSwatchForItem(mesaMarmol, null), null);
  assert.equal(hooks.findMatchingWoodSwatchForItem(mesaMarmol, null), null);

  // Cloud VWOD: override takes precedence over default catalog, and ELIMINADO hides default
  assert.equal(Object.keys(hooks.DEFAULT_WOOD_SWATCHES_CATALOG).length, 34);
  hooks.saveLocalProductOverridesMap({
    'VWOD:ROSA MORADA BARSA': {
      sku: 'VWOD:ROSA MORADA BARSA',
      status: 'VISIBLE',
      name: 'ROSA MORADA BARSA CUSTOM',
      category: 'WOOD_SWATCH',
      note: 'https://drive.google.com/file/d/1CustomWoodOverrideId888/view?usp=sharing'
    }
  });
  const overriddenWood = hooks.findMatchingWoodSwatchForItem(mesaSantorini, null);
  assert.match(overriddenWood.url, /1CustomWoodOverrideId888/);

  // 2) CSS wood card + variant pill styling + querySelectorAll zoom binding in inventario-app.js
  assert.match(invCss, /\.inv-det-fabric-swatch-card\.is-wood\s*\{/);
  assert.match(invCss, /\.inv-var-fabric-pill\.is-wood\s*\{/);
  assert.match(invJs, /specsGrid\.querySelectorAll\('\[data-det-fabric-zoom-url\]'\)/);
  assert.match(invJs, /inv-var-fabric-pill is-wood/);

  // 3) App de Fotos Maderas tab + Apps Script VWOD support + wood chip fallback
  assert.match(fotosHtml, /data-work-mode="WOOD"[^>]*onclick="setFotosWorkMode\('WOOD'\)"/);
  assert.match(fotosJs, /DEFAULT_WOOD_SWATCHES_FOTOS/);
  assert.match(fotosJs, /WOOD_SWATCH/);
  assert.match(fotosJs, /findMatchingUploadedWoodForProduct/);
  assert.match(fotosJs, /FOTOS_VFAB_GENERIC_SINGLE_TOKENS/);
  assert.match(gasMain, /kind === 'wood' \? 'WOOD_SWATCH'/);
  assert.match(gasPatch, /kind === 'wood' \? 'WOOD_SWATCH'/);
  assert.match(gasMain, /\^V\(\?:COV\|FAB\|WOD\):\/i\.test\(ovKey\)/);
  assert.match(gasPatch, /\^V\(\?:COV\|FAB\|WOD\):\/i\.test\(ovKey\)/);
});

test('Turn 3 — BARMESAN6PRM (MESA SANTORINI 6P ROSA MORADA) and generic-color VFAB false-positive prevention (TELA BEIGE - LEONI, CUERDA BEIGE)', () => {
  const invJs = readRepo('inventario-app.js');
  const store = new Map();
  const sb = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, setAttribute: () => {} }),
      body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {} }
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', search: '', hash: '' },
    URL,
    URLSearchParams,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console
  };
  sb.window = sb;
  sb.window.addEventListener = () => {};
  sb.window.CREATA_INV_DATA = [];
  sb.window.CREATA_INV_META = { sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8' };
  vm.runInNewContext(invJs, sb, { filename: 'inventario-app.js' });
  const hooks = sb.window.__CREATA_INV_AUDIT__;

  hooks.saveLocalProductOverridesMap({
    'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL': {
      sku: 'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL',
      status: 'VISIBLE',
      name: 'OCASIONAL SAND 07 ROSA MORADA TONO NATURAL',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1qM-cUmFQNJOCb5P3aByAwkqJ58Tf-BOs/view?usp=sharing'
    },
    'VFAB:TELA BEIGE - LEONI': {
      sku: 'VFAB:TELA BEIGE - LEONI',
      status: 'VISIBLE',
      name: 'TELA BEIGE - LEONI',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1LeoniBeigeTestId111/view?usp=sharing'
    },
    'VFAB:TELA BEIGE CUERDA COFFE KATE': {
      sku: 'VFAB:TELA BEIGE CUERDA COFFE KATE',
      status: 'VISIBLE',
      name: 'TELA BEIGE CUERDA COFFE KATE',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1KateCuerdaTestId222/view?usp=sharing'
    }
  });

  // 1) Exact live row for BARMESAN6PRM (screenshot SKU)
  const barmesan6 = {
    s: 'BARMESAN6PRM',
    tp: 'MESA',
    mo: 'SANTORINI',
    n: 'MESA SANTORINI 6P ROSA MORADA',
    vr: 'ROSA MORADA BARSA',
    c: 'COMEDORES',
    tl: '',
    ct: '',
    md: 'ROSA MORADA',
    cm: 'ROSA MORADA BARSA',
    p: 'BARSA'
  };
  assert.equal(hooks.findMatchingFabricSwatchForItem(barmesan6, null), null, 'BARMESAN6PRM must NEVER match a fabric swatch');
  const wood6 = hooks.findMatchingWoodSwatchForItem(barmesan6, null);
  assert.ok(wood6, 'BARMESAN6PRM must match ROSA MORADA BARSA wood swatch');
  assert.equal(wood6.overrideKey, 'VWOD:ROSA MORADA BARSA');

  // 2) Even if a wood table accidentally has a wood finish in tl, wood guard must still block fabric match
  const pollutedTable = Object.assign({}, barmesan6, { tl: 'ROSA MORADA' });
  assert.equal(hooks.findMatchingFabricSwatchForItem(pollutedTable, null), null, 'Wood table with wood text in tl must still block fabric swatch');

  // 3) VFAB:TELA BEIGE - LEONI must ONLY match SILLON LEONI TELA BEIGE, NEVER lamps/pots/tables
  const lampBeige = { s: 'ALUXPISBERBEI', c: 'ILUMINACIÓN', tp: 'LAMPARA DE PISO', n: 'LAMPARA DE PISO BERGAMO PANTALLA COLOR BEIGE', vr: 'NOGAL BEIGE', tl: '', ct: '', md: 'NOGAL', cm: 'BEIGE', p: 'ALUX' };
  const potBeige = { s: 'FIBMACTRECBEI', c: 'ACCESORIOS DECORATIVOS', tp: 'MACETA', n: 'MACETA JARRON TRENTO CH COLOR DESLAVADO BEIGE', vr: 'COLOR BEIGE DESLAVADO', tl: '', ct: '', md: '', cm: '', p: 'FIB' };
  const sillonLeoni = { s: 'GMM1PLEOBEI', c: 'SILLONES', tp: 'SILLON', n: 'SILLON LEONI TELA BEIGE', vr: 'TELA BEIGE', tl: 'TELA BEIGE', ct: 'BEIGE', md: '', cm: '', p: 'GMM' };
  assert.equal(hooks.findMatchingFabricSwatchForItem(lampBeige, null), null);
  assert.equal(hooks.findMatchingFabricSwatchForItem(potBeige, null), null);
  const leoniMatch = hooks.findMatchingFabricSwatchForItem(sillonLeoni, null);
  assert.ok(leoniMatch && leoniMatch.overrideKey === 'VFAB:TELA BEIGE - LEONI', 'SILLON LEONI TELA BEIGE must still match VFAB:TELA BEIGE - LEONI');

  // 4) Generic CUERDA BEIGE must NOT fuzzy-match into unrelated model-specific KATE swatch
  const lampOlimpia = { s: 'ALUXLPOLICBE', c: 'ILUMINACIÓN', tp: 'LAMPARA DE PISO', n: 'LAMPARA DE PISO OLIMPIA CUERDA BEIGE', vr: 'CUERDA BEIGE', tl: 'CUERDA BEIGE', ct: 'CLARA', md: '', cm: '', p: 'ALUX' };
  const mesaLulin = { s: 'ADSLUL8PFERSI', c: 'COMEDORES', tp: 'MESA DE COMEDOR', n: 'LULIN MESA DE COMEDOR CON 8 SILLAS CUERDA BEIGE', vr: 'CUERDA BEIGE', tl: 'CUERDA BEIGE', ct: 'BEIGE', md: '', cm: '', p: 'ADS' };
  assert.equal(hooks.findMatchingFabricSwatchForItem(lampOlimpia, null), null);
  assert.equal(hooks.findMatchingFabricSwatchForItem(mesaLulin, null), null);

  // 5) Upholstered chair with ROSA MORADA legs (no SAND 07) must NEVER match OCASIONAL SAND 07 ROSA MORADA TONO NATURAL
  const chairOtherFab = { s: 'YOCHAIR01', c: 'SILLONES', tp: 'SILLON OCASIONAL', n: 'SILLON OCASIONAL ROSA MORADA TONO NATURAL', vr: 'OCASIONAL ROSA MORADA', tl: '', ct: '', md: 'ROSA MORADA', cm: 'TONO NATURAL', p: 'YOI' };
  assert.equal(hooks.findMatchingFabricSwatchForItem(chairOtherFab, null), null);
});

test('Turn 5 — Salas/Sofás only show wood swatch when visible wood is named in product title, internal PINO ESTUFADO and lone modifiers (CLARO) never false-match TABACO CLARO BARSA', () => {
  const invJs = readRepo('inventario-app.js');
  const fotosJs = readRepo('fotos-productos-app.js');
  const store = new Map();
  const sb = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, setAttribute: () => {} }),
      body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {} }
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', search: '', hash: '' },
    URL,
    URLSearchParams,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console
  };
  sb.window = sb;
  sb.window.addEventListener = () => {};
  sb.window.CREATA_INV_DATA = [];
  sb.window.CREATA_INV_META = { sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8' };
  vm.runInNewContext(invJs, sb, { filename: 'inventario-app.js' });
  const hooks = sb.window.__CREATA_INV_AUDIT__;

  hooks.saveLocalProductOverridesMap({
    'VFAB:PRISMA OLIVE': {
      sku: 'VFAB:PRISMA OLIVE',
      status: 'VISIBLE',
      name: 'PRISMA OLIVE',
      category: 'FABRIC_SWATCH',
      note: 'https://drive.google.com/file/d/1PrismaOliveTestId123/view?usp=sharing'
    }
  });

  // 1) Kevin's screenshot SKU: CVVSALEXPODER (SALA LEXY, internal PINO ESTUFADO + propagated cm='CLARO')
  //    MUST match PRISMA OLIVE fabric and MUST NOT match TABACO CLARO BARSA wood!
  const salaLexy = {
    s: 'CVVSALEXPODER',
    tp: 'SALA',
    mo: 'LEXY',
    n: 'SALA LEXY C TELA PRISMA OLIVE CHAISE DERECHO LOVE SEAT IZQUIERDO',
    vr: 'PRISMA OLIVE',
    c: 'SALAS',
    tl: 'PRISMA OLIVE',
    ct: 'OLIVE',
    md: 'PINO ESTUFADO',
    cm: 'CLARO',
    p: 'CVV'
  };
  const lexyFab = hooks.findMatchingFabricSwatchForItem(salaLexy, null);
  assert.ok(lexyFab && lexyFab.overrideKey === 'VFAB:PRISMA OLIVE', 'CVVSALEXPODER must still match VFAB:PRISMA OLIVE');
  assert.equal(hooks.findMatchingWoodSwatchForItem(salaLexy, null), null, 'CVVSALEXPODER (SALA without wood in name) must NEVER show a wood swatch');

  // 2) Aluminum outdoor sofa with cm='CLARO' must NEVER show a wood swatch
  const salaAlum = {
    s: 'GC555006',
    tp: 'SALA',
    mo: 'EXTERIOR',
    n: 'SALA EXTERIOR ALUMINIO GRIS CLARO',
    vr: 'GRIS CLARO',
    c: 'EXTERIOR',
    tl: 'TEXTILENO',
    ct: 'GRIS CLARO',
    md: 'ALUMINIO',
    cm: 'CLARO',
    p: 'GC'
  };
  assert.equal(hooks.findMatchingWoodSwatchForItem(salaAlum, null), null, 'Aluminum sala GC555006 must NOT match wood');

  // 3) Textile cushion with cm='CLARO' must NEVER show a wood swatch
  const cojinGris = {
    s: 'MALCOJGRSCL',
    tp: 'COJIN',
    mo: 'DECORATIVO',
    n: 'COJIN DECORATIVO GRIS CLARO',
    vr: 'GRIS CLARO',
    c: 'COJINES TEXTILES',
    tl: 'ALGODON',
    ct: 'GRIS CLARO',
    md: '',
    cm: 'CLARO',
    p: 'MAL'
  };
  assert.equal(hooks.findMatchingWoodSwatchForItem(cojinGris, null), null, 'Textile cushion MALCOJGRSCL must NOT match wood');

  // 4) Love seat that EXPLICITLY mentions wood in name ('DE TEKA CARDEADO CLARO') MUST resolve to VWOD:TECA SKANOR (NOT TABACO CLARO!)
  const loveSeatLumina = {
    s: 'HAKLSLMNTCGI',
    tp: 'LOVE SEAT',
    mo: 'LUMINA',
    n: 'LOVE SEAT LUMINA DE TEKA CARDEADO CLARO',
    vr: 'TEKA CARDEADO CLARO',
    c: 'EXTERIOR',
    tl: 'OLEFIN',
    ct: 'GRIS',
    md: 'TECA',
    cm: 'CLARO',
    p: 'HAK'
  };
  const luminaWood = hooks.findMatchingWoodSwatchForItem(loveSeatLumina, null);
  assert.ok(luminaWood, 'LOVE SEAT LUMINA DE TEKA must match wood because TEKA is in product name');
  assert.equal(luminaWood.overrideKey, 'VWOD:TECA SKANOR', 'TECA + CLARO must skip lone CLARO and resolve to VWOD:TECA SKANOR');

  // 5) Sala escuadra explicitly naming 'TECA ENTINTADO' MUST resolve to VWOD:TECA ENTINTADO SKANOR
  const salaTereani = {
    s: 'SKSADTKTEREDO',
    tp: 'SALA',
    mo: 'TEREANI',
    n: 'TEREANI ESCUADRA DERECHA TECA ENTINTADO',
    vr: 'TECA ENTINTADO',
    c: 'SALAS',
    tl: 'OLEFIN',
    ct: 'BEIGE',
    md: 'TECA',
    cm: 'ENTINTADO',
    p: 'SKANOR'
  };
  const tereaniWood = hooks.findMatchingWoodSwatchForItem(salaTereani, null);
  assert.ok(tereaniWood, 'TEREANI ESCUADRA DERECHA TECA ENTINTADO must match wood');
  assert.equal(tereaniWood.overrideKey, 'VWOD:TECA ENTINTADO SKANOR');

  // 6) Genuine TABACO CLARO dining table MUST still match VWOD:TABACO CLARO BARSA
  const mesaMykonos = {
    s: 'BARMESMYK6PTC',
    tp: 'MESA',
    mo: 'MYKONOS',
    n: 'MESA MYKONOS 6P TABACO CLARO',
    vr: 'TABACO CLARO',
    c: 'COMEDORES',
    tl: '',
    ct: '',
    md: 'ENCINO',
    cm: 'TABACO CLARO',
    p: 'BARSA'
  };
  const mykonosWood = hooks.findMatchingWoodSwatchForItem(mesaMykonos, null);
  assert.ok(mykonosWood, 'MESA MYKONOS 6P TABACO CLARO must match VWOD:TABACO CLARO BARSA');
  assert.equal(mykonosWood.overrideKey, 'VWOD:TABACO CLARO BARSA');

  // 7) fotos-productos-app.js mirrors the exact Sala/Sofá name-required guard & lone-modifier filter
  assert.match(fotosJs, /visibleWoodInNameRe/);
  assert.match(fotosJs, /PINO\\s\+ESTUFADO/);
  assert.match(fotosJs, /modOnly/);
});

test('Turn 6 — Strict Single-Source-of-Truth from CONTROL DE PRODUCTOS PRESENTACIÓN: zero cross-SKU propagation, zero zombie cache resurrection, exact NOMBRE preservation, and distinct SOFÁ/LOVE SEAT single titles', () => {
  const invJs = readRepo('inventario-app.js');
  const fotosJs = readRepo('fotos-productos-app.js');
  const gasSrc = readRepo('AppsScript_Creata_Drive_Sheets.gs');

  // 1) Static guarantees: cache bumped to v5 purging v4, no sharedMd/sharedCm sibling propagation, no Hoja 1 Col C as MODELO, fotos keeps cm
  assert.match(invJs, /LIVE_CACHE_KEY\s*=\s*'creata_inv_live_cache_v5'/);
  assert.match(invJs, /localStorage\.removeItem\('creata_inv_live_cache_v4'\)/);
  assert.ok(!invJs.includes('sharedCm'), 'Cross-SKU sharedCm sibling propagation must be completely removed');
  assert.ok(!invJs.includes('sharedMd'), 'Cross-SKU sharedMd sibling propagation must be completely removed');
  assert.ok(!invJs.includes('const hMo = cleanStr(hr[2])'), 'Hoja 1 Col C (FOTO APP) must never be read as MODELO');
  assert.match(fotosJs, /cm:\s*cm,/);
  assert.match(fotosJs, /const displayName = \(inv && inv\.nombreInv\) \|\| colBName \|\| ''/);
  assert.match(gasSrc, /isSalaWithoutWoodNameInv/);

  // 2) Live VM execution testing applyLiveGvizTable + indexItemsAndGroups end-to-end
  const store = new Map();
  const sb = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, setAttribute: () => {} }),
      body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {} }
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', search: '', hash: '' },
    URL,
    URLSearchParams,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console
  };
  sb.window = sb;
  sb.window.addEventListener = () => {};
  // Seed a poisoned stale item in initial data simulating old localStorage cache (`cm: 'CLARO'`)
  sb.window.CREATA_INV_DATA = [
    { s: 'CVVSALEXPODER', tp: 'SALA', mo: 'LEXY', n: 'SALA LEXY C TELA PRISMA OLIVE CHAISE DERECHO LOVE SEAT IZQUIERDO', vr: 'DERECHO IZQUIERDO', c: 'SALAS & SOFÁS', tl: 'PRISMA OLIVE', ct: 'OLIVE', md: 'PINO ESTUFADO', cm: 'CLARO', mt: '', m: '279X140X63 CM', p: 'CASA V&V', pr: '$23,626.74', st: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1] }
  ];
  sb.window.CREATA_INV_META = { sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8' };

  const instrumented = invJs.replace(
    'window.__CREATA_INV_AUDIT__ = {',
    'window.__TURN6__ = { allItems: () => allItems, allGroups: () => allGroups, indexItemsAndGroups, applyLiveGvizTable }; window.__CREATA_INV_AUDIT__ = {'
  );
  vm.runInNewContext(instrumented, sb, { filename: 'inventario-app.js' });
  const t6 = sb.window.__TURN6__;
  t6.indexItemsAndGroups();

  const cols = [
    'SKU', 'TIPO DE PRODUCTO', 'MODELO', 'NOMBRE', 'VARIANTE', 'FOTO', 'CATEGORIA',
    'TELA', 'COLOR DE TELA', 'MADERA', 'COLOR DE MADERA', 'MATERIALES', 'MEDIDAS',
    'PROVEEDOR', 'TIEMPO DE ENTREGA (DIAS)', 'LPPT', 'CEDIS BODEGA', 'CASA CREATA BODEGA', 'PRECIO DE LISTA'
  ];
  const makeRow = (arr) => ({ c: arr.map((v) => ({ v })) });
  const ok = t6.applyLiveGvizTable({
    cols: cols.map((label) => ({ label })),
    rows: [
      // CVVSALEXPODER with BLANK cm in live Sheet -> MUST clear poisoned prevIt cm='CLARO'!
      makeRow(['CVVSALEXPODER', 'SALA', 'LEXY', 'SALA LEXY C TELA PRISMA OLIVE CHAISE DERECHO LOVE SEAT IZQUIERDO', 'DERECHO IZQUIERDO · PRISMA OLIVE', '', 'SALAS & SOFÁS', 'PRISMA OLIVE', 'OLIVE', 'PINO ESTUFADO', '', 'TELA 100% POLIÉSTER', '279X140X63 CM', 'CASA V&V', 67, 2, 1, 0, '$23,626.74']),
      // Sibling mirrors: VANCO24158 has BLANK cm while VANESPMC24158 has cm='CLARA' -> MUST NOT propagate 'CLARA' onto VANCO24158!
      makeRow(['VANCO24158', 'ESPEJO', 'PACE', 'ESPEJO PACE', 'ESTANDAR', '', 'ESPEJOS & ARTE', '', '', '', '', 'CRISTAL', '90X180X4 CM', 'VAN', 30, 0, 2, 0, '$8,500.00']),
      makeRow(['VANESPMC24158', 'ESPEJO', 'PACE', 'ESPEJO PACE MEDIANO MADERA CLARA', 'MADERA CLARA', '', 'ESPEJOS & ARTE', '', '', 'ENCINO', 'CLARA', 'CRISTAL', '90X180X4 CM', 'VAN', 30, 0, 2, 0, '$8,900.00']),
      // Product name containing ALTO X FONDO Y ANCHO (no digits) -> MUST be preserved verbatim!
      makeRow(['MID03102', 'BANCO', 'MATA', 'BANCO PARA BAR MATA BLANCO ALTO X FONDO Y ANCHO', 'BLANCO ALTO', '', 'COMEDORES', '', '', '', '', 'METAL', 'ALTO 97 CM', 'MID', 30, 0, 2, 0, '$4,200.00']),
      // Corrupted Sheet cell with full name + 263CM inside COLOR DE MADERA -> MUST be cleared
      makeRow(['KUDSCAASHBRSN', 'SALA', 'ASHA', 'SALA ASHA BRAXTON SNOW', 'BRAXTON SNOW', '', 'SALAS & SOFÁS', 'BRAXTON SNOW', 'BLANCO', '', 'SALA ASHA BRAXTON SNOW 263CM', 'TELA', '263X115X76 CM', 'KUD', 45, 0, 2, 0, '$32,000.00']),
      // SOFA + LOVE SEAT pair -> grouped card is SOFÁ Y LOVE SEAT MARENO, but single titles MUST distinguish LOVE SEAT vs SOFÁ!
      makeRow(['ARMMAR2PKECO', 'LOVE SEAT', 'MARENO', 'MARENO LOVE SEAT KELSI COTTON', 'KELSI COTTON', '', 'SALAS & SOFÁS', 'KELSI COTTON', 'ALGODON', 'PINO ESTUFADO', '', 'TELA', '188X106X90 CM', 'ARM', 60, 0, 2, 0, '$29,501.02']),
      makeRow(['ARMMAR3PKECO', 'SOFA', 'MARENO', 'MARENO SOFA KELSI COTTON', 'KELSI COTTON', '', 'SALAS & SOFÁS', 'KELSI COTTON', 'ALGODON', 'PINO ESTUFADO', '', 'TELA', '245X106X90 CM', 'ARM', 60, 0, 2, 0, '$37,893.08'])
    ]
  });
  assert.equal(ok, true);

  const bySku = new Map(t6.allItems().map((x) => [x.s, x]));
  assert.equal(bySku.get('CVVSALEXPODER').cm, '', 'Live blank COLOR DE MADERA must clear poisoned prevIt CLARO');
  assert.equal(bySku.get('VANCO24158').md, '', 'VANCO24158 must NOT inherit md=ENCINO from sibling VANESPMC24158');
  assert.equal(bySku.get('VANCO24158').cm, '', 'VANCO24158 must NOT inherit cm=CLARA from sibling VANESPMC24158');
  assert.equal(bySku.get('MID03102').n, 'BANCO PARA BAR MATA BLANCO ALTO X FONDO Y ANCHO', 'Product NOMBRE from INVENTARIO_EN_VIVO must be preserved verbatim');
  assert.equal(bySku.get('MID03102').vr, 'BLANCO ALTO', 'Product VARIANTE from INVENTARIO_EN_VIVO must not drop ALTO');
  assert.equal(bySku.get('KUDSCAASHBRSN').cm, '', 'Corrupted full-name cell inside COLOR DE MADERA must be cleared');
  assert.match(bySku.get('ARMMAR2PKECO')._singleTitle, /^LOVE SEAT MARENO\b/, 'ARMMAR2PKECO single title must say LOVE SEAT MARENO');
  assert.match(bySku.get('ARMMAR3PKECO')._singleTitle, /^SOFÁ MARENO\b/, 'ARMMAR3PKECO single title must say SOFÁ MARENO');
  assert.notEqual(bySku.get('ARMMAR2PKECO')._singleTitle, bySku.get('ARMMAR3PKECO')._singleTitle);
});

test('Turn 8 — Deprecated prompts.html & suite/ removed; Cotizador, Fotos, and Panel cleanly route Prompts IA to official https://buena-espero.onrender.com/ with zero dead links', () => {
  const removedFiles = [
    'prompts.html', 'prompts-app.js', 'prompts-studio-v8.js', 'prompts-styles.css', 'prompts-sw.js',
    'prompts-manifest.json', 'prompts-icon-192.png', 'prompts-icon-512.png', 'prompts-apple-icon.png',
    'suite/index.html', 'suite/manifest.json', 'suite/sw.js', 'suite/icon-192.png', 'suite/icon-512.png', 'suite/apple-icon.png'
  ];
  for (const rel of removedFiles) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false, `Removed file must not exist: ${rel}`);
  }

  const invJs = readRepo('inventario-app.js');
  const fotosJs = readRepo('fotos-productos-app.js');
  const panelJs = readRepo('panel-app.js');
  const panelHtml = readRepo('panel.html');
  const panelManifest = readRepo('panel-manifest.json');

  for (const [label, src] of [
    ['inventario-app.js', invJs],
    ['fotos-productos-app.js', fotosJs],
    ['panel-app.js', panelJs],
    ['panel.html', panelHtml],
    ['panel-manifest.json', panelManifest]
  ]) {
    assert.ok(!src.includes('prompts.html'), `${label} must have zero dead links to prompts.html`);
    assert.ok(!src.includes('./suite/'), `${label} must have zero dead links to ./suite/`);
  }

  assert.ok(invJs.includes('https://buena-espero.onrender.com/?embed=true'));
  assert.ok(invJs.includes("window.open('https://buena-espero.onrender.com/'"));
  assert.ok(invJs.includes("window.open('./panel.html'"));
  assert.ok(fotosJs.includes('https://buena-espero.onrender.com/?embed=true'));
  assert.ok(panelJs.includes('https://buena-espero.onrender.com/?embed=true'));
  assert.ok(panelJs.includes('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel.html'));
});


