import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function assertBalancedCssBraces(cssSrc, label) {
  let depth = 0;
  for (const ch of cssSrc) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, `Unmatched closing brace in ${label}`);
  }
  assert.equal(depth, 0, `Unbalanced braces in ${label}`);
}

// ============================================================================
// 1. SEGUIMIENTO INCREMENTAL DELTA (BACKEND GAS + FRONTEND)
// ============================================================================
test('Seguimiento Delta Backend: seg_get_delta returns noop when unchanged, delta with role-scoped changes when updated, and respects 60s seg_sync_now cooldown', () => {
  const PROJ_A_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
  const SHEET_CONTROL = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const SHEET_COT_DB = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

  const invHeader = new Array(50).fill('');
  invHeader[0] = 'SKU';
  invHeader[2] = 'MODELO';
  invHeader[3] = 'NOMBRE';
  invHeader[5] = 'FOTO';
  invHeader[20] = 'CEDIS (BODEGA)';
  invHeader[21] = 'CEDIS (PISO)';
  invHeader[22] = 'CASA CREATA (BODEGA)';
  invHeader[23] = 'CASA CREATA (PISO)';
  invHeader[49] = 'PRECIO';

  const invBanner = new Array(50).fill('');
  invBanner[48] = 'Sync OK 2026-11-21 10:00';

  const invRow3 = new Array(50).fill('');
  invRow3[0] = 'SKU-DELTA-1';
  invRow3[2] = 'MILAN';
  invRow3[3] = 'SALA MILAN SAND';
  invRow3[5] = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view';
  invRow3[20] = 4; // CEDIS BOD
  invRow3[21] = 1; // CEDIS PISO
  invRow3[22] = 2; // CCB BOD
  invRow3[49] = '$25,900';

  const env = createMockGasEnvironment({
    activeSpreadsheetId: SHEET_CONTROL,
    scriptProperties: {
      INV_AUTH_SECRET: 'TEST_SECRET_DELTA_999'
    }
  });

  env.makeSpreadsheet(SHEET_CONTROL, 'Control de Productos', {
    'INVENTARIO_EN_VIVO': [invHeader, invBanner, invRow3],
    'COTIZACIONES_EN_VIVO': [
      ['ID', 'FOLIO', 'FECHA', 'CLIENTE', 'TELEFONO', 'TOTAL', 'SUCURSAL', 'ASESOR_EMAIL', 'ASESOR_NOMBRE', 'ITEMS_JSON'],
      ['id-1', 'COT-ANA-01', '2026-11-21 09:00', 'Cliente Ana', '9981000001', 25900, 'CASA CREATA', 'ana@grupoanipa.com', 'Ana Asesora', JSON.stringify([{ s: 'SKU-DELTA-1', n: 'SALA MILAN SAND', q: 1 }])],
      ['id-2', 'COT-LUIS-01', '2026-11-21 09:05', 'Cliente Luis', '9981000002', 19000, 'PLAYA', 'luis@grupoanipa.com', 'Luis Asesor', JSON.stringify([{ s: 'SKU-DELTA-1', n: 'SALA MILAN SAND', q: 1 }])]
    ],
    'PROYECTOS': [
      ['NOMBRE', 'TELEFONO', 'CORREO', 'CLAVE', 'CARGO', 'ROL', 'SUCURSALES'],
      ['Kevin Reyna', '9981112222', 'kevin.reyna@grupoanipa.com', 'pass123', 'ADMIN', 'ADMIN', 'TODAS'],
      ['Ana Asesora', '9983334444', 'ana@grupoanipa.com', 'pass456', 'ASESOR', 'ASESOR', 'CASA CREATA'],
      ['Luis Asesor', '9985556666', 'luis@grupoanipa.com', 'pass789', 'ASESOR', 'ASESOR', 'PLAYA']
    ]
  });

  env.makeSpreadsheet(SHEET_COT_DB, 'COTIZACIONES BASE DE DATOS', {
    'COTIZACIONES_CREATA': [
      ['FECHA', 'FOLIO', 'TIPO', 'SUCURSAL', 'ASESOR', 'EMAIL', 'CLIENTE', 'TEL', 'PROD', 'SKU', 'CANT', 'ESTATUS', 'ULT_ACT', 'OBS'],
      ['2026-11-21 09:00', 'COT-ANA-01', 'COT', 'CASA CREATA', 'Ana Asesora', 'ana@grupoanipa.com', 'Cliente Ana', '9981000001', 'SALA MILAN SAND', 'SKU-DELTA-1', 1, 'EN SEGUIMIENTO', '2026-11-21 09:00', ''],
      ['2026-11-21 09:05', 'COT-LUIS-01', 'COT', 'PLAYA', 'Luis Asesor', 'luis@grupoanipa.com', 'Cliente Luis', '9981000002', 'SALA MILAN SAND', 'SKU-DELTA-1', 1, 'EN SEGUIMIENTO', '2026-11-21 09:05', '']
    ],
    'CIERRES_COTIZACIONES': [
      ['FECHA_CIERRE', 'FOLIO', 'SUCURSAL', 'ASESOR', 'EMAIL', 'CLIENTE', 'TEL', 'TOTAL', 'TIPO_CIERRE', 'MOTIVO', 'NOTAS', 'REGISTRADO_POR']
    ],
    'HISTORIAL_MOVIMIENTOS': [
      ['FECHA', 'ACCION', 'ASESOR', 'EMAIL', 'SUCURSAL', 'DETALLE']
    ]
  });

  env.loadScript(PROJ_A_GS);
  // Mock advisor resolution cleanly for Ana vs Kevin
  const USERS = {
    'kevin.reyna@grupoanipa.com': { correo: 'kevin.reyna@grupoanipa.com', nombre: 'Kevin Reyna', sheetTab: 'PROYECTOS', erpStore: 'TODAS', isAdmin: true },
    'ana@grupoanipa.com': { correo: 'ana@grupoanipa.com', nombre: 'Ana Asesora', sheetTab: 'CASA CREATA', erpStore: 'CREATA CASA CREATA', isAdmin: false }
  };
  env.context.resolveAuthenticatedAdvisor_ = (_ss, _erp, body) => {
    const email = String((body && body.advisorEmail) || '').trim().toLowerCase();
    return USERS[email] ? { ok: true, advisor: USERS[email] } : { ok: false };
  };

  const post = (payload) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());

  const kevinToken = env.context.issueInvAuthToken_('kevin.reyna@grupoanipa.com', 'PROYECTOS');
  const anaToken = env.context.issueInvAuthToken_('ana@grupoanipa.com', 'CASA CREATA');

  // 1. Bootstrap (no watermarks) for Ana -> mode: 'full', ONLY sees Ana's quotes (never Luis's!)
  const bootAna = post({
    action: 'seg_get_delta',
    authToken: anaToken,
    advisorEmail: 'ana@grupoanipa.com',
    sheetTab: 'CASA CREATA'
  });
  assert.equal(bootAna.ok, true);
  assert.equal(bootAna.mode, 'full');
  assert.equal(bootAna.roleScope, 'ASESOR');
  const anaLiveFolios = (bootAna.sheets.COTIZACIONES_EN_VIVO || []).slice(1).map((r) => r[1]);
  assert.ok(anaLiveFolios.includes('COT-ANA-01'), 'Ana must see her own quote in COTIZACIONES_EN_VIVO');
  assert.ok(!anaLiveFolios.includes('COT-LUIS-01'), 'Ana MUST NOT see Luis quote in COTIZACIONES_EN_VIVO');
  const anaSegFolios = (bootAna.sheets.COTIZACIONES_CREATA || []).slice(1).map((r) => r[1]);
  assert.ok(anaSegFolios.includes('COT-ANA-01'));
  assert.ok(!anaSegFolios.includes('COT-LUIS-01'));

  // 2. Immediate repeat delta query with returned watermarks -> mode: 'noop' (0 rows transferred!)
  const noopRes = post({
    action: 'seg_get_delta',
    authToken: anaToken,
    advisorEmail: 'ana@grupoanipa.com',
    sheetTab: 'CASA CREATA',
    sinceVersion: bootAna.version,
    sinceInvVersion: bootAna.invVersion,
    rowWatermarks: bootAna.rowWatermarks
  });
  assert.equal(noopRes.ok, true);
  assert.equal(noopRes.mode, 'noop');
  assert.equal(noopRes.unchanged, true);
  assert.equal(noopRes.summary.totalChanges, 0);

  // 3. Record a real modification (seg_action SEG_WHATSAPP) -> Kevin sees mode: 'delta' with ONLY changed entries + stock map!
  const bootKevin = post({
    action: 'seg_get_delta',
    authToken: kevinToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    sheetTab: 'PROYECTOS'
  });
  assert.equal(bootKevin.ok, true);
  assert.equal((bootKevin.sheets.COTIZACIONES_EN_VIVO || []).slice(1).length, 2, 'Admin Kevin sees both quotes');

  const actRes = post({
    action: 'seg_action',
    authToken: kevinToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    sheetTab: 'PROYECTOS',
    subAction: 'SEG_WHATSAPP',
    folio: 'COT-ANA-01',
    fecha_aviso: '2026-11-21 10:15'
  });
  assert.equal(actRes.ok, true);

  // Bump inventory version to verify targeted SKU stock delta too
  env.context.bumpSegInvVersion_('Sync OK 2026-11-21 10:20');

  const deltaKevin = post({
    action: 'seg_get_delta',
    authToken: kevinToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    sheetTab: 'PROYECTOS',
    sinceVersion: bootKevin.version,
    sinceInvVersion: bootKevin.invVersion,
    rowWatermarks: bootKevin.rowWatermarks,
    activeSkus: ['SKU-DELTA-1']
  });
  assert.equal(deltaKevin.ok, true);
  assert.equal(deltaKevin.mode, 'delta');
  assert.equal(deltaKevin.unchanged, false);
  assert.ok(deltaKevin.version > bootKevin.version);
  assert.ok(Array.isArray(deltaKevin.changes) && deltaKevin.changes.length >= 1);
  assert.equal(deltaKevin.changes[0].folio, 'COT-ANA-01');
  assert.ok(deltaKevin.stockDeltaBySku && deltaKevin.stockDeltaBySku['SKU-DELTA-1'], 'Delta must return stock for activeSkus');
  assert.equal(deltaKevin.stockDeltaBySku['SKU-DELTA-1'].precio, 25900, 'Must parse Col AX numeric price');

  // 4. seg_sync_now respects 60s CacheService cooldown
  env.context.CacheService.getScriptCache().put('SEG_ERP_SYNC_COOLDOWN_V1', '1', 60);
  const coolRes = post({
    action: 'seg_sync_now',
    authToken: kevinToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    sheetTab: 'PROYECTOS'
  });
  assert.equal(coolRes.ok, true);
  assert.equal(coolRes.cachedRecent, true);
});

test('Seguimiento Frontend: incremental delta engine, 30-min directory cache, no ERP write trigger on manual refresh, dead code removed, and WhatsApp timestamp preserved', () => {
  const segJs = readRepoFile('seguimiento-app.js');
  const invJs = readRepoFile('inventario-app.js');

  assert.match(segJs, /SEG_DIR_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(segJs, /async function fetchDeltaState\(/);
  assert.match(segJs, /action:\s*'seg_get_delta'/);
  assert.match(segJs, /Buscar cambios/);
  assert.ok(!segJs.includes("seg_sync_now"), 'Seguimiento frontend must NOT trigger seg_sync_now ERP overwrites');
  assert.ok(!segJs.includes("inv_erp_sync_now"), 'Seguimiento frontend must NOT trigger inv_erp_sync_now ERP overwrites');
  assert.ok(!segJs.includes('function attachItemPhoto'), 'Dead attachItemPhoto must be removed');
  assert.ok(!segJs.includes('function convertBlobToPngBlob'), 'Dead convertBlobToPngBlob must be removed');

  // WhatsApp contacted map saves timestamp string (not boolean true)
  assert.match(invJs, /contactedMap\[folioTxt\]\s*=\s*avisoStamp/);
  assert.ok(!invJs.includes('contactedMap[folioKey] = true'), 'Must not save boolean true over WhatsApp timestamp');
  assert.ok(!invJs.includes('contactedMap[folioTxt] = true'), 'Must not save boolean true over WhatsApp timestamp');
});

// ============================================================================
// 2. APP DE SUBIDA DE FOTOS (MOBILE POLISH + LIVE AUTO-SYNC + OFFLINE SAFETY)
// ============================================================================
test('Fotos App Mobile CSS & Live Auto-Sync: balanced braces, authoritative phone rules, live indicator pill, offline ID guards, and retry-safe outbox', () => {
  const css = readRepoFile('fotos-productos-styles.css');
  const html = readRepoFile('fotos-productos.html');
  const js = readRepoFile('fotos-productos-app.js');

  assertBalancedCssBraces(css, 'fotos-productos-styles.css');

  // Live indicator in HTML & CSS
  assert.ok(html.includes('id="fotosLiveStatusPill"'), 'Missing live auto-sync pill in fotos-productos.html');
  assert.match(css, /\.fotos-live-pill\s*\{/);
  assert.match(css, /\.fotos-live-pill\.is-syncing\s*\{/);
  assert.match(css, /\.fotos-live-pill\.is-offline\s*\{/);

  // Authoritative mobile rules at end of CSS (4-col SKU pills, 3-col visual pills, 16px URL input, 2-col inbox grid, .is-ok/.is-err)
  assert.match(css, /\.assign-feedback-banner\.is-ok\b/);
  assert.match(css, /\.assign-feedback-banner\.is-err\b/);
  assert.match(css, /#skuFinderSkuControls\s+\.filter-pills-row\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#visualTargetsFinderWrap\s+\.filter-pills-row\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.visual-url-row\s+\.search-input[\s\S]*?font-size:\s*16px\s*!important/);
  assert.match(css, /\.inbox-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);

  // Dead CSS removed
  assert.ok(!css.includes('.kpi-strip'), 'Dead .kpi-strip CSS should be removed');
  assert.ok(!css.includes('.session-log-list'), 'Dead .session-log-list CSS should be removed');

  // Live auto-sync engine & offline bug fixes in fotos-productos-app.js
  assert.match(js, /function isLocalTempPhotoId\(/);
  assert.match(js, /function startFotosLiveAutoSync\(/);
  assert.match(js, /function stopFotosLiveAutoSync\(/);
  assert.match(js, /function runSilentFotosLiveTick\(/);
  assert.match(js, /function computeInboxFingerprint\(/);
  assert.match(js, /function computeCatalogFingerprint\(/);
  assert.match(js, /function computeVisualFingerprint\(/);
  assert.match(js, /window\.addEventListener\('storage'/);
  assert.match(js, /entry\.retryCount\s*<\s*10/);
  assert.match(js, /shortcutId:\s*shortcutId/);
  assert.ok(!js.includes('pcUploadFolderToSubirInput'), 'Dead pcUploadFolderToSubirInput ref must be removed');
  assert.ok(!js.includes('uploadInFlight:'), 'Unused state.uploadInFlight must be removed');
});

// ============================================================================
// 3. PROMPTS NATIVE STUDIO (V8 PRO + V7 + V1) & ALTA DE ODOO (RENDER)
// ============================================================================
test('Prompts Studio Native Engine: ONLY V8/V7/V1 versions, V8 CREATA Pro 2054x2054/78%/#FFFFFF/0% shadows + 100% casco, V7 9 modes, V1 3 engines, clearPhotos preserves settings, zero hardcoded API keys', () => {
  const studioSrc = readRepoFile('prompts-studio-v8.js');
  const promptsJs = readRepoFile('prompts-app.js');
  const promptsCss = readRepoFile('prompts-styles.css');
  const promptsHtml = readRepoFile('prompts.html');

  assertBalancedCssBraces(promptsCss, 'prompts-styles.css');

  // Security: zero hardcoded Google/Gemini API keys
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(studioSrc), 'prompts-studio-v8.js must NEVER contain hardcoded API keys');
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(promptsJs), 'prompts-app.js must NEVER contain hardcoded API keys');
  assert.ok(promptsHtml.includes('id="promptsNativeStudio"'), 'prompts.html must mount native studio container');
  assert.ok(promptsHtml.includes('id="btnModeAltaOdoo"'), 'prompts.html must provide Alta Odoo (Render) mode switcher');

  // Execute prompts-studio-v8.js in Node VM
  const store = new Map();
  const sandbox = {
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    document: { getElementById: () => null },
    Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, Set, Map,
    setTimeout: () => 1, clearTimeout: () => {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(studioSrc, sandbox, { filename: 'prompts-studio-v8.js' });
  const studio = sandbox.CreataPromptsStudio;
  assert.ok(studio, 'window.CreataPromptsStudio must be exposed');

  // Strictly ONLY V8, V7, V1
  assert.deepEqual(Array.from(studio.VERSIONS, (v) => v.id), ['V8', 'V7', 'V1']);
  assert.equal(studio.getState().version, 'V8', 'Default version must be V8');

  // V8 PACK_CREATA with exact filename slot mapping & 100% casco upholstery
  const v8Pack = studio.generatePrompts({
    version: 'V8',
    v8Mode: 'PACK_CREATA',
    sku: 'HAK1PLUM01',
    productName: 'Sillón Individual Lumina',
    dimensions: '85 x 80 x 78 cm',
    furniturePhoto: { name: 'LUMINA_ORIGINAL.jpg' },
    fabricSwatch: { name: 'ATLAS_SAND.jpg' },
    woodSwatch: { name: 'TEKA_CLARO.jpg' }
  });
  assert.equal(v8Pack.length, 3, 'V8 PACK_CREATA must generate Catalog + Cover + CAD prompts');
  assert.match(v8Pack[0].prompt, /2054x2054/);
  assert.match(v8Pack[0].prompt, /78%/);
  assert.match(v8Pack[0].prompt, /#FFFFFF/);
  assert.match(v8Pack[0].prompt, /0% shadow|ZERO cast shadows/);
  assert.match(v8Pack[0].prompt, /\[IMAGE 1: "LUMINA_ORIGINAL\.jpg"\]/);
  assert.match(v8Pack[0].prompt, /\[IMAGE 2: "ATLAS_SAND\.jpg"\]/);
  assert.match(v8Pack[0].prompt, /\[IMAGE 3: "TEKA_CLARO\.jpg"\]/);
  assert.match(v8Pack[0].prompt, /100% FULL-BODY CASCO/);
  assert.match(v8Pack[2].prompt, /85 x 80 x 78 cm/);

  // V7 has 9 modes and supports 3/4 right 2054x2054
  assert.equal(studio.V7_MODES.length, 9);
  const v7Out = studio.generatePrompts({
    version: 'V7',
    v7Mode: 'CAMBIO_DUAL',
    forceThreeQuarterRight: true,
    furniturePhoto: { name: 'SOFA_MILAN.jpg' },
    fabricSwatch: { name: 'BOUCLE_IVORY.jpg' },
    woodSwatch: { name: 'PAROTA.jpg' }
  });
  assert.equal(v7Out.length, 1);
  assert.match(v7Out[0].prompt, /2054x2054/);
  assert.match(v7Out[0].prompt, /BOUCLE_IVORY\.jpg/);
  assert.match(v7Out[0].prompt, /PAROTA\.jpg/);

  // V1 generates 3 engine-specific outputs (AI Studio, Flux/MJ, ChatGPT)
  const v1Out = studio.generatePrompts({
    version: 'V1',
    v1Mode: 'CAMBIO_MATERIAL',
    productName: 'Sala Modular Riviera',
    fabricSwatch: { name: 'LINO_ARENA.jpg' }
  });
  assert.equal(v1Out.length, 3);
  assert.match(v1Out[0].title, /AI Studio/i);
  assert.match(v1Out[1].title, /Flux/i);
  assert.match(v1Out[2].title, /ChatGPT/i);

  // clearPhotos() NEVER resets version, mode, angle, room, or checkboxes
  studio.setVersion('V7');
  studio.setMode('ENTORNO');
  studio.setField('roomId', 'PENTHOUSE_MAR');
  studio.setFieldSilent('sku', 'SKU-TEST');
  studio.setFieldSilent('productName', 'Mesa Test');
  studio.getState().furniturePhoto = { name: 'temp.jpg', previewUrl: 'data:image/png;base64,AA==' };
  studio.clearPhotos();
  const stAfter = studio.getState();
  assert.equal(stAfter.furniturePhoto, null);
  assert.equal(stAfter.sku, '');
  assert.equal(stAfter.version, 'V7', 'clearPhotos must preserve selected version');
  assert.equal(stAfter.v7Mode, 'ENTORNO', 'clearPhotos must preserve selected mode');
  assert.equal(stAfter.roomId, 'PENTHOUSE_MAR', 'clearPhotos must preserve selected room');
});

test('Project B Backend: prompts_materials_list scans TELAS + FOTOS TELAS + MADERAS strictly read-only with cache, and prompts_fetch_image_b64 blocks Project A files', () => {
  const PROJ_B_GS = path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs');
  const IDS = {
    PROMPTS_SHEET: '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg',
    SUBIR_PROPT: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
    FOTOS_ODOO: '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B',
    ODOO_TELAS: '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9',
    TELAS: '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul',
    MADERAS: '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx',
    SUBIR_PREN: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'
  };

  const env = createMockGasEnvironment({
    activeSpreadsheetId: IDS.PROMPTS_SHEET,
    scriptProperties: { PROMPTS_PIN: '4321' }
  });
  env.makeFolder(IDS.SUBIR_PROPT, 'SUBIR PROPT');
  env.makeFolder(IDS.FOTOS_ODOO, 'fotos odoo');
  env.makeFolder(IDS.ODOO_TELAS, 'FOTOS TELAS', { parentId: IDS.FOTOS_ODOO });
  env.makeFolder(IDS.TELAS, 'TELAS', { parentId: IDS.ODOO_TELAS });
  env.makeFolder('sub_telas_linos', 'LINOS', { parentId: IDS.TELAS });
  env.makeFolder(IDS.MADERAS, 'MADERAS', { parentId: IDS.ODOO_TELAS });
  env.makeFolder(IDS.SUBIR_PREN, 'SUBIR PREN');

  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  env.makeFile('tela_root_id_12345', 'ATLAS SAND.jpg', { parentId: IDS.TELAS, bytes: jpegBytes });
  env.makeFile('tela_sub_id_123456', 'LINO ARENA.jpg', { parentId: 'sub_telas_linos', bytes: jpegBytes });
  env.makeFile('tela_ft_id_1234567', 'DIRECTA FOTO TELA.jpg', { parentId: IDS.ODOO_TELAS, bytes: jpegBytes });
  env.makeFile('madera_id_12345678', 'TEKA NATURAL.jpg', { parentId: IDS.MADERAS, bytes: jpegBytes });
  env.makeFile('proj_a_secret_1234', 'FORBIDDEN.jpg', { parentId: IDS.SUBIR_PREN, bytes: jpegBytes });

  env.loadScript(PROJ_B_GS);
  const post = (p) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(p) } }).getContent());
  const AUTH = { ownerEmail: 'kevin.reyna@grupoanipa.com', pin: '4321' };

  const mat1 = post({ action: 'prompts_materials_list', ...AUTH });
  assert.equal(mat1.ok, true);
  assert.equal(mat1.readOnly, true);
  assert.equal(mat1.counts.telas, 3, 'Must include TELAS root + LINOS subfolder + direct FOTOS TELAS swatch');
  assert.equal(mat1.counts.maderas, 1);

  // Second call hits 10-min CacheService
  const mat2 = post({ action: 'prompts_materials_list', ...AUTH });
  assert.equal(mat2.ok, true);
  assert.equal(mat2.fromCache, true);

  // prompts_fetch_image_b64 returns base64 dataUri for read-only material image
  const imgOk = post({ action: 'prompts_fetch_image_b64', ...AUTH, fileId: 'tela_root_id_12345' });
  assert.equal(imgOk.ok, true);
  assert.equal(imgOk.readOnly, true);
  assert.match(imgOk.dataUri, /^data:image\/jpeg;base64,/);

  // prompts_fetch_image_b64 strictly blocks Project A files (SUBIR PREN)
  const imgBlocked = post({ action: 'prompts_fetch_image_b64', ...AUTH, fileId: 'proj_a_secret_1234' });
  assert.equal(imgBlocked.ok, false);
  assert.equal(imgBlocked.forbiddenFolder, true);
});

// ============================================================================
// 4. ADVISOR SAFETY, PANEL TEARDOWN & DEAD FILE CLEANUP
// ============================================================================
test('Ecosystem Safety & Cleanup: orphaned historial-styles.css deleted, advisor bugs fixed in inventario-app.js, and panel-app.js tears down iframes on lock', () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'historial-styles.css')), false, 'Orphaned historial-styles.css must stay deleted');

  const invJs = readRepoFile('inventario-app.js');
  const histJs = readRepoFile('historial-app.js');
  const panelJs = readRepoFile('panel-app.js');

  // Password change uses declared AUTH_SESSION_KEY (never undeclared INV_SESSION_KEY)
  assert.ok(!/\bINV_SESSION_KEY\b/.test(invJs), 'inventario-app.js must not reference undeclared INV_SESSION_KEY');
  // Price override mutates it.pr, never it.p (provider code)
  assert.match(invJs, /it\.pr\s*=\s*formatPrice\(/);
  // CreataLiveAlerts restricted to admin Kevin
  assert.match(invJs, /if\s*\(!isFotosAppOwner\(\)\)\s*return;/);
  // Split target for Prompts points to native ./prompts.html?embed=1
  assert.match(invJs, /target\s*===\s*'prompts'\s*\?\s*'\.\/prompts\.html\?embed=1'/);
  // Logout clears creata_seg_* keys to prevent shared-device bleed
  assert.match(invJs, /creata_seg_/);
  // Historial skips admin-only CSV for non-admin advisors
  assert.match(histJs, /isAdmin\s*\?\s*fetchSheetRows\('HISTORIAL'/);
  // Panel lockHubPortal destroys mounted iframes
  assert.match(panelJs, /Object\.keys\(liveFramesById\)\.forEach/);
});
