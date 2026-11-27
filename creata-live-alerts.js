/*
 * CREATA Muebles — Motor Unificado de Notificaciones en Vivo (creata-live-alerts.js)
 * Exclusivo para la cuenta maestra kevin.reyna@grupoanipa.com (sin vista previa de asesor).
 * Notifica en laptop y celular (PWA / Service Worker + banner en pantalla):
 *   1) Creación de cotizaciones
 *   2) Eventos de seguimiento (WhatsApp, Teléfono, Correo, Cierre Ganada/Perdida/Cancelada)
 *   3) Conexión y desconexión de usuarios e invitados en tiempo real (sin ráfaga inicial)
 *   4) Fallos críticos del sistema (F1–F11, N1, N2), ignorando alertas normales (F13, F15, N3)
 */
(function (global) {
  'use strict';

  if (!global || (global.CreataLiveAlerts && global.CreataLiveAlerts.__unifiedV2)) {
    return;
  }

  const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
  const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

  const SESSION_KEYS = [
    'creata_inv_advisor_session_v1',
    'creata_private_kevin_panel_v1',
    'creata_private_kevin_fotos_v1',
    'creata_private_kevin_hist_v1'
  ];
  const KEVIN_ROLE_PREVIEW_KEY = 'creata_kevin_advisor_preview_v1';
  const LIVE_ALERTS_SEEN_KEY = 'creata_live_alerts_seen_v2';
  const LIVE_POLL_INTERVAL_MS = 45000;

  let seenMap = {};
  let histBaselineSeeded = false;
  let presenceBaselineSeeded = false;
  let presenceStateByKey = {};
  let pollInFlight = false;
  let pollTimer = null;

  try {
    const raw = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(LIVE_ALERTS_SEEN_KEY)) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem(LIVE_ALERTS_SEEN_KEY));
    if (raw) seenMap = JSON.parse(raw) || {};
  } catch (e) {}

  function cleanStr(val) {
    return val === null || val === undefined ? '' : String(val).trim();
  }

  function normalizeEmail(raw) {
    return cleanStr(raw).toLowerCase().replace(/,/g, '.');
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isEmbeddedIframe() {
    try {
      return Boolean(global.parent && global.parent !== global);
    } catch (e) {
      return true;
    }
  }

  function readExclusiveKevinSession() {
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEVIN_ROLE_PREVIEW_KEY) === '1') {
        return null;
      }
    } catch (ePrev) {}

    for (let i = 0; i < SESSION_KEYS.length; i++) {
      try {
        if (typeof localStorage === 'undefined') break;
        const raw = localStorage.getItem(SESSION_KEYS[i]);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') continue;
        if (parsed.mustChangeKey || parsed.isGuest || parsed.soloLectura || parsed.viewOnly) continue;
        if (parsed.forceAdvisorPreview === true) return null;
        const email = normalizeEmail(parsed.correo || parsed.email);
        if (email !== OWNER_EMAIL) continue;
        return {
          correo: email,
          nombre: cleanStr(parsed.nombre) || 'Kevin Reyna',
          authToken: cleanStr(parsed.authToken),
          sheetTab: cleanStr(parsed.sheetTab) || 'CUENTAS ADMINISTRATIVAS'
        };
      } catch (eRead) {}
    }
    return null;
  }

  function markAlertSeen(sig) {
    if (!sig) return false;
    if (seenMap[sig]) return false;
    seenMap[sig] = Date.now();
    try {
      const keys = Object.keys(seenMap);
      if (keys.length > 360) {
        keys.slice(0, keys.length - 260).forEach(function (k) { delete seenMap[k]; });
      }
      const json = JSON.stringify(seenMap);
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LIVE_ALERTS_SEEN_KEY, json);
      if (typeof localStorage !== 'undefined') localStorage.setItem(LIVE_ALERTS_SEEN_KEY, json);
    } catch (e) {}
    return true;
  }

  function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = String(csvText || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        // ignore CR
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function ensureToastContainer() {
    if (typeof document === 'undefined' || !document.body) return null;
    let wrap = document.getElementById('creataLiveAlertToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'creataLiveAlertToastWrap';
      wrap.setAttribute('aria-live', 'polite');
      wrap.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9998;max-width:min(380px,calc(100vw - 28px));display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function resolveToastColors(kind) {
    if (kind === 'error') return { border: '#DC2626', title: '#991B1B' };
    if (kind === 'seguimiento') return { border: '#2563EB', title: '#1E40AF' };
    if (kind === 'presence_on') return { border: '#059669', title: '#065F46' };
    if (kind === 'presence_off') return { border: '#64748B', title: '#334155' };
    return { border: '#10B981', title: '#065F46' };
  }

  function showInAppToast(opts) {
    const o = opts || {};
    if (typeof global.__CREATA_LIVE_ALERTS_TEST_HOOK__ === 'function') {
      try { global.__CREATA_LIVE_ALERTS_TEST_HOOK__(o); } catch (eHook) {}
    }
    const wrap = ensureToastContainer();
    if (!wrap) return;
    const palette = resolveToastColors(o.kind);
    const card = document.createElement('div');
    card.style.cssText = 'pointer-events:auto;background:#FFFFFF;border:1.5px solid ' + palette.border +
      ';border-left:5px solid ' + palette.border +
      ';border-radius:14px;padding:11px 13px;box-shadow:0 12px 28px rgba(26,24,22,0.18);font-family:"Plus Jakarta Sans",sans-serif;color:#1A1816;transition:opacity .2s ease;';
    card.innerHTML =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
        '<div style="font-size:12px;font-weight:800;line-height:1.3;color:' + palette.title + ';">' +
          escapeHtml(o.title || 'Aviso en vivo') +
        '</div>' +
        '<button type="button" aria-label="Cerrar aviso" style="background:transparent;border:none;font-size:14px;font-weight:800;color:#6B655E;cursor:pointer;line-height:1;padding:0 2px;">✕</button>' +
      '</div>' +
      '<div style="font-size:11px;font-weight:600;color:#252C32;margin-top:4px;line-height:1.35;">' +
        escapeHtml(o.body || '') +
      '</div>' +
      (typeof global.openInAppHistorial === 'function'
        ? ('<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:7px;">' +
            '<button type="button" data-open-hist="1" style="background:transparent;border:none;font-size:11px;font-weight:800;color:#9E7B4F;cursor:pointer;text-decoration:underline;padding:0;">Ver en Historial</button>' +
          '</div>')
        : '');

    const closeBtn = card.querySelector ? card.querySelector('button[aria-label="Cerrar aviso"]') : null;
    const histBtn = card.querySelector ? card.querySelector('button[data-open-hist="1"]') : null;
    const removeCard = function () {
      if (card.parentNode) card.parentNode.removeChild(card);
    };
    if (closeBtn && closeBtn.addEventListener) closeBtn.addEventListener('click', removeCard);
    if (histBtn && histBtn.addEventListener) {
      histBtn.addEventListener('click', function () {
        removeCard();
        if (typeof global.openInAppHistorial === 'function') global.openInAppHistorial();
      });
    }
    wrap.appendChild(card);
    while (wrap.children && wrap.children.length > 4) {
      wrap.removeChild(wrap.firstChild);
    }
    setTimeout(removeCard, 7000);
  }

  function dispatchSystemNotification(title, body, tag) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const notifOpts = {
        body: String(body || ''),
        tag: String(tag || ('creata-alert-' + Date.now())),
        renotify: false,
        data: { openModule: 'historial' }
      };
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistration === 'function') {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && typeof reg.showNotification === 'function') {
            reg.showNotification(title, notifOpts).catch(function () {
              try { new Notification(title, notifOpts); } catch (eN) {}
            });
          } else {
            try { new Notification(title, notifOpts); } catch (eN2) {}
          }
        }).catch(function () {
          try { new Notification(title, notifOpts); } catch (eN3) {}
        });
      } else {
        new Notification(title, notifOpts);
      }
    } catch (e) {}
  }

  function notifyQuoteCreated(info) {
    if (!readExclusiveKevinSession()) return;
    const d = info || {};
    const folio = cleanStr(d.folio) || 'SIN-FOLIO';
    const client = cleanStr(d.clientName) || 'Cliente';
    const store = cleanStr(d.erpStore) || '';
    const advisor = cleanStr(d.advisorName).split('|')[0].trim();
    const total = cleanStr(d.total);
    const sig = 'QUOTE|' + folio;
    if (!markAlertSeen(sig)) return;

    const title = '📋 Nueva Cotización ' + folio;
    const body = [client, store, advisor, total].filter(Boolean).join(' · ');
    if (d.showToast !== false) {
      showInAppToast({ kind: 'quote', title: title, body: body });
    }
    dispatchSystemNotification(title, body, sig);
  }

  function notifySeguimientoEvent(info) {
    if (!readExclusiveKevinSession()) return;
    const d = info || {};
    const evUpper = cleanStr(d.event).toUpperCase();
    const folio = cleanStr(d.folio) || 'SEGUIMIENTO';
    const advisor = cleanStr(d.advisorName || d.user).split('(')[0].trim();
    const branch = cleanStr(d.branch);
    let parsed = null;
    if (d.rawDetail && String(d.rawDetail).trim().charAt(0) === '{') {
      try { parsed = JSON.parse(d.rawDetail); } catch (eP) { parsed = null; }
    }
    const client = cleanStr((parsed && (parsed.cliente || parsed.clientName)) || d.clientName);
    const status = cleanStr((parsed && parsed.estatus) || d.status).toUpperCase();
    const motivo = cleanStr(parsed && parsed.motivo);
    const customAccion = cleanStr((parsed && parsed.accion) || d.actionLabel);

    let actionLabel = customAccion || 'Seguimiento registrado';
    if (evUpper.indexOf('CIERRE') !== -1 || status === 'GANADA' || status === 'PERDIDA' || status === 'CANCELADA') {
      actionLabel = (status || 'Cierre') + (motivo ? (' (' + motivo + ')') : '');
    } else if (evUpper.indexOf('WHATSAPP') !== -1) {
      actionLabel = 'WhatsApp enviado';
    } else if (evUpper.indexOf('TELEFONO') !== -1) {
      actionLabel = 'Teléfono actualizado';
    } else if (evUpper.indexOf('EMAIL') !== -1) {
      actionLabel = 'Correo enviado';
    }

    const sig = 'SEG|' + folio + '|' + evUpper + '|' + cleanStr(d.ts || Date.now());
    if (!markAlertSeen(sig)) return;

    const title = '📞 Seguimiento · ' + folio;
    const body = [actionLabel, client, branch, advisor].filter(Boolean).join(' · ');
    showInAppToast({ kind: 'seguimiento', title: title, body: body });
    dispatchSystemNotification(title, body, sig);
  }

  function notifyPresenceTransition(info) {
    if (!readExclusiveKevinSession()) return;
    const d = info || {};
    const name = cleanStr(d.nombre) || 'Usuario';
    const online = Boolean(d.online);
    const sucursal = cleanStr(d.sucursal);
    const rol = cleanStr(d.rol);
    const vista = cleanStr(d.vista);
    const stateTag = online ? 'ON' : 'OFF';
    const sig = 'PRES|' + cleanStr(d.key || name) + '|' + stateTag + '|' + Math.floor(Date.now() / 15000);
    if (!markAlertSeen(sig)) return;

    const title = (online ? '🟢 Conectado: ' : '⚪ Desconectado: ') + name;
    const body = [sucursal, rol, vista ? ('Vista: ' + vista) : ''].filter(Boolean).join(' · ');
    showInAppToast({ kind: online ? 'presence_on' : 'presence_off', title: title, body: body });
    dispatchSystemNotification(title, body, sig);
  }

  function notifyFailure(info) {
    if (!readExclusiveKevinSession()) return;
    const d = info || {};
    const clas = cleanStr(d.classification).toUpperCase();
    // Ignorar alertas técnicas normales (F13, F15, N3) y registros ya corregidos
    if (clas && clas.indexOf('ALERTA') !== -1 && clas.indexOf('FALLO') === -1) return;
    if (/CORREGIDO/i.test(cleanStr(d.status))) return;

    const ev = cleanStr(d.event) || 'Falla crítica';
    const mod = cleanStr(d.module) || 'Sistema';
    const det = cleanStr(d.detail).slice(0, 120);
    const ref = cleanStr(d.ref);
    const sig = 'ERR|' + mod + '|' + ev + '|' + ref + '|' + det.slice(0, 60);
    if (!markAlertSeen(sig)) return;

    const title = '⚠️ Falla crítica: ' + ev;
    const body = [mod, ref, det].filter(Boolean).join(' · ');
    showInAppToast({ kind: 'error', title: title, body: body });
    dispatchSystemNotification(title, body, sig);
  }

  function ingestPresenceSnapshot(res) {
    const sess = readExclusiveKevinSession();
    if (!sess || !res || !res.ok || !Array.isArray(res.users)) return;

    const serverNow = Number(res.serverTimeMs) > 0 ? Number(res.serverTimeMs) : Date.now();
    const thresholdMs = Number(res.thresholdMs) > 0 ? Number(res.thresholdMs) : 180000;
    const combined = [];

    for (let i = 0; i < res.users.length; i++) {
      const u = res.users[i];
      if (!u || typeof u !== 'object') continue;
      const email = normalizeEmail(u.correo);
      if (email === OWNER_EMAIL) continue;
      const key = 'usr:' + (email || cleanStr(u.nombre).toLowerCase());
      if (key === 'usr:') continue;
      const lastSeenMs = Number(u.lastSeenMs) > 0 ? Number(u.lastSeenMs) : 0;
      const online = typeof u.online === 'boolean'
        ? u.online
        : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);
      combined.push({
        key: key,
        nombre: cleanStr(u.nombre) || email || 'Usuario',
        sucursal: cleanStr(u.sucursal),
        rol: cleanStr(u.rol),
        vista: cleanStr(u.vista),
        online: online
      });
    }

    const rawGuests = Array.isArray(res.guests) ? res.guests : [];
    for (let g = 0; g < rawGuests.length; g++) {
      const gu = rawGuests[g];
      if (!gu || typeof gu !== 'object') continue;
      const gEmail = normalizeEmail(gu.correo);
      const key = 'gst:' + (gEmail || cleanStr(gu.nombre).toLowerCase());
      if (key === 'gst:') continue;
      const lastSeenMs = Number(gu.lastSeenMs) > 0 ? Number(gu.lastSeenMs) : 0;
      const online = typeof gu.online === 'boolean'
        ? gu.online
        : Boolean(lastSeenMs > 0 && (serverNow - lastSeenMs) <= thresholdMs);
      combined.push({
        key: key,
        nombre: cleanStr(gu.nombre) || gEmail || 'Invitado',
        sucursal: 'INVITADOS (SOLO VER)',
        rol: cleanStr(gu.rol) || 'INVITADO',
        vista: cleanStr(gu.vista),
        online: online
      });
    }

    if (!presenceBaselineSeeded) {
      const nextSeed = {};
      for (let i = 0; i < combined.length; i++) {
        nextSeed[combined[i].key] = combined[i].online;
      }
      presenceStateByKey = nextSeed;
      presenceBaselineSeeded = true;
      return;
    }

    const nextMap = Object.assign({}, presenceStateByKey);
    for (let i = 0; i < combined.length; i++) {
      const item = combined[i];
      const hadPrev = Object.prototype.hasOwnProperty.call(presenceStateByKey, item.key);
      const prevOnline = hadPrev ? Boolean(presenceStateByKey[item.key]) : false;
      nextMap[item.key] = item.online;
      if (!hadPrev && item.online) {
        notifyPresenceTransition(item);
      } else if (hadPrev && prevOnline !== item.online) {
        notifyPresenceTransition(item);
      }
    }
    presenceStateByKey = nextMap;
  }

  async function fetchHistorialTailCsv() {
    if (typeof fetch !== 'function') return null;
    const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
      '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent('HISTORIAL') + '&_t=' + Date.now();
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp || !resp.ok) return null;
      const txt = await resp.text();
      if (!txt || txt.trim().indexOf('<!DOCTYPE') === 0 || txt.trim().indexOf('<html') === 0) return null;
      return parseCsvRows(txt);
    } catch (e) {
      return null;
    }
  }

  async function fetchLivePresenceForOwner(sess) {
    if (typeof fetch !== 'function' || !sess || !sess.authToken) return null;
    try {
      const resp = await fetch(CANONICAL_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'inv_presence_list',
          authToken: sess.authToken,
          advisorEmail: sess.correo,
          sheetTab: sess.sheetTab || 'CUENTAS ADMINISTRATIVAS'
        })
      });
      if (!resp || !resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  function processHistorialRows(histRows) {
    if (!Array.isArray(histRows) || histRows.length <= 1) return;
    const startIdx = Math.max(1, histRows.length - 20);
    for (let i = startIdx; i < histRows.length; i++) {
      const r = histRows[i] || [];
      const ts = cleanStr(r[0]);
      const clas = cleanStr(r[1]).toUpperCase();
      const mod = cleanStr(r[2]);
      const ev = cleanStr(r[3]);
      const st = cleanStr(r[4]);
      const usr = cleanStr(r[5]);
      const suc = cleanStr(r[6]);
      const ref = cleanStr(r[7]);
      const det = cleanStr(r[8]);
      if (!ts && !ev) continue;
      if (/^FECHA/i.test(ts) && /CLASIFICACI/i.test(clas)) continue;

      const rowSig = 'HROW|' + ts + '|' + ev + '|' + ref;
      if (!histBaselineSeeded) {
        markAlertSeen(rowSig);
        if (ref && /COTIZACI[ÓO]N CREADA|NUEVA_COTIZACION/i.test(ev)) {
          markAlertSeen('QUOTE|' + ref);
        }
        continue;
      }
      if (!markAlertSeen(rowSig)) continue;

      const evUp = ev.toUpperCase();
      const modUp = mod.toUpperCase();
      if (/COTIZACI[ÓO]N CREADA|NUEVA_COTIZACION/i.test(ev)) {
        notifyQuoteCreated({
          folio: ref || ts,
          clientName: det.slice(0, 56) || usr,
          erpStore: suc,
          advisorName: usr
        });
        if (typeof global.refreshMyLiveQuotesThrottled === 'function') {
          try { global.refreshMyLiveQuotesThrottled(true); } catch (eQ) {}
        }
      } else if (
        clas === 'MOVIMIENTO' &&
        (modUp === 'SEGUIMIENTO_COTIZACIONES' || /^SEG_(?:WHATSAPP|TELEFONO|EMAIL|CIERRE)$/i.test(evUp))
      ) {
        notifySeguimientoEvent({
          ts: ts,
          event: evUp,
          folio: ref,
          user: usr,
          branch: suc,
          rawDetail: det
        });
      } else if (clas.indexOf('FALLO') !== -1 && !/CORREGIDO/i.test(st)) {
        notifyFailure({
          classification: clas,
          module: mod,
          event: ev,
          status: st,
          ref: ref,
          detail: det || st,
          user: usr,
          branch: suc
        });
      }
    }
    histBaselineSeeded = true;
  }

  async function pollNow() {
    if (pollInFlight) return;
    const sess = readExclusiveKevinSession();
    if (!sess) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    pollInFlight = true;
    try {
      const [histRows, presenceRes] = await Promise.all([
        fetchHistorialTailCsv(),
        fetchLivePresenceForOwner(sess)
      ]);
      if (!readExclusiveKevinSession()) return;
      if (histRows) processHistorialRows(histRows);
      if (presenceRes && presenceRes.ok) ingestPresenceSnapshot(presenceRes);
    } catch (ePoll) {
    } finally {
      pollInFlight = false;
    }
  }

  async function enableAndTest() {
    let perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
    if (perm === 'default' && typeof Notification.requestPermission === 'function') {
      try { perm = await Notification.requestPermission(); } catch (e) {}
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('creata_live_alerts_enabled_v1', '1');
      }
    } catch (e) {}
    const title = '🔔 Alertas en vivo activas';
    const body = (perm === 'granted')
      ? 'Recibirás avisos de cotizaciones, seguimiento, conexiones/desconexiones y fallas críticas.'
      : 'Avisos en pantalla activos para cotizaciones, seguimiento, conexiones y fallas críticas.';
    showInAppToast({ kind: 'quote', title: title, body: body });
    if (perm === 'granted') {
      dispatchSystemNotification(title, body, 'creata-alert-test-' + Date.now());
    }
    return perm;
  }

  function startAutoPollIfTopWindow() {
    if (isEmbeddedIframe() || pollTimer) return;
    setTimeout(function () {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        pollNow();
      }
    }, 2500);
    pollTimer = setInterval(function () {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        pollNow();
      }
    }, LIVE_POLL_INTERVAL_MS);
  }

  global.CreataLiveAlerts = {
    __unifiedV2: true,
    notifyQuoteCreated: notifyQuoteCreated,
    notifySeguimientoEvent: notifySeguimientoEvent,
    notifyPresenceTransition: notifyPresenceTransition,
    notifyFailure: notifyFailure,
    ingestPresenceSnapshot: ingestPresenceSnapshot,
    enableAndTest: enableAndTest,
    poll: pollNow,
    pollNow: pollNow
  };
  global.toggleLiveAlertsPermission = enableAndTest;

  startAutoPollIfTopWindow();
})(typeof window !== 'undefined' ? window : globalThis);
