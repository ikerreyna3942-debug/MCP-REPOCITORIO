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
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · sincronizarInventarioEnVivoDesdeERP',
        evento: 'LECTURA LPPT PROVEEDORES CON INCIDENCIA',
        estado: '❌ ERROR',
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
