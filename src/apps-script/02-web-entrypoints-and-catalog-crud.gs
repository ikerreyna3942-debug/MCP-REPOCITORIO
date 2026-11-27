/**
 * Endpoint GET: lectura en vivo + inicialización automática en cuanto el Sheet tenga permiso de edición
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const mode = (e && e.parameter && e.parameter.mode) || 'public';
  const reqPin = (e && e.parameter && e.parameter.pin) || '';
  const adminPin = getProp_('ADMIN_PIN');

  if (action === 'init_now') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const initRes = dejarTodoListoSinFotos({ silentUi: true });
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'init_now', result: initRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_now') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const syncRes = syncDriveFolderToSheet();
      ensureAutoSyncTrigger_();
      return jsonResponse_({ ok: true, action: 'sync_now', result: syncRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'sync_inventory_tab') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const invRes = sincronizarPestanaInventarioEnVivo({ silentUi: true });
      return jsonResponse_({ ok: true, action: 'sync_inventory_tab', result: invRes });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'cm_inventory') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: true, allowAdminPin: true, rateBucket: 'get_cm_inv', maxHits: 60, windowSec: 60 });
    if (!gate.ok) {
      if (gate.rateLimited) {
        return jsonResponse_({ ok: false, rateLimited: true, retryable: true, error: 'Consultas simultáneas detectadas, reintentando automáticamente...' });
      }
      return jsonResponse_({ ok: false });
    }
    return jsonResponse_(handleCmInventoryRead_());
  }

  if (action === 'seg_get_state') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        includeInventory: String((e && e.parameter && e.parameter.includeInventory) || '') === '1'
      };
      return jsonResponse_(handleSegGetState_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false });
    }
  }

  if (action === 'seg_get_delta') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 60, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const p = (e && e.parameter) || {};
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        sinceVersion: Number(p.sinceVersion || 0) || 0,
        sinceInvVersion: String(p.sinceInvVersion || '').trim()
      };
      return jsonResponse_(handleSegGetDelta_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false });
    }
  }

  if (action === 'inv_presence_list') {
    const reqKeyParam = String((e && e.parameter && e.parameter.accessKey) || '').trim();
    if (reqKeyParam) {
      return jsonResponse_({ ok: false, error: 'Por seguridad, accessKey solo se acepta vía POST.' });
    }
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: false, rateBucket: 'pres_list', maxHits: 45, windowSec: 60 });
    const reqEmailNorm = String((e && e.parameter && (e.parameter.advisorEmail || e.parameter.email)) || '').trim().toLowerCase().replace(/,/g, '.');
    if (!gate.ok) {
      return jsonResponse_({ ok: false, authRequired: true, error: 'Token de sesión inválido o expirado.' });
    }
    try {
      const reqBody = {
        authToken: extractAuthTokenFromRequest_(e, null),
        advisorEmail: reqEmailNorm,
        sheetTab: String((e && e.parameter && e.parameter.sheetTab) || '').trim(),
        erpStore: String((e && e.parameter && e.parameter.erpStore) || '').trim()
      };
      return jsonResponse_(handleInvPresenceList_(reqBody));
    } catch (err) {
      return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
    }
  }

  if (action === 'inv_ensure_invitados') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const shGuest = ensureInvitadosSheet_(getAuthSpreadsheet_());
      return jsonResponse_({ ok: true, action: 'inv_ensure_invitados', sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_ensure_precio_lista') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_ensure_precio_lista' }, resCol));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_erp_sync_now') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resSync = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_erp_sync_now' }, resSync));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_autocomplete_sort') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_maint', maxHits: 20, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true, action: 'inv_autocomplete_sort' }, resAuto));
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_users_directory') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'get_users_dir', maxHits: 30, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvUsersDirectory_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_plantilla_status') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: false, allowAdminPin: true, rateBucket: 'get_plantilla', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvPlantillaStatus_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (action === 'inv_top_searched') {
    const gate = authorizePrivateTokenOrPin_(e, null, { allowGuest: true, allowAdminPin: true, rateBucket: 'get_top', maxHits: 45, windowSec: 60 });
    if (!gate.ok) return jsonResponse_({ ok: false });
    try {
      return jsonResponse_(handleInvTopSearched_());
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }

  if (mode === 'admin' && !hasValidAdminPin_(reqPin)) {
    return jsonResponse_({ ok: false, error: 'PIN de administrador inválido o no configurado' });
  }

  try {
    const ss = getSpreadsheet_();
    publishWebAppUrlToConfigSheet_(ss);
    try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (eInvInit) {}
    const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
    if (!shProd || shProd.getLastRow() <= 1) {
      try {
        dejarTodoListoSinFotos({ silentUi: true });
        ensureAutoSyncTrigger_();
      } catch (autoErr) {}
    }
  } catch (err) {}

  const includePrivate = (mode === 'admin');
  const products = readAllCatalogRows_(includePrivate);
  return jsonResponse_({
    ok: true,
    mode: mode,
    updatedAt: new Date().toISOString(),
    products: products
  });
}

function handleCmInventoryRead_() {
  try {
    ensureLiveErpSyncTrigger_();
    const ss = getSpreadsheet_();
    let shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    if (!shInv || shInv.getLastRow() <= 1) {
      sincronizarPestanaInventarioEnVivo({ silentUi: true });
      shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    }
    autocompletarYOrdenarInventarioEnVivo_(ss, { silentUi: true, useThrottle: true });
    asegurarColumnaPrecioListaInventario_(ss, { silentUi: true });
    try { ensureInvitadosSheet_(getAuthSpreadsheet_(ss)); } catch (eInvSh) {}
    const rawRows = shInv ? shInv.getDataRange().getValues() : [];
    const rows = rawRows.filter((r, idx) => idx === 0 || String((r && r[0]) || '').trim() !== '');
    return { ok: true, tab: CONFIG.TAB_INVENTORY, rows: rows };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Endpoint POST para admin.html e inventario.html (usuarios y plantilla de cotización)
 */
function doPost(e) {
  let parsedAction = '';
  let parsedBody = {};
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    parsedBody = body || {};
    const action = body.action || '';
    parsedAction = action;
    const rateLimitErrPayload = {
      ok: false,
      rateLimited: true,
      retryable: true,
      error: 'Consultas simultáneas detectadas, reintentando automáticamente...'
    };

    // Acciones autenticadas de inventario, cotización en vivo S Mueblería y seguimiento
    if (action === 'cm_inventory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_cm_inv', maxHits: 60, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleCmInventoryRead_());
    }
    if (action === 'inv_log_event') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_log', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvLogEvent_(body, gate.tokenInfo || null, !!gate.viaPin));
    }
    if (action === 'seg_action') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_seg_act', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegAction_(body));
    }
    if (action === 'seg_get_state') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegGetState_(body));
    }
    if (action === 'seg_get_delta') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegGetDelta_(body));
    }
    if (action === 'seg_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        const recentStamp = CacheService.getScriptCache().get('SEG_ERP_SYNC_COOLDOWN_V1');
        if (recentStamp) {
          return jsonResponse_({ ok: true, cachedRecent: true, timestamp: recentStamp });
        }
      } catch (eCool) {}
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      let segQuotesRes = null;
      try {
        segQuotesRes = sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: false });
      } catch (eSegSync) {
        segQuotesRes = { ok: false, error: (eSegSync && eSegSync.message) ? eSegSync.message : String(eSegSync) };
      }
      ensureLiveErpSyncTrigger_();
      try {
        CacheService.getScriptCache().put('SEG_ERP_SYNC_COOLDOWN_V1', String((syncRes && syncRes.timestamp) || new Date().toISOString()), 60);
      } catch (eCoolSet) {}
      return jsonResponse_(Object.assign({ ok: true, segQuotesSync: segQuotesRes }, syncRes));
    }
    if (action === 'inv_login') {
      const loginEmailKey = String((body && body.email) || 'anon').trim().toLowerCase();
      if (!checkRateLimitSilent_('post_login:' + loginEmailKey, 20, 600)) {
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvLogin_(body));
    }
    if (action === 'inv_users_directory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_users_dir', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        return jsonResponse_(handleInvUsersDirectory_());
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_my_directory') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_my_dir', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvMyDirectory_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_guest_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_hb', maxHits: 30, windowSec: 60 });
      if (!gate.ok || !gate.tokenInfo || !gate.tokenInfo.email) {
        return jsonResponse_(gate && gate.rateLimited ? rateLimitErrPayload : { ok: false });
      }
      const safeBody = Object.assign({}, body, {
        authToken: extractAuthTokenFromRequest_(e, body),
        email: gate.tokenInfo.email,
        advisorEmail: gate.tokenInfo.email
      });
      return jsonResponse_(handleInvGuestHeartbeat_(safeBody));
    }
    if (action === 'inv_presence_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_pres_hb', maxHits: 60, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_hb_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceHeartbeat_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_presence_logout') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_pres_out', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token inválido.' });
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceLogout_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_presence_list') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'pres_list', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_list_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvPresenceList_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_my_sessions') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_mysess', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvMySessions_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_revoke_session') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_revsess', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRevokeSession_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_overrides_get') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_ovr_get', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        return jsonResponse_(handleInvProductOverridesGet_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_override_save') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_ovr_save', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvProductOverrideSave_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al guardar producto.' });
      }
    }
    if (action === 'inv_register_demand_request') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_demand_req', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRegisterDemandRequest_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al registrar solicitud sin stock.' });
      }
    }
    if (action === 'inv_register_purchase_suggestion') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_purchase_sug', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRegisterPurchaseSuggestion_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al registrar sugerencia de compra.' });
      }
    }
    if (action === 'hist_archive_and_analyze_kevin') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_kevin_arch', maxHits: 15, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión no válida.' });
      }
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleHistArchiveAndAnalyzeKevin_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al archivar y analizar ventas.' });
      }
    }
    if (action === 'inv_ensure_invitados') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const shGuest = ensureInvitadosSheet_(getAuthSpreadsheet_());
      return jsonResponse_({ ok: true, sheetName: shGuest ? shGuest.getName() : 'INVITADOS' });
    }
    if (action === 'inv_update_key') {
      const updEmailKey = String((body && body.email) || 'anon').trim().toLowerCase();
      if (!checkRateLimitSilent_('post_updkey:' + updEmailKey, 15, 600)) {
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvUpdateKey_(body));
    }
    if (action === 'inv_submit_quote') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_quote', maxHits: 15, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvSubmitQuote_(body));
    }
    if (action === 'inv_my_quotes') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_myq', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvMyQuotes_(body));
    }
    if (action === 'inv_download_erp_quote_pdf') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_pdf', maxHits: 30, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para continuar.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvDownloadErpQuotePdf_(body));
    }
    if (action === 'inv_search_erp_clients') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_s', maxHits: 45, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para buscar clientes.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvSearchErpClients_(body));
    }
    if (action === 'inv_create_erp_client') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_c', maxHits: 20, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        const tokInfo = verifyInvAuthToken_(extractAuthTokenFromRequest_(e, body));
        if (!tokInfo || !tokInfo.email) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Tu sesión expiró. Confirma tu contraseña para registrar clientes.' });
        }
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvCreateErpClient_(body));
    }
    if (action === 'inv_upload_product_photo') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_photo', maxHits: 40, windowSec: 60 });
      if (!gate.ok) {
        if (gate.rateLimited) return jsonResponse_(rateLimitErrPayload);
        return jsonResponse_({ ok: false, forbidden: true, error: 'Solo usuarios autorizados pueden subir fotografías.' });
      }
      return jsonResponse_(handleInvUploadProductPhoto_(body));
    }
    if (action === 'inv_plantilla_status') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_plantilla', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvPlantillaStatus_());
    }
    if (action === 'inv_record_search') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_search', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvRecordSearch_(body));
    }
    if (action === 'inv_top_searched') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_top', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(handleInvTopSearched_());
    }
    if (action === 'inv_ensure_precio_lista') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true }, resCol));
    }
    if (action === 'inv_erp_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_autocomplete_sort') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true }, resAuto));
    }
    if (action === 'inv_repair_photo_permissions') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_repair_perms', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(hacerPublicasFotosInventario_(body || {}));
    }
    if (
      action === 'fotos_subir_list' ||
      action === 'fotos_subir_upload_inbox' ||
      action === 'fotos_subir_assign' ||
      action === 'fotos_direct_upload_assign' ||
      action === 'fotos_upload_visual_override' ||
      action === 'fotos_reorganize_from_sheets' ||
      action === 'fotos_delete' ||
      action === 'fotos_subir_delete' ||
      action === 'fotos_sync_skus'
    ) {
      const isFotosPoll = (action === 'fotos_subir_list');
      const fotosRateBucket = isFotosPoll ? 'post_fotos_poll' : 'post_fotos_write';
      const fotosMaxHits = isFotosPoll ? 240 : (action === 'fotos_sync_skus' ? 30 : 60);
      const gate = authorizePrivateTokenOrPin_(e, body, {
        allowGuest: false,
        allowAdminPin: false,
        rateBucket: fotosRateBucket,
        maxHits: fotosMaxHits,
        windowSec: 60,
        keyByDevice: isFotosPoll
      });
      let shouldMintFreshToken = false;
      let mintTokenEmail = OWNER_FOTOS_EMAIL_;
      if (!gate.ok) {
        if (gate.rateLimited) {
          return jsonResponse_(rateLimitErrPayload);
        }
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(body && String(body.accessKey || '').trim() && reqEmailNorm && reqEmailNorm.indexOf('@') !== -1);
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada. Ingresa tu contraseña.' });
        }
        const keyBucket = (isFotosPoll ? 'post_fotos_key_poll:' : 'post_fotos_key:') + reqEmailNorm;
        const keyMaxHits = isFotosPoll ? 120 : 20;
        if (!checkRateLimitSilent_(keyBucket, keyMaxHits, 60)) {
          return jsonResponse_(rateLimitErrPayload);
        }
        shouldMintFreshToken = true;
        mintTokenEmail = reqEmailNorm;
      }
      let fotosRes;
      if (action === 'fotos_subir_list') fotosRes = handleFotosSubirList_(body);
      else if (action === 'fotos_subir_upload_inbox') fotosRes = handleFotosSubirUploadInbox_(body);
      else if (action === 'fotos_subir_assign') fotosRes = handleFotosSubirAssign_(body);
      else if (action === 'fotos_direct_upload_assign') fotosRes = handleFotosDirectUploadAssign_(body);
      else if (action === 'fotos_upload_visual_override') fotosRes = handleFotosUploadVisualOverride_(body);
      else if (action === 'fotos_reorganize_from_sheets') fotosRes = handleFotosReorganizeFromSheets_(body);
      else if (action === 'fotos_sync_skus') fotosRes = handleFotosSyncSkus_(body);
      else fotosRes = handleFotosDelete_(body);

      if (shouldMintFreshToken && fotosRes && fotosRes.ok) {
        try {
          fotosRes.renewedAuthToken = issueInvAuthToken_(mintTokenEmail || OWNER_FOTOS_EMAIL_, TAB_CUENTAS_ADMIN_);
        } catch (eMint) {}
      }
      return jsonResponse_(fotosRes);
    }
    if (action === 'inv_setup_accounts') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_setup', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      return jsonResponse_(organizarCuentasYDescuentosEnHojas({ silentUi: true }));
    }

    if (!hasValidAdminPin_(body && body.pin)) {
      return jsonResponse_({ ok: false, error: 'PIN de administrador incorrecto o no configurado' });
    }

    if (action === 'upload_photo') {
      return jsonResponse_(handleUploadPhoto_(body));
    }
    if (action === 'save_product') {
      return jsonResponse_(handleSaveProduct_(body.product));
    }
    if (action === 'toggle_archive') {
      return jsonResponse_(handleToggleArchive_(body.productId, !!body.archived));
    }
    if (action === 'delete_product') {
      return jsonResponse_(handleDeleteProduct_(body.productId));
    }
    if (action === 'sync_drive') {
      return jsonResponse_(syncDriveFolderToSheet());
    }
    if (action === 'init_all') {
      return jsonResponse_(dejarTodoListoSinFotos({ silentUi: true }));
    }
    if (action === 'bulk_seed') {
      return jsonResponse_(handleBulkSeed_(body.products));
    }
    return jsonResponse_({ ok: false, error: 'Acción no reconocida: ' + action });
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    if (isTransientLockTimeoutError_(errMsg)) {
      return jsonResponse_({
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando automáticamente...'
      });
    }
    if (parsedAction !== 'inv_log_event') {
      try {
        registrarEventoHistorial_(getSpreadsheet_(), {
          clasificacion: 'FALLO DE CÓDIGO',
          modulo: 'AppsScript · doPost (' + (parsedAction || 'sin_action') + ')',
          evento: 'EXCEPCIÓN NO CONTROLADA EN ENDPOINT POST',
          estado: '❌ ERROR',
          usuario: String((parsedBody && (parsedBody.advisorEmail || parsedBody.email)) || 'WebApp'),
          sucursal: String((parsedBody && (parsedBody.erpStore || parsedBody.sheetTab)) || ''),
          referencia: parsedAction || 'doPost',
          detalle: errMsg,
          analisis: analizarCausaFalloCodigo_(err, 'AppsScript · doPost', parsedAction)
        });
      } catch (eHistIgnore) {}
    }
    return jsonResponse_({ ok: false, error: errMsg });
  }
}

function isTransientLockTimeoutError_(errOrMsg) {
  const txt = String((errOrMsg && (errOrMsg.message || errOrMsg)) || '').trim();
  if (!txt) return false;
  return /obtener el candado ha expirado|Lock timeout|Timed out waiting for lock|waitLock/i.test(txt);
}

function readAllCatalogRows_(includePrivate) {
  const ss = getSpreadsheet_();
  let shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  let shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  if (!shProd || !shPiece) {
    setupSheetsStructure();
    shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
    shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);
  }

  const pRows = shProd.getDataRange().getValues();
  const zRows = shPiece.getDataRange().getValues();

  const piecesByParent = {};
  for (let i = 1; i < zRows.length; i++) {
    const r = zRows[i];
    const parentId = String(r[0] || '').trim();
    if (!parentId) continue;
    if (!piecesByParent[parentId]) piecesByParent[parentId] = [];
    const rawQty = r[4];
    const parsedQty = (rawQty === '' || rawQty === null || rawQty === undefined) ? 1 : Number(rawQty);
    const qtyNum = isNaN(parsedQty) ? 1 : parsedQty;
    const pObj = {
      name: String(r[3] || ''),
      qty: qtyNum,
      width: String(r[5] || ''),
      depth: String(r[6] || ''),
      height: String(r[7] || ''),
      price: parseMoney_(r[8]),
      checked: qtyNum > 0
    };
    if (includePrivate) {
      pObj.sku = String(r[2] || '');
      pObj.inventory = {
        cedis: r[10] || '',
        casa_creata: r[11] || '',
        colosio: r[12] || '',
        playa: r[13] || '',
        puerto_cancun: r[14] || ''
      };
    }
    piecesByParent[parentId].push(pObj);
  }

  const list = [];
  for (let i = 1; i < pRows.length; i++) {
    const r = pRows[i];
    const id = String(r[0] || '').trim();
    if (!id) continue;
    const estado = String(r[1] || 'ARCHIVADO').trim().toUpperCase();
    const isArchived = (estado !== 'VISIBLE');

    if (!includePrivate && isArchived) continue;

    let views = [];
    try {
      views = JSON.parse(String(r[20] || '[]'));
      if (!Array.isArray(views)) views = [];
    } catch (e) { views = []; }

    const heroUrl = String(r[17] || '').trim();
    const ambUrl = String(r[18] || '').trim();
    const finUrl = String(r[19] || '').trim();
    const numPrice = parseMoney_(r[14]);
    const priceFormatted = numPrice > 0 ? formatMoney_(numPrice) : String(r[14] || '');
    const mods = piecesByParent[id] || [];

    const rawMetaCell = String(r[21] || '').trim();
    let unpackedDriveId = rawMetaCell;
    let savedMetaVars = null;
    if (rawMetaCell.startsWith('{')) {
      try {
        const parsedMeta = JSON.parse(rawMetaCell);
        if (parsedMeta && parsedMeta._cm) {
          unpackedDriveId = String(parsedMeta.did || '');
          if (Array.isArray(parsedMeta.vars) && parsedMeta.vars.length > 0) {
            savedMetaVars = parsedMeta.vars;
          }
        }
      } catch (e) {}
    }

    let builtVars;
    if (savedMetaVars && savedMetaVars.length > 0) {
      builtVars = savedMetaVars.map(function (sv, vIdx) {
        const isFirst = (vIdx === 0);
        const vFin = String(sv.sw || sv.fin || (isFirst ? finUrl : '') || '');
        const vViews = Array.isArray(sv.vw) ? sv.vw : (isFirst ? [views[0] || '', views[1] || '', views[2] || '', views[3] || ''] : ['', '', '', '']);
        return {
          color_label: String(sv.cl || 'ESTÁNDAR'),
          finish_type: String(sv.ft || 'TELA'),
          swatch_hex: String(sv.hex || '#B8893E'),
          swatch_img: vFin,
          price: priceFormatted,
          width: sv.w !== undefined ? String(sv.w) : String(r[8] || ''),
          depth: sv.d !== undefined ? String(sv.d) : String(r[9] || ''),
          height: sv.h !== undefined ? String(sv.h) : String(r[10] || ''),
          seat: sv.s !== undefined ? String(sv.s) : String(r[11] || ''),
          packages: sv.pk !== undefined ? String(sv.pk) : String(r[12] || ''),
          volume: sv.vl !== undefined ? String(sv.vl) : String(r[13] || ''),
          materials: sv.mat !== undefined ? String(sv.mat) : String(r[15] || ''),
          drive_ficha_url: String(sv.du || r[16] || ''),
          hero_b64: String(sv.hero || (isFirst ? heroUrl : '') || ''),
          hero_scale: Number(sv.hs) || 1,
          hero_pos: (sv.hp && typeof sv.hp === 'object') ? { x: Number(sv.hp.x) || 0, y: Number(sv.hp.y) || 0 } : { x: 0, y: 0 },
          slot_scales: (sv.ss && typeof sv.ss === 'object') ? sv.ss : {},
          slot_pos: (sv.sp && typeof sv.sp === 'object') ? sv.sp : {},
          gallery: {
            ambiente: String(sv.amb || (isFirst ? ambUrl : '') || ''),
            finish: vFin,
            fabric: vFin,
            finishes: vFin ? [vFin] : [],
            view1: vViews[0] || '',
            view2: vViews[1] || '',
            view3: vViews[2] || '',
            view4: vViews[3] || '',
            all_views: [vViews[0] || '', vViews[1] || '', vViews[2] || '', vViews[3] || '']
          }
        };
      });
    } else {
      builtVars = [{
        color_label: 'ESTÁNDAR',
        price: priceFormatted,
        width: String(r[8] || ''),
        depth: String(r[9] || ''),
        height: String(r[10] || ''),
        seat: String(r[11] || ''),
        packages: String(r[12] || ''),
        volume: String(r[13] || ''),
        materials: String(r[15] || ''),
        drive_ficha_url: String(r[16] || ''),
        hero_b64: heroUrl,
        hero_scale: 1,
        hero_pos: { x: 0, y: 0 },
        slot_scales: {},
        slot_pos: {},
        swatch_img: finUrl,
        gallery: {
          ambiente: ambUrl,
          finish: finUrl,
          fabric: finUrl,
          finishes: finUrl ? [finUrl] : [],
          view1: views[0] || '',
          view2: views[1] || '',
          view3: views[2] || '',
          view4: views[3] || '',
          all_views: [views[0] || '', views[1] || '', views[2] || '', views[3] || '']
        }
      }];
    }

    const item = {
      id: id,
      archived: isArchived,
      provider_abbr: String(r[2] || 'CREATA'),
      provider: String(r[2] || 'CREATA'),
      model_name: String(r[4] || ''),
      category: normalizeCategory_(r[5]),
      width: String(r[8] || ''),
      depth: String(r[9] || ''),
      height: String(r[10] || ''),
      seat: String(r[11] || ''),
      packages: String(r[12] || ''),
      volume: String(r[13] || ''),
      price: priceFormatted,
      materials: String(r[15] || ''),
      drive_ficha_url: String(r[16] || ''),
      variants: builtVars
    };

    if (mods.length > 0) {
      item.sala_modules = mods;
    }
    if (includePrivate) {
      item.sku = String(r[3] || '');
      if (item.variants[0]) item.variants[0].sku = item.sku;
      item.drive_file_id = unpackedDriveId;
      item.inventory = {
        cedis: r[23] || '',
        casa_creata: r[24] || '',
        colosio: r[25] || '',
        playa: r[26] || '',
        puerto_cancun: r[27] || ''
      };
    }

    list.push(item);
  }
  return list;
}

function handleUploadPhoto_(body) {
  const dataUrl = String(body.dataUrl || '');
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return { ok: false, error: 'Formato de imagen inválido' };

  const mime = m[1];
  const base64Body = m[2];
  const ext = mime.includes('webp') ? 'webp' : (mime.includes('png') ? 'png' : 'jpg');
  const safePrefix = String(body.filePrefix || 'mueble').replace(/[^a-z0-9-]/gi, '');
  const slot = String(body.slot || 'hero').replace(/[^a-z0-9-]/gi, '');
  const fileName = safePrefix + '-' + slot + '-' + Date.now() + '.' + ext;

  const ghToken = getProp_('GITHUB_TOKEN');
  let publicUrl = '';

  if (ghToken) {
    const ghPath = 'fotos/' + fileName;
    const apiUrl = 'https://api.github.com/repos/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/contents/' + ghPath;
    const ghResp = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ghToken,
        'User-Agent': 'CreataSheetsBot'
      },
      payload: JSON.stringify({
        message: 'Upload foto ' + fileName,
        content: base64Body,
        branch: CONFIG.GITHUB_BRANCH
      }),
      muteHttpExceptions: true
    });
    if (ghResp.getResponseCode() >= 200 && ghResp.getResponseCode() < 300) {
      publicUrl = 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/' + ghPath;
    }
  }

  // Respaldo automático en Google Drive si no hay GITHUB_TOKEN
  if (!publicUrl) {
    const bytes = Utilities.base64Decode(base64Body);
    const blob = Utilities.newBlob(bytes, mime, fileName);
    const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const subIt = rootFolder.getFoldersByName(CONFIG.PHOTOS_DRIVE_FOLDER_NAME);
    const photosFolder = subIt.hasNext() ? subIt.next() : rootFolder.createFolder(CONFIG.PHOTOS_DRIVE_FOLDER_NAME);
    const uploaded = photosFolder.createFile(blob);
    uploaded.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    publicUrl = 'https://lh3.googleusercontent.com/d/' + uploaded.getId() + '=w1000';
  }

  // Actualizar únicamente la celda del slot subido (cada foto es 100% independiente)
  const pid = String(body.productId || '').trim();
  if (pid) {
    const sh = getSpreadsheet_().getSheetByName(CONFIG.TAB_PRODUCTS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === pid) {
        const rowNum = i + 1;
        if (slot === 'hero') sh.getRange(rowNum, 18).setValue(publicUrl);
        else if (slot === 'ambiente') sh.getRange(rowNum, 19).setValue(publicUrl);
        else if (slot === 'finish') sh.getRange(rowNum, 20).setValue(publicUrl);
        else if (slot.startsWith('view')) {
          const idx = parseInt(slot.replace('view', ''), 10) - 1;
          let views = [];
          try { views = JSON.parse(String(rows[i][20] || '[]')); } catch (e) { views = []; }
          if (!Array.isArray(views)) views = [];
          views[idx] = publicUrl;
          sh.getRange(rowNum, 21).setValue(JSON.stringify(views));
        }
        sh.getRange(rowNum, 23).setValue(new Date().toISOString());
        break;
      }
    }
  }

  return { ok: true, url: publicUrl };
}

function handleSaveProduct_(p) {
  if (!p || !p.id) return { ok: false, error: 'Producto sin ID' };
  setupSheetsStructure();
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const v = (p.variants && p.variants[0]) ? p.variants[0] : {};
  const g = v.gallery || {};
  const views = [g.view1 || '', g.view2 || '', g.view3 || '', g.view4 || ''];
  const catNorm = normalizeCategory_(p.category);
  const isSalaItem = catNorm === 'SALAS & SOFÁS' || /^SALA-|^ARM(MAT|MAR|MON|CAR|DON|DYL|LUG|SHE)/i.test(String(p.id || ''));
  const allMods = (isSalaItem && Array.isArray(p.sala_modules)) ? p.sala_modules : [];
  const activeMods = allMods.filter((m) => m.checked !== false && Number(m.qty === undefined ? 1 : m.qty) > 0);
  const isMulti = isSalaItem && allMods.length > 1;

  // Actualizar piezas hijas en PIEZAS_MODULOS preservando inventario en K..O y fórmulas en I..J
  const zRows = shPiece.getDataRange().getValues();
  const prevPieceInv = {};
  for (let r = zRows.length; r >= 2; r--) {
    const rowArr = zRows[r - 1];
    if (String(rowArr[0] || '').trim() === p.id) {
      const pSkuKey = String(rowArr[2] || '').trim().toUpperCase();
      if (pSkuKey) {
        prevPieceInv[pSkuKey] = normInv5_(rowArr.slice(10, 15));
      }
      shPiece.deleteRow(r);
    }
  }
  if (isMulti) {
    allMods.forEach((m, idx) => {
      const pieceRowNum = shPiece.getLastRow() + 1;
      const pieceSku = String(m.sku || ((p.sku || p.id) + '-P' + (idx + 1))).toUpperCase();
      const savedInv = prevPieceInv[pieceSku] || ['', '', '', '', ''];
      const qtyVal = m.checked === false ? 0 : (m.qty === 0 ? 0 : Number(m.qty || 1));
      const unitFormula = buildPieceUnitPriceFormula_(pieceRowNum, parseMoney_(m.price));
      shPiece.appendRow([
        p.id,
        p.model_name || '',
        pieceSku,
        m.name || ('Pieza ' + (idx + 1)),
        qtyVal,
        String(m.width || ''),
        String(m.depth || ''),
        String(m.height || ''),
        unitFormula,
        '=E' + pieceRowNum + '*I' + pieceRowNum
      ].concat(savedInv));
    });
  }

  const pRows = shProd.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < pRows.length; i++) {
    if (String(pRows[i][0] || '').trim() === p.id) {
      targetRow = i + 1;
      break;
    }
  }
  const isNewRow = (targetRow === -1);
  if (isNewRow) {
    targetRow = shProd.getLastRow() + 1;
  }

  const numericPrice = parseMoney_(p.price);
  let priceFormulaOrValue = buildProductPriceFormula_(targetRow, isMulti, numericPrice);
  if (!isNewRow && !isMulti) {
    const existingFormula = shProd.getRange(targetRow, 15).getFormula();
    const prevEval = parseMoney_(pRows[targetRow - 1][14]);
    if (existingFormula && Math.abs(numericPrice - prevEval) <= 0.05) {
      priceFormulaOrValue = existingFormula;
    } else if (numericPrice > 0 && Math.abs(numericPrice - prevEval) > 0.05) {
      priceFormulaOrValue = buildProductPriceFormula_(targetRow, false, numericPrice);
    }
  }

  const rowValues = [
    p.id,
    p.archived ? 'ARCHIVADO' : 'VISIBLE',
    p.provider_abbr || 'CREATA',
    p.sku || p.id,
    p.model_name || '',
    p.category || 'COMPLEMENTOS',
    isMulti ? 'SI' : 'NO',
    isMulti ? (activeMods.length + ' piezas') : '1 pieza',
    p.width || '',
    p.depth || '',
    p.height || '',
    p.seat || '',
    p.packages || '',
    p.volume || '',
    priceFormulaOrValue,
    p.materials || '',
    p.drive_ficha_url || '',
    v.hero_b64 || '',
    g.ambiente || '',
    g.finish || '',
    JSON.stringify(views),
    p.drive_file_id || '',
    new Date().toISOString()
  ];

  // Escribir solo columnas 1..23 (A..W) para NUNCA sobrescribir el inventario en X..AB
  shProd.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  if (isNewRow) {
    shProd.getRange(targetRow, 24, 1, 5).setValues([['', '', '', '', '']]);
  }
  return { ok: true, id: p.id };
}

function handleToggleArchive_(productId, archived) {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.TAB_PRODUCTS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === productId) {
      sh.getRange(i + 1, 2).setValue(archived ? 'ARCHIVADO' : 'VISIBLE');
      sh.getRange(i + 1, 23).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  return { ok: false, error: 'Producto no encontrado' };
}

function handleDeleteProduct_(productId) {
  const ss = getSpreadsheet_();
  const shProd = ss.getSheetByName(CONFIG.TAB_PRODUCTS);
  const shPiece = ss.getSheetByName(CONFIG.TAB_PIECES);

  const pRows = shProd.getDataRange().getValues();
  for (let r = pRows.length; r >= 2; r--) {
    if (String(pRows[r - 1][0] || '').trim() === productId) {
      shProd.deleteRow(r);
    }
  }
  const zRows = shPiece.getDataRange().getValues();
  for (let r = zRows.length; r >= 2; r--) {
    if (String(zRows[r - 1][0] || '').trim() === productId) {
      shPiece.deleteRow(r);
    }
  }
  return { ok: true };
}

function handleBulkSeed_(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Lista vacía para cargar a Sheets' };
  }
  setupSheetsStructure();
  let count = 0;
  items.forEach((p) => {
    const res = handleSaveProduct_(p);
    if (res && res.ok) count++;
  });
  return { ok: true, count: count };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function scrubPublicText_(txt) {
  return String(txt || '')
    .replace(/JUEGO\s+COMPLETO\s*\([^)]*\)/gi, '')
    .replace(/JUEGO\s+MODULAR\s+COMPLETO/gi, '')
    .replace(/JUEGO\s+COMPLETO/gi, '')
    .replace(/SOF[ÁA]\s*3P\s*\+\s*LOVE\s*SEAT\s*2P/gi, '')
    .replace(/Sin\s+descripci[óo]n\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—·:|]+|[\s\-–—·:|]+$/g, '')
    .trim();
}

function parseMoney_(val) {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const cleaned = String(val || '').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function normInv5_(arr) {
  const out = ['', '', '', '', ''];
  if (!Array.isArray(arr)) return out;
  for (let k = 0; k < 5; k++) {
    const v = arr[k];
    if (v === '' || v === null || v === undefined || v === 0 || v === '0') {
      out[k] = '';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function extractDriveIdFromUrl_(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function getRichUrl_(richVal, fallbackVal) {
  try {
    if (richVal) {
      const direct = richVal.getLinkUrl();
      if (direct) return direct;
      const runs = richVal.getRuns();
      for (let i = 0; i < runs.length; i++) {
        const u = runs[i].getLinkUrl();
        if (u) return u;
      }
    }
  } catch (e) {}
  const s = String(fallbackVal || '').trim();
  return s.indexOf('http') === 0 ? s : '';
}

function fetchGithubJsonArray_(fileName) {
  const rawUrl = 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/' + fileName;
  const resp = UrlFetchApp.fetch(rawUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return [];
  const txt = resp.getContentText();
  const s = txt.indexOf('[');
  const e = txt.lastIndexOf(']');
  if (s < 0 || e <= s) return [];
  return JSON.parse(txt.slice(s, e + 1));
}
