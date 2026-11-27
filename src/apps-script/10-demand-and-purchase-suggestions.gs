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
