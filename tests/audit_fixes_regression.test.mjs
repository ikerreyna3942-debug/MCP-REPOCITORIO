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

test('Prompts Studio V8, prompts-app.js & prompts-styles.css: materialTarget scoping, apostrophe-safe pickers, V7/V1 aspectRatio & forceCreataSpec, mobile topbar fix', () => {
  const studioSrc = readRepo('prompts-studio-v8.js');
  const promptsJs = readRepo('prompts-app.js');
  const promptsCss = readRepo('prompts-styles.css');

  const root = { innerHTML: '', classList: { contains: () => false }, addEventListener: () => {} };
  const sandbox = {
    window: {},
    document: { getElementById: (id) => (id === 'promptsNativeStudio' ? root : null) },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    setTimeout,
    clearTimeout,
    console
  };
  sandbox.window.addEventListener = () => {};
  vm.runInNewContext(studioSrc, sandbox, { filename: 'prompts-studio-v8.js' });
  const studio = sandbox.window.CreataPromptsStudio;
  studio.init(root);

  // 1) In V8 PACK_CREATA, fabricSwatch MUST still be included even when materialTarget === 'MADERA'
  const v8PackWithFabric = studio.generatePrompts({
    version: 'V8',
    v8Mode: 'PACK_CREATA',
    materialTarget: 'MADERA',
    furniturePhoto: { name: 'sofa.jpg' },
    fabricSwatch: { name: 'Lino Arena.jpg' }
  });
  assert.match(v8PackWithFabric[0].prompt, /Lino Arena\.jpg/, 'PACK_CREATA must NOT silently ignore fabricSwatch when materialTarget=MADERA');

  // 2) In V7, forceCreataSpec=false and aspectRatio='16:9' are honored
  const v7Custom = studio.generatePrompts({
    version: 'V7',
    v7Mode: 'FONDO_BLANCO',
    forceCreataSpec: false,
    aspectRatio: '16:9',
    furniturePhoto: { name: 'mesa.jpg' }
  });
  assert.ok(!/NON-NEGOTIABLE/.test(v7Custom[0].prompt), 'V7 must honor forceCreataSpec: false');
  assert.match(v7Custom[0].prompt, /aspect_ratio="16:9"/);

  // 3) In V1 CAMBIO_MATERIAL, materialTarget='MADERA' excludes fabric and aspectRatio='4:5' updates --ar
  const v1WoodOnly = studio.generatePrompts({
    version: 'V1',
    v1Mode: 'CAMBIO_MATERIAL',
    materialTarget: 'MADERA',
    aspectRatio: '4:5',
    fabricSwatch: { name: 'Velvet Blue.jpg' },
    woodSwatch: { name: 'Nogal Oscuro.jpg' }
  });
  assert.ok(!/Velvet Blue/.test(v1WoodOnly[0].prompt), 'V1 CAMBIO_MATERIAL with materialTarget=MADERA must exclude fabric swatch');
  assert.match(v1WoodOnly[0].prompt, /Nogal Oscuro/);
  assert.match(v1WoodOnly[1].prompt, /--ar 4:5/);

  // 4) Apostrophe-containing Drive filename renders safely via data-cp-name (no raw quote breakage)
  const st = studio.getState();
  st.telasList = [{ id: '1AbCdEfGhIjKlMnOpQr', name: "O'Brien's Velvet.jpg" }];
  st.materialsLoaded = true;
  studio.openMaterialPicker('TELA');
  assert.equal(studio.hasActivePicker(), true);
  assert.match(root.innerHTML, /data-cp-name="O&#39;Brien&#39;s Velvet\.jpg"/);
  assert.ok(!/onclick="copyProptDrivePhotoImage\('/.test(root.innerHTML), 'Must not inline-quote Drive filenames in onclick');
  assert.equal(studio.closeActivePickers(), true);
  assert.equal(studio.hasActivePicker(), false);

  // 5) prompts-app.js & prompts-styles.css guards
  assert.match(promptsJs, /if \(studioEnabled && activeWorkspace === 'studio'\) return;/);
  assert.match(promptsJs, /https:\/\/buena-espero\.onrender\.com/);
  assert.match(promptsJs, /https:\/\/app-1-3y7y\.onrender\.com/);
  assert.match(promptsJs, /studio_picker/);
  assert.match(promptsJs, /frameNavigationRequested = false;/);
  assert.match(promptsCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.topbar-actions\s*\{[\s\S]*?justify-content:\s*flex-start;/);
  assert.match(promptsCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.propt-input\s*\{[\s\S]*?font-size:\s*16px;/);
});

test('Turn 2 — Prompts 3-tab workspace (V8 + Prompts Render buena-espero + Alta Odoo) & exact Output Name workflow', () => {
  const promptsHtml = readRepo('prompts.html');
  const promptsJs = readRepo('prompts-app.js');
  const studioSrc = readRepo('prompts-studio-v8.js');

  // 1) prompts.html mounts all 3 tabs and custom upload filename input
  assert.match(promptsHtml, /id="btnModePromptsNative"[^>]*onclick="switchPromptsWorkspace\('studio'\)"/);
  assert.match(promptsHtml, /id="btnModePromptsRender"[^>]*onclick="switchPromptsWorkspace\('render'\)"/);
  assert.match(promptsHtml, /id="btnModeAltaOdoo"[^>]*onclick="switchPromptsWorkspace\('odoo'\)"/);
  assert.match(promptsHtml, /id="proptCustomFileNameInput"/);

  // 2) prompts-studio-v8.js injects exact output filename in V8, V7, V1 and renders copy/upload controls
  const root = { innerHTML: '', classList: { contains: () => false }, addEventListener: () => {} };
  const previewEl = { textContent: '' };
  const outWrapEl = { innerHTML: '' };
  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => {
        if (id === 'promptsNativeStudio') return root;
        if (id === 'stOutputNamePreview') return previewEl;
        if (id === 'stGeneratedOutputsWrap') return outWrapEl;
        return null;
      }
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    console
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  vm.runInNewContext(studioSrc, sandbox, { filename: 'prompts-studio-v8.js' });
  const studio = sandbox.window.CreataPromptsStudio;
  studio.init(root);

  const v8Pack = studio.generatePrompts({
    version: 'V8',
    v8Mode: 'PACK_CREATA',
    outputName: 'MESA SANTORINI 8P ROSA MORADA.png',
    sku: 'BARMESSAN8PRM'
  });
  assert.equal(v8Pack.length, 3);
  assert.equal(v8Pack[0].outputFileName, 'MESA SANTORINI 8P ROSA MORADA.png');
  assert.equal(v8Pack[1].outputFileName, 'MESA SANTORINI 8P ROSA MORADA_PORTADA.png');
  assert.equal(v8Pack[2].outputFileName, 'MESA SANTORINI 8P ROSA MORADA_CAD.png');
  assert.match(v8Pack[0].prompt, /OUTPUT FILE \/ ASSET NAME \(EXACT\): "MESA SANTORINI 8P ROSA MORADA\.png"/);

  const v7Out = studio.generatePrompts({ version: 'V7', v7Mode: 'FONDO_BLANCO', outputName: 'SILLON ZURICH SAND 07' });
  assert.equal(v7Out[0].outputFileName, 'SILLON ZURICH SAND 07.png');
  assert.match(v7Out[0].prompt, /"SILLON ZURICH SAND 07\.png"/);

  const v1Out = studio.generatePrompts({ version: 'V1', v1Mode: 'RESTAURAR_HD', outputName: 'CREDENZA PAROTA' });
  assert.equal(v1Out[0].outputFileName, 'CREDENZA PAROTA.png');
  assert.equal(v1Out[1].outputFileName, 'CREDENZA PAROTA.png');
  assert.match(v1Out[1].prompt, /"CREDENZA PAROTA\.png"/);

  studio.setOutputName('MESA SANTORINI 8P ROSA MORADA');
  assert.equal(previewEl.textContent, 'MESA SANTORINI 8P ROSA MORADA.png');
  studio.generateNow();
  assert.match(root.innerHTML, /id="stOutputNameInput"/);
  assert.match(root.innerHTML, /MESA SANTORINI 8P ROSA MORADA\.png/);
  assert.match(root.innerHTML, /copyOutputName\(0/);
  assert.match(root.innerHTML, /sendNameToOdooUpload\(0\)/);
  assert.match(root.innerHTML, /switchPromptsWorkspace\('render'\)/);

  // 3) prompts-app.js routes 'render' -> buena-espero and 'odoo' -> app-1-3y7y, and pre-fills custom upload name
  const loadedUrls = [];
  const makeEl = (id) => {
    const classes = new Set();
    return {
      id,
      value: '',
      src: '',
      textContent: '',
      innerHTML: '',
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, f) => (f ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c)
      },
      setAttribute: () => {},
      addEventListener: () => {},
      focus: () => {}
    };
  };
  const els = {
    promptsNativeStudio: makeEl('promptsNativeStudio'),
    promptsAppFrame: makeEl('promptsAppFrame'),
    promptsLoadingOverlay: makeEl('promptsLoadingOverlay'),
    btnModePromptsNative: makeEl('btnModePromptsNative'),
    btnModePromptsRender: makeEl('btnModePromptsRender'),
    btnModeAltaOdoo: makeEl('btnModeAltaOdoo'),
    proptDrawer: makeEl('proptDrawer'),
    proptCustomFileNameInput: makeEl('proptCustomFileNameInput'),
    proptSkuInput: makeEl('proptSkuInput'),
    proptFeedback: makeEl('proptFeedback')
  };
  const pWin = {
    document: {
      readyState: 'complete',
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { onLine: true, userAgent: 'node' },
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts.html', search: '' },
    CreataPromptsStudio: { init: () => true },
    CreataBackNav: {
      replaceIframeUrl: (_frame, url) => { loadedUrls.push(url); }
    },
    fetch: () => Promise.resolve({ ok: true }),
    addEventListener: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    URL,
    URLSearchParams,
    console
  };
  pWin.window = pWin;
  vm.runInNewContext(promptsJs, pWin, { filename: 'prompts-app.js' });

  pWin.switchPromptsWorkspace('render');
  assert.ok(loadedUrls[loadedUrls.length - 1].startsWith('https://buena-espero.onrender.com/?embed=true'), 'render tab must load buena-espero.onrender.com');
  pWin.switchPromptsWorkspace('odoo');
  assert.ok(loadedUrls[loadedUrls.length - 1].startsWith('https://app-1-3y7y.onrender.com/?embed=true'), 'odoo tab must load app-1-3y7y.onrender.com');

  const stemFilled = pWin.openProptUploadWithName('MESA SANTORINI 8P ROSA MORADA.png', 'barmessan8prm');
  assert.equal(stemFilled, 'MESA SANTORINI 8P ROSA MORADA');
  assert.equal(els.proptCustomFileNameInput.value, 'MESA SANTORINI 8P ROSA MORADA');
  assert.equal(els.proptSkuInput.value, 'BARMESSAN8PRM');
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

  // 2) CSS wood card styling + querySelectorAll zoom binding in inventario-app.js
  assert.match(invCss, /\.inv-det-fabric-swatch-card\.is-wood\s*\{/);
  assert.match(invJs, /specsGrid\.querySelectorAll\('\[data-det-fabric-zoom-url\]'\)/);

  // 3) App de Fotos Maderas tab + Apps Script VWOD support
  assert.match(fotosHtml, /data-work-mode="WOOD"[^>]*onclick="setFotosWorkMode\('WOOD'\)"/);
  assert.match(fotosJs, /DEFAULT_WOOD_SWATCHES_FOTOS/);
  assert.match(fotosJs, /WOOD_SWATCH/);
  assert.match(gasMain, /kind === 'wood' \? 'WOOD_SWATCH'/);
  assert.match(gasPatch, /kind === 'wood' \? 'WOOD_SWATCH'/);
  assert.match(gasMain, /\^V\(\?:COV\|FAB\|WOD\):\/i\.test\(ovKey\)/);
  assert.match(gasPatch, /\^V\(\?:COV\|FAB\|WOD\):\/i\.test\(ovKey\)/);
});

