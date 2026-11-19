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

test('Project A: MAX_PEND_MS = 8000 budget cap is preserved in handleFotosSubirList_', () => {
  const src = fs.readFileSync(PROJECT_A_GS, 'utf8');
  const fnMatch = src.match(/function handleFotosSubirList_\([\s\S]*?\n\}/);
  assert.ok(fnMatch, 'handleFotosSubirList_ must exist');
  assert.match(fnMatch[0], /const MAX_PEND_MS\s*=\s*8000;/);
  assert.match(fnMatch[0], /\(Date\.now\(\)\s*-\s*startPendMs\)\s*>\s*MAX_PEND_MS/);
});
