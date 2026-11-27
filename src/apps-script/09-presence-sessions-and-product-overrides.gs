// ============================================================================
// PRESENCIA EN LÍNEA / DESCONECTADO (PUNTO #16 — SOLO CACHE + PROPERTIES, 0 HOJAS)
// ============================================================================
const INV_PRESENCE_STATE_KEY_ = 'INV_PRESENCE_STATE_V1';
const INV_PRESENCE_ONLINE_THRESHOLD_MS_ = 180000;
const INV_PRESENCE_CACHE_TTL_SEC_ = 21600;
const INV_PRESENCE_MAX_BYTES_ = 7500;

function utf8ByteLength_(str) {
  const s = String(str || '');
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function normalizePresenceKey_(correo, nombre) {
  const cleanMail = String(correo || '').trim().toLowerCase();
  if (cleanMail) return cleanMail;
  return String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizePresenceVista_(vista) {
  return String(vista || '').replace(/[\r\n\t\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function sanitizePresenceEntry_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const correo = String(raw.correo || '').trim().toLowerCase();
  const nombre = String(raw.nombre || '').trim();
  const key = normalizePresenceKey_(correo, nombre);
  if (!key) return null;
  const lastSeenMs = Number(raw.lastSeenMs) > 0 ? Math.floor(Number(raw.lastSeenMs)) : 0;
  return {
    lastSeenMs: lastSeenMs,
    nombre: nombre,
    correo: correo,
    sucursal: String(raw.sucursal || '').trim().slice(0, 80),
    rol: String(raw.rol || '').trim().slice(0, 60),
    vista: sanitizePresenceVista_(raw.vista),
    online: Boolean(raw.online)
  };
}

function readInvPresenceMap_() {
  let raw = '';
  let fromCache = false;
  try {
    const cached = CacheService.getScriptCache().get(INV_PRESENCE_STATE_KEY_);
    if (cached) {
      raw = String(cached);
      fromCache = true;
    }
  } catch (eCache) {}

  if (!raw) {
    try {
      const propVal = PropertiesService.getScriptProperties().getProperty(INV_PRESENCE_STATE_KEY_);
      if (propVal) {
        raw = String(propVal);
      }
    } catch (eProp) {}
  }

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cleanMap = {};
    const keys = Object.keys(parsed);
    for (let i = 0; i < keys.length; i++) {
      const k = String(keys[i] || '').trim().toLowerCase();
      if (!k) continue;
      const entry = sanitizePresenceEntry_(parsed[keys[i]]);
      if (entry) cleanMap[k] = entry;
    }
    if (!fromCache) {
      try {
        CacheService.getScriptCache().put(INV_PRESENCE_STATE_KEY_, JSON.stringify(cleanMap), INV_PRESENCE_CACHE_TTL_SEC_);
      } catch (eWarm) {}
    }
    return cleanMap;
  } catch (eParse) {
    return {};
  }
}

function writeInvPresenceMap_(map) {
  const src = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
  const cleanMap = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const k = String(keys[i] || '').trim().toLowerCase();
    if (!k) continue;
    const entry = sanitizePresenceEntry_(src[keys[i]]);
    if (entry) cleanMap[k] = entry;
  }

  let json = JSON.stringify(cleanMap);
  if (utf8ByteLength_(json) > INV_PRESENCE_MAX_BYTES_) {
    const now = Date.now();
    const pruneOrder = Object.keys(cleanMap).map((k) => {
      const e = cleanMap[k];
      const isOnline = Boolean(
        e &&
        e.online !== false &&
        Number(e.lastSeenMs) > 0 &&
        (now - Number(e.lastSeenMs)) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
      );
      return {
        key: k,
        isOnline: isOnline,
        lastSeenMs: Number(e && e.lastSeenMs) || 0
      };
    });
    pruneOrder.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? 1 : -1;
      return a.lastSeenMs - b.lastSeenMs;
    });
    for (let i = 0; i < pruneOrder.length && utf8ByteLength_(json) > INV_PRESENCE_MAX_BYTES_; i++) {
      delete cleanMap[pruneOrder[i].key];
      json = JSON.stringify(cleanMap);
    }
  }

  try {
    CacheService.getScriptCache().put(INV_PRESENCE_STATE_KEY_, json, INV_PRESENCE_CACHE_TTL_SEC_);
  } catch (eCache) {}
  try {
    PropertiesService.getScriptProperties().setProperty(INV_PRESENCE_STATE_KEY_, json);
  } catch (eProp) {}
  return cleanMap;
}

function recordInvPresence_(advisor, vista, onlineFlag) {
  const now = Date.now();
  if (!advisor || typeof advisor !== 'object') return now;

  const correo = String(advisor.correo || '').trim().toLowerCase();
  const nombre = String(advisor.nombre || '').trim();
  const key = normalizePresenceKey_(correo, nombre);
  if (!key) return now;

  const sucursal = String(advisor.erpStore || advisor.sucursal || advisor.sheetTab || '').trim().slice(0, 80);
  const rol = String(
    advisor.puesto ||
    (advisor.isAdmin ? 'ADMINISTRADOR' : (isGuestReadOnlyUser_(advisor) ? 'INVITADO' : 'ASESOR'))
  ).trim().slice(0, 60);

  const entry = {
    lastSeenMs: now,
    nombre: nombre,
    correo: correo,
    sucursal: sucursal,
    rol: rol,
    vista: sanitizePresenceVista_(vista),
    online: Boolean(onlineFlag)
  };

  let lock = null;
  let locked = false;
  try {
    if (typeof LockService !== 'undefined' && LockService && typeof LockService.getScriptLock === 'function') {
      lock = LockService.getScriptLock();
      locked = !!lock.tryLock(1500);
    }
  } catch (eLock) {
    locked = false;
  }

  try {
    const map = readInvPresenceMap_();
    map[key] = entry;
    writeInvPresenceMap_(map);
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
  return now;
}

function resolvePresenceActor_(body, allowGuest) {
  const b = body || {};
  const token = String(b.authToken || b.token || '').trim();
  const tokenInfo = verifyInvAuthToken_(token);
  const advisorEmail = String(b.advisorEmail || b.email || b.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const accessKey = String(b.accessKey || '').trim();

  if ((!tokenInfo || !tokenInfo.email) && (!advisorEmail || !accessKey)) {
    return {
      ok: false,
      authRequired: true,
      error: 'Sesión expirada o token de presencia inválido.'
    };
  }

  const authBody = {
    authToken: token,
    advisorEmail: advisorEmail,
    accessKey: accessKey,
    sheetTab: String(b.sheetTab || '').trim(),
    erpStore: String(b.erpStore || '').trim()
  };
  const authCheck = resolveAuthenticatedAdvisor_(null, [], authBody);
  if (authCheck && authCheck.ok && authCheck.advisor) {
    if (!allowGuest && isGuestReadOnlyUser_(authCheck.advisor)) {
      return {
        ok: false,
        forbidden: true,
        error: 'Solo usuarios autorizados pueden consultar el equipo en vivo.'
      };
    }
    let renewedAuthToken = '';
    const tokenNeedsRenewal = !tokenInfo || !tokenInfo.email || (Date.now() - Number(tokenInfo.issuedMs || 0) > 30 * 24 * 3600 * 1000);
    if (tokenNeedsRenewal) {
      try {
        renewedAuthToken = issueInvAuthToken_(
          authCheck.advisor.correo,
          authCheck.advisor.sheetTab || authCheck.advisor.branchKey || 'PTC'
        );
      } catch (eMint) {}
    }
    return {
      ok: true,
      advisor: authCheck.advisor,
      allUsers: authCheck.allUsers || [],
      renewedAuthToken: renewedAuthToken
    };
  }

  if (allowGuest && tokenInfo && tokenInfo.email) {
    const allUsers = readAllBranchUsers_(null, []);
    const matches = allUsers.filter((u) => u.correo === tokenInfo.email);
    if (!matches.length) {
      return {
        ok: false,
        authRequired: true,
        error: 'El correo de la sesión ya no aparece activo en las hojas de usuarios.'
      };
    }
    const chosen =
      matches.find((u) => tabsMatchNormalized_(u.sheetTab, tokenInfo.sheetTab) || tabsMatchNormalized_(u.branchKey, tokenInfo.sheetTab)) ||
      matches.find((u) => !u.isGuest) ||
      matches[0];
    if (!chosen) {
      return {
        ok: false,
        authRequired: true,
        error: 'Sesión expirada o token de presencia inválido.'
      };
    }
    let renewedAuthToken = '';
    if (Date.now() - Number(tokenInfo.issuedMs || 0) > 30 * 24 * 3600 * 1000) {
      try {
        renewedAuthToken = issueInvAuthToken_(chosen.correo, chosen.sheetTab || chosen.branchKey || 'INVITADOS');
      } catch (eMintGuest) {}
    }
    return {
      ok: true,
      advisor: chosen,
      allUsers: allUsers,
      renewedAuthToken: renewedAuthToken
    };
  }

  return {
    ok: false,
    authRequired: true,
    error: (authCheck && authCheck.error) || 'Sesión expirada o token de presencia inválido.'
  };
}

function handleInvPresenceHeartbeat_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return {
      ok: false,
      authRequired: Boolean(!actor || actor.authRequired !== false),
      forbidden: Boolean(actor && actor.forbidden),
      error: (actor && actor.error) || 'Sesión expirada o token de presencia inválido.'
    };
  }
  const vista = sanitizePresenceVista_(b.vista || 'inventario') || 'inventario';
  const now = recordInvPresence_(actor.advisor, vista, true);
  const devStatus = recordUserDeviceSession_(actor.advisor, b, vista, true);
  const res = {
    ok: true,
    serverTimeMs: now,
    sessionRevoked: Boolean(devStatus && devStatus.revoked)
  };
  if (actor.renewedAuthToken) {
    res.renewedAuthToken = actor.renewedAuthToken;
  }
  if (!isGuestReadOnlyUser_(actor.advisor) && actor.advisor.isAdmin) {
    res.adminPermissions = actor.advisor.adminPermissions || defaultAdminPermissionsForEmail_(actor.advisor.correo);
  }
  if (!isGuestReadOnlyUser_(actor.advisor) && actor.advisor.userPermissions && typeof actor.advisor.userPermissions === 'object') {
    res.userPermissions = actor.advisor.userPermissions;
  }
  return res;
}

function handleInvPresenceLogout_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return {
      ok: false,
      authRequired: Boolean(!actor || actor.authRequired !== false),
      error: (actor && actor.error) || 'Sesión expirada o token inválido.'
    };
  }
  recordInvPresence_(actor.advisor, 'logout', false);
  recordUserDeviceSession_(actor.advisor, b, 'logout', false);
  return { ok: true };
}

function handleInvPresenceList_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, false);
  if (!actor || actor.ok === false || !actor.advisor || isGuestReadOnlyUser_(actor.advisor)) {
    const isGuestBlocked = Boolean(actor && (actor.forbidden || (actor.advisor && isGuestReadOnlyUser_(actor.advisor))));
    return {
      ok: false,
      authRequired: !isGuestBlocked,
      forbidden: isGuestBlocked,
      error: (actor && actor.error) || (isGuestBlocked ? 'Solo usuarios autorizados pueden consultar el equipo en vivo.' : 'Sesión expirada o token de presencia inválido.')
    };
  }
  if (!userHasEffectivePerm_(actor.advisor, 'equipoInvitados')) {
    return {
      ok: false,
      authRequired: false,
      forbidden: true,
      error: 'Tu cuenta no tiene habilitado VER_EQUIPO_Y_INVITADOS en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const now = Date.now();
  const allUsers = Array.isArray(actor.allUsers) ? actor.allUsers : [];
  const presenceMap = readInvPresenceMap_();

  const mergedByKey = {};
  const guestByKey = {};

  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    if (!u) continue;
    const key = normalizePresenceKey_(u.correo, u.nombre);
    if (!key) continue;
    if (isGuestReadOnlyUser_(u)) {
      const gEmail = String(u.correo || '').trim().toLowerCase();
      const gName = String(u.nombre || gEmail || 'Invitado').trim();
      const gRole = String(u.puesto || 'INVITADO (SOLO VER)').trim();
      const gDevs = Array.isArray(u.guestDevices) ? u.guestDevices : [];
      const gMax = Math.max(1, Math.min(50, Number(u.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
      if (!guestByKey[key]) {
        guestByKey[key] = {
          nombre: gName,
          correo: gEmail,
          sucursal: 'INVITADOS (SOLO VER)',
          rol: gRole,
          maxPlaces: gMax,
          sheetDevices: gDevs
        };
      }
      continue;
    }
    const uSucursal = String(u.erpStore || u.sheetTab || '').trim();
    const uRol = String(u.puesto || (u.isAdmin ? 'ADMINISTRADOR' : 'ASESOR')).trim();
    const uNombre = String(u.nombre || '').trim();
    const uCorreo = String(u.correo || '').trim().toLowerCase();

    if (!mergedByKey[key]) {
      mergedByKey[key] = {
        nombre: uNombre,
        correo: uCorreo,
        sucursal: uSucursal,
        rol: uRol,
        isAdmin: !!u.isAdmin
      };
    } else {
      if (!mergedByKey[key].nombre && uNombre) mergedByKey[key].nombre = uNombre;
      if (u.isAdmin && !mergedByKey[key].isAdmin) {
        mergedByKey[key].isAdmin = true;
        if (uRol) mergedByKey[key].rol = uRol;
      } else if (!mergedByKey[key].rol && uRol) {
        mergedByKey[key].rol = uRol;
      }
      if (!mergedByKey[key].sucursal && uSucursal) {
        mergedByKey[key].sucursal = uSucursal;
      }
    }
  }

  const masterKevinKey = normalizePresenceKey_('kevin.reyna@grupoanipa.com', 'Kevin Reyna');
  if (masterKevinKey && !mergedByKey[masterKevinKey]) {
    mergedByKey[masterKevinKey] = {
      nombre: 'Kevin Reyna',
      correo: 'kevin.reyna@grupoanipa.com',
      sucursal: 'CEDIS',
      rol: 'ADMINISTRADOR',
      isAdmin: true
    };
  }

  const presenceKeys = Object.keys(presenceMap);
  for (let i = 0; i < presenceKeys.length; i++) {
    const pKey = presenceKeys[i];
    if (!pKey || mergedByKey[pKey]) continue;
    const pEntry = presenceMap[pKey];
    if (!pEntry) continue;
    const pRolNorm = String(pEntry.rol || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const pSucNorm = String(pEntry.sucursal || '').trim().toUpperCase();
    const isGuestEntry = Boolean(
      guestByKey[pKey] ||
      /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pRolNorm) ||
      /^INVITADOS?$|^SOLO LECTURA$/.test(pSucNorm)
    );
    if (isGuestEntry) {
      if (!guestByKey[pKey]) {
        guestByKey[pKey] = {
          nombre: String(pEntry.nombre || pEntry.correo || 'Invitado').trim(),
          correo: String(pEntry.correo || '').trim().toLowerCase(),
          sucursal: 'INVITADOS (SOLO VER)',
          rol: String(pEntry.rol || 'INVITADO (SOLO VER)').trim(),
          maxPlaces: MAX_GUEST_PLACES_PER_EMAIL_,
          sheetDevices: []
        };
      }
      continue;
    }
    mergedByKey[pKey] = {
      nombre: String(pEntry.nombre || pEntry.correo || '').trim(),
      correo: String(pEntry.correo || '').trim().toLowerCase(),
      sucursal: String(pEntry.sucursal || '').trim(),
      rol: String(pEntry.rol || 'ASESOR').trim(),
      isAdmin: /ADMINISTRADOR/i.test(String(pEntry.rol || ''))
    };
  }

  const users = [];
  const dirKeys = Object.keys(mergedByKey);
  for (let i = 0; i < dirKeys.length; i++) {
    const k = dirKeys[i];
    const base = mergedByKey[k];
    const entry = presenceMap[k] || null;
    const lastSeenMs = entry && Number(entry.lastSeenMs) > 0 ? Number(entry.lastSeenMs) : 0;
    const online = Boolean(
      entry &&
      entry.online !== false &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
    );
    const vista = entry ? sanitizePresenceVista_(entry.vista) : '';
    const sucursal = String((online && entry && entry.sucursal) || base.sucursal || (entry && entry.sucursal) || '').trim();
    const rol = String(base.rol || (entry && entry.rol) || 'ASESOR').trim();
    const nombre = String(base.nombre || (entry && entry.nombre) || base.correo || '').trim();
    const correo = String(base.correo || (entry && entry.correo) || '').trim().toLowerCase();

    users.push({
      nombre: nombre,
      correo: correo,
      sucursal: sucursal,
      rol: rol,
      vista: vista,
      online: online,
      lastSeenMs: lastSeenMs
    });
  }

  users.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if ((b.lastSeenMs || 0) !== (a.lastSeenMs || 0)) return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });

  let onlineCount = 0;
  for (let i = 0; i < users.length; i++) {
    if (users[i].online) onlineCount++;
  }
  const offlineCount = users.length - onlineCount;

  // Invitados conectados en vivo (hoja INVITADOS + presenceMap + dispositivos por usuario)
  const guests = [];
  const guestKeyList = Object.keys(guestByKey);
  for (let i = 0; i < guestKeyList.length; i++) {
    const gk = guestKeyList[i];
    const base = guestByKey[gk];
    const entry = presenceMap[gk] || null;
    let lastSeenMs = entry && Number(entry.lastSeenMs) > 0 ? Number(entry.lastSeenMs) : 0;
    let online = Boolean(
      entry &&
      entry.online !== false &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_
    );
    let vista = entry ? sanitizePresenceVista_(entry.vista) : '';
    let activeDeviceLabel = '';
    const activeDevices = [];

    if (base.correo) {
      try {
        const devMap = readUserDevicesMap_(base.correo);
        const devIds = Object.keys(devMap);
        for (let d = 0; d < devIds.length; d++) {
          const rec = devMap[devIds[d]];
          if (!rec || Number(rec.revokedAt || 0) > 0) continue;
          const dSeen = Number(rec.lastSeenMs || 0);
          const dOnline = Boolean(rec.online !== false && dSeen > 0 && (now - dSeen) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_);
          if (dSeen > lastSeenMs) {
            lastSeenMs = dSeen;
            if (rec.vista) vista = sanitizePresenceVista_(rec.vista);
          }
          if (dOnline) {
            online = true;
            if (!activeDeviceLabel && rec.deviceLabel) activeDeviceLabel = String(rec.deviceLabel);
          }
          activeDevices.push({
            deviceId: rec.deviceId,
            deviceLabel: String(rec.deviceLabel || 'Dispositivo'),
            online: dOnline,
            lastSeenMs: dSeen
          });
        }
      } catch (eGDev) {}
    }

    if (!activeDeviceLabel && Array.isArray(base.sheetDevices) && base.sheetDevices.length) {
      const lastSheetDev = base.sheetDevices[base.sheetDevices.length - 1];
      if (lastSheetDev && lastSheetDev.label) activeDeviceLabel = String(lastSheetDev.label);
    }

    const activePlaces = Math.max(
      Array.isArray(base.sheetDevices) ? base.sheetDevices.length : 0,
      activeDevices.filter((x) => x.online).length
    );

    guests.push({
      nombre: base.nombre,
      correo: base.correo,
      sucursal: 'INVITADOS (SOLO VER)',
      rol: base.rol || 'INVITADO (SOLO VER)',
      vista: vista || (online ? 'inventario' : ''),
      online: online,
      lastSeenMs: lastSeenMs,
      isGuest: true,
      deviceLabel: activeDeviceLabel,
      activePlaces: activePlaces,
      maxPlaces: base.maxPlaces || MAX_GUEST_PLACES_PER_EMAIL_,
      slotLabel: activePlaces + ' / ' + (base.maxPlaces || MAX_GUEST_PLACES_PER_EMAIL_),
      activeDevices: activeDevices
    });
  }

  guests.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if ((b.lastSeenMs || 0) !== (a.lastSeenMs || 0)) return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });

  let guestOnlineCount = 0;
  for (let i = 0; i < guests.length; i++) {
    if (guests[i].online) guestOnlineCount++;
  }
  const guestOfflineCount = guests.length - guestOnlineCount;

  const listRes = {
    ok: true,
    serverTimeMs: now,
    thresholdMs: INV_PRESENCE_ONLINE_THRESHOLD_MS_,
    onlineCount: onlineCount,
    offlineCount: offlineCount,
    users: users,
    guests: guests,
    guestOnlineCount: guestOnlineCount,
    guestOfflineCount: guestOfflineCount,
    guestTotalCount: guests.length
  };
  if (actor.renewedAuthToken) {
    listRes.renewedAuthToken = actor.renewedAuthToken;
  }
  return listRes;
}

// ============================================================================
// CONFIGURACIÓN DE USUARIO — SESIONES ABIERTAS POR DISPOSITIVO + OVERRIDES SKU
// ============================================================================
const INV_USER_DEVICES_PREFIX_ = 'INV_UDEV_V1_';
const INV_PRODUCT_OVERRIDES_TAB_ = '_INV_PRODUCT_OVERRIDES';
const INV_PRODUCT_OVERRIDES_CACHE_KEY_ = 'INV_PROD_OVERRIDES_V1';

function getUserDevicesStoreKey_(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase().replace(/,/g, '.');
  return makeShortCacheKey_(INV_USER_DEVICES_PREFIX_, email || 'anon');
}

function readUserDevicesMap_(emailRaw) {
  const storeKey = getUserDevicesStoreKey_(emailRaw);
  let raw = '';
  try {
    raw = CacheService.getScriptCache().get(storeKey) || '';
  } catch (eC) {}
  if (!raw) {
    try {
      raw = PropertiesService.getScriptProperties().getProperty(storeKey) || '';
    } catch (eP) {}
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeUserDevicesMap_(emailRaw, mapObj) {
  const storeKey = getUserDevicesStoreKey_(emailRaw);
  const clean = {};
  const now = Date.now();
  const maxAgeMs = 30 * 24 * 3600 * 1000;
  const entries = Object.keys(mapObj || {}).map((k) => mapObj[k]).filter((e) => {
    if (!e || !e.deviceId) return false;
    const ts = Number(e.lastSeenMs || e.revokedAt || 0);
    return !ts || (now - ts) <= maxAgeMs;
  });
  entries.sort((a, b) => Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0));
  const capped = entries.slice(0, 12);
  for (let i = 0; i < capped.length; i++) {
    clean[capped[i].deviceId] = capped[i];
  }
  const json = JSON.stringify(clean);
  try {
    CacheService.getScriptCache().put(storeKey, json, INV_PRESENCE_CACHE_TTL_SEC_);
  } catch (eC) {}
  try {
    PropertiesService.getScriptProperties().setProperty(storeKey, json);
  } catch (eP) {}
  return clean;
}

function recordUserDeviceSession_(advisor, body, vista, onlineFlag, opts) {
  if (!advisor || !advisor.correo) return { revoked: false };
  const email = String(advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const devId = String((body && body.deviceId) || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  if (!email || !devId) return { revoked: false };
  const devLabel = String((body && body.deviceLabel) || 'Dispositivo').trim().slice(0, 80);
  const sucursal = String((body && (body.erpStore || body.branchLabel || body.sheetTab)) || advisor.erpStore || advisor.sheetTab || '').trim().slice(0, 60);
  const sessionStartedMs = Number((body && body.sessionStartedMs) || 0);
  const clearRevoked = Boolean(opts && opts.clearRevoked);
  const now = Date.now();

  let lock = null;
  let locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = !!lock.tryLock(1500);
  } catch (eL) {}

  try {
    const map = readUserDevicesMap_(email);
    const existing = map[devId] || null;
    if (!clearRevoked && onlineFlag && existing && Number(existing.revokedAt || 0) > 0) {
      return { revoked: true };
    }
    map[devId] = {
      deviceId: devId,
      deviceLabel: devLabel || (existing && existing.deviceLabel) || 'Navegador',
      sucursal: sucursal,
      vista: sanitizePresenceVista_(vista || 'inventario'),
      lastSeenMs: now,
      online: Boolean(onlineFlag),
      revokedAt: onlineFlag ? 0 : (existing ? Number(existing.revokedAt || 0) : 0)
    };
    writeUserDevicesMap_(email, map);
    return { revoked: false };
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eR) {}
    }
  }
}

function handleInvMySessions_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return { ok: false };
  }
  const isGuestActor = isGuestReadOnlyUser_(actor.advisor);
  const email = String(actor.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const currentDevId = String(b.deviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const now = Date.now();
  if (currentDevId) {
    const recBody = isGuestActor
      ? Object.assign({}, b, { erpStore: 'INVITADOS (SOLO VER)' })
      : b;
    recordUserDeviceSession_(actor.advisor, recBody, b.vista || 'configuracion', true);
  }
  const map = readUserDevicesMap_(email);
  const mergedById = {};
  const mapKeys = Object.keys(map);
  for (let i = 0; i < mapKeys.length; i++) {
    const k = mapKeys[i];
    const e = map[k];
    if (!e || !e.deviceId) continue;
    const lastSeenMs = Number(e.lastSeenMs || 0);
    const revokedAt = Number(e.revokedAt || 0);
    const active = Boolean(
      e.online !== false &&
      revokedAt === 0 &&
      lastSeenMs > 0 &&
      (now - lastSeenMs) <= (24 * 3600 * 1000)
    );
    const onlineNow = Boolean(active && (now - lastSeenMs) <= INV_PRESENCE_ONLINE_THRESHOLD_MS_);
    mergedById[e.deviceId] = {
      deviceId: e.deviceId,
      deviceLabel: String(e.deviceLabel || 'Dispositivo'),
      sucursal: String(e.sucursal || (isGuestActor ? 'INVITADOS (SOLO VER)' : '')),
      vista: String(e.vista || ''),
      lastSeenMs: lastSeenMs,
      online: onlineNow,
      active: active,
      revoked: revokedAt > 0,
      isCurrent: Boolean(currentDevId && e.deviceId === currentDevId)
    };
  }

  let guestMeta = null;
  if (isGuestActor) {
    try {
      const snap = readGuestDevicesSnapshot_(getSpreadsheet_(), actor.advisor);
      let slotNum = 1;
      for (let i = 0; i < snap.devices.length; i++) {
        const d = snap.devices[i];
        if (!d || !d.id) continue;
        const dId = String(d.id).trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
        if (!dId) continue;
        if (currentDevId && dId === currentDevId) slotNum = i + 1;
        if (!mergedById[dId]) {
          mergedById[dId] = {
            deviceId: dId,
            deviceLabel: String(d.label || 'Dispositivo autorizado'),
            sucursal: 'INVITADOS (SOLO VER)',
            vista: 'inventario',
            lastSeenMs: now,
            online: true,
            active: true,
            revoked: false,
            isCurrent: Boolean(currentDevId && dId === currentDevId)
          };
        } else if (!mergedById[dId].revoked) {
          mergedById[dId].active = true;
          mergedById[dId].online = true;
        }
      }
      guestMeta = {
        activeCount: snap.devices.length,
        maxPlaces: snap.maxAllowedPlaces,
        slotNumber: slotNum
      };
    } catch (eGuestSnap) {}
  }

  const sessions = Object.keys(mergedById).map((k) => mergedById[k]);
  sessions.sort((a, bItem) => {
    if (a.isCurrent !== bItem.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.online !== bItem.online) return a.online ? -1 : 1;
    return Number(bItem.lastSeenMs || 0) - Number(a.lastSeenMs || 0);
  });
  const out = {
    ok: true,
    serverTimeMs: now,
    currentDeviceId: currentDevId,
    sessions: sessions
  };
  if (guestMeta) {
    out.activeCount = guestMeta.activeCount;
    out.maxPlaces = guestMeta.maxPlaces;
    out.slotNumber = guestMeta.slotNumber;
  }
  return out;
}

function handleInvRevokeSession_(body) {
  const b = body || {};
  const actor = resolvePresenceActor_(b, true);
  if (!actor || actor.ok === false || !actor.advisor) {
    return { ok: false };
  }
  const isGuestActor = isGuestReadOnlyUser_(actor.advisor);
  const email = String(actor.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const rawTarget = String(b.targetDeviceId || '').trim();
  const targetDeviceId = rawTarget === 'ALL_OTHERS'
    ? 'ALL_OTHERS'
    : rawTarget.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const currentDevId = String(b.deviceId || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  const now = Date.now();

  const lockState = acquireScriptLockSafe_(5000);
  if (!lockState.ok) {
    return { ok: false, retryable: true, error: 'El servidor está ocupado. Intenta cerrar la sesión de nuevo en unos segundos.' };
  }
  const lock = lockState.lock;
  try {
    const map = readUserDevicesMap_(email);
    let revokedCount = 0;
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const id = keys[i];
      if (targetDeviceId === 'ALL_OTHERS') {
        if (currentDevId && id === currentDevId) continue;
        if (Number(map[id].revokedAt || 0) > 0 && map[id].online === false) continue;
        map[id].online = false;
        map[id].revokedAt = now;
        revokedCount++;
      } else if (targetDeviceId && id === targetDeviceId) {
        map[id].online = false;
        map[id].revokedAt = now;
        revokedCount++;
      }
    }

    let guestRevokeRes = null;
    if (isGuestActor) {
      try {
        const ss = getSpreadsheet_();
        guestRevokeRes = revokeGuestDevicesInSheetAndProps_(ss, actor.advisor, targetDeviceId, currentDevId);
        const removedList = (guestRevokeRes && Array.isArray(guestRevokeRes.removedDevices))
          ? guestRevokeRes.removedDevices
          : [];
        for (let r = 0; r < removedList.length; r++) {
          const rem = removedList[r];
          if (!rem || !rem.id) continue;
          if (!map[rem.id]) {
            map[rem.id] = {
              deviceId: rem.id,
              deviceLabel: rem.label || 'Dispositivo',
              sucursal: 'INVITADOS (SOLO VER)',
              vista: 'inventario',
              lastSeenMs: now,
              online: false,
              revokedAt: now
            };
            revokedCount++;
          } else if (Number(map[rem.id].revokedAt || 0) === 0 || map[rem.id].online !== false) {
            map[rem.id].online = false;
            map[rem.id].revokedAt = now;
            revokedCount++;
          }
        }
        if (revokedCount > 0) {
          registrarEventoHistorial_(ss, {
            clasificacion: 'MOVIMIENTO',
            modulo: 'AppsScript · INVITADOS (Sesiones)',
            evento: 'CIERRE REMOTO DE SESIONES (INVITADO)',
            estado: '✅ OK',
            usuario: (actor.advisor.nombre || email) + ' (' + email + ')',
            sucursal: 'INVITADOS (SOLO VER)',
            referencia: targetDeviceId === 'ALL_OTHERS' ? ('Otras sesiones (' + revokedCount + ')') : ('Dispositivo ' + targetDeviceId),
            detalle: 'Se cerraron ' + revokedCount + ' sesión(es) remota(s) y se actualizaron los lugares autorizados en hoja INVITADOS (' +
              guestRevokeRes.activeCount + ' / ' + guestRevokeRes.maxPlaces + ').',
            analisis: 'Dispositivos revocados deberán iniciar sesión nuevamente.'
          });
        }
      } catch (eGuestRev) {}
    }

    writeUserDevicesMap_(email, map);
    const out = { ok: true, revokedCount: revokedCount, serverTimeMs: now };
    if (guestRevokeRes) {
      out.activeCount = guestRevokeRes.activeCount;
      out.maxPlaces = guestRevokeRes.maxPlaces;
      out.slotNumber = guestRevokeRes.slotNumber;
    }
    return out;
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

function sanitizeOverrideTextCell_(raw, maxLen) {
  let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function ensureProductOverridesSheet_(ss) {
  let sh = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
  if (!sh) {
    sh = ss.insertSheet(INV_PRODUCT_OVERRIDES_TAB_);
    sh.getRange(1, 1, 1, 8).setValues([[
      'SKU', 'ESTADO', 'NOMBRE_EDITADO', 'CATEGORIA_EDITADA',
      'PRECIO_EDITADO', 'NOTA', 'ACTUALIZADO_POR', 'FECHA'
    ]]);
    try { sh.hideSheet(); } catch (eHide) {}
  }
  return sh;
}

function readProductOverridesMap_(ss) {
  try {
    const cached = CacheService.getScriptCache().get(INV_PRODUCT_OVERRIDES_CACHE_KEY_);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (eC) {}

  const sh = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (let i = 0; i < vals.length; i++) {
    const sku = String(vals[i][0] || '').trim().toUpperCase();
    if (!sku) continue;
    const status = String(vals[i][1] || 'VISIBLE').trim().toUpperCase();
    const priceRaw = vals[i][4];
    const priceNum = (priceRaw !== '' && priceRaw !== null && priceRaw !== undefined && isFinite(Number(priceRaw)))
      ? Number(priceRaw)
      : null;
    const noteStr = String(vals[i][5] || '').trim();
    if (/^V(?:FAB|COV|WOD):/i.test(sku) && (/^blob:/i.test(noteStr) || /^data:/i.test(noteStr))) continue;
    out[sku] = {
      sku: sku,
      status: (status === 'ARCHIVADO' || status === 'ELIMINADO') ? status : 'VISIBLE',
      name: String(vals[i][2] || '').trim(),
      category: String(vals[i][3] || '').trim(),
      price: priceNum,
      note: noteStr,
      updatedBy: String(vals[i][6] || '').trim(),
      updatedAt: String(vals[i][7] || '').trim()
    };
  }
  try {
    const jsonOut = JSON.stringify(out);
    if (utf8ByteLength_(jsonOut) <= 95000) {
      CacheService.getScriptCache().put(INV_PRODUCT_OVERRIDES_CACHE_KEY_, jsonOut, 300);
    }
  } catch (ePut) {}
  return out;
}

function isFileInAllowedOverrideShareFolder_(file) {
  if (!file) return false;
  if (isFileInForbiddenProjectBFolder_(file)) return false;
  if (isFileInProjectAAllowedFolders_(file)) return true;
  const extraAllowed = {
    '1iSJztVhhrNvopTdX5sDcLSolhSnK_VAy': true, // TELAS ODOO
    '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT': true, // CONFIG.DRIVE_FOLDER_ID
    '1wRhGgjmvRdRG-uVM8WgULScn6hBDmksm': true, // FONDO BLANCO Y SISTEMA
    '1h0EYNwxabLWFeWt_KECi18WMmdDGwSeh': true  // MUEBLES FALTANTES ODOO
  };
  try {
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (pid && extraAllowed[pid]) return true;
    }
  } catch (eOvPar) {}
  return false;
}

function handleInvProductOverridesGet_(body) {
  const ss = getSpreadsheet_();
  const overrides = readProductOverridesMap_(ss);
  return {
    ok: true,
    overrides: overrides,
    count: Object.keys(overrides).length
  };
}

function handleInvProductOverrideSave_(body, optsInternal) {
  const b = body || {};
  const ss = getSpreadsheet_();
  let auth = verifyExclusiveKevinOwner_(ss, b);
  if (!auth.ok) {
    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const advAuth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
    if (advAuth && advAuth.ok && advAuth.advisor && advAuth.advisor.isAdmin && userHasAdminPerm_(advAuth.advisor, 'gestionProductos')) {
      auth = { ok: true, advisor: advAuth.advisor };
    } else {
      return auth;
    }
  } else if (auth.advisor && auth.advisor.adminPermissions && auth.advisor.adminPermissions.gestionProductos === false) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado VER_GESTION_PRODUCTOS en CUENTAS ADMINISTRATIVAS.'
    };
  }

  const sku = String(b.sku || '').trim().toUpperCase();
  if (!sku || sku.length > 80) {
    return { ok: false, error: 'SKU inválido.' };
  }
  const op = String(b.op || 'SAVE').trim().toUpperCase();
  if (op !== 'SAVE' && op !== 'ARCHIVE' && op !== 'RESTORE' && op !== 'DELETE') {
    return { ok: false, error: 'Operación no permitida: ' + op };
  }

  const isVisualOverrideKey = /^V(?:COV|FAB|WOD):/i.test(sku);
  if (isVisualOverrideKey && op !== 'DELETE' && op !== 'ARCHIVE' && b.note !== undefined) {
    const rawNoteCheck = String(b.note || '').trim();
    if (/^blob:/i.test(rawNoteCheck) || /^data:/i.test(rawNoteCheck)) {
      return { ok: false, error: 'No se permiten enlaces temporales (blob:/data:) en fotos de tela, madera o portada.' };
    }
  }

  let lock = null;
  const skipLockInternal = Boolean(optsInternal && optsInternal.skipLock === true);
  if (!skipLockInternal) {
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return { ok: false, retryable: true, error: 'El servidor está ocupado con otro proceso. Intenta guardar de nuevo en unos segundos.' };
    }
    lock = lockState.lock;
  }
  try {
    const sh = ensureProductOverridesSheet_(ss);
    const lastRow = sh.getLastRow();
    let rowIdx = -1;
    let existingRow = null;
    if (lastRow >= 2) {
      const rows = sh.getRange(2, 1, lastRow - 1, 8).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toUpperCase() === sku) {
          rowIdx = i + 2;
          existingRow = rows[i];
          break;
        }
      }
    }

    const prevStatus = existingRow ? String(existingRow[1] || 'VISIBLE').trim().toUpperCase() : 'VISIBLE';
    let nextStatus = prevStatus;
    if (op === 'ARCHIVE') nextStatus = 'ARCHIVADO';
    else if (op === 'DELETE') nextStatus = 'ELIMINADO';
    else if (op === 'RESTORE') nextStatus = 'VISIBLE';
    else if (op === 'SAVE' && (isVisualOverrideKey || (prevStatus !== 'ARCHIVADO' && prevStatus !== 'ELIMINADO'))) nextStatus = 'VISIBLE';

    const nextName = (b.name !== undefined)
      ? sanitizeOverrideTextCell_(b.name, 140)
      : (existingRow ? String(existingRow[2] || '').trim() : '');
    const nextCat = (b.category !== undefined)
      ? sanitizeOverrideTextCell_(b.category, 80)
      : (existingRow ? String(existingRow[3] || '').trim() : '');
    let nextPrice = '';
    if (b.price !== undefined && b.price !== null && String(b.price).trim() !== '') {
      const pNum = Number(String(b.price).replace(/[^0-9.]/g, ''));
      if (isFinite(pNum) && pNum >= 0) nextPrice = pNum;
    } else if (b.price === undefined && existingRow && existingRow[4] !== '') {
      nextPrice = existingRow[4];
    }
    const nextNote = (b.note !== undefined)
      ? sanitizeOverrideTextCell_(b.note, 220)
      : (existingRow ? String(existingRow[5] || '').trim() : '');
    const nowStr = formatCancunNow_();

    // Garantizar permiso público solo para archivos dentro de carpetas permitidas de Proyecto A / TELAS ODOO
    if (nextStatus === 'VISIBLE' && nextNote) {
      try {
        const noteFid = extractDriveFileIdFromCell_(nextNote);
        if (noteFid && typeof DriveApp !== 'undefined' && DriveApp && typeof DriveApp.getFileById === 'function' && !isForbiddenProjectBFolderId_(noteFid)) {
          const drvFile = DriveApp.getFileById(noteFid);
          if (drvFile && isFileInAllowedOverrideShareFolder_(drvFile)) {
            ensurePublicSharingItem_(drvFile);
          }
        }
      } catch (eEnsureVis) {}
    }

    const actorEmail = (auth && auth.advisor && auth.advisor.correo) ? String(auth.advisor.correo) : OWNER_FOTOS_EMAIL_;
    const actorName = (auth && auth.advisor && auth.advisor.nombre) ? String(auth.advisor.nombre) : 'Kevin Reyna';

    const rowValues = [[
      sanitizeOverrideTextCell_(sku, 80),
      nextStatus,
      nextName,
      nextCat,
      nextPrice,
      nextNote,
      actorEmail,
      nowStr
    ]];

    if (rowIdx > 0) {
      sh.getRange(rowIdx, 1, 1, 8).setValues(rowValues);
    } else {
      sh.getRange(Math.max(2, lastRow + 1), 1, 1, 8).setValues(rowValues);
    }
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().remove(INV_PRODUCT_OVERRIDES_CACHE_KEY_); } catch (eClr) {}

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'Configuración · Productos Cotizador',
        evento: 'PRODUCTO ' + op + ' (' + nextStatus + ')',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRADOR',
        referencia: sku,
        detalle: 'Estado: ' + nextStatus + (nextName ? (' · Nombre: ' + nextName) : '') + (nextPrice !== '' ? (' · Precio: $' + nextPrice) : ''),
        analisis: 'Guardado en ' + INV_PRODUCT_OVERRIDES_TAB_ + ' sin alterar fórmulas de INVENTARIO_EN_VIVO ni CATALOGO_PRODUCTOS.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      sku: sku,
      override: {
        sku: sku,
        status: nextStatus,
        name: nextName.replace(/^'/, ''),
        category: nextCat.replace(/^'/, ''),
        price: nextPrice === '' ? null : Number(nextPrice),
        note: nextNote.replace(/^'/, ''),
        updatedBy: actorEmail,
        updatedAt: nowStr
      }
    };
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (eRel) {} }
  }
}
