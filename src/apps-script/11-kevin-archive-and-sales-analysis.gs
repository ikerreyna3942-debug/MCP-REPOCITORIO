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

