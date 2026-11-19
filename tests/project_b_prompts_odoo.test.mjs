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

const OWNER_AUTH = { ownerEmail: 'kevin.reyna@grupoanipa.com' };
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

function setupProjectBEnv({ buzonTrashed = true, promptsPin = '' } = {}) {
  const scriptProperties = {};
  if (promptsPin) scriptProperties.PROMPTS_PIN = promptsPin;

  const env = createMockGasEnvironment({
    activeSpreadsheetId: IDS.PROMPTS_SHEET,
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

test('Project B: prompts_health (GET & POST) reports folder counts, isolation status, and trashed warning for SUBIDA DE FOTOS', () => {
  const env = setupProjectBEnv({ buzonTrashed: true });

  const getRes = getAction(env, { action: 'prompts_health' });
  assert.equal(getRes.ok, true);
  assert.equal(getRes.project, 'prompts_odoo');
  assert.equal(getRes.sheetId, IDS.PROMPTS_SHEET);
  assert.equal(getRes.folders.subirPropt.ok, true);
  assert.equal(getRes.folders.subirPropt.count, 3);
  assert.equal(getRes.folders.buzonOdoo.trashed, true);
  assert.equal(getRes.folders.buzonOdoo.ok, false);
  assert.equal(getRes.folders.telas.count, 1);
  assert.equal(getRes.folders.maderas.count, 1);
  assert.ok(getRes.warnings.some((w) => /SUBIDA DE FOTOS|Papelera|trashed/i.test(w)));
  assert.ok(getRes.isolation.forbiddenProjectAIdsCount >= 14);

  const postRes = postAction(env, { action: 'prompts_health' });
  assert.equal(postRes.ok, true);
  assert.equal(postRes.folders.buzonOdoo.trashed, true);
});

test('Project B: prompts_propt_list, upload, and delete operate ONLY on SUBIR PROPT, preserve duplicate filenames by ID, and reject invalid MIME or unauthorized callers', () => {
  const env = setupProjectBEnv({ promptsPin: '9988' });

  // Unauthorized caller (missing/wrong email or missing PIN) is rejected
  const unauth1 = postAction(env, { action: 'prompts_propt_list', ownerEmail: 'intruder@example.com', pin: '9988' });
  assert.equal(unauth1.ok, false);
  assert.equal(unauth1.forbidden, true);

  const unauth2 = postAction(env, { action: 'prompts_propt_list', ...OWNER_AUTH, pin: '0000' });
  assert.equal(unauth2.ok, false);
  assert.equal(unauth2.forbidden, true);

  // List preserves BOTH duplicate filenames distinctly by file ID
  const listRes = postAction(env, { action: 'prompts_propt_list', ...OWNER_AUTH, pin: '9988' });
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
    pin: '9988',
    fileName: 'script.html',
    dataUrl: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
  });
  assert.equal(badMime.ok, false);
  assert.match(badMime.error, /MIME|no permitido/i);

  // Upload valid JPEG succeeds ONLY in SUBIR PROPT with ANYONE_WITH_LINK VIEW
  const upRes = postAction(env, {
    action: 'prompts_propt_upload',
    ...OWNER_AUTH,
    pin: '9988',
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
    pin: '9988',
    fileId: 'dup_id_small'
  });
  assert.equal(delOne.ok, true);
  assert.equal(env.filesById.get('dup_id_small').isTrashed(), true);
  assert.equal(env.filesById.get('dup_id_large').isTrashed(), false);
});

test('Project B: prompts_propt_delete and folder guards REJECT any forbidden Project A IDs (SUBIR PREN, CATEGORIAS, Control de Productos)', () => {
  const env = setupProjectBEnv();

  // Direct attempt to delete file in SUBIR PREN
  const delPren = postAction(env, {
    action: 'prompts_propt_delete',
    ...OWNER_AUTH,
    fileId: 'proj_a_pren_file'
  });
  assert.equal(delPren.ok, false);
  assert.match(delPren.error, /Aislamiento Proyecto A\/B/i);
  assert.equal(env.filesById.get('proj_a_pren_file').isTrashed(), false);

  // Direct attempt to delete file in FOTOS SALAS (category subfolder)
  const delCat = postAction(env, {
    action: 'prompts_propt_delete',
    ...OWNER_AUTH,
    fileId: 'proj_a_cat_file'
  });
  assert.equal(delCat.ok, false);
  assert.match(delCat.error, /Aislamiento Proyecto A\/B/i);
  assert.equal(env.filesById.get('proj_a_cat_file').isTrashed(), false);

  // Direct assertion on assertNotForbiddenProjectAId_ for SUBIR PREN, CATEGORIAS root, and Control de Productos
  for (const forbiddenId of [IDS.SUBIR_PREN, IDS.CATEGORIAS_ROOT, IDS.FOTOS_SALAS, IDS.FOTOS_NUEVAS_CARGADO, IDS.SHEET_CONTROL]) {
    assert.throws(() => env.context.assertNotForbiddenProjectAId_(forbiddenId, 'test'), /Aislamiento Proyecto A\/B/);
  }
});

test('Project B: prompts_materials_list reads TELAS & MADERAS strictly read-only', () => {
  const env = setupProjectBEnv();
  const res = postAction(env, { action: 'prompts_materials_list', ...OWNER_AUTH });
  assert.equal(res.ok, true);
  assert.equal(res.readOnly, true);
  assert.equal(res.counts.telas, 1);
  assert.equal(res.counts.maderas, 1);
  assert.equal(res.telas[0].id, 'tela_001');
  assert.equal(res.maderas[0].id, 'madera_001');
});

test('Project B: prompts_sku_lookup finds exact, normalized, and >=4-char prefix SKUs in DATOS GENERAL!A4:AJ and formats medidas', () => {
  const env = setupProjectBEnv();

  // Exact match
  const exact = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'HAK1PLUMNASS8' });
  assert.equal(exact.ok, true);
  assert.equal(exact.found, true);
  assert.equal(exact.matchType, 'exact');
  assert.equal(exact.match.fila, 4);
  assert.equal(exact.match.tipo_mueble, 'SILLON INDIVIDUAL');
  assert.equal(exact.match.medidas, '85 x 80 x 78 x asiento 44 cm');
  assert.equal(exact.match.foto_mueble_nom, 'LUMINA_MUEBLE.jpg');

  // Normalized match (spaces/hyphens stripped)
  const norm = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'mesa nido 01' });
  assert.equal(norm.ok, true);
  assert.equal(norm.found, true);
  assert.equal(norm.matchType, 'normalized');
  assert.equal(norm.match.fila, 5);
  assert.equal(norm.match.medidas, 'D. 90 x Alto 45 cm');

  // >=4-char prefix match
  const pref = postAction(env, { action: 'prompts_sku_lookup', ...OWNER_AUTH, sku: 'HAK1P' });
  assert.equal(pref.ok, true);
  assert.equal(pref.found, true);
  assert.equal(pref.matchType, 'prefix');
  assert.equal(pref.match.sku, 'HAK1PLUMNASS8');
});

test('Project B: odoo_buzon_list/upload/move_to_final return folderTrashed: true when SUBIDA DE FOTOS is trashed and succeed cleanly when restored', () => {
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

  const moveTrashed = postAction(envTrashed, {
    action: 'odoo_move_to_final',
    ...OWNER_AUTH,
    fileId: 'propt_camastro',
    subfolderKey: 'MUEBLES'
  });
  assert.equal(moveTrashed.ok, false);
  assert.equal(moveTrashed.folderTrashed, true);

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

test('Project B: odoo_register_foto protects Row 3 & formula columns in FOTOS NORMALIZADAS (C/G/K/O) and DATOS GENERAL (B, O, Q:W, AB, AE, AH, AK, AN:AZ)', () => {
  const env = setupProjectBEnv();
  const ss = env.spreadsheetsById.get(IDS.PROMPTS_SHEET);
  const shNorm = ss.getSheetByName('FOTOS NORMALIZADAS');
  const shDg = ss.getSheetByName('DATOS GENERAL');

  const normRow3Before = shNorm.getRange(3, 1, 1, 16).getValues()[0];
  const dgRow3Before = shDg.getRange(3, 1, 1, 52).getValues()[0];

  // 1) Reject row < 4 in FOTOS NORMALIZADAS
  const badNormRow = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: 'BAD.jpg',
    link: 'https://drive.google.com/file/d/x/view',
    rowNumber: 3
  });
  assert.equal(badNormRow.ok, false);
  assert.equal(badNormRow.formulaProtected, true);

  // 2) Reject row < 4 in DATOS GENERAL
  const badDgRow = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    datosGeneralRow: 3,
    datosGeneralFields: { frente: '100' }
  });
  assert.equal(badDgRow.ok, false);
  assert.equal(badDgRow.formulaProtected, true);

  // 3) Register all 4 photo types in FOTOS NORMALIZADAS -> verify exact B/D, F/H, J/L, N/P columns only!
  const regMueble = postAction(env, {
    action: 'odoo_register_foto',
    ...OWNER_AUTH,
    tipo: 'MUEBLE',
    nombre: 'SILLON_MUEBLE.jpg',
    link: 'https://drive.google.com/file/d/m1/view?usp=sharing',
    sku: 'HAK1PLUMNASS8',
    updateDatosGeneral: true,
    datosGeneralFields: {
      frente: '86',            // allowed manual col C (3)
      B: 'HACK_FORMULA_B',     // forbidden formula col B (2)
      O: 'HACK_FORMULA_O',     // forbidden formula col O (15)
      R: 'HACK_PRECIO',        // forbidden formula col R (18)
      AB: 'HACK_IMAGE_AB',     // forbidden formula col AB (28)
      AN: 'HACK_CUBICAJE'      // forbidden formula col AN (40)
    }
  });
  assert.equal(regMueble.ok, true);
  assert.equal(regMueble.fotosNormalizadas.row, 5); // row 4 already occupied
  assert.equal(regMueble.fotosNormalizadas.nameCol, 'B');
  assert.equal(regMueble.fotosNormalizadas.linkCol, 'D');
  assert.equal(shNorm.getRange(5, 2).getValue(), 'SILLON_MUEBLE.jpg');
  assert.equal(shNorm.getRange(5, 3).getValue(), ''); // Col C untouched!
  assert.equal(shNorm.getRange(5, 4).getValue(), 'https://drive.google.com/file/d/m1/view?usp=sharing');

  // Verify DATOS GENERAL wrote ONLY manual cols (C, AA, AC) and blocked B, O, R, AB, AN
  assert.equal(regMueble.datosGeneral.row, 4);
  assert.deepEqual(regMueble.datosGeneral.blockedColumns.sort(), ['AB', 'AN', 'B', 'O', 'R']);
  assert.equal(shDg.getRange(4, 3).getValue(), '86');
  assert.equal(shDg.getRange(4, 27).getValue(), 'SILLON_MUEBLE.jpg');
  assert.equal(shDg.getRange(4, 29).getValue(), 'https://drive.google.com/file/d/m1/view?usp=sharing');
  assert.equal(shDg.getRange(4, 2).getValue(), 'SILLON LUMINA VIEJO'); // B untouched
  assert.equal(shDg.getRange(4, 28).getValue(), ''); // AB untouched

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

  // SUBIR PROPT file got ANYONE_WITH_LINK VIEW
  assert.deepEqual(env.filesById.get('propt_camastro')._state.sharing, {
    access: 'ANYONE_WITH_LINK',
    perm: 'VIEW'
  });

  // SUBIR PREN folder and file were NEVER accessed or modified
  assert.equal(env.foldersById.get(IDS.SUBIR_PREN)._state.sharing, null);
  assert.equal(env.filesById.get('proj_a_pren_file')._state.sharing, null);
  assert.ok(!env.accessedFolderIds.includes(IDS.SUBIR_PREN));
  assert.ok(!env.openedSpreadsheetIds.includes(IDS.SHEET_CONTROL));
});

test('Project B: onOpen menu and savePromptsWebAppUrlToConfig_ register hidden _PROMPTS_CONFIG tab cleanly', () => {
  const env = setupProjectBEnv();
  env.context.onOpen();
  assert.equal(env.createdMenus.length, 1);
  assert.equal(env.createdMenus[0].title, 'CREATA Prompts & Odoo');

  const saved = env.context.savePromptsWebAppUrlToConfig_('https://script.google.com/macros/s/AKfycbTEST12345/exec');
  assert.equal(saved.ok, true);
  assert.equal(saved.tabName, '_PROMPTS_CONFIG');
  const cfgSh = env.spreadsheetsById.get(IDS.PROMPTS_SHEET).getSheetByName('_PROMPTS_CONFIG');
  assert.ok(cfgSh);
  assert.equal(cfgSh._isHidden(), true);
  assert.equal(cfgSh.getRange(2, 2).getValue(), 'https://script.google.com/macros/s/AKfycbTEST12345/exec');
});
