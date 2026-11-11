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
 *    - Ejecuta "1. Inicializar Hojas"
 *    - Ejecuta "3. Activar Sincronización Automática (cada 10 min)"
 * 5. En Apps Script -> Implementar -> Nueva implementación -> Aplicación web:
 *    - Ejecutar como: "Yo"
 *    - Quién tiene acceso: "Cualquier usuario"
 *    Copia la URL .../exec y pégala en el botón "Conectar Sheets" dentro de admin.html.
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
  TAB_PIECES: 'PIEZAS_MODULOS'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CREATA Catálogo')
    .addItem('1. Inicializar / Verificar Hojas', 'setupSheetsStructure')
    .addItem('2. Sincronizar Fichas desde Drive ahora', 'syncDriveFolderToSheet')
    .addItem('3. Activar Sincronización Automática (cada 10 min)', 'installSyncTrigger')
    .addToUi();
}

function getProp_(key) {
  return (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

/**
 * Crea las pestañas CATALOGO_PRODUCTOS y PIEZAS_MODULOS con formato y fórmulas vivas
 */
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
  ];

  let shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  if (!shProd) {
    shProd = ss.insertSheet(CONFIG.TAB_PRODUCTS);
  }
  if (shProd.getLastRow() === 0) {
    shProd.appendRow(prodHeaders);
    shProd.getRange(1, 1, 1, prodHeaders.length)
      .setFontWeight('bold')
      .setBackground('#1F2429')
      .setFontColor('#FFFFFF');
    shProd.setFrozenRows(1);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['ARCHIVADO', 'VISIBLE'], true)
      .build();
    shProd.getRange('B2:B500').setDataValidation(rule);
  }

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
  ];

  let shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  if (!shPiece) {
    shPiece = ss.insertSheet(CONFIG.TAB_PIECES);
  }
  if (shPiece.getLastRow() === 0) {
    shPiece.appendRow(pieceHeaders);
    shPiece.getRange(1, 1, 1, pieceHeaders.length)
      .setFontWeight('bold')
      .setBackground('#B8893E')
      .setFontColor('#FFFFFF');
    shPiece.setFrozenRows(1);
  }

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
  const knownFileIds = new Set();
  for (let i = 1; i < existingRows.length; i++) {
    const fId = String(existingRows[i][21] || '').trim();
    if (fId) knownFileIds.add(fId);
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
          '=E' + pieceRowNum + '*I' + pieceRowNum
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
      new Date().toISOString()
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
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const pRows = shProd.getDataRange().getValues();
  const zRows = shPiece.getDataRange().getValues();

  const piecesByParent = {};
  for (let i = 1; i < zRows.length; i++) {
    const r = zRows[i];
    const parentId = String(r[0] || '').trim();
    if (!parentId) continue;
    if (!piecesByParent[parentId]) piecesByParent[parentId] = [];
    const pObj = {
      name: String(r[3] || ''),
      qty: Number(r[4] || 1),
      width: String(r[5] || ''),
      depth: String(r[6] || ''),
      height: String(r[7] || ''),
      price: Number(r[8] || 0),
      checked: true
    };
    if (includePrivate) {
      pObj.sku = String(r[2] || '');
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
          if (!rows[i][17]) sh.getRange(rowNum, 18).setValue(publicUrl);
        } else if (slot === 'finish') {
          sh.getRange(rowNum, 20).setValue(publicUrl);
          if (!rows[i][17]) sh.getRange(rowNum, 18).setValue(publicUrl);
        } else if (slot.startsWith('view')) {
          const idx = parseInt(slot.replace('view', ''), 10) - 1;
          let views = [];
          try { views = JSON.parse(String(rows[i][20] || '[]')); } catch (e) { views = []; }
          if (!Array.isArray(views)) views = [];
          views[idx] = publicUrl;
          sh.getRange(rowNum, 21).setValue(JSON.stringify(views));
          if (!rows[i][17]) sh.getRange(rowNum, 18).setValue(publicUrl);
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
  const mods = Array.isArray(p.sala_modules) ? p.sala_modules.filter((m) => m.checked !== false) : [];
  const isMulti = mods.length > 1;

  // Actualizar piezas hijas en PIEZAS_MODULOS
  const zRows = shPiece.getDataRange().getValues();
  for (let r = zRows.length; r >= 2; r--) {
    if (String(zRows[r - 1][0] || '').trim() === p.id) {
      shPiece.deleteRow(r);
    }
  }
  if (isMulti) {
    mods.forEach((m, idx) => {
      const pieceRowNum = shPiece.getLastRow() + 1;
      shPiece.appendRow([
        p.id,
        p.model_name || '',
        m.sku || ((p.sku || p.id) + '-P' + (idx + 1)),
        m.name || ('Pieza ' + (idx + 1)),
        Number(m.qty || 1),
        String(m.width || ''),
        String(m.depth || ''),
        String(m.height || ''),
        Number(m.price || 0),
        '=E' + pieceRowNum + '*I' + pieceRowNum
      ]);
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
  if (targetRow === -1) {
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
    isMulti ? (mods.length + ' piezas') : '',
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

  shProd.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
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
