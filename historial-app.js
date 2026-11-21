/*
 * CREATA Muebles — Módulo In-App Unificado de Historial (historial-app.js)
 * Expone exclusivamente window.CreataHistorialModule = { mount, unmount, saveCheckpoint, refresh, isMounted }.
 */
(function (global) {
  'use strict';

  const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
  const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const SEG_SHEET_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';
  const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

  const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
  const SEG_CLOSURES_CACHE_KEY = 'creata_seg_closures_v1';
  const SEG_AUDIT_CACHE_KEY = 'creata_seg_audit_v1';
  const HIST_CHECKPOINT_KEY = 'creata_hist_checkpoint_v1';

  const AUTO_REFRESH_MS = 45000;

  let mounted = false;
  let rootEl = null;
  let mountOpts = {};
  let _histCheckpointRestoredOnce = false;
  let _histRestoringCheckpoint = false;
  let _histSyncSeq = 0;

  let refreshTimer = null;
  let scrollTimer = null;
  let searchDebounceTimer = null;
  let toastTimer = null;
  let boundHandlers = null;

  let activeInspectedQuote = null;
  let activeInspectedPhoto = null;
  let historyPdfDownloadInFlight = false;
  let tabHistory = [];
  let _histPrevSearchNonEmpty = false;

  function notifyHistBackStatePush(reason) {
    try {
      if (mountOpts && typeof mountOpts.onBackStatePush === 'function') {
        mountOpts.onBackStatePush(reason || 'hist_state');
      }
    } catch (e) {}
  }

  const state = {
    session: null,
    role: 'advisor', // 'admin' | 'manager' | 'advisor'
    allowedTabs: ['quotes', 'seguimiento'],
    activeTab: 'quotes',
    searchQuery: '',
    historialClassFilter: 'ALL',
    historialBranchFilter: 'ALL',
    quotesStoreFilter: 'ALL',
    quotesStatusFilter: 'ALL',
    segKindFilter: 'ALL',
    segStatusFilter: 'ALL',
    presenceFilter: 'ALL',
    syncInFlight: false,
    lastSyncLabel: '',
    erpLiveCellText: '',
    historialRows: [],
    quoteRows: [],
    seguimientoEntries: [],
    photoRows: [],
    presenceUsers: [],
    presenceGuests: [],
    presenceOnlineCount: 0,
    presenceOfflineCount: 0,
    presenceGuestOnlineCount: 0,
    presenceGuestOfflineCount: 0,
    presenceServerTimeMs: 0,
    presenceError: ''
  };

  // ============================================================================
  // UTILIDADES GENERALES Y SELECTOR AISLADO
  // ============================================================================
  function $(id) {
    return rootEl ? rootEl.querySelector('#' + id) : null;
  }

  function cleanStr(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeEmail(raw) {
    return cleanStr(raw).toLowerCase().replace(/,/g, '.');
  }

  function normalizeSearchText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeUpper(str) {
    return cleanStr(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonicalBranchKey(raw) {
    const u = normalizeUpper(raw);
    if (!u) return '';
    if (u.includes('ADMINISTRATIV') || u === 'TODAS' || u === 'ADMIN') return 'TODAS';
    if (u.includes('OUTLET')) return 'OUTLET COLOSIO';
    if (u.includes('COLOSIO') || u.includes('COLOCIO') || u === 'DTC') return 'COLOSIO';
    if (u.includes('PLAYA') || u === 'PL') return 'PLAYA';
    if (u.includes('PTC') || u.includes('PUERTO')) return 'PUERTO CANCUN';
    if (u.includes('CASA') || u === 'CCB') return 'CASA CREATA';
    if (u.includes('PROYECTO') || u === 'PRO') return 'PROYECTOS';
    return u;
  }

  function branchesMatch(a, b) {
    const ca = canonicalBranchKey(a);
    const cb = canonicalBranchKey(b);
    if (!ca || !cb) return false;
    if (ca === 'TODAS' || cb === 'TODAS') return true;
    if (ca === cb) return true;
    if ((ca === 'COLOSIO' && cb === 'OUTLET COLOSIO') || (ca === 'OUTLET COLOSIO' && cb === 'COLOSIO')) return true;
    return false;
  }

  function parseMoneyMXN(val) {
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    const cleaned = String(val || '').replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  function formatMoneyMXN(num) {
    const val = isFinite(num) ? Number(num) : 0;
    return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseMxDateTime(raw) {
    const s = cleanStr(raw);
    if (!s) return 0;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const day = parseInt(m[1], 10);
      const mon = parseInt(m[2], 10) - 1;
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      const hr = m[4] ? parseInt(m[4], 10) : 0;
      const min = m[5] ? parseInt(m[5], 10) : 0;
      const sec = m[6] ? parseInt(m[6], 10) : 0;
      const ts = new Date(yr, mon, day, hr, min, sec).getTime();
      if (!isNaN(ts)) return ts;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const ts = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10)).getTime();
      if (!isNaN(ts)) return ts;
    }
    const fallback = Date.parse(s);
    return isNaN(fallback) ? 0 : fallback;
  }

  function resolveDrivePhotoPreview(directUrl, driveLink) {
    const cand = cleanStr(directUrl) || cleanStr(driveLink);
    if (!cand) return '';
    const idMatch = cand.match(/\/d\/([a-zA-Z0-9_-]{18,})/) || cand.match(/[?&]id=([a-zA-Z0-9_-]{18,})/);
    if (idMatch && idMatch[1]) {
      return 'https://lh3.googleusercontent.com/d/' + idMatch[1] + '=w900';
    }
    if (/^https?:\/\//i.test(cand)) return cand;
    return '';
  }

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJsonStorage(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  // Formal PDF filename (#3): CREATA-muebles-cotización_<FOLIO>_<Cliente>.pdf
  function buildFormalQuotePdfName(folio, clientName) {
    const safeFolio = String(folio || 'SIN-FOLIO')
      .trim()
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'SIN-FOLIO';
    const rawClient = String(clientName || '').trim();
    const isPlaceholder = !rawClient || /^(sin\s*nombre|prospecto\s*creata|cliente|n\/a|-+)$/i.test(rawClient);
    if (isPlaceholder) {
      return `CREATA-muebles-cotización_${safeFolio}.pdf`;
    }
    const safeClient = rawClient
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    return safeClient
      ? `CREATA-muebles-cotización_${safeFolio}_${safeClient}.pdf`
      : `CREATA-muebles-cotización_${safeFolio}.pdf`;
  }

  function applySilentImageProtection(target) {
    try {
      if (global.CreataGuard && typeof global.CreataGuard.protectImages === 'function' && target) {
        global.CreataGuard.protectImages(target);
      }
    } catch (e) {}
  }

  // ============================================================================
  // ADOPCIÓN DE SESIÓN Y ALCANCE POR ROL (ADMIN / GERENTE / ASESOR / GUEST)
  // ============================================================================
  function isGuestSession(s) {
    if (!s || typeof s !== 'object') return true;
    if (s.isGuest || s.soloLectura || s.viewOnly) return true;
    const tab = cleanStr(s.sheetTab || s.branchKey || s.sucursal).toUpperCase();
    if (tab === 'INVITADOS' || tab === 'SOLO LECTURA') return true;
    return !normalizeEmail(s.correo);
  }

  function adoptSessionSync(rawSession) {
    const s = (rawSession && typeof rawSession === 'object')
      ? rawSession
      : readJsonStorage(INV_SESSION_KEY, null);
    if (!s || isGuestSession(s)) return null;

    const correo = normalizeEmail(s.correo);
    const puesto = cleanStr(s.puesto);
    const forcedPreview = Boolean(s.forceAdvisorPreview === true);
    const isAdmin = Boolean(!forcedPreview && (correo === OWNER_EMAIL || s.isAdmin === true || s.is_master === true || s.es_admin === true));
    const isManager = Boolean(!isAdmin && !forcedPreview && (s.isManager === true || s.es_gerente === true || /GERENTE|COORDINADOR|ENCARGAD|DIRECT/i.test(puesto)));

    const branches = [];
    const primaryB = canonicalBranchKey(s.sheetTab || s.erpStore || s.branchKey || s.sucursal);
    if (primaryB && primaryB !== 'TODAS') branches.push(primaryB);
    if (Array.isArray(s.allLocations)) {
      s.allLocations.forEach(loc => {
        const b = canonicalBranchKey((loc && (loc.sheetTab || loc.erpStore)) || '');
        if (b && b !== 'TODAS' && !branches.includes(b)) branches.push(b);
      });
    }
    if (Array.isArray(s.all_branches)) {
      s.all_branches.forEach(loc => {
        const b = canonicalBranchKey(loc);
        if (b && b !== 'TODAS' && !branches.includes(b)) branches.push(b);
      });
    }

    return {
      correo,
      nombre: cleanStr(s.nombre) || correo,
      puesto,
      sheetTab: cleanStr(s.sheetTab || s.sheet_tab) || primaryB || 'PROYECTOS',
      erpStore: cleanStr(s.erpStore || s.branchLabel || s.sheetTab || primaryB || ''),
      branchLabel: cleanStr(s.branchLabel || s.sucursal_label) || primaryB || 'Todas',
      branches,
      authToken: cleanStr(s.authToken || ''),
      accessKey: cleanStr(s.accessKey || ''),
      isAdmin,
      isManager,
      adminPermissions: (s.adminPermissions && typeof s.adminPermissions === 'object') ? s.adminPermissions : null,
      role: isAdmin ? 'admin' : (isManager ? 'manager' : 'advisor')
    };
  }

  function isRecordInRoleScope(rec) {
    const sess = state.session;
    if (!sess) return false;
    if (sess.isAdmin) return true;

    const recEmail = normalizeEmail(rec.correoAsesor || rec.email || '');
    const recName = normalizeUpper(rec.nombreAsesor || rec.asesor || rec.usuario || '');
    const recBranch = rec.tiendaErp || rec.hojaUbicacion || rec.sucursal || '';

    if (sess.isManager) {
      if (!sess.branches.length) return true;
      return sess.branches.some(b => branchesMatch(b, recBranch));
    }

    // Advisor: strict email match when both emails exist; otherwise exact full name or >=2 whole-token match
    const myEmail = normalizeEmail(sess.correo);
    if (recEmail && myEmail) {
      return recEmail === myEmail;
    }
    const myName = normalizeUpper(sess.nombre);
    if (!myName || !recName) return false;
    if (myName === recName) return true;
    const myTokens = myName.split(' ').filter(Boolean);
    const recTokens = recName.split(' ').filter(Boolean);
    if (myTokens.length >= 2 && recTokens.length >= 2) {
      const shorter = myTokens.length <= recTokens.length ? myTokens : recTokens;
      const longerSet = new Set(myTokens.length <= recTokens.length ? recTokens : myTokens);
      if (shorter.length >= 2 && shorter.every(t => longerSet.has(t))) return true;
    }
    return false;
  }

  // ============================================================================
  // LECTORES DE GOOGLE SHEETS (PARAMETRIZADOS POR sheetIdOpt) + WEBAPP POST
  // ============================================================================
  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;
    const len = text.length;
    for (let i = 0; i < len; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < len && text[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else if (ch === '\n') {
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
  }

  function fetchSheetViaJsonp(sheetName, rangeStr, sheetIdOpt) {
    const targetSheetId = sheetIdOpt || SHEET_ID;
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || !document.head) {
        resolve(null);
        return;
      }
      const cbName = '__creataHistGviz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      let scriptEl = null;
      let settled = false;

      const cleanup = () => {
        global[cbName] = function () {};
        setTimeout(() => {
          try { delete global[cbName]; } catch (e) { global[cbName] = undefined; }
        }, 60000);
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 11000);

      global[cbName] = function (resp) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        try {
          if (!resp || !resp.table || !Array.isArray(resp.table.rows)) {
            resolve(null);
            return;
          }
          const colsCount = Array.isArray(resp.table.cols) ? resp.table.cols.length : 0;
          const out = [];
          if (Array.isArray(resp.table.cols)) {
            const hdrLabels = resp.table.cols.map(c => cleanStr(c && c.label));
            if (hdrLabels.some(Boolean)) out.push(hdrLabels);
          }
          resp.table.rows.forEach((rObj) => {
            const cells = (rObj && Array.isArray(rObj.c)) ? rObj.c : [];
            const len = Math.max(colsCount, cells.length);
            const arr = new Array(len);
            for (let i = 0; i < len; i++) {
              const cell = cells[i];
              if (!cell) arr[i] = '';
              else if (cell.f !== undefined && cell.f !== null && String(cell.f) !== '') arr[i] = String(cell.f);
              else if (cell.v !== undefined && cell.v !== null) arr[i] = String(cell.v);
              else arr[i] = '';
            }
            out.push(arr);
          });
          resolve(out);
        } catch (err) {
          resolve(null);
        }
      };

      scriptEl = document.createElement('script');
      scriptEl.async = true;
      scriptEl.src = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(targetSheetId) +
        '/gviz/tq?headers=0&sheet=' + encodeURIComponent(sheetName) +
        (rangeStr ? ('&range=' + encodeURIComponent(rangeStr)) : '') +
        '&tqx=responseHandler:' + cbName + '&_t=' + Date.now();
      scriptEl.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(null);
      };
      document.head.appendChild(scriptEl);
    });
  }

  async function fetchSheetRows(sheetName, rangeStr, sheetIdOpt) {
    const targetSheetId = sheetIdOpt || SHEET_ID;
    const csvUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(targetSheetId) +
      '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName) +
      (rangeStr ? ('&range=' + encodeURIComponent(rangeStr)) : '') +
      '&_t=' + Date.now();
    try {
      const resp = await fetch(csvUrl, { cache: 'no-store' });
      if (resp && resp.ok) {
        const txt = await resp.text();
        if (txt && !txt.trim().startsWith('<!DOCTYPE') && !txt.trim().startsWith('<html')) {
          const parsed = parseCsvText(txt);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) {}
    return fetchSheetViaJsonp(sheetName, rangeStr, targetSheetId);
  }

  async function callWebAppGetPresence(targetUrl, payloadObj, timeoutMs) {
    const p = payloadObj || {};
    const qs = new URLSearchParams();
    qs.set('action', 'inv_presence_list');
    if (cleanStr(p.authToken)) qs.set('authToken', cleanStr(p.authToken));
    if (cleanStr(p.advisorEmail)) qs.set('advisorEmail', cleanStr(p.advisorEmail));
    if (cleanStr(p.sheetTab)) qs.set('sheetTab', cleanStr(p.sheetTab));
    if (cleanStr(p.accessKey)) qs.set('accessKey', cleanStr(p.accessKey));
    const sep = targetUrl.indexOf('?') === -1 ? '?' : '&';
    const fullUrl = targetUrl + sep + qs.toString();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 15000) : null;
    try {
      const resp = await fetch(fullUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!resp || !resp.ok) return { ok: false, unavailable: true };
      return (await resp.json()) || { ok: false, unavailable: true };
    } catch (err) {
      return { ok: false, unavailable: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function callWebAppPost(action, payloadObj, timeoutMs) {
    const cfgUrl = (global.CREATA_CLOUD_CONFIG && typeof global.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
      ? cleanStr(global.CREATA_CLOUD_CONFIG.getApiUrl())
      : '';
    const primaryUrl = cfgUrl || CANONICAL_WEBAPP_URL;

    const postOnce = async (targetUrl) => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 12000) : null;
      try {
        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({}, payloadObj || {}, { action })),
          signal: controller ? controller.signal : undefined
        });
        if (!resp || !resp.ok) return { ok: false, unavailable: true };
        const json = await resp.json();
        if (json && !json.ok && /PIN de administrador|Acci[óo]n no reconocida/i.test(String(json.error || ''))) {
          return { ok: false, needsRedeploy: true, error: json.error };
        }
        return json || { ok: false, unavailable: true };
      } catch (err) {
        return { ok: false, unavailable: true };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let res = await postOnce(primaryUrl);
    if (
      CANONICAL_WEBAPP_URL &&
      primaryUrl !== CANONICAL_WEBAPP_URL &&
      (!res || res.unavailable || res.needsRedeploy)
    ) {
      const fallbackRes = await postOnce(CANONICAL_WEBAPP_URL);
      if (fallbackRes && !fallbackRes.unavailable && !fallbackRes.needsRedeploy) {
        if (fallbackRes.ok) {
          try {
            if (global.CREATA_CLOUD_CONFIG && typeof global.CREATA_CLOUD_CONFIG.setApiUrl === 'function') {
              global.CREATA_CLOUD_CONFIG.setApiUrl('');
            }
          } catch (e) {}
        }
        return fallbackRes;
      }
      res = fallbackRes || res;
    }

    if (action === 'inv_presence_list' && (!res || res.unavailable || res.needsRedeploy)) {
      const getUrl = CANONICAL_WEBAPP_URL || primaryUrl;
      const getRes = await callWebAppGetPresence(getUrl, payloadObj, timeoutMs || 15000);
      if (getRes && !getRes.unavailable) {
        if (getRes.ok && primaryUrl !== CANONICAL_WEBAPP_URL) {
          try {
            if (global.CREATA_CLOUD_CONFIG && typeof global.CREATA_CLOUD_CONFIG.setApiUrl === 'function') {
              global.CREATA_CLOUD_CONFIG.setApiUrl('');
            }
          } catch (e) {}
        }
        return getRes;
      }
      if (primaryUrl && primaryUrl !== getUrl) {
        const getResPrimary = await callWebAppGetPresence(primaryUrl, payloadObj, timeoutMs || 15000);
        if (getResPrimary && !getResPrimary.unavailable) return getResPrimary;
      }
    }

    return res;
  }

  // ============================================================================
  // PARSERS MULTI-HOJA (COTIZACIONES + SEGUIMIENTO + BITÁCORA + FOTOS)
  // ============================================================================
  function parseHistorialSheetRows(rawRows) {
    if (!Array.isArray(rawRows) || !rawRows.length) return [];
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
      const r = rawRows[i] || [];
      if (/^FECHA/i.test(cleanStr(r[0])) && /CLASIFICACI/i.test(cleanStr(r[1]))) {
        headerIdx = i;
        break;
      }
    }
    const startIdx = headerIdx >= 0 ? headerIdx + 1 : 6;
    const list = [];
    for (let i = startIdx; i < rawRows.length; i++) {
      const r = rawRows[i] || [];
      const fecha = cleanStr(r[0]);
      const clasificacion = cleanStr(r[1]);
      const modulo = cleanStr(r[2]);
      const evento = cleanStr(r[3]);
      const estado = cleanStr(r[4]);
      const usuario = cleanStr(r[5]);
      const sucursal = cleanStr(r[6]);
      const referencia = cleanStr(r[7]);
      const detalle = cleanStr(r[8]);
      const analisis = cleanStr(r[9]);
      if (!fecha && !evento && !detalle) continue;

      const upperClass = clasificacion.toUpperCase();
      let normKind = 'MOVIMIENTO';
      if (/FALLO|ERROR|BUG/.test(upperClass)) normKind = 'FALLO';
      else if (/ALERTA|PREVENTIV/.test(upperClass)) normKind = 'ALERTA';

      list.push({
        idx: i + 1,
        fecha,
        ts: parseMxDateTime(fecha),
        clasificacion: clasificacion || 'MOVIMIENTO',
        normKind,
        modulo,
        evento,
        estado,
        usuario,
        sucursal,
        referencia,
        detalle,
        analisis,
        _search: normalizeSearchText([fecha, clasificacion, modulo, evento, estado, usuario, sucursal, referencia, detalle, analisis].join(' '))
      });
    }
    list.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
    return list;
  }

  function parseQuotesSheetRows(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length < 2) return [];
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      const r = rawRows[i] || [];
      if (/FOLIO_SMUEBLERIA|ORDEN_SUCURSAL|FOLIO/i.test(cleanStr(r[0]) + ' ' + cleanStr(r[1]))) {
        headerIdx = i;
        break;
      }
    }
    const out = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i] || [];
      const ordenSucursal = cleanStr(r[0]);
      const folioErp = (cleanStr(r[1]) || ordenSucursal).toUpperCase();
      const idErp = cleanStr(r[2]);
      const fechaHora = cleanStr(r[3]);
      if (!folioErp && !idErp && !fechaHora) continue;

      const modalidadOrigen = cleanStr(r[4]) || 'SUCURSAL';
      const hojaUbicacion = cleanStr(r[5]);
      const tiendaErp = cleanStr(r[6]) || hojaUbicacion || 'SIN TIENDA';
      const correoAsesor = normalizeEmail(r[7]);
      const nombreAsesor = cleanStr(r[8]) || correoAsesor;
      const usuarioErp = cleanStr(r[9]);
      const idUsuarioErp = cleanStr(r[10]);
      const cliente = cleanStr(r[11]) || 'Sin nombre';
      const telefono = cleanStr(r[12]);
      const modalidadCliente = cleanStr(r[13]);
      const categoriaErp = cleanStr(r[14]);
      const entregaTentativa = cleanStr(r[15]);
      const partidasCant = Math.max(0, parseInt(cleanStr(r[16]), 10) || 0);
      const resumenSkus = cleanStr(r[17]);
      const subtotalNum = parseMoneyMXN(r[18]);
      const ivaNum = parseMoneyMXN(r[19]);
      const descuentoExtraNum = parseMoneyMXN(r[20]);
      const totalNum = parseMoneyMXN(r[21]);
      const rawEstadoErp = cleanStr(r[22]);
      const estadoErp = (!rawEstadoErp || /^EN VIVO EN S\s*MUEBLER[IÍ]A/i.test(rawEstadoErp))
        ? 'Registrada'
        : rawEstadoErp.replace(/EN VIVO (?:EN|A) S\s*MUEBLER[IÍ]A/gi, 'Registrada');
      const notas = cleanStr(r[23]);

      out.push({
        idx: i + 1,
        ordenSucursal,
        folioErp,
        idErp,
        fechaHora,
        ts: parseMxDateTime(fechaHora),
        modalidadOrigen: modalidadOrigen.toUpperCase(),
        hojaUbicacion,
        tiendaErp,
        correoAsesor,
        nombreAsesor,
        usuarioErp,
        idUsuarioErp,
        cliente,
        telefono,
        modalidadCliente,
        categoriaErp,
        entregaTentativa,
        partidasCant,
        resumenSkus,
        subtotalNum,
        ivaNum,
        descuentoExtraNum,
        totalNum,
        estadoErp,
        notas,
        segStatus: 'ABIERTA',
        segMotivo: '',
        segComentarios: '',
        segLastContact: '',
        _search: normalizeSearchText([
          folioErp, idErp, fechaHora, modalidadOrigen, tiendaErp,
          correoAsesor, nombreAsesor, cliente, telefono, resumenSkus, notas
        ].join(' '))
      });
    }
    out.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
    return out;
  }

  function mergeCotizacionesCreataRows(baseQuotes, cotCreataRows) {
    if (!Array.isArray(cotCreataRows) || cotCreataRows.length < 2) return baseQuotes;
    const byFolio = new Map();
    baseQuotes.forEach(q => byFolio.set(q.folioErp, q));

    const groupedExtra = new Map();
    for (let i = 1; i < cotCreataRows.length; i++) {
      const r = cotCreataRows[i] || [];
      if (!r[0] || !r[1]) continue;
      const folio = cleanStr(r[1]).toUpperCase();
      if (!folio || byFolio.has(folio)) continue;

      const fecha = cleanStr(r[2]);
      const sucursal = cleanStr(r[3]) || 'PROYECTOS';
      const asesor = cleanStr(r[4]);
      const correo = normalizeEmail(r[5]);
      const cliente = cleanStr(r[7]) || 'Sin nombre';
      const telefono = cleanStr(r[8]);
      const sku = cleanStr(r[9]).toUpperCase();
      const qty = Math.max(1, parseInt(cleanStr(r[13]), 10) || 1);
      const price = parseMoneyMXN(r[12]);
      const aviso = cleanStr(r[25]);

      if (!groupedExtra.has(folio)) {
        groupedExtra.set(folio, {
          idx: 50000 + i,
          ordenSucursal: folio,
          folioErp: folio,
          idErp: '',
          fechaHora: fecha,
          ts: parseMxDateTime(fecha),
          modalidadOrigen: 'SUCURSAL',
          hojaUbicacion: sucursal,
          tiendaErp: sucursal,
          correoAsesor: correo,
          nombreAsesor: asesor || correo,
          usuarioErp: '',
          idUsuarioErp: '',
          cliente,
          telefono,
          modalidadCliente: '',
          categoriaErp: '',
          entregaTentativa: '',
          partidasCant: 0,
          skus: [],
          subtotalNum: 0,
          ivaNum: 0,
          descuentoExtraNum: 0,
          totalNum: 0,
          estadoErp: 'Cotizada',
          notas: '',
          segStatus: aviso ? 'CONTACTADA' : 'ABIERTA',
          segMotivo: '',
          segComentarios: '',
          segLastContact: aviso
        });
      }
      const g = groupedExtra.get(folio);
      g.partidasCant += 1;
      if (sku) g.skus.push(`${sku} x${qty}`);
      g.totalNum += (price * qty);
      if (!g.segLastContact && aviso) {
        g.segLastContact = aviso;
        if (g.segStatus === 'ABIERTA') g.segStatus = 'CONTACTADA';
      }
    }

    const merged = baseQuotes.slice();
    for (const g of groupedExtra.values()) {
      g.resumenSkus = g.skus.join(', ');
      delete g.skus;
      g._search = normalizeSearchText([
        g.folioErp, g.fechaHora, g.tiendaErp, g.correoAsesor, g.nombreAsesor, g.cliente, g.telefono, g.resumenSkus
      ].join(' '));
      merged.push(g);
    }
    merged.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
    return merged;
  }

  function buildUnifiedSeguimientoData(quotes, cierresRows, histMovRows, histInvRows) {
    const closuresByFolio = Object.assign({}, readJsonStorage(SEG_CLOSURES_CACHE_KEY, {}));
    const lastContactByFolio = {};
    const timeline = [];

    // 1) CIERRES_COTIZACIONES (1_XBm...)
    for (let i = 1; i < (cierresRows || []).length; i++) {
      const r = cierresRows[i] || [];
      if (!r[1]) continue;
      const folio = cleanStr(r[1]).toUpperCase();
      const fecha = cleanStr(r[0]);
      const sucursal = cleanStr(r[2]);
      const asesor = cleanStr(r[3]);
      const correo = normalizeEmail(r[4]);
      const cliente = cleanStr(r[5]);
      const estatus = cleanStr(r[7]).toUpperCase() || 'CERRADA';
      const motivo = cleanStr(r[8]);
      const comentarios = cleanStr(r[9]);

      closuresByFolio[folio] = {
        Fecha_Hora: fecha,
        Folio_ERP: folio,
        Sucursal: sucursal,
        Asesor: asesor,
        Correo_Asesor: correo,
        Cliente: cliente,
        Estatus_Cierre: estatus,
        Motivo_Cierre: motivo,
        Comentarios: comentarios
      };

      timeline.push({
        id: `cie_${i}`,
        kind: 'CIERRE',
        status: estatus,
        folio,
        fecha,
        ts: parseMxDateTime(fecha),
        sucursal,
        asesor,
        correoAsesor: correo,
        cliente,
        accion: `${estatus}${motivo ? ' · ' + motivo : ''}`,
        detalle: comentarios || cleanStr(r[11]),
        _search: normalizeSearchText([folio, fecha, sucursal, asesor, correo, cliente, estatus, motivo, comentarios].join(' '))
      });
    }

    // 2) HISTORIAL_MOVIMIENTOS (1_XBm...)
    for (let i = 1; i < (histMovRows || []).length; i++) {
      const r = histMovRows[i] || [];
      if (!r[0]) continue;
      const tipo = cleanStr(r[1]).toUpperCase();
      if (!['WHATSAPP', 'EMAIL', 'TELEFONO', 'CIERRE'].includes(tipo)) continue;
      const fecha = cleanStr(r[0]);
      const usuario = cleanStr(r[2]);
      const correo = normalizeEmail(r[3]);
      const sucursal = cleanStr(r[4]);
      const accion = cleanStr(r[5]);
      const detalle = cleanStr(r[6]);
      const mFol = (accion + ' ' + detalle).match(/Folio\s+([A-Z0-9\-]+)/i);
      const folio = mFol ? mFol[1].toUpperCase() : '';
      if (tipo === 'WHATSAPP' && folio) {
        lastContactByFolio[folio] = fecha.slice(0, 16);
      }

      timeline.push({
        id: `mov_${i}`,
        kind: tipo,
        status: tipo === 'CIERRE' ? 'CERRADA' : 'CONTACTADA',
        folio,
        fecha,
        ts: parseMxDateTime(fecha),
        sucursal,
        asesor: usuario,
        correoAsesor: correo,
        cliente: '',
        accion,
        detalle,
        _search: normalizeSearchText([folio, fecha, tipo, sucursal, usuario, correo, accion, detalle].join(' '))
      });
    }

    // 3) HISTORIAL (1xew...) SEGUIMIENTO_COTIZACIONES events
    for (let i = 0; i < (histInvRows || []).length; i++) {
      const h = histInvRows[i];
      if (!h || h.modulo !== 'SEGUIMIENTO_COTIZACIONES') continue;
      const ev = cleanStr(h.evento).toUpperCase();
      let payload = null;
      try {
        if (cleanStr(h.detalle).startsWith('{')) payload = JSON.parse(h.detalle);
      } catch (e) {}
      const folio = cleanStr((payload && payload.folio) || h.referencia).toUpperCase();
      const sucursal = cleanStr((payload && payload.sucursal) || h.sucursal);
      const asesor = cleanStr((payload && (payload.asesor || payload.usuario)) || h.usuario);
      const correo = normalizeEmail((payload && (payload.correo_asesor || payload.email)) || '');
      const cliente = cleanStr((payload && payload.cliente) || '');

      if (ev === 'SEG_CIERRE' && folio && payload) {
        const estatus = cleanStr(payload.estatus).toUpperCase() || 'CERRADA';
        closuresByFolio[folio] = {
          Fecha_Hora: payload.fecha_hora || h.fecha,
          Folio_ERP: folio,
          Sucursal: sucursal,
          Asesor: asesor,
          Correo_Asesor: correo,
          Cliente: cliente,
          Estatus_Cierre: estatus,
          Motivo_Cierre: cleanStr(payload.motivo),
          Comentarios: cleanStr(payload.comentarios)
        };
        timeline.push({
          id: `hinv_${i}`,
          kind: 'CIERRE',
          status: estatus,
          folio,
          fecha: payload.fecha_hora || h.fecha,
          ts: parseMxDateTime(payload.fecha_hora || h.fecha),
          sucursal,
          asesor,
          correoAsesor: correo,
          cliente,
          accion: `${estatus}${payload.motivo ? ' · ' + payload.motivo : ''}`,
          detalle: cleanStr(payload.comentarios),
          _search: normalizeSearchText([folio, h.fecha, sucursal, asesor, correo, cliente, estatus, payload.motivo, payload.comentarios].join(' '))
        });
      } else if (ev === 'SEG_WHATSAPP' || ev === 'SEG_EMAIL' || ev === 'SEG_TELEFONO') {
        const kind = ev === 'SEG_WHATSAPP' ? 'WHATSAPP' : (ev === 'SEG_EMAIL' ? 'EMAIL' : 'TELEFONO');
        if (kind === 'WHATSAPP' && folio) {
          lastContactByFolio[folio] = cleanStr((payload && payload.fecha_aviso) || h.fecha).slice(0, 16);
        }
        const detailTxt = payload
          ? cleanStr(payload.phone || payload.whatsapp_cliente || payload.destinatario || '')
          : h.detalle;
        timeline.push({
          id: `hinv_${i}`,
          kind,
          status: 'CONTACTADA',
          folio,
          fecha: h.fecha,
          ts: h.ts || parseMxDateTime(h.fecha),
          sucursal,
          asesor,
          correoAsesor: correo,
          cliente,
          accion: kind === 'WHATSAPP' ? 'WhatsApp enviado' : (kind === 'EMAIL' ? 'Correo enviado' : 'Teléfono actualizado'),
          detalle: detailTxt,
          _search: normalizeSearchText([folio, h.fecha, kind, sucursal, asesor, correo, cliente, detailTxt].join(' '))
        });
      }
    }

    // 4) Merge localStorage seg closures & audit cache
    const localAudits = readJsonStorage(SEG_AUDIT_CACHE_KEY, []);
    if (Array.isArray(localAudits)) {
      localAudits.forEach((la, idx) => {
        if (!la) return;
        const tipo = cleanStr(la.tipo).toUpperCase();
        if (!['WHATSAPP', 'EMAIL', 'TELEFONO', 'CIERRE'].includes(tipo)) return;
        const mFol = (cleanStr(la.accion) + ' ' + cleanStr(la.detalle)).match(/([A-Z]{2,5}-\d+|\bFolio\s+([A-Z0-9\-]+))/i);
        const folio = mFol ? cleanStr(mFol[2] || mFol[1]).toUpperCase() : '';
        timeline.push({
          id: `la_${idx}`,
          kind: tipo,
          status: tipo === 'CIERRE' ? 'CERRADA' : 'CONTACTADA',
          folio,
          fecha: cleanStr(la.fecha_hora),
          ts: parseMxDateTime(la.fecha_hora),
          sucursal: cleanStr(la.sucursal),
          asesor: cleanStr(la.usuario),
          correoAsesor: normalizeEmail(la.email),
          cliente: '',
          accion: cleanStr(la.accion),
          detalle: cleanStr(la.detalle),
          _search: normalizeSearchText([folio, la.fecha_hora, tipo, la.sucursal, la.usuario, la.email, la.accion, la.detalle].join(' '))
        });
      });
    }

    // Attach seguimiento status onto quotes
    quotes.forEach(q => {
      const cie = closuresByFolio[q.folioErp];
      if (cie) {
        q.segStatus = cleanStr(cie.Estatus_Cierre).toUpperCase() || 'CERRADA';
        q.segMotivo = cleanStr(cie.Motivo_Cierre);
        q.segComentarios = cleanStr(cie.Comentarios);
        q.segLastContact = lastContactByFolio[q.folioErp] || q.segLastContact || cleanStr(cie.Fecha_Hora);
      } else if (lastContactByFolio[q.folioErp]) {
        q.segStatus = 'CONTACTADA';
        q.segLastContact = lastContactByFolio[q.folioErp];
      }
      q._search = normalizeSearchText(q._search + ' ' + q.segStatus + ' ' + q.segMotivo);
    });

    // Deduplicate & sort timeline
    const seenKeys = new Set();
    const dedupTimeline = [];
    timeline.sort((a, b) => b.ts - a.ts);
    for (const item of timeline) {
      const k = `${item.kind}|${item.folio}|${item.fecha.slice(0, 16)}|${item.accion}`;
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      dedupTimeline.push(item);
    }

    return dedupTimeline;
  }

  function parsePhotosSheetRows(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length < 2) return [];
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      const r = rawRows[i] || [];
      if (/^SKU/i.test(cleanStr(r[0]))) {
        headerIdx = i;
        break;
      }
    }
    const out = [];
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i] || [];
      const sku = cleanStr(r[0]);
      const nombreProducto = cleanStr(r[1]);
      const directUrl = cleanStr(r[3]) || (cleanStr(r[2]).indexOf('http') === 0 ? cleanStr(r[2]) : '');
      const driveLink = cleanStr(r[4]);
      const quienSubio = cleanStr(r[5]) || 'Usuario';
      const puestoSucursal = cleanStr(r[6]);
      const correoUsuario = cleanStr(r[7]);
      const fechaHora = cleanStr(r[8]);

      if (!sku && !directUrl && !driveLink) continue;
      const previewUrl = resolveDrivePhotoPreview(directUrl, driveLink);

      out.push({
        idx: i + 1,
        sku: sku || 'SIN-SKU',
        nombreProducto: nombreProducto || sku || 'Producto',
        previewUrl,
        quienSubio,
        puestoSucursal,
        correoUsuario,
        fechaHora,
        ts: parseMxDateTime(fechaHora),
        _search: normalizeSearchText([sku, nombreProducto, quienSubio, puestoSucursal, correoUsuario, fechaHora].join(' '))
      });
    }
    out.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
    return out;
  }

  function mergeDrivePhotosFromHistorial(existingPhotos, histRows) {
    const list = Array.isArray(existingPhotos) ? existingPhotos.slice() : [];
    if (!Array.isArray(histRows) || !histRows.length) return list;
    const seenIds = new Set();
    list.forEach(p => {
      const m = String(p.previewUrl || '').match(/\/d\/([a-zA-Z0-9_-]{18,})/);
      if (m) seenIds.add(m[1]);
    });
    for (let i = 0; i < histRows.length; i++) {
      const h = histRows[i];
      if (!h || !/ARCHIVO DE FOTO GUARDADO|FOTOGRAF[ÍI]A CARGADA/i.test(String(h.evento || ''))) continue;
      const idMatch = String(h.detalle || '').match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{18,})/);
      if (!idMatch || seenIds.has(idMatch[1])) continue;
      const fid = idMatch[1];
      seenIds.add(fid);
      const refParts = String(h.referencia || '').split('·').map(s => s.trim()).filter(Boolean);
      const sku = refParts[0] || 'SIN-SKU';
      const nombreProducto = refParts.slice(1).join(' · ') || sku;
      const usrMatch = String(h.usuario || '').match(/^([^(]+)(?:\(([^)]+)\))?/);
      const quienSubio = cleanStr(usrMatch ? usrMatch[1] : h.usuario) || 'Usuario';
      const correoUsuario = cleanStr(usrMatch && usrMatch[2] ? usrMatch[2] : '');

      list.push({
        idx: 10000 + i,
        sku,
        nombreProducto,
        previewUrl: 'https://lh3.googleusercontent.com/d/' + fid + '=w800',
        quienSubio,
        puestoSucursal: h.sucursal || '',
        correoUsuario,
        fechaHora: h.fecha || '',
        ts: h.ts || parseMxDateTime(h.fecha || ''),
        _search: normalizeSearchText([sku, nombreProducto, quienSubio, h.sucursal, correoUsuario, h.fecha].join(' '))
      });
    }
    list.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
    return list;
  }

  const HIST_PRESENCE_DEVICE_KEY = 'creata_inv_presence_dev_v1';
  let _histLastHeartbeatMs = 0;

  function getHistPresenceDeviceId() {
    try {
      let id = localStorage.getItem(HIST_PRESENCE_DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(HIST_PRESENCE_DEVICE_KEY, id);
      }
      return id;
    } catch (e) {
      return 'dev_mem_hist';
    }
  }

  function readStoredAccessKeyFallback(targetEmail) {
    if (!state.session) return '';
    if (cleanStr(state.session.accessKey)) return cleanStr(state.session.accessKey);
    const emailNorm = normalizeEmail(targetEmail || state.session.correo);
    if (!emailNorm) return '';
    const candidateKeys = [
      INV_SESSION_KEY,
      'creata_private_kevin_panel_v1',
      'creata_private_kevin_fotos_v1',
      'creata_private_kevin_hist_v1'
    ];
    for (let i = 0; i < candidateKeys.length; i++) {
      const obj = readJsonStorage(candidateKeys[i], null);
      if (obj && normalizeEmail(obj.correo) === emailNorm && cleanStr(obj.accessKey)) {
        return cleanStr(obj.accessKey);
      }
    }
    try {
      const pendingMap = readJsonStorage('creata_inv_updated_keys_v1', null);
      if (pendingMap && pendingMap[emailNorm] && cleanStr(pendingMap[emailNorm].newKey)) {
        return cleanStr(pendingMap[emailNorm].newKey);
      }
    } catch (e) {}
    if (emailNorm === 'kevin.reyna@grupoanipa.com') {
      try {
        if (typeof sessionStorage !== 'undefined') {
          const sec = cleanStr(sessionStorage.getItem('creata_private_kevin_fotos_sec_v1'));
          if (sec) return sec;
        }
        const secLocal = cleanStr(localStorage.getItem('creata_private_kevin_fotos_sec_v1'));
        if (secLocal) return secLocal;
      } catch (e) {}
    }
    return '';
  }

  function persistRenewedAuthToken(newToken) {
    const tok = cleanStr(newToken);
    if (!tok || !state.session) return;
    state.session.authToken = tok;
    const targetEmail = normalizeEmail(state.session.correo);
    if (!targetEmail) return;
    const candidateKeys = [
      INV_SESSION_KEY,
      'creata_private_kevin_panel_v1',
      'creata_private_kevin_fotos_v1',
      'creata_private_kevin_hist_v1'
    ];
    for (let i = 0; i < candidateKeys.length; i++) {
      const obj = readJsonStorage(candidateKeys[i], null);
      if (obj && normalizeEmail(obj.correo) === targetEmail) {
        obj.authToken = tok;
        writeJsonStorage(candidateKeys[i], obj);
      }
    }
  }

  function tryRecoverSessionAuthToken() {
    if (!state.session) return '';
    if (cleanStr(state.session.authToken)) return cleanStr(state.session.authToken);
    const targetEmail = normalizeEmail(state.session.correo);
    if (!targetEmail) return '';
    const candidateKeys = [
      INV_SESSION_KEY,
      'creata_private_kevin_panel_v1',
      'creata_private_kevin_fotos_v1',
      'creata_private_kevin_hist_v1'
    ];
    for (let i = 0; i < candidateKeys.length; i++) {
      const obj = readJsonStorage(candidateKeys[i], null);
      if (obj && normalizeEmail(obj.correo) === targetEmail && cleanStr(obj.authToken)) {
        state.session.authToken = cleanStr(obj.authToken);
        return state.session.authToken;
      }
    }
    return '';
  }

  async function renewSessionAuthToken(forceMint) {
    if (!state.session) return '';
    const currentTok = cleanStr(state.session.authToken);
    if (!forceMint) {
      const recovered = tryRecoverSessionAuthToken();
      if (recovered) return recovered;
    } else {
      const targetEmail = normalizeEmail(state.session.correo);
      const candidateKeys = [
        INV_SESSION_KEY,
        'creata_private_kevin_panel_v1',
        'creata_private_kevin_fotos_v1',
        'creata_private_kevin_hist_v1'
      ];
      for (let i = 0; i < candidateKeys.length; i++) {
        const obj = readJsonStorage(candidateKeys[i], null);
        const storedTok = obj && normalizeEmail(obj.correo) === targetEmail ? cleanStr(obj.authToken) : '';
        if (storedTok && storedTok !== currentTok) {
          persistRenewedAuthToken(storedTok);
          return storedTok;
        }
      }
    }
    const key = readStoredAccessKeyFallback(state.session.correo);
    if (!key || !cleanStr(state.session.correo)) return '';
    try {
      const loginRes = await callWebAppPost('inv_login', {
        email: state.session.correo,
        accessKey: key,
        sheetTab: state.session.sheetTab || ''
      }, 15000);
      const minted = cleanStr(
        (loginRes && (loginRes.authToken || (loginRes.user && loginRes.user.authToken))) || ''
      );
      if (minted) {
        persistRenewedAuthToken(minted);
        return minted;
      }
    } catch (eMint) {}
    return '';
  }

  async function sendHistPresenceHeartbeat(forceNow, _isRetry) {
    if (!mounted || !state.session || !cleanStr(state.session.correo)) return;
    if (global.CreataGuard && (global.CreataGuard.blocked || global.CreataGuard.isBlocked)) return;
    const now = Date.now();
    if (!forceNow && (now - _histLastHeartbeatMs) < 45000) return;
    if (!forceNow && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    let token = tryRecoverSessionAuthToken();
    const fallbackKey = readStoredAccessKeyFallback(state.session.correo);
    if (!token && fallbackKey) {
      token = await renewSessionAuthToken(false);
    }
    if (!token && !fallbackKey) return;

    _histLastHeartbeatMs = now;
    const payload = {
      authToken: token,
      advisorEmail: state.session.correo,
      correo: state.session.correo,
      nombre: state.session.nombre || state.session.correo,
      puesto: state.session.puesto || '',
      sheetTab: state.session.sheetTab || '',
      erpStore: state.session.erpStore || '',
      deviceId: getHistPresenceDeviceId(),
      vista: 'historial',
      view: 'historial',
      page: 'historial'
    };
    if (!token && fallbackKey) payload.accessKey = fallbackKey;

    try {
      const hbRes = await callWebAppPost('inv_presence_heartbeat', payload, 8000);
      if (hbRes && hbRes.renewedAuthToken) {
        persistRenewedAuthToken(hbRes.renewedAuthToken);
      }
      if (!_isRetry && hbRes && !hbRes.ok && !hbRes.unavailable && (hbRes.authRequired || !hbRes.error)) {
        const fresh = await renewSessionAuthToken(true);
        if (fresh) {
          _histLastHeartbeatMs = 0;
          sendHistPresenceHeartbeat(true, true);
        }
      }
    } catch (e) {}
  }

  async function fetchPresenceList() {
    if (!state.session) return { ok: false, reason: 'no_token' };
    let token = tryRecoverSessionAuthToken();
    const fallbackKey = readStoredAccessKeyFallback(state.session.correo);
    if (!token) {
      token = await renewSessionAuthToken(false);
    }
    if (!token && !fallbackKey) return { ok: false, reason: 'no_token' };

    const buildPayload = (tok, includeKey) => {
      const p = {
        authToken: tok || '',
        advisorEmail: state.session.correo,
        sheetTab: state.session.sheetTab || ''
      };
      if (includeKey && fallbackKey) p.accessKey = fallbackKey;
      return p;
    };

    try {
      let res = await callWebAppPost('inv_presence_list', buildPayload(token, !token), 18000);
      if (res && res.renewedAuthToken) {
        persistRenewedAuthToken(res.renewedAuthToken);
      }
      if (!res || res.unavailable) {
        res = await callWebAppPost('inv_presence_list', buildPayload(token, !token), 18000);
        if (res && res.renewedAuthToken) {
          persistRenewedAuthToken(res.renewedAuthToken);
        }
      }
      if (res && !res.ok && !res.unavailable && !res.forbidden) {
        const renewed = await renewSessionAuthToken(true);
        if (renewed || fallbackKey) {
          res = await callWebAppPost('inv_presence_list', buildPayload(renewed || token, true), 18000);
          if (res && res.renewedAuthToken) {
            persistRenewedAuthToken(res.renewedAuthToken);
          }
        }
      }
      if (res && res.ok && Array.isArray(res.users)) {
        return res;
      }
      if (res && res.unavailable) {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: false, reason: 'auth_failed' };
    } catch (e) {
      return { ok: false, reason: 'unavailable' };
    }
  }

  function isPresenceUserInRoleScope(rawUser) {
    const sess = state.session;
    if (!sess || !rawUser || typeof rawUser !== 'object') return false;
    if (sess.isAdmin) return true;
    const rawSuc = cleanStr(rawUser.sucursal || '');
    const rawEmail = normalizeEmail(rawUser.correo || '');
    if (sess.isManager) {
      if (!sess.branches.length) return true;
      return sess.branches.some(b => branchesMatch(b, rawSuc));
    }
    // Advisor: own record or own canonical branch only (no cross-branch leak)
    if (rawEmail && sess.correo && rawEmail === sess.correo) return true;
    if (sess.branches.length > 0 && rawSuc) {
      return sess.branches.some(b => branchesMatch(b, rawSuc));
    }
    return false;
  }

  function ingestPresencePayload(res) {
    if (!res || !res.ok || !Array.isArray(res.users)) {
      const reason = cleanStr(res && res.reason) || 'unavailable';
      state.presenceError = reason;
      if (state.presenceUsers && state.presenceUsers.length > 0 && reason === 'unavailable') {
        return;
      }
      state.presenceUsers = [];
      state.presenceOnlineCount = 0;
      state.presenceOfflineCount = 0;
      state.presenceServerTimeMs = 0;
      return;
    }
    state.presenceError = '';

    const serverNow = Number(res.serverTimeMs) > 0 ? Number(res.serverTimeMs) : Date.now();
    const thresholdMs = Number(res.thresholdMs) > 0 ? Number(res.thresholdMs) : 180000;
    const sanitized = [];

    for (let i = 0; i < res.users.length; i++) {
      const raw = res.users[i];
      if (!raw || typeof raw !== 'object') continue;
      if (!isPresenceUserInRoleScope(raw)) continue;

      const nombre = cleanStr(raw.nombre) || 'Usuario';
      const sucursal = cleanStr(raw.sucursal);
      const rol = cleanStr(raw.rol);
      const vista = cleanStr(raw.vista);
      const lastSeenMs = Number(raw.lastSeenMs) > 0 ? Number(raw.lastSeenMs) : 0;
      const online = typeof raw.online === 'boolean'
        ? raw.online
        : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);

      // Strictly sanitized object — ZERO passwords, keys, tokens, or sensitive credentials (#15)
      sanitized.push({
        nombre,
        sucursal,
        rol,
        vista,
        online,
        lastSeenMs,
        _search: normalizeSearchText([nombre, sucursal, rol, vista].join(' '))
      });
    }

    sanitized.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (b.lastSeenMs !== a.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    const onlineCount = sanitized.filter(u => u.online).length;
    state.presenceUsers = sanitized;
    state.presenceOnlineCount = onlineCount;
    state.presenceOfflineCount = sanitized.length - onlineCount;

    const sanitizedGuests = [];
    const rawGuests = Array.isArray(res.guests) ? res.guests : [];
    const canSeeGuests = Boolean(state.session && (state.session.isAdmin || state.session.isManager));
    if (canSeeGuests) {
      for (let i = 0; i < rawGuests.length; i++) {
        const g = rawGuests[i];
        if (!g || typeof g !== 'object') continue;
        const nombre = cleanStr(g.nombre) || 'Invitado';
        const rol = cleanStr(g.rol) || 'INVITADO (SOLO VER)';
        const vista = cleanStr(g.vista);
        const deviceLabel = cleanStr(g.deviceLabel);
        const slotLabel = cleanStr(g.slotLabel) || (
          (typeof g.activePlaces === 'number' && Number(g.maxPlaces) > 0)
            ? `${g.activePlaces} / ${g.maxPlaces}`
            : ''
        );
        const lastSeenMs = Number(g.lastSeenMs) > 0 ? Number(g.lastSeenMs) : 0;
        const online = typeof g.online === 'boolean'
          ? g.online
          : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);
        sanitizedGuests.push({
          nombre,
          sucursal: 'INVITADOS (SOLO VER)',
          rol,
          vista,
          deviceLabel,
          slotLabel,
          isGuest: true,
          online,
          lastSeenMs,
          _search: normalizeSearchText([nombre, 'invitado', rol, vista, deviceLabel, slotLabel].join(' '))
        });
      }
      sanitizedGuests.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        if (b.lastSeenMs !== a.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
        return a.nombre.localeCompare(b.nombre, 'es');
      });
    }
    const guestOnlineCount = sanitizedGuests.filter(g => g.online).length;
    state.presenceGuests = sanitizedGuests;
    state.presenceGuestOnlineCount = guestOnlineCount;
    state.presenceGuestOfflineCount = sanitizedGuests.length - guestOnlineCount;
    state.presenceServerTimeMs = serverNow;
  }

  function formatPresenceLastSeen(lastSeenMs, online) {
    if (!lastSeenMs || !isFinite(lastSeenMs) || lastSeenMs <= 0) return 'Sin registro';
    const refNow = state.presenceServerTimeMs > 0 ? state.presenceServerTimeMs : Date.now();
    const diffMs = Math.max(0, refNow - lastSeenMs);
    if (online && diffMs < 60000) return 'Ahora';
    if (diffMs < 60000) return 'Hace 1 min';
    if (diffMs < 3600000) return `Hace ${Math.max(1, Math.floor(diffMs / 60000))} min`;
    const dt = new Date(lastSeenMs);
    const nowDt = new Date(refNow);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    if (dt.getFullYear() === nowDt.getFullYear() && dt.getMonth() === nowDt.getMonth() && dt.getDate() === nowDt.getDate()) {
      return `${hh}:${mm}`;
    }
    const dd = String(dt.getDate()).padStart(2, '0');
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mo} ${hh}:${mm}`;
  }

  // ============================================================================
  // SINCRONIZACIÓN EN VIVO
  // ============================================================================
  async function syncAllProjectHistory(silent) {
    if (!mounted || !state.session || state.syncInFlight) return;
    state.syncInFlight = true;
    const seq = ++_histSyncSeq;

    const refreshBtn = $('hist_btnRefreshLive');
    const syncIcon = $('hist_syncIcon');
    if (!silent && refreshBtn) refreshBtn.disabled = true;
    if (syncIcon) syncIcon.classList.add('cm-spin');

    try {
      const isAdmin = state.session.isAdmin;
      const jobs = [
        fetchSheetRows('COTIZACIONES_EN_VIVO', 'A1:Z1500', SHEET_ID),
        isAdmin ? fetchSheetRows('HISTORIAL', 'A1:J600', SHEET_ID) : Promise.resolve(null),
        fetchSheetRows('CIERRES_COTIZACIONES', 'A1:L1000', SEG_SHEET_ID),
        fetchSheetRows('HISTORIAL_MOVIMIENTOS', 'A1:I1000', SEG_SHEET_ID),
        fetchSheetRows('COTIZACIONES_CREATA', 'A1:AA2000', SEG_SHEET_ID),
        isAdmin ? fetchSheetRows('FOTOS NUEVAS CARGADO', 'A1:J500', SHEET_ID) : Promise.resolve(null),
        isAdmin ? fetchSheetRows('INVENTARIO_EN_VIVO', 'AU1:AZ3', SHEET_ID) : Promise.resolve(null),
        fetchPresenceList()
      ];

      const [quotesRaw, histRaw, cierresRaw, histMovRaw, cotCreataRaw, photosRaw, invStatusRaw, presenceRes] = await Promise.all(jobs);
      if (!mounted || seq !== _histSyncSeq) return;

      const parsedHist = Array.isArray(histRaw) ? parseHistorialSheetRows(histRaw) : [];
      const baseQuotes = Array.isArray(quotesRaw) ? parseQuotesSheetRows(quotesRaw) : [];
      const allQuotes = mergeCotizacionesCreataRows(baseQuotes, cotCreataRaw);
      const allTimeline = buildUnifiedSeguimientoData(allQuotes, cierresRaw, histMovRaw, parsedHist);

      // Enforce strict role scoping (Admin = all, Manager = branch, Advisor = own)
      state.quoteRows = allQuotes.filter(isRecordInRoleScope);
      state.seguimientoEntries = allTimeline.filter(isRecordInRoleScope);
      state.historialRows = isAdmin ? parsedHist : [];
      ingestPresencePayload(presenceRes);

      if (isAdmin) {
        const basePhotos = Array.isArray(photosRaw) ? parsePhotosSheetRows(photosRaw) : [];
        state.photoRows = mergeDrivePhotosFromHistorial(basePhotos, parsedHist);
        if (Array.isArray(invStatusRaw) && invStatusRaw.length >= 2) {
          const hdrRow = invStatusRaw[0] || [];
          const tsCol = hdrRow.findIndex(h => /ULTIMA\s+ACTUALIZACION/i.test(cleanStr(h)));
          const cellVal = tsCol >= 0
            ? cleanStr((invStatusRaw[1] && invStatusRaw[1][tsCol]) || (invStatusRaw[2] && invStatusRaw[2][tsCol]))
            : '';
          if (cellVal) state.erpLiveCellText = cellVal;
        }
      } else {
        state.photoRows = [];
      }

      state.lastSyncLabel = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const syncLbl = $('hist_liveSyncText');
      if (syncLbl) syncLbl.textContent = state.lastSyncLabel;

      populateDynamicFilterSelects();
      if (!_histCheckpointRestoredOnce) {
        restoreHistCheckpointOnce();
      } else {
        renderAll();
      }
    } catch (err) {
      if (mounted && seq === _histSyncSeq) {
        if (!_histCheckpointRestoredOnce) {
          restoreHistCheckpointOnce();
        } else {
          renderAll();
        }
      }
    } finally {
      if (seq === _histSyncSeq) {
        state.syncInFlight = false;
      }
      if (refreshBtn) refreshBtn.disabled = false;
      if (syncIcon) syncIcon.classList.remove('cm-spin');
    }
  }

  // ============================================================================
  // SHELL HTML IN-APP (IDs hist_, 100% DELEGADO, CERO LINKS EXTERNOS / DRIVE)
  // ============================================================================
  function buildPresencePanelMarkup() {
    return `
      <section id="hist_presencePanel" class="cm-hist-presence" aria-label="Conectados">
        <div class="cm-hist-presence-head">
          <div class="cm-hist-presence-summary">
            <h2 class="cm-hist-section-title" style="margin:0;">Equipo</h2>
            <span class="cm-hist-presence-stat is-online">
              <span class="cm-presence-dot is-online" aria-hidden="true"></span>
              <strong id="hist_presenceOnlineCount" class="cm-tabular">0</strong> Conectados
            </span>
            <span class="cm-hist-presence-stat is-offline">
              <span class="cm-presence-dot is-offline" aria-hidden="true"></span>
              <strong id="hist_presenceOfflineCount" class="cm-tabular">0</strong> Desconectados
            </span>
            <span class="cm-hist-presence-stat" id="hist_presenceGuestsStat">
              <strong id="hist_presenceGuestOnlineCount" class="cm-tabular">0</strong> Invitados en línea
            </span>
          </div>
          <div class="cm-hist-presence-filters" role="group" aria-label="Filtrar estado">
            <button type="button" class="cm-hist-filter-pill is-active" data-hist-presence-filter="ALL">Todos</button>
            <button type="button" class="cm-hist-filter-pill" data-hist-presence-filter="ONLINE">Conectados</button>
            <button type="button" class="cm-hist-filter-pill" data-hist-presence-filter="OFFLINE">Desconectados</button>
            <button type="button" class="cm-hist-filter-pill" data-hist-presence-filter="GUESTS">Invitados</button>
          </div>
        </div>
        <div id="hist_presenceList" class="cm-hist-presence-grid"></div>
      </section>
    `;
  }

  function buildModuleMarkup() {
    const isAdmin = Boolean(state.session && state.session.isAdmin);
    const tabsHtml = isAdmin
      ? `
        <button type="button" id="hist_tabBtn_overview" class="cm-hist-tab" data-hist-tab="overview">Resumen</button>
        <button type="button" id="hist_tabBtn_quotes" class="cm-hist-tab" data-hist-tab="quotes">Cotizaciones <span id="hist_tabCountQuotes" class="cm-hist-tab-count">0</span></button>
        <button type="button" id="hist_tabBtn_seguimiento" class="cm-hist-tab" data-hist-tab="seguimiento">Seguimiento <span id="hist_tabCountSeg" class="cm-hist-tab-count">0</span></button>
        <button type="button" id="hist_tabBtn_historial" class="cm-hist-tab" data-hist-tab="historial">Bitácora <span id="hist_tabCountHistorial" class="cm-hist-tab-count">0</span></button>
        <button type="button" id="hist_tabBtn_photos" class="cm-hist-tab" data-hist-tab="photos">Fotos <span id="hist_tabCountPhotos" class="cm-hist-tab-count">0</span></button>
      `
      : `
        <button type="button" id="hist_tabBtn_quotes" class="cm-hist-tab" data-hist-tab="quotes">Cotizaciones <span id="hist_tabCountQuotes" class="cm-hist-tab-count">0</span></button>
        <button type="button" id="hist_tabBtn_seguimiento" class="cm-hist-tab" data-hist-tab="seguimiento">Seguimiento <span id="hist_tabCountSeg" class="cm-hist-tab-count">0</span></button>
        <button type="button" id="hist_tabBtn_presence" class="cm-hist-tab" data-hist-tab="presence">Conectados <span id="hist_tabCountPresence" class="cm-hist-tab-count">0</span></button>
      `;

    return `
      <header class="cm-topbar">
        <div class="cm-topbar-inner">
          <div class="cm-topbar-left">
            <button type="button" class="cm-btn cm-btn-back" data-hist-action="close-module" aria-label="Volver">← Volver</button>
            <h1 class="cm-title">Historial</h1>
            <span id="hist_scopeChip" class="cm-subtitle-chip"></span>
          </div>
          <div class="cm-topbar-right">
            <span id="hist_liveSyncText" class="cm-subtitle-chip cm-mono"></span>
            <button type="button" id="hist_btnLiveAlerts" class="cm-btn" data-hist-action="live-alerts" title="Activar avisos en vivo de cotizaciones y fallas">🔔 Alertas</button>
            <button type="button" id="hist_btnRefreshLive" class="cm-btn cm-btn-icon" data-hist-action="refresh" aria-label="Actualizar"><span id="hist_syncIcon">↻</span></button>
            <button type="button" class="cm-btn" data-hist-action="export-csv">CSV</button>
          </div>
        </div>
      </header>

      <main class="cm-main">
        <!-- 4 KPIs (2x2 mobile, 4-col PC) -->
        <section class="cm-hist-kpis" aria-label="Indicadores">
          <div class="cm-hist-kpi">
            <div class="cm-hist-kpi-label">Cotizado</div>
            <div id="hist_kpiQuotesTotalMxn" class="cm-hist-kpi-val cm-tabular">$0.00</div>
            <div id="hist_kpiQuotesCount" class="cm-hist-kpi-sub">0 cotizaciones</div>
          </div>
          <div class="cm-hist-kpi">
            <div class="cm-hist-kpi-label">Ganadas</div>
            <div id="hist_kpiWonCount" class="cm-hist-kpi-val cm-tabular">0</div>
            <div id="hist_kpiWonSub" class="cm-hist-kpi-sub">0% cierre</div>
          </div>
          <div class="cm-hist-kpi">
            <div class="cm-hist-kpi-label">Seguimiento</div>
            <div id="hist_kpiSegCount" class="cm-hist-kpi-val cm-tabular">0</div>
            <div id="hist_kpiSegSub" class="cm-hist-kpi-sub">0 eventos</div>
          </div>
          <div class="cm-hist-kpi">
            <div id="hist_kpiFourthLabel" class="cm-hist-kpi-label">${isAdmin ? 'Fotos' : 'Ticket prom.'}</div>
            <div id="hist_kpiFourthVal" class="cm-hist-kpi-val cm-tabular">${isAdmin ? '0' : '$0.00'}</div>
            <div id="hist_kpiFourthSub" class="cm-hist-kpi-sub">—</div>
          </div>
        </section>

        <!-- Tabs + Search -->
        <section class="cm-hist-controls">
          <div class="cm-hist-tabs" role="tablist">${tabsHtml}</div>
          <div class="cm-hist-search-wrap">
            <input id="hist_globalSearch" type="search" class="cm-input" placeholder="Folio, cliente, SKU..." autocomplete="off" data-hist-input="search">
            <button type="button" id="hist_btnClearSearch" class="cm-hist-clear-btn cm-hidden" data-hist-action="clear-search" aria-label="Limpiar">✕</button>
          </div>
        </section>

        <!-- TAB: RESUMEN (ADMIN) -->
        ${isAdmin ? `
        <section id="hist_tabPanel_overview" class="cm-hidden" style="display:flex;flex-direction:column;gap:12px;">
          ${buildPresencePanelMarkup()}
          <div class="cm-hist-overview-grid">
            <div class="cm-hist-section">
              <h2 class="cm-hist-section-title">Tiendas</h2>
              <div class="cm-hist-table-wrap">
                <table class="cm-hist-table">
                  <thead><tr><th>Tienda</th><th>Cot.</th><th>Pzas</th><th>Folio</th><th style="text-align:right;">Total</th></tr></thead>
                  <tbody id="hist_overviewStoresTbody"></tbody>
                </table>
              </div>
              <div id="hist_overviewStoresMobile" class="cm-hist-mobile-list"></div>
            </div>
            <div class="cm-hist-section">
              <h2 class="cm-hist-section-title">Asesores</h2>
              <div class="cm-hist-table-wrap">
                <table class="cm-hist-table">
                  <thead><tr><th>Asesor</th><th>Tienda</th><th>Cot.</th><th style="text-align:right;">Total</th></tr></thead>
                  <tbody id="hist_overviewAdvisorsTbody"></tbody>
                </table>
              </div>
              <div id="hist_overviewAdvisorsMobile" class="cm-hist-mobile-list"></div>
            </div>
          </div>
        </section>` : `
        <!-- TAB: CONECTADOS (GERENTES / EQUIPO) -->
        <section id="hist_tabPanel_presence" class="cm-hidden" style="display:flex;flex-direction:column;gap:10px;">
          ${buildPresencePanelMarkup()}
        </section>`}

        <!-- TAB: COTIZACIONES -->
        <section id="hist_tabPanel_quotes" class="cm-hidden" style="display:flex;flex-direction:column;gap:10px;">
          <div class="cm-hist-subbar">
            <div class="cm-hist-subbar-group">
              <select id="hist_quotesStoreSelect" class="cm-select" data-hist-change="quotes-store">
                <option value="ALL">Todas las tiendas</option>
              </select>
              <select id="hist_quotesStatusSelect" class="cm-select" data-hist-change="quotes-status">
                <option value="ALL">Todos los estados</option>
                <option value="ABIERTA">Abierta</option>
                <option value="CONTACTADA">Contactada</option>
                <option value="GANADA">Ganada</option>
                <option value="PERDIDA">Perdida</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>
            <span id="hist_quotesFilterSummary" class="cm-tabular" style="font-size:0.76rem;font-weight:700;color:var(--cm-muted);"></span>
          </div>

          <div class="cm-hist-table-wrap">
            <table class="cm-hist-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Tienda</th>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Partidas</th>
                  <th style="text-align:right;">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody id="hist_quotesTableBody"></tbody>
            </table>
          </div>
          <div id="hist_quotesMobileList" class="cm-hist-mobile-list"></div>
        </section>

        <!-- TAB: SEGUIMIENTO -->
        <section id="hist_tabPanel_seguimiento" class="cm-hidden" style="display:flex;flex-direction:column;gap:10px;">
          <div class="cm-hist-subbar">
            <div class="cm-hist-subbar-group">
              <button type="button" class="cm-hist-filter-pill is-active" data-hist-seg-kind="ALL">Todos</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-seg-kind="CIERRE">Cierres</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-seg-kind="WHATSAPP">WhatsApp</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-seg-kind="TELEFONO">Teléfono</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-seg-kind="EMAIL">Correo</button>
            </div>
            <select id="hist_segStatusSelect" class="cm-select" data-hist-change="seg-status">
              <option value="ALL">Todos</option>
              <option value="GANADA">Ganada</option>
              <option value="PERDIDA">Perdida</option>
              <option value="CANCELADA">Cancelada</option>
              <option value="CONTACTADA">Contactada</option>
            </select>
          </div>

          <div class="cm-hist-table-wrap">
            <table class="cm-hist-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Folio</th>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody id="hist_segTableBody"></tbody>
            </table>
          </div>
          <div id="hist_segMobileList" class="cm-hist-mobile-list"></div>
        </section>

        <!-- TAB: BITÁCORA (ADMIN) -->
        ${isAdmin ? `
        <section id="hist_tabPanel_historial" class="cm-hidden" style="display:flex;flex-direction:column;gap:10px;">
          <div class="cm-hist-subbar">
            <div class="cm-hist-subbar-group">
              <button type="button" class="cm-hist-filter-pill is-active" data-hist-class="ALL">Todos</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-class="MOVIMIENTO">Movimientos</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-class="FALLO">Fallos</button>
              <button type="button" class="cm-hist-filter-pill" data-hist-class="ALERTA">Alertas</button>
            </div>
            <select id="hist_historialBranchSelect" class="cm-select" data-hist-change="hist-branch">
              <option value="ALL">Todas las áreas</option>
            </select>
          </div>
          <div id="hist_historialEntriesContainer" class="cm-hist-audit-list"></div>
        </section>` : ''}

        <!-- TAB: FOTOS (ADMIN — PROTEGIDAS SIN ENLACES DRIVE NI DESCARGA) -->
        ${isAdmin ? `
        <section id="hist_tabPanel_photos" class="cm-hidden">
          <div id="hist_photosGalleryContainer" class="cm-hist-photos-grid"></div>
        </section>` : ''}
      </main>

      <!-- MODAL INSPECCIÓN COTIZACIÓN + PDF FORMAL (#3) -->
      <div id="hist_quoteInspectModal" class="cm-modal-backdrop cm-hidden" data-hist-backdrop="quote">
        <div class="cm-modal-card" role="dialog" aria-modal="true" aria-labelledby="hist_quoteInspectTitle">
          <div class="cm-modal-head">
            <h2 id="hist_quoteInspectTitle" class="cm-modal-title">Cotización</h2>
            <button type="button" class="cm-modal-close" data-hist-action="close-modal" data-modal="quote" aria-label="Cerrar">&times;</button>
          </div>
          <div id="hist_quoteInspectBody"></div>
        </div>
      </div>

      <!-- MODAL VISTA FOTO (CANVAS / ESCUDO SILENCIOSO, CERO DESCARGA / CERO DRIVE URL) -->
      <div id="hist_photoPreviewModal" class="cm-modal-backdrop cm-hidden" data-hist-backdrop="photo">
        <div class="cm-modal-card" role="dialog" aria-modal="true" aria-labelledby="hist_photoPreviewTitle">
          <div class="cm-modal-head">
            <h2 id="hist_photoPreviewTitle" class="cm-modal-title">Foto</h2>
            <button type="button" class="cm-modal-close" data-hist-action="close-modal" data-modal="photo" aria-label="Cerrar">&times;</button>
          </div>
          <div id="hist_photoPreviewBody"></div>
        </div>
      </div>

      <div id="hist_toast" class="cm-toast is-hidden" role="status" aria-live="polite">
        <span id="hist_toastMsg"></span>
      </div>
    `;
  }

  // ============================================================================
  // FILTROS Y RENDERERS (TABLAS DESKTOP + TARJETAS MÓVILES)
  // ============================================================================
  function populateDynamicFilterSelects() {
    const branchSel = $('hist_historialBranchSelect');
    if (branchSel) {
      const prevVal = state.historialBranchFilter || 'ALL';
      const branches = Array.from(new Set(state.historialRows.map(r => r.sucursal).filter(Boolean))).sort();
      branchSel.innerHTML = '<option value="ALL">Todas las áreas</option>' +
        branches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
      branchSel.value = branches.includes(prevVal) ? prevVal : 'ALL';
      state.historialBranchFilter = branchSel.value;
    }

    const storeSel = $('hist_quotesStoreSelect');
    if (storeSel) {
      const prevStore = state.quotesStoreFilter || 'ALL';
      const stores = Array.from(new Set(state.quoteRows.map(q => q.tiendaErp).filter(Boolean))).sort();
      storeSel.innerHTML = '<option value="ALL">Todas las tiendas</option>' +
        stores.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      storeSel.value = stores.includes(prevStore) ? prevStore : 'ALL';
      state.quotesStoreFilter = storeSel.value;
    }
  }

  function getFilteredHistorial() {
    const q = normalizeSearchText(state.searchQuery);
    return state.historialRows.filter(r => {
      if (state.historialClassFilter !== 'ALL' && r.normKind !== state.historialClassFilter) return false;
      if (state.historialBranchFilter !== 'ALL' && r.sucursal !== state.historialBranchFilter) return false;
      if (q && !r._search.includes(q)) return false;
      return true;
    });
  }

  function getFilteredQuotes() {
    const q = normalizeSearchText(state.searchQuery);
    return state.quoteRows.filter(item => {
      if (state.quotesStoreFilter !== 'ALL' && item.tiendaErp !== state.quotesStoreFilter) return false;
      if (state.quotesStatusFilter !== 'ALL' && item.segStatus !== state.quotesStatusFilter) return false;
      if (q && !item._search.includes(q)) return false;
      return true;
    });
  }

  function getFilteredSeguimiento() {
    const q = normalizeSearchText(state.searchQuery);
    return state.seguimientoEntries.filter(item => {
      if (state.segKindFilter !== 'ALL' && item.kind !== state.segKindFilter) return false;
      if (state.segStatusFilter !== 'ALL' && item.status !== state.segStatusFilter) return false;
      if (q && !item._search.includes(q)) return false;
      return true;
    });
  }

  function getFilteredPhotos() {
    const q = normalizeSearchText(state.searchQuery);
    return state.photoRows.filter(p => !q || p._search.includes(q));
  }

  function statusPillHtml(statusRaw) {
    const s = cleanStr(statusRaw).toUpperCase() || 'ABIERTA';
    if (s === 'GANADA') return '<span class="cm-pill cm-pill-emerald">Ganada</span>';
    if (s === 'PERDIDA') return '<span class="cm-pill cm-pill-rose">Perdida</span>';
    if (s === 'CANCELADA') return '<span class="cm-pill cm-pill-slate">Cancelada</span>';
    if (s === 'CONTACTADA') return '<span class="cm-pill cm-pill-bronze">Contactada</span>';
    return '<span class="cm-pill cm-pill-amber">Abierta</span>';
  }

  function renderKpisAndCounts() {
    const totalQuotes = state.quoteRows.length;
    const totalMxn = state.quoteRows.reduce((acc, q) => acc + q.totalNum, 0);
    const avgTicket = totalQuotes > 0 ? (totalMxn / totalQuotes) : 0;
    const wonCount = state.quoteRows.filter(q => q.segStatus === 'GANADA').length;
    const closedCount = state.quoteRows.filter(q => ['GANADA', 'PERDIDA', 'CANCELADA'].includes(q.segStatus)).length;
    const winPct = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

    const setT = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    setT('hist_kpiQuotesTotalMxn', formatMoneyMXN(totalMxn));
    setT('hist_kpiQuotesCount', `${totalQuotes} cotizaciones`);
    setT('hist_kpiWonCount', String(wonCount));
    setT('hist_kpiWonSub', closedCount > 0 ? `${winPct}% de ${closedCount} cerradas` : 'Sin cierres');
    setT('hist_kpiSegCount', String(state.seguimientoEntries.length));
    setT('hist_kpiSegSub', `${state.seguimientoEntries.filter(e => e.kind === 'WHATSAPP').length} WhatsApp`);

    if (state.session && state.session.isAdmin) {
      setT('hist_kpiFourthVal', String(state.photoRows.length));
      setT('hist_kpiFourthSub', state.photoRows[0] ? state.photoRows[0].sku : '—');
    } else {
      setT('hist_kpiFourthVal', formatMoneyMXN(avgTicket));
      setT('hist_kpiFourthSub', state.session ? state.session.branchLabel : '');
    }

    setT('hist_tabCountQuotes', String(state.quoteRows.length));
    setT('hist_tabCountSeg', String(state.seguimientoEntries.length));
    setT('hist_tabCountHistorial', String(state.historialRows.length));
    setT('hist_tabCountPhotos', String(state.photoRows.length));
    setT('hist_tabCountPresence', String(state.presenceOnlineCount));
  }

  function getFilteredPresenceUsers() {
    const q = normalizeSearchText(state.searchQuery);
    const pool = state.presenceFilter === 'GUESTS'
      ? (state.presenceGuests || [])
      : (state.presenceUsers || []).concat(state.presenceGuests || []);
    return pool.filter(u => {
      if (state.presenceFilter === 'ONLINE' && !u.online) return false;
      if (state.presenceFilter === 'OFFLINE' && u.online) return false;
      if (q && !u._search.includes(q)) return false;
      return true;
    });
  }

  function formatPresenceVistaLabel(vista) {
    const v = cleanStr(vista).toLowerCase();
    if (!v) return '';
    if (v === 'inventario' || v === 'home' || v === 'catalogo') return 'Inventario / Cotizador';
    if (v === 'seguimiento') return 'Seguimiento';
    if (v === 'historial') return 'Historial';
    if (v === 'configuracion') return 'Configuración';
    if (v === 'cotizador' || v === 'carrito') return 'Cotizador';
    if (v === 'fotos' || v === 'fotos-productos') return 'Subida de Fotos';
    if (v === 'panel') return 'Panel CREATA';
    return cleanStr(vista);
  }

  function renderPresencePanel() {
    const panelEl = $('hist_presencePanel');
    const canViewPresence = !(state.session && state.session.isAdmin && state.session.adminPermissions && state.session.adminPermissions.equipoInvitados === false);
    if (panelEl) panelEl.classList.toggle('hidden', !canViewPresence);
    if (!canViewPresence) return;
    const onlineEl = $('hist_presenceOnlineCount');
    const offlineEl = $('hist_presenceOfflineCount');
    const guestOnEl = $('hist_presenceGuestOnlineCount');
    const listEl = $('hist_presenceList');
    if (onlineEl) onlineEl.textContent = String(state.presenceOnlineCount);
    if (offlineEl) offlineEl.textContent = String(state.presenceOfflineCount);
    if (guestOnEl) guestOnEl.textContent = String(state.presenceGuestOnlineCount || 0);

    rootEl?.querySelectorAll('[data-hist-presence-filter]').forEach(b => {
      const fKey = b.getAttribute('data-hist-presence-filter');
      b.classList.toggle('is-active', fKey === state.presenceFilter);
      if (fKey === 'GUESTS') {
        const gTotal = (state.presenceGuests || []).length;
        const gOn = state.presenceGuestOnlineCount || 0;
        b.textContent = gTotal > 0 ? `Invitados (${gOn}/${gTotal})` : 'Invitados';
      }
    });

    if (!listEl) return;
    const list = getFilteredPresenceUsers();
    if (!list.length) {
      let emptyMsg = 'Sin registros.';
      if (!state.presenceUsers.length && !(state.presenceGuests && state.presenceGuests.length)) {
        if (state.presenceError === 'no_token' || state.presenceError === 'auth_failed') {
          emptyMsg = 'Tu sesión en este dispositivo no tiene token de presencia activo. Toca SALIR arriba y vuelve a iniciar sesión para ver quién está conectado.';
        } else if (state.presenceError === 'unavailable') {
          emptyMsg = 'No se pudo consultar el equipo en vivo. Toca ↻ para reintentar.';
        }
      } else if (state.presenceFilter === 'GUESTS') {
        emptyMsg = 'Sin invitados registrados en la hoja INVITADOS.';
      } else if (state.presenceFilter === 'ONLINE') {
        emptyMsg = 'Nadie conectado en los últimos 3 minutos.';
      }
      listEl.innerHTML = `<div class="cm-empty" style="grid-column:1/-1;">${escapeHtml(emptyMsg)}</div>`;
      return;
    }

    listEl.innerHTML = list.map(u => {
      const vistaLabel = formatPresenceVistaLabel(u.vista);
      const vistaPart = vistaLabel ? (u.online ? `En: ${vistaLabel}` : `Última vista: ${vistaLabel}`) : '';
      const metaParts = u.isGuest
        ? ['INVITADO', u.slotLabel ? `Lugares: ${u.slotLabel}` : '', u.deviceLabel ? `📱 ${u.deviceLabel}` : '', vistaPart]
        : [u.sucursal, u.rol, vistaPart];
      const meta = metaParts.filter(Boolean).join(' · ') || '—';
      const lastSeenLabel = formatPresenceLastSeen(u.lastSeenMs, u.online);
      const cls = u.online ? 'is-online' : 'is-offline';
      const guestTag = u.isGuest ? ' <span class="cm-pill cm-pill-amber" style="font-size:10px;padding:1px 6px;">INVITADO</span>' : '';
      return `
        <div class="cm-hist-presence-item ${cls}">
          <div class="cm-hist-presence-main">
            <span class="cm-presence-dot ${cls}" aria-hidden="true"></span>
            <div class="cm-hist-presence-info">
              <div class="cm-hist-presence-name">${escapeHtml(u.nombre)}${guestTag}</div>
              <div class="cm-hist-presence-meta">${escapeHtml(meta)}</div>
            </div>
          </div>
          <div class="cm-hist-presence-right">
            <span class="cm-hist-presence-badge ${cls}">${u.online ? 'Conectado' : 'Desconectado'}</span>
            <span class="cm-hist-presence-time cm-tabular">${escapeHtml(lastSeenLabel)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderOverviewTab() {
    if (!state.session || !state.session.isAdmin) return;
    const qNorm = normalizeSearchText(state.searchQuery);

    // Stores
    const storeBody = $('hist_overviewStoresTbody');
    const storeMob = $('hist_overviewStoresMobile');
    const byStore = new Map();
    let grandTotal = 0;
    state.quoteRows.forEach(q => {
      grandTotal += q.totalNum;
      const key = q.tiendaErp || 'SIN TIENDA';
      const cur = byStore.get(key) || { store: key, count: 0, items: 0, total: 0, lastFolio: q.folioErp };
      cur.count += 1;
      cur.items += q.partidasCant;
      cur.total += q.totalNum;
      byStore.set(key, cur);
    });
    const storeList = Array.from(byStore.values())
      .filter(s => !qNorm || normalizeSearchText(s.store + ' ' + s.lastFolio).includes(qNorm))
      .sort((a, b) => b.total - a.total);

    if (storeBody) {
      storeBody.innerHTML = storeList.length
        ? storeList.map(s => {
            const pct = grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0;
            return `<tr>
              <td><strong>${escapeHtml(s.store)}</strong></td>
              <td class="cm-tabular">${s.count}</td>
              <td class="cm-tabular">${s.items}</td>
              <td class="cm-mono">${escapeHtml(s.lastFolio)}</td>
              <td class="cm-tabular" style="text-align:right;">
                <strong>${escapeHtml(formatMoneyMXN(s.total))}</strong>
                <div class="cm-hist-share-track"><div class="cm-hist-share-fill" style="width:${pct}%;"></div></div>
              </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="5" class="cm-empty" style="border:none;">Sin datos.</td></tr>';
    }
    if (storeMob) {
      storeMob.innerHTML = storeList.length
        ? storeList.map(s => `
            <div class="cm-hist-mcard">
              <div class="cm-hist-mcard-row">
                <span class="cm-hist-mcard-title">${escapeHtml(s.store)}</span>
                <strong class="cm-tabular">${escapeHtml(formatMoneyMXN(s.total))}</strong>
              </div>
              <div class="cm-hist-mcard-meta">
                <span>${s.count} cot.</span>
                <span>${s.items} pzas</span>
                <span class="cm-mono">${escapeHtml(s.lastFolio)}</span>
              </div>
            </div>`).join('')
        : '<div class="cm-empty">Sin datos.</div>';
    }

    // Advisors
    const advBody = $('hist_overviewAdvisorsTbody');
    const advMob = $('hist_overviewAdvisorsMobile');
    const byAdv = new Map();
    state.quoteRows.forEach(q => {
      const key = (q.correoAsesor || q.nombreAsesor || 'sin-correo').toLowerCase();
      const cur = byAdv.get(key) || { name: q.nombreAsesor || 'Asesor', store: q.tiendaErp || '', count: 0, total: 0, lastFolio: q.folioErp };
      cur.count += 1;
      cur.total += q.totalNum;
      byAdv.set(key, cur);
    });
    const advList = Array.from(byAdv.values())
      .filter(a => !qNorm || normalizeSearchText(a.name + ' ' + a.store + ' ' + a.lastFolio).includes(qNorm))
      .sort((a, b) => b.total - a.total);

    if (advBody) {
      advBody.innerHTML = advList.length
        ? advList.map(a => `<tr>
            <td><strong>${escapeHtml(a.name)}</strong></td>
            <td>${escapeHtml(a.store)}</td>
            <td class="cm-tabular">${a.count}</td>
            <td class="cm-tabular" style="text-align:right;"><strong>${escapeHtml(formatMoneyMXN(a.total))}</strong></td>
          </tr>`).join('')
        : '<tr><td colspan="4" class="cm-empty" style="border:none;">Sin datos.</td></tr>';
    }
    if (advMob) {
      advMob.innerHTML = advList.length
        ? advList.map(a => `
            <div class="cm-hist-mcard">
              <div class="cm-hist-mcard-row">
                <span class="cm-hist-mcard-title">${escapeHtml(a.name)}</span>
                <strong class="cm-tabular">${escapeHtml(formatMoneyMXN(a.total))}</strong>
              </div>
              <div class="cm-hist-mcard-meta">
                <span>${escapeHtml(a.store)}</span>
                <span>${a.count} cot.</span>
              </div>
            </div>`).join('')
        : '<div class="cm-empty">Sin datos.</div>';
    }
  }

  function renderQuotesTab() {
    const tbody = $('hist_quotesTableBody');
    const mob = $('hist_quotesMobileList');
    const summaryEl = $('hist_quotesFilterSummary');
    const list = getFilteredQuotes();
    const sumMxn = list.reduce((acc, q) => acc + q.totalNum, 0);

    if (summaryEl) {
      summaryEl.textContent = `${list.length} · ${formatMoneyMXN(sumMxn)}`;
    }

    if (!list.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="cm-empty" style="border:none;">Sin cotizaciones.</td></tr>';
      if (mob) mob.innerHTML = '<div class="cm-empty">Sin cotizaciones.</div>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = list.map((q, idx) => `
        <tr class="is-clickable" data-hist-open-quote="${idx}">
          <td>
            <div class="cm-mono" style="font-weight:800;">${escapeHtml(q.folioErp)}</div>
            ${q.idErp ? `<div class="cm-mono" style="font-size:0.7rem;color:var(--cm-muted);">#${escapeHtml(q.idErp)}</div>` : ''}
          </td>
          <td class="cm-tabular" style="white-space:nowrap;">${escapeHtml(q.fechaHora)}</td>
          <td>${escapeHtml(q.tiendaErp)}</td>
          <td>${escapeHtml(q.nombreAsesor)}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(q.cliente)}</div>
            ${q.telefono ? `<div class="cm-mono" style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(q.telefono)}</div>` : ''}
          </td>
          <td class="cm-tabular">${q.partidasCant}</td>
          <td class="cm-tabular" style="text-align:right;"><strong>${escapeHtml(formatMoneyMXN(q.totalNum))}</strong></td>
          <td>${statusPillHtml(q.segStatus)}</td>
        </tr>
      `).join('');
    }

    if (mob) {
      mob.innerHTML = list.map((q, idx) => `
        <article class="cm-hist-mcard is-clickable" data-hist-open-quote="${idx}">
          <div class="cm-hist-mcard-row">
            <span class="cm-mono" style="font-weight:800;font-size:0.8rem;">${escapeHtml(q.folioErp)}</span>
            ${statusPillHtml(q.segStatus)}
          </div>
          <div class="cm-hist-mcard-title">${escapeHtml(q.cliente)}</div>
          <div class="cm-hist-mcard-meta">
            <span>${escapeHtml(q.tiendaErp)}</span>
            <span>${escapeHtml(q.nombreAsesor)}</span>
            <span class="cm-tabular">${escapeHtml(q.fechaHora)}</span>
          </div>
          <div class="cm-hist-mcard-row" style="margin-top:2px;">
            <span style="font-size:0.74rem;color:var(--cm-muted);">${q.partidasCant} partida(s)</span>
            <strong class="cm-tabular" style="font-size:0.88rem;">${escapeHtml(formatMoneyMXN(q.totalNum))}</strong>
          </div>
        </article>
      `).join('');
    }
  }

  function renderSeguimientoTab() {
    const tbody = $('hist_segTableBody');
    const mob = $('hist_segMobileList');
    const list = getFilteredSeguimiento();

    if (!list.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="cm-empty" style="border:none;">Sin eventos de seguimiento.</td></tr>';
      if (mob) mob.innerHTML = '<div class="cm-empty">Sin eventos de seguimiento.</div>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = list.map(ev => `
        <tr>
          <td class="cm-tabular" style="white-space:nowrap;">${escapeHtml(ev.fecha)}</td>
          <td><span class="cm-pill cm-pill-slate">${escapeHtml(ev.kind)}</span></td>
          <td class="cm-mono" style="font-weight:700;">${escapeHtml(ev.folio || '—')}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(ev.asesor || '—')}</div>
            <div style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(ev.sucursal || '')}</div>
          </td>
          <td>${escapeHtml(ev.cliente || '—')}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(ev.accion)}</div>
            ${ev.detalle ? `<div style="font-size:0.74rem;color:var(--cm-muted);">${escapeHtml(ev.detalle)}</div>` : ''}
          </td>
        </tr>
      `).join('');
    }

    if (mob) {
      mob.innerHTML = list.map(ev => `
        <article class="cm-hist-mcard">
          <div class="cm-hist-mcard-row">
            <span class="cm-mono" style="font-weight:800;font-size:0.78rem;">${escapeHtml(ev.folio || '—')}</span>
            <span class="cm-pill cm-pill-slate">${escapeHtml(ev.kind)}</span>
          </div>
          <div class="cm-hist-mcard-title">${escapeHtml(ev.accion)}</div>
          ${ev.detalle ? `<div style="font-size:0.76rem;color:var(--cm-ink-2);">${escapeHtml(ev.detalle)}</div>` : ''}
          <div class="cm-hist-mcard-meta">
            <span>${escapeHtml(ev.asesor || '—')}</span>
            ${ev.cliente ? `<span>${escapeHtml(ev.cliente)}</span>` : ''}
            <span class="cm-tabular">${escapeHtml(ev.fecha)}</span>
          </div>
        </article>
      `).join('');
    }
  }

  function renderHistorialTab() {
    if (!state.session || !state.session.isAdmin) return;
    const container = $('hist_historialEntriesContainer');
    if (!container) return;
    const rows = getFilteredHistorial();
    if (!rows.length) {
      container.innerHTML = '<div class="cm-empty">Sin registros.</div>';
      return;
    }

    container.innerHTML = rows.map(r => {
      const pillCls = r.normKind === 'FALLO'
        ? (/CORREGIDO/i.test(r.estado) ? 'cm-pill-emerald' : 'cm-pill-rose')
        : (r.normKind === 'ALERTA' ? 'cm-pill-amber' : 'cm-pill-slate');
      return `
        <article class="cm-hist-audit-card">
          <div class="cm-hist-mcard-row">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <span class="cm-pill ${pillCls}">${escapeHtml(r.clasificacion)}</span>
              ${r.referencia ? `<span class="cm-pill cm-pill-slate cm-mono">${escapeHtml(r.referencia)}</span>` : ''}
            </div>
            <time class="cm-tabular" style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(r.fecha)}</time>
          </div>
          <div class="cm-hist-mcard-title">${escapeHtml(r.evento || 'Registro')}</div>
          <div class="cm-hist-mcard-meta">
            ${r.modulo ? `<span class="cm-mono">${escapeHtml(r.modulo)}</span>` : ''}
            ${r.usuario ? `<span>${escapeHtml(r.usuario)}</span>` : ''}
            ${r.sucursal ? `<span>${escapeHtml(r.sucursal)}</span>` : ''}
          </div>
          ${r.detalle ? `<p class="cm-hist-audit-detail">${escapeHtml(r.detalle)}</p>` : ''}
          ${r.analisis ? `<div class="cm-hist-audit-analysis">${escapeHtml(r.analisis)}</div>` : ''}
        </article>
      `;
    }).join('');
  }

  // Protected Photos Tab (#15, #16 — ZERO download/Drive URL buttons, silent shield)
  function renderPhotosTab() {
    if (!state.session || !state.session.isAdmin) return;
    const grid = $('hist_photosGalleryContainer');
    if (!grid) return;
    const list = getFilteredPhotos();
    if (!list.length) {
      grid.innerHTML = '<div class="cm-empty" style="grid-column:1/-1;">Sin fotos.</div>';
      return;
    }

    grid.innerHTML = list.map((p, idx) => `
      <article class="cm-hist-photo-card" data-hist-open-photo="${idx}">
        <div class="cm-img-stage cm-hist-photo-stage">
          ${p.previewUrl
            ? `<img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.nombreProducto)}" loading="lazy" draggable="false" referrerpolicy="no-referrer">`
            : '<div class="cm-empty" style="border:none;">—</div>'}
          <span class="creata-img-shield" aria-hidden="true"></span>
        </div>
        <div class="cm-hist-photo-info">
          <div class="cm-hist-photo-sku">${escapeHtml(p.sku)}</div>
          <h3 class="cm-hist-photo-name">${escapeHtml(p.nombreProducto)}</h3>
          <div class="cm-hist-photo-meta">${escapeHtml(p.quienSubio)} · ${escapeHtml(p.fechaHora)}</div>
        </div>
      </article>
    `).join('');

    applySilentImageProtection(grid);
  }

  function renderAll() {
    if (!mounted) return;
    renderKpisAndCounts();
    renderPresencePanel();
    renderOverviewTab();
    renderQuotesTab();
    renderSeguimientoTab();
    renderHistorialTab();
    renderPhotosTab();
  }

  // ============================================================================
  // MODALES (COTIZACIÓN + PDF FORMAL #3 & FOTO PROTEGIDA #15/#16)
  // ============================================================================
  function triggerHistoryBase64PdfDownload(base64Str, fileName) {
    const cleanB64 = String(base64Str || '').replace(/\s+/g, '');
    const bin = global.atob(cleanB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const safeName = cleanStr(fileName) || 'CREATA-muebles-cotización_SIN-FOLIO.pdf';
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.pdf$/i.test(safeName) ? safeName : (safeName + '.pdf');
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 250);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
  }

  function setHistoryPdfStatus(tone, htmlContent) {
    const box = $('hist_quoteInspectPdfStatus');
    if (!box) return;
    if (!htmlContent) {
      box.innerHTML = '';
      box.className = 'cm-hist-pdf-status cm-hidden';
      return;
    }
    box.className = 'cm-hist-pdf-status ' + (tone === 'ok' ? 'is-ok' : (tone === 'warn' ? 'is-warn' : 'is-err'));
    box.innerHTML = htmlContent;
  }

  async function downloadHistoryQuoteOriginalPdf() {
    if (historyPdfDownloadInFlight || !activeInspectedQuote || !state.session) return;
    const q = activeInspectedQuote;
    const btn = $('hist_btnDownloadPdf');
    const prevTxt = btn ? btn.textContent : '';

    historyPdfDownloadInFlight = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Descargando PDF...';
    }
    setHistoryPdfStatus('warn', 'Obteniendo PDF...');

    try {
      const res = await callWebAppPost('inv_download_erp_quote_pdf', {
        authToken: state.session.authToken || '',
        accessKey: state.session.accessKey || '',
        advisorKey: state.session.accessKey || '',
        sheetTab: state.session.sheetTab || 'PROYECTOS',
        advisorEmail: state.session.correo,
        quoteId: cleanStr(q.idErp),
        folio: (!/^(SIN FOLIO|EN PROCESO|PENDIENTE)$/i.test(cleanStr(q.folioErp))) ? cleanStr(q.folioErp) : '',
        erpUserId: cleanStr(q.idUsuarioErp),
        clientName: cleanStr(q.cliente),
        erpStore: cleanStr(q.tiendaErp)
      }, 45000);

      if (res && res.ok && res.pdfBase64) {
        const fname = buildFormalQuotePdfName(q.folioErp || q.idErp, q.cliente);
        triggerHistoryBase64PdfDownload(res.pdfBase64, fname);
        setHistoryPdfStatus('ok', `PDF descargado: <strong>${escapeHtml(fname)}</strong>`);
        return;
      }

      setHistoryPdfStatus('err', escapeHtml(cleanStr((res && res.error) || 'No fue posible descargar el PDF.')));
    } finally {
      historyPdfDownloadInFlight = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevTxt || '⬇ Descargar PDF';
      }
    }
  }

  function openQuoteDetailModal(q) {
    const modal = $('hist_quoteInspectModal');
    const titleEl = $('hist_quoteInspectTitle');
    const bodyEl = $('hist_quoteInspectBody');
    if (!modal || !bodyEl || !q) return;

    activeInspectedQuote = q;
    if (titleEl) titleEl.textContent = `Folio ${q.folioErp}`;

    const skuItems = q.resumenSkus ? q.resumenSkus.split(',').map(s => s.trim()).filter(Boolean) : [];
    const canDownloadPdf = Boolean(cleanStr(q.idErp) || (cleanStr(q.folioErp) && !/^(SIN FOLIO|EN PROCESO|PENDIENTE)$/i.test(cleanStr(q.folioErp))));

    bodyEl.innerHTML = `
      ${canDownloadPdf ? `
        <div style="margin-bottom:12px;">
          <button id="hist_btnDownloadPdf" type="button" class="cm-btn cm-btn-primary" style="width:100%;" data-hist-action="download-pdf">⬇ Descargar PDF</button>
          <div id="hist_quoteInspectPdfStatus" class="cm-hist-pdf-status cm-hidden"></div>
        </div>` : ''}
      <div class="cm-hist-kv-grid">
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Folio</div><div class="cm-hist-kv-val cm-mono">${escapeHtml(q.folioErp)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Fecha</div><div class="cm-hist-kv-val cm-tabular">${escapeHtml(q.fechaHora)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Tienda</div><div class="cm-hist-kv-val">${escapeHtml(q.tiendaErp)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Asesor</div><div class="cm-hist-kv-val">${escapeHtml(q.nombreAsesor)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Cliente</div><div class="cm-hist-kv-val">${escapeHtml(q.cliente)}${q.telefono ? ' · ' + escapeHtml(q.telefono) : ''}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Estado</div><div class="cm-hist-kv-val">${statusPillHtml(q.segStatus)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Subtotal</div><div class="cm-hist-kv-val cm-tabular">${escapeHtml(formatMoneyMXN(q.subtotalNum))}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Total</div><div class="cm-hist-kv-val cm-tabular" style="color:var(--cm-accent);">${escapeHtml(formatMoneyMXN(q.totalNum))}</div></div>
      </div>
      ${q.segMotivo || q.segComentarios ? `
        <div class="cm-hist-kv" style="margin-top:8px;">
          <div class="cm-hist-kv-label">Seguimiento</div>
          <div class="cm-hist-kv-val" style="font-weight:500;">${escapeHtml([q.segMotivo, q.segComentarios].filter(Boolean).join(' · '))}</div>
        </div>` : ''}
      <div class="cm-hist-kv" style="margin-top:8px;">
        <div class="cm-hist-kv-label">Partidas (${q.partidasCant})</div>
        <div class="cm-hist-chips">
          ${skuItems.length
            ? skuItems.map(tok => `<span class="cm-hist-chip">${escapeHtml(tok)}</span>`).join('')
            : '<span style="font-size:0.78rem;color:var(--cm-muted);">—</span>'}
        </div>
      </div>
      ${q.notas ? `
        <div class="cm-hist-kv" style="margin-top:8px;">
          <div class="cm-hist-kv-label">Notas</div>
          <div class="cm-hist-kv-val" style="font-weight:500;">${escapeHtml(q.notas)}</div>
        </div>` : ''}
    `;

    modal.classList.remove('cm-hidden');
    if (!_histRestoringCheckpoint) notifyHistBackStatePush('hist_quote_modal');
    saveHistCheckpointNow();
  }

  function openPhotoLightbox(p) {
    const modal = $('hist_photoPreviewModal');
    const titleEl = $('hist_photoPreviewTitle');
    const bodyEl = $('hist_photoPreviewBody');
    if (!modal || !bodyEl || !p) return;

    activeInspectedPhoto = p;
    if (titleEl) titleEl.textContent = `${p.sku} · ${p.nombreProducto}`;

    // ZERO raw Drive URL links or Download buttons (#15/#16)
    bodyEl.innerHTML = `
      <div id="hist_photoCanvasHost" class="cm-img-stage cm-hist-lightbox-stage" style="margin-bottom:10px;">
        ${p.previewUrl
          ? `<img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.nombreProducto)}" draggable="false" referrerpolicy="no-referrer">`
          : '<div class="cm-empty" style="border:none;">—</div>'}
        <span class="creata-img-shield" aria-hidden="true"></span>
      </div>
      <div class="cm-hist-kv-grid">
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">SKU</div><div class="cm-hist-kv-val cm-mono">${escapeHtml(p.sku)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Fecha</div><div class="cm-hist-kv-val cm-tabular">${escapeHtml(p.fechaHora || '—')}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Autor</div><div class="cm-hist-kv-val">${escapeHtml(p.quienSubio)}</div></div>
        <div class="cm-hist-kv"><div class="cm-hist-kv-label">Área</div><div class="cm-hist-kv-val">${escapeHtml(p.puestoSucursal || '—')}</div></div>
      </div>
    `;

    modal.classList.remove('cm-hidden');
    if (!_histRestoringCheckpoint) notifyHistBackStatePush('hist_photo_modal');

    // Use canvas rendering via CreataGuard when available (silent protection, #15)
    const canvasHost = $('hist_photoCanvasHost');
    if (canvasHost && p.previewUrl && global.CreataGuard && typeof global.CreataGuard.renderCanvasImage === 'function') {
      try {
        global.CreataGuard.renderCanvasImage(canvasHost, p.previewUrl, p.nombreProducto);
      } catch (e) {}
    }
    applySilentImageProtection(modal);
    saveHistCheckpointNow();
  }

  function closeModal(kind) {
    if (kind === 'quote') {
      $('hist_quoteInspectModal')?.classList.add('cm-hidden');
      activeInspectedQuote = null;
    } else if (kind === 'photo') {
      $('hist_photoPreviewModal')?.classList.add('cm-hidden');
      activeInspectedPhoto = null;
    }
    saveHistCheckpointNow();
  }

  // ============================================================================
  // NAVEGACIÓN DE PESTAÑAS Y EXPORTACIÓN CSV (SIN URLS DRIVE EN FOTOS)
  // ============================================================================
  function switchHistoryTab(tabName, opts) {
    const options = opts || {};
    if (!state.allowedTabs.includes(tabName)) {
      tabName = state.allowedTabs[0] || 'quotes';
    }
    const prevTab = state.activeTab;
    if (!options.fromBack && !options.silent && prevTab && prevTab !== tabName && state.allowedTabs.includes(prevTab)) {
      if (tabHistory[tabHistory.length - 1] !== prevTab) {
        tabHistory.push(prevTab);
        if (tabHistory.length > 10) tabHistory.shift();
      }
    }
    state.activeTab = tabName;
    const allTabs = ['overview', 'quotes', 'seguimiento', 'historial', 'photos', 'presence'];
    allTabs.forEach(t => {
      const btn = $('hist_tabBtn_' + t);
      const panel = $('hist_tabPanel_' + t);
      if (btn) btn.classList.toggle('is-active', t === tabName);
      if (panel) panel.classList.toggle('cm-hidden', t !== tabName);
    });
    if (!options.fromBack && !options.silent && !_histRestoringCheckpoint && prevTab !== tabName) {
      notifyHistBackStatePush('hist_tab');
    }
    saveHistCheckpointNow();
  }

  function exportActiveHistoryCsv() {
    let filename = 'CREATA_Historial.csv';
    let headers = [];
    let rows = [];

    if (state.activeTab === 'quotes') {
      filename = 'CREATA_Historial_Cotizaciones.csv';
      headers = ['FOLIO', 'ID', 'FECHA', 'TIENDA', 'ASESOR', 'CLIENTE', 'TELEFONO', 'PARTIDAS', 'SKUS', 'SUBTOTAL', 'IVA', 'TOTAL', 'ESTADO'];
      rows = getFilteredQuotes().map(q => [
        q.folioErp, q.idErp, q.fechaHora, q.tiendaErp, q.nombreAsesor,
        q.cliente, q.telefono, q.partidasCant, q.resumenSkus,
        q.subtotalNum.toFixed(2), q.ivaNum.toFixed(2), q.totalNum.toFixed(2), q.segStatus
      ]);
    } else if (state.activeTab === 'seguimiento') {
      filename = 'CREATA_Historial_Seguimiento.csv';
      headers = ['FECHA', 'TIPO', 'ESTADO', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CLIENTE', 'ACCION', 'DETALLE'];
      rows = getFilteredSeguimiento().map(e => [
        e.fecha, e.kind, e.status, e.folio, e.sucursal, e.asesor, e.cliente, e.accion, e.detalle
      ]);
    } else if (state.activeTab === 'photos') {
      filename = 'CREATA_Historial_Fotos.csv';
      headers = ['SKU', 'PRODUCTO', 'AUTOR', 'AREA', 'FECHA'];
      rows = getFilteredPhotos().map(p => [
        p.sku, p.nombreProducto, p.quienSubio, p.puestoSucursal, p.fechaHora
      ]);
    } else if (state.activeTab === 'presence') {
      filename = 'CREATA_Equipo_Estado.csv';
      headers = ['NOMBRE', 'SUCURSAL', 'ROL', 'ESTADO', 'ULTIMA_ACTIVIDAD'];
      rows = getFilteredPresenceUsers().map(u => [
        u.nombre, u.sucursal, u.rol, u.online ? 'Conectado' : 'Desconectado', formatPresenceLastSeen(u.lastSeenMs, u.online)
      ]);
    } else {
      filename = 'CREATA_Bitacora.csv';
      headers = ['FECHA', 'CLASIFICACION', 'MODULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE'];
      rows = getFilteredHistorial().map(r => [
        r.fecha, r.clasificacion, r.modulo, r.evento, r.estado, r.usuario, r.sucursal, r.referencia, r.detalle
      ]);
    }

    const esc = (v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return /[",\n\r]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
    };

    const csvContent = '\uFEFF' + [headers].concat(rows).map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV descargado');
  }

  function showToast(msg) {
    const t = $('hist_toast');
    const m = $('hist_toastMsg');
    if (!t || !m) return;
    m.textContent = msg;
    t.classList.remove('is-hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      const el = $('hist_toast');
      if (el) el.classList.add('is-hidden');
    }, 2600);
  }

  // ============================================================================
  // CHECKPOINT "DÓNDE ME QUEDÉ" (creata_hist_checkpoint_v1, #4)
  // ============================================================================
  function saveHistCheckpointNow() {
    if (!mounted || !_histCheckpointRestoredOnce || _histRestoringCheckpoint) return;
    try {
      const quoteOpen = Boolean(activeInspectedQuote && !$('hist_quoteInspectModal')?.classList.contains('cm-hidden'));
      const photoOpen = Boolean(activeInspectedPhoto && !$('hist_photoPreviewModal')?.classList.contains('cm-hidden'));
      const cp = {
        savedAt: Date.now(),
        userEmail: state.session ? state.session.correo : '',
        activeTab: state.activeTab,
        searchQuery: state.searchQuery,
        historialClassFilter: state.historialClassFilter,
        historialBranchFilter: state.historialBranchFilter,
        quotesStoreFilter: state.quotesStoreFilter,
        quotesStatusFilter: state.quotesStatusFilter,
        segKindFilter: state.segKindFilter,
        segStatusFilter: state.segStatusFilter,
        presenceFilter: state.presenceFilter,
        scrollY: Math.round(global.scrollY || 0),
        containerScrollTop: rootEl ? Math.round(rootEl.scrollTop || 0) : 0,
        openModal: quoteOpen
          ? { type: 'quote', folio: activeInspectedQuote.folioErp }
          : (photoOpen ? { type: 'photo', sku: activeInspectedPhoto.sku, ts: activeInspectedPhoto.ts } : null)
      };
      writeJsonStorage(HIST_CHECKPOINT_KEY, cp);
    } catch (e) {}
  }

  function restoreHistCheckpointOnce() {
    _histCheckpointRestoredOnce = true;
    _histRestoringCheckpoint = true;
    try {
      const cp = readJsonStorage(HIST_CHECKPOINT_KEY, null);
      if (!cp || typeof cp !== 'object' || (cp.userEmail && state.session && cp.userEmail !== state.session.correo)) {
        switchHistoryTab(state.activeTab);
        renderAll();
        _histRestoringCheckpoint = false;
        return;
      }

      if (cp.activeTab && state.allowedTabs.includes(cp.activeTab)) {
        state.activeTab = cp.activeTab;
      }
      if (typeof cp.searchQuery === 'string') {
        state.searchQuery = cp.searchQuery;
        const sInp = $('hist_globalSearch');
        const cBtn = $('hist_btnClearSearch');
        if (sInp) sInp.value = cp.searchQuery;
        if (cBtn) cBtn.classList.toggle('cm-hidden', !cp.searchQuery);
      }
      if (cp.presenceFilter && ['ALL', 'ONLINE', 'OFFLINE'].includes(cp.presenceFilter)) {
        state.presenceFilter = cp.presenceFilter;
      }
      if (cp.quotesStoreFilter) {
        const el = $('hist_quotesStoreSelect');
        if (el && Array.from(el.options).some(o => o.value === cp.quotesStoreFilter)) {
          el.value = cp.quotesStoreFilter;
          state.quotesStoreFilter = cp.quotesStoreFilter;
        }
      }
      if (cp.quotesStatusFilter) {
        const el = $('hist_quotesStatusSelect');
        if (el && Array.from(el.options).some(o => o.value === cp.quotesStatusFilter)) {
          el.value = cp.quotesStatusFilter;
          state.quotesStatusFilter = cp.quotesStatusFilter;
        }
      }
      if (cp.segKindFilter) {
        state.segKindFilter = cp.segKindFilter;
        rootEl?.querySelectorAll('[data-hist-seg-kind]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-seg-kind') === state.segKindFilter);
        });
      }
      if (cp.segStatusFilter) {
        const el = $('hist_segStatusSelect');
        if (el && Array.from(el.options).some(o => o.value === cp.segStatusFilter)) {
          el.value = cp.segStatusFilter;
          state.segStatusFilter = cp.segStatusFilter;
        }
      }
      if (cp.historialClassFilter) {
        state.historialClassFilter = cp.historialClassFilter;
        rootEl?.querySelectorAll('[data-hist-class]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-class') === state.historialClassFilter);
        });
      }
      if (cp.historialBranchFilter) {
        const el = $('hist_historialBranchSelect');
        if (el && Array.from(el.options).some(o => o.value === cp.historialBranchFilter)) {
          el.value = cp.historialBranchFilter;
          state.historialBranchFilter = cp.historialBranchFilter;
        }
      }

      switchHistoryTab(state.activeTab);
      renderAll();

      if (cp.openModal && cp.openModal.type === 'quote' && cp.openModal.folio) {
        const match = state.quoteRows.find(q => q.folioErp === cp.openModal.folio);
        if (match) openQuoteDetailModal(match);
      } else if (cp.openModal && cp.openModal.type === 'photo' && cp.openModal.sku) {
        const matchP = (cp.openModal.ts !== undefined && cp.openModal.ts !== null
          ? state.photoRows.find(p => p.sku === cp.openModal.sku && p.ts === cp.openModal.ts)
          : null) || state.photoRows.find(p => p.sku === cp.openModal.sku);
        if (matchP) openPhotoLightbox(matchP);
      }

      const restoreScroll = () => {
        try {
          if (rootEl && typeof cp.containerScrollTop === 'number' && cp.containerScrollTop > 0) {
            rootEl.scrollTop = cp.containerScrollTop;
          }
          if (typeof cp.scrollY === 'number' && cp.scrollY > 0) {
            global.scrollTo(0, cp.scrollY);
          }
        } catch (e) {
        } finally {
          _histRestoringCheckpoint = false;
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(restoreScroll));
      } else {
        restoreScroll();
      }
    } catch (e) {
      _histRestoringCheckpoint = false;
      switchHistoryTab(state.activeTab);
      renderAll();
    }
  }

  // ============================================================================
  // EVENTOS DELEGADOS (LIMPIADOS EN unmount())
  // ============================================================================
  function bindDelegatedListeners() {
    if (!rootEl) return;

    const onClick = (ev) => {
      const target = ev.target;
      if (!target) return;

      if (target.dataset && target.dataset.histBackdrop) {
        closeModal(target.dataset.histBackdrop);
        return;
      }

      const tabBtn = target.closest ? target.closest('[data-hist-tab]') : null;
      if (tabBtn) {
        switchHistoryTab(tabBtn.getAttribute('data-hist-tab'));
        return;
      }

      const segKindBtn = target.closest ? target.closest('[data-hist-seg-kind]') : null;
      if (segKindBtn) {
        state.segKindFilter = segKindBtn.getAttribute('data-hist-seg-kind') || 'ALL';
        rootEl.querySelectorAll('[data-hist-seg-kind]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-seg-kind') === state.segKindFilter);
        });
        if (state.segKindFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderSeguimientoTab();
        saveHistCheckpointNow();
        return;
      }

      const presenceFilterBtn = target.closest ? target.closest('[data-hist-presence-filter]') : null;
      if (presenceFilterBtn) {
        const nextF = presenceFilterBtn.getAttribute('data-hist-presence-filter') || 'ALL';
        state.presenceFilter = ['ALL', 'ONLINE', 'OFFLINE'].includes(nextF) ? nextF : 'ALL';
        if (state.presenceFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderPresencePanel();
        saveHistCheckpointNow();
        return;
      }

      const classBtn = target.closest ? target.closest('[data-hist-class]') : null;
      if (classBtn) {
        state.historialClassFilter = classBtn.getAttribute('data-hist-class') || 'ALL';
        rootEl.querySelectorAll('[data-hist-class]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-class') === state.historialClassFilter);
        });
        if (state.historialClassFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderHistorialTab();
        saveHistCheckpointNow();
        return;
      }

      const quoteTrigger = target.closest ? target.closest('[data-hist-open-quote]') : null;
      if (quoteTrigger) {
        const idx = parseInt(quoteTrigger.getAttribute('data-hist-open-quote'), 10);
        const list = getFilteredQuotes();
        if (!isNaN(idx) && list[idx]) openQuoteDetailModal(list[idx]);
        return;
      }

      const photoTrigger = target.closest ? target.closest('[data-hist-open-photo]') : null;
      if (photoTrigger) {
        const idx = parseInt(photoTrigger.getAttribute('data-hist-open-photo'), 10);
        const list = getFilteredPhotos();
        if (!isNaN(idx) && list[idx]) openPhotoLightbox(list[idx]);
        return;
      }

      const actBtn = target.closest ? target.closest('[data-hist-action]') : null;
      if (!actBtn) return;
      const action = actBtn.getAttribute('data-hist-action');
      if (action === 'close-module') {
        if (mountOpts && typeof mountOpts.onClose === 'function') mountOpts.onClose();
        else if (mountOpts && typeof mountOpts.onGoHome === 'function') mountOpts.onGoHome();
        else if (typeof global.closeInAppModules === 'function') global.closeInAppModules();
        else if (typeof global.goHomeFromLogo === 'function') global.goHomeFromLogo();
        else global.location.href = './inventario.html';
      } else if (action === 'refresh') {
        syncAllProjectHistory(false);
      } else if (action === 'live-alerts') {
        if (typeof global.toggleLiveAlertsPermission === 'function') {
          global.toggleLiveAlertsPermission();
        }
      } else if (action === 'export-csv') {
        exportActiveHistoryCsv();
      } else if (action === 'clear-search') {
        const inp = $('hist_globalSearch');
        if (inp) inp.value = '';
        state.searchQuery = '';
        _histPrevSearchNonEmpty = false;
        $('hist_btnClearSearch')?.classList.add('cm-hidden');
        renderAll();
        saveHistCheckpointNow();
      } else if (action === 'close-modal') {
        closeModal(actBtn.getAttribute('data-modal'));
      } else if (action === 'download-pdf') {
        downloadHistoryQuoteOriginalPdf();
      }
    };

    const onChange = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute) return;
      const kind = el.getAttribute('data-hist-change');
      if (kind === 'quotes-store') {
        state.quotesStoreFilter = el.value || 'ALL';
        if (state.quotesStoreFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderQuotesTab();
        saveHistCheckpointNow();
      } else if (kind === 'quotes-status') {
        state.quotesStatusFilter = el.value || 'ALL';
        if (state.quotesStatusFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderQuotesTab();
        saveHistCheckpointNow();
      } else if (kind === 'seg-status') {
        state.segStatusFilter = el.value || 'ALL';
        if (state.segStatusFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderSeguimientoTab();
        saveHistCheckpointNow();
      } else if (kind === 'hist-branch') {
        state.historialBranchFilter = el.value || 'ALL';
        if (state.historialBranchFilter !== 'ALL') notifyHistBackStatePush('hist_filter');
        renderHistorialTab();
        saveHistCheckpointNow();
      }
    };

    const onInput = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute) return;
      if (el.getAttribute('data-hist-input') === 'search') {
        const val = el.value || '';
        const nowNonEmpty = Boolean(cleanStr(val));
        if (!_histPrevSearchNonEmpty && nowNonEmpty) {
          notifyHistBackStatePush('hist_search');
        }
        _histPrevSearchNonEmpty = nowNonEmpty;
        $('hist_btnClearSearch')?.classList.toggle('cm-hidden', !val);
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          renderAll();
          saveHistCheckpointNow();
        }, 120);
      }
    };

    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => saveHistCheckpointNow(), 200);
    };

    const onPageHide = () => saveHistCheckpointNow();
    const onBeforeUnload = () => saveHistCheckpointNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveHistCheckpointNow();
      else if (document.visibilityState === 'visible') sendHistPresenceHeartbeat(false);
    };
    const onWindowFocus = () => {
      sendHistPresenceHeartbeat(false);
    };
    const onKeyDown = (ev) => {
      if (!mounted || ev.key !== 'Escape' || ev.__creataEscapeHandled) return;
      if ((mountOpts && mountOpts.backNavManaged) || Boolean(global.__CREATA_INV_BACK_NAV__)) return;
      if (!$('hist_photoPreviewModal')?.classList.contains('cm-hidden')) closeModal('photo');
      else if (!$('hist_quoteInspectModal')?.classList.contains('cm-hidden')) closeModal('quote');
    };

    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('change', onChange);
    rootEl.addEventListener('input', onInput);
    rootEl.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('pagehide', onPageHide);
    global.addEventListener('beforeunload', onBeforeUnload);
    global.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('keydown', onKeyDown);

    boundHandlers = {
      onClick, onChange, onInput, onScroll, onPageHide, onBeforeUnload, onWindowFocus, onVisibilityChange, onKeyDown
    };
  }

  function removeDelegatedListeners() {
    if (!boundHandlers) return;
    if (rootEl) {
      rootEl.removeEventListener('click', boundHandlers.onClick);
      rootEl.removeEventListener('change', boundHandlers.onChange);
      rootEl.removeEventListener('input', boundHandlers.onInput);
      rootEl.removeEventListener('scroll', boundHandlers.onScroll);
    }
    global.removeEventListener('scroll', boundHandlers.onScroll);
    global.removeEventListener('pagehide', boundHandlers.onPageHide);
    global.removeEventListener('beforeunload', boundHandlers.onBeforeUnload);
    global.removeEventListener('focus', boundHandlers.onWindowFocus);
    document.removeEventListener('visibilitychange', boundHandlers.onVisibilityChange);
    document.removeEventListener('keydown', boundHandlers.onKeyDown);
    boundHandlers = null;
  }

  function resetHistInMemoryState() {
    _histSyncSeq++;
    state.syncInFlight = false;
    state.session = null;
    state.quoteRows = [];
    state.seguimientoEntries = [];
    state.historialRows = [];
    state.photoRows = [];
    state.presenceUsers = [];
    state.presenceOnlineCount = 0;
    state.presenceOfflineCount = 0;
    state.presenceServerTimeMs = 0;
    state.erpLiveCellText = '';
    state.openModal = null;
    state.activeQuoteForModal = null;
    activeInspectedQuote = null;
    activeInspectedPhoto = null;
    tabHistory = [];
    _histPrevSearchNonEmpty = false;
  }

  function isHistModalVisible(id) {
    const el = $(id);
    return Boolean(el && !el.classList.contains('cm-hidden'));
  }

  function hasActiveOverlay() {
    if (!mounted) return false;
    return isHistModalVisible('hist_photoPreviewModal') || isHistModalVisible('hist_quoteInspectModal');
  }

  function hasActiveTabFilters() {
    if (!mounted) return false;
    if (state.activeTab === 'quotes') {
      return Boolean(
        (state.quotesStoreFilter && state.quotesStoreFilter !== 'ALL') ||
        (state.quotesStatusFilter && state.quotesStatusFilter !== 'ALL')
      );
    }
    if (state.activeTab === 'seguimiento') {
      return Boolean(
        (state.segKindFilter && state.segKindFilter !== 'ALL') ||
        (state.segStatusFilter && state.segStatusFilter !== 'ALL')
      );
    }
    if (state.activeTab === 'historial') {
      return Boolean(
        (state.historialClassFilter && state.historialClassFilter !== 'ALL') ||
        (state.historialBranchFilter && state.historialBranchFilter !== 'ALL')
      );
    }
    if (state.activeTab === 'presence') {
      return Boolean(state.presenceFilter && state.presenceFilter !== 'ALL');
    }
    return false;
  }

  function resetActiveTabFilters() {
    if (state.activeTab === 'quotes') {
      state.quotesStoreFilter = 'ALL';
      state.quotesStatusFilter = 'ALL';
      const stSel = $('hist_quotesStoreSelect');
      const statusSel = $('hist_quotesStatusSelect');
      if (stSel) stSel.value = 'ALL';
      if (statusSel) statusSel.value = 'ALL';
      renderQuotesTab();
      saveHistCheckpointNow();
      return true;
    }
    if (state.activeTab === 'seguimiento') {
      state.segKindFilter = 'ALL';
      state.segStatusFilter = 'ALL';
      if (rootEl) {
        rootEl.querySelectorAll('[data-hist-seg-kind]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-seg-kind') === 'ALL');
        });
      }
      const statusSel = $('hist_segStatusSelect');
      if (statusSel) statusSel.value = 'ALL';
      renderSeguimientoTab();
      saveHistCheckpointNow();
      return true;
    }
    if (state.activeTab === 'historial') {
      state.historialClassFilter = 'ALL';
      state.historialBranchFilter = 'ALL';
      if (rootEl) {
        rootEl.querySelectorAll('[data-hist-class]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-hist-class') === 'ALL');
        });
      }
      const brSel = $('hist_historialBranchSelect');
      if (brSel) brSel.value = 'ALL';
      renderHistorialTab();
      saveHistCheckpointNow();
      return true;
    }
    if (state.activeTab === 'presence') {
      state.presenceFilter = 'ALL';
      renderPresencePanel();
      saveHistCheckpointNow();
      return true;
    }
    return false;
  }

  function getBackDepthWeight() {
    if (!mounted) return 0;
    let w = 1; // module view itself
    const sInp = $('hist_globalSearch');
    if (cleanStr(state.searchQuery) || cleanStr(sInp ? sInp.value : '')) w += 1;
    if (hasActiveTabFilters()) w += 1;
    const defaultTab = (Array.isArray(state.allowedTabs) && state.allowedTabs[0]) || 'quotes';
    if (tabHistory.length > 0) w += tabHistory.length;
    else if (state.activeTab && state.activeTab !== defaultTab) w += 1;
    return w;
  }

  function handleBackAction(opts) {
    if (!mounted) return { handled: false, action: '' };
    const options = opts && typeof opts === 'object' ? opts : {};
    const phase = options.phase || 'all';

    if (phase === 'overlay' || phase === 'all') {
      if (isHistModalVisible('hist_photoPreviewModal')) {
        closeModal('photo');
        return { handled: true, action: 'hist_photo_modal' };
      }
      if (isHistModalVisible('hist_quoteInspectModal')) {
        closeModal('quote');
        return { handled: true, action: 'hist_quote_modal' };
      }
      if (phase === 'overlay') {
        return { handled: false, action: '' };
      }
    }

    if (phase === 'view' || phase === 'all') {
      const inp = $('hist_globalSearch');
      const curSearch = cleanStr(state.searchQuery) || cleanStr(inp ? inp.value : '');
      if (curSearch) {
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }
        if (inp) inp.value = '';
        state.searchQuery = '';
        _histPrevSearchNonEmpty = false;
        $('hist_btnClearSearch')?.classList.add('cm-hidden');
        renderAll();
        saveHistCheckpointNow();
        return { handled: true, action: 'hist_search', toast: 'Búsqueda limpiada' };
      }

      if (hasActiveTabFilters()) {
        resetActiveTabFilters();
        return { handled: true, action: 'hist_filters', toast: 'Filtros restablecidos' };
      }

      const defaultTab = (Array.isArray(state.allowedTabs) && state.allowedTabs[0]) || 'quotes';
      let targetTab = '';
      while (tabHistory.length > 0) {
        const candidate = tabHistory.pop();
        if (candidate && candidate !== state.activeTab && state.allowedTabs.includes(candidate)) {
          targetTab = candidate;
          break;
        }
      }
      if (!targetTab && state.activeTab && state.activeTab !== defaultTab && state.allowedTabs.includes(defaultTab)) {
        targetTab = defaultTab;
      }
      if (targetTab) {
        switchHistoryTab(targetTab, { fromBack: true });
        return { handled: true, action: 'hist_tab', toast: 'Pestaña anterior' };
      }

      if (mountOpts && typeof mountOpts.onClose === 'function') {
        mountOpts.onClose();
      } else if (mountOpts && typeof mountOpts.onGoHome === 'function') {
        mountOpts.onGoHome();
      } else if (typeof global.closeInAppModules === 'function') {
        global.closeInAppModules();
      }
      return { handled: true, action: 'hist_close_module', toast: 'Volviendo al inventario' };
    }

    return { handled: false, action: '' };
  }

  // ============================================================================
  // CONTRATO PÚBLICO: window.CreataHistorialModule
  // ============================================================================
  function mount(targetEl, opts) {
    if (global.CreataGuard && global.CreataGuard.blocked) return false;
    if (!targetEl) return false;

    if (mounted) unmount();
    resetHistInMemoryState();

    mountOpts = opts && typeof opts === 'object' ? opts : {};
    const adopted = adoptSessionSync(mountOpts.session);

    if (!adopted) {
      if (typeof mountOpts.onClose === 'function') {
        mountOpts.onClose();
        return false;
      }
      rootEl = targetEl;
      mounted = true;
      rootEl.innerHTML = `
        <header class="cm-topbar">
          <div class="cm-topbar-inner">
            <div class="cm-topbar-left">
              <button type="button" class="cm-btn cm-btn-back" data-hist-action="close-module">← Volver</button>
              <h1 class="cm-title">Historial</h1>
            </div>
          </div>
        </header>
      `;
      bindDelegatedListeners();
      return false;
    }

    rootEl = targetEl;
    mounted = true;
    _histCheckpointRestoredOnce = false;
    _histRestoringCheckpoint = false;

    state.session = adopted;
    state.role = adopted.role;
    state.allowedTabs = adopted.isAdmin
      ? ['overview', 'quotes', 'seguimiento', 'historial', 'photos']
      : ['quotes', 'seguimiento', 'presence'];
    state.activeTab = adopted.isAdmin ? 'overview' : 'quotes';
    state.searchQuery = '';
    state.historialClassFilter = 'ALL';
    state.historialBranchFilter = 'ALL';
    state.quotesStoreFilter = 'ALL';
    state.quotesStatusFilter = 'ALL';
    state.segKindFilter = 'ALL';
    state.segStatusFilter = 'ALL';
    state.presenceFilter = 'ALL';

    rootEl.innerHTML = buildModuleMarkup();
    const scopeChip = $('hist_scopeChip');
    if (scopeChip) {
      scopeChip.textContent = adopted.isAdmin
        ? 'Global'
        : (adopted.isManager ? adopted.branchLabel : adopted.nombre);
    }

    bindDelegatedListeners();

    // Visually pre-apply saved activeTab & searchQuery WITHOUT setting _histCheckpointRestoredOnce = true
    const preCp = readJsonStorage(HIST_CHECKPOINT_KEY, null);
    if (preCp && typeof preCp === 'object' && (!preCp.userEmail || preCp.userEmail === adopted.correo)) {
      if (preCp.activeTab && state.allowedTabs.includes(preCp.activeTab)) {
        state.activeTab = preCp.activeTab;
      }
      if (typeof preCp.searchQuery === 'string') {
        state.searchQuery = preCp.searchQuery;
        _histPrevSearchNonEmpty = Boolean(cleanStr(preCp.searchQuery));
        const sInp = $('hist_globalSearch');
        const cBtn = $('hist_btnClearSearch');
        if (sInp) sInp.value = preCp.searchQuery;
        if (cBtn) cBtn.classList.toggle('cm-hidden', !preCp.searchQuery);
      }
    }
    switchHistoryTab(state.activeTab, { silent: true });

    sendHistPresenceHeartbeat(true);
    syncAllProjectHistory(false);

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (mounted && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
        sendHistPresenceHeartbeat(false);
        syncAllProjectHistory(true);
      }
    }, AUTO_REFRESH_MS);

    return true;
  }

  function unmount() {
    if (!mounted) return;
    saveHistCheckpointNow();

    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
    if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

    removeDelegatedListeners();

    if (rootEl) rootEl.innerHTML = '';
    rootEl = null;
    mounted = false;
    _histCheckpointRestoredOnce = false;
    _histRestoringCheckpoint = false;
    resetHistInMemoryState();
  }

  function saveCheckpoint() {
    saveHistCheckpointNow();
  }

  function refresh() {
    if (!mounted) return Promise.resolve();
    return syncAllProjectHistory(false);
  }

  function isMounted() {
    return mounted;
  }

  global.CreataHistorialModule = {
    mount,
    unmount,
    saveCheckpoint,
    refresh,
    isMounted,
    handleBackAction,
    hasActiveOverlay,
    getBackDepthWeight
  };
})(window);
