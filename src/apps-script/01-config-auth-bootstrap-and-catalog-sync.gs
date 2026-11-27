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
