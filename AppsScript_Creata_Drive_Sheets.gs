/**
 * ============================================================================
 * CREATA MUEBLES — AUTOMATIZACIÓN DRIVE -> GOOGLE SHEETS -> CATÁLOGO EN VIVO
 * ============================================================================
 * Este script:
 * - Respeta al 100% las fórmulas existentes en SALAS_MODULARES
 *   (=CALCULAR_MONTO_SKU($C$2:$C,$E$2:$E), =E*I, =SUM(...)) y en
 *   MUEBLES_INDIVIDUALES (=CALCULAR_PRECIO_SKU($B$2:$B)).
 * - Conecta CATALOGO_PRODUCTOS y PIEZAS_MODULOS con fórmulas en vivo (VLOOKUP / SUMIF)
 *   hacia MUEBLES_INDIVIDUALES y SALAS_MODULARES para nunca perder precios dinámicos.
 * - Crea las 5 columnas de inventario vacías (CEDIS, CASA CREATA, COLOSIO,
 *   PLAYA, PUERTO CANCUN) coloreadas en verde ÚNICAMENTE cuando hay existencia (> 0).
 * - Cuando entra una nueva ficha PDF a Drive:
 *   1) La agrega primero a MUEBLES_INDIVIDUALES (1 pieza) o SALAS_MODULARES (>1 pieza)
 *      dejando libre la columna de derrame para que tus fórmulas calculen el precio.
 *   2) La agrega automáticamente a CATALOGO_PRODUCTOS (y PIEZAS_MODULOS) conectada
 *      por fórmula para aparecer en el editor y publicarse en el catálogo.
 * ============================================================================
 */

const CONFIG = {
  SHEET_ID: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
  DRIVE_FOLDER_ID: '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT',
  PHOTOS_DRIVE_FOLDER_NAME: 'CREATA_FOTOS_CATALOGO_WEB',
  GITHUB_OWNER: 'ikerreyna3942-debug',
  GITHUB_REPO: 'MCP-REPOCITORIO',
  GITHUB_BRANCH: 'main',
  TAB_PRODUCTS: 'CATALOGO_PRODUCTOS',
  TAB_PIECES: 'PIEZAS_MODULOS',
  TAB_SALAS_SRC: 'SALAS_MODULARES',
  TAB_INDIV_SRC: 'MUEBLES_INDIVIDUALES',
  TAB_INVENTORY: 'INVENTARIO_EN_VIVO',
  INVENTORY_COLS: ['CEDIS', 'CASA CREATA', 'COLOSIO', 'PLAYA', 'PUERTO CANCUN'],
  IGNORED_DRIVE_IDS: [
    '1gieOXN5gEVWaDcO9NqbywzAot7tW3pxA',
    '1RoCQXw7kOsKo5N-uh7iZJMtJzSwt_kaY',
    '1NoCEV04yWI1CeQX78OtYXKDli9zYKRlG'
  ]
};

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('CREATA Catálogo')
      .addItem('1. Dejar Todo Listo (Fórmulas + Inventario Vacío, Sin Fotos)', 'dejarTodoListoSinFotos')
      .addItem('2. Sincronizar Fichas Nuevas (Drive + Hojas -> Catálogo)', 'syncDriveFolderToSheet')
      .addItem('3. Activar Automatización Cada 10 Minutos', 'installSyncTrigger')
      .addSeparator()
      .addItem('4. Crear / Actualizar Pestaña INVENTARIO_EN_VIVO', 'sincronizarPestanaInventarioEnVivo')
      .addItem('5. Sincronizar Stock S Mueblería + LPPT En Vivo (Ahora)', 'sincronizarInventarioEnVivoDesdeERP')
      .addItem('6. Activar Sincronización S Mueblería 24/7 (Cada 5 min)', 'instalarTriggerErpEnVivo')
      .addSeparator()
      .addItem('7. Organizar Cuentas, Contraseñas Temporales y Columna Descuento', 'organizarCuentasYDescuentosEnHojas')
      .addItem('8. Agregar / Actualizar Columna PRECIO DE LISTA (Cotizador)', 'agregarColumnaPrecioListaInventario')
      .addItem('9. Autocompletar Nuevos SKUs y Ordenar A-Z (INVENTARIO_EN_VIVO)', 'limpiarYCompletarInventarioEnVivo')
      .addItem('10. Crear / Verificar Hoja INVITADOS (Solo Ver · Máx. 2 Lugares)', 'crearVerificarHojaInvitados')
      .addToUi();
  } catch (e) {}
}

function getProp_(key) {
  return (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

function publishWebAppUrlToConfigSheet_(ss) {
  try {
    const webUrl = (ScriptApp.getService().getUrl() || '').trim();
    if (!webUrl || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(webUrl)) return;
    let cfg = ss.getSheetByName('_CREATA_CONFIG');
    if (!cfg) {
      cfg = ss.insertSheet('_CREATA_CONFIG');
      cfg.hideSheet();
    }
    cfg.getRange('A1:B2').setValues([
      ['CLAVE', 'VALOR'],
      ['WEBAPP_URL', webUrl]
    ]);
    if (!cfg.isSheetHidden()) cfg.hideSheet();
  } catch (e) {}
}

function buildPieceUnitPriceFormula_(zRowNum, fallbackPrice) {
  const fb = Number(fallbackPrice || 0);
  const vlookup = 'VLOOKUP(C' + zRowNum + ', ' + CONFIG.TAB_SALAS_SRC + '!$C:$I, 7, FALSE)';
  return '=IF(IFNA(N(' + vlookup + '), 0) > 0, ' + vlookup + ', ' + fb + ')';
}

function buildProductPriceFormula_(pRowNum, isMulti, fallbackPrice) {
  if (isMulti) {
    return '=SUMIF(' + CONFIG.TAB_PIECES + '!A:A, A' + pRowNum + ', ' + CONFIG.TAB_PIECES + '!J:J)';
  }
  const fb = Number(fallbackPrice || 0);
  const vlookup = 'VLOOKUP(TRIM(INDEX(SPLIT(D' + pRowNum + ', "/"), 1)), ' + CONFIG.TAB_INDIV_SRC + '!$B:$K, 10, FALSE)';
  return '=IF(IFNA(N(' + vlookup + '), 0) > 0, ' + vlookup + ', ' + fb + ')';
}

/**
 * Aplica las 5 columnas de inventario vacías (sin tocar columnas previas ni fórmulas)
 * y colorea en verde ÚNICAMENTE cuando hay existencia (> 0).
 */
function applyInventoryColumnsAndColor_(sh, startCol1Based, maxRows) {
  if (!sh) return;
  const invCols = CONFIG.INVENTORY_COLS;
  const endCol1Based = startCol1Based + invCols.length - 1;
  if (sh.getMaxColumns() < endCol1Based) {
    sh.insertColumnsAfter(sh.getMaxColumns(), endCol1Based - sh.getMaxColumns());
  }
  const safeRows = Math.max(maxRows, Math.max(sh.getLastRow(), 2));
  if (sh.getMaxRows() < safeRows + 1) {
    sh.insertRowsAfter(sh.getMaxRows(), safeRows + 1 - sh.getMaxRows());
  }

  sh.getRange(1, startCol1Based, 1, invCols.length)
    .setValues([invCols])
    .setFontWeight('bold')
    .setBackground('#14532D')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  const invRange = sh.getRange(2, startCol1Based, safeRows, invCols.length);
  invRange.setHorizontalAlignment('center').setNumberFormat('#,##0');

  for (let c = startCol1Based; c <= endCol1Based; c++) {
    sh.setColumnWidth(c, 128);
  }

  const existingRules = sh.getConditionalFormatRules().filter((r) => {
    const rngs = r.getRanges();
    return !rngs.some((rg) => rg.getColumn() === startCol1Based && rg.getNumColumns() === invCols.length);
  });
  const stockRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setBackground('#DCFCE7')
    .setFontColor('#166534')
    .setBold(true)
    .setRanges([invRange])
    .build();
  existingRules.unshift(stockRule);
  sh.setConditionalFormatRules(existingRules);
}

function setupSheetsStructure() {
  const ss = getSpreadsheet_();

  const prodHeaders = [
    'ID_INTERNO',
    'ESTADO',
    'PROVEEDOR',
    'SKU_INTERNO',
    'MODELO',
    'CATEGORIA',
    'MULTIPIEZA',
    'PIEZAS_RESUMEN',
    'ANCHO_CM',
    'FONDO_CM',
    'ALTO_CM',
    'ASIENTO_CM',
    'BULTOS',
    'CUBITAJE_M3',
    'PRECIO_LISTA',
    'MATERIALES_ACABADO',
    'URL_FICHA_DRIVE',
    'FOTO_PORTADA_URL',
    'FOTO_AMBIENTE_URL',
    'FOTO_ACABADO_URL',
    'FOTOS_VISTAS_JSON',
    'DRIVE_FILE_ID',
    'ULTIMA_ACTUALIZACION'
  ].concat(CONFIG.INVENTORY_COLS);

  let shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  if (!shProd) {
    shProd = ss.insertSheet(CONFIG.TAB_PRODUCTS);
  }
  if (shProd.getMaxColumns() < prodHeaders.length) {
    shProd.insertColumnsAfter(shProd.getMaxColumns(), prodHeaders.length - shProd.getMaxColumns());
  }
  shProd.getRange(1, 1, 1, 23)
    .setValues([prodHeaders.slice(0, 23)])
    .setFontWeight('bold')
    .setBackground('#1F2429')
    .setFontColor('#FFFFFF');
  shProd.setFrozenRows(1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ARCHIVADO', 'VISIBLE'], true)
    .build();
  shProd.getRange('B2:B500').setDataValidation(rule);
  applyInventoryColumnsAndColor_(shProd, 24, 500);

  const pieceHeaders = [
    'ID_PADRE',
    'MODELO_PADRE',
    'SKU_PIEZA',
    'NOMBRE_PIEZA',
    'CANTIDAD',
    'ANCHO_CM',
    'FONDO_CM',
    'ALTO_CM',
    'PRECIO_UNITARIO',
    'SUBTOTAL_PIEZA'
  ].concat(CONFIG.INVENTORY_COLS);

  let shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  if (!shPiece) {
    shPiece = ss.insertSheet(CONFIG.TAB_PIECES);
  }
  if (shPiece.getMaxColumns() < pieceHeaders.length) {
    shPiece.insertColumnsAfter(shPiece.getMaxColumns(), pieceHeaders.length - shPiece.getMaxColumns());
  }
  shPiece.getRange(1, 1, 1, 10)
    .setValues([pieceHeaders.slice(0, 10)])
    .setFontWeight('bold')
    .setBackground('#B8893E')
    .setFontColor('#FFFFFF');
  shPiece.setFrozenRows(1);
  applyInventoryColumnsAndColor_(shPiece, 11, 500);

  // Agregar únicamente las 5 columnas de inventario (O..S) en SALAS_MODULARES y MUEBLES_INDIVIDUALES
  // SIN TOCAR las columnas A..N ni sus fórmulas (=CALCULAR_MONTO_SKU y =CALCULAR_PRECIO_SKU)
  const shSalas = ss.getSheetByName(CONFIG.TAB_SALAS_SRC);
  if (shSalas) applyInventoryColumnsAndColor_(shSalas, 15, 300);
  const shIndiv = ss.getSheetByName(CONFIG.TAB_INDIV_SRC);
  if (shIndiv) applyInventoryColumnsAndColor_(shIndiv, 15, 300);

  publishWebAppUrlToConfigSheet_(ss);
  return { ok: true };
}

function ensureAutoSyncTrigger_() {
  try {
    const existing = ScriptApp.getProjectTriggers();
    const hasTrigger = existing.some((t) => t.getHandlerFunction() === 'syncDriveFolderToSheet');
    if (!hasTrigger) {
      ScriptApp.newTrigger('syncDriveFolderToSheet')
        .timeBased()
        .everyMinutes(10)
        .create();
    }
    return true;
  } catch (e) {
    return false;
  }
}

function installSyncTrigger() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach((t) => {
    if (t.getHandlerFunction() === 'syncDriveFolderToSheet') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('syncDriveFolderToSheet')
    .timeBased()
    .everyMinutes(10)
    .create();
  try {
    SpreadsheetApp.getUi().alert('Sincronización automática activada cada 10 minutos.');
  } catch (e) {}
  return { ok: true };
}

function setDriveLinkCell_(sheet, row1Based, col1Based, labelText, url) {
  if (!url) {
    sheet.getRange(row1Based, col1Based).setValue(labelText || '');
    return;
  }
  try {
    const rich = SpreadsheetApp.newRichTextValue()
      .setText(labelText || url)
      .setLinkUrl(url)
      .build();
    sheet.getRange(row1Based, col1Based).setRichTextValue(rich);
  } catch (e) {
    sheet.getRange(row1Based, col1Based).setFormula('=HYPERLINK("' + url.replace(/"/g, '""') + '", "' + String(labelText || 'Ver ficha PDF').replace(/"/g, '""') + '")');
  }
}

/**
 * Encuentra la última fila con datos reales en columnas A..N (ignorando celdas vacías de inventario)
 */
function getLastContentRow_(sh, checkCols) {
  if (!sh) return 1;
  const last = sh.getLastRow();
  if (last <= 1) return 1;
  const vals = sh.getRange(1, 1, last, checkCols).getValues();
  for (let r = vals.length - 1; r >= 1; r--) {
    if (vals[r].some((cell) => String(cell === null || cell === undefined ? '' : cell).trim() !== '')) {
      return r + 1;
    }
  }
  return 1;
}

/**
 * Sincroniza cualquier fila agregada manualmente en SALAS_MODULARES o MUEBLES_INDIVIDUALES
 * hacia CATALOGO_PRODUCTOS y PIEZAS_MODULOS usando fórmulas en vivo (sin sobrescribir lo existente).
 */
function syncDocumentTabsToCatalog_(ss) {
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  const shSalas = ss.getSheetByName(CONFIG.TAB_SALAS_SRC);
  const shIndiv = ss.getSheetByName(CONFIG.TAB_INDIV_SRC);
  if (!shProd || !shPiece) return 0;

  const pVals = shProd.getDataRange().getValues();
  const zVals = shPiece.getDataRange().getValues();
  const knownIds = new Set();
  const knownSkus = new Set();
  const knownPieceSkus = new Set();
  for (let i = 1; i < pVals.length; i++) {
    const pid = String(pVals[i][0] || '').trim().toUpperCase();
    const skuCell = String(pVals[i][3] || '').trim().toUpperCase();
    if (pid) knownIds.add(pid);
    if (skuCell) {
      skuCell.split('/').forEach((s) => {
        if (s.trim()) knownSkus.add(s.trim());
      });
    }
  }
  for (let i = 1; i < zVals.length; i++) {
    const zSku = String(zVals[i][2] || '').trim().toUpperCase();
    if (zSku) knownPieceSkus.add(zSku);
  }

  let synced = 0;
  const nowIso = new Date().toISOString();

  // 1) Revisar SALAS_MODULARES (desde fila 3 para respetar fila 2 de fórmula =CALCULAR_MONTO_SKU)
  if (shSalas && shSalas.getLastRow() >= 3) {
    const sVals = shSalas.getRange(1, 1, shSalas.getLastRow(), 14).getValues();
    const sRich = shSalas.getRange(1, 14, shSalas.getLastRow(), 1).getRichTextValues();
    let curPieces = [];
    for (let r = 2; r < sVals.length; r++) {
      const row = sVals[r];
      const sid = String(row[0] || '').trim();
      if (!sid) continue;
      const sname = scrubPublicText_(String(row[1] || ''));
      const psku = String(row[2] || '').trim().toUpperCase();
      const pname = scrubPublicText_(String(row[3] || ''));
      const qty = Number(row[4] || 0);
      const showFlag = String(row[12] || '').trim().toUpperCase();
      const furl = getRichUrl_(sRich[r][0], row[13]);

      if (showFlag.indexOf('SÍ') >= 0 || showFlag.indexOf('SI') >= 0 || psku.indexOf('-TOTAL') > 0) {
        const alreadyHasPieces = curPieces.some((pz) => pz.sku && knownPieceSkus.has(pz.sku.toUpperCase()));
        if (!alreadyHasPieces && !knownIds.has(sid.toUpperCase()) && !knownSkus.has((sid + '-SET').toUpperCase())) {
          curPieces.forEach((pz) => {
            if (pz.sku) knownPieceSkus.add(pz.sku.toUpperCase());
            const zRow = shPiece.getLastRow() + 1;
            shPiece.appendRow([
              sid, sname, pz.sku, pz.name, pz.qty, pz.width, pz.depth, pz.height,
              buildPieceUnitPriceFormula_(zRow, pz.fallbackPrice),
              '=E' + zRow + '*I' + zRow,
              '', '', '', '', ''
            ]);
          });
          const pRow = shProd.getLastRow() + 1;
          const activeP = curPieces.filter((x) => x.qty > 0);
          const totalQty = activeP.reduce((acc, x) => acc + (Number(x.qty) || 1), 0) || curPieces.length;
          const allPieceSkus = curPieces.map((x) => x.sku).filter(Boolean).join(' / ') || (sid + '-SET');
          shProd.appendRow([
            sid, 'ARCHIVADO', 'ARM', allPieceSkus, sname, 'SALAS & SOFÁS', 'SI',
            curPieces.length + ' SKUs: ' + curPieces.map((x) => x.sku + ' (' + x.qty + ')').join(' + '),
            curPieces.map((x) => x.width).filter(Boolean).join(' / '),
            (curPieces[0] && curPieces[0].depth) || '',
            (curPieces[0] && curPieces[0].height) || '',
            '',
            String(totalQty),
            '',
            buildProductPriceFormula_(pRow, true, 0),
            String(row[11] || '').trim(),
            furl,
            '', '', '', '[]',
            extractDriveIdFromUrl_(furl),
            nowIso,
            '', '', '', '', ''
          ]);
          knownIds.add(sid.toUpperCase());
          synced++;
        }
        curPieces = [];
      } else {
        curPieces.push({
          sku: psku,
          name: pname,
          qty: isNaN(qty) ? 1 : qty,
          width: String(row[5] || '').trim(),
          depth: String(row[6] || '').trim(),
          height: String(row[7] || '').trim(),
          fallbackPrice: parseMoney_(row[8])
        });
      }
    }
  }

  // 2) Revisar MUEBLES_INDIVIDUALES (desde fila 3 para respetar fila 2 de fórmula =CALCULAR_PRECIO_SKU)
  if (shIndiv && shIndiv.getLastRow() >= 3) {
    const iVals = shIndiv.getRange(1, 1, shIndiv.getLastRow(), 14).getValues();
    const iRich = shIndiv.getRange(1, 14, shIndiv.getLastRow(), 1).getRichTextValues();
    for (let r = 2; r < iVals.length; r++) {
      const row = iVals[r];
      const sku = String(row[1] || '').trim().toUpperCase();
      if (!sku) continue;
      if (knownSkus.has(sku) || knownIds.has(sku) || knownIds.has('IND-' + sku)) continue;

      const furl = getRichUrl_(iRich[r][0], row[13]);
      const pid = 'IND-' + sku;
      const pRow = shProd.getLastRow() + 1;
      shProd.appendRow([
        pid,
        'ARCHIVADO',
        String(row[0] || 'CREATA').trim(),
        sku,
        scrubPublicText_(String(row[2] || '')),
        normalizeCategory_(String(row[3] || '')),
        'NO',
        '1 pieza',
        String(row[4] || '').trim(),
        String(row[5] || '').trim(),
        String(row[6] || '').trim(),
        String(row[7] || '').trim(),
        String(row[9] || '1').trim(),
        String(row[8] || '').trim(),
        buildProductPriceFormula_(pRow, false, parseMoney_(row[10])),
        scrubPublicText_(String(row[11] || '')),
        furl,
        '', '', '', '[]',
        extractDriveIdFromUrl_(furl),
        nowIso,
        '', '', '', '', ''
      ]);
      knownIds.add(pid);
      knownSkus.add(sku);
      synced++;
    }
  }

  return synced;
}

/**
 * Escanea recursivamente la carpeta de Drive:
 * 1) Si CATALOGO_PRODUCTOS aún está vacío, inicializa automáticamente todo el catálogo + inventario vacío.
 * 2) Si encuentra un PDF nuevo en Drive, lo agrega PRIMERO a MUEBLES_INDIVIDUALES o SALAS_MODULARES
 *    respetando al 100% las fórmulas de derrame (=CALCULAR_PRECIO_SKU y =CALCULAR_MONTO_SKU)
 *    y DESPUÉS lo agrega a CATALOGO_PRODUCTOS (y PIEZAS_MODULOS) conectado por fórmula.
 * 3) También sincroniza cualquier fila nueva agregada directamente en el documento.
 */
function syncDriveFolderToSheet() {
  const ss = getSpreadsheet_();
  let shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  if (!shProd || shProd.getLastRow() <= 1) {
    dejarTodoListoSinFotos({ silentUi: true });
    shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  } else {
    setupSheetsStructure();
  }

  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  const shSalas = ss.getSheetByName(CONFIG.TAB_SALAS_SRC);
  const shIndiv = ss.getSheetByName(CONFIG.TAB_INDIV_SRC);

  // Recolectar todos los Drive File IDs ya registrados en cualquiera de las pestañas
  const knownFileIds = new Set(CONFIG.IGNORED_DRIVE_IDS || []);
  const existingRows = shProd.getDataRange().getValues();
  for (let i = 1; i < existingRows.length; i++) {
    const fIdRaw = String(existingRows[i][21] || '').trim();
    if (fIdRaw) {
      fIdRaw.split(',').forEach((part) => {
        if (part.trim()) knownFileIds.add(part.trim());
      });
    }
    const dId = extractDriveIdFromUrl_(existingRows[i][16]);
    if (dId) knownFileIds.add(dId);
  }
  [shSalas, shIndiv].forEach((srcSh) => {
    if (srcSh && srcSh.getLastRow() >= 3) {
      const richCol = srcSh.getRange(1, 14, srcSh.getLastRow(), 1).getRichTextValues();
      const valCol = srcSh.getRange(1, 14, srcSh.getLastRow(), 1).getValues();
      for (let r = 2; r < richCol.length; r++) {
        const u = getRichUrl_(richCol[r][0], valCol[r][0]);
        const id = extractDriveIdFromUrl_(u);
        if (id) knownFileIds.add(id);
      }
    }
  });

  const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const files = collectPdfFilesRecursive_(rootFolder, '');
  const geminiKey = getProp_('GEMINI_API_KEY');

  let addedCount = 0;
  files.forEach((entry) => {
    const file = entry.file;
    const fileId = file.getId();
    if (knownFileIds.has(fileId)) return;

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {}

    const pdfName = file.getName();
    const driveUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    const baseName = pdfName.replace(/\.pdf$/i, '').trim();
    const provHint = (entry.folderPath.split('/')[0] || 'CREATA').toUpperCase().slice(0, 6);

    let parsed = null;
    if (geminiKey) {
      parsed = extractFichaWithGemini_(file, geminiKey, provHint);
    }

    const modelName = scrubPublicText_((parsed && parsed.modelo ? parsed.modelo : baseName).toUpperCase());
    const provider = String((parsed && parsed.proveedor) ? parsed.proveedor : provHint).toUpperCase().trim();
    const skuInternal = String((parsed && parsed.sku) ? parsed.sku : (provider + '-' + fileId.slice(0, 6))).toUpperCase().trim();
    const category = normalizeCategory_(parsed && parsed.categoria);
    const pieces = (parsed && Array.isArray(parsed.piezas)) ? parsed.piezas : [];
    const isMulti = pieces.length > 1;
    const fallbackTotal = (parsed && parsed.precio_total) ? Number(parsed.precio_total) : 0;

    // PASO 1: Agregar PRIMERO a las pestañas maestras del documento sin romper fórmulas de derrame
    let itemId = 'IND-' + skuInternal;
    if (isMulti && shSalas) {
      const slug = modelName.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18);
      itemId = slug.indexOf('SALA-') === 0 ? slug : ('SALA-' + slug);

      let nextSalaRow = getLastContentRow_(shSalas, 14) + 1;
      if (nextSalaRow > 3) {
        // Fila separadora en blanco para mantener el formato limpio de SALAS_MODULARES
        nextSalaRow += 1;
      }
      const firstPieceRow = nextSalaRow;
      pieces.forEach((pz, idx) => {
        const rNum = firstPieceRow + idx;
        const pSku = String(pz.sku_pieza || (skuInternal + '-P' + (idx + 1))).toUpperCase().trim();
        const pName = scrubPublicText_(String(pz.nombre || ('Pieza ' + (idx + 1))));
        const pQty = Number(pz.cantidad === undefined ? 1 : pz.cantidad);
        if (shSalas.getMaxRows() < rNum + 3) {
          shSalas.insertRowsAfter(shSalas.getMaxRows(), rNum + 5 - shSalas.getMaxRows());
        }
        // Columna I (índice 9, PRECIO UNITARIO) va VACÍA '' para que =CALCULAR_MONTO_SKU($C$2:$C,$E$2:$E) derrame sola
        shSalas.getRange(rNum, 1, 1, 13).setValues([[
          itemId,
          modelName,
          pSku,
          pName,
          isNaN(pQty) ? 1 : pQty,
          String(pz.ancho_cm || ''),
          String(pz.fondo_cm || ''),
          String(pz.alto_cm || ''),
          '',
          '=E' + rNum + '*I' + rNum,
          '',
          '',
          'NO (PIEZA)'
        ]]);
        setDriveLinkCell_(shSalas, rNum, 14, pdfName, driveUrl);
      });

      const lastPieceRow = firstPieceRow + pieces.length - 1;
      const totalRow = lastPieceRow + 1;
      const dimsSummary = [
        (parsed && parsed.ancho_cm) ? parsed.ancho_cm : '',
        (parsed && parsed.fondo_cm) ? parsed.fondo_cm : '',
        (parsed && parsed.alto_cm) ? parsed.alto_cm : ''
      ].filter(Boolean).join(' × ');

      shSalas.getRange(totalRow, 1, 1, 13).setValues([[
        itemId,
        modelName,
        itemId + '-TOTAL',
        'TOTAL SALA (' + modelName + ')',
        '=SUM(E' + firstPieceRow + ':E' + lastPieceRow + ')',
        '',
        '',
        '',
        '',
        '',
        '=SUM(J' + firstPieceRow + ':J' + lastPieceRow + ')',
        dimsSummary ? (dimsSummary + ' cm') : '',
        'SÍ (TOTAL)'
      ]]);
      setDriveLinkCell_(shSalas, totalRow, 14, pdfName, driveUrl);
    } else if (!isMulti && shIndiv) {
      const nextIndivRow = Math.max(3, getLastContentRow_(shIndiv, 14) + 1);
      if (shIndiv.getMaxRows() < nextIndivRow + 2) {
        shIndiv.insertRowsAfter(shIndiv.getMaxRows(), nextIndivRow + 5 - shIndiv.getMaxRows());
      }
      // Columna K (índice 11, PRECIO DE LISTA) va VACÍA '' para que =CALCULAR_PRECIO_SKU($B$2:$B) derrame sola
      shIndiv.getRange(nextIndivRow, 1, 1, 13).setValues([[
        provider,
        skuInternal,
        modelName,
        category,
        String((parsed && parsed.ancho_cm) || ''),
        String((parsed && parsed.fondo_cm) || ''),
        String((parsed && parsed.alto_cm) || ''),
        String((parsed && parsed.asiento_cm) || ''),
        String((parsed && parsed.cubitaje_m3) || ''),
        String((parsed && parsed.bultos) || '1 bulto'),
        '',
        scrubPublicText_(String((parsed && parsed.materiales) || '')),
        pdfName
      ]]);
      setDriveLinkCell_(shIndiv, nextIndivRow, 14, pdfName, driveUrl);
    }

    // PASO 2: Agregar a PIEZAS_MODULOS y CATALOGO_PRODUCTOS conectado con fórmulas en vivo
    if (isMulti) {
      pieces.forEach((pz, idx) => {
        const pieceRowNum = shPiece.getLastRow() + 1;
        const pSku = String(pz.sku_pieza || (skuInternal + '-P' + (idx + 1))).toUpperCase().trim();
        const fbUnit = Number(pz.precio_unitario || 0);
        shPiece.appendRow([
          itemId,
          modelName,
          pSku,
          scrubPublicText_(String(pz.nombre || ('Pieza ' + (idx + 1)))),
          Number(pz.cantidad === undefined ? 1 : pz.cantidad),
          String(pz.ancho_cm || ''),
          String(pz.fondo_cm || ''),
          String(pz.alto_cm || ''),
          buildPieceUnitPriceFormula_(pieceRowNum, fbUnit),
          '=E' + pieceRowNum + '*I' + pieceRowNum,
          '', '', '', '', ''
        ]);
      });
    }

    const rowIdx = shProd.getLastRow() + 1;
    const priceFormula = buildProductPriceFormula_(rowIdx, isMulti, fallbackTotal);
    const allMultiSkus = isMulti
      ? pieces.map((pz, idx) => String(pz.sku_pieza || (skuInternal + '-P' + (idx + 1))).toUpperCase().trim()).filter(Boolean).join(' / ')
      : skuInternal;
    const piecesSummary = isMulti
      ? (pieces.length + ' SKUs: ' + pieces.map((pz, idx) => String(pz.sku_pieza || (skuInternal + '-P' + (idx + 1))).toUpperCase().trim() + ' (' + Number(pz.cantidad === undefined ? 1 : pz.cantidad) + ')').join(' + '))
      : '1 pieza';

    shProd.appendRow([
      itemId,
      'ARCHIVADO',
      provider,
      allMultiSkus,
      modelName,
      category,
      isMulti ? 'SI' : 'NO',
      piecesSummary,
      String((parsed && parsed.ancho_cm) || ''),
      String((parsed && parsed.fondo_cm) || ''),
      String((parsed && parsed.alto_cm) || ''),
      String((parsed && parsed.asiento_cm) || ''),
      String((parsed && parsed.bultos) || (isMulti ? pieces.length + ' bultos' : '1 bulto')),
      String((parsed && parsed.cubitaje_m3) || ''),
      priceFormula,
      scrubPublicText_(String((parsed && parsed.materiales) || '')),
      driveUrl,
      '',
      '',
      '',
      '[]',
      fileId,
      new Date().toISOString(),
      '', '', '', '', ''
    ]);
    shProd.getRange(rowIdx, 15).setNumberFormat('$#,##0.00');

    knownFileIds.add(fileId);
    addedCount++;
  });

  // PASO 3: Sincronizar cualquier renglón que se haya agregado directo en las hojas maestras
  const syncedFromTabs = syncDocumentTabsToCatalog_(ss);
  publishWebAppUrlToConfigSheet_(ss);

  return { ok: true, scanned: files.length, addedFromDrive: addedCount, syncedFromSheet: syncedFromTabs };
}

function collectPdfFilesRecursive_(folder, prefix) {
  const results = [];
  const fileIt = folder.getFiles();
  while (fileIt.hasNext()) {
    const f = fileIt.next();
    const name = f.getName();
    if (/\.pdf$/i.test(name) || f.getMimeType() === 'application/pdf') {
      results.push({ file: f, folderPath: prefix });
    }
  }
  const subIt = folder.getFolders();
  while (subIt.hasNext()) {
    const sub = subIt.next();
    if (sub.getName() === CONFIG.PHOTOS_DRIVE_FOLDER_NAME) continue;
    const nextPrefix = prefix ? (prefix + '/' + sub.getName()) : sub.getName();
    results.push.apply(results, collectPdfFilesRecursive_(sub, nextPrefix));
  }
  return results;
}

function extractFichaWithGemini_(file, apiKey, provHint) {
  try {
    const blob = file.getBlob();
    if (blob.getBytes().length > 14 * 1024 * 1024) return null;
    const b64 = Utilities.base64Encode(blob.getBytes());

    const promptText = [
      'Extrae únicamente los datos visibles en esta ficha técnica de mueble (NO inventes textos ni descripciones).',
      'Si el mueble o sala tiene MÁS DE 1 PIEZA o módulo (ej. Sofá 3P + Love Seat 2P, Módulo Izquierdo + Derecho + Chaise, Comedor + Sillas, Cama + Burós), lista cada pieza en el arreglo "piezas" con sus medidas y precio individual si aparece.',
      'No uses frases como "JUEGO COMPLETO (SOFÁ 3P + LOVE SEAT 2P)" ni "Sin descripción".',
      'Proveedor sugerido por carpeta: ' + provHint,
      'Devuelve JSON estricto con esta estructura:',
      '{"proveedor":"","sku":"","modelo":"","categoria":"SALAS & SOFÁS|SILLAS & SILLONES|COMEDORES|BUFETERAS & CREDENZAS|MESAS DE CENTRO|RECÁMARAS|COMPLEMENTOS","ancho_cm":"","fondo_cm":"","alto_cm":"","asiento_cm":"","bultos":"","cubitaje_m3":"","precio_total":0,"materiales":"","piezas":[{"nombre":"","sku_pieza":"","cantidad":1,"ancho_cm":"","fondo_cm":"","alto_cm":"","precio_unitario":0}]}'
    ].join('\n');

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: 'application/pdf', data: b64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) return null;
    const json = JSON.parse(resp.getContentText());
    const text = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0].text;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    Logger.log('Gemini PDF parse err: ' + err);
    return null;
  }
}

function normalizeCategory_(cat) {
  const c = String(cat || '').toUpperCase();
  if (c.includes('SALA') || c.includes('SOF')) return 'SALAS & SOFÁS';
  if (c.includes('SILLA') || c.includes('SILL')) return 'SILLAS & SILLONES';
  if (c.includes('COMEDOR') || c.includes('COMED')) return 'COMEDORES';
  if (c.includes('BUFET') || c.includes('CREDEN')) return 'BUFETERAS & CREDENZAS';
  if (c.includes('CENTRO') || c.includes('LATERAL')) return 'MESAS DE CENTRO & LATERALES';
  if (c.includes('REC') || c.includes('CAMA') || c.includes('BUR') || c.includes('CÓMODA') || c.includes('COMODA') || c.includes('CAJONERA')) return 'RECÁMARAS';
  return 'COMPLEMENTOS';
}

function formatMoney_(num) {
  const n = Number(num || 0);
  if (!isFinite(n) || n <= 0) return '';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Endpoint GET: lectura en vivo + inicialización automática en cuanto el Sheet tenga permiso de edición
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const mode = (e && e.parameter && e.parameter.mode) || 'public';
  const reqPin = (e && e.parameter && e.parameter.pin) || '';
  const adminPin = getProp_('ADMIN_PIN');

  if (action === 'init_now') {
    try {
      const initRes = dejarTodoListoSinFotos({ silentUi: true });
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'init_now', result: initRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_now') {
    try {
      const syncRes = syncDriveFolderToSheet();
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'sync_now', result: syncRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_inventory_tab') {
    try {
      const invRes = sincronizarPestanaInventarioEnVivo({ silentUi: true });
      return jsonResponse_({ ok: true, action: 'sync_inventory_tab', result: invRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'cm_inventory') {
    try {
      ensureLiveErpSyncTrigger_();
      const ss = getSpreadsheet_();
      let shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
      if (!shInv || shInv.getLastRow() <= 1) {
        sincronizarPestanaInventarioEnVivo({ silentUi: true });
        shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
      }
      autocompletarYOrdenarInventarioEnVivo_(ss, { silentUi: true, useThrottle: true });
      asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });
      try { ensureInvitadosSheet_(ss); } catch (eInvSh) {}
      const rawRows = shInv ? shInv.getDataRange().getValues() : [];
      const rows = rawRows.filter((r, idx) => idx === 0 || String((r && r[0]) || '').trim() !== '');
      return jsonResponse_({ ok: true, tab: CONFIG.TAB_INVENTORY, rows: rows });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_ensure_invitados') {
    try {
      const shGuest = ensureInvitadosSheet_(getSpreadsheet_());
      return jsonResponse_({ ok: true, action: 'inv_ensure_invitados', sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_ensure_precio_lista') {
    try {
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_ensure_precio_lista' }, resCol));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_erp_sync_now') {
    try {
      const resSync = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_erp_sync_now' }, resSync));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_autocomplete_sort') {
    try {
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_autocomplete_sort' }, resAuto));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_users_directory') {
    try {
      return jsonResponse_(handleInvUsersDirectory_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_plantilla_status') {
    try {
      return jsonResponse_(handleInvPlantillaStatus_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_top_searched') {
    try {
      return jsonResponse_(handleInvTopSearched_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (mode === 'admin' && adminPin && reqPin !== adminPin) {
    return jsonResponse_({ ok: false, error: 'PIN de administrador inválido' });
  }

  try {
    const ss = getSpreadsheet_();
    publishWebAppUrlToConfigSheet_(ss);
    try { ensureInvitadosSheet_(ss); } catch (eInvInit) {}
    const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
    if (!shProd || shProd.getLastRow() <= 1) {
      try {
        dejarTodoListoSinFotos({ silentUi: true });
        ensureAutoSyncTrigger_();
      } catch (autoErr) {}
    }
  } catch (err) {}

  const includePrivate = (mode === 'admin');
  const products = readAllCatalogRows_(includePrivate);
  return jsonResponse_({
    ok: true,
    mode: mode,
    updatedAt: new Date().toISOString(),
    products: products
  });
}

/**
 * Endpoint POST para admin.html e inventario.html (usuarios y plantilla de cotización)
 */
function doPost(e) {
  let parsedAction = '';
  let parsedBody = {};
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    parsedBody = body || {};
    const action = body.action || '';
    parsedAction = action;

    // Acciones públicas exclusivas de inventario.html y seguimiento.html (autenticación de asesores, cotización en vivo S Mueblería y seguimiento)
    if (action === 'inv_log_event') {
      return jsonResponse_(handleInvLogEvent_(body));
    }
    if (action === 'seg_action') {
      return jsonResponse_(handleSegAction_(body));
    }
    if (action === 'seg_sync_now') {
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_login') {
      return jsonResponse_(handleInvLogin_(body));
    }
    if (action === 'inv_guest_heartbeat') {
      return jsonResponse_(handleInvGuestHeartbeat_(body));
    }
    if (action === 'inv_ensure_invitados') {
      const shGuest = ensureInvitadosSheet_(getSpreadsheet_());
      return jsonResponse_({ ok: true, sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    }
    if (action === 'inv_update_key') {
      return jsonResponse_(handleInvUpdateKey_(body));
    }
    if (action === 'inv_submit_quote') {
      return jsonResponse_(handleInvSubmitQuote_(body));
    }
    if (action === 'inv_my_quotes') {
      return jsonResponse_(handleInvMyQuotes_(body));
    }
    if (action === 'inv_download_erp_quote_pdf') {
      return jsonResponse_(handleInvDownloadErpQuotePdf_(body));
    }
    if (action === 'inv_search_erp_clients') {
      return jsonResponse_(handleInvSearchErpClients_(body));
    }
    if (action === 'inv_create_erp_client') {
      return jsonResponse_(handleInvCreateErpClient_(body));
    }
    if (action === 'inv_upload_product_photo') {
      return jsonResponse_(handleInvUploadProductPhoto_(body));
    }
    if (action === 'inv_plantilla_status') {
      return jsonResponse_(handleInvPlantillaStatus_());
    }
    if (action === 'inv_record_search') {
      return jsonResponse_(handleInvRecordSearch_(body));
    }
    if (action === 'inv_top_searched') {
      return jsonResponse_(handleInvTopSearched_());
    }
    if (action === 'inv_ensure_precio_lista') {
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true }, resCol));
    }
    if (action === 'inv_erp_sync_now') {
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_autocomplete_sort') {
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true }, resAuto));
    }
    if (action === 'fotos_subir_list') {
      return jsonResponse_(handleFotosSubirList_(body));
    }
    if (action === 'fotos_subir_upload_inbox') {
      return jsonResponse_(handleFotosSubirUploadInbox_(body));
    }
    if (action === 'fotos_subir_assign') {
      return jsonResponse_(handleFotosSubirAssign_(body));
    }
    if (action === 'fotos_delete' || action === 'fotos_subir_delete') {
      return jsonResponse_(handleFotosDelete_(body));
    }
    if (action === 'fotos_sync_skus') {
      return jsonResponse_(handleFotosSyncSkus_(body));
    }
    if (action === 'inv_setup_accounts') {
      const adminPinCfg = getProp_('ADMIN_PIN');
      const hasValidPin = !!(adminPinCfg && String(body.pin || '') === adminPinCfg);
      if (!hasValidPin) {
        const ssChk = getSpreadsheet_();
        const erpMetaChk = readErpAdvisorsFromPlantilla_(ssChk);
        const authChk = resolveAuthenticatedAdvisor_(ssChk, erpMetaChk.advisors, body);
        if (!authChk.ok || !authChk.advisor || !authChk.advisor.isAdmin) {
          return jsonResponse_({ ok: false, error: 'Solo los administradores autorizados pueden reorganizar las cuentas.' });
        }
      }
      return jsonResponse_(organizarCuentasYDescuentosEnHojas({ silentUi: true }));
    }

    const adminPin = getProp_('ADMIN_PIN');
    if (adminPin && String(body.pin || '') !== adminPin) {
      return jsonResponse_({ ok: false, error: 'PIN de administrador incorrecto' });
    }

    if (action === 'upload_photo') {
      return jsonResponse_(handleUploadPhoto_(body));
    }
    if (action === 'save_product') {
      return jsonResponse_(handleSaveProduct_(body.product));
    }
    if (action === 'toggle_archive') {
      return jsonResponse_(handleToggleArchive_(body.productId, !!body.archived));
    }
    if (action === 'delete_product') {
      return jsonResponse_(handleDeleteProduct_(body.productId));
    }
    if (action === 'sync_drive') {
      return jsonResponse_(syncDriveFolderToSheet());
    }
    if (action === 'init_all') {
      return jsonResponse_(dejarTodoListoSinFotos({ silentUi: true }));
    }
    if (action === 'bulk_seed') {
      return jsonResponse_(handleBulkSeed_(body.products));
    }
    return jsonResponse_({ ok: false, error: 'Acción no reconocida: ' + action });
  } catch (err) {
    if (parsedAction !== 'inv_log_event') {
      try {
        registrarEventoHistorial_(getSpreadsheet_(), {
          clasificacion: 'FALLO DE CÓDIGO',
          modulo: 'AppsScript · doPost (' + (parsedAction || 'sin_action') + ')',
          evento: 'EXCEPCIÓN NO CONTROLADA EN ENDPOINT POST',
          estado: '❌ ERROR',
          usuario: String((parsedBody && (parsedBody.advisorEmail || parsedBody.email)) || 'WebApp'),
          sucursal: String((parsedBody && (parsedBody.erpStore || parsedBody.sheetTab)) || ''),
          referencia: parsedAction || 'doPost',
          detalle: (err && err.message) ? err.message : String(err),
          analisis: analizarCausaFalloCodigo_(err, 'AppsScript · doPost', parsedAction)
        });
      } catch (eHistIgnore) {}
    }
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function readAllCatalogRows_(includePrivate) {
  const ss = getSpreadsheet_();
  let shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  let shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  if (!shProd || !shPiece) {
    setupSheetsStructure();
    shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
    shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  }

  const pRows = shProd.getDataRange().getValues();
  const zRows = shPiece.getDataRange().getValues();

  const piecesByParent = {};
  for (let i = 1; i < zRows.length; i++) {
    const r = zRows[i];
    const parentId = String(r[0] || '').trim();
    if (!parentId) continue;
    if (!piecesByParent[parentId]) piecesByParent[parentId] = [];
    const rawQty = r[4];
    const parsedQty = (rawQty === '' || rawQty === null || rawQty === undefined) ? 1 : Number(rawQty);
    const qtyNum = isNaN(parsedQty) ? 1 : parsedQty;
    const pObj = {
      name: String(r[3] || ''),
      qty: qtyNum,
      width: String(r[5] || ''),
      depth: String(r[6] || ''),
      height: String(r[7] || ''),
      price: parseMoney_(r[8]),
      checked: qtyNum > 0
    };
    if (includePrivate) {
      pObj.sku = String(r[2] || '');
      pObj.inventory = {
        cedis: r[10] || '',
        casa_creata: r[11] || '',
        colosio: r[12] || '',
        playa: r[13] || '',
        puerto_cancun: r[14] || ''
      };
    }
    piecesByParent[parentId].push(pObj);
  }

  const list = [];
  for (let i = 1; i < pRows.length; i++) {
    const r = pRows[i];
    const id = String(r[0] || '').trim();
    if (!id) continue;
    const estado = String(r[1] || 'ARCHIVADO').trim().toUpperCase();
    const isArchived = (estado !== 'VISIBLE');

    if (!includePrivate && isArchived) continue;

    let views = [];
    try {
      views = JSON.parse(String(r[20] || '[]'));
      if (!Array.isArray(views)) views = [];
    } catch (e) { views = []; }

    const heroUrl = String(r[17] || '').trim();
    const ambUrl = String(r[18] || '').trim();
    const finUrl = String(r[19] || '').trim();
    const numPrice = parseMoney_(r[14]);
    const priceFormatted = numPrice > 0 ? formatMoney_(numPrice) : String(r[14] || '');
    const mods = piecesByParent[id] || [];

    const rawMetaCell = String(r[21] || '').trim();
    let unpackedDriveId = rawMetaCell;
    let savedMetaVars = null;
    if (rawMetaCell.startsWith('{')) {
      try {
        const parsedMeta = JSON.parse(rawMetaCell);
        if (parsedMeta && parsedMeta._cm) {
          unpackedDriveId = String(parsedMeta.did || '');
          if (Array.isArray(parsedMeta.vars) && parsedMeta.vars.length > 0) {
            savedMetaVars = parsedMeta.vars;
          }
        }
      } catch (e) {}
    }

    let builtVars;
    if (savedMetaVars && savedMetaVars.length > 0) {
      builtVars = savedMetaVars.map(function (sv, vIdx) {
        const isFirst = (vIdx === 0);
        const vFin = String(sv.sw || sv.fin || (isFirst ? finUrl : '') || '');
        const vViews = Array.isArray(sv.vw) ? sv.vw : (isFirst ? [views[0] || '', views[1] || '', views[2] || '', views[3] || ''] : ['', '', '', '']);
        return {
          color_label: String(sv.cl || 'ESTÁNDAR'),
          finish_type: String(sv.ft || 'TELA'),
          swatch_hex: String(sv.hex || '#B8893E'),
          swatch_img: vFin,
          price: priceFormatted,
          width: sv.w !== undefined ? String(sv.w) : String(r[8] || ''),
          depth: sv.d !== undefined ? String(sv.d) : String(r[9] || ''),
          height: sv.h !== undefined ? String(sv.h) : String(r[10] || ''),
          seat: sv.s !== undefined ? String(sv.s) : String(r[11] || ''),
          packages: sv.pk !== undefined ? String(sv.pk) : String(r[12] || ''),
          volume: sv.vl !== undefined ? String(sv.vl) : String(r[13] || ''),
          materials: sv.mat !== undefined ? String(sv.mat) : String(r[15] || ''),
          drive_ficha_url: String(sv.du || r[16] || ''),
          hero_b64: String(sv.hero || (isFirst ? heroUrl : '') || ''),
          hero_scale: Number(sv.hs) || 1,
          hero_pos: (sv.hp && typeof sv.hp === 'object') ? { x: Number(sv.hp.x) || 0, y: Number(sv.hp.y) || 0 } : { x: 0, y: 0 },
          slot_scales: (sv.ss && typeof sv.ss === 'object') ? sv.ss : {},
          slot_pos: (sv.sp && typeof sv.sp === 'object') ? sv.sp : {},
          gallery: {
            ambiente: String(sv.amb || (isFirst ? ambUrl : '') || ''),
            finish: vFin,
            fabric: vFin,
            finishes: vFin ? [vFin] : [],
            view1: vViews[0] || '',
            view2: vViews[1] || '',
            view3: vViews[2] || '',
            view4: vViews[3] || '',
            all_views: [vViews[0] || '', vViews[1] || '', vViews[2] || '', vViews[3] || '']
          }
        };
      });
    } else {
      builtVars = [{
        color_label: 'ESTÁNDAR',
        price: priceFormatted,
        width: String(r[8] || ''),
        depth: String(r[9] || ''),
        height: String(r[10] || ''),
        seat: String(r[11] || ''),
        packages: String(r[12] || ''),
        volume: String(r[13] || ''),
        materials: String(r[15] || ''),
        drive_ficha_url: String(r[16] || ''),
        hero_b64: heroUrl,
        hero_scale: 1,
        hero_pos: { x: 0, y: 0 },
        slot_scales: {},
        slot_pos: {},
        swatch_img: finUrl,
        gallery: {
          ambiente: ambUrl,
          finish: finUrl,
          fabric: finUrl,
          finishes: finUrl ? [finUrl] : [],
          view1: views[0] || '',
          view2: views[1] || '',
          view3: views[2] || '',
          view4: views[3] || '',
          all_views: [views[0] || '', views[1] || '', views[2] || '', views[3] || '']
        }
      }];
    }

    const item = {
      id: id,
      archived: isArchived,
      provider_abbr: String(r[2] || 'CREATA'),
      provider: String(r[2] || 'CREATA'),
      model_name: String(r[4] || ''),
      category: normalizeCategory_(r[5]),
      width: String(r[8] || ''),
      depth: String(r[9] || ''),
      height: String(r[10] || ''),
      seat: String(r[11] || ''),
      packages: String(r[12] || ''),
      volume: String(r[13] || ''),
      price: priceFormatted,
      materials: String(r[15] || ''),
      drive_ficha_url: String(r[16] || ''),
      variants: builtVars
    };

    if (mods.length > 0) {
      item.sala_modules = mods;
    }
    if (includePrivate) {
      item.sku = String(r[3] || '');
      if (item.variants[0]) item.variants[0].sku = item.sku;
      item.drive_file_id = unpackedDriveId;
      item.inventory = {
        cedis: r[23] || '',
        casa_creata: r[24] || '',
        colosio: r[25] || '',
        playa: r[26] || '',
        puerto_cancun: r[27] || ''
      };
    }

    list.push(item);
  }
  return list;
}

function handleUploadPhoto_(body) {
  const dataUrl = String(body.dataUrl || '');
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return { ok: false, error: 'Formato de imagen inválido' };

  const mime = m[1];
  const base64Body = m[2];
  const ext = mime.includes('webp') ? 'webp' : (mime.includes('png') ? 'png' : 'jpg');
  const safePrefix = String(body.filePrefix || 'mueble').replace(/[^a-z0-9-]/gi, '');
  const slot = String(body.slot || 'hero').replace(/[^a-z0-9-]/gi, '');
  const fileName = safePrefix + '-' + slot + '-' + Date.now() + '.' + ext;

  const ghToken = getProp_('GITHUB_TOKEN');
  let publicUrl = '';

  if (ghToken) {
    const ghPath = 'fotos/' + fileName;
    const apiUrl = 'https://api.github.com/repos/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/contents/' + ghPath;
    const ghResp = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ghToken,
        'User-Agent': 'CreataSheetsBot'
      },
      payload: JSON.stringify({
        message: 'Upload foto ' + fileName,
        content: base64Body,
        branch: CONFIG.GITHUB_BRANCH
      }),
      muteHttpExceptions: true
    });
    if (ghResp.getResponseCode() >= 200 && ghResp.getResponseCode() < 300) {
      publicUrl = 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/' + ghPath;
    }
  }

  // Respaldo automático en Google Drive si no hay GITHUB_TOKEN
  if (!publicUrl) {
    const bytes = Utilities.base64Decode(base64Body);
    const blob = Utilities.newBlob(bytes, mime, fileName);
    const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const subIt = rootFolder.getFoldersByName(CONFIG.PHOTOS_DRIVE_FOLDER_NAME);
    const photosFolder = subIt.hasNext() ? subIt.next() : rootFolder.createFolder(CONFIG.PHOTOS_DRIVE_FOLDER_NAME);
    const uploaded = photosFolder.createFile(blob);
    uploaded.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    publicUrl = 'https://lh3.googleusercontent.com/d/' + uploaded.getId() + '=w1000';
  }

  // Actualizar únicamente la celda del slot subido (cada foto es 100% independiente)
  const pid = String(body.productId || '').trim();
  if (pid) {
    const sh = getSpreadsheet_().getSheetByName(CONFIG.TAB_PRODUCTS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === pid) {
        const rowNum = i + 1;
        if (slot === 'hero') sh.getRange(rowNum, 18).setValue(publicUrl);
        else if (slot === 'ambiente') sh.getRange(rowNum, 19).setValue(publicUrl);
        else if (slot === 'finish') sh.getRange(rowNum, 20).setValue(publicUrl);
        else if (slot.startsWith('view')) {
          const idx = parseInt(slot.replace('view', ''), 10) - 1;
          let views = [];
          try { views = JSON.parse(String(rows[i][20] || '[]')); } catch (e) { views = []; }
          if (!Array.isArray(views)) views = [];
          views[idx] = publicUrl;
          sh.getRange(rowNum, 21).setValue(JSON.stringify(views));
        }
        sh.getRange(rowNum, 23).setValue(new Date().toISOString());
        break;
      }
    }
  }

  return { ok: true, url: publicUrl };
}

function handleSaveProduct_(p) {
  if (!p || !p.id) return { ok: false, error: 'Producto sin ID' };
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const v = (p.variants && p.variants[0]) ? p.variants[0] : {};
  const g = v.gallery || {};
  const views = [g.view1 || '', g.view2 || '', g.view3 || '', g.view4 || ''];
  const catNorm = normalizeCategory_(p.category);
  const isSalaItem = catNorm === 'SALAS & SOFÁS' || /^SALA-|^ARM(MAT|MAR|MON|CAR|DON|DYL|LUG|SHE)/i.test(String(p.id || ''));
  const allMods = (isSalaItem && Array.isArray(p.sala_modules)) ? p.sala_modules : [];
  const activeMods = allMods.filter((m) => m.checked !== false && Number(m.qty === undefined ? 1 : m.qty) > 0);
  const isMulti = isSalaItem && allMods.length > 1;

  // Actualizar piezas hijas en PIEZAS_MODULOS preservando inventario en K..O y fórmulas en I..J
  const zRows = shPiece.getDataRange().getValues();
  const prevPieceInv = {};
  for (let r = zRows.length; r >= 2; r--) {
    const rowArr = zRows[r - 1];
    if (String(rowArr[0] || '').trim() === p.id) {
      const pSkuKey = String(rowArr[2] || '').trim().toUpperCase();
      if (pSkuKey) {
        prevPieceInv[pSkuKey] = normInv5_(rowArr.slice(10, 15));
      }
      shPiece.deleteRow(r);
    }
  }
  if (isMulti) {
    allMods.forEach((m, idx) => {
      const pieceRowNum = shPiece.getLastRow() + 1;
      const pieceSku = String(m.sku || ((p.sku || p.id) + '-P' + (idx + 1))).toUpperCase();
      const savedInv = prevPieceInv[pieceSku] || ['', '', '', '', ''];
      const qtyVal = m.checked === false ? 0 : (m.qty === 0 ? 0 : Number(m.qty || 1));
      const unitFormula = buildPieceUnitPriceFormula_(pieceRowNum, parseMoney_(m.price));
      shPiece.appendRow([
        p.id,
        p.model_name || '',
        pieceSku,
        m.name || ('Pieza ' + (idx + 1)),
        qtyVal,
        String(m.width || ''),
        String(m.depth || ''),
        String(m.height || ''),
        unitFormula,
        '=E' + pieceRowNum + '*I' + pieceRowNum
      ].concat(savedInv));
    });
  }

  const pRows = shProd.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0] || '').trim() === p.id) {
      targetRow = i + 1;
      break;
    }
  }
  const isNewRow = (targetRow === -1);
  if (isNewRow) {
    targetRow = shProd.getLastRow() + 1;
  }

  const numericPrice = parseMoney_(p.price);
  let priceFormulaOrValue = buildProductPriceFormula_(targetRow, isMulti, numericPrice);
  if (!isNewRow && !isMulti) {
    const existingFormula = shProd.getRange(targetRow, 15).getFormula();
    const prevEval = parseMoney_(pRows[targetRow - 1][14]);
    if (existingFormula && Math.abs(numericPrice - prevEval) <= 0.05) {
      priceFormulaOrValue = existingFormula;
    } else if (numericPrice > 0 && Math.abs(numericPrice - prevEval) > 0.05) {
      priceFormulaOrValue = buildProductPriceFormula_(targetRow, false, numericPrice);
    }
  }

  const rowValues = [
    p.id,
    p.archived ? 'ARCHIVADO' : 'VISIBLE',
    p.provider_abbr || 'CREATA',
    p.sku || p.id,
    p.model_name || '',
    p.category || 'COMPLEMENTOS',
    isMulti ? 'SI' : 'NO',
    isMulti ? (activeMods.length + ' piezas') : '1 pieza',
    p.width || '',
    p.depth || '',
    p.height || '',
    p.seat || '',
    p.packages || '',
    p.volume || '',
    priceFormulaOrValue,
    p.materials || '',
    p.drive_ficha_url || '',
    v.hero_b64 || '',
    g.ambiente || '',
    g.finish || '',
    JSON.stringify(views),
    p.drive_file_id || '',
    new Date().toISOString()
  ];

  // Escribir solo columnas 1..23 (A..W) para NUNCA sobrescribir el inventario en X..AB
  shProd.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  if (isNewRow) {
    shProd.getRange(targetRow, 24, 1, 5).setValues([['', '', '', '', '']]);
  }
  return { ok: true, id: p.id };
}

function handleToggleArchive_(productId, archived) {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.TAB_PRODUCTS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === productId) {
      sh.getRange(i + 1, 2).setValue(archived ? 'ARCHIVADO' : 'VISIBLE');
      sh.getRange(i + 1, 23).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  return { ok: false, error: 'Producto no encontrado' };
}

function handleDeleteProduct_(productId) {
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const pRows = shProd.getDataRange().getValues();
  for (let r = pRows.length; r >= 2; r--) {
    if (String(pRows[r - 1][0] || '').trim() === productId) {
      shProd.deleteRow(r);
    }
  }
  const zRows = shPiece.getDataRange().getValues();
  for (let r = zRows.length; r >= 2; r--) {
    if (String(zRows[r - 1][0] || '').trim() === productId) {
      shPiece.deleteRow(r);
    }
  }
  return { ok: true };
}

function handleBulkSeed_(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Lista vacía para cargar a Sheets' };
  }
  setupSheetsStructure();
  let count = 0;
  items.forEach((p) => {
    const res = handleSaveProduct_(p);
    if (res && res.ok) count++;
  });
  return { ok: true, count: count };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function scrubPublicText_(txt) {
  return String(txt || '')
    .replace(/JUEGO\s+COMPLETO\s*\([^)]*\)/gi, '')
    .replace(/JUEGO\s+MODULAR\s+COMPLETO/gi, '')
    .replace(/JUEGO\s+COMPLETO/gi, '')
    .replace(/SOF[ÁA]\s*3P\s*\+\s*LOVE\s*SEAT\s*2P/gi, '')
    .replace(/Sin\s+descripci[óo]n\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—·:|]+|[\s\-–—·:|]+$/g, '')
    .trim();
}

function parseMoney_(val) {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const cleaned = String(val || '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function normInv5_(arr) {
  const out = ['', '', '', '', ''];
  if (!Array.isArray(arr)) return out;
  for (let k = 0; k < 5; k++) {
    const v = arr[k];
    if (v === '' || v === null || v === undefined || v === 0 || v === '0') {
      out[k] = '';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function extractDriveIdFromUrl_(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function getRichUrl_(richVal, fallbackVal) {
  try {
    if (richVal) {
      const direct = richVal.getLinkUrl();
      if (direct) return direct;
      const runs = richVal.getRuns();
      for (let i = 0; i < runs.length; i++) {
        const u = runs[i].getLinkUrl();
        if (u) return u;
      }
    }
  } catch (e) {}
  const s = String(fallbackVal || '').trim();
  return s.indexOf('http') === 0 ? s : '';
}

function fetchGithubJsonArray_(fileName) {
  const rawUrl = 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/' + fileName;
  const resp = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return [];
  const txt = resp.getContentText();
  const s = txt.indexOf('[');
  const e = txt.lastIndexOf(']');
  if (s < 0 || e <= s) return [];
  return JSON.parse(txt.slice(s, e + 1));
}

/**
 * Inicializa CATALOGO_PRODUCTOS y PIEZAS_MODULOS conectando los precios con FÓRMULAS EN VIVO
 * hacia MUEBLES_INDIVIDUALES (=CALCULAR_PRECIO_SKU) y SALAS_MODULARES (=CALCULAR_MONTO_SKU),
 * sin fotos precargadas, sin perder una sola fórmula, y con las 5 columnas de inventario vacías.
 */
function dejarTodoListoSinFotos(opts) {
  const silentUi = !!(opts && opts.silentUi);
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  const shSalas = ss.getSheetByName(CONFIG.TAB_SALAS_SRC);
  const shIndiv = ss.getSheetByName(CONFIG.TAB_INDIV_SRC);

  // Conservar inventario existente (> 0) si el usuario ya capturó piezas en alguna celda
  const prevProdInv = {};
  const oldPRows = shProd.getDataRange().getValues();
  for (let i = 1; i < oldPRows.length; i++) {
    const pid = String(oldPRows[i][0] || '').trim();
    if (pid) prevProdInv[pid] = normInv5_(oldPRows[i].slice(23, 28));
  }
  const prevPieceInv = {};
  const oldZRows = shPiece.getDataRange().getValues();
  for (let i = 1; i < oldZRows.length; i++) {
    const zKey = String(oldZRows[i][0] || '').trim() + '|' + String(oldZRows[i][2] || '').trim();
    if (zKey !== '|') prevPieceInv[zKey] = normInv5_(oldZRows[i].slice(10, 15));
  }

  // Leer SALAS_MODULARES (sin tocar ni modificar sus fórmulas en I2, J y K)
  const salasMap = {};
  if (shSalas && shSalas.getLastRow() >= 3) {
    const sVals = shSalas.getRange(1, 1, shSalas.getLastRow(), 14).getValues();
    const sRich = shSalas.getRange(1, 14, shSalas.getLastRow(), 1).getRichTextValues();
    let curPieces = [];
    for (let r = 2; r < sVals.length; r++) {
      const row = sVals[r];
      const sid = String(row[0] || '').trim();
      if (!sid) continue;
      const sname = scrubPublicText_(String(row[1] || ''));
      const psku = String(row[2] || '').trim().toUpperCase();
      const pname = scrubPublicText_(String(row[3] || ''));
      const qty = Number(row[4] || 0);
      const showFlag = String(row[12] || '').trim().toUpperCase();
      const furl = getRichUrl_(sRich[r][0], row[13]);
      if (showFlag.indexOf('SÍ') >= 0 || showFlag.indexOf('SI') >= 0 || psku.indexOf('-TOTAL') > 0) {
        salasMap[sid] = {
          id: sid,
          name: sname,
          dimsSummary: String(row[11] || '').trim(),
          driveUrl: furl,
          driveId: extractDriveIdFromUrl_(furl),
          pieces: curPieces.slice()
        };
        curPieces = [];
      } else {
        curPieces.push({
          sku: psku,
          name: pname,
          qty: isNaN(qty) ? 1 : qty,
          width: String(row[5] || '').trim(),
          depth: String(row[6] || '').trim(),
          height: String(row[7] || '').trim(),
          fallbackPrice: parseMoney_(row[8])
        });
      }
    }
  }

  // Leer MUEBLES_INDIVIDUALES (sin tocar ni modificar su fórmula en K2)
  const indivList = [];
  const skuToIndiv = {};
  if (shIndiv && shIndiv.getLastRow() >= 3) {
    const iVals = shIndiv.getRange(1, 1, shIndiv.getLastRow(), 14).getValues();
    const iRich = shIndiv.getRange(1, 14, shIndiv.getLastRow(), 1).getRichTextValues();
    for (let r = 2; r < iVals.length; r++) {
      const row = iVals[r];
      const sku = String(row[1] || '').trim().toUpperCase();
      if (!sku) continue;
      const furl = getRichUrl_(iRich[r][0], row[13]);
      const item = {
        rowNum: r + 1,
        provider: String(row[0] || 'CREATA').trim(),
        sku: sku,
        name: scrubPublicText_(String(row[2] || '')),
        category: normalizeCategory_(String(row[3] || '')),
        width: String(row[4] || '').trim(),
        depth: String(row[5] || '').trim(),
        height: String(row[6] || '').trim(),
        seat: String(row[7] || '').trim(),
        volume: String(row[8] || '').trim(),
        packages: String(row[9] || '1').trim(),
        fallbackPrice: parseMoney_(row[10]),
        materials: scrubPublicText_(String(row[11] || '')),
        driveUrl: furl,
        driveId: extractDriveIdFromUrl_(furl)
      };
      indivList.push(item);
      if (!skuToIndiv[sku]) skuToIndiv[sku] = [];
      skuToIndiv[sku].push(item);
    }
  }

  const adminProds = fetchGithubJsonArray_('admin-data-1.js').concat(fetchGithubJsonArray_('admin-data-2.js'));
  const nowIso = new Date().toISOString();
  const outProds = [];
  const outPieces = [];
  const usedSalas = {};
  const usedIndivRow = {};

  // 1) 47 muebles activos del catálogo (VISIBLE, 0 fotos, conectados por FÓRMULA en vivo)
  adminProds.forEach((ap) => {
    const pid = String(ap.id || '').trim();
    const modelName = scrubPublicText_(String(ap.model_name || ''));
    const prov = String(ap.provider_abbr || ap.provider || 'CREATA').trim();
    const cat = normalizeCategory_(ap.category);
    let skuInternal = String(ap.sku || pid).trim().toUpperCase();
    let driveUrl = String(ap.drive_ficha_url || '').trim();
    const driveIds = [];
    const d0 = extractDriveIdFromUrl_(driveUrl);
    if (d0) driveIds.push(d0);

    skuInternal.split('/').forEach((part) => {
      const sk = part.trim().toUpperCase();
      if (skuToIndiv[sk]) {
        skuToIndiv[sk].forEach((m) => {
          usedIndivRow[m.rowNum] = true;
          if (!driveUrl && m.driveUrl) driveUrl = m.driveUrl;
          if (m.driveId && driveIds.indexOf(m.driveId) < 0) driveIds.push(m.driveId);
        });
      }
    });

    let salaKey = '';
    const upName = modelName.toUpperCase();
    if (upName.indexOf('MATERA') >= 0) salaKey = 'SALA-MATERA';
    else if (upName.indexOf('MARENO') >= 0 && upName.indexOf('LOVE') < 0) salaKey = 'SALA-MARENO';
    else if (upName.indexOf('MONET') >= 0 && upName.indexOf('LOVE') < 0) salaKey = 'SALA-MONET';

    const pRowNum = outProds.length + 2;
    let isMulti = 'NO';
    let summary = '1 pieza';
    let priceCell = buildProductPriceFormula_(pRowNum, false, parseMoney_(ap.price));

    if (salaKey && salasMap[salaKey]) {
      usedSalas[salaKey] = true;
      const sdata = salasMap[salaKey];
      if (sdata.driveUrl) driveUrl = sdata.driveUrl;
      if (sdata.driveId && driveIds.indexOf(sdata.driveId) < 0) driveIds.push(sdata.driveId);

      const pList = sdata.pieces.map((x) => Object.assign({}, x));
      pList.forEach((pz) => {
        const zRowNum = outPieces.length + 2;
        const zInv = prevPieceInv[pid + '|' + pz.sku] || ['', '', '', '', ''];
        outPieces.push([
          pid,
          modelName,
          pz.sku,
          pz.name,
          pz.qty,
          pz.width,
          pz.depth,
          pz.height,
          buildPieceUnitPriceFormula_(zRowNum, pz.fallbackPrice),
          '=E' + zRowNum + '*I' + zRowNum
        ].concat(zInv));
      });
      isMulti = 'SI';
      skuInternal = pList.map((x) => x.sku).filter(Boolean).join(' / ') || skuInternal;
      summary = pList.length + ' SKUs: ' + pList.map((x) => x.sku + ' (' + x.qty + ')').join(' + ');
      priceCell = buildProductPriceFormula_(pRowNum, true, 0);
    }

    const pInv = prevProdInv[pid] || ['', '', '', '', ''];
    outProds.push([
      pid, 'VISIBLE', prov, skuInternal, modelName, cat, isMulti, summary,
      String(ap.width || '').replace(/\s*cm$/i, '').trim(),
      String(ap.depth || '').replace(/\s*cm$/i, '').trim(),
      String(ap.height || '').replace(/\s*cm$/i, '').trim(),
      String(ap.seat || '').replace(/\s*cm$/i, '').trim(),
      String(ap.packages || '1').replace(/\s*bultos?$/i, '').trim(),
      String(ap.volume || '').replace(/\s*m[³3]$/i, '').trim(),
      priceCell,
      scrubPublicText_(String(ap.materials || '')),
      driveUrl,
      '', '', '', '[]',
      driveIds.join(','),
      nowIso
    ].concat(pInv));
  });

  // 2) Salas modulares restantes -> ARCHIVADO (conectadas por FÓRMULA a SALAS_MODULARES)
  Object.keys(salasMap).forEach((sid) => {
    if (usedSalas[sid]) return;
    const sdata = salasMap[sid];
    const pid = sid;
    const pList = sdata.pieces || [];
    pList.forEach((pz) => {
      const zRowNum = outPieces.length + 2;
      const zInv = prevPieceInv[pid + '|' + pz.sku] || ['', '', '', '', ''];
      outPieces.push([
        pid,
        sdata.name,
        pz.sku,
        pz.name,
        pz.qty,
        pz.width,
        pz.depth,
        pz.height,
        buildPieceUnitPriceFormula_(zRowNum, pz.fallbackPrice),
        '=E' + zRowNum + '*I' + zRowNum
      ].concat(zInv));
    });
    const activeP = pList.filter((x) => x.qty > 0);
    const totalQty = activeP.reduce((acc, x) => acc + (Number(x.qty) || 1), 0) || pList.length;
    const pRowNum = outProds.length + 2;
    const pInv = prevProdInv[pid] || ['', '', '', '', ''];
    const allSalaSkus = pList.map((x) => x.sku).filter(Boolean).join(' / ') || (sid + '-SET');
    outProds.push([
      pid, 'ARCHIVADO', 'ARM', allSalaSkus, sdata.name, 'SALAS & SOFÁS', 'SI',
      pList.length + ' SKUs: ' + pList.map((x) => x.sku + ' (' + x.qty + ')').join(' + '),
      pList.map((x) => x.width).filter(Boolean).join(' / '),
      (pList[0] && pList[0].depth) || '',
      (pList[0] && pList[0].height) || '',
      '',
      String(totalQty),
      '',
      buildProductPriceFormula_(pRowNum, true, 0),
      sdata.dimsSummary || '',
      sdata.driveUrl || '',
      '', '', '', '[]',
      sdata.driveId || '',
      nowIso
    ].concat(pInv));
  });

  // 3) Muebles individuales restantes -> ARCHIVADO (conectados por FÓRMULA a MUEBLES_INDIVIDUALES)
  indivList.forEach((it) => {
    if (usedIndivRow[it.rowNum]) return;
    const pid = 'IND-' + it.sku;
    const pRowNum = outProds.length + 2;
    const pInv = prevProdInv[pid] || ['', '', '', '', ''];
    outProds.push([
      pid, 'ARCHIVADO', it.provider, it.sku, it.name, it.category, 'NO', '1 pieza',
      it.width, it.depth, it.height, it.seat, it.packages, it.volume,
      buildProductPriceFormula_(pRowNum, false, it.fallbackPrice),
      it.materials, it.driveUrl,
      '', '', '', '[]',
      it.driveId || '',
      nowIso
    ].concat(pInv));
  });

  if (shProd.getLastRow() > 1) {
    shProd.getRange(2, 1, shProd.getLastRow() - 1, 28).clearContent();
  }
  if (outProds.length > 0) {
    if (shProd.getMaxRows() < outProds.length + 5) {
      shProd.insertRowsAfter(shProd.getMaxRows(), outProds.length + 5 - shProd.getMaxRows());
    }
    shProd.getRange(2, 1, outProds.length, 28).setValues(outProds);
    shProd.getRange(2, 15, outProds.length, 1).setNumberFormat('$#,##0.00');
  }
  if (shPiece.getLastRow() > 1) {
    shPiece.getRange(2, 1, shPiece.getLastRow() - 1, 15).clearContent();
  }
  if (outPieces.length > 0) {
    if (shPiece.getMaxRows() < outPieces.length + 5) {
      shPiece.insertRowsAfter(shPiece.getMaxRows(), outPieces.length + 5 - shPiece.getMaxRows());
    }
    shPiece.getRange(2, 1, outPieces.length, 15).setValues(outPieces);
    shPiece.getRange(2, 9, outPieces.length, 2).setNumberFormat('$#,##0.00');
  }

  ensureAutoSyncTrigger_();
  publishWebAppUrlToConfigSheet_(ss);

  if (!silentUi) {
    try {
      SpreadsheetApp.getUi().alert(
        '¡Todo conectado en automático y sin perder fórmulas!\n\n' +
        '• Muebles en CATALOGO_PRODUCTOS: ' + outProds.length + ' (47 VISIBLES + ' + (outProds.length - 47) + ' ARCHIVADOS, 0 fotos)\n' +
        '• Piezas modulares en PIEZAS_MODULOS: ' + outPieces.length + '\n' +
        '• Fórmulas conservadas al 100% (=CALCULAR_PRECIO_SKU y =CALCULAR_MONTO_SKU)\n' +
        '• Inventario vacío creado: CEDIS, CASA CREATA, COLOSIO, PLAYA y PUERTO CANCUN.'
      );
    } catch (e) {}
  }

  return { ok: true, products: outProds.length, pieces: outPieces.length };
}

/**
 * Crea o actualiza la pestaña INVENTARIO_EN_VIVO en este mismo documento
 * (CONTROL DE PRODUCTOS PRESENTACIÓN) sin tocar SALAS_MODULARES, CATALOGO_PRODUCTOS,
 * PIEZAS_MODULOS ni MUEBLES_INDIVIDUALES, conservando existencias o fotos ya capturadas.
 */
function sincronizarPestanaInventarioEnVivo(opts) {
  const silentUi = !!(opts && opts.silentUi);
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(CONFIG.TAB_INVENTORY);

  // Si INVENTARIO_EN_VIVO ya existe con sus datos y fórmulas en vivo, respetarla como fuente maestra
  if (sh && sh.getLastRow() > 2 && !(opts && opts.forceRebuild)) {
    const numExisting = sh.getLastRow() - 1;
    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert(
          'La pestaña INVENTARIO_EN_VIVO ya está activa (' + numExisting + ' filas) y conectada en vivo a inventario.html.'
        );
      } catch (e) {}
    }
    return { ok: true, rows: numExisting, preserved: true };
  }

  const csvUrl = 'https://raw.githubusercontent.com/' +
    CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/INVENTARIO_EN_VIVO.csv';

  let parsed = null;
  const resp = UrlFetchApp.fetch(csvUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
    parsed = Utilities.parseCsv(resp.getContentText('UTF-8'));
  } else {
    // Respaldo automático leyendo inventario-data-1..3.js comprimido desde GitHub
    const baseRaw = 'https://raw.githubusercontent.com/' +
      CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/';
    let b64 = '';
    for (let k = 1; k <= 3; k++) {
      const rPart = UrlFetchApp.fetch(baseRaw + 'inventario-data-' + k + '.js', { muteHttpExceptions: true });
      if (rPart.getResponseCode() >= 200 && rPart.getResponseCode() < 300) {
        const matches = rPart.getContentText('UTF-8').match(/"([A-Za-z0-9+/=]+)"/g) || [];
        b64 += matches.map((s) => s.slice(1, -1)).join('');
      }
    }
    if (b64) {
      const gzBlob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'inv.gz');
      const cols = JSON.parse(Utilities.ungzip(gzBlob).getDataAsString('UTF-8'));
      const headers = [
        'SKU', 'TIPO DE PRODUCTO', 'MODELO', 'NOMBRE', 'VARIANTE', 'FOTO', 'CATEGORIA',
        'TELA', 'COLOR DE TELA', 'MADERA', 'COLOR DE MADERA', 'MATERIALES', 'MEDIDAS',
        'PROVEEDOR', 'TIEMPO DE ENTREGA (DIAS)', 'LLPT', 'CEDIS', 'CASA CREATA', 'PUERTO CANCUN', 'COLOSIO', 'PLAYA'
      ];
      parsed = [headers];
      for (let i = 0; i < cols[0].length; i++) {
        const st = cols[15][i] || [0, 0, 0, 0, 0, 0];
        parsed.push([
          cols[0][i] || '', cols[1][i] || '', cols[2][i] || '', cols[3][i] || '', cols[4][i] || '',
          cols[5][i] || '', cols[6][i] || '', cols[7][i] || '', cols[8][i] || '', cols[9][i] || '',
          cols[10][i] || '', cols[11][i] || '', cols[12][i] || '', cols[13][i] || '', cols[14][i] || '',
          st[0] || 0, st[1] || 0, st[2] || 0, st[3] || 0, st[4] || 0, st[5] || 0
        ]);
      }
    }
  }
  if (!parsed || parsed.length < 2) {
    throw new Error('No se pudieron obtener datos para INVENTARIO_EN_VIVO');
  }

  const prevBySku = {};
  if (sh && sh.getLastRow() > 1) {
    const prevVals = sh.getDataRange().getValues();
    for (let i = 1; i < prevVals.length; i++) {
      const r = prevVals[i];
      const sk = String(r[0] || '').trim().toUpperCase();
      if (!sk) continue;
      prevBySku[sk] = {
        foto: String(r[5] || '').trim(),
        stocks: [r[15], r[16], r[17], r[18], r[19], r[20]]
      };
    }
  } else if (!sh) {
    sh = ss.insertSheet(CONFIG.TAB_INVENTORY);
  }

  const outRows = [parsed[0].slice(0, 21)];
  while (outRows[0].length < 21) outRows[0].push('');

  for (let i = 1; i < parsed.length; i++) {
    const r = parsed[i].slice(0, 21);
    while (r.length < 21) r.push('');
    const sk = String(r[0] || '').trim().toUpperCase();
    if (!sk) continue;
    const prev = prevBySku[sk];
    if (prev) {
      if (!r[5] && prev.foto) r[5] = prev.foto;
      for (let w = 0; w < 6; w++) {
        const pv = prev.stocks[w];
        if (pv !== '' && pv !== null && pv !== undefined && Number(pv) !== 0) {
          r[15 + w] = Number(pv);
        }
      }
    }
    for (let w = 0; w < 6; w++) {
      r[15 + w] = Number(r[15 + w]) || 0;
    }
    outRows.push(r);
  }

  const numRows = outRows.length;
  const numCols = 21;
  if (sh.getMaxRows() < numRows + 5) {
    sh.insertRowsAfter(sh.getMaxRows(), numRows + 5 - sh.getMaxRows());
  }
  if (sh.getMaxColumns() < numCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), numCols - sh.getMaxColumns());
  }
  sh.clearContents();
  sh.getRange(1, 1, numRows, numCols).setValues(outRows);

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, 1, 1, 15)
    .setBackground('#252C32')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sh.getRange(1, 16, 1, 6)
    .setBackground('#A38251')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (numRows > 1) {
    const stockRange = sh.getRange(2, 16, numRows - 1, 6);
    stockRange.setHorizontalAlignment('center').setNumberFormat('#,##0');

    const redRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThanOrEqualTo(0)
      .setBackground('#FEF2F2')
      .setFontColor('#991B1B')
      .setRanges([stockRange])
      .build();
    const yellowRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberBetween(1, 2)
      .setBackground('#FFFBEB')
      .setFontColor('#92400E')
      .setBold(true)
      .setRanges([stockRange])
      .build();
    const greenRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(2)
      .setBackground('#ECFDF5')
      .setFontColor('#065F46')
      .setBold(true)
      .setRanges([stockRange])
      .build();
    sh.setConditionalFormatRules([redRule, yellowRule, greenRule]);
  }

  if (!silentUi) {
    try {
      SpreadsheetApp.getUi().alert(
        'Pestaña INVENTARIO_EN_VIVO lista con ' + (numRows - 1) + ' SKUs conectados a inventario.html.'
      );
    } catch (e) {}
  }
  return { ok: true, rows: numRows - 1 };
}

// ============================================================================
// USUARIOS POR SUCURSAL / PROYECTO, ORDEN CONSECUTIVA Y CONEXIÓN EN VIVO 24/7
// DIRECTA A S MUEBLERÍA ERP (WCF SOAP 1.2) + INVENTARIO EN VIVO CLOUD
// (Exclusivo para inventario.html — NO altera index.html, admin.html ni LPPT)
// ============================================================================

const INV_USER_TABS_ = [
  {
    tab: 'PLAYA',
    branchKey: 'PLAYA',
    label: 'Playa del Carmen',
    erpStore: 'CREATA LIVING PLAYA',
    orderPrefix: 'PL',
    quoteType: 'SUCURSAL',
    isProyecto: false,
    isAdmin: false,
    serieLabel: 'CREATA LIVING PLAYA · Folio PL'
  },
  {
    tab: 'COLOCIO',
    branchKey: 'COLOSIO',
    label: 'Colosio',
    erpStore: 'CREATA LIVING COLOSIO',
    orderPrefix: 'DTC',
    quoteType: 'SUCURSAL',
    isProyecto: false,
    isAdmin: false,
    serieLabel: 'CREATA LIVING COLOSIO · Folio DTC'
  },
  {
    tab: 'OUTLET COLOSIO',
    branchKey: 'OUTLET COLOSIO',
    label: 'Outlet Colosio',
    erpStore: 'OUTLET COLOSIO',
    orderPrefix: 'OUT',
    quoteType: 'SUCURSAL',
    isProyecto: false,
    isAdmin: false,
    serieLabel: 'OUTLET COLOSIO · Folio OUT'
  },
  {
    tab: 'PTC',
    branchKey: 'PTC',
    label: 'Puerto Cancún (PTC)',
    erpStore: 'CREATA PUERTO CANCUN',
    orderPrefix: 'PTC',
    quoteType: 'SUCURSAL',
    isProyecto: false,
    isAdmin: false,
    serieLabel: 'CREATA PUERTO CANCUN · Folio PTC'
  },
  {
    tab: 'CASA CREATA',
    branchKey: 'CASA CREATA',
    label: 'Casa Creata',
    erpStore: 'CASA CREATA BONAMPAK',
    orderPrefix: 'CCB',
    quoteType: 'SUCURSAL',
    isProyecto: false,
    isAdmin: false,
    serieLabel: 'CASA CREATA BONAMPAK · Folio CCB'
  },
  {
    tab: 'PROYECTOS',
    branchKey: 'PROYECTOS',
    label: 'Proyectos',
    erpStore: 'PROYECTOS ANIPA INTERIOR',
    orderPrefix: 'PRO',
    quoteType: 'PROYECTO',
    isProyecto: true,
    isAdmin: false,
    serieLabel: 'PROYECTOS ANIPA INTERIOR · Folio PRO'
  },
  {
    tab: 'CUENTAS ADMINISTRATIVAS',
    branchKey: 'ADMIN',
    label: 'Administración General',
    erpStore: 'CEDIS',
    orderPrefix: 'CED',
    quoteType: 'ADMINISTRATIVO',
    isProyecto: false,
    isAdmin: true,
    isGuest: false,
    serieLabel: 'Acceso Total · Todas las Tiendas y Bodegas'
  },
  {
    tab: 'INVITADOS',
    branchKey: 'INVITADOS',
    label: 'Invitados (Solo Ver)',
    erpStore: 'SOLO LECTURA',
    orderPrefix: 'INV',
    quoteType: 'SOLO_VER',
    isProyecto: false,
    isAdmin: false,
    isGuest: true,
    serieLabel: 'Modo Invitado · Solo Ver (Máx. 2 Lugares por Correo)'
  }
];

const TAB_INVITADOS_ = 'INVITADOS';
const MAX_GUEST_PLACES_PER_EMAIL_ = 2;

const ADMIN_MASTER_EMAILS_ = {
  'santiago.torres@grupoanipa.com': true,
  'kevin.reyna@grupoanipa.com': true
};

const ERP_STORE_FOLIO_SERIES_ = {
  'CREATA LIVING PLAYA': 'PL',
  'CREATA LIVING COLOSIO': 'DTC',
  'OUTLET COLOSIO': 'OUT',
  'CREATA PUERTO CANCUN': 'PTC',
  'CASA CREATA BONAMPAK': 'CCB',
  'PROYECTOS ANIPA INTERIOR': 'PRO',
  'CEDIS': 'CED',
  'ADMINISTRACION': 'ADM'
};

const ERP_PREFIX_TO_STORE_ = {
  'PL': 'CREATA LIVING PLAYA',
  'DTC': 'CREATA LIVING COLOSIO',
  'OUT': 'OUTLET COLOSIO',
  'PTC': 'CREATA PUERTO CANCUN',
  'CCB': 'CASA CREATA BONAMPAK',
  'PRO': 'PROYECTOS ANIPA INTERIOR',
  'CED': 'CEDIS',
  'ADM': 'ADMINISTRACION'
};

function getStoreFolioPrefix_(erpStore, fallbackPrefix) {
  const up = String(erpStore || '').trim().toUpperCase();
  if (ERP_STORE_FOLIO_SERIES_[up]) return ERP_STORE_FOLIO_SERIES_[up];
  for (let i = 0; i < INV_USER_TABS_.length; i++) {
    if (INV_USER_TABS_[i].erpStore.toUpperCase() === up) {
      return INV_USER_TABS_[i].orderPrefix;
    }
  }
  const fb = String(fallbackPrefix || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return fb || 'PTC';
}

function extractErpIdFromLabel_(txt) {
  const s = String(txt || '').trim();
  const m = s.match(/\[ID:\s*(\d+)\]/i) || s.match(/\bID[:\s#]*(\d{3,7})\b/i);
  if (m) return m[1];
  if (/^\d{3,7}$/.test(s)) return s;
  return '';
}

function parseDiscountPctCell_(rawVal) {
  if (rawVal === null || rawVal === undefined) return null;
  const s = String(rawVal).trim();
  if (!s) return null;
  if (/[A-Za-z]{3,}/.test(s)) return null;
  const hasPct = s.indexOf('%') !== -1;
  const cleaned = s.replace(/[^0-9.,-]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (isNaN(n) || !isFinite(n) || n < 0) return null;
  if (!hasPct && n > 0 && n <= 1) {
    return Math.min(100, Math.round(n * 10000) / 100);
  }
  return Math.min(100, Math.round(n * 100) / 100);
}

const TAB_QUOTES_LIVE_ = 'COTIZACIONES_EN_VIVO';
const TAB_TOP_SEARCHED_ = 'TOP_BUSCADOS';
const TAB_HISTORIAL_ = 'HISTORIAL';
const TAB_FOTOS_NUEVAS_CARGADO_ = 'FOTOS NUEVAS CARGADO';
const FOTOS_NUEVAS_CARGADO_FOLDER_ID_ = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';
const PRESENTACION_DISENO_FOLDER_ID_ = '1cEirbNnx-s2Jdsf0-jOTVUTFsdltvLev';
const LPPT_COMMITMENT_BUFFER_DAYS_ = 14; // +2 semanas adicionales en fecha compromiso proveedor
const ADVISOR_PROMO_END_YMD_ = '2026-11-30'; // 30% asesores vigente hasta 30/11/2026
const ERP_DRIVE_FOLDER_NAME_ = 'PRESENTACION_DISENO';
const LPPT_READONLY_DEFAULT_ID_ = '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE';

const ERP_WAREHOUSES_ORDER_ = [
  ['CEDIS', 'CEDIS'],
  ['CASA CREATA BONAMPAK', 'CASA CREATA'],
  ['CREATA PUERTO CANCUN', 'PUERTO CANCUN'],
  ['CREATA LIVING COLOSIO', 'COLOSIO'],
  ['CREATA LIVING PLAYA', 'PLAYA'],
  ['OUTLET COLOSIO', 'OUTLET COLOSIO'],
  ['CONSIGNAS SHOWROOM Y PRESTAMO CLIENTE', 'CONSIGNAS Y SHOWROOM'],
  ['TRANSITO TIENDAS', 'TRANSITO TIENDAS'],
  ['ADMINISTRACION', 'ADMINISTRACION'],
  ['REPARACIONES', 'REPARACIONES'],
  ['GARANTIAS', 'GARANTIAS'],
  ['INCOMPLETOS', 'INCOMPLETOS'],
  ['REZAGADOS', 'REZAGADOS'],
  ['TRANSITO PENDIENTE ELIMINAR', 'TRANSITO PEND.']
];

const ERP_PROVIDER_ALIASES_ = {
  'SKANOR INDUSTRIAS': 'SKANOR',
  'TAPETES DICSA': 'DICSA',
  'LUIS PEDRO MUEBLES': 'LUIS PEDRO',
  'ECLISSARE': 'ECCLISARE',
  'ECCLISEA': 'ECCLISARE',
  'GOMPE': 'GOMPE / GRUPO ALBAR',
  'GRUPO ALBAR': 'GOMPE / GRUPO ALBAR',
  'MDO MUEBLES': 'MDO',
  'CASA V&V': 'CASA V & V'
};

function formatCancunNow_() {
  try {
    return Utilities.formatDate(new Date(), 'America/Cancun', 'dd/MM/yyyy HH:mm:ss');
  } catch (e) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT-5', 'dd/MM/yyyy HH:mm:ss');
  }
}

function cleanSheetKeyCell_(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : String(Math.trunc(val));
  }
  let s = String(val).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

function normPlainUpper_(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normAdvisorTokens_(txt) {
  const clean = normPlainUpper_(txt)
    .replace(/\bLUPITA\b/g, 'GUADALUPE')
    .replace(/\bDADVID\b/g, 'DAVID')
    .replace(/\bJOHANNA\b/g, 'JOHANA')
    .replace(/\bRODRIGUEZ\b/g, 'RODRIGEZ');
  const m = clean.match(/[A-Z]+/g) || [];
  const stop = { DE: 1, LA: 1, DEL: 1, LOS: 1, LAS: 1, Y: 1, PROYECTOS: 1, OUTLET: 1, ADMON: 1 };
  return m.filter((w) => w.length >= 2 && !stop[w]);
}

// ----------------------------------------------------------------------------
// HOJA "INVITADOS" (MODO SOLO VER · SIN COTIZAR · SIN DESCUENTOS · LÍMITE DE DISPOSITIVOS EN COLUMNA H)
// ----------------------------------------------------------------------------
function findInvitadosSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = book.getSheetByName(TAB_INVITADOS_) || book.getSheetByName('invitados') || book.getSheetByName('Invitados');
  if (sh) return sh;
  const all = book.getSheets();
  for (let i = 0; i < all.length; i++) {
    const nm = String(all[i].getName() || '').trim().toUpperCase();
    if (nm === 'INVITADOS' || nm === 'INVITADO') {
      return all[i];
    }
  }
  return null;
}

function parseGuestMaxDevicesCell_(rawVal) {
  const s = String(rawVal !== undefined && rawVal !== null ? rawVal : '').trim();
  if (!s) return MAX_GUEST_PLACES_PER_EMAIL_;
  const mSlash = s.match(/^\d+\s*\/\s*(\d+)$/);
  if (mSlash && mSlash[1]) {
    const denom = parseInt(mSlash[1], 10);
    if (denom >= 1 && denom <= 50) return denom;
  }
  const mNum = s.match(/(\d+)/);
  if (mNum && mNum[1]) {
    const n = parseInt(mNum[1], 10);
    if (n >= 1 && n <= 50) return n;
  }
  return MAX_GUEST_PLACES_PER_EMAIL_;
}

function extractGuestDeviceColsFromRow_(r, dr) {
  const rowVal = Array.isArray(r) ? r : [];
  const rowDisp = Array.isArray(dr) ? dr : rowVal;
  const colH = String(rowDisp[7] !== undefined && rowDisp[7] !== '' ? rowDisp[7] : (rowVal[7] !== undefined ? rowVal[7] : '')).trim();
  const colI = String(rowDisp[8] !== undefined && rowDisp[8] !== '' ? rowDisp[8] : (rowVal[8] !== undefined ? rowVal[8] : '')).trim();
  const colJ = String(rowDisp[9] !== undefined && rowDisp[9] !== '' ? rowDisp[9] : (rowVal[9] !== undefined ? rowVal[9] : '')).trim();

  // Compatibilidad con filas de 9 columnas (Col H = "2 / 2", Col I = "Lugar 1: ... [ID:...]")
  const isLegacy9Col = !colJ && (/\[(?:ID|DEV):/i.test(colI) || /^Lugar\s*\d+\s*:/i.test(colI) || /^\d+\s*\/\s*\d+$/.test(colH));
  if (isLegacy9Col) {
    return {
      maxPlaces: parseGuestMaxDevicesCell_(colH),
      placesText: colH,
      devicesRaw: colI,
      isLegacy9Col: true
    };
  }
  return {
    maxPlaces: parseGuestMaxDevicesCell_(colH),
    placesText: colI,
    devicesRaw: colJ,
    isLegacy9Col: false
  };
}

function ensureInvitadosSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = findInvitadosSheet_(book);
  const createdNew = !sh;
  if (!sh) {
    sh = book.insertSheet(TAB_INVITADOS_, book.getSheets().length);
  }
  if (sh.getMaxColumns() < 10) {
    sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
  }
  if (sh.getMaxRows() < 30) {
    sh.insertRowsAfter(sh.getMaxRows(), 30 - sh.getMaxRows());
  }

  const hdrRow = findUserHeaderRow1Based_(sh);
  if (createdNew || hdrRow < 1) {
    sh.getRange(1, 2, 1, 9).merge()
      .setValue('INVITADOS — ACCESO SOLO VER (SIN COTIZAR · SIN DESCUENTOS · LÍMITE DE DISPOSITIVOS EN COLUMNA H)')
      .setBackground('#252C32')
      .setFontColor('#E1DBC5')
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center');

    const headerRowVals = [[
      '',
      'INVITADOS (SOLO VER)',
      'Nombre',
      'Puesto',
      'Correo',
      'Contraseña Temporal',
      'Contraseña',
      'Dispositivos Permitidos',
      'Lugares Activos',
      'Dispositivos Autorizados (Borrar celda para reiniciar)'
    ]];
    sh.getRange(2, 1, 1, 10).setValues(headerRowVals);
    sh.getRange(2, 2, 1, 9)
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(2, 8, 1, 3).setBackground('#A38251');

    sh.setColumnWidth(1, 28);
    sh.setColumnWidth(2, 185);
    sh.setColumnWidth(3, 235);
    sh.setColumnWidth(4, 185);
    sh.setColumnWidth(5, 255);
    sh.setColumnWidth(6, 155);
    sh.setColumnWidth(7, 135);
    sh.setColumnWidth(8, 170);
    sh.setColumnWidth(9, 145);
    sh.setColumnWidth(10, 460);
    sh.setFrozenRows(2);
  }
  return sh;
}

function crearVerificarHojaInvitados() {
  const ss = getSpreadsheet_();
  const sh = ensureInvitadosSheet_(ss);
  try {
    SpreadsheetApp.getUi().alert(
      '¡Hoja "' + sh.getName() + '" lista!\n\n' +
      '• Cualquier correo registrado en la hoja INVITADOS ingresará en Modo Solo Ver.\n' +
      '• Restricciones activas: No pueden cotizar, no pueden calcular ni aplicar descuentos y no pueden subir fotos.\n' +
      '• Límite de lugares: Configurable por cuenta en la Columna H (Dispositivos Permitidos, por defecto 2).'
    );
  } catch (e) {}
  return { ok: true, sheetName: sh.getName() };
}

function parseGuestDevicesFromText_(rawColText) {
  const txt = String(rawColText || '').trim();
  if (!txt) return [];
  const out = [];
  const seen = {};
  const parts = txt.split(/\s*\|\s*/);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (!seg) continue;
    const mId = seg.match(/\[(?:ID|DEV):\s*([^\]]+)\]/i);
    if (!mId || !mId[1]) continue;
    const devId = String(mId[1]).trim();
    if (!devId || seen[devId]) continue;
    seen[devId] = true;
    const labelPart = seg
      .replace(/^(?:Lugar\s*\d+\s*:\s*|\d+\)\s*)/i, '')
      .replace(/\[(?:ID|DEV):\s*[^\]]+\]/gi, '')
      .replace(/\([^)]*\)\s*$/, '')
      .trim() || 'Dispositivo registrado';
    const mTime = seg.match(/\(([^)]+)\)\s*$/);
    out.push({
      id: devId,
      label: labelPart,
      lastSeen: mTime ? mTime[1].trim() : ''
    });
  }
  return out;
}

function formatGuestDevicesForSheet_(devicesList, maxPlacesOpt) {
  if (!Array.isArray(devicesList) || !devicesList.length) return '';
  const limit = Math.max(1, Math.min(50, Number(maxPlacesOpt) || MAX_GUEST_PLACES_PER_EMAIL_));
  return devicesList.slice(0, limit).map((d, idx) => {
    const lbl = String((d && d.label) || 'Dispositivo').replace(/[\[\]|]/g, ' ').trim();
    const id = String((d && d.id) || '').replace(/[\[\]|]/g, '').trim();
    const ts = String((d && d.lastSeen) || '').trim();
    return 'Lugar ' + (idx + 1) + ': ' + lbl + ' [ID:' + id + ']' + (ts ? (' (' + ts + ')') : '');
  }).join(' | ');
}

function getGuestPropKeyForEmail_(email) {
  return 'INV_GUEST_DEVS_' + String(email || '').trim().toLowerCase();
}

function checkAndRegisterGuestDevice_(ss, guestUser, rawDeviceId, rawDeviceLabel) {
  const email = String((guestUser && guestUser.correo) || '').trim().toLowerCase();
  const devId = String(rawDeviceId || '').trim().slice(0, 80);
  const devLabel = String(rawDeviceLabel || 'Navegador Web').replace(/[\[\]|]/g, ' ').trim().slice(0, 60) || 'Navegador Web';
  if (!email) {
    return { ok: false, error: 'Correo de invitado inválido.' };
  }
  let maxAllowedPlaces = Math.max(1, Math.min(50, Number(guestUser && guestUser.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
  if (!devId) {
    return { ok: true, slotNumber: 1, activeCount: 1, maxPlaces: maxAllowedPlaces, devices: [] };
  }

  const book = ss || getSpreadsheet_();
  const sh = findInvitadosSheet_(book);
  const props = PropertiesService.getScriptProperties();
  const propKey = getGuestPropKeyForEmail_(email);

  let sheetPlacesText = '';
  let sheetDevicesRaw = '';
  let targetRow = (guestUser && guestUser.rowNum > 0) ? guestUser.rowNum : -1;

  if (sh && sh.getLastRow() >= 2) {
    const maxCols = Math.min(Math.max(sh.getMaxColumns(), 10), 10);
    if (targetRow > 0 && targetRow <= sh.getLastRow()) {
      const rVals = sh.getRange(targetRow, 1, 1, Math.min(sh.getMaxColumns(), maxCols)).getDisplayValues()[0] || [];
      const parsedCols = extractGuestDeviceColsFromRow_(rVals, rVals);
      maxAllowedPlaces = parsedCols.maxPlaces;
      sheetPlacesText = parsedCols.placesText;
      sheetDevicesRaw = parsedCols.devicesRaw;
    } else {
      const allVals = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getMaxColumns(), maxCols)).getDisplayValues();
      for (let r = 0; r < allVals.length; r++) {
        const row = allVals[r] || [];
        const emCand = [row[4], row[0], row[1], row[2], row[3]]
          .map((x) => String(x || '').trim().toLowerCase())
          .find((x) => x === email);
        if (emCand) {
          targetRow = r + 1;
          const parsedCols = extractGuestDeviceColsFromRow_(row, row);
          maxAllowedPlaces = parsedCols.maxPlaces;
          sheetPlacesText = parsedCols.placesText;
          sheetDevicesRaw = parsedCols.devicesRaw;
          break;
        }
      }
    }
  }

  let devices = parseGuestDevicesFromText_(sheetDevicesRaw);

  // Si en la hoja INVITADOS la celda de dispositivos está vacía (ej. el administrador la borró para reiniciar lugares),
  // respetar el reinicio en la hoja si Lugares Activos está vacío o en "0 / N".
  if (devices.length === 0) {
    const wasExplicitlyClearedInSheet = targetRow > 0 && !sheetDevicesRaw && (!sheetPlacesText || /^0\s*\/\s*\d+$/.test(sheetPlacesText));
    if (wasExplicitlyClearedInSheet) {
      try { props.deleteProperty(propKey); } catch (eDel) {}
    } else {
      try {
        const rawProp = props.getProperty(propKey);
        if (rawProp) {
          const parsed = JSON.parse(rawProp);
          if (Array.isArray(parsed)) {
            devices = parsed.filter((d) => d && d.id).slice(0, maxAllowedPlaces);
          }
        }
      } catch (eProp) {}
    }
  }

  const shortNow = formatCancunNow_().slice(0, 16);
  let existingIdx = -1;
  for (let i = 0; i < devices.length; i++) {
    if (String(devices[i].id) === devId) {
      existingIdx = i;
      break;
    }
  }

  if (existingIdx === -1 && devices.length >= maxAllowedPlaces) {
    const placesDesc = devices.map((d, idx) => 'Lugar ' + (idx + 1) + ': ' + (d.label || 'Dispositivo')).join(' · ');
    const pluralLbl = maxAllowedPlaces === 1 ? '1 dispositivo permitido' : (maxAllowedPlaces + ' dispositivos permitidos');
    registrarEventoHistorial_(book, {
      clasificacion: 'ALERTA TÉCNICA',
      modulo: 'AppsScript · INVITADOS (Límite ' + maxAllowedPlaces + ' Dispositivos)',
      evento: 'ACCESO BLOQUEADO POR LÍMITE DE DISPOSITIVOS PERMITIDOS (' + maxAllowedPlaces + ')',
      estado: '⚠️ BLOQUEADO',
      usuario: (guestUser.nombre || email) + ' (' + email + ')',
      sucursal: 'INVITADOS (SOLO VER)',
      referencia: 'Intento en dispositivo extra: ' + devLabel + ' [ID:' + devId + ']',
      detalle: 'El correo ' + email + ' ya tiene sus ' + maxAllowedPlaces + ' lugares ocupados (' + placesDesc + ').',
      analisis: 'Regla activa en hoja INVITADOS (Columna H = ' + maxAllowedPlaces + '): para liberar lugares, borrar la celda de Dispositivos Autorizados (Columna J) o aumentar Dispositivos Permitidos (Columna H).'
    });
    return {
      ok: false,
      limitReached: true,
      activeCount: devices.length,
      maxPlaces: maxAllowedPlaces,
      devices: devices,
      error: 'Acceso bloqueado: Este correo de invitado (' + email + ') ya alcanzó su límite configurado de ' + pluralLbl + ' (' + placesDesc + '). Para abrir en otro equipo, aumenta "Dispositivos Permitidos" (Columna H) o borra la celda "Dispositivos Autorizados" (Columna J) en la hoja INVITADOS.'
    };
  }

  let slotNumber = 1;
  if (existingIdx !== -1) {
    devices[existingIdx].label = devLabel || devices[existingIdx].label;
    devices[existingIdx].lastSeen = shortNow;
    slotNumber = existingIdx + 1;
  } else {
    devices.push({
      id: devId,
      label: devLabel,
      lastSeen: shortNow
    });
    slotNumber = devices.length;
  }

  try {
    props.setProperty(propKey, JSON.stringify(devices));
  } catch (eSaveProp) {}

  if (sh && targetRow > 0) {
    try {
      if (sh.getMaxColumns() < 10) {
        sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
      }
      const statusI = devices.length + ' / ' + maxAllowedPlaces;
      const detailJ = formatGuestDevicesForSheet_(devices, maxAllowedPlaces);
      sh.getRange(targetRow, 8).setValue(maxAllowedPlaces).setHorizontalAlignment('center').setFontWeight('bold');
      sh.getRange(targetRow, 9).setNumberFormat('@').setValue(statusI).setHorizontalAlignment('center').setFontWeight('bold');
      sh.getRange(targetRow, 10).setNumberFormat('@').setValue(detailJ);
      SpreadsheetApp.flush();
    } catch (eWriteSh) {}
  }

  return {
    ok: true,
    slotNumber: slotNumber,
    activeCount: devices.length,
    maxPlaces: maxAllowedPlaces,
    devices: devices
  };
}

function handleInvGuestHeartbeat_(body) {
  const email = String((body && (body.email || body.advisorEmail)) || '').trim().toLowerCase();
  const devId = String((body && body.deviceId) || '').trim();
  const devLabel = String((body && body.deviceLabel) || '').trim();
  if (!email) {
    return { ok: false, error: 'Correo de invitado requerido.' };
  }
  const ss = getSpreadsheet_();
  ensureInvitadosSheet_(ss);
  const allUsers = readAllBranchUsers_(ss, []);
  const guestMatch = allUsers.find((u) => u.correo === email && u.isGuest);
  if (!guestMatch) {
    return {
      ok: false,
      revoked: true,
      error: 'Tu correo ya no aparece activo en la hoja INVITADOS.'
    };
  }
  const devCheck = checkAndRegisterGuestDevice_(ss, guestMatch, devId, devLabel);
  if (!devCheck.ok) {
    return devCheck;
  }
  return {
    ok: true,
    slotNumber: devCheck.slotNumber,
    activeCount: devCheck.activeCount,
    maxPlaces: devCheck.maxPlaces,
    devices: devCheck.devices,
    mustChangeKey: !guestMatch.defKey
  };
}

// ----------------------------------------------------------------------------
// FIRMA CRIPTOGRÁFICA DE SESIÓN POR CORREO Y SUCURSAL/PROYECTO
// ----------------------------------------------------------------------------
function getInvAuthSecret_() {
  const props = PropertiesService.getScriptProperties();
  let sec = props.getProperty('INV_AUTH_SECRET');
  if (!sec || sec.length < 24) {
    sec = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('INV_AUTH_SECRET', sec);
  }
  return sec;
}

function bytesToHex_(bytes) {
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function issueInvAuthToken_(email, sheetTab) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanTab = String(sheetTab || '').trim();
  const payload = cleanEmail + '|' + cleanTab + '|' + Date.now();
  const b64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payload, 'text/plain').getBytes()).replace(/=+$/, '');
  const sig = bytesToHex_(Utilities.computeHmacSha256Signature(payload, getInvAuthSecret_()));
  return b64 + '.' + sig;
}

function verifyInvAuthToken_(token) {
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const b64Part = raw.slice(0, dot);
  const sigPart = raw.slice(dot + 1);
  try {
    const padded = b64Part + '==='.slice((b64Part.length + 3) % 4);
    const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
    const expectedSig = bytesToHex_(Utilities.computeHmacSha256Signature(payload, getInvAuthSecret_()));
    if (expectedSig !== sigPart) return null;
    const parts = payload.split('|');
    if (parts.length < 3) return null;
    const email = String(parts[0] || '').trim().toLowerCase();
    const sheetTab = String(parts[1] || '').trim();
    const issuedMs = Number(parts[2] || 0);
    if (!email || !sheetTab || !issuedMs) return null;
    // Vigencia de 90 días
    if (Date.now() - issuedMs > 90 * 24 * 3600 * 1000) return null;
    return { email: email, sheetTab: sheetTab, issuedMs: issuedMs };
  } catch (e) {
    return null;
  }
}

function readErpAdvisorsFromPlantilla_(ss) {
  const sh = ss.getSheetByName('plantilla');
  const stores = [];
  const advisors = [];
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 30) {
    return { stores: stores, advisors: advisors };
  }
  const maxR = Math.min(sh.getLastRow(), 250);
  const vals = sh.getRange(2, 27, maxR - 1, 4).getValues(); // AA..AD
  for (let i = 0; i < vals.length; i++) {
    const storeItem = String(vals[i][0] || '').trim();
    if (storeItem && stores.indexOf(storeItem) === -1) stores.push(storeItem);
    const label = String(vals[i][1] || '').trim();
    const branch = String(vals[i][2] || '').trim();
    if (branch && stores.indexOf(branch) === -1) stores.push(branch);
    const rawId = vals[i][3];
    const idStr = (rawId !== '' && rawId !== null && rawId !== undefined ? cleanSheetKeyCell_(rawId) : '') || extractErpIdFromLabel_(label);
    if (label) {
      const namePart = label.split('|')[0].trim();
      advisors.push({
        label: label,
        branch: branch,
        id: idStr,
        name: namePart,
        tokens: normAdvisorTokens_(namePart)
      });
    }
  }
  return { stores: stores, advisors: advisors };
}

function matchBestErpAdvisor_(userName, targetErpStore, erpAdvisors) {
  const uToks = normAdvisorTokens_(userName);
  if (!uToks.length || !erpAdvisors.length) return null;
  const uSet = {};
  uToks.forEach((t) => { uSet[t] = true; });

  let best = null;
  let bestScore = -1;
  for (let i = 0; i < erpAdvisors.length; i++) {
    const a = erpAdvisors[i];
    let overlap = 0;
    for (let j = 0; j < a.tokens.length; j++) {
      if (uSet[a.tokens[j]]) overlap++;
    }
    if (overlap <= 0) continue;
    const sameStore = (a.branch.toUpperCase() === String(targetErpStore || '').toUpperCase()) ? 1 : 0;
    const ratio = overlap / Math.max(1, Math.min(uToks.length, a.tokens.length));
    const score = (sameStore * 100) + (overlap * 10) + ratio;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function findUserHeaderRow1Based_(sh) {
  if (!sh || sh.getLastRow() < 1) return -1;
  const checkRows = Math.min(sh.getLastRow(), 4);
  const checkCols = Math.min(sh.getMaxColumns(), 6);
  if (checkCols < 1) return -1;
  const hdrVals = sh.getRange(1, 1, checkRows, checkCols).getDisplayValues();
  for (let r = 0; r < hdrVals.length; r++) {
    const cName = String(hdrVals[r][2] || '').trim();
    const cMail = String(hdrVals[r][4] || '').trim();
    const cColA = String(hdrVals[r][0] || '').trim();
    const cColB = String(hdrVals[r][1] || '').trim();
    if (/^CORREO/i.test(cMail) || /^NOMBRE/i.test(cName) || /^CORREO/i.test(cColA) || /^CORREO/i.test(cColB)) {
      return r + 1;
    }
  }
  return -1;
}

function extractEmailFromGuestRow_(r) {
  if (!Array.isArray(r)) return '';
  const candidates = [r[4], r[0], r[1], r[2], r[3]];
  for (let i = 0; i < candidates.length; i++) {
    const s = String(candidates[i] || '').trim().toLowerCase();
    if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      return s;
    }
  }
  return '';
}

function deriveGuestNameFromRow_(r, correo) {
  const c2 = String((r && r[2]) || '').trim();
  if (c2 && c2.indexOf('@') === -1 && !/^NOMBRE$/i.test(c2)) return c2;
  const c1 = String((r && r[1]) || '').trim();
  if (c1 && c1.indexOf('@') === -1 && !/^(INVITADOS?|SOLO\s*VER|MODALIDAD|SUCURSAL)/i.test(c1)) return c1;
  const prefix = String(correo || '').split('@')[0] || 'Invitado';
  return prefix.replace(/[._-]+/g, ' ').toUpperCase();
}

function readAllBranchUsers_(ss, erpAdvisors) {
  const list = [];
  for (let t = 0; t < INV_USER_TABS_.length; t++) {
    const cfg = INV_USER_TABS_[t];
    let sh = ss.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = ss.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(ss);
    if (!sh) continue;

    const hdrRow = findUserHeaderRow1Based_(sh);
    if (!cfg.isGuest && (hdrRow < 1 || sh.getLastRow() <= hdrRow)) continue;
    if (cfg.isGuest && sh.getLastRow() < 1) continue;

    const actualTabName = sh.getName();
    const startRow = hdrRow >= 1 ? (hdrRow + 1) : 1;
    const numRows = sh.getLastRow() - startRow + 1;
    if (numRows <= 0) continue;

    const colsToRead = Math.min(sh.getMaxColumns(), 10); // A..J
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues();

    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      const dr = dispVals[i] || [];
      const correo = cfg.isGuest
        ? extractEmailFromGuestRow_(r)
        : String(r[4] || '').trim().toLowerCase();
      if (!correo || correo.indexOf('@') === -1) continue;

      const tempKey = colsToRead >= 6 ? cleanSheetKeyCell_(r[5]) : '';
      const defKey = colsToRead >= 7 ? cleanSheetKeyCell_(r[6]) : '';
      const colH = colsToRead >= 8 ? String(dr[7] || r[7] || '').trim() : '';
      const colI = colsToRead >= 9 ? String(dr[8] !== '' ? dr[8] : (r[8] !== undefined ? r[8] : '')).trim() : '';

      if (cfg.isGuest) {
        const guestNombre = deriveGuestNameFromRow_(r, correo);
        const rawPuesto = String(r[3] || '').trim();
        const guestPuesto = (rawPuesto && rawPuesto.indexOf('@') === -1) ? rawPuesto : 'Invitado (Solo Ver)';
        const guestCols = extractGuestDeviceColsFromRow_(r, dr);
        const parsedDevs = parseGuestDevicesFromText_(guestCols.devicesRaw);
        list.push({
          sheetTab: actualTabName,
          rowNum: startRow + i,
          isAdmin: false,
          isManager: false,
          isGuest: true,
          soloLectura: true,
          noPasswordRequired: !tempKey && !defKey,
          maxDiscountPct: 0,
          branchKey: 'INVITADOS',
          branchLabel: 'Invitados (Solo Ver)',
          erpStore: 'SOLO LECTURA',
          orderPrefix: 'INV',
          quoteType: 'SOLO_VER',
          isProyecto: false,
          serieLabel: 'Modo Invitado · Solo Ver (Máx. ' + guestCols.maxPlaces + (guestCols.maxPlaces === 1 ? ' Dispositivo)' : ' Dispositivos)'),
          nombre: guestNombre,
          puesto: guestPuesto,
          correo: correo,
          tempKey: tempKey,
          defKey: defKey,
          mustChangeKey: !defKey,
          erpAdvisorLabel: '',
          erpAdvisorId: '',
          erpAdvisorBranch: '',
          guestPlacesText: guestCols.placesText,
          guestDevicesRaw: guestCols.devicesRaw,
          guestDevices: parsedDevs,
          guestMaxPlaces: guestCols.maxPlaces
        });
        continue;
      }

      const nombre = String(r[2] || '').trim();
      const puesto = String(r[3] || '').trim();

      let explicitAdvisorLabel = '';
      let explicitAdvisorId = '';
      let explicitDiscountPct = parseDiscountPctCell_(colI);
      if (explicitDiscountPct === null && parseDiscountPctCell_(colH) !== null && !extractErpIdFromLabel_(colH)) {
        explicitDiscountPct = parseDiscountPctCell_(colH);
      } else if (colH) {
        explicitAdvisorId = extractErpIdFromLabel_(colH);
        if (colH.indexOf('|') !== -1 || explicitAdvisorId) {
          explicitAdvisorLabel = colH;
        }
      }

      let matchedErp = null;
      if (explicitAdvisorId && erpAdvisors.length > 0) {
        for (let k = 0; k < erpAdvisors.length; k++) {
          if (String(erpAdvisors[k].id) === String(explicitAdvisorId)) {
            matchedErp = erpAdvisors[k];
            break;
          }
        }
      }
      if (!matchedErp) {
        matchedErp = matchBestErpAdvisor_(nombre, cfg.erpStore, erpAdvisors);
      }

      const resolvedErpLabel = (matchedErp && matchedErp.label) || explicitAdvisorLabel || '';
      const resolvedErpId = (matchedErp && matchedErp.id) || explicitAdvisorId || '';
      const resolvedErpBranch = (matchedErp && matchedErp.branch) || '';
      const isAdminUser = !!cfg.isAdmin || !!ADMIN_MASTER_EMAILS_[correo] || /ADMINISTRADOR/i.test(puesto);
      const userErpStore = (isAdminUser && resolvedErpBranch) ? resolvedErpBranch : cfg.erpStore;
      const userPrefix = getStoreFolioPrefix_(userErpStore, cfg.orderPrefix);

      list.push({
        sheetTab: actualTabName,
        rowNum: startRow + i,
        isAdmin: isAdminUser,
        isGuest: false,
        maxDiscountPct: explicitDiscountPct,
        branchKey: isAdminUser ? 'ADMIN' : cfg.branchKey,
        branchLabel: cfg.label,
        erpStore: userErpStore,
        orderPrefix: userPrefix,
        quoteType: isAdminUser ? 'ADMINISTRATIVO' : cfg.quoteType,
        isProyecto: !isAdminUser && !!cfg.isProyecto,
        serieLabel: cfg.serieLabel,
        nombre: nombre,
        puesto: puesto,
        correo: correo,
        tempKey: tempKey,
        defKey: defKey,
        mustChangeKey: !defKey && !!tempKey,
        erpAdvisorLabel: resolvedErpLabel,
        erpAdvisorId: resolvedErpId,
        erpAdvisorBranch: resolvedErpBranch
      });
    }
  }
  return list;
}

function sanitizeUserForClient_(u, includeSignedToken) {
  const isGuest = !!(u && (u.isGuest || String(u.branchKey || u.sheetTab || '').toUpperCase() === 'INVITADOS'));
  const out = {
    sheetTab: u.sheetTab,
    rowNum: u.rowNum,
    isAdmin: !isGuest && !!u.isAdmin,
    isManager: !isGuest && isManagerUserRole_(u),
    isGuest: isGuest,
    soloLectura: isGuest,
    maxDiscountPct: isGuest ? 0 : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
    branchKey: isGuest ? 'INVITADOS' : u.branchKey,
    branchLabel: u.branchLabel,
    erpStore: isGuest ? 'SOLO LECTURA' : u.erpStore,
    orderPrefix: isGuest ? 'INV' : (u.orderPrefix || 'PTC'),
    quoteType: isGuest ? 'SOLO_VER' : (u.quoteType || 'SUCURSAL'),
    isProyecto: !isGuest && !!u.isProyecto,
    serieLabel: u.serieLabel || '',
    nombre: u.nombre,
    puesto: u.puesto,
    correo: u.correo,
    mustChangeKey: !!u.mustChangeKey,
    erpAdvisorLabel: isGuest ? '' : (u.erpAdvisorLabel || ''),
    erpAdvisorId: isGuest ? '' : (u.erpAdvisorId || ''),
    erpAdvisorBranch: isGuest ? '' : (u.erpAdvisorBranch || '')
  };
  if (isGuest) {
    out.guestSlotNum = u.guestSlotNum || 1;
    out.guestActivePlaces = u.guestActivePlaces || 1;
    out.guestMaxPlaces = Math.max(1, Math.min(50, Number(u.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
  }
  if (!isGuest && Array.isArray(u.branchAdvisorEmails)) {
    out.branchAdvisorEmails = u.branchAdvisorEmails;
  }
  if (includeSignedToken) {
    out.authToken = issueInvAuthToken_(u.correo, u.sheetTab);
  }
  return out;
}

function handleInvUsersDirectory_() {
  const ss = getSpreadsheet_();
  try { ensureInvitadosSheet_(ss); } catch (e) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const users = readAllBranchUsers_(ss, erpMeta.advisors);
  return {
    ok: true,
    stores: erpMeta.stores,
    advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id })),
    users: users.map((u) => sanitizeUserForClient_(u, false))
  };
}

function keysEqualNormalized_(inputVal, storedVal) {
  const a = String(inputVal || '').trim();
  const b = String(storedVal || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const aCompact = a.replace(/\s+/g, '');
  const bCompact = b.replace(/\s+/g, '');
  return !!aCompact && aCompact === bCompact;
}

function tabsMatchNormalized_(tabA, tabB) {
  const a = String(tabA || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
  const b = String(tabB || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
  return !!a && a === b;
}

function handleInvLogin_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const inputKey = String(body.accessKey || '').trim();
  const selectedTab = String(body.sheetTab || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const deviceLabel = String(body.deviceLabel || '').trim();
  if (!email) {
    return { ok: false, error: 'Ingresa tu correo electrónico.' };
  }

  ensureLiveErpSyncTrigger_();
  const ss = getSpreadsheet_();
  try { ensureInvitadosSheet_(ss); } catch (eInv) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const allUsers = readAllBranchUsers_(ss, erpMeta.advisors);
  const emailMatches = allUsers.filter((u) => u.correo === email);
  if (!emailMatches.length) {
    return { ok: false, error: 'El correo ingresado no está registrado en ninguna hoja de sucursal ni en INVITADOS.' };
  }

  const validMatches = emailMatches.filter((u) => {
    if (u.isGuest && u.noPasswordRequired) {
      return true;
    }
    if (!inputKey) return false;
    if (u.defKey) {
      return keysEqualNormalized_(inputKey, u.defKey);
    }
    if (u.tempKey) {
      return keysEqualNormalized_(inputKey, u.tempKey);
    }
    return false;
  });

  if (!validMatches.length) {
    if (!inputKey) {
      return { ok: false, error: 'Ingresa tu contraseña para acceder con tu cuenta.' };
    }
    registrarEventoHistorial_(ss, {
      clasificacion: 'ALERTA TÉCNICA',
      modulo: 'AppsScript · handleInvLogin_',
      evento: 'INTENTO DE ACCESO CON CONTRASEÑA INCORRECTA',
      estado: '⚠️ RECHAZADO',
      usuario: email,
      sucursal: selectedTab || (emailMatches[0] && emailMatches[0].erpStore) || 'INVENTARIO WEB',
      referencia: 'Autenticación',
      detalle: 'Contraseña ingresada no coincide con la clave activa del usuario (' + email + ').',
      analisis: 'Validación de acceso ejecutada sin alterar la sesión ni las claves almacenadas.'
    });
    return { ok: false, error: 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.' };
  }

  // Si el usuario está dado de alta en varias tiendas/bodegas y su contraseña ya fue validada en al menos una de ellas,
  // incluir todas las tiendas/bodegas donde esté registrado su correo para que pueda elegir y cambiar de tienda libremente.
  const hasValidNonGuestMatch = validMatches.some((u) => !u.isGuest);
  const candidateMatches = hasValidNonGuestMatch
    ? emailMatches.filter((u) => !u.isGuest)
    : validMatches;
  const matchedViaDefKey = validMatches.some((u) => !!u.defKey && keysEqualNormalized_(inputKey, u.defKey));
  const hasAnyDefKeyForEmail = candidateMatches.some((u) => !!u.defKey);

  // Si la cuenta que inicia sesión pertenece a INVITADOS, verificar y registrar el límite de dispositivos configurado en Columna H
  const checkedMatches = [];
  let guestLimitError = null;
  for (let mIdx = 0; mIdx < candidateMatches.length; mIdx++) {
    const cand = candidateMatches[mIdx];
    if (cand.isGuest) {
      const devCheck = checkAndRegisterGuestDevice_(ss, cand, deviceId, deviceLabel);
      if (!devCheck.ok) {
        guestLimitError = devCheck;
        continue;
      }
      cand.guestSlotNum = devCheck.slotNumber;
      cand.guestActivePlaces = devCheck.activeCount;
      cand.guestMaxPlaces = devCheck.maxPlaces;
    }
    checkedMatches.push(cand);
  }

  if (!checkedMatches.length && guestLimitError) {
    return guestLimitError;
  }

  // Emitir tokens firmados para todas las ubicaciones autorizadas de este correo
  const authorizedLocs = checkedMatches.map((u) => {
    const usedTemp = !matchedViaDefKey && !hasAnyDefKeyForEmail && !u.defKey && ((!!u.tempKey && keysEqualNormalized_(inputKey, u.tempKey)) || (u.isGuest && u.noPasswordRequired));
    const sanitized = sanitizeUserForClient_(u, true);
    sanitized.mustChangeKey = usedTemp;
    if (sanitized.isManager && !sanitized.isAdmin && !sanitized.isGuest) {
      const mgrStoreNorm = normalizeQuoteErpStore_(sanitized.erpStore, sanitized.sheetTab);
      sanitized.branchAdvisorEmails = Object.keys(getAllowedAdvisorEmailsForManager_(allUsers, sanitized, mgrStoreNorm));
    }
    return sanitized;
  });

  const allGuestsOnly = authorizedLocs.every((u) => !!u.isGuest);
  const folioSnap = allGuestsOnly
    ? { maxByPrefix: {}, nextFolioByStore: {}, recentErpQuotes: [] }
    : computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);

  if (authorizedLocs.length > 1 && !selectedTab) {
    return {
      ok: true,
      chooseBranch: true,
      locations: authorizedLocs,
      nextFolioByStore: folioSnap.nextFolioByStore,
      stores: erpMeta.stores,
      advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id }))
    };
  }

  const chosenOut = selectedTab
    ? (authorizedLocs.find((u) => tabsMatchNormalized_(u.sheetTab, selectedTab) || tabsMatchNormalized_(u.branchKey, selectedTab)) || authorizedLocs[0])
    : authorizedLocs[0];

  const nextOrderCode = chosenOut.isGuest ? '' : peekNextStoreErpFolio_(chosenOut.erpStore, chosenOut.orderPrefix, folioSnap);
  const guestMaxCap = chosenOut.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL_;

  registrarEventoHistorial_(ss, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'AppsScript · handleInvLogin_',
    evento: chosenOut.isGuest ? 'INGRESO DE INVITADO (MODO SOLO VER)' : 'INICIO DE SESIÓN EN INVENTARIO',
    estado: '✅ OK',
    usuario: (chosenOut.nombre || email) + ' (' + email + ')',
    sucursal: chosenOut.isGuest ? 'INVITADOS (SOLO VER)' : (chosenOut.erpStore || chosenOut.sheetTab || ''),
    referencia: chosenOut.isGuest
      ? ('Lugar ' + (chosenOut.guestSlotNum || 1) + ' de ' + guestMaxCap + ' · Solo Ver')
      : ('Serie ' + (chosenOut.orderPrefix || '') + ' · Desc. máx ' + getMaxDiscountPctForUser_(chosenOut) + '%'),
    detalle: chosenOut.isGuest
      ? ('Acceso de invitado en Modo Solo Lectura (' + (deviceLabel || 'Dispositivo') + '). Sin cotizar ni hacer descuentos.')
      : ('Acceso autenticado en ubicación ' + (chosenOut.branchLabel || chosenOut.erpStore) + (authorizedLocs.length > 1 ? (' (' + authorizedLocs.length + ' tiendas asignadas)') : '') + '.'),
    analisis: chosenOut.isGuest
      ? ('Control activo de hoja INVITADOS: solo ver y máximo ' + guestMaxCap + ' dispositivos permitidos (Columna H).')
      : 'Token HMAC emitido correctamente para sesión activa.'
  });

  return {
    ok: true,
    chooseBranch: false,
    user: chosenOut,
    nextOrderCode: nextOrderCode,
    nextFolioByStore: chosenOut.isGuest ? {} : folioSnap.nextFolioByStore,
    allLocationsForEmail: authorizedLocs,
    stores: chosenOut.isGuest ? [] : erpMeta.stores,
    advisors: chosenOut.isGuest ? [] : erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id }))
  };
}

function handleInvUpdateKey_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const currentKey = String(body.currentKey || '').trim();
  const newKey = String(body.newKey || '').trim();
  const activeTab = String(body.sheetTab || '').trim();
  if (!email || !newKey) {
    return { ok: false, error: 'Datos incompletos para actualizar la contraseña.' };
  }
  if (newKey.length < 4) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' };
  }

  const ss = getSpreadsheet_();
  const tokenCheck = verifyInvAuthToken_(body.authToken);
  const tokenMatchesEmail = !!(tokenCheck && tokenCheck.email === email);
  const matchedTargets = [];
  let anyAuthorized = tokenMatchesEmail || !currentKey;

  for (let t = 0; t < INV_USER_TABS_.length; t++) {
    const cfg = INV_USER_TABS_[t];
    let sh = ss.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = ss.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(ss);
    if (!sh) continue;
    const hdrRow = findUserHeaderRow1Based_(sh);
    if (hdrRow < 1 || sh.getLastRow() <= hdrRow) continue;
    const startRow = hdrRow + 1;
    const numRows = sh.getLastRow() - hdrRow;
    const vals = sh.getRange(startRow, 1, numRows, 7).getValues();
    for (let i = 0; i < vals.length; i++) {
      const rowEmail = cfg.isGuest ? extractEmailFromGuestRow_(vals[i]) : String(vals[i][4] || '').trim().toLowerCase();
      if (rowEmail !== email) continue;
      const tempKey = cleanSheetKeyCell_(vals[i][5]);
      const defKey = cleanSheetKeyCell_(vals[i][6]);
      if (keysEqualNormalized_(currentKey, tempKey) || keysEqualNormalized_(currentKey, defKey) || (cfg.isGuest && !tempKey && !defKey)) {
        anyAuthorized = true;
      }
      matchedTargets.push({ sh: sh, rowNum: startRow + i, tabName: sh.getName() });
    }
  }

  if (!matchedTargets.length || !anyAuthorized) {
    return { ok: false, error: 'No fue posible validar el usuario para actualizar la contraseña en la hoja.' };
  }

  const tokensByTab = {};
  for (let k = 0; k < matchedTargets.length; k++) {
    const tgt = matchedTargets[k];
    // Borrar la contraseña temporal (Columna F = 6) y guardar la nueva definitiva (Columna G = 7)
    tgt.sh.getRange(tgt.rowNum, 6).clearContent();
    tgt.sh.getRange(tgt.rowNum, 7).setNumberFormat('@').setValue(newKey);
    tokensByTab[tgt.tabName] = issueInvAuthToken_(email, tgt.tabName);
  }

  SpreadsheetApp.flush();
  sincronizarPasswordEnHojaSeguimiento_(email, newKey);
  const primaryTab = activeTab && tokensByTab[activeTab] ? activeTab : matchedTargets[0].tabName;

  registrarEventoHistorial_(ss, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'AppsScript · handleInvUpdateKey_',
    evento: 'ACTUALIZACIÓN DE CONTRASEÑA PERSONAL',
    estado: '✅ OK',
    usuario: email,
    sucursal: matchedTargets.map((x) => x.tabName).join(', '),
    referencia: 'Clave personal activada',
    detalle: 'Contraseña definitiva guardada en Columna G y clave temporal limpiada en ' + matchedTargets.length + ' hoja(s).',
    analisis: 'Tokens de sesión renovados automáticamente.'
  });

  return {
    ok: true,
    updatedRows: matchedTargets.length,
    authToken: tokensByTab[primaryTab] || issueInvAuthToken_(email, primaryTab),
    tokensByTab: tokensByTab
  };
}

/**
 * Verifica que quien cotiza sea EXCLUSIVAMENTE el titular autenticado del correo y de cualquiera de sus ubicaciones asignadas.
 */
function resolveAuthenticatedAdvisor_(ss, erpAdvisors, body) {
  const allUsers = readAllBranchUsers_(ss, erpAdvisors);
  const verifiedToken = verifyInvAuthToken_(body && body.authToken);
  const reqTab = String((body && body.sheetTab) || '').trim();
  const reqStore = String((body && body.erpStore) || '').trim();

  let targetEmail = '';
  let tokenTab = '';

  if (verifiedToken && verifiedToken.email) {
    targetEmail = verifiedToken.email;
    tokenTab = verifiedToken.sheetTab;
  } else {
    const reqEmail = String((body && body.advisorEmail) || '').trim().toLowerCase();
    const reqKey = String((body && body.accessKey) || '').trim();
    if (reqEmail) {
      const matchByKey = allUsers.find((u) => {
        if (u.correo !== reqEmail) return false;
        if (u.isGuest && !u.defKey && !u.tempKey) return true;
        if (!reqKey) return false;
        if (u.defKey) return keysEqualNormalized_(reqKey, u.defKey);
        if (u.tempKey) return keysEqualNormalized_(reqKey, u.tempKey);
        return false;
      });
      if (matchByKey) {
        targetEmail = matchByKey.correo;
        tokenTab = reqTab || matchByKey.sheetTab;
      }
    }
  }

  if (!targetEmail) {
    return {
      ok: false,
      authRequired: true,
      error: 'Por seguridad, vuelve a confirmar tu correo y contraseña personal para emitir cotizaciones con tu usuario exclusivo.'
    };
  }

  const userMatches = allUsers.filter((u) => u.correo === targetEmail);
  if (!userMatches.length) {
    return {
      ok: false,
      authRequired: true,
      error: 'El correo de la sesión ya no aparece activo en las hojas de usuarios.'
    };
  }

  // Si el usuario está asignado a varias tiendas/bodegas, permitirle cotizar en cualquiera de las hojas donde esté su correo
  let chosen = null;
  if (reqTab) {
    chosen = userMatches.find((u) => !u.isGuest && (tabsMatchNormalized_(u.sheetTab, reqTab) || tabsMatchNormalized_(u.branchKey, reqTab))) || null;
  }
  if (!chosen && reqStore) {
    const reqStoreNorm = normalizeQuoteErpStore_(reqStore, reqTab);
    chosen = userMatches.find((u) => !u.isGuest && normalizeQuoteErpStore_(u.erpStore, u.sheetTab) === reqStoreNorm) || null;
  }
  if (!chosen && tokenTab) {
    chosen = userMatches.find((u) => tabsMatchNormalized_(u.sheetTab, tokenTab) || tabsMatchNormalized_(u.branchKey, tokenTab)) || null;
  }
  if (!chosen) {
    chosen = userMatches.find((u) => !u.isGuest) || userMatches[0];
  }

  if (!chosen) {
    return {
      ok: false,
      authRequired: true,
      error: 'Tu correo no tiene permisos asignados en la ubicación solicitada.'
    };
  }

  const hasAnyDefKey = userMatches.some((u) => !!u.defKey);
  if (chosen.mustChangeKey && !hasAnyDefKey) {
    return {
      ok: false,
      authRequired: true,
      error: 'Debes establecer primero tu contraseña definitiva antes de generar cotizaciones.'
    };
  }

  return { ok: true, advisor: chosen, userMatches: userMatches, allUsers: allUsers };
}

// ----------------------------------------------------------------------------
// BITÁCORA Y FOLIOS OFICIALES POR TIENDA / BODEGA EN S MUEBLERÍA
// ----------------------------------------------------------------------------
function ensureQuotesLedgerSheet_(ss) {
  let sh = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const headers = [
    'ORDEN_SUCURSAL',
    'FOLIO_SMUEBLERIA',
    'ID_COTIZACION_ERP',
    'FECHA_HORA',
    'MODALIDAD_ORIGEN',
    'HOJA_UBICACION',
    'TIENDA_ERP',
    'CORREO_ASESOR',
    'NOMBRE_ASESOR',
    'USUARIO_ERP',
    'ID_USUARIO_ERP',
    'CLIENTE_PROYECTO',
    'TELEFONO',
    'MODALIDAD_CLIENTE',
    'CATEGORIA_ERP',
    'ENTREGA_TENTATIVA',
    'PARTIDAS_CANT',
    'RESUMEN_SKUS',
    'SUBTOTAL_SIN_IVA',
    'IVA',
    'DESCUENTO_EXTRA',
    'TOTAL_CON_IVA',
    'ESTADO_ERP',
    'NOTAS'
  ];

  if (!sh) {
    sh = ss.insertSheet(TAB_QUOTES_LIVE_, ss.getSheets().length);
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(1, 1, 1, 3).setBackground('#A38251');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Descuento máximo permitido:
 * 1) Administradores (Santiago y Kevin): 100%
 * 2) Gerentes / Subgerentes: 100%
 * 3) Asesores: 30% vigente hasta el día 30 de noviembre de 2026 (America/Cancun); 24% automático a partir del 01/12/2026
 * 4) Columna I ("Descuento" junto a Usuario/ID Asesor): porcentaje o fórmula dinámica configurada en la hoja
 */
function isAdvisorPromo30Active_() {
  let ymd = '';
  try {
    ymd = Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd');
  } catch (e) {
    ymd = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT-5', 'yyyy-MM-dd');
  }
  return ymd <= ADVISOR_PROMO_END_YMD_;
}

function getMaxDiscountPctForPuesto_(puesto) {
  const p = String(puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(p)) return 0;
  if (/ADMINISTRADOR|GERENTE|\bSUB/.test(p)) return 100;
  return isAdvisorPromo30Active_() ? 30 : 24;
}

function getMaxDiscountPctForUser_(u) {
  const promoActive = isAdvisorPromo30Active_();
  const defaultAdvPct = promoActive ? 30 : 24;
  if (!u) return defaultAdvPct;
  if (u.isGuest || u.soloLectura || String(u.sheetTab || '').toUpperCase() === 'INVITADOS') return 0;
  if (u.isAdmin) return 100;
  const p = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(p)) return 0;
  const isMgr = /ADMINISTRADOR|GERENTE|\bSUB/.test(p);
  if (u.maxDiscountPct !== null && u.maxDiscountPct !== undefined && isFinite(Number(u.maxDiscountPct))) {
    const rawPct = Math.max(0, Math.min(100, Number(u.maxDiscountPct)));
    if (!isMgr) {
      if (promoActive && rawPct === 24) return 30;
      if (!promoActive && rawPct === 30) return 24;
    }
    return rawPct;
  }
  return isMgr ? 100 : defaultAdvPct;
}

function invalidateErpFoliosCache_() {
  try {
    CacheService.getScriptCache().remove('inv_erp_folios_v1');
  } catch (e) {}
}

function observeFolioString_(rawFolio, maxByPrefix) {
  const s = String(rawFolio || '').trim().toUpperCase();
  if (!s || /^[A-Z]+-\d+$/.test(s)) return null;
  const m = s.match(/^([A-Z]{2,5})\s*(\d{2,8})$/);
  if (!m) return null;
  const pfx = m[1];
  const num = parseInt(m[2], 10);
  if (!num || num <= 0) return null;
  if (!maxByPrefix[pfx] || num > maxByPrefix[pfx]) {
    maxByPrefix[pfx] = num;
  }
  return { pfx: pfx, num: num, clean: pfx + String(num) };
}

/**
 * Consulta en vivo los folios oficiales de S Mueblería según tienda/bodega (PL, DTC, OUT, PTC, CCB, PRO, CED, ADM)
 * directamente desde ObtenerCotizacionesTodas + bitácora COTIZACIONES_EN_VIVO, con caché corto de 45s.
 */
function computeLiveErpFoliosAndQuotes_(ss, erpAdvisors) {
  const maxByPrefix = {};
  let recentErpQuotes = [];
  let loadedFromCache = false;

  try {
    const cachedRaw = CacheService.getScriptCache().get('inv_erp_folios_v1');
    if (cachedRaw) {
      const parsedCache = JSON.parse(cachedRaw);
      if (parsedCache && parsedCache.maxByPrefix) {
        Object.keys(parsedCache.maxByPrefix).forEach((k) => {
          maxByPrefix[k] = Number(parsedCache.maxByPrefix[k]) || 0;
        });
        if (Array.isArray(parsedCache.recentErpQuotes)) {
          recentErpQuotes = parsedCache.recentErpQuotes;
        }
        loadedFromCache = true;
      }
    }
  } catch (ce) {}

  if (!loadedFromCache) {
    const advById = {};
    if (Array.isArray(erpAdvisors)) {
      for (let i = 0; i < erpAdvisors.length; i++) {
        const a = erpAdvisors[i];
        if (a && a.id) advById[String(a.id)] = a;
      }
    }

    try {
      const cfg = getErpRuntimeConfig_();
      const xmlCot = callSmuebleriaWcf_(
        'ObtenerCotizacionesTodas',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
      );
      if (xmlCot) {
        const idMatches = [];
        const idScanRe = /<(?:[a-zA-Z0-9_]+:)?IdVenta>(\d+)<\/(?:[a-zA-Z0-9_]+:)?IdVenta>/g;
        let im;
        while ((im = idScanRe.exec(xmlCot)) !== null) {
          idMatches.push({ index: im.index, endIndex: im.index + im[0].length, idStr: im[1] });
        }

        const rawErpItems = [];
        const boundaryRe = /<\/([a-zA-Z0-9_:]+)>\s*<\1[\s>]/g;
        for (let idx = 0; idx < idMatches.length; idx++) {
          const cur = idMatches[idx];
          const prevEnd = idx > 0 ? idMatches[idx - 1].endIndex : Math.max(0, cur.index - 3500);
          const nextStart = idx + 1 < idMatches.length ? idMatches[idx + 1].index : Math.min(xmlCot.length, cur.endIndex + 3500);

          const beforeSeg = xmlCot.slice(Math.max(prevEnd, cur.index - 3500), cur.index);
          boundaryRe.lastIndex = 0;
          let bMatch;
          let startOffsetInBefore = 0;
          while ((bMatch = boundaryRe.exec(beforeSeg)) !== null) {
            startOffsetInBefore = bMatch.index + bMatch[0].indexOf('<', 2);
          }

          const afterSeg = xmlCot.slice(cur.index, Math.min(nextStart, cur.endIndex + 3500));
          boundaryRe.lastIndex = 0;
          const afterBound = boundaryRe.exec(afterSeg);
          const recordAfter = afterBound
            ? afterSeg.slice(0, afterBound.index + afterBound[0].indexOf('>') + 1)
            : afterSeg;

          const blk = beforeSeg.slice(startOffsetInBefore) + recordAfter;
          const folioStr = extractXmlTag_(blk, 'Folio');
          if (!folioStr) continue;
          const obs = observeFolioString_(folioStr, maxByPrefix);
          const idVentaNum = parseInt(cur.idStr, 10) || 0;
          if (idVentaNum > 0 && obs) {
            const idUsu = extractXmlTag_(blk, 'IdUsuario');
            const advInfo = idUsu && advById[idUsu] ? advById[idUsu] : null;
            const storeFromAdv = (advInfo && advInfo.branch) || ERP_PREFIX_TO_STORE_[obs.pfx] || obs.pfx;
            const totalNum = parseFloat(extractXmlTag_(blk, 'Total') || '0') || 0;
            const fechaRaw = extractXmlTag_(blk, 'FechaVenta') || extractXmlTag_(blk, 'Fecha') || extractXmlTag_(blk, 'FechaCreacion');
            rawErpItems.push({
              idNum: idVentaNum,
              orderCode: obs.clean,
              folio: obs.clean,
              quoteId: String(idVentaNum),
              createdAt: fechaRaw ? fechaRaw.replace('T', ' ').slice(0, 16) : '',
              quoteType: /PROYECTO/i.test(storeFromAdv) ? 'PROYECTO' : 'SUCURSAL',
              branchTab: storeFromAdv,
              erpStore: storeFromAdv,
              advisorName: (advInfo && advInfo.name) || extractXmlTag_(blk, 'Vendedor') || extractXmlTag_(blk, 'Usuario') || '',
              erpAdvisor: (advInfo && advInfo.label) || '',
              erpUserId: idUsu || '',
              clientName: extractXmlTag_(blk, 'Nombre') || extractXmlTag_(blk, 'Cliente') || 'Prospecto S Mueblería',
              itemsCount: '',
              skusSummary: '',
              total: totalNum > 0 ? formatMoney_(totalNum) : '',
              status: extractXmlTag_(blk, 'Estatus') || 'EN S MUEBLERÍA'
            });
          }
        }
        rawErpItems.sort((a, b) => b.idNum - a.idNum);
        recentErpQuotes = rawErpItems.slice(0, 40);
      }
    } catch (wcfErr) {
      Logger.log('Aviso al leer folios en vivo desde ObtenerCotizacionesTodas: ' + wcfErr);
    }

    try {
      CacheService.getScriptCache().put('inv_erp_folios_v1', JSON.stringify({
        maxByPrefix: maxByPrefix,
        recentErpQuotes: recentErpQuotes
      }), 45);
    } catch (ceSave) {}
  }

  // Combinar siempre con COTIZACIONES_EN_VIVO por si se acaba de registrar una cotización
  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const qCols = shQuotes.getRange(2, 1, shQuotes.getLastRow() - 1, 2).getDisplayValues();
    for (let i = 0; i < qCols.length; i++) {
      observeFolioString_(qCols[i][1], maxByPrefix);
      observeFolioString_(qCols[i][0], maxByPrefix);
    }
  }

  const nextFolioByStore = {};
  Object.keys(ERP_STORE_FOLIO_SERIES_).forEach((storeName) => {
    const pfx = ERP_STORE_FOLIO_SERIES_[storeName];
    if (maxByPrefix[pfx] && maxByPrefix[pfx] > 0) {
      nextFolioByStore[storeName] = pfx + String(maxByPrefix[pfx] + 1);
    }
  });

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: nextFolioByStore,
    recentErpQuotes: recentErpQuotes
  };
}

function peekNextStoreErpFolio_(erpStore, fallbackPrefix, folioSnap) {
  const storeUp = String(erpStore || '').trim().toUpperCase();
  const pfx = getStoreFolioPrefix_(storeUp, fallbackPrefix);
  if (folioSnap && folioSnap.nextFolioByStore && folioSnap.nextFolioByStore[storeUp]) {
    return folioSnap.nextFolioByStore[storeUp];
  }
  if (folioSnap && folioSnap.maxByPrefix && folioSnap.maxByPrefix[pfx] > 0) {
    return pfx + String(folioSnap.maxByPrefix[pfx] + 1);
  }
  return 'Serie ' + pfx;
}

function isManagerUserRole_(uOrPuesto) {
  if (!uOrPuesto) return false;
  if (typeof uOrPuesto === 'object' && uOrPuesto.isAdmin) return false;
  const rawPuesto = typeof uOrPuesto === 'object' ? (uOrPuesto.puesto || '') : String(uOrPuesto || '');
  const pNorm = normPlainUpper_(rawPuesto);
  return /GERENTE|\bSUB/.test(pNorm);
}

function normalizeQuoteErpStore_(rawStore, rawBranchTab) {
  const candidates = [rawStore, rawBranchTab];
  for (let c = 0; c < candidates.length; c++) {
    const s = normPlainUpper_(candidates[c]);
    if (!s) continue;
    if (ERP_STORE_FOLIO_SERIES_[s]) return s;
    for (let i = 0; i < INV_USER_TABS_.length; i++) {
      const cfg = INV_USER_TABS_[i];
      if (
        normPlainUpper_(cfg.erpStore) === s ||
        normPlainUpper_(cfg.tab) === s ||
        normPlainUpper_(cfg.branchKey) === s ||
        normPlainUpper_(cfg.label) === s
      ) {
        return normPlainUpper_(cfg.erpStore);
      }
    }
    if (s === 'COLOSIO' || s === 'COLOCIO') return 'CREATA LIVING COLOSIO';
    if (s === 'PLAYA') return 'CREATA LIVING PLAYA';
    if (s === 'PTC' || s === 'PUERTO CANCUN') return 'CREATA PUERTO CANCUN';
    if (s === 'CASA CREATA') return 'CASA CREATA BONAMPAK';
    if (s === 'PROYECTOS') return 'PROYECTOS ANIPA INTERIOR';
    return s;
  }
  return '';
}

function getAllowedAdvisorEmailsForManager_(allUsers, managerUser, activeStoreNorm) {
  const allowed = {};
  const mgrEmail = String((managerUser && managerUser.correo) || '').trim().toLowerCase();
  if (mgrEmail) allowed[mgrEmail] = true;
  const storeTarget = activeStoreNorm || normalizeQuoteErpStore_(managerUser && managerUser.erpStore, managerUser && managerUser.sheetTab);
  if (!storeTarget || !Array.isArray(allUsers)) return allowed;

  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    if (!u || !u.correo) continue;
    const em = String(u.correo).trim().toLowerCase();
    if (!em) continue;
    if (em === mgrEmail) {
      allowed[em] = true;
      continue;
    }
    // Regla estricta: el gerente solo ve sus propias cotizaciones y las de los asesores de su bodega/tienda activa
    if (u.isAdmin || ADMIN_MASTER_EMAILS_[em] || isManagerUserRole_(u)) continue;
    const uStoreNorm = normalizeQuoteErpStore_(u.erpStore, u.sheetTab);
    if (uStoreNorm && uStoreNorm === storeTarget) {
      allowed[em] = true;
    }
  }
  return allowed;
}

function hasGeneratedErpQuotePdf_(quoteIdRaw, folioRaw, statusRaw) {
  const qidNum = parseInt(String(quoteIdRaw || '').replace(/[^\d]/g, ''), 10) || 0;
  if (qidNum > 0) return true;
  const fol = String(folioRaw || '').trim().toUpperCase();
  if (!fol || /^[A-Z]+-\d+$/i.test(fol) || /^(EN PROCESO|PENDIENTE)$/i.test(fol)) return false;
  if (/EN COLA|REVISION/i.test(String(statusRaw || ''))) return false;
  return true;
}

function isQuoteRowAllowedForUser_(rowMeta, verifiedUser, allowedManagerEmailsMap, requestedAdminStoreNorm) {
  if (!rowMeta || !verifiedUser) return false;
  if (verifiedUser.isGuest || verifiedUser.soloLectura) return false;
  if (!hasGeneratedErpQuotePdf_(rowMeta.quoteId, rowMeta.folio || rowMeta.orderCode, rowMeta.status)) {
    return false;
  }

  const rowStoreNorm = normalizeQuoteErpStore_(rowMeta.erpStore, rowMeta.branchTab);
  const rowEmail = String(rowMeta.advisorEmail || '').trim().toLowerCase();

  if (verifiedUser.isAdmin) {
    if (requestedAdminStoreNorm && requestedAdminStoreNorm !== 'ALL') {
      return rowStoreNorm === requestedAdminStoreNorm;
    }
    return true;
  }

  const activeStoreNorm = normalizeQuoteErpStore_(verifiedUser.erpStore, verifiedUser.sheetTab);
  if (!activeStoreNorm || rowStoreNorm !== activeStoreNorm) {
    return false;
  }

  if (isManagerUserRole_(verifiedUser)) {
    return !!(rowEmail && allowedManagerEmailsMap && allowedManagerEmailsMap[rowEmail]);
  }

  const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
  return !!(userEmail && rowEmail === userEmail);
}

function readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, allUsersOpt, requestedStore, maxItems) {
  const isAdmin = !!(verifiedUser && verifiedUser.isAdmin);
  const isManager = !isAdmin && isManagerUserRole_(verifiedUser);
  const roleScope = isAdmin ? 'ADMIN' : (isManager ? 'GERENTE' : 'ASESOR');
  const activeStoreNorm = isAdmin
    ? (requestedStore && String(requestedStore).toUpperCase() !== 'ALL'
        ? normalizeQuoteErpStore_(requestedStore, '')
        : normalizeQuoteErpStore_(verifiedUser && verifiedUser.erpStore, verifiedUser && verifiedUser.sheetTab))
    : normalizeQuoteErpStore_(verifiedUser && verifiedUser.erpStore, verifiedUser && verifiedUser.sheetTab);

  let allowedManagerEmailsMap = {};
  if (isManager) {
    const usersList = Array.isArray(allUsersOpt)
      ? allUsersOpt
      : readAllBranchUsers_(ss || getSpreadsheet_(), []);
    allowedManagerEmailsMap = getAllowedAdvisorEmailsForManager_(usersList, verifiedUser, activeStoreNorm);
  }

  const limit = maxItems || (isAdmin ? 30 : (isManager ? 25 : 15));
  const out = [];
  if (!shQuotes || shQuotes.getLastRow() < 2 || !verifiedUser) {
    return {
      quotes: out,
      roleScope: roleScope,
      activeStore: activeStoreNorm,
      allowedAdvisorEmails: Object.keys(allowedManagerEmailsMap)
    };
  }

  const lastR = shQuotes.getLastRow();
  const startR = Math.max(2, lastR - 400);
  const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, 24).getDisplayValues();
  const seenKeys = {};

  for (let i = vals.length - 1; i >= 0 && out.length < limit; i--) {
    const r = vals[i];
    const cleanOrd = r[1] || ((r[0] && !/^[A-Z]+-\d+$/i.test(r[0])) ? r[0] : '');
    const item = {
      orderCode: cleanOrd || r[0] || '',
      folio: r[1] || cleanOrd || '',
      quoteId: r[2] || '',
      createdAt: r[3] || '',
      quoteType: r[4] || '',
      branchTab: r[5] || '',
      erpStore: r[6] || '',
      advisorEmail: String(r[7] || '').trim().toLowerCase(),
      advisorName: r[8] || '',
      erpAdvisor: r[9] || '',
      erpUserId: r[10] || '',
      clientName: r[11] || '',
      itemsCount: r[16] || '',
      skusSummary: r[17] || '',
      total: r[21] || '',
      status: r[22] || ''
    };

    if (!isQuoteRowAllowedForUser_(item, verifiedUser, allowedManagerEmailsMap, isAdmin ? activeStoreNorm : '')) {
      continue;
    }

    const dedupeKey = (item.quoteId ? ('ID:' + item.quoteId) : '') || (item.folio ? ('F:' + item.folio) : '');
    if (dedupeKey && seenKeys[dedupeKey]) continue;
    if (dedupeKey) seenKeys[dedupeKey] = true;

    out.push(item);
  }

  return {
    quotes: out,
    roleScope: roleScope,
    activeStore: activeStoreNorm,
    allowedAdvisorEmails: Object.keys(allowedManagerEmailsMap)
  };
}

function handleInvMyQuotes_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) return authCheck;

  const u = authCheck.advisor;
  if (u.isGuest || u.soloLectura) {
    return {
      ok: true,
      advisor: sanitizeUserForClient_(u, false),
      roleScope: 'INVITADO',
      soloLectura: true,
      activeStore: 'SOLO LECTURA',
      branchAdvisorEmails: [],
      nextOrderCode: '',
      nextFolioByStore: {},
      recentQuotes: []
    };
  }
  const shQuotes = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const folioSnap = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
  const targetStore = (u.isAdmin && body && body.erpStore) ? String(body.erpStore).trim() : u.erpStore;
  const nextOrderCode = peekNextStoreErpFolio_(targetStore, u.orderPrefix, folioSnap);
  const allowedSnap = readAllowedGeneratedQuotesForUser_(ss, shQuotes, u, authCheck.allUsers, targetStore);
  const sanitizedAdv = sanitizeUserForClient_(u, false);
  if (allowedSnap.allowedAdvisorEmails.length > 0) {
    sanitizedAdv.branchAdvisorEmails = allowedSnap.allowedAdvisorEmails;
  }

  return {
    ok: true,
    advisor: sanitizedAdv,
    roleScope: allowedSnap.roleScope,
    activeStore: allowedSnap.activeStore,
    branchAdvisorEmails: allowedSnap.allowedAdvisorEmails,
    nextOrderCode: nextOrderCode,
    nextFolioByStore: folioSnap.nextFolioByStore,
    recentQuotes: allowedSnap.quotes
  };
}

// ----------------------------------------------------------------------------
// CLIENTE DIRECTO S MUEBLERÍA ERP (WCF SOAP 1.2) — 100% EN VIVO EN LA NUBE
// Sin secretos en código: lee configuración privada desde ScriptProperties / Drive
// ----------------------------------------------------------------------------
function xmlEscape_(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities_(str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractXmlTag_(block, tagName) {
  const re = new RegExp('<(?:[a-zA-Z0-9_]+:)?' + tagName + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?' + tagName + '>');
  const m = String(block || '').match(re);
  return m ? decodeXmlEntities_(m[1]).trim() : '';
}

function parseDotEnvText_(txt) {
  const out = {};
  const lines = String(txt || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln || ln.charAt(0) === '#') continue;
    const eq = ln.indexOf('=');
    if (eq <= 0) continue;
    const k = ln.slice(0, eq).trim();
    let v = ln.slice(eq + 1).trim();
    if ((v.charAt(0) === '"' && v.slice(-1) === '"') || (v.charAt(0) === "'" && v.slice(-1) === "'")) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function findPresentacionDisenoDriveFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cachedFolderId = (props.getProperty('ERP_DRIVE_FOLDER_ID') || '').trim();
  if (cachedFolderId) {
    try {
      return DriveApp.getFolderById(cachedFolderId);
    } catch (e) {}
  }
  const it = DriveApp.getFoldersByName(ERP_DRIVE_FOLDER_NAME_);
  if (it.hasNext()) {
    const f = it.next();
    props.setProperty('ERP_DRIVE_FOLDER_ID', f.getId());
    return f;
  }
  return null;
}

function getErpRuntimeConfig_() {
  const props = PropertiesService.getScriptProperties();
  let user = (props.getProperty('ERP_USER') || '').trim();
  let pass = (props.getProperty('ERP_PASS') || '').trim();
  let loginUrl = (props.getProperty('ERP_LOGIN_URL') || '').trim();
  let wcfUrl = (props.getProperty('ERP_WCF_URL') || '').trim();
  let masterId = (props.getProperty('ERP_ID_USUARIO_MAESTRO') || '').trim();
  let lpptId = (props.getProperty('LPPT_PROVEDORES_SPREADSHEET_ID') || '').trim();

  if (!user || !pass) {
    try {
      const folder = findPresentacionDisenoDriveFolder_();
      if (folder) {
        const fIt = folder.getFilesByName('.env');
        if (fIt.hasNext()) {
          const envMap = parseDotEnvText_(fIt.next().getBlob().getDataAsString('UTF-8'));
          user = user || envMap.ERP_USER || '';
          pass = pass || envMap.ERP_PASS || '';
          loginUrl = loginUrl || envMap.ERP_LOGIN_URL || '';
          wcfUrl = wcfUrl || envMap.ERP_WCF_URL || '';
          masterId = masterId || envMap.ERP_ID_USUARIO_MAESTRO || '';
          lpptId = lpptId || envMap.LPPT_PROVEDORES_SPREADSHEET_ID || '';
          const toSave = {};
          if (user) toSave.ERP_USER = user;
          if (pass) toSave.ERP_PASS = pass;
          if (loginUrl) toSave.ERP_LOGIN_URL = loginUrl;
          if (wcfUrl) toSave.ERP_WCF_URL = wcfUrl;
          if (masterId) toSave.ERP_ID_USUARIO_MAESTRO = masterId;
          if (lpptId) toSave.LPPT_PROVEDORES_SPREADSHEET_ID = lpptId;
          if (Object.keys(toSave).length > 0) props.setProperties(toSave);
        }
      }
    } catch (e) {}
  }

  return {
    loginUrl: loginUrl || 'https://sistema.smuebleria.com/Login.aspx',
    wcfUrl: wcfUrl || 'https://sistema.smuebleria.com/smuebleriaservice.svc',
    user: user,
    pass: pass,
    masterUserId: parseInt(masterId || '38954', 10) || 38954,
    lpptSpreadsheetId: lpptId || LPPT_READONLY_DEFAULT_ID_
  };
}

function isErpJwtValid_(token, minBufferSec) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length < 2) return false;
  const buffer = (minBufferSec !== undefined && minBufferSec !== null) ? Number(minBufferSec) : 600;
  try {
    const b64 = parts[1] + '==='.slice((parts[1].length + 3) % 4);
    const jsonTxt = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8');
    const payload = JSON.parse(jsonTxt);
    const exp = Number(payload.exp || 0);
    return exp > (Math.floor(Date.now() / 1000) + buffer);
  } catch (e) {
    return false;
  }
}

function buildCookieHeaderFromCacheObj_(cacheObj) {
  if (!cacheObj) return '';
  if (cacheObj.cookieHeader) return String(cacheObj.cookieHeader);
  const arr = Array.isArray(cacheObj.cookies) ? cacheObj.cookies : [];
  const pairs = [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c && c.name && c.value !== undefined) {
      pairs.push(c.name + '=' + c.value);
    }
  }
  return pairs.join('; ');
}

function readDriveErpSessionCache_() {
  try {
    const folder = findPresentacionDisenoDriveFolder_();
    if (!folder) return null;
    const subIt = folder.getFoldersByName('credenciales');
    if (!subIt.hasNext()) return null;
    const credFolder = subIt.next();
    const fIt = credFolder.getFilesByName('.erp_session_cache.json');
    if (!fIt.hasNext()) return null;
    return JSON.parse(fIt.next().getBlob().getDataAsString('UTF-8'));
  } catch (e) {
    return null;
  }
}

function saveErpSessionCacheEverywhere_(sessionObj) {
  try {
    PropertiesService.getScriptProperties().setProperty('ERP_SESSION_CACHE_JSON', JSON.stringify(sessionObj));
  } catch (e) {}
  try {
    const folder = findPresentacionDisenoDriveFolder_();
    if (!folder) return;
    const subIt = folder.getFoldersByName('credenciales');
    const credFolder = subIt.hasNext() ? subIt.next() : folder.createFolder('credenciales');
    const fIt = credFolder.getFilesByName('.erp_session_cache.json');
    const jsonStr = JSON.stringify(sessionObj);
    if (fIt.hasNext()) {
      fIt.next().setContent(jsonStr);
    } else {
      credFolder.createFile('.erp_session_cache.json', jsonStr, MimeType.PLAIN_TEXT);
    }
  } catch (e) {}
}

function getHeaderCaseInsensitive_(headersObj, targetName) {
  if (!headersObj || !targetName) return '';
  const want = String(targetName).toLowerCase();
  const keys = Object.keys(headersObj);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) {
      const val = headersObj[keys[i]];
      return Array.isArray(val) ? String(val[0] || '') : String(val || '');
    }
  }
  return '';
}

function mergeSetCookiesIntoJar_(headersObj, jar) {
  if (!headersObj) return;
  const keys = Object.keys(headersObj);
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].toLowerCase() !== 'set-cookie') continue;
    const raw = headersObj[keys[k]];
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (let i = 0; i < list.length; i++) {
      const firstPart = String(list[i] || '').split(';')[0].trim();
      const eq = firstPart.indexOf('=');
      if (eq > 0) {
        const cname = firstPart.slice(0, eq).trim();
        const cval = firstPart.slice(eq + 1).trim();
        if (cname) jar[cname] = cval;
      }
    }
  }
}

function cookieJarToHeader_(jar) {
  return Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
}

function extractHtmlInputAttr_(tagHtml, attrName) {
  const re = new RegExp('(?:^|\\s)' + attrName + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = String(tagHtml || '').match(re);
  if (!m) return '';
  return decodeXmlEntities_(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] || '')));
}

function resolveRelativeUrl_(baseUrl, locationHdr) {
  let loc = decodeXmlEntities_(String(locationHdr || '').trim());
  if (!loc) return String(baseUrl || 'https://sistema.smuebleria.com/Login.aspx');
  if (/^https?:\/\//i.test(loc)) return loc;
  const baseStr = String(baseUrl || 'https://sistema.smuebleria.com/Login.aspx');
  const originMatch = baseStr.match(/^(https?:\/\/[^\/]+)/i);
  const origin = originMatch ? originMatch[1] : 'https://sistema.smuebleria.com';
  if (loc.indexOf('//') === 0) return 'https:' + loc;
  if (loc.charAt(0) === '/') return origin + loc;
  while (loc.indexOf('./') === 0) loc = loc.slice(2);
  const pathWithoutQuery = baseStr.split('?')[0].split('#')[0];
  const lastSlash = pathWithoutQuery.lastIndexOf('/');
  const baseDir = lastSlash > origin.length ? pathWithoutQuery.slice(0, lastSlash + 1) : (origin + '/');
  return baseDir + loc;
}

function extractJwtTokenFromTextOrJar_(text, jar) {
  const s = String(text || '');
  const mTok = s.match(/Token=([a-zA-Z0-9_\-\.]{20,})/);
  if (mTok && isErpJwtValid_(mTok[1], 15)) return mTok[1];
  const mJwt = s.match(/\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/);
  if (mJwt && isErpJwtValid_(mJwt[1], 15)) return mJwt[1];
  if (jar && jar.access_token && isErpJwtValid_(jar.access_token, 15)) return jar.access_token;
  if (mTok) return mTok[1];
  return '';
}

function performSingleErpHttpLogin_(user, pass, loginUrl) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const jar = {};
  let pageUrl = loginUrl || 'https://sistema.smuebleria.com/Login.aspx';
  let loginHtml = '';

  for (let gHop = 0; gHop < 4; gHop++) {
    const getHdrs = { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    const ck = cookieJarToHeader_(jar);
    if (ck) getHdrs.Cookie = ck;
    const getResp = UrlFetchApp.fetch(pageUrl, {
      method: 'get',
      headers: getHdrs,
      followRedirects: false,
      muteHttpExceptions: true
    });
    mergeSetCookiesIntoJar_(getResp.getAllHeaders(), jar);
    const gCode = getResp.getResponseCode();
    const gLoc = getHeaderCaseInsensitive_(getResp.getAllHeaders(), 'Location');
    if (gCode >= 300 && gCode < 400 && gLoc) {
      pageUrl = resolveRelativeUrl_(pageUrl, gLoc);
      continue;
    }
    loginHtml = getResp.getContentText('UTF-8');
    break;
  }

  let postActionUrl = pageUrl;
  const formTagMatch = loginHtml.match(/<form\b[^>]*>/i);
  if (formTagMatch) {
    const rawAction = extractHtmlInputAttr_(formTagMatch[0], 'action');
    if (rawAction) postActionUrl = resolveRelativeUrl_(pageUrl, rawAction);
  }

  const formFields = {};
  let emailFieldName = 'CampoCorreoElectronico';
  let passFieldName = 'CampoContrasena';
  let submitFieldName = 'BotonValidar';
  let submitFieldVal = 'Ingresar';
  let submitFieldType = 'submit';
  let hasSubmitInput = false;

  const inputTags = loginHtml.match(/<input\b[^>]*>/gi) || [];
  for (let i = 0; i < inputTags.length; i++) {
    const tag = inputTags[i];
    const type = (extractHtmlInputAttr_(tag, 'type') || 'text').toLowerCase();
    const name = extractHtmlInputAttr_(tag, 'name');
    const id = extractHtmlInputAttr_(tag, 'id');
    const val = extractHtmlInputAttr_(tag, 'value');

    if (/CampoCorreoElectronico$/i.test(id) || /CampoCorreoElectronico$/i.test(name)) {
      if (name) emailFieldName = name;
      continue;
    }
    if (/CampoContrasena$/i.test(id) || /CampoContrasena$/i.test(name)) {
      if (name) passFieldName = name;
      continue;
    }
    if (/BotonValidar$/i.test(id) || /BotonValidar$/i.test(name)) {
      hasSubmitInput = true;
      if (name) submitFieldName = name;
      if (val) submitFieldVal = val;
      submitFieldType = type || 'submit';
      continue;
    }

    if (!name) continue;
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image' || type === 'file') continue;
    if (type === 'checkbox' || type === 'radio') {
      if (/\bchecked\b/i.test(tag)) formFields[name] = val || 'on';
      continue;
    }
    formFields[name] = val;
  }

  formFields[emailFieldName] = user;
  formFields[passFieldName] = pass;

  // Los campos de Login.aspx son Telerik RadTextBox: el servidor toma el valor desde el JSON
  // oculto "<campo>_ClientState" (lo llena el navegador al teclear). Sin él, el POST ignora
  // usuario/contraseña y la renovación automática del token 24h nunca ocurre.
  const buildRadClientState_ = (v) => JSON.stringify({
    enabled: true,
    emptyMessage: '',
    validationText: String(v),
    valueAsString: String(v),
    lastSetTextBoxValue: String(v)
  });
  formFields[emailFieldName + '_ClientState'] = buildRadClientState_(user);
  formFields[passFieldName + '_ClientState'] = buildRadClientState_(pass);

  if (hasSubmitInput && submitFieldType === 'image') {
    formFields[submitFieldName + '.x'] = '12';
    formFields[submitFieldName + '.y'] = '12';
  } else if (hasSubmitInput) {
    formFields[submitFieldName] = submitFieldVal;
  } else {
    const postBackMatch = loginHtml.match(/BotonValidar[^>]*__doPostBack\(\s*['"]([^'"]+)['"]/i);
    if (postBackMatch) {
      formFields.__EVENTTARGET = postBackMatch[1];
      formFields.__EVENTARGUMENT = formFields.__EVENTARGUMENT || '';
    } else {
      formFields[submitFieldName] = submitFieldVal;
    }
  }

  const encodedPayload = Object.keys(formFields)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(formFields[k] !== undefined && formFields[k] !== null ? String(formFields[k]) : ''))
    .join('&');

  const originMatch = postActionUrl.match(/^(https?:\/\/[^\/]+)/i);
  const originHdr = originMatch ? originMatch[1] : 'https://sistema.smuebleria.com';
  const postHeaders = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Origin: originHdr,
    Referer: pageUrl
  };
  const postCk = cookieJarToHeader_(jar);
  if (postCk) postHeaders.Cookie = postCk;

  let curResp = UrlFetchApp.fetch(postActionUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: encodedPayload,
    headers: postHeaders,
    followRedirects: false,
    muteHttpExceptions: true
  });
  mergeSetCookiesIntoJar_(curResp.getAllHeaders(), jar);

  let currentUrl = postActionUrl;
  let finalHtml = curResp.getContentText('UTF-8');
  let tokenFound = '';

  for (let hop = 0; hop < 6; hop++) {
    const code = curResp.getResponseCode();
    const hdrs = curResp.getAllHeaders();
    const loc = getHeaderCaseInsensitive_(hdrs, 'Location');
    if (loc) {
      const tokInLoc = extractJwtTokenFromTextOrJar_(loc, null);
      if (tokInLoc) tokenFound = tokInLoc;
    }

    if (code >= 300 && code < 400 && loc) {
      currentUrl = resolveRelativeUrl_(currentUrl, loc);
      const rHdrs = { 'User-Agent': ua, Referer: pageUrl };
      const rCk = cookieJarToHeader_(jar);
      if (rCk) rHdrs.Cookie = rCk;
      curResp = UrlFetchApp.fetch(currentUrl, {
        method: 'get',
        headers: rHdrs,
        followRedirects: false,
        muteHttpExceptions: true
      });
      mergeSetCookiesIntoJar_(curResp.getAllHeaders(), jar);
      finalHtml = curResp.getContentText('UTF-8');
    } else {
      break;
    }
  }

  if (!tokenFound) {
    tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
  }

  // Seguir redirección JS o meta-refresh hacia Sistema.aspx si existe
  if (!tokenFound) {
    const jsRedir = String(finalHtml || '').match(/(?:location(?:\.href)?\s*=\s*|location\.replace\(\s*|url\s*=\s*)['"]?([^'"\s<>]*Sistema\.aspx[^'"\s<>]*)/i);
    if (jsRedir && jsRedir[1]) {
      currentUrl = resolveRelativeUrl_(currentUrl, jsRedir[1]);
      tokenFound = extractJwtTokenFromTextOrJar_(currentUrl, null);
      if (!tokenFound) {
        const jHdrs = { 'User-Agent': ua, Referer: postActionUrl };
        const jCk = cookieJarToHeader_(jar);
        if (jCk) jHdrs.Cookie = jCk;
        const jResp = UrlFetchApp.fetch(currentUrl, {
          method: 'get',
          headers: jHdrs,
          followRedirects: true,
          muteHttpExceptions: true
        });
        mergeSetCookiesIntoJar_(jResp.getAllHeaders(), jar);
        finalHtml = jResp.getContentText('UTF-8');
        tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
      }
    }
  }

  // Si ya recibimos cookies de sesión autenticada pero aún no consultamos Sistema.aspx, consultarlo explícitamente
  if (!tokenFound && Object.keys(jar).length > 0 && !/Sistema\.aspx/i.test(currentUrl)) {
    const sisUrl = resolveRelativeUrl_(postActionUrl, '/Sistema.aspx');
    const sHdrs = { 'User-Agent': ua, Referer: postActionUrl };
    const sCk = cookieJarToHeader_(jar);
    if (sCk) sHdrs.Cookie = sCk;
    const sResp = UrlFetchApp.fetch(sisUrl, {
      method: 'get',
      headers: sHdrs,
      followRedirects: true,
      muteHttpExceptions: true
    });
    mergeSetCookiesIntoJar_(sResp.getAllHeaders(), jar);
    finalHtml = sResp.getContentText('UTF-8');
    tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
  }

  return { token: tokenFound, jar: jar };
}

/**
 * Renueva automáticamente el JWT 24h de S Mueblería directo desde Google Cloud vía HTTP WebForms.
 */
function loginErpViaHttp_(cfg) {
  if (!cfg.user || !cfg.pass) {
    throw new Error('No se encontraron credenciales ERP en ScriptProperties ni en la carpeta privada PRESENTACION_DISENO.');
  }

  // Evitar intentos repetidos de login fallido dentro del mismo ciclo (protege la cuenta en S Mueblería)
  let loginCache = null;
  try { loginCache = CacheService.getScriptCache(); } catch (ce) {}
  if (loginCache && loginCache.get('erp_login_fail_v1') === '1') {
    throw new Error(
      'La sesión de 24h de S Mueblería venció y el último intento de renovación automática fue rechazado hace menos de 4 minutos. ' +
      'Se reintentará en el siguiente ciclo.'
    );
  }

  let attemptRes = performSingleErpHttpLogin_(cfg.user, cfg.pass, cfg.loginUrl);

  // Si falló, verificar si el archivo .env en Google Drive tiene credenciales actualizadas respecto a ScriptProperties
  if (!attemptRes.token) {
    try {
      const folder = findPresentacionDisenoDriveFolder_();
      if (folder) {
        const fIt = folder.getFilesByName('.env');
        if (fIt.hasNext()) {
          const envMap = parseDotEnvText_(fIt.next().getBlob().getDataAsString('UTF-8'));
          const freshUser = (envMap.ERP_USER || '').trim();
          const freshPass = (envMap.ERP_PASS || '').trim();
          const freshLogin = (envMap.ERP_LOGIN_URL || cfg.loginUrl || '').trim();
          if (freshUser && freshPass && (freshUser !== cfg.user || freshPass !== cfg.pass)) {
            PropertiesService.getScriptProperties().setProperties({
              ERP_USER: freshUser,
              ERP_PASS: freshPass
            });
            attemptRes = performSingleErpHttpLogin_(freshUser, freshPass, freshLogin);
          }
        }
      }
    } catch (envRetryErr) {}
  }

  const tokenFound = attemptRes.token;
  const jar = attemptRes.jar || {};
  if (!tokenFound) {
    try { if (loginCache) loginCache.put('erp_login_fail_v1', '1', 240); } catch (cpe) {}
    throw new Error(
      'La sesión de 24h de S Mueblería venció y Login.aspx rechazó la renovación automática sin navegador. ' +
      'Ejecuta iniciar_servicio_en_vivo.bat en tu PC o verifica ERP_USER / ERP_PASS en PRESENTACION_DISENO/.env.'
    );
  }

  const cookiesArr = Object.keys(jar).map((k) => ({
    name: k,
    value: jar[k],
    domain: 'sistema.smuebleria.com',
    path: '/'
  }));
  const sessionObj = {
    token: tokenFound,
    cookies: cookiesArr,
    saved_at: Date.now() / 1000
  };
  saveErpSessionCacheEverywhere_(sessionObj);
  return {
    token: tokenFound,
    cookieHeader: cookieJarToHeader_(jar)
  };
}

function getValidErpSession_(forceRefresh, cfg) {
  const props = PropertiesService.getScriptProperties();
  let parsedProp = null;
  let driveCached = null;

  if (!forceRefresh) {
    try {
      const rawProp = props.getProperty('ERP_SESSION_CACHE_JSON');
      if (rawProp) {
        parsedProp = JSON.parse(rawProp);
        if (parsedProp && isErpJwtValid_(parsedProp.token, 600)) {
          return {
            token: parsedProp.token,
            cookieHeader: buildCookieHeaderFromCacheObj_(parsedProp)
          };
        }
      }
    } catch (e) {}

    driveCached = readDriveErpSessionCache_();
    if (driveCached && isErpJwtValid_(driveCached.token, 600)) {
      try {
        props.setProperty('ERP_SESSION_CACHE_JSON', JSON.stringify(driveCached));
      } catch (e) {}
      return {
        token: driveCached.token,
        cookieHeader: buildCookieHeaderFromCacheObj_(driveCached)
      };
    }
  }

  try {
    return loginErpViaHttp_(cfg || getErpRuntimeConfig_());
  } catch (loginErr) {
    // Si la renovación anticipada falla pero el token actual aún no expira en el servidor (margen >15s), aprovecharlo
    if (!forceRefresh) {
      if (driveCached && isErpJwtValid_(driveCached.token, 15)) {
        return {
          token: driveCached.token,
          cookieHeader: buildCookieHeaderFromCacheObj_(driveCached)
        };
      }
      if (parsedProp && isErpJwtValid_(parsedProp.token, 15)) {
        return {
          token: parsedProp.token,
          cookieHeader: buildCookieHeaderFromCacheObj_(parsedProp)
        };
      }
    }
    throw loginErr;
  }
}

function buildSmuebleriaSoapEnvelope_(wcfUrl, soapAction, method, innerRendered) {
  return '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">' +
    '<s:Header>' +
      '<a:Action s:mustUnderstand="1">' + soapAction + '</a:Action>' +
      '<a:To s:mustUnderstand="1">' + wcfUrl + '</a:To>' +
    '</s:Header>' +
    '<s:Body>' +
      '<' + method + ' xmlns="http://tempuri.org/">' +
        innerRendered +
      '</' + method + '>' +
    '</s:Body>' +
  '</s:Envelope>';
}

function callSmuebleriaWcf_(method, innerXml) {
  const cfg = getErpRuntimeConfig_();
  let sess = getValidErpSession_(false, cfg);
  const soapAction = 'http://tempuri.org/ISMuebleriaService/' + method;

  for (let attempt = 0; attempt < 2; attempt++) {
    const rendered = String(innerXml || '').replace(/\{TOKEN\}/g, sess.token);
    const envelope = buildSmuebleriaSoapEnvelope_(cfg.wcfUrl, soapAction, method, rendered);
    const headers = {
      Authorization: 'Bearer ' + sess.token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (sess.cookieHeader) headers.Cookie = sess.cookieHeader;

    const resp = UrlFetchApp.fetch(cfg.wcfUrl, {
      method: 'post',
      contentType: 'application/soap+xml; charset=utf-8; action="' + soapAction + '"',
      headers: headers,
      payload: Utilities.newBlob(envelope, 'application/soap+xml; charset=utf-8').getBytes(),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if ((code === 401 || code === 403) && attempt === 0) {
      sess = getValidErpSession_(true, cfg);
      continue;
    }
    if (code !== 200) {
      throw new Error('Error WCF S Mueblería (' + method + '): HTTP ' + code + ' - ' + resp.getContentText('UTF-8').slice(0, 300));
    }
    return resp.getContentText('UTF-8');
  }
  throw new Error('No fue posible autenticar la petición WCF en ' + method);
}

function buscarProductoPorClaveWcf_(sku) {
  const cfg = getErpRuntimeConfig_();
  const claveClean = String(sku || '').trim();
  if (!claveClean) return null;
  const xmlText = callSmuebleriaWcf_(
    'ObtenerProductos',
    '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(claveClean) + '</Filtro>'
  );
  // Buscar bloques que contengan <Clave> y <IdProducto>
  const itemRe = /<([a-zA-Z0-9_:]*Producto[a-zA-Z0-9_:]*)>([\s\S]*?)<\/\1>/g;
  let m;
  let fallback = null;
  while ((m = itemRe.exec(xmlText)) !== null) {
    const blk = m[2];
    const idProd = extractXmlTag_(blk, 'IdProducto');
    const clave = extractXmlTag_(blk, 'Clave');
    if (!idProd || !clave) continue;
    const item = {
      IdProducto: idProd,
      Clave: clave,
      Nombre: extractXmlTag_(blk, 'Nombre'),
      Precio: parseFloat(extractXmlTag_(blk, 'Precio') || '0') || 0
    };
    if (!fallback) fallback = item;
    if (clave.toUpperCase() === claveClean.toUpperCase()) return item;
  }
  return fallback;
}

function crearProspectoProvisionalWcf_(nombre, telefono, correo, idUsuarioResponsable) {
  const inner =
    '<ClaveServicio>{TOKEN}</ClaveServicio>' +
    '<IdUsuario>' + idUsuarioResponsable + '</IdUsuario>' +
    '<IdLead>0</IdLead>' +
    '<Nombre>' + xmlEscape_(String(nombre || '').trim() || 'PROSPECTO PRESENTACION') + '</Nombre>' +
    '<Paterno></Paterno>' +
    '<Materno></Materno>' +
    '<Correo>' + xmlEscape_(String(correo || '').trim()) + '</Correo>' +
    '<FechaNacimiento>2000-01-01T00:00:00</FechaNacimiento>' +
    '<Telefono>' + xmlEscape_(String(telefono || '').trim()) + '</Telefono>' +
    '<Celular>' + xmlEscape_(String(telefono || '').trim()) + '</Celular>' +
    '<Oficina></Oficina>' +
    '<IdResponsable>' + idUsuarioResponsable + '</IdResponsable>' +
    '<IdFase>0</IdFase>' +
    '<IdOrigen>0</IdOrigen>' +
    '<Casa2></Casa2>' +
    '<Nextel></Nextel>' +
    '<Extension></Extension>' +
    '<IdTipoCliente>1</IdTipoCliente>';

  const xmlResp = callSmuebleriaWcf_('InsertarLead', inner);
  const m = xmlResp.match(/<[^>]*InsertarLeadResult>(-?\d+)</);
  const idLead = m ? parseInt(m[1], 10) : 0;
  if (!idLead || idLead <= 0) {
    throw new Error('Error al crear prospecto provisional en S Mueblería: ' + xmlResp.slice(0, 260));
  }
  return idLead;
}

function extractFolioForIdVentaXml_(xmlCot, newId) {
  if (!xmlCot || !newId) return '';
  const idRe = new RegExp('<(?:[a-zA-Z0-9_]+:)?IdVenta>' + String(newId) + '<\\/(?:[a-zA-Z0-9_]+:)?IdVenta>');
  const m = idRe.exec(xmlCot);
  if (!m) return '';
  const pos = m.index;
  const winStart = Math.max(0, pos - 4000);
  const winEnd = Math.min(xmlCot.length, pos + 4000);
  const chunk = xmlCot.slice(winStart, winEnd);
  const relPos = pos - winStart;

  const before = chunk.slice(0, relPos);
  const after = chunk.slice(relPos);

  // Acotar exactamente al registro actual (entre el IdVenta previo y el siguiente IdVenta)
  const prevIdIdx = before.lastIndexOf('IdVenta>');
  const safeBefore = prevIdIdx >= 0 ? before.slice(prevIdIdx) : before;
  const boundaryRe = /<\/([a-zA-Z0-9_:]+)>\s*<\1[\s>]/g;
  let bMatch;
  let itemStartInSafe = 0;
  while ((bMatch = boundaryRe.exec(safeBefore)) !== null) {
    itemStartInSafe = bMatch.index + bMatch[0].indexOf('<', 2);
  }
  const recordBefore = safeBefore.slice(itemStartInSafe);

  const nextIdMatch = after.slice(m[0].length).search(/<(?:[a-zA-Z0-9_]+:)?IdVenta>/);
  const recordAfter = nextIdMatch >= 0 ? after.slice(0, m[0].length + nextIdMatch) : after;

  return extractXmlTag_(recordBefore + recordAfter, 'Folio');
}

function parseDeliveryDateToErpIso_(dateStr) {
  const s = String(dateStr || '').trim();
  let dt = null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    dt = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    }
  }
  if (!dt || isNaN(dt.getTime())) {
    dt = new Date();
    dt.setDate(dt.getDate() + 30);
  }
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd + 'T00:00:00';
}

function insertarCotizacionDirectoWcf_(opts) {
  const cfg = getErpRuntimeConfig_();
  const tasaIva = 0.16;
  const idCotizacion = Number(opts.idCotizacion || 0);
  const idUsuarioAsesor = Number(opts.idUsuarioAsesor);
  const idCliente = Number(opts.idCliente || 0);
  const idLead = Number(opts.idLead || 0);
  const descuentoExtra = Math.max(0, Number(opts.descuentoExtra || 0));
  const partidas = opts.partidas || [];

  let sumPartidas = 0;
  const itemsXml = [];
  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i];
    const idProd = parseInt(String(p.IdProducto), 10);
    const cant = Math.max(1, Math.round(Number(p.Cantidad) || 1));
    const precioOrig = Number(p.PrecioOriginal || 0);
    const precioUnit = Number(p.PrecioUnitario || 0);
    const totLinea = Math.round(cant * precioUnit * 10000) / 10000;
    sumPartidas += totLinea;

    const modeloTxt = xmlEscape_((String(p.Clave || '') + ' ' + String(p.Nombre || '')).trim());
    const precioF = '$' + precioUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Orden alfabético estricto requerido por DataContractSerializer de S Mueblería WCF
    itemsXml.push(
      '<b:ProductosVentas>' +
        '<b:Bodega>0</b:Bodega>' +
        '<b:Cantidad>' + cant + '</b:Cantidad>' +
        '<b:CantidadDescontinuada>0</b:CantidadDescontinuada>' +
        '<b:CantidadOriginal>' + cant + '</b:CantidadOriginal>' +
        '<b:Descripcion> </b:Descripcion>' +
        '<b:Detalle i:nil="true"/>' +
        '<b:DiasEntrega>0</b:DiasEntrega>' +
        '<b:EsTela>false</b:EsTela>' +
        '<b:Estatus i:nil="true"/>' +
        '<b:IdCategoria>0</b:IdCategoria>' +
        '<b:IdModleo>0</b:IdModleo>' +
        '<b:IdMoneda>0</b:IdMoneda>' +
        '<b:IdPaquete>0</b:IdPaquete>' +
        '<b:IdProducto>' + idProd + '</b:IdProducto>' +
        '<b:IdProductoTelaLigada>0</b:IdProductoTelaLigada>' +
        '<b:IdPromocion>0</b:IdPromocion>' +
        '<b:IdProveedor>0</b:IdProveedor>' +
        '<b:IdRama>0</b:IdRama>' +
        '<b:IdTiempoEntrega>0</b:IdTiempoEntrega>' +
        '<b:ImagenVenta/>' +
        '<b:IvaProducto>' + tasaIva.toFixed(4) + '</b:IvaProducto>' +
        '<b:Mensaje1>Material Base:</b:Mensaje1>' +
        '<b:Mensaje2>Material Cubierta:</b:Mensaje2>' +
        '<b:Mensaje3>Material Otro:</b:Mensaje3>' +
        '<b:MetrosMaterial2>0.0000</b:MetrosMaterial2>' +
        '<b:MetrosMaterial3>0.0000</b:MetrosMaterial3>' +
        '<b:MetrosMaterial4>0.0000</b:MetrosMaterial4>' +
        '<b:MetrosMaterial5>0.0000</b:MetrosMaterial5>' +
        '<b:MetrosTela>0.0000</b:MetrosTela>' +
        '<b:Modelo>' + modeloTxt + '</b:Modelo>' +
        '<b:PedirTelaLigada>false</b:PedirTelaLigada>' +
        '<b:Piso>0</b:Piso>' +
        '<b:Precio>' + precioUnit.toFixed(4) + '</b:Precio>' +
        '<b:PrecioF>' + xmlEscape_(precioF) + '</b:PrecioF>' +
        '<b:PrecioMinimo>0.0000</b:PrecioMinimo>' +
        '<b:PrecioOriginal>' + precioOrig.toFixed(4) + '</b:PrecioOriginal>' +
        '<b:PrecioOriginalCotizador>0.0000</b:PrecioOriginalCotizador>' +
        '<b:Total>' + totLinea.toFixed(4) + '</b:Total>' +
      '</b:ProductosVentas>'
    );
  }

  const totalFinal = Math.max(0, sumPartidas - descuentoExtra);
  const subtotal = Math.round((totalFinal / (1 + tasaIva)) * 10000) / 10000;
  const iva = Math.round((totalFinal - subtotal) * 10000) / 10000;

  const productosBlock =
    '<Productos xmlns:b="http://schemas.datacontract.org/2004/07/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">' +
      itemsXml.join('') +
    '</Productos>';

  const inner =
    '<ClaveServicio>{TOKEN}</ClaveServicio>' +
    '<IdCotizacion>' + idCotizacion + '</IdCotizacion>' +
    '<IdCliente>' + idCliente + '</IdCliente>' +
    '<IdLead>' + idLead + '</IdLead>' +
    '<Nombre>' + xmlEscape_(opts.nombreCliente || 'PROSPECTO PRESENTACION') + '</Nombre>' +
    '<FechaEntrega>' + opts.fechaEntregaIso + '</FechaEntrega>' +
    '<IdUsuario>' + idUsuarioAsesor + '</IdUsuario>' +
    '<subtotal>' + subtotal.toFixed(4) + '</subtotal>' +
    '<iva>' + iva.toFixed(4) + '</iva>' +
    '<Total>' + totalFinal.toFixed(4) + '</Total>' +
    '<descuento>' + descuentoExtra.toFixed(4) + '</descuento>' +
    productosBlock +
    '<Comentarios>' + xmlEscape_(opts.comentarios || '') + '</Comentarios>' +
    '<IdCategoriaVenta>' + Number(opts.idCategoriaVenta || 2) + '</IdCategoriaVenta>' +
    '<TAX>0</TAX>' +
    '<IdDireccion>0</IdDireccion>' +
    '<IdFormaPagoCredito>0</IdFormaPagoCredito>' +
    '<IdTipoPago>0</IdTipoPago>' +
    '<PagoParcial>0</PagoParcial>' +
    '<NoPagosCredito>0</NoPagosCredito>' +
    '<Enganche>0</Enganche>' +
    '<TipoCambio>0</TipoCambio>' +
    '<IdMoneda>0</IdMoneda>' +
    '<IdCajero>' + idUsuarioAsesor + '</IdCajero>' +
    '<IdOrigen>0</IdOrigen>' +
    '<TasaIva>' + tasaIva.toFixed(4) + '</TasaIva>';

  const xmlResp = callSmuebleriaWcf_('InsertarCotizacion', inner);
  const m = xmlResp.match(/<[^>]*InsertarCotizacionResult>([^<]+)</);
  const rawRes = m ? m[1].trim() : '';
  const newId = /^\d+$/.test(rawRes) ? parseInt(rawRes, 10) : 0;
  if (!newId || newId <= 0) {
    throw new Error('S Mueblería no devolvió un ID de cotización válido (' + (rawRes || xmlResp.slice(0, 200)) + ').');
  }

  let folioOficial = '';
  try {
    const xmlCot = callSmuebleriaWcf_(
      'ObtenerCotizacionesTodas',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
    );
    folioOficial = extractFolioForIdVentaXml_(xmlCot, newId);
  } catch (folioErr) {
    Logger.log('Aviso al consultar Folio en ObtenerCotizacionesTodas: ' + folioErr);
  }

  return {
    idCotizacion: newId,
    folio: folioOficial,
    subtotal: subtotal,
    iva: iva,
    total: totalFinal
  };
}

function readPlantillaProductCatalogMap_(shPlantilla) {
  const map = {};
  if (!shPlantilla || shPlantilla.getLastColumn() < 34 || shPlantilla.getLastRow() < 2) return map;
  const vals = shPlantilla.getRange(2, 31, shPlantilla.getLastRow() - 1, 4).getValues(); // AE..AH
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const sku = String(r[0] || '').trim().toUpperCase();
    if (!sku) continue;
    map[sku] = {
      idProducto: cleanSheetKeyCell_(r[1]),
      nombre: String(r[2] || '').trim(),
      precio: Number(r[3] || 0) || 0
    };
  }
  return map;
}

/**
 * Procesa la cotización exigiendo identidad autenticada por correo, bloqueando Sucursal/Proyecto
 * y enviando EN VIVO directo a S Mueblería ERP (sistema.smuebleria.com).
 */
function handleInvSubmitQuote_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    ensureLiveErpSyncTrigger_();
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName('plantilla');
    if (!sh) {
      return { ok: false, error: 'No se encontró la hoja "plantilla" en CONTROL DE PRODUCTOS PRESENTACIÓN.' };
    }

    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    if (verifiedUser.isGuest || verifiedUser.soloLectura || String(verifiedUser.sheetTab || '').toUpperCase() === 'INVITADOS') {
      return {
        ok: false,
        error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu correo tiene permiso únicamente para ver el inventario; no puede generar cotizaciones ni aplicar descuentos.'
      };
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return { ok: false, error: 'Agrega al menos un producto a la cotización.' };
    }
    if (items.length > 15) {
      return { ok: false, error: 'La plantilla admite máximo 15 partidas por cotización (tienes ' + items.length + ').' };
    }

    // Administradores (Santiago y Kevin) pueden emitir y supervisar en cualquier tienda/bodega;
    // Asesores y Gerentes quedan bloqueados estrictamente a la tienda/proyecto de su cuenta en sesión.
    let erpStore = verifiedUser.erpStore;
    let idUsuarioNum = parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) || 0;
    let erpAdvisorLabel = verifiedUser.erpAdvisorLabel || '';

    if (verifiedUser.isAdmin) {
      const reqStore = String(body.erpStore || '').trim();
      if (reqStore) erpStore = reqStore;
      const reqAdvLabel = String(body.erpAdvisorLabel || '').trim();
      const reqAdvId = parseInt(String(body.erpAdvisorId || extractErpIdFromLabel_(reqAdvLabel) || '').trim(), 10) || 0;
      if (reqAdvId > 0) {
        idUsuarioNum = reqAdvId;
        if (reqAdvLabel) {
          erpAdvisorLabel = reqAdvLabel;
        } else {
          const foundAdv = erpMeta.advisors.find((a) => String(a.id) === String(reqAdvId));
          erpAdvisorLabel = foundAdv ? foundAdv.label : (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + reqAdvId + ']');
        }
      }
    }

    if (!idUsuarioNum && Array.isArray(authCheck.userMatches)) {
      const anyMatchWithId = authCheck.userMatches.find((u) => !u.isGuest && (parseInt(String(u.erpAdvisorId || '').trim(), 10) || 0) > 0);
      if (anyMatchWithId) {
        idUsuarioNum = parseInt(String(anyMatchWithId.erpAdvisorId || '').trim(), 10) || 0;
        erpAdvisorLabel = erpAdvisorLabel || anyMatchWithId.erpAdvisorLabel || (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + idUsuarioNum + ']');
      }
    }

    if (!idUsuarioNum && !verifiedUser.isGuest) {
      const cfg = getErpRuntimeConfig_();
      idUsuarioNum = cfg.masterUserId;
      erpAdvisorLabel = erpAdvisorLabel || (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + idUsuarioNum + ']');
    }

    const activePrefix = getStoreFolioPrefix_(erpStore, verifiedUser.orderPrefix);
    const isProyQuote = /PROYECTO/i.test(erpStore) || (!verifiedUser.isAdmin && !!verifiedUser.isProyecto);
    const activeQuoteType = isProyQuote ? 'PROYECTO' : (verifiedUser.isAdmin ? 'ADMINISTRATIVO' : verifiedUser.quoteType);

    const sendToErp = body.sendToErp !== false;
    if (sendToErp && (!idUsuarioNum || idUsuarioNum <= 0)) {
      return {
        ok: false,
        error: 'Tu cuenta (' + verifiedUser.correo + ') aún no tiene un ID de usuario activo vinculado en S Mueblería.'
      };
    }

    const categoryLabel = 'COTIZACIONES [ID: 2]';
    const clientNameRaw = String(body.clientName || '').trim() || (isProyQuote ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA');
    const explicitCliId = parseInt(String(body.erpClientId || '').trim(), 10) || 0;
    const explicitLeadId = parseInt(String(body.erpLeadId || '').trim(), 10) || 0;
    const clientMode = explicitCliId > 0
      ? (clientNameRaw + ' [ID CLIENTE: ' + explicitCliId + ']')
      : (explicitLeadId > 0
        ? (clientNameRaw + ' [ID LEAD: ' + explicitLeadId + ']')
        : 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)');
    const clientPhone = String(body.clientPhone || '').trim();
    const deliveryDate = String(body.deliveryDate || '').trim();
    const rawNotes = String(body.notes || '').trim();
    const extraDiscount = Math.max(0, Number(body.extraDiscount) || 0);

    // Límite de descuento por cuenta (Columna I "Descuento": Asesor 30% hasta 30/11/2026 [24% desde 01/12/2026] · Gerente/Admin 100%)
    const maxDiscPct = getMaxDiscountPctForUser_(verifiedUser);
    let sumListReq = 0;
    let sumNetReq = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const pct = Math.max(0, Number(it.discountPct) || 0);
      if (pct > maxDiscPct + 0.0001) {
        registrarEventoHistorial_(ss, {
          clasificacion: 'ALERTA TÉCNICA',
          modulo: 'AppsScript · handleInvSubmitQuote_',
          evento: 'DESCUENTO RECHAZADO POR TOPE DE PUESTO',
          estado: '⚠️ BLOQUEADO',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: String(it.sku || ''),
          detalle: 'Descuento solicitado ' + pct + '% supera el máximo permitido de ' + maxDiscPct + '% para ' + (verifiedUser.puesto || 'ASESOR') + '.',
          analisis: 'Control de descuento activo: Asesores 30% hasta 30/11/2026 (24% desde 01/12/2026); Gerentes y Administradores 100%.'
        });
        return {
          ok: false,
          error: 'Tu cuenta (' + (verifiedUser.puesto || 'ASESOR') + ') permite un descuento máximo de ' + maxDiscPct + '% por partida. Revisa el SKU ' + String(it.sku || '') + '.'
        };
      }
      const qtyReq = Math.max(1, Math.round(Number(it.qty) || 1));
      const listReq = Math.max(0, Number(it.unitList) || 0) * qtyReq;
      sumListReq += listReq;
      sumNetReq += listReq * (1 - pct / 100);
    }
    if (sumListReq > 0 && extraDiscount > 0) {
      const effPct = ((sumListReq - Math.max(0, sumNetReq - extraDiscount)) / sumListReq) * 100;
      if (effPct > maxDiscPct + 0.01) {
        registrarEventoHistorial_(ss, {
          clasificacion: 'ALERTA TÉCNICA',
          modulo: 'AppsScript · handleInvSubmitQuote_',
          evento: 'DESCUENTO EXTRA RECHAZADO POR TOPE DE PUESTO',
          estado: '⚠️ BLOQUEADO',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: 'Descuento extra $' + extraDiscount.toFixed(2),
          detalle: 'Descuento total efectivo ' + effPct.toFixed(1) + '% supera el máximo permitido de ' + maxDiscPct + '%.',
          analisis: 'Control de descuento acumulado activo sobre partidas + descuento extra.'
        });
        return {
          ok: false,
          error: 'El descuento total (' + effPct.toFixed(1) + '%) supera el máximo permitido para tu cuenta (' + maxDiscPct + '%).'
        };
      }
    }

    const shQuotes = ensureQuotesLedgerSheet_(ss);
    const folioSnapBefore = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
    const estimatedFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapBefore);
    const originHeaderTag = isProyQuote
      ? ('[PROYECTO · ' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]')
      : ('[' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]');
    const finalNotesForErp = rawNotes ? (originHeaderTag + ' ' + rawNotes) : originHeaderTag;

    // 1) Mantener K5 en SOLO REVISIÓN para que ningún script externo reenvíe por duplicado
    sh.getRange('K5').setValue('SOLO REVISIÓN (NO ENVIAR AL ERP)');
    sh.getRange('K7').clearContent();
    sh.getRange('M7').clearContent();

    // 2) Escribir tienda/bodega y asesor en plantilla
    sh.getRange('C5').setValue(erpStore);
    if (erpAdvisorLabel) {
      sh.getRange('C6').setValue(erpAdvisorLabel);
    }
    sh.getRange('C7').setValue(categoryLabel);
    sh.getRange('C9').setValue(clientMode);
    sh.getRange('G9').setNumberFormat('@').setValue(clientPhone);
    sh.getRange('C10').setValue(clientNameRaw);
    if (deliveryDate) {
      sh.getRange('G10').setValue(deliveryDate);
    }
    sh.getRange('C11').setValue(finalNotesForErp);
    sh.getRange('H30').setValue(extraDiscount);

    // 3) Escribir columnas editables B (SKU), D (Cantidad), F (% Desc) en filas 15..29
    const bVals = [];
    const dVals = [];
    const fVals = [];
    for (let i = 0; i < 15; i++) {
      if (i < items.length) {
        const it = items[i] || {};
        const sku = String(it.sku || '').trim().toUpperCase();
        const qty = Math.max(1, Math.round(Number(it.qty) || 1));
        let discPct = (Number(it.discountPct) || 0) / 100;
        discPct = Math.max(0, Math.min(1, discPct));
        bVals.push([sku]);
        dVals.push([qty]);
        fVals.push([discPct]);
      } else {
        bVals.push(['']);
        dVals.push(['']);
        fVals.push(['']);
      }
    }
    sh.getRange(15, 2, 15, 1).setNumberFormat('@').setValues(bVals);
    sh.getRange(15, 4, 15, 1).setValues(dVals);
    sh.getRange(15, 6, 15, 1).setValues(fVals);

    SpreadsheetApp.flush();

    const ahoraStr = formatCancunNow_();
    if (!sendToErp) {
      sh.getRange('K6').setValue('🟢 EN REVISIÓN (' + estimatedFolio + ' · ' + activeQuoteType + ')');
      sh.getRange('K9').setValue(ahoraStr);
      SpreadsheetApp.flush();
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · plantilla',
        evento: 'COTIZACIÓN GUARDADA EN REVISIÓN',
        estado: '✅ OK',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: estimatedFolio,
        detalle: 'Borrador en hoja plantilla para ' + clientNameRaw + ' (' + items.length + ' partidas).',
        analisis: 'Guardada en modo SOLO REVISIÓN sin envío a S Mueblería.'
      });
      const previewStatus = handleInvPlantillaStatus_();
      previewStatus.orderCode = estimatedFolio;
      previewStatus.nextOrderCode = estimatedFolio;
      previewStatus.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      previewStatus.quoteType = activeQuoteType;
      previewStatus.isProyecto = isProyQuote;
      previewStatus.serieLabel = verifiedUser.serieLabel;
      previewStatus.sentLiveToErp = false;
      const allowedPreview = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
      previewStatus.recentQuotes = allowedPreview.quotes;
      previewStatus.roleScope = allowedPreview.roleScope;
      previewStatus.activeStore = allowedPreview.activeStore;
      previewStatus.branchAdvisorEmails = allowedPreview.allowedAdvisorEmails;
      return previewStatus;
    }

    // 4) Resolver IdProducto y precios reales para enviar EN VIVO directo a S Mueblería WCF
    //    (y respaldo automático por cola en plantilla!K5 si la sesión caché en Drive requiere renovación)
    const catalogMap = readPlantillaProductCatalogMap_(sh);
    const sheetRows = sh.getRange(15, 2, items.length, 12).getValues(); // B..M
    const partidasErp = [];
    const skusSummaryParts = [];

    const displayClientForErp = isProyQuote && !/^\[?PROYECTO/i.test(clientNameRaw)
      ? ('PROYECTO - ' + clientNameRaw)
      : clientNameRaw;

    try {
      for (let i = 0; i < items.length; i++) {
        const reqItem = items[i] || {};
        const rSheet = sheetRows[i] || [];
        const sku = String(reqItem.sku || rSheet[0] || '').trim().toUpperCase();
        const cant = Math.max(1, Math.round(Number(reqItem.qty || rSheet[2]) || 1));
        let discFrac = (Number(reqItem.discountPct) || 0) / 100;
        discFrac = Math.max(0, Math.min(1, discFrac));

        const catEntry = catalogMap[sku] || {};
        let idProd = cleanSheetKeyCell_(rSheet[11]) || catEntry.idProducto || '';
        let nombreProd = String(rSheet[1] || catEntry.nombre || reqItem.name || sku).trim();
        let precioOrig = Number(rSheet[3] || catEntry.precio || reqItem.unitList || 0) || 0;

        if (!idProd || !/^\d+$/.test(idProd) || precioOrig <= 0) {
          const liveProd = buscarProductoPorClaveWcf_(sku);
          if (!liveProd || !liveProd.IdProducto) {
            registrarEventoHistorial_(ss, {
              clasificacion: 'FALLO DE CÓDIGO',
              modulo: 'AppsScript WCF · BuscarProductoPorClave',
              evento: 'SKU NO ENCONTRADO EN S MUEBLERÍA',
              estado: '❌ ERROR',
              usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
              sucursal: erpStore,
              referencia: sku,
              detalle: 'Intento de cotizar SKU "' + sku + '" sin IdProducto activo en S Mueblería.',
              analisis: 'El SKU debe estar dado de alta en el catálogo oficial de sistema.smuebleria.com antes de emitir cotización.'
            });
            return {
              ok: false,
              error: 'El SKU "' + sku + '" no existe o no está dado de alta en el sistema S Mueblería.'
            };
          }
          idProd = String(liveProd.IdProducto).trim();
          if (!nombreProd || nombreProd.indexOf('SKU no') >= 0) {
            nombreProd = liveProd.Nombre || sku;
          }
          if (precioOrig <= 0 && liveProd.Precio > 0) {
            precioOrig = Number(liveProd.Precio);
          }
        }

        const precioUnit = Math.round(precioOrig * (1 - discFrac) * 10000) / 10000;
        partidasErp.push({
          Clave: sku,
          Nombre: nombreProd,
          Cantidad: cant,
          PrecioOriginal: precioOrig,
          PrecioUnitario: precioUnit,
          IdProducto: idProd
        });
        skusSummaryParts.push(sku + ' x' + cant);
      }

      const idCategoriaVenta = 2;
      const clientEmail = String(body.clientEmail || '').trim();
      let idCliente = 0;
      let idLead = 0;

      if (explicitCliId > 0) {
        idCliente = explicitCliId;
        idLead = 0;
      } else if (explicitLeadId > 0) {
        idCliente = 0;
        idLead = explicitLeadId;
      } else {
        idLead = crearProspectoProvisionalWcf_(displayClientForErp, clientPhone, clientEmail, idUsuarioNum);
      }

      const fechaEntregaIso = parseDeliveryDateToErpIso_(deliveryDate);
      const erpResult = insertarCotizacionDirectoWcf_({
        idCotizacion: 0,
        idUsuarioAsesor: idUsuarioNum,
        idCliente: idCliente,
        idLead: idLead,
        nombreCliente: displayClientForErp,
        fechaEntregaIso: fechaEntregaIso,
        comentarios: finalNotesForErp,
        idCategoriaVenta: idCategoriaVenta,
        partidas: partidasErp,
        descuentoExtra: extraDiscount
      });

      invalidateErpFoliosCache_();

      const folioFinal = erpResult.folio || estimatedFolio || ('ID-' + erpResult.idCotizacion);
      const refSujeto = idLead ? ('Lead ' + idLead) : ('Cliente ' + idCliente);
      const statusBannerTxt = '✅ COTIZACIÓN CREADA (' + ahoraStr + ') · FOLIO ' + folioFinal + ' · ' + refSujeto;

      sh.getRange('K5').setValue('SOLO REVISIÓN (NO ENVIAR AL ERP)');
      sh.getRange('K6').setValue(statusBannerTxt);
      sh.getRange('K7').setValue(String(erpResult.idCotizacion));
      sh.getRange('M7').setValue(folioFinal);
      // Conservar intacta la fórmula nativa de K8 en plantilla (PRESENTACION_DISENO)
      sh.getRange('K9').setValue(ahoraStr);

      // 5) Registrar el mismo folio oficial de S Mueblería según su tienda o bodega en COTIZACIONES_EN_VIVO
      shQuotes.appendRow([
        folioFinal,
        folioFinal,
        String(erpResult.idCotizacion),
        ahoraStr,
        activeQuoteType,
        verifiedUser.sheetTab,
        erpStore,
        verifiedUser.correo,
        verifiedUser.nombre,
        erpAdvisorLabel,
        String(idUsuarioNum),
        displayClientForErp,
        clientPhone,
        clientMode,
        categoryLabel,
        deliveryDate,
        partidasErp.length,
        skusSummaryParts.join(', '),
        erpResult.subtotal,
        erpResult.iva,
        extraDiscount,
        erpResult.total,
        'COTIZACIÓN REGISTRADA',
        rawNotes
      ]);
      const appendedRow = shQuotes.getLastRow();
      shQuotes.getRange(appendedRow, 19, 1, 4).setNumberFormat('$#,##0.00');

      registrarCotizacionAppEnSeguimiento_(ss, {
        folio: folioFinal,
        fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
        sheetTab: verifiedUser.sheetTab,
        erpStore: erpStore,
        advisorName: verifiedUser.nombre,
        advisorEmail: verifiedUser.correo,
        clientName: displayClientForErp,
        clientPhone: clientPhone,
        partidas: partidasErp
      });

      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript WCF · InsertarCotizacion',
        evento: 'COTIZACIÓN CREADA EN S MUEBLERÍA',
        estado: '✅ OK',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: 'Folio ' + folioFinal + ' (ID ERP ' + erpResult.idCotizacion + ')',
        detalle: 'Cliente: ' + displayClientForErp + ' · Total: $' + Number(erpResult.total || 0).toFixed(2) + ' · Partidas: ' + skusSummaryParts.join(', '),
        analisis: 'Inserción directa WCF SOAP 1.2 exitosa en sistema.smuebleria.com con usuario ERP ' + idUsuarioNum + '.'
      });

      SpreadsheetApp.flush();

      const folioSnapAfter = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
      const nextStoreFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapAfter);

      const finalOut = handleInvPlantillaStatus_();
      finalOut.sentLiveToErp = true;
      finalOut.orderCode = folioFinal;
      finalOut.nextOrderCode = nextStoreFolio;
      finalOut.nextFolioByStore = folioSnapAfter.nextFolioByStore;
      finalOut.quoteType = activeQuoteType;
      finalOut.isProyecto = isProyQuote;
      finalOut.serieLabel = verifiedUser.serieLabel;
      finalOut.folio = folioFinal;
      finalOut.quoteId = String(erpResult.idCotizacion);
      finalOut.erpUserId = String(idUsuarioNum);
      finalOut.erpStatus = statusBannerTxt;
      const allowedAfterDirect = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
      finalOut.recentQuotes = allowedAfterDirect.quotes;
      finalOut.roleScope = allowedAfterDirect.roleScope;
      finalOut.activeStore = allowedAfterDirect.activeStore;
      finalOut.branchAdvisorEmails = allowedAfterDirect.allowedAdvisorEmails;
      return finalOut;
    } catch (wcfErr) {
      // Respaldo automático: si el token caché en Drive expiró, encolar en plantilla!K5 para que servicio_en_vivo.py la suba e hidrate sesión
      const fallbackSummary = items.map(it => String(it.sku || '').trim().toUpperCase() + ' x' + Math.max(1, Math.round(Number(it.qty) || 1))).filter(Boolean);
      sh.getRange('K7').clearContent();
      sh.getRange('M7').clearContent();
      sh.getRange('K6').setValue('⏳ EN COLA AUTOMÁTICA PARA S MUEBLERÍA (' + ahoraStr + ')');
      sh.getRange('K9').setValue(ahoraStr);
      sh.getRange('K5').setValue('ENVIAR COTIZACIÓN A S MUEBLERÍA');
      SpreadsheetApp.flush();

      let daemonQid = '';
      let daemonFolio = '';
      let daemonStatus = '';
      for (let poll = 0; poll < 5; poll++) {
        Utilities.sleep(3000);
        SpreadsheetApp.flush();
        daemonQid = String(sh.getRange('K7').getDisplayValue() || '').trim();
        daemonFolio = String(sh.getRange('M7').getDisplayValue() || '').trim();
        daemonStatus = String(sh.getRange('K6').getDisplayValue() || '').trim();
        if (daemonQid || daemonFolio) break;
        if (/ERROR/i.test(daemonStatus)) break;
      }

      if (daemonQid || daemonFolio) {
        invalidateErpFoliosCache_();
        const folioResolved = daemonFolio || estimatedFolio || ('ID-' + daemonQid);
        const subSheet = Number(sh.getRange('H31').getValue()) || 0;
        const ivaSheet = Number(sh.getRange('H32').getValue()) || 0;
        const totSheet = Number(sh.getRange('H33').getValue()) || 0;

        shQuotes.appendRow([
          folioResolved,
          folioResolved,
          daemonQid,
          ahoraStr,
          activeQuoteType,
          verifiedUser.sheetTab,
          erpStore,
          verifiedUser.correo,
          verifiedUser.nombre,
          erpAdvisorLabel,
          String(idUsuarioNum),
          displayClientForErp,
          clientPhone,
          clientMode,
          categoryLabel,
          deliveryDate,
          items.length,
          fallbackSummary.join(', '),
          subSheet,
          ivaSheet,
          extraDiscount,
          totSheet,
          'COTIZACIÓN REGISTRADA (VÍA SERVICIO)',
          rawNotes
        ]);
        const appRow = shQuotes.getLastRow();
        shQuotes.getRange(appRow, 19, 1, 4).setNumberFormat('$#,##0.00');
        registrarCotizacionAppEnSeguimiento_(ss, {
          folio: folioResolved,
          fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
          sheetTab: verifiedUser.sheetTab,
          erpStore: erpStore,
          advisorName: verifiedUser.nombre,
          advisorEmail: verifiedUser.correo,
          clientName: displayClientForErp,
          clientPhone: clientPhone,
          partidas: partidasErp
        });
        registrarEventoHistorial_(ss, {
          clasificacion: 'MOVIMIENTO',
          modulo: 'AppsScript + servicio_en_vivo.py',
          evento: 'COTIZACIÓN CREADA VÍA COLA DE RESPALDO',
          estado: '✅ OK',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: 'Folio ' + folioResolved + ' (ID ERP ' + daemonQid + ')',
          detalle: 'Cotización completada por servicio_en_vivo.py tras aviso WCF inicial (' + String((wcfErr && wcfErr.message) || wcfErr).slice(0, 140) + ').',
          analisis: analizarCausaFalloCodigo_(wcfErr, 'AppsScript WCF · InsertarCotizacion', 'fallback_daemon')
        });
        SpreadsheetApp.flush();

        const snapAfterDaemon = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
        const nextAfterDaemon = peekNextStoreErpFolio_(erpStore, activePrefix, snapAfterDaemon);
        const outDaemon = handleInvPlantillaStatus_();
        outDaemon.sentLiveToErp = true;
        outDaemon.orderCode = folioResolved;
        outDaemon.nextOrderCode = nextAfterDaemon;
        outDaemon.nextFolioByStore = snapAfterDaemon.nextFolioByStore;
        outDaemon.quoteType = activeQuoteType;
        outDaemon.isProyecto = isProyQuote;
        outDaemon.serieLabel = verifiedUser.serieLabel;
        outDaemon.folio = folioResolved;
        outDaemon.quoteId = daemonQid;
        outDaemon.erpUserId = String(idUsuarioNum);
        outDaemon.erpStatus = daemonStatus;
        const allowedAfterDaemon = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
        outDaemon.recentQuotes = allowedAfterDaemon.quotes;
        outDaemon.roleScope = allowedAfterDaemon.roleScope;
        outDaemon.activeStore = allowedAfterDaemon.activeStore;
        outDaemon.branchAdvisorEmails = allowedAfterDaemon.allowedAdvisorEmails;
        return outDaemon;
      }

      registrarEventoHistorial_(ss, {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript WCF · InsertarCotizacion',
        evento: 'ENVÍO WCF DIRECTO EN COLA DE RESPALDO',
        estado: '⚠️ EN COLA',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: estimatedFolio + ' (' + displayClientForErp + ')',
        detalle: String((wcfErr && wcfErr.message) || wcfErr || 'Fallo WCF directo'),
        analisis: analizarCausaFalloCodigo_(wcfErr, 'AppsScript WCF · InsertarCotizacion', 'inv_submit_quote')
      });

      const queuedOut = handleInvPlantillaStatus_();
      queuedOut.sentLiveToErp = false;
      queuedOut.queuedForDaemon = true;
      queuedOut.wcfReason = String((wcfErr && wcfErr.message) || wcfErr || '');
      queuedOut.orderCode = estimatedFolio;
      queuedOut.nextOrderCode = estimatedFolio;
      queuedOut.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      queuedOut.quoteType = activeQuoteType;
      queuedOut.isProyecto = isProyQuote;
      queuedOut.serieLabel = verifiedUser.serieLabel;
      const allowedQueued = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
      queuedOut.recentQuotes = allowedQueued.quotes;
      queuedOut.roleScope = allowedQueued.roleScope;
      queuedOut.activeStore = allowedQueued.activeStore;
      queuedOut.branchAdvisorEmails = allowedQueued.allowedAdvisorEmails;
      return queuedOut;
    }
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// DESCARGA DEL PDF ORIGINAL DE COTIZACIÓN GENERADO POR S MUEBLERÍA (SOLO LECTURA)
// Reconstruye exactamente la ruta oficial de Muebleria.dll hacia Telerik Reporting:
//   https://sistema.smuebleria.com/VisorReportes.aspx?Reporte={Reporte}&Parametro={IdVenta}&Usuario={IdUsuario}
//   -> Telerik.ReportViewer.axd?instanceID={instanceID}&optype=Export&ExportFormat=PDF
// Sin modificar absolutamente ningún dato en S Mueblería.
// ----------------------------------------------------------------------------
function parseCookieHeaderToJar_(cookieHeader) {
  const jar = {};
  const raw = String(cookieHeader || '').trim();
  if (!raw) return jar;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq > 0) {
      const k = seg.slice(0, eq).trim();
      const v = seg.slice(eq + 1).trim();
      if (k) jar[k] = v;
    }
  }
  return jar;
}

function findPdfMagicOffset_(bytes) {
  if (!bytes || bytes.length < 64) return -1;
  const maxScan = Math.min(bytes.length - 5, 32);
  for (let i = 0; i <= maxScan; i++) {
    if (
      (bytes[i] & 0xFF) === 0x25 &&     // %
      (bytes[i + 1] & 0xFF) === 0x50 && // P
      (bytes[i + 2] & 0xFF) === 0x44 && // D
      (bytes[i + 3] & 0xFF) === 0x46 && // F
      (bytes[i + 4] & 0xFF) === 0x2D    // -
    ) {
      return i;
    }
  }
  return -1;
}

function extractCleanPdfBytes_(bytes) {
  const off = findPdfMagicOffset_(bytes);
  if (off < 0) return null;
  return off === 0 ? bytes : bytes.slice(off);
}

function mapFormatoImpresionesToReportName_(formatoRaw, hasImages, idCategoriaVenta) {
  if (Number(idCategoriaVenta) === 304) return 'CotizacionesCredito';
  const fmt = String(formatoRaw || '').trim();
  if (!fmt) return hasImages ? 'CotizacionesFotos' : 'Cotizaciones';
  switch (fmt) {
    case 'Elegante':
      return hasImages ? 'CotizacionesEleganteFotos' : 'CotizacionesElegante';
    case 'CEIMA':
      return 'CotizacionesCEIMA';
    case 'PERMO':
      return 'CotizacionesPERMO';
    case 'HOCHMAN':
      return 'CotizacionesHOCHMAN';
    case 'Stark':
      return 'CotizacionesStark';
    case 'EleganteVP':
      return 'CotizacionesVP';
    case 'Mudomo':
      return 'CotizacionesMudomo';
    case 'Itika':
      return 'CotizacionesItika';
    case 'Festi':
      return 'CotizacionesFesti';
    case 'EleganteDWR':
      return 'CotizacionesDWR';
    case 'EleganteDizzeno':
      return 'CotizacionesDizzeno';
    case 'EleganteDoble':
      return 'CotizacionesDoble';
    case 'EleganteNatulier':
      return 'CotizacionesNatulier';
    case 'EleganteAshley':
      return 'CotizacionesAshley';
    case 'EleganteTerracu':
      return 'CotizacionesTerracu';
    case 'ElegantePerfecto':
      return 'CotizacionesPerfecto';
    case 'FURU':
      return hasImages ? 'CotizacionesFotosFuru' : 'Cotizaciones';
    case 'ARMONIC':
      return hasImages ? 'CotizacionesFotosArmonic' : 'Cotizaciones';
    case 'VAIVEN':
      return hasImages ? 'CotizacionesFotosVaiven' : 'CotizacionesVaiven';
    case 'SANDERMO':
      return 'CotizacionesSandermo';
    case 'SANDERMOUSD':
      return 'CotizacionesSandermoUSD';
    case 'DELGADO':
      return 'CotizacionesDelgado';
    case 'CASANOVA':
      return 'CotizacionCR';
    default:
      return hasImages ? 'CotizacionesEleganteFotos' : 'CotizacionesElegante';
  }
}

function resolveErpQuoteReportCandidates_(idCotizacion, idUsuario, idCategoriaVenta) {
  const cfg = getErpRuntimeConfig_();
  const uid = parseInt(String(idUsuario || ''), 10) || cfg.masterUserId;
  let formato = '';
  let cachedFmtFound = false;

  try {
    const cache = CacheService.getScriptCache();
    const cachedFmt = cache ? cache.get('erp_fmt_imp_v1_' + uid) : null;
    if (cachedFmt !== null && cachedFmt !== undefined) {
      formato = String(cachedFmt);
      cachedFmtFound = true;
    }
  } catch (ce) {}

  if (!cachedFmtFound) {
    try {
      const xmlCfg = callSmuebleriaWcf_(
        'ObtenerConfiguracionVenta',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + uid + '</IdUsuario>'
      );
      formato = extractXmlTag_(xmlCfg, 'FormatoImpresiones');
      try {
        CacheService.getScriptCache().put('erp_fmt_imp_v1_' + uid, String(formato || ''), 21600);
      } catch (cePut) {}
    } catch (cfgErr) {
      formato = 'Elegante';
    }
  }

  let hasImages = false;
  try {
    const xmlImg = callSmuebleriaWcf_(
      'ValidarImagenesEnProductosPorCotizacion',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdCotizaciones>' + parseInt(String(idCotizacion), 10) + '</IdCotizaciones>'
    );
    const rawBool = extractXmlTag_(xmlImg, 'ValidarImagenesEnProductosPorCotizacionResult');
    hasImages = /^true$/i.test(String(rawBool || '').trim());
  } catch (imgErr) {
    hasImages = false;
  }

  const primary = mapFormatoImpresionesToReportName_(formato, hasImages, idCategoriaVenta);
  const candidates = [primary];
  const altSameFmt = mapFormatoImpresionesToReportName_(formato, !hasImages, idCategoriaVenta);
  if (candidates.indexOf(altSameFmt) === -1) candidates.push(altSameFmt);
  if (candidates.indexOf('CotizacionesEleganteFotos') === -1) candidates.push('CotizacionesEleganteFotos');
  if (candidates.indexOf('CotizacionesElegante') === -1) candidates.push('CotizacionesElegante');
  if (candidates.indexOf('Cotizaciones') === -1) candidates.push('Cotizaciones');
  return candidates;
}

function resolveErpQuoteMetadataForPdf_(ss, body) {
  let quoteIdNum = parseInt(String((body && (body.quoteId || body.idCotizacion)) || '').replace(/[^\d]/g, ''), 10) || 0;
  let folioClean = String((body && (body.folio || body.orderCode)) || '').trim().toUpperCase();
  if (/^ID-\d+$/i.test(folioClean)) {
    if (!quoteIdNum) quoteIdNum = parseInt(folioClean.slice(3), 10) || 0;
    folioClean = '';
  } else if (/^[A-Z]+-\d+$/i.test(folioClean)) {
    folioClean = '';
  }

  let erpUserIdNum = parseInt(String((body && (body.erpUserId || body.erpAdvisorId)) || '').replace(/[^\d]/g, ''), 10) || 0;
  let clientName = String((body && body.clientName) || '').trim();
  let erpStore = String((body && body.erpStore) || '').trim();
  let branchTab = '';
  let advisorEmailOwner = '';
  let foundInLedger = false;

  // 1) Buscar coincidencia autoritativa en COTIZACIONES_EN_VIVO para completar quoteId / folio / tienda / propietario
  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const lastR = shQuotes.getLastRow();
    const startR = Math.max(2, lastR - 400);
    const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, 13).getDisplayValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      const r = vals[i];
      const rOrd = String(r[0] || '').trim().toUpperCase();
      const rFol = String(r[1] || '').trim().toUpperCase();
      const rId = parseInt(String(r[2] || '').replace(/[^\d]/g, ''), 10) || 0;
      const matchById = quoteIdNum > 0 && rId === quoteIdNum;
      const matchByFolio = folioClean && (rFol === folioClean || rOrd === folioClean);
      if (matchById || matchByFolio) {
        foundInLedger = true;
        if (!quoteIdNum && rId > 0) quoteIdNum = rId;
        if (!folioClean && rFol && !/^[A-Z]+-\d+$/i.test(rFol)) folioClean = rFol;
        if (r[5]) branchTab = String(r[5]).trim();
        if (r[6]) erpStore = String(r[6]).trim();
        if (r[7]) advisorEmailOwner = String(r[7]).trim().toLowerCase();
        if (r[10]) erpUserIdNum = parseInt(String(r[10]).replace(/[^\d]/g, ''), 10) || erpUserIdNum;
        if (r[11]) clientName = String(r[11]).trim() || clientName;
        if (quoteIdNum > 0) break;
      }
    }
  }

  // 2) Si solo teníamos el Folio y aún falta IdVenta (quoteIdNum), consultarlo en ObtenerCotizacionesTodas (solo lectura)
  if (!quoteIdNum && folioClean) {
    const cfg = getErpRuntimeConfig_();
    const queries = [
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta>' + xmlEscape_(folioClean) + '</Venta><Filtro></Filtro>',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
    ];
    for (let qIdx = 0; qIdx < queries.length && !quoteIdNum; qIdx++) {
      try {
        const xmlCot = callSmuebleriaWcf_('ObtenerCotizacionesTodas', queries[qIdx]);
        if (!xmlCot) continue;
        const folRe = new RegExp('<(?:[a-zA-Z0-9_]+:)?Folio>\\s*' + folioClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<\\/(?:[a-zA-Z0-9_]+:)?Folio>', 'i');
        const fm = folRe.exec(xmlCot);
        if (fm) {
          const winStart = Math.max(0, fm.index - 2500);
          const winEnd = Math.min(xmlCot.length, fm.index + 2500);
          const chunk = xmlCot.slice(winStart, winEnd);
          const idStr = extractXmlTag_(chunk, 'IdVenta');
          const parsedId = parseInt(String(idStr || '').trim(), 10) || 0;
          if (parsedId > 0) {
            quoteIdNum = parsedId;
            if (!erpUserIdNum) {
              erpUserIdNum = parseInt(String(extractXmlTag_(chunk, 'IdUsuario') || '').trim(), 10) || 0;
            }
            if (!clientName) {
              clientName = extractXmlTag_(chunk, 'Nombre') || extractXmlTag_(chunk, 'Cliente') || '';
            }
          }
        }
      } catch (e) {}
    }
  }

  return {
    quoteIdNum: quoteIdNum,
    folio: folioClean,
    erpUserIdNum: erpUserIdNum,
    clientName: clientName,
    erpStore: erpStore,
    branchTab: branchTab,
    advisorEmailOwner: advisorEmailOwner,
    foundInLedger: foundInLedger
  };
}

function fetchHttpFollowingRedirectsWithJar_(startUrl, jar, ua, refererUrl, maxHops) {
  let curUrl = startUrl;
  const hops = maxHops || 6;
  let lastResp = null;

  for (let hop = 0; hop < hops; hop++) {
    if (/\/Login\.aspx\b/i.test(curUrl)) {
      return { needsLogin: true, finalUrl: curUrl, resp: lastResp };
    }
    const hdrs = {
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8'
    };
    if (refererUrl) hdrs.Referer = refererUrl;
    const ck = cookieJarToHeader_(jar);
    if (ck) hdrs.Cookie = ck;

    const resp = UrlFetchApp.fetch(curUrl, {
      method: 'get',
      headers: hdrs,
      followRedirects: false,
      muteHttpExceptions: true
    });
    lastResp = resp;
    mergeSetCookiesIntoJar_(resp.getAllHeaders(), jar);

    const code = resp.getResponseCode();
    if (code === 401 || code === 403) {
      return { needsLogin: true, finalUrl: curUrl, resp: resp };
    }
    const loc = getHeaderCaseInsensitive_(resp.getAllHeaders(), 'Location');
    if (code >= 300 && code < 400 && loc) {
      const nextUrl = resolveRelativeUrl_(curUrl, loc);
      if (/\/Login\.aspx\b/i.test(nextUrl)) {
        return { needsLogin: true, finalUrl: nextUrl, resp: resp };
      }
      curUrl = nextUrl;
      continue;
    }
    return { needsLogin: false, finalUrl: curUrl, resp: resp };
  }
  return { needsLogin: false, finalUrl: curUrl, resp: lastResp };
}

function extractTelerikExportTargetsFromVisorHtml_(html, baseVisorUrl) {
  const s = decodeXmlEntities_(String(html || ''));
  const exportUrls = [];
  const warmUrls = [];
  const pushUnique = (arr, u) => {
    if (u && arr.indexOf(u) === -1) arr.push(u);
  };

  // 1) Localizar rutas a Telerik.ReportViewer.axd en el HTML del visor
  const axdMatches = s.match(/[^\s"'<>()]*Telerik\.ReportViewer\.axd\?[^\s"'<>()]+/gi) || [];
  let firstHandlerBase = '';
  let foundInstanceId = '';
  let cultureSuffix = '';

  for (let i = 0; i < axdMatches.length; i++) {
    const rawAxd = axdMatches[i];
    const fullAxd = resolveRelativeUrl_(baseVisorUrl, rawAxd);
    const qPos = fullAxd.indexOf('?');
    const basePart = qPos >= 0 ? fullAxd.slice(0, qPos) : fullAxd;
    const qsPart = qPos >= 0 ? fullAxd.slice(qPos + 1) : '';
    if (!firstHandlerBase && basePart) firstHandlerBase = basePart;

    const mInst = qsPart.match(/(?:^|&)instanceID=([^&]+)/i);
    if (mInst && !foundInstanceId) {
      foundInstanceId = decodeURIComponent(mInst[1]);
    }
    if (!cultureSuffix) {
      const mCul = qsPart.match(/(?:^|&)(culture=[^&]+)/i);
      const mUiCul = qsPart.match(/(?:^|&)(uiculture=[^&]+)/i);
      cultureSuffix = (mCul ? ('&' + mCul[1]) : '') + (mUiCul ? ('&' + mUiCul[1]) : '');
    }
    if (/optype=ReportArea/i.test(qsPart) || /optype=Parameters/i.test(qsPart)) {
      pushUnique(warmUrls, fullAxd);
    }
    if (/optype=Export/i.test(qsPart) && /ExportFormat=PDF/i.test(qsPart)) {
      pushUnique(exportUrls, fullAxd);
    }
  }

  // 2) Constructor posicional de Telerik WebForms ReportViewer (v8.0.14.507 en VisorReportes.aspx):
  //    new ReportViewer(..., '/Telerik.ReportViewer.axd', '69399ed7e2624f07a16bce78292e2d68', ...)
  if (!foundInstanceId) {
    const ctorMatch = s.match(/new\s+ReportViewer\s*\([\s\S]{0,1400}?(['"])([^'"]*Telerik\.ReportViewer\.axd(?:\?[^'"]*)?)\1\s*,\s*(['"])([a-fA-F0-9\-]{16,64})\3/i) ||
      s.match(/(['"])([^'"]*Telerik\.ReportViewer\.axd(?:\?[^'"]*)?)\1\s*,\s*(['"])([a-fA-F0-9\-]{16,64})\3/i);
    if (ctorMatch) {
      if (!firstHandlerBase && ctorMatch[2]) {
        const resolvedCtorAxd = resolveRelativeUrl_(baseVisorUrl, ctorMatch[2]);
        const qIdx = resolvedCtorAxd.indexOf('?');
        firstHandlerBase = qIdx >= 0 ? resolvedCtorAxd.slice(0, qIdx) : resolvedCtorAxd;
      }
      if (ctorMatch[4]) {
        foundInstanceId = ctorMatch[4];
      }
    }
  }

  // 3) Respaldo adicional: extraer instanceID desde propiedad nombrada JS
  if (!foundInstanceId) {
    const jsInst = s.match(/["']?instanceI[dD]["']?\s*[:=]\s*["']([a-zA-Z0-9\-]{16,64})["']/);
    if (jsInst && jsInst[1]) {
      foundInstanceId = jsInst[1];
    }
  }

  if (!firstHandlerBase) {
    firstHandlerBase = resolveRelativeUrl_(baseVisorUrl, '/Telerik.ReportViewer.axd');
  }

  if (foundInstanceId) {
    if (cultureSuffix) {
      pushUnique(
        exportUrls,
        firstHandlerBase + '?instanceID=' + encodeURIComponent(foundInstanceId) + cultureSuffix + '&optype=Export&ExportFormat=PDF'
      );
    }
    pushUnique(
      exportUrls,
      firstHandlerBase + '?instanceID=' + encodeURIComponent(foundInstanceId) + '&optype=Export&ExportFormat=PDF'
    );
  }

  // 4) Si VisorReportes incrusta un enlace directo a PDF (<embed>, <iframe>, <object>)
  const embedMatches = s.match(/(?:src|data|href)\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi) || [];
  for (let j = 0; j < embedMatches.length; j++) {
    const mUrl = embedMatches[j].match(/["']([^"']+)["']/);
    if (mUrl && mUrl[1]) {
      pushUnique(exportUrls, resolveRelativeUrl_(baseVisorUrl, mUrl[1]));
    }
  }

  return {
    instanceId: foundInstanceId,
    exportUrls: exportUrls,
    warmUrls: warmUrls
  };
}

function downloadPdfBytesFromVisorUrl_(visorUrl, jar, ua) {
  const visorHop = fetchHttpFollowingRedirectsWithJar_(visorUrl, jar, ua, 'https://sistema.smuebleria.com/Sistema.aspx', 6);
  if (visorHop.needsLogin) {
    return { ok: false, needsLogin: true };
  }
  const resp = visorHop.resp;
  if (!resp) {
    return { ok: false, error: 'Sin respuesta HTTP desde VisorReportes.aspx.' };
  }

  const rawBytes = resp.getContent();
  const directPdf = extractCleanPdfBytes_(rawBytes);
  if (directPdf) {
    return { ok: true, pdfBytes: directPdf };
  }

  const html = resp.getContentText('UTF-8');
  if (/CampoCorreoElectronico|CampoContrasena/i.test(html) || /<form[^>]*action=["'][^"']*Login\.aspx/i.test(html)) {
    return { ok: false, needsLogin: true };
  }

  const code = resp.getResponseCode();
  if (code >= 400) {
    return { ok: false, error: 'VisorReportes.aspx devolvió HTTP ' + code + '.' };
  }

  const targets = extractTelerikExportTargetsFromVisorHtml_(html, visorHop.finalUrl);
  if (!targets.exportUrls.length) {
    return {
      ok: false,
      error: 'VisorReportes.aspx no expuso un documento PDF ni instanceID de Telerik ReportViewer (' + html.replace(/\s+/g, ' ').slice(0, 180) + ').'
    };
  }

  // Intento directo sobre Telerik.ReportViewer.axd?instanceID=...&optype=Export&ExportFormat=PDF
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      if (!targets.warmUrls.length) break;
      for (let w = 0; w < targets.warmUrls.length; w++) {
        fetchHttpFollowingRedirectsWithJar_(targets.warmUrls[w], jar, ua, visorHop.finalUrl, 4);
      }
    }
    for (let i = 0; i < targets.exportUrls.length; i++) {
      const expHop = fetchHttpFollowingRedirectsWithJar_(targets.exportUrls[i], jar, ua, visorHop.finalUrl, 6);
      if (expHop.needsLogin) {
        return { ok: false, needsLogin: true };
      }
      if (!expHop.resp) continue;
      const expPdf = extractCleanPdfBytes_(expHop.resp.getContent());
      if (expPdf) {
        return { ok: true, pdfBytes: expPdf };
      }
    }
  }

  return {
    ok: false,
    error: 'Telerik.ReportViewer.axd no devolvió bytes PDF válidos para instanceID=' + (targets.instanceId || 'N/A') + '.'
  };
}

function buildSafeQuotePdfFileName_(folio, quoteId, clientName) {
  const cleanPart = (txt, maxLen) => String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen || 28);

  const fTag = cleanPart(folio || ('ID_' + quoteId), 20) || ('ID_' + quoteId);
  const cTag = cleanPart(clientName, 26);
  return 'Cotizacion_SMuebleria_' + fTag + (cTag ? ('_' + cTag) : '') + '.pdf';
}

function handleInvDownloadErpQuotePdf_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) {
    return authCheck;
  }
  const verifiedUser = authCheck.advisor;
  if (verifiedUser.isGuest || verifiedUser.soloLectura || String(verifiedUser.sheetTab || '').toUpperCase() === 'INVITADOS') {
    return {
      ok: false,
      error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu cuenta no tiene permisos para consultar ni descargar cotizaciones.'
    };
  }

  try {
    const resolved = resolveErpQuoteMetadataForPdf_(ss, body || {});
    if (!resolved.quoteIdNum || resolved.quoteIdNum <= 0) {
      return {
        ok: false,
        error: 'No se encontró el ID oficial de esta cotización en S Mueblería para descargar su PDF original.'
      };
    }

    // Validación estricta de permisos de visualización/descarga por rol y bodega/tienda activa:
    // - Asesor: únicamente sus propias cotizaciones en la bodega/tienda activa de su sesión.
    // - Gerente: únicamente sus propias cotizaciones y las de los asesores de su bodega/tienda activa.
    // - Administrador: acceso completo.
    if (!verifiedUser.isAdmin) {
      const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
      const userStoreNorm = normalizeQuoteErpStore_(verifiedUser.erpStore, verifiedUser.sheetTab);
      const quoteStoreNorm = normalizeQuoteErpStore_(resolved.erpStore, resolved.branchTab);
      const ownerEmail = String(resolved.advisorEmailOwner || '').trim().toLowerCase();
      const isManager = isManagerUserRole_(verifiedUser);

      if (resolved.foundInLedger) {
        if (!isManager) {
          if (ownerEmail !== userEmail || quoteStoreNorm !== userStoreNorm) {
            return {
              ok: false,
              error: 'Como asesor únicamente puedes ver y descargar los PDFs de tus propias cotizaciones generadas en tu bodega/tienda activa (' + (verifiedUser.erpStore || verifiedUser.sheetTab) + ').'
            };
          }
        } else {
          const allowedMap = getAllowedAdvisorEmailsForManager_(authCheck.allUsers, verifiedUser, userStoreNorm);
          if (quoteStoreNorm !== userStoreNorm || !ownerEmail || !allowedMap[ownerEmail]) {
            return {
              ok: false,
              error: 'Como gerente únicamente puedes ver y descargar los PDFs de tus propias cotizaciones y las de los asesores de tu bodega/tienda (' + (verifiedUser.erpStore || verifiedUser.sheetTab) + ').'
            };
          }
        }
      } else {
        return {
          ok: false,
          error: 'Esta cotización no pertenece a las cotizaciones registradas en tu cuenta y bodega/tienda activa.'
        };
      }
    }

    const cfg = getErpRuntimeConfig_();
    const idUsuarioReporte = resolved.erpUserIdNum ||
      parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) ||
      cfg.masterUserId;
    const idCategoriaVenta = parseInt(String((body && body.idCategoriaVenta) || '2'), 10) || 2;
    const reportCandidates = resolveErpQuoteReportCandidates_(resolved.quoteIdNum, idUsuarioReporte, idCategoriaVenta);

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let sess = getValidErpSession_(false, cfg);
    if (!sess.cookieHeader) {
      try {
        sess = getValidErpSession_(true, cfg);
      } catch (relogIgnore) {}
    }

    let lastErrMsg = '';
    for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
      const jar = parseCookieHeaderToJar_(sess.cookieHeader);
      let needFreshLogin = false;

      for (let rIdx = 0; rIdx < reportCandidates.length; rIdx++) {
        const repName = reportCandidates[rIdx];
        const visorUrl = 'https://sistema.smuebleria.com/VisorReportes.aspx?Reporte=' +
          encodeURIComponent(repName) +
          '&Parametro=' + encodeURIComponent(String(resolved.quoteIdNum)) +
          '&Usuario=' + encodeURIComponent(String(idUsuarioReporte));

        const dlRes = downloadPdfBytesFromVisorUrl_(visorUrl, jar, ua);
        if (dlRes && dlRes.ok && dlRes.pdfBytes) {
          const fileName = buildSafeQuotePdfFileName_(resolved.folio, resolved.quoteIdNum, resolved.clientName);
          const pdfBase64 = Utilities.base64Encode(dlRes.pdfBytes);
          const refLabel = (resolved.folio ? ('Folio ' + resolved.folio + ' · ') : '') + 'ID ERP ' + resolved.quoteIdNum;

          registrarEventoHistorial_(ss, {
            clasificacion: 'MOVIMIENTO',
            modulo: 'AppsScript · VisorReportes S Mueblería',
            evento: 'DESCARGA DE PDF ORIGINAL S MUEBLERÍA',
            estado: '✅ OK',
            usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
            sucursal: resolved.erpStore || verifiedUser.erpStore || '',
            referencia: refLabel,
            detalle: 'Archivo original "' + fileName + '" (' + Math.round(dlRes.pdfBytes.length / 1024) + ' KB · Reporte ' + repName + ').',
            analisis: 'PDF oficial obtenido en solo lectura desde sistema.smuebleria.com/VisorReportes.aspx sin alterar datos en S Mueblería.'
          });

          return {
            ok: true,
            pdfBase64: pdfBase64,
            mimeType: 'application/pdf',
            fileName: fileName,
            quoteId: String(resolved.quoteIdNum),
            folio: resolved.folio || ('ID-' + resolved.quoteIdNum),
            reportName: repName,
            byteLength: dlRes.pdfBytes.length
          };
        }

        if (dlRes && dlRes.needsLogin) {
          needFreshLogin = true;
          break;
        }
        if (dlRes && dlRes.error) {
          lastErrMsg = dlRes.error;
        }
      }

      if (needFreshLogin && authAttempt === 0) {
        sess = getValidErpSession_(true, cfg);
        continue;
      }
      break;
    }

    const failMsg = lastErrMsg || 'No fue posible obtener el PDF original desde VisorReportes.aspx en S Mueblería.';
    registrarEventoHistorial_(ss, {
      clasificacion: 'ALERTA TÉCNICA',
      modulo: 'AppsScript · VisorReportes S Mueblería',
      evento: 'AVISO AL DESCARGAR PDF ORIGINAL S MUEBLERÍA',
      estado: '⚠️ ALERTA',
      usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
      sucursal: resolved.erpStore || verifiedUser.erpStore || '',
      referencia: (resolved.folio || '') + ' (ID ERP ' + resolved.quoteIdNum + ')',
      detalle: failMsg.slice(0, 260),
      analisis: 'Verificar disponibilidad de VisorReportes.aspx / Telerik.ReportViewer.axd en sistema.smuebleria.com.'
    });

    return {
      ok: false,
      error: 'S Mueblería no entregó el PDF original en este momento (' + failMsg + '). Intenta nuevamente en unos segundos.'
    };
  } catch (err) {
    const errTxt = String((err && err.message) || err || 'Error desconocido');
    registrarEventoHistorial_(ss, {
      clasificacion: 'FALLO DE CÓDIGO',
      modulo: 'AppsScript · handleInvDownloadErpQuotePdf_',
      evento: 'ERROR EN DESCARGA DE PDF ORIGINAL S MUEBLERÍA',
      estado: '❌ ERROR',
      usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
      sucursal: verifiedUser.erpStore || '',
      referencia: String((body && (body.folio || body.quoteId)) || ''),
      detalle: errTxt.slice(0, 260),
      analisis: analizarCausaFalloCodigo_(err, 'AppsScript · handleInvDownloadErpQuotePdf_', 'inv_download_erp_quote_pdf')
    });
    return {
      ok: false,
      error: 'No se pudo descargar el PDF original de S Mueblería: ' + errTxt
    };
  }
}

/**
 * Organiza las 7 pestañas de cuentas de usuarios alineadas 100% con S Mueblería ERP:
 * - Cero hojas vacías o sin ocupar (PLAYA, COLOCIO, OUTLET COLOSIO, PTC, CASA CREATA, PROYECTOS y CUENTAS ADMINISTRATIVAS).
 * - Gerentes respetados tal cual en el sistema (100% descuento) y Asesores con 24% de descuento.
 * - Santiago Torres e Irvin Kevin Reyna Valdez como Administradores Generales (100% descuento, ven todas las tiendas y bodegas).
 * - TODOS los usuarios quedan con Contraseña Temporal activa (Columna F) y Contraseña personal vacía (Columna G).
 * - Columna H: Usuario / ID Asesor en S Mueblería · Columna I (al costado): Descuento (%).
 */
function organizarCuentasYDescuentosEnHojas(opts) {
  const silentUi = !!(opts && opts.silentUi);
  const ss = getSpreadsheet_();

  // 1) Conservar las contraseñas temporales actuales por correo (o pasar la existente a temporal) para que todos queden con Contraseña Temporal activa
  const existingTempByEmail = {};
  const existingAnyKeyByEmail = {};
  const candidateTabs = ['PLAYA', 'COLOCIO', 'COLOSIO', 'OUTLET COLOSIO', 'PTC', 'CASA CREATA', 'PROYECTOS', 'CUENTAS ADMINISTRATIVAS'];

  for (let t = 0; t < candidateTabs.length; t++) {
    const shOld = ss.getSheetByName(candidateTabs[t]);
    if (!shOld) continue;
    const hdrRow = findUserHeaderRow1Based_(shOld);
    if (hdrRow < 1 || shOld.getLastRow() <= hdrRow) continue;
    const startR = hdrRow + 1;
    const nRows = shOld.getLastRow() - hdrRow;
    const cols = Math.min(shOld.getMaxColumns(), 7);
    const oldVals = shOld.getRange(startR, 1, nRows, cols).getValues();
    for (let i = 0; i < oldVals.length; i++) {
      const em = String(oldVals[i][4] || '').trim().toLowerCase();
      if (!em || em.indexOf('@') === -1) continue;
      const tKey = cleanSheetKeyCell_(oldVals[i][5]);
      const dKey = cleanSheetKeyCell_(oldVals[i][6]);
      if (tKey && !existingTempByEmail[em]) {
        existingTempByEmail[em] = tKey;
      }
      if ((tKey || dKey) && !existingAnyKeyByEmail[em]) {
        existingAnyKeyByEmail[em] = tKey || dKey;
      }
    }
  }

  function resolveTempKeyForEmail_(email, fallbackSeed) {
    const em = String(email || '').trim().toLowerCase();
    if (existingTempByEmail[em]) return existingTempByEmail[em];
    if (existingAnyKeyByEmail[em]) {
      existingTempByEmail[em] = existingAnyKeyByEmail[em];
      return existingTempByEmail[em];
    }
    const generated = fallbackSeed || String(100000 + Math.floor(Math.random() * 900000));
    existingTempByEmail[em] = generated;
    return generated;
  }

  // 2) Definición exacta alineada a S Mueblería ERP (plantilla!AB2:AD76) + correos reales del equipo
  const sheetsPlan = [
    {
      tabName: 'PLAYA',
      headerSucursal: 'SUC. PLAYA',
      storeCell: 'CREATA LIVING PLAYA',
      accounts: [
        { nombre: 'JULIO DE LA CRUZ RAMON', puesto: 'Asesor Interiorista', correo: 'juliocruz@creatamuebles.com', erpLabel: 'JULIO DE LA CRUZ RAMON | CREATA LIVING PLAYA [ID: 39822]', descuento: '24%' },
        { nombre: 'ROCIO ESQUIVEL', puesto: 'Gerente de Tienda', correo: 'rocio.esquivel@creatamuebles.com', erpLabel: 'ROCIO ESQUIVEL | CREATA LIVING PLAYA [ID: 14472]', descuento: '100%' },
        { nombre: 'JUAN DZUL', puesto: 'Asesor Interiorista', correo: 'juan.dz@creatamuebles.com', erpLabel: 'JUAN DZUL | CREATA LIVING PLAYA [ID: 31421]', descuento: '24%' },
        { nombre: 'SAMANTHA SILVA', puesto: 'Asesor Interiorista', correo: 'samantha.silva@creatamuebles.com', erpLabel: 'Samantha Silva | CREATA LIVING PLAYA [ID: 42700]', descuento: '24%' }
      ]
    },
    {
      tabName: 'COLOCIO',
      headerSucursal: 'SUC. COLOSIO',
      storeCell: 'CREATA LIVING COLOSIO',
      accounts: [
        { nombre: 'JANINE MEDINA', puesto: 'Gerente de Tienda', correo: 'janine.medina@creatamuebles.com', erpLabel: 'JANINE  MEDINA | CREATA LIVING COLOSIO [ID: 21155]', descuento: '100%' },
        { nombre: 'FERNANDA PEREZ', puesto: 'Asesor Interiorista', correo: 'fernanda.perez@creatamuebles.com', erpLabel: 'FERNANDA PEREZ | CREATA LIVING COLOSIO [ID: 40872]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesor Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO | CREATA LIVING COLOSIO [ID: 32215]', descuento: '24%' },
        { nombre: 'JUAN CARLOS HERNANDEZ GARCIA', puesto: 'Asesor Interiorista', correo: 'juan.hdz@creatamuebles.com', erpLabel: 'JUAN CARLOS HERNANDEZ GARCIA | CREATA LIVING COLOSIO [ID: 39365]', descuento: '24%' },
        { nombre: 'MIGUEL ANGEL SANCHEZ MARTINEZ', puesto: 'Asesor Interiorista', correo: 'miguel.sanchez@creatamuebles.com', erpLabel: 'MIGUEL ANGEL SANCHEZ MARTINEZ | CREATA LIVING COLOSIO [ID: 39117]', descuento: '24%' },
        { nombre: 'JOHANA SOLARTE', puesto: 'Asesora de Ventas', correo: 'johanna.solarte@creatamuebles.com', erpLabel: 'JOHANA SOLARTE | CREATA LIVING COLOSIO [ID: 31715]', descuento: '24%' }
      ]
    },
    {
      tabName: 'OUTLET COLOSIO',
      headerSucursal: 'SUC. OUTLET COLOSIO',
      storeCell: 'OUTLET COLOSIO',
      accounts: [
        { nombre: 'JANINE MEDINA', puesto: 'Gerente de Tienda', correo: 'janine.medina@creatamuebles.com', erpLabel: 'JANINE MEDINA | OUTLET COLOSIO [ID: 42801]', descuento: '100%' },
        { nombre: 'FERNANDA PEREZ', puesto: 'Asesor Interiorista', correo: 'fernanda.perez@creatamuebles.com', erpLabel: 'FERNANDA PEREZ | OUTLET COLOSIO [ID: 40745]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesor Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO OUTLET | OUTLET COLOSIO [ID: 38932]', descuento: '24%' },
        { nombre: 'JUAN CARLOS HERNANDEZ GARCIA', puesto: 'Asesor Interiorista', correo: 'juan.hdz@creatamuebles.com', erpLabel: 'JUAN CARLOS HERNANDEZ GARCIA | OUTLET COLOSIO [ID: 40264]', descuento: '24%' },
        { nombre: 'MIGUEL ANGEL SANCHEZ MARTINEZ', puesto: 'Asesor Interiorista', correo: 'miguel.sanchez@creatamuebles.com', erpLabel: 'MIGUEL ANGEL SANCHEZ MARTINEZ | OUTLET COLOSIO [ID: 40873]', descuento: '24%' }
      ]
    },
    {
      tabName: 'PTC',
      headerSucursal: 'SUC. PTC',
      storeCell: 'CREATA PUERTO CANCUN',
      accounts: [
        { nombre: 'ALEXA PADILLA RIQUELME', puesto: 'Gerente de Tienda', correo: 'alexa.padilla@creatamuebles.com', erpLabel: 'ALEXA PADILLA RIQUELME | CREATA PUERTO CANCUN [ID: 37110]', descuento: '100%' },
        { nombre: 'DANIELA ARROYO', puesto: 'Asesora Interiorista', correo: 'daniela.arroyo@creatamuebles.com', erpLabel: 'DANIELA ARROYO | CREATA PUERTO CANCUN [ID: 24645]', descuento: '24%' },
        { nombre: 'ELOISA MONTOYA', puesto: 'Asesora Interiorista', correo: 'eloisa.montoya@creatamuebles.com', erpLabel: 'ELOISA MONTOYA | CREATA PUERTO CANCUN [ID: 36029]', descuento: '24%' },
        { nombre: 'PAULA DURAN DE LA MADRID', puesto: 'Asesora Interiorista', correo: 'paula.duran@creatamuebles.com', erpLabel: 'PAULA DURAN DE LA MADRID | CREATA PUERTO CANCUN [ID: 41013]', descuento: '24%' },
        { nombre: 'VIRIDIANA CASTELLANOS', puesto: 'Asesora de Ventas', correo: 'viridiana.castellanos@creatamuebles.com', erpLabel: 'VIRIDIANA CASTELLANOS | CREATA PUERTO CANCUN [ID: 14471]', descuento: '24%' }
      ]
    },
    {
      tabName: 'CASA CREATA',
      headerSucursal: 'SUC. CASA CREATA',
      storeCell: 'CASA CREATA BONAMPAK',
      accounts: [
        { nombre: 'GUADALUPE SANCHEZ', puesto: 'Gerente de Tienda', correo: 'lupita.sanchez@creatamuebles.com', erpLabel: 'GUADALUPE SANCHEZ | CASA CREATA BONAMPAK [ID: 14478]', descuento: '100%' },
        { nombre: 'JUAN PABLO GONZALEZ SALAS', puesto: 'Asesor Interiorista', correo: 'pablo.gonzalez@creatamuebles.com', erpLabel: 'JUAN PABLO GONZALEZ SALAS | CASA CREATA BONAMPAK [ID: 40613]', descuento: '24%' },
        { nombre: 'STEPHANIE PALOMA IBAREZ SALINAS', puesto: 'Asesor Interiorista', correo: 'paloma.ibarez@creatamuebles.com', erpLabel: 'STEPHANIE PALOMA IBAREZ SALINAS | CASA CREATA BONAMPAK [ID: 38330]', descuento: '24%' },
        { nombre: 'HEYSER GRETA ARANZA TAPIA MORALES', puesto: 'Asesor Interiorista', correo: 'greta.tapia@creatamuebles.com', erpLabel: 'HEYSER GRETA ARANZA TAPIA MORALES | CASA CREATA BONAMPAK [ID: 39852]', descuento: '24%' }
      ]
    },
    {
      tabName: 'PROYECTOS',
      headerSucursal: 'PROYECTOS',
      storeCell: 'PROYECTOS ANIPA INTERIOR',
      accounts: [
        { nombre: 'NELSON HERNANDEZ RODRIGUEZ', puesto: 'Gerente Comercial de Proyectos', correo: 'gte.proyectos@creatamuebles.com', erpLabel: 'NELSON HERNANDEZ RODRIGEZ | PROYECTOS ANIPA INTERIOR [ID: 38733]', descuento: '100%' },
        { nombre: 'ALEXA PADILLA RIQUELME', puesto: 'Gerente de Tienda', correo: 'alexa.padilla@creatamuebles.com', erpLabel: 'ALEXA PADILLA RIQUELME (PROYECTOS) | PROYECTOS ANIPA INTERIOR [ID: 37686]', descuento: '100%' },
        { nombre: 'JOHANA SOLARTE', puesto: 'Asesora de Ventas', correo: 'johanna.solarte@creatamuebles.com', erpLabel: 'JOHANA SOLARTE | PROYECTOS ANIPA INTERIOR [ID: 23073]', descuento: '24%' },
        { nombre: 'RENATO DANIEL CUEVAS CHAVEZ', puesto: 'Coordinador de Proyectos', correo: 'renato.cuevas@creatamuebles.com', erpLabel: 'RENATO DANIEL CUEVAS CHAVEZ PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41808]', descuento: '24%' },
        { nombre: 'JULIAN AREVALO', puesto: 'Arquitecto Interiorista', correo: 'julian.arevalo@creatamuebles.com', erpLabel: 'Julian Arevalo | PROYECTOS ANIPA INTERIOR [ID: 42702]', descuento: '24%' },
        { nombre: 'MILDRED PACHECO SAAVEDRA', puesto: 'Interiorista Corporativa', correo: 'mildred.pacheco@creatamuebles.com', erpLabel: 'Mildred Saavedra | PROYECTOS ANIPA INTERIOR [ID: 42186]', descuento: '24%' },
        { nombre: 'DANIELA ARROYO', puesto: 'Asesora Interiorista', correo: 'daniela.arroyo@creatamuebles.com', erpLabel: 'DANIELA ARROYO PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41810]', descuento: '24%' },
        { nombre: 'ELOISA MONTOYA', puesto: 'Asesora de Proyectos', correo: 'eloisa.montoya@creatamuebles.com', erpLabel: 'ELOISA MONTOYA (PROYECTOS) | PROYECTOS ANIPA INTERIOR [ID: 24648]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesora Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41807]', descuento: '24%' },
        { nombre: 'ANGEL DAVID IZQUIERDO SANCHEZ', puesto: 'Arquitecto Interiorista', correo: 'angel.izquierdo@creatamuebles.com', erpLabel: 'ANGEL DAVID IZQUIERDO SANCHEZ | CEDIS [ID: 41862]', descuento: '24%' }
      ]
    },
    {
      tabName: 'CUENTAS ADMINISTRATIVAS',
      headerSucursal: 'ADMINISTRACIÓN',
      storeCell: 'TODAS LAS TIENDAS / CEDIS',
      accounts: [
        { nombre: 'SANTIAGO TORRES', puesto: 'Administrador General', correo: 'santiago.torres@grupoanipa.com', erpLabel: 'SANTIAGO TORRES | ADMINISTRACION [ID: 24599]', descuento: '100%' },
        { nombre: 'IRVIN KEVIN REYNA VALDEZ', puesto: 'Administrador General', correo: 'kevin.reyna@grupoanipa.com', erpLabel: 'IRVIN KEVIN REYNA VALDEZ | CEDIS [ID: 38954]', descuento: '100%' }
      ]
    }
  ];

  let totalRowsWritten = 0;
  const activeTabNames = {};

  for (let p = 0; p < sheetsPlan.length; p++) {
    const plan = sheetsPlan[p];
    activeTabNames[plan.tabName.toUpperCase()] = true;
    let sh = ss.getSheetByName(plan.tabName);
    if (!sh) {
      sh = ss.insertSheet(plan.tabName, ss.getSheets().length);
    }
    if (sh.getMaxColumns() < 9) {
      sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns());
    }
    const neededRows = plan.accounts.length + 5;
    if (sh.getMaxRows() < neededRows) {
      sh.insertRowsAfter(sh.getMaxRows(), neededRows - sh.getMaxRows());
    }

    sh.getRange(1, 1, sh.getMaxRows(), Math.min(sh.getMaxColumns(), 12)).clearContent();

    const headerRowVals = [[
      '',
      plan.headerSucursal,
      'Nombre',
      'Puesto',
      'Correo',
      'Contraseña Temporal',
      'Contraseña',
      'Usuario / ID Asesor',
      'Descuento'
    ]];
    sh.getRange(2, 1, 1, 9).setValues(headerRowVals);
    sh.getRange(2, 2, 1, 8)
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(2, 8, 1, 2).setBackground('#A38251');

    const dataRows = plan.accounts.map((acc) => {
      const tempK = resolveTempKeyForEmail_(acc.correo);
      return [
        '',
        plan.storeCell,
        acc.nombre,
        acc.puesto,
        acc.correo.toLowerCase(),
        tempK,
        '',
        acc.erpLabel,
        acc.descuento
      ];
    });

    if (dataRows.length > 0) {
      sh.getRange(3, 6, dataRows.length, 2).setNumberFormat('@');
      sh.getRange(3, 1, dataRows.length, 8).setValues(dataRows.map((r) => r.slice(0, 8)));
      for (let dIdx = 0; dIdx < dataRows.length; dIdx++) {
        const discSpec = String(dataRows[dIdx][8] || '');
        const cellDisc = sh.getRange(3 + dIdx, 9);
        if (discSpec === '24%' || /^=IF/i.test(discSpec)) {
          cellDisc.setFormula('=IF(TODAY()<=DATE(2026,11,30),"30%","24%")');
        } else {
          cellDisc.setNumberFormat('@').setValue(discSpec);
        }
      }
      sh.getRange(3, 6, dataRows.length, 2).setHorizontalAlignment('center');
      sh.getRange(3, 9, dataRows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
      totalRowsWritten += dataRows.length;
    }

    sh.setColumnWidth(1, 28);
    sh.setColumnWidth(2, 185);
    sh.setColumnWidth(3, 235);
    sh.setColumnWidth(4, 195);
    sh.setColumnWidth(5, 245);
    sh.setColumnWidth(6, 155);
    sh.setColumnWidth(7, 135);
    sh.setColumnWidth(8, 340);
    sh.setColumnWidth(9, 105);
    sh.setFrozenRows(2);
  }

  // 3) Asegurar que la hoja INVITADOS exista intacta y eliminar únicamente hojas por defecto 100% vacías (ej. "Hoja 2"), protegiendo todas las pestañas de otros proyectos y fórmulas
  try { ensureInvitadosSheet_(ss); } catch (eInvEnsure) {}
  const protectedTabs = {
    '1': true,
    'INVITADOS': true,
    'CATALOGO_PRODUCTOS': true,
    'PIEZAS_MODULOS': true,
    'SALAS_MODULARES': true,
    'MUEBLES_INDIVIDUALES': true,
    'INVENTARIO_EN_VIVO': true,
    'INF. PRODUC': true,
    'PLANTILLA': true,
    'COTIZACIONES_EN_VIVO': true,
    'HISTORIAL': true,
    'FOTOS NUEVAS CARGADO': true,
    'FOTOS NUEVAS': true,
    '_CREATA_CONFIG': true
  };
  eliminarPestanaTopBuscadosSiExiste_(ss);
  const removedEmptySheets = [];
  const allSheets = ss.getSheets();
  for (let s = 0; s < allSheets.length; s++) {
    const shItem = allSheets[s];
    const sName = shItem.getName();
    const sUp = sName.trim().toUpperCase();
    if (activeTabNames[sUp] || protectedTabs[sUp]) continue;
    const isDefaultBlankSheet = /^(HOJA|SHEET)\s*\d+$/i.test(sName.trim()) && shItem.getLastRow() === 0 && shItem.getLastColumn() === 0;
    const isDuplicateEmptyColosio = (sUp === 'COLOSIO' && activeTabNames['COLOCIO'] && shItem.getLastRow() === 0 && shItem.getLastColumn() === 0);
    if ((isDefaultBlankSheet || isDuplicateEmptyColosio) && ss.getSheets().length > 1) {
      removedEmptySheets.push(sName);
      ss.deleteSheet(shItem);
    }
  }

  SpreadsheetApp.flush();

  if (!silentUi) {
    try {
      SpreadsheetApp.getUi().alert(
        '¡Cuentas, Contraseñas Temporales y Descuentos listos!\n\n' +
        '• 7 hojas ocupadas (0 hojas vacías): PLAYA, COLOCIO, OUTLET COLOSIO, PTC, CASA CREATA, PROYECTOS y CUENTAS ADMINISTRATIVAS.\n' +
        '• Total de registros configurados: ' + totalRowsWritten + '\n' +
        '• Administradores Generales (ver todo · 100%): Santiago Torres e Irvin Kevin Reyna Valdez.\n' +
        '• Todos los usuarios quedaron con Contraseña Temporal activa (Columna F) y Contraseña personal vacía (Columna G).\n' +
        '• Columna H: Usuario / ID Asesor S Mueblería · Columna I: Descuento (24% Asesores / 100% Gerentes y Administradores).'
      );
    } catch (e) {}
  }

  return {
    ok: true,
    sheetsConfigured: sheetsPlan.map((x) => x.tabName),
    totalAccounts: totalRowsWritten,
    removedEmptySheets: removedEmptySheets
  };
}

function handleInvPlantillaStatus_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName('plantilla');
  if (!sh) {
    return { ok: false, error: 'Hoja plantilla no encontrada.' };
  }
  const topVals = sh.getRange('A5:M11').getDisplayValues();
  const totVals = sh.getRange('F30:H33').getDisplayValues();
  return {
    ok: true,
    erpStore: topVals[0][2] || '',
    erpAdvisor: topVals[1][2] || '',
    erpUserId: topVals[1][6] || '',
    actionState: topVals[0][10] || '',
    erpStatus: topVals[1][10] || '',
    quoteId: topVals[2][10] || '',
    folio: topVals[2][12] || '',
    subjectRef: topVals[3][10] || '',
    lastSync: topVals[4][10] || '',
    extraDiscount: totVals[0][2] || '',
    subtotal: totVals[1][2] || '',
    iva: totVals[2][2] || '',
    total: totVals[3][2] || ''
  };
}

// ----------------------------------------------------------------------------
// SINCRONIZADOR CLOUD 24/7 DE INVENTARIO_EN_VIVO (S MUEBLERÍA WCF + LPPT RO)
// Mantiene Bodega y Piso de todas las sucursales + LPPT libre al día sin PC local
// ----------------------------------------------------------------------------
function ensureLiveErpSyncTrigger_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some((t) => t.getHandlerFunction() === 'sincronizarInventarioEnVivoDesdeERP');
    if (!exists) {
      ScriptApp.newTrigger('sincronizarInventarioEnVivoDesdeERP')
        .timeBased()
        .everyMinutes(5)
        .create();
    }
    return true;
  } catch (e) {
    return false;
  }
}

function instalarTriggerErpEnVivo() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((t) => {
    if (t.getHandlerFunction() === 'sincronizarInventarioEnVivoDesdeERP') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sincronizarInventarioEnVivoDesdeERP')
    .timeBased()
    .everyMinutes(5)
    .create();
  try {
    SpreadsheetApp.getUi().alert('Sincronización automática 24/7 con S Mueblería ERP activada cada 5 minutos.');
  } catch (e) {}
  return { ok: true };
}

function parseSheetOrStrDate_(rawVal, fmtStr) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return new Date(rawVal.getFullYear(), rawVal.getMonth(), rawVal.getDate());
  }
  if (typeof rawVal === 'number' && rawVal >= 35000 && rawVal <= 75000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + Math.round(rawVal));
    return epoch;
  }
  const s = String(fmtStr || rawVal || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let p0 = parseInt(m[1], 10);
    let p1 = parseInt(m[2], 10);
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    if (p1 > 12 && p0 <= 12) return new Date(yr, p0 - 1, p1);
    return new Date(yr, p1 - 1, p0);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  return null;
}

function resolveSupplierDays_(provRaw, tiemposInf, tiemposBackup) {
  const p = normPlainUpper_(provRaw);
  if (!p || p.indexOf('DESCONTINUADO') >= 0 || p.indexOf('AJUSTE DE INVENTARIO') >= 0) return '';
  const alias = normPlainUpper_(ERP_PROVIDER_ALIASES_[p] || '');
  if (tiemposInf[p] !== undefined) return tiemposInf[p];
  if (alias && tiemposInf[alias] !== undefined) return tiemposInf[alias];
  const keys = Object.keys(tiemposInf);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.length >= 4 && (p.indexOf(k) >= 0 || k.indexOf(p) >= 0)) return tiemposInf[k];
  }
  if (tiemposBackup[p] !== undefined) return tiemposBackup[p];
  if (alias && tiemposBackup[alias] !== undefined) return tiemposBackup[alias];
  return '';
}

/**
 * Realinea únicamente las fórmulas de inventario en plantilla!I15:L29 al esquema de 50 columnas
 * de INVENTARIO_EN_VIVO (con Col S = TOTAL INVENTARIO al lado de TOTAL BODEGA), sin tocar jamás K8.
 */
function repararFormulasPlantillaInventario_(ss) {
  const book = ss || getSpreadsheet_();
  const shPlantilla = book.getSheetByName('plantilla');
  if (!shPlantilla || shPlantilla.getLastRow() < 29 || shPlantilla.getMaxColumns() < 12) {
    return { ok: false, skipped: true };
  }

  function xlInv_(rNum, colLetter, defExpr) {
    const lk = 'INVENTARIO_EN_VIVO!$A$3:$A';
    const rt = 'INVENTARIO_EN_VIVO!$' + colLetter + '$3:$' + colLetter;
    return 'IFERROR(XLOOKUP(B' + rNum + ',' + lk + ',' + rt + '),' +
      'IFERROR(XLOOKUP(TO_TEXT(B' + rNum + '),' + lk + ',' + rt + '),' +
      'IFERROR(XLOOKUP(VALUE(B' + rNum + '),' + lk + ',' + rt + '),' + defExpr + ')))';
  }

  const formulasItoL = [];
  for (let rNum = 15; rNum <= 29; rNum++) {
    const fCedis = '=IF(B' + rNum + '="","",' + xlInv_(rNum, 'U', '0') + '&" / "&' + xlInv_(rNum, 'V', '0') + ')';
    const fTienda = '=IF(B' + rNum + '="","",' +
      'IF($C$5="CASA CREATA BONAMPAK",' + xlInv_(rNum, 'W', '0') + '&" / "&' + xlInv_(rNum, 'X', '0') + ',' +
      'IF($C$5="CREATA PUERTO CANCUN",' + xlInv_(rNum, 'Y', '0') + '&" / "&' + xlInv_(rNum, 'Z', '0') + ',' +
      'IF($C$5="CREATA LIVING COLOSIO",' + xlInv_(rNum, 'AA', '0') + '&" / "&' + xlInv_(rNum, 'AB', '0') + ',' +
      'IF($C$5="CREATA LIVING PLAYA",' + xlInv_(rNum, 'AC', '0') + '&" / "&' + xlInv_(rNum, 'AD', '0') + ',' +
      'IF($C$5="OUTLET COLOSIO",' + xlInv_(rNum, 'AE', '0') + '&" / "&' + xlInv_(rNum, 'AF', '0') + ',' +
      xlInv_(rNum, 'R', '0') + '&" / "&' + xlInv_(rNum, 'T', '0') + '))))))';
    const fLppt = '=IF(B' + rNum + '="","",' + xlInv_(rNum, 'P', '0') + ')';
    const fFecha = '=IF(B' + rNum + '="","",' + xlInv_(rNum, 'Q', '"Sin piezas solicitadas"') + ')';
    formulasItoL.push([fCedis, fTienda, fLppt, fFecha]);
  }

  shPlantilla.getRange(15, 9, 15, 4).setFormulas(formulasItoL);
  return { ok: true, rowsAligned: 15 };
}

function aplicarFormatoEncabezadosDinamicosInv_(shInv) {
  if (!shInv || shInv.getMaxColumns() < 49) return;
  shInv.getRange(1, 15, 1, 35)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  shInv.getRange(1, 15, 1, 1).setBackground('#242C31');
  shInv.getRange(1, 16, 1, 2).setBackground('#A38251');
  shInv.getRange(1, 18, 1, 3).setBackground('#1B365D');
  shInv.getRange(1, 21, 1, 29).setBackground('#242C31');
  shInv.setColumnWidth(17, 185);
  shInv.setColumnWidth(19, 135);
  shInv.setColumnWidth(49, 195);
}

/**
 * Inserta de forma idempotente y atómica la Columna S "TOTAL INVENTARIO" al lado de
 * "TOTAL BODEGA" (Col R) en INVENTARIO_EN_VIVO, sumando exclusivamente las 5 bodegas/sucursales
 * comerciales (CEDIS, CASA CREATA, PUERTO CANCUN, COLOSIO, PLAYA en Bodega + Piso) + LPPT,
 * con suma global =SUM(S3:S) en S2 y desplazando intacta PRECIO DE LISTA a AX (Col 50).
 */
function asegurarColumnaTotalInventario_(ss, shInvOpt) {
  const book = ss || getSpreadsheet_();
  const shInv = shInvOpt || book.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  if (!shInv || shInv.getLastRow() < 2 || shInv.getMaxColumns() < 19) {
    return { ok: false, skipped: true };
  }

  const hdrPair = shInv.getRange(1, 18, 1, 2).getDisplayValues()[0] || [];
  const hdrR = normPlainUpper_(hdrPair[0]);
  const hdrS = normPlainUpper_(hdrPair[1]);

  if (hdrR === 'TOTAL BODEGA' && hdrS !== 'TOTAL INVENTARIO') {
    shInv.insertColumnAfter(18);
    if (shInv.getMaxColumns() < 49) {
      shInv.insertColumnsAfter(shInv.getMaxColumns(), 49 - shInv.getMaxColumns());
    }
    shInv.getRange(1, 19).setValue('TOTAL INVENTARIO');
    aplicarFormatoEncabezadosDinamicosInv_(shInv);

    const lastRow = shInv.getLastRow();
    const numRows = Math.max(0, lastRow - 2);
    if (numRows > 0 && shInv.getMaxColumns() >= 30) {
      const pToAd = shInv.getRange(3, 16, numRows, 15).getValues();
      const initTotCol = new Array(numRows);
      for (let i = 0; i < numRows; i++) {
        const row = pToAd[i] || [];
        const lpptN = Number(row[0]) || 0;
        let sum5 = 0;
        for (let k = 5; k < 15; k++) {
          sum5 += Number(row[k]) || 0;
        }
        initTotCol[i] = [lpptN + sum5];
      }
      shInv.getRange(3, 19, numRows, 1)
        .setValues(initTotCol)
        .setNumberFormat('#,##0')
        .setHorizontalAlignment('center');
    }

    shInv.getRange(2, 19)
      .setFormula('=SUM(S3:S)')
      .setNumberFormat('#,##0')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    repararFormulasPlantillaInventario_(book);
    try {
      const c = CacheService.getScriptCache();
      if (c) {
        c.remove('inv_precio_lista_col_ready_v1');
        c.remove('inv_precio_lista_col_ready_v2');
        c.put('inv_hdr_and_plantilla_v50_ok', '1', 21600);
      }
    } catch (ce) {}
    return { ok: true, migrated: true };
  }

  if (hdrS === 'TOTAL INVENTARIO') {
    const curS2Formula = String(shInv.getRange(2, 19).getFormula() || '').trim();
    if (!curS2Formula) {
      shInv.getRange(2, 19)
        .setFormula('=SUM(S3:S)')
        .setNumberFormat('#,##0')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
    }
    try {
      const c = CacheService.getScriptCache();
      if (!c || c.get('inv_hdr_and_plantilla_v50_ok') !== '1') {
        aplicarFormatoEncabezadosDinamicosInv_(shInv);
        const shPl = book.getSheetByName('plantilla');
        if (shPl && shPl.getLastRow() >= 15 && shPl.getMaxColumns() >= 12) {
          const row15Formulas = shPl.getRange(15, 9, 1, 4).getFormulas()[0] || [];
          const fJ = String(row15Formulas[1] || '');
          const fK = String(row15Formulas[2] || '');
          const fL = String(row15Formulas[3] || '');
          if (fJ.indexOf('#REF!') >= 0 || fJ.indexOf('$AE$3:$AE') < 0 || fK.indexOf('$P$3:$P') < 0 || fL.indexOf('$Q$3:$Q') < 0) {
            repararFormulasPlantillaInventario_(book);
          }
        }
        if (c) c.put('inv_hdr_and_plantilla_v50_ok', '1', 21600);
      }
    } catch (ce) {}
    return { ok: true, migrated: false };
  }

  return { ok: true, skipped: true };
}

/**
 * Sincroniza INVENTARIO_EN_VIVO directo desde S Mueblería WCF + LPPT (estricto solo lectura).
 */
function sincronizarInventarioEnVivoDesdeERP(opts) {
  const silentUi = !opts || opts.silentUi !== false;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: true, skippedBusy: true };
  }
  try {
    const cfg = getErpRuntimeConfig_();
    const ss = getSpreadsheet_();
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    if (!shInv || shInv.getLastRow() < 3) {
      return { ok: false, error: 'Hoja INVENTARIO_EN_VIVO no inicializada.' };
    }
    asegurarColumnaTotalInventario_(ss, shInv);
    try { ensureInvitadosSheet_(ss); } catch (eInvEnsure) {}

    // 1) Obtener existencias Bodega y Piso en vivo desde S Mueblería ERP.
    //    Si el ERP no responde o trunca el stream XML a mitad de respuesta, se reintenta 1 vez y,
    //    si persiste incompleto, NO se sobreescribe en 0: se conserva el último inventario válido.
    let erpOk = false;
    let erpError = '';
    const invPorSku = {};
    const metaErpSku = {};
    const closingTagRe = /<\/(?:[a-zA-Z0-9_]+:)?ObtenerProductosInventariosSucursalesTodosResponse>/i;
    for (let erpAttempt = 1; erpAttempt <= 2; erpAttempt++) {
      let xmlAttempt = '';
      try {
        xmlAttempt = callSmuebleriaWcf_(
          'ObtenerProductosInventariosSucursalesTodos',
          '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro></Filtro>'
        );
      } catch (erpErr) {
        erpError = String((erpErr && erpErr.message) || erpErr || 'ERP sin respuesta');
        Logger.log('Aviso ERP S Mueblería (intento ' + erpAttempt + '): ' + erpError);
        if (erpAttempt < 2) Utilities.sleep(1500);
        continue;
      }

      const hasClosingTag = closingTagRe.test(xmlAttempt);
      const candInv = {};
      const candMeta = {};
      let candTotalUnits = 0;
      const prodRe = /<(?:[a-zA-Z0-9_]+:)?ProductoInventarioSucursal>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ProductoInventarioSucursal>/g;
      let match;
      while ((match = prodRe.exec(xmlAttempt)) !== null) {
        const blk = match[1];
        const sku = extractXmlTag_(blk, 'Clave').toUpperCase();
        if (!sku) continue;
        const sucNorm = normPlainUpper_(extractXmlTag_(blk, 'Sucursal'));
        const bod = Math.round(parseFloat(extractXmlTag_(blk, 'Existensia') || '0') || 0);
        const pis = Math.round(parseFloat(extractXmlTag_(blk, 'Piso') || '0') || 0);
        candTotalUnits += Math.max(0, bod) + Math.max(0, pis);

        if (!candMeta[sku]) {
          candMeta[sku] = {
            MODELO: extractXmlTag_(blk, 'Modelo'),
            NOMBRE: extractXmlTag_(blk, 'Nombre'),
            CATEGORIA: extractXmlTag_(blk, 'Categoria'),
            PROVEEDOR: extractXmlTag_(blk, 'Proveedor')
          };
        }
        if (!candInv[sku]) candInv[sku] = {};
        const prev = candInv[sku][sucNorm] || [0, 0];
        candInv[sku][sucNorm] = [prev[0] + bod, prev[1] + pis];
      }

      const candSkuCount = Object.keys(candInv).length;
      if (hasClosingTag && candSkuCount >= 1000 && candTotalUnits >= 1000) {
        Object.keys(candInv).forEach((k) => { invPorSku[k] = candInv[k]; });
        Object.keys(candMeta).forEach((k) => { metaErpSku[k] = candMeta[k]; });
        erpOk = true;
        erpError = '';
        break;
      }

      erpError = 'Respuesta parcial/truncada del ERP (' + candSkuCount + ' SKUs, ' + candTotalUnits + ' pzas' + (hasClosingTag ? '' : ', XML truncado') + ').';
      Logger.log('Aviso ERP S Mueblería (intento ' + erpAttempt + ', se conserva inventario si persiste): ' + erpError);
      if (erpAttempt < 2) Utilities.sleep(1500);
    }


    // 2) Tiempos de entrega de INF. PRODUC
    const tiemposInf = {};
    const tiemposBackup = {};
    const shInf = ss.getSheetByName('INF. PRODUC');
    if (shInf && shInf.getLastRow() >= 3) {
      const infVals = shInf.getRange(3, 1, Math.min(shInf.getLastRow() - 2, 200), 3).getDisplayValues();
      for (let i = 0; i < infVals.length; i++) {
        const mDias = String(infVals[i][1] || '').match(/\d+/);
        const pNorm = normPlainUpper_(infVals[i][2]);
        if (pNorm && mDias) {
          const dInt = parseInt(mDias[0], 10);
          tiemposInf[pNorm] = dInt;
          if (pNorm.indexOf('/') >= 0) {
            pNorm.split('/').forEach((sub) => {
              const sc = sub.trim();
              if (sc) tiemposInf[sc] = dInt;
            });
          }
        }
      }
    }

    // 3) Lectura ESTRICTAMENTE SOLO LECTURA de LPPT PROVEDORES (Principal)
    let lpptOk = false;
    const lpptLibre = {};
    const lpptProvBySku = {};
    const lpptNomBySku = {};
    const fechaLlegadaMap = {};
    try {
      const lpptSs = SpreadsheetApp.openById(cfg.lpptSpreadsheetId);
      ['Config GDL', 'Config CDMX'].forEach((cfgTab) => {
        try {
          const shC = lpptSs.getSheetByName(cfgTab);
          if (shC && shC.getLastRow() >= 2) {
            const cVals = shC.getRange(2, 5, Math.min(shC.getLastRow() - 1, 50), 2).getDisplayValues();
            cVals.forEach((r) => {
              const pn = normPlainUpper_(r[0]);
              const md = String(r[1] || '').match(/\d+/);
              if (pn && md) tiemposBackup[pn] = parseInt(md[0], 10);
            });
          }
        } catch (eCfg) {}
      });

      const shLppt = lpptSs.getSheetByName('Principal');
      if (shLppt && shLppt.getLastRow() >= 3) {
        const numLpptRows = Math.min(shLppt.getLastRow() - 2, 2000);
        const rng = shLppt.getRange(3, 1, numLpptRows, 20);
        const fmtRows = rng.getDisplayValues();
        const rawRows = rng.getValues();
        const nowD = new Date();
        const todayMidnight = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
        const fechasCandidatas = {};
        const reApartadoParcial = /\b[A-Z]{2,5}\s*\d{3,7}\s*\(\s*(\d+)\s*\)/gi;
        const reFolioSuelto = /\b(?:PTC|CCB|DTC|PL|PRO|CED|OUT)\s*\d{3,7}\b/i;

        for (let i = 0; i < fmtRows.length; i++) {
          const rf = fmtRows[i];
          const ru = rawRows[i];
          const sku = String(rf[9] || '').trim().toUpperCase();
          if (!sku) continue;
          const nomLppt = String(rf[8] || '').trim();
          if (nomLppt && !lpptNomBySku[sku]) lpptNomBySku[sku] = nomLppt;
          const cantTotal = Math.round(parseFloat(String(ru[6] !== '' ? ru[6] : rf[6]).replace(/,/g, '')) || 0);
          if (cantTotal <= 0) continue;

          const folioVenta = String(rf[12] || '').trim();
          const cliente = String(rf[15] || '').trim();
          if (folioVenta || cliente) continue;

          const estatus = normPlainUpper_(rf[16]);
          if (/CANCEL|RECIBID|ENTREGAD|BAJA/.test(estatus)) continue;

          const comProv = normPlainUpper_(rf[17]);
          const comCompras = normPlainUpper_(rf[18]);
          if (/NO DISPONIBLE|GARANTIA|APARTAD|ASIGNAD/.test(comCompras)) continue;
          if (comProv.indexOf('GARANTIA') >= 0 && comCompras.indexOf('STOCK') < 0) continue;

          const comAsesorRaw = String(rf[19] || '').trim();
          const comAsesorNorm = normPlainUpper_(comAsesorRaw);
          let apartadas = 0;
          let pm;
          reApartadoParcial.lastIndex = 0;
          let foundParcial = false;
          while ((pm = reApartadoParcial.exec(comAsesorRaw)) !== null) {
            apartadas += parseInt(pm[1], 10) || 0;
            foundParcial = true;
          }
          if (!foundParcial && comAsesorNorm) {
            if (reFolioSuelto.test(comAsesorNorm) || /APARTAD|ASIGNAD|VENDID|CLIENTE/.test(comAsesorNorm)) {
              apartadas = cantTotal;
            }
          }

          const libres = Math.max(0, cantTotal - apartadas);
          if (libres <= 0) continue;
          lpptLibre[sku] = (lpptLibre[sku] || 0) + libres;

          const prov = String(rf[1] || '').trim();
          if (prov && !lpptProvBySku[sku]) lpptProvBySku[sku] = prov;
          const fCompra = parseSheetOrStrDate_(ru[2], rf[2]);
          const fCompRaw = parseSheetOrStrDate_(ru[5], rf[5]);
          let fComp = null;
          if (fCompRaw) {
            fComp = new Date(fCompRaw.getTime());
            fComp.setDate(fComp.getDate() + LPPT_COMMITMENT_BUFFER_DAYS_);
          }
          const diasProv = resolveSupplierDays_(prov, tiemposInf, tiemposBackup);

          let fechaInf = null;
          if (fCompra && diasProv !== '') {
            fechaInf = new Date(fCompra.getTime());
            fechaInf.setDate(fechaInf.getDate() + Number(diasProv));
          }

          let fechaEst = null;
          if (fechaInf && fComp) {
            if (fechaInf < todayMidnight && fComp >= fechaInf) fechaEst = fComp;
            else if (fComp > fechaInf) fechaEst = fComp;
            else fechaEst = fechaInf;
          } else if (fechaInf) {
            fechaEst = fechaInf;
          } else if (fComp) {
            fechaEst = fComp;
          } else if (diasProv !== '') {
            fechaEst = new Date(todayMidnight.getTime());
            fechaEst.setDate(fechaEst.getDate() + Number(diasProv));
          }

          if (fechaEst) {
            if (!fechasCandidatas[sku]) fechasCandidatas[sku] = [];
            fechasCandidatas[sku].push(fechaEst);
          }
        }

        Object.keys(lpptLibre).forEach((sk) => {
          const cands = fechasCandidatas[sk] || [];
          if (lpptLibre[sk] > 0 && cands.length > 0) {
            const vigentes = cands.filter((d) => d >= todayMidnight);
            const chosenD = vigentes.length > 0
              ? vigentes.reduce((a, b) => (a < b ? a : b))
              : cands.reduce((a, b) => (a > b ? a : b));
            const dd = String(chosenD.getDate()).padStart(2, '0');
            const mm = String(chosenD.getMonth() + 1).padStart(2, '0');
            fechaLlegadaMap[sk] = dd + '/' + mm + '/' + chosenD.getFullYear();
          } else {
            fechaLlegadaMap[sk] = 'Sin piezas solicitadas';
          }
        });
        lpptOk = true;
      }
    } catch (lpptErr) {
      Logger.log('Aviso lectura LPPT solo lectura: ' + lpptErr);
      registrarEventoHistorial_(ss, {
        clasificacion: 'ALERTA TÉCNICA',
        modulo: 'AppsScript · sincronizarInventarioEnVivoDesdeERP',
        evento: 'LECTURA LPPT PROVEEDORES CON INCIDENCIA',
        estado: '⚠️ ALERTA',
        usuario: 'Sincronizador Automático',
        sucursal: 'INVENTARIO_EN_VIVO',
        referencia: 'LPPT Proveedores',
        detalle: String((lpptErr && lpptErr.message) || lpptErr),
        analisis: analizarCausaFalloCodigo_(lpptErr, 'AppsScript · LPPT', 'lectura_lppt')
      });
    }

    // 4) Autocompletar nuevos productos (ERP / Hoja '1' / plantilla / LPPT), limpiar medidas y ordenar A-Z
    const autoRes = autocompletarYOrdenarInventarioEnVivo_(ss, {
      silentUi: true,
      force: true,
      skipFlush: true,
      metaErpSku: metaErpSku,
      invPorSku: invPorSku,
      lpptLibre: lpptLibre,
      lpptProvBySku: lpptProvBySku,
      lpptNomBySku: lpptNomBySku
    });

    // 5) Actualizar columnas dinámicas O..AW (35 cols) en INVENTARIO_EN_VIVO respetando A..N, F2 y AX2 ARRAYFORMULA
    const lastRow = shInv.getLastRow();
    const numCatalogRows = lastRow - 2;
    const catRange = shInv.getRange(3, 1, numCatalogRows, Math.min(shInv.getMaxColumns(), 17)).getValues();
    if (shInv.getMaxColumns() < 49) {
      shInv.insertColumnsAfter(shInv.getMaxColumns(), 49 - shInv.getMaxColumns());
    }

    const ahoraStr = formatCancunNow_();
    const headersOAw = [
      'TIEMPO DE ENTREGA (DIAS)',
      'LPPT',
      'FECHA ESTIMADA DE LLEGADA',
      'TOTAL BODEGA',
      'TOTAL INVENTARIO',
      'TOTAL PISO'
    ];
    ERP_WAREHOUSES_ORDER_.forEach((pair) => {
      headersOAw.push(pair[1] + ' BODEGA');
      headersOAw.push(pair[1] + ' PISO');
    });
    headersOAw.push('ULTIMA ACTUALIZACION EN VIVO');

    // Si el ERP no respondió, conservar exactamente el último inventario Bodega/Piso escrito (R..AV y AW)
    // recalculando Col S (TOTAL INVENTARIO = LPPT + 5 bodegas oficiales) con la LPPT vigente.
    const prevOAw = !erpOk && numCatalogRows > 0
      ? shInv.getRange(3, 15, numCatalogRows, 35).getValues()
      : null;
    let ultimoInventarioErp = '';

    const outMatrix = [];
    for (let i = 0; i < numCatalogRows; i++) {
      const r = catRange[i];
      const sku = String(r[0] || '').trim().toUpperCase();
      if (!sku) {
        const blank = new Array(35).fill('');
        outMatrix.push(blank);
        continue;
      }
      const provHoja = String(r[13] || '').trim() || (metaErpSku[sku] && metaErpSku[sku].PROVEEDOR) || '';
      const dias = resolveSupplierDays_(provHoja, tiemposInf, tiemposBackup);
      const colDias = dias !== '' ? dias : (r[14] !== '' ? r[14] : '');

      const cantLppt = lpptOk ? (lpptLibre[sku] || 0) : (Number(r[15]) || 0);
      const fechaEst = lpptOk
        ? (cantLppt > 0 ? (fechaLlegadaMap[sku] || 'Sin piezas solicitadas') : 'Sin piezas solicitadas')
        : (r[16] || 'Sin piezas solicitadas');

      if (!erpOk) {
        const pr = (prevOAw && prevOAw[i]) || new Array(35).fill('');
        const prBod = isFinite(Number(pr[3])) ? Number(pr[3]) : 0;
        const prPis = isFinite(Number(pr[5])) ? Number(pr[5]) : 0;
        const whKept = [];
        for (let c = 6; c < 34; c++) {
          const n = Number(pr[c]);
          whKept.push(isFinite(n) ? n : 0);
        }
        let sumCincoBod = 0;
        for (let k = 0; k < 10; k++) {
          sumCincoBod += whKept[k] || 0;
        }
        const totInvCincoConLppt = (Number(cantLppt) || 0) + sumCincoBod;
        const prevTs = pr[34] instanceof Date
          ? Utilities.formatDate(pr[34], 'America/Cancun', 'dd/MM/yyyy HH:mm:ss')
          : String(pr[34] || '');
        if (prevTs && !ultimoInventarioErp) ultimoInventarioErp = prevTs;
        const keepVals = [colDias, cantLppt, fechaEst, prBod, totInvCincoConLppt, prPis].concat(whKept, [prevTs]);
        outMatrix.push(keepVals);
        continue;
      }

      const sucMap = invPorSku[sku] || {};
      let totBod = 0;
      let totPis = 0;
      Object.keys(sucMap).forEach((skSuc) => {
        totBod += sucMap[skSuc][0] || 0;
        totPis += sucMap[skSuc][1] || 0;
      });

      // Suma exclusiva de las 5 bodegas/sucursales comerciales (CEDIS, CASA CREATA, PUERTO CANCUN, COLOSIO, PLAYA) + LPPT
      let sumCincoBodegas = 0;
      const whRowVals = [];
      for (let w = 0; w < ERP_WAREHOUSES_ORDER_.length; w++) {
        const sucKey = ERP_WAREHOUSES_ORDER_[w][0];
        const bp = sucMap[sucKey] || [0, 0];
        const bVal = bp[0] || 0;
        const pVal = bp[1] || 0;
        whRowVals.push(bVal);
        whRowVals.push(pVal);
        if (w < 5) {
          sumCincoBodegas += bVal + pVal;
        }
      }
      const totInvCincoConLppt = (Number(cantLppt) || 0) + sumCincoBodegas;

      const rowVals = [colDias, cantLppt, fechaEst, totBod, totInvCincoConLppt, totPis].concat(whRowVals, [ahoraStr]);
      outMatrix.push(rowVals);
    }

    const heartbeatRow = new Array(34).fill('');
    heartbeatRow[4] = '=SUM(S3:S)';
    heartbeatRow.push(
      erpOk
        ? 'EN VIVO | ' + ahoraStr
        : 'LPPT EN VIVO | ' + ahoraStr + ' | ERP SIN CONEXIÓN (inventario Bodega/Piso del ' + (ultimoInventarioErp || 'último corte') + ')'
    );

    shInv.getRange(1, 15, 1, 35).setValues([headersOAw]);
    shInv.getRange(2, 15, 1, 35).setValues([heartbeatRow]);
    shInv.getRange(2, 19)
      .setFormula('=SUM(S3:S)')
      .setNumberFormat('#,##0')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    if (outMatrix.length > 0) {
      shInv.getRange(3, 15, outMatrix.length, 35).setValues(outMatrix);
      shInv.getRange(3, 19, outMatrix.length, 1)
        .setNumberFormat('#,##0')
        .setHorizontalAlignment('center');
    }
    asegurarColumnaPrecioListaInventario_(ss, { silentUi: true, force: !!(autoRes && autoRes.added > 0) });
    let hoja1SyncRes = { added: 0 };
    try {
      hoja1SyncRes = sincronizarSkusHoja1DesdeInventario_(ss) || { added: 0 };
    } catch (eSync1) {}

    if (!erpOk) {
      registrarEventoHistorial_(ss, {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · sincronizarInventarioEnVivoDesdeERP',
        evento: 'ERP S MUEBLERÍA SIN CONEXIÓN EN SINCRONIZACIÓN',
        estado: '⚠️ RESPALDO ACTIVO',
        usuario: 'Sincronizador Automático',
        sucursal: 'INVENTARIO_EN_VIVO',
        referencia: outMatrix.length + ' filas preservadas',
        detalle: erpError || 'Sin respuesta WCF S Mueblería; se preservó inventario Bodega/Piso del último corte.',
        analisis: analizarCausaFalloCodigo_(erpError, 'AppsScript · sincronizarInventarioEnVivoDesdeERP', 'sync_erp')
      });
    } else if ((autoRes && autoRes.added > 0) || (hoja1SyncRes && hoja1SyncRes.added > 0)) {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · sincronizarInventarioEnVivoDesdeERP',
        evento: 'ALTA AUTOMÁTICA DE NUEVOS SKUS EN INVENTARIO Y HOJA "1"',
        estado: '✅ OK',
        usuario: 'Sincronizador Automático',
        sucursal: 'INVENTARIO_EN_VIVO / HOJA "1"',
        referencia: '+' + ((autoRes && autoRes.added) || 0) + ' inv · +' + ((hoja1SyncRes && hoja1SyncRes.added) || 0) + ' Hoja "1"',
        detalle: 'Sincronización en vivo completada (' + outMatrix.length + ' filas ordenadas A-Z · LPPT +14 días activo).',
        analisis: 'Fórmulas nativas F2, AX2 y Hoja "1"!B2:F2 respetadas intactas.'
      });
    }

    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert(
          erpOk
            ? 'Inventario sincronizado en vivo desde S Mueblería ERP (' + outMatrix.length + ' filas ordenadas A-Z, ' +
              ((autoRes && autoRes.added) || 0) + ' nuevos SKUs, ' + ahoraStr + ').'
            : 'LPPT actualizada (' + ahoraStr + '). S Mueblería no respondió, se conservó el inventario Bodega/Piso del ' +
              (ultimoInventarioErp || 'último corte') + '.\n\nDetalle: ' + erpError
        );
      } catch (e) {}
    }

    return {
      ok: erpOk,
      erpOk: erpOk,
      error: erpOk ? undefined : erpError,
      keptLastInventoryFrom: erpOk ? undefined : (ultimoInventarioErp || ''),
      rowsUpdated: outMatrix.length,
      newSkusAdded: (autoRes && autoRes.added) || 0,
      hoja1SkusAdded: (hoja1SyncRes && hoja1SyncRes.added) || 0,
      rowsAutocompleted: (autoRes && autoRes.updated) || 0,
      lpptSynced: lpptOk,
      timestamp: ahoraStr
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agrega / actualiza la columna "PRECIO DE LISTA" en INVENTARIO_EN_VIVO (Columna AX = 50,
 * justo después de AW "ULTIMA ACTUALIZACION EN VIVO") vinculada por ARRAYFORMULA + XLOOKUP
 * a la lista oficial de precios de S Mueblería (plantilla!AE2:AH), sin desplazar A..AW (1..49)
 * ni alterar F2, sincronizador_inventario_vivo.py ni las hojas del Catálogo.
 */
function agregarColumnaPrecioListaInventario() {
  return asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: false, force: true });
}

function asegurarColumnaPrecioListaInventario_(ss, opts) {
  const silentUi = !opts || opts.silentUi !== false;
  const force = !!(opts && opts.force);
  const cacheKey = 'inv_precio_lista_col_ready_v2';

  if (!force) {
    try {
      const c = CacheService.getScriptCache();
      if (c && c.get(cacheKey) === '1') {
        return { ok: true, alreadyReady: true, cached: true };
      }
    } catch (ce) {}
  }

  const book = ss || getSpreadsheet_();
  const shInv = book.getSheetByName(CONFIG.TAB_INVENTORY);
  if (!shInv || shInv.getLastRow() < 2) {
    return { ok: false, error: 'Hoja INVENTARIO_EN_VIVO no encontrada.' };
  }
  asegurarColumnaTotalInventario_(book, shInv);

  // Columnas 1..49 (A..AW) están reservadas para atributos curados (A..N, incluyendo F2 ARRAYFORMULA)
  // y existencias dinámicas (O..AW). Colocamos PRECIO DE LISTA en AX (col 50) o reutilizamos si ya existe en >= 50.
  const maxColsNow = shInv.getMaxColumns();
  let targetCol = 50; // AX
  if (maxColsNow >= 50) {
    const hdrTail = shInv.getRange(1, 50, 1, maxColsNow - 49).getDisplayValues()[0] || [];
    for (let k = 0; k < hdrTail.length; k++) {
      const normH = normPlainUpper_(hdrTail[k]);
      if (normH === 'PRECIO DE LISTA' || normH === 'PRECIO LISTA') {
        targetCol = 50 + k;
        break;
      }
    }
  }

  if (shInv.getMaxColumns() < targetCol) {
    shInv.insertColumnsAfter(shInv.getMaxColumns(), targetCol - shInv.getMaxColumns());
  }

  const formulaStr = '=ARRAYFORMULA(IF($A$2:$A="","",IFERROR(XLOOKUP(TRIM($A$2:$A),plantilla!$AE$2:$AE,plantilla!$AH$2:$AH,"",0),"")))';
  const curHdr = normPlainUpper_(shInv.getRange(1, targetCol).getDisplayValue());
  const curFormula = String(shInv.getRange(2, targetCol).getFormula() || '').trim();
  const hasNativeArrayFormula = /^=ARRAYFORMULA/i.test(curFormula);

  if (!force && curHdr === 'PRECIO DE LISTA' && hasNativeArrayFormula) {
    try {
      CacheService.getScriptCache().put(cacheKey, '1', 21600);
    } catch (ce) {}
    return { ok: true, alreadyReady: true, column: targetCol, columnLetter: targetCol === 50 ? 'AX' : String(targetCol) };
  }

  const maxRows = Math.max(shInv.getMaxRows(), shInv.getLastRow(), 3);
  if (!hasNativeArrayFormula) {
    if (maxRows >= 2) {
      shInv.getRange(2, targetCol, maxRows - 1, 1).clearContent();
    }
    shInv.getRange(1, targetCol)
      .setValue('PRECIO DE LISTA')
      .setBackground('#A38251')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    shInv.setColumnWidth(targetCol, 145);
    shInv.getRange(2, targetCol).setFormula(formulaStr);
  } else if (curHdr !== 'PRECIO DE LISTA') {
    shInv.getRange(1, targetCol).setValue('PRECIO DE LISTA');
  }

  if (maxRows >= 3) {
    shInv.getRange(3, targetCol, maxRows - 2, 1)
      .setNumberFormat('$#,##0.00')
      .setHorizontalAlignment('right');
  }

  SpreadsheetApp.flush();

  try {
    CacheService.getScriptCache().put(cacheKey, '1', 21600);
  } catch (ce) {}

  if (!silentUi) {
    try {
      SpreadsheetApp.getUi().alert(
        'Columna "PRECIO DE LISTA" agregada y vinculada en vivo en INVENTARIO_EN_VIVO (Columna AX) sin afectar el resto del documento.'
      );
    } catch (e) {}
  }

  return {
    ok: true,
    column: targetCol,
    columnLetter: targetCol === 50 ? 'AX' : String(targetCol),
    header: 'PRECIO DE LISTA'
  };
}

// ----------------------------------------------------------------------------
// DESACTIVACIÓN Y LIMPIEZA DE TOP_BUSCADOS (YA NO SE USA RANKING DE 20 MÁS SELECCIONADOS)
// ----------------------------------------------------------------------------
function eliminarPestanaTopBuscadosSiExiste_(ss) {
  try {
    const book = ss || getSpreadsheet_();
    const shTop = book.getSheetByName(TAB_TOP_SEARCHED_);
    if (shTop && book.getSheets().length > 1) {
      book.deleteSheet(shTop);
      return true;
    }
  } catch (e) {}
  return false;
}

function handleInvTopSearched_() {
  const ss = getSpreadsheet_();
  eliminarPestanaTopBuscadosSiExiste_(ss);
  try {
    asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });
  } catch (eCol) {}
  return { ok: true, updatedAtMs: Date.now(), top: [] };
}

function handleInvRecordSearch_(body) {
  const rawEvents = Array.isArray(body && body.events) ? body.events : [];
  const ackIds = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const evId = String((rawEvents[i] && rawEvents[i].id) || '').trim().slice(0, 80);
    if (evId) ackIds.push(evId);
  }
  try {
    eliminarPestanaTopBuscadosSiExiste_(getSpreadsheet_());
  } catch (e) {}
  return { ok: true, ackIds: ackIds, updatedAtMs: Date.now(), top: [] };
}

// ----------------------------------------------------------------------------
// AUTOCOMPLETADO AUTOMÁTICO DE NUEVOS PRODUCTOS Y ORDENAMIENTO ALFABÉTICO A-Z
// EN INVENTARIO_EN_VIVO (RESPETANDO F2 ARRAYFORMULA Y AW2 PRECIO DE LISTA)
// ----------------------------------------------------------------------------
function cleanInvCell_(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^(n\/?a|null|undefined|-|\.|sin\s+especificar|no\s+especificado|no\s+aplica|pendiente|por\s+clasificar)$/i.test(s)) {
    return '';
  }
  return s;
}

function sortKeyAlphaEs_(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^[^A-Z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareAlphaEs_(a, b) {
  const ka = sortKeyAlphaEs_(a);
  const kb = sortKeyAlphaEs_(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  const aIsLetter = /^[A-Z]/.test(ka);
  const bIsLetter = /^[A-Z]/.test(kb);
  if (aIsLetter !== bIsLetter) return aIsLetter ? -1 : 1;
  return ka.localeCompare(kb, 'es', { numeric: true, sensitivity: 'base' });
}

function stripDimensionsAndExtractInv_(str) {
  let s = cleanInvCell_(str);
  if (!s) return { text: '', med: '' };
  s = s
    .replace(
      /\b([A-Za-zÁÉÍÓÚáéíóúÑñ]{3,})(\d{2,3}\s*(?:[xX*×]\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M)?|(?:DIAMETRO|DIÁMETRO|DIAM\.?)\b))/gi,
      '$1 $2'
    )
    .replace(/(\d)(DIAMETRO|DIÁMETRO|DIAM\b)/gi, '$1 $2');

  const extracted = [];
  function captureDim(m) {
    let d = String(m || '')
      .replace(/^MEDIDAS?\s*[:.]?\s*/i, '')
      .replace(/^[(\s,/-]+|[)\s.,/-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    if (!d) return ' ';
    if (/^\d{2,3}\s+(?:DIAMETRO|DIÁMETRO|DIAM\.?)$/i.test(d)) {
      const num = (d.match(/\d+/) || [''])[0];
      if (num) d = 'DIAM ' + num + ' CM';
    } else if (/^\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)+$/.test(d)) {
      d = d.replace(/\s*[xX*×]\s*/g, 'X') + ' CM';
    } else {
      d = d.replace(/\s*[xX*×]\s*/g, 'X');
    }
    extracted.push(d);
    return ' ';
  }

  const patterns = [
    /\bMEDIDAS?\s*[:.]?\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?){1,3}\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?(?:\s*(?:DIAMETRO|DIÁMETRO|DIAM\.?))?\.?/gi,
    /\(\s*\d+(?:[.,]\d+)?\s*[xX*×]\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?\s*\)/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:DIAM(?:ETRO)?\.?\s*)?[xX*×]\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?(?:\s*(?:DIAMETRO|DIÁMETRO|DIAM\.?))?\.?(?=\s|$|[),.;/-])/gi,
    /\b(?:DIAMETRO|DIÁMETRO|DIAM\.?)\s*\d+(?:[.,]\d+)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?)?\.?/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?)?\s*(?:DE\s+)?(?:DIAMETRO|DIÁMETRO|DIAM\.?)\s*(?:CM\.?|CMS\.?)?\.?/gi,
    /\bL?\d{2,3}\s*-\s*\d{2,3}\s*(?:CM\.?|CMS\.?)\.?/gi,
    /\b\d{2,3}(?:\s*,\s*\d{2,3}){1,3}\s*(?:CM\.?|CMS\.?)\.?/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:CM\.?|CMS\.?|MTS\.?|MT\.?|METROS?|MM\.?)(?=\s|$|[),.;/-])/gi
  ];

  for (let i = 0; i < patterns.length; i++) {
    s = s.replace(patterns[i], captureDim);
  }
  s = s
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\b(?:CON\s+MEDIDAS?|MEDIDAS?|DIAMETRO|DIÁMETRO|DIAM)\b\.?\s*:?/gi, ' ')
    .replace(/\s+\b(?:DE|CON\s+MEDIDA)\s*$/i, '')
    .replace(/(?:^|\s)[-–—/:.,;]+(?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, '')
    .trim();

  return { text: s, med: extracted[0] || '' };
}

const INV_TYPE_RULES_ = [
  [/\bSILLON\s+OCASIONAL\b/, 'SILLON OCASIONAL'],
  [/\bSOFA\s+CAMA\b/, 'SOFA CAMA'],
  [/^SALA\b|\bSALA\s+MODULAR\b|\bSALA\s+ESQUINERA\b/, 'SALA'],
  [/\bCHAISE\s+LONGUE\b|\bCHAISE\b/, 'CHAISE LONGUE'],
  [/\bLOVE\s*SEAT\b|\bLOVESEAT\b/, 'LOVE SEAT'],
  [/\bESQUINERO\b|\bRINCONERA\b/, 'ESQUINERO'],
  [/\bSALA\b/, 'SALA'],
  [/\bFUTTON\b|\bFUTON\b/, 'FUTTON'],
  [/\bSOFA\b/, 'SOFA'],
  [/\bOTTOMAN\b|\bOTOMAN\b|\bPOUF\b|\bPUFF?\b/, 'OTTOMAN'],
  [/\bTABURETE\b/, 'TABURETE'],
  [/\bBANCO\b/, 'BANCO'],
  [/\bBANCA\b/, 'BANCA'],
  [/\bCOLUMPIO\b|\bSILLA\s+COLGANTE\b/, 'COLUMPIO'],
  [/\bCAMASTRO\b/, 'CAMASTRO'],
  [/\bSILLON\b|\bBUTACA\b|\bMECEDORA\b|\bRECLINABLE\b/, 'SILLON'],
  [/\bSILLA\b/, 'SILLA'],
  [/\bMESA\s+(?:DE\s+)?CENTRO\b|\bMESA\s+CENTRAL\b|\bMESA\s+.*?\bCENTRAL\b/, 'MESA DE CENTRO'],
  [/\bMESA\s+LATERAL\b|\bMESA\s+.*?\bLATERAL\b|\bMESA\s+AUXILIAR\b/, 'MESA LATERAL'],
  [/\bMESA\s+(?:DE\s+)?COMEDOR\b|\bANTECOMEDOR\b|\bDESAYUNADOR\b/, 'MESA DE COMEDOR'],
  [/\bCOMEDOR\b/, 'COMEDOR'],
  [/\bBUFETERA\b|\bBUFETERO\b|\bTRINCHADOR\b|\bAPARADOR\b/, 'BUFETERA'],
  [/\bCREDENZA\b/, 'CREDENZA'],
  [/\bCAVA\b|\bCONTRABARRA\b|\bBAR\b/, 'CAVA'],
  [/\bCONSOLA\b/, 'CONSOLA'],
  [/\bMUEBLE\s+(?:DE\s+|PARA\s+)?TV\b|\bCENTRO\s+DE\s+ENTRETENIMIENTO\b/, 'MUEBLE DE TV'],
  [/\bLIBRERO\b|\bREPISA\b|\bESTANTE\b/, 'LIBRERO'],
  [/\bESCRITORIO\b|\bSECRETAIRE\b/, 'ESCRITORIO'],
  [/\bARCHIVERO\b/, 'ARCHIVERO'],
  [/\bCABECERA\b/, 'CABECERA'],
  [/\bBASE\s+(?:DE\s+)?CAMA\b|\bBASE\s+(?:KS|QS|MAT|IND|KING|QUEEN|MATRIMONIAL|INDIVIDUAL)\b/, 'BASE DE CAMA'],
  [/\bCAMA\b|\bLITERA\b|\bRECAMARA\b/, 'CAMA'],
  [/\bCOLCHON\b/, 'COLCHON'],
  [/\bBURO\b/, 'BURO'],
  [/\bCAJONERA\b|\bCHIFONIER\b/, 'CAJONERA'],
  [/\bTOCADOR\b/, 'TOCADOR'],
  [/\bCOMODA\b/, 'COMODA'],
  [/\bBAUL\b/, 'BAUL'],
  [/\bMAMPARA\b|\bBIOMBO\b/, 'MAMPARA'],
  [/\bESPEJO\b|\bMARCO\b/, 'ESPEJO'],
  [/\bCUADRO\b|\bPINTURA\b|\bLIENZO\b|\bGICLEE\b/, 'CUADRO'],
  [/\bPAPEL\s+TAPIZ\b|\bDESC-WALL\b|^WALL\b/, 'PAPEL TAPIZ'],
  [/\bARTE\s+OBJETO\b|\bDECORATIVO\s+(?:DE\s+)?PARED\b|\bACCESORIO\s+DE\s+PARED\b/, 'DECORATIVO PARED'],
  [/\bTAPETE\b|\bALFOMBRAS?\b|^T\.\s+[A-Z]/, 'TAPETE'],
  [/\bARBOTANTE\b|^ARB\s+[A-Z]/, 'ARBOTANTE'],
  [/\bCANDIL\b/, 'CANDIL'],
  [/\bLAMPARA\s+(?:DE\s+)?(?:PIE|PISO)\b/, 'LAMPARA DE PISO'],
  [/\bLAMPARA\s+(?:DE\s+)?MESA\b|\bLAMPARA\s+BURO\b/, 'LAMPARA DE MESA'],
  [/\bLAMPARA\s+COLGANTE\b|\bCOLGANTE\b/, 'LAMPARA COLGANTE'],
  [/\bLAMPARA\b|\bLUMINARIA\b/, 'LAMPARA'],
  [/\bCANDELABRO\b|\bPORTAVELAS?\b|\bVELA\b|\bANTORCHA\b/, 'CANDELABRO'],
  [/\bLINTERNA\b|\bFAROL\b/, 'LINTERNA'],
  [/\bMACETA\b|\bMATERA\b/, 'MACETA'],
  [/\bPLANTA\b|\bARBOL\b|\bPALMA\b|\bFOLLAJE\b|\bVARA\b|\bRAMA\b|\bORQUIDEA\b|\bBONSAI\b/, 'PLANTA DECORATIVA'],
  [/\bFLORERO\b|\bJARRON\b|\bBOTELLA\b|\bBOTELLON\b|\bTIBOR\b|\bCILINDRO\b|^BASE\b/, 'FLORERO'],
  [/\bCHAROLA\b|\bBANDEJA\b|\bFRUTERO\b|\bENSALADERA\b|\bPLATO\b|\bBOWL\b|\bCENTRO\s+DE\s+MESA\b|\bBATEA\b/, 'CHAROLA'],
  [/\bESCULTURA\b|\bFIGURA\b|\bESFERA\b|\bCORALES?\b|\bCONCHA\b|\bBALLENA\b|\bPECES?\b|\bTORTUGAS?\b|\bPEDESTAL\b/, 'ESCULTURA'],
  [/\bFUNDA\b/, 'FUNDA DECORATIVA'],
  [/\bRELLENO\b|\bDRACON\b/, 'RELLENO'],
  [/\bALMOHADA\b|\bCOJIN\b/, 'COJIN'],
  [/\bFRAZADA\b|\bMANTA\b|\bDUVET\b|\bEDREDON\b|\bSABANA\b|\bCOLCHA\b|\bCUBRECAMA\b/, 'BLANCOS'],
  [/\bTEL-ARTELL\b|^TELA\s+ARTELL\b|^TELA\b/, 'TELA'],
  [/\bLAMINA\s+DE\s+PVC\b|\bLAMBRIN\b|\bPANEL\b/, 'LAMINA DE PVC'],
  [/\bMESA\b/, 'MESA'],
  [/\bCRISTAL\b|\bCUBIERTA\b/, 'CRISTAL'],
  [/\bACCESORIO\b|\bCAJA\b|\bALHAJERO\b|\bLIBRO\b|\bCANAST[OA]\b|\bCESTA\b|\bPORTARRETRATO\b|\bRELOJ\b|\bPERCHERO\b/, 'ACCESORIO DECORATIVO']
];

const INV_MODEL_STOPWORDS_ = {
  SILLON: 1, OCASIONAL: 1, INDIVIDUAL: 1, SILLA: 1, COMEDOR: 1, SIN: 1, BRAZOS: 1, BRAZO: 1, CON: 1,
  DERECHO: 1, IZQUIERDO: 1, DERECHA: 1, IZQUIERDA: 1, DER: 1, IZQ: 1, MESA: 1, DE: 1, DEL: 1, LA: 1, EL: 1,
  LOS: 1, LAS: 1, Y: 1, EN: 1, PARA: 1, P: 1, POR: 1, CENTRO: 1, CENTRAL: 1, LATERAL: 1, AUXILIAR: 1,
  SALA: 1, SOFA: 1, CAMA: 1, LOVE: 1, SEAT: 1, CHAISE: 1, LONGUE: 1, ESQUINERO: 1, TABURETE: 1, OTTOMAN: 1,
  FUTTON: 1, FUTON: 1, BANCO: 1, BANCA: 1, CREDENZA: 1, BUFETERA: 1, BUFETERO: 1, TRINCHADOR: 1, APARADOR: 1,
  CAVA: 1, CONSOLA: 1, LIBRERO: 1, ESCRITORIO: 1, SECRETAIRE: 1, CABECERA: 1, BASE: 1, BURO: 1, COMODA: 1,
  CAJONERA: 1, TOCADOR: 1, BAUL: 1, KING: 1, SIZE: 1, QUEEN: 1, MATRIMONIAL: 1, KS: 1, QS: 1, MAT: 1, IND: 1,
  ESPEJO: 1, MARCO: 1, CUADRO: 1, ARTE: 1, OBJETO: 1, ACCESORIO: 1, ACCESORIOS: 1, DECORATIVO: 1, DECORATIVA: 1,
  PARED: 1, MAMPARA: 1, BIOMBO: 1, SET: 1, JUEGO: 1, TAPETE: 1, T: 1, LAMPARA: 1, PIE: 1, PISO: 1, COLGANTE: 1,
  ARBOTANTE: 1, ARB: 1, CANDIL: 1, CANDELABRO: 1, LINTERNA: 1, MACETA: 1, JARRON: 1, FLORERO: 1, BOTELLA: 1,
  PLANTA: 1, PALMA: 1, CHAROLA: 1, ESCULTURA: 1, CAMASTRO: 1, COLUMPIO: 1, EXTERIOR: 1, CHICA: 1, CHICO: 1,
  MEDIANA: 1, MEDIANO: 1, MED: 1, GRANDE: 1, GDE: 1, ESPECIAL: 1, PATA: 1, PATAS: 1, NEGRA: 1, NEGRO: 1,
  BLANCA: 1, BLANCO: 1, ORO: 1, DORADO: 1, CAFE: 1, NATURAL: 1, TONO: 1, TELA: 1, ARTELL: 1, MADERA: 1,
  PAROTA: 1, ROSA: 1, MORADA: 1, RM: 1, NOGAL: 1, ENCINO: 1, TECA: 1, PINO: 1, TZALAM: 1, ROBLE: 1, CRISTAL: 1,
  MARMOL: 1, LUZ: 1, INTERIOR: 1, INCLUYE: 1, MODULARES: 1, MODULAR: 1, EMCL: 1, PEMCL: 1, EMA: 1, T1: 1, T2: 1
};

const INV_EXTRA_FABRICS_ = {
  'SORRENTO IVORY': 'MARFIL / IVORY',
  'VOIRON OLIVO': 'VERDE OLIVO',
  'VOIRON PERLA': 'BLANCO PERLA',
  'BOLTON FLAX': 'ARENA / LINO',
  'LINEN NATURE': 'LINO NATURAL',
  'NATURE LINEN': 'LINO NATURAL',
  'NATURE FLAX': 'ARENA / FLAX',
  'OSI FLAX': 'ARENA / FLAX',
  'OSI IVORY': 'MARFIL / IVORY',
  'BAKER LINEN': 'ARENA / LINO',
  'BAKER IVORY': 'MARFIL / IVORY',
  'BAKER MUSHROOM': 'TAUPE / MUSHROOM',
  'BAKER OLIVE': 'VERDE OLIVO',
  'FOREVER PLUS MOSS': 'VERDE MUSGO',
  'FOREVER PLUS BUTTERMILK': 'CREMA / BUTTERMILK',
  'FOREVER IVORY': 'MARFIL / IVORY',
  'DISTRACTION NATURAL': 'NATURAL',
  'HIGH LIVING NATURAL': 'NATURAL',
  'COPENHAGEN LINEN': 'ARENA / LINO',
  'NIZA SNOW': 'BLANCO NIEVE',
  'MERCURY FOG': 'GRIS NIEBLA',
  'HARMONY GREY': 'GRIS',
  'MOXIE BRICK': 'TERRACOTA / BRICK',
  'BLEND NATURAL': 'NATURAL',
  'ALANIS STEEL': 'GRIS ACERO',
  'FASHION CAPUCHINO': 'CAPUCHINO',
  'RIO SPINACH': 'VERDE',
  'CURIO LINEN': 'ARENA / LINO',
  'CURIO DOVE': 'GRIS PALOMA',
  'LUCCA WHITE': 'BLANCO',
  'LUCCA NATURAL': 'NATURAL',
  'LUCCA SAND': 'ARENA',
  'PRAGA OATMEAL': 'AVENA',
  'SIENA SAND': 'ARENA'
};

const INV_WOOD_PATTERNS_ = [
  [/\bPAROTA\s+LAMINAD[OA]\b/, 'PAROTA LAMINADO'],
  [/\bROSA\s+MORADA\s+SOLID[OA]\b/, 'ROSA MORADA SOLIDA'],
  [/\bROSA\s+MORADA\b|\bRM\b/, 'ROSA MORADA'],
  [/\bPAROTA\b/, 'PAROTA'],
  [/\bCHAPA\s+(?:DE\s+)?NOGAL\b/, 'CHAPA DE NOGAL'],
  [/\bNOGAL\b/, 'NOGAL'],
  [/\bENCINO\b/, 'ENCINO'],
  [/\bTECA\b|\bTEKA\b/, 'TECA'],
  [/\bPINO\b/, 'PINO'],
  [/\bTZALAM\b/, 'TZALAM'],
  [/\bROBLE\b/, 'ROBLE'],
  [/\bFRESNO\b/, 'FRESNO'],
  [/\bPALO\s+DE\s+ROSA\b/, 'PALO DE ROSA'],
  [/\bCAOBILLA\b/, 'CAOBILLA'],
  [/\bBEJUCO\b/, 'BEJUCO'],
  [/\bRATTAN\b|\bRATAN\b/, 'RATTAN']
];

const INV_WOOD_COLOR_PATTERNS_ = [
  [/\bLACA\s+BELLOTA\b/, 'LACA BELLOTA'],
  [/\bLACA\s+TACUBA\b/, 'LACA TACUBA'],
  [/\bLACA\s+BLANCA\b/, 'LACA BLANCA'],
  [/\bLACA\s+NEGRA\b/, 'LACA NEGRA'],
  [/\bTONO\s+NATURAL\b/, 'TONO NATURAL'],
  [/\bBARNIZ\s+MATTE\b|\bACABADO\s+NATURAL\s+BARNIZ\s+MATTE\b/, 'NATURAL BARNIZ MATTE'],
  [/\bTABACO\s+CLARO\b/, 'TABACO CLARO'],
  [/\bTABACO\b/, 'TABACO'],
  [/\bWARM\s+SAND\b/, 'WARM SAND'],
  [/\bROSA\s+MORADA\s+CLAR[OA]\b|\bRM\s+CLAR[OA]\b/, 'CLARA'],
  [/\bROSA\s+MORADA\s+CAFE\b/, 'CAFÉ'],
  [/\bENTINTAD[OA]\b/, 'ENTINTADO'],
  [/\bSPALTED\s+HABANO\b/, 'SPALTED HABANO'],
  [/\bSPALTED\b/, 'SPALTED'],
  [/\bHABANO\b/, 'HABANO'],
  [/\bBELLOTA\b/, 'LACA BELLOTA'],
  [/\bTACUBA\b/, 'LACA TACUBA'],
  [/\bESPIGA\b/, 'ESPIGA'],
  [/\bNUEZ\b/, 'NUEZ']
];

const INV_MATERIAL_PATTERNS_ = [
  [/\bMARMOL\s+CALACATA\s+ROMA\b/, 'MÁRMOL CALACATTA ROMA'],
  [/\bMARMOL\s+OJINAGA\s+GREY\b/, 'MÁRMOL OJINAGA GREY'],
  [/\bMARMOL\b/, 'MÁRMOL'],
  [/\bPIEDRA\s+SINTERIZADA\b/, 'PIEDRA SINTERIZADA'],
  [/\bTRAVERTIN[OE]\b/, 'TRAVERTINO'],
  [/\bONIX\b/, 'ÓNIX'],
  [/\bGRANITO\b/, 'GRANITO'],
  [/\bCRISTAL\b|\bVIDRIO\b/, 'CRISTAL'],
  [/\bCEMENTO\b|\bCONCRETO\b/, 'CEMENTO'],
  [/\bCUERDA\b/, 'CUERDA'],
  [/\bNIQUEL\b/, 'NÍQUEL'],
  [/\bMETAL\b|\bACERO\b|\bHIERRO\b|\bFIERRO\b/, 'METAL'],
  [/\bPIEL\b|\bCUERO\b/, 'PIEL'],
  [/\bCERAMICA\b|\bPORCELANA\b/, 'CERÁMICA'],
  [/\bFIBRA\s+DE\s+VIDRIO\b|\bRESINA\b/, 'RESINA / FIBRA'],
  [/\bMECATE\b|\bYUTE\b/, 'FIBRA NATURAL']
];

function deduceProductTypeInv_(nom, cat, mo) {
  const nomFull = normPlainUpper_(nom);
  const nomHead = nomFull.split(/\bINCLUYE\b/)[0].trim();
  const sources = [nomHead, nomFull, normPlainUpper_(cat), normPlainUpper_(mo)];
  for (let s = 0; s < sources.length; s++) {
    const txt = sources[s];
    if (!txt) continue;
    for (let r = 0; r < INV_TYPE_RULES_.length; r++) {
      if (INV_TYPE_RULES_[r][0].test(txt)) return INV_TYPE_RULES_[r][1];
    }
  }
  return '';
}

function deduceCategoryInv_(tp, nom, rawCat) {
  const sources = [
    [normPlainUpper_(tp), true],
    [normPlainUpper_(rawCat), true],
    [normPlainUpper_(nom), false]
  ];
  for (let i = 0; i < sources.length; i++) {
    const txt = sources[i][0];
    const allowTelaWord = sources[i][1];
    if (!txt) continue;
    if (/EXTERIOR|TERRAZA|JARDIN|CAMASTRO|COLUMPIO/.test(txt)) return 'EXTERIOR & TERRAZA';
    if (/ESPEJO|CUADRO|ARTE OBJETO|PARED|LIENZO|MURAL|PAPEL TAPIZ|MAMPARA/.test(txt)) return 'ESPEJOS & ARTE';
    if (/LAMPARA|CANDIL|ARBOTANTE|COLGANTE|ILUMINACION|PLAFON|VELA|LINTERNA/.test(txt)) return 'ILUMINACIÓN';
    if (allowTelaWord) {
      if (/COJIN|FUNDA|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|^T\.\s|\bTELA\b|RELLENO|DRACON/.test(txt)) return 'COJINES & TEXTILES';
    } else {
      if (/COJIN|FUNDA|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|^T\.\s|^TELA\s+ARTELL\b|RELLENO|DRACON/.test(txt)) return 'COJINES & TEXTILES';
    }
    if (/BUFETERA|BUFETERO|CREDENZA|TRINCHADOR|APARADOR|CONSOLA|CAVA/.test(txt)) return 'BUFETERAS & CREDENZAS';
    if (/MESA DE CENTRO|MESA CENTRAL|MESA LATERAL|MESA AUXILIAR|MESAS DE SALA/.test(txt)) return 'MESAS DE CENTRO & LATERALES';
    if (/RECAMARA|CAMA|CABECERA|BURO|COMODA|CAJONERA|TOCADOR|COLCHON|BOX|LITERA|BAUL/.test(txt)) return 'RECÁMARAS';
    if (/ESCRITORIO|SECRETAIRE|ARCHIVERO|OFICINA|LIBRERO/.test(txt)) return 'OFICINA';
    if (/SALA|SOFA|LOVE SEAT|CHAISE|OTTOMAN|FUTTON|FUTON|ESQUINERO/.test(txt)) return 'SALAS & SOFÁS';
    if (/SILLA|SILLON|TABURETE|BANCO|BANCA/.test(txt)) return 'SILLAS & SILLONES';
    if (/COMEDOR|MESA/.test(txt)) return 'COMEDORES';
    if (/FLORERO|JARRON|ESCULTURA|CHAROLA|CANDELABRO|MACETA|PLANTA|PALMA|FOLLAJE|ACCESORIO|VELA|LIBRO|BOTELLA|BOTELLON|PLATO|ENSALADERA|CANASTO|LINTERNA|CORAL|CONCHA|AJEDREZ|ESFERA/.test(txt)) {
      return 'ACCESORIOS DECORATIVOS';
    }
  }
  return 'COMPLEMENTOS';
}

function cleanOrExtractModelInv_(rawMo, cleanNom, tp) {
  const moClean = stripDimensionsAndExtractInv_(rawMo).text
    .replace(/^(?:T[12]\s+)?(?:P?EMCL|EMA)\s+/i, '')
    .replace(/^TEL-ARTELL\s+/i, '')
    .trim();
  const moNorm = normPlainUpper_(moClean);
  const words = moClean ? moClean.split(/\s+/) : [];
  const isBad = !moClean ||
    /^\d+$/.test(moClean) ||
    /^[\d\s.,xX*×\/-]+$/.test(moClean) ||
    words.length >= 4 ||
    !!INV_MODEL_STOPWORDS_[moNorm] ||
    moNorm === normPlainUpper_(tp) ||
    moNorm === normPlainUpper_(cleanNom) ||
    words.some((w) => /^(SILLA|SILLON|MESA|SALA|CREDENZA|BUFETERA|CAMA|ESPEJO|CUADRO|TAPETE|LAMPARA)$/i.test(normPlainUpper_(w)));
  if (!isBad) return moClean.toUpperCase();

  const nomTokens = normPlainUpper_(cleanNom.replace(/^T\.\s+/i, 'TAPETE ')).match(/[A-Z0-9]+(?:-[A-Z0-9]+)?/g) || [];
  const cand = [];
  for (let i = 0; i < nomTokens.length; i++) {
    const tok = nomTokens[i];
    if (INV_MODEL_STOPWORDS_[tok]) {
      if (cand.length) break;
      continue;
    }
    if (/^\d+$/.test(tok) && !cand.length) continue;
    cand.push(tok);
    if (cand.length >= 2) {
      if (!/^(SAN|SANTA|GRAN|MONTE|VILLA|CASA|MANABO)$/.test(cand[0]) && !/^(II|III|IV|\d+)$/.test(cand[1])) {
        cand.pop();
      }
      break;
    }
  }
  return cand.join(' ') || (moClean && !/^\d+$/.test(moClean) && !/^[\d\s.,xX*×\/-]+$/.test(moClean) ? moClean.toUpperCase() : '');
}

/**
 * Autocompleta en automático cualquier SKU nuevo o incompleto en INVENTARIO_EN_VIVO,
 * extrae medidas incrustadas en NOMBRE hacia MEDIDAS, registra precios faltantes en
 * plantilla!AE:AH y ordena alfabéticamente A-Z preservando intactas F2 (fotos) y AW2 (precio).
 */
function limpiarYCompletarInventarioEnVivo(opts) {
  const silentUi = !!(opts && opts.silentUi);
  const res = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), Object.assign({ silentUi: silentUi, force: true }, opts || {}));
  if (!silentUi && res && res.ok) {
    try {
      SpreadsheetApp.getUi().alert(
        'INVENTARIO_EN_VIVO actualizado y ordenado A-Z.\n\n' +
        '• Productos totales: ' + res.total + '\n' +
        '• Productos nuevos agregados: ' + res.added + '\n' +
        '• Filas autocompletadas/limpiadas: ' + res.updated + '\n' +
        '• Orden alfabético A-Z: ' + (res.reordered ? 'Aplicado' : 'Al día')
      );
    } catch (e) {}
  }
  return res;
}

function autocompletarYOrdenarInventarioEnVivo_(ss, opts) {
  const book = ss || getSpreadsheet_();
  const options = opts || {};
  eliminarPestanaTopBuscadosSiExiste_(book);

  const shInv = book.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  if (!shInv || shInv.getLastRow() < 2) {
    return { ok: false, error: 'Hoja INVENTARIO_EN_VIVO no encontrada.' };
  }
  asegurarColumnaTotalInventario_(book, shInv);

  if (options.useThrottle && !options.force) {
    try {
      const c = CacheService.getScriptCache();
      if (c && c.get('inv_auto_sort_v1') === '1') {
        return { ok: true, throttled: true };
      }
    } catch (ce) {}
  }

  if (shInv.getMaxColumns() < 49) {
    shInv.insertColumnsAfter(shInv.getMaxColumns(), 49 - shInv.getMaxColumns());
  }

  // 1) Leer referencias en estricto SOLO LECTURA ('1', plantilla!AE:AH, y pestañas de Catálogo)
  const hoja1Ref = {};
  try {
    const sh1 = book.getSheetByName('1');
    if (sh1 && sh1.getLastRow() >= 2) {
      const v1 = sh1.getRange(2, 1, sh1.getLastRow() - 1, Math.min(sh1.getLastColumn(), 4)).getValues();
      for (let i = 0; i < v1.length; i++) {
        const sk = cleanInvCell_(v1[i][0]).toUpperCase();
        if (!sk || sk === 'SKU') continue;
        hoja1Ref[sk] = {
          skuRaw: cleanInvCell_(v1[i][0]),
          nom: cleanInvCell_(v1[i][1]),
          foto: cleanInvCell_(v1[i][3]) || ''
        };
      }
    }
  } catch (e1) {}

  const shPlantilla = book.getSheetByName('plantilla');
  const plantillaRef = {};
  if (shPlantilla && shPlantilla.getLastRow() >= 2 && shPlantilla.getLastColumn() >= 34) {
    const vp = shPlantilla.getRange(2, 31, shPlantilla.getLastRow() - 1, 4).getValues();
    for (let i = 0; i < vp.length; i++) {
      const sk = cleanInvCell_(vp[i][0]).toUpperCase();
      if (!sk || sk === 'SKU_ERP') continue;
      plantillaRef[sk] = {
        skuRaw: cleanInvCell_(vp[i][0]),
        idProd: cleanSheetKeyCell_(vp[i][1]),
        nom: cleanInvCell_(vp[i][2]),
        precio: Number(vp[i][3] || 0) || 0
      };
    }
  }

  const mueblesRef = {};
  try {
    const shMi = book.getSheetByName('MUEBLES_INDIVIDUALES');
    if (shMi && shMi.getLastRow() >= 2 && shMi.getLastColumn() >= 7) {
      const vm = shMi.getRange(2, 1, shMi.getLastRow() - 1, Math.min(shMi.getLastColumn(), 12)).getValues();
      for (let i = 0; i < vm.length; i++) {
        const sk = cleanInvCell_(vm[i][1]).toUpperCase();
        if (!sk) continue;
        const dims = [vm[i][4], vm[i][5], vm[i][6]]
          .map((x) => cleanInvCell_(x).replace(/\s*cm\.?$/i, '').trim())
          .filter((x) => x && /\d/.test(x));
        mueblesRef[sk] = {
          nom: cleanInvCell_(vm[i][2]),
          cat: cleanInvCell_(vm[i][3]),
          med: dims.length >= 2 ? (dims.join('X') + ' CM') : '',
          mat: cleanInvCell_(vm[i][11])
        };
      }
    }
    ['PIEZAS_MODULOS', 'SALAS_MODULARES'].forEach((tabMod) => {
      const shM = book.getSheetByName(tabMod);
      if (!shM || shM.getLastRow() < 2 || shM.getLastColumn() < 8) return;
      const vmod = shM.getRange(2, 1, shM.getLastRow() - 1, 8).getValues();
      for (let i = 0; i < vmod.length; i++) {
        const sk = cleanInvCell_(vmod[i][2]).toUpperCase();
        if (!sk) continue;
        const dims = [vmod[i][5], vmod[i][6], vmod[i][7]]
          .map((x) => cleanInvCell_(x).replace(/\s*cm\.?$/i, '').trim())
          .filter((x) => x && /\d/.test(x));
        const prev = mueblesRef[sk] || {};
        if (!prev.modPadre && cleanInvCell_(vmod[i][1])) prev.modPadre = cleanInvCell_(vmod[i][1]);
        if (!prev.nom && cleanInvCell_(vmod[i][3])) prev.nom = cleanInvCell_(vmod[i][3]);
        if (!prev.med && dims.length >= 2) prev.med = dims.join('X') + ' CM';
        mueblesRef[sk] = prev;
      }
    });
  } catch (eCat) {}

  const metaErpSku = options.metaErpSku || {};
  const invPorSku = options.invPorSku || {};
  const lpptLibre = options.lpptLibre || {};
  const lpptProvBySku = options.lpptProvBySku || {};
  const lpptNomBySku = options.lpptNomBySku || {};

  // 2) Leer filas actuales de INVENTARIO_EN_VIVO (A3:N y O3:AW)
  const lastRow = shInv.getLastRow();
  const oldNumRows = Math.max(0, lastRow - 2);
  const rawAtoN = oldNumRows > 0 ? shInv.getRange(3, 1, oldNumRows, 14).getValues() : [];
  const rawOtoAv = oldNumRows > 0 ? shInv.getRange(3, 15, oldNumRows, 35).getValues() : [];

  const recordsBySku = {};
  const originalSkuOrder = [];
  let removedBlanks = 0;

  for (let i = 0; i < oldNumRows; i++) {
    const r = rawAtoN[i];
    const oRow = rawOtoAv[i] || new Array(35).fill('');
    const skuRaw = cleanInvCell_(r[0]);
    const sku = skuRaw.toUpperCase();
    if (!sku || sku === 'SKU') {
      removedBlanks++;
      continue;
    }
    originalSkuOrder.push(sku);
    if (!recordsBySku[sku]) {
      recordsBySku[sku] = {
        skuRaw: skuRaw,
        sku: sku,
        aToN: r.slice(0, 14),
        oToAv: oRow.slice(0, 35),
        isNew: false
      };
    } else {
      removedBlanks++;
      const existing = recordsBySku[sku].aToN;
      for (let c = 1; c < 14; c++) {
        if (c === 5) continue;
        if (!cleanInvCell_(existing[c]) && cleanInvCell_(r[c])) {
          existing[c] = r[c];
        }
      }
    }
  }

  // 3) Detectar automáticamente cualquier SKU nuevo activo en ERP, Hoja '1', plantilla!AE:AH o LPPT
  let addedCount = 0;
  function tryRegisterNewCandidateSku(candSkuRaw, candNom, candMo, candCat, candProv, forceHasStock) {
    const sk = cleanInvCell_(candSkuRaw).toUpperCase();
    if (!sk || sk.length < 2 || sk === 'SKU' || sk === 'SKU_ERP' || sk === 'CLAVE') return;
    if (recordsBySku[sk]) return;
    const nomCheck = cleanInvCell_(candNom);
    const provCheck = cleanInvCell_(candProv);
    if (!forceHasStock) {
      if (/^DESC[-\s]|DESCONTINUAD/i.test(nomCheck)) return;
      if (/DESCONTINUAD|BAJA|AJUSTE DE INVENTARIO/i.test(provCheck)) return;
    }
    if (!nomCheck && !cleanInvCell_(candMo) && !hoja1Ref[sk] && !plantillaRef[sk] && !forceHasStock) return;

    const blankOAv = new Array(35).fill('');
    blankOAv[1] = 0;
    blankOAv[2] = 'Sin piezas solicitadas';
    for (let z = 3; z < 34; z++) blankOAv[z] = 0;

    recordsBySku[sk] = {
      skuRaw: cleanInvCell_(candSkuRaw) || sk,
      sku: sk,
      aToN: [
        cleanInvCell_(candSkuRaw) || sk,
        '',
        cleanInvCell_(candMo),
        nomCheck,
        '',
        '',
        cleanInvCell_(candCat),
        '',
        '',
        '',
        '',
        '',
        '',
        provCheck
      ],
      oToAv: blankOAv,
      isNew: true
    };
    addedCount++;
  }

  Object.keys(hoja1Ref).forEach((sk) => {
    const h = hoja1Ref[sk];
    tryRegisterNewCandidateSku(h.skuRaw || sk, h.nom, '', '', '', false);
  });

  Object.keys(plantillaRef).forEach((sk) => {
    const p = plantillaRef[sk];
    tryRegisterNewCandidateSku(p.skuRaw || sk, p.nom, '', '', '', false);
  });

  Object.keys(metaErpSku).forEach((sk) => {
    const m = metaErpSku[sk] || {};
    const sucMap = invPorSku[sk] || {};
    let sumSt = Number(lpptLibre[sk] || 0);
    Object.keys(sucMap).forEach((kSuc) => {
      sumSt += (sucMap[kSuc][0] || 0) + (sucMap[kSuc][1] || 0);
    });
    tryRegisterNewCandidateSku(sk, m.NOMBRE, m.MODELO, m.CATEGORIA, m.PROVEEDOR, sumSt > 0);
  });

  Object.keys(lpptLibre).forEach((sk) => {
    if ((lpptLibre[sk] || 0) > 0) {
      const m = metaErpSku[sk] || {};
      const p = plantillaRef[sk] || {};
      const h = hoja1Ref[sk] || {};
      tryRegisterNewCandidateSku(sk, m.NOMBRE || lpptNomBySku[sk] || h.nom || p.nom || sk, m.MODELO || '', m.CATEGORIA || '', lpptProvBySku[sk] || m.PROVEEDOR || '', true);
    }
  });

  // 4) Si hay SKUs que aún no están en plantilla!AE:AH, consultar hasta 15 por ciclo en S Mueblería WCF
  //    para que el nombre real y la columna AX (PRECIO DE LISTA por ARRAYFORMULA) se llenen automáticamente.
  if (shPlantilla) {
    const missingInPlantilla = Object.keys(recordsBySku)
      .filter((sk) => !plantillaRef[sk])
      .sort((a, b) => {
        const ra = recordsBySku[a];
        const rb = recordsBySku[b];
        const pa = (ra.isNew ? 0 : 1) + ((!cleanInvCell_(ra.aToN[3]) || cleanInvCell_(ra.aToN[3]).toUpperCase() === a) ? 0 : 2);
        const pb = (rb.isNew ? 0 : 1) + ((!cleanInvCell_(rb.aToN[3]) || cleanInvCell_(rb.aToN[3]).toUpperCase() === b) ? 0 : 2);
        return pa - pb;
      });
    const toFetchWcf = missingInPlantilla.slice(0, 15);
    const rowsToAppendPlantilla = [];
    for (let f = 0; f < toFetchWcf.length; f++) {
      const sk = toFetchWcf[f];
      try {
        const liveProd = buscarProductoPorClaveWcf_(sk);
        if (liveProd && liveProd.IdProducto) {
          rowsToAppendPlantilla.push([
            sk,
            String(liveProd.IdProducto).trim(),
            cleanInvCell_(liveProd.Nombre) || cleanInvCell_(recordsBySku[sk].aToN[3]) || sk,
            Number(liveProd.Precio || 0) || ''
          ]);
          plantillaRef[sk] = {
            skuRaw: sk,
            idProd: String(liveProd.IdProducto).trim(),
            nom: cleanInvCell_(liveProd.Nombre),
            precio: Number(liveProd.Precio || 0) || 0
          };
        }
      } catch (wcfErr) {
        break;
      }
    }
    if (rowsToAppendPlantilla.length > 0) {
      try {
        const aeVals = shPlantilla.getRange(2, 31, Math.max(1, shPlantilla.getLastRow() - 1), 1).getValues();
        let lastAeRow = 1;
        for (let rIdx = aeVals.length - 1; rIdx >= 0; rIdx--) {
          if (cleanInvCell_(aeVals[rIdx][0])) {
            lastAeRow = rIdx + 2;
            break;
          }
        }
        const writeStart = lastAeRow + 1;
        if (shPlantilla.getMaxRows() < writeStart + rowsToAppendPlantilla.length - 1) {
          shPlantilla.insertRowsAfter(
            shPlantilla.getMaxRows(),
            (writeStart + rowsToAppendPlantilla.length - 1) - shPlantilla.getMaxRows()
          );
        }
        shPlantilla.getRange(writeStart, 31, rowsToAppendPlantilla.length, 1).setNumberFormat('@');
        shPlantilla.getRange(writeStart, 31, rowsToAppendPlantilla.length, 4).setValues(rowsToAppendPlantilla);
      } catch (ePlWrite) {}
    }
  }

  // 5) Cosechar vocabulario curado existente (Telas + Colores y Prefijos SKU -> Proveedor)
  const badFabrics = {
    TELA: 1, 'TELA ARTELL': 1, ARTELL: 1, 'SIN TELA': 1, VARIOS: 1, ESTANDAR: 1, NATURAL: 1,
    ALGODON: 1, LINO: 1, POLIESTER: 1, TERCIOPELO: 1, PIEL: 1, GAMUZA: 1, YUTE: 1
  };
  const knownFabrics = {};
  Object.keys(INV_EXTRA_FABRICS_).forEach((k) => {
    knownFabrics[normPlainUpper_(k)] = { tl: k, ct: INV_EXTRA_FABRICS_[k] };
  });
  const prefixCounts = {};
  const allSkus = Object.keys(recordsBySku);
  for (let i = 0; i < allSkus.length; i++) {
    const rec = recordsBySku[allSkus[i]];
    const r = rec.aToN;
    const tl = cleanInvCell_(r[7]);
    const ct = cleanInvCell_(r[8]);
    const pv = cleanInvCell_(r[13]);
    if (tl && tl.length >= 4) {
      const tln = normPlainUpper_(tl);
      if (!badFabrics[tln] && tln.split(/\s+/).length >= 2) {
        if (!knownFabrics[tln] || (ct && !knownFabrics[tln].ct)) {
          knownFabrics[tln] = { tl: tl.toUpperCase(), ct: ct ? ct.toUpperCase() : '' };
        }
      }
    }
    const mPfx = rec.sku.match(/^([A-Z]{2,5})/);
    if (mPfx && pv && !/DESCONTINUAD|AJUSTE DE INVENTARIO/i.test(pv)) {
      const pfx = mPfx[1];
      if (!prefixCounts[pfx]) prefixCounts[pfx] = {};
      const pvUp = pv.toUpperCase();
      prefixCounts[pfx][pvUp] = (prefixCounts[pfx][pvUp] || 0) + 1;
    }
  }
  const fabricsSorted = Object.keys(knownFabrics).sort((a, b) => b.length - a.length);
  const skuPrefixProv = {};
  Object.keys(prefixCounts).forEach((pfx) => {
    let bestP = '';
    let bestC = 0;
    Object.keys(prefixCounts[pfx]).forEach((pv) => {
      if (prefixCounts[pfx][pv] > bestC) {
        bestC = prefixCounts[pfx][pv];
        bestP = pv;
      }
    });
    if (bestP && bestC >= 2) skuPrefixProv[pfx] = bestP;
  });

  // 6) Limpiar medidas del NOMBRE y autocompletar columnas B:E y G:N para todas las filas
  let updatedRows = 0;
  const enrichedList = [];

  for (let i = 0; i < allSkus.length; i++) {
    const rec = recordsBySku[allSkus[i]];
    const sku = rec.sku;
    const r = rec.aToN;
    const hRef = hoja1Ref[sku] || {};
    const pRef = plantillaRef[sku] || {};
    const mRef = mueblesRef[sku] || {};
    const eRef = metaErpSku[sku] || {};

    let tp = cleanInvCell_(r[1]);
    let mo = cleanInvCell_(r[2]) || cleanInvCell_(eRef.MODELO) || cleanInvCell_(mRef.modPadre) || '';
    let nom = cleanInvCell_(r[3]);
    let vr = cleanInvCell_(r[4]);
    let cat = cleanInvCell_(r[6]) || cleanInvCell_(mRef.cat) || cleanInvCell_(eRef.CATEGORIA) || '';
    let tl = cleanInvCell_(r[7]);
    let ct = cleanInvCell_(r[8]);
    let md = cleanInvCell_(r[9]);
    let cm = cleanInvCell_(r[10]);
    let mt = cleanInvCell_(r[11]) || cleanInvCell_(mRef.mat) || '';
    let med = cleanInvCell_(r[12]);
    let prov = cleanInvCell_(r[13]) || cleanInvCell_(eRef.PROVEEDOR) || cleanInvCell_(lpptProvBySku[sku]) || '';

    if (!nom || nom.toUpperCase() === sku || /^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(nom)) {
      const badParsed = stripDimensionsAndExtractInv_(nom);
      if (!med && badParsed.med) med = badParsed.med;
      const candNames = [hRef.nom, pRef.nom, eRef.NOMBRE, lpptNomBySku[sku], mRef.nom, mo];
      for (let c = 0; c < candNames.length; c++) {
        const cn = cleanInvCell_(candNames[c]);
        if (cn && cn.toUpperCase() !== sku && !/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(cn)) {
          nom = cn;
          break;
        }
      }
    }
    if (/^T\.\s+[A-Z]/i.test(nom)) nom = nom.replace(/^T\.\s+/i, 'TAPETE ');
    if (/^TEL-ARTELL\s+/i.test(nom)) nom = nom.replace(/^TEL-ARTELL\s+/i, 'TELA ARTELL ');

    const parsedNom = stripDimensionsAndExtractInv_(nom);
    if (parsedNom.text && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(parsedNom.text)) {
      nom = parsedNom.text;
    }
    if (!med && parsedNom.med) med = parsedNom.med;
    if (!med && mo) {
      const parsedMo = stripDimensionsAndExtractInv_(mo);
      if (parsedMo.med) med = parsedMo.med;
    }
    if (!med && hRef.nom) {
      const parsedH = stripDimensionsAndExtractInv_(hRef.nom);
      if (parsedH.med) med = parsedH.med;
    }
    if (!med && pRef.nom) {
      const parsedP = stripDimensionsAndExtractInv_(pRef.nom);
      if (parsedP.med) med = parsedP.med;
    }
    if (!med && mRef.med) med = mRef.med;
    if (med && /^\d+(?:\.\d+)?(?:\s*[xX*×]\s*\d+(?:\.\d+)?)+$/.test(med)) {
      med = med.replace(/\s*[xX*×]\s*/g, 'X') + ' CM';
    }

    if (!tp) tp = deduceProductTypeInv_(nom, cat, mo) || 'ACCESORIO DECORATIVO';
    const nomHeadInv = normPlainUpper_(nom).split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
    if (/^SALA\b/.test(nomHeadInv) && !/^SALA\s+(?:DE\s+)?COMEDOR\b/.test(nomHeadInv)) {
      tp = 'SALA';
    } else if (/^RECAMARA\b/.test(nomHeadInv)) {
      tp = 'RECÁMARA';
    } else if (
      /\b(SILLON(?:ES)?|BUTACAS?|MECEDORAS?|RECLINABLES?|BERGERE)\b/.test(nomHeadInv) &&
      !/\bSILLAS?\b/.test(nomHeadInv) &&
      !/^(?:SALA|SOFA\s+CAMA|FUTTON|FUTON)\b/.test(nomHeadInv)
    ) {
      if (!/\bSILLON\b/.test(normPlainUpper_(tp))) {
        tp = /\bOCASIONAL\b/.test(nomHeadInv) ? 'SILLON OCASIONAL' : 'SILLON';
      }
    } else if (
      /\bSILLAS?\b/.test(nomHeadInv) &&
      !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHeadInv)
    ) {
      if (!/^SILLA\b/.test(normPlainUpper_(tp))) {
        tp = 'SILLA';
      }
    }
    mo = cleanOrExtractModelInv_(mo, nom, tp);
    if (!mo) {
      const tpWords = {};
      normPlainUpper_(tp).split(/\s+/).forEach((w) => { if (w) tpWords[w] = 1; });
      const remWords = (nom.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9]+/g) || [])
        .map((w) => w.toUpperCase())
        .filter((w) => !tpWords[normPlainUpper_(w)] && !/^(DE|DEL|LA|EL|Y|CON|EN)$/.test(normPlainUpper_(w)));
      mo = remWords[0] || sku;
    }

    if (!cat || /\d.*x.*\d/i.test(cat) || !/SALAS|SILLAS|COMEDORES|BUFETERAS|MESAS|RECÁMARAS|OFICINA|ILUMINACIÓN|ESPEJOS|EXTERIOR|COJINES|ACCESORIOS|COMPLEMENTOS/.test(cat)) {
      cat = deduceCategoryInv_(tp, nom, cat);
    }

    const searchBlob = ' ' + normPlainUpper_(nom) + ' ';
    if (tp === 'TELA' && !tl && mo) tl = mo;
    if (!tl && fabricsSorted.length > 0) {
      for (let f = 0; f < fabricsSorted.length; f++) {
        const fk = fabricsSorted[f];
        if (searchBlob.indexOf(' ' + fk + ' ') >= 0) {
          tl = knownFabrics[fk].tl;
          if (!ct && knownFabrics[fk].ct) ct = knownFabrics[fk].ct;
          break;
        }
      }
    } else if (tl && !ct && knownFabrics[normPlainUpper_(tl)]) {
      ct = knownFabrics[normPlainUpper_(tl)].ct || '';
    }

    if (!md) {
      for (let w = 0; w < INV_WOOD_PATTERNS_.length; w++) {
        if (INV_WOOD_PATTERNS_[w][0].test(searchBlob)) {
          md = INV_WOOD_PATTERNS_[w][1];
          break;
        }
      }
    }
    if (!cm) {
      for (let w = 0; w < INV_WOOD_COLOR_PATTERNS_.length; w++) {
        if (INV_WOOD_COLOR_PATTERNS_[w][0].test(searchBlob)) {
          cm = INV_WOOD_COLOR_PATTERNS_[w][1];
          break;
        }
      }
    }
    if (!mt) {
      const mats = [];
      for (let mIdx = 0; mIdx < INV_MATERIAL_PATTERNS_.length; mIdx++) {
        if (INV_MATERIAL_PATTERNS_[mIdx][0].test(searchBlob) && mats.indexOf(INV_MATERIAL_PATTERNS_[mIdx][1]) < 0) {
          mats.push(INV_MATERIAL_PATTERNS_[mIdx][1]);
        }
      }
      if (mats.length > 0) mt = mats.slice(0, 3).join(', ');
    }

    if (vr) {
      const vrParsed = stripDimensionsAndExtractInv_(vr);
      if (vrParsed.text && /[A-Za-z]{2,}/.test(vrParsed.text)) vr = vrParsed.text;
    }
    if (!vr) {
      const vParts = [];
      if (tl) vParts.push(tl);
      if (md) vParts.push(md + (cm && md.indexOf(cm) < 0 ? ' ' + cm : ''));
      else if (cm) vParts.push(cm);
      if (mt && vParts.length === 0) vParts.push(mt);
      if (vParts.length > 0) {
        vr = vParts.join(' · ');
      } else {
        const used = {};
        normPlainUpper_(tp + ' ' + mo).split(/\s+/).forEach((w) => { if (w) used[w] = 1; });
        const remVar = (nom || '').split(/\s+/).filter((w) => {
          const nw = normPlainUpper_(w);
          return nw && !used[nw] && !/^(DE|DEL|LA|EL|EN|CON|Y)$/.test(nw);
        });
        vr = remVar.join(' ').trim() || 'ESTÁNDAR';
      }
    }

    if (!prov) {
      const mPfx = sku.match(/^([A-Z]{2,5})/);
      if (mPfx && skuPrefixProv[mPfx[1]]) prov = skuPrefixProv[mPfx[1]];
    }

    if (!nom) nom = [tp, mo, vr].filter(Boolean).join(' ').trim() || sku;

    const newAtoE = [rec.skuRaw || sku, tp, mo, nom, vr];
    const newGtoN = [cat, tl, ct, md, cm, mt, med, prov];

    const rowChanged = rec.isNew ||
      tp !== String(r[1] || '').trim() ||
      mo !== String(r[2] || '').trim() ||
      nom !== String(r[3] || '').trim() ||
      vr !== String(r[4] || '').trim() ||
      cat !== String(r[6] || '').trim() ||
      tl !== String(r[7] || '').trim() ||
      ct !== String(r[8] || '').trim() ||
      md !== String(r[9] || '').trim() ||
      cm !== String(r[10] || '').trim() ||
      mt !== String(r[11] || '').trim() ||
      med !== String(r[12] || '').trim() ||
      prov !== String(r[13] || '').trim();
    if (rowChanged) updatedRows++;

    enrichedList.push({
      sku: sku,
      nom: nom,
      aToE: newAtoE,
      gToN: newGtoN,
      oToAv: rec.oToAv
    });
  }

  // 7) Ordenar estrictamente A-Z por NOMBRE (letras A-Z primero, números 0-9 después, desempate por SKU)
  enrichedList.sort((a, b) => compareAlphaEs_(a.nom || a.sku, b.nom || b.sku) || a.sku.localeCompare(b.sku));

  const totalRows = enrichedList.length;
  let reordered = totalRows !== originalSkuOrder.length;
  if (!reordered) {
    for (let i = 0; i < totalRows; i++) {
      if (enrichedList[i].sku !== originalSkuOrder[i]) {
        reordered = true;
        break;
      }
    }
  }

  // 8) Escribir atómicamente A3:E, G3:N y O3:AW sin tocar jamás F (col 6) ni AX (col 50)
  if (totalRows > 0 && (updatedRows > 0 || reordered || addedCount > 0 || removedBlanks > 0)) {
    if (shInv.getMaxRows() < 2 + totalRows) {
      shInv.insertRowsAfter(shInv.getMaxRows(), (2 + totalRows) - shInv.getMaxRows());
    }
    const outAE = new Array(totalRows);
    const outGN = new Array(totalRows);
    const outOAV = new Array(totalRows);
    for (let i = 0; i < totalRows; i++) {
      outAE[i] = enrichedList[i].aToE;
      outGN[i] = enrichedList[i].gToN;
      outOAV[i] = enrichedList[i].oToAv;
    }

    shInv.getRange(3, 1, totalRows, 1).setNumberFormat('@');
    shInv.getRange(3, 1, totalRows, 5).setValues(outAE);
    shInv.getRange(3, 7, totalRows, 8).setValues(outGN);
    if (reordered || addedCount > 0 || removedBlanks > 0) {
      shInv.getRange(3, 15, totalRows, 35).setValues(outOAV);
    }

    if (oldNumRows > totalRows) {
      const rem = oldNumRows - totalRows;
      shInv.getRange(3 + totalRows, 1, rem, 5).clearContent();
      shInv.getRange(3 + totalRows, 7, rem, 8).clearContent();
      shInv.getRange(3 + totalRows, 15, rem, 35).clearContent();
    }

    if (!options.skipFlush) {
      SpreadsheetApp.flush();
    }
  }

  try {
    CacheService.getScriptCache().put('inv_auto_sort_v1', '1', 180);
  } catch (ce) {}

  return {
    ok: true,
    total: totalRows,
    added: addedCount,
    updated: updatedRows,
    reordered: reordered
  };
}

// ============================================================================
// CLIENTES S MUEBLERÍA EN VIVO (BÚSQUEDA Y ALTA) + FOTOS NUEVAS (SOLO GERENTES)
// ============================================================================

function handleInvSearchErpClients_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
  if (!authCheck.ok) {
    return authCheck;
  }
  if (authCheck.advisor && (authCheck.advisor.isGuest || authCheck.advisor.soloLectura)) {
    return { ok: false, error: 'Tu cuenta de Invitado (Solo Ver) no tiene permisos para consultar clientes ni cotizar.' };
  }

  const query = String((body && body.query) || '').trim();
  if (query.length < 2) {
    return { ok: false, error: 'Escribe al menos 2 letras o dígitos para buscar en S Mueblería.' };
  }

  const cfg = getErpRuntimeConfig_();
  const results = [];
  const seenKeys = {};

  // 1) Clientes formales registrados en S Mueblería (ObtenerClientes -> Cliente2)
  let clientErrMsg = '';
  try {
    const xmlCli = callSmuebleriaWcf_(
      'ObtenerClientes',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(query) + '</Filtro>'
    );
    const cliRe = /<([a-zA-Z0-9_:]*Cliente2?)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = cliRe.exec(xmlCli)) !== null) {
      const blk = m[2];
      const idCli = parseInt(extractXmlTag_(blk, 'IdCliente') || '0', 10) || 0;
      if (idCli <= 0) continue;
      const key = 'C:' + idCli;
      if (seenKeys[key]) continue;
      seenKeys[key] = true;

      const nomComp = extractXmlTag_(blk, 'NombreCompleto');
      const nomParts = [
        extractXmlTag_(blk, 'Nombre'),
        extractXmlTag_(blk, 'Paterno'),
        extractXmlTag_(blk, 'Materno')
      ].filter(Boolean).join(' ').trim();
      const nombreFinal = String(nomComp || nomParts || ('CLIENTE #' + idCli)).replace(/\s+/g, ' ').trim();
      const tel = extractXmlTag_(blk, 'Telefono');
      const cel = extractXmlTag_(blk, 'Celular');

      results.push({
        type: 'CLIENTE',
        idCliente: idCli,
        idLead: 0,
        noCliente: extractXmlTag_(blk, 'NoCliente') || '',
        nombre: nombreFinal,
        telefono: tel || cel || '',
        celular: cel || tel || '',
        correo: extractXmlTag_(blk, 'Correo') || '',
        direccion: extractXmlTag_(blk, 'Direccion') || ''
      });
      if (results.length >= 30) break;
    }
  } catch (eCli) {
    clientErrMsg = String((eCli && eCli.message) || eCli || '');
  }

  // 2) Prospectos / Leads activos en S Mueblería (ObtenerLeads -> Lead)
  if (results.length < 25) {
    try {
      const xmlLeads = callSmuebleriaWcf_(
        'ObtenerLeads',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(query) + '</Filtro>'
      );
      const leadRe = /<([a-zA-Z0-9_:]*Lead)\b[^>]*>([\s\S]*?)<\/\1>/g;
      let ml;
      while ((ml = leadRe.exec(xmlLeads)) !== null) {
        const blk = ml[2];
        const idLead = parseInt(extractXmlTag_(blk, 'IdLead') || '0', 10) || 0;
        if (idLead <= 0) continue;
        const key = 'L:' + idLead;
        if (seenKeys[key]) continue;
        seenKeys[key] = true;

        const nomComp = extractXmlTag_(blk, 'NombreCompleto');
        const nomParts = [
          extractXmlTag_(blk, 'Nombre'),
          extractXmlTag_(blk, 'Paterno'),
          extractXmlTag_(blk, 'Materno')
        ].filter(Boolean).join(' ').trim();
        const nombreFinal = String(nomComp || nomParts || ('PROSPECTO #' + idLead)).replace(/\s+/g, ' ').trim();
        const tel = extractXmlTag_(blk, 'Telefono');
        const cel = extractXmlTag_(blk, 'Celular');

        results.push({
          type: 'LEAD',
          idCliente: 0,
          idLead: idLead,
          noCliente: '',
          nombre: nombreFinal,
          telefono: tel || cel || '',
          celular: cel || tel || '',
          correo: extractXmlTag_(blk, 'Correo') || '',
          direccion: extractXmlTag_(blk, 'Direccion') || ''
        });
        if (results.length >= 30) break;
      }
    } catch (eLead) {
      if (!results.length && !clientErrMsg) {
        clientErrMsg = String((eLead && eLead.message) || eLead || '');
      }
    }
  }

  if (!results.length && clientErrMsg) {
    return { ok: false, error: 'No fue posible consultar S Mueblería en este momento: ' + clientErrMsg };
  }

  return {
    ok: true,
    query: query,
    clients: results.slice(0, 25)
  };
}

function handleInvCreateErpClient_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = getSpreadsheet_();
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    if (verifiedUser.isGuest || verifiedUser.soloLectura) {
      return { ok: false, error: 'Tu cuenta de Invitado (Solo Ver) no tiene permisos para dar de alta clientes ni cotizar.' };
    }
    const cfg = getErpRuntimeConfig_();

    let idAgente = parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) || 0;
    if (verifiedUser.isAdmin && body && body.erpAdvisorId) {
      idAgente = parseInt(String(body.erpAdvisorId).trim(), 10) || idAgente;
    }
    if (!idAgente || idAgente <= 0) {
      idAgente = cfg.masterUserId;
    }

    const nombre = String((body && body.nombre) || '').trim();
    const paterno = String((body && body.paterno) || '').trim();
    const materno = String((body && body.materno) || '').trim();
    const telefono = String((body && body.telefono) || '').trim();
    const celular = String((body && body.celular) || telefono || '').trim();
    const correo = String((body && body.correo) || '').trim();
    const empresa = String((body && body.empresa) || '').trim();
    const rfc = String((body && body.rfc) || '').trim().toUpperCase();
    const razonSocial = String((body && body.razonSocial) || empresa || '').trim();
    const calle = String((body && body.calle) || '').trim();
    const noExterior = String((body && body.noExterior) || '').trim();
    const noInterior = String((body && body.noInterior) || '').trim();
    const colonia = String((body && body.colonia) || '').trim();
    const cp = String((body && body.cp) || '').trim();
    const ciudad = String((body && body.ciudad) || '').trim();
    const municipio = String((body && body.municipio) || ciudad || '').trim();
    const estado = String((body && body.estado) || '').trim();
    const referencias = String((body && body.referencias) || '').trim();

    if (!nombre) {
      return { ok: false, error: 'Ingresa el nombre del cliente para darlo de alta en S Mueblería.' };
    }

    const fullName = [nombre, paterno, materno].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    // 1) Obtener consecutivo automático de NoCliente en S Mueblería
    let noClienteAuto = '';
    try {
      const xmlNo = callSmuebleriaWcf_(
        'ObtenerNoClienteAutomatico',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario>'
      );
      noClienteAuto = String(extractXmlTag_(xmlNo, 'ObtenerNoClienteAutomaticoResult') || '').trim();
    } catch (eNo) {}
    if (!noClienteAuto) {
      noClienteAuto = 'CL' + String(Date.now()).slice(-7);
    }

    // 2) Insertar Cliente formal en S Mueblería (orden exacto de parámetros WCF ISMuebleriaService.InsertarCliente)
    let idCliente = 0;
    let clientWarn = '';
    try {
      const innerCli =
        '<ClaveServicio>{TOKEN}</ClaveServicio>' +
        '<IdUsuario>' + cfg.masterUserId + '</IdUsuario>' +
        '<IdCliente>0</IdCliente>' +
        '<Nombre>' + xmlEscape_(nombre) + '</Nombre>' +
        '<Paterno>' + xmlEscape_(paterno) + '</Paterno>' +
        '<Materno>' + xmlEscape_(materno) + '</Materno>' +
        '<Correo>' + xmlEscape_(correo) + '</Correo>' +
        '<FechaNacimiento>2000-01-01T00:00:00</FechaNacimiento>' +
        '<Telefono>' + xmlEscape_(telefono || celular) + '</Telefono>' +
        '<Celular>' + xmlEscape_(celular || telefono) + '</Celular>' +
        '<Oficina></Oficina>' +
        '<IdTipoCliente>1</IdTipoCliente>' +
        '<NoCliente>' + xmlEscape_(noClienteAuto) + '</NoCliente>' +
        '<Casa2></Casa2>' +
        '<Nextel></Nextel>' +
        '<Extension></Extension>' +
        '<IdAgenteVentas>' + idAgente + '</IdAgenteVentas>' +
        '<Ruta>0</Ruta>' +
        '<IdOrigen>0</IdOrigen>' +
        '<Empresa>' + xmlEscape_(empresa) + '</Empresa>' +
        '<Incoterm></Incoterm>' +
        '<numRegIdTrib></numRegIdTrib>' +
        '<ClavePedimento></ClavePedimento>' +
        '<CURP></CURP>' +
        '<ClienteConAcceso>false</ClienteConAcceso>' +
        '<Password></Password>' +
        '<ClienteCrearVentas>false</ClienteCrearVentas>';

      const xmlIns = callSmuebleriaWcf_('InsertarCliente', innerCli);
      const mId = xmlIns.match(/<[^>]*InsertarClienteResult>(-?\d+)</);
      idCliente = mId ? parseInt(mId[1], 10) : 0;
      if (!idCliente || idCliente <= 0) {
        clientWarn = 'InsertarCliente devolvió ' + (mId ? mId[1] : xmlIns.slice(0, 180));
      }
    } catch (eInsCli) {
      clientWarn = String((eInsCli && eInsCli.message) || eInsCli || '');
    }

    const addressSummary = [calle, noExterior ? ('#' + noExterior) : '', colonia, cp ? ('CP ' + cp) : '', ciudad, estado]
      .filter(Boolean)
      .join(', ');

    if (idCliente > 0) {
      if (calle || cp || colonia || ciudad || estado || rfc || razonSocial) {
        try {
          const innerDir =
            '<ClaveServicio>{TOKEN}</ClaveServicio>' +
            '<IdCliente>' + idCliente + '</IdCliente>' +
            '<IdDireccion>0</IdDireccion>' +
            '<Calle>' + xmlEscape_(calle || 'CONOCIDO') + '</Calle>' +
            '<CP>' + xmlEscape_(cp || '77500') + '</CP>' +
            '<Asentamiento>0</Asentamiento>' +
            '<Telefono>' + xmlEscape_(telefono || celular) + '</Telefono>' +
            '<RFC>' + xmlEscape_(rfc || 'XAXX010101000') + '</RFC>' +
            '<RazonSocial>' + xmlEscape_(razonSocial || fullName) + '</RazonSocial>' +
            '<Colonia>' + xmlEscape_(colonia) + '</Colonia>' +
            '<Municipio>' + xmlEscape_(municipio) + '</Municipio>' +
            '<Ciudad>' + xmlEscape_(ciudad) + '</Ciudad>' +
            '<Estado>' + xmlEscape_(estado || 'QUINTANA ROO') + '</Estado>' +
            '<NoExterior>' + xmlEscape_(noExterior || 'S/N') + '</NoExterior>' +
            '<NoInterior>' + xmlEscape_(noInterior) + '</NoInterior>' +
            '<Referencias>' + xmlEscape_(referencias) + '</Referencias>' +
            '<RetencionIva>false</RetencionIva>' +
            '<IdPais>1</IdPais>' +
            '<IdRegimenFiscal>0</IdRegimenFiscal>';
          callSmuebleriaWcf_('InsertarDireccionCliente', innerDir);
        } catch (eDir) {
          Logger.log('Aviso al guardar dirección opcional del cliente ' + idCliente + ': ' + eDir);
        }
      }

      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript WCF · InsertarCliente',
        evento: 'ALTA DE CLIENTE EN S MUEBLERÍA',
        estado: '✅ OK',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: verifiedUser.erpStore || verifiedUser.sheetTab || '',
        referencia: 'Cliente ID ' + idCliente + ' (' + noClienteAuto + ')',
        detalle: 'Cliente dado de alta en vivo: ' + fullName + ' · Tel: ' + (telefono || celular || '—'),
        analisis: 'Inserción directa WCF InsertarCliente completada con consecutivo ' + noClienteAuto + '.'
      });

      return {
        ok: true,
        client: {
          type: 'CLIENTE',
          idCliente: idCliente,
          idLead: 0,
          noCliente: noClienteAuto,
          nombre: fullName,
          telefono: telefono || celular,
          celular: celular || telefono,
          correo: correo,
          direccion: addressSummary
        }
      };
    }

    // Respaldo inmediato: si S Mueblería rechaza InsertarCliente (ej. correo duplicado o restricción de sucursal),
    // registrar como Lead con todos sus datos (Nombre, Paterno, Materno, Teléfono, Correo) para no frenar la cotización.
    const innerLead =
      '<ClaveServicio>{TOKEN}</ClaveServicio>' +
      '<IdUsuario>' + idAgente + '</IdUsuario>' +
      '<IdLead>0</IdLead>' +
      '<Nombre>' + xmlEscape_(nombre) + '</Nombre>' +
      '<Paterno>' + xmlEscape_(paterno) + '</Paterno>' +
      '<Materno>' + xmlEscape_(materno) + '</Materno>' +
      '<Correo>' + xmlEscape_(correo) + '</Correo>' +
      '<FechaNacimiento>2000-01-01T00:00:00</FechaNacimiento>' +
      '<Telefono>' + xmlEscape_(telefono || celular) + '</Telefono>' +
      '<Celular>' + xmlEscape_(celular || telefono) + '</Celular>' +
      '<Oficina></Oficina>' +
      '<IdResponsable>' + idAgente + '</IdResponsable>' +
      '<IdFase>0</IdFase>' +
      '<IdOrigen>0</IdOrigen>' +
      '<Casa2></Casa2>' +
      '<Nextel></Nextel>' +
      '<Extension></Extension>' +
      '<IdTipoCliente>1</IdTipoCliente>';
    const xmlLeadResp = callSmuebleriaWcf_('InsertarLead', innerLead);
    const mLead = xmlLeadResp.match(/<[^>]*InsertarLeadResult>(-?\d+)</);
    const idLeadNew = mLead ? parseInt(mLead[1], 10) : 0;
    if (!idLeadNew || idLeadNew <= 0) {
      registrarEventoHistorial_(ss, {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript WCF · InsertarCliente / InsertarLead',
        evento: 'ERROR AL DAR DE ALTA CLIENTE EN S MUEBLERÍA',
        estado: '❌ ERROR',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: verifiedUser.erpStore || verifiedUser.sheetTab || '',
        referencia: fullName,
        detalle: clientWarn || xmlLeadResp.slice(0, 220),
        analisis: analizarCausaFalloCodigo_(clientWarn || xmlLeadResp, 'AppsScript WCF · InsertarLead', 'inv_create_erp_client')
      });
      return {
        ok: false,
        error: 'No se pudo dar de alta al cliente en S Mueblería (' + (clientWarn || xmlLeadResp.slice(0, 180)) + ').'
      };
    }

    if (calle || cp || colonia || ciudad || estado || rfc || razonSocial) {
      try {
        const innerLeadDir =
          '<ClaveServicio>{TOKEN}</ClaveServicio>' +
          '<IdLead>' + idLeadNew + '</IdLead>' +
          '<IdDireccion>0</IdDireccion>' +
          '<Calle>' + xmlEscape_(calle || 'CONOCIDO') + '</Calle>' +
          '<CP>' + xmlEscape_(cp || '77500') + '</CP>' +
          '<Asentamiento>0</Asentamiento>' +
          '<Telefono>' + xmlEscape_(telefono || celular) + '</Telefono>' +
          '<RFC>' + xmlEscape_(rfc || 'XAXX010101000') + '</RFC>' +
          '<RazonSocial>' + xmlEscape_(razonSocial || fullName) + '</RazonSocial>' +
          '<Colonia>' + xmlEscape_(colonia) + '</Colonia>' +
          '<Municipio>' + xmlEscape_(municipio) + '</Municipio>' +
          '<Ciudad>' + xmlEscape_(ciudad) + '</Ciudad>' +
          '<Estado>' + xmlEscape_(estado || 'QUINTANA ROO') + '</Estado>' +
          '<NoExterior>' + xmlEscape_(noExterior || 'S/N') + '</NoExterior>' +
          '<NoInterior>' + xmlEscape_(noInterior) + '</NoInterior>' +
          '<Referencias>' + xmlEscape_(referencias) + '</Referencias>' +
          '<RetencionIva>false</RetencionIva>';
        callSmuebleriaWcf_('InsertarDireccionLead', innerLeadDir);
      } catch (eLDir) {}
    }

    registrarEventoHistorial_(ss, {
      clasificacion: 'MOVIMIENTO',
      modulo: 'AppsScript WCF · InsertarLead',
      evento: 'ALTA DE PROSPECTO (LEAD) EN S MUEBLERÍA',
      estado: '✅ OK',
      usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
      sucursal: verifiedUser.erpStore || verifiedUser.sheetTab || '',
      referencia: 'Lead ID ' + idLeadNew,
      detalle: 'Prospecto registrado en vivo: ' + fullName + ' · Tel: ' + (telefono || celular || '—'),
      analisis: clientWarn ? ('InsertarCliente devolvió aviso (' + clientWarn.slice(0, 120) + '); resuelto automáticamente como Lead.') : 'Inserción directa WCF InsertarLead exitosa.'
    });

    return {
      ok: true,
      client: {
        type: 'LEAD',
        idCliente: 0,
        idLead: idLeadNew,
        noCliente: '',
        nombre: fullName,
        telefono: telefono || celular,
        celular: celular || telefono,
        correo: correo,
        direccion: addressSummary
      }
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleInvUploadProductPhoto_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    const puestoNorm = String(verifiedUser.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const isAllowedManager = !!(verifiedUser.isAdmin || /GERENTE|\bSUB/.test(puestoNorm));
    if (!isAllowedManager) {
      registrarEventoHistorial_(ss, {
        clasificacion: 'ALERTA TÉCNICA',
        modulo: 'AppsScript · handleInvUploadProductPhoto_',
        evento: 'INTENTO DE SUBIDA DE FOTO SIN PERMISO',
        estado: '⚠️ BLOQUEADO',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: verifiedUser.erpStore || verifiedUser.sheetTab || '',
        referencia: String((body && body.sku) || '').trim().toUpperCase(),
        detalle: 'Intento de carga de foto desde cuenta con puesto ' + (verifiedUser.puesto || 'ASESOR') + '.',
        analisis: 'Validación activa: únicamente Gerentes, Subgerentes y Administradores tienen permiso de carga de fotografías.'
      });
      return {
        ok: false,
        error: 'Acceso restringido: únicamente las cuentas de Gerente o Administrador pueden agregar fotos a los productos.'
      };
    }

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    const productName = String((body && body.productName) || skuUpper).trim();
    if (!skuUpper) {
      return { ok: false, error: 'SKU inválido para asociar la fotografía.' };
    }

    const dataUrl = String((body && body.dataUrl) || '');
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) {
      return { ok: false, error: 'Formato de imagen inválido.' };
    }

    const ahoraStr = formatCancunNow_();
    const uploaderName = verifiedUser.nombre || verifiedUser.correo;
    const roleStore = [verifiedUser.puesto || (verifiedUser.isAdmin ? 'ADMINISTRADOR' : 'GERENTE'), verifiedUser.erpStore || verifiedUser.sheetTab || '']
      .filter(Boolean)
      .join(' · ');

    const mime = m[1];
    const base64Body = m[2];
    const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
    const safeSku = skuUpper.replace(/[^A-Z0-9_-]/g, '');
    const safeProd = productName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const fileName = safeSku + (safeProd && safeProd.toUpperCase() !== safeSku ? (' - ' + safeProd) : '') + ' - ' + Date.now() + '.' + ext;

    const bytes = Utilities.base64Decode(base64Body);
    const blob = Utilities.newBlob(bytes, mime, fileName);

    let uploaded = null;
    let usedFolderId = FOTOS_NUEVAS_CARGADO_FOLDER_ID_;
    try {
      const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
      uploaded = targetFolder.createFile(blob);
      usedFolderId = targetFolder.getId();
    } catch (ePrimaryFolder) {
      try {
        const projFolder = DriveApp.getFolderById(PRESENTACION_DISENO_FOLDER_ID_);
        const subIt = projFolder.getFoldersByName(TAB_FOTOS_NUEVAS_CARGADO_);
        const fallbackFolder = subIt.hasNext() ? subIt.next() : projFolder.createFolder(TAB_FOTOS_NUEVAS_CARGADO_);
        uploaded = fallbackFolder.createFile(blob);
        usedFolderId = fallbackFolder.getId();
      } catch (eSecondaryFolder) {
        uploaded = DriveApp.createFile(blob);
      }
    }
    try {
      uploaded.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + productName +
        ' | Subió: ' + uploaderName + ' (' + roleStore + ' · ' + verifiedUser.correo + ')' +
        ' | Fecha: ' + ahoraStr
      );
    } catch (eDesc) {}
    uploaded.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = uploaded.getId();
    const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId;
    const driveViewUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    const folderUrl = 'https://drive.google.com/drive/folders/' + usedFolderId;

    // NO se inserta ni coloca la fotografía en el documento de Google Sheets ("FOTOS NUEVAS CARGADO");
    // únicamente queda alojada como archivo descargable en la carpeta de Google Drive "FOTOS NUEVAS CARGADO"
    // y se registra el movimiento en texto plano dentro de la bitácora HISTORIAL.
    registrarEventoHistorial_(ss, {
      clasificacion: 'MOVIMIENTO',
      modulo: 'AppsScript · Drive FOTOS NUEVAS CARGADO',
      evento: 'ARCHIVO DE FOTO GUARDADO EN DRIVE PARA DESCARGA',
      estado: '✅ OK',
      usuario: uploaderName + ' (' + verifiedUser.correo + ')',
      sucursal: roleStore,
      referencia: skuUpper + ' · ' + productName,
      detalle: 'Archivo descargable guardado únicamente en carpeta Drive "FOTOS NUEVAS CARGADO" (' + fileName + ') · Descarga: ' + downloadUrl,
      analisis: 'Sin colocar en el documento Google Sheets ni reemplazar Columna F de INVENTARIO_EN_VIVO. Carpeta: ' + folderUrl
    });

    return {
      ok: true,
      driveOnly: true,
      sku: skuUpper,
      productName: productName,
      fileId: fileId,
      fileName: fileName,
      downloadUrl: downloadUrl,
      url: downloadUrl,
      driveUrl: driveViewUrl,
      folderUrl: folderUrl,
      uploadedBy: uploaderName,
      timestamp: ahoraStr
    };
  } catch (errUp) {
    try {
      registrarEventoHistorial_(getSpreadsheet_(), {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · handleInvUploadProductPhoto_',
        evento: 'ERROR AL SUBIR FOTOGRAFÍA A DRIVE',
        estado: '❌ ERROR',
        usuario: String((body && (body.advisorName || body.advisorEmail)) || ''),
        sucursal: String((body && body.sheetTab) || ''),
        referencia: String((body && body.sku) || '') + ' · ' + String((body && body.productName) || ''),
        detalle: (errUp && errUp.message) ? errUp.message : String(errUp),
        analisis: analizarCausaFalloCodigo_(errUp, 'AppsScript · handleInvUploadProductPhoto_', 'inv_upload_product_photo')
      });
    } catch (eLog) {}
    return {
      ok: false,
      error: (errUp && errUp.message) ? errUp.message : String(errUp)
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================================
// GESTOR EXCLUSIVO DE FOTOGRAFÍAS (TITULAR: kevin.reyna@grupoanipa.com)
// Hoja "1" (Col A = SKU · Col B = NOMBRE [fórmula fila 2] · Col D = LINK FOTO APP)
// Bandeja Drive "SUBIR" -> mueve a CATEGORIAS MUEBLES Y ACCESORIOS y quita de SUBIR
// ============================================================================
const OWNER_FOTOS_EMAIL_ = 'kevin.reyna@grupoanipa.com';
const SUBIR_INBOX_FOLDER_ID_ = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p';
const CATEGORIAS_DEST_ROOT_FOLDER_ID_ = '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN';
const CATEGORIAS_DEST_FOLDERS_ = [
  { key: 'SALAS',        id: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', name: 'FOTOS SALAS' },
  { key: 'SILLONES',     id: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm', name: 'FOTOS SILLONES' },
  { key: 'SOFA_CAMA',    id: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_', name: 'FOTOS SOFÁ CAMA Y FUTTONES' },
  { key: 'MESA_CENTRO',  id: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A', name: 'FOTOS MESA DE CENTRO' },
  { key: 'MESA_LATERAL', id: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX', name: 'FOTOS MESA LATERALES' },
  { key: 'COMEDORES',    id: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', name: 'FOTOS COMEDORES' },
  { key: 'RECAMARAS',    id: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6', name: 'FOTOS RECAMARAS' },
  { key: 'AUXILIARES',   id: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8', name: 'FOTOS DE AUXILIARES' },
  { key: 'ACCESORIOS',   id: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9', name: 'FOTOS ACCESORIOS Y ESPEJOS' },
  { key: 'INTERIOR',     id: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9', name: 'FOTOS INTERIOR' }
];

function verifyExclusiveKevinOwner_(ss, body) {
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (authCheck && authCheck.error) || 'Sesión requerida. Inicia sesión con kevin.reyna@grupoanipa.com.'
    };
  }
  const emailNorm = String(authCheck.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  if (emailNorm !== OWNER_FOTOS_EMAIL_) {
    return {
      ok: false,
      forbidden: true,
      error: 'Acceso exclusivo denegado: este módulo está autorizado únicamente para ' + OWNER_FOTOS_EMAIL_ + '.'
    };
  }
  return { ok: true, advisor: authCheck.advisor };
}

function normPlainFotoCat_(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCategoryDestFolderForProduct_(categoriaRaw, tipoRaw, nombreRaw) {
  const cat = normPlainFotoCat_(categoriaRaw);
  const tp = normPlainFotoCat_(tipoRaw);
  const nom = normPlainFotoCat_(nombreRaw);
  const nomHead = nom.split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
  const text = (tp + ' ' + nom + ' ' + cat).trim();
  const byKey = (k) => CATEGORIAS_DEST_FOLDERS_.find((f) => f.key === k) || CATEGORIAS_DEST_FOLDERS_[CATEGORIAS_DEST_FOLDERS_.length - 1];

  if (/\bFUTON|\bFUTTON|SOFA\s*CAMA/.test(text)) return byKey('SOFA_CAMA');
  if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(text) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL|\bAUXILIAR/.test(text))) {
    return byKey('MESA_LATERAL');
  }
  if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRAL|\bNIDO\b/.test(text) || cat === 'MESAS DE CENTRO & LATERALES') {
    return byKey('MESA_CENTRO');
  }
  if (/\bSILLAS?\b/.test(nomHead) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('COMEDORES');
  }
  if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA)\b/.test(nomHead) && !/\bSILLAS?\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('SILLONES');
  }
  if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tp + ' ' + nom)) {
    return byKey('SILLONES');
  }
  if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tp + ' ' + nom)) {
    return byKey('SALAS');
  }
  if (
    cat === 'OFICINA' ||
    cat === 'EXTERIOR & TERRAZA' ||
    /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tp + ' ' + nom)
  ) {
    return byKey('AUXILIARES');
  }
  if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tp + ' ' + nom)) {
    return byKey('COMEDORES');
  }
  if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tp + ' ' + nom)) {
    return byKey('RECAMARAS');
  }
  if (
    cat === 'ACCESORIOS DECORATIVOS' ||
    cat === 'COJINES & TEXTILES' ||
    cat === 'ESPEJOS & ARTE' ||
    cat === 'ILUMINACION' ||
    /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tp + ' ' + nom)
  ) {
    return byKey('ACCESORIOS');
  }
  if (
    cat === 'BUFETERAS & CREDENZAS' ||
    cat === 'COMPLEMENTOS' ||
    /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tp + ' ' + nom)
  ) {
    return byKey('AUXILIARES');
  }
  return byKey('INTERIOR');
}

function resolveSubirInboxFolders_() {
  const folders = [];
  const folderIdsMap = {};
  let primaryFolder = null;

  function addFolderSafe(folderObj) {
    if (!folderObj) return;
    try {
      const fid = String(folderObj.getId() || '').trim();
      if (!fid || folderIdsMap[fid]) return;
      folderIdsMap[fid] = true;
      folders.push(folderObj);
      if (!primaryFolder) primaryFolder = folderObj;
    } catch (eAddF) {}
  }

  try {
    const baseSubir = DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
    addFolderSafe(baseSubir);
    try {
      const pIt = baseSubir.getParents();
      while (pIt.hasNext()) {
        const parentF = pIt.next();
        const sibIt = parentF.getFolders();
        while (sibIt.hasNext()) {
          const sib = sibIt.next();
          if (sib.isTrashed()) continue;
          const sName = normPlainFotoCat_(sib.getName());
          if (sName === 'SUBIR COTIZACION' || sName === 'SUBIR') {
            addFolderSafe(sib);
            if (sName === 'SUBIR COTIZACION') primaryFolder = sib;
          }
        }
      }
    } catch (eParents) {}
  } catch (eBase) {}

  try {
    const props = PropertiesService.getScriptProperties();
    const cachedCotId = String((props && props.getProperty('SUBIR_COTIZACION_FOLDER_ID_V1')) || '').trim();
    let foundCached = false;
    if (cachedCotId) {
      try {
        const cf = DriveApp.getFolderById(cachedCotId);
        if (cf && !cf.isTrashed()) {
          addFolderSafe(cf);
          primaryFolder = cf;
          foundCached = true;
        }
      } catch (eCacheMiss) {}
    }
    if (!foundCached) {
      const searchNames = ['SUBIR COTIZACION', 'SUBIR COTIZACIÓN'];
      for (let s = 0; s < searchNames.length; s++) {
        const fIt = DriveApp.getFoldersByName(searchNames[s]);
        while (fIt.hasNext()) {
          const cand = fIt.next();
          if (cand.isTrashed()) continue;
          addFolderSafe(cand);
          primaryFolder = cand;
          try {
            if (props) props.setProperty('SUBIR_COTIZACION_FOLDER_ID_V1', cand.getId());
          } catch (eSaveProp) {}
          break;
        }
      }
    }
  } catch (eSearchCot) {}

  const rootCount = folders.length;
  for (let i = 0; i < rootCount; i++) {
    try {
      const subIt = folders[i].getFolders();
      while (subIt.hasNext()) {
        const sub = subIt.next();
        if (!sub.isTrashed()) addFolderSafe(sub);
      }
    } catch (eSub) {}
  }

  return {
    primaryFolder: primaryFolder,
    folders: folders,
    folderIdsMap: folderIdsMap
  };
}

function listSubirInboxFilesInternal_(opts) {
  const includeThumbs = !!(opts && opts.includeThumbs);
  const resolved = resolveSubirInboxFolders_();
  const inboxFolders = resolved.folders || [];
  const seenFileIds = {};
  const rawItems = [];

  for (let fIdx = 0; fIdx < inboxFolders.length; fIdx++) {
    const folder = inboxFolders[fIdx];
    let it = null;
    try {
      it = folder.getFiles();
    } catch (eIt) {
      continue;
    }
    while (it && it.hasNext()) {
      let f = it.next();
      try {
        if (!f || f.isTrashed()) continue;
        let mime = String(f.getMimeType() || '').toLowerCase();
        if (mime === 'application/vnd.google-apps.shortcut') {
          try {
            const targetId = f.getTargetId && f.getTargetId();
            if (targetId) {
              const targetFile = DriveApp.getFileById(targetId);
              if (targetFile && !targetFile.isTrashed()) {
                f = targetFile;
                mime = String(f.getMimeType() || '').toLowerCase();
              }
            }
          } catch (eSc) {}
        }
        const fid = String(f.getId() || '').trim();
        if (!fid || seenFileIds[fid]) continue;
        const name = String(f.getName() || '').trim();
        const isImg = mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/i.test(name);
        if (!isImg) continue;
        seenFileIds[fid] = true;
        const updated = f.getLastUpdated();
        rawItems.push({
          fileObj: f,
          id: fid,
          name: name,
          mimeType: mime.indexOf('image/') === 0 ? mime : 'image/jpeg',
          sizeBytes: Number(f.getSize() || 0) || 0,
          updatedAt: updated ? updated.toISOString() : ''
        });
      } catch (eItem) {}
    }
  }

  rawItems.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const files = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const f = item.fileObj;
    let thumbDataUrl = '';
    if (includeThumbs && i < 16) {
      try {
        const tb = f.getThumbnail();
        if (tb) {
          const ct = String(tb.getContentType() || 'image/png');
          thumbDataUrl = 'data:' + ct + ';base64,' + Utilities.base64Encode(tb.getBytes());
        }
      } catch (eTb) {}
    }
    files.push({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      updatedAt: item.updatedAt,
      viewUrl: 'https://drive.google.com/file/d/' + item.id + '/view?usp=sharing',
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + item.id + '=w800',
      thumbDataUrl: thumbDataUrl
    });
  }
  return files;
}

function sincronizarSkusHoja1DesdeInventario_(ss, flushNow) {
  const book = ss || getSpreadsheet_();
  const sh1 = book.getSheetByName('1');
  const shInv = book.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  if (!sh1 || !shInv || shInv.getLastRow() < 3) {
    return { ok: false, added: 0, totalHoja1: 0 };
  }

  const maxRows1 = Math.max(3, sh1.getLastRow());
  const vals1 = sh1.getRange(1, 1, maxRows1, 1).getDisplayValues();
  const existingSet = {};
  let lastSkuRowInColA = 2; // Jamás tocar Fila 1 (encabezados) ni Fila 2 (ARRAYFORMULA B2, C2, E2, F2)
  let totalExisting = 0;

  for (let i = 2; i < vals1.length; i++) {
    const sk = String((vals1[i] && vals1[i][0]) || '').trim().toUpperCase();
    if (sk && sk !== 'SKU') {
      lastSkuRowInColA = i + 1;
      if (!existingSet[sk]) {
        existingSet[sk] = true;
        totalExisting++;
      }
    }
  }

  const invRows = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1).getDisplayValues();
  const toAppend = [];
  for (let j = 0; j < invRows.length; j++) {
    const raw = String((invRows[j] && invRows[j][0]) || '').trim();
    const sk = raw.toUpperCase();
    if (!sk || sk === 'SKU') continue;
    if (!existingSet[sk]) {
      existingSet[sk] = true;
      toAppend.push([sk]);
    }
  }

  if (toAppend.length > 0) {
    const startRow = Math.max(3, lastSkuRowInColA + 1);
    const endRow = startRow + toAppend.length - 1;
    if (sh1.getMaxRows() < endRow) {
      sh1.insertRowsAfter(sh1.getMaxRows(), endRow - sh1.getMaxRows());
    }
    const writeRng = sh1.getRange(startRow, 1, toAppend.length, 1);
    writeRng.setNumberFormat('@');
    writeRng.setValues(toAppend);
    if (flushNow) SpreadsheetApp.flush();
  }

  return {
    ok: true,
    added: toAppend.length,
    totalHoja1: totalExisting + toAppend.length
  };
}

function handleFotosSubirList_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  let pendingDeletesProcessed = false;
  if (body && body.pendingDeletes && typeof body.pendingDeletes === 'object') {
    try {
      const pd = body.pendingDeletes;
      const pSkus = Array.isArray(pd.skus) ? pd.skus : [];
      const pFiles = Array.isArray(pd.fileIds) ? pd.fileIds : [];
      for (let i = 0; i < pSkus.length; i++) {
        if (pSkus[i]) handleFotosDelete_(Object.assign({}, body, { sku: pSkus[i], skipListReturn: true }));
      }
      for (let j = 0; j < pFiles.length; j++) {
        if (pFiles[j]) handleFotosDelete_(Object.assign({}, body, { driveFileId: pFiles[j], source: 'INBOX', skipListReturn: true }));
      }
      pendingDeletesProcessed = true;
    } catch (ePend) {}
  }

  let skuSync = { added: 0, totalHoja1: 0 };
  if (body && body.syncSkus) {
    try {
      skuSync = sincronizarSkusHoja1DesdeInventario_(ss, false) || skuSync;
    } catch (eSync1) {}
  }

  const resolved = resolveSubirInboxFolders_();
  const primaryId = (resolved.primaryFolder && resolved.primaryFolder.getId()) || SUBIR_INBOX_FOLDER_ID_;
  const files = listSubirInboxFilesInternal_({ includeThumbs: !!(body && body.includeThumbs) });
  return {
    ok: true,
    pendingDeletesProcessed: pendingDeletesProcessed,
    inboxFolderId: primaryId,
    inboxFolderUrl: 'https://drive.google.com/drive/folders/' + primaryId,
    destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destFolders: CATEGORIAS_DEST_FOLDERS_,
    hoja1SkusAdded: skuSync.added || 0,
    hoja1TotalSkus: skuSync.totalHoja1 || 0,
    files: files
  };
}

function handleFotosSyncSkus_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  // Si se proporcionó un SKU puntual recién dado de alta en S Mueblería ERP (aún con 0 stock), consultarlo directo por WCF
  const querySku = String((body && body.querySku) || '').trim().toUpperCase();
  let directErpFound = null;
  if (querySku && querySku.length >= 3) {
    try {
      const wcfProd = buscarProductoPorClaveWcf_(querySku);
      if (wcfProd && wcfProd.IdProducto && String(wcfProd.Clave || '').trim().toUpperCase() === querySku) {
        directErpFound = wcfProd;
        const shPl = ss.getSheetByName('plantilla');
        if (shPl && shPl.getLastColumn() >= 34) {
          const aeVals = shPl.getRange(2, 31, Math.max(1, shPl.getLastRow() - 1), 1).getDisplayValues();
          let existsInPl = false;
          let lastAe = 1;
          for (let i = 0; i < aeVals.length; i++) {
            const cSk = String(aeVals[i][0] || '').trim().toUpperCase();
            if (cSk) {
              lastAe = i + 2;
              if (cSk === querySku) { existsInPl = true; break; }
            }
          }
          if (!existsInPl) {
            const nextAe = lastAe + 1;
            if (shPl.getMaxRows() < nextAe) shPl.insertRowsAfter(shPl.getMaxRows(), nextAe - shPl.getMaxRows());
            shPl.getRange(nextAe, 31, 1, 1).setNumberFormat('@');
            shPl.getRange(nextAe, 31, 1, 4).setValues([[
              querySku,
              String(wcfProd.IdProducto).trim(),
              cleanInvCell_(wcfProd.Nombre) || querySku,
              Number(wcfProd.Precio || 0) || ''
            ]]);
          }
        }
      }
    } catch (eDirectWcf) {}
  }

  let erpSyncRes = { ok: false, newSkusAdded: 0, hoja1SkusAdded: 0 };
  try {
    erpSyncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true }) || erpSyncRes;
  } catch (eErp) {}

  const hoja1Res = sincronizarSkusHoja1DesdeInventario_(ss, true);
  const totalAddedHoja1 = ((erpSyncRes && erpSyncRes.hoja1SkusAdded) || 0) + ((hoja1Res && hoja1Res.added) || 0);

  if (totalAddedHoja1 > 0 || (erpSyncRes && erpSyncRes.newSkusAdded > 0)) {
    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SINCRONIZACIÓN DE SKUS EN HOJA "1"',
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: '+' + totalAddedHoja1 + ' en Hoja "1"',
        detalle: 'SKUs sincronizados desde S Mueblería ERP / INVENTARIO_EN_VIVO hacia Hoja "1" (total: ' + (hoja1Res.totalHoja1 || 0) + ').',
        analisis: 'Fórmulas maestras B2:F2 y F2 intactas.'
      });
    } catch (eHist) {}
  }

  return {
    ok: true,
    erpSynced: !!(erpSyncRes && erpSyncRes.ok),
    invAdded: (erpSyncRes && erpSyncRes.newSkusAdded) || 0,
    hoja1Added: totalAddedHoja1,
    totalHoja1: (hoja1Res && hoja1Res.totalHoja1) || 0,
    directErpSku: directErpFound ? String(directErpFound.Clave || '').toUpperCase() : '',
    timestamp: formatCancunNow_()
  };
}

function handleFotosSubirUploadInbox_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;

    const dataUrl = String((body && body.dataUrl) || '');
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) {
      return { ok: false, error: 'Formato de imagen inválido.' };
    }
    const mime = m[1];
    const base64Body = m[2];
    const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
    const rawName = String((body && body.fileName) || ('foto-' + Date.now() + '.' + ext)).replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const finalName = /\.[a-z0-9]{2,5}$/i.test(rawName) ? rawName : (rawName + '.' + ext);
    const bytes = Utilities.base64Decode(base64Body);
    const blob = Utilities.newBlob(bytes, mime, finalName);

    const resolved = resolveSubirInboxFolders_();
    const inbox = resolved.primaryFolder || DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
    const created = inbox.createFile(blob);
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eSh) {}
    const fid = created.getId();
    return {
      ok: true,
      file: {
        id: fid,
        name: created.getName(),
        mimeType: mime,
        sizeBytes: Number(created.getSize() || 0) || 0,
        updatedAt: new Date().toISOString(),
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + fid + '=w800'
      },
      files: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_()
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleFotosSubirAssign_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    const driveFileId = String((body && body.driveFileId) || '').trim();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    if (!driveFileId) {
      return { ok: false, error: 'Selecciona primero una fotografía.' };
    }

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    const reqFolderId = String((body && body.targetFolderId) || '').trim();
    let destMeta = CATEGORIAS_DEST_FOLDERS_.find((f) => f.id === reqFolderId) || null;
    const providedName = String((body && body.productName) || '').trim();

    let invMeta = {
      nombre: providedName,
      tipo: String((body && body.tipo) || '').trim(),
      categoria: String((body && body.categoria) || '').trim()
    };

    if (!destMeta || !invMeta.nombre) {
      try {
        const shInv = ss.getSheetByName('INVENTARIO_EN_VIVO');
        if (shInv && shInv.getLastRow() >= 3) {
          const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
          for (let i = 0; i < invVals.length; i++) {
            const sk = cleanInvCell_(invVals[i][0]).toUpperCase();
            if (sk === skuUpper) {
              invMeta = {
                tipo: cleanInvCell_(invVals[i][1]) || invMeta.tipo,
                nombre: cleanInvCell_(invVals[i][3]) || invMeta.nombre,
                categoria: cleanInvCell_(invVals[i][6]) || invMeta.categoria
              };
              break;
            }
          }
        }
      } catch (eInvMeta) {}
    }

    if (!destMeta) {
      destMeta = resolveCategoryDestFolderForProduct_(
        invMeta.categoria,
        invMeta.tipo,
        invMeta.nombre
      );
    }
    const destFolder = DriveApp.getFolderById(destMeta.id);

    // Localizar fila(s) del SKU en la hoja "1" (respetando Fila 1 encabezados y Fila 2 ARRAYFORMULA)
    const maxScanRows = Math.max(sh1.getLastRow(), 3);
    const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();
    const matchedRows = [];
    let lastSkuRowInColA = 2; // Nunca escribir en fila 1 ni fila 2 (fórmulas maestras)
    let sheetProductName = '';
    let previousUrl = '';
    let isUsedByOtherSku = false;

    for (let i = 2; i < vals1.length; i++) {
      const rowNum = i + 1;
      const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
      const cellUrl = String(vals1[i][3] || '').trim();
      if (cellSku) {
        lastSkuRowInColA = rowNum;
        if (cellSku === skuUpper) {
          matchedRows.push(rowNum);
          if (!sheetProductName && vals1[i][1]) sheetProductName = String(vals1[i][1]).trim();
          if (!previousUrl && cellUrl) previousUrl = cellUrl;
        } else if (cellUrl && cellUrl.indexOf(driveFileId) !== -1) {
          isUsedByOtherSku = true;
        }
      }
    }

    const effectiveName = sheetProductName || invMeta.nombre || providedName || skuUpper;

    const srcFile = DriveApp.getFileById(driveFileId);
    const origName = String(srcFile.getName() || '').trim();
    const extMatch = origName.match(/(\.[a-zA-Z0-9]{2,5})$/);
    const mimeLower = String(srcFile.getMimeType() || '').toLowerCase();
    const fallbackExt = mimeLower.indexOf('png') !== -1 ? '.png' : (mimeLower.indexOf('webp') !== -1 ? '.webp' : '.jpg');
    const ext = extMatch ? extMatch[1].toLowerCase() : fallbackExt;

    const cleanNamePart = effectiveName
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    const cleanSkuPart = skuUpper.replace(/[\\/:*?"<>|]+/g, '').trim();
    const newFileName = cleanNamePart && cleanNamePart.toUpperCase() !== cleanSkuPart
      ? (cleanSkuPart + ' - ' + cleanNamePart + ext)
      : (cleanSkuPart + ext);

    let file = srcFile;
    const reuseFromLoaded = isUsedByOtherSku || !!(body && body.fromLoaded);

    if (reuseFromLoaded) {
      // Si se toma una foto que ya está cargada en otro SKU, crear copia limpia en la carpeta destino para no afectar al otro SKU
      try {
        file = srcFile.makeCopy(newFileName, destFolder);
      } catch (eCopyLoaded) {
        file = srcFile;
      }
    } else {
      file.setName(newFileName);
      file.moveTo(destFolder); // Saca la foto de SUBIR COTIZACION y la coloca en su carpeta de categoría
      try {
        const resolvedInbox = resolveSubirInboxFolders_();
        const inboxMap = resolvedInbox.folderIdsMap || {};
        inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
        const parentsIt = file.getParents();
        while (parentsIt.hasNext()) {
          const pf = parentsIt.next();
          if (inboxMap[pf.getId()] && pf.getId() !== destFolder.getId()) {
            pf.removeFile(file);
          }
        }
      } catch (eCleanParents) {}
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {}

    try {
      file.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + effectiveName +
        ' | Categoría Drive: ' + destMeta.name +
        ' | Asignado por: ' + OWNER_FOTOS_EMAIL_ +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = file.getId();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Escribir URL en Columna D de la hoja "1" sin tocar jamás las fórmulas de Fila 2 (B2, C2, E2, F2)
    let primaryRowNumber = 0;
    let wasAppended = false;
    if (matchedRows.length > 0) {
      primaryRowNumber = matchedRows[0];
      for (let m = 0; m < matchedRows.length; m++) {
        sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
      }
    } else {
      wasAppended = true;
      primaryRowNumber = Math.max(3, lastSkuRowInColA + 1);
      if (primaryRowNumber > sh1.getMaxRows()) {
        sh1.insertRowAfter(sh1.getMaxRows());
      }
      // Solo escribir Columna A (SKU) y Columna D (LINK FOTO APP) para que B2 y C2 calculen solos
      sh1.getRange(primaryRowNumber, 1).setValue(skuUpper);
      sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
    }

    SpreadsheetApp.flush();
    let formulaResolvedName = effectiveName;
    if (wasAppended) {
      try {
        const bVal = String(sh1.getRange(primaryRowNumber, 2).getDisplayValue() || '').trim();
        if (bVal) formulaResolvedName = bVal;
      } catch (eReadB) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: reuseFromLoaded
          ? 'FOTO TOMADA DE CARGADAS Y ASIGNADA EN HOJA "1"'
          : (wasAppended ? 'NUEVO SKU + FOTO ASIGNADA DESDE SUBIR' : 'FOTO ACTUALIZADA EN HOJA "1" DESDE SUBIR'),
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: (reuseFromLoaded ? 'Tomada de fotos cargadas hacia "' : 'Movida de SUBIR COTIZACION a "') + destMeta.name + '" como "' + newFileName + '" · Guardada en Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto en Columna D.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      sku: skuUpper,
      productName: formulaResolvedName,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      reusedLoaded: reuseFromLoaded,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: newFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      remainingFiles: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
  } catch (errAssign) {
    try {
      registrarEventoHistorial_(getSpreadsheet_(), {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · handleFotosSubirAssign_',
        evento: 'ERROR AL ASIGNAR FOTO DESDE SUBIR A HOJA "1"',
        estado: '❌ ERROR',
        usuario: OWNER_FOTOS_EMAIL_,
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: String((body && body.sku) || ''),
        detalle: (errAssign && errAssign.message) ? errAssign.message : String(errAssign),
        analisis: analizarCausaFalloCodigo_(errAssign, 'AppsScript · handleFotosSubirAssign_', 'fotos_subir_assign')
      });
    } catch (eLogIgnore) {}
    return {
      ok: false,
      error: (errAssign && errAssign.message) ? errAssign.message : String(errAssign)
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleFotosDelete_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    let driveFileId = String((body && body.driveFileId) || '').trim();
    const source = String((body && body.source) || '').trim().toUpperCase();
    const keepDriveFile = !!(body && body.keepDriveFile);
    const forceTrash = !!(body && body.forceTrash);

    if (!skuUpper && !driveFileId) {
      return { ok: false, error: 'Falta indicar SKU o ID de archivo a borrar.' };
    }

    const sh1 = ss.getSheetByName('1');
    const clearedRows = [];
    let previousUrl = '';
    let usedByOtherSku = false;

    if (sh1 && sh1.getLastRow() >= 3) {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();

      // Primera pasada: limpiar Columna D del SKU indicado (jamás tocar filas 1 y 2)
      if (skuUpper) {
        for (let i = 2; i < vals1.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
          const cellUrl = String(vals1[i][3] || '').trim();
          if (cellSku === skuUpper) {
            if (cellUrl) {
              if (!previousUrl) previousUrl = cellUrl;
              if (!driveFileId) {
                const mId = cellUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || cellUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
                if (mId && mId[1]) driveFileId = mId[1];
              }
              sh1.getRange(rowNum, 4).clearContent();
              clearedRows.push(rowNum);
              vals1[i][3] = '';
            }
          }
        }
      }

      // Segunda pasada: verificar si otro SKU en Hoja "1" sigue usando ese driveFileId
      if (driveFileId) {
        for (let j = 2; j < vals1.length; j++) {
          const otherSku = String(vals1[j][0] || '').trim().toUpperCase();
          const otherUrl = String(vals1[j][3] || '').trim();
          if (otherUrl && otherUrl.indexOf(driveFileId) !== -1 && (!skuUpper || otherSku !== skuUpper)) {
            usedByOtherSku = true;
            break;
          }
        }
      }
    }

    if (clearedRows.length > 0) {
      SpreadsheetApp.flush();
    }

    let driveTrashed = false;
    let deletedFileName = '';
    if (driveFileId && !keepDriveFile && (source === 'INBOX' || forceTrash || !usedByOtherSku)) {
      try {
        const f = DriveApp.getFileById(driveFileId);
        deletedFileName = String(f.getName() || '');
        try {
          f.setTrashed(true);
          driveTrashed = true;
        } catch (eTrash) {
          // Si el archivo pertenece a otro propietario en carpeta compartida, quitarlo de las carpetas padre
          const pIt = f.getParents();
          while (pIt.hasNext()) {
            try {
              pIt.next().removeFile(f);
              driveTrashed = true;
            } catch (eRemP) {}
          }
        }
      } catch (eGetFile) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: skuUpper ? 'FOTO BORRADA DE HOJA "1" (COLUMNA D)' : 'FOTO BORRADA DE SUBIR COTIZACION',
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper ? (skuUpper + (clearedRows.length ? (' · Fila ' + clearedRows.join(',')) : '')) : (deletedFileName || driveFileId),
        detalle: (skuUpper ? ('Limpiada Columna D en Hoja "1" para SKU ' + skuUpper + (previousUrl ? (' (' + previousUrl + ')') : '')) : ('Eliminado archivo Drive ' + (deletedFileName || driveFileId))) + (driveTrashed ? ' · Archivo enviado a papelera Drive.' : ''),
        analisis: 'Fórmulas maestras B2:F2 intactas.'
      });
    } catch (eHistDel) {}

    return {
      ok: true,
      clearedSku: skuUpper,
      clearedRows: clearedRows,
      deletedFileId: driveFileId,
      deletedFileName: deletedFileName,
      driveTrashed: driveTrashed,
      usedByOtherSku: usedByOtherSku,
      remainingFiles: (body && body.skipListReturn) ? [] : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
  } catch (errDel) {
    return {
      ok: false,
      error: (errDel && errDel.message) ? errDel.message : String(errDel)
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================================
// MOTOR EXCLUSIVO DE AUDITORÍA DE MOVIMIENTOS Y ANÁLISIS DE FALLOS DE CÓDIGO
// ÚNICAMENTE EN LA HOJA "HISTORIAL" (CERO PESTAÑAS ADICIONALES DE BITÁCORA)
// ============================================================================
function analizarCausaFalloCodigo_(errOrMsg, modulo, evento) {
  const raw = String((errOrMsg && (errOrMsg.stack || errOrMsg.message)) || errOrMsg || '').trim();
  const up = raw.toUpperCase();

  if (/TOKEN|JWT|401|UNAUTHORIZED|CLAVESERVICIO|SESION|LOGIN\.ASPX/.test(up)) {
    return 'Token JWT o cookie de sesión ERP S Mueblería expirada en .erp_session_cache.json; se activa respaldo de renovación o cola en plantilla!K5.';
  }
  if (/FAULT|SOAP|SMUEBLERIASERVICE|INSERTARCOTIZACION|INSERTARCLIENTE|INSERTARLEAD/.test(up)) {
    return 'Excepción WCF SOAP 1.2 devuelta por sistema.smuebleria.com en ' + (modulo || 'servicio ERP') + '; revisar formato XML de parámetros o disponibilidad del servidor ERP.';
  }
  if (/SKU.*NO EXISTE|IDPRODUCTO|BUSCARPRODUCTO/.test(up)) {
    return 'El SKU solicitado aún no tiene IdProducto activo en el catálogo maestro de S Mueblería; dar de alta primero en ERP.';
  }
  if (/DESCUENTO|SUPER.*M[ÁA]XIMO/.test(up)) {
    return 'Regla de negocio aplicada: el porcentaje capturado excedía el tope autorizado para el puesto del usuario (30% Asesor vigente hasta 30/11/2026; 24% desde 01/12/2026; 100% Gerente/Admin).';
  }
  if (/DRIVE|FOLDER|PERMISSION|ACCESO DENEGADO/.test(up)) {
    return 'Permiso o identificador de carpeta en Google Drive no accesible por el propietario del Apps Script; verificar acceso sobre carpeta FOTOS NUEVAS CARGADO (1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9).';
  }
  if (/TIMEOUT|TIMED OUT|DEADLINE|LOCK|WAITLOCK/.test(up)) {
    return 'Tiempo de espera agotado por concurrencia de LockService o latencia de red externa; reintentar operación.';
  }
  if (/TYPEERROR|REFERENCEERROR|SYNTAXERROR|CANNOT READ/.test(up)) {
    return 'Excepción de código en tiempo de ejecución (' + (modulo || 'JS/AppsScript') + '): ' + raw.slice(0, 260);
  }
  return raw ? ('Diagnóstico automático (' + (modulo || 'Sistema') + ' · ' + (evento || 'Evento') + '): ' + raw.slice(0, 260)) : 'Operación auditada en hoja HISTORIAL.';
}

function ensureHistorialSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = book.getSheetByName(TAB_HISTORIAL_);
  if (!sh) {
    sh = book.insertSheet(TAB_HISTORIAL_);
  }
  if (sh.getLastRow() < 6) {
    const hdrRow6 = [[
      'FECHA Y HORA',
      'CLASIFICACIÓN',
      'MÓDULO / ARCHIVO',
      'EVENTO / MOVIMIENTO',
      'ESTADO',
      'USUARIO / QUIÉN FUE',
      'SUCURSAL / ÁREA',
      'PRODUCTO / FOLIO / REF.',
      'DETALLE DEL MOVIMIENTO O FALLO',
      'ANÁLISIS TÉCNICO DEL CÓDIGO / CAUSA Y SOLUCIÓN'
    ]];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1).setValue('CENTRO DE ANÁLISIS DE FALLOS DE CÓDIGO Y MOVIMIENTOS DEL SISTEMA — CREATA MUEBLES (EXCLUSIVO HOJA HISTORIAL)');
      sh.getRange(2, 1, 1, 10).setValues([[
        'TOTAL REGISTROS', '=COUNTA(A7:A5000)',
        'MOVIMIENTOS OK', '=COUNTIF(B7:B5000,"MOVIMIENTO")',
        'FALLOS DE CÓDIGO / ERP', '=COUNTIF(B7:B5000,"FALLO DE CÓDIGO")',
        'ALERTAS TÉCNICAS', '=COUNTIF(B7:B5000,"ALERTA TÉCNICA")',
        'COTIZACIONES / FOTOS', '=COUNTIF(D7:D5000,"*COTIZACIÓN*")&" cot. · "&COUNTIF(D7:D5000,"*FOTO*")&" fotos"'
      ]]);
      sh.getRange(4, 1).setValue('Regla activa: Todo fallo de código y todo movimiento operativo del sistema se analiza y registra exclusivamente en esta pestaña HISTORIAL.');
    }
    sh.getRange(6, 1, 1, 10).setValues(hdrRow6);
    sh.getRange(6, 1, 1, 10)
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(6);
  }
  return sh;
}

function registrarEventoHistorial_(ss, opts) {
  try {
    if (!opts) return false;
    const book = ss || getSpreadsheet_();
    const sh = ensureHistorialSheet_(book);
    const fechaHora = String(opts.fechaHora || formatCancunNow_());
    const clasificacion = String(opts.clasificacion || 'MOVIMIENTO').trim();
    const modulo = String(opts.modulo || 'AppsScript').trim();
    const evento = String(opts.evento || 'MOVIMIENTO SISTEMA').trim();
    const estado = String(opts.estado || '✅ OK').trim();
    const usuario = String(opts.usuario || 'Sistema Automático').trim();
    const sucursal = String(opts.sucursal || 'GENERAL').trim();
    const referencia = String(opts.referencia || '—').trim();
    const detalle = String(opts.detalle || '').trim().slice(0, 1000);
    const analisis = String(opts.analisis || analizarCausaFalloCodigo_(detalle, modulo, evento)).trim().slice(0, 1000);

    const nextRow = Math.max(7, sh.getLastRow() + 1);
    sh.getRange(nextRow, 1, 1, 10).setValues([[
      fechaHora,
      clasificacion,
      modulo,
      evento,
      estado,
      usuario,
      sucursal,
      referencia,
      detalle,
      analisis
    ]]);
    return true;
  } catch (eHist) {
    Logger.log('Aviso HISTORIAL: ' + eHist);
    return false;
  }
}

function handleInvLogEvent_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const clasif = String(b.classification || 'FALLO DE CÓDIGO').trim().toUpperCase();
  const mod = String(b.module || 'inventario-app.js').trim();
  const ev = String(b.event || 'EVENTO CLIENTE WEB').trim();
  const det = String(b.detail || '').trim();
  const ana = String(b.analysis || '').trim() || analizarCausaFalloCodigo_(det, mod, ev);

  const ok = registrarEventoHistorial_(ss, {
    clasificacion: (clasif === 'MOVIMIENTO' || clasif === 'ALERTA TÉCNICA' || clasif === 'FALLO DE CÓDIGO') ? clasif : 'FALLO DE CÓDIGO',
    modulo: mod,
    evento: ev,
    estado: String(b.status || (clasif === 'MOVIMIENTO' ? '✅ OK' : '❌ ERROR')).trim(),
    usuario: String(b.user || 'Cliente Web').trim(),
    sucursal: String(b.branch || 'INVENTARIO WEB').trim(),
    referencia: String(b.ref || '—').trim(),
    detalle: det,
    analisis: ana
  });
  return { ok: ok, sheetName: TAB_HISTORIAL_ };
}

// ============================================================================
// PUENTE EN VIVO CON SEGUIMIENTO DE COTIZACIONES (COTIZACIONES BASE DE DATOS)
// ============================================================================
const SPREADSHEET_SEGUIMIENTO_ID_ = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

function getSpreadsheetSeguimiento_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_SEGUIMIENTO_ID_);
  } catch (e) {
    return null;
  }
}

function mapErpStoreToSeguimientoBranch_(rawStoreOrTab, folio) {
  const s = String(rawStoreOrTab || '').trim().toUpperCase();
  const f = String(folio || '').trim().toUpperCase();
  if (s.indexOf('PROYECTO') >= 0 || f.indexOf('PROY-') === 0) return 'PROYECTOS';
  if (s.indexOf('CASA CREATA') >= 0 || f.indexOf('CC-') === 0) return 'CASA CREATA';
  if (s.indexOf('PLAYA') >= 0 || f.indexOf('PC-') === 0) return 'PLAYA';
  if (s.indexOf('COLOSIO') >= 0 || s.indexOf('COLOCIO') >= 0 || f.indexOf('CO-') === 0 || f.indexOf('OC-') === 0) return 'COLOSIO';
  if (s.indexOf('PTC') >= 0 || s.indexOf('PUERTO') >= 0 || f.indexOf('CA-') === 0) return 'PTC';
  return 'PTC';
}

function sincronizarPasswordEnHojaSeguimiento_(email, newKey) {
  try {
    const em = String(email || '').trim().toLowerCase();
    const nk = String(newKey || '').trim();
    if (!em || !nk) return;
    const ssSeg = getSpreadsheetSeguimiento_();
    if (!ssSeg) return;
    const tabs = ['PLAYA', 'COLOCIO', 'COLOSIO', 'PTC', 'CASA CREATA', 'PROYECTOS', 'INVITADOS'];
    for (let t = 0; t < tabs.length; t++) {
      const sh = ssSeg.getSheetByName(tabs[t]);
      if (!sh || sh.getLastRow() < 2) continue;
      const vals = sh.getRange(1, 1, sh.getLastRow(), Math.max(7, sh.getLastColumn())).getValues();
      for (let r = 0; r < vals.length; r++) {
        const rowEm = String(vals[r][4] || '').trim().toLowerCase();
        if (rowEm === em) {
          sh.getRange(r + 1, 6).clearContent();
          sh.getRange(r + 1, 7).setNumberFormat('@').setValue(nk);
        }
      }
    }
  } catch (eSegPwd) {}
}

function registrarCotizacionAppEnSeguimiento_(ssInv, info) {
  try {
    if (!info || !info.folio || !Array.isArray(info.partidas) || !info.partidas.length) return;
    const ssSeg = getSpreadsheetSeguimiento_();
    if (!ssSeg) return;
    const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
    if (!shCot) return;

    const folio = String(info.folio || '').trim().toUpperCase();
    const sucSeg = mapErpStoreToSeguimientoBranch_(info.erpStore || info.sheetTab, folio);
    const fechaStr = String(info.fechaStr || Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'));
    const advisorName = String(info.advisorName || '').trim();
    const advisorEmail = String(info.advisorEmail || '').trim().toLowerCase();
    const clientName = String(info.clientName || 'Prospecto CREATA').trim();
    const clientPhone = String(info.clientPhone || '').replace(/\D+/g, '');

    // Mapa rápido de existencias en INVENTARIO_EN_VIVO
    const invMap = {};
    try {
      const shInv = (ssInv || getSpreadsheet_()).getSheetByName(CONFIG.TAB_INVENTORY);
      if (shInv && shInv.getLastRow() >= 4) {
        const invRows = shInv.getRange(4, 1, shInv.getLastRow() - 3, 21).getValues();
        for (let i = 0; i < invRows.length; i++) {
          const r = invRows[i];
          const skuKey = String(r[1] || '').trim().toUpperCase();
          if (!skuKey) continue;
          invMap[skuKey] = {
            modelo: String(r[3] || '').trim(),
            cedis_bodega: Number(r[6]) || 0,
            cedis_piso: Number(r[7]) || 0,
            casa_bodega: Number(r[8]) || 0,
            casa_piso: Number(r[9]) || 0,
            colosio_bodega: (Number(r[10]) || 0) + (Number(r[12]) || 0),
            colosio_piso: (Number(r[11]) || 0) + (Number(r[13]) || 0),
            playa_bodega: Number(r[14]) || 0,
            playa_piso: Number(r[15]) || 0,
            ptc_bodega: Number(r[16]) || 0,
            ptc_piso: Number(r[17]) || 0
          };
        }
      }
    } catch (eInv) {}

    // Verificar partidas existentes para no duplicar ID_Partida
    const existingRowByPartida = {};
    const lastR = shCot.getLastRow();
    if (lastR >= 2) {
      const colA = shCot.getRange(2, 1, lastR - 1, 1).getValues();
      for (let i = 0; i < colA.length; i++) {
        const idP = String(colA[i][0] || '').trim().toUpperCase();
        if (idP) existingRowByPartida[idP] = i + 2;
      }
    }

    for (let p = 0; p < info.partidas.length; p++) {
      const pt = info.partidas[p] || {};
      const sku = String(pt.Clave || pt.sku || '').trim().toUpperCase();
      if (!sku) continue;
      const idPartida = folio + '_' + sku;
      const cant = Math.max(1, Number(pt.Cantidad || pt.qty || 1) || 1);
      const precio = Number(pt.PrecioUnitario || pt.PrecioOriginal || pt.price || 0) || 0;
      const nombreProd = String(pt.Nombre || pt.name || sku).trim();
      const st = invMap[sku] || null;

      let cb = 0, cp = 0, tb = 0, tp = 0, tot = 0;
      if (st) {
        cb = st.cedis_bodega;
        cp = st.cedis_piso;
        if (sucSeg === 'PLAYA') { tb = st.playa_bodega; tp = st.playa_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'COLOSIO') { tb = st.colosio_bodega; tp = st.colosio_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'PTC') { tb = st.ptc_bodega; tp = st.ptc_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'CASA CREATA') { tb = st.casa_bodega; tp = st.casa_piso; tot = cb + cp + tb + tp; }
        else {
          tb = st.casa_bodega + st.colosio_bodega + st.playa_bodega + st.ptc_bodega;
          tp = st.casa_piso + st.colosio_piso + st.playa_piso + st.ptc_piso;
          tot = cb + cp + tb + tp;
        }
      }

      let sem = '🟢 En Stock', prio = '4_NORMAL', acc = 'EN STOCK';
      if (tot <= 0 || tot < cant) {
        sem = '🔴 Agotado'; prio = '1_AGOTADO'; acc = 'SUGERIR CAMBIO';
      } else if (tot === 1 || tot === cant) {
        sem = '🔥 Última Pieza'; prio = '2_ULTIMA_PIEZA'; acc = 'URGENCIA DE CIERRE';
      } else if (tot <= 3) {
        sem = '🟠 Stock Bajo'; prio = '3_BAJA_DE_STOCK'; acc = 'AVISAR BAJA';
      }

      const rowValues = [
        idPartida,
        folio,
        fechaStr,
        sucSeg,
        advisorName,
        advisorEmail,
        '',
        clientName,
        clientPhone,
        sku,
        nombreProd,
        (st && st.modelo) || String(pt.model || ''),
        precio.toFixed(2),
        String(cant),
        String(Math.max(tot, cant)),
        String(cb),
        String(cp),
        String(tb),
        String(tp),
        String(tot),
        '0',
        prio,
        sem,
        acc,
        'Cotizado',
        ''
      ];

      const targetRow = existingRowByPartida[idPartida.toUpperCase()];
      if (targetRow) {
        shCot.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        shCot.appendRow(rowValues);
      }
    }
  } catch (eRegSeg) {
    Logger.log('Aviso registrarCotizacionAppEnSeguimiento_: ' + eRegSeg);
  }
}

function handleSegAction_(body) {
  const b = body || {};
  const sub = String(b.subAction || '').trim().toUpperCase();
  const folio = String(b.folio || '').trim().toUpperCase();
  const payload = b.payload || {};
  const ssInv = getSpreadsheet_();
  const ssSeg = getSpreadsheetSeguimiento_();
  const ahoraStr = Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd HH:mm:ss');

  // Siempre respaldar también en HISTORIAL de 1xew para sincronización cruzada inmediata
  registrarEventoHistorial_(ssInv, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'SEGUIMIENTO_COTIZACIONES',
    evento: sub || 'SEG_ACTION',
    estado: '✅ OK',
    usuario: String(payload.usuario || payload.asesor || payload.advisorName || 'Usuario Seguimiento'),
    sucursal: String(payload.sucursal || payload.erpStore || 'TODAS'),
    referencia: folio || 'SEGUIMIENTO',
    detalle: JSON.stringify(payload),
    analisis: 'Evento sincronizado en vivo desde Seguimiento de Cotizaciones.'
  });

  if (!ssSeg) return { ok: true, fallbackOnly: true };

  try {
    if (sub === 'SEG_NUEVA_COTIZACION_APP' && payload && Array.isArray(payload.items)) {
      registrarCotizacionAppEnSeguimiento_(ssInv, {
        folio: payload.folio || folio,
        fechaStr: payload.fecha || ahoraStr.slice(0, 10),
        sheetTab: payload.sheetTab,
        erpStore: payload.erpStore,
        advisorName: payload.advisorName,
        advisorEmail: payload.advisorEmail,
        clientName: payload.clientName,
        clientPhone: payload.clientPhone,
        partidas: payload.items
      });
    } else if (sub === 'SEG_CIERRE' && folio) {
      let shCierres = ssSeg.getSheetByName('CIERRES_COTIZACIONES');
      if (shCierres) {
        shCierres.appendRow([
          payload.fecha_hora || ahoraStr.slice(0, 16),
          folio,
          payload.sucursal || '',
          payload.asesor || '',
          payload.correo_asesor || '',
          payload.cliente || '',
          payload.whatsapp_cliente || '',
          payload.estatus || 'CERRADA',
          payload.motivo || '',
          payload.comentarios || ''
        ]);
      }
    } else if (sub === 'SEG_TELEFONO' && folio) {
      const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
      const cleanTel = String(payload.whatsapp_cliente || '').replace(/\D+/g, '');
      if (shCot && shCot.getLastRow() >= 2 && cleanTel) {
        const rows = shCot.getRange(2, 2, shCot.getLastRow() - 1, 1).getValues();
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim().toUpperCase() === folio) {
            shCot.getRange(i + 2, 9).setNumberFormat('@').setValue(cleanTel);
          }
        }
      }
    } else if (sub === 'SEG_WHATSAPP' && folio) {
      const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
      const fAviso = String(payload.fecha_aviso || ahoraStr.slice(0, 16));
      if (shCot && shCot.getLastRow() >= 2) {
        const rows = shCot.getRange(2, 2, shCot.getLastRow() - 1, 1).getValues();
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim().toUpperCase() === folio) {
            shCot.getRange(i + 2, 26).setValue(fAviso);
          }
        }
      }
    }

    const shHist = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
    if (shHist) {
      shHist.appendRow([
        ahoraStr,
        sub.replace(/^SEG_/, ''),
        payload.usuario || payload.asesor || '',
        payload.email || payload.correo_asesor || '',
        payload.sucursal || '',
        payload.accion || (sub + ' ' + folio),
        payload.detalle || JSON.stringify(payload),
        'Web-App',
        payload.status || 'EXITOSO'
      ]);
    }
  } catch (eSegAct) {
    Logger.log('Aviso handleSegAction_: ' + eSegAct);
  }

  return { ok: true };
}

