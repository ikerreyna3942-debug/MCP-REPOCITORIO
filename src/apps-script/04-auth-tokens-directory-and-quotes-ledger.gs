// ----------------------------------------------------------------------------
// FIRMA CRIPTOGRÁFICA DE SESIÓN POR CORREO Y SUCURSAL/PROYECTO
// ----------------------------------------------------------------------------
function getInvAuthSecret_() {
  const props = PropertiesService.getScriptProperties();
  let sec = props.getProperty('INV_AUTH_SECRET');
  if (!sec || sec.length < 24) {
    sec = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('INV_AUTH_SECRET', sec);
  }
  return sec;
}

function bytesToHex_(bytes) {
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function issueInvAuthToken_(email, sheetTab) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanTab = String(sheetTab || '').trim();
  const payload = cleanEmail + '|' + cleanTab + '|' + Date.now();
  const b64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payload, 'text/plain').getBytes()).replace(/=+$/, '');
  const sig = bytesToHex_(Utilities.computeHmacSha256Signature(payload, getInvAuthSecret_()));
  return b64 + '.' + sig;
}

function verifyInvAuthToken_(token) {
  const raw = String(token || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const b64Part = raw.slice(0, dot);
  const sigPart = raw.slice(dot + 1);
  try {
    const padded = b64Part + '==='.slice((b64Part.length + 3) % 4);
    const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
    const expectedSig = bytesToHex_(Utilities.computeHmacSha256Signature(payload, getInvAuthSecret_()));
    if (!constantTimeEquals_(expectedSig, sigPart)) return null;
    const parts = payload.split('|');
    if (parts.length < 3) return null;
    const email = String(parts[0] || '').trim().toLowerCase();
    const sheetTab = String(parts[1] || '').trim();
    const issuedMs = Number(parts[2] || 0);
    if (!email || !sheetTab || !issuedMs) return null;
    // Vigencia de 90 días
    if (Date.now() - issuedMs > 90 * 24 * 3600 * 1000) return null;
    // Revocación inmediata si el usuario cambió contraseña después de emitir este token
    const keyEpoch = getKeyEpochForEmail_(email);
    if (keyEpoch > 0 && issuedMs < keyEpoch) return null;
    return { email: email, sheetTab: sheetTab, issuedMs: issuedMs };
  } catch (e) {
    return null;
  }
}

function extractAuthTokenFromRequest_(e, body) {
  const fromBody = body && (body.authToken || body.token);
  if (fromBody) return String(fromBody).trim();
  const fromParam = e && e.parameter && (e.parameter.authToken || e.parameter.token);
  return fromParam ? String(fromParam).trim() : '';
}

function hasValidAdminPin_(pinRaw) {
  const cfgPin = getProp_('ADMIN_PIN');
  const provided = String(pinRaw || '').trim();
  return !!(cfgPin && provided && constantTimeEquals_(provided, cfgPin));
}

function makeShortCacheKey_(prefix, rawKey) {
  try {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(rawKey || 'anon'));
    return prefix + bytesToHex_(digest).slice(0, 32);
  } catch (e) {
    return prefix + String(rawKey || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  }
}

function checkRateLimitSilent_(bucketKey, maxHits, windowSec) {
  try {
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('rl_', bucketKey);
    const cur = parseInt(cache.get(key) || '0', 10) || 0;
    const next = cur + 1;
    cache.put(key, String(next), Math.max(10, Number(windowSec) || 60));
    return next <= (Number(maxHits) || 30);
  } catch (e) {
    return true;
  }
}

function checkLoginThrottle_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return true;
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('lf_', clean);
    const fails = parseInt(cache.get(key) || '0', 10) || 0;
    return fails < 8;
  } catch (e) {
    return true;
  }
}

function recordLoginFailure_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return;
    const cache = CacheService.getScriptCache();
    const key = makeShortCacheKey_('lf_', clean);
    const fails = (parseInt(cache.get(key) || '0', 10) || 0) + 1;
    cache.put(key, String(fails), 600);
  } catch (e) {}
}

function clearLoginFailures_(email) {
  try {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return;
    CacheService.getScriptCache().remove(makeShortCacheKey_('lf_', clean));
  } catch (e) {}
}

function isGuestReadOnlyUser_(u) {
  if (!u) return false;
  const tabNorm = String(u.sheetTab || '').trim().toUpperCase();
  const puestoNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return !!(
    u.isGuest ||
    u.soloLectura ||
    /^INVITADOS?$/.test(tabNorm) ||
    /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(puestoNorm)
  );
}

function lookupTokenUserStatus_(tokenInfo) {
  if (!tokenInfo || !tokenInfo.email) return { exists: false, isGuest: true };
  const cleanEmail = String(tokenInfo.email || '').trim().toLowerCase();
  if (!cleanEmail) return { exists: false, isGuest: true };
  if (ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[cleanEmail]) {
    return { exists: true, isGuest: false };
  }
  const tabNorm = String(tokenInfo.sheetTab || '').trim().toUpperCase();
  try {
    const allUsers = readAllBranchUsers_(null, []);
    if (!Array.isArray(allUsers) || allUsers.length === 0) {
      return { exists: true, isGuest: /^INVITADOS?$/.test(tabNorm) };
    }
    const matches = allUsers.filter((u) => u && u.correo === cleanEmail);
    if (!matches.length) {
      return { exists: false, isGuest: true };
    }
    const exactTabMatches = tabNorm
      ? matches.filter((u) => tabsMatchNormalized_(u.sheetTab, tabNorm) || tabsMatchNormalized_(u.branchKey, tabNorm))
      : [];
    const toCheck = exactTabMatches.length > 0 ? exactTabMatches : matches;
    const isRoGuest = /^INVITADOS?$/.test(tabNorm) || toCheck.every((u) => isGuestReadOnlyUser_(u));
    return { exists: true, isGuest: isRoGuest };
  } catch (eLookup) {
    return { exists: true, isGuest: /^INVITADOS?$/.test(tabNorm) };
  }
}

function isTokenUserReadOnlyGuest_(tokenInfo) {
  if (!tokenInfo || !tokenInfo.email) return true;
  const cleanEmail = String(tokenInfo.email || '').trim().toLowerCase();
  if (!cleanEmail) return true;
  if (ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[cleanEmail]) return false;
  const tabNorm = String(tokenInfo.sheetTab || '').trim().toUpperCase();
  if (/^INVITADOS?$/.test(tabNorm)) return true;

  const status = lookupTokenUserStatus_(tokenInfo);
  if (!status.exists) return true;
  return !!status.isGuest;
}

function authorizePrivateTokenOrPin_(e, body, opts) {
  const cfg = opts || {};
  const rateBucket = String(cfg.rateBucket || 'priv');
  const maxHits = Number(cfg.maxHits) || 45;
  const windowSec = Number(cfg.windowSec) || 60;
  const reqPin = (body && body.pin) || (e && e.parameter && e.parameter.pin) || '';
  const rawDevId = cfg.keyByDevice
    ? String((body && (body.deviceId || body.clientId)) || (e && e.parameter && (e.parameter.deviceId || e.parameter.clientId)) || '').trim().slice(0, 64)
    : '';
  const devSuffix = rawDevId ? (':' + rawDevId) : '';

  if (cfg.allowAdminPin && hasValidAdminPin_(reqPin)) {
    if (!checkRateLimitSilent_(rateBucket + ':pin' + devSuffix, maxHits, windowSec)) {
      return { ok: false, rateLimited: true };
    }
    return { ok: true, viaPin: true, tokenInfo: null };
  }

  const token = extractAuthTokenFromRequest_(e, body);
  const tokenInfo = verifyInvAuthToken_(token);
  if (!tokenInfo || !tokenInfo.email) {
    return { ok: false };
  }

  if (!checkRateLimitSilent_(rateBucket + ':' + tokenInfo.email + devSuffix, maxHits, windowSec)) {
    return { ok: false, rateLimited: true, tokenInfo: tokenInfo };
  }

  const tokenStatus = lookupTokenUserStatus_(tokenInfo);
  if (!tokenStatus.exists) {
    return { ok: false };
  }

  const isGuestTab = /^INVITADOS?$/.test(String(tokenInfo.sheetTab || '').trim().toUpperCase()) || tokenStatus.isGuest;
  if (!cfg.allowGuest && isGuestTab) {
    return { ok: false };
  }

  if (cfg.requireAdmin) {
    if (isGuestTab) return { ok: false };
    const isKnownMaster = !!(ADMIN_MASTER_EMAILS_ && ADMIN_MASTER_EMAILS_[tokenInfo.email]);
    if (!isKnownMaster) {
      try {
        const ssChk = getSpreadsheet_();
        const erpMetaChk = readErpAdvisorsFromPlantilla_(ssChk);
        const authChk = resolveAuthenticatedAdvisor_(ssChk, erpMetaChk.advisors, { authToken: token });
        if (!authChk || !authChk.ok || !authChk.advisor || !authChk.advisor.isAdmin) {
          return { ok: false };
        }
      } catch (eAdm) {
        return { ok: false };
      }
    }
  }

  return { ok: true, viaPin: false, tokenInfo: tokenInfo };
}

function readErpAdvisorsFromPlantilla_(ss) {
  const sh = ss.getSheetByName('plantilla');
  const stores = [];
  const advisors = [];
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 30) {
    return { stores: stores, advisors: advisors };
  }
  const maxR = Math.min(sh.getLastRow(), 250);
  const vals = sh.getRange(2, 27, maxR - 1, 4).getValues(); // AA..AD
  for (let i = 0; i < vals.length; i++) {
    const storeItem = String(vals[i][0] || '').trim();
    if (storeItem && stores.indexOf(storeItem) === -1) stores.push(storeItem);
    const label = String(vals[i][1] || '').trim();
    const branch = String(vals[i][2] || '').trim();
    if (branch && stores.indexOf(branch) === -1) stores.push(branch);
    const rawId = vals[i][3];
    const idStr = (rawId !== '' && rawId !== null && rawId !== undefined ? cleanSheetKeyCell_(rawId) : '') || extractErpIdFromLabel_(label);
    if (label) {
      const namePart = label.split('|')[0].trim();
      advisors.push({
        label: label,
        branch: branch,
        id: idStr,
        name: namePart,
        tokens: normAdvisorTokens_(namePart)
      });
    }
  }
  return { stores: stores, advisors: advisors };
}

function matchBestErpAdvisor_(userName, targetErpStore, erpAdvisors) {
  const uToks = normAdvisorTokens_(userName);
  if (!uToks.length || !erpAdvisors.length) return null;
  const uSet = {};
  uToks.forEach((t) => { uSet[t] = true; });

  let best = null;
  let bestScore = -1;
  for (let i = 0; i < erpAdvisors.length; i++) {
    const a = erpAdvisors[i];
    let overlap = 0;
    for (let j = 0; j < a.tokens.length; j++) {
      if (uSet[a.tokens[j]]) overlap++;
    }
    if (overlap <= 0) continue;
    const sameStore = (a.branch.toUpperCase() === String(targetErpStore || '').toUpperCase()) ? 1 : 0;
    const minTokLen = Math.max(1, Math.min(uToks.length, a.tokens.length));
    const maxTokLen = Math.max(1, Math.max(uToks.length, a.tokens.length));
    const ratio = overlap / minTokLen;
    const exactName = (overlap === uToks.length && overlap === a.tokens.length) ? 1 : 0;
    const fullCoverage = (overlap >= 2 && overlap === minTokLen) ? 1 : 0;
    const score = (exactName * 1000) + (fullCoverage * 300) + (overlap * 100) + (ratio * 50) + ((overlap / maxTokLen) * 20) + (sameStore * 10);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function findUserHeaderRow1Based_(sh) {
  if (!sh || sh.getLastRow() < 1) return -1;
  const checkRows = Math.min(sh.getLastRow(), 4);
  const checkCols = Math.min(sh.getMaxColumns(), 6);
  if (checkCols < 1) return -1;
  const hdrVals = sh.getRange(1, 1, checkRows, checkCols).getDisplayValues();
  for (let r = 0; r < hdrVals.length; r++) {
    const cName = String(hdrVals[r][2] || '').trim();
    const cMail = String(hdrVals[r][4] || '').trim();
    const cColA = String(hdrVals[r][0] || '').trim();
    const cColB = String(hdrVals[r][1] || '').trim();
    if (/^CORREO/i.test(cMail) || /^NOMBRE/i.test(cName) || /^CORREO/i.test(cColA) || /^CORREO/i.test(cColB)) {
      return r + 1;
    }
  }
  return -1;
}

function extractEmailFromGuestRow_(r) {
  if (!Array.isArray(r)) return '';
  const candidates = [r[4], r[0], r[1], r[2], r[3]];
  for (let i = 0; i < candidates.length; i++) {
    const s = String(candidates[i] || '').trim().toLowerCase();
    if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      return s;
    }
  }
  return '';
}

function deriveGuestNameFromRow_(r, correo) {
  const c2 = String((r && r[2]) || '').trim();
  if (c2 && c2.indexOf('@') === -1 && !/^NOMBRE$/i.test(c2)) return c2;
  const c1 = String((r && r[1]) || '').trim();
  if (c1 && c1.indexOf('@') === -1 && !/^(INVITADOS?|SOLO\s*VER|MODALIDAD|SUCURSAL)/i.test(c1)) return c1;
  const prefix = String(correo || '').split('@')[0] || 'Invitado';
  return prefix.replace(/[._-]+/g, ' ').toUpperCase();
}

const INV_BRANCH_USERS_CACHE_KEY_ = 'INV_BRANCH_USERS_CACHE_V1';
const INV_BRANCH_USERS_CACHE_TTL_SEC_ = 300; // 5 minutos

function invalidateBranchUsersCache_() {
  try {
    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      CacheService.getScriptCache().remove(INV_BRANCH_USERS_CACHE_KEY_);
    }
  } catch (e) {}
}

function readAllBranchUsers_(ss, erpAdvisors, opts) {
  const advisorsList = Array.isArray(erpAdvisors) ? erpAdvisors : [];
  const canUseCache = advisorsList.length === 0 && !(opts && opts.bypassCache);

  if (canUseCache) {
    try {
      if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
        const cachedRaw = CacheService.getScriptCache().get(INV_BRANCH_USERS_CACHE_KEY_);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch (eCacheRead) {}
  }

  const targetSs = getAuthSpreadsheet_(ss);
  const list = [];
  const seenEmailTab = {};
  const adminPermsByEmail = {};
  // Leer primero CUENTAS ADMINISTRATIVAS para priorizar la hoja unificada (A:Z) y luego cualquier hoja legada o INVITADOS
  const orderedTabs = INV_USER_TABS_.slice().sort((a, b) => {
    const ra = a.tab === TAB_CUENTAS_ADMIN_ ? 0 : (a.isGuest ? 2 : 1);
    const rb = b.tab === TAB_CUENTAS_ADMIN_ ? 0 : (b.isGuest ? 2 : 1);
    return ra - rb;
  });

  for (let t = 0; t < orderedTabs.length; t++) {
    const cfg = orderedTabs[t];
    let sh = targetSs.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = targetSs.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(targetSs);
    if (!sh) continue;

    const hdrRow = findUserHeaderRow1Based_(sh);
    if (!cfg.isGuest && (hdrRow < 1 || sh.getLastRow() <= hdrRow)) continue;
    if (cfg.isGuest && sh.getLastRow() < 1) continue;

    const actualTabName = sh.getName();
    const startRow = hdrRow >= 1 ? (hdrRow + 1) : 1;
    const numRows = sh.getLastRow() - startRow + 1;
    if (numRows <= 0) continue;

    const isUnifiedTab = (cfg.tab === TAB_CUENTAS_ADMIN_);
    const maxReadCols = isUnifiedTab ? 26 : 10;
    const colsToRead = Math.min(sh.getMaxColumns(), maxReadCols);
    const hdrVals = (isUnifiedTab && hdrRow >= 1)
      ? (sh.getRange(hdrRow, 1, 1, colsToRead).getDisplayValues()[0] || [])
      : [];
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues();

    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      const dr = dispVals[i] || [];
      const correo = cfg.isGuest
        ? extractEmailFromGuestRow_(r)
        : String(r[4] || '').trim().toLowerCase().replace(/,/g, '.');
      if (!correo || correo.indexOf('@') === -1) continue;

      const tempKey = colsToRead >= 6 ? cleanSheetKeyCell_(r[5]) : '';
      const defKey = colsToRead >= 7 ? cleanSheetKeyCell_(r[6]) : '';
      const colB = colsToRead >= 2 ? String(dr[1] || r[1] || '').trim() : '';
      const colH = colsToRead >= 8 ? String(dr[7] || r[7] || '').trim() : '';
      const colI = colsToRead >= 9 ? String(dr[8] !== '' ? dr[8] : (r[8] !== undefined ? r[8] : '')).trim() : '';

      if (cfg.isGuest) {
        const guestNombre = deriveGuestNameFromRow_(r, correo);
        const rawPuesto = String(r[3] || '').trim();
        const guestPuesto = (rawPuesto && rawPuesto.indexOf('@') === -1) ? rawPuesto : 'Invitado (Solo Ver)';
        const guestCols = extractGuestDeviceColsFromRow_(r, dr);
        const parsedDevs = parseGuestDevicesFromText_(guestCols.devicesRaw);
        list.push({
          sheetTab: actualTabName,
          rowNum: startRow + i,
          isAdmin: false,
          isManager: false,
          isGuest: true,
          soloLectura: true,
          noPasswordRequired: !tempKey && !defKey,
          maxDiscountPct: 0,
          branchKey: 'INVITADOS',
          branchLabel: 'Invitados (Solo Ver)',
          erpStore: 'SOLO LECTURA',
          orderPrefix: 'INV',
          quoteType: 'SOLO_VER',
          isProyecto: false,
          serieLabel: 'Modo Invitado · Solo Ver (Máx. ' + guestCols.maxPlaces + (guestCols.maxPlaces === 1 ? ' Dispositivo)' : ' Dispositivos)'),
          nombre: guestNombre,
          puesto: guestPuesto,
          correo: correo,
          tempKey: tempKey,
          defKey: defKey,
          mustChangeKey: !defKey,
          erpAdvisorLabel: '',
          erpAdvisorId: '',
          erpAdvisorBranch: '',
          guestPlacesText: guestCols.placesText,
          guestDevicesRaw: guestCols.devicesRaw,
          guestDevices: parsedDevs,
          guestMaxPlaces: guestCols.maxPlaces
        });
        continue;
      }

      const nombre = String(r[2] || '').trim();
      const puesto = String(r[3] || '').trim();

      let explicitAdvisorLabel = '';
      let explicitAdvisorId = '';
      let explicitDiscountPct = parseDiscountPctCell_(colI);
      if (explicitDiscountPct === null && parseDiscountPctCell_(colH) !== null && !extractErpIdFromLabel_(colH)) {
        explicitDiscountPct = parseDiscountPctCell_(colH);
      } else if (colH) {
        explicitAdvisorId = extractErpIdFromLabel_(colH);
        if (colH.indexOf('|') !== -1 || explicitAdvisorId) {
          explicitAdvisorLabel = colH;
        }
      }

      const isGuestRole = !ADMIN_MASTER_EMAILS_[correo] && isGuestReadOnlyUser_({
        puesto: puesto,
        sheetTab: actualTabName,
        isGuest: false,
        soloLectura: false
      });

      const resolveErpForStore = (storeErpName) => {
        let matched = null;
        if (explicitAdvisorId && advisorsList.length > 0) {
          for (let k = 0; k < advisorsList.length; k++) {
            if (String(advisorsList[k].id) === String(explicitAdvisorId)) {
              matched = advisorsList[k];
              break;
            }
          }
        }
        if (!matched) {
          matched = matchBestErpAdvisor_(nombre, storeErpName, advisorsList);
        }
        return {
          label: (matched && matched.label) || explicitAdvisorLabel || '',
          id: (matched && matched.id) || explicitAdvisorId || '',
          branch: (matched && matched.branch) || ''
        };
      };

      if (isUnifiedTab) {
        const rowPerms = extractAdminPermissionsFromRow_(hdrVals, r, dr, correo);
        const storeInfo = extractAssignedStoresFromRow_(hdrVals, r, dr, colB);
        const isAdminUser = !isGuestRole && isAdministrativeUnifiedRow_(correo, colB, puesto, storeInfo.hasStoreCols);

        if (isAdminUser) {
          adminPermsByEmail[correo] = rowPerms;
          const singleStCfg = storeInfo.stores.length === 1 ? findStoreTabConfig_(storeInfo.stores[0]) : null;
          const defaultAdminErp = singleStCfg ? singleStCfg.erpStore : cfg.erpStore;
          const erpInfo = resolveErpForStore(defaultAdminErp);
          const userErpStore = erpInfo.branch || defaultAdminErp;
          const userPrefix = getStoreFolioPrefix_(userErpStore, singleStCfg ? singleStCfg.orderPrefix : cfg.orderPrefix);
          const dedupKey = correo + '::' + actualTabName.toUpperCase();
          if (!seenEmailTab[dedupKey]) {
            seenEmailTab[dedupKey] = true;
            list.push({
              sheetTab: actualTabName,
              sourceSheetTab: actualTabName,
              rowNum: startRow + i,
              isAdmin: true,
              isGuest: false,
              soloLectura: false,
              maxDiscountPct: explicitDiscountPct,
              branchKey: 'ADMIN',
              branchLabel: cfg.label,
              erpStore: userErpStore,
              orderPrefix: userPrefix,
              quoteType: 'ADMINISTRATIVO',
              isProyecto: false,
              serieLabel: cfg.serieLabel,
              nombre: nombre,
              puesto: puesto,
              correo: correo,
              tempKey: tempKey,
              defKey: defKey,
              mustChangeKey: !defKey && !!tempKey,
              erpAdvisorLabel: erpInfo.label,
              erpAdvisorId: erpInfo.id,
              erpAdvisorBranch: erpInfo.branch,
              adminPermissions: rowPerms,
              userPermissions: rowPerms,
              assignedStores: storeInfo.stores.slice()
            });
          }
          continue;
        }

        // Usuario de tienda / proyectos consolidado en CUENTAS ADMINISTRATIVAS -> expandir columnas V:Z (SI)
        const targetStores = storeInfo.stores.length ? storeInfo.stores : ['PROYECTOS'];
        for (let sIdx = 0; sIdx < targetStores.length; sIdx++) {
          const stCfg = findStoreTabConfig_(targetStores[sIdx]) || findStoreTabConfig_('PROYECTOS');
          if (!stCfg) continue;
          const dedupKey = correo + '::' + stCfg.tab.toUpperCase();
          if (seenEmailTab[dedupKey]) continue;
          seenEmailTab[dedupKey] = true;
          const erpInfo = resolveErpForStore(stCfg.erpStore);
          const userPrefix = getStoreFolioPrefix_(stCfg.erpStore, stCfg.orderPrefix);
          list.push({
            sheetTab: stCfg.tab,
            sourceSheetTab: actualTabName,
            rowNum: startRow + i,
            isAdmin: false,
            isGuest: false,
            soloLectura: isGuestRole,
            maxDiscountPct: isGuestRole ? 0 : explicitDiscountPct,
            branchKey: stCfg.branchKey,
            branchLabel: stCfg.label,
            erpStore: stCfg.erpStore,
            orderPrefix: userPrefix,
            quoteType: stCfg.quoteType,
            isProyecto: !!stCfg.isProyecto,
            serieLabel: stCfg.serieLabel,
            nombre: nombre,
            puesto: puesto,
            correo: correo,
            tempKey: tempKey,
            defKey: defKey,
            mustChangeKey: !defKey && !!tempKey,
            erpAdvisorLabel: erpInfo.label,
            erpAdvisorId: erpInfo.id,
            erpAdvisorBranch: erpInfo.branch,
            adminPermissions: null,
            userPermissions: rowPerms,
            assignedStores: targetStores.slice()
          });
        }
        continue;
      }

      // Compatibilidad con hojas legadas de tienda si aún existieran
      const dedupKey = correo + '::' + actualTabName.toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
      if (seenEmailTab[dedupKey]) continue;
      seenEmailTab[dedupKey] = true;

      const erpInfo = resolveErpForStore(cfg.erpStore);
      const isAdminUser = !isGuestRole && (!!ADMIN_MASTER_EMAILS_[correo] || /ADMINISTRADOR/i.test(puesto));
      const userErpStore = (isAdminUser && erpInfo.branch) ? erpInfo.branch : cfg.erpStore;
      const userPrefix = getStoreFolioPrefix_(userErpStore, cfg.orderPrefix);

      list.push({
        sheetTab: actualTabName,
        sourceSheetTab: actualTabName,
        rowNum: startRow + i,
        isAdmin: isAdminUser,
        isGuest: false,
        soloLectura: isGuestRole,
        maxDiscountPct: isGuestRole ? 0 : explicitDiscountPct,
        branchKey: isAdminUser ? 'ADMIN' : cfg.branchKey,
        branchLabel: cfg.label,
        erpStore: userErpStore,
        orderPrefix: userPrefix,
        quoteType: isAdminUser ? 'ADMINISTRATIVO' : cfg.quoteType,
        isProyecto: !isAdminUser && !!cfg.isProyecto,
        serieLabel: cfg.serieLabel,
        nombre: nombre,
        puesto: puesto,
        correo: correo,
        tempKey: tempKey,
        defKey: defKey,
        mustChangeKey: !defKey && !!tempKey,
        erpAdvisorLabel: erpInfo.label,
        erpAdvisorId: erpInfo.id,
        erpAdvisorBranch: erpInfo.branch,
        adminPermissions: isAdminUser ? defaultAdminPermissionsForEmail_(correo) : null
      });
    }
  }

  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (!u || u.isGuest || !u.correo) continue;
    if (adminPermsByEmail[u.correo]) {
      u.isAdmin = true;
      u.adminPermissions = adminPermsByEmail[u.correo];
    } else if (u.isAdmin && !u.adminPermissions) {
      u.adminPermissions = defaultAdminPermissionsForEmail_(u.correo);
    }
  }

  if (canUseCache) {
    try {
      const json = JSON.stringify(list);
      if (utf8ByteLength_(json) <= 95000 && typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
        CacheService.getScriptCache().put(INV_BRANCH_USERS_CACHE_KEY_, json, INV_BRANCH_USERS_CACHE_TTL_SEC_);
      }
    } catch (eCachePut) {}
  }

  return list;
}

function sanitizeUserForClient_(u, includeSignedToken) {
  const isGuest = isGuestReadOnlyUser_(u) || !!(u && String(u.branchKey || '').trim().toUpperCase() === 'INVITADOS');
  const out = {
    sheetTab: u.sheetTab,
    rowNum: u.rowNum,
    isAdmin: !isGuest && !!u.isAdmin,
    isManager: !isGuest && isManagerUserRole_(u),
    isGuest: isGuest,
    soloLectura: isGuest,
    maxDiscountPct: isGuest ? 0 : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
    branchKey: isGuest ? 'INVITADOS' : u.branchKey,
    branchLabel: u.branchLabel,
    erpStore: isGuest ? 'SOLO LECTURA' : u.erpStore,
    orderPrefix: isGuest ? 'INV' : (u.orderPrefix || 'PTC'),
    quoteType: isGuest ? 'SOLO_VER' : (u.quoteType || 'SUCURSAL'),
    isProyecto: !isGuest && !!u.isProyecto,
    serieLabel: u.serieLabel || '',
    nombre: u.nombre,
    puesto: u.puesto,
    correo: u.correo,
    mustChangeKey: !!u.mustChangeKey,
    erpAdvisorLabel: isGuest ? '' : (u.erpAdvisorLabel || ''),
    erpAdvisorId: isGuest ? '' : (u.erpAdvisorId || ''),
    erpAdvisorBranch: isGuest ? '' : (u.erpAdvisorBranch || '')
  };
  if (isGuest) {
    out.guestSlotNum = u.guestSlotNum || 1;
    out.guestActivePlaces = u.guestActivePlaces || 1;
    out.guestMaxPlaces = Math.max(1, Math.min(50, Number(u.guestMaxPlaces) || MAX_GUEST_PLACES_PER_EMAIL_));
  }
  if (!isGuest && out.isAdmin) {
    out.adminPermissions = u.adminPermissions || defaultAdminPermissionsForEmail_(u.correo);
  }
  if (!isGuest && u.userPermissions && typeof u.userPermissions === 'object') {
    out.userPermissions = u.userPermissions;
  }
  if (!isGuest && Array.isArray(u.assignedStores) && u.assignedStores.length) {
    out.assignedStores = u.assignedStores.slice();
  }
  if (!isGuest && Array.isArray(u.branchAdvisorEmails)) {
    out.branchAdvisorEmails = u.branchAdvisorEmails;
  }
  if (includeSignedToken) {
    out.authToken = issueInvAuthToken_(u.correo, u.sheetTab);
  }
  return out;
}

function handleInvUsersDirectory_() {
  const ss = getSpreadsheet_();
  try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (e) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const users = readAllBranchUsers_(ss, erpMeta.advisors);
  return {
    ok: true,
    stores: erpMeta.stores,
    advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id })),
    users: users.map((u) => sanitizeUserForClient_(u, false))
  };
}

function filterScopedDirectoryUsers_(allUsers, verifiedUser, userMatchesOpt) {
  const list = Array.isArray(allUsers) ? allUsers : [];
  if (!verifiedUser || isGuestReadOnlyUser_(verifiedUser)) return [];
  const cleanSelf = String(verifiedUser.correo || '').trim().toLowerCase();
  const nonGuests = list.filter((u) => u && !isGuestReadOnlyUser_(u));
  if (verifiedUser.isAdmin) {
    return nonGuests.map((u) => sanitizeUserForClient_(u, false));
  }
  if (isManagerUserRole_(verifiedUser)) {
    const allowedStores = {};
    const selfRows = Array.isArray(userMatchesOpt) && userMatchesOpt.length ? userMatchesOpt : [verifiedUser];
    for (let i = 0; i < selfRows.length; i++) {
      const sr = selfRows[i];
      if (!sr || isGuestReadOnlyUser_(sr)) continue;
      const stNorm = normalizeQuoteErpStore_(sr.erpStore, sr.sheetTab);
      if (stNorm) allowedStores[stNorm] = true;
    }
    return nonGuests
      .filter((u) => {
        const em = String(u.correo || '').trim().toLowerCase();
        if (em === cleanSelf) return true;
        if (u.isAdmin) return false;
        const uSt = normalizeQuoteErpStore_(u.erpStore, u.sheetTab);
        return !!(uSt && allowedStores[uSt]);
      })
      .map((u) => sanitizeUserForClient_(u, false));
  }
  return nonGuests
    .filter((u) => String(u.correo || '').trim().toLowerCase() === cleanSelf)
    .map((u) => sanitizeUserForClient_(u, false));
}

function handleInvMyDirectory_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const auth = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, b);
  if (!auth || !auth.ok || !auth.advisor || isGuestReadOnlyUser_(auth.advisor)) {
    return { ok: false, authRequired: true };
  }
  return {
    ok: true,
    users: filterScopedDirectoryUsers_(auth.allUsers, auth.advisor, auth.userMatches)
  };
}

function keysEqualNormalized_(inputVal, storedVal) {
  const a = String(inputVal || '').trim();
  const b = String(storedVal || '').trim();
  if (!a || !b) return false;
  const iterMatch = /^sha256i\$(\d+)\$([a-zA-Z0-9_-]{8,})\$([a-f0-9]{64})$/i.exec(b);
  if (iterMatch) {
    const iters = Math.max(1, Math.min(PASSWORD_HASH_MAX_ITERS_, parseInt(iterMatch[1], 10) || PASSWORD_HASH_DEFAULT_ITERS_));
    const candidateHash = hashUserPassword_(a, iterMatch[2], iters);
    return constantTimeEquals_(candidateHash, b);
  }
  const legacyMatch = /^sha256\$([a-zA-Z0-9_-]{8,})\$([a-f0-9]{64})$/i.exec(b);
  if (legacyMatch) {
    const legacyDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, legacyMatch[1] + ':' + a);
    const candidateLegacy = 'sha256$' + legacyMatch[1] + '$' + bytesToHex_(legacyDigest);
    return constantTimeEquals_(candidateLegacy, b);
  }
  if (constantTimeEquals_(a, b)) return true;
  const aCompact = a.replace(/\s+/g, '');
  const bCompact = b.replace(/\s+/g, '');
  return !!aCompact && constantTimeEquals_(aCompact, bCompact);
}

function tabsMatchNormalized_(tabA, tabB) {
  const a = String(tabA || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
  const b = String(tabB || '').trim().toUpperCase().replace(/COLOSIO/g, 'COLOCIO');
  return !!a && a === b;
}

function handleInvLogin_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const inputKey = String(body.accessKey || '').trim();
  const selectedTab = String(body.sheetTab || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const deviceLabel = String(body.deviceLabel || '').trim();
  if (!email) {
    return { ok: false, error: 'Ingresa tu correo electrónico.' };
  }
  if (!checkLoginThrottle_(email)) {
    return { ok: false };
  }

  ensureLiveErpSyncTrigger_();
  const ss = getSpreadsheet_();
  const authSs = getAuthSpreadsheet_(ss);
  try { ensureInvitadosSheet_(authSs); } catch (eInv) {}
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const allUsers = readAllBranchUsers_(authSs, erpMeta.advisors);
  const emailMatches = allUsers.filter((u) => u.correo === email);
  if (!emailMatches.length) {
    recordLoginFailure_(email);
    return { ok: false, error: 'El correo ingresado no está registrado en ninguna hoja de sucursal ni en INVITADOS.' };
  }

  const keyMatchCache = Object.create(null);
  const matchesInputKey = (storedHash) => {
    const k = String(storedHash || '');
    if (!k) return false;
    if (Object.prototype.hasOwnProperty.call(keyMatchCache, k)) {
      return keyMatchCache[k];
    }
    const matched = keysEqualNormalized_(inputKey, k);
    keyMatchCache[k] = matched;
    return matched;
  };

  const validMatches = emailMatches.filter((u) => {
    if (u.isGuest && u.noPasswordRequired) {
      return true;
    }
    if (!inputKey) return false;
    if (u.defKey) {
      return matchesInputKey(u.defKey);
    }
    if (u.tempKey) {
      return matchesInputKey(u.tempKey);
    }
    return false;
  });

  if (!validMatches.length) {
    if (!inputKey) {
      return { ok: false, error: 'Ingresa tu contraseña para acceder con tu cuenta.' };
    }
    recordLoginFailure_(email);
    registrarEventoHistorial_(ss, {
      clasificacion: 'ALERTA TÉCNICA',
      modulo: 'AppsScript · handleInvLogin_',
      evento: 'INTENTO DE ACCESO CON CONTRASEÑA INCORRECTA',
      estado: '⚠️ RECHAZADO',
      usuario: email,
      sucursal: selectedTab || (emailMatches[0] && emailMatches[0].erpStore) || 'INVENTARIO WEB',
      referencia: 'Autenticación',
      detalle: 'Contraseña ingresada no coincide con la clave activa del usuario (' + email + ').',
      analisis: 'Validación de acceso ejecutada sin alterar la sesión ni las claves almacenadas.'
    });
    return { ok: false, error: 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.' };
  }

  clearLoginFailures_(email);

  // Si el usuario está dado de alta en varias tiendas/bodegas y su contraseña ya fue validada en al menos una de ellas,
  // incluir todas las tiendas/bodegas donde esté registrado su correo para que pueda elegir y cambiar de tienda libremente.
  const hasValidNonGuestMatch = validMatches.some((u) => !isGuestReadOnlyUser_(u));
  const candidateMatches = hasValidNonGuestMatch
    ? emailMatches.filter((u) => !isGuestReadOnlyUser_(u))
    : validMatches;
  const matchedViaDefKey = validMatches.some((u) => !!u.defKey && matchesInputKey(u.defKey));
  const hasAnyDefKeyForEmail = candidateMatches.some((u) => !!u.defKey);

  // Si la cuenta que inicia sesión pertenece a INVITADOS, verificar y registrar el límite de dispositivos configurado en Columna H
  const checkedMatches = [];
  let guestLimitError = null;
  for (let mIdx = 0; mIdx < candidateMatches.length; mIdx++) {
    const cand = candidateMatches[mIdx];
    const isInvitadosTabRow = /^INVITADOS?$/.test(String((cand && cand.sheetTab) || '').trim().toUpperCase());
    if (cand.isGuest && isInvitadosTabRow) {
      const devCheck = checkAndRegisterGuestDevice_(ss, cand, deviceId, deviceLabel);
      if (!devCheck.ok) {
        guestLimitError = devCheck;
        continue;
      }
      cand.guestSlotNum = devCheck.slotNumber;
      cand.guestActivePlaces = devCheck.activeCount;
      cand.guestMaxPlaces = devCheck.maxPlaces;
    }
    checkedMatches.push(cand);
  }

  if (!checkedMatches.length && guestLimitError) {
    return guestLimitError;
  }

  // Emitir tokens firmados para todas las ubicaciones autorizadas de este correo
  const authorizedLocs = checkedMatches.map((u) => {
    const usedTemp = !matchedViaDefKey && !hasAnyDefKeyForEmail && !u.defKey && ((!!u.tempKey && matchesInputKey(u.tempKey)) || (u.isGuest && u.noPasswordRequired));
    const sanitized = sanitizeUserForClient_(u, true);
    sanitized.mustChangeKey = usedTemp;
    if (sanitized.isManager && !sanitized.isAdmin && !sanitized.isGuest) {
      const mgrStoreNorm = normalizeQuoteErpStore_(sanitized.erpStore, sanitized.sheetTab);
      sanitized.branchAdvisorEmails = Object.keys(getAllowedAdvisorEmailsForManager_(allUsers, sanitized, mgrStoreNorm));
    }
    return sanitized;
  });

  const allGuestsOnly = authorizedLocs.every((u) => !!u.isGuest);
  const folioSnap = allGuestsOnly
    ? { maxByPrefix: {}, nextFolioByStore: {}, recentErpQuotes: [] }
    : computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);

  if (authorizedLocs.length > 1 && !selectedTab) {
    try { recordInvPresence_(authorizedLocs[0], 'login', true); } catch (ePres) {}
    return {
      ok: true,
      chooseBranch: true,
      locations: authorizedLocs,
      nextFolioByStore: folioSnap.nextFolioByStore,
      stores: erpMeta.stores,
      advisors: erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id }))
    };
  }

  const chosenOut = selectedTab
    ? (authorizedLocs.find((u) => tabsMatchNormalized_(u.sheetTab, selectedTab) || tabsMatchNormalized_(u.branchKey, selectedTab)) || authorizedLocs[0])
    : authorizedLocs[0];

  const nextOrderCode = chosenOut.isGuest ? '' : peekNextStoreErpFolio_(chosenOut.erpStore, chosenOut.orderPrefix, folioSnap);
  const guestMaxCap = chosenOut.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL_;

  registrarEventoHistorial_(ss, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'AppsScript · handleInvLogin_',
    evento: chosenOut.isGuest ? 'INGRESO DE INVITADO (MODO SOLO VER)' : 'INICIO DE SESIÓN EN INVENTARIO',
    estado: '✅ OK',
    usuario: (chosenOut.nombre || email) + ' (' + email + ')',
    sucursal: chosenOut.isGuest ? 'INVITADOS (SOLO VER)' : (chosenOut.erpStore || chosenOut.sheetTab || ''),
    referencia: chosenOut.isGuest
      ? ('Lugar ' + (chosenOut.guestSlotNum || 1) + ' de ' + guestMaxCap + ' · Solo Ver')
      : ('Serie ' + (chosenOut.orderPrefix || '') + ' · Desc. máx ' + getMaxDiscountPctForUser_(chosenOut) + '%'),
    detalle: chosenOut.isGuest
      ? ('Acceso de invitado en Modo Solo Lectura (' + (deviceLabel || 'Dispositivo') + '). Sin cotizar ni hacer descuentos.')
      : ('Acceso autenticado en ubicación ' + (chosenOut.branchLabel || chosenOut.erpStore) + (authorizedLocs.length > 1 ? (' (' + authorizedLocs.length + ' tiendas asignadas)') : '') + '.'),
    analisis: chosenOut.isGuest
      ? ('Control activo de hoja INVITADOS: solo ver y máximo ' + guestMaxCap + ' dispositivos permitidos (Columna H).')
      : 'Token HMAC emitido correctamente para sesión activa.'
  });

  try { recordInvPresence_(chosenOut, 'login', true); } catch (ePres) {}
  if (deviceId) {
    try {
      recordUserDeviceSession_(chosenOut, {
        deviceId: deviceId,
        deviceLabel: deviceLabel || 'Dispositivo',
        erpStore: chosenOut.isGuest ? 'INVITADOS (SOLO VER)' : (chosenOut.erpStore || chosenOut.sheetTab || ''),
        sheetTab: chosenOut.sheetTab || '',
        sessionStartedMs: Date.now()
      }, 'login', true, { clearRevoked: true });
    } catch (eDevSess) {}
  }

  return {
    ok: true,
    chooseBranch: false,
    user: chosenOut,
    nextOrderCode: nextOrderCode,
    nextFolioByStore: chosenOut.isGuest ? {} : folioSnap.nextFolioByStore,
    allLocationsForEmail: authorizedLocs,
    stores: chosenOut.isGuest ? [] : erpMeta.stores,
    advisors: chosenOut.isGuest ? [] : erpMeta.advisors.map((a) => ({ label: a.label, branch: a.branch, id: a.id }))
  };
}

function handleInvUpdateKey_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const currentKey = String(body.currentKey || '').trim();
  const newKey = String(body.newKey || '').trim();
  const activeTab = String(body.sheetTab || '').trim();
  if (!email || !newKey) {
    return { ok: false, error: 'Datos incompletos para actualizar la contraseña.' };
  }
  if (newKey.length < 8) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }
  if (!checkLoginThrottle_(email)) {
    return { ok: false };
  }

  const ss = getSpreadsheet_();
  const authSs = getAuthSpreadsheet_(ss);
  const tokenCheck = verifyInvAuthToken_(body.authToken);
  const tokenMatchesEmail = !!(tokenCheck && tokenCheck.email === email);
  const matchedTargets = [];
  let anyAuthorized = false;

  for (let t = 0; t < INV_USER_TABS_.length; t++) {
    const cfg = INV_USER_TABS_[t];
    let sh = authSs.getSheetByName(cfg.tab);
    if (!sh && cfg.tab === 'COLOCIO') sh = authSs.getSheetByName('COLOSIO');
    if (!sh && cfg.isGuest) sh = findInvitadosSheet_(authSs);
    if (!sh) continue;
    const hdrRow = findUserHeaderRow1Based_(sh);
    if (hdrRow < 1 || sh.getLastRow() <= hdrRow) continue;
    const startRow = hdrRow + 1;
    const numRows = sh.getLastRow() - hdrRow;
    const isUnified = (cfg.tab === TAB_CUENTAS_ADMIN_);
    const colsToRead = Math.min(sh.getMaxColumns(), isUnified ? 26 : 7);
    const hdrVals = isUnified ? (sh.getRange(hdrRow, 1, 1, colsToRead).getDisplayValues()[0] || []) : [];
    const vals = sh.getRange(startRow, 1, numRows, colsToRead).getValues();
    const dispVals = isUnified ? sh.getRange(startRow, 1, numRows, colsToRead).getDisplayValues() : vals;
    for (let i = 0; i < vals.length; i++) {
      const rowEmail = cfg.isGuest ? extractEmailFromGuestRow_(vals[i]) : String(vals[i][4] || '').trim().toLowerCase().replace(/,/g, '.');
      if (rowEmail !== email) continue;
      const tempKey = cleanSheetKeyCell_(vals[i][5]);
      const defKey = cleanSheetKeyCell_(vals[i][6]);
      if (currentKey && (keysEqualNormalized_(currentKey, tempKey) || keysEqualNormalized_(currentKey, defKey))) {
        anyAuthorized = true;
      } else if (tokenMatchesEmail && !defKey && (!!tempKey || cfg.isGuest)) {
        // Permite completar el cambio obligatorio de contraseña temporal con token HMAC válido incluso si el teléfono recargó la vista
        anyAuthorized = true;
      }
      const extraTabs = [];
      if (isUnified) {
        const colB = String((dispVals[i] && dispVals[i][1]) || vals[i][1] || '').trim();
        const stInfo = extractAssignedStoresFromRow_(hdrVals, vals[i], dispVals[i], colB);
        if (stInfo.stores.length) {
          for (let sIdx = 0; sIdx < stInfo.stores.length; sIdx++) {
            extraTabs.push(stInfo.stores[sIdx]);
          }
        } else {
          extraTabs.push('PROYECTOS');
        }
      }
      matchedTargets.push({ sh: sh, rowNum: startRow + i, tabName: sh.getName(), extraTabs: extraTabs });
    }
  }

  if (!matchedTargets.length || !anyAuthorized) {
    recordLoginFailure_(email);
    return { ok: false, error: 'Contraseña actual incorrecta.' };
  }
  clearLoginFailures_(email);

  const hashEnabled = getProp_('HASH_USER_PASSWORDS') !== '0';
  const storedKeyVal = hashEnabled ? hashUserPassword_(newKey) : newKey;
  bumpKeyEpochForEmail_(email);

  const tokensByTab = {};
  for (let k = 0; k < matchedTargets.length; k++) {
    const tgt = matchedTargets[k];
    // Borrar la contraseña temporal (Columna F = 6) y guardar la nueva definitiva (Columna G = 7)
    tgt.sh.getRange(tgt.rowNum, 6).clearContent();
    tgt.sh.getRange(tgt.rowNum, 7).setNumberFormat('@').setValue(storedKeyVal);
    tokensByTab[tgt.tabName] = issueInvAuthToken_(email, tgt.tabName);
    if (Array.isArray(tgt.extraTabs)) {
      for (let eIdx = 0; eIdx < tgt.extraTabs.length; eIdx++) {
        const stName = tgt.extraTabs[eIdx];
        if (stName && !tokensByTab[stName]) {
          tokensByTab[stName] = issueInvAuthToken_(email, stName);
        }
      }
    }
  }
  if (activeTab && !tokensByTab[activeTab]) {
    tokensByTab[activeTab] = issueInvAuthToken_(email, activeTab);
  }

  SpreadsheetApp.flush();
  const primaryTab = activeTab && tokensByTab[activeTab] ? activeTab : matchedTargets[0].tabName;

  registrarEventoHistorial_(ss, {
    clasificacion: 'MOVIMIENTO',
    modulo: 'AppsScript · handleInvUpdateKey_',
    evento: 'ACTUALIZACIÓN DE CONTRASEÑA PERSONAL',
    estado: '✅ OK',
    usuario: email,
    sucursal: matchedTargets.map((x) => x.tabName).join(', '),
    referencia: 'Clave personal activada',
    detalle: 'Contraseña definitiva guardada en Columna G y clave temporal limpiada en ' + matchedTargets.length + ' hoja(s).',
    analisis: 'Tokens anteriores revocados y nuevos tokens de sesión emitidos.'
  });
  invalidateBranchUsersCache_();

  return {
    ok: true,
    updatedRows: matchedTargets.length,
    authToken: tokensByTab[primaryTab] || issueInvAuthToken_(email, primaryTab),
    tokensByTab: tokensByTab
  };
}

/**
 * Verifica que quien cotiza sea EXCLUSIVAMENTE el titular autenticado del correo y de cualquiera de sus ubicaciones asignadas.
 */
function resolveAuthenticatedAdvisor_(ss, erpAdvisors, body) {
  const allUsers = readAllBranchUsers_(ss, erpAdvisors);
  const verifiedToken = verifyInvAuthToken_(body && body.authToken);
  const reqTab = String((body && body.sheetTab) || '').trim();
  const reqStore = String((body && body.erpStore) || '').trim();

  let targetEmail = '';
  let tokenTab = '';

  if (verifiedToken && verifiedToken.email) {
    targetEmail = verifiedToken.email;
    tokenTab = verifiedToken.sheetTab;
  } else {
    const reqEmail = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
    const reqKey = String((body && body.accessKey) || '').trim();
    if (reqEmail) {
      const matchByKey = allUsers.find((u) => {
        if (u.correo !== reqEmail) return false;
        if (u.isGuest && !u.defKey && !u.tempKey) return true;
        if (!reqKey) return false;
        if (u.defKey) return keysEqualNormalized_(reqKey, u.defKey);
        if (u.tempKey) return keysEqualNormalized_(reqKey, u.tempKey);
        return false;
      });
      if (matchByKey) {
        targetEmail = matchByKey.correo;
        tokenTab = reqTab || matchByKey.sheetTab;
      }
    }
  }

  if (!targetEmail) {
    return {
      ok: false,
      authRequired: true,
      error: 'Por seguridad, vuelve a confirmar tu correo y contraseña personal para emitir cotizaciones con tu usuario exclusivo.'
    };
  }

  const userMatches = allUsers.filter((u) => u.correo === targetEmail);
  if (!userMatches.length) {
    return {
      ok: false,
      authRequired: true,
      error: 'El correo de la sesión ya no aparece activo en las hojas de usuarios.'
    };
  }

  // Si el usuario está asignado a varias tiendas/bodegas, permitirle cotizar en cualquiera de las hojas donde esté su correo
  let chosen = null;
  if (reqTab) {
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u) && (tabsMatchNormalized_(u.sheetTab, reqTab) || tabsMatchNormalized_(u.branchKey, reqTab))) || null;
  }
  if (!chosen && reqStore) {
    const reqStoreNorm = normalizeQuoteErpStore_(reqStore, reqTab);
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u) && normalizeQuoteErpStore_(u.erpStore, u.sheetTab) === reqStoreNorm) || null;
  }
  if (!chosen && tokenTab) {
    chosen = userMatches.find((u) => tabsMatchNormalized_(u.sheetTab, tokenTab) || tabsMatchNormalized_(u.branchKey, tokenTab)) || null;
  }
  if (!chosen) {
    chosen = userMatches.find((u) => !isGuestReadOnlyUser_(u)) || userMatches[0];
  }

  if (!chosen) {
    return {
      ok: false,
      authRequired: true,
      error: 'Tu correo no tiene permisos asignados en la ubicación solicitada.'
    };
  }

  const hasAnyDefKey = userMatches.some((u) => !!u.defKey);
  if (chosen.mustChangeKey && !chosen.noPasswordRequired && !hasAnyDefKey) {
    return {
      ok: false,
      authRequired: true,
      error: 'Debes establecer primero tu contraseña definitiva antes de generar cotizaciones.'
    };
  }

  return { ok: true, advisor: chosen, userMatches: userMatches, allUsers: allUsers };
}

// ----------------------------------------------------------------------------
// BITÁCORA Y FOLIOS OFICIALES POR TIENDA / BODEGA EN S MUEBLERÍA
// ----------------------------------------------------------------------------
function ensureQuotesLedgerSheet_(ss) {
  let sh = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const headers = [
    'ORDEN_SUCURSAL',
    'FOLIO_SMUEBLERIA',
    'ID_COTIZACION_ERP',
    'FECHA_HORA',
    'MODALIDAD_ORIGEN',
    'HOJA_UBICACION',
    'TIENDA_ERP',
    'CORREO_ASESOR',
    'NOMBRE_ASESOR',
    'USUARIO_ERP',
    'ID_USUARIO_ERP',
    'CLIENTE_PROYECTO',
    'TELEFONO',
    'MODALIDAD_CLIENTE',
    'CATEGORIA_ERP',
    'ENTREGA_TENTATIVA',
    'PARTIDAS_CANT',
    'RESUMEN_SKUS',
    'SUBTOTAL_SIN_IVA',
    'IVA',
    'DESCUENTO_EXTRA',
    'TOTAL_CON_IVA',
    'ESTADO_ERP',
    'NOTAS',
    'ORIGEN_CREACION'
  ];

  if (!sh) {
    sh = ss.insertSheet(TAB_QUOTES_LIVE_, ss.getSheets().length);
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(1, 1, 1, 3).setBackground('#A38251');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() < 1) {
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
  } else {
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    if (!String(sh.getRange(1, 25).getDisplayValue() || '').trim()) {
      sh.getRange(1, 25)
        .setValue('ORIGEN_CREACION')
        .setBackground('#252C32')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
    }
  }
  return sh;
}

/**
 * Descuento máximo permitido:
 * 1) Administradores (Santiago y Kevin): 100%
 * 2) Gerentes / Subgerentes: 100%
 * 3) Asesores: 30% vigente hasta el día 30 de noviembre de 2026 (America/Cancun); 24% automático a partir del 01/12/2026
 * 4) Columna I ("Descuento" junto a Usuario/ID Asesor): porcentaje o fórmula dinámica configurada en la hoja
 */
function isAdvisorPromo30Active_() {
  let ymd = '';
  try {
    ymd = Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd');
  } catch (e) {
    ymd = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT-5', 'yyyy-MM-dd');
  }
  return ymd <= ADVISOR_PROMO_END_YMD_;
}

function getMaxDiscountPctForPuesto_(puesto) {
  const p = String(puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(p)) return 0;
  if (/ADMINISTRADOR|GERENTE|\bSUB/.test(p)) return 100;
  return isAdvisorPromo30Active_() ? 30 : 24;
}

function getMaxDiscountPctForUser_(u) {
  const promoActive = isAdvisorPromo30Active_();
  const defaultAdvPct = promoActive ? 30 : 24;
  if (!u) return defaultAdvPct;
  if (u.isGuest || u.soloLectura || String(u.sheetTab || '').toUpperCase() === 'INVITADOS') return 0;
  if (u.isAdmin) return 100;
  const p = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(p)) return 0;
  const isMgr = /ADMINISTRADOR|GERENTE|\bSUB/.test(p);
  if (u.maxDiscountPct !== null && u.maxDiscountPct !== undefined && isFinite(Number(u.maxDiscountPct))) {
    const rawPct = Math.max(0, Math.min(100, Number(u.maxDiscountPct)));
    if (!isMgr) {
      if (promoActive && rawPct === 24) return 30;
      if (!promoActive && rawPct === 30) return 24;
    }
    return rawPct;
  }
  return isMgr ? 100 : defaultAdvPct;
}

function invalidateErpFoliosCache_() {
  try {
    CacheService.getScriptCache().remove('inv_erp_folios_v1');
  } catch (e) {}
}

function observeFolioString_(rawFolio, maxByPrefix) {
  const s = String(rawFolio || '').trim().toUpperCase();
  if (!s || /^[A-Z]+-\d+$/.test(s)) return null;
  const m = s.match(/^([A-Z]{2,5})\s*(\d{2,8})$/);
  if (!m) return null;
  const pfx = m[1];
  const num = parseInt(m[2], 10);
  if (!num || num <= 0) return null;
  if (!maxByPrefix[pfx] || num > maxByPrefix[pfx]) {
    maxByPrefix[pfx] = num;
  }
  return { pfx: pfx, num: num, clean: pfx + String(num) };
}

/**
 * Consulta en vivo los folios oficiales de S Mueblería según tienda/bodega (PL, DTC, OUT, PTC, CCB, PRO, CED, ADM)
 * directamente desde ObtenerCotizacionesTodas + bitácora COTIZACIONES_EN_VIVO, con caché corto de 45s.
 */
function computeLiveErpFoliosAndQuotes_(ss, erpAdvisors) {
  const maxByPrefix = {};
  let recentErpQuotes = [];
  let loadedFromCache = false;

  try {
    const cachedRaw = CacheService.getScriptCache().get('inv_erp_folios_v1');
    if (cachedRaw) {
      const parsedCache = JSON.parse(cachedRaw);
      if (parsedCache && parsedCache.maxByPrefix) {
        Object.keys(parsedCache.maxByPrefix).forEach((k) => {
          maxByPrefix[k] = Number(parsedCache.maxByPrefix[k]) || 0;
        });
        if (Array.isArray(parsedCache.recentErpQuotes)) {
          recentErpQuotes = parsedCache.recentErpQuotes;
        }
        loadedFromCache = true;
      }
    }
  } catch (ce) {}

  if (!loadedFromCache) {
    const advById = {};
    if (Array.isArray(erpAdvisors)) {
      for (let i = 0; i < erpAdvisors.length; i++) {
        const a = erpAdvisors[i];
        if (a && a.id) advById[String(a.id)] = a;
      }
    }

    try {
      const cfg = getErpRuntimeConfig_();
      const xmlCot = callSmuebleriaWcf_(
        'ObtenerCotizacionesTodas',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
      );
      if (xmlCot) {
        const idMatches = [];
        const idScanRe = /<(?:[a-zA-Z0-9_]+:)?IdVenta>(\d+)<\/(?:[a-zA-Z0-9_]+:)?IdVenta>/g;
        let im;
        while ((im = idScanRe.exec(xmlCot)) !== null) {
          idMatches.push({ index: im.index, endIndex: im.index + im[0].length, idStr: im[1] });
        }

        const rawErpItems = [];
        const boundaryRe = /<\/([a-zA-Z0-9_:]+)>\s*<\1[\s>]/g;
        for (let idx = 0; idx < idMatches.length; idx++) {
          const cur = idMatches[idx];
          const prevEnd = idx > 0 ? idMatches[idx - 1].endIndex : Math.max(0, cur.index - 3500);
          const nextStart = idx + 1 < idMatches.length ? idMatches[idx + 1].index : Math.min(xmlCot.length, cur.endIndex + 3500);

          const beforeSeg = xmlCot.slice(Math.max(prevEnd, cur.index - 3500), cur.index);
          boundaryRe.lastIndex = 0;
          let bMatch;
          let startOffsetInBefore = 0;
          while ((bMatch = boundaryRe.exec(beforeSeg)) !== null) {
            startOffsetInBefore = bMatch.index + bMatch[0].indexOf('<', 2);
          }

          const afterSeg = xmlCot.slice(cur.index, Math.min(nextStart, cur.endIndex + 3500));
          boundaryRe.lastIndex = 0;
          const afterBound = boundaryRe.exec(afterSeg);
          const recordAfter = afterBound
            ? afterSeg.slice(0, afterBound.index + afterBound[0].indexOf('>') + 1)
            : afterSeg;

          const blk = beforeSeg.slice(startOffsetInBefore) + recordAfter;
          const folioStr = extractXmlTag_(blk, 'Folio');
          if (!folioStr) continue;
          const obs = observeFolioString_(folioStr, maxByPrefix);
          const idVentaNum = parseInt(cur.idStr, 10) || 0;
          if (idVentaNum > 0 && obs) {
            const idUsu = extractXmlTag_(blk, 'IdUsuario');
            const advInfo = idUsu && advById[idUsu] ? advById[idUsu] : null;
            const storeFromAdv = (advInfo && advInfo.branch) || ERP_PREFIX_TO_STORE_[obs.pfx] || obs.pfx;
            const totalNum = parseFloat(extractXmlTag_(blk, 'Total') || '0') || 0;
            const fechaRaw = extractXmlTag_(blk, 'FechaVenta') || extractXmlTag_(blk, 'Fecha') || extractXmlTag_(blk, 'FechaCreacion');
            rawErpItems.push({
              idNum: idVentaNum,
              orderCode: obs.clean,
              folio: obs.clean,
              quoteId: String(idVentaNum),
              createdAt: fechaRaw ? fechaRaw.replace('T', ' ').slice(0, 16) : '',
              quoteType: /PROYECTO/i.test(storeFromAdv) ? 'PROYECTO' : 'SUCURSAL',
              branchTab: storeFromAdv,
              erpStore: storeFromAdv,
              advisorName: (advInfo && advInfo.name) || extractXmlTag_(blk, 'Vendedor') || extractXmlTag_(blk, 'Usuario') || '',
              erpAdvisor: (advInfo && advInfo.label) || '',
              erpUserId: idUsu || '',
              clientName: extractXmlTag_(blk, 'Nombre') || extractXmlTag_(blk, 'Cliente') || 'Prospecto CREATA',
              itemsCount: '',
              skusSummary: '',
              total: totalNum > 0 ? formatMoney_(totalNum) : '',
              status: extractXmlTag_(blk, 'Estatus') || 'EN S MUEBLERÍA'
            });
          }
        }
        rawErpItems.sort((a, b) => b.idNum - a.idNum);
        recentErpQuotes = rawErpItems.slice(0, 40);
      }
    } catch (wcfErr) {
      Logger.log('Aviso al leer folios en vivo desde ObtenerCotizacionesTodas: ' + wcfErr);
    }

    try {
      CacheService.getScriptCache().put('inv_erp_folios_v1', JSON.stringify({
        maxByPrefix: maxByPrefix,
        recentErpQuotes: recentErpQuotes
      }), 45);
    } catch (ceSave) {}
  }

  // Combinar siempre con COTIZACIONES_EN_VIVO por si se acaba de registrar una cotización
  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const qCols = shQuotes.getRange(2, 1, shQuotes.getLastRow() - 1, 2).getDisplayValues();
    for (let i = 0; i < qCols.length; i++) {
      observeFolioString_(qCols[i][1], maxByPrefix);
      observeFolioString_(qCols[i][0], maxByPrefix);
    }
  }

  const nextFolioByStore = {};
  Object.keys(ERP_STORE_FOLIO_SERIES_).forEach((storeName) => {
    const pfx = ERP_STORE_FOLIO_SERIES_[storeName];
    if (maxByPrefix[pfx] && maxByPrefix[pfx] > 0) {
      nextFolioByStore[storeName] = pfx + String(maxByPrefix[pfx] + 1);
    }
  });

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: nextFolioByStore,
    recentErpQuotes: recentErpQuotes
  };
}

function buildNextFolioByStoreMap_(maxByPrefix) {
  const nextFolioByStore = {};
  Object.keys(ERP_STORE_FOLIO_SERIES_).forEach((storeName) => {
    const pfx = ERP_STORE_FOLIO_SERIES_[storeName];
    if (maxByPrefix && maxByPrefix[pfx] && maxByPrefix[pfx] > 0) {
      nextFolioByStore[storeName] = pfx + String(maxByPrefix[pfx] + 1);
    }
  });
  return nextFolioByStore;
}

/**
 * Baseline local rápido de folios: usa caché inv_erp_folios_v1 si está tibia o lee COTIZACIONES_EN_VIVO
 * sin disparar descarga XML completa ObtenerCotizacionesTodas.
 */
function readLocalFoliosBaseline_(ss) {
  const maxByPrefix = {};
  let recentErpQuotes = [];

  try {
    const cachedRaw = CacheService.getScriptCache().get('inv_erp_folios_v1');
    if (cachedRaw) {
      const parsedCache = JSON.parse(cachedRaw);
      if (parsedCache && parsedCache.maxByPrefix) {
        Object.keys(parsedCache.maxByPrefix).forEach((k) => {
          maxByPrefix[k] = Number(parsedCache.maxByPrefix[k]) || 0;
        });
        if (Array.isArray(parsedCache.recentErpQuotes)) {
          recentErpQuotes = parsedCache.recentErpQuotes;
        }
      }
    }
  } catch (ce) {}

  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const qCols = shQuotes.getRange(2, 1, shQuotes.getLastRow() - 1, 2).getDisplayValues();
    for (let i = 0; i < qCols.length; i++) {
      observeFolioString_(qCols[i][1], maxByPrefix);
      observeFolioString_(qCols[i][0], maxByPrefix);
    }
  }

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: buildNextFolioByStoreMap_(maxByPrefix),
    recentErpQuotes: recentErpQuotes
  };
}

/**
 * Actualiza maxByPrefix y la caché inv_erp_folios_v1 localmente en 0 ms tras emitir una cotización,
 * evitando re-descargar ObtenerCotizacionesTodas post-envío.
 */
function updateFoliosCacheLocally_(folioSnap, newFolio) {
  const maxByPrefix = {};
  const srcMax = (folioSnap && folioSnap.maxByPrefix) || {};
  Object.keys(srcMax).forEach((k) => {
    maxByPrefix[k] = Number(srcMax[k]) || 0;
  });
  observeFolioString_(newFolio, maxByPrefix);
  const recentErpQuotes = (folioSnap && Array.isArray(folioSnap.recentErpQuotes)) ? folioSnap.recentErpQuotes : [];
  try {
    CacheService.getScriptCache().put('inv_erp_folios_v1', JSON.stringify({
      maxByPrefix: maxByPrefix,
      recentErpQuotes: recentErpQuotes
    }), 45);
  } catch (cePut) {}

  return {
    maxByPrefix: maxByPrefix,
    nextFolioByStore: buildNextFolioByStoreMap_(maxByPrefix),
    recentErpQuotes: recentErpQuotes
  };
}

function peekNextStoreErpFolio_(erpStore, fallbackPrefix, folioSnap) {
  const storeUp = String(erpStore || '').trim().toUpperCase();
  const pfx = getStoreFolioPrefix_(storeUp, fallbackPrefix);
  if (folioSnap && folioSnap.nextFolioByStore && folioSnap.nextFolioByStore[storeUp]) {
    return folioSnap.nextFolioByStore[storeUp];
  }
  if (folioSnap && folioSnap.maxByPrefix && folioSnap.maxByPrefix[pfx] > 0) {
    return pfx + String(folioSnap.maxByPrefix[pfx] + 1);
  }
  return 'Serie ' + pfx;
}

function isManagerUserRole_(uOrPuesto) {
  if (!uOrPuesto) return false;
  if (typeof uOrPuesto === 'object' && uOrPuesto.isAdmin) return false;
  const rawPuesto = typeof uOrPuesto === 'object' ? (uOrPuesto.puesto || '') : String(uOrPuesto || '');
  const pNorm = normPlainUpper_(rawPuesto);
  return /GERENTE|\bSUB/.test(pNorm);
}

function normalizeQuoteErpStore_(rawStore, rawBranchTab) {
  const candidates = [rawStore, rawBranchTab];
  for (let c = 0; c < candidates.length; c++) {
    const s = normPlainUpper_(candidates[c]);
    if (!s) continue;
    if (ERP_STORE_FOLIO_SERIES_[s]) return s;
    for (let i = 0; i < INV_USER_TABS_.length; i++) {
      const cfg = INV_USER_TABS_[i];
      if (
        normPlainUpper_(cfg.erpStore) === s ||
        normPlainUpper_(cfg.tab) === s ||
        normPlainUpper_(cfg.branchKey) === s ||
        normPlainUpper_(cfg.label) === s
      ) {
        return normPlainUpper_(cfg.erpStore);
      }
    }
    if (s === 'COLOSIO' || s === 'COLOCIO') return 'CREATA LIVING COLOSIO';
    if (s === 'PLAYA') return 'CREATA LIVING PLAYA';
    if (s === 'PTC' || s === 'PUERTO CANCUN') return 'CREATA PUERTO CANCUN';
    if (s === 'CASA CREATA') return 'CASA CREATA BONAMPAK';
    if (s === 'PROYECTOS') return 'PROYECTOS ANIPA INTERIOR';
    return s;
  }
  return '';
}

function getAllowedAdvisorEmailsForManager_(allUsers, managerUser, activeStoreNorm) {
  const allowed = {};
  const mgrEmail = String((managerUser && managerUser.correo) || '').trim().toLowerCase();
  if (mgrEmail) allowed[mgrEmail] = true;
  const storeTarget = activeStoreNorm || normalizeQuoteErpStore_(managerUser && managerUser.erpStore, managerUser && managerUser.sheetTab);
  if (!storeTarget || !Array.isArray(allUsers)) return allowed;

  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    if (!u || !u.correo) continue;
    const em = String(u.correo).trim().toLowerCase();
    if (!em) continue;
    if (em === mgrEmail) {
      allowed[em] = true;
      continue;
    }
    // Regla estricta: el gerente solo ve sus propias cotizaciones y las de los asesores de su bodega/tienda activa
    if (u.isAdmin || ADMIN_MASTER_EMAILS_[em] || isManagerUserRole_(u)) continue;
    const uStoreNorm = normalizeQuoteErpStore_(u.erpStore, u.sheetTab);
    if (uStoreNorm && uStoreNorm === storeTarget) {
      allowed[em] = true;
    }
  }
  return allowed;
}

function hasGeneratedErpQuotePdf_(quoteIdRaw, folioRaw, statusRaw) {
  const qidNum = parseInt(String(quoteIdRaw || '').replace(/[^\d]/g, ''), 10) || 0;
  if (qidNum > 0) return true;
  const fol = String(folioRaw || '').trim().toUpperCase();
  if (!fol || /^[A-Z]+-\d+$/i.test(fol) || /^(EN PROCESO|PENDIENTE)$/i.test(fol)) return false;
  if (/EN COLA|REVISION/i.test(String(statusRaw || ''))) return false;
  return true;
}

function isQuoteRowAllowedForUser_(rowMeta, verifiedUser, allowedManagerEmailsMap, requestedAdminStoreNorm) {
  if (!rowMeta || !verifiedUser) return false;
  if (isGuestReadOnlyUser_(verifiedUser)) return false;
  if (!hasGeneratedErpQuotePdf_(rowMeta.quoteId, rowMeta.folio || rowMeta.orderCode, rowMeta.status)) {
    return false;
  }

  const rowStoreNorm = normalizeQuoteErpStore_(rowMeta.erpStore, rowMeta.branchTab);
  const rowEmail = String(rowMeta.advisorEmail || '').trim().toLowerCase();

  if (verifiedUser.isAdmin) {
    if (requestedAdminStoreNorm && requestedAdminStoreNorm !== 'ALL') {
      return rowStoreNorm === requestedAdminStoreNorm;
    }
    return true;
  }

  const activeStoreNorm = normalizeQuoteErpStore_(verifiedUser.erpStore, verifiedUser.sheetTab);
  if (!activeStoreNorm || rowStoreNorm !== activeStoreNorm) {
    return false;
  }

  if (isManagerUserRole_(verifiedUser)) {
    return !!(rowEmail && allowedManagerEmailsMap && allowedManagerEmailsMap[rowEmail]);
  }

  const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
  return !!(userEmail && rowEmail === userEmail);
}

function readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, allUsersOpt, requestedStore, maxItems) {
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return {
      quotes: [],
      roleScope: 'INVITADO',
      activeStore: 'SOLO LECTURA',
      allowedAdvisorEmails: []
    };
  }
  const isAdmin = !!(verifiedUser && verifiedUser.isAdmin);
  const isManager = !isAdmin && isManagerUserRole_(verifiedUser);
  const roleScope = isAdmin ? 'ADMIN' : (isManager ? 'GERENTE' : 'ASESOR');
  const activeStoreNorm = isAdmin
    ? (requestedStore && String(requestedStore).toUpperCase() !== 'ALL'
        ? normalizeQuoteErpStore_(requestedStore, '')
        : normalizeQuoteErpStore_(verifiedUser && verifiedUser.erpStore, verifiedUser && verifiedUser.sheetTab))
    : normalizeQuoteErpStore_(verifiedUser && verifiedUser.erpStore, verifiedUser && verifiedUser.sheetTab);

  let allowedManagerEmailsMap = {};
  if (isManager) {
    const usersList = Array.isArray(allUsersOpt)
      ? allUsersOpt
      : readAllBranchUsers_(ss || getSpreadsheet_(), []);
    allowedManagerEmailsMap = getAllowedAdvisorEmailsForManager_(usersList, verifiedUser, activeStoreNorm);
  }

  const limit = maxItems || (isAdmin ? 30 : (isManager ? 25 : 15));
  const out = [];
  if (!shQuotes || shQuotes.getLastRow() < 2 || !verifiedUser) {
    return {
      quotes: out,
      roleScope: roleScope,
      activeStore: activeStoreNorm,
      allowedAdvisorEmails: Object.keys(allowedManagerEmailsMap)
    };
  }

  const lastR = shQuotes.getLastRow();
  const startR = Math.max(2, lastR - 400);
  const numCols = Math.min(Math.max(shQuotes.getLastColumn(), 24), 25);
  const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, numCols).getDisplayValues();
  const seenKeys = {};

  for (let i = vals.length - 1; i >= 0 && out.length < limit; i--) {
    const r = vals[i];
    const cleanOrd = r[1] || ((r[0] && !/^[A-Z]+-\d+$/i.test(r[0])) ? r[0] : '');
    const item = {
      orderCode: cleanOrd || r[0] || '',
      folio: r[1] || cleanOrd || '',
      quoteId: r[2] || '',
      createdAt: r[3] || '',
      quoteType: r[4] || '',
      branchTab: r[5] || '',
      erpStore: r[6] || '',
      advisorEmail: String(r[7] || '').trim().toLowerCase(),
      advisorName: r[8] || '',
      erpAdvisor: r[9] || '',
      erpUserId: r[10] || '',
      clientName: r[11] || '',
      itemsCount: r[16] || '',
      skusSummary: r[17] || '',
      total: r[21] || '',
      status: r[22] || '',
      originCreation: String((r && r[24]) || '').trim()
    };

    if (!isQuoteRowAllowedForUser_(item, verifiedUser, allowedManagerEmailsMap, isAdmin ? activeStoreNorm : '')) {
      continue;
    }

    const dedupeKey = (item.quoteId ? ('ID:' + item.quoteId) : '') || (item.folio ? ('F:' + item.folio) : '');
    if (dedupeKey && seenKeys[dedupeKey]) continue;
    if (dedupeKey) seenKeys[dedupeKey] = true;

    out.push(item);
  }

  return {
    quotes: out,
    roleScope: roleScope,
    activeStore: activeStoreNorm,
    allowedAdvisorEmails: Object.keys(allowedManagerEmailsMap)
  };
}

function handleInvMyQuotes_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) return authCheck;

  const u = authCheck.advisor;
  if (isGuestReadOnlyUser_(u)) {
    return {
      ok: true,
      advisor: sanitizeUserForClient_(u, false),
      roleScope: 'INVITADO',
      soloLectura: true,
      activeStore: 'SOLO LECTURA',
      branchAdvisorEmails: [],
      nextOrderCode: '',
      nextFolioByStore: {},
      recentQuotes: []
    };
  }
  if (!userHasEffectivePerm_(u, 'cotizador')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
    };
  }
  const shQuotes = ss.getSheetByName(TAB_QUOTES_LIVE_);
  const folioSnap = computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
  const canSwitchStore = userHasAdminPerm_(u, 'cambiarTienda');
  const targetStore = (canSwitchStore && body && body.erpStore) ? String(body.erpStore).trim() : u.erpStore;
  const nextOrderCode = peekNextStoreErpFolio_(targetStore, u.orderPrefix, folioSnap);
  const allowedSnap = readAllowedGeneratedQuotesForUser_(ss, shQuotes, u, authCheck.allUsers, targetStore);
  const sanitizedAdv = sanitizeUserForClient_(u, false);
  if (allowedSnap.allowedAdvisorEmails.length > 0) {
    sanitizedAdv.branchAdvisorEmails = allowedSnap.allowedAdvisorEmails;
  }

  return {
    ok: true,
    advisor: sanitizedAdv,
    roleScope: allowedSnap.roleScope,
    activeStore: allowedSnap.activeStore,
    branchAdvisorEmails: allowedSnap.allowedAdvisorEmails,
    nextOrderCode: nextOrderCode,
    nextFolioByStore: folioSnap.nextFolioByStore,
    recentQuotes: allowedSnap.quotes
  };
}
