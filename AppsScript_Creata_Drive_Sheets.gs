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
      asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });
      const rawRows = shInv ? shInv.getDataRange().getValues() : [];
      const rows = rawRows.filter((r, idx) => idx === 0 || String((r && r[0]) || '').trim() !== '');
      return jsonResponse_({ ok: true, tab: CONFIG.TAB_INVENTORY, rows: rows });
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
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || '';

    // Acciones públicas exclusivas de inventario.html (autenticación de asesores y cotización en vivo S Mueblería)
    if (action === 'inv_login') {
      return jsonResponse_(handleInvLogin_(body));
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
    serieLabel: 'Acceso Total · Todas las Tiendas y Bodegas'
  }
];

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
  if (!sh || sh.getLastRow() < 2) return -1;
  const checkRows = Math.min(sh.getLastRow(), 4);
  const checkCols = Math.min(sh.getMaxColumns(), 6);
  if (checkCols < 5) return -1;
  const hdrVals = sh.getRange(1, 1, checkRows, checkCols).getDisplayValues();
  for (let r = 0; r < hdrVals.length; r++) {
    const cName = String(hdrVals[r][2] || '').trim();
    const cMail = String(hdrVals[r][4] || '').trim();
    if (/^CORREO/i.test(cMail) || /^NOMBRE/i.test(cName)) {
      return r + 1;
    }
  }
  return -1;
}

function readAllBranchUsers_(ss, erpAdvisors) {
  const list = [];
  for (let t = 0; t < INV_USER_TABS_.length; t++) {
    const cfg = INV_USER_TABS_[t];
    let sh = ss.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = ss.getSheetByName('COLOSIO');
    if (!sh) continue;
    const hdrRow = findUserHeaderRow1Based_(sh);
    if (hdrRow < 1 || sh.getLastRow() <= hdrRow) continue;

    const actualTabName = sh.getName();
    const startRow = hdrRow + 1;
    const numRows = sh.getLastRow() - hdrRow;
    const colsToRead = Math.min(sh.getMaxColumns(), 9); // A..I (H = Usuario/ID Asesor, I = Descuento)
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues();

    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      const dr = dispVals[i] || [];
      const nombre = String(r[2] || '').trim();
      const puesto = String(r[3] || '').trim();
      const correo = String(r[4] || '').trim().toLowerCase();
      if (!correo || correo.indexOf('@') === -1) continue;
      const tempKey = cleanSheetKeyCell_(r[5]);
      const defKey = cleanSheetKeyCell_(r[6]);
      const colH = colsToRead >= 8 ? String(dr[7] || r[7] || '').trim() : '';
      const colI = colsToRead >= 9 ? String(dr[8] !== '' ? dr[8] : (r[8] !== undefined ? r[8] : '')).trim() : '';

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
  const out = {
    sheetTab: u.sheetTab,
    rowNum: u.rowNum,
    isAdmin: !!u.isAdmin,
    maxDiscountPct: u.maxDiscountPct !== undefined ? u.maxDiscountPct : null,
    branchKey: u.branchKey,
    branchLabel: u.branchLabel,
    erpStore: u.erpStore,
    orderPrefix: u.orderPrefix || 'PTC',
    quoteType: u.quoteType || 'SUCURSAL',
    isProyecto: !!u.isProyecto,
    serieLabel: u.serieLabel || '',
    nombre: u.nombre,
    puesto: u.puesto,
    correo: u.correo,
    mustChangeKey: !!u.mustChangeKey,
    erpAdvisorLabel: u.erpAdvisorLabel || '',
    erpAdvisorId: u.erpAdvisorId || '',
    erpAdvisorBranch: u.erpAdvisorBranch || ''
  };
  if (includeSignedToken) {
    out.authToken = issueInvAuthToken_(u.correo, u.sheetTab);
  }
  return out;
}

function handleInvUsersDirectory_() {
  const ss = getSpreadsheet_();
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

function handleInvLogin_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const inputKey = String(body.accessKey || '').trim();
  const selectedTab = String(body.sheetTab || '').trim();
  if (!email || !inputKey) {
    return { ok: false, error: 'Ingresa tu correo y tu contraseña.' };
  }

  ensureLiveErpSyncTrigger_();
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const allUsers = readAllBranchUsers_(ss, erpMeta.advisors);
  const emailMatches = allUsers.filter((u) => u.correo === email);
  if (!emailMatches.length) {
    return { ok: false, error: 'El correo ingresado no está registrado en ninguna ubicación.' };
  }

  const validMatches = emailMatches.filter((u) => {
    if (u.defKey) {
      return keysEqualNormalized_(inputKey, u.defKey);
    }
    if (u.tempKey) {
      return keysEqualNormalized_(inputKey, u.tempKey);
    }
    return false;
  });

  if (!validMatches.length) {
    return { ok: false, error: 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.' };
  }

  // Emitir tokens firmados únicamente para las ubicaciones autorizadas de este correo
  const authorizedLocs = validMatches.map((u) => {
    const usedTemp = !u.defKey && !!u.tempKey && keysEqualNormalized_(inputKey, u.tempKey);
    const sanitized = sanitizeUserForClient_(u, true);
    sanitized.mustChangeKey = usedTemp;
    return sanitized;
  });

  const folioSnap = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);

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
    ? (authorizedLocs.find((u) => u.sheetTab.toUpperCase() === selectedTab.toUpperCase() || u.branchKey.toUpperCase() === selectedTab.toUpperCase()) || authorizedLocs[0])
    : authorizedLocs[0];

  const nextOrderCode = peekNextStoreErpFolio_(chosenOut.erpStore, chosenOut.orderPrefix, folioSnap);

  return {
    ok: true,
    chooseBranch: false,
    user: chosenOut,
    nextOrderCode: nextOrderCode,
    nextFolioByStore: folioSnap.nextFolioByStore,
    allLocationsForEmail: authorizedLocs,
    stores: erpMeta.stores,
    advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id }))
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
    if (!sh) continue;
    const hdrRow = findUserHeaderRow1Based_(sh);
    if (hdrRow < 1 || sh.getLastRow() <= hdrRow) continue;
    const startRow = hdrRow + 1;
    const numRows = sh.getLastRow() - hdrRow;
    const vals = sh.getRange(startRow, 1, numRows, 7).getValues();
    for (let i = 0; i < vals.length; i++) {
      const rowEmail = String(vals[i][4] || '').trim().toLowerCase();
      if (rowEmail !== email) continue;
      const tempKey = cleanSheetKeyCell_(vals[i][5]);
      const defKey = cleanSheetKeyCell_(vals[i][6]);
      if (keysEqualNormalized_(currentKey, tempKey) || keysEqualNormalized_(currentKey, defKey)) {
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
  const primaryTab = activeTab && tokensByTab[activeTab] ? activeTab : matchedTargets[0].tabName;
  return {
    ok: true,
    updatedRows: matchedTargets.length,
    authToken: tokensByTab[primaryTab] || issueInvAuthToken_(email, primaryTab),
    tokensByTab: tokensByTab
  };
}

/**
 * Verifica que quien cotiza sea EXCLUSIVAMENTE el titular autenticado del correo y de su ubicación asignada.
 */
function resolveAuthenticatedAdvisor_(ss, erpAdvisors, body) {
  const allUsers = readAllBranchUsers_(ss, erpAdvisors);
  const verifiedToken = verifyInvAuthToken_(body && body.authToken);

  let targetEmail = '';
  let targetTab = '';

  if (verifiedToken && verifiedToken.email) {
    targetEmail = verifiedToken.email;
    targetTab = verifiedToken.sheetTab;
  } else {
    const reqEmail = String((body && body.advisorEmail) || '').trim().toLowerCase();
    const reqKey = String((body && body.accessKey) || '').trim();
    const reqTab = String((body && body.sheetTab) || '').trim();
    if (reqEmail && reqKey) {
      const matchByKey = allUsers.find((u) => {
        if (u.correo !== reqEmail) return false;
        if (reqTab && u.sheetTab.toUpperCase() !== reqTab.toUpperCase() && u.branchKey.toUpperCase() !== reqTab.toUpperCase()) return false;
        if (u.defKey) return keysEqualNormalized_(reqKey, u.defKey);
        if (u.tempKey) return keysEqualNormalized_(reqKey, u.tempKey);
        return false;
      });
      if (matchByKey) {
        targetEmail = matchByKey.correo;
        targetTab = matchByKey.sheetTab;
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

  // Si es Administrador y antes tenía sesión en otra pestaña (ej. PROYECTOS antes de migrar a CUENTAS ADMINISTRATIVAS), aceptar su cuenta Admin
  let chosen = targetTab
    ? (userMatches.find((u) => u.sheetTab.toUpperCase() === targetTab.toUpperCase() || u.branchKey.toUpperCase() === targetTab.toUpperCase()) || null)
    : userMatches[0];
  if (!chosen && ADMIN_MASTER_EMAILS_[targetEmail]) {
    chosen = userMatches[0];
  }

  if (!chosen) {
    return {
      ok: false,
      authRequired: true,
      error: 'Tu correo no tiene permisos asignados en la ubicación solicitada.'
    };
  }

  if (chosen.mustChangeKey) {
    return {
      ok: false,
      authRequired: true,
      error: 'Debes establecer primero tu contraseña definitiva antes de generar cotizaciones.'
    };
  }

  return { ok: true, advisor: chosen };
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
 * 2) Columna I ("Descuento" junto a Usuario/ID Asesor): porcentaje explícito configurado en la hoja
 * 3) Respaldo por Puesto: GERENTE / SUBGERENTE = 100%, ASESOR = 24%
 */
function getMaxDiscountPctForPuesto_(puesto) {
  const p = String(puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /ADMINISTRADOR|GERENTE|\bSUB/.test(p) ? 100 : 24;
}

function getMaxDiscountPctForUser_(u) {
  if (!u) return 24;
  if (u.isAdmin) return 100;
  if (u.maxDiscountPct !== null && u.maxDiscountPct !== undefined && isFinite(Number(u.maxDiscountPct))) {
    return Math.max(0, Math.min(100, Number(u.maxDiscountPct)));
  }
  return getMaxDiscountPctForPuesto_(u.puesto);
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
  return 'Serie ' + pfx + ' (En vivo)';
}

function readRecentQuotesForAdvisor_(shQuotes, advisorEmail, maxItems) {
  if (!shQuotes || shQuotes.getLastRow() < 2) return [];
  const limit = maxItems || 10;
  const lastR = shQuotes.getLastRow();
  const startR = Math.max(2, lastR - 200);
  const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, 24).getDisplayValues();
  const emailNorm = String(advisorEmail || '').trim().toLowerCase();
  const out = [];
  for (let i = vals.length - 1; i >= 0 && out.length < limit; i--) {
    const r = vals[i];
    if (String(r[7] || '').trim().toLowerCase() !== emailNorm) continue;
    const cleanOrd = r[1] || ((r[0] && !/^[A-Z]+-\d+$/i.test(r[0])) ? r[0] : '');
    out.push({
      orderCode: cleanOrd || r[0] || '',
      folio: r[1] || cleanOrd || '',
      quoteId: r[2] || '',
      createdAt: r[3] || '',
      quoteType: r[4] || '',
      branchTab: r[5] || '',
      erpStore: r[6] || '',
      advisorEmail: r[7] || '',
      advisorName: r[8] || '',
      erpAdvisor: r[9] || '',
      clientName: r[11] || '',
      itemsCount: r[16] || '',
      skusSummary: r[17] || '',
      total: r[21] || '',
      status: r[22] || ''
    });
  }
  return out;
}

function readRecentQuotesForAdmin_(shQuotes, recentErpQuotes, maxItems) {
  const limit = maxItems || 40;
  const out = [];
  const seenKeys = {};

  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const lastR = shQuotes.getLastRow();
    const startR = Math.max(2, lastR - 250);
    const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, 24).getDisplayValues();
    for (let i = vals.length - 1; i >= 0 && out.length < limit; i--) {
      const r = vals[i];
      const cleanOrd = r[1] || ((r[0] && !/^[A-Z]+-\d+$/i.test(r[0])) ? r[0] : '');
      const key = (r[2] ? ('ID:' + r[2]) : '') || (cleanOrd ? ('F:' + cleanOrd) : '');
      if (key) seenKeys[key] = true;
      out.push({
        orderCode: cleanOrd || r[0] || '',
        folio: r[1] || cleanOrd || '',
        quoteId: r[2] || '',
        createdAt: r[3] || '',
        quoteType: r[4] || '',
        branchTab: r[5] || '',
        erpStore: r[6] || '',
        advisorEmail: r[7] || '',
        advisorName: r[8] || '',
        erpAdvisor: r[9] || '',
        clientName: r[11] || '',
        itemsCount: r[16] || '',
        skusSummary: r[17] || '',
        total: r[21] || '',
        status: r[22] || ''
      });
    }
  }

  if (Array.isArray(recentErpQuotes)) {
    for (let j = 0; j < recentErpQuotes.length && out.length < limit; j++) {
      const eq = recentErpQuotes[j];
      const kId = eq.quoteId ? ('ID:' + eq.quoteId) : '';
      const kFol = eq.folio ? ('F:' + eq.folio) : '';
      if ((kId && seenKeys[kId]) || (kFol && seenKeys[kFol])) continue;
      if (kId) seenKeys[kId] = true;
      if (kFol) seenKeys[kFol] = true;
      out.push(eq);
    }
  }

  return out;
}

function handleInvMyQuotes_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) return authCheck;

  const u = authCheck.advisor;
  const shQuotes = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const folioSnap = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
  const targetStore = (u.isAdmin && body && body.erpStore) ? String(body.erpStore).trim() : u.erpStore;
  const nextOrderCode = peekNextStoreErpFolio_(targetStore, u.orderPrefix, folioSnap);
  const recentQuotes = u.isAdmin
    ? readRecentQuotesForAdmin_(shQuotes, folioSnap.recentErpQuotes, 40)
    : readRecentQuotesForAdvisor_(shQuotes, u.correo, 12);

  return {
    ok: true,
    advisor: sanitizeUserForClient_(u, false),
    nextOrderCode: nextOrderCode,
    nextFolioByStore: folioSnap.nextFolioByStore,
    recentQuotes: recentQuotes
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

    if (!idUsuarioNum && (verifiedUser.isAdmin || verifiedUser.branchKey === 'ADMIN')) {
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

    const categoryLabel = String(body.categoryLabel || 'COTIZACIONES [ID: 2]').trim();
    const clientMode = String(body.clientMode || 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)').trim();
    const clientNameRaw = String(body.clientName || '').trim() || (isProyQuote ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA');
    const clientPhone = String(body.clientPhone || '').trim();
    const deliveryDate = String(body.deliveryDate || '').trim();
    const rawNotes = String(body.notes || '').trim();
    const extraDiscount = Math.max(0, Number(body.extraDiscount) || 0);

    // Límite de descuento por cuenta (Columna I "Descuento": Asesor 24% · Gerente 100% · Administrador 100%)
    const maxDiscPct = getMaxDiscountPctForUser_(verifiedUser);
    let sumListReq = 0;
    let sumNetReq = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const pct = Math.max(0, Number(it.discountPct) || 0);
      if (pct > maxDiscPct + 0.0001) {
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
      const previewStatus = handleInvPlantillaStatus_();
      previewStatus.orderCode = estimatedFolio;
      previewStatus.nextOrderCode = estimatedFolio;
      previewStatus.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      previewStatus.quoteType = activeQuoteType;
      previewStatus.isProyecto = isProyQuote;
      previewStatus.serieLabel = verifiedUser.serieLabel;
      previewStatus.sentLiveToErp = false;
      previewStatus.recentQuotes = verifiedUser.isAdmin
        ? readRecentQuotesForAdmin_(shQuotes, folioSnapBefore.recentErpQuotes, 40)
        : readRecentQuotesForAdvisor_(shQuotes, verifiedUser.correo, 12);
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

      const catMatch = categoryLabel.match(/(\d+)/);
      const idCategoriaVenta = catMatch ? parseInt(catMatch[1], 10) : 2;

      const cliMatch = clientMode.match(/ID CLIENTE:\s*(\d+)/i);
      let idCliente = 0;
      let idLead = 0;

      if (cliMatch) {
        idCliente = parseInt(cliMatch[1], 10);
        idLead = 0;
      } else {
        idLead = crearProspectoProvisionalWcf_(displayClientForErp, clientPhone, '', idUsuarioNum);
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
      const statusBannerTxt = '✅ COTIZACIÓN ENVIADA EN VIVO A SMUEBLERIA (' + ahoraStr + ') · FOLIO ' + folioFinal + ' · ' + refSujeto;

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
        'EN VIVO EN S MUEBLERÍA',
        rawNotes
      ]);
      const appendedRow = shQuotes.getLastRow();
      shQuotes.getRange(appendedRow, 19, 1, 4).setNumberFormat('$#,##0.00');

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
      finalOut.erpStatus = statusBannerTxt;
      finalOut.recentQuotes = verifiedUser.isAdmin
        ? readRecentQuotesForAdmin_(shQuotes, folioSnapAfter.recentErpQuotes, 40)
        : readRecentQuotesForAdvisor_(shQuotes, verifiedUser.correo, 12);
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
          'EN VIVO EN S MUEBLERÍA (VÍA SERVICIO)',
          rawNotes
        ]);
        const appRow = shQuotes.getLastRow();
        shQuotes.getRange(appRow, 19, 1, 4).setNumberFormat('$#,##0.00');
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
        outDaemon.erpStatus = daemonStatus;
        outDaemon.recentQuotes = verifiedUser.isAdmin
          ? readRecentQuotesForAdmin_(shQuotes, snapAfterDaemon.recentErpQuotes, 40)
          : readRecentQuotesForAdvisor_(shQuotes, verifiedUser.correo, 12);
        return outDaemon;
      }

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
      queuedOut.recentQuotes = verifiedUser.isAdmin
        ? readRecentQuotesForAdmin_(shQuotes, folioSnapBefore.recentErpQuotes, 40)
        : readRecentQuotesForAdvisor_(shQuotes, verifiedUser.correo, 12);
      return queuedOut;
    }
  } finally {
    lock.releaseLock();
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
      sh.getRange(3, 9, dataRows.length, 1).setNumberFormat('@');
      sh.getRange(3, 1, dataRows.length, 9).setValues(dataRows);
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

  // 3) Eliminar únicamente hojas por defecto 100% vacías (ej. "Hoja 2"), protegiendo todas las pestañas de otros proyectos y fórmulas
  const protectedTabs = {
    '1': true,
    'CATALOGO_PRODUCTOS': true,
    'PIEZAS_MODULOS': true,
    'SALAS_MODULARES': true,
    'MUEBLES_INDIVIDUALES': true,
    'INVENTARIO_EN_VIVO': true,
    'INF. PRODUC': true,
    'PLANTILLA': true,
    'COTIZACIONES_EN_VIVO': true,
    'TOP_BUSCADOS': true,
    '_CREATA_CONFIG': true
  };
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

    // 1) Obtener existencias Bodega y Piso en vivo desde S Mueblería ERP
    const xmlInv = callSmuebleriaWcf_(
      'ObtenerProductosInventariosSucursalesTodos',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro></Filtro>'
    );

    const invPorSku = {};
    const metaErpSku = {};
    const prodRe = /<(?:[a-zA-Z0-9_]+:)?ProductoInventarioSucursal>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ProductoInventarioSucursal>/g;
    let match;
    while ((match = prodRe.exec(xmlInv)) !== null) {
      const blk = match[1];
      const sku = extractXmlTag_(blk, 'Clave').toUpperCase();
      if (!sku) continue;
      const sucNorm = normPlainUpper_(extractXmlTag_(blk, 'Sucursal'));
      const bod = Math.round(parseFloat(extractXmlTag_(blk, 'Existensia') || '0') || 0);
      const pis = Math.round(parseFloat(extractXmlTag_(blk, 'Piso') || '0') || 0);

      if (!metaErpSku[sku]) {
        metaErpSku[sku] = {
          MODELO: extractXmlTag_(blk, 'Modelo'),
          NOMBRE: extractXmlTag_(blk, 'Nombre'),
          CATEGORIA: extractXmlTag_(blk, 'Categoria'),
          PROVEEDOR: extractXmlTag_(blk, 'Proveedor')
        };
      }
      if (!invPorSku[sku]) invPorSku[sku] = {};
      const prev = invPorSku[sku][sucNorm] || [0, 0];
      invPorSku[sku][sucNorm] = [prev[0] + bod, prev[1] + pis];
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
          const fCompra = parseSheetOrStrDate_(ru[2], rf[2]);
          const fComp = parseSheetOrStrDate_(ru[5], rf[5]);
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
    }

    // 4) Actualizar columnas dinámicas O..AV en INVENTARIO_EN_VIVO respetando A..N y F2 ARRAYFORMULA
    const lastRow = shInv.getLastRow();
    const numCatalogRows = lastRow - 2;
    const catRange = shInv.getRange(3, 1, numCatalogRows, Math.min(shInv.getMaxColumns(), 17)).getValues();
    if (shInv.getMaxColumns() < 48) {
      shInv.insertColumnsAfter(shInv.getMaxColumns(), 48 - shInv.getMaxColumns());
    }

    const ahoraStr = formatCancunNow_();
    const headersOAv = [
      'TIEMPO DE ENTREGA (DIAS)',
      'LPPT',
      'FECHA ESTIMADA DE LLEGADA',
      'TOTAL BODEGA',
      'TOTAL PISO'
    ];
    ERP_WAREHOUSES_ORDER_.forEach((pair) => {
      headersOAv.push(pair[1] + ' BODEGA');
      headersOAv.push(pair[1] + ' PISO');
    });
    headersOAv.push('ULTIMA ACTUALIZACION EN VIVO');

    const outMatrix = [];
    for (let i = 0; i < numCatalogRows; i++) {
      const r = catRange[i];
      const sku = String(r[0] || '').trim().toUpperCase();
      if (!sku) {
        const blank = new Array(34).fill('');
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

      const sucMap = invPorSku[sku] || {};
      let totBod = 0;
      let totPis = 0;
      Object.keys(sucMap).forEach((skSuc) => {
        totBod += sucMap[skSuc][0] || 0;
        totPis += sucMap[skSuc][1] || 0;
      });

      const rowVals = [colDias, cantLppt, fechaEst, totBod, totPis];
      for (let w = 0; w < ERP_WAREHOUSES_ORDER_.length; w++) {
        const sucKey = ERP_WAREHOUSES_ORDER_[w][0];
        const bp = sucMap[sucKey] || [0, 0];
        rowVals.push(bp[0] || 0);
        rowVals.push(bp[1] || 0);
      }
      rowVals.push(ahoraStr);
      outMatrix.push(rowVals);
    }

    const heartbeatRow = new Array(33).fill('');
    heartbeatRow.push('EN VIVO | ' + ahoraStr);

    shInv.getRange(1, 15, 1, 34).setValues([headersOAv]);
    shInv.getRange(2, 15, 1, 34).setValues([heartbeatRow]);
    shInv.getRange(3, 15, outMatrix.length, 34).setValues(outMatrix);
    asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });

    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert('Inventario sincronizado en vivo desde S Mueblería ERP (' + outMatrix.length + ' filas, ' + ahoraStr + ').');
      } catch (e) {}
    }

    return {
      ok: true,
      rowsUpdated: outMatrix.length,
      lpptSynced: lpptOk,
      timestamp: ahoraStr
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agrega / actualiza la columna "PRECIO DE LISTA" en INVENTARIO_EN_VIVO (Columna AW = 49,
 * justo después de AV "ULTIMA ACTUALIZACION EN VIVO") vinculada por ARRAYFORMULA + XLOOKUP
 * a la lista oficial de precios de S Mueblería (plantilla!AE2:AH), sin desplazar A..AV (1..48)
 * ni alterar F2, sincronizador_inventario_vivo.py ni las hojas del Catálogo.
 */
function agregarColumnaPrecioListaInventario() {
  return asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: false, force: true });
}

function asegurarColumnaPrecioListaInventario_(ss, opts) {
  const silentUi = !opts || opts.silentUi !== false;
  const force = !!(opts && opts.force);
  const cacheKey = 'inv_precio_lista_col_ready_v1';

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

  // Columnas 1..48 (A..AV) están reservadas para atributos curados (A..N, incluyendo F2 ARRAYFORMULA)
  // y existencias dinámicas (O..AV). Colocamos PRECIO DE LISTA en AW (col 49) o reutilizamos si ya existe en >= 49.
  const maxColsNow = shInv.getMaxColumns();
  let targetCol = 49; // AW
  if (maxColsNow >= 49) {
    const hdrTail = shInv.getRange(1, 49, 1, maxColsNow - 48).getDisplayValues()[0] || [];
    for (let k = 0; k < hdrTail.length; k++) {
      const normH = normPlainUpper_(hdrTail[k]);
      if (normH === 'PRECIO DE LISTA' || normH === 'PRECIO LISTA') {
        targetCol = 49 + k;
        break;
      }
    }
  }

  if (shInv.getMaxColumns() < targetCol) {
    shInv.insertColumnsAfter(shInv.getMaxColumns(), targetCol - shInv.getMaxColumns());
  }

  const formulaStr = '=ARRAYFORMULA(IF($A$2:$A="","",IFERROR(XLOOKUP(TRIM($A$2:$A),plantilla!$AE$2:$AE,plantilla!$AH$2:$AH,"",0),"")))';

  if (!force) {
    const curHdr = normPlainUpper_(shInv.getRange(1, targetCol).getDisplayValue());
    const curFormula = String(shInv.getRange(2, targetCol).getFormula() || '').trim();
    if (curHdr === 'PRECIO DE LISTA' && /^=ARRAYFORMULA/i.test(curFormula)) {
      try {
        CacheService.getScriptCache().put(cacheKey, '1', 21600);
      } catch (ce) {}
      return { ok: true, alreadyReady: true, column: targetCol, columnLetter: 'AW' };
    }
  }

  const maxRows = Math.max(shInv.getMaxRows(), shInv.getLastRow(), 3);
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
        'Columna "PRECIO DE LISTA" agregada y vinculada en vivo en INVENTARIO_EN_VIVO (Columna AW) sin afectar el resto del documento.'
      );
    } catch (e) {}
  }

  return {
    ok: true,
    column: targetCol,
    columnLetter: targetCol === 49 ? 'AW' : String(targetCol),
    header: 'PRECIO DE LISTA'
  };
}

// ----------------------------------------------------------------------------
// REGISTRO GLOBAL DE ARTÍCULOS MÁS BUSCADOS DEL COTIZADOR (TOP_BUSCADOS)
// ----------------------------------------------------------------------------
function normTopSearchGroupKey_(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function ensureTopSearchedSheet_(ss) {
  let sh = ss.getSheetByName(TAB_TOP_SEARCHED_);
  const headers = [
    'POSICION',
    'CLAVE_GRUPO',
    'SKU_PRINCIPAL',
    'ARTICULO',
    'CATEGORIA',
    'BUSQUEDAS',
    'ULTIMA_BUSQUEDA_MS',
    'ULTIMA_BUSQUEDA',
    'ULTIMA_UBICACION'
  ];

  if (!sh) {
    sh = ss.insertSheet(TAB_TOP_SEARCHED_, ss.getSheets().length);
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 2, sh.getMaxRows(), 2).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(1, 1, 1, 1).setBackground('#A38251');
    sh.getRange(1, 6, 1, 1).setBackground('#A38251');
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

function readTopSearchedEntriesFromSheet_(sh) {
  const byGk = {};
  const gkBySku = {};
  if (!sh) return { byGk: byGk, gkBySku: gkBySku, dataRows: 0 };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { byGk: byGk, gkBySku: gkBySku, dataRows: 0 };

  const dataRows = lastRow - 1;
  const vals = sh.getRange(2, 1, dataRows, 9).getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const sku = cleanSheetKeyCell_(r[2]).toUpperCase();
    const title = String(r[3] || '').trim();
    const gk = normTopSearchGroupKey_(r[1]) || normTopSearchGroupKey_(title) || sku.toLowerCase();
    const count = Math.max(0, Math.round(Number(r[5]) || 0));
    if (!gk || count <= 0) continue;

    const lastMs = Math.max(0, Math.round(Number(r[6]) || 0));
    const lastStr = String(r[7] || '').trim();
    const branch = String(r[8] || '').trim();
    const cat = String(r[4] || '').trim();

    if (byGk[gk]) {
      byGk[gk].count += count;
      if (lastMs >= byGk[gk].lastMs) {
        byGk[gk].lastMs = lastMs;
        if (lastStr) byGk[gk].lastStr = lastStr;
        if (branch) byGk[gk].branch = branch;
        if (sku) byGk[gk].sku = sku;
        if (title) byGk[gk].title = title;
        if (cat) byGk[gk].cat = cat;
      }
    } else {
      byGk[gk] = {
        gk: gk,
        sku: sku,
        title: title || sku || gk.toUpperCase(),
        cat: cat,
        count: count,
        lastMs: lastMs,
        lastStr: lastStr,
        branch: branch
      };
    }
    if (sku && !gkBySku[sku]) gkBySku[sku] = gk;
  }
  return { byGk: byGk, gkBySku: gkBySku, dataRows: dataRows };
}

function sortTopSearchedEntries_(byGk) {
  const arr = Object.keys(byGk).map((k) => byGk[k]).filter((e) => e && e.count > 0);
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.lastMs !== a.lastMs) return b.lastMs - a.lastMs;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
  return arr;
}

function handleInvTopSearched_() {
  const ss = getSpreadsheet_();
  try {
    asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });
  } catch (eCol) {}
  const sh = ss.getSheetByName(TAB_TOP_SEARCHED_);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: true, updatedAtMs: Date.now(), top: [] };
  }
  const parsed = readTopSearchedEntriesFromSheet_(sh);
  const sorted = sortTopSearchedEntries_(parsed.byGk);
  return {
    ok: true,
    updatedAtMs: Date.now(),
    top: sorted.slice(0, 100).map((e, idx) => ({
      pos: idx + 1,
      gk: e.gk,
      sku: e.sku,
      title: e.title,
      cat: e.cat,
      count: e.count,
      lastMs: e.lastMs
    }))
  };
}

function handleInvRecordSearch_(body) {
  const rawEvents = Array.isArray(body && body.events)
    ? body.events
    : (body && (body.gk || body.sku || body.title) ? [body] : []);

  if (!rawEvents.length) {
    return handleInvTopSearched_();
  }

  const batch = rawEvents.slice(0, 60);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, retry: true, error: 'Sincronización ocupada, se reintentará automáticamente.' };
  }

  try {
    let cache = null;
    let seenCache = {};
    const cacheKeys = [];
    for (let i = 0; i < batch.length; i++) {
      const evId = String((batch[i] && batch[i].id) || '').trim().slice(0, 80);
      if (evId) cacheKeys.push('inv_top_ev_' + evId);
    }
    if (cacheKeys.length > 0) {
      try {
        cache = CacheService.getScriptCache();
        seenCache = cache.getAll(cacheKeys) || {};
      } catch (ce) {
        cache = null;
        seenCache = {};
      }
    }

    const ss = getSpreadsheet_();
    const sh = ensureTopSearchedSheet_(ss);
    const parsed = readTopSearchedEntriesFromSheet_(sh);
    const byGk = parsed.byGk;
    const gkBySku = parsed.gkBySku;

    const ackIds = [];
    const newCacheEntries = {};
    const nowMs = Date.now();
    const nowStr = formatCancunNow_();
    let mutated = false;

    for (let i = 0; i < batch.length; i++) {
      const ev = batch[i] || {};
      const evId = String(ev.id || '').trim().slice(0, 80);
      if (evId) {
        ackIds.push(evId);
        const cKey = 'inv_top_ev_' + evId;
        if (seenCache[cKey] || newCacheEntries[cKey]) {
          continue;
        }
        newCacheEntries[cKey] = '1';
      }

      const sku = cleanSheetKeyCell_(ev.sku || '').toUpperCase();
      const title = String(ev.title || '').trim();
      const cat = String(ev.cat || '').trim();
      const branch = String(ev.branch || '').trim();
      let gk = normTopSearchGroupKey_(ev.gk) || normTopSearchGroupKey_(title) || sku.toLowerCase();
      if (!gk) continue;

      if (!byGk[gk] && sku && gkBySku[sku] && byGk[gkBySku[sku]]) {
        gk = gkBySku[sku];
      }

      const delta = Math.min(25, Math.max(1, Math.round(Number(ev.delta) || 1)));
      const evMsRaw = Math.round(Number(ev.ts) || 0);
      const evMs = (evMsRaw > 1700000000000 && evMsRaw <= nowMs + 300000) ? evMsRaw : nowMs;

      if (byGk[gk]) {
        byGk[gk].count += delta;
        if (evMs >= byGk[gk].lastMs) {
          byGk[gk].lastMs = evMs;
          byGk[gk].lastStr = nowStr;
          if (branch) byGk[gk].branch = branch;
        }
        if (sku && !byGk[gk].sku) byGk[gk].sku = sku;
        if (title) byGk[gk].title = title;
        if (cat) byGk[gk].cat = cat;
      } else {
        byGk[gk] = {
          gk: gk,
          sku: sku,
          title: title || sku || gk.toUpperCase(),
          cat: cat,
          count: delta,
          lastMs: evMs,
          lastStr: nowStr,
          branch: branch
        };
      }
      if (sku) gkBySku[sku] = gk;
      mutated = true;
    }

    const sorted = sortTopSearchedEntries_(byGk);

    if (mutated) {
      if (sorted.length > 0) {
        const outRows = sorted.map((e, idx) => [
          idx + 1,
          e.gk,
          e.sku,
          e.title,
          e.cat,
          e.count,
          e.lastMs,
          e.lastStr || nowStr,
          e.branch || ''
        ]);
        sh.getRange(2, 1, outRows.length, 9).setValues(outRows);
      }
      if (parsed.dataRows > sorted.length) {
        sh.getRange(2 + sorted.length, 1, parsed.dataRows - sorted.length, 9).clearContent();
      }
      SpreadsheetApp.flush();
    }

    if (cache && Object.keys(newCacheEntries).length > 0) {
      try {
        cache.putAll(newCacheEntries, 21600);
      } catch (ce) {}
    }

    return {
      ok: true,
      ackIds: ackIds,
      updatedAtMs: Date.now(),
      top: sorted.slice(0, 100).map((e, idx) => ({
        pos: idx + 1,
        gk: e.gk,
        sku: e.sku,
        title: e.title,
        cat: e.cat,
        count: e.count,
        lastMs: e.lastMs
      }))
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Limpia medidas incrustadas en la columna D (NOMBRE) de INVENTARIO_EN_VIVO,
 * guarda las medidas extraídas en M (MEDIDAS) cuando esté vacía y completa
 * B (TIPO DE PRODUCTO), C (MODELO), D (NOMBRE), E (VARIANTE) y G (CATEGORÍA)
 * respetando intactas F (ARRAYFORMULA de fotos) y O:AW (existencias y precio en vivo).
 */
function limpiarYCompletarInventarioEnVivo() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName('INVENTARIO_EN_VIVO');
  if (!sh) throw new Error('No existe la hoja INVENTARIO_EN_VIVO.');
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return { updated: 0 };

  const numRows = lastRow - 2;
  const fullAtoN = sh.getRange(3, 1, numRows, 14).getValues(); // A3:N<lastRow>
  const bToE = [];
  const gToN = [];
  let changed = 0;

  const dimPatterns = [
    /\bMEDIDAS?\s*[:.]?\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?){1,3}\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?\.?/gi,
    /\(\s*\d+(?:[.,]\d+)?\s*[xX*×]\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?\s*\)/gi,
    /\b\d+(?:[.,]\d+)?\s*[xX*×]\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?|M\b)?\.?(?=\s|$|[),.;/-])/gi,
    /\b(?:DIAMETRO|DIÁMETRO|DIAM\.?)\s*\d+(?:[.,]\d+)?\s*(?:CM\.?|CMS\.?|MTS?\.?|MM\.?)?\.?/gi,
    /\bL?\d{2,3}\s*-\s*\d{2,3}\s*(?:CM\.?|CMS\.?)\.?/gi,
    /\b\d{2,3}(?:\s*,\s*\d{2,3}){1,3}\s*(?:CM\.?|CMS\.?)\.?/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:CM\.?|CMS\.?|MTS\.?|MT\.?|METROS?|MM\.?)(?=\s|$|[),.;/-])/gi
  ];

  for (let i = 0; i < numRows; i++) {
    const r = fullAtoN[i];
    const sku = String(r[0] || '').trim().toUpperCase();
    let tp = String(r[1] || '').trim();
    let mo = String(r[2] || '').trim();
    let nom = String(r[3] || '').trim();
    let vr = String(r[4] || '').trim();
    let cat = String(r[6] || '').trim();
    const tl = String(r[7] || '').trim();
    const ct = String(r[8] || '').trim();
    const md = String(r[9] || '').trim();
    const cm = String(r[10] || '').trim();
    const mt = String(r[11] || '').trim();
    let med = String(r[12] || '').trim();
    const pr = String(r[13] || '').trim();

    if (!sku) {
      bToE.push([tp, mo, nom, vr]);
      gToN.push([cat, tl, ct, md, cm, mt, med, pr]);
      continue;
    }

    const extracted = [];
    let cleanNom = nom;
    for (let p = 0; p < dimPatterns.length; p++) {
      cleanNom = cleanNom.replace(dimPatterns[p], function (m) {
        const cleanedDim = m.replace(/^MEDIDAS?\s*[:.]?\s*/i, '').replace(/^[(\s]+|[)\s.]+$/g, '').trim();
        if (cleanedDim) extracted.push(cleanedDim.toUpperCase());
        return ' ';
      });
    }
    cleanNom = cleanNom
      .replace(/\(\s*\)/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .replace(/(?:^|\s)[-–—/:.,;]+(?:\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, '')
      .trim();

    if (!med && extracted.length > 0) {
      med = extracted[0];
    }
    if (!cleanNom) {
      cleanNom = [tp, mo, vr].filter(Boolean).join(' ').trim() || sku;
    }
    if (!tp) tp = 'MOBILIARIO';
    if (!mo) mo = cleanNom.split(/\s+/)[0] || sku;
    if (!vr) vr = [tl, ct, md, cm].filter(Boolean).join(' ').trim() || 'ESTÁNDAR';
    if (!cat) cat = 'MOBILIARIO GENERAL';

    if (tp !== String(r[1] || '').trim() || mo !== String(r[2] || '').trim() || cleanNom !== nom || vr !== String(r[4] || '').trim() || cat !== String(r[6] || '').trim() || med !== String(r[12] || '').trim()) {
      changed++;
    }

    bToE.push([tp, mo, cleanNom, vr]);
    gToN.push([cat, tl, ct, md, cm, mt, med, pr]);
  }

  if (changed > 0) {
    sh.getRange(3, 2, numRows, 4).setValues(bToE); // B3:E
    sh.getRange(3, 7, numRows, 8).setValues(gToN); // G3:N (nunca toca F ni O:AW)
    SpreadsheetApp.flush();
  }
  return { updated: changed, total: numRows };
}




