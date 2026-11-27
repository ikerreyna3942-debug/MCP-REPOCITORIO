import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CREATA_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
const PARCHE_GS = path.join(REPO_ROOT, 'AppsScript_Parche_Fotos_V2.gs');

const IDS = {
  SHEET_CONTROL: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
  PARENT_FOTOS: '1MJ90Y9Jsjd5jezwLnSUekuR15rcWFYxi',
  SUBIR_PREN: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p',
  SUBIR_PROPT: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
  FOTOS_ODOO: '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B',
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
  FOTOS_NUEVAS_CARGADO: '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9'
};

const KEVIN_AUTH = {
  advisorEmail: 'kevin.reyna@grupoanipa.com',
  accessKey: 'KEVIN2026'
};

function setupLifecycleGasEnv(scriptPaths = [CREATA_GS]) {
  const env = createMockGasEnvironment({
    activeSpreadsheetId: IDS.SHEET_CONTROL
  });

  env.makeFolder(IDS.PARENT_FOTOS, 'Fotos de del proyeto');
  env.makeFolder(IDS.SUBIR_PREN, 'SUBIR PREN', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.SUBIR_PROPT, 'SUBIR PROPT', { parentId: IDS.PARENT_FOTOS });
  env.makeFolder(IDS.FOTOS_ODOO, 'fotos odoo', { parentId: IDS.PARENT_FOTOS });

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

  env.makeFile('file_inbox_001', 'SILLON_NUBE_ORIGINAL.jpg', { parentId: IDS.SUBIR_PREN });
  env.makeFile('file_sala_001', 'SALA_MILAN_GRIS_ORIG.jpg', { parentId: IDS.FOTOS_SALAS });
  env.makeFile('file_sala_unlinked_002', 'SALA_SUELTA_DRIVE.jpg', { parentId: IDS.FOTOS_SALAS });
  env.makeFile('file_shared_003', 'COMEDOR_ALBA_COMPARTIDO.jpg', { parentId: IDS.FOTOS_COMEDORES });
  env.makeFile('file_propt_forbidden', 'RENDER_PROPT_SECRETO.jpg', { parentId: IDS.SUBIR_PROPT });

  env.makeSpreadsheet(IDS.SHEET_CONTROL, 'Control de Productos', {
    '1': [
      ['SKU', 'NOMBRE', 'FOTO APP', 'LINK FOTO APP', 'A COLOCAR', 'FOTO'],
      ['', '=ARRAYFORMULA()', '=MAP()', '', '=ARRAYFORMULA()', '=MAP()'],
      ['SKU-SALA-01', 'SALA MILAN MODULAR', '', 'https://drive.google.com/file/d/file_sala_001/view?usp=sharing', '', ''],
      ['SKU-COM-01', 'COMEDOR ALBA 6P', '', 'https://drive.google.com/file/d/file_shared_003/view?usp=sharing', '', ''],
      ['SKU-COM-02', 'COMEDOR ALBA 8P', '', 'https://drive.google.com/file/d/file_shared_003/view?usp=sharing', '', '']
    ],
    INVENTARIO_EN_VIVO: [
      ['SKU', 'TIPO DE PRODUCTO', 'MODELO', 'NOMBRE', 'VARIANTE', 'FOTO', 'CATEGORIA'],
      ['', '', '', '', '', '', ''],
      ['SKU-SALA-01', 'SALA', 'MILAN', 'SALA MILAN MODULAR', '', '', 'SALAS'],
      ['SKU-COM-01', 'COMEDOR', 'ALBA', 'COMEDOR ALBA 6P', '', '', 'COMEDORES'],
      ['SKU-COM-02', 'COMEDOR', 'ALBA', 'COMEDOR ALBA 8P', '', '', 'COMEDORES']
    ],
    'CUENTAS ADMINISTRATIVAS': [
      [''],
      ['', 'ADMINISTRACIÓN GENERAL', 'Nombre', 'Puesto', 'Correo', 'Contraseña Temporal', 'Contraseña', '', 'Descuento'],
      ['', 'ADMINISTRACIÓN GENERAL', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KEVIN2026', '', '15%']
    ],
    HISTORIAL: [['CENTRO DE ANALISIS'], ['KPI'], ['KPI'], ['KPI']]
  });

  const list = Array.isArray(scriptPaths) ? scriptPaths : [scriptPaths];
  for (const sp of list) env.loadScript(sp);
  return env;
}

function postJson(env, payload) {
  const resp = env.context.doPost({
    postData: { contents: JSON.stringify(payload) }
  });
  return JSON.parse(resp.getContent());
}

test('Backend 1:1 Drive Inventory & External Removal Pruning: lists ALL loaded + unlinked + archived files and prunes deleted Drive files from recentUploads', () => {
  const env = setupLifecycleGasEnv([CREATA_GS]);

  // Seed a recent upload that will then be deleted directly in Google Drive
  env.context.recordFotosRecentUpload_({
    id: 'file_sala_unlinked_002',
    fileId: 'file_sala_unlinked_002',
    targetKey: 'SKU-SALA-99',
    fileName: 'SALA_SUELTA_DRIVE.jpg',
    ts: Date.now()
  });

  const list1 = postJson(env, Object.assign({
    action: 'fotos_subir_list',
    includeLoadedNames: true,
    includeDriveInventory: true,
    forceRefresh: true
  }, KEVIN_AUTH));

  assert.equal(list1.ok, true);
  assert.ok(Array.isArray(list1.loadedDriveFiles), 'fotos_subir_list must return loadedDriveFiles array');
  assert.ok(Array.isArray(list1.archivedFiles), 'fotos_subir_list must return archivedFiles array');
  const loadedIds1 = list1.loadedDriveFiles.map((f) => f.id);
  assert.ok(loadedIds1.includes('file_sala_001'), 'Linked category photo must appear in loadedDriveFiles');
  assert.ok(loadedIds1.includes('file_sala_unlinked_002'), 'Unlinked category photo directly in Drive must appear in loadedDriveFiles');

  // Simulate Kevin deleting file_sala_unlinked_002 directly in Google Drive
  env.filesById.get('file_sala_unlinked_002').setTrashed(true);

  const list2 = postJson(env, Object.assign({
    action: 'fotos_subir_list',
    includeLoadedNames: true,
    includeDriveInventory: true,
    forceRefresh: true
  }, KEVIN_AUTH));

  assert.equal(list2.ok, true);
  const loadedIds2 = list2.loadedDriveFiles.map((f) => f.id);
  assert.ok(!loadedIds2.includes('file_sala_unlinked_002'), 'File trashed in Drive must immediately disappear from loadedDriveFiles');
  assert.ok(!list2.recentUploads.some((r) => r.id === 'file_sala_unlinked_002'), 'File trashed in Drive must be pruned from recentUploads');
});

test('Backend fotos_photo_action: enforces Project A/B isolation and executes all 5 lifecycle ops (unlink_sku, archive, return_to_inbox keeping original filename, copy, delete) in both GAS modes', () => {
  for (const modeScripts of [[CREATA_GS], [CREATA_GS, PARCHE_GS]]) {
    const env = setupLifecycleGasEnv(modeScripts);
    const sh1 = env.spreadsheetsById.get(IDS.SHEET_CONTROL).getSheetByName('1');

    // 0) Project B isolation: forbidden SUBIR PROPT file rejected on every op
    for (const op of ['delete', 'archive', 'unlink_sku', 'return_to_inbox', 'copy']) {
      const badRes = postJson(env, Object.assign({
        action: 'fotos_photo_action',
        op,
        driveFileId: 'file_propt_forbidden',
        sku: 'SKU-SALA-01'
      }, KEVIN_AUTH));
      assert.equal(badRes.ok, false, `Project B file must be blocked on op=${op}`);
      assert.equal(env.filesById.get('file_propt_forbidden').isTrashed(), false);
    }

    // 1) COPIAR (copy): creates copy in SUBIR PREN preserving original filename WITHOUT unlinking SKU-SALA-01
    const copyRes = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'copy',
      sku: 'SKU-SALA-01',
      driveFileId: 'file_sala_001',
      targetLocation: 'INBOX'
    }, KEVIN_AUTH));
    assert.equal(copyRes.ok, true, 'copy op must succeed');
    assert.ok(copyRes.file && copyRes.file.id && copyRes.file.id !== 'file_sala_001', 'copy must create a distinct Drive file');
    assert.equal(copyRes.file.name, 'SALA_MILAN_GRIS_ORIG.jpg', 'copy must preserve exact original filename');
    assert.ok(env.foldersById.get(IDS.SUBIR_PREN)._state.fileIds.has(copyRes.file.id), 'copied file must be placed in SUBIR PREN');
    assert.match(sh1._grid[2][3], /file_sala_001/, 'copy must leave SKU-SALA-01 Col D link intact');

    // 2) QUITAR DEL PRODUCTO (unlink_sku): clears Hoja "1" Col D ONLY, keeping file untouched in FOTOS SALAS
    const unlinkRes = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'unlink_sku',
      sku: 'SKU-SALA-01',
      driveFileId: 'file_sala_001'
    }, KEVIN_AUTH));
    assert.equal(unlinkRes.ok, true, 'unlink_sku op must succeed');
    assert.equal(sh1._grid[2][3], '', 'unlink_sku must clear Hoja "1" Col D for SKU-SALA-01');
    assert.equal(env.filesById.get('file_sala_001').isTrashed(), false, 'unlink_sku must NOT trash Drive file');
    assert.ok(env.foldersById.get(IDS.FOTOS_SALAS)._state.fileIds.has('file_sala_001'), 'unlink_sku must leave file in FOTOS SALAS');

    // Re-link SKU-SALA-01 to test ARCHIVAR next
    sh1._grid[2][3] = 'https://drive.google.com/file/d/file_sala_001/view?usp=sharing';

    // 3) ARCHIVAR (archive): creates/resolves FOTOS ARCHIVADAS inside CATEGORIAS MUEBLES Y ACCESORIOS, moves file preserving name, clears Col D
    const archRes = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'archive',
      sku: 'SKU-SALA-01',
      driveFileId: 'file_sala_001'
    }, KEVIN_AUTH));
    assert.equal(archRes.ok, true, 'archive op must succeed');
    assert.equal(sh1._grid[2][3], '', 'archive must clear Hoja "1" Col D for SKU-SALA-01');
    assert.ok(archRes.archivedFolderId, 'archive must return archivedFolderId');
    const archFolder = env.foldersById.get(archRes.archivedFolderId);
    assert.ok(archFolder, 'FOTOS ARCHIVADAS folder must exist in Drive');
    assert.equal(archFolder.getName(), 'FOTOS ARCHIVADAS');
    assert.ok(archFolder._state.parentIds.has(IDS.CATEGORIAS_ROOT), 'FOTOS ARCHIVADAS must live strictly inside CATEGORIAS MUEBLES Y ACCESORIOS');
    assert.ok(archFolder._state.fileIds.has('file_sala_001'), 'file_sala_001 must now reside in FOTOS ARCHIVADAS');
    assert.equal(env.filesById.get('file_sala_001').getName(), 'SALA_MILAN_GRIS_ORIG.jpg', 'archive must preserve original filename');

    // 4a) REGRESAR AL ARCHIVO ORIGEN (return_to_inbox) from FOTOS ARCHIVADAS: moves back to SUBIR PREN keeping original name
    const retFromArch = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'return_to_inbox',
      driveFileId: 'file_sala_001',
      source: 'ARCHIVED'
    }, KEVIN_AUTH));
    assert.equal(retFromArch.ok, true, 'return_to_inbox from ARCHIVED must succeed');
    assert.ok(env.foldersById.get(IDS.SUBIR_PREN)._state.fileIds.has('file_sala_001'), 'file_sala_001 must be back in SUBIR PREN');
    assert.ok(!archFolder._state.fileIds.has('file_sala_001'), 'file_sala_001 must no longer be in FOTOS ARCHIVADAS');
    assert.equal(env.filesById.get('file_sala_001').getName(), 'SALA_MILAN_GRIS_ORIG.jpg', 'return_to_inbox must preserve original filename');

    // 4b) REGRESAR AL ARCHIVO ORIGEN when shared by 2 SKUs (SKU-COM-01 & SKU-COM-02):
    //     clears SKU-COM-01 Col D, puts original-named copy in SUBIR PREN, and leaves file_shared_003 intact for SKU-COM-02!
    const retShared = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'return_to_inbox',
      sku: 'SKU-COM-01',
      driveFileId: 'file_shared_003',
      source: 'LOADED'
    }, KEVIN_AUTH));
    assert.equal(retShared.ok, true, 'return_to_inbox on shared SKU photo must succeed');
    assert.equal(sh1._grid[3][3], '', 'SKU-COM-01 Col D must be cleared');
    assert.match(sh1._grid[4][3], /file_shared_003/, 'SKU-COM-02 Col D must remain intact');
    assert.ok(env.foldersById.get(IDS.FOTOS_COMEDORES)._state.fileIds.has('file_shared_003'), 'Shared file must remain in FOTOS COMEDORES for SKU-COM-02');
    assert.ok(retShared.file && env.foldersById.get(IDS.SUBIR_PREN)._state.fileIds.has(retShared.file.id), 'Returned copy must be placed in SUBIR PREN');
    assert.equal(retShared.file.name, 'COMEDOR_ALBA_COMPARTIDO.jpg', 'Returned copy must preserve original filename');

    // 5) ELIMINAR (delete): trashes file in Drive and clears SKU if unshared
    const delRes = postJson(env, Object.assign({
      action: 'fotos_photo_action',
      op: 'delete',
      driveFileId: 'file_inbox_001',
      source: 'INBOX'
    }, KEVIN_AUTH));
    assert.equal(delRes.ok, true, 'delete op must succeed');
    assert.equal(env.filesById.get('file_inbox_001').isTrashed(), true, 'delete op must trash file in Drive');
  }
});

test('Frontend Fotos UI: exposes Archivadas tab, removes hard 140/160 cap (progressive full list), mirrors Drive removals, and wires all 5 lifecycle actions', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const js = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');

  // 1) Archivadas tab & badge in fotos-productos.html alongside SUBIR PREN and Cargadas
  assert.match(html, /id="tabGalleryArchived"/, 'fotos-productos.html must render #tabGalleryArchived tab');
  assert.match(html, /id="archivedHeaderBadge"/, 'fotos-productos.html must render #archivedHeaderBadge');
  assert.ok(html.includes('./fotos-productos-app.js?v=40'), 'fotos-productos.html must preserve ./fotos-productos-app.js?v=40');

  // 2) No hard 140 / 160 slice truncation in fotos-productos-app.js
  assert.ok(!/visibleLoaded\.slice\(0,\s*140\)/.test(js), 'Must remove hard visibleLoaded.slice(0, 140) truncation');
  assert.ok(!/visibleInbox\.slice\(0,\s*160\)/.test(js), 'Must remove hard visibleInbox.slice(0, 160) truncation');
  assert.match(js, /loadMoreGalleryItems/, 'Must support progressive rendering to show 100% of items');

  // 3) Live Drive removal reconciliation + all 5 photo lifecycle actions exposed
  assert.match(js, /reconcileLiveDriveInventory/, 'Must reconcile local state against live Drive inventory so removed Drive files disappear from app');
  assert.match(js, /fotos_photo_action/, 'Frontend must invoke fotos_photo_action endpoint');
  assert.match(js, /return_to_inbox/, 'Frontend must wire Regresar al archivo origen (return_to_inbox)');
  assert.match(js, /unlink_sku/, 'Frontend must wire Quitar del producto (unlink_sku)');
  assert.match(js, /archivePhotoByContext|op:\s*'archive'/, 'Frontend must wire Archivar (archive)');
  assert.match(js, /copyPhotoInDrive|op:\s*'copy'/, 'Frontend must wire Copiar (copy)');
});
