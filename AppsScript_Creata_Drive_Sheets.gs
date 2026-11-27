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
      .addItem('5b. Sincronizar Cotizaciones Seguimiento S Mueblería (Ahora)', 'sincronizarCotizacionesSeguimientoDesdeERP')
      .addItem('6. Activar Sincronización S Mueblería 24/7 (Cada 5 min)', 'instalarTriggerErpEnVivo')
      .addSeparator()
      .addItem('7. Organizar Cuentas, Contraseñas Temporales y Columna Descuento', 'organizarCuentasYDescuentosEnHojas')
      .addItem('8. Agregar / Actualizar Columna PRECIO DE LISTA (Cotizador)', 'agregarColumnaPrecioListaInventario')
      .addItem('9. Autocompletar Nuevos SKUs y Ordenar A-Z (INVENTARIO_EN_VIVO)', 'limpiarYCompletarInventarioEnVivo')
      .addItem('10. Crear / Verificar Hoja INVITADOS (Solo Ver · Máx. 2 Lugares)', 'crearVerificarHojaInvitados')
      .addItem('11. Reparar Permisos Públicos de Fotos (Drive)', 'hacerPublicasFotosInventario')
      .addItem('12. Reubicar y Reparar Fotos según Sheets (Drive)', 'reubicarFotosSegunSheets')
      .addToUi();
  } catch (e) {}
}

function getProp_(key) {
  return (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

const DEFAULT_AUTH_SPREADSHEET_ID_ = '1CqZyNaHUU5YiOFrN-8hXuTvJqoD_IgSvULhiffSF_lQ';

/**
 * Seguridad (P0-01): Aloja CUENTAS ADMINISTRATIVAS e INVITADOS en un único libro PRIVADO
 * ("CREATA_AUTH_PRIVADO_NO_COMPARTIR" / ScriptProperties "AUTH_SPREADSHEET_ID"), con respaldo
 * transparente solo si el libro privado no está disponible en entornos de prueba.
 */
function getAuthSpreadsheet_(fallbackSs) {
  try {
    const configuredId = getProp_('AUTH_SPREADSHEET_ID');
    const authId = configuredId || DEFAULT_AUTH_SPREADSHEET_ID_;
    if (authId && authId !== CONFIG.SHEET_ID) {
      return SpreadsheetApp.openById(authId);
    }
  } catch (eAuthSs) {}
  return fallbackSs || getSpreadsheet_();
}

function constantTimeEquals_(aRaw, bRaw) {
  const a = String(aRaw === null || aRaw === undefined ? '' : aRaw);
  const b = String(bRaw === null || bRaw === undefined ? '' : bRaw);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= (ca ^ cb);
  }
  return diff === 0;
}

const PASSWORD_HASH_DEFAULT_ITERS_ = 2500;
const PASSWORD_HASH_MAX_ITERS_ = 20000;

function isHashedPassword_(val) {
  const s = String(val || '').trim();
  return /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/i.test(s) ||
    /^sha256\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/i.test(s);
}

function hashUserPassword_(plainKey, saltOpt, itersOpt) {
  const clean = String(plainKey || '').trim();
  if (!clean) return '';
  let salt = String(saltOpt || '').trim();
  if (!salt) {
    if (typeof Utilities !== 'undefined' && typeof Utilities.getUuid === 'function') {
      salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    } else {
      salt = bytesToHex_(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(Date.now()) + ':' + String(Math.random()))
      ).slice(0, 16);
    }
  }
  const iters = Math.max(1, Math.min(PASSWORD_HASH_MAX_ITERS_, parseInt(String(itersOpt || PASSWORD_HASH_DEFAULT_ITERS_), 10) || PASSWORD_HASH_DEFAULT_ITERS_));
  let hex = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + clean));
  for (let r = 1; r < iters; r++) {
    hex = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hex + ':' + salt + ':' + clean));
  }
  return 'sha256i$' + iters + '$' + salt + '$' + hex;
}

function getKeyEpochForEmail_(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email) return 0;
  try {
    return Number(PropertiesService.getScriptProperties().getProperty('INV_KEY_EPOCH_' + email) || 0) || 0;
  } catch (e) {
    return 0;
  }
}

function bumpKeyEpochForEmail_(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email) return 0;
  const now = Date.now();
  try {
    PropertiesService.getScriptProperties().setProperty('INV_KEY_EPOCH_' + email, String(now));
  } catch (e) {}
  return now;
}

/**
 * Utilidad manual (ejecutar 1 vez desde el editor Apps Script) para copiar CUENTAS ADMINISTRATIVAS
 * e INVITADOS hacia un libro PRIVADO (AUTH_SPREADSHEET_ID) y opcionalmente hashear claves definitivas.
 */
function migrarCuentasALibroPrivadoYHash(targetAuthSheetId, enableHashFlag) {
  const srcSs = getSpreadsheet_();
  let authId = String(targetAuthSheetId || getProp_('AUTH_SPREADSHEET_ID') || '').trim();
  let dstSs = null;
  if (authId && authId !== CONFIG.SHEET_ID) {
    dstSs = SpreadsheetApp.openById(authId);
  } else {
    dstSs = SpreadsheetApp.create('CREATA_AUTH_PRIVADO_NO_COMPARTIR');
    authId = dstSs.getId();
  }
  const tabsToCopy = [TAB_CUENTAS_ADMIN_, TAB_INVITADOS_];
  const copied = [];
  for (let i = 0; i < tabsToCopy.length; i++) {
    const tName = tabsToCopy[i];
    const srcSh = srcSs.getSheetByName(tName);
    if (!srcSh) continue;
    let dstSh = dstSs.getSheetByName(tName);
    if (dstSh) dstSs.deleteSheet(dstSh);
    dstSh = srcSh.copyTo(dstSs);
    dstSh.setName(tName);
    if (enableHashFlag) {
      const hdrRow = findUserHeaderRow1Based_(dstSh);
      if (hdrRow >= 1 && dstSh.getLastRow() > hdrRow) {
        const startR = hdrRow + 1;
        const nRows = dstSh.getLastRow() - hdrRow;
        const keysRange = dstSh.getRange(startR, 6, nRows, 2);
        const vals = keysRange.getValues();
        let mutated = false;
        for (let r = 0; r < vals.length; r++) {
          const defK = cleanSheetKeyCell_(vals[r][1]);
          if (defK && !isHashedPassword_(defK)) {
            vals[r][1] = hashUserPassword_(defK);
            mutated = true;
          }
        }
        if (mutated) {
          keysRange.setNumberFormat('@').setValues(vals);
        }
      }
    }
    copied.push(tName);
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('AUTH_SPREADSHEET_ID', authId);
  if (enableHashFlag) props.setProperty('HASH_USER_PASSWORDS', '1');
  invalidateBranchUsersCache_();
  return { ok: true, authSpreadsheetId: authId, copiedTabs: copied, hashEnabled: !!enableHashFlag };
}

/**
 * Activa un libro PRIVADO de cuentas que ya contiene CUENTAS ADMINISTRATIVAS e INVITADOS
 * (por ejemplo, migrado previamente) sin sobrescribir sus pestañas ni contraseñas hasheadas.
 */
function activarLibroAuthPrivado(targetAuthSheetId) {
  const authId = String(targetAuthSheetId || '').trim();
  if (!authId || authId === CONFIG.SHEET_ID) {
    return { ok: false, error: 'Indica el ID de un Google Sheet privado distinto al libro público.' };
  }
  const dstSs = SpreadsheetApp.openById(authId);
  const shAdmin = dstSs.getSheetByName(TAB_CUENTAS_ADMIN_);
  const shInv = findInvitadosSheet_(dstSs);
  if (!shAdmin || shAdmin.getLastRow() < 3) {
    return { ok: false, error: 'El libro privado no contiene filas válidas en CUENTAS ADMINISTRATIVAS.' };
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('AUTH_SPREADSHEET_ID', authId);
  props.setProperty('HASH_USER_PASSWORDS', '1');
  invalidateBranchUsersCache_();
  return {
    ok: true,
    authSpreadsheetId: authId,
    adminRows: Math.max(0, shAdmin.getLastRow() - 2),
    guestRows: shInv ? Math.max(0, shInv.getLastRow() - 2) : 0,
    hashEnabled: true
  };
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
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const initRes = dejarTodoListoSinFotos({ silentUi: true });
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'init_now', result: initRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_now') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const syncRes = syncDriveFolderToSheet();
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'sync_now', result: syncRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_inventory_tab') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const invRes = sincronizarPestanaInventarioEnVivo({ silentUi: true });
      return jsonResponse_({ ok: true, action: 'sync_inventory_tab', result: invRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'cm_inventory') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: true, allowAdminPin: true, rateBucket: 'get_cm_inv', maxHits: 60, windowSec: 60 });
    if (!gate.ok) {
      if (gate.rateLimited) {
        return jsonResponse_({ ok: false, rateLimited: true, retryable: true, error: 'Consultas simultáneas detectadas, reintentando automáticamente...' });
      }
      return jsonResponse_({ ok: false });
    }
    return jsonResponse_(handleCmInventoryRead_());
  }

  if (action === 'seg_get_state') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        includeInventory: String((e && e.parameter && e.parameter.includeInventory) || '') === '1'
      };
      return jsonResponse_(handleSegGetState_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false });
    }
  }

  if (action === 'seg_get_delta') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 60, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const p = (e && e.parameter) || {};
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        sinceVersion: Number(p.sinceVersion || 0) || 0,
        sinceInvVersion: String(p.sinceInvVersion || '').trim()
      };
      return jsonResponse_(handleSegGetDelta_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false });
    }
  }

  if (action === 'inv_presence_list') {
    const reqKeyParam = String((e && e.parameter && e.parameter.accessKey) || '').trim();
    if (reqKeyParam) {
      return jsonResponse_({ ok: false, error: 'Por seguridad, accessKey solo se acepta vía POST.' });
    }
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'pres_list', maxHits: 45, windowSec: 60 });
    const reqEmailNorm = String((e && e.parameter && (e.parameter.advisorEmail || e.parameter.email)) || '').trim().toLowerCase().replace(/,/g, '.');
    if (!gate.ok) {
      return jsonResponse_({ ok: false, authRequired: true, error: 'Token de sesión inválido o expirado.' });
    }
    try {
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        advisorEmail: reqEmailNorm,
        sheetTab: String((e && e.parameter && e.parameter.sheetTab) || '').trim(),
        erpStore: String((e && e.parameter && e.parameter.erpStore) || '').trim()
      };
      return jsonResponse_(handleInvPresenceList_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
    }
  }

  if (action === 'inv_ensure_invitados') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const shGuest = ensureInvitadosSheet_(getAuthSpreadsheet_());
      return jsonResponse_({ ok: true, action: 'inv_ensure_invitados', sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_ensure_precio_lista') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_ensure_precio_lista' }, resCol));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_erp_sync_now') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resSync = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_erp_sync_now' }, resSync));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_autocomplete_sort') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_autocomplete_sort' }, resAuto));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_users_directory') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_users_dir', maxHits: 30, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvUsersDirectory_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_plantilla_status') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: true, rateBucket: 'get_plantilla', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvPlantillaStatus_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_top_searched') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: true, allowAdminPin: true, rateBucket: 'get_top', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvTopSearched_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (mode === 'admin' && !hasValidAdminPin_(reqPin)) {
    return jsonResponse_({ ok: false, error: 'PIN de administrador inválido o no configurado' });
  }

  try {
    const ss = getSpreadsheet_();
    publishWebAppUrlToConfigSheet_(ss);
    try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (eInvInit) {}
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

function handleCmInventoryRead_() {
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
    try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (eInvSh) {}
    const rawRows = shInv ? shInv.getDataRange().getValues() : [];
    const rows = rawRows.filter((r, idx) => idx === 0 || String((r && r[0]) || '').trim() !== '');
    return { ok: true, tab: CONFIG.TAB_INVENTORY, rows: rows };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
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
    const rateLimitErrPayload = {
      ok: false,
      rateLimited: true,
      retryable: true,
      error: 'Consultas simultáneas detectadas, reintentando automáticamente...'
    };

    // Acciones autenticadas de inventario, cotización en vivo S Mueblería y seguimiento
    if (action === 'cm_inventory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_cm_inv', maxHits: 60, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleCmInventoryRead_());
    }
    if (action === 'inv_log_event') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_log', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvLogEvent_(body, gate.tokenInfo || null, !!gate.viaPin));
    }
    if (action === 'seg_action') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_seg_act', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegAction_(body));
    }
    if (action === 'seg_get_state') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegGetState_(body));
    }
    if (action === 'seg_get_delta') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegGetDelta_(body));
    }
    if (action === 'seg_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        const recentStamp = CacheService.getScriptCache().get('SEG_ERP_SYNC_COOLDOWN_V1');
        if (recentStamp) {
          return jsonResponse_({ ok: true, cachedRecent: true, timestamp: recentStamp });
        }
      } catch (eCool) {}
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      let segQuotesRes = null;
      try {
        segQuotesRes = sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: false });
      } catch (eSegSync) {
        segQuotesRes = { ok: false, error: (eSegSync && eSegSync.message) ? eSegSync.message : String(eSegSync) };
      }
      ensureLiveErpSyncTrigger_();
      try {
        CacheService.getScriptCache().put('SEG_ERP_SYNC_COOLDOWN_V1', String((syncRes && syncRes.timestamp) || new Date().toISOString()), 60);
      } catch (eCoolSet) {}
      return jsonResponse_(Object.assign({ ok: true, segQuotesSync: segQuotesRes }, syncRes));
    }
    if (action === 'inv_login') {
      const loginEmailKey = String((body && body.email) || 'anon').trim().toLowerCase();
      if (!checkRateLimitSilent_('post_login:' + loginEmailKey, 20, 600)) {
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvLogin_(body));
    }
    if (action === 'inv_users_directory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_users_dir', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        return jsonResponse_(handleInvUsersDirectory_());
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_my_directory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_my_dir', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvMyDirectory_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_guest_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_hb', maxHits: 30, windowSec: 60 });
      if (!gate.ok || !gate.tokenInfo || !gate.tokenInfo.email) {
        return jsonResponse_(gate && gate.rateLimited ? rateLimitErrPayload : { ok: false });
      }
      const safeBody = Object.assign({}, body, {
        authToken: extractAuthTokenFromRequest_(e, body),
        email: gate.tokenInfo.email,
        advisorEmail: gate.tokenInfo.email
      });
      return jsonResponse_(handleInvGuestHeartbeat_(safeBody));
    }
    if (action === 'inv_presence_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_pres_hb', maxHits: 60, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_hb_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceHeartbeat_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_presence_logout') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_pres_out', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token inválido.' });
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceLogout_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_presence_list') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'pres_list', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_list_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceList_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_my_sessions') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_mysess', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvMySessions_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_revoke_session') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_revsess', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRevokeSession_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_overrides_get') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_ovr_get', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        return jsonResponse_(handleInvProductOverridesGet_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_override_save') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_ovr_save', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvProductOverrideSave_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al guardar producto.' });
      }
    }
    if (action === 'inv_register_demand_request') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_demand_req', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRegisterDemandRequest_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al registrar solicitud sin stock.' });
      }
    }
    if (action === 'inv_register_purchase_suggestion') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_purchase_sug', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRegisterPurchaseSuggestion_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al registrar sugerencia de compra.' });
      }
    }
    if (action === 'hist_archive_and_analyze_kevin') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_kevin_arch', maxHits: 15, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleHistArchiveAndAnalyzeKevin_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al archivar y analizar ventas.' });
      }
    }
    if (action === 'inv_ensure_invitados') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const shGuest = ensureInvitadosSheet_(getAuthSpreadsheet_());
      return jsonResponse_({ ok: true, sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    }
    if (action === 'inv_update_key') {
      const updEmailKey = String((body && body.email) || 'anon').trim().toLowerCase();
      if (!checkRateLimitSilent_('post_updkey:' + updEmailKey, 15, 600)) {
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvUpdateKey_(body));
    }
    if (action === 'inv_submit_quote') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_quote', maxHits: 15, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvSubmitQuote_(body));
    }
    if (action === 'inv_my_quotes') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_myq', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvMyQuotes_(body));
    }
    if (action === 'inv_download_erp_quote_pdf') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_pdf', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvDownloadErpQuotePdf_(body));
    }
    if (action === 'inv_search_erp_clients') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_s', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para buscar clientes.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvSearchErpClients_(body));
    }
    if (action === 'inv_create_erp_client') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_c', maxHits: 20, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para registrar clientes.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvCreateErpClient_(body));
    }
    if (action === 'inv_upload_product_photo') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_photo', maxHits: 40, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, forbidden: true, error: 'Solo usuarios autorizados pueden subir fotografías.' });
      }
      return jsonResponse_(handleInvUploadProductPhoto_(body));
    }
    if (action === 'inv_plantilla_status') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_plantilla', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvPlantillaStatus_());
    }
    if (action === 'inv_record_search') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_search', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvRecordSearch_(body));
    }
    if (action === 'inv_top_searched') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_top', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvTopSearched_());
    }
    if (action === 'inv_ensure_precio_lista') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true }, resCol));
    }
    if (action === 'inv_erp_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_autocomplete_sort') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true }, resAuto));
    }
    if (action === 'inv_repair_photo_permissions') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_repair_perms', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(hacerPublicasFotosInventario_(body || {}));
    }
    if (
      action === 'fotos_subir_list' ||
      action === 'fotos_subir_upload_inbox' ||
      action === 'fotos_subir_assign' ||
      action === 'fotos_direct_upload_assign' ||
      action === 'fotos_upload_visual_override' ||
      action === 'fotos_reorganize_from_sheets' ||
      action === 'fotos_delete' ||
      action === 'fotos_subir_delete' ||
      action === 'fotos_sync_skus'
    ) {
      const isFotosPoll = (action === 'fotos_subir_list');
      const fotosRateBucket = isFotosPoll ? 'post_fotos_poll' : 'post_fotos_write';
      const fotosMaxHits = isFotosPoll ? 240 : (action === 'fotos_sync_skus' ? 30 : 60);
      const gate = authorizePrivateTokenOrPin_(e, body, {
        allowGuest: false,
        allowAdminPin: false,
        rateBucket: fotosRateBucket,
        maxHits: fotosMaxHits,
        windowSec: 60,
        keyByDevice: isFotosPoll
      });
      let shouldMintFreshToken = false;
      let mintTokenEmail = OWNER_FOTOS_EMAIL_;
      if (!gate.ok) {
        if (gate.rateLimited) {
          return jsonResponse_(rateLimitErrPayload);
        }
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(body && String(body.accessKey || '').trim() && reqEmailNorm && reqEmailNorm.indexOf('@') !== -1);
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada. Ingresa tu contraseña.' });
        }
        const keyBucket = (isFotosPoll ? 'post_fotos_key_poll:' : 'post_fotos_key:') + reqEmailNorm;
        const keyMaxHits = isFotosPoll ? 120 : 20;
        if (!checkRateLimitSilent_(keyBucket, keyMaxHits, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
        shouldMintFreshToken = true;
        mintTokenEmail = reqEmailNorm;
      }
      let fotosRes;
      if (action === 'fotos_subir_list') fotosRes = handleFotosSubirList_(body);
      else if (action === 'fotos_subir_upload_inbox') fotosRes = handleFotosSubirUploadInbox_(body);
      else if (action === 'fotos_subir_assign') fotosRes = handleFotosSubirAssign_(body);
      else if (action === 'fotos_direct_upload_assign') fotosRes = handleFotosDirectUploadAssign_(body);
      else if (action === 'fotos_upload_visual_override') fotosRes = handleFotosUploadVisualOverride_(body);
      else if (action === 'fotos_reorganize_from_sheets') fotosRes = handleFotosReorganizeFromSheets_(body);
      else if (action === 'fotos_sync_skus') fotosRes = handleFotosSyncSkus_(body);
      else fotosRes = handleFotosDelete_(body);

      if (shouldMintFreshToken && fotosRes && fotosRes.ok) {
        try {
          fotosRes.renewedAuthToken = issueInvAuthToken_(mintTokenEmail || OWNER_FOTOS_EMAIL_, TAB_CUENTAS_ADMIN_);
        } catch (eMint) {}
      }
      return jsonResponse_(fotosRes);
    }
    if (action === 'inv_setup_accounts') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_setup', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(organizarCuentasYDescuentosEnHojas({ silentUi: true }));
    }

    if (!hasValidAdminPin_(body && body.pin)) {
      return jsonResponse_({ ok: false, error: 'PIN de administrador incorrecto o no configurado' });
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
const TAB_CUENTAS_ADMIN_ = 'CUENTAS ADMINISTRATIVAS';
const MAX_GUEST_PLACES_PER_EMAIL_ = 2;

const ADMIN_MASTER_EMAILS_ = {
  'santiago.torres@grupoanipa.com': true,
  'kevin.reyna@grupoanipa.com': true
};

const ADMIN_PERM_COLUMNS_ = [
  { colIndex: 9,  header: 'VER_COTIZADOR',          key: 'cotizador' },
  { colIndex: 10, header: 'VER_SEGUIMIENTO',        key: 'seguimiento' },
  { colIndex: 11, header: 'VER_HISTORIAL',          key: 'historial' },
  { colIndex: 12, header: 'VER_FOTOS_APP',          key: 'fotosApp' },
  { colIndex: 13, header: 'VER_PROMPTS_IA',         key: 'promptsIa' },
  { colIndex: 14, header: 'VER_PANEL_SUITE',        key: 'panelSuite' },
  { colIndex: 15, header: 'VER_EQUIPO_Y_INVITADOS', key: 'equipoInvitados' },
  { colIndex: 16, header: 'VER_CAMBIAR_ROL',        key: 'cambiarRol' },
  { colIndex: 17, header: 'VER_GESTION_PRODUCTOS',  key: 'gestionProductos' },
  { colIndex: 18, header: 'VER_SUBIR_FOTO',         key: 'subirFoto' },
  { colIndex: 19, header: 'VER_CAMBIAR_TIENDA',     key: 'cambiarTienda' }
];

function defaultAdminPermissionsForEmail_(emailRaw) {
  const em = String(emailRaw || '').trim().toLowerCase().replace(/,/g, '.');
  const isOwnerKevin = (em === 'kevin.reyna@grupoanipa.com');
  return {
    cotizador: true,
    seguimiento: true,
    historial: true,
    fotosApp: isOwnerKevin,
    promptsIa: isOwnerKevin,
    panelSuite: isOwnerKevin,
    equipoInvitados: true,
    cambiarRol: true,
    gestionProductos: isOwnerKevin,
    subirFoto: true,
    cambiarTienda: true
  };
}

function parseAdminPermCell_(rawVal, fallbackBool) {
  if (rawVal === true) return true;
  if (rawVal === false) return false;
  const s = String(rawVal === null || rawVal === undefined ? '' : rawVal)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (!s) return !!fallbackBool;
  if (/^(SI|YES|TRUE|1|X|OK|VER|ACTIVO|HABILITADO)$/.test(s)) return true;
  if (/^(NO|FALSE|0|OCULTO|INACTIVO|DESHABILITADO|-)$/.test(s)) return false;
  return !!fallbackBool;
}

function extractAdminPermissionsFromRow_(headerRowVals, rowVals, dispRowVals, emailRaw) {
  const perms = defaultAdminPermissionsForEmail_(emailRaw);
  const hdr = Array.isArray(headerRowVals) ? headerRowVals : [];
  const raw = Array.isArray(rowVals) ? rowVals : [];
  const disp = Array.isArray(dispRowVals) ? dispRowVals : raw;

  const colByKey = {};
  for (let c = 0; c < hdr.length; c++) {
    const norm = String(hdr[c] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!norm) continue;
    for (let k = 0; k < ADMIN_PERM_COLUMNS_.length; k++) {
      const def = ADMIN_PERM_COLUMNS_[k];
      if (norm === def.header || norm.indexOf(def.header) !== -1) {
        colByKey[def.key] = c;
      }
    }
  }

  for (let k = 0; k < ADMIN_PERM_COLUMNS_.length; k++) {
    const def = ADMIN_PERM_COLUMNS_[k];
    const idx = (colByKey[def.key] !== undefined) ? colByKey[def.key] : def.colIndex;
    if (idx < disp.length || idx < raw.length) {
      const cellVal = (disp[idx] !== undefined && disp[idx] !== '') ? disp[idx] : raw[idx];
      perms[def.key] = parseAdminPermCell_(cellVal, perms[def.key]);
    }
  }
  return perms;
}

const UNIFIED_STORE_COLUMNS_ = [
  { colIndex: 21, headers: ['COLOCIO', 'COLOSIO', 'TIENDA_COLOCIO', 'TIENDA_COLOSIO'], tab: 'COLOCIO' },
  { colIndex: 22, headers: ['PLAYA', 'TIENDA_PLAYA'], tab: 'PLAYA' },
  { colIndex: 23, headers: ['PTC', 'PUERTO_CANCUN', 'TIENDA_PTC'], tab: 'PTC' },
  { colIndex: 24, headers: ['CASA_CREATA', 'TIENDA_CASA_CREATA'], tab: 'CASA CREATA' },
  { colIndex: 25, headers: ['PROYECTOS', 'TIENDA_PROYECTOS'], tab: 'PROYECTOS' }
];

function findStoreTabConfig_(tabKey) {
  const up = String(tabKey || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
  for (let i = 0; i < INV_USER_TABS_.length; i++) {
    const c = INV_USER_TABS_[i];
    if (!c.isAdmin && !c.isGuest && (c.tab.toUpperCase() === up || c.branchKey.toUpperCase() === up)) {
      return c;
    }
  }
  return null;
}

function inferStoreTabFromAreaLabel_(areaRaw) {
  const up = String(areaRaw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (!up) return '';
  if (up.indexOf('COLOCIO') !== -1 || up.indexOf('COLOSIO') !== -1) return 'COLOCIO';
  if (up.indexOf('PLAYA') !== -1) return 'PLAYA';
  if (up.indexOf('PTC') !== -1 || up.indexOf('PUERTO') !== -1) return 'PTC';
  if (up.indexOf('CASA') !== -1) return 'CASA CREATA';
  if (up.indexOf('PROYECTO') !== -1) return 'PROYECTOS';
  return '';
}

function isAdministrativeUnifiedRow_(correoRaw, areaColB, puestoColD, hasStoreCols) {
  const correo = String(correoRaw || '').trim().toLowerCase().replace(/,/g, '.');
  if (ADMIN_MASTER_EMAILS_[correo]) return true;
  const areaUp = String(areaColB || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const puestoUp = String(puestoColD || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (/ADMINISTRACI[OÓ]N|ADMINISTRADOR|ADMIN\s+GENERAL/.test(areaUp)) return true;
  if (/ADMINISTRADOR|ADMINISTRACI[OÓ]N|DIRECCI[OÓ]N|GERENCIA\s+GENERAL/.test(puestoUp)) return true;
  if (!hasStoreCols) {
    // Compatibilidad con hojas legadas de CUENTAS ADMINISTRATIVAS sin columnas de tiendas V:Z
    if (/(ASESOR|GERENTE\s+DE\s+TIENDA|GERENTE\s+COMERCIAL|COORDINADOR|ARQUITECT|INTERIORISTA)/.test(puestoUp)) {
      return false;
    }
    return true;
  }
  return false;
}

function extractAssignedStoresFromRow_(headerRowVals, rowVals, dispRowVals, areaColB) {
  const hdr = Array.isArray(headerRowVals) ? headerRowVals : [];
  const raw = Array.isArray(rowVals) ? rowVals : [];
  const disp = Array.isArray(dispRowVals) ? dispRowVals : raw;

  const colByTab = {};
  let detectedStoreHeader = false;
  for (let c = 0; c < hdr.length; c++) {
    const norm = String(hdr[c] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!norm) continue;
    for (let k = 0; k < UNIFIED_STORE_COLUMNS_.length; k++) {
      const def = UNIFIED_STORE_COLUMNS_[k];
      if (def.headers.indexOf(norm) !== -1) {
        colByTab[def.tab] = c;
        detectedStoreHeader = true;
      }
    }
  }

  const hasStoreCols = detectedStoreHeader || Math.max(disp.length, raw.length) >= 22;
  const stores = [];
  if (hasStoreCols) {
    for (let k = 0; k < UNIFIED_STORE_COLUMNS_.length; k++) {
      const def = UNIFIED_STORE_COLUMNS_[k];
      const idx = (colByTab[def.tab] !== undefined) ? colByTab[def.tab] : def.colIndex;
      if (idx < disp.length || idx < raw.length) {
        const cellVal = (disp[idx] !== undefined && disp[idx] !== '') ? disp[idx] : raw[idx];
        if (parseAdminPermCell_(cellVal, false) === true) {
          stores.push(def.tab);
        }
      }
    }
  }
  if (!stores.length) {
    const inferred = inferStoreTabFromAreaLabel_(areaColB);
    if (inferred) stores.push(inferred);
  }
  return { hasStoreCols: hasStoreCols, stores: stores };
}

function userHasAdminPerm_(advisor, permKey) {
  if (!advisor || isGuestReadOnlyUser_(advisor) || !advisor.isAdmin) return false;
  if (advisor.adminPermissions && typeof advisor.adminPermissions[permKey] === 'boolean') {
    return advisor.adminPermissions[permKey];
  }
  const defaults = defaultAdminPermissionsForEmail_(advisor.correo);
  return !!defaults[permKey];
}

function userHasEffectivePerm_(advisor, permKey) {
  if (!advisor || isGuestReadOnlyUser_(advisor)) return false;
  if (advisor.isAdmin) return userHasAdminPerm_(advisor, permKey);
  if (advisor.userPermissions && typeof advisor.userPermissions[permKey] === 'boolean') {
    return advisor.userPermissions[permKey];
  }
  return permKey === 'cotizador' || permKey === 'seguimiento' || permKey === 'subirFoto' || permKey === 'cambiarTienda';
}

function ensureCuentasAdministrativasSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = book.getSheetByName(TAB_CUENTAS_ADMIN_);
  const createdNew = !sh;
  if (!sh) {
    sh = book.insertSheet(TAB_CUENTAS_ADMIN_, book.getSheets().length);
  }
  if (sh.getMaxColumns() < 26) {
    sh.insertColumnsAfter(sh.getMaxColumns(), 26 - sh.getMaxColumns());
  }
  if (sh.getMaxRows() < 40) {
    sh.insertRowsAfter(sh.getMaxRows(), 40 - sh.getMaxRows());
  }
  const hdrRow = findUserHeaderRow1Based_(sh);
  if (createdNew || hdrRow < 1) {
    sh.getRange(1, 2, 1, 25).merge()
      .setValue('USUARIOS Y CUENTAS ADMINISTRATIVAS — PERMISOS POR COLUMNA (J:T) Y TIENDAS ASIGNADAS (V:Z) · CAMBIA SI / NO')
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('left');
    const hdrVals = [[
      '', 'TIPO / ÁREA', 'Nombre', 'Puesto', 'Correo', 'Contraseña Temporal', 'Contraseña', 'Asesor ERP', 'Descuento',
      'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA', 'VER_PANEL_SUITE',
      'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS', 'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA', 'NOTAS',
      'COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS'
    ]];
    sh.getRange(2, 1, 1, 26).setValues(hdrVals);
    sh.getRange(2, 2, 1, 8).setBackground('#252C32').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(2, 10, 1, 11).setBackground('#A38251').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(2, 21, 1, 6).setBackground('#252C32').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sh.setFrozenRows(2);
  }
  return sh;
}

function crearVerificarHojaAdministrativos() {
  const ss = getSpreadsheet_();
  const sh = ensureCuentasAdministrativasSheet_(ss);
  return { ok: true, sheetName: sh.getName() };
}

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
  const ss = getAuthSpreadsheet_(getSpreadsheet_());
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
  const devId = String(rawDeviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
  const devLabel = String(rawDeviceLabel || 'Navegador Web').replace(/[\[\]|]/g, ' ').trim().slice(0, 60) || 'Navegador Web';
  if (!email) {
    return { ok: false, error: 'Correo de invitado inválido.' };
  }
  let maxAllowedPlaces = Math.max(1, Math.min(50, Number(guestUser && guestUser.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
  const guestTabNorm = String((guestUser && guestUser.sheetTab) || '').trim().toUpperCase();
  if (guestTabNorm && !/^INVITADOS?$/.test(guestTabNorm)) {
    return { ok: true, slotNumber: 1, activeCount: 1, maxPlaces: maxAllowedPlaces, devices: [] };
  }
  if (!devId) {
    return { ok: false, error: 'Identificador de dispositivo requerido para cuentas de invitados.' };
  }

  const lockState = acquireScriptLockSafe_(5000);
  const lock = lockState && lockState.ok ? lockState.lock : null;
  try {
    const book = getAuthSpreadsheet_(ss);
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
      registrarEventoHistorial_(ss || getSpreadsheet_(), {
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
        invalidateBranchUsersCache_();
      } catch (eWriteSh) {}
    }

    return {
      ok: true,
      slotNumber: slotNumber,
      activeCount: devices.length,
      maxPlaces: maxAllowedPlaces,
      devices: devices
    };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRelG) {}
    }
  }
}

function readGuestDevicesSnapshot_(ss, guestUser) {
  const email = String((guestUser && guestUser.correo) || '').trim().toLowerCase();
  let maxAllowedPlaces = Math.max(1, Math.min(50, Number(guestUser && guestUser.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
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
    } else if (email) {
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
  if (devices.length === 0) {
    const wasExplicitlyClearedInSheet = targetRow > 0 && !sheetDevicesRaw && (!sheetPlacesText || /^0\s*\/\s*\d+$/.test(sheetPlacesText));
    if (!wasExplicitlyClearedInSheet && propKey) {
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

  return {
    sh: sh,
    targetRow: targetRow,
    maxAllowedPlaces: maxAllowedPlaces,
    devices: devices,
    propKey: propKey
  };
}

function revokeGuestDevicesInSheetAndProps_(ss, guestUser, targetDeviceId, currentDevId) {
  const snap = readGuestDevicesSnapshot_(ss, guestUser);
  const props = PropertiesService.getScriptProperties();
  const cleanCur = String(currentDevId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const cleanTgt = targetDeviceId === 'ALL_OTHERS'
    ? 'ALL_OTHERS'
    : String(targetDeviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);

  const removedDevices = [];
  const remaining = [];
  for (let i = 0; i < snap.devices.length; i++) {
    const d = snap.devices[i];
    if (!d || !d.id) continue;
    const dId = String(d.id).trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
    const shouldRemove = (cleanTgt === 'ALL_OTHERS')
      ? (!cleanCur || dId !== cleanCur)
      : Boolean(cleanTgt && dId === cleanTgt);
    if (shouldRemove) {
      removedDevices.push({ id: dId, label: String(d.label || 'Dispositivo') });
    } else {
      remaining.push(d);
    }
  }

  if (removedDevices.length > 0) {
    try {
      if (remaining.length > 0) {
        props.setProperty(snap.propKey, JSON.stringify(remaining));
      } else if (typeof props.deleteProperty === 'function') {
        props.deleteProperty(snap.propKey);
      } else {
        props.setProperty(snap.propKey, '[]');
      }
    } catch (ePropSave) {}

    if (snap.sh && snap.targetRow > 0) {
      try {
        if (snap.sh.getMaxColumns() < 10) {
          snap.sh.insertColumnsAfter(snap.sh.getMaxColumns(), 10 - snap.sh.getMaxColumns());
        }
        const statusI = remaining.length + ' / ' + snap.maxAllowedPlaces;
        const detailJ = formatGuestDevicesForSheet_(remaining, snap.maxAllowedPlaces);
        snap.sh.getRange(snap.targetRow, 8).setValue(snap.maxAllowedPlaces).setHorizontalAlignment('center').setFontWeight('bold');
        snap.sh.getRange(snap.targetRow, 9).setNumberFormat('@').setValue(statusI).setHorizontalAlignment('center').setFontWeight('bold');
        snap.sh.getRange(snap.targetRow, 10).setNumberFormat('@').setValue(detailJ);
        SpreadsheetApp.flush();
        invalidateBranchUsersCache_();
      } catch (eShWrite) {}
    }
  }

  let slotNumber = 1;
  if (cleanCur) {
    const idx = remaining.findIndex((d) => String((d && d.id) || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64) === cleanCur);
    if (idx !== -1) slotNumber = idx + 1;
  }

  return {
    removedDevices: removedDevices,
    remainingDevices: remaining,
    activeCount: remaining.length,
    maxPlaces: snap.maxAllowedPlaces,
    slotNumber: slotNumber
  };
}

function handleInvGuestHeartbeat_(body) {
  const verifiedTok = verifyInvAuthToken_(body && body.authToken);
  if (!verifiedTok || !verifiedTok.email) {
    return { ok: false, authRequired: true, error: 'Token de sesión de invitado inválido o expirado.' };
  }
  const email = String(verifiedTok.email || '').trim().toLowerCase();
  const devId = String((body && body.deviceId) || '').trim();
  const devLabel = String((body && body.deviceLabel) || '').trim();
  if (!email) {
    return { ok: false, error: 'Correo de invitado requerido.' };
  }
  const ss = getAuthSpreadsheet_();
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
  const sanitizedDevId = devId.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  if (!sanitizedDevId) {
    return { ok: false, error: 'Identificador de dispositivo requerido para invitados.' };
  }
  const devMap = readUserDevicesMap_(email);
  const devRec = devMap[sanitizedDevId];
  if (devRec && Number(devRec.revokedAt || 0) > 0) {
    return {
      ok: false,
      revoked: true,
      error: 'Tu sesión fue cerrada desde otro dispositivo. Inicia sesión nuevamente para continuar.'
    };
  }
  const devCheck = checkAndRegisterGuestDevice_(ss, guestMatch, sanitizedDevId, devLabel);
  if (!devCheck.ok) {
    return devCheck;
  }
  try {
    recordUserDeviceSession_(guestMatch, {
      deviceId: sanitizedDevId,
      deviceLabel: devLabel || 'Dispositivo',
      erpStore: 'INVITADOS (SOLO VER)',
      sheetTab: guestMatch.sheetTab || 'INVITADOS'
    }, 'inventario', true);
  } catch (eRecGuest) {}
  try {
    recordInvPresence_(guestMatch, 'inventario', true);
  } catch (eGuestPres) {}
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
    if (!constantTimeEquals_(expectedSig, sigPart)) return null;
    const parts = payload.split('|');
    if (parts.length < 3) return null;
    const email = String(parts[0] || '').trim().toLowerCase();
    const sheetTab = String(parts[1] || '').trim();
    const issuedMs = Number(parts[2] || 0);
    if (!email || !sheetTab || !issuedMs) return null;
    // Vigencia de 90 días
    if (Date.now() - issuedMs > 90 * 24 * 3600 * 1000) return null;
    // Revocación inmediata si el usuario cambió contraseña después de emitir este token
    const keyEpoch = getKeyEpochForEmail_(email);
    if (keyEpoch > 0 && issuedMs < keyEpoch) return null;
    return { email: email, sheetTab: sheetTab, issuedMs: issuedMs };
  } catch (e) {
    return null;
  }
}

function extractAuthTokenFromRequest_(e, body) {
  const fromBody = body && (body.authToken || body.token);
  if (fromBody) return String(fromBody).trim();
  const fromParam = e && e.parameter && (e.parameter.authToken || e.parameter.token);
  return fromParam ? String(fromParam).trim() : '';
}

function hasValidAdminPin_(pinRaw) {
  const cfgPin = getProp_('ADMIN_PIN');
  const provided = String(pinRaw || '').trim();
  return !!(cfgPin && provided && constantTimeEquals_(provided, cfgPin));
}

function makeShortCacheKey_(prefix, rawKey) {
  try {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(rawKey || 'anon'));
    return prefix + bytesToHex_(digest).slice(0, 32);
  } catch (e) {
    return prefix + String(rawKey || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  }
}

function checkRateLimitSilent_(bucketKey, maxHits, windowSec) {
  try {
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('rl_', bucketKey);
    const cur = parseInt(cache.get(key) || '0', 10) || 0;
    const next = cur + 1;
    cache.put(key, String(next), Math.max(10, Number(windowSec) || 60));
    return next <= (Number(maxHits) || 30);
  } catch (e) {
    return true;
  }
}

function checkLoginThrottle_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return true;
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('lf_', clean);
    const fails = parseInt(cache.get(key) || '0', 10) || 0;
    return fails < 8;
  } catch (e) {
    return true;
  }
}

function recordLoginFailure_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return;
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('lf_', clean);
    const fails = (parseInt(cache.get(key) || '0', 10) || 0) + 1;
    cache.put(key, String(fails), 600);
  } catch (e) {}
}

function clearLoginFailures_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return;
    CacheService.getScriptCache().remove(makeShortCacheKey_('lf_', clean));
  } catch (e) {}
}

function isGuestReadOnlyUser_(u) {
  if (!u) return false;
  const tabNorm = String(u.sheetTab || '').trim().toUpperCase();
  const puestoNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return !!(
    u.isGuest ||
    u.soloLectura ||
    /^INVITADOS?$/.test(tabNorm) ||
    /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(puestoNorm)
  );
}

function lookupTokenUserStatus_(tokenInfo) {
  if (!tokenInfo || !tokenInfo.email) return { exists: false, isGuest: true };
  const cleanEmail = String(tokenInfo.email || '').trim().toLowerCase();
  if (!cleanEmail) return { exists: false, isGuest: true };
  if (ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[cleanEmail]) {
    return { exists: true, isGuest: false };
  }
  const tabNorm = String(tokenInfo.sheetTab || '').trim().toUpperCase();
  try {
    const allUsers = readAllBranchUsers_(null, []);
    if (!Array.isArray(allUsers) || allUsers.length === 0) {
      return { exists: true, isGuest: /^INVITADOS?$/.test(tabNorm) };
    }
    const matches = allUsers.filter((u) => u && u.correo === cleanEmail);
    if (!matches.length) {
      return { exists: false, isGuest: true };
    }
    const exactTabMatches = tabNorm
      ? matches.filter((u) => tabsMatchNormalized_(u.sheetTab, tabNorm) || tabsMatchNormalized_(u.branchKey, tabNorm))
      : [];
    const toCheck = exactTabMatches.length > 0 ? exactTabMatches : matches;
    const isRoGuest = /^INVITADOS?$/.test(tabNorm) || toCheck.every((u) => isGuestReadOnlyUser_(u));
    return { exists: true, isGuest: isRoGuest };
  } catch (eLookup) {
    return { exists: true, isGuest: /^INVITADOS?$/.test(tabNorm) };
  }
}

function isTokenUserReadOnlyGuest_(tokenInfo) {
  if (!tokenInfo || !tokenInfo.email) return true;
  const cleanEmail = String(tokenInfo.email || '').trim().toLowerCase();
  if (!cleanEmail) return true;
  if (ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[cleanEmail]) return false;
  const tabNorm = String(tokenInfo.sheetTab || '').trim().toUpperCase();
  if (/^INVITADOS?$/.test(tabNorm)) return true;

  const status = lookupTokenUserStatus_(tokenInfo);
  if (!status.exists) return true;
  return !!status.isGuest;
}

function authorizePrivateTokenOrPin_(e, body, opts) {
  const cfg = opts || {};
  const rateBucket = String(cfg.rateBucket || 'priv');
  const maxHits = Number(cfg.maxHits) || 45;
  const windowSec = Number(cfg.windowSec) || 60;
  const reqPin = (body && body.pin) || (e && e.parameter && e.parameter.pin) || '';
  const rawDevId = cfg.keyByDevice
    ? String((body && (body.deviceId || body.clientId)) || (e && e.parameter && (e.parameter.deviceId || e.parameter.clientId)) || '').trim().slice(0, 64)
    : '';
  const devSuffix = rawDevId ? (':' + rawDevId) : '';

  if (cfg.allowAdminPin && hasValidAdminPin_(reqPin)) {
    if (!checkRateLimitSilent_(rateBucket + ':pin' + devSuffix, maxHits, windowSec)) {
      return { ok: false, rateLimited: true };
    }
    return { ok: true, viaPin: true, tokenInfo: null };
  }

  const token = extractAuthTokenFromRequest_(e, body);
  const tokenInfo = verifyInvAuthToken_(token);
  if (!tokenInfo || !tokenInfo.email) {
    return { ok: false };
  }

  if (!checkRateLimitSilent_(rateBucket + ':' + tokenInfo.email + devSuffix, maxHits, windowSec)) {
    return { ok: false, rateLimited: true, tokenInfo: tokenInfo };
  }

  const tokenStatus = lookupTokenUserStatus_(tokenInfo);
  if (!tokenStatus.exists) {
    return { ok: false };
  }

  const isGuestTab = /^INVITADOS?$/.test(String(tokenInfo.sheetTab || '').trim().toUpperCase()) || tokenStatus.isGuest;
  if (!cfg.allowGuest && isGuestTab) {
    return { ok: false };
  }

  if (cfg.requireAdmin) {
    if (isGuestTab) return { ok: false };
    const isKnownMaster = !!(ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[tokenInfo.email]);
    if (!isKnownMaster) {
      try {
        const ssChk = getSpreadsheet_();
        const erpMetaChk = readErpAdvisorsFromPlantilla_(ssChk);
        const authChk = resolveAuthenticatedAdvisor_(ssChk, erpMetaChk.advisors, { authToken: token });
        if (!authChk || !authChk.ok || !authChk.advisor || !authChk.advisor.isAdmin) {
          return { ok: false };
        }
      } catch (eAdm) {
        return { ok: false };
      }
    }
  }

  return { ok: true, viaPin: false, tokenInfo: tokenInfo };
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
    const minTokLen = Math.max(1, Math.min(uToks.length, a.tokens.length));
    const maxTokLen = Math.max(1, Math.max(uToks.length, a.tokens.length));
    const ratio = overlap / minTokLen;
    const exactName = (overlap === uToks.length && overlap === a.tokens.length) ? 1 : 0;
    const fullCoverage = (overlap >= 2 && overlap === minTokLen) ? 1 : 0;
    const score = (exactName * 1000) + (fullCoverage * 300) + (overlap * 100) + (ratio * 50) + ((overlap / maxTokLen) * 20) + (sameStore * 10);
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

const INV_BRANCH_USERS_CACHE_KEY_ = 'INV_BRANCH_USERS_CACHE_V1';
const INV_BRANCH_USERS_CACHE_TTL_SEC_ = 300; // 5 minutos

function invalidateBranchUsersCache_() {
  try {
    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      CacheService.getScriptCache().remove(INV_BRANCH_USERS_CACHE_KEY_);
    }
  } catch (e) {}
}

function readAllBranchUsers_(ss, erpAdvisors, opts) {
  const advisorsList = Array.isArray(erpAdvisors) ? erpAdvisors : [];
  const canUseCache = advisorsList.length === 0 && !(opts && opts.bypassCache);

  if (canUseCache) {
    try {
      if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
        const cachedRaw = CacheService.getScriptCache().get(INV_BRANCH_USERS_CACHE_KEY_);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch (eCacheRead) {}
  }

  const targetSs = getAuthSpreadsheet_(ss);
  const list = [];
  const seenEmailTab = {};
  const adminPermsByEmail = {};
  // Leer primero CUENTAS ADMINISTRATIVAS para priorizar la hoja unificada (A:Z) y luego cualquier hoja legada o INVITADOS
  const orderedTabs = INV_USER_TABS_.slice().sort((a, b) => {
    const ra = a.tab === TAB_CUENTAS_ADMIN_ ? 0 : (a.isGuest ? 2 : 1);
    const rb = b.tab === TAB_CUENTAS_ADMIN_ ? 0 : (b.isGuest ? 2 : 1);
    return ra - rb;
  });

  for (let t = 0; t < orderedTabs.length; t++) {
    const cfg = orderedTabs[t];
    let sh = targetSs.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = targetSs.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(targetSs);
    if (!sh) continue;

    const hdrRow = findUserHeaderRow1Based_(sh);
    if (!cfg.isGuest && (hdrRow < 1 || sh.getLastRow() <= hdrRow)) continue;
    if (cfg.isGuest && sh.getLastRow() < 1) continue;

    const actualTabName = sh.getName();
    const startRow = hdrRow >= 1 ? (hdrRow + 1) : 1;
    const numRows = sh.getLastRow() - startRow + 1;
    if (numRows <= 0) continue;

    const isUnifiedTab = (cfg.tab === TAB_CUENTAS_ADMIN_);
    const maxReadCols = isUnifiedTab ? 26 : 10;
    const colsToRead = Math.min(sh.getMaxColumns(), maxReadCols);
    const hdrVals = (isUnifiedTab && hdrRow >= 1)
      ? (sh.getRange(hdrRow, 1, 1, colsToRead).getDisplayValues()[0] || [])
      : [];
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues();

    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      const dr = dispVals[i] || [];
      const correo = cfg.isGuest
        ? extractEmailFromGuestRow_(r)
        : String(r[4] || '').trim().toLowerCase().replace(/,/g, '.');
      if (!correo || correo.indexOf('@') === -1) continue;

      const tempKey = colsToRead >= 6 ? cleanSheetKeyCell_(r[5]) : '';
      const defKey = colsToRead >= 7 ? cleanSheetKeyCell_(r[6]) : '';
      const colB = colsToRead >= 2 ? String(dr[1] || r[1] || '').trim() : '';
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

      const isGuestRole = !ADMIN_MASTER_EMAILS_[correo] && isGuestReadOnlyUser_({
        puesto: puesto,
        sheetTab: actualTabName,
        isGuest: false,
        soloLectura: false
      });

      const resolveErpForStore = (storeErpName) => {
        let matched = null;
        if (explicitAdvisorId && advisorsList.length > 0) {
          for (let k = 0; k < advisorsList.length; k++) {
            if (String(advisorsList[k].id) === String(explicitAdvisorId)) {
              matched = advisorsList[k];
              break;
            }
          }
        }
        if (!matched) {
          matched = matchBestErpAdvisor_(nombre, storeErpName, advisorsList);
        }
        return {
          label: (matched && matched.label) || explicitAdvisorLabel || '',
          id: (matched && matched.id) || explicitAdvisorId || '',
          branch: (matched && matched.branch) || ''
        };
      };

      if (isUnifiedTab) {
        const rowPerms = extractAdminPermissionsFromRow_(hdrVals, r, dr, correo);
        const storeInfo = extractAssignedStoresFromRow_(hdrVals, r, dr, colB);
        const isAdminUser = !isGuestRole && isAdministrativeUnifiedRow_(correo, colB, puesto, storeInfo.hasStoreCols);

        if (isAdminUser) {
          adminPermsByEmail[correo] = rowPerms;
          const singleStCfg = storeInfo.stores.length === 1 ? findStoreTabConfig_(storeInfo.stores[0]) : null;
          const defaultAdminErp = singleStCfg ? singleStCfg.erpStore : cfg.erpStore;
          const erpInfo = resolveErpForStore(defaultAdminErp);
          const userErpStore = erpInfo.branch || defaultAdminErp;
          const userPrefix = getStoreFolioPrefix_(userErpStore, singleStCfg ? singleStCfg.orderPrefix : cfg.orderPrefix);
          const dedupKey = correo + '::' + actualTabName.toUpperCase();
          if (!seenEmailTab[dedupKey]) {
            seenEmailTab[dedupKey] = true;
            list.push({
              sheetTab: actualTabName,
              sourceSheetTab: actualTabName,
              rowNum: startRow + i,
              isAdmin: true,
              isGuest: false,
              soloLectura: false,
              maxDiscountPct: explicitDiscountPct,
              branchKey: 'ADMIN',
              branchLabel: cfg.label,
              erpStore: userErpStore,
              orderPrefix: userPrefix,
              quoteType: 'ADMINISTRATIVO',
              isProyecto: false,
              serieLabel: cfg.serieLabel,
              nombre: nombre,
              puesto: puesto,
              correo: correo,
              tempKey: tempKey,
              defKey: defKey,
              mustChangeKey: !defKey && !!tempKey,
              erpAdvisorLabel: erpInfo.label,
              erpAdvisorId: erpInfo.id,
              erpAdvisorBranch: erpInfo.branch,
              adminPermissions: rowPerms,
              userPermissions: rowPerms,
              assignedStores: storeInfo.stores.slice()
            });
          }
          continue;
        }

        // Usuario de tienda / proyectos consolidado en CUENTAS ADMINISTRATIVAS -> expandir columnas V:Z (SI)
        const targetStores = storeInfo.stores.length ? storeInfo.stores : ['PROYECTOS'];
        for (let sIdx = 0; sIdx < targetStores.length; sIdx++) {
          const stCfg = findStoreTabConfig_(targetStores[sIdx]) || findStoreTabConfig_('PROYECTOS');
          if (!stCfg) continue;
          const dedupKey = correo + '::' + stCfg.tab.toUpperCase();
          if (seenEmailTab[dedupKey]) continue;
          seenEmailTab[dedupKey] = true;
          const erpInfo = resolveErpForStore(stCfg.erpStore);
          const userPrefix = getStoreFolioPrefix_(stCfg.erpStore, stCfg.orderPrefix);
          list.push({
            sheetTab: stCfg.tab,
            sourceSheetTab: actualTabName,
            rowNum: startRow + i,
            isAdmin: false,
            isGuest: false,
            soloLectura: isGuestRole,
            maxDiscountPct: isGuestRole ? 0 : explicitDiscountPct,
            branchKey: stCfg.branchKey,
            branchLabel: stCfg.label,
            erpStore: stCfg.erpStore,
            orderPrefix: userPrefix,
            quoteType: stCfg.quoteType,
            isProyecto: !!stCfg.isProyecto,
            serieLabel: stCfg.serieLabel,
            nombre: nombre,
            puesto: puesto,
            correo: correo,
            tempKey: tempKey,
            defKey: defKey,
            mustChangeKey: !defKey && !!tempKey,
            erpAdvisorLabel: erpInfo.label,
            erpAdvisorId: erpInfo.id,
            erpAdvisorBranch: erpInfo.branch,
            adminPermissions: null,
            userPermissions: rowPerms,
            assignedStores: targetStores.slice()
          });
        }
        continue;
      }

      // Compatibilidad con hojas legadas de tienda si aún existieran
      const dedupKey = correo + '::' + actualTabName.toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
      if (seenEmailTab[dedupKey]) continue;
      seenEmailTab[dedupKey] = true;

      const erpInfo = resolveErpForStore(cfg.erpStore);
      const isAdminUser = !isGuestRole && (!!ADMIN_MASTER_EMAILS_[correo] || /ADMINISTRADOR/i.test(puesto));
      const userErpStore = (isAdminUser && erpInfo.branch) ? erpInfo.branch : cfg.erpStore;
      const userPrefix = getStoreFolioPrefix_(userErpStore, cfg.orderPrefix);

      list.push({
        sheetTab: actualTabName,
        sourceSheetTab: actualTabName,
        rowNum: startRow + i,
        isAdmin: isAdminUser,
        isGuest: false,
        soloLectura: isGuestRole,
        maxDiscountPct: isGuestRole ? 0 : explicitDiscountPct,
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
        erpAdvisorLabel: erpInfo.label,
        erpAdvisorId: erpInfo.id,
        erpAdvisorBranch: erpInfo.branch,
        adminPermissions: isAdminUser ? defaultAdminPermissionsForEmail_(correo) : null
      });
    }
  }

  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (!u || u.isGuest || !u.correo) continue;
    if (adminPermsByEmail[u.correo]) {
      u.isAdmin = true;
      u.adminPermissions = adminPermsByEmail[u.correo];
    } else if (u.isAdmin && !u.adminPermissions) {
      u.adminPermissions = defaultAdminPermissionsForEmail_(u.correo);
    }
  }

  if (canUseCache) {
    try {
      const json = JSON.stringify(list);
      if (utf8ByteLength_(json) <= 95000 && typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
        CacheService.getScriptCache().put(INV_BRANCH_USERS_CACHE_KEY_, json, INV_BRANCH_USERS_CACHE_TTL_SEC_);
      }
    } catch (eCachePut) {}
  }

  return list;
}

function sanitizeUserForClient_(u, includeSignedToken) {
  const isGuest = isGuestReadOnlyUser_(u) || !!(u && String(u.branchKey || '').trim().toUpperCase() === 'INVITADOS');
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
  if (!isGuest && out.isAdmin) {
    out.adminPermissions = u.adminPermissions || defaultAdminPermissionsForEmail_(u.correo);
  }
  if (!isGuest && u.userPermissions && typeof u.userPermissions === 'object') {
    out.userPermissions = u.userPermissions;
  }
  if (!isGuest && Array.isArray(u.assignedStores) && u.assignedStores.length) {
    out.assignedStores = u.assignedStores.slice();
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
  try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (e) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const users = readAllBranchUsers_(ss, erpMeta.advisors);
  return {
    ok: true,
    stores: erpMeta.stores,
    advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id })),
    users: users.map((u) => sanitizeUserForClient_(u, false))
  };
}

function filterScopedDirectoryUsers_(allUsers, verifiedUser, userMatchesOpt) {
  const list = Array.isArray(allUsers) ? allUsers : [];
  if (!verifiedUser || isGuestReadOnlyUser_(verifiedUser)) return [];
  const cleanSelf = String(verifiedUser.correo || '').trim().toLowerCase();
  const nonGuests = list.filter((u) => u && !isGuestReadOnlyUser_(u));
  if (verifiedUser.isAdmin) {
    return nonGuests.map((u) => sanitizeUserForClient_(u, false));
  }
  if (isManagerUserRole_(verifiedUser)) {
    const allowedStores = {};
    const selfRows = Array.isArray(userMatchesOpt) && userMatchesOpt.length ? userMatchesOpt : [verifiedUser];
    for (let i = 0; i < selfRows.length; i++) {
      const sr = selfRows[i];
      if (!sr || isGuestReadOnlyUser_(sr)) continue;
      const stNorm = normalizeQuoteErpStore_(sr.erpStore, sr.sheetTab);
      if (stNorm) allowedStores[stNorm] = true;
    }
    return nonGuests
      .filter((u) => {
        const em = String(u.correo || '').trim().toLowerCase();
        if (em === cleanSelf) return true;
        if (u.isAdmin) return false;
        const uSt = normalizeQuoteErpStore_(u.erpStore, u.sheetTab);
        return !!(uSt && allowedStores[uSt]);
      })
      .map((u) => sanitizeUserForClient_(u, false));
  }
  return nonGuests
    .filter((u) => String(u.correo || '').trim().toLowerCase() === cleanSelf)
    .map((u) => sanitizeUserForClient_(u, false));
}

function handleInvMyDirectory_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const auth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
  if (!auth || !auth.ok || !auth.advisor || isGuestReadOnlyUser_(auth.advisor)) {
    return { ok: false, authRequired: true };
  }
  return {
    ok: true,
    users: filterScopedDirectoryUsers_(auth.allUsers, auth.advisor, auth.userMatches)
  };
}

function keysEqualNormalized_(inputVal, storedVal) {
  const a = String(inputVal || '').trim();
  const b = String(storedVal || '').trim();
  if (!a || !b) return false;
  const iterMatch = /^sha256i\$(\d+)\$([a-zA-Z0-9_-]{8,})\$([a-f0-9]{64})$/i.exec(b);
  if (iterMatch) {
    const iters = Math.max(1, Math.min(PASSWORD_HASH_MAX_ITERS_, parseInt(iterMatch[1], 10) || PASSWORD_HASH_DEFAULT_ITERS_));
    const candidateHash = hashUserPassword_(a, iterMatch[2], iters);
    return constantTimeEquals_(candidateHash, b);
  }
  const legacyMatch = /^sha256\$([a-zA-Z0-9_-]{8,})\$([a-f0-9]{64})$/i.exec(b);
  if (legacyMatch) {
    const legacyDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, legacyMatch[1] + ':' + a);
    const candidateLegacy = 'sha256$' + legacyMatch[1] + '$' + bytesToHex_(legacyDigest);
    return constantTimeEquals_(candidateLegacy, b);
  }
  if (constantTimeEquals_(a, b)) return true;
  const aCompact = a.replace(/\s+/g, '');
  const bCompact = b.replace(/\s+/g, '');
  return !!aCompact && constantTimeEquals_(aCompact, bCompact);
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
  if (!checkLoginThrottle_(email)) {
    return { ok: false };
  }

  ensureLiveErpSyncTrigger_();
  const ss = getSpreadsheet_();
  const authSs = getAuthSpreadsheet_(ss);
  try { ensureInvitadosSheet_(authSs); } catch (eInv) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const allUsers = readAllBranchUsers_(authSs, erpMeta.advisors);
  const emailMatches = allUsers.filter((u) => u.correo === email);
  if (!emailMatches.length) {
    recordLoginFailure_(email);
    return { ok: false, error: 'El correo ingresado no está registrado en ninguna hoja de sucursal ni en INVITADOS.' };
  }

  const keyMatchCache = Object.create(null);
  const matchesInputKey = (storedHash) => {
    const k = String(storedHash || '');
    if (!k) return false;
    if (Object.prototype.hasOwnProperty.call(keyMatchCache, k)) {
      return keyMatchCache[k];
    }
    const matched = keysEqualNormalized_(inputKey, k);
    keyMatchCache[k] = matched;
    return matched;
  };

  const validMatches = emailMatches.filter((u) => {
    if (u.isGuest && u.noPasswordRequired) {
      return true;
    }
    if (!inputKey) return false;
    if (u.defKey) {
      return matchesInputKey(u.defKey);
    }
    if (u.tempKey) {
      return matchesInputKey(u.tempKey);
    }
    return false;
  });

  if (!validMatches.length) {
    if (!inputKey) {
      return { ok: false, error: 'Ingresa tu contraseña para acceder con tu cuenta.' };
    }
    recordLoginFailure_(email);
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

  clearLoginFailures_(email);

  // Si el usuario está dado de alta en varias tiendas/bodegas y su contraseña ya fue validada en al menos una de ellas,
  // incluir todas las tiendas/bodegas donde esté registrado su correo para que pueda elegir y cambiar de tienda libremente.
  const hasValidNonGuestMatch = validMatches.some((u) => !isGuestReadOnlyUser_(u));
  const candidateMatches = hasValidNonGuestMatch
    ? emailMatches.filter((u) => !isGuestReadOnlyUser_(u))
    : validMatches;
  const matchedViaDefKey = validMatches.some((u) => !!u.defKey && matchesInputKey(u.defKey));
  const hasAnyDefKeyForEmail = candidateMatches.some((u) => !!u.defKey);

  // Si la cuenta que inicia sesión pertenece a INVITADOS, verificar y registrar el límite de dispositivos configurado en Columna H
  const checkedMatches = [];
  let guestLimitError = null;
  for (let mIdx = 0; mIdx < candidateMatches.length; mIdx++) {
    const cand = candidateMatches[mIdx];
    const isInvitadosTabRow = /^INVITADOS?$/.test(String((cand && cand.sheetTab) || '').trim().toUpperCase());
    if (cand.isGuest && isInvitadosTabRow) {
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
    const usedTemp = !matchedViaDefKey && !hasAnyDefKeyForEmail && !u.defKey && ((!!u.tempKey && matchesInputKey(u.tempKey)) || (u.isGuest && u.noPasswordRequired));
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
    try { recordInvPresence_(authorizedLocs[0], 'login', true); } catch (ePres) {}
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

  try { recordInvPresence_(chosenOut, 'login', true); } catch (ePres) {}
  if (deviceId) {
    try {
      recordUserDeviceSession_(chosenOut, {
        deviceId: deviceId,
        deviceLabel: deviceLabel || 'Dispositivo',
        erpStore: chosenOut.isGuest ? 'INVITADOS (SOLO VER)' : (chosenOut.erpStore || chosenOut.sheetTab || ''),
        sheetTab: chosenOut.sheetTab || '',
        sessionStartedMs: Date.now()
      }, 'login', true, { clearRevoked: true });
    } catch (eDevSess) {}
  }

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
  if (newKey.length < 8) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }
  if (!checkLoginThrottle_(email)) {
    return { ok: false };
  }

  const ss = getSpreadsheet_();
  const authSs = getAuthSpreadsheet_(ss);
  const tokenCheck = verifyInvAuthToken_(body.authToken);
  const tokenMatchesEmail = !!(tokenCheck && tokenCheck.email === email);
  const matchedTargets = [];
  let anyAuthorized = false;

  for (let t = 0; t < INV_USER_TABS_.length; t++) {
    const cfg = INV_USER_TABS_[t];
    let sh = authSs.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = authSs.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(authSs);
    if (!sh) continue;
    const hdrRow = findUserHeaderRow1Based_(sh);
    if (hdrRow < 1 || sh.getLastRow() <= hdrRow) continue;
    const startRow = hdrRow + 1;
    const numRows = sh.getLastRow() - hdrRow;
    const isUnified = (cfg.tab === TAB_CUENTAS_ADMIN_);
    const colsToRead = Math.min(sh.getMaxColumns(), isUnified ? 26 : 7);
    const hdrVals = isUnified ? (sh.getRange(hdrRow, 1, 1, colsToRead).getDisplayValues()[0] || []) : [];
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = isUnified ? sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues() : vals;
    for (let i = 0; i < vals.length; i++) {
      const rowEmail = cfg.isGuest ? extractEmailFromGuestRow_(vals[i]) : String(vals[i][4] || '').trim().toLowerCase().replace(/,/g, '.');
      if (rowEmail !== email) continue;
      const tempKey = cleanSheetKeyCell_(vals[i][5]);
      const defKey = cleanSheetKeyCell_(vals[i][6]);
      if (currentKey && (keysEqualNormalized_(currentKey, tempKey) || keysEqualNormalized_(currentKey, defKey))) {
        anyAuthorized = true;
      } else if (tokenMatchesEmail && !defKey && (!!tempKey || cfg.isGuest)) {
        // Permite completar el cambio obligatorio de contraseña temporal con token HMAC válido incluso si el teléfono recargó la vista
        anyAuthorized = true;
      }
      const extraTabs = [];
      if (isUnified) {
        const colB = String((dispVals[i] && dispVals[i][1]) || vals[i][1] || '').trim();
        const stInfo = extractAssignedStoresFromRow_(hdrVals, vals[i], dispVals[i], colB);
        if (stInfo.stores.length) {
          for (let sIdx = 0; sIdx < stInfo.stores.length; sIdx++) {
            extraTabs.push(stInfo.stores[sIdx]);
          }
        } else {
          extraTabs.push('PROYECTOS');
        }
      }
      matchedTargets.push({ sh: sh, rowNum: startRow + i, tabName: sh.getName(), extraTabs: extraTabs });
    }
  }

  if (!matchedTargets.length || !anyAuthorized) {
    recordLoginFailure_(email);
    return { ok: false, error: 'Contraseña actual incorrecta.' };
  }
  clearLoginFailures_(email);

  const hashEnabled = getProp_('HASH_USER_PASSWORDS') !== '0';
  const storedKeyVal = hashEnabled ? hashUserPassword_(newKey) : newKey;
  bumpKeyEpochForEmail_(email);

  const tokensByTab = {};
  for (let k = 0; k < matchedTargets.length; k++) {
    const tgt = matchedTargets[k];
    // Borrar la contraseña temporal (Columna F = 6) y guardar la nueva definitiva (Columna G = 7)
    tgt.sh.getRange(tgt.rowNum, 6).clearContent();
    tgt.sh.getRange(tgt.rowNum, 7).setNumberFormat('@').setValue(storedKeyVal);
    tokensByTab[tgt.tabName] = issueInvAuthToken_(email, tgt.tabName);
    if (Array.isArray(tgt.extraTabs)) {
      for (let eIdx = 0; eIdx < tgt.extraTabs.length; eIdx++) {
        const stName = tgt.extraTabs[eIdx];
        if (stName && !tokensByTab[stName]) {
          tokensByTab[stName] = issueInvAuthToken_(email, stName);
        }
      }
    }
  }
  if (activeTab && !tokensByTab[activeTab]) {
    tokensByTab[activeTab] = issueInvAuthToken_(email, activeTab);
  }

  SpreadsheetApp.flush();
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
    analisis: 'Tokens anteriores revocados y nuevos tokens de sesión emitidos.'
  });
  invalidateBranchUsersCache_();

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
    const reqEmail = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
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
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u) && (tabsMatchNormalized_(u.sheetTab, reqTab) || tabsMatchNormalized_(u.branchKey, reqTab))) || null;
  }
  if (!chosen && reqStore) {
    const reqStoreNorm = normalizeQuoteErpStore_(reqStore, reqTab);
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u) && normalizeQuoteErpStore_(u.erpStore, u.sheetTab) === reqStoreNorm) || null;
  }
  if (!chosen && tokenTab) {
    chosen = userMatches.find((u) => tabsMatchNormalized_(u.sheetTab, tokenTab) || tabsMatchNormalized_(u.branchKey, tokenTab)) || null;
  }
  if (!chosen) {
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u)) || userMatches[0];
  }

  if (!chosen) {
    return {
      ok: false,
      authRequired: true,
      error: 'Tu correo no tiene permisos asignados en la ubicación solicitada.'
    };
  }

  const hasAnyDefKey = userMatches.some((u) => !!u.defKey);
  if (chosen.mustChangeKey && !chosen.noPasswordRequired && !hasAnyDefKey) {
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
    'NOTAS',
    'ORIGEN_CREACION'
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
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
  } else {
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    if (!String(sh.getRange(1, 25).getDisplayValue() || '').trim()) {
      sh.getRange(1, 25)
        .setValue('ORIGEN_CREACION')
        .setBackground('#252C32')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
    }
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
              clientName: extractXmlTag_(blk, 'Nombre') || extractXmlTag_(blk, 'Cliente') || 'Prospecto CREATA',
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

function buildNextFolioByStoreMap_(maxByPrefix) {
  const nextFolioByStore = {};
  Object.keys(ERP_STORE_FOLIO_SERIES_).forEach((storeName) => {
    const pfx = ERP_STORE_FOLIO_SERIES_[storeName];
    if (maxByPrefix && maxByPrefix[pfx] && maxByPrefix[pfx] > 0) {
      nextFolioByStore[storeName] = pfx + String(maxByPrefix[pfx] + 1);
    }
  });
  return nextFolioByStore;
}

/**
 * Baseline local rápido de folios: usa caché inv_erp_folios_v1 si está tibia o lee COTIZACIONES_EN_VIVO
 * sin disparar descarga XML completa ObtenerCotizacionesTodas.
 */
function readLocalFoliosBaseline_(ss) {
  const maxByPrefix = {};
  let recentErpQuotes = [];

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
      }
    }
  } catch (ce) {}

  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const qCols = shQuotes.getRange(2, 1, shQuotes.getLastRow() - 1, 2).getDisplayValues();
    for (let i = 0; i < qCols.length; i++) {
      observeFolioString_(qCols[i][1], maxByPrefix);
      observeFolioString_(qCols[i][0], maxByPrefix);
    }
  }

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: buildNextFolioByStoreMap_(maxByPrefix),
    recentErpQuotes: recentErpQuotes
  };
}

/**
 * Actualiza maxByPrefix y la caché inv_erp_folios_v1 localmente en 0 ms tras emitir una cotización,
 * evitando re-descargar ObtenerCotizacionesTodas post-envío.
 */
function updateFoliosCacheLocally_(folioSnap, newFolio) {
  const maxByPrefix = {};
  const srcMax = (folioSnap && folioSnap.maxByPrefix) || {};
  Object.keys(srcMax).forEach((k) => {
    maxByPrefix[k] = Number(srcMax[k]) || 0;
  });
  observeFolioString_(newFolio, maxByPrefix);
  const recentErpQuotes = (folioSnap && Array.isArray(folioSnap.recentErpQuotes)) ? folioSnap.recentErpQuotes : [];
  try {
    CacheService.getScriptCache().put('inv_erp_folios_v1', JSON.stringify({
      maxByPrefix: maxByPrefix,
      recentErpQuotes: recentErpQuotes
    }), 45);
  } catch (cePut) {}

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: buildNextFolioByStoreMap_(maxByPrefix),
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
  if (isGuestReadOnlyUser_(verifiedUser)) return false;
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
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return {
      quotes: [],
      roleScope: 'INVITADO',
      activeStore: 'SOLO LECTURA',
      allowedAdvisorEmails: []
    };
  }
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
  const numCols = Math.min(Math.max(shQuotes.getLastColumn(), 24), 25);
  const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, numCols).getDisplayValues();
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
      status: r[22] || '',
      originCreation: String((r && r[24]) || '').trim()
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
  if (isGuestReadOnlyUser_(u)) {
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
  if (!userHasEffectivePerm_(u, 'cotizador')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
    };
  }
  const shQuotes = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const folioSnap = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
  const canSwitchStore = userHasAdminPerm_(u, 'cambiarTienda');
  const targetStore = (canSwitchStore && body && body.erpStore) ? String(body.erpStore).trim() : u.erpStore;
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
    const safeTokenXml = xmlEscape_(sess.token);
    const rendered = String(innerXml || '').replace(/<ClaveServicio>\{TOKEN\}<\/ClaveServicio>/g, '<ClaveServicio>' + safeTokenXml + '</ClaveServicio>');
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
    const respText = resp.getContentText('UTF-8');
    const isAuthFault500 = code === 500 && /token|clave\s*servicio|autoriz|sesi[oó]n|expir/i.test(respText);
    if ((code === 401 || code === 403 || isAuthFault500) && attempt === 0) {
      sess = getValidErpSession_(true, cfg);
      continue;
    }
    if (code !== 200) {
      throw new Error('Error WCF S Mueblería (' + method + '): HTTP ' + code + ' - ' + respText.slice(0, 300));
    }
    return respText;
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
function acquireScriptLockSafe_(ms) {
  const lock = LockService.getScriptLock();
  const waitMs = Math.max(1000, Number(ms) || 15000);
  try {
    if (typeof lock.tryLock === 'function') {
      return { lock: lock, ok: !!lock.tryLock(waitMs) };
    }
    lock.waitLock(waitMs);
    return { lock: lock, ok: true };
  } catch (eLock) {
    return { lock: lock, ok: false, error: (eLock && eLock.message) ? eLock.message : String(eLock) };
  }
}

function escapeSheetPlainText_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (!s) return '';
  return /^[=+\-@]/.test(s.replace(/^\s+/, '')) ? ("'" + s) : s;
}

function safeSheetCellText_(raw, maxLen) {
  let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function handleInvSubmitQuote_(body) {
  const lockState = acquireScriptLockSafe_(25000);
  if (!lockState.ok) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está procesando otra operación en este momento. Intenta de nuevo en unos segundos.'
    };
  }
  const lock = lockState.lock;
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
    if (isGuestReadOnlyUser_(verifiedUser)) {
      return {
        ok: false,
        error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu correo tiene permiso únicamente para ver el inventario; no puede generar cotizaciones ni aplicar descuentos.'
      };
    }
    if (!userHasEffectivePerm_(verifiedUser, 'cotizador')) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
      };
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return { ok: false, error: 'Agrega al menos un producto a la cotización.' };
    }
    if (items.length > 15) {
      return { ok: false, error: 'La plantilla admite máximo 15 partidas por cotización (tienes ' + items.length + ').' };
    }

    // Administradores (con VER_CAMBIAR_TIENDA activo) pueden emitir y supervisar en cualquier tienda/bodega;
    // Asesores y Gerentes quedan bloqueados estrictamente a la tienda/proyecto de su cuenta en sesión.
    let erpStore = verifiedUser.erpStore;
    let idUsuarioNum = parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) || 0;
    let erpAdvisorLabel = verifiedUser.erpAdvisorLabel || '';
    const canAdminSwitchStore = userHasAdminPerm_(verifiedUser, 'cambiarTienda');

    if (canAdminSwitchStore) {
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
    const folioSnapBefore = sendToErp
      ? readLocalFoliosBaseline_(ss)
      : computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
    const estimatedFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapBefore);
    const originHeaderTag = isProyQuote
      ? ('[PROYECTO · ' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]')
      : ('[' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]');
    const finalNotesForErp = rawNotes ? (originHeaderTag + ' ' + rawNotes) : originHeaderTag;

    // 1) Mantener K5 en SOLO REVISIÓN para que ningún script externo reenvíe por duplicado (K8 intacta [BLOQUEADO-5])
    sh.getRange('K5').setValue('SOLO REVISIÓN (NO ENVIAR AL ERP)');
    sh.getRange('K7').clearContent();
    sh.getRange('M7').clearContent();

    // 2) Escribir tienda/bodega y datos del cliente en bloques compactos en plantilla
    if (erpAdvisorLabel) {
      sh.getRange('C5:C7').setValues([[erpStore], [erpAdvisorLabel], [categoryLabel]]);
    } else {
      sh.getRange('C5').setValue(erpStore);
      sh.getRange('C7').setValue(categoryLabel);
    }
    sh.getRange('C9:C11').setValues([[clientMode], [clientNameRaw], [finalNotesForErp]]);
    sh.getRange('G9').setNumberFormat('@');
    if (deliveryDate) {
      sh.getRange('G9:G10').setValues([[clientPhone], [deliveryDate]]);
    } else {
      sh.getRange('G9').setValue(clientPhone);
    }
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

    const ahoraStr = formatCancunNow_();
    if (!sendToErp) {
      sh.getRange('K6').setValue('🟢 EN REVISIÓN (' + estimatedFolio + ' · ' + activeQuoteType + ')');
      sh.getRange('K9').setValue(ahoraStr);
      SpreadsheetApp.flush();
      const histPreviewOk = !!registrarEventoHistorial_(ss, {
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
      previewStatus.folioFinal = estimatedFolio;
      previewStatus.nextOrderCode = estimatedFolio;
      previewStatus.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      previewStatus.quoteType = activeQuoteType;
      previewStatus.isProyecto = isProyQuote;
      previewStatus.serieLabel = verifiedUser.serieLabel;
      previewStatus.sentLiveToErp = false;
      previewStatus.items = items;
      previewStatus.serverLoggedSeguimiento = false;
      previewStatus.serverLoggedHistorial = histPreviewOk;
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
    let needSheetFormulaRead = false;
    for (let i = 0; i < items.length; i++) {
      const skuCheck = String((items[i] && items[i].sku) || '').trim().toUpperCase();
      const catCheck = catalogMap[skuCheck];
      if (!catCheck || !catCheck.idProducto || !/^\d+$/.test(String(catCheck.idProducto)) || Number(catCheck.precio || 0) <= 0) {
        needSheetFormulaRead = true;
        break;
      }
    }
    let sheetRows = [];
    if (needSheetFormulaRead) {
      SpreadsheetApp.flush();
      sheetRows = sh.getRange(15, 2, items.length, 12).getValues(); // B..M
    }

    const partidasErp = [];
    const partidasForSeg = [];
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
        let precioOrig = Number(rSheet[3] || catEntry.precio || 0) || 0;

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
        if (precioOrig <= 0) {
          return {
            ok: false,
            error: 'El SKU ' + sku + ' no tiene precio de lista válido en S Mueblería.'
          };
        }

        const precioUnit = Math.round(precioOrig * (1 - discFrac) * 10000) / 10000;
        const partidaObj = {
          Clave: sku,
          Nombre: nombreProd,
          Cantidad: cant,
          PrecioOriginal: precioOrig,
          PrecioUnitario: precioUnit,
          IdProducto: idProd
        };
        partidasErp.push(partidaObj);
        partidasForSeg.push(Object.assign({}, partidaObj, {
          model: reqItem.model || reqItem.modelo || '',
          stockBreakdown: reqItem.stockBreakdown || reqItem.stockBodegas || reqItem.stocks || reqItem.inventario || reqItem.stockByLoc || null
        }));
        skusSummaryParts.push(sku + ' x' + cant);
      }

      if (extraDiscount > 0 && partidasErp.length > 0) {
        let sumListErp = 0;
        let sumNetErp = 0;
        for (let pIdx = 0; pIdx < partidasErp.length; pIdx++) {
          const pItem = partidasErp[pIdx];
          sumListErp += Math.max(0, Number(pItem.PrecioOriginal) || 0) * Math.max(1, Number(pItem.Cantidad) || 1);
          sumNetErp += Math.max(0, Number(pItem.PrecioUnitario) || 0) * Math.max(1, Number(pItem.Cantidad) || 1);
        }
        if (sumListErp > 0) {
          const effErpPct = ((sumListErp - Math.max(0, sumNetErp - extraDiscount)) / sumListErp) * 100;
          if (effErpPct > maxDiscPct + 0.01) {
            return {
              ok: false,
              error: 'El descuento total (' + effErpPct.toFixed(1) + '%) sobre precios ERP supera el máximo permitido para tu cuenta (' + maxDiscPct + '%).'
            };
          }
        }
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

      const folioFinal = erpResult.folio || estimatedFolio || ('ID-' + erpResult.idCotizacion);
      const refSujeto = idLead ? ('Lead ' + idLead) : ('Cliente ' + idCliente);
      const statusBannerTxt = '✅ COTIZACIÓN CREADA (' + ahoraStr + ') · FOLIO ' + folioFinal + ' · ' + refSujeto;

      // Batch K5:K7 + M7 + K9 sin tocar jamás plantilla!K8 ([BLOQUEADO-5])
      sh.getRange('K5:K7').setValues([
        ['SOLO REVISIÓN (NO ENVIAR AL ERP)'],
        [statusBannerTxt],
        [String(erpResult.idCotizacion)]
      ]);
      sh.getRange('M7').setValue(folioFinal);
      // Conservar intacta la fórmula nativa de K8 en plantilla (PRESENTACION_DISENO)
      sh.getRange('K9').setValue(ahoraStr);

      // 5) Registrar el mismo folio oficial en COTIZACIONES_EN_VIVO con marca ORIGEN_CREACION = APP_COTIZACION (Col Y)
      shQuotes.appendRow([
        folioFinal,
        folioFinal,
        String(erpResult.idCotizacion),
        ahoraStr,
        activeQuoteType,
        verifiedUser.sheetTab,
        erpStore,
        verifiedUser.correo,
        escapeSheetPlainText_(verifiedUser.nombre),
        escapeSheetPlainText_(erpAdvisorLabel),
        String(idUsuarioNum),
        escapeSheetPlainText_(safeSheetCellText_(displayClientForErp, 160)),
        escapeSheetPlainText_(safeSheetCellText_(clientPhone, 60)),
        escapeSheetPlainText_(safeSheetCellText_(clientMode, 180)),
        escapeSheetPlainText_(categoryLabel),
        escapeSheetPlainText_(deliveryDate),
        partidasErp.length,
        escapeSheetPlainText_(skusSummaryParts.join(', ')),
        erpResult.subtotal,
        erpResult.iva,
        extraDiscount,
        erpResult.total,
        'COTIZACIÓN REGISTRADA',
        escapeSheetPlainText_(safeSheetCellText_(rawNotes, 500)),
        'APP_COTIZACION'
      ]);
      const appendedRow = shQuotes.getLastRow();
      shQuotes.getRange(appendedRow, 19, 1, 4).setNumberFormat('$#,##0.00');

      const segLoggedOk = !!registrarCotizacionAppEnSeguimiento_(ss, {
        folio: folioFinal,
        fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
        sheetTab: verifiedUser.sheetTab,
        erpStore: erpStore,
        advisorName: verifiedUser.nombre,
        advisorEmail: verifiedUser.correo,
        clientName: displayClientForErp,
        clientPhone: clientPhone,
        partidas: partidasForSeg
      });

      const histLoggedOk = !!registrarEventoHistorial_(ss, {
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

      const folioSnapAfter = updateFoliosCacheLocally_(folioSnapBefore, folioFinal);
      const nextStoreFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapAfter);
      const allowedAfterDirect = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);

      return {
        ok: true,
        erpStore: erpStore,
        erpAdvisor: erpAdvisorLabel,
        erpUserId: String(idUsuarioNum),
        actionState: 'SOLO REVISIÓN (NO ENVIAR AL ERP)',
        erpStatus: statusBannerTxt,
        quoteId: String(erpResult.idCotizacion),
        folio: folioFinal,
        folioFinal: folioFinal,
        subjectRef: refSujeto,
        lastSync: ahoraStr,
        extraDiscount: extraDiscount > 0 ? formatMoney_(extraDiscount) : '$0.00',
        subtotal: formatMoney_(erpResult.subtotal),
        iva: formatMoney_(erpResult.iva),
        total: formatMoney_(erpResult.total),
        sentLiveToErp: true,
        orderCode: folioFinal,
        nextOrderCode: nextStoreFolio,
        nextFolioByStore: folioSnapAfter.nextFolioByStore,
        quoteType: activeQuoteType,
        isProyecto: isProyQuote,
        serieLabel: verifiedUser.serieLabel,
        items: partidasErp,
        serverLoggedSeguimiento: segLoggedOk,
        serverLoggedHistorial: histLoggedOk,
        recentQuotes: allowedAfterDirect.quotes,
        roleScope: allowedAfterDirect.roleScope,
        activeStore: allowedAfterDirect.activeStore,
        branchAdvisorEmails: allowedAfterDirect.allowedAdvisorEmails
      };
    } catch (wcfErr) {
      // Respaldo automático: si el token caché en Drive expiró, encolar en plantilla!K5 para que servicio_en_vivo.py la suba e hidrate sesión
      const fallbackSummary = items.map(it => String(it.sku || '').trim().toUpperCase() + ' x' + Math.max(1, Math.round(Number(it.qty) || 1))).filter(Boolean);
      sh.getRange('K7').clearContent();
      sh.getRange('M7').clearContent();
      sh.getRange('K6').setValue('⏳ EN COLA AUTOMÁTICA PARA S MUEBLERÍA (' + ahoraStr + ')');
      // Conservar intacta plantilla!K8 ([BLOQUEADO-5])
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
        const folioResolved = daemonFolio || estimatedFolio || ('ID-' + daemonQid);
        const totRangeVals = sh.getRange('H31:H33').getValues();
        const subSheet = Number(totRangeVals[0][0]) || 0;
        const ivaSheet = Number(totRangeVals[1][0]) || 0;
        const totSheet = Number(totRangeVals[2][0]) || 0;

        shQuotes.appendRow([
          folioResolved,
          folioResolved,
          daemonQid,
          ahoraStr,
          activeQuoteType,
          verifiedUser.sheetTab,
          erpStore,
          verifiedUser.correo,
          escapeSheetPlainText_(verifiedUser.nombre),
          escapeSheetPlainText_(erpAdvisorLabel),
          String(idUsuarioNum),
          escapeSheetPlainText_(safeSheetCellText_(displayClientForErp, 160)),
          escapeSheetPlainText_(safeSheetCellText_(clientPhone, 60)),
          escapeSheetPlainText_(safeSheetCellText_(clientMode, 180)),
          escapeSheetPlainText_(categoryLabel),
          escapeSheetPlainText_(deliveryDate),
          items.length,
          escapeSheetPlainText_(fallbackSummary.join(', ')),
          subSheet,
          ivaSheet,
          extraDiscount,
          totSheet,
          'COTIZACIÓN REGISTRADA (VÍA SERVICIO)',
          escapeSheetPlainText_(safeSheetCellText_(rawNotes, 500)),
          'APP_COTIZACION'
        ]);
        const appRow = shQuotes.getLastRow();
        shQuotes.getRange(appRow, 19, 1, 4).setNumberFormat('$#,##0.00');
        const segLoggedDaemon = !!registrarCotizacionAppEnSeguimiento_(ss, {
          folio: folioResolved,
          fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
          sheetTab: verifiedUser.sheetTab,
          erpStore: erpStore,
          advisorName: verifiedUser.nombre,
          advisorEmail: verifiedUser.correo,
          clientName: displayClientForErp,
          clientPhone: clientPhone,
          partidas: partidasForSeg.length ? partidasForSeg : items
        });
        const histLoggedDaemon = !!registrarEventoHistorial_(ss, {
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

        const snapAfterDaemon = updateFoliosCacheLocally_(folioSnapBefore, folioResolved);
        const nextAfterDaemon = peekNextStoreErpFolio_(erpStore, activePrefix, snapAfterDaemon);
        const outDaemon = handleInvPlantillaStatus_();
        outDaemon.sentLiveToErp = true;
        outDaemon.orderCode = folioResolved;
        outDaemon.folioFinal = folioResolved;
        outDaemon.nextOrderCode = nextAfterDaemon;
        outDaemon.nextFolioByStore = snapAfterDaemon.nextFolioByStore;
        outDaemon.quoteType = activeQuoteType;
        outDaemon.isProyecto = isProyQuote;
        outDaemon.serieLabel = verifiedUser.serieLabel;
        outDaemon.folio = folioResolved;
        outDaemon.quoteId = daemonQid;
        outDaemon.erpUserId = String(idUsuarioNum);
        outDaemon.erpStatus = daemonStatus;
        outDaemon.items = partidasErp.length ? partidasErp : items;
        outDaemon.serverLoggedSeguimiento = segLoggedDaemon;
        outDaemon.serverLoggedHistorial = histLoggedDaemon;
        const allowedAfterDaemon = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
        outDaemon.recentQuotes = allowedAfterDaemon.quotes;
        outDaemon.roleScope = allowedAfterDaemon.roleScope;
        outDaemon.activeStore = allowedAfterDaemon.activeStore;
        outDaemon.branchAdvisorEmails = allowedAfterDaemon.allowedAdvisorEmails;
        return outDaemon;
      }

      const histQueuedOk = !!registrarEventoHistorial_(ss, {
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
      queuedOut.folioFinal = estimatedFolio;
      queuedOut.nextOrderCode = estimatedFolio;
      queuedOut.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      queuedOut.quoteType = activeQuoteType;
      queuedOut.isProyecto = isProyQuote;
      queuedOut.serieLabel = verifiedUser.serieLabel;
      queuedOut.items = partidasErp.length ? partidasErp : items;
      queuedOut.serverLoggedSeguimiento = false;
      queuedOut.serverLoggedHistorial = histQueuedOk;
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
    const startR = Math.max(2, lastR - 2000);
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
    .slice(0, maxLen || 28)
    .replace(/^_+|_+$/g, '');

  const fTag = cleanPart(folio || ('ID_' + quoteId), 20) || ('ID_' + quoteId);
  const cTag = cleanPart(clientName, 26);
  return 'CREATA-muebles-cotización_' + fTag + (cTag ? ('_' + cTag) : '') + '.pdf';
}

function handleInvDownloadErpQuotePdf_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) {
    return authCheck;
  }
  const verifiedUser = authCheck.advisor;
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return {
      ok: false,
      error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu cuenta no tiene permisos para consultar ni descargar cotizaciones.'
    };
  }
  if (!userHasEffectivePerm_(verifiedUser, 'cotizador')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
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

          let pdfDriveUrl = '';
          let pdfDownloadUrl = '';
          if (body && body.createShareLink === true) {
            try {
              const pdfBlob = Utilities.newBlob(dlRes.pdfBytes, 'application/pdf', fileName);
              let driveFile = null;
              try {
                const parentFld = DriveApp.getFolderById(PRESENTACION_DISENO_FOLDER_ID_);
                const subIt = parentFld.getFoldersByName('COTIZACIONES_PDF_COMPARTIDOS');
                const pdfFld = subIt.hasNext() ? subIt.next() : parentFld.createFolder('COTIZACIONES_PDF_COMPARTIDOS');
                driveFile = pdfFld.createFile(pdfBlob);
              } catch (eFldPdf) {
                driveFile = DriveApp.createFile(pdfBlob);
              }
              try {
                driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              } catch (eShare) {}
              const dId = driveFile.getId();
              if (dId) {
                pdfDriveUrl = 'https://drive.google.com/file/d/' + dId + '/view?usp=sharing';
                pdfDownloadUrl = 'https://drive.google.com/uc?export=download&id=' + dId;
              }
            } catch (eDrivePdf) {}
          }

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
            pdfDriveUrl: pdfDriveUrl,
            pdfDownloadUrl: pdfDownloadUrl,
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
  const ss = getAuthSpreadsheet_(getSpreadsheet_());

  // Si la hoja unificada CUENTAS ADMINISTRATIVAS (A:Z con tiendas V:Z) ya está activa, protegerla y evitar recrear las hojas de tiendas eliminadas
  const existingUnified = ss.getSheetByName(TAB_CUENTAS_ADMIN_);
  if (existingUnified && existingUnified.getLastRow() >= 3 && existingUnified.getMaxColumns() >= 26) {
    try { ensureCuentasAdministrativasSheet_(ss); } catch (eEnsureAdm) {}
    try { ensureInvitadosSheet_(ss); } catch (eEnsureInv) {}
    const totalUnifiedRows = Math.max(0, existingUnified.getLastRow() - 2);
    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert(
          '¡Directorio unificado activo en CUENTAS ADMINISTRATIVAS!\n\n' +
          '• Todos los usuarios (' + totalUnifiedRows + ' filas) se administran ahora en la hoja CUENTAS ADMINISTRATIVAS con permisos en J:T y tiendas asignadas en V:Z (SI/NO).\n' +
          '• No se recrearon hojas individuales de sucursal ni se alteraron contraseñas.'
        );
      } catch (eUi) {}
    }
    return {
      ok: true,
      unified: true,
      sheetsConfigured: [TAB_CUENTAS_ADMIN_, 'INVITADOS'],
      totalAccounts: totalUnifiedRows,
      removedEmptySheets: []
    };
  }

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
    'DEMANDA_SIN_STOCK': true,
    'SUGERENCIAS_DE_COMPRA': true,
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
  const erpLeaseKey = 'CREATA_ERP_SYNC_IN_FLIGHT_V1';
  let erpLeaseCache = null;
  let erpLeaseId = '';
  try {
    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      erpLeaseCache = CacheService.getScriptCache();
      if (erpLeaseCache.get(erpLeaseKey)) {
        return { ok: true, skippedBusy: true };
      }
      erpLeaseId = 'sync_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      erpLeaseCache.put(erpLeaseKey, erpLeaseId, 180);
    }
  } catch (eLease) {}
  try {
    const cfg = getErpRuntimeConfig_();
    const ss = getSpreadsheet_();
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    if (!shInv || shInv.getLastRow() < 3) {
      return { ok: false, error: 'Hoja INVENTARIO_EN_VIVO no inicializada.' };
    }
    asegurarColumnaTotalInventario_(ss, shInv);
    try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (eInvEnsure) {}
    try { ensureProjectAPublicFolders_(false); } catch (ePubFolders) {}

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

    if (erpOk) {
      try { bumpSegInvVersion_(ahoraStr); } catch (eBumpInv) {}
      try {
        if (!opts || opts.skipSeguimientoQuotesSync !== true) {
          sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: true });
        }
      } catch (eSegQuotesPiggy) {
        Logger.log('Aviso sync automático Seguimiento ERP: ' + eSegQuotesPiggy);
      }
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
    try {
      if (erpLeaseCache && (!erpLeaseId || erpLeaseCache.get(erpLeaseKey) === erpLeaseId)) {
        erpLeaseCache.remove(erpLeaseKey);
      }
    } catch (eLeaseRel) {}
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
    if (parsedNom.med && parsedNom.text && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(parsedNom.text)) {
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
    if (!cleanInvCell_(r[1])) {
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
    const isHardGoodInv = /^(?:MESA(?:\s+\w+)*|CREDENZA|BUFETERA|BUFETERO|CONSOLA|CAVA|MUEBLE\s+DE\s+TV|ESCRITORIO|LIBRERO|BURO|COMODA|CAJONERA|TOCADOR|ESPEJO|CUADRO|LAMPARA(?:\s+\w+)*|CANDIL|ARBOTANTE|MACETA|FLORERO|JARRON|CHAROLA|ESCULTURA|ACCESORIO\s+DECORATIVO)$/.test(normPlainUpper_(tp));
    const isNonWoodTextileInv = /^(?:COJIN|FUNDA(?:\s+\w+)*|BLANCOS|TAPETE|COLCHON|RELLENO|TELA)$/.test(normPlainUpper_(tp));
    const isSalaWithoutWoodNameInv = /\b(SALA|SOFA|SOFA\s+CAMA|LOVE\s*SEAT|CHAISE|ESQUINERO|FUTON|FUTTON)\b/.test(normPlainUpper_(tp + ' ' + nom)) &&
      !/\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE|FRESNO|TABACO|TACUBA|BELLOTA|HABANO|ESPIGA|NUEZ|MADERA)\b/.test(searchBlob);

    if (tp === 'TELA' && !tl && mo) tl = mo;
    if (!tl && !isHardGoodInv && fabricsSorted.length > 0) {
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

    if (!md && !isNonWoodTextileInv && !isSalaWithoutWoodNameInv) {
      for (let w = 0; w < INV_WOOD_PATTERNS_.length; w++) {
        if (INV_WOOD_PATTERNS_[w][1] === 'PINO' && !/\bMADERA\s+DE\s+PINO\b/.test(searchBlob)) continue;
        if (INV_WOOD_PATTERNS_[w][0].test(searchBlob)) {
          md = INV_WOOD_PATTERNS_[w][1];
          break;
        }
      }
    }
    if (!cm && !isNonWoodTextileInv && !isSalaWithoutWoodNameInv) {
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
      if (vrParsed.med && vrParsed.text && /[A-Za-z]{2,}/.test(vrParsed.text)) vr = vrParsed.text;
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

function normalizeClientSearchText_(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function extractErpClientEntitiesFromXml_(xmlText, kind) {
  const xml = String(xmlText || '');
  if (!xml) return [];
  const isLead = String(kind || '').toUpperCase() === 'LEAD';
  const idTag = isLead ? 'IdLead' : 'IdCliente';
  // Quitar envoltorios SOAP/WCF de nivel superior para que ArrayOfCliente / Result nunca traguen toda la lista
  let inner = xml;
  const resTagRe = isLead
    ? /<(?:[a-zA-Z0-9_]+:)?ObtenerLeadsResult\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ObtenerLeadsResult>/i
    : /<(?:[a-zA-Z0-9_]+:)?ObtenerClientesResult\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ObtenerClientesResult>/i;
  const resMatch = inner.match(resTagRe);
  if (resMatch && resMatch[1]) {
    inner = resMatch[1];
  }
  inner = inner.replace(/<\/?(?:[a-zA-Z0-9_]+:)?ArrayOf[a-zA-Z0-9_]+\b[^>]*>/gi, '');

  const blocks = [];
  const itemRe = isLead
    ? /<((?:[a-zA-Z0-9_]+:)?(?:Lead\d*|Leads|DatosLead|LeadDTO))\b[^>]*>([\s\S]*?)<\/\1>/gi
    : /<((?:[a-zA-Z0-9_]+:)?(?:Cliente\d*|Clientes|DatosCliente|ClienteDTO))\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = itemRe.exec(inner)) !== null) {
    const blk = m[2] || '';
    if (extractXmlTag_(blk, idTag)) {
      blocks.push(blk);
    }
  }

  // Respaldo genérico si S Mueblería cambia el nombre del elemento XML (cualquier bloque directo con <IdCliente> / <IdLead>)
  if (!blocks.length && inner.indexOf(idTag) !== -1) {
    const genericRe = /<([a-zA-Z0-9_:]+)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let gm;
    while ((gm = genericRe.exec(inner)) !== null) {
      const tagLocal = String(gm[1] || '').split(':').pop();
      if (/^(?:ArrayOf|Obtener|Envelope|Body|Header)|(?:Response|Result)$/i.test(tagLocal)) continue;
      const blk = gm[2] || '';
      if (extractXmlTag_(blk, idTag)) {
        blocks.push(blk);
      }
    }
  }

  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const idNum = parseInt(extractXmlTag_(blk, idTag) || '0', 10) || 0;
    if (idNum <= 0) continue;

    const nomComp = extractXmlTag_(blk, 'NombreCompleto') || extractXmlTag_(blk, 'NombreCliente');
    const nomParts = [
      extractXmlTag_(blk, 'Nombre'),
      extractXmlTag_(blk, 'Paterno') || extractXmlTag_(blk, 'ApellidoPaterno'),
      extractXmlTag_(blk, 'Materno') || extractXmlTag_(blk, 'ApellidoMaterno')
    ].filter(Boolean).join(' ').trim();
    const razon = extractXmlTag_(blk, 'RazonSocial') || extractXmlTag_(blk, 'Empresa');
    const nombreFinal = String(nomComp || nomParts || razon || ((isLead ? 'PROSPECTO #' : 'CLIENTE #') + idNum))
      .replace(/\s+/g, ' ')
      .trim();

    const tel = extractXmlTag_(blk, 'Telefono') || extractXmlTag_(blk, 'Telefono1') || extractXmlTag_(blk, 'Tel');
    const cel = extractXmlTag_(blk, 'Celular') || extractXmlTag_(blk, 'Telefono2') || extractXmlTag_(blk, 'Movil');
    const correo = extractXmlTag_(blk, 'Correo') || extractXmlTag_(blk, 'Email') || extractXmlTag_(blk, 'Mail') || '';
    const dirDirect = extractXmlTag_(blk, 'Direccion') || '';
    const dirParts = [
      extractXmlTag_(blk, 'Calle'),
      extractXmlTag_(blk, 'NumeroExterior') || extractXmlTag_(blk, 'NoExterior'),
      extractXmlTag_(blk, 'Colonia'),
      extractXmlTag_(blk, 'Ciudad') || extractXmlTag_(blk, 'Municipio')
    ].filter(Boolean).join(', ').trim();

    out.push({
      type: isLead ? 'LEAD' : 'CLIENTE',
      idCliente: isLead ? 0 : idNum,
      idLead: isLead ? idNum : 0,
      noCliente: extractXmlTag_(blk, 'NoCliente') || extractXmlTag_(blk, 'Clave') || '',
      nombre: nombreFinal,
      telefono: tel || cel || '',
      celular: cel || tel || '',
      correo: correo,
      direccion: dirDirect || dirParts || ''
    });
  }
  return out;
}

function scoreErpClientCandidate_(cand, normQuery, tokens, digitsQuery) {
  if (!cand) return 0;
  const hayPlain = normalizeClientSearchText_([
    cand.nombre,
    cand.noCliente,
    cand.correo,
    cand.direccion,
    cand.idCliente ? String(cand.idCliente) : '',
    cand.idLead ? String(cand.idLead) : ''
  ].join(' '));
  const hayDigits = String((cand.telefono || '') + ' ' + (cand.celular || '') + ' ' + (cand.noCliente || '')).replace(/\D+/g, '');

  let matched = false;
  let score = 0;

  if (digitsQuery.length >= 4 && hayDigits && hayDigits.indexOf(digitsQuery) !== -1) {
    matched = true;
    score += 120;
  }
  if (normQuery && hayPlain.indexOf(normQuery) !== -1) {
    matched = true;
    score += hayPlain.indexOf(normQuery) === 0 ? 130 : 100;
  }
  if (!matched && tokens.length > 0) {
    const allMatch = tokens.every(function (tok) {
      if (hayPlain.indexOf(tok) !== -1) return true;
      const tokDig = tok.replace(/\D+/g, '');
      return tokDig.length >= 3 && hayDigits && hayDigits.indexOf(tokDig) !== -1;
    });
    if (allMatch) {
      matched = true;
      score += 80;
    }
  }
  if (!matched) return 0;

  if (cand.type === 'CLIENTE') score += 30;
  else if (cand.type === 'LEAD') score += 20;
  else score += 5;
  if (cand.telefono || cand.celular) score += 5;
  return score;
}

function searchLocalQuoteClientsFallback_(ssInv, normQuery, tokens, digitsQuery, seenKeys, maxItems) {
  const found = [];
  const limit = Math.max(5, Number(maxItems) || 12);
  const localSeen = {};

  function considerCandidate_(nombreRaw, telRaw, correoRaw, folioRaw) {
    const nombre = String(nombreRaw || '').replace(/\s+/g, ' ').trim();
    const tel = String(telRaw || '').trim();
    const correo = String(correoRaw || '').trim();
    const folio = String(folioRaw || '').trim().toUpperCase();
    if (!nombre && !tel) return;
    if (/^(?:PROSPECTO CREATA|CLIENTE GENERAL|PUBLICO EN GENERAL|MOSTRADOR)$/i.test(nombre)) return;

    const cand = {
      type: 'COTIZACION',
      idCliente: 0,
      idLead: 0,
      noCliente: folio,
      nombre: nombre || tel,
      telefono: tel,
      celular: tel,
      correo: correo,
      direccion: '',
      lastFolio: folio
    };
    const sc = scoreErpClientCandidate_(cand, normQuery, tokens, digitsQuery);
    if (sc <= 0) return;

    const dedupKey = normalizeClientSearchText_(cand.nombre) + '|' + String(cand.telefono || '').replace(/\D+/g, '').slice(-10);
    if (localSeen[dedupKey] || (seenKeys && seenKeys['N:' + dedupKey])) return;
    localSeen[dedupKey] = true;
    cand._score = sc;
    found.push(cand);
  }

  // 1) COTIZACIONES_EN_VIVO (hoja principal de cotizaciones recientes de la app)
  try {
    const shLive = ssInv ? ssInv.getSheetByName(TAB_QUOTES_LIVE_) : null;
    if (shLive && shLive.getLastRow() >= 2) {
      const lastR = shLive.getLastRow();
      const startR = Math.max(2, lastR - 400);
      const lastC = Math.min(Math.max(shLive.getLastColumn(), 13), 20);
      const vals = shLive.getRange(startR, 1, lastR - startR + 1, lastC).getDisplayValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        const r = vals[i] || [];
        // Esquema COTIZACIONES_EN_VIVO: col 1=FOLIO, col 11=CLIENTE_PROYECTO, col 12=TELEFONO, col 13=CORREO (o esquema corto col 3=CLIENTE, col 4=TEL)
        const isLongSchema = lastC >= 12 && (String(r[11] || '').trim() || String(r[12] || '').trim());
        const cliNom = isLongSchema ? r[11] : r[3];
        const cliTel = isLongSchema ? r[12] : r[4];
        const cliMail = isLongSchema && r.length > 13 ? r[13] : '';
        considerCandidate_(cliNom, cliTel, cliMail, r[1] || r[0]);
      }
    }
  } catch (eLive) {}

  // 2) COTIZACIONES_CREATA y COTIZACIONES_ARCHIVADAS (Seguimiento)
  try {
    const ssSeg = getSpreadsheetSeguimiento_();
    if (ssSeg) {
      const tabs = ['COTIZACIONES_CREATA', TAB_COTIZACIONES_ARCHIVADAS_];
      for (let t = 0; t < tabs.length; t++) {
        const sh = ssSeg.getSheetByName(tabs[t]);
        if (!sh || sh.getLastRow() < 2) continue;
        const lastR = sh.getLastRow();
        const startR = Math.max(2, lastR - 1500);
        const cols = Math.min(Math.max(sh.getLastColumn(), 9), 10);
        const vals = sh.getRange(startR, 1, lastR - startR + 1, cols).getDisplayValues();
        for (let i = vals.length - 1; i >= 0; i--) {
          const r = vals[i] || [];
          considerCandidate_(r[7], r[8], '', r[1]);
        }
      }
    }
  } catch (eSeg) {}

  found.sort(function (a, b) { return (b._score || 0) - (a._score || 0); });
  return found.slice(0, limit);
}

function handleInvSearchErpClients_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
  if (!authCheck.ok) {
    return authCheck;
  }
  if (isGuestReadOnlyUser_(authCheck.advisor)) {
    return { ok: false, error: 'Tu cuenta de Invitado (Solo Ver) no tiene permisos para consultar clientes ni cotizar.' };
  }
  if (!userHasEffectivePerm_(authCheck.advisor, 'cotizador')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const rawQuery = String((body && (body.query || body.q)) || '').trim();
  if (rawQuery.length < 2) {
    return { ok: false, error: 'Escribe al menos 2 letras o dígitos para buscar en S Mueblería.' };
  }

  const normQuery = normalizeClientSearchText_(rawQuery);
  const tokens = normQuery.split(/\s+/).filter(function (t) { return t.length >= 2; });
  const digitsQuery = rawQuery.replace(/\D+/g, '');
  const isPhoneLike = digitsQuery.length >= 7 && digitsQuery.length >= rawQuery.replace(/\s+/g, '').length - 4;

  // Caché breve de 90s para respuestas instantáneas en búsquedas repetidas
  const cacheKey = makeShortCacheKey_('cli_s_', normQuery + '|' + digitsQuery);
  try {
    const cachedRaw = CacheService.getScriptCache().get(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && Array.isArray(cached.clients) && cached.clients.length > 0) {
        return {
          ok: true,
          query: rawQuery,
          cached: true,
          clients: cached.clients
        };
      }
    }
  } catch (eCacheRead) {}

  const cfg = getErpRuntimeConfig_();
  const results = [];
  const seenKeys = {};

  function addCandidate_(c, requireLocalFilter) {
    if (!c) return;
    const key = c.idCliente > 0 ? ('C:' + c.idCliente) : (c.idLead > 0 ? ('L:' + c.idLead) : ('Q:' + normalizeClientSearchText_(c.nombre) + '|' + String(c.telefono || '').replace(/\D+/g, '').slice(-10)));
    if (seenKeys[key]) return;
    const sc = scoreErpClientCandidate_(c, normQuery, tokens, digitsQuery);
    if (requireLocalFilter && sc <= 0) return;
    seenKeys[key] = true;
    const nameDigKey = 'N:' + normalizeClientSearchText_(c.nombre) + '|' + String(c.telefono || '').replace(/\D+/g, '').slice(-10);
    seenKeys[nameDigKey] = true;
    c._score = sc > 0 ? sc : (c.type === 'CLIENTE' ? 60 : 50);
    results.push(c);
  }

  function queryErpFilter_(filterText, requireLocalFilter) {
    const cleanF = String(filterText || '').trim();
    if (cleanF.length < 2) return { added: 0, err: '' };
    let added = 0;
    let errMsg = '';

    // 1) Clientes formales (ObtenerClientes)
    try {
      const xmlCli = callSmuebleriaWcf_(
        'ObtenerClientes',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(cleanF) + '</Filtro>'
      );
      const parsedCli = extractErpClientEntitiesFromXml_(xmlCli, 'CLIENTE');
      for (let i = 0; i < parsedCli.length; i++) {
        const before = results.length;
        addCandidate_(parsedCli[i], requireLocalFilter);
        if (results.length > before) added++;
        if (results.length >= 35) break;
      }
    } catch (eCli) {
      errMsg = String((eCli && eCli.message) || eCli || '');
    }

    // 2) Prospectos / Leads (ObtenerLeads)
    if (results.length < 25) {
      try {
        const xmlLeads = callSmuebleriaWcf_(
          'ObtenerLeads',
          '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(cleanF) + '</Filtro>'
        );
        const parsedLeads = extractErpClientEntitiesFromXml_(xmlLeads, 'LEAD');
        for (let i = 0; i < parsedLeads.length; i++) {
          const before = results.length;
          addCandidate_(parsedLeads[i], requireLocalFilter);
          if (results.length > before) added++;
          if (results.length >= 35) break;
        }
      } catch (eLead) {
        if (!results.length && !errMsg) {
          errMsg = String((eLead && eLead.message) || eLead || '');
        }
      }
    }
    return { added: added, err: errMsg };
  }

  // Construir intentos ordenados: exacto/teléfono limpio -> sin acentos -> token más distintivo (para "Nombre Apellido")
  const primaryFilter = isPhoneLike ? digitsQuery.slice(-10) : rawQuery;
  const firstRun = queryErpFilter_(primaryFilter, false);
  let clientErrMsg = firstRun.err;

  if (!results.length && !isPhoneLike && normQuery && normQuery !== primaryFilter.toUpperCase()) {
    const noAccRun = queryErpFilter_(normQuery, false);
    if (!clientErrMsg && noAccRun.err) clientErrMsg = noAccRun.err;
  }

  if (!results.length && !isPhoneLike && tokens.length >= 2) {
    // S Mueblería a veces busca por Nombre y Apellido en columnas separadas: consultar por el apellido/palabra más larga y filtrar localmente por todos los tokens
    const sortedByLen = tokens.slice().sort(function (a, b) { return b.length - a.length; });
    const tried = {};
    tried[normQuery] = true;
    for (let i = 0; i < sortedByLen.length && i < 2 && !results.length; i++) {
      const tok = sortedByLen[i];
      if (tok.length < 3 || tried[tok]) continue;
      tried[tok] = true;
      queryErpFilter_(tok, true);
    }
  }

  // Respaldo inteligente con clientes de cotizaciones recientes en Sheets (si S Mueblería devolvió pocos resultados o falló)
  let usedLocalFallback = false;
  if (results.length < 10) {
    const localHits = searchLocalQuoteClientsFallback_(ss, normQuery, tokens, digitsQuery, seenKeys, 12);
    for (let i = 0; i < localHits.length; i++) {
      results.push(localHits[i]);
      usedLocalFallback = true;
    }
  }

  if (!results.length && clientErrMsg) {
    return { ok: false, error: 'No fue posible consultar S Mueblería en este momento: ' + clientErrMsg };
  }

  results.sort(function (a, b) {
    const sDiff = (b._score || 0) - (a._score || 0);
    if (sDiff !== 0) return sDiff;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });

  const cleanOut = results.slice(0, 25).map(function (c) {
    return {
      type: c.type,
      idCliente: c.idCliente,
      idLead: c.idLead,
      noCliente: c.noCliente || '',
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      celular: c.celular || '',
      correo: c.correo || '',
      direccion: c.direccion || '',
      lastFolio: c.lastFolio || ''
    };
  });

  if (cleanOut.length > 0) {
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify({ clients: cleanOut }), 90);
    } catch (eCachePut) {}
  }

  return {
    ok: true,
    query: rawQuery,
    usedLocalFallback: usedLocalFallback,
    warning: (clientErrMsg && usedLocalFallback) ? 'Mostrando coincidencias de cotizaciones recientes (S Mueblería tardó en responder).' : '',
    clients: cleanOut
  };
}

function handleInvCreateErpClient_(body) {
  const lockState = acquireScriptLockSafe_(20000);
  if (!lockState.ok) {
    return { ok: false, retryable: true, error: 'El servidor está ocupado con otro proceso. Intenta guardar el cliente de nuevo en unos segundos.' };
  }
  const lock = lockState.lock;
  try {
    const ss = getSpreadsheet_();
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    if (isGuestReadOnlyUser_(verifiedUser)) {
      return { ok: false, error: 'Tu cuenta de Invitado (Solo Ver) no tiene permisos para dar de alta clientes ni cotizar.' };
    }
    if (!userHasEffectivePerm_(verifiedUser, 'cotizador')) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
      };
    }
    const cfg = getErpRuntimeConfig_();

    let idAgente = parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) || 0;
    if (userHasAdminPerm_(verifiedUser, 'cambiarTienda') && body && body.erpAdvisorId) {
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
  try {
    const ss = getSpreadsheet_();
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body || {});
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    if (isGuestReadOnlyUser_(verifiedUser)) {
      return {
        ok: false,
        forbidden: true,
        error: 'Las cuentas de invitados (SOLO VER) no tienen permiso para subir fotografías.'
      };
    }
    if (!userHasEffectivePerm_(verifiedUser, 'subirFoto')) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta no tiene habilitado PERMITIR_SUBIR_FOTO en CUENTAS ADMINISTRATIVAS.'
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
    const roleStore = [verifiedUser.puesto || (verifiedUser.isAdmin ? 'ADMINISTRADOR' : 'ASESOR'), verifiedUser.erpStore || verifiedUser.sheetTab || '']
      .filter(Boolean)
      .join(' · ');

    const mime = m[1];
    const base64Body = m[2];
    const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
    const safeSku = skuUpper.replace(/[^A-Z0-9_-]/g, '');
    const safeProd = productName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const providedOrigName = String((body && body.fileName) || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    const fileName = providedOrigName
      ? (/\.[a-z0-9]{2,5}$/i.test(providedOrigName) ? providedOrigName : (providedOrigName + '.' + ext))
      : (safeSku + (safeProd && safeProd.toUpperCase() !== safeSku ? (' - ' + safeProd) : '') + '.' + ext);

    const bytes = Utilities.base64Decode(base64Body);
    const blob = Utilities.newBlob(bytes, mime, fileName);

    let uploaded = null;
    let usedFolderId = FOTOS_NUEVAS_CARGADO_FOLDER_ID_;
    try {
      const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
      ensurePublicSharingItem_(targetFolder);
      uploaded = targetFolder.createFile(blob);
      usedFolderId = targetFolder.getId();
    } catch (ePrimaryFolder) {
      try {
        const projFolder = DriveApp.getFolderById(PRESENTACION_DISENO_FOLDER_ID_);
        const subIt = projFolder.getFoldersByName(TAB_FOTOS_NUEVAS_CARGADO_);
        const fallbackFolder = subIt.hasNext() ? subIt.next() : projFolder.createFolder(TAB_FOTOS_NUEVAS_CARGADO_);
        ensurePublicSharingItem_(fallbackFolder);
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
    ensurePublicSharingItem_(uploaded);
    const fileId = uploaded.getId();
    const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId;
    const driveViewUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    const folderUrl = 'https://drive.google.com/drive/folders/' + usedFolderId;

    // Organizar copia automáticamente en la carpeta de categoría correspondiente (excepto Portadas/Telas/Maderas que van en 1 sola carpeta sin duplicarse)
    let categoryFolderId = '';
    let categoryFolderName = '';
    const skipCategoryCopy = !!(body && body.skipCategoryCopy) || /^V(?:COV|FAB|WOD):/i.test(skuUpper);
    if (!skipCategoryCopy) {
      try {
        let catRaw = String((body && body.categoria) || '').trim();
        let tipoRaw = String((body && body.tipo) || '').trim();
        let nomLookup = productName;
        if (!catRaw && !tipoRaw) {
          const invFast = lookupInvMetaFast_(ss, skuUpper);
          if (invFast) {
            tipoRaw = invFast.tipo || tipoRaw;
            nomLookup = invFast.nombre || nomLookup;
            catRaw = invFast.categoria || catRaw;
          }
        }
        const destMeta = resolveCategoryDestFolderForProduct_(catRaw, tipoRaw, nomLookup);
        if (destMeta && destMeta.id && destMeta.id !== usedFolderId) {
          const catFolder = DriveApp.getFolderById(destMeta.id);
          ensurePublicSharingItem_(catFolder);
          const catCopy = uploaded.makeCopy(fileName, catFolder);
          ensurePublicSharingItem_(catCopy);
          categoryFolderId = destMeta.id;
          categoryFolderName = destMeta.name;
        }
      } catch (eCatCopy) {}
    }

    // NO se inserta ni coloca la fotografía en el documento de Google Sheets ("FOTOS NUEVAS CARGADO");
    // únicamente queda alojada como archivo descargable en la carpeta de Google Drive "FOTOS NUEVAS CARGADO"
    // y organizada en su carpeta de categoría correspondiente, registrando el movimiento en HISTORIAL.
    registrarEventoHistorial_(ss, {
      clasificacion: 'MOVIMIENTO',
      modulo: 'AppsScript · Drive FOTOS NUEVAS CARGADO',
      evento: 'ARCHIVO DE FOTO GUARDADO EN DRIVE PARA DESCARGA',
      estado: '✅ OK',
      usuario: uploaderName + ' (' + verifiedUser.correo + ')',
      sucursal: roleStore,
      referencia: skuUpper + ' · ' + productName,
      detalle: 'Archivo descargable guardado en carpeta Drive "FOTOS NUEVAS CARGADO"' +
        (categoryFolderName ? (' y clasificado en "' + categoryFolderName + '"') : '') +
        ' (' + fileName + ') · Descarga: ' + downloadUrl,
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
      categoryFolderId: categoryFolderId,
      categoryFolderName: categoryFolderName,
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
  }
}

// ============================================================================
// GESTOR EXCLUSIVO DE FOTOGRAFÍAS (TITULAR: kevin.reyna@grupoanipa.com)
// Hoja "1" (Col A = SKU · Col B = NOMBRE [fórmula fila 2] · Col D = LINK FOTO APP)
// Bandeja Drive "SUBIR" -> mueve a CATEGORIAS MUEBLES Y ACCESORIOS y quita de SUBIR
// ============================================================================
const OWNER_FOTOS_EMAIL_ = 'kevin.reyna@grupoanipa.com';
const SUBIR_INBOX_FOLDER_ID_ = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'; // SUBIR PREN — exclusivo Proyecto A / App #9
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
const FORBIDDEN_PROJECT_B_FOLDER_IDS_ = {
  '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX': 'SUBIR PROPT',
  '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ': 'SUBIDA DE FOTOS',
  '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B': 'fotos odoo',
  '10UIhDWLKL0ySmzdcMemA5K5831YozuBa': 'fotos odoo / FOTOS MUEBLES',
  '1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR': 'fotos odoo / FOTOS ACCESORIOS Y ESPEJOS',
  '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9': 'fotos odoo / FOTOS TELAS',
  '13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1': 'fotos odoo / OTROS',
  '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul': 'TELAS',
  '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx': 'MADERAS'
};

function isForbiddenProjectBFolderId_(folderId) {
  const fid = String(folderId || '').trim();
  return !!(fid && Object.prototype.hasOwnProperty.call(FORBIDDEN_PROJECT_B_FOLDER_IDS_, fid));
}

function isDestCategoryFolderId_(folderId) {
  const fid = String(folderId || '').trim();
  if (!fid) return false;
  if (fid === CATEGORIAS_DEST_ROOT_FOLDER_ID_) return true;
  for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
    if (CATEGORIAS_DEST_FOLDERS_[i].id === fid) return true;
  }
  return false;
}

function isFolderOrAncestorForbiddenProjectB_(folderObj, maxDepth, ancestorMemo) {
  if (!folderObj) return false;
  const limit = (typeof maxDepth === 'number' && maxDepth > 0) ? Math.floor(maxDepth) : 8;
  const memo = (ancestorMemo && typeof ancestorMemo === 'object') ? ancestorMemo : null;
  let rootId = '';
  try {
    rootId = String((folderObj.getId && folderObj.getId()) || '').trim();
  } catch (eRootId) {
    return true; // Fail closed
  }
  if (rootId && memo && Object.prototype.hasOwnProperty.call(memo, rootId)) {
    return Boolean(memo[rootId]);
  }
  const visited = {};
  const queue = [{ folder: folderObj, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    const cur = item.folder;
    const depth = item.depth;
    if (!cur) continue;
    let fid = '';
    try {
      fid = String((cur.getId && cur.getId()) || '').trim();
    } catch (eId) {
      if (rootId && memo) memo[rootId] = true;
      return true; // Fail closed
    }
    if (isForbiddenProjectBFolderId_(fid)) {
      if (fid && memo) memo[fid] = true;
      if (rootId && memo) memo[rootId] = true;
      return true;
    }
    if (fid && memo && Object.prototype.hasOwnProperty.call(memo, fid)) {
      if (memo[fid]) {
        if (rootId) memo[rootId] = true;
        return true;
      }
      continue;
    }
    if (fid) {
      if (visited[fid]) continue;
      visited[fid] = true;
    }
    if (depth >= limit) continue;
    try {
      const pIt = cur.getParents && cur.getParents();
      while (pIt && pIt.hasNext()) {
        const pf = pIt.next();
        if (pf) queue.push({ folder: pf, depth: depth + 1 });
      }
    } catch (eParWalk) {
      if (rootId && memo) memo[rootId] = true;
      return true; // Fail closed if getParents() throws
    }
  }
  if (rootId && memo) memo[rootId] = false;
  return false;
}

function isFileInForbiddenProjectBFolder_(file, ancestorMemo) {
  if (!file) return false;
  try {
    const selfId = String((file.getId && file.getId()) || '').trim();
    if (isForbiddenProjectBFolderId_(selfId)) return true;
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      if (isFolderOrAncestorForbiddenProjectB_(pf, 8, ancestorMemo)) return true;
    }
  } catch (ePar) {
    return true; // Fail closed if getParents() throws
  }
  return false;
}

function isFileInProjectAAllowedFolders_(file, precomputedInboxMap, ancestorMemo) {
  if (!file) return false;
  try {
    const selfId = String((file.getId && file.getId()) || '').trim();
    if (isForbiddenProjectBFolderId_(selfId)) return false;
    const inboxMap = precomputedInboxMap || ((resolveSubirInboxFolders_(ancestorMemo) || {}).folderIdsMap) || {};
    const pIt = file.getParents();
    let hasAllowedParent = false;
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (!pid) continue;
      if (isForbiddenProjectBFolderId_(pid)) return false;
      if (isFolderOrAncestorForbiddenProjectB_(pf, 8, ancestorMemo)) return false;
      if (
        pid === SUBIR_INBOX_FOLDER_ID_ ||
        inboxMap[pid] ||
        isDestCategoryFolderId_(pid) ||
        pid === FOTOS_NUEVAS_CARGADO_FOLDER_ID_
      ) {
        hasAllowedParent = true;
      }
    }
    return hasAllowedParent;
  } catch (eAllow) {
    return false; // Fail closed if getParents() throws
  }
}

function validateProjectASourceFile_(srcFile, contextLabel) {
  if (!srcFile) {
    return { ok: false, error: 'Archivo no encontrado.' };
  }
  const errForbiddenB = 'Aislamiento Proyecto A/B: no se permite operar sobre archivos pertenecientes a carpetas exclusivas de Prompts/Odoo (SUBIR PROPT / SUBIDA DE FOTOS / fotos odoo / TELAS / MADERAS).';
  const errOutsideA = 'Aislamiento Proyecto A: el archivo no pertenece a carpetas permitidas de App #9 (SUBIR PREN, CATEGORIAS MUEBLES Y ACCESORIOS o FOTOS NUEVAS CARGADO).';

  if (isFileInForbiddenProjectBFolder_(srcFile)) {
    return { ok: false, forbiddenFolder: true, error: errForbiddenB };
  }
  if (!isFileInProjectAAllowedFolders_(srcFile)) {
    return { ok: false, forbiddenFolder: true, error: errOutsideA };
  }

  let mimeLower = '';
  try {
    mimeLower = String((srcFile.getMimeType && srcFile.getMimeType()) || '').toLowerCase();
  } catch (eMime) {
    return { ok: false, forbiddenFolder: true, error: 'No se pudo validar el tipo MIME del archivo (' + String(contextLabel || 'Proyecto A') + ').' };
  }

  if (mimeLower === 'application/vnd.google-apps.shortcut') {
    let targetFile = null;
    try {
      const targetId = String((srcFile.getTargetId && srcFile.getTargetId()) || '').trim();
      if (!targetId) {
        return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: acceso directo sin destino válido bloqueado.' };
      }
      if (isForbiddenProjectBFolderId_(targetId)) {
        return { ok: false, forbiddenFolder: true, error: errForbiddenB };
      }
      targetFile = DriveApp.getFileById(targetId);
    } catch (eScTarget) {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: acceso directo roto o inaccesible bloqueado.' };
    }
    if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: el destino del acceso directo está en papelera o no es válido.' };
    }
    const targetMime = String((targetFile.getMimeType && targetFile.getMimeType()) || '').toLowerCase();
    if (targetMime === 'application/vnd.google-apps.shortcut') {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: accesos directos encadenados no están permitidos.' };
    }
    if (isFileInForbiddenProjectBFolder_(targetFile)) {
      return { ok: false, forbiddenFolder: true, error: errForbiddenB };
    }
    if (!isFileInProjectAAllowedFolders_(targetFile)) {
      return { ok: false, forbiddenFolder: true, error: errOutsideA };
    }
  }

  return { ok: true };
}

function verifyExclusiveKevinOwner_(ss, body) {
  const authCheck = resolveAuthenticatedAdvisor_(ss || null, [], body || {});
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (authCheck && authCheck.error) || 'Sesión requerida. Inicia sesión con kevin.reyna@grupoanipa.com.'
    };
  }
  const emailNorm = String(authCheck.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const perms = authCheck.advisor.adminPermissions || null;
  const isPermittedAdmin = Boolean(authCheck.advisor.isAdmin && perms && perms.fotosApp === true);
  if (emailNorm !== OWNER_FOTOS_EMAIL_ && !isPermittedAdmin) {
    return {
      ok: false,
      forbidden: true,
      error: 'Acceso exclusivo denegado: este módulo está autorizado únicamente para ' + OWNER_FOTOS_EMAIL_ + ' o administradores con VER_FOTOS_APP = SI.'
    };
  }
  if (emailNorm === OWNER_FOTOS_EMAIL_ && perms && perms.fotosApp === false) {
    return {
      ok: false,
      forbidden: true,
      error: 'El permiso VER_FOTOS_APP está desactivado para tu cuenta en CUENTAS ADMINISTRATIVAS.'
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
  const tpNom = (tp + ' ' + nom).trim();
  const text = (tpNom + ' ' + cat).trim();
  const byKey = (k) => CATEGORIAS_DEST_FOLDERS_.find((f) => f.key === k) || CATEGORIAS_DEST_FOLDERS_[CATEGORIAS_DEST_FOLDERS_.length - 1];

  if (/\bFUTON|\bFUTTON|SOFA\s*CAMAS?|\bSALA\s+ASHA\b/.test(text)) return byKey('SOFA_CAMA');
  if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(tpNom) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL(?:ES)?\b|\bAUXILIAR(?:ES)?\b/.test(tpNom))) {
    return byKey('MESA_LATERAL');
  }
  if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRO|MESA\s+CENTRAL|MESA\s+NIDO/.test(tpNom) || cat === 'MESAS DE CENTRO & LATERALES') {
    return byKey('MESA_CENTRO');
  }
  const isModularSalaModule =
    /\b(SIN\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO)?|IZQ(?:UIERDO)?)|MODULO\s+CENTRAL|ESQUINERO|CHAISE|LOVE\s*SEAT|MODULAR)\b/.test(tpNom) ||
    (cat === 'SALAS & SOFAS' && /\bSILLON(?:ES)?\b/.test(tpNom) && /\b(DER(?:ECHO)?|IZQ(?:UIERDO)?|SIN\s+BRAZOS?|CENTRAL|MODULO)\b/.test(tpNom));
  if (isModularSalaModule) {
    return byKey('SALAS');
  }
  if (/\bSILLAS?\b/.test(nomHead) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('COMEDORES');
  }
  if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA)\b/.test(nomHead) && !/\bSILLAS?\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('SILLONES');
  }
  if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tpNom)) {
    return byKey('SILLONES');
  }
  if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tpNom)) {
    return byKey('SALAS');
  }
  if (
    cat === 'OFICINA' ||
    cat === 'EXTERIOR & TERRAZA' ||
    /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tpNom)) {
    return byKey('COMEDORES');
  }
  if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tpNom)) {
    return byKey('RECAMARAS');
  }
  if (
    cat === 'ACCESORIOS DECORATIVOS' ||
    cat === 'COJINES & TEXTILES' ||
    cat === 'ESPEJOS & ARTE' ||
    cat === 'ILUMINACION' ||
    /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tpNom)
  ) {
    return byKey('ACCESORIOS');
  }
  if (
    cat === 'BUFETERAS & CREDENZAS' ||
    cat === 'COMPLEMENTOS' ||
    /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  return byKey('INTERIOR');
}

const PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_ = 'CREATA_PA_PUBLIC_FOLDERS_OK_V1';
const PROJECT_A_LOADED_NAMES_CACHE_KEY_ = 'CREATA_PA_LOADED_NAMES_V1';

function ensurePublicSharingWithStatus_(item) {
  if (!item) return { ok: false, changed: false };
  try {
    if (typeof item.getSharingAccess === 'function') {
      const access = item.getSharingAccess();
      if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
        return { ok: true, changed: false };
      }
    }
    if (typeof item.setSharing === 'function') {
      item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { ok: true, changed: true };
    }
  } catch (eShare) {}
  return { ok: false, changed: false };
}

function ensurePublicSharingItem_(item) {
  return ensurePublicSharingWithStatus_(item).ok;
}

function ensureProjectAPublicFolders_(forceNow) {
  try {
    if (!forceNow) {
      const cached = CacheService.getScriptCache().get(PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_);
      if (cached === '1') return { ok: true, cached: true, updated: 0 };
    }
  } catch (eC) {}

  let updated = 0;
  const seen = {};
  const folderIds = [
    SUBIR_INBOX_FOLDER_ID_,
    CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    FOTOS_NUEVAS_CARGADO_FOLDER_ID_
  ];
  for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
    if (CATEGORIAS_DEST_FOLDERS_[i] && CATEGORIAS_DEST_FOLDERS_[i].id) {
      folderIds.push(CATEGORIAS_DEST_FOLDERS_[i].id);
    }
  }

  for (let i = 0; i < folderIds.length; i++) {
    const fid = String(folderIds[i] || '').trim();
    if (!fid || seen[fid] || isForbiddenProjectBFolderId_(fid)) continue;
    seen[fid] = true;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (fld && (!fld.isTrashed || !fld.isTrashed())) {
        if (!isFolderOrAncestorForbiddenProjectB_(fld, 8)) {
          if (ensurePublicSharingItem_(fld)) updated++;
          if (fid === SUBIR_INBOX_FOLDER_ID_ || fid === FOTOS_NUEVAS_CARGADO_FOLDER_ID_) {
            const subIt = fld.getFolders();
            while (subIt.hasNext()) {
              const sf = subIt.next();
              const sid = String((sf && sf.getId && sf.getId()) || '').trim();
              if (!sid || seen[sid] || isForbiddenProjectBFolderId_(sid)) continue;
              seen[sid] = true;
              if ((!sf.isTrashed || !sf.isTrashed()) && !isFolderOrAncestorForbiddenProjectB_(sf, 8)) {
                if (ensurePublicSharingItem_(sf)) updated++;
              }
            }
          }
        }
      }
    } catch (eFld) {}
  }

  try {
    CacheService.getScriptCache().put(PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_, '1', 600);
  } catch (ePut) {}
  return { ok: true, cached: false, updated: updated };
}

function lookupInvMetaFast_(ss, skuUpper) {
  const out = { nombre: '', tipo: '', categoria: '' };
  if (!ss || !skuUpper) return out;
  try {
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
    if (!shInv || shInv.getLastRow() < 3) return out;
    const colARng = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1);
    if (typeof colARng.createTextFinder === 'function') {
      const hit = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findNext();
      if (hit) {
        const r = shInv.getRange(hit.getRow(), 1, 1, 7).getValues()[0];
        return {
          tipo: cleanInvCell_(r[1]),
          nombre: cleanInvCell_(r[3]),
          categoria: cleanInvCell_(r[6])
        };
      }
      return out;
    }
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      if (cleanInvCell_(invVals[i][0]).toUpperCase() === skuUpper) {
        return {
          tipo: cleanInvCell_(invVals[i][1]),
          nombre: cleanInvCell_(invVals[i][3]),
          categoria: cleanInvCell_(invVals[i][6])
        };
      }
    }
  } catch (eInvFast) {}
  return out;
}

function parseUploadImageDataUrl_(dataUrl, rawNameInput, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de imagen inválido.' };
  }
  const mime = m[1];
  const base64Body = m[2];
  const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
  const cleanRaw = String(rawNameInput || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const baseName = cleanRaw || ((fallbackStem || ('foto-' + Date.now())) + '.' + ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + ext);
  const bytes = Utilities.base64Decode(base64Body);
  return {
    ok: true,
    mime: mime,
    ext: ext,
    fileName: finalName,
    blob: Utilities.newBlob(bytes, mime, finalName)
  };
}

function classifySubirInboxFileType_(mimeRaw, fileNameRaw) {
  const mime = String(mimeRaw || '').trim().toLowerCase();
  const name = String(fileNameRaw || '').trim();
  const extMatch = name.match(/\.([a-z0-9]{2,5})$/i);
  const nameExt = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : '';

  const imgExtRe = /^(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/;
  const docMimeByExt = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip'
  };
  const docExtByMime = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/csv': 'csv',
    'text/plain': 'txt',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip'
  };
  const imgMimeByExt = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff'
  };

  const isImg = (mime.indexOf('image/') === 0) || (nameExt && imgExtRe.test(nameExt));
  if (isImg) {
    let ext = nameExt && imgExtRe.test(nameExt) ? nameExt : '';
    if (!ext) {
      if (mime.indexOf('webp') !== -1) ext = 'webp';
      else if (mime.indexOf('png') !== -1) ext = 'png';
      else if (mime.indexOf('gif') !== -1) ext = 'gif';
      else if (mime.indexOf('avif') !== -1) ext = 'avif';
      else if (mime.indexOf('heic') !== -1) ext = 'heic';
      else if (mime.indexOf('heif') !== -1) ext = 'heif';
      else if (mime.indexOf('bmp') !== -1) ext = 'bmp';
      else if (mime.indexOf('tiff') !== -1) ext = 'tiff';
      else ext = 'jpg';
    }
    const resolvedImgMime = mime.indexOf('image/') === 0 ? mime : (imgMimeByExt[ext] || 'image/jpeg');
    return { ok: true, kind: 'image', ext: ext, mime: resolvedImgMime };
  }

  if (nameExt && Object.prototype.hasOwnProperty.call(docMimeByExt, nameExt)) {
    const resolvedDocMime = (mime && mime !== 'application/octet-stream' && Object.prototype.hasOwnProperty.call(docExtByMime, mime) && !(nameExt === 'csv' && mime === 'application/vnd.ms-excel'))
      ? mime
      : docMimeByExt[nameExt];
    return { ok: true, kind: 'document', ext: nameExt, mime: resolvedDocMime };
  }
  if (mime && Object.prototype.hasOwnProperty.call(docExtByMime, mime)) {
    const extFromMime = docExtByMime[mime];
    return { ok: true, kind: 'document', ext: extFromMime, mime: docMimeByExt[extFromMime] || mime };
  }
  return { ok: false };
}

function parseUploadFileDataUrl_(dataUrl, fallbackName, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:([a-zA-Z0-9.+\-]+\/[a-zA-Z0-9.+\-]+)?(?:;[^,]+)?;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de archivo inválido (se requiere data URL en base64).' };
  }
  const rawMime = String(m[1] || '').trim().toLowerCase();
  const cleanB64 = String(m[2] || '').replace(/\s+/g, '');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (!cleanB64) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (cleanB64.length > Math.ceil((MAX_BYTES * 4) / 3) + 16) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const cleanRaw = String(fallbackName || '')
    .replace(/(?:^|[\\/])\.\.(?=[\\/]|$)/g, ' ')
    .replace(/\.\.+/g, '.')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  const classified = classifySubirInboxFileType_(rawMime, cleanRaw);
  if (!classified.ok) {
    return {
      ok: false,
      error: 'Tipo de archivo no permitido. Usa fotos o documentos (.pdf, .doc, .docx, .xls, .xlsx, .csv, .txt, .ppt, .pptx, .zip).'
    };
  }

  const bytes = Utilities.base64Decode(cleanB64);
  if (!bytes || !bytes.length) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const stemDefault = String(fallbackStem || ((classified.kind === 'image' ? 'foto-' : 'doc-') + Date.now()));
  const baseName = cleanRaw || (stemDefault + '.' + classified.ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + classified.ext);
  return {
    ok: true,
    kind: classified.kind,
    mime: classified.mime,
    ext: classified.ext,
    fileName: finalName,
    sizeBytes: bytes.length,
    blob: Utilities.newBlob(bytes, classified.mime, finalName)
  };
}

function getFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  try {
    const cVal = CacheService.getScriptCache().get(KEY);
    if (cVal) return String(cVal);
  } catch (eC) {}
  try {
    const pVal = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pVal) {
      const sVal = String(pVal);
      try { CacheService.getScriptCache().put(KEY, sVal, 300); } catch (eC2) {}
      return sVal;
    }
  } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, '1', 300); } catch (eC3) {}
  return '1';
}

function invalidateFotosInboxSnapshotCache_(revToClear) {
  try {
    const cache = CacheService.getScriptCache();
    const r = String(revToClear || '').trim();
    if (r) {
      cache.remove('FOTOS_INBOX_META_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_F_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_T_V1_' + r);
    }
  } catch (eInv) {}
}

function bumpFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  const prevRev = getFotosInboxRev_();
  const prevSeq = parseInt(String(prevRev || '1').split('-')[0], 10) || 1;
  const nextRev = String(prevSeq + 1) + '-' + String(Date.now());
  invalidateFotosInboxSnapshotCache_(prevRev);
  try { PropertiesService.getScriptProperties().setProperty(KEY, nextRev); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, nextRev, 300); } catch (eC) {}
  return nextRev;
}

function hydrateFotosRecentUpload_(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fid = String(raw.fileId || raw.id || '').trim();
  if (!fid) return null;
  const kind = String(raw.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
  const targetKey = String(raw.targetKey || 'INBOX').trim().toUpperCase().slice(0, 80);
  return {
    id: fid,
    fileId: fid,
    targetKey: targetKey,
    targetLabel: String(raw.targetLabel || raw.fileName || targetKey).trim().slice(0, 120),
    targetKind: String(raw.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
    kind: kind,
    ext: String(raw.ext || '').trim().toLowerCase().slice(0, 8),
    fileName: String(raw.fileName || '').trim().slice(0, 120),
    viewUrl: String(raw.viewUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing')).trim().slice(0, 180),
    downloadUrl: String(raw.downloadUrl || ('https://drive.google.com/uc?export=download&id=' + fid)).trim().slice(0, 180),
    thumbUrl: kind === 'image' ? String(raw.thumbUrl || ('https://lh3.googleusercontent.com/d/' + fid + '=w800')).trim().slice(0, 180) : '',
    destFolderName: String(raw.destFolderName || '').trim().slice(0, 64),
    actorEmail: String(raw.actorEmail || '').trim().toLowerCase().slice(0, 80),
    ts: Number(raw.ts || 0) || 0
  };
}

function compactFotosRecentUploadForStore_(raw) {
  const rec = hydrateFotosRecentUpload_(raw);
  if (!rec) return null;
  const compact = {
    id: rec.id,
    targetKey: rec.targetKey,
    targetLabel: rec.targetLabel,
    targetKind: rec.targetKind,
    kind: rec.kind,
    ext: rec.ext,
    fileName: rec.fileName,
    destFolderName: rec.destFolderName,
    actorEmail: rec.actorEmail,
    ts: rec.ts
  };
  const defView = 'https://drive.google.com/file/d/' + rec.id + '/view?usp=sharing';
  const defDl = 'https://drive.google.com/uc?export=download&id=' + rec.id;
  const defThumb = 'https://lh3.googleusercontent.com/d/' + rec.id + '=w800';
  if (rec.viewUrl && rec.viewUrl !== defView) compact.viewUrl = rec.viewUrl;
  if (rec.downloadUrl && rec.downloadUrl !== defDl) compact.downloadUrl = rec.downloadUrl;
  if (rec.kind === 'image' && rec.thumbUrl && rec.thumbUrl !== defThumb) compact.thumbUrl = rec.thumbUrl;
  return compact;
}

function readFotosRecentUploads_() {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  try {
    const cRaw = CacheService.getScriptCache().get(KEY);
    if (cRaw) {
      const parsed = JSON.parse(cRaw);
      if (Array.isArray(parsed)) return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
    }
  } catch (eC) {}
  try {
    const pRaw = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pRaw) {
      const parsed = JSON.parse(pRaw);
      if (Array.isArray(parsed)) {
        try { CacheService.getScriptCache().put(KEY, pRaw, 300); } catch (eC2) {}
        return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
      }
    }
  } catch (eP) {}
  return [];
}

function writeFotosRecentUploads_(list) {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  const cleanCompact = (Array.isArray(list) ? list : [])
    .slice(0, 24)
    .map(compactFotosRecentUploadForStore_)
    .filter(Boolean);
  let json = JSON.stringify(cleanCompact);
  const byteLenFn = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_ : function (x) { return String(x || '').length; };
  while (cleanCompact.length > 1 && byteLenFn(json) > 8200) {
    cleanCompact.pop();
    json = JSON.stringify(cleanCompact);
  }
  try { PropertiesService.getScriptProperties().setProperty(KEY, json); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, json, 300); } catch (eC) {}
  return cleanCompact.map(hydrateFotosRecentUpload_).filter(Boolean);
}

function recordFotosRecentUpload_(entry) {
  try {
    if (!entry || typeof entry !== 'object') return readFotosRecentUploads_();
    const fid = String(entry.fileId || entry.id || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const kind = String(entry.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
    const targetKey = String(entry.targetKey || entry.sku || entry.overrideKey || 'INBOX').trim().toUpperCase().slice(0, 80);
    const rec = hydrateFotosRecentUpload_({
      id: fid,
      fileId: fid,
      targetKey: targetKey,
      targetLabel: String(entry.targetLabel || entry.productName || entry.label || entry.fileName || targetKey).trim().slice(0, 120),
      targetKind: String(entry.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
      kind: kind,
      ext: String(entry.ext || '').trim().toLowerCase().slice(0, 8),
      fileName: String(entry.fileName || '').trim().slice(0, 120),
      viewUrl: entry.viewUrl || '',
      downloadUrl: entry.downloadUrl || '',
      thumbUrl: entry.thumbUrl || '',
      destFolderName: String(entry.destFolderName || '').trim().slice(0, 64),
      actorEmail: String(entry.actorEmail || '').trim().toLowerCase().slice(0, 80),
      ts: Number(entry.ts || Date.now()) || Date.now()
    });
    if (!rec) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const dedupKey = rec.id + ':' + rec.targetKey;
    const merged = [rec].concat(prev.filter(function (it) {
      if (!it || !it.id) return false;
      return (String(it.id) + ':' + String(it.targetKey || '')) !== dedupKey;
    }));
    return writeFotosRecentUploads_(merged);
  } catch (eRec) {
    return readFotosRecentUploads_();
  }
}

function removeFotosRecentUploadByFileId_(fileId) {
  try {
    const fid = String(fileId || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const filtered = prev.filter(function (it) { return it && String(it.id || it.fileId || '') !== fid; });
    if (filtered.length !== prev.length) {
      return writeFotosRecentUploads_(filtered);
    }
    return prev;
  } catch (eRm) {
    return readFotosRecentUploads_();
  }
}

function cleanDuplicatesInSubirInbox_(movedFile, origName, shortcutFileId, resolvedInbox) {
  let removed = 0;
  try {
    const resolved = resolvedInbox || resolveSubirInboxFolders_();
    const inboxFolders = resolved.folders || [];
    const inboxMap = Object.assign({}, resolved.folderIdsMap || {});
    inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
    const movedId = movedFile && typeof movedFile.getId === 'function' ? String(movedFile.getId() || '').trim() : '';

    // 1) Asegurar que el archivo movido ya no tenga ningún padre dentro de SUBIR PREN
    if (movedFile && typeof movedFile.getParents === 'function') {
      try {
        const pIt = movedFile.getParents();
        while (pIt.hasNext()) {
          const pf = pIt.next();
          const pid = String((pf && pf.getId && pf.getId()) || '').trim();
          if (pid && inboxMap[pid] && !isDestCategoryFolderId_(pid) && !isForbiddenProjectBFolderId_(pid)) {
            try { pf.removeFile(movedFile); removed++; } catch (eRem1) {}
          }
        }
      } catch (ePar) {}
    }

    // 2) Si venía de un acceso directo en SUBIR PREN, enviar a papelera únicamente ese acceso directo exacto
    const cleanScId = String(shortcutFileId || '').trim();
    if (cleanScId && cleanScId !== movedId && !isForbiddenProjectBFolderId_(cleanScId)) {
      try {
        const scFile = DriveApp.getFileById(cleanScId);
        if (scFile && !scFile.isTrashed() && String(scFile.getMimeType() || '').toLowerCase() === 'application/vnd.google-apps.shortcut') {
          if (isFileInProjectAAllowedFolders_(scFile, inboxMap) && !isFileInForbiddenProjectBFolder_(scFile)) {
            scFile.setTrashed(true);
            removed++;
          }
        }
      } catch (eScTrash) {}
    }

    // 3) Limpiar referencias exactas al mismo movedId, accesos directos hacia movedId, y copias duplicadas
    //    con nombre descriptivo exacto dentro de SUBIR PREN (NUNCA borrar nombres genéricos de cámara como "image.jpg" de iOS)
    const cleanNameLower = String(origName || '').trim().toLowerCase();
    const isGenericCameraName = !cleanNameLower || /^(?:image|photo|foto|img|dsc|pxl|screenshot|captura)(?:[\s_-]*\d*)?\.(?:jpe?g|png|heic|heif|webp)$/i.test(cleanNameLower);
    if (movedId) {
      for (let i = 0; i < inboxFolders.length; i++) {
        const folder = inboxFolders[i];
        if (!folder) continue;
        const fidFolder = String((folder.getId && folder.getId()) || '').trim();
        if (!fidFolder || isDestCategoryFolderId_(fidFolder) || isForbiddenProjectBFolderId_(fidFolder)) continue;
        try {
          const fIt = folder.getFiles();
          while (fIt.hasNext()) {
            const cand = fIt.next();
            if (!cand || cand.isTrashed()) continue;
            const cid = String((cand.getId && cand.getId()) || '').trim();
            if (!cid || isForbiddenProjectBFolderId_(cid)) continue;
            if (cid === movedId) {
              try { folder.removeFile(cand); removed++; } catch (eRemSame) {}
              continue;
            }
            const cMime = String((cand.getMimeType && cand.getMimeType()) || '').toLowerCase();
            const isTargetShortcut = cMime === 'application/vnd.google-apps.shortcut' && String((cand.getTargetId && cand.getTargetId()) || '').trim() === movedId;
            const cNameLower = String((cand.getName && cand.getName()) || '').trim().toLowerCase();
            const isDescriptiveDuplicate = !isGenericCameraName && cNameLower && cNameLower === cleanNameLower;
            if (isTargetShortcut || isDescriptiveDuplicate) {
              try {
                let inDest = false;
                const cpIt = cand.getParents();
                while (cpIt.hasNext()) {
                  const cpf = cpIt.next();
                  if (cpf && isDestCategoryFolderId_(cpf.getId())) { inDest = true; break; }
                }
                if (!inDest && !isFileInForbiddenProjectBFolder_(cand)) {
                  cand.setTrashed(true);
                  removed++;
                } else if (inDest) {
                  folder.removeFile(cand);
                  removed++;
                }
              } catch (eDup) {}
            }
          }
        } catch (eScanInb) {}
      }
    }
  } catch (eCleanAll) {}
  return removed;
}

function collectLoadedFileNamesMap_(forceRefresh) {
  try {
    if (!forceRefresh) {
      const cached = CacheService.getScriptCache().get(PROJECT_A_LOADED_NAMES_CACHE_KEY_);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch (eC) {}

  const map = {};
  const startMs = Date.now();
  const MAX_MS = 4500;
  const folderIds = CATEGORIAS_DEST_FOLDERS_.map((f) => f.id);
  folderIds.push(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);

  for (let i = 0; i < folderIds.length; i++) {
    if ((Date.now() - startMs) > MAX_MS) break;
    const fid = folderIds[i];
    if (!fid || isForbiddenProjectBFolderId_(fid)) continue;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (!fld || (fld.isTrashed && fld.isTrashed())) continue;
      const it = fld.getFiles();
      let count = 0;
      while (it.hasNext() && count < 450 && (Date.now() - startMs) <= MAX_MS) {
        const f = it.next();
        if (!f || (f.isTrashed && f.isTrashed())) continue;
        const id = String(f.getId() || '').trim();
        const nm = String(f.getName() || '').trim();
        if (id && nm) {
          map[id] = nm;
          count++;
        }
      }
    } catch (eF) {}
  }

  try {
    const serialized = JSON.stringify(map);
    const byteLen = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(serialized) : serialized.length;
    if (byteLen < 95000) {
      CacheService.getScriptCache().put(PROJECT_A_LOADED_NAMES_CACHE_KEY_, serialized, 300);
    }
  } catch (ePut) {}
  return map;
}

function invalidateLoadedFileNamesCache_() {
  try { CacheService.getScriptCache().remove(PROJECT_A_LOADED_NAMES_CACHE_KEY_); } catch (e) {}
}

function resolveSubirInboxFolders_(ancestorMemo) {
  const folders = [];
  const folderIdsMap = {};
  let primaryFolder = null;

  function addFolderSafe(folderObj) {
    if (!folderObj) return;
    try {
      if (folderObj.isTrashed && folderObj.isTrashed()) return;
      const fid = String(folderObj.getId() || '').trim();
      if (!fid || folderIdsMap[fid]) return;
      if (isForbiddenProjectBFolderId_(fid) || isFolderOrAncestorForbiddenProjectB_(folderObj, 8, ancestorMemo)) return;
      if (isDestCategoryFolderId_(fid)) return;
      folderIdsMap[fid] = true;
      folders.push(folderObj);
      if (!primaryFolder) primaryFolder = folderObj;
    } catch (eAddF) {}
  }

  try {
    const baseSubir = DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_); // SUBIR PREN (exclusivo Proyecto A)
    addFolderSafe(baseSubir);
    if (baseSubir && !baseSubir.isTrashed() && folderIdsMap[SUBIR_INBOX_FOLDER_ID_]) {
      primaryFolder = baseSubir;
    }
  } catch (eBase) {}

  // Solo subcarpetas directas dentro de SUBIR PREN (protegidas contra IDs prohibidos de Proyecto B y categorías destino)
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
  const startListMs = Date.now();
  const ancestorMemo = (opts && opts.ancestorMemo) ? opts.ancestorMemo : {};
  ensureProjectAPublicFolders_(false);
  const resolved = (opts && opts.resolvedInbox) ? opts.resolvedInbox : resolveSubirInboxFolders_(ancestorMemo);
  const inboxFolders = resolved.folders || [];
  const inboxMap = resolved.folderIdsMap || {};
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
      let shortcutId = '';
      try {
        if (!f || f.isTrashed()) continue;
        let mime = String(f.getMimeType() || '').toLowerCase();
        if (mime === 'application/vnd.google-apps.shortcut') {
          let targetFile = null;
          try {
            shortcutId = String(f.getId() || '').trim();
            const targetId = String((f.getTargetId && f.getTargetId()) || '').trim();
            if (!targetId || isForbiddenProjectBFolderId_(targetId)) continue;
            targetFile = DriveApp.getFileById(targetId);
          } catch (eSc) {
            continue;
          }
          if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) continue;
          f = targetFile;
          mime = String(f.getMimeType() || '').toLowerCase();
          if (mime === 'application/vnd.google-apps.shortcut') continue;
        }
        const fid = String(f.getId() || '').trim();
        if (!fid || seenFileIds[fid]) continue;
        if (!isFileInProjectAAllowedFolders_(f, inboxMap, ancestorMemo)) continue;
        const name = String(f.getName() || '').trim();
        const classified = classifySubirInboxFileType_(mime, name);
        if (!classified.ok) continue;
        seenFileIds[fid] = true;
        if ((Date.now() - startListMs) < 900) {
          ensurePublicSharingItem_(f);
        }
        const updated = f.getLastUpdated();
        rawItems.push({
          fileObj: f,
          id: fid,
          shortcutId: shortcutId,
          name: name,
          kind: classified.kind,
          ext: classified.ext,
          mimeType: classified.mime,
          sizeBytes: Number(f.getSize() || 0) || 0,
          updatedAt: updated ? updated.toISOString() : ''
        });
      } catch (eItem) {}
    }
  }

  rawItems.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const files = [];
  let imgThumbCount = 0;
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const f = item.fileObj;
    const isImg = (item.kind === 'image');
    let thumbDataUrl = '';
    if (includeThumbs && isImg && imgThumbCount < 16) {
      imgThumbCount++;
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
      shortcutId: item.shortcutId || '',
      name: item.name,
      kind: item.kind,
      ext: item.ext,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      updatedAt: item.updatedAt,
      viewUrl: 'https://drive.google.com/file/d/' + item.id + '/view?usp=sharing',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + item.id,
      thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + item.id + '=w800') : '',
      thumbDataUrl: thumbDataUrl
    });
  }
  return files;
}

function sincronizarSkusHoja1DesdeInventario_(ss, flushNow, optsInternal) {
  const book = ss || getSpreadsheet_();
  const sh1 = book.getSheetByName('1');
  const shInv = book.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  if (!sh1 || !shInv || shInv.getLastRow() < 3) {
    return { ok: false, added: 0, totalHoja1: 0 };
  }

  const invRows = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1).getDisplayValues();
  const skipLock = Boolean(optsInternal && optsInternal.skipLock === true);
  let lock = null;
  if (!skipLock) {
    const lockState = acquireScriptLockSafe_(8000);
    if (!lockState.ok) {
      return { ok: false, retryable: true, added: 0, totalHoja1: 0 };
    }
    lock = lockState.lock;
  }
  try {
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
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRel1) {}
    }
  }
}

function handleFotosSubirList_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  let pendingDeletesProcessed = false;
  let hadPendingDeletes = false;
  if (body && body.pendingDeletes && typeof body.pendingDeletes === 'object') {
    const startPendMs = Date.now();
    const MAX_PEND_MS = 8000;
    try {
      const pd = body.pendingDeletes;
      const pSkus = Array.isArray(pd.skus) ? pd.skus : [];
      const pFiles = Array.isArray(pd.fileIds) ? pd.fileIds : [];
      hadPendingDeletes = (pSkus.length > 0 || pFiles.length > 0);
      let allCompleted = true;
      for (let i = 0; i < pSkus.length; i++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        if (pSkus[i]) handleFotosDelete_(Object.assign({}, body, { sku: pSkus[i], skipListReturn: true }));
      }
      for (let j = 0; j < pFiles.length; j++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        const pfid = String(pFiles[j] || '').trim();
        if (!pfid) continue;
        try {
          const checkF = DriveApp.getFileById(pfid);
          if (!checkF || checkF.isTrashed()) continue;
        } catch (eMissF) {
          continue;
        }
        handleFotosDelete_(Object.assign({}, body, { driveFileId: pfid, source: 'INBOX', skipListReturn: true }));
      }
      pendingDeletesProcessed = allCompleted;
    } catch (ePend) {}
  }

  let skuSync = { added: 0, totalHoja1: 0 };
  if (body && body.syncSkus) {
    try {
      skuSync = sincronizarSkusHoja1DesdeInventario_(ss, false) || skuSync;
    } catch (eSync1) {}
  }

  const currentRev = getFotosInboxRev_();
  const recentUploads = readFotosRecentUploads_();
  const sinceRev = String((body && body.sinceRev) || '').trim();
  const forceRefresh = !!(body && body.forceRefresh);
  const includeThumbs = !!(body && body.includeThumbs);
  const includeLoadedNames = !!(body && body.includeLoadedNames);
  const metaCacheKey = 'FOTOS_INBOX_META_V1_' + currentRev;
  const snapCacheKey = 'FOTOS_INBOX_SNAP_' + (includeThumbs ? 'T' : 'F') + '_V1_' + currentRev;

  // Fast path cero DriveApp: si sinceRev coincide con la revisión actual y la caché de 15s está fresca
  if (sinceRev && sinceRev === currentRev && !forceRefresh && !hadPendingDeletes && !(body && body.syncSkus) && !includeLoadedNames) {
    try {
      const metaRaw = CacheService.getScriptCache().get(metaCacheKey);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && typeof meta === 'object') {
          const cachedPrimaryId = String(meta.primaryId || SUBIR_INBOX_FOLDER_ID_);
          return {
            ok: true,
            unchanged: true,
            rev: currentRev,
            pendingCount: Number(meta.pendingCount || 0) || 0,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0
          };
        }
      }
    } catch (eMetaFast) {}
  }

  // Snapshot cache hit (15s keyed by rev) para múltiples dispositivos simultáneos sin repetir DriveApp
  if (!forceRefresh && !hadPendingDeletes) {
    try {
      const snapRaw = CacheService.getScriptCache().get(snapCacheKey);
      if (snapRaw) {
        const snap = JSON.parse(snapRaw);
        if (snap && Array.isArray(snap.files)) {
          const cachedPrimaryId = String(snap.primaryId || SUBIR_INBOX_FOLDER_ID_);
          const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
          return {
            ok: true,
            unchanged: false,
            fromCache: true,
            rev: currentRev,
            pendingCount: snap.files.length,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0,
            files: snap.files,
            loadedFileNames: loadedFileNames
          };
        }
      }
    } catch (eSnapRead) {}
  }

  ensureProjectAPublicFolders_(false);
  const ancestorMemo = {};
  const resolved = resolveSubirInboxFolders_(ancestorMemo);
  const primaryId = (resolved.primaryFolder && resolved.primaryFolder.getId()) || SUBIR_INBOX_FOLDER_ID_;
  const files = listSubirInboxFilesInternal_({
    includeThumbs: includeThumbs,
    resolvedInbox: resolved,
    ancestorMemo: ancestorMemo
  });

  try {
    const cache = CacheService.getScriptCache();
    cache.put(metaCacheKey, JSON.stringify({ primaryId: primaryId, pendingCount: files.length }), 15);
    const snapJson = JSON.stringify({ primaryId: primaryId, files: files });
    const snapBytes = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(snapJson) : snapJson.length;
    if (snapBytes < 95000) {
      cache.put(snapCacheKey, snapJson, 15);
    }
  } catch (eSnapPut) {}

  const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
  return {
    ok: true,
    unchanged: false,
    rev: currentRev,
    pendingCount: files.length,
    recentUploads: recentUploads,
    pendingDeletesProcessed: pendingDeletesProcessed,
    inboxFolderId: primaryId,
    inboxFolderUrl: 'https://drive.google.com/drive/folders/' + primaryId,
    destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destFolders: CATEGORIAS_DEST_FOLDERS_,
    hoja1SkusAdded: skuSync.added || 0,
    hoja1TotalSkus: skuSync.totalHoja1 || 0,
    files: files,
    loadedFileNames: loadedFileNames
  };
}

function handleFotosSyncSkus_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  ensureProjectAPublicFolders_(false);

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
  try {
    const auth = verifyExclusiveKevinOwner_(null, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const parsed = parseUploadFileDataUrl_(body && body.dataUrl, body && body.fileName, 'archivo-' + Date.now());
    if (!parsed.ok) return parsed;

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let fid = '';
    let createdName = '';
    let sizeBytes = 0;
    let updatedIso = '';
    let nextRev = '';
    let recentUploads = [];
    try {
      ensureProjectAPublicFolders_(false);
      const resolved = resolveSubirInboxFolders_();
      const inbox = resolved.primaryFolder || DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
      ensurePublicSharingItem_(inbox);
      const created = inbox.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      fid = created.getId();
      createdName = String(created.getName() || parsed.fileName).trim();
      sizeBytes = Number(created.getSize() || parsed.sizeBytes || 0) || 0;
      updatedIso = new Date().toISOString();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: fid,
        fileId: fid,
        targetKey: 'INBOX',
        targetLabel: createdName,
        targetKind: parsed.kind === 'document' ? 'DOCUMENTO' : 'SUBIR_PREN',
        kind: parsed.kind,
        ext: parsed.ext,
        fileName: createdName,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: parsed.kind === 'image' ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : '',
        destFolderName: 'SUBIR PREN',
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }

    const isImg = (parsed.kind === 'image');
    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      file: {
        id: fid,
        name: createdName,
        kind: parsed.kind,
        ext: parsed.ext,
        mimeType: parsed.mime,
        sizeBytes: sizeBytes,
        updatedAt: updatedIso,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : ''
      },
      files: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_()
    };
  } catch (errUpInbox) {
    return {
      ok: false,
      error: (errUpInbox && errUpInbox.message) ? errUpInbox.message : String(errUpInbox)
    };
  }
}

function handleFotosSubirAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

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

    ensureProjectAPublicFolders_(false);

    const reqFolderId = String((body && body.targetFolderId) || '').trim();
    const reqDestMeta = reqFolderId
      ? (CATEGORIAS_DEST_FOLDERS_.find((f) => f.id === reqFolderId) || null)
      : null;
    if (reqFolderId && (isForbiddenProjectBFolderId_(reqFolderId) || !reqDestMeta)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Carpeta destino inválida o fuera de CATEGORIAS MUEBLES Y ACCESORIOS.'
      };
    }

    const providedName = String((body && body.productName) || '').trim();
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || providedName,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };

    // Siempre acomodar automáticamente según la información de Sheets (a menos que se pida forceTargetFolderId explícito)
    const destMeta = (body && body.forceTargetFolderId && reqDestMeta)
      ? reqDestMeta
      : resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Pre-lectura fuera del lock para saber si el archivo ya está en uso por otro SKU (copy vs move)
    let isUsedByOtherSku = false;
    let preSheetName = '';
    try {
      const preRows = Math.max(sh1.getLastRow(), 3);
      const preVals = sh1.getRange(1, 1, preRows, 4).getDisplayValues();
      for (let i = 2; i < preVals.length; i++) {
        const cellSku = String(preVals[i][0] || '').trim().toUpperCase();
        const cellUrl = String(preVals[i][3] || '').trim();
        if (cellSku === skuUpper && !preSheetName && preVals[i][1]) {
          preSheetName = String(preVals[i][1]).trim();
        } else if (cellSku && cellSku !== skuUpper && cellUrl && cellUrl.indexOf(driveFileId) !== -1) {
          isUsedByOtherSku = true;
        }
      }
    } catch (ePreScan) {}

    const effectiveName = preSheetName || invMeta.nombre || providedName || skuUpper;

    if (isForbiddenProjectBFolderId_(driveFileId)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Aislamiento Proyecto A/B: no se permite mover ni asignar recursos de carpetas de Prompts/Odoo.'
      };
    }
    const srcFile = DriveApp.getFileById(driveFileId);
    const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_subir_assign');
    if (!srcCheck.ok) {
      return srcCheck;
    }

    // Respetar siempre el nombre original de la foto tal como se cargó/colocó
    const origName = String(srcFile.getName() || '').trim();
    const mimeLower = String(srcFile.getMimeType() || '').toLowerCase();
    const fallbackExt = mimeLower.indexOf('png') !== -1 ? '.png' : (mimeLower.indexOf('webp') !== -1 ? '.webp' : '.jpg');
    const preservedFileName = origName || (skuUpper + fallbackExt);

    let file = srcFile;
    const reuseFromLoaded = isUsedByOtherSku || !!(body && body.fromLoaded);

    if (reuseFromLoaded) {
      try {
        file = srcFile.makeCopy(preservedFileName, destFolder);
      } catch (eCopyLoaded) {
        file = srcFile;
      }
    } else {
      file.moveTo(destFolder);
      cleanDuplicatesInSubirInbox_(file, preservedFileName, body && body.shortcutId, null);
    }

    ensurePublicSharingItem_(file);

    try {
      file.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + effectiveName +
        ' | Categoría Drive: ' + destMeta.name +
        ' | Asignado por: ' + actorEmail +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = file.getId();
    const finalFileName = String(file.getName() || preservedFileName).trim();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Lock corto ÚNICAMENTE para escribir en Hoja "1" sin bloquear operaciones Drive concurrentes
    let primaryRowNumber = 0;
    let wasAppended = false;
    let previousUrl = '';
    let formulaResolvedName = effectiveName;
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();
      const matchedRows = [];
      let lastSkuRowInColA = 2; // Nunca escribir en fila 1 ni fila 2 (fórmulas maestras)
      for (let i = 2; i < vals1.length; i++) {
        const rowNum = i + 1;
        const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
        const cellUrl = String(vals1[i][3] || '').trim();
        if (cellSku) {
          lastSkuRowInColA = rowNum;
          if (cellSku === skuUpper) {
            matchedRows.push(rowNum);
            if (!previousUrl && cellUrl) previousUrl = cellUrl;
          }
        }
      }

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
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      invalidateLoadedFileNamesCache_();
      if (wasAppended) {
        try {
          const bVal = String(sh1.getRange(primaryRowNumber, 2).getDisplayValue() || '').trim();
          if (bVal) formulaResolvedName = bVal;
        } catch (eReadB) {}
      }
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    const nextRev = bumpFotosInboxRev_();
    const recentUploads = recordFotosRecentUpload_({
      id: finalFileId,
      fileId: finalFileId,
      targetKey: skuUpper,
      targetLabel: formulaResolvedName,
      targetKind: 'SKU',
      kind: 'image',
      ext: String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
      fileName: finalFileName,
      viewUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
      destFolderName: destMeta.name,
      actorEmail: actorEmail,
      ts: Date.now()
    });

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: reuseFromLoaded
          ? 'FOTO TOMADA DE CARGADAS Y ASIGNADA EN HOJA "1"'
          : (wasAppended ? 'NUEVO SKU + FOTO ASIGNADA DESDE SUBIR PREN' : 'FOTO ACTUALIZADA EN HOJA "1" DESDE SUBIR PREN'),
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: (reuseFromLoaded ? 'Tomada de fotos cargadas hacia "' : 'Movida de SUBIR PREN a "') + destMeta.name + '" conservando nombre "' + finalFileName + '" · Guardada en Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto en Columna D.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: formulaResolvedName,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      reusedLoaded: reuseFromLoaded,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
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
        usuario: String((body && (body.advisorEmail || body.email)) || OWNER_FOTOS_EMAIL_),
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
  }
}

function handleFotosDirectUploadAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    const parsed = parseUploadImageDataUrl_(body && body.dataUrl, body && body.fileName, skuUpper);
    if (!parsed.ok) return parsed;

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    ensureProjectAPublicFolders_(false);

    // Acomodar siempre automáticamente según Sheets (INVENTARIO_EN_VIVO)
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || String((body && body.productName) || '').trim() || skuUpper,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };
    const destMeta = resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Adquirir ScriptLock ANTES de crear archivo en Drive para que ningún reintento genere duplicados en Drive
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let finalFileId = '';
    let finalFileName = '';
    let driveViewUrl = '';
    let previousUrl = '';
    let primaryRowNumber = 0;
    let wasAppended = false;
    let nextRev = '';
    let recentUploads = [];
    try {
      const created = destFolder.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      try {
        created.setDescription(
          'SKU: ' + skuUpper +
          ' | Producto: ' + invMeta.nombre +
          ' | Categoría Drive: ' + destMeta.name +
          ' | Subido directo por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}

      finalFileId = created.getId();
      finalFileName = String(created.getName() || parsed.fileName).trim();
      driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

      const matchedRows = [];
      const lastRow1 = Math.max(2, sh1.getLastRow());
      const colARng = lastRow1 >= 3 ? sh1.getRange(3, 1, lastRow1 - 2, 1) : null;

      if (colARng && typeof colARng.createTextFinder === 'function') {
        const hits = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findAll();
        for (let h = 0; h < hits.length; h++) {
          const rNum = hits[h].getRow();
          if (rNum >= 3) {
            matchedRows.push(rNum);
            if (!previousUrl) previousUrl = String(sh1.getRange(rNum, 4).getDisplayValue() || '').trim();
          }
        }
      } else if (lastRow1 >= 3) {
        const vals1 = sh1.getRange(3, 1, lastRow1 - 2, 4).getValues();
        for (let i = 0; i < vals1.length; i++) {
          if (String(vals1[i][0] || '').trim().toUpperCase() === skuUpper) {
            matchedRows.push(i + 3);
            if (!previousUrl && vals1[i][3]) previousUrl = String(vals1[i][3]).trim();
          }
        }
      }

      if (matchedRows.length > 0) {
        primaryRowNumber = matchedRows[0];
        for (let m = 0; m < matchedRows.length; m++) {
          sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
        }
      } else {
        wasAppended = true;
        let lastNonEmptyA = 2;
        if (lastRow1 >= 3) {
          const colAVals = sh1.getRange(3, 1, lastRow1 - 2, 1).getValues();
          for (let k = colAVals.length - 1; k >= 0; k--) {
            if (String(colAVals[k][0] || '').trim()) {
              lastNonEmptyA = k + 3;
              break;
            }
          }
        }
        primaryRowNumber = Math.max(3, lastNonEmptyA + 1);
        if (primaryRowNumber > sh1.getMaxRows()) sh1.insertRowAfter(sh1.getMaxRows());
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      invalidateLoadedFileNamesCache_();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: skuUpper,
        targetLabel: invMeta.nombre,
        targetKind: 'SKU',
        kind: 'image',
        ext: parsed.ext || 'jpg',
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: destMeta.name,
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SUBIDA DIRECTA RÁPIDA EN HOJA "1"',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: 'Subida directa a "' + destMeta.name + '" conservando nombre "' + finalFileName + '" · Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: invMeta.nombre,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      timestamp: formatCancunNow_()
    };
  } catch (errDirect) {
    return {
      ok: false,
      error: (errDirect && errDirect.message) ? errDirect.message : String(errDirect)
    };
  }
}

function handleFotosUploadVisualOverride_(body) {
  try {
    const b = body || {};
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, b);
    if (!auth.ok) return auth;
    if (auth.advisor && auth.advisor.adminPermissions && auth.advisor.adminPermissions.gestionProductos === false) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado VER_GESTION_PRODUCTOS en CUENTAS ADMINISTRATIVAS.'
      };
    }
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const ovKey = String(b.overrideKey || b.sku || '').trim().toUpperCase();
    if (!ovKey || !/^V(?:COV|FAB|WOD):/i.test(ovKey) || ovKey.length > 80) {
      return { ok: false, error: 'Clave de portada/tela/madera inválida.' };
    }
    const kind = String(b.kind || (ovKey.indexOf('VFAB:') === 0 ? 'fabric' : (ovKey.indexOf('VWOD:') === 0 ? 'wood' : 'cover'))).trim().toLowerCase();
    const label = String(b.label || b.name || ovKey).trim().slice(0, 140);
    const categoryTag = kind === 'fabric' ? 'FABRIC_SWATCH' : (kind === 'wood' ? 'WOOD_SWATCH' : 'VISUAL_COVER');

    const sourceInboxFileId = String(b.sourceInboxFileId || '').trim();
    const fromLoaded = !!b.fromLoaded;
    let parsedUpload = null;
    if (sourceInboxFileId) {
      if (isForbiddenProjectBFolderId_(sourceInboxFileId)) {
        return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: carpeta no permitida.' };
      }
    } else {
      parsedUpload = parseUploadImageDataUrl_(b.dataUrl, b.fileName, label.replace(/[^a-zA-Z0-9_-]+/g, '_'));
      if (!parsedUpload.ok) return parsedUpload;
    }

    ensureProjectAPublicFolders_(false);
    const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
    ensurePublicSharingItem_(targetFolder);

    let finalFileId = '';
    let finalFileName = '';
    let createdUploadFile = null;

    if (!sourceInboxFileId) {
      // P1-01: subir binario a Drive FUERA del ScriptLock global para evitar contención;
      // si el candado de Sheets está ocupado, se revierte a papelera para que reintentos jamás dupliquen archivos.
      createdUploadFile = targetFolder.createFile(parsedUpload.blob);
      ensurePublicSharingItem_(createdUploadFile);
      try {
        createdUploadFile.setDescription(
          'Visual: ' + ovKey +
          ' | Etiqueta: ' + label +
          ' | Tipo: ' + categoryTag +
          ' | Subido por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}
      finalFileId = createdUploadFile.getId();
      finalFileName = String(createdUploadFile.getName() || parsedUpload.fileName).trim();
    }

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      if (createdUploadFile) {
        try { createdUploadFile.setTrashed(true); } catch (eRollback) {}
      }
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      if (sourceInboxFileId) {
        const srcFile = DriveApp.getFileById(sourceInboxFileId);
        const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_upload_visual_override');
        if (!srcCheck.ok) return srcCheck;
        finalFileName = String(srcFile.getName() || '').trim();
        if (!fromLoaded) {
          // Mover desde SUBIR PREN a FOTOS NUEVAS CARGADO conservando su nombre y sacándola de SUBIR PREN para no duplicar
          srcFile.moveTo(targetFolder);
          cleanDuplicatesInSubirInbox_(srcFile, finalFileName, b.shortcutId, null);
        }
        ensurePublicSharingItem_(srcFile);
        finalFileId = srcFile.getId();
      }

      const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';
      const saveRes = handleInvProductOverrideSave_({
        authToken: b.authToken || '',
        advisorEmail: b.advisorEmail || actorEmail,
        accessKey: b.accessKey || '',
        sheetTab: b.sheetTab || TAB_CUENTAS_ADMIN_,
        sku: ovKey,
        op: 'RESTORE',
        name: label,
        category: categoryTag,
        price: '',
        note: driveViewUrl
      }, { skipLock: true });
      invalidateLoadedFileNamesCache_();

      if (!saveRes || !saveRes.ok) {
        return {
          ok: false,
          fileId: finalFileId,
          driveUrl: driveViewUrl,
          error: (saveRes && saveRes.error) || 'Foto subida, pero falló guardar el vínculo.'
        };
      }

      const nextRev = bumpFotosInboxRev_();
      const recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: ovKey,
        targetLabel: label,
        targetKind: kind === 'fabric' ? 'TELA' : (kind === 'wood' ? 'MADERA' : 'PORTADA'),
        kind: 'image',
        ext: (parsedUpload && parsedUpload.ext) || String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: kind === 'fabric' ? 'Tela' : (kind === 'wood' ? 'Madera' : 'Portada'),
        actorEmail: actorEmail,
        ts: Date.now()
      });

      return {
        ok: true,
        rev: nextRev,
        recentUploads: recentUploads,
        overrideKey: ovKey,
        fileId: finalFileId,
        fileName: finalFileName,
        driveUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        override: saveRes.override,
        removedFromInbox: !!(sourceInboxFileId && !fromLoaded),
        timestamp: formatCancunNow_()
      };
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  } catch (errVisUp) {
    return {
      ok: false,
      error: (errVisUp && errVisUp.message) ? errVisUp.message : String(errVisUp)
    };
  }
}

function reubicarFotosSegunSheets_(opts) {
  const cfg = opts || {};
  const startMs = Date.now();
  const timeBudgetMs = Math.max(15000, Math.min(240000, Number(cfg.timeBudgetMs) || 45000));
  const startIndex = Math.max(0, parseInt(String(cfg.startIndex || 0), 10) || 0);
  const maxFiles = Math.max(1, Math.min(600, parseInt(String(cfg.maxFiles || 120), 10) || 120));

  const summary = {
    ok: true,
    foldersPublicUpdated: 0,
    filesChecked: 0,
    filesMoved: 0,
    filesMadePublic: 0,
    subirDuplicatesRemoved: 0,
    visualOverridesPublic: 0,
    nextStartIndex: 0,
    remaining: 0,
    errors: []
  };

  if (startIndex === 0) {
    const pubRes = ensureProjectAPublicFolders_(true);
    summary.foldersPublicUpdated = (pubRes && pubRes.updated) || 0;
  }

  const ss = getSpreadsheet_();
  const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  const sh1 = ss.getSheetByName('1');
  const invBySku = {};

  if (shInv && shInv.getLastRow() >= 3) {
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      const sk = cleanInvCell_(invVals[i][0]).toUpperCase();
      if (!sk || sk === 'SKU') continue;
      invBySku[sk] = {
        tipo: cleanInvCell_(invVals[i][1]),
        nombre: cleanInvCell_(invVals[i][3]),
        categoria: cleanInvCell_(invVals[i][6]),
        photoUrl: String(invVals[i][5] || '').trim()
      };
    }
  }

  // Agrupar por fileId -> categorías destino según Sheets
  const fileEntriesById = {};
  const orderedIds = [];
  const registerSkuFile = (skuUpper, rawUrl, colBName) => {
    const fid = extractDriveFileIdFromCell_(rawUrl);
    if (!fid || isForbiddenProjectBFolderId_(fid)) return;
    const inv = invBySku[skuUpper] || {};
    const dest = resolveCategoryDestFolderForProduct_(inv.categoria || '', inv.tipo || '', inv.nombre || colBName || skuUpper);
    if (!fileEntriesById[fid]) {
      fileEntriesById[fid] = { id: fid, destIds: {}, primaryDest: dest, isVisual: false };
      orderedIds.push(fid);
    }
    fileEntriesById[fid].destIds[dest.id] = dest;
  };

  // Priorizar primero Portadas (VCOV:) y Telas (VFAB:) guardadas en _INV_PRODUCT_OVERRIDES
  // para que siempre queden reparadas en el primer lote sin quedar detrás de miles de SKUs.
  try {
    const ovMap = readProductOverridesMap_(ss);
    Object.keys(ovMap).forEach((k) => {
      const entry = ovMap[k];
      if (!entry || entry.status === 'ELIMINADO' || entry.status === 'ARCHIVADO') return;
      const fid = extractDriveFileIdFromCell_(entry.note);
      if (!fid || isForbiddenProjectBFolderId_(fid) || fileEntriesById[fid]) return;
      fileEntriesById[fid] = {
        id: fid,
        destIds: {},
        primaryDest: { id: FOTOS_NUEVAS_CARGADO_FOLDER_ID_, name: 'FOTOS NUEVAS CARGADO' },
        isVisual: true
      };
      orderedIds.push(fid);
    });
  } catch (eOv) {}

  if (sh1 && sh1.getLastRow() >= 3 && sh1.getLastColumn() >= 4) {
    const vals1 = sh1.getRange(3, 1, sh1.getLastRow() - 2, 4).getDisplayValues();
    for (let i = 0; i < vals1.length; i++) {
      const sk = String(vals1[i][0] || '').trim().toUpperCase();
      const colB = String(vals1[i][1] || '').trim();
      const colD = String(vals1[i][3] || '').trim();
      if (sk && colD) registerSkuFile(sk, colD, colB);
    }
  }

  Object.keys(invBySku).forEach((sk) => {
    if (invBySku[sk].photoUrl) registerSkuFile(sk, invBySku[sk].photoUrl, invBySku[sk].nombre);
  });

  const resolvedInbox = resolveSubirInboxFolders_();
  const inboxMap = Object.assign({}, resolvedInbox.folderIdsMap || {});
  inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
  const folderObjCache = {};
  const getFolderCached = (fid) => {
    if (!folderObjCache[fid]) {
      folderObjCache[fid] = DriveApp.getFolderById(fid);
      ensurePublicSharingItem_(folderObjCache[fid]);
    }
    return folderObjCache[fid];
  };

  const endIndex = Math.min(orderedIds.length, startIndex + maxFiles);
  let idx = startIndex;
  for (; idx < endIndex; idx++) {
    if ((Date.now() - startMs) >= timeBudgetMs) break;
    const rec = fileEntriesById[orderedIds[idx]];
    if (!rec) continue;
    summary.filesChecked++;
    try {
      const file = DriveApp.getFileById(rec.id);
      if (!file || (file.isTrashed && file.isTrashed())) continue;
      if (isFileInForbiddenProjectBFolder_(file)) continue;

      const shareRes = ensurePublicSharingWithStatus_(file);
      if (shareRes && shareRes.changed) {
        summary.filesMadePublic++;
        if (rec.isVisual) summary.visualOverridesPublic++;
      }

      if (!isFileInProjectAAllowedFolders_(file, inboxMap)) continue;

      const parentIds = [];
      const pIt = file.getParents();
      while (pIt.hasNext()) {
        const pf = pIt.next();
        if (pf) parentIds.push(String(pf.getId() || '').trim());
      }

      const distinctDestIds = Object.keys(rec.destIds);
      const targetDestId = rec.primaryDest && rec.primaryDest.id;
      const isInSubir = parentIds.some((pid) => !!inboxMap[pid]);
      const isAlreadyInTarget = targetDestId && parentIds.indexOf(targetDestId) !== -1;

      if (rec.isVisual) {
        if (isInSubir && targetDestId) {
          const destFld = getFolderCached(targetDestId);
          file.moveTo(destFld);
          summary.filesMoved++;
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (targetDestId && distinctDestIds.length === 1 && (!isAlreadyInTarget || isInSubir)) {
        // Reubicar sin renombrar hacia la carpeta exacta de su categoría en Sheets
        const destFld = getFolderCached(targetDestId);
        file.moveTo(destFld);
        summary.filesMoved++;
        if (isInSubir) {
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (isInSubir && targetDestId) {
        // Si estaba compartida entre varias categorías pero aún seguía en SUBIR PREN, sacarla de SUBIR PREN
        const destFld = getFolderCached(targetDestId);
        if (!isAlreadyInTarget) {
          file.moveTo(destFld);
          summary.filesMoved++;
        }
        summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
      }
    } catch (eOne) {
      if (summary.errors.length < 25) {
        summary.errors.push(rec.id + ': ' + String((eOne && eOne.message) || eOne));
      }
    }
  }

  if (summary.filesMoved > 0 || summary.subirDuplicatesRemoved > 0) {
    invalidateLoadedFileNamesCache_();
    bumpFotosInboxRev_();
  }
  summary.nextStartIndex = idx < orderedIds.length ? idx : 0;
  summary.remaining = Math.max(0, orderedIds.length - idx);
  summary.checked = summary.filesChecked;
  summary.moved = summary.filesMoved;
  summary.publicFixed = summary.filesMadePublic + summary.foldersPublicUpdated;
  summary.nextIndex = summary.nextStartIndex;
  return summary;
}

function reubicarFotosSegunSheets() {
  const res = reubicarFotosSegunSheets_({ maxFiles: 500, timeBudgetMs: 240000 });
  Logger.log(JSON.stringify(res));
  return res;
}

function handleFotosReorganizeFromSheets_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;
  return reubicarFotosSegunSheets_({
    startIndex: body && body.startIndex,
    maxFiles: (body && (body.maxFiles || body.maxItems)) || 120,
    timeBudgetMs: 20000
  });
}

function handleFotosDelete_(body) {
  let deleteResult = null;
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    let driveFileId = String((body && body.driveFileId) || '').trim();
    const source = String((body && body.source) || '').trim().toUpperCase();
    const keepDriveFile = !!(body && body.keepDriveFile);
    const forceTrash = !!(body && body.forceTrash);

    if (!skuUpper && !driveFileId) {
      return { ok: false, error: 'Falta indicar SKU o ID de archivo a borrar.' };
    }

    const sh1 = ss.getSheetByName('1');
    const rowsToClear = [];
    const clearedRows = [];
    let previousUrl = '';
    let usedByOtherSku = false;
    let usedByVisualOverride = false;

    // Lectura preliminar fuera de ScriptLock para resolver driveFileId y protecciones
    if (sh1 && sh1.getLastRow() >= 3) {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();

      if (skuUpper) {
        for (let i = 2; i < vals1.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
          const cellUrl = String(vals1[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            if (!previousUrl) previousUrl = cellUrl;
            if (!driveFileId) {
              const mId = cellUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || cellUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
              if (mId && mId[1]) driveFileId = mId[1];
            }
            rowsToClear.push(rowNum);
          }
        }
      }

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

    // Proteger archivos que también están referenciados por Portadas (VCOV:) o Telas (VFAB:) activas en _INV_PRODUCT_OVERRIDES
    if (driveFileId) {
      try {
        const ovMap = readProductOverridesMap_(ss);
        const ovKeys = Object.keys(ovMap);
        for (let oi = 0; oi < ovKeys.length; oi++) {
          const ov = ovMap[ovKeys[oi]];
          if (!ov || ov.status === 'ELIMINADO' || ov.status === 'ARCHIVADO') continue;
          const ovNote = String(ov.note || '');
          if (ovNote && ovNote.indexOf(driveFileId) !== -1) {
            usedByVisualOverride = true;
            break;
          }
        }
      } catch (eOvCheck) {}
    }

    // Guardia de aislamiento Proyecto A/B ANTES de modificar Drive o Hoja "1" (incluso si otro SKU comparte el archivo o keepDriveFile: true)
    const shortcutId = String((body && body.shortcutId) || '').trim();
    const deleteTargetId = (source === 'INBOX' && shortcutId) ? shortcutId : driveFileId;
    const willTrashDrive = !!(deleteTargetId && !keepDriveFile && !usedByVisualOverride && (source === 'INBOX' || forceTrash || !usedByOtherSku));
    let targetFile = null;
    if (deleteTargetId) {
      if (isForbiddenProjectBFolderId_(deleteTargetId)) {
        return {
          ok: false,
          forbiddenFolder: true,
          error: 'Aislamiento Proyecto A/B: no se permite eliminar recursos pertenecientes a carpetas exclusivas de Prompts/Odoo.'
        };
      }
      try {
        targetFile = DriveApp.getFileById(deleteTargetId);
      } catch (eLookupDel) {
        targetFile = null;
      }
      if (targetFile) {
        const delCheck = validateProjectASourceFile_(targetFile, 'fotos_delete');
        if (!delCheck.ok) {
          return delCheck;
        }
      }
    }

    // Adquirir ScriptLock corto ÚNICAMENTE para limpiar Columna D en Hoja "1"
    if (sh1 && skuUpper && rowsToClear.length > 0) {
      const lockState = acquireScriptLockSafe_(15000);
      if (!lockState.ok) {
        return {
          ok: false,
          retryable: true,
          error: 'Otro guardado está en curso, reintentando...'
        };
      }
      const lock = lockState.lock;
      try {
        const curLast = Math.max(sh1.getLastRow(), 3);
        const curVals = sh1.getRange(1, 1, curLast, 4).getDisplayValues();
        for (let i = 2; i < curVals.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(curVals[i][0] || '').trim().toUpperCase();
          const cellUrl = String(curVals[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            sh1.getRange(rowNum, 4).clearContent();
            clearedRows.push(rowNum);
          }
        }
        if (clearedRows.length > 0) SpreadsheetApp.flush();
      } finally {
        try { lock.releaseLock(); } catch (e) {}
      }
    }

    let driveTrashed = false;
    let deletedFileName = '';
    if (willTrashDrive && targetFile) {
      try {
        deletedFileName = String(targetFile.getName() || '');
        try {
          targetFile.setTrashed(true);
          driveTrashed = true;
        } catch (eTrash) {
          // Si el archivo pertenece a otro propietario en carpeta compartida, quitarlo solo de carpetas permitidas
          const pIt = targetFile.getParents();
          while (pIt.hasNext()) {
            try {
              const pf = pIt.next();
              if (!isForbiddenProjectBFolderId_(pf.getId()) && !isFolderOrAncestorForbiddenProjectB_(pf, 8)) {
                pf.removeFile(targetFile);
                driveTrashed = true;
              }
            } catch (eRemP) {}
          }
        }
      } catch (eGetFile) {}
    }

    try { invalidateLoadedFileNamesCache_(); } catch (eInvCacheDel) {}
    const nextRev = bumpFotosInboxRev_();
    const recentUploads = removeFotosRecentUploadByFileId_(driveFileId);

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: skuUpper ? 'FOTO BORRADA DE HOJA "1" (COLUMNA D)' : 'FOTO BORRADA DE SUBIR PREN',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper ? (skuUpper + (clearedRows.length ? (' · Fila ' + clearedRows.join(',')) : '')) : (deletedFileName || driveFileId),
        detalle: (skuUpper ? ('Limpiada Columna D en Hoja "1" para SKU ' + skuUpper + (previousUrl ? (' (' + previousUrl + ')') : '')) : ('Eliminado archivo Drive ' + (deletedFileName || driveFileId))) + (driveTrashed ? ' · Archivo enviado a papelera Drive.' : (usedByVisualOverride ? ' · Archivo conservado en Drive (usado por Portada/Tela).' : '')),
        analisis: 'Fórmulas maestras B2:F2 intactas.'
      });
    } catch (eHistDel) {}

    deleteResult = {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      clearedSku: skuUpper,
      clearedRows: clearedRows,
      deletedFileId: driveFileId,
      deletedFileName: deletedFileName,
      driveTrashed: driveTrashed,
      usedByOtherSku: usedByOtherSku,
      usedByVisualOverride: usedByVisualOverride,
      remainingFiles: (body && body.skipListReturn) ? [] : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
    return deleteResult;
  } catch (errDel) {
    return {
      ok: false,
      error: (errDel && errDel.message) ? errDel.message : String(errDel)
    };
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
        'TOTAL REGISTROS', '=COUNTA(A7:A)',
        'MOVIMIENTOS OK', '=COUNTIF(B7:B,"MOVIMIENTO")',
        'FALLOS DE CÓDIGO / ERP', '=COUNTIF(B7:B,"FALLO DE CÓDIGO")',
        'ALERTAS TÉCNICAS', '=COUNTIF(B7:B,"ALERTA TÉCNICA")',
        'COTIZACIONES / FOTOS', '=COUNTIF(D7:D,"*COTIZACIÓN*")&" cot. · "&COUNTIF(D7:D,"*FOTO*")&" fotos"'
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
    const fechaHora = safeSheetCellText_(opts.fechaHora || formatCancunNow_(), 40);
    const clasificacion = safeSheetCellText_(opts.clasificacion || 'MOVIMIENTO', 40);
    const modulo = safeSheetCellText_(opts.modulo || 'AppsScript', 120);
    const evento = safeSheetCellText_(opts.evento || 'MOVIMIENTO SISTEMA', 160);
    const estado = safeSheetCellText_(opts.estado || '✅ OK', 40);
    const usuario = safeSheetCellText_(opts.usuario || 'Sistema Automático', 160);
    const sucursal = safeSheetCellText_(opts.sucursal || 'GENERAL', 100);
    const referencia = safeSheetCellText_(opts.referencia || '—', 220);
    const detalle = safeSheetCellText_(opts.detalle || '', 1000);
    const analisis = safeSheetCellText_(opts.analisis || analizarCausaFalloCodigo_(detalle, modulo, evento), 1000);

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

function handleInvLogEvent_(body, tokenInfo, viaPin) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const resolvedTok = (tokenInfo && tokenInfo.email)
    ? tokenInfo
    : (b.authToken ? verifyInvAuthToken_(b.authToken) : null);
  const tokEmail = resolvedTok && resolvedTok.email
    ? String(resolvedTok.email).trim().toLowerCase()
    : '';
  let isGuestCaller = false;
  let isAdminCaller = false;
  let callerUserMatches = [];
  let callerAdvisor = null;
  if (tokEmail) {
    const tokSt = lookupTokenUserStatus_(resolvedTok);
    const tabNorm = String(resolvedTok.sheetTab || '').trim().toUpperCase();
    isGuestCaller = /^INVITADOS?$/.test(tabNorm) || Boolean(tokSt && tokSt.isGuest);
    if (!isGuestCaller) {
      try {
        const authSs = typeof getAuthSpreadsheet_ === 'function' ? getAuthSpreadsheet_(ss) : ss;
        const allU = readAllBranchUsers_(authSs, []);
        if (Array.isArray(allU)) {
          callerUserMatches = allU.filter(function (u) {
            return u && u.correo === tokEmail && !isGuestReadOnlyUser_(u);
          });
          if (callerUserMatches.length) {
            callerAdvisor = callerUserMatches.find(function (u) {
              return String(u.sheetTab || '').trim().toUpperCase() === tabNorm;
            }) || callerUserMatches[0];
          }
        }
      } catch (eAdmLog) {}
      if (ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[tokEmail]) {
        isAdminCaller = true;
      } else {
        isAdminCaller = callerUserMatches.some(function (u) {
          return !!u.isAdmin;
        });
      }
    }
  } else if (viaPin === true) {
    // PIN-authenticated admin call (only when explicitly verified by gate.viaPin === true)
    isAdminCaller = true;
  } else {
    return {
      ok: false,
      authRequired: true,
      error: 'Sesión requerida para registrar eventos.'
    };
  }

  const rawModStr = String(b.module || 'inventario-app.js').trim();
  const rawEvStr = String(b.event || 'EVENTO CLIENTE WEB').trim();
  const mod = safeSheetCellText_(rawModStr || 'inventario-app.js', 120).trim();
  const ev = safeSheetCellText_(rawEvStr || 'EVENTO CLIENTE WEB', 160).trim();
  const modCanonRaw = rawModStr.replace(/^[\s'=+\-@]+/, '').trim().toUpperCase();
  const modCanonSafe = mod.replace(/^[\s'=+\-@]+/, '').trim().toUpperCase();
  const evCanonRaw = rawEvStr.replace(/^[\s'=+\-@]+/, '').trim();
  const evCanonSafe = ev.replace(/^[\s'=+\-@]+/, '').trim();
  const isSegEventPayload = (
    modCanonRaw === 'SEGUIMIENTO_COTIZACIONES' ||
    modCanonSafe === 'SEGUIMIENTO_COTIZACIONES' ||
    /^SEG_/i.test(evCanonRaw) ||
    /^SEG_/i.test(evCanonSafe)
  );
  if (isSegEventPayload && (!isAdminCaller || (callerAdvisor && !userHasEffectivePerm_(callerAdvisor, 'seguimiento')))) {
    return {
      ok: false,
      forbidden: true,
      error: 'Usa el endpoint seg_action para registrar eventos de Seguimiento.'
    };
  }

  const rawClasif = String(b.classification || 'FALLO DE CÓDIGO').trim().toUpperCase();
  let safeClasif;
  if (isAdminCaller) {
    safeClasif = (rawClasif === 'MOVIMIENTO' || rawClasif === 'ALERTA TÉCNICA' || rawClasif === 'FALLO DE CÓDIGO')
      ? rawClasif
      : 'FALLO DE CÓDIGO';
  } else {
    safeClasif = (rawClasif === 'ALERTA TÉCNICA' || rawClasif === 'FALLO DE CÓDIGO')
      ? rawClasif
      : 'FALLO DE CÓDIGO';
  }

  const det = safeSheetCellText_(String(b.detail || '').trim(), 1000);
  const anaRaw = String(b.analysis || '').trim() || analizarCausaFalloCodigo_(det, mod, ev);
  const ana = safeSheetCellText_(anaRaw, 600);
  const usuarioResolved = isAdminCaller
    ? String(b.user || tokEmail || 'Cliente Web').trim()
    : (tokEmail || 'Cliente Web');
  let sucursalResolved;
  if (isAdminCaller) {
    sucursalResolved = callerAdvisor
      ? (resolveAuthorizedUserStoreForLog_(callerAdvisor, callerUserMatches, b.branch) || 'INVENTARIO WEB')
      : String(b.branch || 'INVENTARIO WEB').trim();
  } else if (isGuestCaller) {
    sucursalResolved = 'SOLO LECTURA';
  } else if (callerAdvisor) {
    sucursalResolved = resolveAuthorizedUserStoreForLog_(callerAdvisor, callerUserMatches, b.branch);
  } else {
    sucursalResolved = String((resolvedTok && resolvedTok.sheetTab) || 'INVENTARIO WEB').trim() || 'INVENTARIO WEB';
  }
  const estadoRaw = String(b.status || (safeClasif === 'MOVIMIENTO' ? '✅ OK' : '❌ ERROR')).trim();

  const ok = registrarEventoHistorial_(ss, {
    clasificacion: safeClasif,
    modulo: mod,
    evento: ev,
    estado: safeSheetCellText_(estadoRaw, 60),
    usuario: safeSheetCellText_(usuarioResolved, 140),
    sucursal: safeSheetCellText_(sucursalResolved, 100),
    referencia: safeSheetCellText_(String(b.ref || '—').trim(), 120),
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
  if (s.indexOf('PROYECTO') >= 0 || /^PRO(?:Y|-|\d)/.test(f)) return 'PROYECTOS';
  if (s.indexOf('CASA CREATA') >= 0 || s.indexOf('BONAMPAK') >= 0 || /^(?:CCB|CC-)/.test(f)) return 'CASA CREATA';
  if (s.indexOf('PLAYA') >= 0 || /^(?:PL|PC-)/.test(f)) return 'PLAYA';
  if (s.indexOf('COLOSIO') >= 0 || s.indexOf('COLOCIO') >= 0 || s.indexOf('OUTLET') >= 0 || /^(?:DTC|OUT|CO-|OC-)/.test(f)) return 'COLOSIO';
  if (s.indexOf('PTC') >= 0 || s.indexOf('PUERTO') >= 0 || /^(?:PTC|CA-)/.test(f)) return 'PTC';
  return 'PTC';
}

const SEG_DELTA_STATE_KEY_ = 'SEG_DELTA_STATE_V1';
const SEG_DELTA_MAX_LOG_ = 160;
const SEG_DELTA_MAX_BYTES_ = 7200;

function readSegDeltaState_() {
  const fallback = { version: 1, invVersion: '', changes: [] };
  try {
    const cached = CacheService.getScriptCache().get(SEG_DELTA_STATE_KEY_);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        return {
          version: Number(parsed.version) || 1,
          invVersion: String(parsed.invVersion || ''),
          changes: Array.isArray(parsed.changes) ? parsed.changes : []
        };
      }
    }
  } catch (eC) {}
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(SEG_DELTA_STATE_KEY_);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const out = {
          version: Number(parsed.version) || 1,
          invVersion: String(parsed.invVersion || ''),
          changes: Array.isArray(parsed.changes) ? parsed.changes : []
        };
        try { CacheService.getScriptCache().put(SEG_DELTA_STATE_KEY_, JSON.stringify(out), 300); } catch (eC2) {}
        return out;
      }
    }
  } catch (eP) {}
  return fallback;
}

function writeSegDeltaState_(st) {
  const safe = {
    version: Math.max(1, Number((st && st.version) || 1)),
    invVersion: String((st && st.invVersion) || ''),
    changes: Array.isArray(st && st.changes) ? st.changes.slice(-SEG_DELTA_MAX_LOG_) : []
  };
  let raw = JSON.stringify(safe);
  while (raw.length > SEG_DELTA_MAX_BYTES_ && safe.changes.length > 10) {
    safe.changes = safe.changes.slice(Math.ceil(safe.changes.length * 0.25));
    raw = JSON.stringify(safe);
  }
  try { PropertiesService.getScriptProperties().setProperty(SEG_DELTA_STATE_KEY_, raw); } catch (eP) {}
  try { CacheService.getScriptCache().put(SEG_DELTA_STATE_KEY_, raw, 300); } catch (eC) {}
  return safe;
}

function recordSegDeltaChange_(kind, meta) {
  try {
    const m = meta || {};
    const st = readSegDeltaState_();
    const nextV = (Number(st.version) || 1) + 1;
    st.version = nextV;
    st.changes.push({
      v: nextV,
      ts: new Date().toISOString(),
      kind: String(kind || 'EVENT').toUpperCase(),
      folio: String(m.folio || '').trim().toUpperCase(),
      branch: String(m.branch || '').trim().toUpperCase(),
      advisorEmail: String(m.advisorEmail || '').trim().toLowerCase(),
      advisorName: String(m.advisorName || '').trim(),
      data: (m.data && typeof m.data === 'object') ? m.data : {}
    });
    writeSegDeltaState_(st);
    return nextV;
  } catch (eRec) {
    return 0;
  }
}

function bumpSegInvVersion_(stamp) {
  try {
    const st = readSegDeltaState_();
    st.invVersion = String(stamp || new Date().toISOString());
    writeSegDeltaState_(st);
    return st.invVersion;
  } catch (eBump) {
    return '';
  }
}

function readInventoryMapForSkus_(ssInv, targetSkusSet) {
  const result = { bySku: {}, syncBanner: '' };
  try {
    const shInv = (ssInv || getSpreadsheet_()).getSheetByName(CONFIG.TAB_INVENTORY);
    if (!shInv || shInv.getLastRow() < 3) return result;
    const lastR = shInv.getLastRow();
    const lastC = Math.min(Math.max(shInv.getLastColumn(), 32), 52);
    const hdrRows12 = shInv.getRange(1, 1, 2, lastC).getDisplayValues();
    const hdrRow1 = hdrRows12[0] || [];
    const hdrRow2 = hdrRows12[1] || [];
    result.syncBanner = String(hdrRow2[48] || '').trim();
    const priceHdrMatch = (idx) => /PRECIO/i.test(String(hdrRow1[idx] || '')) || /PRECIO/i.test(String(hdrRow2[idx] || ''));
    const priceIdx = (lastC >= 50 && priceHdrMatch(49)) ? 49 : (lastC >= 50 ? 49 : (lastC >= 49 ? 48 : -1));

    const dataRows = shInv.getRange(3, 1, lastR - 2, lastC).getDisplayValues();
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i] || [];
      const sku = String(r[0] || '').trim().toUpperCase();
      if (!sku) continue;
      if (targetSkusSet && !targetSkusSet[sku]) continue;
      const fotoRaw = String(r[5] || '').trim();
      const driveId = extractDriveFileIdFromCell_(fotoRaw);
      const rawPrice = priceIdx >= 0 ? String(r[priceIdx] || '') : '';
      const priceNum = parseFloat(rawPrice.replace(/[^0-9.-]/g, '')) || 0;
      result.bySku[sku] = {
        sku: sku,
        tipo: String(r[1] || '').trim(),
        modelo: String(r[2] || '').trim(),
        nombre: String(r[3] || '').trim(),
        foto: fotoRaw,
        driveId: driveId,
        cedis_bod: parseInt(String(r[20] || '0'), 10) || 0,
        cedis_pis: parseInt(String(r[21] || '0'), 10) || 0,
        casa_bod: parseInt(String(r[22] || '0'), 10) || 0,
        casa_pis: parseInt(String(r[23] || '0'), 10) || 0,
        ptc_bod: parseInt(String(r[24] || '0'), 10) || 0,
        ptc_pis: parseInt(String(r[25] || '0'), 10) || 0,
        col_bod: parseInt(String(r[26] || '0'), 10) || 0,
        col_pis: parseInt(String(r[27] || '0'), 10) || 0,
        pla_bod: parseInt(String(r[28] || '0'), 10) || 0,
        pla_pis: parseInt(String(r[29] || '0'), 10) || 0,
        out_bod: parseInt(String(r[30] || '0'), 10) || 0,
        out_pis: parseInt(String(r[31] || '0'), 10) || 0,
        precio: priceNum
      };
    }
  } catch (eInvRead) {}
  return result;
}

function sincronizarPasswordEnHojaSeguimiento_(email, newKey) {
  // Directorio unificado de cuentas y contraseñas exclusivamente en el libro privado CREATA_AUTH_PRIVADO_NO_COMPARTIR (getAuthSpreadsheet_).
  // No replicar contraseñas hacia pestañas legadas de COTIZACIONES BASE DE DATOS.
  return;
}

function extractPreSuppliedStockBreakdown_(pt) {
  if (!pt || typeof pt !== 'object') return null;
  const src = pt.stockBreakdown || pt.stockBodegas || pt.stocks || pt.inventario || pt.stockByLoc || pt;
  if (!src || typeof src !== 'object') return null;
  const hasAnyKey = (
    src.cedis_bodega !== undefined || src.cedisBodega !== undefined ||
    src.cedis_piso !== undefined || src.cedisPiso !== undefined ||
    src.casa_bodega !== undefined || src.casaBodega !== undefined ||
    src.colosio_bodega !== undefined || src.colosioBodega !== undefined ||
    src.playa_bodega !== undefined || src.playaBodega !== undefined ||
    src.ptc_bodega !== undefined || src.ptcBodega !== undefined
  );
  if (!hasAnyKey) return null;
  return {
    modelo: String(src.modelo || pt.model || pt.modelo || '').trim(),
    cedis_bodega: Number(src.cedis_bodega !== undefined ? src.cedis_bodega : src.cedisBodega) || 0,
    cedis_piso: Number(src.cedis_piso !== undefined ? src.cedis_piso : src.cedisPiso) || 0,
    casa_bodega: Number(src.casa_bodega !== undefined ? src.casa_bodega : src.casaBodega) || 0,
    casa_piso: Number(src.casa_piso !== undefined ? src.casa_piso : src.casaPiso) || 0,
    colosio_bodega: Number(src.colosio_bodega !== undefined ? src.colosio_bodega : src.colosioBodega) || 0,
    colosio_piso: Number(src.colosio_piso !== undefined ? src.colosio_piso : src.colosioPiso) || 0,
    playa_bodega: Number(src.playa_bodega !== undefined ? src.playa_bodega : src.playaBodega) || 0,
    playa_piso: Number(src.playa_piso !== undefined ? src.playa_piso : src.playaPiso) || 0,
    ptc_bodega: Number(src.ptc_bodega !== undefined ? src.ptc_bodega : src.ptcBodega) || 0,
    ptc_piso: Number(src.ptc_piso !== undefined ? src.ptc_piso : src.ptcPiso) || 0
  };
}

function registrarCotizacionAppEnSeguimiento_(ssInv, info) {
  try {
    if (!info || !info.folio || !Array.isArray(info.partidas) || !info.partidas.length) return false;
    const ssSeg = getSpreadsheetSeguimiento_();
    if (!ssSeg) return false;
    const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
    if (!shCot) return false;

    // Garantizar Columna AA (col 27) = ORIGEN_CREACION sin alterar datos previos
    if (shCot.getMaxColumns() < 27) {
      shCot.insertColumnsAfter(shCot.getMaxColumns(), 27 - shCot.getMaxColumns());
    }
    if (!String(shCot.getRange(1, 27).getDisplayValue() || '').trim()) {
      shCot.getRange(1, 27).setValue('ORIGEN_CREACION');
    }

    const folio = String(info.folio || '').trim().toUpperCase();
    const sucSeg = mapErpStoreToSeguimientoBranch_(info.erpStore || info.sheetTab, folio);
    const fechaStr = String(info.fechaStr || Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'));
    const advisorName = String(info.advisorName || '').trim();
    const advisorEmail = String(info.advisorEmail || '').trim().toLowerCase();
    const clientName = String(info.clientName || 'Prospecto CREATA').trim();
    const clientPhone = String(info.clientPhone || '').replace(/\D+/g, '');

    // Solo escanear INVENTARIO_EN_VIVO para los SKUs que no traen stockBreakdown
    const preSuppliedMap = {};
    const missingSkuSet = {};
    let needsInventoryScan = false;
    for (let p = 0; p < info.partidas.length; p++) {
      const pt = info.partidas[p] || {};
      const sku = String(pt.Clave || pt.sku || '').trim().toUpperCase();
      if (!sku) continue;
      const preSt = extractPreSuppliedStockBreakdown_(pt);
      if (preSt) {
        preSuppliedMap[sku] = preSt;
      } else {
        missingSkuSet[sku] = true;
        needsInventoryScan = true;
      }
    }

    const invMap = {};
    if (needsInventoryScan) {
      const invRes = readInventoryMapForSkus_(ssInv, missingSkuSet);
      const skuKeys = Object.keys(invRes.bySku || {});
      for (let i = 0; i < skuKeys.length; i++) {
        const k = skuKeys[i];
        const m = invRes.bySku[k];
        invMap[k] = {
          modelo: m.modelo || '',
          cedis_bodega: m.cedis_bod || 0,
          cedis_piso: m.cedis_pis || 0,
          casa_bodega: m.casa_bod || 0,
          casa_piso: m.casa_pis || 0,
          colosio_bodega: (m.col_bod || 0) + (m.out_bod || 0),
          colosio_piso: (m.col_pis || 0) + (m.out_pis || 0),
          playa_bodega: m.pla_bod || 0,
          playa_piso: m.pla_pis || 0,
          ptc_bodega: m.ptc_bod || 0,
          ptc_piso: m.ptc_pis || 0
        };
      }
    }

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

    const newRows = [];
    let updatedCount = 0;
    for (let p = 0; p < info.partidas.length; p++) {
      const pt = info.partidas[p] || {};
      const sku = String(pt.Clave || pt.sku || '').trim().toUpperCase();
      if (!sku) continue;
      const idPartida = folio + '_' + sku;
      const cant = Math.max(1, Number(pt.Cantidad || pt.qty || 1) || 1);
      const precio = Number(pt.PrecioUnitario || pt.PrecioOriginal || pt.price || 0) || 0;
      const nombreProd = String(pt.Nombre || pt.name || sku).trim();
      const st = preSuppliedMap[sku] || invMap[sku] || null;

      let cb = 0, cp = 0, tb = 0, tp = 0, tot = 0;
      if (st) {
        cb = st.cedis_bodega;
        cp = st.cedis_piso;
        if (sucSeg === 'PLAYA') { tb = st.playa_bodega; tp = st.playa_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'COLOSIO') { tb = st.colosio_bodega; tp = st.colosio_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'PTC') { tb = st.ptc_bodega; tp = st.ptc_piso; tot = cb + cp + tb + tp; }
        else if (sucSeg === 'CASA CREATA') { tb = st.casa_bodega; tp = st.casa_piso; tot = cb + cp + tb + tp; }
        else {
          // PROYECTOS: regla oficial Solo CEDIS
          tb = 0;
          tp = 0;
          tot = cb + cp;
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
        escapeSheetPlainText_(idPartida),
        escapeSheetPlainText_(folio),
        fechaStr,
        escapeSheetPlainText_(sucSeg),
        escapeSheetPlainText_(advisorName),
        escapeSheetPlainText_(advisorEmail),
        '',
        escapeSheetPlainText_(clientName),
        escapeSheetPlainText_(clientPhone),
        escapeSheetPlainText_(sku),
        escapeSheetPlainText_(nombreProd),
        escapeSheetPlainText_((st && st.modelo) || String(pt.model || pt.modelo || '')),
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
        '',
        'APP_COTIZACION'
      ];

      const targetRow = existingRowByPartida[idPartida.toUpperCase()];
      if (targetRow) {
        shCot.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
        updatedCount++;
      } else {
        newRows.push(rowValues);
      }
    }

    if (newRows.length > 0) {
      const startRow = Math.max(2, shCot.getLastRow() + 1);
      const endRow = startRow + newRows.length - 1;
      if (shCot.getMaxRows() < endRow) {
        shCot.insertRowsAfter(shCot.getMaxRows(), endRow - shCot.getMaxRows());
      }
      shCot.getRange(startRow, 1, newRows.length, 27).setValues(newRows);
    }
    if (newRows.length > 0 || updatedCount > 0) {
      recordSegDeltaChange_('QUOTE', {
        folio: folio,
        branch: sucSeg,
        advisorEmail: advisorEmail,
        advisorName: advisorName,
        data: { count: newRows.length + updatedCount, clientName: clientName }
      });
    }
    return (newRows.length > 0 || updatedCount > 0);
  } catch (eRegSeg) {
    Logger.log('Aviso registrarCotizacionAppEnSeguimiento_: ' + eRegSeg);
    return false;
  }
}

function isFolioAllowedForSegScope_(ssSeg, ssInv, folio, scope) {
  if (!folio || !scope || scope.isAdmin) return true;
  let foundAny = false;
  if (ssSeg) {
    const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
    if (shCot && shCot.getLastRow() >= 2) {
      const vals = shCot.getRange(2, 1, shCot.getLastRow() - 1, Math.min(shCot.getLastColumn(), 10)).getDisplayValues();
      for (let i = 0; i < vals.length; i++) {
        const r = vals[i] || [];
        if (String(r[1] || '').trim().toUpperCase() !== folio) continue;
        foundAny = true;
        if (matchesSegScope_(scope, r[5], r[4], r[3], folio)) return true;
      }
    }
    const shArch = ssSeg.getSheetByName(TAB_COTIZACIONES_ARCHIVADAS_);
    if (shArch && shArch.getLastRow() >= 2) {
      const archVals = shArch.getRange(2, 1, shArch.getLastRow() - 1, Math.min(shArch.getLastColumn(), 10)).getDisplayValues();
      for (let i = 0; i < archVals.length; i++) {
        const r = archVals[i] || [];
        if (String(r[1] || '').trim().toUpperCase() !== folio) continue;
        foundAny = true;
        if (matchesSegScope_(scope, r[5], r[4], r[3], folio)) return true;
      }
    }
  }
  if (ssInv) {
    const shLive = ssInv.getSheetByName(TAB_QUOTES_LIVE_);
    if (shLive && shLive.getLastRow() >= 2) {
      const vals = shLive.getRange(2, 1, shLive.getLastRow() - 1, Math.min(shLive.getLastColumn(), 10)).getDisplayValues();
      for (let i = 0; i < vals.length; i++) {
        const r = vals[i] || [];
        const f1 = String(r[0] || '').trim().toUpperCase();
        const f2 = String(r[1] || '').trim().toUpperCase();
        if (f1 !== folio && f2 !== folio) continue;
        foundAny = true;
        if (matchesSegScope_(scope, r[7], r[8], r[6], folio)) return true;
      }
    }
  }
  return !foundAny ? false : false;
}

function handleSegAction_(body) {
  const b = body || {};
  const sub = String(b.subAction || '').trim().toUpperCase();
  const folio = String(b.folio || '').trim().toUpperCase();
  const payload = b.payload || {};
  const ssInv = getSpreadsheet_();
  const authReq = b.authToken ? b : Object.assign({}, b, { authToken: b.token || '' });
  const authCheck = resolveAuthenticatedAdvisor_(ssInv, [], authReq);
  if (!authCheck || !authCheck.ok || !authCheck.advisor || isGuestReadOnlyUser_(authCheck.advisor)) {
    return { ok: false, authRequired: true };
  }
  const verifiedUser = authCheck.advisor;
  if (!userHasEffectivePerm_(verifiedUser, 'seguimiento')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_SEGUIMIENTO en CUENTAS ADMINISTRATIVAS.'
    };
  }
  const ALLOWED_SEG_SUBACTIONS = {
    SEG_NUEVA_COTIZACION_APP: true,
    SEG_CIERRE: true,
    SEG_TELEFONO: true,
    SEG_WHATSAPP: true,
    SEG_EMAIL: true
  };
  if (!sub || !ALLOWED_SEG_SUBACTIONS[sub]) {
    return {
      ok: false,
      error: 'Acción de seguimiento no permitida.'
    };
  }
  const scope = buildSegRoleScopeInfo_(verifiedUser);
  const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
  const userBranch = mapErpStoreToSeguimientoBranch_(verifiedUser.erpStore || verifiedUser.sheetTab, '');
  const ssSeg = getSpreadsheetSeguimiento_();
  const ahoraStr = Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd HH:mm:ss');

  // Evitar suplantación de identidad/sucursal en no-administradores
  const actorName = scope.isAdmin
    ? String(payload.asesor || payload.advisorName || payload.usuario || verifiedUser.nombre || userEmail).trim()
    : String(verifiedUser.nombre || userEmail).trim();
  const actorEmail = scope.isAdmin
    ? String(payload.correo_asesor || payload.advisorEmail || payload.email || userEmail).trim().toLowerCase()
    : userEmail;
  const reqBranchRaw = String(payload.sucursal || payload.erpStore || '').trim();
  const reqBranchNorm = normPlainUpper_(mapErpStoreToSeguimientoBranch_(reqBranchRaw, folio));
  const actorBranch = scope.isAdmin
    ? (reqBranchRaw || userBranch || 'TODAS')
    : ((reqBranchNorm && scope.allowedBranches[reqBranchNorm]) ? reqBranchRaw : (userBranch || ''));

  // Control estricto de propiedad/alcance del folio (previene IDOR e inyección de folios falsos)
  let histRefFolio = folio || 'SEGUIMIENTO';
  if (sub === 'SEG_NUEVA_COTIZACION_APP') {
    const reqItems = (payload && Array.isArray(payload.items)) ? payload.items : [];
    if (!reqItems.length) {
      return { ok: false, error: 'Agrega al menos una partida válida para registrar la cotización en Seguimiento.' };
    }
    if (reqItems.length > 15) {
      return { ok: false, error: 'Máximo 15 partidas permitidas por cotización en Seguimiento.' };
    }
    const targetFolio = String((payload && payload.folio) || folio || '').trim().toUpperCase();
    if (!targetFolio) {
      return { ok: false, error: 'Folio requerido para registrar la cotización en Seguimiento.' };
    }
    if (!scope.isAdmin) {
      let ownedInLive = false;
      const shLive = ssInv ? ssInv.getSheetByName(TAB_QUOTES_LIVE_) : null;
      if (shLive && shLive.getLastRow() >= 2) {
        const liveVals = shLive.getRange(2, 1, shLive.getLastRow() - 1, Math.min(shLive.getLastColumn(), 10)).getDisplayValues();
        for (let i = 0; i < liveVals.length; i++) {
          const r = liveVals[i] || [];
          const f1 = String(r[0] || '').trim().toUpperCase();
          const f2 = String(r[1] || '').trim().toUpperCase();
          if (f1 !== targetFolio && f2 !== targetFolio) continue;
          const rowOwnerEmail = String(r[7] || '').trim().toLowerCase();
          if (scope.isManager ? matchesSegScope_(scope, r[7], r[8], r[6], targetFolio) : (rowOwnerEmail === userEmail)) {
            ownedInLive = true;
            break;
          }
        }
      }
      if (!ownedInLive) {
        return {
          ok: false,
          forbidden: true,
          error: 'No tienes permiso para registrar o modificar el folio ' + targetFolio + ' en Seguimiento.'
        };
      }
    }
    histRefFolio = targetFolio;
  } else {
    if (!folio) {
      return { ok: false, error: 'Folio requerido para esta acción de seguimiento.' };
    }
    if (!scope.isAdmin && !isFolioAllowedForSegScope_(ssSeg, ssInv, folio, scope)) {
      return {
        ok: false,
        forbidden: true,
        error: 'No tienes permiso para modificar el folio ' + folio + '.'
      };
    }
    if (payload && typeof payload === 'object' && payload.folio) {
      payload.folio = histRefFolio;
    }
  }

  // Siempre respaldar también en HISTORIAL de 1xew para sincronización cruzada inmediata
  registrarEventoHistorial_(ssInv, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'SEGUIMIENTO_COTIZACIONES',
    evento: sub || 'SEG_ACTION',
    estado: '✅ OK',
    usuario: actorName,
    sucursal: actorBranch || 'TODAS',
    referencia: histRefFolio,
    detalle: JSON.stringify(payload),
    analisis: 'Evento sincronizado en vivo desde Seguimiento de Cotizaciones.'
  });

  if (!ssSeg) return { ok: true, fallbackOnly: true };

  const lock = LockService.getScriptLock();
  let gotLock = false;
  try {
    gotLock = lock.tryLock(10000);
  } catch (eLk) {}
  if (!gotLock) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está ocupado procesando otro cambio en Seguimiento. Intenta de nuevo en unos segundos.'
    };
  }

  try {
    if (sub === 'SEG_NUEVA_COTIZACION_APP' && payload && Array.isArray(payload.items)) {
      registrarCotizacionAppEnSeguimiento_(ssInv, {
        folio: payload.folio || folio,
        fechaStr: payload.fecha || ahoraStr.slice(0, 10),
        sheetTab: scope.isAdmin ? (payload.sheetTab || verifiedUser.sheetTab) : verifiedUser.sheetTab,
        erpStore: scope.isAdmin ? (payload.erpStore || verifiedUser.erpStore) : verifiedUser.erpStore,
        advisorName: actorName,
        advisorEmail: actorEmail,
        clientName: payload.clientName,
        clientPhone: payload.clientPhone,
        partidas: payload.items
      });
    } else if (sub === 'SEG_CIERRE' && folio) {
      const shCierres = ssSeg.getSheetByName('CIERRES_COTIZACIONES');
      const statusNorm = String(payload.estatus || 'CERRADA').trim().toUpperCase();
      let alreadyRecorded = false;
      if (shCierres && shCierres.getLastRow() >= 2) {
        const lastC = Math.min(shCierres.getLastColumn(), 12);
        const existing = shCierres.getRange(2, 1, shCierres.getLastRow() - 1, Math.max(lastC, 8)).getDisplayValues();
        for (let i = existing.length - 1; i >= 0; i--) {
          const exFol = String(existing[i][1] || '').trim().toUpperCase();
          const exSt = String(existing[i][7] || '').trim().toUpperCase();
          if (exFol === folio && exSt === statusNorm) {
            alreadyRecorded = true;
            break;
          }
        }
      }
      const closureRow = [
        safeSheetCellText_(payload.fecha_hora || ahoraStr.slice(0, 16), 40),
        safeSheetCellText_(folio, 60),
        safeSheetCellText_(actorBranch, 80),
        safeSheetCellText_(actorName, 140),
        safeSheetCellText_(actorEmail, 140),
        safeSheetCellText_(payload.cliente || '', 160),
        safeSheetCellText_(payload.whatsapp_cliente || '', 40),
        safeSheetCellText_(statusNorm, 40),
        safeSheetCellText_(payload.motivo || '', 240),
        safeSheetCellText_(payload.comentarios || '', 500),
        payload.total_productos !== undefined ? safeSheetCellText_(String(payload.total_productos), 30) : '',
        payload.piezas_cotizadas !== undefined ? safeSheetCellText_(String(payload.piezas_cotizadas), 500) : ''
      ];
      if (shCierres && !alreadyRecorded) {
        shCierres.appendRow(closureRow);
      }
      try {
        archiveFolioRowsInSeguimiento_(
          ssSeg,
          folio,
          statusNorm + (payload.motivo ? (': ' + String(payload.motivo).trim()) : ''),
          statusNorm,
          closureRow[0]
        );
      } catch (eArchCie) {
        Logger.log('Aviso auto-archivo en SEG_CIERRE: ' + eArchCie);
      }
      recordSegDeltaChange_('CIERRE', {
        folio: folio,
        branch: actorBranch,
        advisorEmail: actorEmail,
        advisorName: actorName,
        data: {
          Fecha_Hora: closureRow[0],
          Folio_ERP: folio,
          Sucursal: closureRow[2],
          Asesor: closureRow[3],
          Correo_Asesor: closureRow[4],
          Cliente: closureRow[5],
          WhatsApp_Cliente: closureRow[6],
          Estatus_Cierre: closureRow[7],
          Motivo_Cierre: closureRow[8],
          Comentarios: closureRow[9],
          Piezas_Cotizadas: closureRow[11]
        }
      });
    } else if (sub === 'SEG_TELEFONO' && folio) {
      const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
      const cleanTel = String(payload.whatsapp_cliente || '').replace(/\D+/g, '');
      if (shCot && shCot.getLastRow() >= 2 && cleanTel) {
        const lastR = shCot.getLastRow();
        const folCol = shCot.getRange(2, 2, lastR - 1, 1).getValues();
        const telRange = shCot.getRange(2, 9, lastR - 1, 1);
        const telVals = telRange.getDisplayValues();
        let touched = false;
        for (let i = 0; i < folCol.length; i++) {
          if (String(folCol[i][0] || '').trim().toUpperCase() === folio) {
            telVals[i][0] = cleanTel;
            touched = true;
          }
        }
        if (touched) {
          telRange.setNumberFormat('@').setValues(telVals);
        }
      }
      if (cleanTel) {
        recordSegDeltaChange_('PHONE', {
          folio: folio,
          branch: actorBranch,
          advisorEmail: actorEmail,
          advisorName: actorName,
          data: { whatsapp_cliente: cleanTel }
        });
      }
    } else if (sub === 'SEG_WHATSAPP' && folio) {
      const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
      const fAviso = safeSheetCellText_(payload.fecha_aviso || ahoraStr.slice(0, 16), 40);
      if (shCot && shCot.getLastRow() >= 2) {
        const lastR = shCot.getLastRow();
        const folCol = shCot.getRange(2, 2, lastR - 1, 1).getValues();
        const avisoRange = shCot.getRange(2, 26, lastR - 1, 1);
        const avisoVals = avisoRange.getDisplayValues();
        let touched = false;
        for (let i = 0; i < folCol.length; i++) {
          if (String(folCol[i][0] || '').trim().toUpperCase() === folio) {
            avisoVals[i][0] = fAviso;
            touched = true;
          }
        }
        if (touched) {
          avisoRange.setValues(avisoVals);
        }
      }
      recordSegDeltaChange_('WHATSAPP', {
        folio: folio,
        branch: actorBranch,
        advisorEmail: actorEmail,
        advisorName: actorName,
        data: { fecha_aviso: fAviso }
      });
    } else if (sub === 'SEG_EMAIL' && folio) {
      const fAviso = safeSheetCellText_(payload.fecha_aviso || ahoraStr.slice(0, 16), 40);
      recordSegDeltaChange_('EMAIL', {
        folio: folio,
        branch: actorBranch,
        advisorEmail: actorEmail,
        advisorName: actorName,
        data: { fecha_aviso: fAviso }
      });
    }

    const shHist = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
    if (shHist) {
      shHist.appendRow([
        ahoraStr,
        safeSheetCellText_(sub.replace(/^SEG_/, ''), 40),
        safeSheetCellText_(actorName, 140),
        safeSheetCellText_(actorEmail, 140),
        safeSheetCellText_(actorBranch, 80),
        safeSheetCellText_(payload.accion || (sub + ' Folio ' + histRefFolio), 200),
        safeSheetCellText_(payload.detalle || JSON.stringify(payload), 1000),
        'Web-App',
        safeSheetCellText_(payload.status || 'EXITOSO', 40)
      ]);
    }
  } catch (eSegAct) {
    Logger.log('Aviso handleSegAction_: ' + eSegAct);
  } finally {
    if (gotLock) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }

  const deltaSt = readSegDeltaState_();
  return { ok: true, version: deltaSt.version };
}

function extractDriveFileIdFromCell_(rawVal) {
  const s = String(rawVal || '').trim();
  if (!s) return '';
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})|[?&]id=([a-zA-Z0-9_-]{20,})|^([a-zA-Z0-9_-]{25,})$/);
  return m ? (m[1] || m[2] || m[3] || '') : '';
}

function readSheetDisplayMatrixSafe_(book, tabName, maxTailRows) {
  if (!book || !tabName) return [];
  const sh = book.getSheetByName(tabName);
  if (!sh) return [];
  const lastR = sh.getLastRow();
  const lastC = sh.getLastColumn();
  if (lastR < 1 || lastC < 1) return [];
  if (maxTailRows && lastR > maxTailRows + 1) {
    const hdr = sh.getRange(1, 1, 1, lastC).getDisplayValues();
    const startR = Math.max(2, lastR - maxTailRows + 1);
    const tail = sh.getRange(startR, 1, lastR - startR + 1, lastC).getDisplayValues();
    return hdr.concat(tail);
  }
  return sh.getRange(1, 1, lastR, lastC).getDisplayValues();
}

function readSheetAppendedRowsSafe_(book, tabName, afterRow) {
  if (!book || !tabName) return { lastRow: 0, rows: [], shrunk: false };
  const sh = book.getSheetByName(tabName);
  if (!sh) return { lastRow: 0, rows: [], shrunk: false };
  const lastR = sh.getLastRow();
  const lastC = sh.getLastColumn();
  const prevR = Math.max(0, parseInt(String(afterRow || 0), 10) || 0);
  if (lastR < prevR) {
    return { lastRow: lastR, rows: [], shrunk: true };
  }
  if (lastR <= prevR || lastR < 2 || lastC < 1) {
    return { lastRow: lastR, rows: [], shrunk: false };
  }
  const startR = Math.max(2, prevR + 1);
  const rows = sh.getRange(startR, 1, lastR - startR + 1, lastC).getDisplayValues();
  return { lastRow: lastR, rows: rows, shrunk: false };
}

function buildSegRoleScopeInfo_(verifiedUser) {
  const isAdmin = !!verifiedUser.isAdmin;
  const isManager = !isAdmin && isManagerUserRole_(verifiedUser);
  const roleScope = isAdmin ? 'ADMIN' : (isManager ? 'GERENTE' : 'ASESOR');
  const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
  const userNameNorm = normPlainUpper_(verifiedUser.nombre || '');
  const userBranchSeg = mapErpStoreToSeguimientoBranch_(verifiedUser.erpStore || verifiedUser.sheetTab, '');
  const userStoreNorm = normalizeQuoteErpStore_(verifiedUser.erpStore, verifiedUser.sheetTab);
  const allowedBranches = {};
  if (userBranchSeg) allowedBranches[normPlainUpper_(userBranchSeg)] = true;
  if (userStoreNorm) allowedBranches[userStoreNorm] = true;
  if (Array.isArray(verifiedUser.allLocations)) {
    for (let i = 0; i < verifiedUser.allLocations.length; i++) {
      const loc = verifiedUser.allLocations[i] || {};
      const bSeg = mapErpStoreToSeguimientoBranch_(loc.erpStore || loc.sheetTab, '');
      const bNorm = normalizeQuoteErpStore_(loc.erpStore, loc.sheetTab);
      if (bSeg) allowedBranches[normPlainUpper_(bSeg)] = true;
      if (bNorm) allowedBranches[bNorm] = true;
    }
  }
  return {
    isAdmin: isAdmin,
    isManager: isManager,
    roleScope: roleScope,
    userEmail: userEmail,
    userNameNorm: userNameNorm,
    userBranchSeg: userBranchSeg,
    userStoreNorm: userStoreNorm,
    allowedBranches: allowedBranches
  };
}

function namesMatchTokenAware_(aNormRaw, bNormRaw) {
  const a = String(aNormRaw || '').trim();
  const b = String(bNormRaw || '').trim();
  if (!a || !b) return false;
  if (a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;
  const tokA = a.split(/\s+/).filter(function (t) { return t.length >= 3; });
  const tokB = b.split(/\s+/).filter(function (t) { return t.length >= 3; });
  if (tokA.length < 2 || tokB.length < 2) return false;
  const shorter = tokA.length <= tokB.length ? tokA : tokB;
  const longerStr = tokA.length <= tokB.length ? b : a;
  let hits = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longerStr.indexOf(shorter[i]) !== -1) hits++;
  }
  return hits >= 2 && hits === shorter.length;
}

function matchesSegScope_(scope, rowEmailRaw, rowNameRaw, rowBranchRaw, rowFolioRaw) {
  if (scope.isAdmin) return true;
  const rowEmail = String(rowEmailRaw || '').trim().toLowerCase();
  const rowName = normPlainUpper_(rowNameRaw || '');
  const rowBranch = normPlainUpper_(mapErpStoreToSeguimientoBranch_(rowBranchRaw || '', rowFolioRaw || ''));
  const rawBranchNorm = normPlainUpper_(rowBranchRaw || '');
  const sameUser = (scope.userEmail && rowEmail && rowEmail === scope.userEmail) ||
    namesMatchTokenAware_(scope.userNameNorm, rowName);
  if (scope.isManager) {
    const sameBranch = Boolean((rowBranch && scope.allowedBranches[rowBranch]) || (rawBranchNorm && scope.allowedBranches[rawBranchNorm]));
    return sameUser || sameBranch;
  }
  return sameUser;
}

function filterSegMatrixByScope_(matrix, scope, colSpec, hasHeader) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  if (scope.isAdmin) return matrix;
  const out = hasHeader ? [matrix[0]] : [];
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const em = colSpec.email >= 0 ? r[colSpec.email] : '';
    const nm = colSpec.name >= 0 ? r[colSpec.name] : '';
    const br = colSpec.branch >= 0 ? r[colSpec.branch] : '';
    const fl = colSpec.folio >= 0 ? r[colSpec.folio] : '';
    if (matchesSegScope_(scope, em, nm, br, fl)) {
      out.push(r);
    }
  }
  return out;
}

function filterSafeSegConfigMatrix_(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const out = [];
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const key = String(row[0] || '').trim().toUpperCase();
    if (i > 0 && /(?:PIN|KEY|SECRET|TOKEN|PASS|CLAVE|CONTRASE)/.test(key)) continue;
    out.push(row);
  }
  return out;
}

function collectSkusFromQuotesLiveRows_(rows, targetSet, skipHeader) {
  if (!Array.isArray(rows) || !rows.length || !targetSet) return;
  let resumenIdx = 17;
  let startIdx = 0;
  if (skipHeader) {
    startIdx = 1;
    const hdr = rows[0] || [];
    for (let c = 0; c < hdr.length; c++) {
      const h = normPlainUpper_(hdr[c] || '');
      if (h === 'RESUMEN_SKUS' || h === 'RESUMEN SKUS' || h === 'SKUS') {
        resumenIdx = c;
        break;
      }
    }
  }
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    const raw = String(r[resumenIdx] || '').trim();
    if (!raw) continue;
    const parts = raw.split(/[,;|\n]+/);
    for (let p = 0; p < parts.length; p++) {
      const tok = String(parts[p] || '')
        .replace(/^'+/, '')
        .replace(/\s*\([^)]*\)\s*$/g, '')
        .replace(/\s*[x×]\s*\d+(?:\.\d+)?\s*$/i, '')
        .trim()
        .toUpperCase();
      if (tok) targetSet[tok] = true;
    }
  }
}

/**
 * Endpoint autenticado seg_get_state: sirve estado de Seguimiento e Historial en vivo
 * filtrado estrictamente por rol (Admin / Gerente / Asesor) sin escribir en ninguna hoja.
 */
function handleSegGetState_(body) {
  const b = body || {};
  const ssInv = getSpreadsheet_();
  const authCheck = resolveAuthenticatedAdvisor_(ssInv, [], b);
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return { ok: false, authRequired: true };
  }
  const verifiedUser = authCheck.advisor;
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return { ok: false };
  }
  const canSeg = userHasEffectivePerm_(verifiedUser, 'seguimiento');
  const canHist = userHasEffectivePerm_(verifiedUser, 'historial');
  if (!canSeg && !canHist) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivados los permisos VER_SEGUIMIENTO y VER_HISTORIAL en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const scope = buildSegRoleScopeInfo_(verifiedUser);
  const ssSeg = getSpreadsheetSeguimiento_();
  const cotCreataRaw = canSeg ? readSheetDisplayMatrixSafe_(ssSeg, 'COTIZACIONES_CREATA', 0) : [];
  const cotArchRaw = canSeg ? readSheetDisplayMatrixSafe_(ssSeg, TAB_COTIZACIONES_ARCHIVADAS_, 0) : [];
  const cotVivoRaw = canSeg ? readSheetDisplayMatrixSafe_(ssInv, TAB_QUOTES_LIVE_, 0) : [];
  const cierresRaw = canSeg ? readSheetDisplayMatrixSafe_(ssSeg, 'CIERRES_COTIZACIONES', 0) : [];
  const configCreata = filterSafeSegConfigMatrix_(readSheetDisplayMatrixSafe_(ssSeg, 'CONFIG_CREATA', 0));
  const histMovRaw = canHist ? readSheetDisplayMatrixSafe_(ssSeg, 'HISTORIAL_MOVIMIENTOS', 500) : [];

  const cotCreata = canSeg ? filterSegMatrixByScope_(cotCreataRaw, scope, { email: 5, name: 4, branch: 3, folio: 1 }, true) : [];
  const cotArch = canSeg ? filterSegMatrixByScope_(cotArchRaw, scope, { email: 5, name: 4, branch: 3, folio: 1 }, true) : [];
  const cotVivo = canSeg ? filterSegMatrixByScope_(cotVivoRaw, scope, { email: 7, name: 8, branch: 6, folio: 1 }, true) : [];
  const cierres = canSeg ? filterSegMatrixByScope_(cierresRaw, scope, { email: 4, name: 3, branch: 2, folio: 1 }, true) : [];
  const histMov = canHist ? filterSegMatrixByScope_(histMovRaw, scope, { email: 3, name: 2, branch: 4, folio: -1 }, true) : [];

  let histSeg = [];
  const shHistInv = canHist ? ssInv.getSheetByName(TAB_HISTORIAL_) : null;
  if (canHist && shHistInv && shHistInv.getLastRow() >= 6) {
    const lastR = shHistInv.getLastRow();
    const lastC = Math.min(shHistInv.getLastColumn(), 10);
    const hdrRow = shHistInv.getRange(6, 1, 1, lastC).getDisplayValues()[0];
    const scanStart = Math.max(7, lastR - 1500);
    const dataRows = lastR >= 7 ? shHistInv.getRange(scanStart, 1, lastR - scanStart + 1, lastC).getDisplayValues() : [];
    const matchedSeg = [];
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i] || [];
      if (String(r[1] || '').trim().toUpperCase() !== 'MOVIMIENTO') continue;
      if (String(r[2] || '').trim().toUpperCase() !== 'SEGUIMIENTO_COTIZACIONES') continue;
      if (!scope.isAdmin && !matchesSegScope_(scope, r[5], r[5], r[6], r[7])) continue;
      matchedSeg.push(r);
    }
    histSeg = [hdrRow].concat(matchedSeg.slice(-500));
  }

  // Leer inventario solo para los SKUs presentes en cotizaciones visibles (activas + archivadas + en vivo)
  const neededSkus = {};
  for (let i = 1; i < cotCreata.length; i++) {
    const sku = String((cotCreata[i] && cotCreata[i][9]) || '').trim().toUpperCase();
    if (sku) neededSkus[sku] = true;
  }
  for (let i = 1; i < cotArch.length; i++) {
    const sku = String((cotArch[i] && cotArch[i][9]) || '').trim().toUpperCase();
    if (sku) neededSkus[sku] = true;
  }
  collectSkusFromQuotesLiveRows_(cotVivo, neededSkus, true);
  const invRes = readInventoryMapForSkus_(ssInv, b.includeInventory ? null : (Object.keys(neededSkus).length ? neededSkus : null));
  const inventoryPhotosBySku = invRes.bySku || {};
  let invFullRows = null;
  if (b.includeInventory) {
    const shInv = ssInv.getSheetByName(CONFIG.TAB_INVENTORY);
    if (shInv && shInv.getLastRow() >= 3) {
      invFullRows = shInv.getRange(1, 1, shInv.getLastRow(), shInv.getLastColumn()).getDisplayValues();
    }
  }

  const sheetsOut = {
    COTIZACIONES_CREATA: cotCreata,
    COTIZACIONES_ARCHIVADAS: cotArch,
    COTIZACIONES_EN_VIVO: cotVivo,
    CIERRES_COTIZACIONES: cierres,
    CONFIG_CREATA: configCreata,
    HISTORIAL_MOVIMIENTOS: histMov,
    HISTORIAL_SEG: histSeg
  };
  if (invFullRows) {
    sheetsOut.INVENTARIO_EN_VIVO = invFullRows;
  }

  const advisorsDirectory = filterScopedDirectoryUsers_(authCheck.allUsers, verifiedUser, authCheck.userMatches);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    roleScope: scope.roleScope,
    syncBanner: invRes.syncBanner || '',
    sheets: sheetsOut,
    inventoryPhotosBySku: inventoryPhotosBySku,
    advisorsDirectory: advisorsDirectory
  };
}

/**
 * Endpoint incremental seg_get_delta ("Solo modificaciones nuevas"):
 * - Fast path (mode: 'noop'): si no cambió versión, inventario ni filas nuevas -> 0 lecturas de matrices.
 * - Delta path (mode: 'delta'): devuelve únicamente cambios en ring-buffer, filas recién agregadas
 *   después de los watermarks y stock actualizado solo para los SKUs activos de seguimiento.
 * - Bootstrap path (mode: 'full'): primera carga o tras borrado/reordenamiento/archivo de filas.
 */
function handleSegGetDelta_(body) {
  const b = body || {};
  const ssInv = getSpreadsheet_();
  const authCheck = resolveAuthenticatedAdvisor_(ssInv, [], b);
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return { ok: false, authRequired: true };
  }
  const verifiedUser = authCheck.advisor;
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return { ok: false };
  }
  const canSeg = userHasEffectivePerm_(verifiedUser, 'seguimiento');
  const canHist = userHasEffectivePerm_(verifiedUser, 'historial');
  if (!canSeg && !canHist) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivados los permisos VER_SEGUIMIENTO y VER_HISTORIAL en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const scope = buildSegRoleScopeInfo_(verifiedUser);
  const deltaState = readSegDeltaState_();
  const sinceVersion = Math.max(0, parseInt(String(b.sinceVersion || 0), 10) || 0);
  const sinceInvVersion = String(b.sinceInvVersion || '').trim();
  const wm = (b.rowWatermarks && typeof b.rowWatermarks === 'object') ? b.rowWatermarks : {};
  const forceFull = Boolean(b.forceFull);

  const ssSeg = getSpreadsheetSeguimiento_();
  const shCotCreata = canSeg && ssSeg ? ssSeg.getSheetByName('COTIZACIONES_CREATA') : null;
  const shCotArch = canSeg && ssSeg ? ssSeg.getSheetByName(TAB_COTIZACIONES_ARCHIVADAS_) : null;
  const shCotVivo = canSeg && ssInv ? ssInv.getSheetByName(TAB_QUOTES_LIVE_) : null;
  const shCierres = canSeg && ssSeg ? ssSeg.getSheetByName('CIERRES_COTIZACIONES') : null;
  const shHistMov = canHist && ssSeg ? ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS') : null;
  const shHistInv = canHist && ssInv ? ssInv.getSheetByName(TAB_HISTORIAL_) : null;

  const curWatermarks = {
    cotCreata: shCotCreata ? shCotCreata.getLastRow() : 0,
    cotArchivadas: shCotArch ? shCotArch.getLastRow() : 0,
    cotVivo: shCotVivo ? shCotVivo.getLastRow() : 0,
    cierres: shCierres ? shCierres.getLastRow() : 0,
    histMov: shHistMov ? shHistMov.getLastRow() : 0,
    histSeg: shHistInv ? shHistInv.getLastRow() : 0
  };

  // Leer banner de inventario en vivo (1 sola celda AW2) para detectar syncs hechos por Python/Trigger y GAS
  let aw2Banner = '';
  try {
    const shInv = ssInv.getSheetByName(CONFIG.TAB_INVENTORY);
    if (shInv && shInv.getLastRow() >= 2 && shInv.getLastColumn() >= 49) {
      aw2Banner = String(shInv.getRange(2, 49).getDisplayValue() || '').trim();
    }
  } catch (eAw) {}
  const liveInvBanner = [aw2Banner, deltaState.invVersion || ''].filter(Boolean).join('|');

  const prevCotCreata = parseInt(String(wm.cotCreata || 0), 10) || 0;
  const prevCotArch = parseInt(String(wm.cotArchivadas || 0), 10) || 0;
  const prevCotVivo = parseInt(String(wm.cotVivo || 0), 10) || 0;
  const prevCierres = parseInt(String(wm.cierres || 0), 10) || 0;
  const prevHistMov = parseInt(String(wm.histMov || 0), 10) || 0;

  const hasClientWatermarks = (prevCotCreata > 0 || prevCotArch > 0 || prevCotVivo > 0 || prevCierres > 0 || prevHistMov > 0) &&
    (b.sinceVersion !== undefined && b.sinceVersion !== null && String(b.sinceVersion).trim() !== '');
  const oldestLoggedV = deltaState.changes.length ? Number(deltaState.changes[0].v || 0) : deltaState.version;
  const anyShrunk = (canSeg && (
    (curWatermarks.cotCreata < prevCotCreata) ||
    (curWatermarks.cotArchivadas < prevCotArch) ||
    (curWatermarks.cotVivo < prevCotVivo) ||
    (curWatermarks.cierres < prevCierres)
  )) || (canHist && (curWatermarks.histMov < prevHistMov));
  const bufferOverflowed = (sinceVersion > 0 && sinceVersion < deltaState.version && deltaState.changes.length >= SEG_DELTA_MAX_LOG_ && sinceVersion < oldestLoggedV - 1);
  const needsFull = forceFull || !hasClientWatermarks || anyShrunk || bufferOverflowed;

  if (needsFull) {
    const fullState = handleSegGetState_(Object.assign({}, b, { includeInventory: false }));
    if (!fullState || !fullState.ok) return fullState || { ok: false };
    return {
      ok: true,
      mode: 'full',
      unchanged: false,
      version: deltaState.version,
      invVersion: liveInvBanner,
      rowWatermarks: curWatermarks,
      roleScope: scope.roleScope,
      updatedAt: fullState.updatedAt,
      syncBanner: liveInvBanner,
      sheets: fullState.sheets,
      stockDeltaBySku: fullState.inventoryPhotosBySku || {},
      advisorsDirectory: fullState.advisorsDirectory || [],
      summary: { fullBootstrap: true }
    };
  }

  const versionChanged = deltaState.version !== sinceVersion;
  const invChanged = Boolean(liveInvBanner && liveInvBanner !== sinceInvVersion);
  const rowsAppended = (canSeg && (
    (curWatermarks.cotCreata > prevCotCreata) ||
    (curWatermarks.cotArchivadas > prevCotArch) ||
    (curWatermarks.cotVivo > prevCotVivo) ||
    (curWatermarks.cierres > prevCierres)
  )) || (canHist && (curWatermarks.histMov > prevHistMov));

  // FAST PATH: Nada cambió => 0 lecturas de matrices
  if (!versionChanged && !invChanged && !rowsAppended) {
    return {
      ok: true,
      mode: 'noop',
      unchanged: true,
      version: deltaState.version,
      invVersion: liveInvBanner,
      rowWatermarks: curWatermarks,
      roleScope: scope.roleScope,
      updatedAt: new Date().toISOString(),
      syncBanner: liveInvBanner,
      summary: { totalChanges: 0, newQuotes: 0, updatedQuotes: 0, newClosures: 0, stockUpdates: 0 }
    };
  }

  // DELTA PATH: Leer únicamente cambios nuevos después de los watermarks
  const filteredChanges = [];
  if (canSeg && versionChanged) {
    for (let i = 0; i < deltaState.changes.length; i++) {
      const ch = deltaState.changes[i];
      if (!ch || Number(ch.v || 0) <= sinceVersion) continue;
      if (ch.kind === 'ERP_SYNC' || matchesSegScope_(scope, ch.advisorEmail, ch.advisorName, ch.branch, ch.folio)) {
        filteredChanges.push(ch);
      }
    }
  }

  // Si hubo un ERP_SYNC completo de cotizaciones desde la última lectura, refrescar con full limpio
  if (filteredChanges.some(function (c) { return c.kind === 'ERP_SYNC'; })) {
    const fullAfterErp = handleSegGetState_(Object.assign({}, b, { includeInventory: false }));
    if (fullAfterErp && fullAfterErp.ok) {
      return {
        ok: true,
        mode: 'full',
        unchanged: false,
        version: deltaState.version,
        invVersion: liveInvBanner,
        rowWatermarks: curWatermarks,
        roleScope: scope.roleScope,
        updatedAt: fullAfterErp.updatedAt,
        syncBanner: liveInvBanner,
        sheets: fullAfterErp.sheets,
        stockDeltaBySku: fullAfterErp.inventoryPhotosBySku || {},
        advisorsDirectory: fullAfterErp.advisorsDirectory || [],
        summary: { erpQuotesRefresh: true }
      };
    }
  }

  const appCotCreata = (canSeg && curWatermarks.cotCreata > prevCotCreata)
    ? filterSegMatrixByScope_(readSheetAppendedRowsSafe_(ssSeg, 'COTIZACIONES_CREATA', prevCotCreata).rows, scope, { email: 5, name: 4, branch: 3, folio: 1 }, false)
    : [];
  const appCotArch = (canSeg && curWatermarks.cotArchivadas > prevCotArch)
    ? filterSegMatrixByScope_(readSheetAppendedRowsSafe_(ssSeg, TAB_COTIZACIONES_ARCHIVADAS_, prevCotArch).rows, scope, { email: 5, name: 4, branch: 3, folio: 1 }, false)
    : [];
  const appCotVivo = (canSeg && curWatermarks.cotVivo > prevCotVivo)
    ? filterSegMatrixByScope_(readSheetAppendedRowsSafe_(ssInv, TAB_QUOTES_LIVE_, prevCotVivo).rows, scope, { email: 7, name: 8, branch: 6, folio: 1 }, false)
    : [];
  const appCierres = (canSeg && curWatermarks.cierres > prevCierres)
    ? filterSegMatrixByScope_(readSheetAppendedRowsSafe_(ssSeg, 'CIERRES_COTIZACIONES', prevCierres).rows, scope, { email: 4, name: 3, branch: 2, folio: 1 }, false)
    : [];
  const appHistMov = (canHist && curWatermarks.histMov > prevHistMov)
    ? filterSegMatrixByScope_(readSheetAppendedRowsSafe_(ssSeg, 'HISTORIAL_MOVIMIENTOS', prevHistMov).rows, scope, { email: 3, name: 2, branch: 4, folio: -1 }, false)
    : [];

  // Stock delta solo para los SKUs activos que sigue el usuario + SKUs recién agregados
  const activeSkusSet = {};
  if (canSeg && Array.isArray(b.activeSkus)) {
    for (let i = 0; i < b.activeSkus.length && i < 600; i++) {
      const sk = String(b.activeSkus[i] || '').trim().toUpperCase();
      if (sk) activeSkusSet[sk] = true;
    }
  }
  for (let i = 0; i < appCotCreata.length; i++) {
    const sk = String((appCotCreata[i] && appCotCreata[i][9]) || '').trim().toUpperCase();
    if (sk) activeSkusSet[sk] = true;
  }
  for (let i = 0; i < appCotArch.length; i++) {
    const sk = String((appCotArch[i] && appCotArch[i][9]) || '').trim().toUpperCase();
    if (sk) activeSkusSet[sk] = true;
  }
  collectSkusFromQuotesLiveRows_(appCotVivo, activeSkusSet, false);

  let stockDeltaBySku = {};
  if ((invChanged || appCotCreata.length > 0 || appCotArch.length > 0 || appCotVivo.length > 0) && Object.keys(activeSkusSet).length > 0) {
    const invDeltaRes = readInventoryMapForSkus_(ssInv, activeSkusSet);
    stockDeltaBySku = invDeltaRes.bySku || {};
  }

  const newQuotesCount = appCotCreata.length + appCotArch.length + appCotVivo.length;
  const newClosuresCount = appCierres.length;
  const updatedQuotesCount = filteredChanges.filter(function (c) { return c.kind !== 'CIERRE'; }).length;
  const stockUpdatesCount = Object.keys(stockDeltaBySku).length;
  const totalChanges = newQuotesCount + newClosuresCount + updatedQuotesCount + appHistMov.length + (invChanged && stockUpdatesCount > 0 ? 1 : 0);

  return {
    ok: true,
    mode: totalChanges === 0 ? 'noop' : 'delta',
    unchanged: totalChanges === 0,
    version: deltaState.version,
    invVersion: liveInvBanner,
    rowWatermarks: curWatermarks,
    roleScope: scope.roleScope,
    updatedAt: new Date().toISOString(),
    syncBanner: liveInvBanner,
    changes: filteredChanges,
    appendedRows: {
      COTIZACIONES_CREATA: appCotCreata,
      COTIZACIONES_ARCHIVADAS: appCotArch,
      COTIZACIONES_EN_VIVO: appCotVivo,
      CIERRES_COTIZACIONES: appCierres,
      HISTORIAL_MOVIMIENTOS: appHistMov
    },
    stockDeltaBySku: stockDeltaBySku,
    summary: {
      totalChanges: totalChanges,
      newQuotes: newQuotesCount,
      updatedQuotes: updatedQuotesCount,
      newClosures: newClosuresCount,
      stockUpdates: stockUpdatesCount
    }
  };
}

// ============================================================================
// SINCRONIZACIÓN EN VIVO 24/7 DE COTIZACIONES (S MUEBLERÍA ERP -> SEGUIMIENTO)
// Y ARCHIVO AUTOMÁTICO DE COTIZACIONES CERRADAS / VENDIDAS (SIN CORTE DÍA 25)
// ============================================================================
const TAB_COTIZACIONES_ARCHIVADAS_ = 'COTIZACIONES_ARCHIVADAS';
const SEG_QUOTES_SYNC_THROTTLE_KEY_ = 'SEG_QUOTES_CLOUD_SYNC_THROTTLE_V1';
const SEG_QUOTES_SYNC_THROTTLE_SEC_ = 600; // 10 min entre syncs automáticos en el trigger 24/7

const SEG_COTIZACIONES_HEADERS_27_ = [
  'ID_Partida', 'Folio_ERP', 'Fecha_Cotizacion', 'Sucursal', 'Asesor', 'Correo_Asesor',
  'Tel_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Clave_Producto', 'Nombre_Producto', 'Modelo',
  'Precio_Unitario', 'Cantidad_Cotizada', 'Stock_Inicial_Total', 'Stock_Actual_CEDIS_Bodega',
  'Stock_Actual_CEDIS_Piso', 'Stock_Actual_Tienda_Bodega', 'Stock_Actual_Tienda_Piso',
  'Stock_Actual_Total', 'Variacion_Stock', 'Porcentaje_Caida', 'Nivel_Urgencia',
  'Motivo_Urgencia', 'Estatus_ERP', 'Fecha_Ultimo_Aviso', 'ORIGEN_CREACION'
];

function isSegErpStatusClosed_(statusRaw) {
  const s = normPlainUpper_(statusRaw || '');
  if (!s) return false;
  return /(VENDID|FACTURAD|PEDIDO|CERRAD|CANCELAD|ANULAD|RECHAZAD|CONCRETAD|CONVERTID)/.test(s);
}

function resolveSegAutoClosureFromErpStatus_(statusRaw) {
  const s = normPlainUpper_(statusRaw || '');
  if (!isSegErpStatusClosed_(s)) return null;
  if (/(CANCELAD|ANULAD|RECHAZAD)/.test(s)) {
    return {
      estatus: 'CANCELADA',
      motivo: 'Cancelada en S Mueblería (' + String(statusRaw || 'Cancelada').trim() + ')'
    };
  }
  return {
    estatus: 'GANADA',
    motivo: 'Venta concretada en S Mueblería (' + String(statusRaw || 'Vendido').trim() + ')'
  };
}

function ensureSheetGridCapacity_(sh, minRows, minCols) {
  if (!sh) return;
  try {
    const curMaxR = typeof sh.getMaxRows === 'function' ? sh.getMaxRows() : 0;
    if (curMaxR > 0 && minRows > curMaxR && typeof sh.insertRowsAfter === 'function') {
      sh.insertRowsAfter(curMaxR, (minRows - curMaxR) + 500);
    }
  } catch (eR) {}
  try {
    const curMaxC = typeof sh.getMaxColumns === 'function' ? sh.getMaxColumns() : 0;
    if (curMaxC > 0 && minCols > curMaxC && typeof sh.insertColumnsAfter === 'function') {
      sh.insertColumnsAfter(curMaxC, minCols - curMaxC);
    }
  } catch (eC) {}
}

function ensureCotizacionesArchivadasSheet_(ssSeg) {
  const book = ssSeg || getSpreadsheetSeguimiento_();
  if (!book) return null;
  let sh = book.getSheetByName(TAB_COTIZACIONES_ARCHIVADAS_);
  if (!sh) {
    sh = book.insertSheet(TAB_COTIZACIONES_ARCHIVADAS_);
  }
  const archHeaders = SEG_COTIZACIONES_HEADERS_27_.concat(['MOTIVO_ARCHIVO', 'FECHA_ARCHIVO']);
  ensureSheetGridCapacity_(sh, 200, archHeaders.length);
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, archHeaders.length).setValues([archHeaders]);
    try {
      sh.getRange(1, 1, 1, archHeaders.length)
        .setFontWeight('bold')
        .setBackground('#252C32')
        .setFontColor('#FFFFFF')
        .setHorizontalAlignment('center');
      sh.setFrozenRows(1);
    } catch (eFmt) {}
  }
  return sh;
}

function archiveFolioRowsInSeguimiento_(ssSeg, folioRaw, reasonRaw, closedStatusRaw, closedDateStr) {
  const folio = String(folioRaw || '').trim().toUpperCase();
  if (!ssSeg || !folio) return { archivedCount: 0 };
  const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
  if (!shCot || shCot.getLastRow() < 2) return { archivedCount: 0 };

  const lastR = shCot.getLastRow();
  const lastC = Math.max(27, shCot.getLastColumn());
  const allVals = shCot.getRange(1, 1, lastR, lastC).getValues();
  const header27 = SEG_COTIZACIONES_HEADERS_27_.slice();
  if (allVals[0] && allVals[0].length) {
    for (let c = 0; c < 27; c++) {
      if (String(allVals[0][c] || '').trim()) header27[c] = allVals[0][c];
    }
  }

  const remaining = [];
  const toArchive = [];
  const motivoArch = safeSheetCellText_(reasonRaw || closedStatusRaw || 'CERRADA', 180);
  const fechaArch = safeSheetCellText_(closedDateStr || formatCancunNow_().slice(0, 16), 40);

  const textColsToEscape = [4, 5, 6, 7, 8, 10, 11, 24, 25, 26];
  for (let i = 1; i < allVals.length; i++) {
    const r = allVals[i] || [];
    const rowFol = String(r[1] || '').trim().toUpperCase();
    if (!rowFol && !String(r[0] || '').trim()) continue;
    const padded = new Array(27);
    for (let c = 0; c < 27; c++) padded[c] = r[c] !== undefined ? r[c] : '';
    for (let tc = 0; tc < textColsToEscape.length; tc++) {
      const idx = textColsToEscape[tc];
      padded[idx] = escapeSheetPlainText_(padded[idx]);
    }
    if (rowFol === folio) {
      if (closedStatusRaw && !isSegErpStatusClosed_(padded[24])) {
        padded[24] = escapeSheetPlainText_(String(closedStatusRaw).trim().toUpperCase() === 'GANADA' ? 'Vendido' : String(closedStatusRaw).trim());
      }
      toArchive.push(padded.concat([motivoArch, fechaArch]));
    } else {
      remaining.push(padded);
    }
  }

  if (!toArchive.length) return { archivedCount: 0 };

  const shArch = ensureCotizacionesArchivadasSheet_(ssSeg);
  if (shArch) {
    const archLastR = shArch.getLastRow();
    const existingIds = {};
    if (archLastR >= 2) {
      const colA = shArch.getRange(2, 1, archLastR - 1, 1).getValues();
      for (let i = 0; i < colA.length; i++) {
        const idP = String(colA[i][0] || '').trim().toUpperCase();
        if (idP) existingIds[idP] = true;
      }
    }
    const freshToAppend = toArchive.filter(function (row) {
      const idP = String(row[0] || '').trim().toUpperCase();
      if (!idP || existingIds[idP]) return false;
      existingIds[idP] = true;
      return true;
    });
    if (freshToAppend.length > 0) {
      const startWriteR = Math.max(2, shArch.getLastRow() + 1);
      ensureSheetGridCapacity_(shArch, startWriteR + freshToAppend.length, 29);
      shArch.getRange(startWriteR, 1, freshToAppend.length, 29).setValues(freshToAppend);
    }
  }

  // Reescribir COTIZACIONES_CREATA sin las filas recién archivadas
  ensureSheetGridCapacity_(shCot, remaining.length + 2, 27);
  if (remaining.length > 0) {
    shCot.getRange(2, 1, remaining.length, 27).setValues(remaining);
  }
  const tailStart = remaining.length + 2;
  if (tailStart <= lastR) {
    shCot.getRange(tailStart, 1, lastR - tailStart + 1, Math.min(lastC, 27)).clearContent();
  }
  return { archivedCount: toArchive.length, activeRemaining: remaining.length };
}

function parseObtenerReporteCotizacionesXml_(xmlText) {
  const xml = String(xmlText || '');
  if (!xml) return [];
  const quotes = [];
  const excludedSkus = {
    FLETE: true,
    SERVICIO: true,
    DESCUENTO: true,
    ENVIO: true,
    MANIOBRA: true,
    INSTALACION: true
  };
  const quoteRe = /<(?:[a-zA-Z0-9_]+:)?ReporteCotizaciones(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ReporteCotizaciones>/g;
  const detRe = /<(?:[a-zA-Z0-9_]+:)?ReporteVentasDetalle(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?ReporteVentasDetalle>/g;
  let qm;
  while ((qm = quoteRe.exec(xml)) !== null) {
    const qBlk = qm[1] || '';
    const folio = String(extractXmlTag_(qBlk, 'FolioCotizacion') || extractXmlTag_(qBlk, 'Folio') || '').trim().toUpperCase();
    if (!folio) continue;
    const sucursalErp = String(extractXmlTag_(qBlk, 'Sucursal') || '').trim();
    const vendedorErp = String(extractXmlTag_(qBlk, 'Vendedor') || extractXmlTag_(qBlk, 'Usuario') || '').trim();
    const clienteErp = String(extractXmlTag_(qBlk, 'Cliente') || extractXmlTag_(qBlk, 'NombreCliente') || 'Prospecto CREATA').trim();
    const fechaRaw = String(extractXmlTag_(qBlk, 'FechaCotizacion') || extractXmlTag_(qBlk, 'Fecha') || '').trim();
    const fechaIso = /^\d{4}-\d{2}-\d{2}/.test(fechaRaw) ? fechaRaw.slice(0, 10) : '';
    const statusErp = String(extractXmlTag_(qBlk, 'Status') || extractXmlTag_(qBlk, 'Estatus') || 'Cotizado').trim() || 'Cotizado';
    const telefonoCliente = String(extractXmlTag_(qBlk, 'Celular') || extractXmlTag_(qBlk, 'Telefono') || '').replace(/\D+/g, '');

    const items = [];
    const seenSkus = {};
    detRe.lastIndex = 0;
    let dm;
    while ((dm = detRe.exec(qBlk)) !== null) {
      const dBlk = dm[1] || '';
      const sku = String(extractXmlTag_(dBlk, 'Clave') || extractXmlTag_(dBlk, 'SKU') || '').trim().toUpperCase();
      if (!sku || excludedSkus[sku]) continue;
      const nombreProd = String(extractXmlTag_(dBlk, 'Nombre') || extractXmlTag_(dBlk, 'Descripcion') || sku).trim();
      const modeloProd = String(extractXmlTag_(dBlk, 'Modelo') || '').trim();
      const cantNum = Math.max(1, parseFloat(String(extractXmlTag_(dBlk, 'Cantidad') || '1').replace(/,/g, '')) || 1);
      const precioNum = parseFloat(String(extractXmlTag_(dBlk, 'Precio') || '0').replace(/[^0-9.-]/g, '')) || 0;
      if (seenSkus[sku]) {
        seenSkus[sku].cantidad += cantNum;
        if (precioNum > 0 && !seenSkus[sku].precio) seenSkus[sku].precio = precioNum;
      } else {
        const entry = {
          sku: sku,
          nombre: nombreProd,
          modelo: modeloProd,
          cantidad: cantNum,
          precio: precioNum
        };
        seenSkus[sku] = entry;
        items.push(entry);
      }
    }
    if (!items.length) continue;
    quotes.push({
      folio: folio,
      sucursalErp: sucursalErp,
      vendedorErp: vendedorErp,
      cliente: clienteErp,
      telefonoCliente: telefonoCliente,
      fechaIso: fechaIso,
      statusErp: statusErp,
      items: items
    });
  }
  return quotes;
}

function buildSegLiveStockMetricsForBranch_(invItem, branchKey, stockInicialPrev, cantCotizada, umbralPct) {
  let cb = 0, cp = 0, tb = 0, tp = 0, tot = 0;
  if (invItem) {
    cb = Number(invItem.cedis_bod || 0) || 0;
    cp = Number(invItem.cedis_pis || 0) || 0;
    if (branchKey === 'PLAYA') {
      tb = Number(invItem.pla_bod || 0) || 0;
      tp = Number(invItem.pla_pis || 0) || 0;
      tot = cb + cp + tb + tp;
    } else if (branchKey === 'COLOSIO') {
      tb = (Number(invItem.col_bod || 0) || 0) + (Number(invItem.out_bod || 0) || 0);
      tp = (Number(invItem.col_pis || 0) || 0) + (Number(invItem.out_pis || 0) || 0);
      tot = cb + cp + tb + tp;
    } else if (branchKey === 'PTC') {
      tb = Number(invItem.ptc_bod || 0) || 0;
      tp = Number(invItem.ptc_pis || 0) || 0;
      tot = cb + cp + tb + tp;
    } else if (branchKey === 'CASA CREATA') {
      tb = Number(invItem.casa_bod || 0) || 0;
      tp = Number(invItem.casa_pis || 0) || 0;
      tot = cb + cp + tb + tp;
    } else {
      // PROYECTOS: solo CEDIS
      tb = 0;
      tp = 0;
      tot = cb + cp;
    }
  }
  const stockIni = (stockInicialPrev !== null && stockInicialPrev !== undefined && stockInicialPrev !== '' && !isNaN(Number(stockInicialPrev)))
    ? Math.max(0, Number(stockInicialPrev))
    : tot;
  const variacion = tot - stockIni;
  const pctCaida = stockIni > 0 ? Math.max(0, Math.round(((stockIni - tot) / stockIni) * 100)) : 0;
  let nivel = 'ESTABLE';
  let motivo = 'Stock disponible';
  const cant = Math.max(1, Number(cantCotizada || 1) || 1);
  if (tot <= 0 || tot < cant) {
    nivel = 'CRITICO';
    motivo = tot <= 0 ? 'Agotado' : ('Stock insuficiente (' + tot + '/' + cant + ')');
  } else if (cb <= 0 && tb <= 0 && (cp + tp) > 0) {
    nivel = 'SOLO_PISO';
    motivo = 'Solo en piso de exhibición';
  } else if (tot <= 3 || pctCaida >= (umbralPct || 30)) {
    nivel = 'BAJADA';
    motivo = pctCaida >= (umbralPct || 30) ? ('Cayó ' + pctCaida + '% stock') : ('Quedan ' + tot + ' pzas');
  }
  return {
    stockIni: stockIni,
    cb: cb,
    cp: cp,
    tb: tb,
    tp: tp,
    tot: tot,
    variacion: variacion,
    pctCaida: pctCaida,
    nivel: nivel,
    motivo: motivo
  };
}

/**
 * Sincronizador en vivo 24/7 de cotizaciones desde S Mueblería ERP (ObtenerReporteCotizaciones)
 * hacia COTIZACIONES_CREATA (activas) y COTIZACIONES_ARCHIVADAS (cerradas / vendidas / canceladas).
 * - Sin reinicio ni borrado en el día 25 de cada mes (ventana continua configurable).
 * - Preserva Stock_Inicial_Total, WhatsApp_Cliente, Fecha_Ultimo_Aviso y ORIGEN_CREACION.
 * - Archiva automáticamente cotizaciones cerradas en ERP o en CIERRES_COTIZACIONES.
 */
function sincronizarCotizacionesSeguimientoDesdeERP(opts) {
  const o = opts || {};
  const silentUi = !!o.silentUi;
  const throttled = !!o.throttled;

  if (throttled) {
    try {
      const lastStamp = CacheService.getScriptCache().get(SEG_QUOTES_SYNC_THROTTLE_KEY_);
      if (lastStamp) {
        return { ok: true, skippedThrottle: true, lastSync: lastStamp };
      }
    } catch (eThr) {}
  }

  const ssInv = getSpreadsheet_();
  const ssSeg = getSpreadsheetSeguimiento_();
  if (!ssSeg) {
    return { ok: false, error: 'No se pudo abrir COTIZACIONES BASE DE DATOS.' };
  }

  // Leer configuración de ventana continua (sin corte día 25)
  let lookbackDays = 45;
  let umbralPct = 30;
  try {
    const shCfg = ssSeg.getSheetByName('CONFIG_CREATA');
    if (shCfg && shCfg.getLastRow() >= 2) {
      const cfgVals = shCfg.getRange(2, 1, shCfg.getLastRow() - 1, 2).getDisplayValues();
      for (let i = 0; i < cfgVals.length; i++) {
        const k = String(cfgVals[i][0] || '').trim().toUpperCase();
        const v = parseInt(String(cfgVals[i][1] || '').trim(), 10);
        if (k === 'DIAS_HISTORIAL_ERP' && isFinite(v) && v >= 15 && v <= 180) lookbackDays = v;
        if (k === 'UMBRAL_CAIDA_PORCENTAJE' && isFinite(v) && v >= 5 && v <= 95) umbralPct = v;
      }
    }
  } catch (eCfg) {}
  if (o.lookbackDays && Number(o.lookbackDays) >= 1) {
    lookbackDays = Math.min(180, Math.max(1, Math.round(Number(o.lookbackDays))));
  }

  const nowDt = new Date();
  const startDt = new Date(nowDt.getTime() - lookbackDays * 86400000);
  const fechaIniIso = Utilities.formatDate(startDt, 'America/Cancun', 'yyyy-MM-dd').slice(0, 10) + 'T00:00:00';
  const fechaFinIso = Utilities.formatDate(nowDt, 'America/Cancun', 'yyyy-MM-dd').slice(0, 10) + 'T23:59:59';
  const ahoraStr = formatCancunNow_();

  const cfgErp = getErpRuntimeConfig_();
  const innerXml =
    '<ClaveServicio>{TOKEN}</ClaveServicio>' +
    '<IdUsuario>' + cfgErp.masterUserId + '</IdUsuario>' +
    '<Proveedor></Proveedor>' +
    '<TipoMueble></TipoMueble>' +
    '<Modelo></Modelo>' +
    '<Producto></Producto>' +
    '<Empleado></Empleado>' +
    '<Cliente></Cliente>' +
    '<FechaInicio>' + fechaIniIso + '</FechaInicio>' +
    '<FechaFin>' + fechaFinIso + '</FechaFin>' +
    '<Sucursal></Sucursal>';

  let xmlResp = '';
  try {
    xmlResp = callSmuebleriaWcf_('ObtenerReporteCotizaciones', innerXml);
  } catch (wcfErr) {
    return {
      ok: false,
      error: 'Error al consultar ObtenerReporteCotizaciones en S Mueblería: ' + ((wcfErr && wcfErr.message) ? wcfErr.message : String(wcfErr))
    };
  }

  const erpQuotes = parseObtenerReporteCotizacionesXml_(xmlResp);
  if (!erpQuotes.length) {
    return {
      ok: false,
      error: 'S Mueblería devolvió 0 cotizaciones en ObtenerReporteCotizaciones; se conservaron intactas las hojas actuales.'
    };
  }

  // Directorio unificado de asesores para completar correo / teléfono
  const advisorByNameNorm = {};
  try {
    const users = readAllBranchUsers_(ssInv, []);
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u || u.isGuest) continue;
      const nKey = normPlainUpper_(u.nombre || '');
      if (nKey && !advisorByNameNorm[nKey]) {
        advisorByNameNorm[nKey] = {
          nombre: String(u.nombre || '').trim(),
          correo: String(u.correo || '').trim().toLowerCase(),
          telefono: String(u.telefono || '').replace(/\D+/g, '')
        };
      }
    }
  } catch (eDir) {}

  function resolveAdvisorMeta_(rawName) {
    const clean = String(rawName || '').trim();
    const normN = normPlainUpper_(clean);
    if (!normN) return { nombre: '', correo: '', telefono: '' };
    if (advisorByNameNorm[normN]) return advisorByNameNorm[normN];
    const keys = Object.keys(advisorByNameNorm);
    const toks = normN.split(/\s+/).filter(function (t) { return t.length > 2; });
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(normN) >= 0 || normN.indexOf(k) >= 0) return advisorByNameNorm[k];
      if (toks.length >= 2 && toks.every(function (t) { return k.indexOf(t) >= 0; })) {
        return advisorByNameNorm[k];
      }
    }
    return { nombre: clean, correo: '', telefono: '' };
  }

  // Inventario en vivo para stock actual por sucursal
  const invRes = readInventoryMapForSkus_(ssInv, null);
  const invBySku = invRes.bySku || {};

  const lockState = acquireScriptLockSafe_(20000);
  if (!lockState.ok) {
    return { ok: false, retryable: true, error: 'Servidor ocupado; intenta sincronizar Seguimiento en unos segundos.' };
  }
  const lock = lockState.lock;
  try {
    let shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
    if (!shCot) {
      shCot = ssSeg.insertSheet('COTIZACIONES_CREATA');
      ensureSheetGridCapacity_(shCot, 200, 27);
      shCot.getRange(1, 1, 1, 27).setValues([SEG_COTIZACIONES_HEADERS_27_]);
    }
    const shArch = ensureCotizacionesArchivadasSheet_(ssSeg);
    const shCierres = ssSeg.getSheetByName('CIERRES_COTIZACIONES');

    // 1) Leer cierres manuales / previos en CIERRES_COTIZACIONES
    const closuresByFolio = {};
    if (shCierres && shCierres.getLastRow() >= 2) {
      const cCols = Math.min(Math.max(shCierres.getLastColumn(), 10), 12);
      const cVals = shCierres.getRange(2, 1, shCierres.getLastRow() - 1, cCols).getDisplayValues();
      for (let i = 0; i < cVals.length; i++) {
        const r = cVals[i] || [];
        const fol = String(r[1] || '').trim().toUpperCase();
        if (!fol) continue;
        closuresByFolio[fol] = {
          fecha: String(r[0] || '').trim(),
          estatus: String(r[7] || 'CERRADA').trim().toUpperCase() || 'CERRADA',
          motivo: String(r[8] || '').trim()
        };
      }
    }

    // 2) Leer filas existentes en COTIZACIONES_CREATA y COTIZACIONES_ARCHIVADAS para preservar memoria
    const existingActiveById = {};
    const existingActiveRows = [];
    if (shCot.getLastRow() >= 2) {
      const prevCols = Math.max(27, shCot.getLastColumn());
      const prevVals = shCot.getRange(2, 1, shCot.getLastRow() - 1, prevCols).getValues();
      for (let i = 0; i < prevVals.length; i++) {
        const r = prevVals[i] || [];
        const idP = String(r[0] || '').trim().toUpperCase();
        const fol = String(r[1] || '').trim().toUpperCase();
        if (!idP || !fol) continue;
        const pad = new Array(27);
        for (let c = 0; c < 27; c++) pad[c] = r[c] !== undefined ? r[c] : '';
        existingActiveById[idP] = pad;
        existingActiveRows.push(pad);
      }
    }

    const existingArchById = {};
    const existingArchRows = [];
    if (shArch && shArch.getLastRow() >= 2) {
      const aCols = Math.max(29, shArch.getLastColumn());
      const aVals = shArch.getRange(2, 1, shArch.getLastRow() - 1, aCols).getValues();
      for (let i = 0; i < aVals.length; i++) {
        const r = aVals[i] || [];
        const idP = String(r[0] || '').trim().toUpperCase();
        const fol = String(r[1] || '').trim().toUpperCase();
        if (!idP || !fol) continue;
        const pad = new Array(29);
        for (let c = 0; c < 29; c++) pad[c] = r[c] !== undefined ? r[c] : '';
        existingArchById[idP] = pad;
        existingArchRows.push(pad);
      }
    }

    // 3) Procesar cotizaciones en vivo desde ERP: actualizar activas y auto-archivar cerradas/vendidas
    const activeById = {};
    const archById = {};
    for (let i = 0; i < existingArchRows.length; i++) {
      const idP = String(existingArchRows[i][0] || '').trim().toUpperCase();
      if (idP) archById[idP] = existingArchRows[i];
    }

    const erpSeenFolios = {};
    const newErpClosuresToAppend = [];
    let autoArchivedFoliosCount = 0;
    const autoArchivedFoliosSet = {};

    for (let qIdx = 0; qIdx < erpQuotes.length; qIdx++) {
      const q = erpQuotes[qIdx];
      const folio = q.folio;
      erpSeenFolios[folio] = true;
      const sucKey = mapErpStoreToSeguimientoBranch_(q.sucursalErp, folio);
      const advMeta = resolveAdvisorMeta_(q.vendedorErp);
      const erpAutoClose = resolveSegAutoClosureFromErpStatus_(q.statusErp);
      const manualClose = closuresByFolio[folio] || null;
      const isClosed = Boolean(erpAutoClose || manualClose);

      // Si se cerró en S Mueblería ERP (Vendido/Cancelado) y no estaba en CIERRES_COTIZACIONES, registrarlo
      if (erpAutoClose && !manualClose) {
        closuresByFolio[folio] = {
          fecha: ahoraStr.slice(0, 16),
          estatus: erpAutoClose.estatus,
          motivo: erpAutoClose.motivo
        };
        const piezasTxt = q.items.map(function (it) { return it.nombre + ' (' + it.cantidad + ' pza)'; }).join(' | ');
        newErpClosuresToAppend.push([
          safeSheetCellText_(ahoraStr.slice(0, 16), 40),
          safeSheetCellText_(folio, 60),
          safeSheetCellText_(sucKey, 80),
          safeSheetCellText_(advMeta.nombre || q.vendedorErp, 140),
          safeSheetCellText_(advMeta.correo, 140),
          safeSheetCellText_(q.cliente, 160),
          safeSheetCellText_(q.telefonoCliente, 40),
          safeSheetCellText_(erpAutoClose.estatus, 40),
          safeSheetCellText_(erpAutoClose.motivo, 240),
          safeSheetCellText_('Archivado automáticamente al detectar estatus "' + q.statusErp + '" en S Mueblería ERP.', 500),
          String(q.items.length),
          safeSheetCellText_(piezasTxt, 500)
        ]);
      }

      for (let j = 0; j < q.items.length; j++) {
        const it = q.items[j];
        const idP = (folio + '_' + it.sku).toUpperCase();
        const prev = existingActiveById[idP] || existingArchById[idP] || null;
        const invItem = invBySku[it.sku] || null;
        const prevStockIni = prev && String(prev[14] || '').trim() !== '' ? prev[14] : null;
        const m = buildSegLiveStockMetricsForBranch_(invItem, sucKey, prevStockIni, it.cantidad, umbralPct);

        const telCli = String((prev && prev[8]) || q.telefonoCliente || '').replace(/\D+/g, '');
        const avisoPrev = prev ? String(prev[25] || '').trim() : '';
        const origenPrev = prev ? String(prev[26] || '').trim() : '';

        const row27 = [
          safeSheetCellText_(idP, 100),
          safeSheetCellText_(folio, 60),
          safeSheetCellText_(q.fechaIso || (prev && prev[2]) || ahoraStr.slice(0, 10), 24),
          safeSheetCellText_(sucKey, 60),
          safeSheetCellText_((prev && prev[4]) || advMeta.nombre || q.vendedorErp, 140),
          safeSheetCellText_((prev && prev[5]) || advMeta.correo, 140),
          safeSheetCellText_((prev && prev[6]) || advMeta.telefono, 40),
          safeSheetCellText_(q.cliente || (prev && prev[7]) || 'Prospecto CREATA', 160),
          safeSheetCellText_(telCli, 40),
          safeSheetCellText_(it.sku, 80),
          safeSheetCellText_(it.nombre || (invItem && invItem.nombre) || it.sku, 240),
          safeSheetCellText_(it.modelo || (invItem && invItem.modelo) || '', 120),
          Number(it.precio || (invItem && invItem.precio) || 0).toFixed(2),
          String(it.cantidad),
          String(m.stockIni),
          String(m.cb),
          String(m.cp),
          String(m.tb),
          String(m.tp),
          String(m.tot),
          String(m.variacion),
          String(m.pctCaida) + '%',
          m.nivel,
          m.motivo,
          safeSheetCellText_(q.statusErp, 60),
          safeSheetCellText_(avisoPrev, 40),
          safeSheetCellText_(origenPrev, 40)
        ];

        if (isClosed) {
          const cieInfo = closuresByFolio[folio] || { estatus: 'CERRADA', motivo: q.statusErp, fecha: ahoraStr.slice(0, 16) };
          const motArch = safeSheetCellText_(cieInfo.estatus + (cieInfo.motivo ? (': ' + cieInfo.motivo) : ''), 180);
          const fArch = safeSheetCellText_((existingArchById[idP] && existingArchById[idP][28]) || cieInfo.fecha || ahoraStr.slice(0, 16), 40);
          archById[idP] = row27.concat([motArch, fArch]);
          if (!autoArchivedFoliosSet[folio]) {
            autoArchivedFoliosSet[folio] = true;
            autoArchivedFoliosCount++;
          }
        } else {
          activeById[idP] = row27;
        }
      }
    }

    // 4) Preservar cotizaciones abiertas previas que están fuera de la ventana ERP (sin borrarlas el día 25!)
    //    y auto-archivar cualquier fila previa cerrada en ERP o CIERRES_COTIZACIONES
    const prevTextColsToEscape = [4, 5, 6, 7, 8, 10, 11, 24, 25, 26];
    for (let i = 0; i < existingActiveRows.length; i++) {
      const prevRow = existingActiveRows[i];
      const idP = String(prevRow[0] || '').trim().toUpperCase();
      const fol = String(prevRow[1] || '').trim().toUpperCase();
      if (!idP || !fol || activeById[idP] || archById[idP]) continue;
      for (let tc = 0; tc < prevTextColsToEscape.length; tc++) {
        const idx = prevTextColsToEscape[tc];
        prevRow[idx] = escapeSheetPlainText_(prevRow[idx]);
      }

      const prevEstClosed = resolveSegAutoClosureFromErpStatus_(prevRow[24]);
      const manualClose = closuresByFolio[fol] || null;
      if (prevEstClosed || manualClose) {
        const cieInfo = manualClose || prevEstClosed;
        const motArch = safeSheetCellText_(cieInfo.estatus + (cieInfo.motivo ? (': ' + cieInfo.motivo) : ''), 180);
        const fArch = safeSheetCellText_((manualClose && manualClose.fecha) || ahoraStr.slice(0, 16), 40);
        archById[idP] = prevRow.concat([motArch, fArch]);
        if (!autoArchivedFoliosSet[fol]) {
          autoArchivedFoliosSet[fol] = true;
          autoArchivedFoliosCount++;
        }
      } else {
        // Actualizar stock en vivo también en cotizaciones abiertas previas
        const sku = String(prevRow[9] || '').trim().toUpperCase();
        const sucKey = mapErpStoreToSeguimientoBranch_(prevRow[3], fol);
        const invItem = invBySku[sku] || null;
        if (invItem) {
          const m = buildSegLiveStockMetricsForBranch_(invItem, sucKey, prevRow[14], prevRow[13], umbralPct);
          prevRow[15] = String(m.cb);
          prevRow[16] = String(m.cp);
          prevRow[17] = String(m.tb);
          prevRow[18] = String(m.tp);
          prevRow[19] = String(m.tot);
          prevRow[20] = String(m.variacion);
          prevRow[21] = String(m.pctCaida) + '%';
          prevRow[22] = m.nivel;
          prevRow[23] = m.motivo;
        }
        activeById[idP] = prevRow;
      }
    }

    // Ordenar más recientes primero
    const finalActive = Object.keys(activeById).map(function (k) { return activeById[k]; });
    finalActive.sort(function (a, b) {
      const dCmp = String(b[2] || '').localeCompare(String(a[2] || ''));
      if (dCmp !== 0) return dCmp;
      return String(b[1] || '').localeCompare(String(a[1] || ''));
    });

    const finalArch = Object.keys(archById).map(function (k) { return archById[k]; });
    finalArch.sort(function (a, b) {
      const dCmp = String(b[2] || '').localeCompare(String(a[2] || ''));
      if (dCmp !== 0) return dCmp;
      return String(b[1] || '').localeCompare(String(a[1] || ''));
    });

    // 5) Escribir en COTIZACIONES_CREATA (activas) con expansión automática de filas
    const prevActiveLastR = shCot.getLastRow();
    ensureSheetGridCapacity_(shCot, finalActive.length + 5, 27);
    shCot.getRange(1, 1, 1, 27).setValues([SEG_COTIZACIONES_HEADERS_27_]);
    if (finalActive.length > 0) {
      shCot.getRange(2, 1, finalActive.length, 27).setValues(finalActive);
    }
    const activeTailStart = finalActive.length + 2;
    if (activeTailStart <= prevActiveLastR) {
      shCot.getRange(activeTailStart, 1, prevActiveLastR - activeTailStart + 1, 27).clearContent();
    }

    // 6) Escribir en COTIZACIONES_ARCHIVADAS
    if (shArch && finalArch.length > 0) {
      const prevArchLastR = shArch.getLastRow();
      ensureSheetGridCapacity_(shArch, finalArch.length + 5, 29);
      shArch.getRange(2, 1, finalArch.length, 29).setValues(finalArch);
      const archTailStart = finalArch.length + 2;
      if (archTailStart <= prevArchLastR) {
        shArch.getRange(archTailStart, 1, prevArchLastR - archTailStart + 1, 29).clearContent();
      }
    }

    // 7) Anexar cierres automáticos detectados en ERP a CIERRES_COTIZACIONES
    if (shCierres && newErpClosuresToAppend.length > 0) {
      const startCieR = Math.max(2, shCierres.getLastRow() + 1);
      ensureSheetGridCapacity_(shCierres, startCieR + newErpClosuresToAppend.length, 12);
      shCierres.getRange(startCieR, 1, newErpClosuresToAppend.length, 12).setValues(newErpClosuresToAppend);
    }

    // 8) Registrar bitácora en HISTORIAL_MOVIMIENTOS y notificar delta
    try {
      const shHist = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
      if (shHist) {
        shHist.appendRow([
          ahoraStr,
          'SYNC',
          'AppsScript Cloud 24/7',
          'erp@smuebleria.com',
          'TODAS',
          'Sincronización En Vivo ERP S Mueblería',
          'ERP: ' + erpQuotes.length + ' folios · Activas: ' + finalActive.length + ' partidas · Archivadas: ' + finalArch.length + ' partidas (Auto-cerradas ERP: ' + newErpClosuresToAppend.length + ')',
          'AppsScript-Cloud',
          'EXITOSO'
        ]);
      }
    } catch (eHist) {}

    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().put(SEG_QUOTES_SYNC_THROTTLE_KEY_, ahoraStr, SEG_QUOTES_SYNC_THROTTLE_SEC_); } catch (eC) {}
    try { bumpSegInvVersion_(ahoraStr); } catch (eB) {}
    try {
      recordSegDeltaChange_('ERP_SYNC', {
        folio: 'ERP_SYNC',
        branch: 'TODAS',
        advisorEmail: '',
        advisorName: 'AppsScript Cloud 24/7',
        data: {
          timestamp: ahoraStr,
          erpQuotesCount: erpQuotes.length,
          activeRows: finalActive.length,
          archivedRows: finalArch.length
        }
      });
    } catch (eD) {}

    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert(
          'Seguimiento sincronizado en vivo desde S Mueblería ERP (' + ahoraStr + ').\n\n' +
          '• Cotizaciones recibidas del ERP (' + lookbackDays + ' días): ' + erpQuotes.length + '\n' +
          '• Partidas activas en COTIZACIONES_CREATA: ' + finalActive.length + '\n' +
          '• Partidas archivadas en COTIZACIONES_ARCHIVADAS: ' + finalArch.length + '\n' +
          '• Cierres automáticos ERP registrados: ' + newErpClosuresToAppend.length
        );
      } catch (eUi) {}
    }

    return {
      ok: true,
      timestamp: ahoraStr,
      lookbackDays: lookbackDays,
      erpQuotesCount: erpQuotes.length,
      activeRows: finalActive.length,
      archivedRows: finalArch.length,
      autoArchivedFolios: autoArchivedFoliosCount,
      erpAutoClosuresAdded: newErpClosuresToAppend.length
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

/**
 * Utilidad idempotente para reparar permisos públicos (ANYONE_WITH_LINK / VIEW) en carpetas y fotos
 * de inventario sin modificar jamás celdas ni fórmulas de Google Sheets ([BLOQUEADO-5]).
 */
function hacerPublicasFotosInventario_(opts) {
  const cfg = opts || {};
  const startMs = Date.now();
  const timeBudgetMs = Math.max(30000, Math.min(300000, Number(cfg.timeBudgetMs) || 240000));
  const startIndex = Math.max(0, parseInt(String(cfg.startIndex || 0), 10) || 0);
  const maxFiles = Math.max(1, Math.min(2000, parseInt(String(cfg.maxFiles || 250), 10) || 250));

  const summary = {
    ok: true,
    foldersChecked: 0,
    foldersUpdated: 0,
    filesChecked: 0,
    filesUpdated: 0,
    alreadyPublic: 0,
    errors: [],
    nextStartIndex: 0,
    remaining: 0
  };

  function ensurePublicItem_(item, isFolder) {
    if (!item) return;
    if (isFolder) summary.foldersChecked++;
    else summary.filesChecked++;
    try {
      if (typeof item.getSharingAccess === 'function') {
        const access = item.getSharingAccess();
        if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
          summary.alreadyPublic++;
          return;
        }
      }
      item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      if (isFolder) summary.foldersUpdated++;
      else summary.filesUpdated++;
    } catch (eShare) {
      if (summary.errors.length < 30) {
        summary.errors.push((isFolder ? 'folder:' : 'file:') + item.getId() + ' -> ' + String((eShare && eShare.message) || eShare));
      }
    }
  }

  // 1) Carpetas conocidas de fotografías (solo si startIndex === 0)
  const seenFolderIds = {};
  if (startIndex === 0) {
    const folderIds = [
      SUBIR_INBOX_FOLDER_ID_,
      CATEGORIAS_DEST_ROOT_FOLDER_ID_,
      FOTOS_NUEVAS_CARGADO_FOLDER_ID_,
      '1wRhGgjmvRdRG-uVM8WgULScn6hBDmksm', // FONDO BLANCO Y SISTEMA
      '1h0EYNwxabLWFeWt_KECi18WMmdDGwSeh', // MUEBLES FALTANTES ODOO
      '1SonCsCEzZvtIuhbwwRrQ_9WnhLe8DHc9', // PROVEEDORES
      '1EEsV3w-XaKnm3RWPerAqNlcs4d4tm3kv',
      '1i-VknqqeAX2Qj5JKBO5-fEtmxR_h6wQN',
      '1eSoUmv6IqQ7iU5BZPf8drKg6ktD6ESVT',
      '17k8kIyyBcAcYIPpICvU7LXGzKvDDuHUk',
      '1M8xqPRijm_JdsWSsTEPEX3CsgGfvJyDm',
      '1CI3J-86sx9aCW6RX-i1k26mJ52xT_Nyw',
      '1iSJztVhhrNvopTdX5sDcLSolhSnK_VAy' // TELAS ODOO
    ];
    const recurseSubfolderIds = {};
    recurseSubfolderIds[SUBIR_INBOX_FOLDER_ID_] = true;
    recurseSubfolderIds[FOTOS_NUEVAS_CARGADO_FOLDER_ID_] = true;
    recurseSubfolderIds['1wRhGgjmvRdRG-uVM8WgULScn6hBDmksm'] = true;
    recurseSubfolderIds['1h0EYNwxabLWFeWt_KECi18WMmdDGwSeh'] = true;
    recurseSubfolderIds['1SonCsCEzZvtIuhbwwRrQ_9WnhLe8DHc9'] = true;

    for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
      if (CATEGORIAS_DEST_FOLDERS_[i] && CATEGORIAS_DEST_FOLDERS_[i].id) {
        folderIds.push(CATEGORIAS_DEST_FOLDERS_[i].id);
      }
    }

    for (let i = 0; i < folderIds.length; i++) {
      const fid = String(folderIds[i] || '').trim();
      if (!fid || seenFolderIds[fid] || isForbiddenProjectBFolderId_(fid)) continue;
      seenFolderIds[fid] = true;
      try {
        const fld = DriveApp.getFolderById(fid);
        if (isFolderOrAncestorForbiddenProjectB_(fld, 8)) continue;
        ensurePublicItem_(fld, true);
        if (recurseSubfolderIds[fid]) {
          const subIt = fld.getFolders();
          while (subIt.hasNext() && (Date.now() - startMs) < timeBudgetMs) {
            const subFld = subIt.next();
            const subId = subFld.getId();
            if (!seenFolderIds[subId] && !isForbiddenProjectBFolderId_(subId) && !isFolderOrAncestorForbiddenProjectB_(subFld, 8)) {
              seenFolderIds[subId] = true;
              ensurePublicItem_(subFld, true);
            }
          }
        }
      } catch (eFld) {
        if (summary.errors.length < 30) {
          summary.errors.push('folder:' + fid + ' -> ' + String((eFld && eFld.message) || eFld));
        }
      }
    }
  }

  // 2) IDs únicos leídos EN SOLO LECTURA: primero _INV_PRODUCT_OVERRIDES (Telas/Portadas), luego INVENTARIO_EN_VIVO Col F y Hoja '1' Cols D y E
  const fileIdSet = {};
  const fileIds = [];
  const addFileId = (raw) => {
    const id = extractDriveFileIdFromCell_(raw);
    if (id && !fileIdSet[id] && !isForbiddenProjectBFolderId_(id)) {
      fileIdSet[id] = true;
      fileIds.push(id);
    }
  };

  try {
    const ss = getSpreadsheet_();
    const shOv = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
    if (shOv && shOv.getLastRow() >= 2 && shOv.getLastColumn() >= 6) {
      const colNote = shOv.getRange(2, 6, shOv.getLastRow() - 1, 1).getDisplayValues();
      for (let i = 0; i < colNote.length; i++) addFileId(colNote[i][0]);
    }
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    if (shInv && shInv.getLastRow() >= 3) {
      const colF = shInv.getRange(3, 6, shInv.getLastRow() - 2, 1).getDisplayValues();
      for (let i = 0; i < colF.length; i++) addFileId(colF[i][0]);
    }
    const sh1 = ss.getSheetByName('1');
    if (sh1 && sh1.getLastRow() >= 2 && sh1.getLastColumn() >= 4) {
      const colsToRead = sh1.getLastColumn() >= 5 ? 2 : 1;
      const colDE = sh1.getRange(2, 4, sh1.getLastRow() - 1, colsToRead).getDisplayValues();
      for (let i = 0; i < colDE.length; i++) {
        addFileId(colDE[i][0]);
        if (colsToRead >= 2) addFileId(colDE[i][1]);
      }
    }
  } catch (eRead) {
    summary.errors.push('sheet_read:' + String((eRead && eRead.message) || eRead));
  }

  const endIndex = Math.min(fileIds.length, startIndex + maxFiles);
  let idx = startIndex;
  for (; idx < endIndex; idx++) {
    if ((Date.now() - startMs) >= timeBudgetMs) break;
    const fid = fileIds[idx];
    try {
      const file = DriveApp.getFileById(fid);
      if (isFileInForbiddenProjectBFolder_(file)) continue;
      ensurePublicItem_(file, false);
    } catch (eFile) {
      if (summary.errors.length < 30) {
        summary.errors.push('file:' + fid + ' -> ' + String((eFile && eFile.message) || eFile));
      }
    }
  }

  summary.nextStartIndex = idx < fileIds.length ? idx : 0;
  summary.remaining = Math.max(0, fileIds.length - idx);
  return summary;
}

/**
 * Wrapper sin parámetros para ejecutar directamente desde el editor de Apps Script o el menú de Google Sheets.
 */
function hacerPublicasFotosInventario() {
  const res = hacerPublicasFotosInventario_({});
  Logger.log(JSON.stringify(res));
  return res;
}

// ============================================================================
// PRESENCIA EN LÍNEA / DESCONECTADO (PUNTO #16 — SOLO CACHE + PROPERTIES, 0 HOJAS)
// ============================================================================
const INV_PRESENCE_STATE_KEY_ = 'INV_PRESENCE_STATE_V1';
const INV_PRESENCE_ONLINE_THRESHOLD_MS_ = 180000;
const INV_PRESENCE_CACHE_TTL_SEC_ = 21600;
const INV_PRESENCE_MAX_BYTES_ = 7500;

function utf8ByteLength_(str) {
  const s = String(str || '');
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function normalizePresenceKey_(correo, nombre) {
  const cleanMail = String(correo || '').trim().toLowerCase();
  if (cleanMail) return cleanMail;
  return String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizePresenceVista_(vista) {
  return String(vista || '').replace(/[\r\n\t\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function sanitizePresenceEntry_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const correo = String(raw.correo || '').trim().toLowerCase();
  const nombre = String(raw.nombre || '').trim();
  const key = normalizePresenceKey_(correo, nombre);
  if (!key) return null;
  const lastSeenMs = Number(raw.lastSeenMs) > 0 ? Math.floor(Number(raw.lastSeenMs)) : 0;
  return {
    lastSeenMs: lastSeenMs,
    nombre: nombre,
    correo: correo,
    sucursal: String(raw.sucursal || '').trim().slice(0, 80),
    rol: String(raw.rol || '').trim().slice(0, 60),
    vista: sanitizePresenceVista_(raw.vista),
    online: Boolean(raw.online)
  };
}

function readInvPresenceMap_() {
  let raw = '';
  let fromCache = false;
  try {
    const cached = CacheService.getScriptCache().get(INV_PRESENCE_STATE_KEY_);
    if (cached) {
      raw = String(cached);
      fromCache = true;
    }
  } catch (eCache) {}

  if (!raw) {
    try {
      const propVal = PropertiesService.getScriptProperties().getProperty(INV_PRESENCE_STATE_KEY_);
      if (propVal) {
        raw = String(propVal);
      }
    } catch (eProp) {}
  }

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cleanMap = {};
    const keys = Object.keys(parsed);
    for (let i = 0; i < keys.length; i++) {
      const k = String(keys[i] || '').trim().toLowerCase();
      if (!k) continue;
      const entry = sanitizePresenceEntry_(parsed[keys[i]]);
      if (entry) cleanMap[k] = entry;
    }
    if (!fromCache) {
      try {
        CacheService.getScriptCache().put(INV_PRESENCE_STATE_KEY_, JSON.stringify(cleanMap), INV_PRESENCE_CACHE_TTL_SEC_);
      } catch (eWarm) {}
    }
    return cleanMap;
  } catch (eParse) {
    return {};
  }
}

function writeInvPresenceMap_(map) {
  const src = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  const cleanMap = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const k = String(keys[i] || '').trim().toLowerCase();
    if (!k) continue;
    const entry = sanitizePresenceEntry_(src[keys[i]]);
    if (entry) cleanMap[k] = entry;
  }

  let json = JSON.stringify(cleanMap);
  if (utf8ByteLength_(json) > INV_PRESENCE_MAX_BYTES_) {
    const now = Date.now();
    const pruneOrder = Object.keys(cleanMap).map((k) => {
      const e = cleanMap[k];
      const isOnline = Boolean(
        e &&
        e.online !== false &&
        Number(e.lastSeenMs) > 0 &&
        (now - Number(e.lastSeenMs)) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
      );
      return {
        key: k,
        isOnline: isOnline,
        lastSeenMs: Number(e && e.lastSeenMs) || 0
      };
    });
    pruneOrder.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? 1 : -1;
      return a.lastSeenMs - b.lastSeenMs;
    });
    for (let i = 0; i < pruneOrder.length && utf8ByteLength_(json) > INV_PRESENCE_MAX_BYTES_; i++) {
      delete cleanMap[pruneOrder[i].key];
      json = JSON.stringify(cleanMap);
    }
  }

  try {
    CacheService.getScriptCache().put(INV_PRESENCE_STATE_KEY_, json, INV_PRESENCE_CACHE_TTL_SEC_);
  } catch (eCache) {}
  try {
    PropertiesService.getScriptProperties().setProperty(INV_PRESENCE_STATE_KEY_, json);
  } catch (eProp) {}
  return cleanMap;
}

function recordInvPresence_(advisor, vista, onlineFlag) {
  const now = Date.now();
  if (!advisor || typeof advisor !== 'object') return now;

  const correo = String(advisor.correo || '').trim().toLowerCase();
  const nombre = String(advisor.nombre || '').trim();
  const key = normalizePresenceKey_(correo, nombre);
  if (!key) return now;

  const sucursal = String(advisor.erpStore || advisor.sucursal || advisor.sheetTab || '').trim().slice(0, 80);
  const rol = String(
    advisor.puesto ||
    (advisor.isAdmin ? 'ADMINISTRADOR' : (isGuestReadOnlyUser_(advisor) ? 'INVITADO' : 'ASESOR'))
  ).trim().slice(0, 60);

  const entry = {
    lastSeenMs: now,
    nombre: nombre,
    correo: correo,
    sucursal: sucursal,
    rol: rol,
    vista: sanitizePresenceVista_(vista),
    online: Boolean(onlineFlag)
  };

  let lock = null;
  let locked = false;
  try {
    if (typeof LockService !== 'undefined' && LockService && typeof LockService.getScriptLock === 'function') {
      lock = LockService.getScriptLock();
      locked = !!lock.tryLock(1500);
    }
  } catch (eLock) {
    locked = false;
  }

  try {
    const map = readInvPresenceMap_();
    map[key] = entry;
    writeInvPresenceMap_(map);
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
  return now;
}

function resolvePresenceActor_(body, allowGuest) {
  const b = body || {};
  const token = String(b.authToken || b.token || '').trim();
  const tokenInfo = verifyInvAuthToken_(token);
  const advisorEmail = String(b.advisorEmail || b.email || b.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const accessKey = String(b.accessKey || '').trim();

  if ((!tokenInfo || !tokenInfo.email) && (!advisorEmail || !accessKey)) {
    return {
      ok: false,
      authRequired: true,
      error: 'Sesión expirada o token de presencia inválido.'
    };
  }

  const authBody = {
    authToken: token,
    advisorEmail: advisorEmail,
    accessKey: accessKey,
    sheetTab: String(b.sheetTab || '').trim(),
    erpStore: String(b.erpStore || '').trim()
  };
  const authCheck = resolveAuthenticatedAdvisor_(null, [], authBody);
  if (authCheck && authCheck.ok && authCheck.advisor) {
    if (!allowGuest && isGuestReadOnlyUser_(authCheck.advisor)) {
      return {
        ok: false,
        forbidden: true,
        error: 'Solo usuarios autorizados pueden consultar el equipo en vivo.'
      };
    }
    let renewedAuthToken = '';
    const tokenNeedsRenewal = !tokenInfo || !tokenInfo.email || (Date.now() - Number(tokenInfo.issuedMs || 0) > 30 * 24 * 3600 * 1000);
    if (tokenNeedsRenewal) {
      try {
        renewedAuthToken = issueInvAuthToken_(
          authCheck.advisor.correo,
          authCheck.advisor.sheetTab || authCheck.advisor.branchKey || 'PTC'
        );
      } catch (eMint) {}
    }
    return {
      ok: true,
      advisor: authCheck.advisor,
      allUsers: authCheck.allUsers || [],
      renewedAuthToken: renewedAuthToken
    };
  }

  if (allowGuest && tokenInfo && tokenInfo.email) {
    const allUsers = readAllBranchUsers_(null, []);
    const matches = allUsers.filter((u) => u.correo === tokenInfo.email);
    if (!matches.length) {
      return {
        ok: false,
        authRequired: true,
        error: 'El correo de la sesión ya no aparece activo en las hojas de usuarios.'
      };
    }
    const chosen =
      matches.find((u) => tabsMatchNormalized_(u.sheetTab, tokenInfo.sheetTab) || tabsMatchNormalized_(u.branchKey, tokenInfo.sheetTab)) ||
      matches.find((u) => !u.isGuest) ||
      matches[0];
    if (!chosen) {
      return {
        ok: false,
        authRequired: true,
        error: 'Sesión expirada o token de presencia inválido.'
      };
    }
    let renewedAuthToken = '';
    if (Date.now() - Number(tokenInfo.issuedMs || 0) > 30 * 24 * 3600 * 1000) {
      try {
        renewedAuthToken = issueInvAuthToken_(chosen.correo, chosen.sheetTab || chosen.branchKey || 'INVITADOS');
      } catch (eMintGuest) {}
    }
    return {
      ok: true,
      advisor: chosen,
      allUsers: allUsers,
      renewedAuthToken: renewedAuthToken
    };
  }

  return {
    ok: false,
    authRequired: true,
    error: (authCheck && authCheck.error) || 'Sesión expirada o token de presencia inválido.'
  };
}

function handleInvPresenceHeartbeat_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return {
      ok: false,
      authRequired: Boolean(!actor || actor.authRequired !== false),
      forbidden: Boolean(actor && actor.forbidden),
      error: (actor && actor.error) || 'Sesión expirada o token de presencia inválido.'
    };
  }
  const vista = sanitizePresenceVista_(b.vista || 'inventario') || 'inventario';
  const now = recordInvPresence_(actor.advisor, vista, true);
  const devStatus = recordUserDeviceSession_(actor.advisor, b, vista, true);
  const res = {
    ok: true,
    serverTimeMs: now,
    sessionRevoked: Boolean(devStatus && devStatus.revoked)
  };
  if (actor.renewedAuthToken) {
    res.renewedAuthToken = actor.renewedAuthToken;
  }
  if (!isGuestReadOnlyUser_(actor.advisor) && actor.advisor.isAdmin) {
    res.adminPermissions = actor.advisor.adminPermissions || defaultAdminPermissionsForEmail_(actor.advisor.correo);
  }
  if (!isGuestReadOnlyUser_(actor.advisor) && actor.advisor.userPermissions && typeof actor.advisor.userPermissions === 'object') {
    res.userPermissions = actor.advisor.userPermissions;
  }
  return res;
}

function handleInvPresenceLogout_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return {
      ok: false,
      authRequired: Boolean(!actor || actor.authRequired !== false),
      error: (actor && actor.error) || 'Sesión expirada o token inválido.'
    };
  }
  recordInvPresence_(actor.advisor, 'logout', false);
  recordUserDeviceSession_(actor.advisor, b, 'logout', false);
  return { ok: true };
}

function handleInvPresenceList_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, false);
  if (!actor || actor.ok === false || !actor.advisor || isGuestReadOnlyUser_(actor.advisor)) {
    const isGuestBlocked = Boolean(actor && (actor.forbidden || (actor.advisor && isGuestReadOnlyUser_(actor.advisor))));
    return {
      ok: false,
      authRequired: !isGuestBlocked,
      forbidden: isGuestBlocked,
      error: (actor && actor.error) || (isGuestBlocked ? 'Solo usuarios autorizados pueden consultar el equipo en vivo.' : 'Sesión expirada o token de presencia inválido.')
    };
  }
  if (!userHasEffectivePerm_(actor.advisor, 'equipoInvitados')) {
    return {
      ok: false,
      authRequired: false,
      forbidden: true,
      error: 'Tu cuenta no tiene habilitado VER_EQUIPO_Y_INVITADOS en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const now = Date.now();
  const allUsers = Array.isArray(actor.allUsers) ? actor.allUsers : [];
  const presenceMap = readInvPresenceMap_();

  const mergedByKey = {};
  const guestByKey = {};

  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    if (!u) continue;
    const key = normalizePresenceKey_(u.correo, u.nombre);
    if (!key) continue;
    if (isGuestReadOnlyUser_(u)) {
      const gEmail = String(u.correo || '').trim().toLowerCase();
      const gName = String(u.nombre || gEmail || 'Invitado').trim();
      const gRole = String(u.puesto || 'INVITADO (SOLO VER)').trim();
      const gDevs = Array.isArray(u.guestDevices) ? u.guestDevices : [];
      const gMax = Math.max(1, Math.min(50, Number(u.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
      if (!guestByKey[key]) {
        guestByKey[key] = {
          nombre: gName,
          correo: gEmail,
          sucursal: 'INVITADOS (SOLO VER)',
          rol: gRole,
          maxPlaces: gMax,
          sheetDevices: gDevs
        };
      }
      continue;
    }
    const uSucursal = String(u.erpStore || u.sheetTab || '').trim();
    const uRol = String(u.puesto || (u.isAdmin ? 'ADMINISTRADOR' : 'ASESOR')).trim();
    const uNombre = String(u.nombre || '').trim();
    const uCorreo = String(u.correo || '').trim().toLowerCase();

    if (!mergedByKey[key]) {
      mergedByKey[key] = {
        nombre: uNombre,
        correo: uCorreo,
        sucursal: uSucursal,
        rol: uRol,
        isAdmin: !!u.isAdmin
      };
    } else {
      if (!mergedByKey[key].nombre && uNombre) mergedByKey[key].nombre = uNombre;
      if (u.isAdmin && !mergedByKey[key].isAdmin) {
        mergedByKey[key].isAdmin = true;
        if (uRol) mergedByKey[key].rol = uRol;
      } else if (!mergedByKey[key].rol && uRol) {
        mergedByKey[key].rol = uRol;
      }
      if (!mergedByKey[key].sucursal && uSucursal) {
        mergedByKey[key].sucursal = uSucursal;
      }
    }
  }

  const masterKevinKey = normalizePresenceKey_('kevin.reyna@grupoanipa.com', 'Kevin Reyna');
  if (masterKevinKey && !mergedByKey[masterKevinKey]) {
    mergedByKey[masterKevinKey] = {
      nombre: 'Kevin Reyna',
      correo: 'kevin.reyna@grupoanipa.com',
      sucursal: 'CEDIS',
      rol: 'ADMINISTRADOR',
      isAdmin: true
    };
  }

  const presenceKeys = Object.keys(presenceMap);
  for (let i = 0; i < presenceKeys.length; i++) {
    const pKey = presenceKeys[i];
    if (!pKey || mergedByKey[pKey]) continue;
    const pEntry = presenceMap[pKey];
    if (!pEntry) continue;
    const pRolNorm = String(pEntry.rol || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const pSucNorm = String(pEntry.sucursal || '').trim().toUpperCase();
    const isGuestEntry = Boolean(
      guestByKey[pKey] ||
      /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pRolNorm) ||
      /^INVITADOS?$|^SOLO LECTURA$/.test(pSucNorm)
    );
    if (isGuestEntry) {
      if (!guestByKey[pKey]) {
        guestByKey[pKey] = {
          nombre: String(pEntry.nombre || pEntry.correo || 'Invitado').trim(),
          correo: String(pEntry.correo || '').trim().toLowerCase(),
          sucursal: 'INVITADOS (SOLO VER)',
          rol: String(pEntry.rol || 'INVITADO (SOLO VER)').trim(),
          maxPlaces: MAX_GUEST_PLACES_PER_EMAIL_,
          sheetDevices: []
        };
      }
      continue;
    }
    mergedByKey[pKey] = {
      nombre: String(pEntry.nombre || pEntry.correo || '').trim(),
      correo: String(pEntry.correo || '').trim().toLowerCase(),
      sucursal: String(pEntry.sucursal || '').trim(),
      rol: String(pEntry.rol || 'ASESOR').trim(),
      isAdmin: /ADMINISTRADOR/i.test(String(pEntry.rol || ''))
    };
  }

  const users = [];
  const dirKeys = Object.keys(mergedByKey);
  for (let i = 0; i < dirKeys.length; i++) {
    const k = dirKeys[i];
    const base = mergedByKey[k];
    const entry = presenceMap[k] || null;
    const lastSeenMs = entry && Number(entry.lastSeenMs) > 0 ? Number(entry.lastSeenMs) : 0;
    const online = Boolean(
      entry &&
      entry.online !== false &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
    );
    const vista = entry ? sanitizePresenceVista_(entry.vista) : '';
    const sucursal = String((online && entry && entry.sucursal) || base.sucursal || (entry && entry.sucursal) || '').trim();
    const rol = String(base.rol || (entry && entry.rol) || 'ASESOR').trim();
    const nombre = String(base.nombre || (entry && entry.nombre) || base.correo || '').trim();
    const correo = String(base.correo || (entry && entry.correo) || '').trim().toLowerCase();

    users.push({
      nombre: nombre,
      correo: correo,
      sucursal: sucursal,
      rol: rol,
      vista: vista,
      online: online,
      lastSeenMs: lastSeenMs
    });
  }

  users.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if ((b.lastSeenMs || 0) !== (a.lastSeenMs || 0)) return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });

  let onlineCount = 0;
  for (let i = 0; i < users.length; i++) {
    if (users[i].online) onlineCount++;
  }
  const offlineCount = users.length - onlineCount;

  // Invitados conectados en vivo (hoja INVITADOS + presenceMap + dispositivos por usuario)
  const guests = [];
  const guestKeyList = Object.keys(guestByKey);
  for (let i = 0; i < guestKeyList.length; i++) {
    const gk = guestKeyList[i];
    const base = guestByKey[gk];
    const entry = presenceMap[gk] || null;
    let lastSeenMs = entry && Number(entry.lastSeenMs) > 0 ? Number(entry.lastSeenMs) : 0;
    let online = Boolean(
      entry &&
      entry.online !== false &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
    );
    let vista = entry ? sanitizePresenceVista_(entry.vista) : '';
    let activeDeviceLabel = '';
    const activeDevices = [];

    if (base.correo) {
      try {
        const devMap = readUserDevicesMap_(base.correo);
        const devIds = Object.keys(devMap);
        for (let d = 0; d < devIds.length; d++) {
          const rec = devMap[devIds[d]];
          if (!rec || Number(rec.revokedAt || 0) > 0) continue;
          const dSeen = Number(rec.lastSeenMs || 0);
          const dOnline = Boolean(rec.online !== false && dSeen > 0 && (now - dSeen) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_);
          if (dSeen > lastSeenMs) {
            lastSeenMs = dSeen;
            if (rec.vista) vista = sanitizePresenceVista_(rec.vista);
          }
          if (dOnline) {
            online = true;
            if (!activeDeviceLabel && rec.deviceLabel) activeDeviceLabel = String(rec.deviceLabel);
          }
          activeDevices.push({
            deviceId: rec.deviceId,
            deviceLabel: String(rec.deviceLabel || 'Dispositivo'),
            online: dOnline,
            lastSeenMs: dSeen
          });
        }
      } catch (eGDev) {}
    }

    if (!activeDeviceLabel && Array.isArray(base.sheetDevices) && base.sheetDevices.length) {
      const lastSheetDev = base.sheetDevices[base.sheetDevices.length - 1];
      if (lastSheetDev && lastSheetDev.label) activeDeviceLabel = String(lastSheetDev.label);
    }

    const activePlaces = Math.max(
      Array.isArray(base.sheetDevices) ? base.sheetDevices.length : 0,
      activeDevices.filter((x) => x.online).length
    );

    guests.push({
      nombre: base.nombre,
      correo: base.correo,
      sucursal: 'INVITADOS (SOLO VER)',
      rol: base.rol || 'INVITADO (SOLO VER)',
      vista: vista || (online ? 'inventario' : ''),
      online: online,
      lastSeenMs: lastSeenMs,
      isGuest: true,
      deviceLabel: activeDeviceLabel,
      activePlaces: activePlaces,
      maxPlaces: base.maxPlaces || MAX_GUEST_PLACES_PER_EMAIL_,
      slotLabel: activePlaces + ' / ' + (base.maxPlaces || MAX_GUEST_PLACES_PER_EMAIL_),
      activeDevices: activeDevices
    });
  }

  guests.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if ((b.lastSeenMs || 0) !== (a.lastSeenMs || 0)) return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });

  let guestOnlineCount = 0;
  for (let i = 0; i < guests.length; i++) {
    if (guests[i].online) guestOnlineCount++;
  }
  const guestOfflineCount = guests.length - guestOnlineCount;

  const listRes = {
    ok: true,
    serverTimeMs: now,
    thresholdMs: INV_PRESENCE_ONLINE_THRESHOLD_MS_,
    onlineCount: onlineCount,
    offlineCount: offlineCount,
    users: users,
    guests: guests,
    guestOnlineCount: guestOnlineCount,
    guestOfflineCount: guestOfflineCount,
    guestTotalCount: guests.length
  };
  if (actor.renewedAuthToken) {
    listRes.renewedAuthToken = actor.renewedAuthToken;
  }
  return listRes;
}

// ============================================================================
// CONFIGURACIÓN DE USUARIO — SESIONES ABIERTAS POR DISPOSITIVO + OVERRIDES SKU
// ============================================================================
const INV_USER_DEVICES_PREFIX_ = 'INV_UDEV_V1_';
const INV_PRODUCT_OVERRIDES_TAB_ = '_INV_PRODUCT_OVERRIDES';
const INV_PRODUCT_OVERRIDES_CACHE_KEY_ = 'INV_PROD_OVERRIDES_V1';

function getUserDevicesStoreKey_(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase().replace(/,/g, '.');
  return makeShortCacheKey_(INV_USER_DEVICES_PREFIX_, email || 'anon');
}

function readUserDevicesMap_(emailRaw) {
  const storeKey = getUserDevicesStoreKey_(emailRaw);
  let raw = '';
  try {
    raw = CacheService.getScriptCache().get(storeKey) || '';
  } catch (eC) {}
  if (!raw) {
    try {
      raw = PropertiesService.getScriptProperties().getProperty(storeKey) || '';
    } catch (eP) {}
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeUserDevicesMap_(emailRaw, mapObj) {
  const storeKey = getUserDevicesStoreKey_(emailRaw);
  const clean = {};
  const now = Date.now();
  const maxAgeMs = 30 * 24 * 3600 * 1000;
  const entries = Object.keys(mapObj || {}).map((k) => mapObj[k]).filter((e) => {
    if (!e || !e.deviceId) return false;
    const ts = Number(e.lastSeenMs || e.revokedAt || 0);
    return !ts || (now - ts) <= maxAgeMs;
  });
  entries.sort((a, b) => Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0));
  const capped = entries.slice(0, 12);
  for (let i = 0; i < capped.length; i++) {
    clean[capped[i].deviceId] = capped[i];
  }
  const json = JSON.stringify(clean);
  try {
    CacheService.getScriptCache().put(storeKey, json, INV_PRESENCE_CACHE_TTL_SEC_);
  } catch (eC) {}
  try {
    PropertiesService.getScriptProperties().setProperty(storeKey, json);
  } catch (eP) {}
  return clean;
}

function recordUserDeviceSession_(advisor, body, vista, onlineFlag, opts) {
  if (!advisor || !advisor.correo) return { revoked: false };
  const email = String(advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const devId = String((body && body.deviceId) || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  if (!email || !devId) return { revoked: false };
  const devLabel = String((body && body.deviceLabel) || 'Dispositivo').trim().slice(0, 80);
  const sucursal = String((body && (body.erpStore || body.branchLabel || body.sheetTab)) || advisor.erpStore || advisor.sheetTab || '').trim().slice(0, 60);
  const sessionStartedMs = Number((body && body.sessionStartedMs) || 0);
  const clearRevoked = Boolean(opts && opts.clearRevoked);
  const now = Date.now();

  let lock = null;
  let locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = !!lock.tryLock(1500);
  } catch (eL) {}

  try {
    const map = readUserDevicesMap_(email);
    const existing = map[devId] || null;
    if (!clearRevoked && onlineFlag && existing && Number(existing.revokedAt || 0) > 0) {
      return { revoked: true };
    }
    map[devId] = {
      deviceId: devId,
      deviceLabel: devLabel || (existing && existing.deviceLabel) || 'Navegador',
      sucursal: sucursal,
      vista: sanitizePresenceVista_(vista || 'inventario'),
      lastSeenMs: now,
      online: Boolean(onlineFlag),
      revokedAt: onlineFlag ? 0 : (existing ? Number(existing.revokedAt || 0) : 0)
    };
    writeUserDevicesMap_(email, map);
    return { revoked: false };
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eR) {}
    }
  }
}

function handleInvMySessions_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return { ok: false };
  }
  const isGuestActor = isGuestReadOnlyUser_(actor.advisor);
  const email = String(actor.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const currentDevId = String(b.deviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const now = Date.now();
  if (currentDevId) {
    const recBody = isGuestActor
      ? Object.assign({}, b, { erpStore: 'INVITADOS (SOLO VER)' })
      : b;
    recordUserDeviceSession_(actor.advisor, recBody, b.vista || 'configuracion', true);
  }
  const map = readUserDevicesMap_(email);
  const mergedById = {};
  const mapKeys = Object.keys(map);
  for (let i = 0; i < mapKeys.length; i++) {
    const k = mapKeys[i];
    const e = map[k];
    if (!e || !e.deviceId) continue;
    const lastSeenMs = Number(e.lastSeenMs || 0);
    const revokedAt = Number(e.revokedAt || 0);
    const active = Boolean(
      e.online !== false &&
      revokedAt === 0 &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= (24 * 3600 * 1000)
    );
    const onlineNow = Boolean(active && (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_);
    mergedById[e.deviceId] = {
      deviceId: e.deviceId,
      deviceLabel: String(e.deviceLabel || 'Dispositivo'),
      sucursal: String(e.sucursal || (isGuestActor ? 'INVITADOS (SOLO VER)' : '')),
      vista: String(e.vista || ''),
      lastSeenMs: lastSeenMs,
      online: onlineNow,
      active: active,
      revoked: revokedAt > 0,
      isCurrent: Boolean(currentDevId && e.deviceId === currentDevId)
    };
  }

  let guestMeta = null;
  if (isGuestActor) {
    try {
      const snap = readGuestDevicesSnapshot_(getSpreadsheet_(), actor.advisor);
      let slotNum = 1;
      for (let i = 0; i < snap.devices.length; i++) {
        const d = snap.devices[i];
        if (!d || !d.id) continue;
        const dId = String(d.id).trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
        if (!dId) continue;
        if (currentDevId && dId === currentDevId) slotNum = i + 1;
        if (!mergedById[dId]) {
          mergedById[dId] = {
            deviceId: dId,
            deviceLabel: String(d.label || 'Dispositivo autorizado'),
            sucursal: 'INVITADOS (SOLO VER)',
            vista: 'inventario',
            lastSeenMs: now,
            online: true,
            active: true,
            revoked: false,
            isCurrent: Boolean(currentDevId && dId === currentDevId)
          };
        } else if (!mergedById[dId].revoked) {
          mergedById[dId].active = true;
          mergedById[dId].online = true;
        }
      }
      guestMeta = {
        activeCount: snap.devices.length,
        maxPlaces: snap.maxAllowedPlaces,
        slotNumber: slotNum
      };
    } catch (eGuestSnap) {}
  }

  const sessions = Object.keys(mergedById).map((k) => mergedById[k]);
  sessions.sort((a, bItem) => {
    if (a.isCurrent !== bItem.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.online !== bItem.online) return a.online ? -1 : 1;
    return Number(bItem.lastSeenMs || 0) - Number(a.lastSeenMs || 0);
  });
  const out = {
    ok: true,
    serverTimeMs: now,
    currentDeviceId: currentDevId,
    sessions: sessions
  };
  if (guestMeta) {
    out.activeCount = guestMeta.activeCount;
    out.maxPlaces = guestMeta.maxPlaces;
    out.slotNumber = guestMeta.slotNumber;
  }
  return out;
}

function handleInvRevokeSession_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return { ok: false };
  }
  const isGuestActor = isGuestReadOnlyUser_(actor.advisor);
  const email = String(actor.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const rawTarget = String(b.targetDeviceId || '').trim();
  const targetDeviceId = rawTarget === 'ALL_OTHERS'
    ? 'ALL_OTHERS'
    : rawTarget.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const currentDevId = String(b.deviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const now = Date.now();

  const lockState = acquireScriptLockSafe_(5000);
  if (!lockState.ok) {
    return { ok: false, retryable: true, error: 'El servidor está ocupado. Intenta cerrar la sesión de nuevo en unos segundos.' };
  }
  const lock = lockState.lock;
  try {
    const map = readUserDevicesMap_(email);
    let revokedCount = 0;
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const id = keys[i];
      if (targetDeviceId === 'ALL_OTHERS') {
        if (currentDevId && id === currentDevId) continue;
        if (Number(map[id].revokedAt || 0) > 0 && map[id].online === false) continue;
        map[id].online = false;
        map[id].revokedAt = now;
        revokedCount++;
      } else if (targetDeviceId && id === targetDeviceId) {
        map[id].online = false;
        map[id].revokedAt = now;
        revokedCount++;
      }
    }

    let guestRevokeRes = null;
    if (isGuestActor) {
      try {
        const ss = getSpreadsheet_();
        guestRevokeRes = revokeGuestDevicesInSheetAndProps_(ss, actor.advisor, targetDeviceId, currentDevId);
        const removedList = (guestRevokeRes && Array.isArray(guestRevokeRes.removedDevices))
          ? guestRevokeRes.removedDevices
          : [];
        for (let r = 0; r < removedList.length; r++) {
          const rem = removedList[r];
          if (!rem || !rem.id) continue;
          if (!map[rem.id]) {
            map[rem.id] = {
              deviceId: rem.id,
              deviceLabel: rem.label || 'Dispositivo',
              sucursal: 'INVITADOS (SOLO VER)',
              vista: 'inventario',
              lastSeenMs: now,
              online: false,
              revokedAt: now
            };
            revokedCount++;
          } else if (Number(map[rem.id].revokedAt || 0) === 0 || map[rem.id].online !== false) {
            map[rem.id].online = false;
            map[rem.id].revokedAt = now;
            revokedCount++;
          }
        }
        if (revokedCount > 0) {
          registrarEventoHistorial_(ss, {
            clasificacion: 'MOVIMIENTO',
            modulo: 'AppsScript · INVITADOS (Sesiones)',
            evento: 'CIERRE REMOTO DE SESIONES (INVITADO)',
            estado: '✅ OK',
            usuario: (actor.advisor.nombre || email) + ' (' + email + ')',
            sucursal: 'INVITADOS (SOLO VER)',
            referencia: targetDeviceId === 'ALL_OTHERS' ? ('Otras sesiones (' + revokedCount + ')') : ('Dispositivo ' + targetDeviceId),
            detalle: 'Se cerraron ' + revokedCount + ' sesión(es) remota(s) y se actualizaron los lugares autorizados en hoja INVITADOS (' +
              guestRevokeRes.activeCount + ' / ' + guestRevokeRes.maxPlaces + ').',
            analisis: 'Dispositivos revocados deberán iniciar sesión nuevamente.'
          });
        }
      } catch (eGuestRev) {}
    }

    writeUserDevicesMap_(email, map);
    const out = { ok: true, revokedCount: revokedCount, serverTimeMs: now };
    if (guestRevokeRes) {
      out.activeCount = guestRevokeRes.activeCount;
      out.maxPlaces = guestRevokeRes.maxPlaces;
      out.slotNumber = guestRevokeRes.slotNumber;
    }
    return out;
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

function sanitizeOverrideTextCell_(raw, maxLen) {
  let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function ensureProductOverridesSheet_(ss) {
  let sh = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
  if (!sh) {
    sh = ss.insertSheet(INV_PRODUCT_OVERRIDES_TAB_);
    sh.getRange(1, 1, 1, 8).setValues([[
      'SKU', 'ESTADO', 'NOMBRE_EDITADO', 'CATEGORIA_EDITADA',
      'PRECIO_EDITADO', 'NOTA', 'ACTUALIZADO_POR', 'FECHA'
    ]]);
    try { sh.hideSheet(); } catch (eHide) {}
  }
  return sh;
}

function readProductOverridesMap_(ss) {
  try {
    const cached = CacheService.getScriptCache().get(INV_PRODUCT_OVERRIDES_CACHE_KEY_);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (eC) {}

  const sh = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (let i = 0; i < vals.length; i++) {
    const sku = String(vals[i][0] || '').trim().toUpperCase();
    if (!sku) continue;
    const status = String(vals[i][1] || 'VISIBLE').trim().toUpperCase();
    const priceRaw = vals[i][4];
    const priceNum = (priceRaw !== '' && priceRaw !== null && priceRaw !== undefined && isFinite(Number(priceRaw)))
      ? Number(priceRaw)
      : null;
    const noteStr = String(vals[i][5] || '').trim();
    if (/^V(?:FAB|COV|WOD):/i.test(sku) && (/^blob:/i.test(noteStr) || /^data:/i.test(noteStr))) continue;
    out[sku] = {
      sku: sku,
      status: (status === 'ARCHIVADO' || status === 'ELIMINADO') ? status : 'VISIBLE',
      name: String(vals[i][2] || '').trim(),
      category: String(vals[i][3] || '').trim(),
      price: priceNum,
      note: noteStr,
      updatedBy: String(vals[i][6] || '').trim(),
      updatedAt: String(vals[i][7] || '').trim()
    };
  }
  try {
    const jsonOut = JSON.stringify(out);
    if (utf8ByteLength_(jsonOut) <= 95000) {
      CacheService.getScriptCache().put(INV_PRODUCT_OVERRIDES_CACHE_KEY_, jsonOut, 300);
    }
  } catch (ePut) {}
  return out;
}

function isFileInAllowedOverrideShareFolder_(file) {
  if (!file) return false;
  if (isFileInForbiddenProjectBFolder_(file)) return false;
  if (isFileInProjectAAllowedFolders_(file)) return true;
  const extraAllowed = {
    '1iSJztVhhrNvopTdX5sDcLSolhSnK_VAy': true, // TELAS ODOO
    '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT': true, // CONFIG.DRIVE_FOLDER_ID
    '1wRhGgjmvRdRG-uVM8WgULScn6hBDmksm': true, // FONDO BLANCO Y SISTEMA
    '1h0EYNwxabLWFeWt_KECi18WMmdDGwSeh': true  // MUEBLES FALTANTES ODOO
  };
  try {
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (pid && extraAllowed[pid]) return true;
    }
  } catch (eOvPar) {}
  return false;
}

function handleInvProductOverridesGet_(body) {
  const ss = getSpreadsheet_();
  const overrides = readProductOverridesMap_(ss);
  return {
    ok: true,
    overrides: overrides,
    count: Object.keys(overrides).length
  };
}

function handleInvProductOverrideSave_(body, optsInternal) {
  const b = body || {};
  const ss = getSpreadsheet_();
  let auth = verifyExclusiveKevinOwner_(ss, b);
  if (!auth.ok) {
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const advAuth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
    if (advAuth && advAuth.ok && advAuth.advisor && advAuth.advisor.isAdmin && userHasAdminPerm_(advAuth.advisor, 'gestionProductos')) {
      auth = { ok: true, advisor: advAuth.advisor };
    } else {
      return auth;
    }
  } else if (auth.advisor && auth.advisor.adminPermissions && auth.advisor.adminPermissions.gestionProductos === false) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado VER_GESTION_PRODUCTOS en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const sku = String(b.sku || '').trim().toUpperCase();
  if (!sku || sku.length > 80) {
    return { ok: false, error: 'SKU inválido.' };
  }
  const op = String(b.op || 'SAVE').trim().toUpperCase();
  if (op !== 'SAVE' && op !== 'ARCHIVE' && op !== 'RESTORE' && op !== 'DELETE') {
    return { ok: false, error: 'Operación no permitida: ' + op };
  }

  const isVisualOverrideKey = /^V(?:COV|FAB|WOD):/i.test(sku);
  if (isVisualOverrideKey && op !== 'DELETE' && op !== 'ARCHIVE' && b.note !== undefined) {
    const rawNoteCheck = String(b.note || '').trim();
    if (/^blob:/i.test(rawNoteCheck) || /^data:/i.test(rawNoteCheck)) {
      return { ok: false, error: 'No se permiten enlaces temporales (blob:/data:) en fotos de tela, madera o portada.' };
    }
  }

  let lock = null;
  const skipLockInternal = Boolean(optsInternal && optsInternal.skipLock === true);
  if (!skipLockInternal) {
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return { ok: false, retryable: true, error: 'El servidor está ocupado con otro proceso. Intenta guardar de nuevo en unos segundos.' };
    }
    lock = lockState.lock;
  }
  try {
    const sh = ensureProductOverridesSheet_(ss);
    const lastRow = sh.getLastRow();
    let rowIdx = -1;
    let existingRow = null;
    if (lastRow >= 2) {
      const rows = sh.getRange(2, 1, lastRow - 1, 8).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toUpperCase() === sku) {
          rowIdx = i + 2;
          existingRow = rows[i];
          break;
        }
      }
    }

    const prevStatus = existingRow ? String(existingRow[1] || 'VISIBLE').trim().toUpperCase() : 'VISIBLE';
    let nextStatus = prevStatus;
    if (op === 'ARCHIVE') nextStatus = 'ARCHIVADO';
    else if (op === 'DELETE') nextStatus = 'ELIMINADO';
    else if (op === 'RESTORE') nextStatus = 'VISIBLE';
    else if (op === 'SAVE' && (isVisualOverrideKey || (prevStatus !== 'ARCHIVADO' && prevStatus !== 'ELIMINADO'))) nextStatus = 'VISIBLE';

    const nextName = (b.name !== undefined)
      ? sanitizeOverrideTextCell_(b.name, 140)
      : (existingRow ? String(existingRow[2] || '').trim() : '');
    const nextCat = (b.category !== undefined)
      ? sanitizeOverrideTextCell_(b.category, 80)
      : (existingRow ? String(existingRow[3] || '').trim() : '');
    let nextPrice = '';
    if (b.price !== undefined && b.price !== null && String(b.price).trim() !== '') {
      const pNum = Number(String(b.price).replace(/[^0-9.]/g, ''));
      if (isFinite(pNum) && pNum >= 0) nextPrice = pNum;
    } else if (b.price === undefined && existingRow && existingRow[4] !== '') {
      nextPrice = existingRow[4];
    }
    const nextNote = (b.note !== undefined)
      ? sanitizeOverrideTextCell_(b.note, 220)
      : (existingRow ? String(existingRow[5] || '').trim() : '');
    const nowStr = formatCancunNow_();

    // Garantizar permiso público solo para archivos dentro de carpetas permitidas de Proyecto A / TELAS ODOO
    if (nextStatus === 'VISIBLE' && nextNote) {
      try {
        const noteFid = extractDriveFileIdFromCell_(nextNote);
        if (noteFid && typeof DriveApp !== 'undefined' && DriveApp && typeof DriveApp.getFileById === 'function' && !isForbiddenProjectBFolderId_(noteFid)) {
          const drvFile = DriveApp.getFileById(noteFid);
          if (drvFile && isFileInAllowedOverrideShareFolder_(drvFile)) {
            ensurePublicSharingItem_(drvFile);
          }
        }
      } catch (eEnsureVis) {}
    }

    const actorEmail = (auth && auth.advisor && auth.advisor.correo) ? String(auth.advisor.correo) : OWNER_FOTOS_EMAIL_;
    const actorName = (auth && auth.advisor && auth.advisor.nombre) ? String(auth.advisor.nombre) : 'Kevin Reyna';

    const rowValues = [[
      sanitizeOverrideTextCell_(sku, 80),
      nextStatus,
      nextName,
      nextCat,
      nextPrice,
      nextNote,
      actorEmail,
      nowStr
    ]];

    if (rowIdx > 0) {
      sh.getRange(rowIdx, 1, 1, 8).setValues(rowValues);
    } else {
      sh.getRange(Math.max(2, lastRow + 1), 1, 1, 8).setValues(rowValues);
    }
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().remove(INV_PRODUCT_OVERRIDES_CACHE_KEY_); } catch (eClr) {}

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'Configuración · Productos Cotizador',
        evento: 'PRODUCTO ' + op + ' (' + nextStatus + ')',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRADOR',
        referencia: sku,
        detalle: 'Estado: ' + nextStatus + (nextName ? (' · Nombre: ' + nextName) : '') + (nextPrice !== '' ? (' · Precio: $' + nextPrice) : ''),
        analisis: 'Guardado en ' + INV_PRODUCT_OVERRIDES_TAB_ + ' sin alterar fórmulas de INVENTARIO_EN_VIVO ni CATALOGO_PRODUCTOS.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      sku: sku,
      override: {
        sku: sku,
        status: nextStatus,
        name: nextName.replace(/^'/, ''),
        category: nextCat.replace(/^'/, ''),
        price: nextPrice === '' ? null : Number(nextPrice),
        note: nextNote.replace(/^'/, ''),
        updatedBy: actorEmail,
        updatedAt: nowStr
      }
    };
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (eRel) {} }
  }
}

// ============================================================================
// REGISTRO DE DEMANDA / PIEZAS SOLICITADAS SIN STOCK (DEMANDA_SIN_STOCK)
// ============================================================================
const TAB_DEMANDA_SIN_STOCK_ = 'DEMANDA_SIN_STOCK';

function ensureDemandaSinStockSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = book.getSheetByName(TAB_DEMANDA_SIN_STOCK_);
  if (!sh) {
    sh = book.insertSheet(TAB_DEMANDA_SIN_STOCK_);
  }
  const headers = [
    'FECHA_HORA',
    'ID_SOLICITUD',
    'SKU',
    'NOMBRE_MODELO',
    'CATEGORIA',
    'COLOR_TELA_TAMANO',
    'PIEZAS_SOLICITADAS',
    'COMENTARIOS',
    'STOCK_SISTEMA_ACTUAL',
    'TIENDA_SUCURSAL',
    'ASESOR',
    'CORREO_ASESOR',
    'ESTATUS'
  ];
  if (sh.getLastRow() < 2) {
    sh.getRange(1, 1, 1, headers.length).setValues([[
      'CREATA · REGISTRO DE DEMANDA Y PIEZAS SOLICITADAS SIN STOCK (DONDE ATACAR)',
      '', '', '', '', '', '', '', '', '', '', '', ''
    ]]);
    sh.getRange(2, 1, 1, headers.length).setValues([headers]);
    try {
      sh.getRange(1, 1, 1, headers.length).merge().setFontWeight('bold').setBackground('#252C32').setFontColor('#FFFFFF');
      sh.getRange(2, 1, 1, headers.length).setFontWeight('bold').setBackground('#A38251').setFontColor('#FFFFFF').setHorizontalAlignment('center');
      sh.setFrozenRows(2);
    } catch (eFmt) {}
  }
  return sh;
}

function handleInvRegisterDemandRequest_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const auth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
  if (!auth || !auth.ok || !auth.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (auth && auth.error) || 'Sesión no válida. Inicia sesión para registrar solicitudes.'
    };
  }
  const advisor = auth.advisor;
  if (advisor.isGuest || String(advisor.sheetTab || '').trim().toUpperCase() === 'INVITADOS') {
    return {
      ok: false,
      forbidden: true,
      error: 'Las cuentas de Invitado (Solo ver) no pueden registrar solicitudes internas.'
    };
  }

  const sku = sanitizeOverrideTextCell_(String(b.sku || '').trim().toUpperCase(), 64);
  const modelName = sanitizeOverrideTextCell_(String(b.modelName || b.nombreModelo || '').trim(), 160);
  const category = sanitizeOverrideTextCell_(String(b.category || b.categoria || '').trim(), 80);
  const variantInfo = sanitizeOverrideTextCell_(String(b.variantInfo || b.colorTela || '').trim(), 140);
  const comments = sanitizeOverrideTextCell_(String(b.comments || b.comentarios || '').trim(), 600);
  const stockSummary = sanitizeOverrideTextCell_(String(b.stockSummary || b.stockActual || '').trim(), 160);
  const qtyRaw = Number(b.qty || b.piezas || 1);
  const qty = (isFinite(qtyRaw) && qtyRaw >= 1) ? Math.min(999, Math.round(qtyRaw)) : 1;

  if (!sku && !modelName) {
    return { ok: false, error: 'Ingresa al menos el SKU o nombre del modelo.' };
  }
  if (!comments) {
    return { ok: false, error: 'Escribe un comentario con lo que solicita el cliente.' };
  }

  const storeRaw = resolveAuthorizedUserStoreForLog_(advisor, auth.userMatches, b.erpStore || b.sucursal);
  const storeSafe = sanitizeOverrideTextCell_(storeRaw || 'SIN ASIGNAR', 80);
  const advisorNameSafe = sanitizeOverrideTextCell_(String(advisor.nombre || advisor.correo || 'Asesor').trim(), 100);
  const advisorEmailSafe = sanitizeOverrideTextCell_(String(advisor.correo || '').trim().toLowerCase(), 120);
  const nowStr = formatCancunNow_();
  const nowDt = new Date();
  const stamp = Utilities.formatDate(nowDt, 'America/Cancun', 'yyyyMMdd');
  const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const requestId = 'DEM-' + stamp + '-' + randSuffix;

  const lockState = acquireScriptLockSafe_(15000);
  if (!lockState.ok) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está ocupado con otro proceso. Intenta registrar la solicitud de nuevo en unos segundos.'
    };
  }
  const lock = lockState.lock;
  try {
    const sh = ensureDemandaSinStockSheet_(ss);
    const nextRow = Math.max(3, sh.getLastRow() + 1);
    const rowValues = [[
      nowStr,
      requestId,
      escapeSheetPlainText_(sku),
      escapeSheetPlainText_(modelName),
      escapeSheetPlainText_(category),
      escapeSheetPlainText_(variantInfo),
      qty,
      escapeSheetPlainText_(comments),
      escapeSheetPlainText_(stockSummary),
      escapeSheetPlainText_(storeSafe),
      escapeSheetPlainText_(advisorNameSafe),
      escapeSheetPlainText_(advisorEmailSafe),
      'PENDIENTE'
    ]];
    sh.getRange(nextRow, 1, 1, 13).setValues(rowValues);
    SpreadsheetApp.flush();

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'Demanda sin stock',
        evento: 'SOLICITUD SIN STOCK',
        estado: '📋 PENDIENTE',
        usuario: advisorNameSafe + ' (' + advisorEmailSafe + ')',
        sucursal: storeSafe,
        referencia: sku.replace(/^'/, '') || requestId,
        detalle: qty + ' pz · ' + modelName.replace(/^'/, '') + (variantInfo ? (' · ' + variantInfo.replace(/^'/, '')) : '') + ' · ' + comments.replace(/^'/, '').slice(0, 140),
        analisis: 'Registrado en ' + TAB_DEMANDA_SIN_STOCK_ + ' (' + requestId + ') para análisis de reposición.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      requestId: requestId,
      tabName: TAB_DEMANDA_SIN_STOCK_,
      rowNum: nextRow,
      record: {
        fechaHora: nowStr,
        requestId: requestId,
        sku: sku.replace(/^'/, ''),
        modelName: modelName.replace(/^'/, ''),
        category: category.replace(/^'/, ''),
        variantInfo: variantInfo.replace(/^'/, ''),
        qty: qty,
        comments: comments.replace(/^'/, ''),
        stockSummary: stockSummary.replace(/^'/, ''),
        store: storeSafe.replace(/^'/, ''),
        advisorName: advisorNameSafe.replace(/^'/, ''),
        advisorEmail: advisorEmailSafe.replace(/^'/, ''),
        status: 'PENDIENTE'
      }
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

function resolveAuthorizedUserStoreForLog_(advisor, userMatches, requestedStoreRaw) {
  const verifiedDefault = String(
    (advisor && (advisor.erpStore || advisor.branchLabel || advisor.sheetTab)) || ''
  ).trim();
  const reqStr = String(requestedStoreRaw || '').trim();
  if (!advisor || isGuestReadOnlyUser_(advisor)) {
    return verifiedDefault || 'SOLO LECTURA';
  }
  if (advisor.isAdmin) {
    if (userHasAdminPerm_(advisor, 'cambiarTienda')) {
      return reqStr || verifiedDefault || 'CEDIS';
    }
    return verifiedDefault || 'CEDIS';
  }
  if (reqStr && Array.isArray(userMatches) && userMatches.length > 0) {
    const reqNorm = normPlainUpper_(reqStr).replace(/COLOSIO/g, 'COLOCIO');
    const reqQuoteStore = typeof normalizeQuoteErpStore_ === 'function'
      ? normPlainUpper_(normalizeQuoteErpStore_(reqStr, reqStr)).replace(/COLOSIO/g, 'COLOCIO')
      : reqNorm;
    for (let i = 0; i < userMatches.length; i++) {
      const m = userMatches[i];
      if (!m || isGuestReadOnlyUser_(m)) continue;
      const candidates = [m.erpStore, m.sheetTab, m.branchKey, m.branchLabel];
      if (typeof normalizeQuoteErpStore_ === 'function') {
        candidates.push(normalizeQuoteErpStore_(m.erpStore, m.sheetTab));
      }
      for (let j = 0; j < candidates.length; j++) {
        const cNorm = normPlainUpper_(candidates[j] || '').replace(/COLOSIO/g, 'COLOCIO');
        if (cNorm && (cNorm === reqNorm || (reqQuoteStore && cNorm === reqQuoteStore))) {
          return String(m.erpStore || m.branchLabel || m.sheetTab || reqStr).trim();
        }
      }
    }
  }
  return verifiedDefault || 'SIN ASIGNAR';
}

// ============================================================================
// REGISTRO DE SUGERENCIAS DE COMPRA DE PRODUCTOS (SUGERENCIAS_DE_COMPRA)
// ============================================================================
const TAB_SUGERENCIAS_COMPRA_ = 'SUGERENCIAS_DE_COMPRA';

function ensureSugerenciasCompraSheet_(ss) {
  const book = ss || getSpreadsheet_();
  let sh = book.getSheetByName(TAB_SUGERENCIAS_COMPRA_);
  if (!sh) {
    sh = book.insertSheet(TAB_SUGERENCIAS_COMPRA_);
  }
  const headers = [
    'FECHA_HORA',
    'ID_SUGERENCIA',
    'INTERIOR_EXTERIOR',
    'TIPO_DE_PRODUCTO',
    'COMENTARIOS',
    'ASESOR_USUARIO',
    'PUESTO_ROL',
    'TIENDA_SUCURSAL',
    'ESTATUS'
  ];
  if (sh.getMaxColumns && sh.getMaxColumns() < headers.length && typeof sh.insertColumnsAfter === 'function') {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  if (sh.getLastRow() < 2) {
    sh.getRange(1, 1, 1, headers.length).setValues([[
      'CREATA · SUGERENCIAS DE COMPRA DE PRODUCTOS (ASESORES Y GERENTES)',
      '', '', '', '', '', '', '', ''
    ]]);
    sh.getRange(2, 1, 1, headers.length).setValues([headers]);
    try {
      sh.getRange(1, 1, 1, headers.length).merge().setFontWeight('bold').setBackground('#252C32').setFontColor('#FFFFFF');
      sh.getRange(2, 1, 1, headers.length).setFontWeight('bold').setBackground('#A38251').setFontColor('#FFFFFF').setHorizontalAlignment('center');
      sh.setFrozenRows(2);
    } catch (eFmt) {}
  }
  return sh;
}

function handleInvRegisterPurchaseSuggestion_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const auth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
  if (!auth || !auth.ok || !auth.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (auth && auth.error) || 'Sesión no válida. Inicia sesión para registrar sugerencias de compra.'
    };
  }
  const advisor = auth.advisor;

  const ambRaw = String(b.ambiente || b.interiorExterior || b.area || '').trim().toUpperCase();
  let ambienteNorm = '';
  if (ambRaw === 'INTERIOR' || ambRaw === 'INT') ambienteNorm = 'INTERIOR';
  else if (ambRaw === 'EXTERIOR' || ambRaw === 'EXT') ambienteNorm = 'EXTERIOR';

  if (!ambienteNorm) {
    return { ok: false, error: 'Selecciona si el producto es de Interior o Exterior.' };
  }

  const tipoProducto = sanitizeOverrideTextCell_(String(b.tipoProducto || b.productType || '').trim(), 120);
  const comments = sanitizeOverrideTextCell_(String(b.comments || b.comentarios || '').trim(), 800);

  if (!tipoProducto) {
    return { ok: false, error: 'Indica el tipo de producto.' };
  }
  if (!comments) {
    return { ok: false, error: 'Escribe tus comentarios sobre el producto sugerido.' };
  }

  const storeRaw = resolveAuthorizedUserStoreForLog_(advisor, auth.userMatches, b.erpStore || b.sucursal);
  const storeSafe = sanitizeOverrideTextCell_(storeRaw || 'SIN ASIGNAR', 80);
  const advisorNameSafe = sanitizeOverrideTextCell_(String(advisor.nombre || advisor.correo || 'Usuario').trim(), 100);
  const advisorRoleRaw = advisor.isGuest
    ? (String(advisor.puesto || '').trim() || 'INVITADO')
    : (String(advisor.puesto || advisor.rol || (advisor.isAdmin ? 'ADMINISTRADOR' : 'ASESOR')).trim());
  const advisorRoleSafe = sanitizeOverrideTextCell_(advisorRoleRaw || 'ASESOR', 80);
  const advisorEmailSafe = sanitizeOverrideTextCell_(String(advisor.correo || '').trim().toLowerCase(), 120);

  const nowStr = formatCancunNow_();
  const nowDt = new Date();
  const stamp = Utilities.formatDate(nowDt, 'America/Cancun', 'yyyyMMdd');
  const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const suggestionId = 'SUG-' + stamp + '-' + randSuffix;

  const lockState = acquireScriptLockSafe_(15000);
  if (!lockState.ok) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está ocupado con otro proceso. Intenta enviar tu sugerencia de nuevo en unos segundos.'
    };
  }
  const lock = lockState.lock;
  try {
    const sh = ensureSugerenciasCompraSheet_(ss);
    const nextRow = Math.max(3, sh.getLastRow() + 1);
    if (sh.getMaxRows && sh.getMaxRows() < nextRow && typeof sh.insertRowAfter === 'function') {
      sh.insertRowAfter(sh.getMaxRows());
    }
    const rowValues = [[
      nowStr,
      suggestionId,
      ambienteNorm,
      escapeSheetPlainText_(tipoProducto),
      escapeSheetPlainText_(comments),
      escapeSheetPlainText_(advisorNameSafe),
      escapeSheetPlainText_(advisorRoleSafe),
      escapeSheetPlainText_(storeSafe),
      'PENDIENTE'
    ]];
    sh.getRange(nextRow, 1, 1, 9).setValues(rowValues);
    SpreadsheetApp.flush();

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'Sugerencias de compra',
        evento: 'SUGERENCIA DE COMPRA',
        estado: '💡 PENDIENTE',
        usuario: advisorNameSafe + (advisorEmailSafe ? (' (' + advisorEmailSafe + ')') : ''),
        sucursal: storeSafe,
        referencia: suggestionId,
        detalle: ambienteNorm + ' · ' + tipoProducto.replace(/^'/, '') + ' · ' + comments.replace(/^'/, '').slice(0, 140),
        analisis: 'Registrado en ' + TAB_SUGERENCIAS_COMPRA_ + ' (' + suggestionId + ') para evaluación de compras.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      suggestionId: suggestionId,
      tabName: TAB_SUGERENCIAS_COMPRA_,
      rowNum: nextRow,
      record: {
        fechaHora: nowStr,
        suggestionId: suggestionId,
        ambiente: ambienteNorm,
        tipoProducto: tipoProducto.replace(/^'/, ''),
        comments: comments.replace(/^'/, ''),
        advisorName: advisorNameSafe.replace(/^'/, ''),
        advisorRole: advisorRoleSafe.replace(/^'/, ''),
        store: storeSafe.replace(/^'/, ''),
        status: 'PENDIENTE'
      }
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// CORTE, RESGUARDO MULTI-HOJA Y ANÁLISIS DE NO CIERRE DE VENTAS (SOLO KEVIN)
// ============================================================================
const KEVIN_EXCLUSIVE_EMAIL_ = 'kevin.reyna@grupoanipa.com';
const TAB_RESGUARDO_SEGUIMIENTO_ = 'RESGUARDO_SEGUIMIENTO';
const TAB_HISTORIAL_SEG_ARCHIVO_ = 'HISTORIAL_SEG_ARCHIVO';
const TAB_RESGUARDO_COTIZACIONES_APP_ = 'RESGUARDO_COTIZACIONES_APP';
const TAB_RESGUARDO_STOCK_SUG_ = 'RESGUARDO_STOCK_Y_SUGERENCIAS';
const TAB_ANALISIS_VENTAS_KEVIN_ = 'ANALISIS_VENTAS_KEVIN';

function canonicalKevinBranch_(raw) {
  const u = normPlainUpper_(raw || '').replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!u) return 'SIN SUCURSAL';
  if (u.indexOf('OUTLET') !== -1) return 'OUTLET COLOSIO';
  if (u.indexOf('COLOSIO') !== -1 || u.indexOf('COLOCIO') !== -1 || u === 'DTC') return 'COLOSIO';
  if (u.indexOf('PLAYA') !== -1 || u === 'PL' || u === 'PLY') return 'PLAYA';
  if (u.indexOf('PTC') !== -1 || u.indexOf('PUERTO') !== -1) return 'PUERTO CANCUN';
  if (u.indexOf('CASA') !== -1 || u === 'CCB' || u.indexOf('BONAMPAK') !== -1) return 'CASA CREATA';
  if (u.indexOf('PROYECTO') !== -1 || u === 'PRO') return 'PROYECTOS';
  if (u.indexOf('ADMIN') !== -1 || u.indexOf('CEDIS') !== -1 || u === 'TODAS') return 'ADMINISTRACION';
  return u;
}

function formatMoneyKevinMxn_(num) {
  const v = isFinite(Number(num)) ? Number(num) : 0;
  const fixed = Math.abs(v).toFixed(2);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '-$' : '$') + parts[0] + '.' + parts[1];
}

function parseMoneyKevinCell_(raw) {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
  const cleaned = String(raw == null ? '' : raw).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function ensureStyledBackupSheet_(book, tabName, headers) {
  if (!book || !tabName) return null;
  let sh = book.getSheetByName(tabName);
  if (!sh) {
    sh = book.insertSheet(tabName);
  }
  ensureSheetGridCapacity_(sh, 200, headers.length);
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    try {
      sh.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#252C32')
        .setFontColor('#FFFFFF')
        .setHorizontalAlignment('center');
      sh.setFrozenRows(1);
    } catch (eFmt) {}
  }
  return sh;
}

function upsertRowsByKeyCol_(sh, headers, keyColIdx0, incomingRows) {
  if (!sh || !Array.isArray(incomingRows) || !incomingRows.length) {
    return { totalRows: sh ? Math.max(0, sh.getLastRow() - 1) : 0, inserted: 0, updated: 0 };
  }
  const numCols = headers.length;
  ensureSheetGridCapacity_(sh, Math.max(200, (sh.getLastRow() || 1) + incomingRows.length + 20), numCols);
  const lastR = sh.getLastRow();
  const existingRows = [];
  const rowIndexByKey = {};
  if (lastR >= 2) {
    const curVals = sh.getRange(2, 1, lastR - 1, Math.min(sh.getLastColumn() || numCols, numCols)).getValues();
    for (let i = 0; i < curVals.length; i++) {
      const padded = new Array(numCols);
      for (let c = 0; c < numCols; c++) padded[c] = curVals[i][c] !== undefined ? curVals[i][c] : '';
      const k = String(padded[keyColIdx0] || '').trim().toUpperCase();
      if (k) rowIndexByKey[k] = existingRows.length;
      existingRows.push(padded);
    }
  }
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < incomingRows.length; i++) {
    const raw = incomingRows[i] || [];
    const normRow = new Array(numCols);
    for (let c = 0; c < numCols; c++) normRow[c] = raw[c] !== undefined ? raw[c] : '';
    const k = String(normRow[keyColIdx0] || '').trim().toUpperCase();
    if (!k) continue;
    if (Object.prototype.hasOwnProperty.call(rowIndexByKey, k)) {
      existingRows[rowIndexByKey[k]] = normRow;
      updated++;
    } else {
      rowIndexByKey[k] = existingRows.length;
      existingRows.push(normRow);
      inserted++;
    }
  }
  if (existingRows.length > 0) {
    ensureSheetGridCapacity_(sh, existingRows.length + 5, numCols);
    sh.getRange(2, 1, existingRows.length, numCols).setValues(existingRows);
  }
  return { totalRows: existingRows.length, inserted: inserted, updated: updated };
}

function buildManagerAndAdvisorDirectory_(ss, erpAdvisors) {
  const defaultManagers = {
    'PLAYA': { name: 'ROCIO ESQUIVEL', email: 'rocio.esquivel@creatamuebles.com' },
    'COLOSIO': { name: 'JANINE MEDINA', email: 'janine.medina@creatamuebles.com' },
    'OUTLET COLOSIO': { name: 'JANINE MEDINA', email: 'janine.medina@creatamuebles.com' },
    'PUERTO CANCUN': { name: 'ALEXA PADILLA RIQUELME', email: 'alexa.padilla@creatamuebles.com' },
    'CASA CREATA': { name: 'GUADALUPE SANCHEZ', email: 'lupita.sanchez@creatamuebles.com' },
    'PROYECTOS': { name: 'NELSON HERNANDEZ RODRIGUEZ', email: 'gte.proyectos@creatamuebles.com' },
    'ADMINISTRACION': { name: 'IRVIN KEVIN REYNA VALDEZ', email: 'kevin.reyna@grupoanipa.com' }
  };
  const managerByBranch = {};
  Object.keys(defaultManagers).forEach(function (bk) {
    managerByBranch[bk] = { name: defaultManagers[bk].name, email: defaultManagers[bk].email };
  });
  const byEmail = {};
  const byNameNorm = {};
  const activeRoster = [];

  let allUsers = [];
  try {
    allUsers = readAllBranchUsers_(ss, erpAdvisors || []);
  } catch (eDir) {}

  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    if (!u || u.isGuest || u.soloLectura) continue;
    const correo = String(u.correo || '').trim().toLowerCase().replace(/,/g, '.');
    const nombre = String(u.nombre || '').trim() || correo;
    const puesto = String(u.puesto || '').trim();
    const bKey = canonicalKevinBranch_(u.erpStore || u.branchKey || u.sheetTab || '');
    const isMgr = Boolean(!u.isAdmin && (/GERENTE|DIRECT/i.test(puesto) || u.isManager === true));
    if (isMgr && bKey && bKey !== 'SIN SUCURSAL' && bKey !== 'ADMINISTRACION') {
      if (!managerByBranch[bKey] || /GERENTE/i.test(puesto)) {
        managerByBranch[bKey] = { name: nombre, email: correo };
      }
    }
    const rec = {
      nombre: nombre,
      correo: correo,
      puesto: puesto || (u.isAdmin ? 'Administrador' : (isMgr ? 'Gerente' : 'Asesor')),
      branchKey: bKey,
      isAdmin: Boolean(u.isAdmin),
      isManager: isMgr
    };
    if (correo && !byEmail[correo]) {
      byEmail[correo] = rec;
      if (!u.isAdmin) activeRoster.push(rec);
    }
    const nKey = normPlainUpper_(nombre);
    if (nKey && !byNameNorm[nKey]) byNameNorm[nKey] = rec;
  }

  return {
    managerByBranch: managerByBranch,
    byEmail: byEmail,
    byNameNorm: byNameNorm,
    activeRoster: activeRoster,
    getManagerForBranch: function (branchKey) {
      const bk = canonicalKevinBranch_(branchKey);
      return managerByBranch[bk] || { name: 'SIN GERENTE ASIGNADO', email: '' };
    },
    resolveAdvisorMeta: function (rawEmail, rawName, rawBranch) {
      const em = String(rawEmail || '').trim().toLowerCase().replace(/,/g, '.');
      const nmNorm = normPlainUpper_(rawName || '');
      let hit = (em && byEmail[em]) ? byEmail[em] : (nmNorm && byNameNorm[nmNorm] ? byNameNorm[nmNorm] : null);
      if (!hit && nmNorm) {
        const toks = nmNorm.split(/\s+/).filter(Boolean);
        if (toks.length >= 2) {
          const keys = Object.keys(byNameNorm);
          for (let k = 0; k < keys.length; k++) {
            const candToks = keys[k].split(/\s+/).filter(Boolean);
            const allPresent = toks.every(function (t) { return candToks.indexOf(t) !== -1; });
            if (allPresent) { hit = byNameNorm[keys[k]]; break; }
          }
        }
      }
      const bKey = canonicalKevinBranch_(rawBranch || (hit && hit.branchKey) || '');
      return {
        nombre: String((hit && hit.nombre) || rawName || em || 'SIN ASESOR').trim(),
        correo: em || (hit && hit.correo) || '',
        puesto: (hit && hit.puesto) || 'Asesor',
        branchKey: bKey,
        isManager: Boolean(hit && hit.isManager)
      };
    }
  };
}

function handleHistArchiveAndAnalyzeKevin_(body) {
  const b = body || {};
  if (b.forceAdvisorPreview === true) {
    return { ok: false, forbidden: true, error: 'Función exclusiva deshabilitada en vista previa de asesor.' };
  }
  const ssInv = getSpreadsheet_();
  let erpAdvisors = [];
  try {
    const erpMeta = readErpAdvisorsFromPlantilla_(ssInv);
    erpAdvisors = (erpMeta && erpMeta.advisors) || [];
  } catch (eErpMeta) {}

  const auth = resolveAuthenticatedAdvisor_(ssInv, erpAdvisors, b);
  if (!auth || !auth.ok || !auth.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (auth && auth.error) || 'Sesión no válida. Inicia sesión con ' + KEVIN_EXCLUSIVE_EMAIL_ + '.'
    };
  }
  const callerEmail = String(auth.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  if (callerEmail !== KEVIN_EXCLUSIVE_EMAIL_) {
    return {
      ok: false,
      forbidden: true,
      error: 'Acceso exclusivo denegado: este corte y análisis es únicamente para ' + KEVIN_EXCLUSIVE_EMAIL_ + '.'
    };
  }

  const lockState = acquireScriptLockSafe_(20000);
  if (!lockState.ok) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está ocupado con otro proceso. Intenta ejecutar el corte en unos segundos.'
    };
  }
  const lock = lockState.lock;

  try {
    const nowDt = new Date();
    const nowStr = formatCancunNow_();
    const rawDigits = String(Utilities.formatDate(nowDt, 'America/Cancun', 'yyyyMMddHHmmss') || nowDt.toISOString()).replace(/\D+/g, '');
    const cutId = 'CORTE-' + rawDigits.slice(0, 8) + '-' + (rawDigits.slice(8, 14) || '000000');
    const directory = buildManagerAndAdvisorDirectory_(ssInv, erpAdvisors);
    const ssSeg = getSpreadsheetSeguimiento_();

    // ------------------------------------------------------------------------
    // 1. LEER CIERRES Y CONTACTOS DE SEGUIMIENTO
    // ------------------------------------------------------------------------
    const closuresByFolio = {};
    const contactsByFolio = {};
    const cierresRaw = ssSeg ? readSheetDisplayMatrixSafe_(ssSeg, 'CIERRES_COTIZACIONES', 0) : [];
    for (let i = 1; i < cierresRaw.length; i++) {
      const r = cierresRaw[i] || [];
      const fol = String(r[1] || '').trim().toUpperCase();
      if (!fol) continue;
      const stRaw = normPlainUpper_(r[7] || 'CERRADA');
      let stNorm = 'CERRADA';
      if (stRaw.indexOf('GANAD') !== -1 || stRaw.indexOf('VENDID') !== -1) stNorm = 'GANADA';
      else if (stRaw.indexOf('PERDID') !== -1) stNorm = 'PERDIDA';
      else if (stRaw.indexOf('CANCEL') !== -1 || stRaw.indexOf('ANUL') !== -1) stNorm = 'CANCELADA';
      closuresByFolio[fol] = {
        fecha: String(r[0] || '').trim(),
        folio: fol,
        sucursal: String(r[2] || '').trim(),
        asesor: String(r[3] || '').trim(),
        correo: String(r[4] || '').trim().toLowerCase().replace(/,/g, '.'),
        cliente: String(r[5] || '').trim(),
        estatus: stNorm,
        motivo: String(r[8] || '').trim(),
        comentarios: String(r[9] || '').trim()
      };
    }

    const histMovRaw = ssSeg ? readSheetDisplayMatrixSafe_(ssSeg, 'HISTORIAL_MOVIMIENTOS', 0) : [];
    for (let i = 1; i < histMovRaw.length; i++) {
      const r = histMovRaw[i] || [];
      const tipo = normPlainUpper_(r[1] || '');
      if (!tipo) continue;
      const blob = String(r[5] || '') + ' ' + String(r[6] || '');
      const mFol = blob.match(/Folio\s+([A-Z0-9\-]+)/i) || blob.match(/\b([A-Z]{2,5}-\d{2,})\b/i);
      const fol = mFol ? String(mFol[1] || '').trim().toUpperCase() : '';
      if (!fol) continue;
      if (tipo === 'WHATSAPP' || tipo === 'TELEFONO' || tipo === 'EMAIL') {
        if (!contactsByFolio[fol]) {
          contactsByFolio[fol] = { count: 0, lastDate: '', channels: {} };
        }
        contactsByFolio[fol].count++;
        contactsByFolio[fol].lastDate = String(r[0] || '').trim() || contactsByFolio[fol].lastDate;
        contactsByFolio[fol].channels[tipo] = (contactsByFolio[fol].channels[tipo] || 0) + 1;
      }
    }

    // Leer COTIZACIONES_EN_VIVO antes de archivar para detectar estatus ERP cerrados también ahí
    const quotesLiveRaw = readSheetDisplayMatrixSafe_(ssInv, TAB_QUOTES_LIVE_, 0);
    const liveErpClosedByFolio = {};
    for (let i = 1; i < quotesLiveRaw.length; i++) {
      const r = quotesLiveRaw[i] || [];
      const fol = String(r[1] || r[0] || '').trim().toUpperCase();
      const estErp = String(r[22] || '').trim();
      if (fol && isSegErpStatusClosed_(estErp)) {
        const resolved = resolveSegAutoClosureFromErpStatus_(estErp);
        if (resolved) liveErpClosedByFolio[fol] = resolved;
      }
    }

    // ------------------------------------------------------------------------
    // 2. ARCHIVAR / LIMPIAR PARTIDAS CERRADAS, PERDIDAS Y CANCELADAS EN SEGUIMIENTO
    //    (DEJANDO LAS ABIERTAS ACTIVAS EN COTIZACIONES_CREATA) + RESGUARDAR TODOS LOS ESTADOS
    // ------------------------------------------------------------------------
    let segNewlyArchivedPartidas = 0;
    let segActiveRemainingPartidas = 0;
    let segBackedUpAllStatesCount = 0;
    let segHistMovArchivedCount = 0;

    const allSegPartidasConsolidated = [];
    const closedFoliosSet = {};
    Object.keys(closuresByFolio).forEach(function (f) { closedFoliosSet[f] = true; });
    Object.keys(liveErpClosedByFolio).forEach(function (f) { closedFoliosSet[f] = true; });

    if (ssSeg) {
      const shCot = ssSeg.getSheetByName('COTIZACIONES_CREATA');
      const shArch = ensureCotizacionesArchivadasSheet_(ssSeg);
      const textColsToEscape = [4, 5, 6, 7, 8, 10, 11, 24, 25, 26];

      if (shCot && shCot.getLastRow() >= 2) {
        const lastR = shCot.getLastRow();
        const lastC = Math.max(27, shCot.getLastColumn());
        const cotVals = shCot.getRange(1, 1, lastR, lastC).getValues();
        const remainingActive = [];
        const newlyClosedRows = [];

        for (let i = 1; i < cotVals.length; i++) {
          const r = cotVals[i] || [];
          const rowFol = String(r[1] || '').trim().toUpperCase();
          const rowId = String(r[0] || '').trim();
          if (!rowFol && !rowId) continue;

          const padded = new Array(27);
          for (let c = 0; c < 27; c++) padded[c] = r[c] !== undefined ? r[c] : '';
          for (let tc = 0; tc < textColsToEscape.length; tc++) {
            const idx = textColsToEscape[tc];
            padded[idx] = escapeSheetPlainText_(padded[idx]);
          }

          const cie = closuresByFolio[rowFol] || null;
          const erpAuto = !cie ? ( resolveSegAutoClosureFromErpStatus_(padded[24]) || liveErpClosedByFolio[rowFol] || null ) : null;
          if (cie || erpAuto) {
            closedFoliosSet[rowFol] = true;
            const stFinal = cie ? cie.estatus : erpAuto.estatus;
            const motFinal = cie ? (cie.motivo || stFinal) : erpAuto.motivo;
            if (!isSegErpStatusClosed_(padded[24])) {
              padded[24] = escapeSheetPlainText_(stFinal === 'GANADA' ? 'Vendido' : (stFinal === 'CANCELADA' ? 'Cancelada' : 'Perdida'));
            }
            newlyClosedRows.push(padded.concat([
              safeSheetCellText_(stFinal + (motFinal ? (': ' + motFinal) : ''), 180),
              safeSheetCellText_(nowStr.slice(0, 16), 40)
            ]));
          } else {
            remainingActive.push(padded);
          }
        }

        segActiveRemainingPartidas = remainingActive.length;
        if (newlyClosedRows.length > 0 && shArch) {
          const archLastR = shArch.getLastRow();
          const existingArchIds = {};
          if (archLastR >= 2) {
            const colA = shArch.getRange(2, 1, archLastR - 1, 1).getValues();
            for (let k = 0; k < colA.length; k++) {
              const idP = String(colA[k][0] || '').trim().toUpperCase();
              if (idP) existingArchIds[idP] = true;
            }
          }
          const toAppend = newlyClosedRows.filter(function (row) {
            const idP = String(row[0] || '').trim().toUpperCase();
            if (!idP || existingArchIds[idP]) return false;
            existingArchIds[idP] = true;
            return true;
          });
          if (toAppend.length > 0) {
            const startWriteR = Math.max(2, shArch.getLastRow() + 1);
            ensureSheetGridCapacity_(shArch, startWriteR + toAppend.length, 29);
            shArch.getRange(startWriteR, 1, toAppend.length, 29).setValues(toAppend);
          }
          segNewlyArchivedPartidas = newlyClosedRows.length;

          ensureSheetGridCapacity_(shCot, remainingActive.length + 2, 27);
          if (remainingActive.length > 0) {
            shCot.getRange(2, 1, remainingActive.length, 27).setValues(remainingActive);
          }
          const tailStart = remainingActive.length + 2;
          if (tailStart <= lastR) {
            shCot.getRange(tailStart, 1, lastR - tailStart + 1, Math.min(lastC, 27)).clearContent();
          }
        }
      }

      // Leer estado post-archivo de COTIZACIONES_CREATA + COTIZACIONES_ARCHIVADAS para respaldar TODOS LOS ESTADOS
      const activeMatrix = readSheetDisplayMatrixSafe_(ssSeg, 'COTIZACIONES_CREATA', 0);
      const archMatrix = readSheetDisplayMatrixSafe_(ssSeg, TAB_COTIZACIONES_ARCHIVADAS_, 0);

      const collectPartida = function (r, isFromArch) {
        const fol = String(r[1] || '').trim().toUpperCase();
        const idP = String(r[0] || '').trim() || (fol + '__' + String(r[9] || 'ITEM').trim().toUpperCase());
        if (!fol && !r[0]) return;
        const cie = closuresByFolio[fol] || null;
        const erpClosed = resolveSegAutoClosureFromErpStatus_(r[24]) || liveErpClosedByFolio[fol] || null;
        const contactInfo = contactsByFolio[fol] || null;
        const ultimoAviso = String(r[25] || (contactInfo && contactInfo.lastDate) || '').trim();
        let estado = 'ABIERTA';
        let motivo = '';
        let comentarios = '';
        if (cie) {
          estado = cie.estatus;
          motivo = cie.motivo || '';
          comentarios = cie.comentarios || '';
        } else if (erpClosed) {
          estado = erpClosed.estatus;
          motivo = erpClosed.motivo || '';
        } else if (isFromArch) {
          const mArch = String(r[27] || '').trim();
          if (/GANAD|VENDID/i.test(mArch)) estado = 'GANADA';
          else if (/CANCEL/i.test(mArch)) estado = 'CANCELADA';
          else if (/PERDID/i.test(mArch)) estado = 'PERDIDA';
          else estado = 'CERRADA';
          motivo = mArch;
        } else if (ultimoAviso || contactInfo) {
          estado = 'CONTACTADA';
        }
        const advMeta = directory.resolveAdvisorMeta(r[5], r[4], r[3]);
        const mgrMeta = directory.getManagerForBranch(advMeta.branchKey);
        const unitPr = parseMoneyKevinCell_(r[12]);
        const qtyNum = Math.max(1, parseFloat(String(r[13] || '1').replace(/[^0-9.-]/g, '')) || 1);
        allSegPartidasConsolidated.push({
          idPartida: idP,
          folio: fol,
          fecha: String(r[2] || '').trim(),
          branchKey: advMeta.branchKey,
          sucursalRaw: String(r[3] || advMeta.branchKey).trim(),
          gerente: mgrMeta.name,
          asesor: advMeta.nombre,
          correo: advMeta.correo,
          cliente: String(r[7] || '').trim(),
          telefono: String(r[8] || '').trim(),
          sku: String(r[9] || '').trim().toUpperCase(),
          producto: String(r[10] || '').trim(),
          cantidad: qtyNum,
          precioUnitario: unitPr,
          montoPartida: Math.round(unitPr * qtyNum * 100) / 100,
          estado: estado,
          motivo: motivo,
          comentarios: comentarios,
          ultimoContacto: ultimoAviso,
          stockActual: parseFloat(String(r[19] || '0').replace(/[^0-9.-]/g, '')) || 0,
          nivelUrgencia: String(r[22] || '').trim().toUpperCase(),
          motivoUrgencia: String(r[23] || '').trim(),
          origen: String(r[26] || 'APP/ERP').trim()
        });
      };

      for (let i = 1; i < activeMatrix.length; i++) collectPartida(activeMatrix[i] || [], false);
      for (let i = 1; i < archMatrix.length; i++) collectPartida(archMatrix[i] || [], true);

      const segBackupHeaders = [
        'ULTIMO_CORTE', 'FECHA_RESGUARDO', 'ID_PARTIDA', 'FOLIO_ERP', 'FECHA_COTIZACION',
        'SUCURSAL', 'GERENTE_SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'TELEFONO_CLIENTE',
        'SKU', 'PRODUCTO', 'CANTIDAD', 'PRECIO_UNITARIO', 'MONTO_PARTIDA', 'ESTADO_SEGUIMIENTO',
        'MOTIVO_CIERRE_O_NO_VENTA', 'COMENTARIOS_CIERRE', 'ULTIMO_CONTACTO',
        'STOCK_ACTUAL_TOTAL', 'NIVEL_URGENCIA', 'MOTIVO_URGENCIA', 'ORIGEN'
      ];
      const shSegResguardo = ensureStyledBackupSheet_(ssSeg, TAB_RESGUARDO_SEGUIMIENTO_, segBackupHeaders);
      const segBackupRows = allSegPartidasConsolidated.map(function (p) {
        return [
          cutId,
          nowStr,
          escapeSheetPlainText_(p.idPartida),
          escapeSheetPlainText_(p.folio),
          escapeSheetPlainText_(p.fecha),
          escapeSheetPlainText_(p.branchKey),
          escapeSheetPlainText_(p.gerente),
          escapeSheetPlainText_(p.asesor),
          escapeSheetPlainText_(p.correo),
          escapeSheetPlainText_(p.cliente),
          escapeSheetPlainText_(p.telefono),
          escapeSheetPlainText_(p.sku),
          escapeSheetPlainText_(p.producto),
          p.cantidad,
          p.precioUnitario,
          p.montoPartida,
          p.estado,
          escapeSheetPlainText_(p.motivo),
          escapeSheetPlainText_(p.comentarios),
          escapeSheetPlainText_(p.ultimoContacto),
          p.stockActual,
          escapeSheetPlainText_(p.nivelUrgencia),
          escapeSheetPlainText_(p.motivoUrgencia),
          escapeSheetPlainText_(p.origen)
        ];
      });
      const upSeg = upsertRowsByKeyCol_(shSegResguardo, segBackupHeaders, 2, segBackupRows);
      segBackedUpAllStatesCount = upSeg.totalRows;

      // Archivar eventos de HISTORIAL_MOVIMIENTOS de folios cerrados/cancelados hacia HISTORIAL_SEG_ARCHIVO
      const shHistMov = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
      if (shHistMov && shHistMov.getLastRow() >= 2) {
        const hmLastR = shHistMov.getLastRow();
        const hmLastC = Math.max(7, Math.min(shHistMov.getLastColumn(), 10));
        const hmVals = shHistMov.getRange(1, 1, hmLastR, hmLastC).getValues();
        const hmHeaders = ['ID_EVENTO_HIST', 'ULTIMO_CORTE', 'FECHA_HORA', 'TIPO', 'USUARIO', 'CORREO', 'SUCURSAL', 'ACCION', 'DETALLE'];
        const shHistArch = ensureStyledBackupSheet_(ssSeg, TAB_HISTORIAL_SEG_ARCHIVO_, hmHeaders);
        const hmBackupRows = [];
        const hmRemainingOpen = [];

        for (let i = 1; i < hmVals.length; i++) {
          const r = hmVals[i] || [];
          const fStr = String(r[0] || '').trim();
          const tStr = String(r[1] || '').trim();
          if (!fStr && !tStr) continue;
          const actStr = String(r[5] || '').trim();
          const detStr = String(r[6] || '').trim();
          const mFol = (actStr + ' ' + detStr).match(/Folio\s+([A-Z0-9\-]+)/i) || (actStr + ' ' + detStr).match(/\b([A-Z]{2,5}-\d{2,})\b/i);
          const fol = mFol ? String(mFol[1] || '').trim().toUpperCase() : '';
          const evKey = [fStr, tStr.toUpperCase(), fol || 'NOFOL', actStr.slice(0, 48)].join('|');
          hmBackupRows.push([
            evKey,
            cutId,
            escapeSheetPlainText_(fStr),
            escapeSheetPlainText_(tStr),
            escapeSheetPlainText_(String(r[2] || '')),
            escapeSheetPlainText_(String(r[3] || '')),
            escapeSheetPlainText_(String(r[4] || '')),
            escapeSheetPlainText_(actStr),
            escapeSheetPlainText_(detStr)
          ]);
          const isClosedEvent = (normPlainUpper_(tStr) === 'CIERRE') || (fol && closedFoliosSet[fol]);
          if (isClosedEvent) {
            segHistMovArchivedCount++;
          } else {
            const keepRow = new Array(hmLastC);
            for (let c = 0; c < hmLastC; c++) keepRow[c] = escapeSheetPlainText_(r[c] !== undefined ? r[c] : '');
            hmRemainingOpen.push(keepRow);
          }
        }
        upsertRowsByKeyCol_(shHistArch, hmHeaders, 0, hmBackupRows);
        if (segHistMovArchivedCount > 0) {
          ensureSheetGridCapacity_(shHistMov, hmRemainingOpen.length + 2, hmLastC);
          if (hmRemainingOpen.length > 0) {
            shHistMov.getRange(2, 1, hmRemainingOpen.length, hmLastC).setValues(hmRemainingOpen);
          }
          const hmTail = hmRemainingOpen.length + 2;
          if (hmTail <= hmLastR) {
            shHistMov.getRange(hmTail, 1, hmLastR - hmTail + 1, hmLastC).clearContent();
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. CONSOLIDAR Y RESGUARDAR COTIZACIONES (APP COTIZACIÓN + ERP)
    // ------------------------------------------------------------------------
    const quotesByFolio = {};
    for (let i = 1; i < quotesLiveRaw.length; i++) {
      const r = quotesLiveRaw[i] || [];
      const ordenSuc = String(r[0] || '').trim();
      const fol = String(r[1] || ordenSuc || '').trim().toUpperCase();
      if (!fol) continue;
      const advMeta = directory.resolveAdvisorMeta(r[7], r[8] || r[9], r[6] || r[5]);
      const mgrMeta = directory.getManagerForBranch(advMeta.branchKey);
      const cie = closuresByFolio[fol] || null;
      const erpClosed = resolveSegAutoClosureFromErpStatus_(r[22]) || null;
      const cInfo = contactsByFolio[fol] || null;
      let segStatus = 'ABIERTA';
      let motivo = '';
      let comentarios = '';
      if (cie) {
        segStatus = cie.estatus;
        motivo = cie.motivo || '';
        comentarios = cie.comentarios || '';
      } else if (erpClosed) {
        segStatus = erpClosed.estatus;
        motivo = erpClosed.motivo || '';
      } else if (cInfo && cInfo.count > 0) {
        segStatus = 'CONTACTADA';
      }

      quotesByFolio[fol] = {
        folio: fol,
        ordenSucursal: ordenSuc,
        idErp: String(r[2] || '').trim(),
        fechaHora: String(r[3] || '').trim(),
        branchKey: advMeta.branchKey,
        tiendaRaw: String(r[6] || r[5] || advMeta.branchKey).trim(),
        gerente: mgrMeta.name,
        asesor: advMeta.nombre,
        correo: advMeta.correo,
        rol: advMeta.puesto,
        cliente: String(r[11] || 'Sin nombre').trim(),
        telefono: String(r[12] || '').trim(),
        partidasCant: Math.max(0, parseInt(String(r[16] || '0'), 10) || 0),
        resumenSkus: String(r[17] || '').trim(),
        subtotalNum: parseMoneyKevinCell_(r[18]),
        ivaNum: parseMoneyKevinCell_(r[19]),
        totalNum: parseMoneyKevinCell_(r[21]),
        estadoErp: String(r[22] || 'Registrada').trim(),
        segStatus: segStatus,
        motivo: motivo,
        comentarios: comentarios,
        ultimoContacto: (cInfo && cInfo.lastDate) || (cie && cie.fecha) || '',
        hasStockRisk: false
      };
    }

    // Incorporar también cotizaciones presentes en Seguimiento que no estuvieran en COTIZACIONES_EN_VIVO
    for (let i = 0; i < allSegPartidasConsolidated.length; i++) {
      const p = allSegPartidasConsolidated[i];
      if (!p.folio) continue;
      if (!quotesByFolio[p.folio]) {
        quotesByFolio[p.folio] = {
          folio: p.folio,
          ordenSucursal: p.folio,
          idErp: '',
          fechaHora: p.fecha,
          branchKey: p.branchKey,
          tiendaRaw: p.sucursalRaw || p.branchKey,
          gerente: p.gerente,
          asesor: p.asesor,
          correo: p.correo,
          rol: 'Asesor',
          cliente: p.cliente || 'Sin nombre',
          telefono: p.telefono || '',
          partidasCant: 0,
          resumenSkus: '',
          subtotalNum: 0,
          ivaNum: 0,
          totalNum: 0,
          estadoErp: 'Seguimiento ERP',
          segStatus: p.estado,
          motivo: p.motivo,
          comentarios: p.comentarios,
          ultimoContacto: p.ultimoContacto,
          hasStockRisk: false,
          _fromSegOnly: true,
          _skuList: []
        };
      }
      const q = quotesByFolio[p.folio];
      if (q._fromSegOnly) {
        q.partidasCant += 1;
        q.totalNum = Math.round((q.totalNum + p.montoPartida) * 100) / 100;
        q.subtotalNum = Math.round((q.totalNum / 1.16) * 100) / 100;
        q.ivaNum = Math.max(0, Math.round((q.totalNum - q.subtotalNum) * 100) / 100);
        if (p.sku) q._skuList.push(p.sku + ' x' + p.cantidad);
        q.resumenSkus = q._skuList.join(', ');
      }
      if (p.ultimoContacto && !q.ultimoContacto) q.ultimoContacto = p.ultimoContacto;
      if (q.segStatus === 'ABIERTA' && p.estado === 'CONTACTADA') q.segStatus = 'CONTACTADA';
      if (['GANADA', 'PERDIDA', 'CANCELADA', 'CERRADA'].indexOf(p.estado) !== -1 && ['GANADA', 'PERDIDA', 'CANCELADA'].indexOf(q.segStatus) === -1) {
        q.segStatus = p.estado;
        if (p.motivo && !q.motivo) q.motivo = p.motivo;
        if (p.comentarios && !q.comentarios) q.comentarios = p.comentarios;
      }
      if (p.nivelUrgencia === 'CRITICO' || p.stockActual <= 0) {
        q.hasStockRisk = true;
      }
    }

    const allConsolidatedQuotes = Object.keys(quotesByFolio).map(function (k) { return quotesByFolio[k]; });
    const appQuoteBackupHeaders = [
      'ULTIMO_CORTE', 'FECHA_RESGUARDO', 'FOLIO_ERP', 'ORDEN_SUCURSAL', 'ID_COTIZACION_ERP',
      'FECHA_COTIZACION', 'SUCURSAL', 'GERENTE_SUCURSAL', 'ASESOR', 'CORREO_ASESOR',
      'CLIENTE', 'TELEFONO', 'PARTIDAS_CANT', 'RESUMEN_SKUS', 'SUBTOTAL_SIN_IVA',
      'IVA', 'TOTAL_CON_IVA', 'ESTADO_ERP', 'ESTADO_SEGUIMIENTO',
      'MOTIVO_CIERRE_O_NO_VENTA', 'COMENTARIOS_SEGUIMIENTO', 'ULTIMO_CONTACTO'
    ];
    const shAppQuotesBackup = ensureStyledBackupSheet_(ssInv, TAB_RESGUARDO_COTIZACIONES_APP_, appQuoteBackupHeaders);
    const appQuoteBackupRows = allConsolidatedQuotes.map(function (q) {
      return [
        cutId,
        nowStr,
        escapeSheetPlainText_(q.folio),
        escapeSheetPlainText_(q.ordenSucursal),
        escapeSheetPlainText_(q.idErp),
        escapeSheetPlainText_(q.fechaHora),
        escapeSheetPlainText_(q.branchKey),
        escapeSheetPlainText_(q.gerente),
        escapeSheetPlainText_(q.asesor),
        escapeSheetPlainText_(q.correo),
        escapeSheetPlainText_(q.cliente),
        escapeSheetPlainText_(q.telefono),
        q.partidasCant,
        escapeSheetPlainText_(q.resumenSkus),
        q.subtotalNum,
        q.ivaNum,
        q.totalNum,
        escapeSheetPlainText_(q.estadoErp),
        q.segStatus,
        escapeSheetPlainText_(q.motivo),
        escapeSheetPlainText_(q.comentarios),
        escapeSheetPlainText_(q.ultimoContacto)
      ];
    });
    const upQuotes = upsertRowsByKeyCol_(shAppQuotesBackup, appQuoteBackupHeaders, 2, appQuoteBackupRows);

    // ------------------------------------------------------------------------
    // 4. LEER Y RESGUARDAR FALTA DE STOCK (DEMANDA_SIN_STOCK) + SUGERENCIAS DE PIEZAS
    // ------------------------------------------------------------------------
    const demandRaw = readSheetDisplayMatrixSafe_(ssInv, TAB_DEMANDA_SIN_STOCK_, 0);
    const sugRaw = readSheetDisplayMatrixSafe_(ssInv, TAB_SUGERENCIAS_COMPRA_, 0);
    const demandRecords = [];
    const suggestionRecords = [];
    const stockSugBackupRows = [];

    let dStart = 1;
    if (demandRaw.length >= 2 && /FECHA_HORA/i.test(String((demandRaw[1] && demandRaw[1][0]) || ''))) dStart = 2;
    for (let i = dStart; i < demandRaw.length; i++) {
      const r = demandRaw[i] || [];
      const reqId = String(r[1] || '').trim() || ('DEM-ROW-' + i);
      const sku = String(r[2] || '').trim().toUpperCase();
      const model = String(r[3] || '').trim();
      if (!sku && !model && !String(r[0] || '').trim()) continue;
      const qty = Math.max(1, parseInt(String(r[6] || '1'), 10) || 1);
      const advMeta = directory.resolveAdvisorMeta(r[11], r[10], r[9]);
      const mgrMeta = directory.getManagerForBranch(advMeta.branchKey);
      const estatus = String(r[12] || 'PENDIENTE').trim().toUpperCase();
      const rec = {
        id: reqId,
        fecha: String(r[0] || '').trim(),
        sku: sku,
        modelo: model,
        categoria: String(r[4] || '').trim(),
        variante: String(r[5] || '').trim(),
        piezas: qty,
        comentarios: String(r[7] || '').trim(),
        stockActual: String(r[8] || '').trim(),
        branchKey: advMeta.branchKey,
        gerente: mgrMeta.name,
        asesor: advMeta.nombre,
        correo: advMeta.correo,
        estatus: estatus
      };
      demandRecords.push(rec);
      stockSugBackupRows.push([
        cutId, nowStr, 'FALTA_STOCK', escapeSheetPlainText_(rec.id), escapeSheetPlainText_(rec.fecha),
        escapeSheetPlainText_(rec.branchKey), escapeSheetPlainText_(rec.gerente),
        escapeSheetPlainText_(rec.asesor), escapeSheetPlainText_(rec.correo), 'Asesor/Tienda',
        escapeSheetPlainText_(rec.sku || rec.categoria), escapeSheetPlainText_(rec.modelo),
        escapeSheetPlainText_(rec.variante), rec.piezas, escapeSheetPlainText_(rec.comentarios),
        escapeSheetPlainText_(rec.stockActual), rec.estatus
      ]);
    }

    let sStart = 1;
    if (sugRaw.length >= 2 && /FECHA_HORA/i.test(String((sugRaw[1] && sugRaw[1][0]) || ''))) sStart = 2;
    for (let i = sStart; i < sugRaw.length; i++) {
      const r = sugRaw[i] || [];
      const sugId = String(r[1] || '').trim() || ('SUG-ROW-' + i);
      const tipoProd = String(r[3] || '').trim();
      if (!tipoProd && !String(r[0] || '').trim()) continue;
      const advMeta = directory.resolveAdvisorMeta('', r[5], r[7]);
      const mgrMeta = directory.getManagerForBranch(advMeta.branchKey);
      const rol = String(r[6] || advMeta.puesto || 'Asesor').trim();
      const estatus = String(r[8] || 'PENDIENTE').trim().toUpperCase();
      const rec = {
        id: sugId,
        fecha: String(r[0] || '').trim(),
        ambiente: String(r[2] || 'INTERIOR').trim().toUpperCase(),
        tipoProducto: tipoProd,
        comentarios: String(r[4] || '').trim(),
        branchKey: advMeta.branchKey,
        gerente: mgrMeta.name,
        asesor: advMeta.nombre,
        correo: advMeta.correo,
        rol: rol,
        estatus: estatus
      };
      suggestionRecords.push(rec);
      stockSugBackupRows.push([
        cutId, nowStr, 'SUGERENCIA_PIEZA', escapeSheetPlainText_(rec.id), escapeSheetPlainText_(rec.fecha),
        escapeSheetPlainText_(rec.branchKey), escapeSheetPlainText_(rec.gerente),
        escapeSheetPlainText_(rec.asesor), escapeSheetPlainText_(rec.correo), escapeSheetPlainText_(rec.rol),
        escapeSheetPlainText_(rec.ambiente), escapeSheetPlainText_(rec.tipoProducto),
        '', 1, escapeSheetPlainText_(rec.comentarios), '', rec.estatus
      ]);
    }

    const stockSugHeaders = [
      'ULTIMO_CORTE', 'FECHA_RESGUARDO', 'TIPO_REGISTRO', 'ID_REGISTRO', 'FECHA_REGISTRO',
      'SUCURSAL', 'GERENTE_SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'ROL',
      'SKU_O_AMBIENTE', 'MODELO_O_TIPO', 'VARIANTE', 'PIEZAS',
      'COMENTARIOS', 'STOCK_SISTEMA', 'ESTATUS'
    ];
    const shStockSugBackup = ensureStyledBackupSheet_(ssInv, TAB_RESGUARDO_STOCK_SUG_, stockSugHeaders);
    const upStockSug = upsertRowsByKeyCol_(shStockSugBackup, stockSugHeaders, 3, stockSugBackupRows);

    // ------------------------------------------------------------------------
    // 5. MOTOR DE ANÁLISIS: ¿POR QUÉ NO SE CIERRAN LAS VENTAS? + GERENTES + ASESORES
    // ------------------------------------------------------------------------
    const analysis = computeKevinExecutiveSalesAnalysis_({
      cutId: cutId,
      cutDateStr: nowStr,
      directory: directory,
      quotes: allConsolidatedQuotes,
      segPartidas: allSegPartidasConsolidated,
      demandRecords: demandRecords,
      suggestionRecords: suggestionRecords,
      archiveSummary: {
        segNewlyArchivedPartidas: segNewlyArchivedPartidas,
        segActiveRemainingPartidas: segActiveRemainingPartidas,
        segBackedUpAllStatesCount: segBackedUpAllStatesCount,
        segHistMovArchivedCount: segHistMovArchivedCount,
        quotesBackedUpCount: upQuotes.totalRows,
        stockAndSugBackedUpCount: upStockSug.totalRows
      }
    });

    // ------------------------------------------------------------------------
    // 6. GUARDAR CORTE EJECUTIVO EN ANALISIS_VENTAS_KEVIN + BITÁCORA HISTORIAL
    // ------------------------------------------------------------------------
    const execHeaders = [
      'ID_CORTE', 'FECHA_CORTE', 'NIVEL', 'SUCURSAL', 'GERENTE', 'ASESOR', 'CORREO',
      'COTIZACIONES', 'MONTO_COTIZADO', 'GANADAS', 'MONTO_GANADO', 'PERDIDAS', 'MONTO_PERDIDO',
      'CANCELADAS', 'SIN_SEGUIMIENTO', 'EN_SEGUIMIENTO', 'PCT_CIERRE',
      'SOLICITUDES_SIN_STOCK', 'PIEZAS_SIN_STOCK', 'SUGERENCIAS_COMPRA',
      'CAUSA_PRINCIPAL_NO_CIERRE', 'DIAGNOSTICO_EJECUTIVO'
    ];
    const shExec = ensureStyledBackupSheet_(ssInv, TAB_ANALISIS_VENTAS_KEVIN_, execHeaders);
    const execRows = [];
    const k = analysis.kpis;
    const topGlobalCause = (analysis.whyNotClosing[0] && analysis.whyNotClosing[0].title) || 'Sin fugas detectadas';
    execRows.push([
      cutId, nowStr, 'GLOBAL', 'TODAS LAS SUCURSALES', 'DIRECCIÓN GENERAL', 'CONSOLIDADO', KEVIN_EXCLUSIVE_EMAIL_,
      k.totalQuotes, k.totalMxn, k.wonCount, k.wonMxn, k.lostCount, k.lostMxn,
      k.cancelledCount, k.uncontactedOpenCount, k.contactedOpenCount, k.winRateTotalPct,
      k.demandCount, k.demandPieces, k.suggestionCount,
      escapeSheetPlainText_(topGlobalCause),
      escapeSheetPlainText_(analysis.executiveHeadline)
    ]);
    for (let m = 0; m < analysis.byManager.length; m++) {
      const mg = analysis.byManager[m];
      execRows.push([
        cutId, nowStr, 'GERENTE / SUCURSAL',
        escapeSheetPlainText_(mg.branchLabel), escapeSheetPlainText_(mg.managerName),
        'EQUIPO ' + mg.branchLabel, escapeSheetPlainText_(mg.managerEmail),
        mg.quotesCount, mg.totalMxn, mg.wonCount, mg.wonMxn, mg.lostCount, mg.lostMxn,
        mg.cancelledCount, mg.uncontactedCount, mg.contactedCount, mg.winRatePct,
        mg.demandCount, mg.demandPieces, mg.suggestionCount,
        escapeSheetPlainText_(mg.topReason), escapeSheetPlainText_(mg.diagnosis)
      ]);
    }
    for (let a = 0; a < analysis.byAdvisor.length; a++) {
      const av = analysis.byAdvisor[a];
      execRows.push([
        cutId, nowStr, 'ASESOR',
        escapeSheetPlainText_(av.branchLabel), escapeSheetPlainText_(av.managerName),
        escapeSheetPlainText_(av.advisorName), escapeSheetPlainText_(av.advisorEmail),
        av.quotesCount, av.totalMxn, av.wonCount, av.wonMxn, av.lostCount, av.lostMxn,
        av.cancelledCount, av.uncontactedCount, av.contactedCount, av.winRatePct,
        av.demandCount, av.demandPieces, av.suggestionCount,
        escapeSheetPlainText_(av.topReason), escapeSheetPlainText_(av.diagnosis)
      ]);
    }
    if (shExec && execRows.length > 0) {
      const startExecR = Math.max(2, shExec.getLastRow() + 1);
      ensureSheetGridCapacity_(shExec, startExecR + execRows.length + 5, execHeaders.length);
      shExec.getRange(startExecR, 1, execRows.length, execHeaders.length).setValues(execRows);
    }

    SpreadsheetApp.flush();

    try {
      registrarEventoHistorial_(ssInv, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'Historial / Análisis Ventas',
        evento: 'CORTE Y RESGUARDO EJECUTIVO KEVIN',
        estado: '✅ ARCHIVADO',
        usuario: 'IRVIN KEVIN REYNA VALDEZ (' + KEVIN_EXCLUSIVE_EMAIL_ + ')',
        sucursal: 'GLOBAL',
        referencia: cutId,
        detalle: 'Seg archivadas: ' + segNewlyArchivedPartidas + ' · Resguardo Seg: ' + segBackedUpAllStatesCount + ' · Resguardo Cot: ' + upQuotes.totalRows + ' · Stock/Sug: ' + upStockSug.totalRows,
        analisis: analysis.executiveHeadline
      });
    } catch (eLog) {}

    return Object.assign({ ok: true }, analysis);
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

function computeKevinExecutiveSalesAnalysis_(ctx) {
  const quotes = ctx.quotes || [];
  const segPartidas = ctx.segPartidas || [];
  const demandRecords = ctx.demandRecords || [];
  const suggestionRecords = ctx.suggestionRecords || [];
  const directory = ctx.directory;

  let totalMxn = 0, wonCount = 0, wonMxn = 0, lostCount = 0, lostMxn = 0, cancelledCount = 0, cancelledMxn = 0;
  let contactedOpenCount = 0, contactedOpenMxn = 0, uncontactedOpenCount = 0, uncontactedOpenMxn = 0;
  let openWithStockRiskCount = 0, openWithStockRiskMxn = 0;

  const lossReasonsMap = {};
  const managerMap = {};
  const advisorMap = {};

  const ensureMgr = function (branchKey) {
    const bk = canonicalKevinBranch_(branchKey);
    if (!managerMap[bk]) {
      const mg = directory.getManagerForBranch(bk);
      managerMap[bk] = {
        branchKey: bk,
        branchLabel: bk,
        managerName: mg.name,
        managerEmail: mg.email,
        quotesCount: 0, totalMxn: 0,
        wonCount: 0, wonMxn: 0,
        lostCount: 0, lostMxn: 0,
        cancelledCount: 0, cancelledMxn: 0,
        contactedCount: 0, contactedMxn: 0,
        uncontactedCount: 0, uncontactedMxn: 0,
        stockRiskQuotes: 0,
        demandCount: 0, demandPieces: 0,
        suggestionCount: 0,
        reasons: {}
      };
    }
    return managerMap[bk];
  };

  const ensureAdv = function (name, email, branchKey, role) {
    const em = String(email || '').trim().toLowerCase();
    const key = em || normPlainUpper_(name || 'SIN ASESOR');
    const bk = canonicalKevinBranch_(branchKey);
    if (!advisorMap[key]) {
      const mg = directory.getManagerForBranch(bk);
      advisorMap[key] = {
        key: key,
        advisorName: String(name || em || 'SIN ASESOR').trim(),
        advisorEmail: em,
        role: String(role || 'Asesor').trim(),
        branchLabel: bk,
        managerName: mg.name,
        quotesCount: 0, totalMxn: 0,
        wonCount: 0, wonMxn: 0,
        lostCount: 0, lostMxn: 0,
        cancelledCount: 0, cancelledMxn: 0,
        contactedCount: 0, contactedMxn: 0,
        uncontactedCount: 0, uncontactedMxn: 0,
        stockRiskQuotes: 0,
        demandCount: 0, demandPieces: 0,
        suggestionCount: 0,
        reasons: {}
      };
    }
    return advisorMap[key];
  };

  // Pre-seed main branches & roster advisors so 0-quote stores/advisors are also visible!
  ['PLAYA', 'COLOSIO', 'OUTLET COLOSIO', 'PUERTO CANCUN', 'CASA CREATA', 'PROYECTOS'].forEach(ensureMgr);
  if (directory && Array.isArray(directory.activeRoster)) {
    for (let r = 0; r < directory.activeRoster.length; r++) {
      const u = directory.activeRoster[r];
      if (u && !u.isAdmin && u.branchKey && u.branchKey !== 'ADMINISTRACION') {
        ensureAdv(u.nombre, u.correo, u.branchKey, u.puesto);
      }
    }
  }

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    const amt = Number(q.totalNum) || 0;
    totalMxn += amt;
    const st = String(q.segStatus || 'ABIERTA').toUpperCase();
    const mg = ensureMgr(q.branchKey);
    const av = ensureAdv(q.asesor, q.correo, q.branchKey, q.rol);

    mg.quotesCount++; mg.totalMxn += amt;
    av.quotesCount++; av.totalMxn += amt;

    if (st === 'GANADA') {
      wonCount++; wonMxn += amt;
      mg.wonCount++; mg.wonMxn += amt;
      av.wonCount++; av.wonMxn += amt;
    } else if (st === 'PERDIDA') {
      lostCount++; lostMxn += amt;
      mg.lostCount++; mg.lostMxn += amt;
      av.lostCount++; av.lostMxn += amt;
      const mot = String(q.motivo || 'Perdida sin motivo especificado').trim();
      lossReasonsMap[mot] = lossReasonsMap[mot] || { reason: mot, count: 0, amountMxn: 0 };
      lossReasonsMap[mot].count++;
      lossReasonsMap[mot].amountMxn += amt;
      mg.reasons[mot] = (mg.reasons[mot] || 0) + 1;
      av.reasons[mot] = (av.reasons[mot] || 0) + 1;
    } else if (st === 'CANCELADA') {
      cancelledCount++; cancelledMxn += amt;
      mg.cancelledCount++; mg.cancelledMxn += amt;
      av.cancelledCount++; av.cancelledMxn += amt;
      const motC = String(q.motivo || 'Cancelada sin motivo especificado').trim();
      lossReasonsMap[motC] = lossReasonsMap[motC] || { reason: motC, count: 0, amountMxn: 0 };
      lossReasonsMap[motC].count++;
      lossReasonsMap[motC].amountMxn += amt;
      mg.reasons[motC] = (mg.reasons[motC] || 0) + 1;
      av.reasons[motC] = (av.reasons[motC] || 0) + 1;
    } else if (st === 'CONTACTADA') {
      contactedOpenCount++; contactedOpenMxn += amt;
      mg.contactedCount++; mg.contactedMxn += amt;
      av.contactedCount++; av.contactedMxn += amt;
      if (q.hasStockRisk) {
        openWithStockRiskCount++; openWithStockRiskMxn += amt;
        mg.stockRiskQuotes++; av.stockRiskQuotes++;
      }
    } else {
      uncontactedOpenCount++; uncontactedOpenMxn += amt;
      mg.uncontactedCount++; mg.uncontactedMxn += amt;
      av.uncontactedCount++; av.uncontactedMxn += amt;
      if (q.hasStockRisk) {
        openWithStockRiskCount++; openWithStockRiskMxn += amt;
        mg.stockRiskQuotes++; av.stockRiskQuotes++;
      }
    }
  }

  // Agregar falta de stock y sugerencias por gerente y asesor + Top SKUs/Sugerencias
  let demandPiecesTotal = 0;
  const skuDemandMap = {};
  for (let i = 0; i < demandRecords.length; i++) {
    const d = demandRecords[i];
    const pzs = Number(d.piezas) || 1;
    demandPiecesTotal += pzs;
    const mg = ensureMgr(d.branchKey);
    const av = ensureAdv(d.asesor, d.correo, d.branchKey, 'Asesor');
    mg.demandCount++; mg.demandPieces += pzs;
    av.demandCount++; av.demandPieces += pzs;
    const skKey = (d.sku || d.modelo || 'SIN-SKU').toUpperCase();
    if (!skuDemandMap[skKey]) {
      skuDemandMap[skKey] = { sku: d.sku || 'S/SKU', model: d.modelo || d.sku || 'Producto', requests: 0, pieces: 0, source: 'Solicitud sin stock' };
    }
    skuDemandMap[skKey].requests++;
    skuDemandMap[skKey].pieces += pzs;
  }

  // Sumar también SKUs agotados en cotizaciones abiertas de Seguimiento
  for (let i = 0; i < segPartidas.length; i++) {
    const p = segPartidas[i];
    if ((p.estado === 'ABIERTA' || p.estado === 'CONTACTADA') && (p.nivelUrgencia === 'CRITICO' || p.stockActual <= 0) && p.sku) {
      const skKey = p.sku.toUpperCase();
      if (!skuDemandMap[skKey]) {
        skuDemandMap[skKey] = { sku: p.sku, model: p.producto || p.sku, requests: 0, pieces: 0, source: 'Cotización abierta agotada' };
      }
      skuDemandMap[skKey].requests++;
      skuDemandMap[skKey].pieces += (Number(p.cantidad) || 1);
    }
  }

  const sugTypeMap = {};
  let sugInterior = 0, sugExterior = 0;
  for (let i = 0; i < suggestionRecords.length; i++) {
    const s = suggestionRecords[i];
    if (s.ambiente === 'EXTERIOR') sugExterior++; else sugInterior++;
    const mg = ensureMgr(s.branchKey);
    const av = ensureAdv(s.asesor, s.correo, s.branchKey, s.rol);
    mg.suggestionCount++;
    av.suggestionCount++;
    const tKey = (s.ambiente + ' · ' + s.tipoProducto).toUpperCase();
    if (!sugTypeMap[tKey]) {
      sugTypeMap[tKey] = { label: s.ambiente + ' · ' + s.tipoProducto, count: 0, sampleComment: s.comentarios || '' };
    }
    sugTypeMap[tKey].count++;
  }

  const totalQuotes = quotes.length;
  const closedTotal = wonCount + lostCount + cancelledCount;
  const nonWonTotal = Math.max(0, totalQuotes - wonCount);
  const winRateClosedPct = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 100) : 0;
  const winRateTotalPct = totalQuotes > 0 ? Math.round((wonCount / totalQuotes) * 100) : 0;

  const lossReasons = Object.keys(lossReasonsMap)
    .map(function (k) { return lossReasonsMap[k]; })
    .sort(function (a, b) { return (b.amountMxn - a.amountMxn) || (b.count - a.count); });

  const topStockoutSkus = Object.keys(skuDemandMap)
    .map(function (k) { return skuDemandMap[k]; })
    .sort(function (a, b) { return (b.pieces - a.pieces) || (b.requests - a.requests); })
    .slice(0, 10);

  const topSuggestions = Object.keys(sugTypeMap)
    .map(function (k) { return sugTypeMap[k]; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 10);

  // Construir ranking de causas reales de por qué NO se cierran las ventas
  const whyNotClosing = [];
  if (uncontactedOpenCount > 0) {
    whyNotClosing.push({
      code: 'SIN_SEGUIMIENTO',
      title: 'Falta de seguimiento comercial (cotizaciones abiertas sin contacto)',
      count: uncontactedOpenCount,
      amountMxn: Math.round(uncontactedOpenMxn * 100) / 100,
      sharePct: nonWonTotal > 0 ? Math.round((uncontactedOpenCount / nonWonTotal) * 100) : 0,
      detail: uncontactedOpenCount + ' cotización(es) (' + formatMoneyKevinMxn_(uncontactedOpenMxn) + ') nunca han recibido WhatsApp, llamada ni correo registrado.',
      recommendation: 'Exigir primer toque por WhatsApp/teléfono el mismo día de la cotización y revisión diaria del gerente.'
    });
  }
  if (contactedOpenCount > 0) {
    whyNotClosing.push({
      code: 'SEGUIMIENTO_SIN_CIERRE',
      title: 'Cotizaciones contactadas estancadas sin cierre definido',
      count: contactedOpenCount,
      amountMxn: Math.round(contactedOpenMxn * 100) / 100,
      sharePct: nonWonTotal > 0 ? Math.round((contactedOpenCount / nonWonTotal) * 100) : 0,
      detail: contactedOpenCount + ' cotización(es) (' + formatMoneyKevinMxn_(contactedOpenMxn) + ') tienen contacto previo pero siguen sin concretarse ni cerrarse.',
      recommendation: 'Hacer segundo seguimiento con alternativa de entrega/descuento autorizado para destrabar decisión.'
    });
  }
  for (let lr = 0; lr < lossReasons.length; lr++) {
    const item = lossReasons[lr];
    whyNotClosing.push({
      code: 'MOTIVO_PERDIDA_' + (lr + 1),
      title: 'Cierre no logrado por: ' + item.reason,
      count: item.count,
      amountMxn: Math.round(item.amountMxn * 100) / 100,
      sharePct: nonWonTotal > 0 ? Math.round((item.count / nonWonTotal) * 100) : 0,
      detail: item.count + ' cotización(es) perdidas/canceladas por este motivo (' + formatMoneyKevinMxn_(item.amountMxn) + ').',
      recommendation: /inventario|agotad|stock/i.test(item.reason)
        ? 'Priorizar resurtido de SKUs agotados y ofrecer sustitutos en existencia física/LPPT.'
        : (/precio|presupuesto/i.test(item.reason)
          ? 'Revisar escalón de descuento con gerente o alternativa de modelo en rango del cliente.'
          : 'Revisar argumento comercial y seguimiento post-visita con gerencia.')
    });
  }
  if (demandRecords.length > 0 || openWithStockRiskCount > 0) {
    whyNotClosing.push({
      code: 'QUIEBRE_DE_STOCK',
      title: 'Freno por falta de stock / piezas agotadas solicitadas en piso',
      count: demandRecords.length + openWithStockRiskCount,
      amountMxn: Math.round(openWithStockRiskMxn * 100) / 100,
      sharePct: 0,
      detail: demandRecords.length + ' solicitud(es) sin stock (' + demandPiecesTotal + ' pzas) + ' + openWithStockRiskCount + ' cotización(es) abiertas con stock crítico/agotado.',
      recommendation: topStockoutSkus.length
        ? ('Atacar reposición de Top SKUs: ' + topStockoutSkus.slice(0, 3).map(function (x) { return x.sku + ' (' + x.pieces + ' pzas)'; }).join(', ') + '.')
        : 'Cruzar solicitudes sin stock contra próximas llegadas LPPT.'
    });
  }
  if (suggestionRecords.length > 0) {
    whyNotClosing.push({
      code: 'SUGERENCIAS_CATALOGO',
      title: 'Clientes buscando productos/acabados fuera de línea (Sugerencias de compra)',
      count: suggestionRecords.length,
      amountMxn: 0,
      sharePct: 0,
      detail: suggestionRecords.length + ' sugerencia(s) levantadas en tienda (' + sugInterior + ' Interior · ' + sugExterior + ' Exterior).',
      recommendation: topSuggestions.length
        ? ('Evaluar incorporación de: ' + topSuggestions.slice(0, 3).map(function (x) { return x.label + ' (' + x.count + ')'; }).join(', ') + '.')
        : 'Evaluar sugerencias recurrentes con compras.'
    });
  }

  whyNotClosing.sort(function (a, b) {
    return (b.amountMxn - a.amountMxn) || (b.count - a.count);
  });

  const summarizeEntityDiagnosis = function (ent, isAdvisorZeroCheck) {
    if (isAdvisorZeroCheck && ent.quotesCount === 0) {
      if (ent.demandCount > 0 || ent.suggestionCount > 0) {
        return {
          topReason: 'Sin cotizaciones registradas',
          diagnosis: '0 cotizaciones en sistema · reportó ' + ent.demandCount + ' falta(s) de stock y ' + ent.suggestionCount + ' sugerencia(s).'
        };
      }
      return {
        topReason: 'Sin cotizaciones registradas',
        diagnosis: 'Sin cotizaciones registradas en la app/ERP durante el periodo.'
      };
    }
    const reasonEntries = Object.keys(ent.reasons).map(function (rk) { return { r: rk, c: ent.reasons[rk] }; })
      .sort(function (a, b) { return b.c - a.c; });
    const topLoss = reasonEntries[0] || null;
    const parts = [];
    let mainCause = 'En seguimiento normal';
    if (ent.uncontactedCount > 0 && (!topLoss || ent.uncontactedCount >= topLoss.c)) {
      mainCause = 'Sin seguimiento (' + ent.uncontactedCount + ' sin contacto)';
      parts.push(ent.uncontactedCount + ' cot. sin contacto (' + formatMoneyKevinMxn_(ent.uncontactedMxn) + ')');
    }
    if (topLoss) {
      if (mainCause === 'En seguimiento normal') mainCause = topLoss.r;
      parts.push('Motivo pérdida #1: ' + topLoss.r + ' (' + topLoss.c + ')');
    }
    if (ent.contactedCount > 0) {
      parts.push(ent.contactedCount + ' en negociación');
    }
    if (ent.demandCount > 0) {
      parts.push(ent.demandCount + ' falta(s) stock (' + ent.demandPieces + ' pzas)');
    }
    if (ent.suggestionCount > 0) {
      parts.push(ent.suggestionCount + ' sugerencia(s)');
    }
    if (!parts.length) {
      parts.push(ent.wonCount > 0 ? '100% cerradas ganadas' : 'Sin incidencias');
    }
    return { topReason: mainCause, diagnosis: parts.join(' · ') };
  };

  const byManager = Object.keys(managerMap)
    .map(function (bk) {
      const m = managerMap[bk];
      const diag = summarizeEntityDiagnosis(m, false);
      const closedM = m.wonCount + m.lostCount + m.cancelledCount;
      return {
        branchKey: m.branchKey,
        branchLabel: m.branchLabel,
        managerName: m.managerName,
        managerEmail: m.managerEmail,
        quotesCount: m.quotesCount,
        totalMxn: Math.round(m.totalMxn * 100) / 100,
        wonCount: m.wonCount,
        wonMxn: Math.round(m.wonMxn * 100) / 100,
        lostCount: m.lostCount,
        lostMxn: Math.round(m.lostMxn * 100) / 100,
        cancelledCount: m.cancelledCount,
        contactedCount: m.contactedCount,
        uncontactedCount: m.uncontactedCount,
        uncontactedMxn: Math.round(m.uncontactedMxn * 100) / 100,
        winRatePct: m.quotesCount > 0 ? Math.round((m.wonCount / m.quotesCount) * 100) : 0,
        winRateClosedPct: closedM > 0 ? Math.round((m.wonCount / closedM) * 100) : 0,
        demandCount: m.demandCount,
        demandPieces: m.demandPieces,
        suggestionCount: m.suggestionCount,
        topReason: diag.topReason,
        diagnosis: diag.diagnosis
      };
    })
    .filter(function (m) {
      return m.quotesCount > 0 || m.demandCount > 0 || m.suggestionCount > 0 ||
        ['PLAYA', 'COLOSIO', 'OUTLET COLOSIO', 'PUERTO CANCUN', 'CASA CREATA', 'PROYECTOS'].indexOf(m.branchKey) !== -1;
    })
    .sort(function (a, b) { return (b.totalMxn - a.totalMxn) || (b.quotesCount - a.quotesCount); });

  const byAdvisor = Object.keys(advisorMap)
    .map(function (ak) {
      const a = advisorMap[ak];
      const diag = summarizeEntityDiagnosis(a, true);
      const closedA = a.wonCount + a.lostCount + a.cancelledCount;
      return {
        advisorName: a.advisorName,
        advisorEmail: a.advisorEmail,
        role: a.role,
        branchLabel: a.branchLabel,
        managerName: a.managerName,
        quotesCount: a.quotesCount,
        totalMxn: Math.round(a.totalMxn * 100) / 100,
        wonCount: a.wonCount,
        wonMxn: Math.round(a.wonMxn * 100) / 100,
        lostCount: a.lostCount,
        lostMxn: Math.round(a.lostMxn * 100) / 100,
        cancelledCount: a.cancelledCount,
        contactedCount: a.contactedCount,
        uncontactedCount: a.uncontactedCount,
        uncontactedMxn: Math.round(a.uncontactedMxn * 100) / 100,
        winRatePct: a.quotesCount > 0 ? Math.round((a.wonCount / a.quotesCount) * 100) : 0,
        winRateClosedPct: closedA > 0 ? Math.round((a.wonCount / closedA) * 100) : 0,
        demandCount: a.demandCount,
        demandPieces: a.demandPieces,
        suggestionCount: a.suggestionCount,
        topReason: diag.topReason,
        diagnosis: diag.diagnosis
      };
    })
    .sort(function (a, b) { return (b.totalMxn - a.totalMxn) || (b.quotesCount - a.quotesCount) || a.advisorName.localeCompare(b.advisorName); });

  const kpis = {
    totalQuotes: totalQuotes,
    totalMxn: Math.round(totalMxn * 100) / 100,
    wonCount: wonCount,
    wonMxn: Math.round(wonMxn * 100) / 100,
    lostCount: lostCount,
    lostMxn: Math.round(lostMxn * 100) / 100,
    cancelledCount: cancelledCount,
    cancelledMxn: Math.round(cancelledMxn * 100) / 100,
    contactedOpenCount: contactedOpenCount,
    contactedOpenMxn: Math.round(contactedOpenMxn * 100) / 100,
    uncontactedOpenCount: uncontactedOpenCount,
    uncontactedOpenMxn: Math.round(uncontactedOpenMxn * 100) / 100,
    openWithStockRiskCount: openWithStockRiskCount,
    winRateClosedPct: winRateClosedPct,
    winRateTotalPct: winRateTotalPct,
    demandCount: demandRecords.length,
    demandPieces: demandPiecesTotal,
    suggestionCount: suggestionRecords.length,
    sugInterior: sugInterior,
    sugExterior: sugExterior
  };

  const executiveHeadline =
    'Cotizado: ' + formatMoneyKevinMxn_(kpis.totalMxn) + ' (' + kpis.totalQuotes + ' cot.) · ' +
    'Ganadas: ' + kpis.wonCount + ' (' + kpis.winRateTotalPct + '% global / ' + kpis.winRateClosedPct + '% sobre cerradas) · ' +
    'Sin contacto: ' + kpis.uncontactedOpenCount + ' (' + formatMoneyKevinMxn_(kpis.uncontactedOpenMxn) + ') · ' +
    'Perdidas/Canceladas: ' + (kpis.lostCount + kpis.cancelledCount) + ' · ' +
    'Falta stock: ' + kpis.demandCount + ' sol. (' + kpis.demandPieces + ' pzas) · Sugerencias: ' + kpis.suggestionCount + '.';

  // Construir borrador de correo completo y versión compacta para mailto:
  const subject = 'Corte y Análisis de No Cierre de Ventas CREATA · ' + ctx.cutDateStr.slice(0, 10) + ' (' + ctx.cutId + ')';
  const lines = [
    'REPORTE EJECUTIVO DE VENTAS, SEGUIMIENTO Y CAUSAS DE NO CIERRE — CREATA MUEBLES',
    'Corte: ' + ctx.cutId + ' · Fecha: ' + ctx.cutDateStr,
    '========================================================================',
    '',
    '1) RESUMEN GLOBAL Y ARCHIVO DE RESGUARDO',
    '• Total cotizado: ' + formatMoneyKevinMxn_(kpis.totalMxn) + ' (' + kpis.totalQuotes + ' cotizaciones)',
    '• Ventas ganadas: ' + kpis.wonCount + ' (' + formatMoneyKevinMxn_(kpis.wonMxn) + ') — Tasa de cierre: ' + kpis.winRateTotalPct + '% del total (' + kpis.winRateClosedPct + '% sobre cerradas)',
    '• Perdidas: ' + kpis.lostCount + ' (' + formatMoneyKevinMxn_(kpis.lostMxn) + ') | Canceladas: ' + kpis.cancelledCount + ' (' + formatMoneyKevinMxn_(kpis.cancelledMxn) + ')',
    '• Abiertas SIN contacto (fuga directa): ' + kpis.uncontactedOpenCount + ' (' + formatMoneyKevinMxn_(kpis.uncontactedOpenMxn) + ')',
    '• Abiertas en seguimiento (contactadas): ' + kpis.contactedOpenCount + ' (' + formatMoneyKevinMxn_(kpis.contactedOpenMxn) + ')',
    '• Solicitudes por Falta de Stock: ' + kpis.demandCount + ' (' + kpis.demandPieces + ' piezas) | Sugerencias de Piezas: ' + kpis.suggestionCount + ' (' + sugInterior + ' Int / ' + sugExterior + ' Ext)',
    '• Resguardo en hojas: ' + ctx.archiveSummary.segNewlyArchivedPartidas + ' partida(s) cerradas movidas a COTIZACIONES_ARCHIVADAS, ' +
      ctx.archiveSummary.segBackedUpAllStatesCount + ' en RESGUARDO_SEGUIMIENTO, ' +
      ctx.archiveSummary.quotesBackedUpCount + ' en RESGUARDO_COTIZACIONES_APP y ' +
      ctx.archiveSummary.stockAndSugBackedUpCount + ' en RESGUARDO_STOCK_Y_SUGERENCIAS.',
    '',
    '2) DIAGNÓSTICO PRINCIPAL: ¿POR QUÉ NO SE ESTÁN CERRANDO LAS VENTAS?'
  ];
  if (!whyNotClosing.length) {
    lines.push('• Sin fugas de venta ni pérdidas registradas en este corte.');
  } else {
    for (let w = 0; w < whyNotClosing.length; w++) {
      const c = whyNotClosing[w];
      lines.push((w + 1) + '. ' + c.title);
      lines.push('   - Impacto: ' + c.detail);
      lines.push('   - Acción sugerida: ' + c.recommendation);
    }
  }

  lines.push('');
  lines.push('3) RESULTADO Y ANÁLISIS POR GERENTE / SUCURSAL');
  for (let m = 0; m < byManager.length; m++) {
    const mg = byManager[m];
    lines.push(
      '• ' + mg.branchLabel + ' (Gerente: ' + mg.managerName + '): ' +
      mg.quotesCount + ' cot. (' + formatMoneyKevinMxn_(mg.totalMxn) + ') | ' +
      'Ganadas: ' + mg.wonCount + ' (' + mg.winRatePct + '%) | ' +
      'Perd/Canc: ' + (mg.lostCount + mg.cancelledCount) + ' | ' +
      'Sin contacto: ' + mg.uncontactedCount + ' | ' +
      'Falta stock: ' + mg.demandCount + ' (' + mg.demandPieces + ' pzas) | ' +
      'Sugerencias: ' + mg.suggestionCount +
      ' -> Diagnóstico: ' + mg.diagnosis
    );
  }

  lines.push('');
  lines.push('4) RESULTADO Y ANÁLISIS POR ASESOR');
  for (let a = 0; a < byAdvisor.length; a++) {
    const av = byAdvisor[a];
    lines.push(
      '• ' + av.advisorName + ' [' + av.branchLabel + ' · Gte: ' + av.managerName + ']: ' +
      av.quotesCount + ' cot. (' + formatMoneyKevinMxn_(av.totalMxn) + ') | ' +
      'Ganadas: ' + av.wonCount + ' (' + av.winRatePct + '%) | ' +
      'Perd/Canc: ' + (av.lostCount + av.cancelledCount) + ' | ' +
      'Sin contacto: ' + av.uncontactedCount + ' | ' +
      'Falta stock: ' + av.demandCount + ' (' + av.demandPieces + ' pzas) | ' +
      'Sugerencias: ' + av.suggestionCount +
      ' -> ' + av.diagnosis
    );
  }

  if (topStockoutSkus.length > 0) {
    lines.push('');
    lines.push('5) TOP PRODUCTOS CON FALTA DE STOCK QUE FRENAN CIERRES');
    for (let s = 0; s < Math.min(8, topStockoutSkus.length); s++) {
      const sk = topStockoutSkus[s];
      lines.push('• ' + sk.sku + ' — ' + sk.model + ': ' + sk.pieces + ' pza(s) en ' + sk.requests + ' registro(s) (' + sk.source + ')');
    }
  }

  if (topSuggestions.length > 0) {
    lines.push('');
    lines.push('6) TOP SUGERENCIAS DE PIEZAS PEDIDAS POR CLIENTES');
    for (let g = 0; g < Math.min(8, topSuggestions.length); g++) {
      const sg = topSuggestions[g];
      lines.push('• ' + sg.label + ': ' + sg.count + ' solicitud(es)' + (sg.sampleComment ? (' — Ej: "' + sg.sampleComment.slice(0, 90) + '"') : ''));
    }
  }

  const fullBody = lines.join('\n');
  const shortLines = [
    'CORTE Y ANÁLISIS DE NO CIERRE CREATA (' + ctx.cutId + ' · ' + ctx.cutDateStr + ')',
    executiveHeadline,
    '',
    '¿POR QUÉ NO SE CIERRAN LAS VENTAS?'
  ];
  for (let w = 0; w < Math.min(4, whyNotClosing.length); w++) {
    shortLines.push((w + 1) + ') ' + whyNotClosing[w].title + ' -> ' + whyNotClosing[w].detail);
  }
  shortLines.push('');
  shortLines.push('POR GERENTE:');
  for (let m = 0; m < byManager.length; m++) {
    const mg = byManager[m];
    shortLines.push('- ' + mg.branchLabel + ' (' + mg.managerName + '): ' + mg.quotesCount + ' cot (' + formatMoneyKevinMxn_(mg.totalMxn) + '), Gan:' + mg.wonCount + ', SinCont:' + mg.uncontactedCount + ', Stock:' + mg.demandCount + ', Sug:' + mg.suggestionCount + ' | ' + mg.topReason);
  }
  shortLines.push('');
  shortLines.push('(El desglose completo por asesor, falta de stock y sugerencias quedó copiado en tu portapapeles y resguardado en ANALISIS_VENTAS_KEVIN).');

  return {
    cutId: ctx.cutId,
    cutDateStr: ctx.cutDateStr,
    archiveSummary: ctx.archiveSummary,
    executiveHeadline: executiveHeadline,
    kpis: kpis,
    whyNotClosing: whyNotClosing,
    lossReasons: lossReasons,
    topStockoutSkus: topStockoutSkus,
    topSuggestions: topSuggestions,
    byManager: byManager,
    byAdvisor: byAdvisor,
    emailDraft: {
      to: KEVIN_EXCLUSIVE_EMAIL_,
      subject: subject,
      body: fullBody,
      shortMailtoBody: shortLines.join('\n')
    }
  };
}

