/**
 * ============================================================================
 * CREATA MUEBLES — AUTOMATIZACIÓN DRIVE -> GOOGLE SHEETS -> WEB EN VIVO
 * ============================================================================
 * Instalación rápida (una sola vez dentro de tu Google Sheet):
 * 1. Abre tu Sheet:
 *    https://docs.google.com/spreadsheets/d/1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8/edit
 * 2. Menú Extensiones -> Apps Script -> pega todo este archivo y guarda.
 * 3. En Configuración del proyecto (engrane) -> Propiedades del script, agrega:
 *    - GEMINI_API_KEY   : Tu clave de Gemini AI Studio (para leer PDFs nuevos de Drive)
 *    - GITHUB_TOKEN     : (Opcional) Token de GitHub con permiso Contents:Write para
 *                         guardar fotos directo en ikerreyna3942-debug/MCP-REPOCITORIO/fotos/
 *    - ADMIN_PIN        : (Opcional) PIN secreto para proteger cambios desde admin.html
 * 4. Recarga el Sheet -> verás el menú "CREATA Catálogo":
 *    - Ejecuta "1. Dejar Todo Listo (Catálogo + Inventario Vacío, Sin Fotos)"
 * 5. En Apps Script -> Implementar -> Nueva implementación -> Aplicación web:
 *    - Ejecutar como: "Yo"
 *    - Quién tiene acceso: "Cualquier usuario"
 *    (admin.html e index.html se conectan automáticamente a este Sheet sin pegar URLs).
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
  INVENTORY_COLS: ['CEDIS', 'CASA CREATA', 'COLOSIO', 'PLAYA', 'PUERTO CANCUN'],
  IGNORED_DRIVE_IDS: [
    '1gieOXN5gEVWaDcO9NqbywzAot7tW3pxA',
    '1RoCQXw7kOsKo5N-uh7iZJMtJzSwt_kaY',
    '1NoCEV04yWI1CeQX78OtYXKDli9zYKRlG'
  ]
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CREATA Catálogo')
    .addItem('1. Dejar Todo Listo (Catálogo + Inventario Vacío, Sin Fotos)', 'dejarTodoListoSinFotos')
    .addItem('2. Inicializar Solo Columnas e Inventario', 'setupSheetsStructure')
    .addItem('3. Sincronizar Fichas Nuevas desde Drive ahora', 'syncDriveFolderToSheet')
    .addItem('4. Activar Sincronización Automática (cada 10 min)', 'installSyncTrigger')
    .addToUi();
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

/**
 * Crea las pestañas CATALOGO_PRODUCTOS y PIEZAS_MODULOS con formato, inventario vacío y color condicional (> 0)
 */
function applyInventoryColumnsAndColor_(sh, startCol1Based, maxRows) {
  if (!sh) return;
  const invCols = CONFIG.INVENTORY_COLS;
  const endCol1Based = startCol1Based + invCols.length - 1;
  if (sh.getMaxColumns() < endCol1Based) {
    sh.insertColumnsAfter(sh.getMaxColumns(), endCol1Based - sh.getMaxColumns());
  }
  sh.getRange(1, startCol1Based, 1, invCols.length)
    .setValues([invCols])
    .setFontWeight('bold')
    .setBackground('#14532D')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  const invRange = sh.getRange(2, startCol1Based, maxRows, invCols.length);
  invRange.setHorizontalAlignment('center').setNumberFormat('#,##0');

  for (let c = startCol1Based; c <= endCol1Based; c++) {
    sh.setColumnWidth(c, 128);
  }

  // Regla condicional: colorear en verde ÚNICAMENTE si existen piezas (> 0)
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

  // Asegurar las 5 columnas de inventario vacías también en SALAS_MODULARES y MUEBLES_INDIVIDUALES si existen
  const shSalas = ss.getSheetByName('SALAS_MODULARES');
  if (shSalas) applyInventoryColumnsAndColor_(shSalas, 15, 300);
  const shIndiv = ss.getSheetByName('MUEBLES_INDIVIDUALES');
  if (shIndiv) applyInventoryColumnsAndColor_(shIndiv, 15, 300);

  publishWebAppUrlToConfigSheet_(ss);
  return { ok: true };
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
  SpreadsheetApp.getUi().alert('Sincronización automática activada cada 10 minutos.');
}

/**
 * Escanea recursivamente la carpeta de Drive y agrega nuevas fichas como ARCHIVADO
 */
function syncDriveFolderToSheet() {
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const existingRows = shProd.getDataRange().getValues();
  const knownFileIds = new Set(CONFIG.IGNORED_DRIVE_IDS || []);
  for (let i = 1; i < existingRows.length; i++) {
    const fIdRaw = String(existingRows[i][21] || '').trim();
    if (fIdRaw) {
      fIdRaw.split(',').forEach((part) => {
        const cleanId = part.trim();
        if (cleanId) knownFileIds.add(cleanId);
      });
    }
    const driveUrlCell = String(existingRows[i][16] || '');
    const mUrl = driveUrlCell.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (mUrl && mUrl[1]) knownFileIds.add(mUrl[1]);
  }

  const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const files = collectPdfFilesRecursive_(rootFolder, '');
  const geminiKey = getProp_('GEMINI_API_KEY');

  let addedCount = 0;
  files.forEach((entry) => {
    const file = entry.file;
    const fileId = file.getId();
    if (knownFileIds.has(fileId)) return;

    // Asegura enlace compartible de solo lectura para la ficha
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {}

    const driveUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    const baseName = file.getName().replace(/\.pdf$/i, '').trim();
    const provHint = (entry.folderPath.split('/')[0] || 'CREATA').toUpperCase().slice(0, 6);

    let parsed = null;
    if (geminiKey) {
      parsed = extractFichaWithGemini_(file, geminiKey, provHint);
    }

    const itemId = 'DRV-' + fileId.slice(0, 10);
    const modelName = (parsed && parsed.modelo ? parsed.modelo : baseName).toUpperCase();
    const provider = (parsed && parsed.proveedor ? parsed.proveedor : provHint).toUpperCase();
    const skuInternal = (parsed && parsed.sku ? parsed.sku : (provider + '-' + fileId.slice(0, 6))).toUpperCase();
    const category = normalizeCategory_(parsed && parsed.categoria);
    const pieces = (parsed && Array.isArray(parsed.piezas)) ? parsed.piezas : [];
    const isMulti = pieces.length > 1;

    let priceCellValue = (parsed && parsed.precio_total) ? Number(parsed.precio_total) : 0;
    if (isMulti) {
      pieces.forEach((pz, idx) => {
        const pieceRowNum = shPiece.getLastRow() + 1;
        shPiece.appendRow([
          itemId,
          modelName,
          String(pz.sku_pieza || (skuInternal + '-P' + (idx + 1))).toUpperCase(),
          String(pz.nombre || ('Pieza ' + (idx + 1))),
          Number(pz.cantidad || 1),
          String(pz.ancho_cm || ''),
          String(pz.fondo_cm || ''),
          String(pz.alto_cm || ''),
          Number(pz.precio_unitario || 0),
          '=E' + pieceRowNum + '*I' + pieceRowNum,
          '', '', '', '', ''
        ]);
      });
    }

    const rowIdx = shProd.getLastRow() + 1;
    const priceFormulaOrValue = isMulti
      ? '=SUMIF(' + CONFIG.TAB_PIECES + '!A:A, A' + rowIdx + ', ' + CONFIG.TAB_PIECES + '!J:J)'
      : priceCellValue;

    const piecesSummary = isMulti
      ? (pieces.length + ' piezas (' + pieces.map((x) => x.nombre).join(' + ') + ')')
      : '';

    shProd.appendRow([
      itemId,
      'ARCHIVADO',
      provider,
      skuInternal,
      modelName,
      category,
      isMulti ? 'SÍ' : 'NO',
      piecesSummary,
      String((parsed && parsed.ancho_cm) || ''),
      String((parsed && parsed.fondo_cm) || ''),
      String((parsed && parsed.alto_cm) || ''),
      String((parsed && parsed.asiento_cm) || ''),
      String((parsed && parsed.bultos) || (isMulti ? pieces.length + ' bultos' : '1 bulto')),
      String((parsed && parsed.cubitaje_m3) || ''),
      priceFormulaOrValue,
      String((parsed && parsed.materiales) || ''),
      driveUrl,
      '',
      '',
      '',
      '[]',
      fileId,
      new Date().toISOString(),
      '', '', '', '', ''
    ]);

    addedCount++;
  });

  return { ok: true, scanned: files.length, added: addedCount };
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
  if (c.includes('CENTRO')) return 'MESAS DE CENTRO';
  if (c.includes('REC') || c.includes('CAMA') || c.includes('BUR') || c.includes('CÓMODA')) return 'RECÁMARAS';
  return 'COMPLEMENTOS';
}

function formatMoney_(num) {
  const n = Number(num || 0);
  if (!isFinite(n) || n <= 0) return '';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Endpoint GET para lectura en vivo desde index.html (?mode=public) y admin.html (?mode=admin)
 */
function doGet(e) {
  try { publishWebAppUrlToConfigSheet_(getSpreadsheet_()); } catch (err) {}
  const mode = (e && e.parameter && e.parameter.mode) || 'public';
  const reqPin = (e && e.parameter && e.parameter.pin) || '';
  const adminPin = getProp_('ADMIN_PIN');

  if (mode === 'admin' && adminPin && reqPin !== adminPin) {
    return jsonResponse_({ ok: false, error: 'PIN de administrador inválido' });
  }

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
 * Endpoint POST para admin.html: subir foto, guardar ficha, archivar/publicar, sincronizar Drive
 */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const adminPin = getProp_('ADMIN_PIN');
    if (adminPin && String(body.pin || '') !== adminPin) {
      return jsonResponse_({ ok: false, error: 'PIN de administrador incorrecto' });
    }

    const action = body.action || '';
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
      price: Number(r[8] || 0),
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
    const priceFormatted = typeof r[14] === 'number' ? formatMoney_(r[14]) : String(r[14] || '');
    const mods = piecesByParent[id] || [];

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
      variants: [{
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
        gallery: {
          ambiente: ambUrl,
          finish: finUrl,
          view1: views[0] || '',
          view2: views[1] || '',
          view3: views[2] || '',
          view4: views[3] || '',
          all_views: views
        }
      }]
    };

    if (mods.length > 0) {
      item.sala_modules = mods;
    }
    if (includePrivate) {
      item.sku = String(r[3] || '');
      item.variants[0].sku = item.sku;
      item.drive_file_id = String(r[21] || '');
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

  // Actualizar celda correspondiente si el producto existe en CATALOGO_PRODUCTOS
  const pid = String(body.productId || '').trim();
  if (pid) {
    const sh = getSpreadsheet_().getSheetByName(CONFIG.TAB_PRODUCTS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === pid) {
        const rowNum = i + 1;
        if (slot === 'hero') sh.getRange(rowNum, 18).setValue(publicUrl);
        else if (slot === 'ambiente') {
          sh.getRange(rowNum, 19).setValue(publicUrl);
        } else if (slot === 'finish') {
          sh.getRange(rowNum, 20).setValue(publicUrl);
        } else if (slot.startsWith('view')) {
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
  const allMods = Array.isArray(p.sala_modules) ? p.sala_modules : [];
  const activeMods = allMods.filter((m) => m.checked !== false && Number(m.qty ?? 1) > 0);
  const isMulti = allMods.length > 1;

  // Actualizar piezas hijas en PIEZAS_MODULOS preservando inventario en K..O
  const zRows = shPiece.getDataRange().getValues();
  const prevPieceInv = {};
  for (let r = zRows.length; r >= 2; r--) {
    const rowArr = zRows[r - 1];
    if (String(rowArr[0] || '').trim() === p.id) {
      const pSkuKey = String(rowArr[2] || '').trim().toUpperCase();
      if (pSkuKey) {
        prevPieceInv[pSkuKey] = [
          rowArr[10] === undefined ? '' : rowArr[10],
          rowArr[11] === undefined ? '' : rowArr[11],
          rowArr[12] === undefined ? '' : rowArr[12],
          rowArr[13] === undefined ? '' : rowArr[13],
          rowArr[14] === undefined ? '' : rowArr[14]
        ];
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
      shPiece.appendRow([
        p.id,
        p.model_name || '',
        pieceSku,
        m.name || ('Pieza ' + (idx + 1)),
        qtyVal,
        String(m.width || ''),
        String(m.depth || ''),
        String(m.height || ''),
        Number(m.price || 0),
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

  const numericPrice = Number(String(p.price || '0').replace(/[^0-9.-]/g, '')) || 0;
  const priceFormulaOrValue = isMulti
    ? '=SUMIF(' + CONFIG.TAB_PIECES + '!A:A, A' + targetRow + ', ' + CONFIG.TAB_PIECES + '!J:J)'
    : numericPrice;

  const rowValues = [
    p.id,
    p.archived ? 'ARCHIVADO' : 'VISIBLE',
    p.provider_abbr || 'CREATA',
    p.sku || p.id,
    p.model_name || '',
    p.category || 'COMPLEMENTOS',
    isMulti ? 'SÍ' : 'NO',
    isMulti ? (activeMods.length + ' piezas') : '',
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

const RETAIL_PRICES_BY_SKU_ = {"ARM1PASCNACR":19820.7,"ARMCAR1PDERAC":26630.1,"ARMCAR1PIZQAC":26630.1,"ARMCAR1PMODTC":17354.6,"ARMCARESQCUAC":27163.8,"ARMDON1PDERR1":29169.8,"ARMDON1PIZQR1":29169.8,"ARMDONCHDERR1":34249.2,"ARMDONCHIZQR1":34249.2,"ARMDYL1PDEMPE":25470.6,"ARMDYL1PIZMPE":25470.6,"ARMDYL1PMOMPE":22618.1,"ARMDYLESQMPE":21366.6,"ARMDYLOTTOMPE":15790.3,"ARMLUG1PDERNL":21182.6,"ARMLUG1PIZQNL":21182.6,"ARMLUG1PMODNL":17041.8,"ARMLUGCHDERNL":31985.5,"ARMLUGCHIZQNL":31985.5,"ARMLUGESQCUNL":17649.1,"ARMLUGESQNL":17649.1,"ARMMAR2PKECO":29501.0,"ARMMAR3PKECO":37893.1,"ARMMAT1PDERSP":35243.0,"ARMMAT1PIZQSP":35243.0,"ARMMATCHDERSP":40396.0,"ARMMATCHIZQSP":40396.0,"ARMMON1PMODFA":14575.7,"ARMMON2PFRFL":40377.6,"ARMMON3PFREFL":50886.0,"ARMMONESQELBL":18624.5,"ARMMONESQFAPE":17686.6,"ARMMONIZQELBL":19931.1,"ARMMONOTTFAPE":12146.4,"ARMSHE1PDERN1":24771.3,"ARMSHE1PIZQN1":24771.3,"ARMSHE1PMODN1":20648.9,"ARMSHEESQNA01":21569.1,"ARMSHEOTTNA01":15900.7,"ATX1PBALBOLB":22496.0,"ATX1PBALRNLB":22496.0,"ATX3PAURBLTA":38653.6,"ATX3PSFEGJLB":35962.3,"ATXBUFBALSPHA":40208.2,"ATXBUFLUMBENT":29335.4,"ATXBUFSTHNONT":44537.3,"ATXCAMAUQSGMB":34529.8,"ATXCAMAUQSREB":29919.6,"ATXCAMSFEKSGM":47025.7,"ATXCAMSFEKSLC":45006.6,"ATXCENRENLABE":11530.3,"ATXLIBMAZENCA":57776.2,"ATXMDCKUNROEN":18885.5,"ATXMESLUMBENT":32168.5,"ATXMLAKUNROEN":11078.1,"ATXSILAURBKHA":10383.9,"ATXSILSTHPLLB":10239.7,"BARBUFSAN18RM":23871.0,"BARBURSAN60RM":8503.5,"BARBURSANIZRM":8503.5,"BARBUSAN120RM":17075.2,"BARCRESAN14RM":14309.0,"BARESPSANRM18":10228.0,"BARMDCSAN120R":11577.0,"BARMDCSAN80RM":9391.4,"BARMESAN6PRM":20831.7,"BARMESSAN4PRM":13626.0,"BARMESSAN8PRM":22539.3,"BARMLSANRM50":6317.8,"BARSANKSPLRM":24500.0,"BARSANMATPLRM":22675.9,"BARSILSANPLRM":9528.0,"BARSOCSANRMKP":13147.9,"BARTOCSAN14RM":16904.5,"CVVSALAARIOF":49297.0,"CVVSALAARIOI":42724.0,"CVVSALLEXPROL":23626.7,"CVVSALLUNBALI":53883.7,"CVVSALLUNBAMU":46699.2,"CVVSALPIEFPBU":50149.9,"CVVSALPIEFPMO":50149.9,"GMM1P2010":32608.9,"GMM1P2016":31215.6,"GMM1P2017":31215.6,"GMM1PKATBEIWO":23284.5,"GMM1PLEOBEI":21442.1,"GMMCAM9866":30443.6,"GMMCAM9867":36431.2,"GMMMDC2818":14236.1,"GMMMES6908":69308.6,"GMMMES7141":63278.6,"GMMMTV7300":77147.7,"GMMSIL2147":9228.4,"GMMSIL7411":15076.3,"GMMSIL7412":5138.6,"KUDSALMAWHALI":48490.4,"KUDSCAASHBROA":53421.7,"KUDSCAUGABROA":33833.7,"LPBUR61RMCL":17088.4,"LPCOMD36RMCL":43662.7,"MOBBASKSYUT":18096.9,"MOBBUFPLAPAR":48769.6,"MOBBURAFRROMO":13802.7,"MOBBURBARLED":16563.3,"MOBBURMADROMO":27298.7,"MOBBURPLAPAR":12269.1,"MOBBURYUTROMO":15643.1,"MOBCABMADKSRM":27298.7,"MOBCAJBARRMNU":57971.4,"MOBCOMBEJROMO":56744.5,"MOBCOMMADROMO":12269.1,"MOBCREADA220":24231.5,"MOBCREBEJROMO":30366.0,"MOBCTVPUERM":98152.7,"MOBESPCOR45RM":24231.5,"MOBESPESCPAR":18722.2,"MOBJGOMESPARM":23924.7,"MOBMDCBEJROMO":22084.4,"MOBMESBAR8PRM":67480.0,"MOBMESKAMRM":36807.3,"MOBSILCANROMO":12537.0,"MOBSILNAISOL":11655.6,"MOBURBEJRROMO":16870.0,"PAYCAMSAJKS":83862.6,"PAYCAMSALKSRI":60360.5,"PICMDCSOTSB":15302.3,"REVMLZEUPAR46":5793.7,"YO1PAARNOGRRM":34227.7,"YO1PAURRUNARM":29086.2,"YO1PDUEPIJERM":26148.2,"YO1PUNIBRBOPC":30261.4,"YO1PZURPIERM":45245.2,"YO1PZURSA07RM":32024.2,"YO3PZAMALUIV":43776.2};

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
 * 1 clic: Carga los 100 muebles (47 VISIBLE + 53 ARCHIVADO), 38 piezas modulares,
 * 0 fotos precargadas, precios oficiales de venta y las 5 columnas de inventario vacías.
 */
function dejarTodoListoSinFotos() {
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  const shSalas = ss.getSheetByName('SALAS_MODULARES');
  const shIndiv = ss.getSheetByName('MUEBLES_INDIVIDUALES');

  // Conservar inventario existente (> 0) si el usuario ya escribió piezas en alguna fila
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

  // Leer SALAS_MODULARES con hipervínculos reales y precios de venta oficiales
  const salasMap = {};
  if (shSalas && shSalas.getLastRow() > 1) {
    const sVals = shSalas.getRange(1, 1, shSalas.getLastRow(), 14).getValues();
    const sRich = shSalas.getRange(1, 14, shSalas.getLastRow(), 1).getRichTextValues();
    let curPieces = [];
    for (let r = 1; r < sVals.length; r++) {
      const row = sVals[r];
      const sid = String(row[0] || '').trim();
      if (!sid) continue;
      const sname = scrubPublicText_(String(row[1] || ''));
      const psku = String(row[2] || '').trim().toUpperCase();
      const pname = scrubPublicText_(String(row[3] || ''));
      const qty = Number(row[4] || 0);
      const showFlag = String(row[12] || '').trim();
      const furl = getRichUrl_(sRich[r][0], row[13]);
      if (showFlag.indexOf('SÍ') >= 0 || psku.indexOf('-TOTAL') > 0) {
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
          price: Number(RETAIL_PRICES_BY_SKU_[psku] || 0)
        });
      }
    }
  }

  // Leer MUEBLES_INDIVIDUALES con hipervínculos reales y precios de venta oficiales
  const indivList = [];
  const skuToIndiv = {};
  if (shIndiv && shIndiv.getLastRow() > 1) {
    const iVals = shIndiv.getRange(1, 1, shIndiv.getLastRow(), 14).getValues();
    const iRich = shIndiv.getRange(1, 14, shIndiv.getLastRow(), 1).getRichTextValues();
    for (let r = 1; r < iVals.length; r++) {
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
        price: Number(RETAIL_PRICES_BY_SKU_[sku] || 0),
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

  // 1) 47 muebles activos del catálogo (VISIBLE, 0 fotos)
  adminProds.forEach((ap) => {
    const pid = String(ap.id || '').trim();
    const modelName = scrubPublicText_(String(ap.model_name || ''));
    const prov = String(ap.provider_abbr || ap.provider || 'CREATA').trim();
    const cat = normalizeCategory_(ap.category);
    const skuInternal = String(ap.sku || pid).trim().toUpperCase();
    let driveUrl = String(ap.drive_ficha_url || '').trim();
    const driveIds = [];
    const d0 = extractDriveIdFromUrl_(driveUrl);
    if (d0) driveIds.push(d0);

    skuInternal.split('/').forEach((part) => {
      const sk = part.trim().toUpperCase();
      if (skuToIndiv[sk]) {
        skuToIndiv[sk].forEach((m) => {
          usedIndivRow[m.rowNum] = true;
          if (m.driveId && driveIds.indexOf(m.driveId) < 0) driveIds.push(m.driveId);
        });
      }
    });
    indivList.forEach((m) => {
      if (m.driveId && driveIds.indexOf(m.driveId) >= 0) usedIndivRow[m.rowNum] = true;
    });

    let salaKey = '';
    const upName = modelName.toUpperCase();
    if (upName.indexOf('MATERA') >= 0) salaKey = 'SALA-MATERA';
    else if (upName.indexOf('MARENO') >= 0 && upName.indexOf('LOVE') < 0) salaKey = 'SALA-MARENO';
    else if (upName.indexOf('MONET') >= 0 && upName.indexOf('LOVE') < 0) salaKey = 'SALA-MONET';

    let isMulti = 'NO';
    let summary = '1 pieza';
    let priceCell = parseMoney_(ap.price);

    if (salaKey && salasMap[salaKey]) {
      usedSalas[salaKey] = true;
      const sdata = salasMap[salaKey];
      if (sdata.driveUrl) driveUrl = sdata.driveUrl;
      if (sdata.driveId && driveIds.indexOf(sdata.driveId) < 0) driveIds.push(sdata.driveId);

      let pList = sdata.pieces.map((x) => Object.assign({}, x));
      if (salaKey === 'SALA-MATERA') {
        pList = [
          { sku: 'ARMMAT1PDERSP', name: 'Sillón brazo derecho (Scar Putty)', qty: 1, width: '155', depth: '134', height: '94', price: 35242.96 },
          { sku: 'ARMMAT1PIZQSP', name: 'Sillón brazo izquierdo (Scar Putty)', qty: 1, width: '155', depth: '134', height: '94', price: 35242.95 },
          { sku: 'ARMMATCHDERSP', name: 'Chaise longue derecho (Opción)', qty: 0, width: '139', depth: '182', height: '94', price: Number(RETAIL_PRICES_BY_SKU_.ARMMATCHDERSP || 40396) },
          { sku: 'ARMMATCHIZQSP', name: 'Chaise longue izquierdo (Opción)', qty: 0, width: '139', depth: '182', height: '94', price: Number(RETAIL_PRICES_BY_SKU_.ARMMATCHIZQSP || 40396) }
        ];
      }
      pList.forEach((pz) => {
        const zRowNum = outPieces.length + 2;
        const zInv = prevPieceInv[pid + '|' + pz.sku] || ['', '', '', '', ''];
        outPieces.push([
          pid, modelName, pz.sku, pz.name, pz.qty, pz.width, pz.depth, pz.height, pz.price,
          '=E' + zRowNum + '*I' + zRowNum
        ].concat(zInv));
      });
      isMulti = 'SI';
      summary = pList.filter((x) => x.qty > 0).map((x) => x.qty + 'x ' + x.name).join(' + ');
      priceCell = '=SUMIF(PIEZAS_MODULOS!A:A, A' + (outProds.length + 2) + ', PIEZAS_MODULOS!J:J)';
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

  // 2) Salas modulares restantes -> ARCHIVADO
  Object.keys(salasMap).forEach((sid) => {
    if (usedSalas[sid]) return;
    const sdata = salasMap[sid];
    const pid = sid;
    const pList = sdata.pieces || [];
    pList.forEach((pz) => {
      const zRowNum = outPieces.length + 2;
      const zInv = prevPieceInv[pid + '|' + pz.sku] || ['', '', '', '', ''];
      outPieces.push([
        pid, sdata.name, pz.sku, pz.name, pz.qty, pz.width, pz.depth, pz.height, pz.price,
        '=E' + zRowNum + '*I' + zRowNum
      ].concat(zInv));
    });
    const activeP = pList.filter((x) => x.qty > 0);
    const totalQty = activeP.reduce((acc, x) => acc + (Number(x.qty) || 1), 0) || pList.length;
    const pInv = prevProdInv[pid] || ['', '', '', '', ''];
    outProds.push([
      pid, 'ARCHIVADO', 'ARM', sid + '-SET', sdata.name, 'SALAS & SOFÁS', 'SI',
      activeP.map((x) => x.qty + 'x ' + x.name).join(' + '),
      pList.map((x) => x.width).filter(Boolean).join(' / '),
      (pList[0] && pList[0].depth) || '',
      (pList[0] && pList[0].height) || '',
      '',
      String(totalQty),
      '',
      '=SUMIF(PIEZAS_MODULOS!A:A, A' + (outProds.length + 2) + ', PIEZAS_MODULOS!J:J)',
      sdata.dimsSummary || '',
      sdata.driveUrl || '',
      '', '', '', '[]',
      sdata.driveId || '',
      nowIso
    ].concat(pInv));
  });

  // 3) Muebles individuales restantes -> ARCHIVADO
  indivList.forEach((it) => {
    if (usedIndivRow[it.rowNum]) return;
    const pid = 'IND-' + it.sku;
    const pInv = prevProdInv[pid] || ['', '', '', '', ''];
    outProds.push([
      pid, 'ARCHIVADO', it.provider, it.sku, it.name, it.category, 'NO', '1 pieza',
      it.width, it.depth, it.height, it.seat, it.packages, it.volume,
      it.price, it.materials, it.driveUrl,
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

  // Asegurar activación automática cada 10 min para nuevas fichas de Drive
  try {
    const existing = ScriptApp.getProjectTriggers();
    const hasTrigger = existing.some((t) => t.getHandlerFunction() === 'syncDriveFolderToSheet');
    if (!hasTrigger) {
      ScriptApp.newTrigger('syncDriveFolderToSheet').timeBased().everyMinutes(10).create();
    }
  } catch (e) {}

  publishWebAppUrlToConfigSheet_(ss);

  try {
    SpreadsheetApp.getUi().alert(
      '¡Todo listo!\n\n' +
      '• Muebles cargados en CATALOGO_PRODUCTOS: ' + outProds.length + ' (47 VISIBLES + ' + (outProds.length - 47) + ' ARCHIVADOS, 0 fotos)\n' +
      '• Piezas modulares en PIEZAS_MODULOS: ' + outPieces.length + '\n' +
      '• Columnas de inventario vacías creadas: CEDIS, CASA CREATA, COLOSIO, PLAYA y PUERTO CANCUN (se colorean en verde únicamente cuando hay piezas > 0).'
    );
  } catch (e) {}

  return { ok: true, products: outProds.length, pieces: outPieces.length };
}