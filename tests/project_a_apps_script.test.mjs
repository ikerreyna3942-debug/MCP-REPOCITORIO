import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PROJECT_A_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');

const IDS = {
  SHEET_CONTROL: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
  PARENT_FOTOS: '1MJ90Y9Jsjd5jezwLnSUekuR15rcWFYxi',
  SUBIR_PREN: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p',
  SUBIR_PREN_CHILD: 'subir_pren_child_001',
  SUBIR_PROPT: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
  SUBIDA_DE_FOTOS: '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ',
  FOTOS_ODOO: '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B',
  TELAS: '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul',
  MADERAS: '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx',
  CATEGORIAS_ROOT: '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN',
  FOTOS_SALAS: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb',
  FOTOS_SILLONES: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm',
  FOTOS_SOFA_CAMA: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_',
  FOTOS_MESA_CENTRO: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A',
  FOTOS_MESA_LATERAL: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX',
  FOTOS_COMEDORES: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K',
  FOTOS_RECAMARAS: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6',
  FOTOS_AUXILIARES: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8',
  FOTOS_ACCESORIOS: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9',
  FOTOS_INTERIOR: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9',
  FOTOS_NUEVAS_CARGADO: '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9',
  RANDOM_EXTERNAL_FOLDER: 'external_unrelated_folder_999'
};

const KEVIN_AUTH = {
  advisorEmail: 'kevin.reyna@grupoanipa.com',
  accessKey: 'KEVIN2026'
};

function setupProjectAEnv() {
  // Deliberately plant a stale SUBIR_COTIZACION_FOLDER_ID_V1 pointing to SUBIR PROPT
  // AND a global folder named "SUBIR COTIZACION" to prove Project A ignores both!
  const env = createMockGasEnvironment({
    activeSpreadsheetId: IDS.SHEET_CONTROL,
    scriptProperties: {
      SUBIR_COTIZACION_FOLDER_ID_V1: IDS.SUBIR_PROPT
    }
  });

  // Shared parent "Fotos de del proyeto" with sibling Project A & Project B folders
  env.makeFolder(IDS.PARENT_FOTOS, 'Fotos de del proyeto');
  env.makeFolder(IDS.SUBIR_PREN, 'SUBIR PREN', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.SUBIR_PREN_CHILD, 'Lote Noviembre', { parentId: IDS.SUBIR_PREN });
  env.makeFolder(IDS.SUBIR_PROPT, 'SUBIR PROPT', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.SUBIDA_DE_FOTOS, 'SUBIDA DE FOTOS', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.FOTOS_ODOO, 'fotos odoo', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.TELAS, 'TELAS', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.MADERAS, 'MADERAS', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder('stale_subir_cot_id', 'SUBIR COTIZACION', { parentId: IDS.PARENT_FOTOS });

  // Destination root + 10 category subfolders
  env.makeFolder(IDS.CATEGORIAS_ROOT, 'CATEGORIAS MUEBLES Y ACCESORIOS', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.FOTOS_SALAS, 'FOTOS SALAS', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_SILLONES, 'FOTOS SILLONES', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_SOFA_CAMA, 'FOTOS SOFÁ CAMA Y FUTTONES', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_MESA_CENTRO, 'FOTOS MESA DE CENTRO', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_MESA_LATERAL, 'FOTOS MESA LATERALES', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_COMEDORES, 'FOTOS COMEDORES', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_RECAMARAS, 'FOTOS RECAMARAS', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_AUXILIARES, 'FOTOS DE AUXILIARES', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_ACCESORIOS, 'FOTOS ACCESORIOS Y ESPEJOS', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_INTERIOR, 'FOTOS INTERIOR', { parentId: IDS.CATEGORIAS_ROOT });
  env.makeFolder(IDS.FOTOS_NUEVAS_CARGADO, 'FOTOS NUEVAS CARGADO');
  env.makeFolder(IDS.RANDOM_EXTERNAL_FOLDER, 'CARPETA EXTERNA AJENA');

  // Populate files in SUBIR PREN, its child subfolder, SUBIR PROPT, fotos odoo, and external folder
  env.makeFile('pren_file_001', 'SALA MILAN BEIGE.jpg', { parentId: IDS.SUBIR_PREN });
  env.makeFile('pren_file_002', 'MESA ALBA.png', { mimeType: 'image/png', parentId: IDS.SUBIR_PREN_CHILD });
  env.makeFile('propt_file_001', 'RENDER CAMASTRO LUSTRO.jpg', { parentId: IDS.SUBIR_PROPT });
  env.makeFile('propt_file_002', 'RENDER SILLON LUMINA.jpg', { parentId: IDS.SUBIR_PROPT });
  env.makeFile('odoo_file_001', 'FOTO FINAL ODOO.jpg', { parentId: IDS.FOTOS_ODOO });
  env.makeFile('external_file_001', 'PRIVADO EXTERNO.jpg', { parentId: IDS.RANDOM_EXTERNAL_FOLDER });

  // Control de Productos spreadsheet with locked Row-2 formulas in Hoja "1" and Kevin user row in COLOCIO
  env.makeSpreadsheet(IDS.SHEET_CONTROL, 'Control de Productos', {
    '1': [
      ['SKU', 'NOMBRE', 'FOTO APP', 'LINK FOTO APP', 'A COLOCAR', 'FOTO'],
      [
        '',
        '=ARRAYFORMULA(XLOOKUP(A2:A,INVENTARIO_EN_VIVO!A:A,INVENTARIO_EN_VIVO!D:D,""))',
        '=MAP(D2:D,LAMBDA(u,IF(u="","",IMAGE(u))))',
        '',
        '=ARRAYFORMULA(XLOOKUP(A2:A,INVENTARIO_EN_VIVO!A:A,INVENTARIO_EN_VIVO!A:A,""))',
        '=MAP($E$2:$E,LAMBDA(u,IF(u="","",IMAGE(u))))'
      ],
      ['SKU-SALA-01', 'SALA MILAN MODULAR', '', '', '', ''],
      ['SKU-COM-02', 'MESA DE COMEDOR ALBA', '', '', '', '']
    ],
    INVENTARIO_EN_VIVO: [
      ['SKU', 'TIPO DE PRODUCTO', 'MODELO', 'NOMBRE', 'VARIANTE', 'FOTO', 'CATEGORIA'],
      ['', '', '', '', '', '=ARRAYFORMULA(IMAGE(...))', ''],
      ['SKU-SALA-01', 'SALA', 'MILAN', 'SALA MILAN MODULAR', '', '', 'SALAS & SOFAS'],
      ['SKU-COM-02', 'COMEDOR', 'ALBA', 'MESA DE COMEDOR ALBA', '', '', 'COMEDORES']
    ],
    plantilla: [
      ['PLANTILLA DE COTIZACION'],
      ['']
    ],
    COLOCIO: [
      [''],
      ['', 'SUC. COLOCIO', 'Nombre', 'Puesto', 'Correo', 'Contraseña Temporal', 'Contraseña', '', 'Descuento'],
      ['', 'COLOCIO', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KEVIN2026', '', '15%']
    ],
    HISTORIAL: [
      ['CENTRO DE ANALISIS'],
      ['KPI'],
      ['KPI'],
      ['KPI']
    ]
  });

  env.loadScript(PROJECT_A_GS);
  return env;
}

test('Project A: resolveSubirInboxFolders_ returns ONLY SUBIR PREN (+ its non-forbidden subfolder), ignoring SUBIR PROPT, siblings, and stale SUBIR_COTIZACION_FOLDER_ID_V1', () => {
  const env = setupProjectAEnv();
  const resolved = env.context.resolveSubirInboxFolders_();

  assert.equal(resolved.primaryFolder.getId(), IDS.SUBIR_PREN);
  const resolvedIds = Array.from(resolved.folders, (f) => f.getId()).sort();
  assert.deepEqual(resolvedIds, [IDS.SUBIR_PREN, IDS.SUBIR_PREN_CHILD].sort());
  assert.equal(resolved.folderIdsMap[IDS.SUBIR_PROPT], undefined);
  assert.equal(resolved.folderIdsMap[IDS.SUBIDA_DE_FOTOS], undefined);
  assert.equal(resolved.folderIdsMap[IDS.FOTOS_ODOO], undefined);
  assert.equal(resolved.folderIdsMap['stale_subir_cot_id'], undefined);
  assert.equal(resolved.folderIdsMap[IDS.CATEGORIAS_ROOT], undefined);
});

test('Project A: handleFotosSubirList_ returns ONLY SUBIR PREN files and NEVER SUBIR PROPT or fotos odoo files', () => {
  const env = setupProjectAEnv();
  const res = env.context.handleFotosSubirList_({ ...KEVIN_AUTH });

  assert.equal(res.ok, true);
  assert.equal(res.inboxFolderId, IDS.SUBIR_PREN);
  const fileIds = Array.from(res.files, (f) => f.id).sort();
  assert.deepEqual(fileIds, ['pren_file_001', 'pren_file_002']);
  assert.ok(!fileIds.includes('propt_file_001'));
  assert.ok(!fileIds.includes('propt_file_002'));
  assert.ok(!fileIds.includes('odoo_file_001'));
});

test('Project A: handleFotosSubirAssign_ moves SUBIR PREN file to category folder, updates Hoja 1 Col D (preserving Row 2 formulas), and REJECTS assigning a SUBIR PROPT file', () => {
  const env = setupProjectAEnv();
  const sh1 = env.spreadsheetsById.get(IDS.SHEET_CONTROL).getSheetByName('1');
  const row2Before = sh1.getRange(2, 1, 1, 6).getValues()[0];

  // 1) Assigning a valid SUBIR PREN file succeeds
  const assignOk = env.context.handleFotosSubirAssign_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    driveFileId: 'pren_file_001'
  });
  assert.equal(assignOk.ok, true);
  assert.equal(assignOk.destFolderId, IDS.FOTOS_SALAS);
  assert.equal(assignOk.rowNumber, 3);
  assert.ok(env.foldersById.get(IDS.FOTOS_SALAS)._state.fileIds.has('pren_file_001'));
  assert.ok(!env.foldersById.get(IDS.SUBIR_PREN)._state.fileIds.has('pren_file_001'));
  assert.equal(sh1.getRange(3, 4).getValue(), 'https://drive.google.com/file/d/pren_file_001/view?usp=sharing');

  // Row 2 formulas completely untouched
  const row2After = sh1.getRange(2, 1, 1, 6).getValues()[0];
  assert.deepEqual(row2After, row2Before);

  // 2) Assigning a SUBIR PROPT file is REJECTED without mutating SUBIR PROPT or Hoja "1"
  const assignBlocked = env.context.handleFotosSubirAssign_({
    ...KEVIN_AUTH,
    sku: 'SKU-COM-02',
    driveFileId: 'propt_file_001'
  });
  assert.equal(assignBlocked.ok, false);
  assert.equal(assignBlocked.forbiddenFolder, true);
  assert.match(assignBlocked.error, /SUBIR PROPT|Aislamiento/i);
  assert.ok(env.foldersById.get(IDS.SUBIR_PROPT)._state.fileIds.has('propt_file_001'));
  assert.equal(env.filesById.get('propt_file_001').getName(), 'RENDER CAMASTRO LUSTRO.jpg');
  assert.equal(sh1.getRange(4, 4).getValue(), '');
});

test('Project A: handleFotosDelete_ trashes SUBIR PREN file cleanly and REJECTS trashing SUBIR PROPT, fotos odoo, or external files', () => {
  const env = setupProjectAEnv();

  // 1) Trashing a SUBIR PREN file succeeds
  const delOk = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    driveFileId: 'pren_file_002',
    source: 'INBOX',
    skipListReturn: true
  });
  assert.equal(delOk.ok, true);
  assert.equal(delOk.driveTrashed, true);
  assert.equal(env.filesById.get('pren_file_002').isTrashed(), true);

  // 2) Trashing a SUBIR PROPT file is REJECTED
  const delPropt = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    driveFileId: 'propt_file_001',
    source: 'INBOX',
    skipListReturn: true
  });
  assert.equal(delPropt.ok, false);
  assert.equal(delPropt.forbiddenFolder, true);
  assert.equal(env.filesById.get('propt_file_001').isTrashed(), false);

  // 3) Trashing a fotos odoo file is REJECTED
  const delOdoo = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    driveFileId: 'odoo_file_001',
    source: 'INBOX',
    skipListReturn: true
  });
  assert.equal(delOdoo.ok, false);
  assert.equal(delOdoo.forbiddenFolder, true);
  assert.equal(env.filesById.get('odoo_file_001').isTrashed(), false);

  // 4) Trashing a file outside Project A allowed folders is REJECTED
  const delExt = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    driveFileId: 'external_file_001',
    source: 'INBOX',
    skipListReturn: true
  });
  assert.equal(delExt.ok, false);
  assert.equal(delExt.forbiddenFolder, true);
  assert.equal(env.filesById.get('external_file_001').isTrashed(), false);
});

test('Project A (Items 1-2): rejects all 4 fotos odoo subfolders, SUBIR PROPT subfolder, unrelated folders, cyclic/throwing getParents, and invalid targetFolderId', () => {
  const env = setupProjectAEnv();
  const sh1 = env.spreadsheetsById.get(IDS.SHEET_CONTROL).getSheetByName('1');

  // Create all 4 verified fotos odoo subfolders + a nested subfolder under SUBIR PROPT
  const odooSubfolders = [
    ['10UIhDWLKL0ySmzdcMemA5K5831YozuBa', 'FOTOS MUEBLES'],
    ['1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR', 'FOTOS ACCESORIOS Y ESPEJOS'],
    ['12gsKZVs6rFonOO8CIxokuE73bxhq8tS9', 'FOTOS TELAS'],
    ['13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1', 'OTROS']
  ];
  for (const [subId, subName] of odooSubfolders) {
    env.makeFolder(subId, subName, { parentId: IDS.FOTOS_ODOO });
    env.makeFile('file_' + subId, subName + '.jpg', { parentId: subId });
  }
  env.makeFolder('subir_propt_child_01', 'Renders Hijos', { parentId: IDS.SUBIR_PROPT });
  env.makeFile('file_propt_child', 'RENDER_HIJO.jpg', { parentId: 'subir_propt_child_01' });

  // Also test nested forbidden subfolder linked inside SUBIR PREN -> must be excluded by resolveSubirInboxFolders_
  env.foldersById.get(IDS.SUBIR_PREN)._state.childFolderIds.add('10UIhDWLKL0ySmzdcMemA5K5831YozuBa');
  env.foldersById.get(IDS.SUBIR_PREN)._state.childFolderIds.add('subir_propt_child_01');
  const resolved = env.context.resolveSubirInboxFolders_();
  assert.equal(resolved.folderIdsMap['10UIhDWLKL0ySmzdcMemA5K5831YozuBa'], undefined);
  assert.equal(resolved.folderIdsMap['subir_propt_child_01'], undefined);

  // Assign MUST reject all 4 fotos odoo subfolders, SUBIR PROPT child, and unrelated external folder
  for (const badFileId of [
    'file_10UIhDWLKL0ySmzdcMemA5K5831YozuBa',
    'file_1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR',
    'file_12gsKZVs6rFonOO8CIxokuE73bxhq8tS9',
    'file_13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1',
    'file_propt_child',
    'external_file_001'
  ]) {
    const res = env.context.handleFotosSubirAssign_({
      ...KEVIN_AUTH,
      sku: 'SKU-SALA-01',
      driveFileId: badFileId
    });
    assert.equal(res.ok, false, `Assign must reject ${badFileId}`);
    assert.equal(res.forbiddenFolder, true, `Assign must flag forbiddenFolder for ${badFileId}`);
  }
  assert.equal(sh1.getRange(3, 4).getValue(), '', 'Hoja 1 must not be mutated on rejected assigns');

  // Multi-parent file in SUBIR PREN + fotos odoo/FOTOS MUEBLES must be hidden from list & rejected on assign/delete
  env.makeFile('multi_pren_odoo', 'MULTI.jpg', {
    parentIds: [IDS.SUBIR_PREN, '10UIhDWLKL0ySmzdcMemA5K5831YozuBa']
  });
  const listRes = env.context.handleFotosSubirList_({ ...KEVIN_AUTH });
  assert.ok(!listRes.files.some((f) => f.id === 'multi_pren_odoo'));
  assert.equal(env.context.handleFotosSubirAssign_({ ...KEVIN_AUTH, sku: 'SKU-SALA-01', driveFileId: 'multi_pren_odoo' }).ok, false);
  assert.equal(env.context.handleFotosDelete_({ ...KEVIN_AUTH, driveFileId: 'multi_pren_odoo', source: 'INBOX', skipListReturn: true }).ok, false);
  assert.equal(env.filesById.get('multi_pren_odoo').isTrashed(), false);

  // Fail closed when getParents() throws
  env.makeFile('throwing_file_01', 'BROKEN_PARENTS.jpg', {
    parentId: IDS.SUBIR_PREN,
    throwOnGetParents: true
  });
  assert.equal(env.context.isFileInForbiddenProjectBFolder_(env.filesById.get('throwing_file_01')), true);
  assert.equal(env.context.isFileInProjectAAllowedFolders_(env.filesById.get('throwing_file_01')), false);
  assert.equal(env.context.handleFotosSubirAssign_({ ...KEVIN_AUTH, sku: 'SKU-SALA-01', driveFileId: 'throwing_file_01' }).ok, false);

  // Cycle guard: cyclic folder parent graph must not infinite-loop
  const cycA = env.makeFolder('cyc_folder_a', 'Cycle A');
  const cycB = env.makeFolder('cyc_folder_b', 'Cycle B', { parentId: 'cyc_folder_a' });
  cycA._state.parentIds.add('cyc_folder_b');
  assert.equal(env.context.isFolderOrAncestorForbiddenProjectB_(cycB, 8), false);

  // Strict targetFolderId: forbidden or unknown non-empty targetFolderId must be explicitly rejected
  const badTargetPropt = env.context.handleFotosSubirAssign_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    driveFileId: 'pren_file_001',
    targetFolderId: IDS.SUBIR_PROPT
  });
  assert.equal(badTargetPropt.ok, false);
  assert.equal(badTargetPropt.forbiddenFolder, true);
  const badTargetUnknown = env.context.handleFotosSubirAssign_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    driveFileId: 'pren_file_001',
    targetFolderId: 'nonexistent_folder_xyz'
  });
  assert.equal(badTargetUnknown.ok, false);
  assert.equal(badTargetUnknown.forbiddenFolder, true);
  // Source file remained in SUBIR PREN untouched
  assert.ok(env.foldersById.get(IDS.SUBIR_PREN)._state.fileIds.has('pren_file_001'));
});

test('Project A (Items 3-4): shortcut fallthrough/bypass blocked in list/assign/delete, and shared-SKU handleFotosDelete_ rejects non-Project-A links BEFORE clearing Hoja 1', () => {
  const env = setupProjectAEnv();
  const sh1 = env.spreadsheetsById.get(IDS.SHEET_CONTROL).getSheetByName('1');

  env.makeFolder('10UIhDWLKL0ySmzdcMemA5K5831YozuBa', 'FOTOS MUEBLES', { parentId: IDS.FOTOS_ODOO });
  env.makeFile('odoo_muebles_long_id_0001', 'ODOO_MUEBLE.jpg', { parentId: '10UIhDWLKL0ySmzdcMemA5K5831YozuBa' });
  env.makeFile('propt_trashed_target_001', 'TRASHED_RENDER.jpg', { parentId: IDS.SUBIR_PROPT, trashed: true });

  // Shortcuts placed in SUBIR PREN:
  // 1) Shortcut to SUBIR PROPT file
  env.makeFile('sc_to_propt_0001', 'shortcut_propt.jpg', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.SUBIR_PREN,
    targetId: 'propt_file_001'
  });
  // 2) Broken shortcut named *.jpg pointing to trashed SUBIR PROPT file
  env.makeFile('sc_broken_trashed_01', 'render_shortcut.jpg', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.SUBIR_PREN,
    targetId: 'propt_trashed_target_001'
  });
  // 3) Shortcut pointing to missing ID
  env.makeFile('sc_missing_target_01', 'missing_shortcut.png', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.SUBIR_PREN,
    targetId: 'does_not_exist_999'
  });
  // 4) Shortcut pointing to unrelated external folder file
  env.makeFile('sc_external_target_01', 'ext_shortcut.jpg', {
    mimeType: 'application/vnd.google-apps.shortcut',
    parentId: IDS.SUBIR_PREN,
    targetId: 'external_file_001'
  });

  // listSubirInboxFilesInternal_ MUST NOT leak any of those 4 shortcuts or their targets!
  const listed = env.context.listSubirInboxFilesInternal_();
  const listedIds = listed.map((f) => f.id);
  for (const leaked of ['sc_to_propt_0001', 'sc_broken_trashed_01', 'sc_missing_target_01', 'sc_external_target_01', 'propt_file_001', 'external_file_001']) {
    assert.ok(!listedIds.includes(leaked), `List must exclude ${leaked}`);
  }

  // Direct handleFotosSubirAssign_ on shortcut to SUBIR PROPT or broken shortcut must REJECT with 0 mutations
  for (const scId of ['sc_to_propt_0001', 'sc_broken_trashed_01', 'sc_external_target_01']) {
    const res = env.context.handleFotosSubirAssign_({
      ...KEVIN_AUTH,
      sku: 'SKU-SALA-01',
      driveFileId: scId
    });
    assert.equal(res.ok, false, `Assign must reject shortcut ${scId}`);
    assert.equal(res.forbiddenFolder, true);
  }

  // Item 4: Shared-SKU in Hoja "1" linked to fotos odoo/FOTOS MUEBLES (usedByOtherSku=true -> willTrashDrive=false)
  // AND keepDriveFile=true linked to external folder -> BOTH must reject BEFORE clearing Hoja "1"!
  const odooUrl = 'https://drive.google.com/file/d/odoo_muebles_long_id_0001/view?usp=sharing';
  sh1.getRange(3, 4).setValue(odooUrl);
  sh1.getRange(4, 4).setValue(odooUrl); // shared with SKU-COM-02 so usedByOtherSku === true!

  const delSharedOdoo = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    skipListReturn: true
  });
  assert.equal(delSharedOdoo.ok, false);
  assert.equal(delSharedOdoo.forbiddenFolder, true);
  assert.equal(sh1.getRange(3, 4).getValue(), odooUrl, 'Hoja 1 Row 3 must NOT be cleared for forbidden Project B link');

  const extUrl = 'https://drive.google.com/file/d/external_file_001/view?usp=sharing';
  sh1.getRange(3, 4).setValue(extUrl);
  const delKeepExt = env.context.handleFotosDelete_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    keepDriveFile: true,
    skipListReturn: true
  });
  assert.equal(delKeepExt.ok, false);
  assert.equal(delKeepExt.forbiddenFolder, true);
  assert.equal(sh1.getRange(3, 4).getValue(), extUrl, 'Hoja 1 Row 3 must NOT be cleared for external link even with keepDriveFile: true');
});

test('Project A: MAX_PEND_MS = 8000 budget cap is preserved in handleFotosSubirList_', () => {
  const src = fs.readFileSync(PROJECT_A_GS, 'utf8');
  const fnMatch = src.match(/function handleFotosSubirList_\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'handleFotosSubirList_ must exist');
  assert.match(fnMatch[0], /const MAX_PEND_MS\s*=\s*8000;/);
  assert.match(fnMatch[0], /\(Date\.now\(\)\s*-\s*startPendMs\)\s*>\s*MAX_PEND_MS/);
});

test('Project A: doPost(fotos_subir_list) returns explicit authRequired when unauthenticated and mints renewedAuthToken + SUBIR PREN files on valid Kevin accessKey', () => {
  const env = setupProjectAEnv();

  // 1) Unauthenticated call returns explicit authRequired: true instead of silent { ok: false }
  const unauthResp = env.context.doPost({
    postData: { contents: JSON.stringify({ action: 'fotos_subir_list', advisorEmail: 'kevin.reyna@grupoanipa.com' }) }
  });
  const unauthJson = JSON.parse(unauthResp.getContent());
  assert.equal(unauthJson.ok, false);
  assert.equal(unauthJson.authRequired, true);

  // 2) Call with expired authToken + valid Kevin accessKey succeeds, returns SUBIR PREN files, and issues renewedAuthToken
  const validResp = env.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'fotos_subir_list',
        authToken: 'expired_or_empty_token',
        advisorEmail: 'kevin.reyna@grupoanipa.com',
        accessKey: 'KEVIN2026'
      })
    }
  });
  const validJson = JSON.parse(validResp.getContent());
  assert.equal(validJson.ok, true);
  assert.equal(validJson.inboxFolderId, IDS.SUBIR_PREN);
  assert.ok(validJson.renewedAuthToken && validJson.renewedAuthToken.length > 10, 'Must mint fresh renewedAuthToken');
  assert.deepEqual(validJson.files.map((f) => f.id).sort(), ['pren_file_001', 'pren_file_002']);
});

test('Project A (User Requirements 2, 3, 5, 7): preserves exact original filename, always shares publicly, 1-step direct upload & visual override move out of SUBIR PREN, and reorganizes misfiled photos from Sheets without touching Project B', () => {
  const env = setupProjectAEnv();

  // 1) Assigning from SUBIR PREN preserves exact filename (NO forced rename), shares publicly, and removes duplicate ONLY inside SUBIR PREN
  env.makeFile('pren_dup_copy_01', 'SALA MILAN BEIGE.jpg', { parentId: IDS.SUBIR_PREN_CHILD });
  const assignRes = env.context.handleFotosSubirAssign_({
    ...KEVIN_AUTH,
    sku: 'SKU-SALA-01',
    driveFileId: 'pren_file_001',
    skipListReturn: true
  });
  assert.equal(assignRes.ok, true);
  assert.equal(assignRes.fileName, 'SALA MILAN BEIGE.jpg', 'Original filename must be preserved without renaming');
  const f1 = env.filesById.get('pren_file_001');
  assert.equal(f1.getName(), 'SALA MILAN BEIGE.jpg');
  assert.equal(f1._state.parentIds.has(IDS.FOTOS_SALAS), true, 'Must auto-place into FOTOS SALAS from Sheets');
  assert.equal(f1._state.parentIds.has(IDS.SUBIR_PREN), false, 'Must move out of SUBIR PREN');
  assert.equal(f1._state.sharing && f1._state.sharing.access, 'ANYONE_WITH_LINK');
  assert.equal(env.foldersById.get(IDS.FOTOS_SALAS)._state.sharing && env.foldersById.get(IDS.FOTOS_SALAS)._state.sharing.access, 'ANYONE_WITH_LINK');
  assert.equal(env.foldersById.get(IDS.SUBIR_PREN)._state.sharing && env.foldersById.get(IDS.SUBIR_PREN)._state.sharing.access, 'ANYONE_WITH_LINK');
  assert.equal(env.filesById.get('pren_dup_copy_01').isTrashed(), true, 'Duplicate inside SUBIR PREN extraction folder must be cleaned up');

  // 2) 1-step direct upload (fotos_direct_upload_assign) places photo straight into Sheets category folder with exact filename + public sharing
  const directResp = env.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'fotos_direct_upload_assign',
        ...KEVIN_AUTH,
        sku: 'SKU-COM-02',
        fileName: 'Mi Comedor Alba Original.jpg',
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/'
      })
    }
  });
  const directJson = JSON.parse(directResp.getContent());
  assert.equal(directJson.ok, true, `Direct upload failed: ${directJson.error || ''}`);
  assert.equal(directJson.fileName, 'Mi Comedor Alba Original.jpg');
  assert.equal(directJson.destFolderId, IDS.FOTOS_COMEDORES, 'Must auto-resolve FOTOS COMEDORES from INVENTARIO_EN_VIVO');
  const uploadedDirectFile = env.filesById.get(directJson.fileId);
  assert.ok(uploadedDirectFile, 'Uploaded direct file must exist in Drive');
  assert.equal(uploadedDirectFile._state.parentIds.has(IDS.FOTOS_COMEDORES), true);
  assert.equal(uploadedDirectFile._state.sharing && uploadedDirectFile._state.sharing.access, 'ANYONE_WITH_LINK');
  const sh1 = env.spreadsheetsById.get(IDS.SHEET_CONTROL).getSheetByName('1');
  assert.match(String(sh1.getRange(4, 4).getValue()), new RegExp(directJson.fileId), 'Hoja 1 Col D must be updated');
  assert.match(String(sh1.getRange(2, 2).getValue()), /^=ARRAYFORMULA/, 'Row 2 formulas must stay untouched');

  // 3) 1-step visual override (fotos_upload_visual_override) moves file out of SUBIR PREN to FOTOS NUEVAS CARGADO, shares publicly, and saves VFAB override
  const visResp = env.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'fotos_upload_visual_override',
        ...KEVIN_AUTH,
        overrideKey: 'VFAB:LINO BEIGE',
        label: 'LINO BEIGE',
        categoryTag: 'FABRIC_SWATCH',
        sourceInboxFileId: 'pren_file_002',
        fromLoaded: false
      })
    }
  });
  const visJson = JSON.parse(visResp.getContent());
  assert.equal(visJson.ok, true, `Visual override failed: ${visJson.error || ''}`);
  const f2 = env.filesById.get('pren_file_002');
  assert.equal(f2._state.parentIds.has(IDS.FOTOS_NUEVAS_CARGADO), true, 'Visual photo from SUBIR PREN must move to FOTOS NUEVAS CARGADO');
  assert.equal(f2._state.parentIds.has(IDS.SUBIR_PREN_CHILD), false, 'Visual photo must be removed from SUBIR PREN');
  assert.equal(f2._state.sharing && f2._state.sharing.access, 'ANYONE_WITH_LINK');
  assert.equal(f2.getName(), 'MESA ALBA.png', 'Visual file keeps original filename');

  // 4) Reorganize misfiled photos from Sheets (fotos_reorganize_from_sheets): move SKU-SALA-01 photo back if misfiled in FOTOS INTERIOR & repair public permissions
  const misfiledId = '1PrenSalaMilanLongId00001';
  const misfiled = env.makeFile(misfiledId, 'SALA MILAN ORIGINAL.jpg', { parentId: IDS.FOTOS_INTERIOR });
  misfiled._state.sharing = { access: 'PRIVATE', perm: 'NONE' };
  sh1.getRange(3, 4).setValue('https://drive.google.com/file/d/' + misfiledId + '/view?usp=sharing');
  const propt1 = env.filesById.get('propt_file_001');
  propt1._state.sharing = { access: 'PRIVATE', perm: 'NONE' };
  const reorgResp = env.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'fotos_reorganize_from_sheets',
        ...KEVIN_AUTH,
        startIndex: 0,
        maxFiles: 50,
        repairPublic: true
      })
    }
  });
  const reorgJson = JSON.parse(reorgResp.getContent());
  assert.equal(reorgJson.ok, true);
  assert.ok(reorgJson.moved >= 1 && reorgJson.filesMoved >= 1, 'Misfiled SKU-SALA-01 photo must be moved back to FOTOS SALAS');
  assert.equal(misfiled._state.parentIds.has(IDS.FOTOS_SALAS), true);
  assert.equal(misfiled._state.parentIds.has(IDS.FOTOS_INTERIOR), false);
  assert.equal(misfiled.getName(), 'SALA MILAN ORIGINAL.jpg', 'Reorganization must NEVER rename files');
  assert.equal(misfiled._state.sharing && misfiled._state.sharing.access, 'ANYONE_WITH_LINK');
  assert.equal(propt1._state.sharing && propt1._state.sharing.access, 'PRIVATE', 'Project B files in SUBIR PROPT must NEVER be touched');
});

test('Project A Performance & Timeout Fix: listSubirInboxFilesInternal_ memoizes ancestor walks across 60+ SUBIR PREN files and fotos-productos-app.js prevents silent 30s aborts', () => {
  const env = setupProjectAEnv();

  // Build 4-level ancestor chain above SUBIR PREN matching real Drive (SUBIR PREN -> Fotos proyecto -> Fotos general -> DOC ANIPA -> Root)
  const docAnipa = env.makeFolder('doc_anipa_root', 'DOC ANIPA');
  const fotosGen = env.makeFolder('fotos_general_01', 'Fotos general', { parentId: 'doc_anipa_root' });
  const fotosProy = env.makeFolder('fotos_proy_01', 'Fotos de del proyeto', { parentId: 'fotos_general_01' });
  const subirPren = env.foldersById.get(IDS.SUBIR_PREN);
  subirPren._state.parentIds.add('fotos_proy_01');

  // Spy on subirPren.getParents() calls to guarantee O(1) ancestor memoization instead of 3x per file (180+ calls)
  let subirPrenParentWalks = 0;
  const origGetParents = subirPren.getParents.bind(subirPren);
  subirPren.getParents = function () {
    subirPrenParentWalks++;
    return origGetParents();
  };

  // Seed 60 valid photos + 1 forbidden multi-parent photo inside SUBIR PREN
  for (let i = 1; i <= 60; i++) {
    env.makeFile('pren_bulk_photo_' + String(i).padStart(3, '0'), 'FOTO_' + i + '.jpg', { parentId: IDS.SUBIR_PREN });
  }
  env.makeFolder('10UIhDWLKL0ySmzdcMemA5K5831YozuBa', 'FOTOS MUEBLES', { parentId: IDS.FOTOS_ODOO });
  env.makeFile('multi_bulk_bad_001', 'LEAK.jpg', {
    parentIds: [IDS.SUBIR_PREN, '10UIhDWLKL0ySmzdcMemA5K5831YozuBa']
  });

  const listed = env.context.listSubirInboxFilesInternal_();
  const ids = listed.map((f) => f.id);
  assert.ok(ids.includes('pren_bulk_photo_001') && ids.includes('pren_bulk_photo_060'), 'All 60 SUBIR PREN photos must be returned');
  assert.ok(!ids.includes('multi_bulk_bad_001'), 'Multi-parent Project B file must still be blocked');
  assert.ok(subirPrenParentWalks <= 4, `Expected O(1) memoized ancestor checks (<= 4 walks across 60 files), got ${subirPrenParentWalks}`);

  // Verify frontend fotos-productos-app.js uses >= 60s timeout, conditional includeLoadedNames, and honest Reconnecting state
  const fotosAppSrc = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'fotos-productos-app.js'), 'utf8');
  const fotosHtmlSrc = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'fotos-productos.html'), 'utf8');
  assert.match(fotosAppSrc, /const inboxTimeoutMs\s*=\s*75000;/, 'fotos_subir_list timeout must be raised to 75s to prevent aborting large Drive folders');
  assert.match(fotosAppSrc, /const needLoadedNames\s*=\s*Boolean\(/, 'Silent polls must evaluate conditional includeLoadedNames with rev sync');
  assert.match(fotosAppSrc, /_inboxConsecutiveSyncFails\+\+;\s*setFotosLiveStatus\('offline',\s*'Reconectando'\);/, 'Inbox timeout must surface Reconectando status instead of silently staying En vivo');
  assert.ok(fotosHtmlSrc.includes('./fotos-productos-app.js?v=40'), 'fotos-productos.html must load fotos-productos-app.js?v=40');
  assert.ok(docAnipa && fotosGen && fotosProy);
});



