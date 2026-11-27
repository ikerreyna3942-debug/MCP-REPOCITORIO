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
