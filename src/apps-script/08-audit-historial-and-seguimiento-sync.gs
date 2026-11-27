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
