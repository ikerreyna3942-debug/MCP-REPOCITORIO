/*
 * CREATA Muebles — Módulo In-App de Seguimiento de Cotizaciones (seguimiento-app.js)
 * Expone exclusivamente window.CreataSeguimientoModule = { mount, unmount, saveCheckpoint, refresh, isMounted }.
 */
(function (global) {
  'use strict';

  const SHEET_SEG_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';
  const SHEET_INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

  const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
  const APP_QUOTES_BRIDGE_KEY = 'creata_live_app_quotes_bridge_v1';
  const SEG_CLOSURES_CACHE_KEY = 'creata_seg_closures_v1';
  const SEG_PHONES_CACHE_KEY = 'creata_seg_phones_v1';
  const SEG_CONTACTED_CACHE_KEY = 'creata_seg_contacted_v1';
  const SEG_AUDIT_CACHE_KEY = 'creata_seg_audit_v1';
  const SEG_DIRECTORY_CACHE_KEY = 'creata_seg_dir_cache_v1';
  const SEG_LIVE_SNAPSHOT_KEY = 'creata_seg_live_snapshot_v1';
  const SEG_OFFLINE_OUTBOX_KEY = 'creata_seg_offline_outbox_v1';
  const SEG_UI_CHECKPOINT_KEY = 'creata_seg_ui_checkpoint_v1';

  const POLL_INTERVAL_MS = 60000;

  const SUCURSAL_RULES = {
    'PLAYA': {
      label: 'Playa del Carmen',
      erp_cotizacion_sucursal: 'CREATA LIVING PLAYA',
      cedis: 'CEDIS',
      tienda: 'CREATA LIVING PLAYA',
      descripcion_regla: 'CEDIS + Tienda Playa del Carmen'
    },
    'COLOSIO': {
      label: 'Colosio',
      erp_cotizacion_sucursal: 'CREATA LIVING COLOSIO',
      cedis: 'CEDIS',
      tienda: 'CREATA LIVING COLOSIO',
      descripcion_regla: 'CEDIS + Tienda Colosio'
    },
    'PUERTO CANCUN': {
      label: 'Puerto Cancún (PTC)',
      erp_cotizacion_sucursal: 'CREATA PUERTO CANCUN',
      cedis: 'CEDIS',
      tienda: 'CREATA PUERTO CANCUN',
      descripcion_regla: 'CEDIS + Tienda Puerto Cancún'
    },
    'CASA CREATA': {
      label: 'Casa Creata',
      erp_cotizacion_sucursal: 'CASA CREATA BONAMPAK',
      cedis: 'CEDIS',
      tienda: 'CASA CREATA BONAMPAK',
      descripcion_regla: 'CEDIS + Tienda Casa Creata'
    },
    'PROYECTOS': {
      label: 'Proyectos',
      erp_cotizacion_sucursal: 'PROYECTOS ANIPA INTERIOR',
      cedis: 'CEDIS',
      tienda: null,
      descripcion_regla: 'Solo CEDIS'
    }
  };

  let mounted = false;
  let rootEl = null;
  let mountOpts = {};
  let _segUiCheckpointRestoredOnce = false;
  let _segRestoringCheckpoint = false;
  let _pendingSegCheckpointRestore = null;
  let _segFlushingOutbox = false;
  let _segFetchSeq = 0;
  let _segDeltaVersion = 0;
  let _segDeltaInvVersion = '';
  let _segRowWatermarks = { cotCreata: 0, cotArchivadas: 0, cotVivo: 0, cierres: 0, histMov: 0, histSeg: 0 };
  let _segDeltaUnsupported = false;
  let _segDirCacheMem = null;
  let _segDirFetchedAt = 0;
  const SEG_DIR_TTL_MS = 30 * 60 * 1000;

  let pollIntervalId = null;
  let scrollTimer = null;
  let toastTimer = null;
  let searchDebounceTimer = null;
  let _segPrevSearchNonEmpty = false;

  let boundHandlers = null;

  function notifySegBackStatePush(reason) {
    try {
      if (mountOpts && typeof mountOpts.onBackStatePush === 'function') {
        mountOpts.onBackStatePush(reason || 'seg_state');
      }
    } catch (e) {}
  }

  let APP_STATE = {
    user: null,
    quotes: [],
    rawPartidas: [],
    sucursales: SUCURSAL_RULES,
    advisors: [],
    directoryRecords: [],
    inventoryBySku: {},
    inventoryByName: {},
    closures: {},
    auditLogs: [],
    appCreatedFolios: [],
    config: {
      DIAS_SEGUIMIENTO: 3,
      UMBRAL_CAIDA_PORCENTAJE: 30,
      UMBRAL_PIEZAS_CRITICO: 5,
      ALERTA_SOLO_PISO: 'SI'
    },
    last_erp_sync: 'En vivo'
  };

  let ACTIVE_VIEW_MODE = 'ACTIVAS';
  let ACTIVE_MODAL_QUOTE = null;
  let ACTIVE_RECIPIENT = 'CLIENTE';
  let ACTIVE_MODAL_TPL_KEY = 'EMOCIONAL';
  let SELECTED_ITEMS_SET = new Set();
  let ACTIVE_CLOSE_FOLIO = null;
  let ACTIVE_CLOSE_STATUS = 'GANADA';

  let AUDIT_STATE = {
    activeTab: 'LOGINS',
    logs: []
  };

  // ============================================================================
  // UTILIDADES GENERALES Y SELECTOR AISLADO
  // ============================================================================
  function $(id) {
    return rootEl ? rootEl.querySelector('#' + id) : null;
  }

  function cleanStr(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(txt) {
    return cleanStr(txt)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeEmail(raw) {
    return cleanStr(raw).toLowerCase().replace(/,/g, '.');
  }

  function cleanPhone(val) {
    const digits = cleanStr(val).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
    if (digits.length >= 10) return digits.slice(-10);
    return '';
  }

  function extractDriveFileId(raw) {
    const s = cleanStr(raw);
    if (!s) return '';
    const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
    return m ? m[1] : '';
  }

  function resolveProductPhoto(raw) {
    const s = cleanStr(raw);
    if (!s) return { driveId: '', thumbUrl: '', fullUrl: '' };
    const fid = extractDriveFileId(s);
    if (fid) {
      return {
        driveId: fid,
        thumbUrl: `https://lh3.googleusercontent.com/d/${fid}=w400`,
        fullUrl: `https://lh3.googleusercontent.com/d/${fid}=w1000`
      };
    }
    if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) {
      return { driveId: '', thumbUrl: s, fullUrl: s };
    }
    return { driveId: '', thumbUrl: '', fullUrl: '' };
  }

  function getItemPhotoMeta(it) {
    if (!it) return { driveId: '', thumbUrl: '', fullUrl: '' };
    const directUrl = cleanStr(it.Foto_Url || it.fotoUrl || it.photoUrl);
    const directThumb = cleanStr(it.Foto_Thumb || it.fotoThumb);
    const directId = cleanStr(it.Foto_Drive_Id || it.fotoId || extractDriveFileId(directUrl));
    if (directUrl) {
      return {
        driveId: directId,
        thumbUrl: directThumb || (directId ? `https://lh3.googleusercontent.com/d/${directId}=w400` : directUrl),
        fullUrl: directId ? `https://lh3.googleusercontent.com/d/${directId}=w1000` : directUrl
      };
    }
    const sku = cleanStr(it.Clave_Producto || it.sku).toUpperCase();
    const bySku = sku ? APP_STATE.inventoryBySku[sku] : null;
    if (bySku && (bySku.fotoUrl || bySku.fotoRaw)) {
      const p = bySku.fotoUrl
        ? { driveId: bySku.fotoId || '', thumbUrl: bySku.fotoThumb || bySku.fotoUrl, fullUrl: bySku.fotoUrl }
        : resolveProductPhoto(bySku.fotoRaw);
      if (p.fullUrl) return p;
    }
    const nNorm = normalizeText(it.Nombre_Producto || it.name);
    const byName = nNorm ? APP_STATE.inventoryByName[nNorm] : null;
    if (byName && (byName.fotoUrl || byName.fotoRaw)) {
      const p = byName.fotoUrl
        ? { driveId: byName.fotoId || '', thumbUrl: byName.fotoThumb || byName.fotoUrl, fullUrl: byName.fotoUrl }
        : resolveProductPhoto(byName.fotoRaw);
      if (p.fullUrl) return p;
    }
    return { driveId: '', thumbUrl: '', fullUrl: '' };
  }

  function formatNowStr(includeSeconds) {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return includeSeconds ? `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}` : `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function isErpStatusClosed(statusRaw) {
    const s = normalizeText(statusRaw || '').toUpperCase();
    if (!s) return false;
    return /(VENDID|FACTURAD|PEDIDO|CERRAD|CANCELAD|ANULAD|RECHAZAD|CONCRETAD|CONVERTID)/.test(s);
  }

  function resolveAutoClosureFromErpStatus(statusRaw) {
    const s = normalizeText(statusRaw || '').toUpperCase();
    if (!isErpStatusClosed(s)) return null;
    if (/(CANCELAD|ANULAD|RECHAZAD)/.test(s)) {
      return {
        Estatus_Cierre: 'CANCELADA',
        Motivo_Cierre: `Cancelada en S Mueblería (${cleanStr(statusRaw) || 'Cancelada'})`,
        Archivo_Origen: 'ERP'
      };
    }
    return {
      Estatus_Cierre: 'GANADA',
      Motivo_Cierre: `Venta concretada en S Mueblería (${cleanStr(statusRaw) || 'Vendido'})`,
      Archivo_Origen: 'ERP'
    };
  }

  function parseCsvSimple(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else if (ch === '\n') {
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
  }

  async function fetchSheetCsv(sheetId, sheetName, rangeOpt) {
    const rangeParam = rangeOpt ? `&range=${encodeURIComponent(rangeOpt)}` : '';
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}${rangeParam}&_t=${Date.now()}`;
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp || !resp.ok) return [];
      const txt = await resp.text();
      if (!txt || txt.trim().startsWith('<')) return [];
      return parseCsvSimple(txt);
    } catch (e) {
      return [];
    }
  }

  function getWebAppUrl() {
    // P0-02: usar siempre CANONICAL_WEBAPP_URL para evitar desvío de credenciales/acciones
    return CANONICAL_WEBAPP_URL;
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

  const SEG_PRESENCE_DEVICE_KEY = 'creata_inv_presence_dev_v1';
  let _segLastHeartbeatMs = 0;

  function getSegPresenceDeviceId() {
    try {
      let id = localStorage.getItem(SEG_PRESENCE_DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(SEG_PRESENCE_DEVICE_KEY, id);
      }
      return id;
    } catch (e) {
      return 'dev_mem_seg';
    }
  }

  function persistSegRenewedToken(newToken) {
    const tok = cleanStr(newToken);
    if (!tok) return;
    if (APP_STATE.user) APP_STATE.user.authToken = tok;
    const targetEmail = normalizeEmail((APP_STATE.user && APP_STATE.user.correo) || '');
    if (!targetEmail) return;
    const keys = [INV_SESSION_KEY, 'creata_private_kevin_panel_v1', 'creata_private_kevin_fotos_v1', 'creata_private_kevin_hist_v1'];
    for (let i = 0; i < keys.length; i++) {
      const obj = readJsonStorage(keys[i], null);
      if (obj && normalizeEmail(obj.correo) === targetEmail) {
        obj.authToken = tok;
        writeJsonStorage(keys[i], obj);
      }
    }
  }

  async function callWebAppPost(payload, timeoutMs) {
    const targetUrl = getWebAppUrl();
    const invSess = readJsonStorage(INV_SESSION_KEY, null) || {};
    const token = cleanStr((APP_STATE.user && APP_STATE.user.authToken) || invSess.authToken || '');
    const email = normalizeEmail((APP_STATE.user && APP_STATE.user.correo) || invSess.correo || '');
    const enriched = Object.assign(
      { authToken: token, advisorEmail: email },
      payload || {}
    );

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 10000) : null;
    try {
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(enriched),
        signal: controller ? controller.signal : undefined
      });
      if (!resp || !resp.ok) return { ok: false, unavailable: true };
      const json = await resp.json();
      if (json && json.renewedAuthToken) persistSegRenewedToken(json.renewedAuthToken);
      return json || { ok: false, unavailable: true };
    } catch (e) {
      return { ok: false, unavailable: true, error: String(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function sendSegPresenceHeartbeat(forceNow) {
    if (!mounted || !APP_STATE.user || !cleanStr(APP_STATE.user.correo)) return;
    if (global.CreataGuard && (global.CreataGuard.blocked || global.CreataGuard.isBlocked)) return;
    const now = Date.now();
    if (!forceNow && (now - _segLastHeartbeatMs) < 45000) return;
    if (!forceNow && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const invSess = readJsonStorage(INV_SESSION_KEY, null) || {};
    const token = cleanStr(APP_STATE.user.authToken || invSess.authToken || '');
    if (!token) return;
    _segLastHeartbeatMs = now;
    callWebAppPost({
      action: 'inv_presence_heartbeat',
      authToken: token,
      advisorEmail: APP_STATE.user.correo,
      correo: APP_STATE.user.correo,
      nombre: APP_STATE.user.nombre || APP_STATE.user.correo,
      puesto: APP_STATE.user.puesto || '',
      sheetTab: cleanStr(APP_STATE.user.sheet_tab || invSess.sheetTab || ''),
      erpStore: cleanStr(APP_STATE.user.sucursal_label || invSess.erpStore || APP_STATE.user.sucursal || ''),
      deviceId: getSegPresenceDeviceId(),
      vista: 'seguimiento',
      view: 'seguimiento',
      page: 'seguimiento'
    }, 8000).catch(() => {});
  }

  function applySilentImageProtection(target) {
    try {
      if (global.CreataGuard && typeof global.CreataGuard.protectImages === 'function' && target) {
        global.CreataGuard.protectImages(target);
      }
    } catch (e) {}
  }

  // ============================================================================
  // ROLES, SUCURSALES Y ADOPCIÓN DE SESIÓN (CERO RE-LOGIN, CERO SECRETOS)
  // ============================================================================
  function mapTabToBranchKey(tabOrBranch) {
    const u = normalizeText(tabOrBranch);
    if (u.includes('ADMINISTRATIV') || u === 'TODAS' || u === 'ADMIN') return 'TODAS';
    if (u.includes('PLAYA') || u === 'PL') return 'PLAYA';
    if (u.includes('COLOSIO') || u.includes('COLOCIO') || u.includes('OUTLET') || u === 'DTC' || u === 'OUT') return 'COLOSIO';
    if (u.includes('PTC') || u.includes('PUERTO')) return 'PUERTO CANCUN';
    if (u.includes('CASA') || u === 'CCB') return 'CASA CREATA';
    if (u.includes('PROYECTO') || u === 'PRO') return 'PROYECTOS';
    return 'PROYECTOS';
  }

  function getBranchLabel(branchKey) {
    if (branchKey === 'TODAS') return 'Todas';
    return (SUCURSAL_RULES[branchKey] && SUCURSAL_RULES[branchKey].label) || branchKey;
  }

  function isMasterExecutive(correo, puesto, sucursal) {
    const c = normalizeEmail(correo);
    const p = normalizeText(puesto);
    const s = normalizeText(sucursal);
    if (['kevin.reyna@grupoanipa.com', 'santiago.torres@grupoanipa.com', 'preci3942@gmail.com'].includes(c)) {
      return true;
    }
    if (s.includes('ADMINISTRATIV') || s === 'TODAS') return true;
    if (['DIRECCION', 'DIRECTOR', 'ADMINISTRADOR', 'GERENCIA GENERAL', 'GERENTE COMERCIAL', 'IMPLEMENTACION'].some(k => p.includes(k))) {
      if (!p.includes('PROYECTOS')) return true;
    }
    return false;
  }

  function isGerenteRole(puesto, isMaster) {
    if (isMaster) return true;
    const p = normalizeText(puesto);
    return ['GERENTE', 'COORDINADOR', 'ENCARGAD', 'LIDER', 'JEFE', 'DIRECT'].some(k => p.includes(k));
  }

  function isKevinReyna(user) {
    if (!user) return false;
    const c = normalizeEmail(user.correo);
    const n = normalizeText(user.nombre);
    const p = normalizeText(user.puesto);
    return c === 'kevin.reyna@grupoanipa.com' || n.includes('KEVIN REYNA') || p === 'IMPLEMENTACION';
  }

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
    const puesto = cleanStr(s.puesto) || 'Asesor Interiorista';
    const rawBranch = cleanStr(s.sheetTab || s.erpStore || s.branchKey || s.sucursal);
    const forcedAdvisor = Boolean(s.forceAdvisorPreview === true);
    const isMaster = forcedAdvisor
      ? false
      : Boolean(s.isAdmin || s.is_master || s.es_admin || isMasterExecutive(correo, puesto, rawBranch));
    // P1-07: verificar permiso VER_SEGUIMIENTO antes de montar el módulo
    if (isMaster && s.adminPermissions && s.adminPermissions.seguimiento === false) return null;
    if (!isMaster && s.userPermissions && s.userPermissions.seguimiento === false) return null;

    const allBranches = forcedAdvisor
      ? [mapTabToBranchKey(rawBranch)]
      : (Array.isArray(s.allLocations) && s.allLocations.length
        ? Array.from(new Set(s.allLocations.map(l => mapTabToBranchKey((l && (l.sheetTab || l.erpStore)) || '')).filter(b => b && b !== 'TODAS')))
        : (Array.isArray(s.all_branches) && s.all_branches.length
          ? s.all_branches.map(mapTabToBranchKey).filter(b => b && b !== 'TODAS')
          : (isMaster ? [] : [mapTabToBranchKey(rawBranch)])));
    const primaryBranch = isMaster ? 'TODAS' : (mapTabToBranchKey(rawBranch) || allBranches[0] || 'PROYECTOS');
    // P1-07: tener múltiples tiendas asignadas NO promueve automáticamente a Gerente
    const esGerente = forcedAdvisor
      ? false
      : Boolean(s.isManager || s.es_gerente || isMaster || isGerenteRole(puesto, isMaster));

    return {
      nombre: cleanStr(s.nombre) || correo,
      correo,
      telefono: cleanPhone(s.telefono || ''),
      sucursal: primaryBranch,
      sucursal_label: isMaster
        ? 'Todas'
        : (allBranches.length > 1 ? allBranches.map(getBranchLabel).join(' / ') : (cleanStr(s.branchLabel) || getBranchLabel(primaryBranch))),
      all_branches: allBranches,
      puesto,
      sheet_tab: cleanStr(s.sheetTab || s.sheet_tab) || primaryBranch,
      es_gerente: esGerente,
      es_admin: isMaster,
      is_master: isMaster,
      force_advisor_preview: forcedAdvisor,
      authToken: cleanStr(s.authToken || ''),
      debe_cambiar_password: false
    };
  }

  async function fetchUnifiedAdvisorsDirectory(forceRefresh) {
    if (!forceRefresh && _segDirCacheMem && _segDirFetchedAt > 0 && (Date.now() - _segDirFetchedAt) < SEG_DIR_TTL_MS) {
      return _segDirCacheMem;
    }
    // P1-13: No consultar por GViz público el libro privado SHEET_SEG_ID; usar la fuente unificada CUENTAS ADMINISTRATIVAS
    const invTabs = [
      { tab: 'CUENTAS ADMINISTRATIVAS', branch: 'UNIFIED', range: 'A1:Z100' }
    ];

    const invResults = await Promise.all(
      invTabs.map(async t => ({ ...t, source: 'INV', rows: await fetchSheetCsv(SHEET_INV_ID, t.tab, t.range || 'A1:Z100') }))
    );

    const UNIFIED_SEG_STORE_COLS = [
      { colIndex: 21, headers: ['COLOCIO', 'COLOSIO', 'TIENDA_COLOCIO', 'TIENDA_COLOSIO'], branch: 'COLOSIO', tab: 'COLOCIO' },
      { colIndex: 22, headers: ['PLAYA', 'TIENDA_PLAYA'], branch: 'PLAYA', tab: 'PLAYA' },
      { colIndex: 23, headers: ['PTC', 'PUERTO_CANCUN', 'TIENDA_PTC'], branch: 'PUERTO CANCUN', tab: 'PTC' },
      { colIndex: 24, headers: ['CASA_CREATA', 'TIENDA_CASA_CREATA'], branch: 'CASA CREATA', tab: 'CASA CREATA' },
      { colIndex: 25, headers: ['PROYECTOS', 'TIENDA_PROYECTOS'], branch: 'PROYECTOS', tab: 'PROYECTOS' }
    ];

    const records = [];
    const allTabResults = invResults;

    for (const res of allTabResults) {
      const rows = res.rows || [];
      const isUnifiedInv = (res.source === 'INV' && res.branch === 'UNIFIED');
      let unifiedHdr = [];
      const colByBranch = {};
      if (isUnifiedInv) {
        for (let h = 0; h < Math.min(rows.length, 4); h++) {
          const hr = rows[h] || [];
          if (/^CORREO/i.test(cleanStr(hr[4])) || /^NOMBRE/i.test(cleanStr(hr[2]))) {
            unifiedHdr = hr;
            break;
          }
        }
        for (let c = 0; c < unifiedHdr.length; c++) {
          const norm = cleanStr(unifiedHdr[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (!norm) continue;
          UNIFIED_SEG_STORE_COLS.forEach(def => {
            if (def.headers.includes(norm)) colByBranch[def.branch] = c;
          });
        }
      }

      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx] || [];
        const nombre = cleanStr(r[2]);
        const puesto = cleanStr(r[3]) || 'Asesor Interiorista';
        const correo = normalizeEmail(r[4]);
        if (!nombre || !correo || !correo.includes('@')) continue;
        if (['NOMBRE', 'ASESOR', 'EJECUTIVO'].includes(normalizeText(nombre))) continue;

        if (isUnifiedInv) {
          const colB = cleanStr(r[1]);
          const areaUp = normalizeText(colB);
          const puestoUp = normalizeText(puesto);
          const isTrueAdmin = (
            correo === 'kevin.reyna@grupoanipa.com' ||
            correo === 'santiago.torres@grupoanipa.com' ||
            /ADMINISTRACI[OÓ]N|ADMINISTRADOR|ADMIN GENERAL/.test(areaUp) ||
            /ADMINISTRADOR|ADMINISTRACI[OÓ]N|DIRECCI[OÓ]N|GERENCIA GENERAL/.test(puestoUp)
          );
          const esGerente = isGerenteRole(puesto, isTrueAdmin);
          const assigned = [];
          for (let k = 0; k < UNIFIED_SEG_STORE_COLS.length; k++) {
            const def = UNIFIED_SEG_STORE_COLS[k];
            const cIdx = (colByBranch[def.branch] !== undefined) ? colByBranch[def.branch] : def.colIndex;
            const rawFlag = cleanStr(r[cIdx]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            if (/^(SI|YES|TRUE|1|X|OK)$/.test(rawFlag)) {
              assigned.push(def);
            }
          }
          if (isTrueAdmin) {
            records.push({
              source: res.source,
              sheet_tab: 'CUENTAS ADMINISTRATIVAS',
              sucursal: 'TODAS',
              sucursal_label: getBranchLabel('TODAS'),
              nombre,
              puesto,
              correo,
              telefono: '',
              es_gerente: false,
              es_admin: true,
              is_master: true,
              tokens: normalizeText(nombre).split(' ').filter(t => t.length > 2)
            });
          } else {
            const targets = assigned.length
              ? assigned
              : [{ branch: mapTabToBranchKey(colB) || 'PROYECTOS', tab: colB || 'PROYECTOS' }];
            for (let tIdx = 0; tIdx < targets.length; tIdx++) {
              const stDef = targets[tIdx];
              records.push({
                source: res.source,
                sheet_tab: stDef.tab,
                sucursal: stDef.branch,
                sucursal_label: getBranchLabel(stDef.branch),
                nombre,
                puesto,
                correo,
                telefono: '',
                es_gerente: esGerente,
                es_admin: false,
                is_master: false,
                tokens: normalizeText(nombre).split(' ').filter(t => t.length > 2)
              });
            }
          }
          continue;
        }

        const isMaster = isMasterExecutive(correo, puesto, res.tab);
        const esGerente = isGerenteRole(puesto, isMaster);
        const sucursalKey = isMaster && res.branch === 'TODAS' ? 'TODAS' : res.branch;

        records.push({
          source: res.source,
          sheet_tab: res.tab,
          sucursal: sucursalKey,
          sucursal_label: getBranchLabel(sucursalKey),
          nombre,
          puesto,
          correo,
          telefono: '',
          es_gerente: esGerente,
          es_admin: isMaster,
          is_master: isMaster,
          tokens: normalizeText(nombre).split(' ').filter(t => t.length > 2)
        });
      }
    }

    if (records.length > 0) {
      writeJsonStorage(SEG_DIRECTORY_CACHE_KEY, records);
    } else {
      const cachedDirRecords = readJsonStorage(SEG_DIRECTORY_CACHE_KEY, []);
      if (Array.isArray(cachedDirRecords)) {
        for (const cr of cachedDirRecords) {
          if (!cr || !cr.correo) continue;
          records.push({
            ...cr,
            correo: normalizeEmail(cr.correo),
            tokens: Array.isArray(cr.tokens) ? cr.tokens : normalizeText(cr.nombre).split(' ').filter(t => t.length > 2)
          });
        }
      }
    }

    const byEmail = {};
    for (const rec of records) {
      if (!byEmail[rec.correo]) {
        byEmail[rec.correo] = { primary: rec, branches: new Set(), phones: new Set() };
      }
      const g = byEmail[rec.correo];
      if (rec.sucursal && rec.sucursal !== 'TODAS') g.branches.add(rec.sucursal);
      if (rec.telefono) g.phones.add(rec.telefono);
    }

    const advisors = [];
    const seenAdvKey = new Set();
    for (const rec of records) {
      const info = byEmail[rec.correo];
      rec.all_branches = Array.from(info.branches);
      if (!rec.telefono && info.phones.size > 0) {
        rec.telefono = Array.from(info.phones)[0];
      }
      if (rec.sucursal !== 'TODAS') {
        const k = `${rec.sucursal}::${rec.correo}`;
        if (!seenAdvKey.has(k)) {
          seenAdvKey.add(k);
          advisors.push(rec);
        }
      }
    }

    APP_STATE.directoryRecords = records;
    APP_STATE.advisors = advisors;
    const out = { records, advisors, byEmail };
    if (records.length > 0) {
      _segDirCacheMem = out;
      _segDirFetchedAt = Date.now();
    }
    return out;
  }

  function hydrateDirectoryFromCacheSync() {
    if (Array.isArray(APP_STATE.advisors) && APP_STATE.advisors.length > 0) return true;
    const cachedDirRecords = readJsonStorage(SEG_DIRECTORY_CACHE_KEY, []);
    if (!Array.isArray(cachedDirRecords) || cachedDirRecords.length === 0) return false;
    const records = [];
    for (const cr of cachedDirRecords) {
      if (!cr || !cr.correo) continue;
      records.push({
        ...cr,
        correo: normalizeEmail(cr.correo),
        tokens: Array.isArray(cr.tokens) ? cr.tokens : normalizeText(cr.nombre).split(' ').filter(t => t.length > 2)
      });
    }
    if (!records.length) return false;
    const byEmail = {};
    for (const rec of records) {
      if (!byEmail[rec.correo]) {
        byEmail[rec.correo] = { primary: rec, branches: new Set(), phones: new Set() };
      }
      const g = byEmail[rec.correo];
      if (rec.sucursal && rec.sucursal !== 'TODAS') g.branches.add(rec.sucursal);
      if (rec.telefono) g.phones.add(rec.telefono);
    }
    const advisors = [];
    const seenAdvKey = new Set();
    for (const rec of records) {
      const info = byEmail[rec.correo];
      rec.all_branches = Array.from(info.branches);
      if (!rec.telefono && info.phones.size > 0) {
        rec.telefono = Array.from(info.phones)[0];
      }
      if (rec.sucursal !== 'TODAS') {
        const k = `${rec.sucursal}::${rec.correo}`;
        if (!seenAdvKey.has(k)) {
          seenAdvKey.add(k);
          advisors.push(rec);
        }
      }
    }
    APP_STATE.directoryRecords = records;
    APP_STATE.advisors = advisors;
    return advisors.length > 0;
  }

  // ============================================================================
  // INVENTARIO (INCLUYE COLUMNA F FOTO #14), STOCK Y URGENCIA
  // ============================================================================
  function parseInventoryRows(invRows) {
    const bySku = {};
    const byName = {};
    let syncBanner = '';

    if (invRows && invRows.length >= 2) {
      syncBanner = cleanStr((invRows[1] && invRows[1][48]) || '');
    }

    for (let i = 2; i < (invRows || []).length; i++) {
      const r = invRows[i];
      if (!r || !r[0]) continue;
      const sku = cleanStr(r[0]).toUpperCase();
      if (!sku) continue;
      const fotoRaw = cleanStr(r[5]);
      const photo = resolveProductPhoto(fotoRaw);
      const obj = {
        sku,
        tipo: cleanStr(r[1]),
        modelo: cleanStr(r[2]),
        nombre: cleanStr(r[3]),
        fotoRaw,
        fotoId: photo.driveId,
        fotoThumb: photo.thumbUrl,
        fotoUrl: photo.fullUrl,
        cedis_bod: parseInt(r[20] || '0', 10) || 0,
        cedis_pis: parseInt(r[21] || '0', 10) || 0,
        casa_bod: parseInt(r[22] || '0', 10) || 0,
        casa_pis: parseInt(r[23] || '0', 10) || 0,
        ptc_bod: parseInt(r[24] || '0', 10) || 0,
        ptc_pis: parseInt(r[25] || '0', 10) || 0,
        col_bod: parseInt(r[26] || '0', 10) || 0,
        col_pis: parseInt(r[27] || '0', 10) || 0,
        pla_bod: parseInt(r[28] || '0', 10) || 0,
        pla_pis: parseInt(r[29] || '0', 10) || 0,
        out_bod: parseInt(r[30] || '0', 10) || 0,
        out_pis: parseInt(r[31] || '0', 10) || 0,
        precio: parseFloat(String(r[49] || '0').replace(/[^0-9.]/g, '')) || 0
      };
      bySku[sku] = obj;
      const nNorm = normalizeText(obj.nombre);
      if (nNorm && !byName[nNorm]) byName[nNorm] = obj;
    }

    APP_STATE.inventoryBySku = bySku;
    APP_STATE.inventoryByName = byName;
    if (syncBanner) {
      APP_STATE.last_erp_sync = syncBanner.replace(/^EN VIVO\s*\|\s*/i, '').trim() || syncBanner;
    }
  }

  function calculateStockForBranch(skuRaw, sucursalKey) {
    const sku = cleanStr(skuRaw).toUpperCase();
    const prod = APP_STATE.inventoryBySku[sku];
    const suc = cleanStr(sucursalKey).toUpperCase();
    const rule = SUCURSAL_RULES[suc] || SUCURSAL_RULES['PROYECTOS'];
    if (!prod) return null;

    const cedis_bodega = prod.cedis_bod;
    const cedis_piso = prod.cedis_pis;
    const cedis_total = cedis_bodega + cedis_piso;

    let tienda_bodega = 0;
    let tienda_piso = 0;
    if (suc.includes('PLAYA')) {
      tienda_bodega = prod.pla_bod;
      tienda_piso = prod.pla_pis;
    } else if (suc.includes('COLOSIO') || suc.includes('COLOCIO')) {
      tienda_bodega = prod.col_bod;
      tienda_piso = prod.col_pis;
    } else if (suc.includes('PUERTO') || suc.includes('PTC')) {
      tienda_bodega = prod.ptc_bod;
      tienda_piso = prod.ptc_pis;
    } else if (suc.includes('CASA')) {
      tienda_bodega = prod.casa_bod;
      tienda_piso = prod.casa_pis;
    }

    const tienda_total = tienda_bodega + tienda_piso;
    const total_disponible = cedis_total + tienda_total;
    const partes = [`${cedis_total} en CEDIS`];
    if (rule && rule.tienda) {
      partes.push(`${tienda_bodega} en bodega + ${tienda_piso} en piso ${rule.label}`);
    }

    return {
      cedis_bodega,
      cedis_piso,
      cedis_total,
      tienda_bodega,
      tienda_piso,
      tienda_total,
      total_disponible,
      detalle_ubicacion: partes.join(' y ')
    };
  }

  function evaluateItemUrgency(it) {
    const cfg = APP_STATE.config || {};
    const sucursal = cleanStr(it.Sucursal || 'PROYECTOS').toUpperCase();
    const rule = SUCURSAL_RULES[sucursal] || SUCURSAL_RULES['PROYECTOS'];

    const stockIni = parseInt(it.Stock_Inicial_Total || '0', 10) || 0;
    const cedisBod = parseInt(it.Stock_Actual_CEDIS_Bodega || '0', 10) || 0;
    const cedisPis = parseInt(it.Stock_Actual_CEDIS_Piso || '0', 10) || 0;
    const tdaBod = parseInt(it.Stock_Actual_Tienda_Bodega || '0', 10) || 0;
    const tdaPis = parseInt(it.Stock_Actual_Tienda_Piso || '0', 10) || 0;
    const cantPedida = Math.max(1, parseInt(it.Cantidad_Cotizada || '1', 10) || 1);

    const cedisTotal = cedisBod + cedisPis;
    const stockAct = cedisTotal + tdaBod + tdaPis;

    const variacion = stockAct - stockIni;
    const caidaUnidades = Math.max(0, stockIni - stockAct);
    const pctCaida = stockIni > 0 ? Math.round((caidaUnidades / stockIni) * 1000) / 10 : 0.0;

    const umbralPct = parseFloat(cfg.UMBRAL_CAIDA_PORCENTAJE || '30') || 30;
    const umbralPzas = parseInt(cfg.UMBRAL_PIEZAS_CRITICO || '5', 10) || 5;
    const diasSeg = parseInt(cfg.DIAS_SEGUIMIENTO || '3', 10) || 3;
    const alertaSoloPiso = cleanStr(cfg.ALERTA_SOLO_PISO || 'SI').toUpperCase() === 'SI';

    const fechaCotStr = cleanStr(it.Fecha_Cotizacion).slice(0, 10);
    let diasTranscurridos = 0;
    if (fechaCotStr) {
      const dt = new Date(fechaCotStr + 'T00:00:00');
      if (!isNaN(dt.getTime())) {
        diasTranscurridos = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
      }
    }

    const soloQuedaPiso = (stockAct > 0 && cedisBod === 0 && tdaBod === 0 && (cedisPis + tdaPis) > 0);

    let nivel = 'ESTABLE';
    let motivo = 'Stock disponible';

    if (stockAct === 0) {
      nivel = 'CRITICO';
      motivo = 'Agotado (0 pzas)';
    } else if (stockAct < cantPedida) {
      nivel = 'CRITICO';
      motivo = `Insuficiente (${stockAct}/${cantPedida})`;
    } else if (alertaSoloPiso && soloQuedaPiso) {
      nivel = 'SOLO_PISO';
      motivo = `Solo piso (${stockAct} pza)`;
    } else if (stockAct <= umbralPzas || pctCaida >= umbralPct) {
      nivel = 'CRITICO';
      motivo = stockAct <= umbralPzas ? `Últimas ${stockAct} pzas` : `Bajó ${pctCaida}%`;
    } else if (caidaUnidades > 0) {
      nivel = 'BAJADA';
      motivo = `De ${stockIni} a ${stockAct} pzas`;
    } else if (diasTranscurridos >= diasSeg) {
      nivel = 'SEGUIMIENTO_DIAS';
      motivo = `${diasTranscurridos} días`;
    }

    const partesLoc = [`${cedisTotal} en CEDIS`];
    if (rule && rule.tienda) {
      partesLoc.push(`${tdaBod} en bodega + ${tdaPis} en piso ${rule.label}`);
    }

    it.Stock_Actual_Total = String(stockAct);
    it.Variacion_Stock = String(variacion);
    it.Porcentaje_Caida = `${pctCaida.toFixed(1)}%`;
    it.Nivel_Urgencia = nivel;
    it.Motivo_Urgencia = motivo;
    it.Detalle_Ubicacion = partesLoc.join(' y ');
    it.Dias_Transcurridos = diasTranscurridos;
    it.Solo_Queda_Piso = soloQuedaPiso;
    return it;
  }

  function matchAdvisorInfo(vendedorOrName, correoRaw, sucursalKey) {
    const em = normalizeEmail(correoRaw);
    const advisors = APP_STATE.advisors || [];
    if (em) {
      const byEm = advisors.find(a => a.correo === em && a.sucursal === sucursalKey) || advisors.find(a => a.correo === em);
      if (byEm) return byEm;
    }
    const vNorm = normalizeText(vendedorOrName);
    if (!vNorm) return null;
    let best = null;
    let bestScore = 0;
    for (const adv of advisors) {
      const tokens = adv.tokens || [];
      let score = 0;
      for (const t of tokens) {
        if (vNorm.includes(t)) score += 1;
      }
      if (adv.sucursal === sucursalKey && score > 0) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = adv;
      }
    }
    return bestScore >= 1 ? best : null;
  }

  function parseDateToIso(raw) {
    const s = cleanStr(raw);
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  function cleanAvisoDate(raw) {
    const s = cleanStr(raw);
    if (!s) return '';
    const low = s.toLowerCase();
    if (low === 'true' || low === 'false' || low === '1' || low === '0' || low === 'null' || low === 'undefined' || low === 'app_cotizacion' || low === 'cotizado' || low === 'erp') {
      return '';
    }
    return s;
  }

  function groupQuotesByFolio(itemsList, closuresMap, appCreatedFoliosSet) {
    const priorityOrder = { 'CRITICO': 5, 'SOLO_PISO': 4, 'BAJADA': 3, 'SEGUIMIENTO_DIAS': 2, 'ESTABLE': 1 };
    const grouped = new Map();
    const verifiedAppSet = appCreatedFoliosSet instanceof Set ? appCreatedFoliosSet : new Set();

    for (const it of itemsList) {
      const folio = cleanStr(it.Folio_ERP).toUpperCase();
      if (!folio) continue;
      if (cleanStr(it.Fecha_Ultimo_Aviso).toLowerCase() === 'true') {
        verifiedAppSet.add(folio);
      }
      it.Fecha_Ultimo_Aviso = cleanAvisoDate(it.Fecha_Ultimo_Aviso);
      const isAppVerified = verifiedAppSet.has(folio);
      it.Creada_En_App = isAppVerified;

      if (!grouped.has(folio)) {
        const sucKey = cleanStr(it.Sucursal || 'PROYECTOS').toUpperCase();
        grouped.set(folio, {
          Folio_ERP: folio,
          Fecha_Cotizacion: it.Fecha_Cotizacion || '',
          Sucursal: sucKey,
          Sucursal_Label: getBranchLabel(sucKey),
          Asesor: it.Asesor || '',
          Correo_Asesor: normalizeEmail(it.Correo_Asesor),
          Tel_Asesor: it.Tel_Asesor || '',
          Cliente: it.Cliente || '',
          WhatsApp_Cliente: cleanPhone(it.WhatsApp_Cliente),
          Estatus_ERP: it.Estatus_ERP || 'Cotizado',
          Fecha_Ultimo_Aviso: it.Fecha_Ultimo_Aviso || '',
          Nivel_Urgencia: it.Nivel_Urgencia || 'ESTABLE',
          Motivo_Urgencia: it.Motivo_Urgencia || 'Stock disponible',
          Dias_Transcurridos: it.Dias_Transcurridos || 0,
          Total_Productos: 0,
          Total_Piezas: 0,
          Creada_En_App: isAppVerified,
          Cerrada: false,
          Archivada: false,
          Archivo_Origen: '',
          Estatus_Cierre: '',
          Motivo_Cierre: '',
          Comentarios_Cierre: '',
          Fecha_Cierre: '',
          items: []
        });
      }
      const g = grouped.get(folio);
      g.items.push(it);
      g.Total_Productos = g.items.length;
      g.Total_Piezas += Math.max(1, parseInt(it.Cantidad_Cotizada || '1', 10) || 1);
      g.Creada_En_App = verifiedAppSet.has(folio);
      if (isErpStatusClosed(it.Estatus_ERP) && !isErpStatusClosed(g.Estatus_ERP)) {
        g.Estatus_ERP = it.Estatus_ERP;
      }
      if (it.Archivada) {
        g.Archivada = true;
        if (it.Motivo_Archivo && !g.Motivo_Cierre) g.Motivo_Cierre = it.Motivo_Archivo;
        if (it.Fecha_Archivo && !g.Fecha_Cierre) g.Fecha_Cierre = it.Fecha_Archivo;
      }
      if (!g.WhatsApp_Cliente && it.WhatsApp_Cliente) g.WhatsApp_Cliente = cleanPhone(it.WhatsApp_Cliente);
      if (!g.Fecha_Ultimo_Aviso && it.Fecha_Ultimo_Aviso) g.Fecha_Ultimo_Aviso = it.Fecha_Ultimo_Aviso;
      if (!g.Correo_Asesor && it.Correo_Asesor) g.Correo_Asesor = normalizeEmail(it.Correo_Asesor);
      if (!g.Tel_Asesor && it.Tel_Asesor) g.Tel_Asesor = it.Tel_Asesor;

      const curP = priorityOrder[g.Nivel_Urgencia] || 1;
      const newP = priorityOrder[it.Nivel_Urgencia] || 1;
      if (newP > curP) {
        g.Nivel_Urgencia = it.Nivel_Urgencia;
        g.Motivo_Urgencia = it.Motivo_Urgencia;
      }
    }

    for (const [folio, g] of grouped.entries()) {
      const cie = closuresMap && closuresMap[folio];
      const erpAuto = resolveAutoClosureFromErpStatus(g.Estatus_ERP);
      if (cie) {
        g.Cerrada = true;
        g.Archivada = true;
        g.Archivo_Origen = /ERP|S MUEBLER/i.test(cleanStr(cie.Motivo_Cierre)) ? 'ERP' : 'MANUAL';
        g.Estatus_Cierre = cie.Estatus_Cierre || 'CERRADA';
        g.Motivo_Cierre = cie.Motivo_Cierre || g.Motivo_Cierre || '';
        g.Comentarios_Cierre = cie.Comentarios || '';
        g.Fecha_Cierre = cie.Fecha_Hora || g.Fecha_Cierre || '';
      } else if (erpAuto) {
        g.Cerrada = true;
        g.Archivada = true;
        g.Archivo_Origen = 'ERP';
        g.Estatus_Cierre = erpAuto.Estatus_Cierre;
        g.Motivo_Cierre = erpAuto.Motivo_Cierre;
        g.Fecha_Cierre = g.Fecha_Cierre || g.Fecha_Cotizacion || '';
      } else if (g.Archivada) {
        g.Cerrada = true;
        g.Archivo_Origen = g.Archivo_Origen || 'ARCHIVO';
        g.Estatus_Cierre = g.Estatus_Cierre || 'CERRADA';
      }
    }

    const list = Array.from(grouped.values());
    list.sort((a, b) => {
      const dCmp = String(b.Fecha_Cotizacion || '').localeCompare(String(a.Fecha_Cotizacion || ''));
      if (dCmp !== 0) return dCmp;
      return String(b.Folio_ERP || '').localeCompare(String(a.Folio_ERP || ''));
    });
    return list;
  }

  function filterGroupedQuotesForUser(allGrouped, user) {
    if (!user) return [];
    if (user.is_master || user.es_admin || isMasterExecutive(user.correo, user.puesto, user.sucursal)) {
      return allGrouped;
    }

    const userEmail = normalizeEmail(user.correo);
    const userNameNorm = normalizeText(user.nombre);
    const userTokens = userNameNorm.split(' ').filter(t => t.length > 2);
    const allowedBranches = new Set(
      Array.isArray(user.all_branches) && user.all_branches.length > 0
        ? user.all_branches.map(b => cleanStr(b).toUpperCase())
        : [cleanStr(user.sucursal).toUpperCase()]
    );

    return allGrouped.filter(q => {
      const qSuc = cleanStr(q.Sucursal).toUpperCase();
      const qEmail = normalizeEmail(q.Correo_Asesor);
      const qAsesorNorm = normalizeText(q.Asesor);

      if (user.es_gerente) {
        return allowedBranches.has(qSuc);
      }

      if (userEmail && qEmail) {
        return userEmail === qEmail;
      }
      if (!userNameNorm || !qAsesorNorm) return false;
      if (userNameNorm === qAsesorNorm) return true;
      const myNameTokens = userNameNorm.split(' ').filter(Boolean);
      const qNameTokens = qAsesorNorm.split(' ').filter(Boolean);
      if (myNameTokens.length >= 2 && qNameTokens.length >= 2) {
        const shorter = myNameTokens.length <= qNameTokens.length ? myNameTokens : qNameTokens;
        const longerSet = new Set(myNameTokens.length <= qNameTokens.length ? qNameTokens : myNameTokens);
        if (shorter.length >= 2 && shorter.every(t => longerSet.has(t))) return true;
      }
      return false;
    });
  }

  // ============================================================================
  // CARGA EN VIVO (CON SOPORTE OPCIONAL seg_get_state + RESPALDO CSV + STAMP #6)
  // ============================================================================
  async function tryFetchAuthenticatedSegState() {
    const token = cleanStr(APP_STATE.user && APP_STATE.user.authToken);
    if (!token) return null;
    try {
      const res = await callWebAppPost({ action: 'seg_get_state' }, 7000);
      if (!res || !res.ok) return null;
      const sh = (res.sheets && typeof res.sheets === 'object') ? res.sheets : {};
      const cotCreataRows = Array.isArray(sh.COTIZACIONES_CREATA)
        ? sh.COTIZACIONES_CREATA
        : (Array.isArray(res.cotCreataRows) ? res.cotCreataRows : null);
      const cotArchivadasRows = Array.isArray(sh.COTIZACIONES_ARCHIVADAS)
        ? sh.COTIZACIONES_ARCHIVADAS
        : (Array.isArray(res.cotArchivadasRows) ? res.cotArchivadasRows : null);
      const cotVivoRows = Array.isArray(sh.COTIZACIONES_EN_VIVO)
        ? sh.COTIZACIONES_EN_VIVO
        : (Array.isArray(res.cotVivoRows) ? res.cotVivoRows : null);
      if (!Array.isArray(cotCreataRows) && !Array.isArray(cotArchivadasRows) && !Array.isArray(cotVivoRows)) {
        return null;
      }
      return {
        ok: true,
        updatedAt: res.updatedAt || '',
        roleScope: res.roleScope || '',
        cotCreataRows,
        cotArchivadasRows,
        cotVivoRows,
        cierresRows: Array.isArray(sh.CIERRES_COTIZACIONES)
          ? sh.CIERRES_COTIZACIONES
          : (Array.isArray(res.cierresRows) ? res.cierresRows : null),
        cfgRows: Array.isArray(sh.CONFIG_CREATA)
          ? sh.CONFIG_CREATA
          : (Array.isArray(res.cfgRows) ? res.cfgRows : null),
        histMovRows: Array.isArray(sh.HISTORIAL_MOVIMIENTOS)
          ? sh.HISTORIAL_MOVIMIENTOS
          : (Array.isArray(res.histMovRows) ? res.histMovRows : null),
        histInvRows: Array.isArray(sh.HISTORIAL_SEG)
          ? sh.HISTORIAL_SEG
          : (Array.isArray(sh.HISTORIAL)
            ? sh.HISTORIAL
            : (Array.isArray(res.histInvRows)
              ? res.histInvRows
              : (Array.isArray(res.histSegRows) ? res.histSegRows : null))),
        invRows: Array.isArray(sh.INVENTARIO_EN_VIVO)
          ? sh.INVENTARIO_EN_VIVO
          : (Array.isArray(res.invRows) ? res.invRows : null),
        inventoryPhotosBySku: (res.inventoryPhotosBySku && typeof res.inventoryPhotosBySku === 'object')
          ? res.inventoryPhotosBySku
          : null
      };
    } catch (e) {}
    return null;
  }

  function hydrateLiveInventoryFromHost() {
    try {
      if (mountOpts && typeof mountOpts.getLiveInventorySnapshot === 'function') {
        const hostMap = mountOpts.getLiveInventorySnapshot();
        if (hostMap && typeof hostMap === 'object' && Object.keys(hostMap).length > 0) {
          const byName = {};
          for (const skuKey of Object.keys(hostMap)) {
            const p = hostMap[skuKey];
            if (!p) continue;
            const photo = resolveProductPhoto(p.fotoRaw || p.foto || '');
            hostMap[skuKey] = {
              ...p,
              fotoId: photo.driveId || p.fotoId || '',
              fotoThumb: photo.thumbUrl || p.fotoThumb || '',
              fotoUrl: photo.fullUrl || p.fotoUrl || ''
            };
            if (p.nombre) byName[normalizeText(p.nombre)] = hostMap[skuKey];
          }
          APP_STATE.inventoryBySku = hostMap;
          APP_STATE.inventoryByName = byName;
          return true;
        }
      }
    } catch (eHostInv) {}
    return false;
  }

  function hydrateFromLocalSnapshotSync() {
    hydrateDirectoryFromCacheSync();
    hydrateLiveInventoryFromHost();
    const rawCachedSnapshot = readJsonStorage(SEG_LIVE_SNAPSHOT_KEY, null);
    const currentEmail = APP_STATE.user ? normalizeEmail(APP_STATE.user.correo) : '';
    const snapEmail = rawCachedSnapshot && rawCachedSnapshot.userEmail ? normalizeEmail(rawCachedSnapshot.userEmail) : '';
    const snapOwnedByCurrentUser = !snapEmail || !currentEmail || snapEmail === currentEmail;
    const cachedSnapshot = snapOwnedByCurrentUser ? rawCachedSnapshot : null;
    if (cachedSnapshot && cachedSnapshot.deltaMeta && typeof cachedSnapshot.deltaMeta === 'object') {
      _segDeltaVersion = Number(cachedSnapshot.deltaMeta.version || 0) || 0;
      _segDeltaInvVersion = cleanStr(cachedSnapshot.deltaMeta.invVersion || '');
      if (cachedSnapshot.deltaMeta.rowWatermarks && typeof cachedSnapshot.deltaMeta.rowWatermarks === 'object') {
        _segRowWatermarks = Object.assign({ cotCreata: 0, cotVivo: 0, cierres: 0, histMov: 0, histSeg: 0 }, cachedSnapshot.deltaMeta.rowWatermarks);
      }
    }
    const localBridgeQuotes = readJsonStorage(APP_QUOTES_BRIDGE_KEY, []);
    const hasSnap = Boolean(cachedSnapshot && Array.isArray(cachedSnapshot.rawPartidas) && cachedSnapshot.rawPartidas.length);
    const hasBridge = Array.isArray(localBridgeQuotes) && localBridgeQuotes.length > 0;
    if (!hasSnap && !hasBridge) return false;

    if (cachedSnapshot && cachedSnapshot.config) {
      Object.assign(APP_STATE.config, cachedSnapshot.config);
    }
    if (cachedSnapshot && cachedSnapshot.inventoryBySku && Object.keys(APP_STATE.inventoryBySku).length === 0) {
      APP_STATE.inventoryBySku = cachedSnapshot.inventoryBySku;
      const byName = {};
      for (const skuKey of Object.keys(APP_STATE.inventoryBySku)) {
        const p = APP_STATE.inventoryBySku[skuKey];
        if (p && p.nombre) byName[normalizeText(p.nombre)] = p;
      }
      APP_STATE.inventoryByName = byName;
    }

    const closuresMap = Object.assign(
      {},
      (cachedSnapshot && cachedSnapshot.closures) || {},
      readJsonStorage(SEG_CLOSURES_CACHE_KEY, {})
    );
    const phoneByFolio = Object.assign({}, readJsonStorage(SEG_PHONES_CACHE_KEY, {}));
    const contactedByFolio = Object.assign({}, readJsonStorage(SEG_CONTACTED_CACHE_KEY, {}));
    const appCreatedFolios = new Set(
      (cachedSnapshot && Array.isArray(cachedSnapshot.appCreatedFolios))
        ? cachedSnapshot.appCreatedFolios.map(f => cleanStr(f).toUpperCase()).filter(Boolean)
        : []
    );

    const byPartida = new Map();
    if (hasSnap) {
      for (const cp of cachedSnapshot.rawPartidas) {
        if (!cp || !cp.ID_Partida || !cp.Folio_ERP) continue;
        const fol = cleanStr(cp.Folio_ERP).toUpperCase();
        const photo = getItemPhotoMeta(cp);
        const itemObj = {
          ...cp,
          Folio_ERP: fol,
          WhatsApp_Cliente: phoneByFolio[fol] || cleanPhone(cp.WhatsApp_Cliente),
          Fecha_Ultimo_Aviso: contactedByFolio[fol] || cleanStr(cp.Fecha_Ultimo_Aviso),
          Foto_Url: photo.fullUrl,
          Foto_Thumb: photo.thumbUrl,
          Foto_Drive_Id: photo.driveId,
          Creada_En_App: appCreatedFolios.has(fol)
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(cp.ID_Partida, itemObj);
      }
    }

    if (hasBridge) {
      for (const bq of localBridgeQuotes) {
        if (!bq || !bq.folio || !Array.isArray(bq.items)) continue;
        const folio = cleanStr(bq.folio).toUpperCase();
        appCreatedFolios.add(folio);
        const fechaIso = parseDateToIso(bq.fecha || '');
        const sucKey = mapTabToBranchKey(bq.erpStore || bq.sheetTab || folio);
        const correoAsesor = normalizeEmail(bq.advisorEmail);
        const nombreAsesor = cleanStr(bq.advisorName);
        const cliente = cleanStr(bq.clientName) || 'Prospecto CREATA';
        const telCliente = phoneByFolio[folio] || cleanPhone(bq.clientPhone);

        for (const it of bq.items) {
          const sku = cleanStr(it.sku).toUpperCase();
          if (!sku) continue;
          const qty = Math.max(1, parseInt(it.qty || '1', 10) || 1);
          const idP = `${folio}_${sku}`;
          const prev = byPartida.get(idP);
          const prod = APP_STATE.inventoryBySku[sku];
          const liveSt = calculateStockForBranch(sku, sucKey);
          const stActual = liveSt ? liveSt.total_disponible : (prev ? parseInt(prev.Stock_Actual_Total || '0', 10) : 0);
          const stIni = prev && parseInt(prev.Stock_Inicial_Total || '0', 10) > 0
            ? parseInt(prev.Stock_Inicial_Total, 10)
            : Math.max(stActual, qty);
          const itemPhoto = resolveProductPhoto(it.photoUrl || it.fotoUrl || it.fotoRaw || (prod && prod.fotoRaw) || (prev && prev.Foto_Url) || '');

          const itemObj = {
            ID_Partida: idP,
            Folio_ERP: folio,
            Fecha_Cotizacion: fechaIso,
            Sucursal: sucKey,
            Asesor: nombreAsesor,
            Correo_Asesor: correoAsesor,
            Tel_Asesor: (prev && prev.Tel_Asesor) || '',
            Cliente: cliente,
            WhatsApp_Cliente: telCliente || (prev && prev.WhatsApp_Cliente) || '',
            Clave_Producto: sku,
            Nombre_Producto: cleanStr(it.name) || (prod && prod.nombre) || (prev && prev.Nombre_Producto) || sku,
            Modelo: cleanStr(it.model) || (prod && prod.modelo) || (prev && prev.Modelo) || '',
            Precio_Unitario: it.price ? Number(it.price).toFixed(2) : ((prod && prod.precio ? prod.precio.toFixed(2) : '0.00')),
            Cantidad_Cotizada: String(qty),
            Stock_Inicial_Total: String(stIni),
            Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : '0',
            Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : '0',
            Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : '0',
            Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : '0',
            Stock_Actual_Total: String(stActual),
            Estatus_ERP: 'Cotizado',
            Fecha_Ultimo_Aviso: contactedByFolio[folio] || (prev && prev.Fecha_Ultimo_Aviso) || '',
            Foto_Url: itemPhoto.fullUrl || (prod && prod.fotoUrl) || '',
            Foto_Thumb: itemPhoto.thumbUrl || (prod && prod.fotoThumb) || '',
            Foto_Drive_Id: itemPhoto.driveId || (prod && prod.fotoId) || '',
            Creada_En_App: true
          };
          evaluateItemUrgency(itemObj);
          byPartida.set(idP, itemObj);
        }
      }
    }

    APP_STATE.closures = closuresMap;
    APP_STATE.appCreatedFolios = Array.from(appCreatedFolios);
    APP_STATE.rawPartidas = Array.from(byPartida.values());
    const allGrouped = groupQuotesByFolio(APP_STATE.rawPartidas, closuresMap, appCreatedFolios);
    APP_STATE.quotes = filterGroupedQuotesForUser(allGrouped, APP_STATE.user);
    return true;
  }

  function rebindActiveModalQuote() {
    if (!ACTIVE_MODAL_QUOTE || !ACTIVE_MODAL_QUOTE.Folio_ERP) return;
    const openFolio = cleanStr(ACTIVE_MODAL_QUOTE.Folio_ERP).toUpperCase();
    const fresh = (APP_STATE.quotes || []).find(q => cleanStr(q && q.Folio_ERP).toUpperCase() === openFolio);
    if (fresh) {
      ACTIVE_MODAL_QUOTE = fresh;
    }
  }

  function ingestStockDeltaMap(stockMap) {
    if (!stockMap || typeof stockMap !== 'object') return 0;
    let count = 0;
    for (const rawSku of Object.keys(stockMap)) {
      const sku = cleanStr(rawSku).toUpperCase();
      if (!sku) continue;
      const entry = stockMap[rawSku];
      if (!entry || typeof entry !== 'object') continue;
      const rawPhotoVal = cleanStr(entry.foto || entry.fotoRaw || entry.fotoUrl || '');
      const explicitId = cleanStr(entry.driveId || '');
      const resolved = rawPhotoVal
        ? resolveProductPhoto(rawPhotoVal)
        : (explicitId ? {
            driveId: explicitId,
            thumbUrl: `https://lh3.googleusercontent.com/d/${explicitId}=w400`,
            fullUrl: `https://lh3.googleusercontent.com/d/${explicitId}=w1000`
          } : { driveId: '', thumbUrl: '', fullUrl: '' });
      const prev = APP_STATE.inventoryBySku[sku] || {};
      const nextProd = {
        sku,
        tipo: cleanStr(entry.tipo) || prev.tipo || '',
        modelo: cleanStr(entry.modelo) || prev.modelo || '',
        nombre: cleanStr(entry.nombre) || prev.nombre || '',
        fotoRaw: rawPhotoVal || prev.fotoRaw || '',
        fotoId: resolved.driveId || explicitId || prev.fotoId || '',
        fotoThumb: resolved.thumbUrl || prev.fotoThumb || '',
        fotoUrl: resolved.fullUrl || prev.fotoUrl || '',
        cedis_bod: entry.cedis_bod !== undefined ? (Number(entry.cedis_bod) || 0) : (prev.cedis_bod || 0),
        cedis_pis: entry.cedis_pis !== undefined ? (Number(entry.cedis_pis) || 0) : (prev.cedis_pis || 0),
        casa_bod: entry.casa_bod !== undefined ? (Number(entry.casa_bod) || 0) : (prev.casa_bod || 0),
        casa_pis: entry.casa_pis !== undefined ? (Number(entry.casa_pis) || 0) : (prev.casa_pis || 0),
        ptc_bod: entry.ptc_bod !== undefined ? (Number(entry.ptc_bod) || 0) : (prev.ptc_bod || 0),
        ptc_pis: entry.ptc_pis !== undefined ? (Number(entry.ptc_pis) || 0) : (prev.ptc_pis || 0),
        col_bod: entry.col_bod !== undefined ? (Number(entry.col_bod) || 0) : (prev.col_bod || 0),
        col_pis: entry.col_pis !== undefined ? (Number(entry.col_pis) || 0) : (prev.col_pis || 0),
        pla_bod: entry.pla_bod !== undefined ? (Number(entry.pla_bod) || 0) : (prev.pla_bod || 0),
        pla_pis: entry.pla_pis !== undefined ? (Number(entry.pla_pis) || 0) : (prev.pla_pis || 0),
        out_bod: entry.out_bod !== undefined ? (Number(entry.out_bod) || 0) : (prev.out_bod || 0),
        out_pis: entry.out_pis !== undefined ? (Number(entry.out_pis) || 0) : (prev.out_pis || 0),
        precio: entry.precio !== undefined ? (Number(entry.precio) || 0) : (prev.precio || 0)
      };
      APP_STATE.inventoryBySku[sku] = nextProd;
      const nNorm = normalizeText(nextProd.nombre);
      if (nNorm) APP_STATE.inventoryByName[nNorm] = nextProd;
      count++;
    }
    return count;
  }

  function saveCompactSegSnapshot() {
    if (!APP_STATE.user || !Array.isArray(APP_STATE.rawPartidas) || !APP_STATE.rawPartidas.length) return;
    // Guardar solo los SKUs realmente presentes en cotizaciones visibles (evita QuotaExceededError de 5 MB)
    const scopedInv = {};
    for (let i = 0; i < APP_STATE.rawPartidas.length; i++) {
      const sk = cleanStr(APP_STATE.rawPartidas[i] && APP_STATE.rawPartidas[i].Clave_Producto).toUpperCase();
      if (sk && APP_STATE.inventoryBySku[sk]) scopedInv[sk] = APP_STATE.inventoryBySku[sk];
    }
    writeJsonStorage(SEG_LIVE_SNAPSHOT_KEY, {
      savedAt: Date.now(),
      userEmail: normalizeEmail(APP_STATE.user.correo),
      rawPartidas: APP_STATE.rawPartidas,
      closures: APP_STATE.closures,
      auditLogs: (APP_STATE.auditLogs || []).slice(-200),
      config: APP_STATE.config,
      inventoryBySku: scopedInv,
      appCreatedFolios: APP_STATE.appCreatedFolios,
      deltaMeta: {
        version: _segDeltaVersion,
        invVersion: _segDeltaInvVersion,
        rowWatermarks: _segRowWatermarks
      }
    });
  }

  function collectActiveQuotedSkus() {
    const set = new Set();
    const list = APP_STATE.rawPartidas || [];
    for (let i = 0; i < list.length; i++) {
      const sk = cleanStr(list[i] && list[i].Clave_Producto).toUpperCase();
      if (sk) set.add(sk);
    }
    return Array.from(set).slice(0, 600);
  }

  async function fetchDeltaState(opts) {
    const o = opts || {};
    const isManual = Boolean(o.manual);
    const isBackground = !isManual && Boolean(o.background);
    if (!mounted || !APP_STATE.user) return { ok: false, skipped: true };

    const token = cleanStr(APP_STATE.user && APP_STATE.user.authToken);
    if (!token || _segDeltaUnsupported) {
      await fetchLiveState(isBackground);
      return { ok: true, mode: 'fallback' };
    }

    const seq = ++_segFetchSeq;
    try {
      const hasLocalData = Array.isArray(APP_STATE.rawPartidas) && APP_STATE.rawPartidas.length > 0;
      const reqPayload = {
        action: 'seg_get_delta',
        sinceVersion: hasLocalData ? _segDeltaVersion : 0,
        sinceInvVersion: hasLocalData ? _segDeltaInvVersion : '',
        rowWatermarks: hasLocalData ? _segRowWatermarks : { cotCreata: 0, cotVivo: 0, cierres: 0, histMov: 0, histSeg: 0 },
        activeSkus: collectActiveQuotedSkus(),
        forceFull: Boolean(o.forceFull) || !hasLocalData
      };

      const res = await callWebAppPost(reqPayload, 14000);
      if (!mounted || seq !== _segFetchSeq) return { ok: false, stale: true };

      // Respaldo transparente si el Apps Script desplegado aún no incluye seg_get_delta
      if (!res || !res.ok) {
        const errStr = cleanStr(res && res.error);
        if (/no reconocida|unknown/i.test(errStr)) {
          _segDeltaUnsupported = true;
        }
        await fetchLiveState(isBackground);
        return { ok: true, mode: 'fallback' };
      }

      if (res.version) _segDeltaVersion = Number(res.version) || _segDeltaVersion;
      if (res.invVersion) {
        _segDeltaInvVersion = cleanStr(res.invVersion);
        APP_STATE.last_erp_sync = _segDeltaInvVersion.replace(/^EN VIVO\s*\|\s*/i, '').trim() || _segDeltaInvVersion;
      }
      if (res.rowWatermarks && typeof res.rowWatermarks === 'object') {
        _segRowWatermarks = Object.assign({}, _segRowWatermarks, res.rowWatermarks);
      }

      const sl = $('seg_lastSyncLabel');

      // 1) FAST PATH: Cero cambios nuevos -> 0 reconstrucción, 0 escrituras en localStorage, 0 re-render DOM
      if (res.mode === 'noop' || res.unchanged === true) {
        if (sl) {
          sl.textContent = APP_STATE.last_erp_sync || 'Al día';
        }
        flushSegOfflineOutbox();
        return { ok: true, mode: 'noop', totalChanges: 0 };
      }

      // 2) BOOTSTRAP COMPLETO (1a carga o tras limpieza de filas): usar datos ya filtrados por rol sin 19 CSVs
      if (res.mode === 'full' && res.sheets) {
        await hydrateDirectoryAndApplyFullApiState(res, isBackground);
        return { ok: true, mode: 'full', totalChanges: (APP_STATE.quotes || []).length };
      }

      // 3) DELTA INCREMENTAL: Mezclar ÚNICAMENTE las modificaciones nuevas sobre el estado existente
      let touchedCount = 0;
      const stockMap = (res.stockDeltaBySku && typeof res.stockDeltaBySku === 'object') ? res.stockDeltaBySku : {};
      const updatedStockCount = ingestStockDeltaMap(stockMap);

      const closuresMap = Object.assign({}, APP_STATE.closures || {}, readJsonStorage(SEG_CLOSURES_CACHE_KEY, {}));
      const phoneByFolio = Object.assign({}, readJsonStorage(SEG_PHONES_CACHE_KEY, {}));
      const contactedByFolio = Object.assign({}, readJsonStorage(SEG_CONTACTED_CACHE_KEY, {}));
      const appCreatedFolios = new Set(APP_STATE.appCreatedFolios || []);
      const byPartida = new Map();
      for (const existing of (APP_STATE.rawPartidas || [])) {
        if (existing && existing.ID_Partida) byPartida.set(existing.ID_Partida, existing);
      }

      const appRows = (res.appendedRows && typeof res.appendedRows === 'object') ? res.appendedRows : {};

      // 3a) Nuevos cierres agregados
      for (const r of (appRows.CIERRES_COTIZACIONES || [])) {
        if (!r || !r[1]) continue;
        const fol = cleanStr(r[1]).toUpperCase();
        closuresMap[fol] = {
          Fecha_Hora: cleanStr(r[0]),
          Folio_ERP: fol,
          Sucursal: cleanStr(r[2]),
          Asesor: cleanStr(r[3]),
          Correo_Asesor: normalizeEmail(r[4]),
          Cliente: cleanStr(r[5]),
          WhatsApp_Cliente: cleanPhone(r[6]),
          Estatus_Cierre: cleanStr(r[7]) || 'CERRADA',
          Motivo_Cierre: cleanStr(r[8]),
          Comentarios: cleanStr(r[9]),
          Piezas_Cotizadas: cleanStr(r[11])
        };
        touchedCount++;
      }

      // 3b) Nuevas filas agregadas en COTIZACIONES_CREATA
      for (const r of (appRows.COTIZACIONES_CREATA || [])) {
        if (!r || !r[0] || !r[1]) continue;
        const idP = cleanStr(r[0]);
        const folio = cleanStr(r[1]).toUpperCase();
        const sucKey = mapTabToBranchKey(r[3] || folio);
        const sku = cleanStr(r[9]).toUpperCase();
        const advMatch = matchAdvisorInfo(r[4], r[5], sucKey);
        const liveSt = calculateStockForBranch(sku, sucKey);
        const prod = APP_STATE.inventoryBySku[sku];
        if (cleanStr(r[26]).toUpperCase() === 'APP_COTIZACION' || cleanStr(r[25]).toLowerCase() === 'true') {
          appCreatedFolios.add(folio);
        }
        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: parseDateToIso(r[2]),
          Sucursal: sucKey,
          Asesor: (advMatch && advMatch.nombre) || cleanStr(r[4]),
          Correo_Asesor: normalizeEmail(r[5]) || (advMatch && advMatch.correo) || '',
          Tel_Asesor: cleanPhone(r[6]) || (advMatch && advMatch.telefono) || '',
          Cliente: cleanStr(r[7]),
          WhatsApp_Cliente: phoneByFolio[folio] || cleanPhone(r[8]),
          Clave_Producto: sku,
          Nombre_Producto: cleanStr(r[10]) || (prod && prod.nombre) || sku,
          Modelo: cleanStr(r[11]) || (prod && prod.modelo) || '',
          Precio_Unitario: cleanStr(r[12]) || (prod && prod.precio ? prod.precio.toFixed(2) : '0.00'),
          Cantidad_Cotizada: cleanStr(r[13]) || '1',
          Stock_Inicial_Total: cleanStr(r[14]) || (liveSt ? String(liveSt.total_disponible) : '0'),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : (cleanStr(r[15]) || '0'),
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : (cleanStr(r[16]) || '0'),
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : (cleanStr(r[17]) || '0'),
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : (cleanStr(r[18]) || '0'),
          Stock_Actual_Total: liveSt ? String(liveSt.total_disponible) : (cleanStr(r[19]) || '0'),
          Estatus_ERP: cleanStr(r[24]) || 'Cotizado',
          Fecha_Ultimo_Aviso: cleanAvisoDate(contactedByFolio[folio] || r[25]),
          Foto_Url: (prod && prod.fotoUrl) || '',
          Foto_Thumb: (prod && prod.fotoThumb) || '',
          Foto_Drive_Id: (prod && prod.fotoId) || '',
          Creada_En_App: appCreatedFolios.has(folio)
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
        touchedCount++;
      }

      // 3b-bis) Nuevas filas agregadas en COTIZACIONES_ARCHIVADAS
      for (const r of (appRows.COTIZACIONES_ARCHIVADAS || [])) {
        if (!r || !r[0] || !r[1]) continue;
        const idP = cleanStr(r[0]);
        const folio = cleanStr(r[1]).toUpperCase();
        const sucKey = mapTabToBranchKey(r[3] || folio);
        const sku = cleanStr(r[9]).toUpperCase();
        const advMatch = matchAdvisorInfo(r[4], r[5], sucKey);
        const liveSt = calculateStockForBranch(sku, sucKey);
        const prod = APP_STATE.inventoryBySku[sku];
        if (cleanStr(r[26]).toUpperCase() === 'APP_COTIZACION' || cleanStr(r[25]).toLowerCase() === 'true') {
          appCreatedFolios.add(folio);
        }
        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: parseDateToIso(r[2]),
          Sucursal: sucKey,
          Asesor: (advMatch && advMatch.nombre) || cleanStr(r[4]),
          Correo_Asesor: normalizeEmail(r[5]) || (advMatch && advMatch.correo) || '',
          Tel_Asesor: cleanPhone(r[6]) || (advMatch && advMatch.telefono) || '',
          Cliente: cleanStr(r[7]),
          WhatsApp_Cliente: phoneByFolio[folio] || cleanPhone(r[8]),
          Clave_Producto: sku,
          Nombre_Producto: cleanStr(r[10]) || (prod && prod.nombre) || sku,
          Modelo: cleanStr(r[11]) || (prod && prod.modelo) || '',
          Precio_Unitario: cleanStr(r[12]) || (prod && prod.precio ? prod.precio.toFixed(2) : '0.00'),
          Cantidad_Cotizada: cleanStr(r[13]) || '1',
          Stock_Inicial_Total: cleanStr(r[14]) || (liveSt ? String(liveSt.total_disponible) : '0'),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : (cleanStr(r[15]) || '0'),
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : (cleanStr(r[16]) || '0'),
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : (cleanStr(r[17]) || '0'),
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : (cleanStr(r[18]) || '0'),
          Stock_Actual_Total: liveSt ? String(liveSt.total_disponible) : (cleanStr(r[19]) || '0'),
          Estatus_ERP: cleanStr(r[24]) || 'Cerrada',
          Fecha_Ultimo_Aviso: cleanAvisoDate(contactedByFolio[folio] || r[25]),
          Foto_Url: (prod && prod.fotoUrl) || '',
          Foto_Thumb: (prod && prod.fotoThumb) || '',
          Foto_Drive_Id: (prod && prod.fotoId) || '',
          Creada_En_App: appCreatedFolios.has(folio),
          Archivada: true,
          Motivo_Archivo: cleanStr(r[27]),
          Fecha_Archivo: cleanStr(r[28])
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
        touchedCount++;
      }

      // 3c) Nuevas filas agregadas en COTIZACIONES_EN_VIVO
      for (const r of (appRows.COTIZACIONES_EN_VIVO || [])) {
        if (!r || (!r[1] && !r[0])) continue;
        const folio = cleanStr(r[1] || r[0]).toUpperCase();
        if (!folio) continue;
        const fechaIso = parseDateToIso(r[3]);
        const sucKey = mapTabToBranchKey(r[6] || r[5] || folio);
        const correoAsesor = normalizeEmail(r[7]);
        const nombreAsesorRaw = cleanStr(r[8]);
        const advMatch = matchAdvisorInfo(nombreAsesorRaw, correoAsesor, sucKey);
        const nombreAsesor = (advMatch && advMatch.nombre) || nombreAsesorRaw;
        const telAsesor = (advMatch && advMatch.telefono) || '';
        const cliente = cleanStr(r[11]) || 'Prospecto CREATA';
        const telCliente = phoneByFolio[folio] || cleanPhone(r[12]);
        const resumenSkus = cleanStr(r[17]);
        const origenColY = cleanStr(r[24]).toUpperCase();
        if (origenColY === 'APP_COTIZACION') appCreatedFolios.add(folio);
        const parts = resumenSkus.split(',').map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          const m = p.match(/^([A-Z0-9\-_./]+)\s*x\s*(\d+)/i);
          const sku = cleanStr(m ? m[1] : p).toUpperCase();
          const qty = m ? (parseInt(m[2], 10) || 1) : 1;
          if (!sku) continue;
          const idP = `${folio}_${sku}`;
          if (byPartida.has(idP)) continue; // No sobrescribir datos más ricos de COTIZACIONES_CREATA
          const prod = APP_STATE.inventoryBySku[sku];
          const liveSt = calculateStockForBranch(sku, sucKey);
          const stActual = liveSt ? liveSt.total_disponible : 0;
          const itemObj = {
            ID_Partida: idP,
            Folio_ERP: folio,
            Fecha_Cotizacion: fechaIso,
            Sucursal: sucKey,
            Asesor: nombreAsesor,
            Correo_Asesor: correoAsesor,
            Tel_Asesor: telAsesor,
            Cliente: cliente,
            WhatsApp_Cliente: telCliente,
            Clave_Producto: sku,
            Nombre_Producto: (prod && prod.nombre) || sku,
            Modelo: (prod && prod.modelo) || '',
            Precio_Unitario: prod && prod.precio ? prod.precio.toFixed(2) : '0.00',
            Cantidad_Cotizada: String(qty),
            Stock_Inicial_Total: String(Math.max(stActual, qty)),
            Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : '0',
            Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : '0',
            Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : '0',
            Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : '0',
            Stock_Actual_Total: String(stActual),
            Estatus_ERP: 'Cotizado',
            Fecha_Ultimo_Aviso: cleanAvisoDate(contactedByFolio[folio] || ''),
            Foto_Url: (prod && prod.fotoUrl) || '',
            Foto_Thumb: (prod && prod.fotoThumb) || '',
            Foto_Drive_Id: (prod && prod.fotoId) || '',
            Creada_En_App: appCreatedFolios.has(folio)
          };
          evaluateItemUrgency(itemObj);
          byPartida.set(idP, itemObj);
          touchedCount++;
        }
      }

      // 3d) Cambios incrementales del ring-buffer (PHONE, WHATSAPP, EMAIL, CIERRE)
      for (const ch of (res.changes || [])) {
        if (!ch || !ch.folio) continue;
        const fol = cleanStr(ch.folio).toUpperCase();
        const kind = cleanStr(ch.kind).toUpperCase();
        const d = (ch.data && typeof ch.data === 'object') ? ch.data : {};
        if (kind === 'CIERRE') {
          closuresMap[fol] = Object.assign({ Folio_ERP: fol, Estatus_Cierre: 'CERRADA' }, d);
          touchedCount++;
        } else if (kind === 'PHONE' && d.whatsapp_cliente) {
          const tel = cleanPhone(d.whatsapp_cliente);
          if (tel) {
            phoneByFolio[fol] = tel;
            for (const item of byPartida.values()) {
              if (item.Folio_ERP === fol) item.WhatsApp_Cliente = tel;
            }
            touchedCount++;
          }
        } else if ((kind === 'WHATSAPP' || kind === 'EMAIL') && d.fecha_aviso) {
          const av = cleanAvisoDate(d.fecha_aviso);
          if (av) {
            contactedByFolio[fol] = av;
            for (const item of byPartida.values()) {
              if (item.Folio_ERP === fol) {
                item.Fecha_Ultimo_Aviso = av;
                evaluateItemUrgency(item);
              }
            }
            touchedCount++;
          }
        }
      }

      // 3e) Re-evaluar stock únicamente en partidas cuyo SKU recibió actualización de inventario
      if (updatedStockCount > 0) {
        for (const item of byPartida.values()) {
          const sku = cleanStr(item.Clave_Producto).toUpperCase();
          if (!sku || !stockMap[sku]) continue;
          const liveSt = calculateStockForBranch(sku, item.Sucursal);
          const prod = APP_STATE.inventoryBySku[sku];
          if (liveSt) {
            item.Stock_Actual_CEDIS_Bodega = String(liveSt.cedis_bodega);
            item.Stock_Actual_CEDIS_Piso = String(liveSt.cedis_piso);
            item.Stock_Actual_Tienda_Bodega = String(liveSt.tienda_bodega);
            item.Stock_Actual_Tienda_Piso = String(liveSt.tienda_piso);
            item.Stock_Actual_Total = String(liveSt.total_disponible);
          }
          if (prod && prod.fotoUrl && !item.Foto_Url) {
            item.Foto_Url = prod.fotoUrl;
            item.Foto_Thumb = prod.fotoThumb;
            item.Foto_Drive_Id = prod.fotoId;
          }
          evaluateItemUrgency(item);
        }
      }

      APP_STATE.closures = closuresMap;
      APP_STATE.appCreatedFolios = Array.from(appCreatedFolios);
      APP_STATE.rawPartidas = Array.from(byPartida.values());
      const allGrouped = groupQuotesByFolio(APP_STATE.rawPartidas, closuresMap, appCreatedFolios);
      APP_STATE.quotes = filterGroupedQuotesForUser(allGrouped, APP_STATE.user);
      rebindActiveModalQuote();
      saveCompactSegSnapshot();
      flushSegOfflineOutbox();

      if (sl) {
        sl.textContent = APP_STATE.last_erp_sync || 'En vivo';
      }
      populateAdvisorFilter();
      renderQuotes();

      const sumTotal = Number((res.summary && res.summary.totalChanges) || touchedCount || (updatedStockCount > 0 ? 1 : 0));
      return { ok: true, mode: 'delta', totalChanges: sumTotal, updatedStockCount };
    } catch (eDelta) {
      if (mounted && seq === _segFetchSeq) {
        await fetchLiveState(isBackground);
      }
      return { ok: true, mode: 'fallback' };
    }
  }

  async function hydrateDirectoryAndApplyFullApiState(apiRes, isBackground) {
    hydrateLiveInventoryFromHost();
    if (apiRes.stockDeltaBySku) {
      ingestStockDeltaMap(apiRes.stockDeltaBySku);
    }
    const dirData = await fetchUnifiedAdvisorsDirectory(false);
    if (!mounted) return;
    const sh = apiRes.sheets || {};
    await applyFullSheetsPayload({
      dirData,
      invRows: Array.isArray(sh.INVENTARIO_EN_VIVO) ? sh.INVENTARIO_EN_VIVO : null,
      cotCreataRows: Array.isArray(sh.COTIZACIONES_CREATA) ? sh.COTIZACIONES_CREATA : [],
      cotArchivadasRows: Array.isArray(sh.COTIZACIONES_ARCHIVADAS) ? sh.COTIZACIONES_ARCHIVADAS : [],
      cotVivoRows: Array.isArray(sh.COTIZACIONES_EN_VIVO) ? sh.COTIZACIONES_EN_VIVO : [],
      cierresRows: Array.isArray(sh.CIERRES_COTIZACIONES) ? sh.CIERRES_COTIZACIONES : [],
      cfgRows: Array.isArray(sh.CONFIG_CREATA) ? sh.CONFIG_CREATA : [],
      histMovRows: Array.isArray(sh.HISTORIAL_MOVIMIENTOS) ? sh.HISTORIAL_MOVIMIENTOS : [],
      histInvRows: Array.isArray(sh.HISTORIAL_SEG) ? sh.HISTORIAL_SEG : [],
      apiState: { inventoryPhotosBySku: apiRes.stockDeltaBySku || {} },
      isBackground
    });
  }

  async function fetchLiveState(isBackground) {
    if (!mounted || !APP_STATE.user) return;
    const seq = ++_segFetchSeq;
    try {
      const hasHostInv = hydrateLiveInventoryFromHost() || Object.keys(APP_STATE.inventoryBySku || {}).length > 0;
      const apiState = await tryFetchAuthenticatedSegState();
      if (!mounted || seq !== _segFetchSeq) return;

      const [
        dirData,
        invRows,
        cotCreataRows,
        cotArchivadasRows,
        cotVivoRows,
        cierresRows,
        cfgRows,
        histMovRows,
        histInvRows
      ] = await Promise.all([
        fetchUnifiedAdvisorsDirectory(false),
        (apiState && Array.isArray(apiState.invRows)) ? Promise.resolve(apiState.invRows) : (hasHostInv ? Promise.resolve(null) : fetchSheetCsv(SHEET_INV_ID, 'INVENTARIO_EN_VIVO')),
        Promise.resolve((apiState && Array.isArray(apiState.cotCreataRows)) ? apiState.cotCreataRows : []),
        Promise.resolve((apiState && Array.isArray(apiState.cotArchivadasRows)) ? apiState.cotArchivadasRows : []),
        (apiState && Array.isArray(apiState.cotVivoRows)) ? Promise.resolve(apiState.cotVivoRows) : fetchSheetCsv(SHEET_INV_ID, 'COTIZACIONES_EN_VIVO'),
        Promise.resolve((apiState && Array.isArray(apiState.cierresRows)) ? apiState.cierresRows : []),
        Promise.resolve((apiState && Array.isArray(apiState.cfgRows)) ? apiState.cfgRows : []),
        Promise.resolve((apiState && Array.isArray(apiState.histMovRows)) ? apiState.histMovRows : []),
        (apiState && Array.isArray(apiState.histInvRows)) ? Promise.resolve(apiState.histInvRows) : fetchSheetCsv(SHEET_INV_ID, 'HISTORIAL')
      ]);

      if (!mounted || seq !== _segFetchSeq) return;
      await applyFullSheetsPayload({
        dirData, invRows, cotCreataRows, cotArchivadasRows, cotVivoRows, cierresRows, cfgRows, histMovRows, histInvRows, apiState, isBackground
      });
    } catch (err) {
      if (mounted) {
        if (!_segUiCheckpointRestoredOnce) {
          restoreSegUiCheckpointOnce(false);
        } else if (!isBackground) {
          _pendingSegCheckpointRestore = null;
          renderQuotes();
        }
      }
    }
  }

  async function applyFullSheetsPayload(ctx) {
    const { dirData, invRows, cotCreataRows, cotArchivadasRows, cotVivoRows, cierresRows, cfgRows, histMovRows, histInvRows, apiState, isBackground } = ctx;
    try {

      // Enrich user phone/branches from live directory WITHOUT clobbering authToken / roles from opts.session
      const curEmail = normalizeEmail(APP_STATE.user.correo);
      if (dirData && dirData.byEmail && dirData.byEmail[curEmail]) {
        const grp = dirData.byEmail[curEmail];
        if (!APP_STATE.user.telefono && grp.phones && grp.phones.size > 0) {
          APP_STATE.user.telefono = Array.from(grp.phones)[0];
        }
        if (!APP_STATE.user.is_master && grp.branches && grp.branches.size > 0) {
          const mergedBranches = Array.from(new Set([...(APP_STATE.user.all_branches || []), ...Array.from(grp.branches)]));
          APP_STATE.user.all_branches = mergedBranches;
          if (mergedBranches.length > 1) {
            APP_STATE.user.sucursal_label = mergedBranches.map(getBranchLabel).join(' / ');
          }
        }
      }

      renderUserHeaderAndRoleControls();

      const hasLiveQuoteSheets = Boolean(
        (cotCreataRows && cotCreataRows.length > 1) ||
        (cotArchivadasRows && cotArchivadasRows.length > 1) ||
        (cotVivoRows && cotVivoRows.length > 1)
      );
      const rawSnapFallback = !hasLiveQuoteSheets ? readJsonStorage(SEG_LIVE_SNAPSHOT_KEY, null) : null;
      const snapFallbackOwner = rawSnapFallback && rawSnapFallback.userEmail ? normalizeEmail(rawSnapFallback.userEmail) : '';
      const cachedSnapshot = (!snapFallbackOwner || !curEmail || snapFallbackOwner === curEmail) ? rawSnapFallback : null;

      if (cfgRows && cfgRows.length > 1) {
        for (let i = 1; i < cfgRows.length; i++) {
          const r = cfgRows[i];
          if (r && r[0] && r[1] !== undefined) {
            APP_STATE.config[cleanStr(r[0])] = cleanStr(r[1]);
          }
        }
      } else if (cachedSnapshot && cachedSnapshot.config) {
        Object.assign(APP_STATE.config, cachedSnapshot.config);
      }

      if (invRows && invRows.length > 2) {
        parseInventoryRows(invRows);
      } else if (cachedSnapshot && cachedSnapshot.inventoryBySku && Object.keys(APP_STATE.inventoryBySku).length === 0) {
        APP_STATE.inventoryBySku = cachedSnapshot.inventoryBySku;
        const byName = {};
        for (const skuKey of Object.keys(APP_STATE.inventoryBySku)) {
          const p = APP_STATE.inventoryBySku[skuKey];
          if (p && p.nombre) byName[normalizeText(p.nombre)] = p;
        }
        APP_STATE.inventoryByName = byName;
      }

      if (apiState && apiState.inventoryPhotosBySku && typeof apiState.inventoryPhotosBySku === 'object') {
        for (const rawSku of Object.keys(apiState.inventoryPhotosBySku)) {
          const sku = cleanStr(rawSku).toUpperCase();
          if (!sku) continue;
          const entry = apiState.inventoryPhotosBySku[rawSku];
          if (!entry) continue;
          const rawPhotoVal = typeof entry === 'string'
            ? entry
            : cleanStr(entry.foto || entry.fotoRaw || entry.fotoUrl || entry.fullUrl || entry.photoUrl || entry.url || '');
          const explicitId = (typeof entry === 'object' && entry.driveId) ? cleanStr(entry.driveId) : '';
          const resolved = rawPhotoVal
            ? resolveProductPhoto(rawPhotoVal)
            : (explicitId ? {
                driveId: explicitId,
                thumbUrl: `https://lh3.googleusercontent.com/d/${explicitId}=w400`,
                fullUrl: `https://lh3.googleusercontent.com/d/${explicitId}=w1000`
              } : { driveId: '', thumbUrl: '', fullUrl: '' });
          const existing = APP_STATE.inventoryBySku[sku];
          if (existing) {
            if (!existing.fotoUrl && resolved.fullUrl) {
              existing.fotoRaw = existing.fotoRaw || rawPhotoVal;
              existing.fotoId = existing.fotoId || resolved.driveId || explicitId;
              existing.fotoThumb = existing.fotoThumb || resolved.thumbUrl;
              existing.fotoUrl = resolved.fullUrl;
            }
          } else if (resolved.fullUrl || (typeof entry === 'object' && entry.nombre)) {
            const newProd = {
              sku,
              tipo: '',
              modelo: (typeof entry === 'object' ? cleanStr(entry.modelo) : ''),
              nombre: (typeof entry === 'object' ? cleanStr(entry.nombre) : ''),
              fotoRaw: rawPhotoVal,
              fotoId: resolved.driveId || explicitId,
              fotoThumb: resolved.thumbUrl,
              fotoUrl: resolved.fullUrl,
              cedis_bod: 0, cedis_pis: 0, casa_bod: 0, casa_pis: 0,
              ptc_bod: 0, ptc_pis: 0, col_bod: 0, col_pis: 0,
              pla_bod: 0, pla_pis: 0, out_bod: 0, out_pis: 0,
              precio: (typeof entry === 'object' && entry.precio) ? Number(entry.precio) || 0 : 0
            };
            APP_STATE.inventoryBySku[sku] = newProd;
            const nNorm = normalizeText(newProd.nombre);
            if (nNorm && !APP_STATE.inventoryByName[nNorm]) {
              APP_STATE.inventoryByName[nNorm] = newProd;
            }
          }
        }
      }

      const closuresMap = Object.assign(
        {},
        (cachedSnapshot && cachedSnapshot.closures) || {},
        readJsonStorage(SEG_CLOSURES_CACHE_KEY, {})
      );
      for (let i = 1; i < (cierresRows || []).length; i++) {
        const r = cierresRows[i];
        if (!r || !r[1]) continue;
        const fol = cleanStr(r[1]).toUpperCase();
        closuresMap[fol] = {
          Fecha_Hora: cleanStr(r[0]),
          Folio_ERP: fol,
          Sucursal: cleanStr(r[2]),
          Asesor: cleanStr(r[3]),
          Correo_Asesor: normalizeEmail(r[4]),
          Cliente: cleanStr(r[5]),
          WhatsApp_Cliente: cleanPhone(r[6]),
          Estatus_Cierre: cleanStr(r[7]) || 'CERRADA',
          Motivo_Cierre: cleanStr(r[8]),
          Comentarios: cleanStr(r[9]),
          Piezas_Cotizadas: cleanStr(r[11])
        };
      }

      const phoneByFolio = Object.assign({}, readJsonStorage(SEG_PHONES_CACHE_KEY, {}));
      const contactedByFolio = Object.assign({}, readJsonStorage(SEG_CONTACTED_CACHE_KEY, {}));
      const auditLogs = [];

      for (let i = 1; i < (histMovRows || []).length; i++) {
        const r = histMovRows[i];
        if (!r || !r[0]) continue;
        const fh = cleanStr(r[0]);
        const tipo = cleanStr(r[1]).toUpperCase();
        const usuario = cleanStr(r[2]);
        const email = normalizeEmail(r[3]);
        const sucursal = cleanStr(r[4]);
        const accion = cleanStr(r[5]);
        const detalle = cleanStr(r[6]);
        const ip = cleanStr(r[7]) || 'Web';
        const status = cleanStr(r[8]) || 'EXITOSO';

        auditLogs.push({ id: `seg_mov_${i}`, fecha_hora: fh, tipo, usuario, email, sucursal, accion, detalle, ip, status });

        if (tipo === 'WHATSAPP') {
          const mFol = accion.match(/Folio\s+([A-Z0-9\-]+)/i);
          if (mFol) {
            const fol = mFol[1].toUpperCase();
            contactedByFolio[fol] = fh.slice(0, 16);
            const mCel = detalle.match(/Celular:\s*([0-9+]+)/i);
            if (mCel && cleanPhone(mCel[1])) phoneByFolio[fol] = cleanPhone(mCel[1]);
          }
        } else if (tipo === 'TELEFONO') {
          const mFol = accion.match(/Folio\s+([A-Z0-9\-]+)/i);
          const mCel = detalle.match(/Nuevo Celular:\s*([0-9+]+)/i);
          if (mFol && mCel && cleanPhone(mCel[1])) {
            phoneByFolio[mFol[1].toUpperCase()] = cleanPhone(mCel[1]);
          }
        }
      }

      // Strictly verified Set of app-created folios (#6)
      const appCreatedFolios = new Set();
      if (!hasLiveQuoteSheets && cachedSnapshot && Array.isArray(cachedSnapshot.appCreatedFolios)) {
        for (const f of cachedSnapshot.appCreatedFolios) {
          const fol = cleanStr(f).toUpperCase();
          if (fol) appCreatedFolios.add(fol);
        }
      }

      const extraBridgeQuotes = [];
      for (let i = 1; i < (histInvRows || []).length; i++) {
        const r = histInvRows[i];
        if (!r || r.length < 8) continue;
        const fh = cleanStr(r[0]);
        const mod = cleanStr(r[2]);
        if (mod !== 'SEGUIMIENTO_COTIZACIONES') continue;
        const ev = cleanStr(r[3]).toUpperCase();
        const usuarioRaw = cleanStr(r[5]);
        const sucRaw = cleanStr(r[6]);
        const refFol = cleanStr(r[7]).toUpperCase();
        const detRaw = cleanStr(r[8]);

        let payload = null;
        try {
          if (detRaw.startsWith('{')) payload = JSON.parse(detRaw);
        } catch (e) {}

        if (ev === 'SEG_CIERRE' && refFol && payload) {
          closuresMap[refFol] = {
            Fecha_Hora: payload.fecha_hora || fh.slice(0, 16),
            Folio_ERP: refFol,
            Sucursal: payload.sucursal || sucRaw,
            Asesor: payload.asesor || usuarioRaw,
            Correo_Asesor: normalizeEmail(payload.correo_asesor || ''),
            Cliente: payload.cliente || '',
            WhatsApp_Cliente: cleanPhone(payload.whatsapp_cliente || ''),
            Estatus_Cierre: payload.estatus || 'CERRADA',
            Motivo_Cierre: payload.motivo || '',
            Comentarios: payload.comentarios || ''
          };
          auditLogs.push({
            id: `inv_hist_${i}`,
            fecha_hora: fh,
            tipo: 'CIERRE',
            usuario: payload.usuario || usuarioRaw,
            email: payload.email || '',
            sucursal: payload.sucursal || sucRaw,
            accion: `Cotización ${refFol} marcada como ${payload.estatus}`,
            detalle: `Cliente: ${payload.cliente || ''} • Motivo: ${payload.motivo || ''} • Comentarios: ${payload.comentarios || ''}`,
            ip: 'Web-App',
            status: 'EXITOSO'
          });
        } else if (ev === 'SEG_TELEFONO' && refFol && payload) {
          if (cleanPhone(payload.whatsapp_cliente)) {
            phoneByFolio[refFol] = cleanPhone(payload.whatsapp_cliente);
          }
          auditLogs.push({
            id: `inv_hist_${i}`,
            fecha_hora: fh,
            tipo: 'TELEFONO',
            usuario: payload.usuario || usuarioRaw,
            email: payload.email || '',
            sucursal: payload.sucursal || sucRaw,
            accion: `Celular del cliente actualizado para Folio ${refFol}`,
            detalle: `Cliente: ${payload.cliente || ''} • Nuevo Celular: ${payload.whatsapp_cliente || ''}`,
            ip: 'Web-App',
            status: 'EXITOSO'
          });
        } else if ((ev === 'SEG_WHATSAPP' || ev === 'SEG_EMAIL') && refFol && payload) {
          if (ev === 'SEG_WHATSAPP') {
            contactedByFolio[refFol] = payload.fecha_aviso || fh.slice(0, 16);
          }
          auditLogs.push({
            id: `inv_hist_${i}`,
            fecha_hora: fh,
            tipo: ev === 'SEG_WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
            usuario: payload.usuario || usuarioRaw,
            email: payload.email || '',
            sucursal: payload.sucursal || sucRaw,
            accion: `${ev === 'SEG_WHATSAPP' ? 'Seguimiento WhatsApp' : 'Alerta por correo'} (${refFol})`,
            detalle: `Cliente: ${payload.cliente || ''} • Destino: ${payload.phone || payload.destinatario || ''}`,
            ip: 'Web-App',
            status: 'EXITOSO'
          });
        } else if (ev === 'SEG_NUEVA_COTIZACION_APP') {
          if (refFol) appCreatedFolios.add(refFol);
          if (payload && payload.folio) {
            appCreatedFolios.add(cleanStr(payload.folio).toUpperCase());
            extraBridgeQuotes.push(payload);
          }
        } else if ((ev === 'SEG_LOGIN' || ev === 'SEG_LOGOUT') && payload) {
          auditLogs.push({
            id: `inv_hist_${i}`,
            fecha_hora: fh,
            tipo: ev === 'SEG_LOGIN' ? 'LOGIN' : 'LOGOUT',
            usuario: payload.usuario || usuarioRaw,
            email: payload.email || '',
            sucursal: payload.sucursal || sucRaw,
            accion: payload.accion || (ev === 'SEG_LOGIN' ? 'Inicio de sesión' : 'Salida'),
            detalle: payload.detalle || '',
            ip: 'Web-App',
            status: payload.status || 'EXITOSO'
          });
        }
      }

      if (!hasLiveQuoteSheets && cachedSnapshot && Array.isArray(cachedSnapshot.auditLogs)) {
        for (const ca of cachedSnapshot.auditLogs) {
          if (ca && !String(ca.id || '').startsWith('local_')) {
            auditLogs.push(ca);
          }
        }
      }

      const localAudits = readJsonStorage(SEG_AUDIT_CACHE_KEY, []);
      for (const la of localAudits) {
        if (la) auditLogs.push(la);
      }

      APP_STATE.closures = closuresMap;
      const byPartida = new Map();

      // 0. Offline fallback from cached snapshot
      if (!hasLiveQuoteSheets && cachedSnapshot && Array.isArray(cachedSnapshot.rawPartidas)) {
        for (const cp of cachedSnapshot.rawPartidas) {
          if (!cp || !cp.ID_Partida || !cp.Folio_ERP) continue;
          const fol = cleanStr(cp.Folio_ERP).toUpperCase();
          const photo = getItemPhotoMeta(cp);
          const itemObj = {
            ...cp,
            Folio_ERP: fol,
            WhatsApp_Cliente: phoneByFolio[fol] || cleanPhone(cp.WhatsApp_Cliente),
            Fecha_Ultimo_Aviso: contactedByFolio[fol] || cleanStr(cp.Fecha_Ultimo_Aviso),
            Foto_Url: photo.fullUrl,
            Foto_Thumb: photo.thumbUrl,
            Foto_Drive_Id: photo.driveId,
            Creada_En_App: appCreatedFolios.has(fol)
          };
          evaluateItemUrgency(itemObj);
          byPartida.set(cp.ID_Partida, itemObj);
        }
      }

      // 1. Source 1: COTIZACIONES_CREATA (Col AA = r[26] ORIGEN_CREACION)
      for (let i = 1; i < (cotCreataRows || []).length; i++) {
        const r = cotCreataRows[i];
        if (!r || !r[0] || !r[1]) continue;
        const idP = cleanStr(r[0]);
        const folio = cleanStr(r[1]).toUpperCase();
        const sucKey = mapTabToBranchKey(r[3] || folio);
        const sku = cleanStr(r[9]).toUpperCase();
        const advMatch = matchAdvisorInfo(r[4], r[5], sucKey);
        const liveSt = calculateStockForBranch(sku, sucKey);
        const prod = APP_STATE.inventoryBySku[sku];

        if (cleanStr(r[26]).toUpperCase() === 'APP_COTIZACION' || cleanStr(r[25]).toLowerCase() === 'true') {
          appCreatedFolios.add(folio);
        }

        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: parseDateToIso(r[2]),
          Sucursal: sucKey,
          Asesor: (advMatch && advMatch.nombre) || cleanStr(r[4]),
          Correo_Asesor: normalizeEmail(r[5]) || (advMatch && advMatch.correo) || '',
          Tel_Asesor: cleanPhone(r[6]) || (advMatch && advMatch.telefono) || '',
          Cliente: cleanStr(r[7]),
          WhatsApp_Cliente: phoneByFolio[folio] || cleanPhone(r[8]),
          Clave_Producto: sku,
          Nombre_Producto: cleanStr(r[10]) || (prod && prod.nombre) || sku,
          Modelo: cleanStr(r[11]) || (prod && prod.modelo) || '',
          Precio_Unitario: cleanStr(r[12]) || (prod && prod.precio ? prod.precio.toFixed(2) : '0.00'),
          Cantidad_Cotizada: cleanStr(r[13]) || '1',
          Stock_Inicial_Total: cleanStr(r[14]) || (liveSt ? String(liveSt.total_disponible) : '0'),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : (cleanStr(r[15]) || '0'),
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : (cleanStr(r[16]) || '0'),
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : (cleanStr(r[17]) || '0'),
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : (cleanStr(r[18]) || '0'),
          Stock_Actual_Total: liveSt ? String(liveSt.total_disponible) : (cleanStr(r[19]) || '0'),
          Estatus_ERP: cleanStr(r[24]) || 'Cotizado',
          Fecha_Ultimo_Aviso: cleanAvisoDate(contactedByFolio[folio] || r[25]),
          Foto_Url: (prod && prod.fotoUrl) || '',
          Foto_Thumb: (prod && prod.fotoThumb) || '',
          Foto_Drive_Id: (prod && prod.fotoId) || '',
          Creada_En_App: false
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
      }

      // 1b. Source 1b: COTIZACIONES_ARCHIVADAS (cerradas / vendidas / canceladas auto-archivadas)
      for (let i = 1; i < (cotArchivadasRows || []).length; i++) {
        const r = cotArchivadasRows[i];
        if (!r || !r[0] || !r[1]) continue;
        const idP = cleanStr(r[0]);
        const folio = cleanStr(r[1]).toUpperCase();
        const sucKey = mapTabToBranchKey(r[3] || folio);
        const sku = cleanStr(r[9]).toUpperCase();
        const advMatch = matchAdvisorInfo(r[4], r[5], sucKey);
        const liveSt = calculateStockForBranch(sku, sucKey);
        const prod = APP_STATE.inventoryBySku[sku];

        if (cleanStr(r[26]).toUpperCase() === 'APP_COTIZACION' || cleanStr(r[25]).toLowerCase() === 'true') {
          appCreatedFolios.add(folio);
        }

        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: parseDateToIso(r[2]),
          Sucursal: sucKey,
          Asesor: (advMatch && advMatch.nombre) || cleanStr(r[4]),
          Correo_Asesor: normalizeEmail(r[5]) || (advMatch && advMatch.correo) || '',
          Tel_Asesor: cleanPhone(r[6]) || (advMatch && advMatch.telefono) || '',
          Cliente: cleanStr(r[7]),
          WhatsApp_Cliente: phoneByFolio[folio] || cleanPhone(r[8]),
          Clave_Producto: sku,
          Nombre_Producto: cleanStr(r[10]) || (prod && prod.nombre) || sku,
          Modelo: cleanStr(r[11]) || (prod && prod.modelo) || '',
          Precio_Unitario: cleanStr(r[12]) || (prod && prod.precio ? prod.precio.toFixed(2) : '0.00'),
          Cantidad_Cotizada: cleanStr(r[13]) || '1',
          Stock_Inicial_Total: cleanStr(r[14]) || (liveSt ? String(liveSt.total_disponible) : '0'),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : (cleanStr(r[15]) || '0'),
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : (cleanStr(r[16]) || '0'),
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : (cleanStr(r[17]) || '0'),
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : (cleanStr(r[18]) || '0'),
          Stock_Actual_Total: liveSt ? String(liveSt.total_disponible) : (cleanStr(r[19]) || '0'),
          Estatus_ERP: cleanStr(r[24]) || 'Cerrada',
          Fecha_Ultimo_Aviso: cleanAvisoDate(contactedByFolio[folio] || r[25]),
          Foto_Url: (prod && prod.fotoUrl) || '',
          Foto_Thumb: (prod && prod.fotoThumb) || '',
          Foto_Drive_Id: (prod && prod.fotoId) || '',
          Creada_En_App: false,
          Archivada: true,
          Motivo_Archivo: cleanStr(r[27]),
          Fecha_Archivo: cleanStr(r[28])
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
      }

      // 2. Source 2: COTIZACIONES_EN_VIVO (Col Y = r[24] ORIGEN_CREACION + controlled legacy fallback)
      for (let i = 1; i < (cotVivoRows || []).length; i++) {
        const r = cotVivoRows[i];
        if (!r || (!r[1] && !r[0])) continue;
        const folio = cleanStr(r[1] || r[0]).toUpperCase();
        if (!folio) continue;
        const fechaIso = parseDateToIso(r[3]);
        const sucKey = mapTabToBranchKey(r[6] || r[5] || folio);
        const correoAsesor = normalizeEmail(r[7]);
        const nombreAsesorRaw = cleanStr(r[8]);
        const advMatch = matchAdvisorInfo(nombreAsesorRaw, correoAsesor, sucKey);
        const nombreAsesor = (advMatch && advMatch.nombre) || nombreAsesorRaw;
        const telAsesor = (advMatch && advMatch.telefono) || '';
        const cliente = cleanStr(r[11]) || 'Prospecto CREATA';
        const telCliente = phoneByFolio[folio] || cleanPhone(r[12]);
        const resumenSkus = cleanStr(r[17]);

        const origenColY = cleanStr(r[24]).toUpperCase();
        const isAppOriginRow = origenColY === 'APP_COTIZACION' || (
          origenColY === '' &&
          cleanStr(r[2]) !== '' &&
          cleanStr(r[7]) !== '' &&
          /^COTIZACI[ÓO]N REGISTRADA/i.test(cleanStr(r[22]))
        );
        if (isAppOriginRow) {
          appCreatedFolios.add(folio);
        }

        const parts = resumenSkus.split(',').map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          const m = p.match(/^([A-Z0-9\-_./]+)\s*x\s*(\d+)/i);
          const sku = cleanStr(m ? m[1] : p).toUpperCase();
          const qty = m ? (parseInt(m[2], 10) || 1) : 1;
          if (!sku) continue;
          const idP = `${folio}_${sku}`;
          const prev = byPartida.get(idP);
          const prod = APP_STATE.inventoryBySku[sku];
          const liveSt = calculateStockForBranch(sku, sucKey);
          const stActual = liveSt ? liveSt.total_disponible : (prev ? parseInt(prev.Stock_Actual_Total || '0', 10) : 0);
          const stIni = prev && parseInt(prev.Stock_Inicial_Total || '0', 10) > 0
            ? parseInt(prev.Stock_Inicial_Total, 10)
            : Math.max(stActual, qty);

          const itemObj = {
            ID_Partida: idP,
            Folio_ERP: folio,
            Fecha_Cotizacion: fechaIso,
            Sucursal: sucKey,
            Asesor: nombreAsesor,
            Correo_Asesor: correoAsesor || (prev && prev.Correo_Asesor) || '',
            Tel_Asesor: telAsesor || (prev && prev.Tel_Asesor) || '',
            Cliente: cliente,
            WhatsApp_Cliente: telCliente || (prev && prev.WhatsApp_Cliente) || '',
            Clave_Producto: sku,
            Nombre_Producto: (prod && prod.nombre) || (prev && prev.Nombre_Producto) || sku,
            Modelo: (prod && prod.modelo) || (prev && prev.Modelo) || '',
            Precio_Unitario: (prod && prod.precio ? prod.precio.toFixed(2) : ((prev && prev.Precio_Unitario) || '0.00')),
            Cantidad_Cotizada: String(qty),
            Stock_Inicial_Total: String(stIni),
            Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : ((prev && prev.Stock_Actual_CEDIS_Bodega) || '0'),
            Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : ((prev && prev.Stock_Actual_CEDIS_Piso) || '0'),
            Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : ((prev && prev.Stock_Actual_Tienda_Bodega) || '0'),
            Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : ((prev && prev.Stock_Actual_Tienda_Piso) || '0'),
            Stock_Actual_Total: String(stActual),
            Estatus_ERP: (prev && prev.Estatus_ERP) || 'Cotizado',
            Fecha_Ultimo_Aviso: contactedByFolio[folio] || (prev && prev.Fecha_Ultimo_Aviso) || '',
            Foto_Url: (prod && prod.fotoUrl) || (prev && prev.Foto_Url) || '',
            Foto_Thumb: (prod && prod.fotoThumb) || (prev && prev.Foto_Thumb) || '',
            Foto_Drive_Id: (prod && prod.fotoId) || (prev && prev.Foto_Drive_Id) || '',
            Creada_En_App: false,
            Archivada: Boolean(prev && prev.Archivada),
            Motivo_Archivo: (prev && prev.Motivo_Archivo) || '',
            Fecha_Archivo: (prev && prev.Fecha_Archivo) || ''
          };
          evaluateItemUrgency(itemObj);
          byPartida.set(idP, itemObj);
        }
      }

      // 3. Source 3: localStorage bridge + HISTORIAL SEG_NUEVA_COTIZACION_APP
      const localBridgeQuotes = readJsonStorage(APP_QUOTES_BRIDGE_KEY, []);
      const allBridgeQuotes = [...extraBridgeQuotes, ...(Array.isArray(localBridgeQuotes) ? localBridgeQuotes : [])];
      for (const bq of allBridgeQuotes) {
        if (!bq || !bq.folio || !Array.isArray(bq.items)) continue;
        const folio = cleanStr(bq.folio).toUpperCase();
        appCreatedFolios.add(folio);
        const fechaIso = parseDateToIso(bq.fecha || '');
        const sucKey = mapTabToBranchKey(bq.erpStore || bq.sheetTab || folio);
        const correoAsesor = normalizeEmail(bq.advisorEmail);
        const advMatch = matchAdvisorInfo(bq.advisorName, correoAsesor, sucKey);
        const nombreAsesor = (advMatch && advMatch.nombre) || cleanStr(bq.advisorName);
        const telAsesor = (advMatch && advMatch.telefono) || '';
        const cliente = cleanStr(bq.clientName) || 'Prospecto CREATA';
        const telCliente = phoneByFolio[folio] || cleanPhone(bq.clientPhone);

        for (const it of bq.items) {
          const sku = cleanStr(it.sku).toUpperCase();
          if (!sku) continue;
          const qty = Math.max(1, parseInt(it.qty || '1', 10) || 1);
          const idP = `${folio}_${sku}`;
          const prev = byPartida.get(idP);
          const prod = APP_STATE.inventoryBySku[sku];
          const liveSt = calculateStockForBranch(sku, sucKey);
          const stActual = liveSt ? liveSt.total_disponible : (prev ? parseInt(prev.Stock_Actual_Total || '0', 10) : 0);
          const stIni = prev && parseInt(prev.Stock_Inicial_Total || '0', 10) > 0
            ? parseInt(prev.Stock_Inicial_Total, 10)
            : Math.max(stActual, qty);
          const bqPhoto = resolveProductPhoto(it.photoUrl || it.fotoUrl || it.fotoRaw || (prod && prod.fotoRaw) || (prev && prev.Foto_Url) || '');

          const itemObj = {
            ID_Partida: idP,
            Folio_ERP: folio,
            Fecha_Cotizacion: fechaIso,
            Sucursal: sucKey,
            Asesor: nombreAsesor,
            Correo_Asesor: correoAsesor,
            Tel_Asesor: telAsesor,
            Cliente: cliente,
            WhatsApp_Cliente: telCliente || (prev && prev.WhatsApp_Cliente) || '',
            Clave_Producto: sku,
            Nombre_Producto: cleanStr(it.name) || (prod && prod.nombre) || (prev && prev.Nombre_Producto) || sku,
            Modelo: cleanStr(it.model) || (prod && prod.modelo) || (prev && prev.Modelo) || '',
            Precio_Unitario: it.price ? Number(it.price).toFixed(2) : ((prod && prod.precio ? prod.precio.toFixed(2) : '0.00')),
            Cantidad_Cotizada: String(qty),
            Stock_Inicial_Total: String(stIni),
            Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : '0',
            Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : '0',
            Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : '0',
            Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : '0',
            Stock_Actual_Total: String(stActual),
            Estatus_ERP: (prev && prev.Estatus_ERP) || 'Cotizado',
            Fecha_Ultimo_Aviso: contactedByFolio[folio] || (prev && prev.Fecha_Ultimo_Aviso) || '',
            Foto_Url: bqPhoto.fullUrl || (prod && prod.fotoUrl) || (prev && prev.Foto_Url) || '',
            Foto_Thumb: bqPhoto.thumbUrl || (prod && prod.fotoThumb) || (prev && prev.Foto_Thumb) || '',
            Foto_Drive_Id: bqPhoto.driveId || (prod && prod.fotoId) || (prev && prev.Foto_Drive_Id) || '',
            Creada_En_App: true,
            Archivada: Boolean(prev && prev.Archivada),
            Motivo_Archivo: (prev && prev.Motivo_Archivo) || '',
            Fecha_Archivo: (prev && prev.Fecha_Archivo) || ''
          };
          evaluateItemUrgency(itemObj);
          byPartida.set(idP, itemObj);
        }
      }

      const allPartidas = Array.from(byPartida.values());
      const allGrouped = groupQuotesByFolio(allPartidas, closuresMap, appCreatedFolios);
      const filteredForUser = filterGroupedQuotesForUser(allGrouped, APP_STATE.user);

      APP_STATE.rawPartidas = allPartidas;
      APP_STATE.quotes = filteredForUser;
      APP_STATE.auditLogs = auditLogs;
      APP_STATE.appCreatedFolios = Array.from(appCreatedFolios);
      rebindActiveModalQuote();

      if (hasLiveQuoteSheets && allPartidas.length > 0) {
        saveCompactSegSnapshot();
        flushSegOfflineOutbox();
      }

      const sl = $('seg_lastSyncLabel');
      if (sl) {
        sl.textContent = (!hasLiveQuoteSheets && cachedSnapshot)
          ? 'Respaldo local'
          : (APP_STATE.last_erp_sync || 'En vivo');
      }

      populateAdvisorFilter();
      if (!_segUiCheckpointRestoredOnce) {
        restoreSegUiCheckpointOnce(false);
      } else if (!isBackground && _pendingSegCheckpointRestore) {
        applyPendingSegCheckpointRestore();
      } else {
        renderQuotes();
      }
    } catch (err) {
      if (mounted) {
        if (!_segUiCheckpointRestoredOnce) {
          restoreSegUiCheckpointOnce(false);
        } else if (!isBackground) {
          _pendingSegCheckpointRestore = null;
          renderQuotes();
        }
      }
    }
  }

  // ============================================================================
  // SHELL HTML IN-APP (IDs PREFIJADOS seg_, 100% DELEGADO, CERO LINKS EXTERNOS)
  // ============================================================================
  function buildModuleMarkup() {
    return `
      <header class="cm-topbar">
        <div class="cm-topbar-inner">
          <div class="cm-topbar-left">
            <button type="button" class="cm-btn cm-btn-back" data-seg-action="close-module" aria-label="Volver">← Volver</button>
            <h1 class="cm-title">Seguimiento de Cotizaciones</h1>
            <span id="seg_hdrUserRoleStore" class="cm-subtitle-chip"></span>
          </div>
          <div class="cm-topbar-right">
            <span id="seg_lastSyncLabel" class="cm-subtitle-chip cm-mono"></span>
            <button type="button" id="seg_btnManualSync" class="cm-btn cm-btn-icon" data-seg-action="manual-sync" aria-label="Buscar cambios nuevos" title="Consultar solo modificaciones nuevas sin recargar todo">
              <span id="seg_syncIcon">🔄</span>
              <span id="seg_syncText">Buscar cambios</span>
            </button>
          </div>
        </div>
      </header>

      <main class="cm-main">
        <section id="seg_filtersGridContainer" class="cm-seg-filters" aria-label="Filtros y búsqueda">
          <div class="cm-seg-search-field">
            <label class="cm-field-label" for="seg_filterSearch">🔍 Buscar Folio, Cliente, Teléfono o Mueble</label>
            <div class="cm-seg-search-wrap">
              <input id="seg_filterSearch" type="search" enterkeyhint="search" class="cm-input" placeholder="Buscar cliente, folio, teléfono o mueble..." autocomplete="off" data-seg-input="search">
              <button type="button" id="seg_btnClearSearch" class="cm-seg-clear-btn cm-hidden" data-seg-action="clear-search" aria-label="Limpiar">✕</button>
            </div>
          </div>

          <div>
            <label class="cm-field-label" for="seg_filterSucursal">📍 Sucursal / Tienda</label>
            <select id="seg_filterSucursal" class="cm-select" data-seg-change="sucursal">
              <option value="TODAS">Todas las Sucursales</option>
            </select>
            <div id="seg_fixedSucursalBadge" class="cm-seg-fixed-branch cm-hidden">
              <span id="seg_fixedSucursalLabel"></span>
            </div>
          </div>

          <div id="seg_filterAsesorWrap">
            <label class="cm-field-label" for="seg_filterAsesor">👤 Asesor</label>
            <select id="seg_filterAsesor" class="cm-select" data-seg-change="filter">
              <option value="TODOS">Todos los Asesores</option>
            </select>
          </div>

          <div>
            <label class="cm-field-label" for="seg_filterUrgencia">🚨 Nivel de Alerta / Stock</label>
            <select id="seg_filterUrgencia" class="cm-select" data-seg-change="filter">
              <option value="TODOS">Todos los Estados</option>
              <option value="CRITICO">🔥 Crítico (Stock bajo / agotándose)</option>
              <option value="SOLO_PISO">🏛️ Solo en Piso de Exhibición</option>
              <option value="BAJADA">📉 Bajó Stock</option>
              <option value="SEGUIMIENTO_DIAS">📅 Seguimiento (3+ días)</option>
              <option value="ESTABLE">🟢 Disponible / Estable</option>
            </select>
          </div>
        </section>

        <div class="cm-seg-meta-bar">
          <div id="seg_viewTabsBar" class="cm-seg-view-tabs" role="tablist" aria-label="Vista de cotizaciones">
            <button type="button" id="seg_tabActivas" class="cm-seg-view-tab is-active" role="tab" aria-selected="true" data-seg-action="set-view-mode" data-view="ACTIVAS">
              <span>📋 Activas</span>
              <span id="seg_countActivas" class="cm-seg-view-tab-count">0</span>
            </button>
            <button type="button" id="seg_tabArchivadas" class="cm-seg-view-tab" role="tab" aria-selected="false" data-seg-action="set-view-mode" data-view="ARCHIVADAS">
              <span>📦 Archivadas / Cerradas</span>
              <span id="seg_countArchivadas" class="cm-seg-view-tab-count">0</span>
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div id="seg_statsSummary">Cargando cotizaciones completas...</div>
            <div id="seg_closuresMetricsSummary"></div>
          </div>
        </div>

        <section id="seg_mobileCards" class="cm-seg-cards" aria-label="Cotizaciones"></section>

        <section class="cm-seg-table-wrap" aria-label="Tabla de cotizaciones">
          <table class="cm-seg-table">
            <thead>
              <tr>
                <th>Folio / Fecha</th>
                <th>Asesor / Tienda</th>
                <th>Cliente</th>
                <th>Muebles Cotizados (Piezas)</th>
                <th>Estado Global</th>
                <th>Aviso WhatsApp</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody id="seg_tableBody"></tbody>
          </table>
        </section>
      </main>

      <!-- MODAL SEGUIMIENTO WHATSAPP / CORREO + ADJUNTAR FOTO (#14) -->
      <div id="seg_previewModal" class="cm-modal-backdrop cm-hidden" data-seg-backdrop="preview">
        <div class="cm-modal-card" role="dialog" aria-modal="true" aria-labelledby="seg_previewModalTitle">
          <div class="cm-modal-head">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
              <h2 id="seg_previewModalTitle" class="cm-modal-title">💬 Seguimiento Persuasivo de Cotización</h2>
              <span id="seg_previewUrgencyBadge"></span>
            </div>
            <button type="button" class="cm-modal-close" data-seg-action="close-preview" aria-label="Cerrar">&times;</button>
          </div>

          <div id="seg_modalRecipientTabs" class="cm-seg-recipient-tabs cm-hidden">
            <button type="button" id="seg_btnRecipientCliente" class="cm-seg-tab-btn is-active" data-seg-action="recipient" data-recipient="CLIENTE">👤 Mensaje al Cliente</button>
            <button type="button" id="seg_btnRecipientAsesor" class="cm-seg-tab-btn" data-seg-action="recipient" data-recipient="ASESOR">👔 Alerta de Supervisión al Asesor</button>
          </div>

          <div class="cm-seg-info-grid">
            <div class="cm-seg-info-box">
              <div class="cm-field-label">Cliente Destinatario 👤</div>
              <div id="seg_previewCliente" style="font-weight:800;font-size:0.9rem;">--</div>
              <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span id="seg_previewPhoneVal" class="cm-mono" style="font-weight:700;">--</span>
                <button type="button" class="cm-seg-link-btn" data-seg-action="edit-modal-phone">✏️ Editar celular</button>
              </div>
            </div>
            <div class="cm-seg-info-box">
              <div class="cm-field-label">Asesor Asignado &amp; Tienda 🛎️</div>
              <div id="seg_previewAsesor" style="font-weight:800;font-size:0.9rem;">--</div>
              <div id="seg_previewAsesorContact" style="font-size:0.74rem;color:var(--cm-muted);margin-top:2px;">--</div>
              <div id="seg_previewSucursal" style="font-size:0.74rem;color:var(--cm-muted);">--</div>
            </div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
              <span class="cm-field-label" style="margin:0;">📦 Piezas a incluir en el mensaje:</span>
              <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.76rem;font-weight:700;cursor:pointer;">
                <input type="checkbox" id="seg_chkSelectAllItems" checked data-seg-change="select-all">
                <span>Seleccionar todas</span>
              </label>
            </div>
            <div id="seg_modalItemsList" class="cm-seg-modal-items"></div>
          </div>

          <div id="seg_modalToneSelectorWrap">
            <div class="cm-field-label">Tono del mensaje persuasivo:</div>
            <div class="cm-seg-tpl-grid">
              <button type="button" id="seg_btnTplEmocional" class="cm-seg-tpl-btn is-active" data-seg-action="select-tpl" data-tpl="EMOCIONAL">💖 1. Ilusión &amp; Disponibilidad</button>
              <button type="button" id="seg_btnTplPiso" class="cm-seg-tpl-btn" data-seg-action="select-tpl" data-tpl="SOLO_PISO">⭐ 2. Última en Tienda</button>
              <button type="button" id="seg_btnTplSeguimiento" class="cm-seg-tpl-btn" data-seg-action="select-tpl" data-tpl="SEGUIMIENTO">🤝 3. Seguimiento Cálido</button>
            </div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px;flex-wrap:wrap;">
              <label class="cm-field-label" for="seg_previewMessageText" style="margin:0;">Mensaje generado (puedes editarlo libremente antes de enviar):</label>
              <button type="button" class="cm-seg-link-btn" data-seg-action="rebuild-msg">Restaurar texto</button>
            </div>
            <textarea id="seg_previewMessageText" rows="6" class="cm-textarea" data-seg-input="preview-msg"></textarea>
          </div>

          <div id="seg_previewLastContacted" style="font-size:0.76rem;color:var(--cm-muted);"></div>

          <div class="cm-seg-modal-actions">
            <button type="button" class="cm-btn" data-seg-action="copy-msg">📋 Copiar Texto</button>
            <button type="button" id="seg_btnActionEmail" class="cm-btn" data-seg-action="send-email">✉️ Enviar Correo al Cliente</button>
            <button type="button" id="seg_btnActionWhatsApp" class="cm-btn cm-btn-emerald" data-seg-action="send-wa">📲 Enviar WhatsApp al Cliente</button>
          </div>
        </div>
      </div>

      <!-- MODAL CIERRE -->
      <div id="seg_modalCerrarCotizacion" class="cm-modal-backdrop cm-hidden" data-seg-backdrop="close-quote">
        <div class="cm-modal-card cm-modal-sm" role="dialog" aria-modal="true" aria-labelledby="seg_closeModalTitle">
          <div class="cm-modal-head">
            <div>
              <h2 id="seg_closeModalTitle" class="cm-modal-title">🔒 Cerrar Cotización • <span id="seg_closeModalFolio" class="cm-mono"></span></h2>
              <div id="seg_closeModalCliente" style="font-size:0.78rem;color:var(--cm-muted);margin-top:2px;">--</div>
            </div>
            <button type="button" class="cm-modal-close" data-seg-action="close-cerrar" aria-label="Cerrar">&times;</button>
          </div>

          <div>
            <span class="cm-field-label">Resultado de la Negociación:</span>
            <div class="cm-seg-close-grid">
              <button type="button" id="seg_btnCloseStatusGanada" class="cm-seg-status-btn is-ganada" data-seg-action="close-status" data-status="GANADA">✅ Ganada</button>
              <button type="button" id="seg_btnCloseStatusPerdida" class="cm-seg-status-btn" data-seg-action="close-status" data-status="PERDIDA">❌ Perdida</button>
              <button type="button" id="seg_btnCloseStatusCancelada" class="cm-seg-status-btn" data-seg-action="close-status" data-status="CANCELADA">⚠️ Cancelada</button>
            </div>
          </div>

          <div>
            <label class="cm-field-label" for="seg_closeModalMotivo">Motivo del Cierre:</label>
            <select id="seg_closeModalMotivo" class="cm-select" data-seg-change="close-motivo">
              <option value="Venta Concretada Exitosamente">Venta Concretada Exitosamente</option>
              <option value="Falta de Inventario / Producto Agotado">Falta de Inventario / Producto Agotado</option>
              <option value="Precio / Fuera de Presupuesto">Precio / Fuera de Presupuesto</option>
              <option value="Tiempos de Entrega">Tiempos de Entrega</option>
              <option value="Compró con la Competencia">Compró con la Competencia</option>
              <option value="El Cliente no Volvió a Responder">El Cliente no Volvió a Responder</option>
              <option value="Cambio de Proyecto / No Requiere Mobiliario">Cambio de Proyecto / No Requiere Mobiliario</option>
              <option value="Otro">Otro Motivo</option>
            </select>
          </div>

          <div>
            <label class="cm-field-label" for="seg_closeModalComentarios">Observaciones y Retroalimentación del Asesor:</label>
            <textarea id="seg_closeModalComentarios" rows="3" class="cm-textarea" placeholder="Ej. El cliente compró comedor; seccional no disponible en el acabado solicitado..." data-seg-input="close-comentarios"></textarea>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button type="button" class="cm-btn" data-seg-action="close-cerrar">Cancelar</button>
            <button type="button" id="seg_btnSubmitClose" class="cm-btn cm-btn-primary" data-seg-action="submit-close">Confirmar Cierre</button>
          </div>
        </div>
      </div>

      <!-- MODAL AUDITORÍA KEVIN -->
      <div id="seg_modalKevinAudit" class="cm-modal-backdrop cm-hidden" data-seg-backdrop="kevin-audit">
        <div class="cm-modal-card cm-modal-lg" role="dialog" aria-modal="true" aria-labelledby="seg_auditModalTitle">
          <div class="cm-modal-head">
            <h2 id="seg_auditModalTitle" class="cm-modal-title">🛡️ Panel Maestro de Auditoría e Historial de Movimientos</h2>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" id="seg_btnExportAudit" class="cm-btn cm-btn-emerald" data-seg-action="export-audit">📥 Descargar CSV de Auditoría</button>
              <button type="button" class="cm-modal-close" data-seg-action="close-kevin-audit" aria-label="Cerrar">&times;</button>
            </div>
          </div>

          <div class="cm-seg-audit-kpis">
            <div class="cm-seg-audit-kpi">
              <div class="cm-field-label">Inicios Exitosos 🟢</div>
              <div id="seg_auditMetricLoginsOk" class="cm-seg-audit-kpi-val cm-tabular">0</div>
            </div>
            <div class="cm-seg-audit-kpi">
              <div class="cm-field-label">Intentos Fallidos 🔴</div>
              <div id="seg_auditMetricLoginsFail" class="cm-seg-audit-kpi-val cm-tabular">0</div>
            </div>
            <div class="cm-seg-audit-kpi">
              <div class="cm-field-label">WhatsApps Enviados 📲</div>
              <div id="seg_auditMetricWhatsApps" class="cm-seg-audit-kpi-val cm-tabular">0</div>
            </div>
            <div class="cm-seg-audit-kpi">
              <div class="cm-field-label">Ventas Cerradas 🏆</div>
              <div id="seg_auditMetricCierres" class="cm-seg-audit-kpi-val cm-tabular">0</div>
            </div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" id="seg_tabAuditLogins" class="cm-seg-tab-btn is-active" data-seg-action="audit-tab" data-tab="LOGINS">🔐 Inicios de Sesión</button>
              <button type="button" id="seg_tabAuditMovimientos" class="cm-seg-tab-btn" data-seg-action="audit-tab" data-tab="MOVIMIENTOS">📋 Registro de Movimientos</button>
              <button type="button" id="seg_tabAuditCotizaciones" class="cm-seg-tab-btn" data-seg-action="audit-tab" data-tab="HISTORIAL_COTIZACIONES">📂 Historial de Cotizaciones</button>
            </div>
            <input type="search" id="seg_auditSearchInput" class="cm-input" style="max-width:260px;" placeholder="🔍 Buscar usuario, folio, IP..." data-seg-input="audit-search">
          </div>

          <div id="seg_auditTableContainer" style="min-height:220px;max-height:48dvh;overflow-y:auto;"></div>
        </div>
      </div>

      <div id="seg_toast" class="cm-toast is-hidden" role="status" aria-live="polite">
        <span id="seg_toastIcon"></span>
        <span id="seg_toastMsg"></span>
      </div>
    `;
  }

  // ============================================================================
  // CABECERA, FILTROS Y RENDERIZADO RESPONSIVE
  // ============================================================================
  function renderUserHeaderAndRoleControls() {
    const user = APP_STATE.user;
    if (!user || !mounted) return;

    const hdrRoleStore = $('seg_hdrUserRoleStore');
    if (hdrRoleStore) {
      hdrRoleStore.textContent = `${user.nombre || user.correo} · ${user.sucursal_label || user.sucursal}`;
    }

    const btnKevin = $('seg_btnKevinAuditHeader');
    if (btnKevin) {
      btnKevin.classList.toggle('cm-hidden', !isKevinReyna(user));
    }

    const selSuc = $('seg_filterSucursal');
    const fixedBadge = $('seg_fixedSucursalBadge');
    const fixedLabel = $('seg_fixedSucursalLabel');
    const asesorWrap = $('seg_filterAsesorWrap');
    const grid = $('seg_filtersGridContainer');

    const userBranches = Array.isArray(user.all_branches) && user.all_branches.length > 0
      ? user.all_branches
      : (user.sucursal && user.sucursal !== 'TODAS' ? [user.sucursal] : []);

    if (user.is_master || user.es_admin) {
      if (selSuc) {
        const prev = selSuc.value;
        selSuc.innerHTML = [
          '<option value="TODAS">Todas las Sucursales</option>',
          '<option value="PLAYA">Playa del Carmen</option>',
          '<option value="COLOSIO">Colosio</option>',
          '<option value="PUERTO CANCUN">Puerto Cancún (PTC)</option>',
          '<option value="CASA CREATA">Casa Creata</option>',
          '<option value="PROYECTOS">Proyectos</option>'
        ].join('');
        if (prev && Array.from(selSuc.options).some(o => o.value === prev)) selSuc.value = prev;
        selSuc.classList.remove('cm-hidden');
      }
      if (fixedBadge) fixedBadge.classList.add('cm-hidden');
      if (asesorWrap) asesorWrap.classList.remove('cm-hidden');
      if (grid) grid.classList.remove('cm-seg-filters-3');
    } else if (userBranches.length > 1) {
      if (selSuc) {
        const prev = selSuc.value;
        selSuc.innerHTML = `<option value="TODAS">Mis tiendas (${userBranches.length})</option>` +
          userBranches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(getBranchLabel(b))}</option>`).join('');
        if (prev && Array.from(selSuc.options).some(o => o.value === prev)) selSuc.value = prev;
        selSuc.classList.remove('cm-hidden');
      }
      if (fixedBadge) fixedBadge.classList.add('cm-hidden');
      if (asesorWrap) asesorWrap.classList.toggle('cm-hidden', !user.es_gerente);
      if (grid) grid.classList.toggle('cm-seg-filters-3', !user.es_gerente);
    } else {
      const onlyBranch = userBranches[0] || user.sucursal || 'PROYECTOS';
      if (selSuc) {
        selSuc.innerHTML = `<option value="${escapeHtml(onlyBranch)}">${escapeHtml(getBranchLabel(onlyBranch))}</option>`;
        selSuc.value = onlyBranch;
        selSuc.classList.add('cm-hidden');
      }
      if (fixedLabel) fixedLabel.textContent = getBranchLabel(onlyBranch);
      if (fixedBadge) fixedBadge.classList.remove('cm-hidden');
      if (asesorWrap) asesorWrap.classList.toggle('cm-hidden', !user.es_gerente);
      if (grid) grid.classList.toggle('cm-seg-filters-3', !user.es_gerente);
    }
  }

  function populateAdvisorFilter() {
    const select = $('seg_filterAsesor');
    if (!select) return;
    const user = APP_STATE.user;
    if (user && !user.is_master && !user.es_admin && !user.es_gerente) {
      select.innerHTML = `<option value="TODOS">${escapeHtml(user.nombre)}</option>`;
      select.value = 'TODOS';
      return;
    }

    const currentVal = select.value;
    const advisors = APP_STATE.advisors || [];
    const currentSucursal = cleanStr($('seg_filterSucursal')?.value || 'TODAS').toUpperCase();
    const allowedBranches = (user && !user.is_master && !user.es_admin && Array.isArray(user.all_branches) && user.all_branches.length > 0)
      ? new Set(user.all_branches)
      : null;

    const filtered = advisors.filter(a => {
      const aSuc = cleanStr(a.sucursal).toUpperCase();
      if (allowedBranches && !allowedBranches.has(aSuc)) return false;
      if (currentSucursal === 'TODAS') return true;
      return aSuc === currentSucursal;
    });

    select.innerHTML = '<option value="TODOS">Todos los Asesores</option>' +
      filtered.map(a => `<option value="${escapeHtml(a.nombre)}">${escapeHtml(a.nombre)}</option>`).join('');

    if (filtered.some(a => a.nombre === currentVal)) {
      select.value = currentVal;
    } else {
      select.value = 'TODOS';
    }
  }

  function setSegViewMode(mode) {
    const nextMode = cleanStr(mode).toUpperCase() === 'ARCHIVADAS' ? 'ARCHIVADAS' : 'ACTIVAS';
    if (ACTIVE_VIEW_MODE !== nextMode) {
      if (nextMode === 'ARCHIVADAS') {
        notifySegBackStatePush('seg_view_archivadas');
      }
      ACTIVE_VIEW_MODE = nextMode;
    }
    renderQuotes();
    saveSegUiCheckpointNow();
  }

  function renderBadge(q) {
    if (q.Cerrada || q.Archivada) {
      const est = cleanStr(q.Estatus_Cierre || '').toUpperCase();
      const erpTag = q.Archivo_Origen === 'ERP' ? ' (ERP)' : '';
      if (est === 'GANADA') {
        return `<span class="cm-pill cm-pill-emerald">Ganada${erpTag}</span>`;
      }
      if (est === 'CANCELADA') {
        return `<span class="cm-pill cm-pill-rose">Cancelada${erpTag}</span>`;
      }
      if (est === 'PERDIDA') {
        return `<span class="cm-pill cm-pill-slate">Perdida${erpTag}</span>`;
      }
      return `<span class="cm-pill cm-pill-slate">${escapeHtml(q.Estatus_Cierre || 'Archivada')}${erpTag}</span>`;
    }

    const items = q.items || [];
    let hasZero = false;
    let hasInsufficient = false;
    let hasAjustado = false;

    for (const it of items) {
      const st = parseInt(it.Stock_Actual_Total || 0, 10);
      const cant = parseInt(it.Cantidad_Cotizada || 1, 10);
      if (st <= 0) hasZero = true;
      else if (st < cant) hasInsufficient = true;
      else if (st <= 3 || st === cant) hasAjustado = true;
    }

    if (hasZero || hasInsufficient) {
      return '<span class="cm-pill cm-pill-rose">Incompleto</span>';
    }
    if (q.Nivel_Urgencia === 'CRITICO') {
      return '<span class="cm-pill cm-pill-rose">Crítico</span>';
    }
    if (hasAjustado) {
      return '<span class="cm-pill cm-pill-amber">Ajustado</span>';
    }
    if (q.Nivel_Urgencia === 'SOLO_PISO') {
      return '<span class="cm-pill cm-pill-amber">Solo piso</span>';
    }
    return '<span class="cm-pill cm-pill-emerald">Disponible</span>';
  }

  function renderQuotes() {
    if (!mounted) return;
    const quotes = APP_STATE.quotes || [];
    const filterSucursal = cleanStr($('seg_filterSucursal')?.value || 'TODAS').toUpperCase();
    const filterSucursalKey = filterSucursal !== 'TODAS' ? mapTabToBranchKey(filterSucursal) : 'TODAS';
    const filterAsesor = cleanStr($('seg_filterAsesor')?.value || 'TODOS');
    const filterUrgencia = cleanStr($('seg_filterUrgencia')?.value || 'TODOS');
    const rawSearch = cleanStr($('seg_filterSearch')?.value || '');
    const search = rawSearch.toLowerCase();
    const isArchivadasView = ACTIVE_VIEW_MODE === 'ARCHIVADAS';

    const clearBtn = $('seg_btnClearSearch');
    if (clearBtn) clearBtn.classList.toggle('cm-hidden', !search);

    const user = APP_STATE.user;
    const isMasterUser = Boolean(user && (user.is_master || user.es_admin));
    const isGerenteUser = Boolean(user && user.es_gerente);

    const matchesBaseScope = (q) => {
      if (filterSucursalKey !== 'TODAS' && mapTabToBranchKey(q.Sucursal) !== filterSucursalKey) return false;
      if ((isMasterUser || isGerenteUser) && filterAsesor !== 'TODOS') {
        if (normalizeText(q.Asesor) !== normalizeText(filterAsesor)) return false;
      }
      return true;
    };

    const scopedQuotes = quotes.filter(matchesBaseScope);
    const activeScopedCount = scopedQuotes.filter(q => !(q.Cerrada || q.Archivada)).length;
    const archivedScopedCount = scopedQuotes.filter(q => Boolean(q.Cerrada || q.Archivada)).length;

    const tabAct = $('seg_tabActivas');
    const tabArch = $('seg_tabArchivadas');
    const cntAct = $('seg_countActivas');
    const cntArch = $('seg_countArchivadas');
    if (tabAct) {
      tabAct.classList.toggle('is-active', !isArchivadasView);
      tabAct.setAttribute('aria-selected', !isArchivadasView ? 'true' : 'false');
    }
    if (tabArch) {
      tabArch.classList.toggle('is-active', isArchivadasView);
      tabArch.setAttribute('aria-selected', isArchivadasView ? 'true' : 'false');
    }
    if (cntAct) cntAct.textContent = String(activeScopedCount);
    if (cntArch) cntArch.textContent = String(archivedScopedCount);

    const filtered = scopedQuotes.filter(q => {
      const isClosedOrArchived = Boolean(q.Cerrada || q.Archivada);
      if (!search) {
        if (isArchivadasView) {
          if (!isClosedOrArchived) return false;
        } else {
          if (isClosedOrArchived) return false;
          if (filterUrgencia !== 'TODOS' && q.Nivel_Urgencia !== filterUrgencia) return false;
        }
      }

      if (search) {
        const normSearch = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const tokens = normSearch.split(/\s+/).filter(Boolean);
        const itemsText = (q.items || []).map(it =>
          `${it.Nombre_Producto || ''} ${it.Clave_Producto || ''} ${it.SKU || ''} ${it.Modelo || ''}`
        ).join(' ');
        const fullHaystack = `
          ${q.Folio_ERP || ''} ${q.Cliente || ''} ${q.WhatsApp_Cliente || ''}
          ${q.Asesor || ''} ${q.Correo_Asesor || ''} ${q.Sucursal || ''}
          ${q.Sucursal_Label || ''} ${q.Estatus_ERP || ''} ${q.Estatus_Cierre || ''}
          ${q.Motivo_Cierre || ''} ${q.Comentarios_Cierre || ''}
          ${q.Motivo_Urgencia || ''} ${q.Fecha_Cotizacion || ''} ${itemsText}
        `.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const compactHaystack = fullHaystack.replace(/[^a-z0-9]+/g, '');
        const allMatched = tokens.every(tok => {
          if (fullHaystack.includes(tok)) return true;
          const compactTok = tok.replace(/[^a-z0-9]+/g, '');
          return compactTok.length >= 2 && compactHaystack.includes(compactTok);
        });
        if (!allMatched) return false;
      }
      return true;
    });

    const statsEl = $('seg_statsSummary');
    if (statsEl) {
      if (search) {
        statsEl.innerHTML = `<strong>${filtered.length}</strong> resultados para “${escapeHtml(rawSearch)}” (activas y archivadas)`;
      } else if (isArchivadasView) {
        statsEl.innerHTML = `<strong>${filtered.length}</strong> cotizaciones archivadas / cerradas`;
      } else {
        statsEl.innerHTML = `<strong>${filtered.length}</strong> cotizaciones activas`;
      }
    }

    const closuresElem = $('seg_closuresMetricsSummary');
    if (closuresElem) {
      if (user && (user.es_gerente || user.is_master)) {
        const closedQuotes = scopedQuotes.filter(q => q.Cerrada || q.Archivada);
        const ganadas = closedQuotes.filter(q => q.Estatus_Cierre === 'GANADA').length;
        const perdidas = closedQuotes.filter(q => q.Estatus_Cierre === 'PERDIDA' || q.Estatus_Cierre === 'CANCELADA').length;
        if (closedQuotes.length > 0) {
          const pct = Math.round((ganadas / closedQuotes.length) * 100);
          closuresElem.innerHTML = `<span class="cm-pill cm-pill-slate">Cierres: ${closedQuotes.length} · ${ganadas} ganadas (${pct}%) · ${perdidas} perdidas/canc.</span>`;
        } else {
          closuresElem.innerHTML = '';
        }
      } else {
        closuresElem.innerHTML = '';
      }
    }

    const tbody = $('seg_tableBody');
    const mobileCards = $('seg_mobileCards');

    if (!filtered.length) {
      const emptyMsg = isArchivadasView
        ? 'Sin cotizaciones archivadas para este filtro.'
        : 'Sin cotizaciones activas para este filtro.';
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="cm-empty" style="border:none;">${emptyMsg}</td></tr>`;
      }
      if (mobileCards) {
        mobileCards.innerHTML = `<div class="cm-empty">${emptyMsg}</div>`;
      }
      return;
    }

    // Desktop Table (>= 1024px)
    if (tbody) {
      tbody.innerHTML = filtered.map(q => {
        const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
        const isClosedOrArch = Boolean(q.Cerrada || q.Archivada);
        const avisoTag = q.Fecha_Ultimo_Aviso
          ? `<span class="cm-pill cm-pill-emerald cm-tabular">${escapeHtml(q.Fecha_Ultimo_Aviso)}</span>`
          : (isClosedOrArch && q.Fecha_Cierre
            ? `<span class="cm-pill cm-pill-slate cm-tabular">Cierre: ${escapeHtml(q.Fecha_Cierre)}</span>`
            : '<span class="cm-pill cm-pill-slate">Sin aviso</span>');
        // EXACT #6 stamp: "App/cotización" ONLY when q.Creada_En_App === true
        const appOriginTag = q.Creada_En_App
          ? '<div style="margin-top:4px;"><span class="cm-seg-app-stamp">App/cotización</span></div>'
          : '';
        const archiveDetailText = isClosedOrArch
          ? [q.Motivo_Cierre, q.Comentarios_Cierre].filter(Boolean).join(' · ')
          : '';

        const itemsListHtml = (q.items || []).map(it => {
          const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
          const cantPedida = parseInt(it.Cantidad_Cotizada || 1, 10);
          let pillCls = 'cm-pill-emerald';
          let pillTxt = `${stTotal} pzas`;
          if (stTotal <= 0) { pillCls = 'cm-pill-rose'; pillTxt = 'Agotado'; }
          else if (stTotal < cantPedida) { pillCls = 'cm-pill-rose'; pillTxt = `${stTotal}/${cantPedida}`; }
          else if (stTotal === cantPedida || stTotal <= 3) { pillCls = 'cm-pill-amber'; pillTxt = `${stTotal} pzas`; }

          return `
            <div class="cm-seg-item-row">
              <span class="cm-seg-item-name">${escapeHtml(it.Nombre_Producto)} <span style="color:var(--cm-muted);font-weight:500;">(${escapeHtml(it.Cantidad_Cotizada)})</span></span>
              <span class="cm-pill ${pillCls}">${pillTxt}</span>
            </div>
          `;
        }).join('');

        return `
          <tr>
            <td>
              <div class="cm-mono" style="font-weight:800;font-size:0.8rem;">${escapeHtml(q.Folio_ERP)}</div>
              <div class="cm-tabular" style="font-size:0.72rem;color:var(--cm-muted);margin-top:2px;">${escapeHtml(q.Fecha_Cotizacion)}</div>
              ${appOriginTag}
            </td>
            <td>
              <div style="font-weight:700;">${escapeHtml(q.Asesor)}</div>
              <div style="font-size:0.72rem;color:var(--cm-muted);margin-top:2px;">${escapeHtml(sucRule.label || q.Sucursal)}</div>
            </td>
            <td>
              <div style="font-weight:800;">${escapeHtml(q.Cliente)}</div>
              <div style="margin-top:4px;">
                ${q.WhatsApp_Cliente
                  ? `<span class="cm-mono" style="font-size:0.74rem;color:var(--cm-ink-2);">${escapeHtml(q.WhatsApp_Cliente)}</span>`
                  : `<button type="button" class="cm-seg-link-btn" data-seg-action="prompt-phone" data-folio="${escapeHtml(q.Folio_ERP)}">+ Agregar celular</button>`}
              </div>
            </td>
            <td style="min-width:220px;max-width:360px;">
              <div class="cm-seg-items-box">${itemsListHtml}</div>
            </td>
            <td>
              <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                ${renderBadge(q)}
                <span style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(isClosedOrArch ? (archiveDetailText || 'Archivada automáticamente') : q.Motivo_Urgencia)}</span>
              </div>
            </td>
            <td>${avisoTag}</td>
            <td>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <button type="button" class="cm-btn ${isClosedOrArch ? 'cm-btn-ghost' : 'cm-btn-accent'}" data-seg-action="open-preview" data-folio="${escapeHtml(q.Folio_ERP)}">${isClosedOrArch ? '👁️ Ver detalle' : '📲 Seguimiento'}</button>
                ${isClosedOrArch
                  ? `<span class="cm-pill ${q.Estatus_Cierre === 'GANADA' ? 'cm-pill-emerald' : 'cm-pill-slate'}">📦 Archivada</span>`
                  : `<button type="button" class="cm-btn cm-btn-ghost" data-seg-action="open-cerrar" data-folio="${escapeHtml(q.Folio_ERP)}">🔒 Cerrar</button>`}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Mobile & Tablet Cards (< 1024px)
    if (mobileCards) {
      mobileCards.innerHTML = filtered.map(q => {
        const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
        const isClosedOrArch = Boolean(q.Cerrada || q.Archivada);
        // EXACT #6 stamp identical on desktop AND mobile
        const appOriginTag = q.Creada_En_App
          ? '<span class="cm-seg-app-stamp">App/cotización</span>'
          : '';
        const archiveNoteHtml = isClosedOrArch
          ? `<div class="cm-seg-archive-note">📦 <strong>Archivada</strong>${q.Fecha_Cierre ? ` · ${escapeHtml(q.Fecha_Cierre)}` : ''}${q.Motivo_Cierre ? ` · ${escapeHtml(q.Motivo_Cierre)}` : ''}${q.Comentarios_Cierre ? ` — ${escapeHtml(q.Comentarios_Cierre)}` : ''}</div>`
          : '';

        const itemsListHtml = (q.items || []).map(it => {
          const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
          const cantPedida = parseInt(it.Cantidad_Cotizada || 1, 10);
          const pillCls = (stTotal <= 0 || stTotal < cantPedida) ? 'cm-pill-rose' : (stTotal <= 3 ? 'cm-pill-amber' : 'cm-pill-emerald');
          return `
            <div class="cm-seg-item-row">
              <span class="cm-seg-item-name">${escapeHtml(it.Nombre_Producto)} <span style="color:var(--cm-muted);">(${escapeHtml(it.Cantidad_Cotizada)})</span></span>
              <span class="cm-pill ${pillCls}">${stTotal} pz</span>
            </div>
          `;
        }).join('');

        return `
          <article class="cm-seg-card${isClosedOrArch ? ' is-archived' : ''}" data-folio-card="${escapeHtml(q.Folio_ERP)}">
            <div class="cm-seg-card-top">
              <div style="min-width:0;flex:1;">
                <div class="cm-seg-card-folio-row">
                  <span class="cm-seg-folio-code">${escapeHtml(q.Folio_ERP)}</span>
                  <span style="font-size:0.72rem;font-weight:700;color:var(--cm-accent);">${escapeHtml(sucRule.label || q.Sucursal)}</span>
                  <span class="cm-tabular" style="font-size:0.7rem;color:var(--cm-muted);">${escapeHtml(q.Fecha_Cotizacion)}</span>
                  ${appOriginTag}
                </div>
                <h3 class="cm-seg-client-name">${escapeHtml(q.Cliente)}</h3>
                <div class="cm-seg-phone-row">
                  ${q.WhatsApp_Cliente
                    ? `<span class="cm-mono" style="font-weight:700;">${escapeHtml(q.WhatsApp_Cliente)}</span>`
                    : `<button type="button" class="cm-seg-link-btn" data-seg-action="prompt-phone" data-folio="${escapeHtml(q.Folio_ERP)}">+ Agregar celular</button>`}
                </div>
              </div>
              <div style="flex-shrink:0;">${renderBadge(q)}</div>
            </div>

            <div class="cm-seg-items-box">${itemsListHtml}</div>
            ${archiveNoteHtml}

            <div class="cm-seg-card-foot">
              <span style="min-width:0;word-break:break-word;">${escapeHtml(q.Asesor)}</span>
              ${q.Fecha_Ultimo_Aviso
                ? `<span class="cm-pill cm-pill-emerald cm-tabular">${escapeHtml(q.Fecha_Ultimo_Aviso)}</span>`
                : '<span class="cm-pill cm-pill-slate">Sin aviso</span>'}
            </div>

            <div class="cm-seg-card-actions">
              <button type="button" class="cm-btn ${isClosedOrArch ? 'cm-btn-ghost' : 'cm-btn-accent'}" data-seg-action="open-preview" data-folio="${escapeHtml(q.Folio_ERP)}">${isClosedOrArch ? '👁️ Ver detalle' : '📲 Seguimiento'}</button>
              ${isClosedOrArch
                ? `<span class="cm-pill ${q.Estatus_Cierre === 'GANADA' ? 'cm-pill-emerald' : 'cm-pill-slate'}">📦 Archivada</span>`
                : `<button type="button" class="cm-btn" data-seg-action="open-cerrar" data-folio="${escapeHtml(q.Folio_ERP)}">🔒 Cerrar</button>`}
            </div>
          </article>
        `;
      }).join('');
    }

    applySilentImageProtection(rootEl);
  }

  // ============================================================================
  // MODAL DE SEGUIMIENTO (PLANTILLAS #2 INTACTAS + ADJUNTAR FOTO #14)
  // ============================================================================
  function openPreviewModal(folio) {
    const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
    if (!q) return;

    ACTIVE_MODAL_QUOTE = q;
    const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};

    const setT = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setT('seg_previewCliente', q.Cliente || 'Cliente');
    setT('seg_previewPhoneVal', q.WhatsApp_Cliente || 'Sin número');
    setT('seg_previewAsesor', q.Asesor || '--');
    setT('seg_previewAsesorContact', `${q.Tel_Asesor || 'S/N'} · ${q.Correo_Asesor || ''}`);
    setT('seg_previewSucursal', `${sucRule.label || q.Sucursal} · ${q.Folio_ERP} (${q.Fecha_Cotizacion})`);

    const badgeEl = $('seg_previewUrgencyBadge');
    if (badgeEl) badgeEl.innerHTML = renderBadge(q);

    const contactBox = $('seg_previewLastContacted');
    if (contactBox) {
      if (q.Cerrada || q.Archivada) {
        const cierreParts = [
          `📦 Archivada (${q.Estatus_Cierre || 'Cerrada'}${q.Archivo_Origen === 'ERP' ? ' · ERP' : ''})`,
          q.Motivo_Cierre || '',
          q.Fecha_Cierre || ''
        ].filter(Boolean);
        contactBox.textContent = cierreParts.join(' · ');
      } else {
        contactBox.textContent = q.Fecha_Ultimo_Aviso
          ? `🕒 Último aviso enviado: ${q.Fecha_Ultimo_Aviso}`
          : '🕒 Sin registro de aviso previo';
      }
    }

    SELECTED_ITEMS_SET.clear();
    (q.items || []).forEach(it => SELECTED_ITEMS_SET.add(it.ID_Partida));
    renderModalItemsCheckboxes();

    const tabsWrap = $('seg_modalRecipientTabs');
    if (tabsWrap) {
      const canSupervise = Boolean(APP_STATE.user && (APP_STATE.user.es_gerente || APP_STATE.user.is_master));
      tabsWrap.classList.toggle('cm-hidden', !canSupervise);
    }

    setModalRecipient('CLIENTE');
    $('seg_previewModal')?.classList.remove('cm-hidden');
    if (!_segRestoringCheckpoint) notifySegBackStatePush('seg_preview_modal');
    saveSegUiCheckpointNow();
  }

  function closePreviewModal() {
    $('seg_previewModal')?.classList.add('cm-hidden');
    ACTIVE_MODAL_QUOTE = null;
    saveSegUiCheckpointNow();
  }

  function renderModalItemsCheckboxes() {
    if (!ACTIVE_MODAL_QUOTE) return;
    const container = $('seg_modalItemsList');
    if (!container) return;
    const items = ACTIVE_MODAL_QUOTE.items || [];

    container.innerHTML = items.map(it => {
      const isChecked = SELECTED_ITEMS_SET.has(it.ID_Partida);
      const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
      const pillCls = stTotal <= 5 ? 'cm-pill-rose' : 'cm-pill-emerald';
      const photo = getItemPhotoMeta(it);
      const hasPhoto = Boolean(photo && photo.fullUrl);

      const thumbHtml = hasPhoto
        ? `<div class="cm-img-stage cm-seg-modal-item-thumb">
             <img src="${escapeHtml(photo.thumbUrl || photo.fullUrl)}" alt="${escapeHtml(it.Nombre_Producto)}" draggable="false" referrerpolicy="no-referrer" loading="lazy">
             <span class="creata-img-shield" aria-hidden="true"></span>
           </div>`
        : '';

      return `
        <div class="cm-seg-modal-item ${isChecked ? 'is-checked' : ''}">
          <label class="cm-seg-modal-item-left" style="cursor:pointer;">
            <input type="checkbox" value="${escapeHtml(it.ID_Partida)}" data-seg-change="item-chk" data-item-id="${escapeHtml(it.ID_Partida)}" ${isChecked ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
            ${thumbHtml}
            <div style="min-width:0;flex:1;">
              <div style="font-weight:700;color:var(--cm-ink);word-break:break-word;">${escapeHtml(it.Nombre_Producto)}</div>
              <div class="cm-mono" style="font-size:0.7rem;color:var(--cm-muted);">${escapeHtml(it.Clave_Producto)} · ${escapeHtml(it.Cantidad_Cotizada)} pz</div>
            </div>
          </label>
          <div class="cm-seg-modal-item-right">
            <span class="cm-pill ${pillCls}">${stTotal} pz</span>
          </div>
        </div>
      `;
    }).join('');

    const masterChk = $('seg_chkSelectAllItems');
    if (masterChk) {
      masterChk.checked = (SELECTED_ITEMS_SET.size === items.length && items.length > 0);
    }

    applySilentImageProtection(container);
  }

  function toggleItemSelection(idPartida, isChecked) {
    if (isChecked) SELECTED_ITEMS_SET.add(idPartida);
    else SELECTED_ITEMS_SET.delete(idPartida);
    renderModalItemsCheckboxes();
    rebuildModalMessage();
    saveSegUiCheckpointNow();
  }

  function toggleSelectAllItems(selectAll) {
    if (!ACTIVE_MODAL_QUOTE) return;
    const items = ACTIVE_MODAL_QUOTE.items || [];
    if (selectAll) items.forEach(it => SELECTED_ITEMS_SET.add(it.ID_Partida));
    else SELECTED_ITEMS_SET.clear();
    renderModalItemsCheckboxes();
    rebuildModalMessage();
    saveSegUiCheckpointNow();
  }

  function setModalRecipient(recipient) {
    ACTIVE_RECIPIENT = recipient;
    const btnCli = $('seg_btnRecipientCliente');
    const btnAdv = $('seg_btnRecipientAsesor');
    const tplSelector = $('seg_modalToneSelectorWrap');
    const btnWa = $('seg_btnActionWhatsApp');
    const btnEm = $('seg_btnActionEmail');

    if (btnCli) btnCli.classList.toggle('is-active', recipient === 'CLIENTE');
    if (btnAdv) btnAdv.classList.toggle('is-active', recipient === 'ASESOR');

    if (recipient === 'CLIENTE') {
      if (tplSelector) tplSelector.classList.remove('cm-hidden');
      if (btnWa) btnWa.textContent = '📲 Enviar WhatsApp al Cliente';
      if (btnEm) btnEm.textContent = '✉️ Enviar Correo al Cliente';
      rebuildModalMessage();
    } else {
      if (tplSelector) tplSelector.classList.add('cm-hidden');
      if (btnWa) btnWa.textContent = '📲 Enviar WhatsApp al Asesor';
      if (btnEm) btnEm.textContent = '✉️ Enviar Correo al Asesor';
      buildAdvisorAlertMessage();
    }
    saveSegUiCheckpointNow();
  }

  function selectModalTemplate(tplKey) {
    ACTIVE_MODAL_TPL_KEY = tplKey;
    ACTIVE_RECIPIENT = 'CLIENTE';
    const idMap = {
      'EMOCIONAL': 'seg_btnTplEmocional',
      'SOLO_PISO': 'seg_btnTplPiso',
      'SEGUIMIENTO': 'seg_btnTplSeguimiento'
    };
    Object.keys(idMap).forEach(k => {
      const btn = $(idMap[k]);
      if (btn) btn.classList.toggle('is-active', k === tplKey);
    });
    rebuildModalMessage();
    saveSegUiCheckpointNow();
  }

  // KEPT INTACT per User Decision #3 (Seguimiento WhatsApp templates preserved)
  function buildAdvisorAlertMessage() {
    if (!ACTIVE_MODAL_QUOTE) return;
    const q = ACTIVE_MODAL_QUOTE;
    const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
    const selectedItems = (q.items || []).filter(it => SELECTED_ITEMS_SET.has(it.ID_Partida));

    let listaPiezas = '';
    selectedItems.forEach(it => {
      const st = parseInt(it.Stock_Actual_Total || 0, 10);
      listaPiezas += `• ${it.Nombre_Producto} — Stock actual: ${st} pzas (Cotizadas: ${it.Cantidad_Cotizada})\n`;
    });
    if (!listaPiezas) listaPiezas = '• Mobiliario seleccionado en cotización.\n';

    const msg = `Hola *${q.Asesor || 'Asesor'}* (${sucRule.label || q.Sucursal}), seguimiento prioritario de cotización en *CREATA muebles*:\n\n` +
      `• Cliente: *${q.Cliente}* (Folio *${q.Folio_ERP}*)\n` +
      `• Teléfono Cliente: *${q.WhatsApp_Cliente || 'Sin número registrado'}*\n` +
      `• Mobiliario con stock urgente:\n${listaPiezas}\n` +
      `Favor de contactar hoy al cliente para coordinar el apartado y asegurar la entrega inmediata. ¡Quedo atento a tus comentarios!`;

    const area = $('seg_previewMessageText');
    if (area) area.value = msg;
  }

  // KEPT INTACT per User Decision #3 (EMOCIONAL, SOLO_PISO, SEGUIMIENTO preserved verbatim)
  function rebuildModalMessage() {
    if (!ACTIVE_MODAL_QUOTE) return;
    if (ACTIVE_RECIPIENT === 'ASESOR') {
      buildAdvisorAlertMessage();
      saveSegUiCheckpointNow();
      return;
    }
    const q = ACTIVE_MODAL_QUOTE;
    const selectedItems = (q.items || []).filter(it => SELECTED_ITEMS_SET.has(it.ID_Partida));
    const area = $('seg_previewMessageText');
    if (selectedItems.length === 0) {
      if (area) area.value = '(Selecciona al menos una pieza de la lista superior para generar el mensaje).';
      saveSegUiCheckpointNow();
      return;
    }

    const bulletLines = selectedItems.map(it => {
      const st = parseInt(it.Stock_Actual_Total || 0, 10);
      const cant = parseInt(it.Cantidad_Cotizada || 1, 10);
      let disponibilidad = '';
      if (st <= 0) {
        disponibilidad = 'actualmente agotado para entrega inmediata (requiere pedido de fábrica).';
      } else if (st < cant) {
        disponibilidad = `contamos con ${st} pza(s) listas de las ${cant} que necesitas.`;
      } else if (st === 1) {
        disponibilidad = '¡última pieza disponible para entrega inmediata!';
      } else if (st <= 3) {
        disponibilidad = `¡solo nos quedan ${st} piezas disponibles!`;
      } else {
        disponibilidad = `contamos con ${st} piezas listas para entrega inmediata.`;
      }
      return `• ${it.Nombre_Producto} (${cant} pza) — ${disponibilidad}`;
    }).join('\n');

    let rendered = '';
    if (ACTIVE_MODAL_TPL_KEY === 'SOLO_PISO') {
      rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
        `Dando seguimiento al proyecto de tu hogar, te aviso con mucho cariño que del mobiliario que te encantó ya se agotaron las existencias de almacén y únicamente nos queda la última pieza disponible en piso de exhibición:\n` +
        `${bulletLines}\n\n` +
        `Está en excelente estado y lista para entrega inmediata. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
        `¡Quedo a tus órdenes para lo que necesites!`;
    } else if (ACTIVE_MODAL_TPL_KEY === 'SEGUIMIENTO') {
      rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
        `Espero que estés teniendo un excelente día. Dando seguimiento a tu proyecto y al mobiliario que revisamos juntos:\n` +
        `${bulletLines}\n\n` +
        `Sé la gran ilusión que tienes de ver tu espacio listo y quería verificar cómo vas con las decisiones de tu hogar. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
        `¡Quedo a tus órdenes para lo que necesites!`;
    } else {
      rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
        `Te escribo este mensaje porque revisando disponibilidad en inventario vi que del mobiliario que te encantó:\n` +
        `${bulletLines}\n\n` +
        `Sé la gran ilusión que tienes de ver tu espacio listo y no quisiera que te los ganen, ya que son modelos de alta demanda. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
        `¡Quedo a tus órdenes para lo que necesites!`;
    }
    if (area) area.value = rendered;
    saveSegUiCheckpointNow();
  }

  async function sendModalWhatsApp() {
    if (!ACTIVE_MODAL_QUOTE) return;
    const q = ACTIVE_MODAL_QUOTE;
    const msg = cleanStr($('seg_previewMessageText')?.value || '');

    let phone = '';
    if (ACTIVE_RECIPIENT === 'CLIENTE') {
      phone = cleanPhone(q.WhatsApp_Cliente);
      if (!phone || phone.length < 10) {
        showToast('Agrega el celular del cliente primero', '⚠️');
        return;
      }
    } else {
      phone = cleanPhone(q.Tel_Asesor);
      if (!phone || phone.length < 10) {
        const promptTel = prompt(`WhatsApp del asesor (${q.Asesor}):`, '');
        if (!promptTel) return;
        phone = cleanPhone(promptTel);
      }
    }

    const waUrl = `https://wa.me/52${phone.slice(-10)}?text=${encodeURIComponent(msg)}`;
    const uaStr = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isIosPwa = Boolean((typeof navigator !== 'undefined' && navigator.standalone === true) || (/iPhone|iPad|iPod/i.test(uaStr)));
    const openedWin = isIosPwa ? null : global.open(waUrl, '_blank', 'noopener');
    if (!openedWin) {
      global.location.href = waUrl;
    }

    const nowStr = formatNowStr(false);
    q.Fecha_Ultimo_Aviso = nowStr;
    const contactedMap = readJsonStorage(SEG_CONTACTED_CACHE_KEY, {});
    contactedMap[q.Folio_ERP] = nowStr;
    writeJsonStorage(SEG_CONTACTED_CACHE_KEY, contactedMap);

    persistSeguimientoEvent('SEG_WHATSAPP', q.Folio_ERP, {
      folio: q.Folio_ERP,
      fecha_aviso: nowStr,
      recipient: ACTIVE_RECIPIENT,
      phone,
      template: ACTIVE_MODAL_TPL_KEY,
      cliente: q.Cliente,
      asesor: q.Asesor,
      sucursal: q.Sucursal,
      usuario: (APP_STATE.user && APP_STATE.user.nombre) || q.Asesor,
      email: (APP_STATE.user && APP_STATE.user.correo) || q.Correo_Asesor
    });

    showToast('WhatsApp abierto', '📲');
    closePreviewModal();
    renderQuotes();
  }

  async function sendModalEmail() {
    if (!ACTIVE_MODAL_QUOTE) return;
    const q = ACTIVE_MODAL_QUOTE;
    const msg = cleanStr($('seg_previewMessageText')?.value || '');

    let destinatario = '';
    let subject = '';
    if (ACTIVE_RECIPIENT === 'CLIENTE') {
      subject = `Seguimiento cotización ${q.Folio_ERP} - CREATA muebles`;
      const promptEmail = prompt('Correo del cliente:', '');
      if (!promptEmail) return;
      destinatario = promptEmail.trim();
    } else {
      subject = `Seguimiento ${q.Folio_ERP} (${q.Cliente}) - CREATA muebles`;
      destinatario = cleanStr(q.Correo_Asesor) || prompt(`Correo del asesor (${q.Asesor}):`, '') || '';
    }
    if (!destinatario) return;

    global.location.href = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;

    persistSeguimientoEvent('SEG_EMAIL', q.Folio_ERP, {
      folio: q.Folio_ERP,
      destinatario,
      asunto: subject,
      cliente: q.Cliente,
      asesor: q.Asesor,
      sucursal: q.Sucursal,
      usuario: (APP_STATE.user && APP_STATE.user.nombre) || q.Asesor,
      email: (APP_STATE.user && APP_STATE.user.correo) || q.Correo_Asesor
    });

    showToast('Correo registrado', '✉️');
    closePreviewModal();
  }

  function copyModalMessage() {
    const txt = $('seg_previewMessageText')?.value || '';
    const fallbackCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, txt.length);
        if (typeof document.execCommand === 'function') document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (eCopy) {}
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    showToast('Mensaje copiado', '📋');
  }

  async function promptClientPhone(folio) {
    const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
    const current = q ? q.WhatsApp_Cliente : '';
    const input = prompt(`WhatsApp del cliente (${q ? q.Cliente : ''}):`, current || '');
    if (input === null) return;

    const clean = cleanPhone(input);
    if (q) {
      q.WhatsApp_Cliente = clean;
      (q.items || []).forEach(it => { it.WhatsApp_Cliente = clean; });
    }
    const phoneMap = readJsonStorage(SEG_PHONES_CACHE_KEY, {});
    phoneMap[folio] = clean;
    writeJsonStorage(SEG_PHONES_CACHE_KEY, phoneMap);

    if (ACTIVE_MODAL_QUOTE && ACTIVE_MODAL_QUOTE.Folio_ERP === folio) {
      ACTIVE_MODAL_QUOTE.WhatsApp_Cliente = clean;
      const pv = $('seg_previewPhoneVal');
      if (pv) pv.textContent = clean || 'Sin número';
      rebuildModalMessage();
    }

    persistSeguimientoEvent('SEG_TELEFONO', folio, {
      folio,
      whatsapp_cliente: clean,
      cliente: q ? q.Cliente : '',
      sucursal: q ? q.Sucursal : 'N/A',
      usuario: (APP_STATE.user && APP_STATE.user.nombre) || 'Usuario',
      email: (APP_STATE.user && APP_STATE.user.correo) || ''
    });

    showToast('Teléfono guardado', '📞');
    renderQuotes();
  }

  // ============================================================================
  // CIERRE DE COTIZACIÓN
  // ============================================================================
  function openModalCerrar(folio) {
    const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
    if (!q) return;
    ACTIVE_CLOSE_FOLIO = folio;
    const fEl = $('seg_closeModalFolio');
    const cEl = $('seg_closeModalCliente');
    const cmEl = $('seg_closeModalComentarios');
    if (fEl) fEl.textContent = folio;
    if (cEl) cEl.textContent = q.Cliente || '--';
    if (cmEl) cmEl.value = '';
    selectCloseStatus('GANADA');
    $('seg_modalCerrarCotizacion')?.classList.remove('cm-hidden');
    if (!_segRestoringCheckpoint) notifySegBackStatePush('seg_cerrar_modal');
    saveSegUiCheckpointNow();
  }

  function closeModalCerrar() {
    $('seg_modalCerrarCotizacion')?.classList.add('cm-hidden');
    ACTIVE_CLOSE_FOLIO = null;
    saveSegUiCheckpointNow();
  }

  function selectCloseStatus(status) {
    ACTIVE_CLOSE_STATUS = status;
    const btnG = $('seg_btnCloseStatusGanada');
    const btnP = $('seg_btnCloseStatusPerdida');
    const btnC = $('seg_btnCloseStatusCancelada');
    const selectMotivo = $('seg_closeModalMotivo');

    if (btnG) btnG.className = 'cm-seg-status-btn' + (status === 'GANADA' ? ' is-ganada' : '');
    if (btnP) btnP.className = 'cm-seg-status-btn' + (status === 'PERDIDA' ? ' is-perdida' : '');
    if (btnC) btnC.className = 'cm-seg-status-btn' + (status === 'CANCELADA' ? ' is-cancelada' : '');

    if (selectMotivo) {
      if (status === 'GANADA') {
        selectMotivo.value = 'Venta Concretada Exitosamente';
      } else if (status === 'PERDIDA' && selectMotivo.value === 'Venta Concretada Exitosamente') {
        selectMotivo.value = 'Falta de Inventario / Producto Agotado';
      } else if (status === 'CANCELADA') {
        selectMotivo.value = 'Cambio de Proyecto / No Requiere Mobiliario';
      }
    }
    saveSegUiCheckpointNow();
  }

  async function submitCloseQuote() {
    if (!ACTIVE_CLOSE_FOLIO) return;
    const folio = ACTIVE_CLOSE_FOLIO;
    const motivo = $('seg_closeModalMotivo')?.value || '';
    const comentarios = cleanStr($('seg_closeModalComentarios')?.value || '');
    const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
    const nowStr = formatNowStr(false);

    const piezasStr = q && Array.isArray(q.items)
      ? q.items.map(it => `${it.Nombre_Producto} (${it.Cantidad_Cotizada} pza)`).join(' | ')
      : '';

    const closureObj = {
      Fecha_Hora: nowStr,
      Folio_ERP: folio,
      Sucursal: q ? q.Sucursal : '',
      Asesor: q ? q.Asesor : '',
      Correo_Asesor: q ? q.Correo_Asesor : '',
      Cliente: q ? q.Cliente : '',
      WhatsApp_Cliente: q ? q.WhatsApp_Cliente : '',
      Estatus_Cierre: ACTIVE_CLOSE_STATUS,
      Motivo_Cierre: motivo,
      Comentarios: comentarios,
      Total_Productos: q && q.items ? String(q.items.length) : '1',
      Piezas_Cotizadas: piezasStr
    };

    if (q) {
      q.Cerrada = true;
      q.Archivada = true;
      q.Archivo_Origen = 'MANUAL';
      q.Estatus_Cierre = ACTIVE_CLOSE_STATUS;
      q.Motivo_Cierre = motivo;
      q.Comentarios_Cierre = comentarios;
      q.Fecha_Cierre = nowStr;
    }

    APP_STATE.closures[folio] = closureObj;
    const savedClosures = readJsonStorage(SEG_CLOSURES_CACHE_KEY, {});
    savedClosures[folio] = closureObj;
    writeJsonStorage(SEG_CLOSURES_CACHE_KEY, savedClosures);

    persistSeguimientoEvent('SEG_CIERRE', folio, {
      folio,
      fecha_hora: nowStr,
      estatus: ACTIVE_CLOSE_STATUS,
      motivo,
      comentarios,
      sucursal: closureObj.Sucursal,
      asesor: closureObj.Asesor,
      correo_asesor: closureObj.Correo_Asesor,
      cliente: closureObj.Cliente,
      whatsapp_cliente: closureObj.WhatsApp_Cliente,
      total_productos: closureObj.Total_Productos,
      piezas_cotizadas: piezasStr,
      usuario: (APP_STATE.user && APP_STATE.user.nombre) || closureObj.Asesor,
      email: (APP_STATE.user && APP_STATE.user.correo) || closureObj.Correo_Asesor
    });

    closeModalCerrar();
    showToast(`Cotización ${folio} cerrada (${ACTIVE_CLOSE_STATUS}) y archivada automáticamente`, '📦');
    renderQuotes();
  }

  // ============================================================================
  // OUTBOX OFFLINE Y PERSISTENCIA EN BACKEND (CON authToken)
  // ============================================================================
  function enqueueSegOfflineOutbox(item) {
    try {
      const queue = readJsonStorage(SEG_OFFLINE_OUTBOX_KEY, []);
      const arr = Array.isArray(queue) ? queue : [];
      arr.push(item);
      writeJsonStorage(SEG_OFFLINE_OUTBOX_KEY, arr.slice(-250));
    } catch (e) {}
  }

  async function flushSegOfflineOutbox() {
    if (_segFlushingOutbox) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const queue = readJsonStorage(SEG_OFFLINE_OUTBOX_KEY, []);
    if (!Array.isArray(queue) || queue.length === 0) return;

    _segFlushingOutbox = true;
    try {
      const remaining = [];
      for (let i = 0; i < queue.length; i++) {
        const entry = queue[i];
        if (!entry) continue;
        if (entry.type === 'seg_event') {
          const r1 = await callWebAppPost({
            action: 'seg_action',
            subAction: entry.eventCode,
            folio: entry.refFolio,
            payload: entry.payload
          }, 8000);
          if (r1 && r1.ok) continue;

          const r2 = await callWebAppPost({
            action: 'inv_log_event',
            classification: 'MOVIMIENTO',
            module: 'SEGUIMIENTO_COTIZACIONES',
            event: entry.eventCode,
            status: 'OK',
            user: (entry.payload && entry.payload.usuario) || (APP_STATE.user && APP_STATE.user.nombre) || 'Usuario',
            branch: (entry.payload && entry.payload.sucursal) || (APP_STATE.user && APP_STATE.user.sucursal) || 'TODAS',
            ref: entry.refFolio || 'SEGUIMIENTO',
            detail: JSON.stringify(entry.payload || {})
          }, 8000);
          if (!r2 || !r2.ok) {
            remaining.push(...queue.slice(i));
            break;
          }
        }
      }
      writeJsonStorage(SEG_OFFLINE_OUTBOX_KEY, remaining);
    } catch (e) {
    } finally {
      _segFlushingOutbox = false;
    }
  }

  async function persistSeguimientoEvent(eventCode, refFolio, payload) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueueSegOfflineOutbox({ type: 'seg_event', eventCode, refFolio, payload, queuedAt: Date.now() });
      return;
    }

    const res = await callWebAppPost({
      action: 'seg_action',
      subAction: eventCode,
      folio: refFolio,
      payload
    });
    if (res && res.ok) return;

    const resFallback = await callWebAppPost({
      action: 'inv_log_event',
      classification: 'MOVIMIENTO',
      module: 'SEGUIMIENTO_COTIZACIONES',
      event: eventCode,
      status: 'OK',
      user: payload.usuario || (APP_STATE.user && APP_STATE.user.nombre) || 'Usuario',
      branch: payload.sucursal || (APP_STATE.user && APP_STATE.user.sucursal) || 'TODAS',
      ref: refFolio || 'SEGUIMIENTO',
      detail: JSON.stringify(payload)
    });
    if (!resFallback || !resFallback.ok) {
      enqueueSegOfflineOutbox({ type: 'seg_event', eventCode, refFolio, payload, queuedAt: Date.now() });
    }
  }

  async function triggerManualSync() {
    const icon = $('seg_syncIcon');
    const text = $('seg_syncText');
    if (icon) icon.classList.add('cm-spin');
    if (text) text.textContent = 'Buscando...';

    try {
      const res = await fetchDeltaState({ manual: true });
      if (res && res.mode === 'noop') {
        showToast('Sin modificaciones nuevas', '✓');
      } else if (res && res.mode === 'delta') {
        const n = Number(res.totalChanges || 0);
        showToast(n > 0 ? (n + (n === 1 ? ' modificación nueva' : ' modificaciones nuevas')) : 'Cambios aplicados', '✓');
      } else {
        showToast('Actualizado', '✓');
      }
    } catch (e) {
      showToast('Sin conexión', '⚠️');
    } finally {
      if (icon) icon.classList.remove('cm-spin');
      if (text) text.textContent = 'Buscar cambios';
    }
  }

  // ============================================================================
  // AUDITORÍA (EXCLUSIVO KEVIN REYNA)
  // ============================================================================
  async function openKevinAuditModal() {
    if (!isKevinReyna(APP_STATE.user)) return;
    $('seg_modalKevinAudit')?.classList.remove('cm-hidden');
    if (!_segRestoringCheckpoint) notifySegBackStatePush('seg_audit_modal');
    loadKevinAuditData();
    saveSegUiCheckpointNow();
    await fetchLiveState(true);
    if (mounted && !$('seg_modalKevinAudit')?.classList.contains('cm-hidden')) {
      loadKevinAuditData();
    }
  }

  function closeKevinAuditModal() {
    $('seg_modalKevinAudit')?.classList.add('cm-hidden');
    saveSegUiCheckpointNow();
  }

  function loadKevinAuditData() {
    const logs = (APP_STATE.auditLogs || []).slice().reverse();
    AUDIT_STATE.logs = logs;

    let loginsOk = 0, loginsFail = 0, totalWa = 0, totalCierres = 0;
    for (const l of logs) {
      if (l.tipo === 'LOGIN') {
        if (l.status === 'EXITOSO') loginsOk++;
        else loginsFail++;
      } else if (l.tipo === 'WHATSAPP') totalWa++;
      else if (l.tipo === 'CIERRE') totalCierres++;
    }

    const setT = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    setT('seg_auditMetricLoginsOk', loginsOk);
    setT('seg_auditMetricLoginsFail', loginsFail);
    setT('seg_auditMetricWhatsApps', totalWa);
    setT('seg_auditMetricCierres', totalCierres);
    filterAuditView();
  }

  function setAuditTab(tabKey) {
    AUDIT_STATE.activeTab = tabKey;
    const tabs = {
      'LOGINS': 'seg_tabAuditLogins',
      'MOVIMIENTOS': 'seg_tabAuditMovimientos',
      'HISTORIAL_COTIZACIONES': 'seg_tabAuditCotizaciones'
    };
    Object.keys(tabs).forEach(k => {
      const btn = $(tabs[k]);
      if (btn) btn.classList.toggle('is-active', k === tabKey);
    });
    filterAuditView();
    saveSegUiCheckpointNow();
  }

  function filterAuditView() {
    const container = $('seg_auditTableContainer');
    if (!container) return;
    const searchTerm = cleanStr($('seg_auditSearchInput')?.value || '').toLowerCase();

    if (AUDIT_STATE.activeTab === 'LOGINS') {
      const filtered = (AUDIT_STATE.logs || []).filter(l => (l.tipo === 'LOGIN' || l.tipo === 'LOGOUT') &&
        (!searchTerm || `${l.usuario} ${l.email} ${l.sucursal} ${l.detalle} ${l.status}`.toLowerCase().includes(searchTerm)));
      if (!filtered.length) {
        container.innerHTML = '<div class="cm-empty">Sin registros.</div>';
        return;
      }
      container.innerHTML = filtered.map(l => `
        <div class="cm-seg-item-row" style="padding:8px;">
          <div>
            <div style="font-weight:700;">${escapeHtml(l.usuario || '--')} <span class="cm-mono" style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(l.email || '')}</span></div>
            <div style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(l.fecha_hora)} · ${escapeHtml(l.sucursal || '')}</div>
          </div>
          <span class="cm-pill ${l.status === 'EXITOSO' ? 'cm-pill-emerald' : 'cm-pill-rose'}">${escapeHtml(l.tipo === 'LOGOUT' ? 'Salida' : l.status)}</span>
        </div>
      `).join('');
    } else if (AUDIT_STATE.activeTab === 'MOVIMIENTOS') {
      const filtered = (AUDIT_STATE.logs || []).filter(l => l.tipo !== 'LOGIN' && l.tipo !== 'LOGOUT' &&
        (!searchTerm || `${l.tipo} ${l.usuario} ${l.accion} ${l.detalle} ${l.sucursal}`.toLowerCase().includes(searchTerm)));
      if (!filtered.length) {
        container.innerHTML = '<div class="cm-empty">Sin movimientos.</div>';
        return;
      }
      container.innerHTML = filtered.map(m => `
        <div class="cm-seg-item-row" style="padding:8px;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;">${escapeHtml(m.accion)}</div>
            <div style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(m.fecha_hora)} · ${escapeHtml(m.usuario)} · ${escapeHtml(m.detalle)}</div>
          </div>
          <span class="cm-pill cm-pill-slate">${escapeHtml(m.tipo)}</span>
        </div>
      `).join('');
    } else {
      const filtered = (APP_STATE.quotes || []).filter(q =>
        !searchTerm || `${q.Folio_ERP} ${q.Cliente} ${q.Asesor} ${q.Sucursal} ${q.Estatus_Cierre}`.toLowerCase().includes(searchTerm));
      if (!filtered.length) {
        container.innerHTML = '<div class="cm-empty">Sin cotizaciones.</div>';
        return;
      }
      container.innerHTML = filtered.map(q => `
        <div class="cm-seg-item-row" style="padding:8px;">
          <div style="min-width:0;flex:1;">
            <div class="cm-mono" style="font-weight:800;">${escapeHtml(q.Folio_ERP)} · <span style="font-family:var(--cm-font-sans);">${escapeHtml(q.Cliente)}</span></div>
            <div style="font-size:0.72rem;color:var(--cm-muted);">${escapeHtml(q.Fecha_Cotizacion)} · ${escapeHtml(q.Asesor)} (${escapeHtml(q.Sucursal)})</div>
          </div>
          <span class="cm-pill ${q.Cerrada ? (q.Estatus_Cierre === 'GANADA' ? 'cm-pill-emerald' : 'cm-pill-slate') : 'cm-pill-amber'}">${escapeHtml(q.Cerrada ? (q.Estatus_Cierre || 'Cerrada') : 'Abierta')}</span>
        </div>
      `).join('');
    }
    saveSegUiCheckpointNow();
  }

  function exportKevinAuditReport() {
    const logs = AUDIT_STATE.logs || [];
    const header = ['FECHA_HORA', 'TIPO', 'USUARIO', 'EMAIL', 'SUCURSAL', 'ACCION', 'DETALLE', 'IP', 'ESTATUS'];
    const csvLines = [header.join(',')];
    const escCsv = (val) => {
      let s = String(val == null ? '' : val);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    for (const l of logs) {
      const row = [
        l.fecha_hora || '', l.tipo || '', l.usuario || '', l.email || '',
        l.sucursal || '', l.accion || '', l.detalle || '', l.ip || 'Web', l.status || 'EXITOSO'
      ].map(escCsv);
      csvLines.push(row.join(','));
    }
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CREATA_Auditoria_Seguimiento_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV descargado', '📥');
  }

  function showToast(msg, icon) {
    const toast = $('seg_toast');
    if (!toast) return;
    const iEl = $('seg_toastIcon');
    const mEl = $('seg_toastMsg');
    if (iEl) iEl.textContent = icon || '';
    if (mEl) mEl.textContent = msg;
    toast.classList.remove('is-hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      const t = $('seg_toast');
      if (t) t.classList.add('is-hidden');
    }, 3000);
  }

  // ============================================================================
  // CHECKPOINT "DÓNDE ME QUEDÉ" (#4)
  // ============================================================================
  function saveSegUiCheckpointNow() {
    if (!mounted || !_segUiCheckpointRestoredOnce || _segRestoringCheckpoint) return;
    try {
      const previewOpen = Boolean(ACTIVE_MODAL_QUOTE && !$('seg_previewModal')?.classList.contains('cm-hidden'));
      const closeOpen = Boolean(ACTIVE_CLOSE_FOLIO && !$('seg_modalCerrarCotizacion')?.classList.contains('cm-hidden'));
      const kevinAuditOpen = Boolean(!$('seg_modalKevinAudit')?.classList.contains('cm-hidden'));

      const pend = _pendingSegCheckpointRestore;
      const curSucVal = $('seg_filterSucursal')?.value || 'TODAS';
      const curAdvVal = $('seg_filterAsesor')?.value || 'TODOS';
      const cp = {
        savedAt: Date.now(),
        userEmail: APP_STATE.user ? normalizeEmail(APP_STATE.user.correo) : '',
        viewMode: ACTIVE_VIEW_MODE === 'ARCHIVADAS' ? 'ARCHIVADAS' : 'ACTIVAS',
        filterSucursal: (curSucVal === 'TODAS' && pend && pend.filterSucursal) ? pend.filterSucursal : curSucVal,
        filterAsesor: (curAdvVal === 'TODOS' && pend && pend.filterAsesor) ? pend.filterAsesor : curAdvVal,
        filterUrgencia: $('seg_filterUrgencia')?.value || 'TODOS',
        filterSearch: $('seg_filterSearch')?.value || '',
        scrollY: Math.round(global.scrollY || 0),
        containerScrollTop: rootEl ? Math.round(rootEl.scrollTop || 0) : 0,
        previewModal: previewOpen ? {
          folio: ACTIVE_MODAL_QUOTE.Folio_ERP,
          recipient: ACTIVE_RECIPIENT || 'CLIENTE',
          tplKey: ACTIVE_MODAL_TPL_KEY || 'EMOCIONAL',
          selectedItems: Array.from(SELECTED_ITEMS_SET),
          messageText: $('seg_previewMessageText')?.value || ''
        } : (pend && pend.previewModal ? pend.previewModal : null),
        closeModal: closeOpen ? {
          folio: ACTIVE_CLOSE_FOLIO,
          status: ACTIVE_CLOSE_STATUS || 'GANADA',
          motivo: $('seg_closeModalMotivo')?.value || '',
          comentarios: $('seg_closeModalComentarios')?.value || ''
        } : (pend && pend.closeModal ? pend.closeModal : null),
        kevinAudit: kevinAuditOpen ? {
          activeTab: AUDIT_STATE.activeTab || 'LOGINS',
          search: $('seg_auditSearchInput')?.value || ''
        } : null
      };
      writeJsonStorage(SEG_UI_CHECKPOINT_KEY, cp);
    } catch (e) {}
  }

  function restorePreviewModalFromCp(previewCp) {
    if (!previewCp || !previewCp.folio) return false;
    const targetQuote = (APP_STATE.quotes || []).find(q => q.Folio_ERP === previewCp.folio);
    if (!targetQuote) return false;
    openPreviewModal(previewCp.folio);
    if (Array.isArray(previewCp.selectedItems)) {
      SELECTED_ITEMS_SET.clear();
      previewCp.selectedItems.forEach(idP => SELECTED_ITEMS_SET.add(idP));
      renderModalItemsCheckboxes();
    }
    if (previewCp.recipient === 'ASESOR') {
      setModalRecipient('ASESOR');
    } else if (previewCp.tplKey) {
      selectModalTemplate(previewCp.tplKey);
    }
    if (typeof previewCp.messageText === 'string' && previewCp.messageText.trim()) {
      const area = $('seg_previewMessageText');
      if (area) area.value = previewCp.messageText;
    }
    return true;
  }

  function restoreCloseModalFromCp(closeCp) {
    if (!closeCp || !closeCp.folio) return false;
    const targetQuote = (APP_STATE.quotes || []).find(q => q.Folio_ERP === closeCp.folio);
    if (!targetQuote || targetQuote.Cerrada) return false;
    openModalCerrar(closeCp.folio);
    if (closeCp.status) selectCloseStatus(closeCp.status);
    const selMotivo = $('seg_closeModalMotivo');
    if (selMotivo && closeCp.motivo) selMotivo.value = closeCp.motivo;
    const txtCom = $('seg_closeModalComentarios');
    if (txtCom && typeof closeCp.comentarios === 'string') txtCom.value = closeCp.comentarios;
    return true;
  }

  function scheduleSegScrollRestore(containerScrollTop, scrollY) {
    const restoreScroll = () => {
      try {
        if (rootEl && typeof containerScrollTop === 'number' && containerScrollTop > 0) {
          rootEl.scrollTop = containerScrollTop;
        }
        if (typeof scrollY === 'number' && scrollY > 0) {
          global.scrollTo(0, scrollY);
        }
      } catch (e) {
      } finally {
        _segRestoringCheckpoint = false;
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(restoreScroll));
    } else {
      restoreScroll();
    }
  }

  function restoreSegUiCheckpointOnce(isWarmSnapshot) {
    _segUiCheckpointRestoredOnce = true;
    _segRestoringCheckpoint = true;
    _pendingSegCheckpointRestore = null;
    try {
      const cp = readJsonStorage(SEG_UI_CHECKPOINT_KEY, null);
      if (!cp || typeof cp !== 'object') {
        renderQuotes();
        _segRestoringCheckpoint = false;
        return;
      }
      const currentEmail = APP_STATE.user ? normalizeEmail(APP_STATE.user.correo) : '';
      if (cp.userEmail && currentEmail && cp.userEmail !== currentEmail) {
        renderQuotes();
        _segRestoringCheckpoint = false;
        return;
      }

      const pending = {};

      if (cp.viewMode === 'ARCHIVADAS' || cp.viewMode === 'ACTIVAS') {
        ACTIVE_VIEW_MODE = cp.viewMode;
      }

      const selSuc = $('seg_filterSucursal');
      if (selSuc && cp.filterSucursal) {
        if (Array.from(selSuc.options).some(o => o.value === cp.filterSucursal)) {
          selSuc.value = cp.filterSucursal;
          populateAdvisorFilter();
        } else if (isWarmSnapshot && cp.filterSucursal !== 'TODAS') {
          pending.filterSucursal = cp.filterSucursal;
        }
      }
      const selAdv = $('seg_filterAsesor');
      if (selAdv && cp.filterAsesor && cp.filterAsesor !== 'TODOS') {
        if (Array.from(selAdv.options).some(o => o.value === cp.filterAsesor)) {
          selAdv.value = cp.filterAsesor;
        } else if (isWarmSnapshot) {
          pending.filterAsesor = cp.filterAsesor;
        }
      }
      const selUrg = $('seg_filterUrgencia');
      if (selUrg && cp.filterUrgencia && Array.from(selUrg.options).some(o => o.value === cp.filterUrgencia)) {
        selUrg.value = cp.filterUrgencia;
      }
      const inpSearch = $('seg_filterSearch');
      if (inpSearch && typeof cp.filterSearch === 'string') {
        inpSearch.value = cp.filterSearch;
      }

      renderQuotes();

      if (cp.previewModal && cp.previewModal.folio) {
        const opened = restorePreviewModalFromCp(cp.previewModal);
        if (!opened && isWarmSnapshot) {
          pending.previewModal = cp.previewModal;
        }
      }

      if (cp.closeModal && cp.closeModal.folio) {
        const openedClose = restoreCloseModalFromCp(cp.closeModal);
        if (!openedClose && isWarmSnapshot) {
          pending.closeModal = cp.closeModal;
        }
      }

      if (cp.kevinAudit && isKevinReyna(APP_STATE.user)) {
        const modal = $('seg_modalKevinAudit');
        if (modal) {
          modal.classList.remove('cm-hidden');
          const auditInp = $('seg_auditSearchInput');
          if (auditInp && typeof cp.kevinAudit.search === 'string') auditInp.value = cp.kevinAudit.search;
          loadKevinAuditData();
          if (cp.kevinAudit.activeTab) setAuditTab(cp.kevinAudit.activeTab);
        }
      }

      if (isWarmSnapshot && ((typeof cp.scrollY === 'number' && cp.scrollY > 0) || (typeof cp.containerScrollTop === 'number' && cp.containerScrollTop > 0))) {
        pending.scrollY = cp.scrollY || 0;
        pending.containerScrollTop = cp.containerScrollTop || 0;
      }

      if (isWarmSnapshot && Object.keys(pending).length > 0) {
        _pendingSegCheckpointRestore = pending;
      }

      scheduleSegScrollRestore(cp.containerScrollTop, cp.scrollY);
    } catch (e) {
      _segRestoringCheckpoint = false;
      renderQuotes();
    }
  }

  function applyPendingSegCheckpointRestore() {
    const pending = _pendingSegCheckpointRestore;
    _pendingSegCheckpointRestore = null;
    if (!pending || !mounted) {
      renderQuotes();
      return;
    }
    _segRestoringCheckpoint = true;
    try {
      const selSuc = $('seg_filterSucursal');
      if (selSuc && pending.filterSucursal && Array.from(selSuc.options).some(o => o.value === pending.filterSucursal)) {
        selSuc.value = pending.filterSucursal;
        populateAdvisorFilter();
      }
      const selAdv = $('seg_filterAsesor');
      if (selAdv && pending.filterAsesor && Array.from(selAdv.options).some(o => o.value === pending.filterAsesor)) {
        selAdv.value = pending.filterAsesor;
      }

      renderQuotes();

      if (pending.previewModal && !ACTIVE_MODAL_QUOTE) {
        restorePreviewModalFromCp(pending.previewModal);
      }
      if (pending.closeModal && !ACTIVE_CLOSE_FOLIO) {
        restoreCloseModalFromCp(pending.closeModal);
      }

      if (pending.scrollY > 0 || pending.containerScrollTop > 0) {
        scheduleSegScrollRestore(pending.containerScrollTop, pending.scrollY);
      } else {
        _segRestoringCheckpoint = false;
      }
    } catch (e) {
      _segRestoringCheckpoint = false;
      renderQuotes();
    }
  }

  // ============================================================================
  // EVENTOS DELEGADOS (LIMPIADOS AL 100% EN unmount())
  // ============================================================================
  function bindDelegatedListeners() {
    if (!rootEl) return;

    const onClick = (ev) => {
      const target = ev.target;
      if (!target) return;

      // Backdrop click closes modal
      if (target.dataset && target.dataset.segBackdrop) {
        const b = target.dataset.segBackdrop;
        if (b === 'preview') closePreviewModal();
        else if (b === 'close-quote') closeModalCerrar();
        else if (b === 'kevin-audit') closeKevinAuditModal();
        return;
      }

      const btn = target.closest ? target.closest('[data-seg-action]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-seg-action');
      const folio = btn.getAttribute('data-folio') || '';

      switch (action) {
        case 'close-module':
          if (mountOpts && typeof mountOpts.onClose === 'function') mountOpts.onClose();
          else if (mountOpts && typeof mountOpts.onGoHome === 'function') mountOpts.onGoHome();
          else if (typeof global.closeInAppModules === 'function') global.closeInAppModules();
          else if (typeof global.goHomeFromLogo === 'function') global.goHomeFromLogo();
          else global.location.href = './inventario.html';
          break;
        case 'manual-sync':
          triggerManualSync();
          break;
        case 'set-view-mode':
          setSegViewMode(btn.getAttribute('data-view') || 'ACTIVAS');
          break;
        case 'open-kevin-audit':
          openKevinAuditModal();
          break;
        case 'close-kevin-audit':
          closeKevinAuditModal();
          break;
        case 'export-audit':
          exportKevinAuditReport();
          break;
        case 'audit-tab':
          setAuditTab(btn.getAttribute('data-tab') || 'LOGINS');
          break;
        case 'clear-search': {
          if (_pendingSegCheckpointRestore) {
            delete _pendingSegCheckpointRestore.scrollY;
            delete _pendingSegCheckpointRestore.containerScrollTop;
          }
          const inp = $('seg_filterSearch');
          if (inp) inp.value = '';
          _segPrevSearchNonEmpty = false;
          $('seg_btnClearSearch')?.classList.add('cm-hidden');
          renderQuotes();
          saveSegUiCheckpointNow();
          break;
        }
        case 'prompt-phone':
          promptClientPhone(folio);
          break;
        case 'open-preview':
          if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.previewModal;
          openPreviewModal(folio);
          break;
        case 'close-preview':
          if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.previewModal;
          closePreviewModal();
          break;
        case 'edit-modal-phone':
          if (ACTIVE_MODAL_QUOTE) promptClientPhone(ACTIVE_MODAL_QUOTE.Folio_ERP);
          break;
        case 'recipient':
          setModalRecipient(btn.getAttribute('data-recipient') || 'CLIENTE');
          break;
        case 'select-tpl':
          selectModalTemplate(btn.getAttribute('data-tpl') || 'EMOCIONAL');
          break;
        case 'rebuild-msg':
          rebuildModalMessage();
          break;
        case 'copy-msg':
          copyModalMessage();
          break;
        case 'send-email':
          sendModalEmail();
          break;
        case 'send-wa':
          sendModalWhatsApp();
          break;
        case 'open-cerrar':
          if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.closeModal;
          openModalCerrar(folio);
          break;
        case 'close-cerrar':
          if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.closeModal;
          closeModalCerrar();
          break;
        case 'close-status':
          selectCloseStatus(btn.getAttribute('data-status') || 'GANADA');
          break;
        case 'submit-close':
          submitCloseQuote();
          break;
      }
    };

    const onChange = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute) return;
      const kind = el.getAttribute('data-seg-change');
      if (kind === 'sucursal') {
        if (_pendingSegCheckpointRestore) {
          delete _pendingSegCheckpointRestore.filterSucursal;
          delete _pendingSegCheckpointRestore.filterAsesor;
        }
        if (cleanStr(el.value).toUpperCase() !== 'TODAS') {
          notifySegBackStatePush('seg_filter');
        }
        populateAdvisorFilter();
        renderQuotes();
        saveSegUiCheckpointNow();
      } else if (kind === 'filter') {
        if (_pendingSegCheckpointRestore) {
          delete _pendingSegCheckpointRestore.filterAsesor;
        }
        if (cleanStr(el.value).toUpperCase() !== 'TODOS') {
          notifySegBackStatePush('seg_filter');
        }
        renderQuotes();
        saveSegUiCheckpointNow();
      } else if (kind === 'select-all') {
        toggleSelectAllItems(Boolean(el.checked));
      } else if (kind === 'item-chk') {
        toggleItemSelection(el.getAttribute('data-item-id') || '', Boolean(el.checked));
      } else if (kind === 'close-motivo') {
        saveSegUiCheckpointNow();
      }
    };

    const onInput = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute) return;
      const kind = el.getAttribute('data-seg-input');
      if (kind === 'search') {
        if (_pendingSegCheckpointRestore) {
          delete _pendingSegCheckpointRestore.scrollY;
          delete _pendingSegCheckpointRestore.containerScrollTop;
        }
        const nowNonEmpty = Boolean(cleanStr(el.value));
        if (!_segPrevSearchNonEmpty && nowNonEmpty) {
          notifySegBackStatePush('seg_search');
        }
        _segPrevSearchNonEmpty = nowNonEmpty;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          renderQuotes();
          saveSegUiCheckpointNow();
        }, 120);
      } else if (kind === 'preview-msg' || kind === 'close-comentarios') {
        saveSegUiCheckpointNow();
      } else if (kind === 'audit-search') {
        filterAuditView();
      }
    };

    const onScroll = () => {
      if (!_segRestoringCheckpoint && _pendingSegCheckpointRestore) {
        delete _pendingSegCheckpointRestore.scrollY;
        delete _pendingSegCheckpointRestore.containerScrollTop;
      }
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => saveSegUiCheckpointNow(), 200);
    };

    const onPageHide = () => saveSegUiCheckpointNow();
    const onBeforeUnload = () => saveSegUiCheckpointNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveSegUiCheckpointNow();
      else if (document.visibilityState === 'visible') {
        sendSegPresenceHeartbeat(false);
        fetchDeltaState({ background: true });
      }
    };
    const onWindowFocus = () => {
      sendSegPresenceHeartbeat(false);
    };
    const onOnline = () => {
      if (!mounted) return;
      flushSegOfflineOutbox();
      fetchDeltaState({ background: true });
      sendSegPresenceHeartbeat(false);
    };
    const onSearch = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute('data-seg-input') !== 'search') return;
      if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
      _segPrevSearchNonEmpty = Boolean(cleanStr(el.value));
      renderQuotes();
      saveSegUiCheckpointNow();
    };
    const onRootKeyDown = (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute('data-seg-input') !== 'search') return;
      if (ev.key === 'Enter' || ev.keyCode === 13) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
        _segPrevSearchNonEmpty = Boolean(cleanStr(el.value));
        renderQuotes();
        saveSegUiCheckpointNow();
        if (typeof el.blur === 'function') { try { el.blur(); } catch (eB) {} }
      }
    };
    const onKeyDown = (ev) => {
      if (!mounted || ev.key !== 'Escape' || ev.__creataEscapeHandled) return;
      if ((mountOpts && mountOpts.backNavManaged) || Boolean(global.__CREATA_INV_BACK_NAV__)) return;
      if (!$('seg_previewModal')?.classList.contains('cm-hidden')) closePreviewModal();
      else if (!$('seg_modalCerrarCotizacion')?.classList.contains('cm-hidden')) closeModalCerrar();
      else if (!$('seg_modalKevinAudit')?.classList.contains('cm-hidden')) closeKevinAuditModal();
    };

    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('change', onChange);
    rootEl.addEventListener('input', onInput);
    rootEl.addEventListener('search', onSearch);
    rootEl.addEventListener('keydown', onRootKeyDown);
    rootEl.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('pagehide', onPageHide);
    global.addEventListener('beforeunload', onBeforeUnload);
    global.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    global.addEventListener('online', onOnline);
    document.addEventListener('keydown', onKeyDown);

    boundHandlers = {
      onClick, onChange, onInput, onSearch, onRootKeyDown, onScroll, onPageHide, onBeforeUnload, onWindowFocus, onVisibilityChange, onOnline, onKeyDown
    };
  }

  function removeDelegatedListeners() {
    if (!boundHandlers) return;
    if (rootEl) {
      rootEl.removeEventListener('click', boundHandlers.onClick);
      rootEl.removeEventListener('change', boundHandlers.onChange);
      rootEl.removeEventListener('input', boundHandlers.onInput);
      rootEl.removeEventListener('search', boundHandlers.onSearch);
      rootEl.removeEventListener('keydown', boundHandlers.onRootKeyDown);
      rootEl.removeEventListener('scroll', boundHandlers.onScroll);
    }
    global.removeEventListener('scroll', boundHandlers.onScroll);
    global.removeEventListener('pagehide', boundHandlers.onPageHide);
    global.removeEventListener('beforeunload', boundHandlers.onBeforeUnload);
    global.removeEventListener('focus', boundHandlers.onWindowFocus);
    document.removeEventListener('visibilitychange', boundHandlers.onVisibilityChange);
    global.removeEventListener('online', boundHandlers.onOnline);
    document.removeEventListener('keydown', boundHandlers.onKeyDown);
    boundHandlers = null;
  }

  function resetSegInMemoryState() {
    _segFetchSeq++;
    _pendingSegCheckpointRestore = null;
    _segPrevSearchNonEmpty = false;
    ACTIVE_VIEW_MODE = 'ACTIVAS';
    _segDeltaVersion = 0;
    _segDeltaInvVersion = '';
    _segRowWatermarks = { cotCreata: 0, cotArchivadas: 0, cotVivo: 0, cierres: 0, histMov: 0, histSeg: 0 };
    APP_STATE.user = null;
    APP_STATE.quotes = [];
    APP_STATE.rawPartidas = [];
    APP_STATE.auditLogs = [];
    APP_STATE.closures = {};
    APP_STATE.appCreatedFolios = [];
    APP_STATE.advisors = [];
    APP_STATE.directoryRecords = [];
    APP_STATE.activeModalQuote = null;
    APP_STATE.activeCloseQuote = null;
    ACTIVE_MODAL_QUOTE = null;
    ACTIVE_CLOSE_FOLIO = null;
    SELECTED_ITEMS_SET.clear();
    AUDIT_STATE.logs = [];
  }

  function isSegModalVisible(id) {
    const el = $(id);
    return Boolean(el && !el.classList.contains('cm-hidden'));
  }

  function hasActiveOverlay() {
    if (!mounted) return false;
    return isSegModalVisible('seg_previewModal') ||
      isSegModalVisible('seg_modalCerrarCotizacion') ||
      isSegModalVisible('seg_modalKevinAudit');
  }

  function hasActiveSegFilters() {
    if (!mounted) return false;
    const selUrg = $('seg_filterUrgencia');
    if (selUrg && cleanStr(selUrg.value) && cleanStr(selUrg.value).toUpperCase() !== 'TODOS') return true;
    const asesorWrap = $('seg_filterAsesorWrap');
    const selAse = $('seg_filterAsesor');
    if (selAse && (!asesorWrap || !asesorWrap.classList.contains('cm-hidden'))) {
      const vA = cleanStr(selAse.value);
      if (vA && vA.toUpperCase() !== 'TODOS') return true;
    }
    const selSuc = $('seg_filterSucursal');
    if (selSuc && !selSuc.classList.contains('cm-hidden')) {
      const vS = cleanStr(selSuc.value);
      if (vS && vS.toUpperCase() !== 'TODAS') return true;
    }
    return false;
  }

  function getBackDepthWeight() {
    if (!mounted) return 0;
    let w = 1; // module view itself
    if (ACTIVE_VIEW_MODE === 'ARCHIVADAS') w += 1;
    if (cleanStr($('seg_filterSearch')?.value || '')) w += 1;
    if (hasActiveSegFilters()) w += 1;
    return w;
  }

  function handleBackAction(opts) {
    if (!mounted) return { handled: false, action: '' };
    const options = opts && typeof opts === 'object' ? opts : {};
    const phase = options.phase || 'all';

    if (phase === 'overlay' || phase === 'all') {
      if (isSegModalVisible('seg_previewModal')) {
        if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.previewModal;
        closePreviewModal();
        return { handled: true, action: 'seg_preview_modal' };
      }
      if (isSegModalVisible('seg_modalCerrarCotizacion')) {
        if (_pendingSegCheckpointRestore) delete _pendingSegCheckpointRestore.closeModal;
        closeModalCerrar();
        return { handled: true, action: 'seg_cerrar_modal' };
      }
      if (isSegModalVisible('seg_modalKevinAudit')) {
        closeKevinAuditModal();
        return { handled: true, action: 'seg_audit_modal' };
      }
      if (phase === 'overlay') {
        return { handled: false, action: '' };
      }
    }

    if (phase === 'view' || phase === 'all') {
      const searchInp = $('seg_filterSearch');
      if (searchInp && cleanStr(searchInp.value)) {
        if (_pendingSegCheckpointRestore) {
          delete _pendingSegCheckpointRestore.scrollY;
          delete _pendingSegCheckpointRestore.containerScrollTop;
        }
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }
        searchInp.value = '';
        _segPrevSearchNonEmpty = false;
        $('seg_btnClearSearch')?.classList.add('cm-hidden');
        renderQuotes();
        saveSegUiCheckpointNow();
        return { handled: true, action: 'seg_search', toast: 'Búsqueda limpiada' };
      }

      if (hasActiveSegFilters()) {
        const selSuc = $('seg_filterSucursal');
        if (selSuc && !selSuc.classList.contains('cm-hidden')) {
          selSuc.value = 'TODAS';
        }
        const selUrg = $('seg_filterUrgencia');
        if (selUrg) selUrg.value = 'TODOS';
        const asesorWrap = $('seg_filterAsesorWrap');
        const selAse = $('seg_filterAsesor');
        if (selAse && (!asesorWrap || !asesorWrap.classList.contains('cm-hidden'))) {
          selAse.value = 'TODOS';
        }
        if (_pendingSegCheckpointRestore) {
          delete _pendingSegCheckpointRestore.filterSucursal;
          delete _pendingSegCheckpointRestore.filterAsesor;
        }
        populateAdvisorFilter();
        renderQuotes();
        saveSegUiCheckpointNow();
        return { handled: true, action: 'seg_filters', toast: 'Filtros restablecidos' };
      }

      if (ACTIVE_VIEW_MODE === 'ARCHIVADAS') {
        ACTIVE_VIEW_MODE = 'ACTIVAS';
        renderQuotes();
        saveSegUiCheckpointNow();
        return { handled: true, action: 'seg_view_activas', toast: 'Volviendo a cotizaciones activas' };
      }

      if (mountOpts && typeof mountOpts.onClose === 'function') {
        mountOpts.onClose();
      } else if (mountOpts && typeof mountOpts.onGoHome === 'function') {
        mountOpts.onGoHome();
      } else if (typeof global.closeInAppModules === 'function') {
        global.closeInAppModules();
      }
      return { handled: true, action: 'seg_close_module', toast: 'Volviendo al inventario' };
    }

    return { handled: false, action: '' };
  }

  // ============================================================================
  // CONTRATO PÚBLICO: window.CreataSeguimientoModule
  // ============================================================================
  function mount(targetEl, opts) {
    if (global.CreataGuard && global.CreataGuard.blocked) return false;
    if (!targetEl) return false;

    if (mounted) unmount();
    resetSegInMemoryState();

    mountOpts = opts && typeof opts === 'object' ? opts : {};
    const adoptedUser = adoptSessionSync(mountOpts.session);

    if (!adoptedUser) {
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
              <button type="button" class="cm-btn cm-btn-back" data-seg-action="close-module">← Volver</button>
              <h1 class="cm-title">Seguimiento</h1>
            </div>
          </div>
        </header>
      `;
      bindDelegatedListeners();
      return false;
    }

    rootEl = targetEl;
    mounted = true;
    _segUiCheckpointRestoredOnce = false;
    _segRestoringCheckpoint = false;
    APP_STATE.user = adoptedUser;

    rootEl.innerHTML = buildModuleMarkup();
    bindDelegatedListeners();
    renderUserHeaderAndRoleControls();

    if (hydrateFromLocalSnapshotSync()) {
      populateAdvisorFilter();
      restoreSegUiCheckpointOnce(true);
    } else {
      populateAdvisorFilter();
    }
    _segPrevSearchNonEmpty = Boolean(cleanStr($('seg_filterSearch')?.value || ''));

    sendSegPresenceHeartbeat(true);
    fetchDeltaState({ manual: false });
    flushSegOfflineOutbox();

    if (pollIntervalId) clearInterval(pollIntervalId);
    pollIntervalId = setInterval(() => {
      if (mounted && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
        sendSegPresenceHeartbeat(false);
        fetchDeltaState({ background: true });
      }
    }, POLL_INTERVAL_MS);

    return true;
  }

  function unmount() {
    if (!mounted) return;
    saveSegUiCheckpointNow();

    if (pollIntervalId) { clearInterval(pollIntervalId); pollIntervalId = null; }
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }

    removeDelegatedListeners();

    if (rootEl) rootEl.innerHTML = '';
    rootEl = null;
    mounted = false;
    _segUiCheckpointRestoredOnce = false;
    _segRestoringCheckpoint = false;
    resetSegInMemoryState();
  }

  function saveCheckpoint() {
    saveSegUiCheckpointNow();
  }

  function refresh() {
    if (!mounted) return Promise.resolve();
    return fetchDeltaState({ manual: false });
  }

  function isMounted() {
    return mounted;
  }

  global.CreataSeguimientoModule = {
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
