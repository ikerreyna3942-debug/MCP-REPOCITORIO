// ============================================================================
// CREATA · Parche ligero para celular (App de Fotos + Drive público + Sheets)
// SINCRONIZADO 100% CON AppsScript_Creata_Drive_Sheets.gs (CERO DRIFT)
// INSTRUCCIONES (SIN BORRAR Código.gs):
// 1. En Apps Script (Control de Productos), toca "+" -> Secuencia de comandos.
// 2. Ponle de nombre: z_Parche_Fotos
// 3. Borra las 3 líneas vacías, pega TODO este archivo y guarda (💾).
// 4. Implementar -> Administrar implementaciones -> Editar (✏️) -> Nueva versión -> Implementar.
// NOTA: Sin declaraciones const/let globales para convivir 100% seguro con Código.gs.
// ============================================================================

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('CREATA Catálogo')
      .addItem('1. Dejar Todo Listo (Fórmulas + Inventario Vacío, Sin Fotos)', 'dejarTodoListoSinFotos')
      .addItem('2. Sincronizar Fichas Nuevas (Drive + Hojas -> Catálogo)', 'syncDriveFolderToSheet')
      .addItem('3. Activar Automatización Cada 10 Minutos', 'installSyncTrigger')
      .addSeparator()
      .addItem('4. Crear / Actualizar Pestaña INVENTARIO_EN_VIVO', 'sincronizarPestanaInventarioEnVivo')
      .addItem('5. Sincronizar Stock S Mueblería + LPPT En Vivo (Ahora)', 'sincronizarInventarioEnVivoDesdeERP')
      .addItem('6. Activar Sincronización S Mueblería 24/7 (Cada 5 min)', 'instalarTriggerErpEnVivo')
      .addSeparator()
      .addItem('7. Organizar Cuentas, Contraseñas Temporales y Columna Descuento', 'organizarCuentasYDescuentosEnHojas')
      .addItem('8. Agregar / Actualizar Columna PRECIO DE LISTA (Cotizador)', 'agregarColumnaPrecioListaInventario')
      .addItem('9. Autocompletar Nuevos SKUs y Ordenar A-Z (INVENTARIO_EN_VIVO)', 'limpiarYCompletarInventarioEnVivo')
      .addItem('10. Crear / Verificar Hoja INVITADOS (Solo Ver · Máx. 2 Lugares)', 'crearVerificarHojaInvitados')
      .addItem('11. Reparar Permisos Públicos de Fotos (Drive)', 'hacerPublicasFotosInventario')
      .addItem('12. Reubicar y Reparar Fotos según Sheets (Drive)', 'reubicarFotosSegunSheets')
      .addToUi();
  } catch (e) {}
}

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
      if (typeof handleCmInventoryRead_ === 'function') {
        return jsonResponse_(handleCmInventoryRead_());
      }
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
        try { ensureInvitadosSheet_(typeof getAuthSpreadsheet_ === 'function' ? getAuthSpreadsheet_(ss) : ss); } catch (eInvSh) {}
        const rawRows = shInv ? shInv.getDataRange().getValues() : [];
        const rows = rawRows.filter((r, idx) => idx === 0 || String((r && r[0]) || '').trim() !== '');
        return jsonResponse_({ ok: true, tab: CONFIG.TAB_INVENTORY, rows: rows });
      } catch (err) {
        return jsonResponse_({ ok: false, error: err.message || String(err) });
      }
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
      if (typeof sincronizarCotizacionesSeguimientoDesdeERP === 'function') {
        try {
          segQuotesRes = sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: false });
        } catch (eSegSync) {
          segQuotesRes = { ok: false, error: (eSegSync && eSegSync.message) ? eSegSync.message : String(eSegSync) };
        }
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
    if (action === 'inv_users_directory' && typeof handleInvUsersDirectory_ === 'function') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_users_dir', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_(gate.rateLimited ? rateLimitErrPayload : { ok: false });
      try {
        return jsonResponse_(handleInvUsersDirectory_());
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : String(err) });
      }
    }
    if (action === 'inv_my_directory' && typeof handleInvMyDirectory_ === 'function') {
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
    if (action === 'inv_register_purchase_suggestion' && typeof handleInvRegisterPurchaseSuggestion_ === 'function') {
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
    if (action === 'hist_archive_and_analyze_kevin' && typeof handleHistArchiveAndAnalyzeKevin_ === 'function') {
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
      const shGuest = ensureInvitadosSheet_(typeof getAuthSpreadsheet_ === 'function' ? getAuthSpreadsheet_() : getSpreadsheet_());
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

function acquireScriptLockSafe_(ms) {
  const lock = LockService.getScriptLock();
  const waitMs = Math.max(1000, Number(ms) || 15000);
  try {
    if (typeof lock.tryLock === 'function') {
      return { lock: lock, ok: !!lock.tryLock(waitMs) };
    }
    lock.waitLock(waitMs);
    return { lock: lock, ok: true };
  } catch (eLock) {
    return { lock: lock, ok: false, error: (eLock && eLock.message) ? eLock.message : String(eLock) };
  }
}

function escapeSheetPlainText_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (!s) return '';
  return /^[=+\-@]/.test(s.replace(/^\s+/, '')) ? ("'" + s) : s;
}

function safeSheetCellText_(raw, maxLen) {
  let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
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
    const isGuestUploader = isGuestReadOnlyUser_(verifiedUser);
    if (isGuestUploader) {
      return {
        ok: false,
        forbidden: true,
        error: 'Las cuentas de invitado son de solo lectura y no pueden subir fotografías.'
      };
    }
    const canUploadPhoto = (typeof userHasEffectivePerm_ === 'function')
      ? userHasEffectivePerm_(verifiedUser, 'subirFoto')
      : !(verifiedUser && verifiedUser.adminPermissions && verifiedUser.adminPermissions.subirFoto === false);
    if (!canUploadPhoto) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado el permiso PUEDE_SUBIR_FOTO.'
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

function verifyExclusiveKevinOwner_(ss, body) {
  const authCheck = resolveAuthenticatedAdvisor_(ss || null, [], body || {});
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (authCheck && authCheck.error) || 'Sesión requerida. Inicia sesión con kevin.reyna@grupoanipa.com.'
    };
  }
  const emailNorm = String(authCheck.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const perms = authCheck.advisor.adminPermissions || null;
  const isPermittedAdmin = Boolean(authCheck.advisor.isAdmin && perms && perms.fotosApp === true);
  if (emailNorm !== OWNER_FOTOS_EMAIL_ && !isPermittedAdmin) {
    return {
      ok: false,
      forbidden: true,
      error: 'Acceso exclusivo denegado: este módulo está autorizado únicamente para ' + OWNER_FOTOS_EMAIL_ + ' o administradores con VER_FOTOS_APP = SI.'
    };
  }
  if (emailNorm === OWNER_FOTOS_EMAIL_ && perms && perms.fotosApp === false) {
    return {
      ok: false,
      forbidden: true,
      error: 'El permiso VER_FOTOS_APP está desactivado para tu cuenta en CUENTAS ADMINISTRATIVAS.'
    };
  }
  return { ok: true, advisor: authCheck.advisor };
}

function resolveCategoryDestFolderForProduct_(categoriaRaw, tipoRaw, nombreRaw) {
  const cat = normPlainFotoCat_(categoriaRaw);
  const tp = normPlainFotoCat_(tipoRaw);
  const nom = normPlainFotoCat_(nombreRaw);
  const nomHead = nom.split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
  const tpNom = (tp + ' ' + nom).trim();
  const text = (tpNom + ' ' + cat).trim();
  const byKey = (k) => CATEGORIAS_DEST_FOLDERS_.find((f) => f.key === k) || CATEGORIAS_DEST_FOLDERS_[CATEGORIAS_DEST_FOLDERS_.length - 1];

  if (/\bFUTON|\bFUTTON|SOFA\s*CAMAS?|\bSALA\s+ASHA\b/.test(text)) return byKey('SOFA_CAMA');
  if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(tpNom) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL(?:ES)?\b|\bAUXILIAR(?:ES)?\b/.test(tpNom))) {
    return byKey('MESA_LATERAL');
  }
  if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRO|MESA\s+CENTRAL|MESA\s+NIDO/.test(tpNom) || cat === 'MESAS DE CENTRO & LATERALES') {
    return byKey('MESA_CENTRO');
  }
  const isModularSalaModule =
    /\b(SIN\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO)?|IZQ(?:UIERDO)?)|MODULO\s+CENTRAL|ESQUINERO|CHAISE|LOVE\s*SEAT|MODULAR)\b/.test(tpNom) ||
    (cat === 'SALAS & SOFAS' && /\bSILLON(?:ES)?\b/.test(tpNom) && /\b(DER(?:ECHO)?|IZQ(?:UIERDO)?|SIN\s+BRAZOS?|CENTRAL|MODULO)\b/.test(tpNom));
  if (isModularSalaModule) {
    return byKey('SALAS');
  }
  if (/\bSILLAS?\b/.test(nomHead) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('COMEDORES');
  }
  if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA)\b/.test(nomHead) && !/\bSILLAS?\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('SILLONES');
  }
  if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tpNom)) {
    return byKey('SILLONES');
  }
  if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tpNom)) {
    return byKey('SALAS');
  }
  if (
    cat === 'OFICINA' ||
    cat === 'EXTERIOR & TERRAZA' ||
    /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tpNom)) {
    return byKey('COMEDORES');
  }
  if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tpNom)) {
    return byKey('RECAMARAS');
  }
  if (
    cat === 'ACCESORIOS DECORATIVOS' ||
    cat === 'COJINES & TEXTILES' ||
    cat === 'ESPEJOS & ARTE' ||
    cat === 'ILUMINACION' ||
    /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tpNom)
  ) {
    return byKey('ACCESORIOS');
  }
  if (
    cat === 'BUFETERAS & CREDENZAS' ||
    cat === 'COMPLEMENTOS' ||
    /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  return byKey('INTERIOR');
}

function ensurePublicSharingWithStatus_(item) {
  if (!item) return { ok: false, changed: false };
  try {
    if (typeof item.getSharingAccess === 'function') {
      const access = item.getSharingAccess();
      if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
        return { ok: true, changed: false };
      }
    }
    if (typeof item.setSharing === 'function') {
      item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { ok: true, changed: true };
    }
  } catch (eShare) {}
  return { ok: false, changed: false };
}

function ensurePublicSharingItem_(item) {
  return ensurePublicSharingWithStatus_(item).ok;
}

function getProjectAPublicFoldersCacheKey_() {
  return (typeof PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_ !== 'undefined' && PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_)
    ? String(PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_)
    : 'CREATA_PROJ_A_PUBLIC_FOLDERS_V1';
}

function getProjectALoadedNamesCacheKey_() {
  return (typeof PROJECT_A_LOADED_NAMES_CACHE_KEY_ !== 'undefined' && PROJECT_A_LOADED_NAMES_CACHE_KEY_)
    ? String(PROJECT_A_LOADED_NAMES_CACHE_KEY_)
    : 'CREATA_PROJ_A_LOADED_NAMES_V1';
}

function ensureProjectAPublicFolders_(forceNow) {
  try {
    if (!forceNow) {
      const cached = CacheService.getScriptCache().get(getProjectAPublicFoldersCacheKey_());
      if (cached === '1') return { ok: true, cached: true, updated: 0 };
    }
  } catch (eC) {}

  let updated = 0;
  const seen = {};
  const folderIds = [
    SUBIR_INBOX_FOLDER_ID_,
    CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    FOTOS_NUEVAS_CARGADO_FOLDER_ID_
  ];
  for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
    if (CATEGORIAS_DEST_FOLDERS_[i] && CATEGORIAS_DEST_FOLDERS_[i].id) {
      folderIds.push(CATEGORIAS_DEST_FOLDERS_[i].id);
    }
  }

  for (let i = 0; i < folderIds.length; i++) {
    const fid = String(folderIds[i] || '').trim();
    if (!fid || seen[fid] || isForbiddenProjectBFolderId_(fid)) continue;
    seen[fid] = true;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (fld && (!fld.isTrashed || !fld.isTrashed())) {
        if (!isFolderOrAncestorForbiddenProjectB_(fld, 8)) {
          if (ensurePublicSharingItem_(fld)) updated++;
          if (fid === SUBIR_INBOX_FOLDER_ID_ || fid === FOTOS_NUEVAS_CARGADO_FOLDER_ID_) {
            const subIt = fld.getFolders();
            while (subIt.hasNext()) {
              const sf = subIt.next();
              const sid = String((sf && sf.getId && sf.getId()) || '').trim();
              if (!sid || seen[sid] || isForbiddenProjectBFolderId_(sid)) continue;
              seen[sid] = true;
              if ((!sf.isTrashed || !sf.isTrashed()) && !isFolderOrAncestorForbiddenProjectB_(sf, 8)) {
                if (ensurePublicSharingItem_(sf)) updated++;
              }
            }
          }
        }
      }
    } catch (eFld) {}
  }

  try {
    CacheService.getScriptCache().put(getProjectAPublicFoldersCacheKey_(), '1', 600);
  } catch (ePut) {}
  return { ok: true, cached: false, updated: updated };
}

function lookupInvMetaFast_(ss, skuUpper) {
  const out = { nombre: '', tipo: '', categoria: '' };
  if (!ss || !skuUpper) return out;
  try {
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
    if (!shInv || shInv.getLastRow() < 3) return out;
    const colARng = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1);
    if (typeof colARng.createTextFinder === 'function') {
      const hit = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findNext();
      if (hit) {
        const r = shInv.getRange(hit.getRow(), 1, 1, 7).getValues()[0];
        return {
          tipo: cleanInvCell_(r[1]),
          nombre: cleanInvCell_(r[3]),
          categoria: cleanInvCell_(r[6])
        };
      }
      return out;
    }
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      if (cleanInvCell_(invVals[i][0]).toUpperCase() === skuUpper) {
        return {
          tipo: cleanInvCell_(invVals[i][1]),
          nombre: cleanInvCell_(invVals[i][3]),
          categoria: cleanInvCell_(invVals[i][6])
        };
      }
    }
  } catch (eInvFast) {}
  return out;
}

function parseUploadImageDataUrl_(dataUrl, rawNameInput, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de imagen inválido.' };
  }
  const mime = m[1];
  const base64Body = m[2];
  const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
  const cleanRaw = String(rawNameInput || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const baseName = cleanRaw || ((fallbackStem || ('foto-' + Date.now())) + '.' + ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + ext);
  const bytes = Utilities.base64Decode(base64Body);
  return {
    ok: true,
    mime: mime,
    ext: ext,
    fileName: finalName,
    blob: Utilities.newBlob(bytes, mime, finalName)
  };
}

function classifySubirInboxFileType_(mimeRaw, fileNameRaw) {
  const mime = String(mimeRaw || '').trim().toLowerCase();
  const name = String(fileNameRaw || '').trim();
  const extMatch = name.match(/\.([a-z0-9]{2,5})$/i);
  const nameExt = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : '';

  const imgExtRe = /^(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/;
  const docMimeByExt = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip'
  };
  const docExtByMime = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/csv': 'csv',
    'text/plain': 'txt',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip'
  };
  const imgMimeByExt = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff'
  };

  const isImg = (mime.indexOf('image/') === 0) || (nameExt && imgExtRe.test(nameExt));
  if (isImg) {
    let ext = nameExt && imgExtRe.test(nameExt) ? nameExt : '';
    if (!ext) {
      if (mime.indexOf('webp') !== -1) ext = 'webp';
      else if (mime.indexOf('png') !== -1) ext = 'png';
      else if (mime.indexOf('gif') !== -1) ext = 'gif';
      else if (mime.indexOf('avif') !== -1) ext = 'avif';
      else if (mime.indexOf('heic') !== -1) ext = 'heic';
      else if (mime.indexOf('heif') !== -1) ext = 'heif';
      else if (mime.indexOf('bmp') !== -1) ext = 'bmp';
      else if (mime.indexOf('tiff') !== -1) ext = 'tiff';
      else ext = 'jpg';
    }
    const resolvedImgMime = mime.indexOf('image/') === 0 ? mime : (imgMimeByExt[ext] || 'image/jpeg');
    return { ok: true, kind: 'image', ext: ext, mime: resolvedImgMime };
  }

  if (nameExt && Object.prototype.hasOwnProperty.call(docMimeByExt, nameExt)) {
    const resolvedDocMime = (mime && mime !== 'application/octet-stream' && Object.prototype.hasOwnProperty.call(docExtByMime, mime) && !(nameExt === 'csv' && mime === 'application/vnd.ms-excel'))
      ? mime
      : docMimeByExt[nameExt];
    return { ok: true, kind: 'document', ext: nameExt, mime: resolvedDocMime };
  }
  if (mime && Object.prototype.hasOwnProperty.call(docExtByMime, mime)) {
    const extFromMime = docExtByMime[mime];
    return { ok: true, kind: 'document', ext: extFromMime, mime: docMimeByExt[extFromMime] || mime };
  }
  return { ok: false };
}

function parseUploadFileDataUrl_(dataUrl, fallbackName, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:([a-zA-Z0-9.+\-]+\/[a-zA-Z0-9.+\-]+)?(?:;[^,]+)?;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de archivo inválido (se requiere data URL en base64).' };
  }
  const rawMime = String(m[1] || '').trim().toLowerCase();
  const cleanB64 = String(m[2] || '').replace(/\s+/g, '');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (!cleanB64) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (cleanB64.length > Math.ceil((MAX_BYTES * 4) / 3) + 16) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const cleanRaw = String(fallbackName || '')
    .replace(/(?:^|[\\/])\.\.(?=[\\/]|$)/g, ' ')
    .replace(/\.\.+/g, '.')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  const classified = classifySubirInboxFileType_(rawMime, cleanRaw);
  if (!classified.ok) {
    return {
      ok: false,
      error: 'Tipo de archivo no permitido. Usa fotos o documentos (.pdf, .doc, .docx, .xls, .xlsx, .csv, .txt, .ppt, .pptx, .zip).'
    };
  }

  const bytes = Utilities.base64Decode(cleanB64);
  if (!bytes || !bytes.length) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const stemDefault = String(fallbackStem || ((classified.kind === 'image' ? 'foto-' : 'doc-') + Date.now()));
  const baseName = cleanRaw || (stemDefault + '.' + classified.ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + classified.ext);
  return {
    ok: true,
    kind: classified.kind,
    mime: classified.mime,
    ext: classified.ext,
    fileName: finalName,
    sizeBytes: bytes.length,
    blob: Utilities.newBlob(bytes, classified.mime, finalName)
  };
}

function getFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  try {
    const cVal = CacheService.getScriptCache().get(KEY);
    if (cVal) return String(cVal);
  } catch (eC) {}
  try {
    const pVal = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pVal) {
      const sVal = String(pVal);
      try { CacheService.getScriptCache().put(KEY, sVal, 300); } catch (eC2) {}
      return sVal;
    }
  } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, '1', 300); } catch (eC3) {}
  return '1';
}

function invalidateFotosInboxSnapshotCache_(revToClear) {
  try {
    const cache = CacheService.getScriptCache();
    const r = String(revToClear || '').trim();
    if (r) {
      cache.remove('FOTOS_INBOX_META_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_F_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_T_V1_' + r);
    }
  } catch (eInv) {}
}

function bumpFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  const prevRev = getFotosInboxRev_();
  const prevSeq = parseInt(String(prevRev || '1').split('-')[0], 10) || 1;
  const nextRev = String(prevSeq + 1) + '-' + String(Date.now());
  invalidateFotosInboxSnapshotCache_(prevRev);
  try { PropertiesService.getScriptProperties().setProperty(KEY, nextRev); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, nextRev, 300); } catch (eC) {}
  return nextRev;
}

function hydrateFotosRecentUpload_(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fid = String(raw.fileId || raw.id || '').trim();
  if (!fid) return null;
  const kind = String(raw.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
  const targetKey = String(raw.targetKey || 'INBOX').trim().toUpperCase().slice(0, 80);
  return {
    id: fid,
    fileId: fid,
    targetKey: targetKey,
    targetLabel: String(raw.targetLabel || raw.fileName || targetKey).trim().slice(0, 120),
    targetKind: String(raw.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
    kind: kind,
    ext: String(raw.ext || '').trim().toLowerCase().slice(0, 8),
    fileName: String(raw.fileName || '').trim().slice(0, 120),
    viewUrl: String(raw.viewUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing')).trim().slice(0, 180),
    downloadUrl: String(raw.downloadUrl || ('https://drive.google.com/uc?export=download&id=' + fid)).trim().slice(0, 180),
    thumbUrl: kind === 'image' ? String(raw.thumbUrl || ('https://lh3.googleusercontent.com/d/' + fid + '=w800')).trim().slice(0, 180) : '',
    destFolderName: String(raw.destFolderName || '').trim().slice(0, 64),
    actorEmail: String(raw.actorEmail || '').trim().toLowerCase().slice(0, 80),
    ts: Number(raw.ts || 0) || 0
  };
}

function compactFotosRecentUploadForStore_(raw) {
  const rec = hydrateFotosRecentUpload_(raw);
  if (!rec) return null;
  const compact = {
    id: rec.id,
    targetKey: rec.targetKey,
    targetLabel: rec.targetLabel,
    targetKind: rec.targetKind,
    kind: rec.kind,
    ext: rec.ext,
    fileName: rec.fileName,
    destFolderName: rec.destFolderName,
    actorEmail: rec.actorEmail,
    ts: rec.ts
  };
  const defView = 'https://drive.google.com/file/d/' + rec.id + '/view?usp=sharing';
  const defDl = 'https://drive.google.com/uc?export=download&id=' + rec.id;
  const defThumb = 'https://lh3.googleusercontent.com/d/' + rec.id + '=w800';
  if (rec.viewUrl && rec.viewUrl !== defView) compact.viewUrl = rec.viewUrl;
  if (rec.downloadUrl && rec.downloadUrl !== defDl) compact.downloadUrl = rec.downloadUrl;
  if (rec.kind === 'image' && rec.thumbUrl && rec.thumbUrl !== defThumb) compact.thumbUrl = rec.thumbUrl;
  return compact;
}

function readFotosRecentUploads_() {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  try {
    const cRaw = CacheService.getScriptCache().get(KEY);
    if (cRaw) {
      const parsed = JSON.parse(cRaw);
      if (Array.isArray(parsed)) return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
    }
  } catch (eC) {}
  try {
    const pRaw = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pRaw) {
      const parsed = JSON.parse(pRaw);
      if (Array.isArray(parsed)) {
        try { CacheService.getScriptCache().put(KEY, pRaw, 300); } catch (eC2) {}
        return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
      }
    }
  } catch (eP) {}
  return [];
}

function writeFotosRecentUploads_(list) {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  const cleanCompact = (Array.isArray(list) ? list : [])
    .slice(0, 24)
    .map(compactFotosRecentUploadForStore_)
    .filter(Boolean);
  let json = JSON.stringify(cleanCompact);
  const byteLenFn = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_ : function (x) { return String(x || '').length; };
  while (cleanCompact.length > 1 && byteLenFn(json) > 8200) {
    cleanCompact.pop();
    json = JSON.stringify(cleanCompact);
  }
  try { PropertiesService.getScriptProperties().setProperty(KEY, json); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, json, 300); } catch (eC) {}
  return cleanCompact.map(hydrateFotosRecentUpload_).filter(Boolean);
}

function recordFotosRecentUpload_(entry) {
  try {
    if (!entry || typeof entry !== 'object') return readFotosRecentUploads_();
    const fid = String(entry.fileId || entry.id || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const kind = String(entry.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
    const targetKey = String(entry.targetKey || entry.sku || entry.overrideKey || 'INBOX').trim().toUpperCase().slice(0, 80);
    const rec = hydrateFotosRecentUpload_({
      id: fid,
      fileId: fid,
      targetKey: targetKey,
      targetLabel: String(entry.targetLabel || entry.productName || entry.label || entry.fileName || targetKey).trim().slice(0, 120),
      targetKind: String(entry.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
      kind: kind,
      ext: String(entry.ext || '').trim().toLowerCase().slice(0, 8),
      fileName: String(entry.fileName || '').trim().slice(0, 120),
      viewUrl: entry.viewUrl || '',
      downloadUrl: entry.downloadUrl || '',
      thumbUrl: entry.thumbUrl || '',
      destFolderName: String(entry.destFolderName || '').trim().slice(0, 64),
      actorEmail: String(entry.actorEmail || '').trim().toLowerCase().slice(0, 80),
      ts: Number(entry.ts || Date.now()) || Date.now()
    });
    if (!rec) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const dedupKey = rec.id + ':' + rec.targetKey;
    const merged = [rec].concat(prev.filter(function (it) {
      if (!it || !it.id) return false;
      return (String(it.id) + ':' + String(it.targetKey || '')) !== dedupKey;
    }));
    return writeFotosRecentUploads_(merged);
  } catch (eRec) {
    return readFotosRecentUploads_();
  }
}

function removeFotosRecentUploadByFileId_(fileId) {
  try {
    const fid = String(fileId || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const filtered = prev.filter(function (it) { return it && String(it.id || it.fileId || '') !== fid; });
    if (filtered.length !== prev.length) {
      return writeFotosRecentUploads_(filtered);
    }
    return prev;
  } catch (eRm) {
    return readFotosRecentUploads_();
  }
}

function cleanDuplicatesInSubirInbox_(movedFile, origName, shortcutFileId, resolvedInbox) {
  let removed = 0;
  try {
    const resolved = resolvedInbox || resolveSubirInboxFolders_();
    const inboxFolders = resolved.folders || [];
    const inboxMap = Object.assign({}, resolved.folderIdsMap || {});
    inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
    const movedId = movedFile && typeof movedFile.getId === 'function' ? String(movedFile.getId() || '').trim() : '';

    // 1) Asegurar que el archivo movido ya no tenga ningún padre dentro de SUBIR PREN
    if (movedFile && typeof movedFile.getParents === 'function') {
      try {
        const pIt = movedFile.getParents();
        while (pIt.hasNext()) {
          const pf = pIt.next();
          const pid = String((pf && pf.getId && pf.getId()) || '').trim();
          if (pid && inboxMap[pid] && !isDestCategoryFolderId_(pid) && !isForbiddenProjectBFolderId_(pid)) {
            try { pf.removeFile(movedFile); removed++; } catch (eRem1) {}
          }
        }
      } catch (ePar) {}
    }

    // 2) Si venía de un acceso directo en SUBIR PREN, enviar a papelera únicamente ese acceso directo exacto
    const cleanScId = String(shortcutFileId || '').trim();
    if (cleanScId && cleanScId !== movedId && !isForbiddenProjectBFolderId_(cleanScId)) {
      try {
        const scFile = DriveApp.getFileById(cleanScId);
        if (scFile && !scFile.isTrashed() && String(scFile.getMimeType() || '').toLowerCase() === 'application/vnd.google-apps.shortcut') {
          if (isFileInProjectAAllowedFolders_(scFile, inboxMap) && !isFileInForbiddenProjectBFolder_(scFile)) {
            scFile.setTrashed(true);
            removed++;
          }
        }
      } catch (eScTrash) {}
    }

    // 3) Limpiar referencias exactas al mismo movedId, accesos directos hacia movedId, y copias duplicadas
    //    con nombre descriptivo exacto dentro de SUBIR PREN (NUNCA borrar nombres genéricos de cámara como "image.jpg" de iOS)
    const cleanNameLower = String(origName || '').trim().toLowerCase();
    const isGenericCameraName = !cleanNameLower || /^(?:image|photo|foto|img|dsc|pxl|screenshot|captura)(?:[\s_-]*\d*)?\.(?:jpe?g|png|heic|heif|webp)$/i.test(cleanNameLower);
    if (movedId) {
      for (let i = 0; i < inboxFolders.length; i++) {
        const folder = inboxFolders[i];
        if (!folder) continue;
        const fidFolder = String((folder.getId && folder.getId()) || '').trim();
        if (!fidFolder || isDestCategoryFolderId_(fidFolder) || isForbiddenProjectBFolderId_(fidFolder)) continue;
        try {
          const fIt = folder.getFiles();
          while (fIt.hasNext()) {
            const cand = fIt.next();
            if (!cand || cand.isTrashed()) continue;
            const cid = String((cand.getId && cand.getId()) || '').trim();
            if (!cid || isForbiddenProjectBFolderId_(cid)) continue;
            if (cid === movedId) {
              try { folder.removeFile(cand); removed++; } catch (eRemSame) {}
              continue;
            }
            const cMime = String((cand.getMimeType && cand.getMimeType()) || '').toLowerCase();
            const isTargetShortcut = cMime === 'application/vnd.google-apps.shortcut' && String((cand.getTargetId && cand.getTargetId()) || '').trim() === movedId;
            const cNameLower = String((cand.getName && cand.getName()) || '').trim().toLowerCase();
            const isDescriptiveDuplicate = !isGenericCameraName && cNameLower && cNameLower === cleanNameLower;
            if (isTargetShortcut || isDescriptiveDuplicate) {
              try {
                let inDest = false;
                const cpIt = cand.getParents();
                while (cpIt.hasNext()) {
                  const cpf = cpIt.next();
                  if (cpf && isDestCategoryFolderId_(cpf.getId())) { inDest = true; break; }
                }
                if (!inDest && !isFileInForbiddenProjectBFolder_(cand)) {
                  cand.setTrashed(true);
                  removed++;
                } else if (inDest) {
                  folder.removeFile(cand);
                  removed++;
                }
              } catch (eDup) {}
            }
          }
        } catch (eScanInb) {}
      }
    }
  } catch (eCleanAll) {}
  return removed;
}

function collectLoadedFileNamesMap_(forceRefresh) {
  try {
    if (!forceRefresh) {
      const cached = CacheService.getScriptCache().get(getProjectALoadedNamesCacheKey_());
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch (eC) {}

  const map = {};
  const startMs = Date.now();
  const MAX_MS = 4500;
  const folderIds = CATEGORIAS_DEST_FOLDERS_.map((f) => f.id);
  folderIds.push(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);

  for (let i = 0; i < folderIds.length; i++) {
    if ((Date.now() - startMs) > MAX_MS) break;
    const fid = folderIds[i];
    if (!fid || isForbiddenProjectBFolderId_(fid)) continue;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (!fld || (fld.isTrashed && fld.isTrashed())) continue;
      const it = fld.getFiles();
      let count = 0;
      while (it.hasNext() && count < 450 && (Date.now() - startMs) <= MAX_MS) {
        const f = it.next();
        if (!f || (f.isTrashed && f.isTrashed())) continue;
        const id = String(f.getId() || '').trim();
        const nm = String(f.getName() || '').trim();
        if (id && nm) {
          map[id] = nm;
          count++;
        }
      }
    } catch (eF) {}
  }

  try {
    const serialized = JSON.stringify(map);
    const byteLen = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(serialized) : serialized.length;
    if (byteLen < 95000) {
      CacheService.getScriptCache().put(getProjectALoadedNamesCacheKey_(), serialized, 300);
    }
  } catch (ePut) {}
  return map;
}

function invalidateLoadedFileNamesCache_() {
  try { CacheService.getScriptCache().remove(getProjectALoadedNamesCacheKey_()); } catch (e) {}
}

function resolveSubirInboxFolders_(ancestorMemo) {
  const folders = [];
  const folderIdsMap = {};
  let primaryFolder = null;

  function addFolderSafe(folderObj) {
    if (!folderObj) return;
    try {
      if (folderObj.isTrashed && folderObj.isTrashed()) return;
      const fid = String(folderObj.getId() || '').trim();
      if (!fid || folderIdsMap[fid]) return;
      if (isForbiddenProjectBFolderId_(fid) || isFolderOrAncestorForbiddenProjectB_(folderObj, 8, ancestorMemo)) return;
      if (isDestCategoryFolderId_(fid)) return;
      folderIdsMap[fid] = true;
      folders.push(folderObj);
      if (!primaryFolder) primaryFolder = folderObj;
    } catch (eAddF) {}
  }

  try {
    const baseSubir = DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_); // SUBIR PREN (exclusivo Proyecto A)
    addFolderSafe(baseSubir);
    if (baseSubir && !baseSubir.isTrashed() && folderIdsMap[SUBIR_INBOX_FOLDER_ID_]) {
      primaryFolder = baseSubir;
    }
  } catch (eBase) {}

  // Solo subcarpetas directas dentro de SUBIR PREN (protegidas contra IDs prohibidos de Proyecto B y categorías destino)
  const rootCount = folders.length;
  for (let i = 0; i < rootCount; i++) {
    try {
      const subIt = folders[i].getFolders();
      while (subIt.hasNext()) {
        const sub = subIt.next();
        if (!sub.isTrashed()) addFolderSafe(sub);
      }
    } catch (eSub) {}
  }

  return {
    primaryFolder: primaryFolder,
    folders: folders,
    folderIdsMap: folderIdsMap
  };
}

function listSubirInboxFilesInternal_(opts) {
  const includeThumbs = !!(opts && opts.includeThumbs);
  const startListMs = Date.now();
  const ancestorMemo = (opts && opts.ancestorMemo) ? opts.ancestorMemo : {};
  ensureProjectAPublicFolders_(false);
  const resolved = (opts && opts.resolvedInbox) ? opts.resolvedInbox : resolveSubirInboxFolders_(ancestorMemo);
  const inboxFolders = resolved.folders || [];
  const inboxMap = resolved.folderIdsMap || {};
  const seenFileIds = {};
  const rawItems = [];

  for (let fIdx = 0; fIdx < inboxFolders.length; fIdx++) {
    const folder = inboxFolders[fIdx];
    let it = null;
    try {
      it = folder.getFiles();
    } catch (eIt) {
      continue;
    }
    while (it && it.hasNext()) {
      let f = it.next();
      let shortcutId = '';
      try {
        if (!f || f.isTrashed()) continue;
        let mime = String(f.getMimeType() || '').toLowerCase();
        if (mime === 'application/vnd.google-apps.shortcut') {
          let targetFile = null;
          try {
            shortcutId = String(f.getId() || '').trim();
            const targetId = String((f.getTargetId && f.getTargetId()) || '').trim();
            if (!targetId || isForbiddenProjectBFolderId_(targetId)) continue;
            targetFile = DriveApp.getFileById(targetId);
          } catch (eSc) {
            continue;
          }
          if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) continue;
          f = targetFile;
          mime = String(f.getMimeType() || '').toLowerCase();
          if (mime === 'application/vnd.google-apps.shortcut') continue;
        }
        const fid = String(f.getId() || '').trim();
        if (!fid || seenFileIds[fid]) continue;
        if (!isFileInProjectAAllowedFolders_(f, inboxMap, ancestorMemo)) continue;
        const name = String(f.getName() || '').trim();
        const classified = classifySubirInboxFileType_(mime, name);
        if (!classified.ok) continue;
        seenFileIds[fid] = true;
        if ((Date.now() - startListMs) < 900) {
          ensurePublicSharingItem_(f);
        }
        const updated = f.getLastUpdated();
        rawItems.push({
          fileObj: f,
          id: fid,
          shortcutId: shortcutId,
          name: name,
          kind: classified.kind,
          ext: classified.ext,
          mimeType: classified.mime,
          sizeBytes: Number(f.getSize() || 0) || 0,
          updatedAt: updated ? updated.toISOString() : ''
        });
      } catch (eItem) {}
    }
  }

  rawItems.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const files = [];
  let imgThumbCount = 0;
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const f = item.fileObj;
    const isImg = (item.kind === 'image');
    let thumbDataUrl = '';
    if (includeThumbs && isImg && imgThumbCount < 16) {
      imgThumbCount++;
      try {
        const tb = f.getThumbnail();
        if (tb) {
          const ct = String(tb.getContentType() || 'image/png');
          thumbDataUrl = 'data:' + ct + ';base64,' + Utilities.base64Encode(tb.getBytes());
        }
      } catch (eTb) {}
    }
    files.push({
      id: item.id,
      shortcutId: item.shortcutId || '',
      name: item.name,
      kind: item.kind,
      ext: item.ext,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      updatedAt: item.updatedAt,
      viewUrl: 'https://drive.google.com/file/d/' + item.id + '/view?usp=sharing',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + item.id,
      thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + item.id + '=w800') : '',
      thumbDataUrl: thumbDataUrl
    });
  }
  return files;
}

function handleFotosSubirList_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  let pendingDeletesProcessed = false;
  let hadPendingDeletes = false;
  if (body && body.pendingDeletes && typeof body.pendingDeletes === 'object') {
    const startPendMs = Date.now();
    const MAX_PEND_MS = 8000;
    try {
      const pd = body.pendingDeletes;
      const pSkus = Array.isArray(pd.skus) ? pd.skus : [];
      const pFiles = Array.isArray(pd.fileIds) ? pd.fileIds : [];
      hadPendingDeletes = (pSkus.length > 0 || pFiles.length > 0);
      let allCompleted = true;
      for (let i = 0; i < pSkus.length; i++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        if (pSkus[i]) handleFotosDelete_(Object.assign({}, body, { sku: pSkus[i], skipListReturn: true }));
      }
      for (let j = 0; j < pFiles.length; j++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        const pfid = String(pFiles[j] || '').trim();
        if (!pfid) continue;
        try {
          const checkF = DriveApp.getFileById(pfid);
          if (!checkF || checkF.isTrashed()) continue;
        } catch (eMissF) {
          continue;
        }
        handleFotosDelete_(Object.assign({}, body, { driveFileId: pfid, source: 'INBOX', skipListReturn: true }));
      }
      pendingDeletesProcessed = allCompleted;
    } catch (ePend) {}
  }

  let skuSync = { added: 0, totalHoja1: 0 };
  if (body && body.syncSkus) {
    try {
      skuSync = sincronizarSkusHoja1DesdeInventario_(ss, false) || skuSync;
    } catch (eSync1) {}
  }

  const currentRev = getFotosInboxRev_();
  const recentUploads = readFotosRecentUploads_();
  const sinceRev = String((body && body.sinceRev) || '').trim();
  const forceRefresh = !!(body && body.forceRefresh);
  const includeThumbs = !!(body && body.includeThumbs);
  const includeLoadedNames = !!(body && body.includeLoadedNames);
  const metaCacheKey = 'FOTOS_INBOX_META_V1_' + currentRev;
  const snapCacheKey = 'FOTOS_INBOX_SNAP_' + (includeThumbs ? 'T' : 'F') + '_V1_' + currentRev;

  // Fast path cero DriveApp: si sinceRev coincide con la revisión actual y la caché de 15s está fresca
  if (sinceRev && sinceRev === currentRev && !forceRefresh && !hadPendingDeletes && !(body && body.syncSkus) && !includeLoadedNames) {
    try {
      const metaRaw = CacheService.getScriptCache().get(metaCacheKey);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && typeof meta === 'object') {
          const cachedPrimaryId = String(meta.primaryId || SUBIR_INBOX_FOLDER_ID_);
          return {
            ok: true,
            unchanged: true,
            rev: currentRev,
            pendingCount: Number(meta.pendingCount || 0) || 0,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0
          };
        }
      }
    } catch (eMetaFast) {}
  }

  // Snapshot cache hit (15s keyed by rev) para múltiples dispositivos simultáneos sin repetir DriveApp
  if (!forceRefresh && !hadPendingDeletes) {
    try {
      const snapRaw = CacheService.getScriptCache().get(snapCacheKey);
      if (snapRaw) {
        const snap = JSON.parse(snapRaw);
        if (snap && Array.isArray(snap.files)) {
          const cachedPrimaryId = String(snap.primaryId || SUBIR_INBOX_FOLDER_ID_);
          const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
          return {
            ok: true,
            unchanged: false,
            fromCache: true,
            rev: currentRev,
            pendingCount: snap.files.length,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0,
            files: snap.files,
            loadedFileNames: loadedFileNames
          };
        }
      }
    } catch (eSnapRead) {}
  }

  ensureProjectAPublicFolders_(false);
  const ancestorMemo = {};
  const resolved = resolveSubirInboxFolders_(ancestorMemo);
  const primaryId = (resolved.primaryFolder && resolved.primaryFolder.getId()) || SUBIR_INBOX_FOLDER_ID_;
  const files = listSubirInboxFilesInternal_({
    includeThumbs: includeThumbs,
    resolvedInbox: resolved,
    ancestorMemo: ancestorMemo
  });

  try {
    const cache = CacheService.getScriptCache();
    cache.put(metaCacheKey, JSON.stringify({ primaryId: primaryId, pendingCount: files.length }), 15);
    const snapJson = JSON.stringify({ primaryId: primaryId, files: files });
    const snapBytes = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(snapJson) : snapJson.length;
    if (snapBytes < 95000) {
      cache.put(snapCacheKey, snapJson, 15);
    }
  } catch (eSnapPut) {}

  const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
  return {
    ok: true,
    unchanged: false,
    rev: currentRev,
    pendingCount: files.length,
    recentUploads: recentUploads,
    pendingDeletesProcessed: pendingDeletesProcessed,
    inboxFolderId: primaryId,
    inboxFolderUrl: 'https://drive.google.com/drive/folders/' + primaryId,
    destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destFolders: CATEGORIAS_DEST_FOLDERS_,
    hoja1SkusAdded: skuSync.added || 0,
    hoja1TotalSkus: skuSync.totalHoja1 || 0,
    files: files,
    loadedFileNames: loadedFileNames
  };
}

function handleFotosSyncSkus_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  ensureProjectAPublicFolders_(false);

  // Si se proporcionó un SKU puntual recién dado de alta en S Mueblería ERP (aún con 0 stock), consultarlo directo por WCF
  const querySku = String((body && body.querySku) || '').trim().toUpperCase();
  let directErpFound = null;
  if (querySku && querySku.length >= 3) {
    try {
      const wcfProd = buscarProductoPorClaveWcf_(querySku);
      if (wcfProd && wcfProd.IdProducto && String(wcfProd.Clave || '').trim().toUpperCase() === querySku) {
        directErpFound = wcfProd;
        const shPl = ss.getSheetByName('plantilla');
        if (shPl && shPl.getLastColumn() >= 34) {
          const aeVals = shPl.getRange(2, 31, Math.max(1, shPl.getLastRow() - 1), 1).getDisplayValues();
          let existsInPl = false;
          let lastAe = 1;
          for (let i = 0; i < aeVals.length; i++) {
            const cSk = String(aeVals[i][0] || '').trim().toUpperCase();
            if (cSk) {
              lastAe = i + 2;
              if (cSk === querySku) { existsInPl = true; break; }
            }
          }
          if (!existsInPl) {
            const nextAe = lastAe + 1;
            if (shPl.getMaxRows() < nextAe) shPl.insertRowsAfter(shPl.getMaxRows(), nextAe - shPl.getMaxRows());
            shPl.getRange(nextAe, 31, 1, 1).setNumberFormat('@');
            shPl.getRange(nextAe, 31, 1, 4).setValues([[
              querySku,
              String(wcfProd.IdProducto).trim(),
              cleanInvCell_(wcfProd.Nombre) || querySku,
              Number(wcfProd.Precio || 0) || ''
            ]]);
          }
        }
      }
    } catch (eDirectWcf) {}
  }

  let erpSyncRes = { ok: false, newSkusAdded: 0, hoja1SkusAdded: 0 };
  try {
    erpSyncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true }) || erpSyncRes;
  } catch (eErp) {}

  const hoja1Res = sincronizarSkusHoja1DesdeInventario_(ss, true);
  const totalAddedHoja1 = ((erpSyncRes && erpSyncRes.hoja1SkusAdded) || 0) + ((hoja1Res && hoja1Res.added) || 0);

  if (totalAddedHoja1 > 0 || (erpSyncRes && erpSyncRes.newSkusAdded > 0)) {
    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SINCRONIZACIÓN DE SKUS EN HOJA "1"',
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: '+' + totalAddedHoja1 + ' en Hoja "1"',
        detalle: 'SKUs sincronizados desde S Mueblería ERP / INVENTARIO_EN_VIVO hacia Hoja "1" (total: ' + (hoja1Res.totalHoja1 || 0) + ').',
        analisis: 'Fórmulas maestras B2:F2 y F2 intactas.'
      });
    } catch (eHist) {}
  }

  return {
    ok: true,
    erpSynced: !!(erpSyncRes && erpSyncRes.ok),
    invAdded: (erpSyncRes && erpSyncRes.newSkusAdded) || 0,
    hoja1Added: totalAddedHoja1,
    totalHoja1: (hoja1Res && hoja1Res.totalHoja1) || 0,
    directErpSku: directErpFound ? String(directErpFound.Clave || '').toUpperCase() : '',
    timestamp: formatCancunNow_()
  };
}

function handleFotosSubirUploadInbox_(body) {
  try {
    const auth = verifyExclusiveKevinOwner_(null, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const parsed = parseUploadFileDataUrl_(body && body.dataUrl, body && body.fileName, 'archivo-' + Date.now());
    if (!parsed.ok) return parsed;

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let fid = '';
    let createdName = '';
    let sizeBytes = 0;
    let updatedIso = '';
    let nextRev = '';
    let recentUploads = [];
    try {
      ensureProjectAPublicFolders_(false);
      const resolved = resolveSubirInboxFolders_();
      const inbox = resolved.primaryFolder || DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
      ensurePublicSharingItem_(inbox);
      const created = inbox.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      fid = created.getId();
      createdName = String(created.getName() || parsed.fileName).trim();
      sizeBytes = Number(created.getSize() || parsed.sizeBytes || 0) || 0;
      updatedIso = new Date().toISOString();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: fid,
        fileId: fid,
        targetKey: 'INBOX',
        targetLabel: createdName,
        targetKind: parsed.kind === 'document' ? 'DOCUMENTO' : 'SUBIR_PREN',
        kind: parsed.kind,
        ext: parsed.ext,
        fileName: createdName,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: parsed.kind === 'image' ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : '',
        destFolderName: 'SUBIR PREN',
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }

    const isImg = (parsed.kind === 'image');
    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      file: {
        id: fid,
        name: createdName,
        kind: parsed.kind,
        ext: parsed.ext,
        mimeType: parsed.mime,
        sizeBytes: sizeBytes,
        updatedAt: updatedIso,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : ''
      },
      files: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_()
    };
  } catch (errUpInbox) {
    return {
      ok: false,
      error: (errUpInbox && errUpInbox.message) ? errUpInbox.message : String(errUpInbox)
    };
  }
}

function handleFotosSubirAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    const driveFileId = String((body && body.driveFileId) || '').trim();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    if (!driveFileId) {
      return { ok: false, error: 'Selecciona primero una fotografía.' };
    }

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    ensureProjectAPublicFolders_(false);

    const reqFolderId = String((body && body.targetFolderId) || '').trim();
    const reqDestMeta = reqFolderId
      ? (CATEGORIAS_DEST_FOLDERS_.find((f) => f.id === reqFolderId) || null)
      : null;
    if (reqFolderId && (isForbiddenProjectBFolderId_(reqFolderId) || !reqDestMeta)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Carpeta destino inválida o fuera de CATEGORIAS MUEBLES Y ACCESORIOS.'
      };
    }

    const providedName = String((body && body.productName) || '').trim();
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || providedName,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };

    // Siempre acomodar automáticamente según la información de Sheets (a menos que se pida forceTargetFolderId explícito)
    const destMeta = (body && body.forceTargetFolderId && reqDestMeta)
      ? reqDestMeta
      : resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Lectura preliminar fuera de ScriptLock para detectar si el archivo ya está usado por otro SKU
    let preSheetProductName = '';
    let isUsedByOtherSku = false;
    try {
      const preScanRows = Math.max(sh1.getLastRow(), 3);
      const preVals = sh1.getRange(1, 1, preScanRows, 4).getDisplayValues();
      for (let i = 2; i < preVals.length; i++) {
        const cellSku = String(preVals[i][0] || '').trim().toUpperCase();
        const cellUrl = String(preVals[i][3] || '').trim();
        if (!cellSku) continue;
        if (cellSku === skuUpper) {
          if (!preSheetProductName && preVals[i][1]) preSheetProductName = String(preVals[i][1]).trim();
        } else if (cellUrl && cellUrl.indexOf(driveFileId) !== -1) {
          isUsedByOtherSku = true;
        }
      }
    } catch (ePreScan) {}

    const effectiveName = preSheetProductName || invMeta.nombre || providedName || skuUpper;

    if (isForbiddenProjectBFolderId_(driveFileId)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Aislamiento Proyecto A/B: no se permite mover ni asignar recursos de carpetas de Prompts/Odoo.'
      };
    }
    const srcFile = DriveApp.getFileById(driveFileId);
    const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_subir_assign');
    if (!srcCheck.ok) {
      return srcCheck;
    }

    // Respetar siempre el nombre original de la foto tal como se cargó/colocó
    const origName = String(srcFile.getName() || '').trim();
    const mimeLower = String(srcFile.getMimeType() || '').toLowerCase();
    const fallbackExt = mimeLower.indexOf('png') !== -1 ? '.png' : (mimeLower.indexOf('webp') !== -1 ? '.webp' : '.jpg');
    const preservedFileName = origName || (skuUpper + fallbackExt);

    let file = srcFile;
    const reuseFromLoaded = isUsedByOtherSku || !!(body && body.fromLoaded);

    if (reuseFromLoaded) {
      // Si se toma una foto que ya está cargada en otro SKU, crear copia limpia en la carpeta destino conservando su nombre original
      try {
        file = srcFile.makeCopy(preservedFileName, destFolder);
      } catch (eCopyLoaded) {
        file = srcFile;
      }
    } else {
      // Mover a su carpeta destino SIN renombrar y borrar únicamente de la carpeta de extracción (SUBIR PREN) para evitar duplicados
      file.moveTo(destFolder);
      cleanDuplicatesInSubirInbox_(file, preservedFileName, body && body.shortcutId, null);
    }

    ensurePublicSharingItem_(file);

    try {
      file.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + effectiveName +
        ' | Categoría Drive: ' + destMeta.name +
        ' | Asignado por: ' + actorEmail +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = file.getId();
    const finalFileName = String(file.getName() || preservedFileName).trim();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Adquirir ScriptLock corto ÚNICAMENTE para lectura/escritura atómica en Hoja "1" (sin bloquear Drive I/O)
    let primaryRowNumber = 0;
    let wasAppended = false;
    let previousUrl = '';
    let formulaResolvedName = effectiveName;
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();
      const matchedRows = [];
      let lastSkuRowInColA = 2; // Nunca escribir en fila 1 ni fila 2 (fórmulas maestras)
      let sheetProductName = preSheetProductName;

      for (let i = 2; i < vals1.length; i++) {
        const rowNum = i + 1;
        const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
        const cellUrl = String(vals1[i][3] || '').trim();
        if (cellSku) {
          lastSkuRowInColA = rowNum;
          if (cellSku === skuUpper) {
            matchedRows.push(rowNum);
            if (!sheetProductName && vals1[i][1]) sheetProductName = String(vals1[i][1]).trim();
            if (!previousUrl && cellUrl) previousUrl = cellUrl;
          }
        }
      }
      if (sheetProductName) formulaResolvedName = sheetProductName;

      // Escribir URL en Columna D de la hoja "1" sin tocar jamás las fórmulas de Fila 2 (B2, C2, E2, F2)
      if (matchedRows.length > 0) {
        primaryRowNumber = matchedRows[0];
        for (let m = 0; m < matchedRows.length; m++) {
          sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
        }
      } else {
        wasAppended = true;
        primaryRowNumber = Math.max(3, lastSkuRowInColA + 1);
        if (primaryRowNumber > sh1.getMaxRows()) {
          sh1.insertRowAfter(sh1.getMaxRows());
        }
        // Solo escribir Columna A (SKU en formato texto '@') y Columna D (LINK FOTO APP) para que B2 y C2 calculen solos
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      if (wasAppended) {
        try {
          const bVal = String(sh1.getRange(primaryRowNumber, 2).getDisplayValue() || '').trim();
          if (bVal) formulaResolvedName = bVal;
        } catch (eReadB) {}
      }
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }

    invalidateLoadedFileNamesCache_();
    const nextRev = bumpFotosInboxRev_();
    const recentUploads = recordFotosRecentUpload_({
      id: finalFileId,
      fileId: finalFileId,
      targetKey: skuUpper,
      targetLabel: formulaResolvedName,
      targetKind: 'SKU',
      kind: 'image',
      ext: String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
      fileName: finalFileName,
      viewUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
      destFolderName: destMeta.name,
      actorEmail: actorEmail,
      ts: Date.now()
    });

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: reuseFromLoaded
          ? 'FOTO TOMADA DE CARGADAS Y ASIGNADA EN HOJA "1"'
          : (wasAppended ? 'NUEVO SKU + FOTO ASIGNADA DESDE SUBIR PREN' : 'FOTO ACTUALIZADA EN HOJA "1" DESDE SUBIR PREN'),
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: (reuseFromLoaded ? 'Tomada de fotos cargadas hacia "' : 'Movida de SUBIR PREN a "') + destMeta.name + '" conservando nombre "' + finalFileName + '" · Guardada en Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto en Columna D.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: formulaResolvedName,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      reusedLoaded: reuseFromLoaded,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      remainingFiles: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
  } catch (errAssign) {
    try {
      registrarEventoHistorial_(getSpreadsheet_(), {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · handleFotosSubirAssign_',
        evento: 'ERROR AL ASIGNAR FOTO DESDE SUBIR A HOJA "1"',
        estado: '❌ ERROR',
        usuario: String((body && (body.advisorEmail || body.email)) || OWNER_FOTOS_EMAIL_),
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: String((body && body.sku) || ''),
        detalle: (errAssign && errAssign.message) ? errAssign.message : String(errAssign),
        analisis: analizarCausaFalloCodigo_(errAssign, 'AppsScript · handleFotosSubirAssign_', 'fotos_subir_assign')
      });
    } catch (eLogIgnore) {}
    return {
      ok: false,
      error: (errAssign && errAssign.message) ? errAssign.message : String(errAssign)
    };
  }
}

function handleFotosDirectUploadAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    const parsed = parseUploadImageDataUrl_(body && body.dataUrl, body && body.fileName, skuUpper);
    if (!parsed.ok) return parsed;

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    ensureProjectAPublicFolders_(false);

    // Acomodar siempre automáticamente según Sheets (INVENTARIO_EN_VIVO)
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || String((body && body.productName) || '').trim() || skuUpper,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };
    const destMeta = resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Adquirir ScriptLock ANTES de crear archivo en Drive para que ningún reintento genere duplicados en Drive
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let finalFileId = '';
    let finalFileName = '';
    let driveViewUrl = '';
    let previousUrl = '';
    let primaryRowNumber = 0;
    let wasAppended = false;
    let nextRev = '';
    let recentUploads = [];
    try {
      // Crear archivo directamente en su carpeta de categoría conservando exactamente el nombre con que se cargó (0 pasos por SUBIR PREN)
      const created = destFolder.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      try {
        created.setDescription(
          'SKU: ' + skuUpper +
          ' | Producto: ' + invMeta.nombre +
          ' | Categoría Drive: ' + destMeta.name +
          ' | Subido directo por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}

      finalFileId = created.getId();
      finalFileName = String(created.getName() || parsed.fileName).trim();
      driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

      const matchedRows = [];
      const lastRow1 = Math.max(2, sh1.getLastRow());
      const colARng = lastRow1 >= 3 ? sh1.getRange(3, 1, lastRow1 - 2, 1) : null;

      if (colARng && typeof colARng.createTextFinder === 'function') {
        const hits = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findAll();
        for (let h = 0; h < hits.length; h++) {
          const rNum = hits[h].getRow();
          if (rNum >= 3) {
            matchedRows.push(rNum);
            if (!previousUrl) previousUrl = String(sh1.getRange(rNum, 4).getDisplayValue() || '').trim();
          }
        }
      } else if (lastRow1 >= 3) {
        const vals1 = sh1.getRange(3, 1, lastRow1 - 2, 4).getValues();
        for (let i = 0; i < vals1.length; i++) {
          if (String(vals1[i][0] || '').trim().toUpperCase() === skuUpper) {
            matchedRows.push(i + 3);
            if (!previousUrl && vals1[i][3]) previousUrl = String(vals1[i][3]).trim();
          }
        }
      }

      if (matchedRows.length > 0) {
        primaryRowNumber = matchedRows[0];
        for (let m = 0; m < matchedRows.length; m++) {
          sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
        }
      } else {
        wasAppended = true;
        let lastNonEmptyA = 2;
        if (lastRow1 >= 3) {
          const colAVals = sh1.getRange(3, 1, lastRow1 - 2, 1).getValues();
          for (let k = colAVals.length - 1; k >= 0; k--) {
            if (String(colAVals[k][0] || '').trim()) {
              lastNonEmptyA = k + 3;
              break;
            }
          }
        }
        primaryRowNumber = Math.max(3, lastNonEmptyA + 1);
        if (primaryRowNumber > sh1.getMaxRows()) sh1.insertRowAfter(sh1.getMaxRows());
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      invalidateLoadedFileNamesCache_();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: skuUpper,
        targetLabel: invMeta.nombre,
        targetKind: 'SKU',
        kind: 'image',
        ext: parsed.ext || 'jpg',
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: destMeta.name,
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SUBIDA DIRECTA RÁPIDA EN HOJA "1"',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: 'Subida directa a "' + destMeta.name + '" conservando nombre "' + finalFileName + '" · Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: invMeta.nombre,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      timestamp: formatCancunNow_()
    };
  } catch (errDirect) {
    return {
      ok: false,
      error: (errDirect && errDirect.message) ? errDirect.message : String(errDirect)
    };
  }
}

function handleFotosUploadVisualOverride_(body) {
  try {
    const b = body || {};
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, b);
    if (!auth.ok) return auth;
    if (auth.advisor && auth.advisor.adminPermissions && auth.advisor.adminPermissions.gestionProductos === false) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado VER_GESTION_PRODUCTOS en CUENTAS ADMINISTRATIVAS.'
      };
    }
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const ovKey = String(b.overrideKey || b.sku || '').trim().toUpperCase();
    if (!ovKey || !/^V(?:COV|FAB|WOD):/i.test(ovKey) || ovKey.length > 80) {
      return { ok: false, error: 'Clave de portada/tela/madera inválida.' };
    }
    const kind = String(b.kind || (ovKey.indexOf('VFAB:') === 0 ? 'fabric' : (ovKey.indexOf('VWOD:') === 0 ? 'wood' : 'cover'))).trim().toLowerCase();
    const label = String(b.label || b.name || ovKey).trim().slice(0, 140);
    const categoryTag = kind === 'fabric' ? 'FABRIC_SWATCH' : (kind === 'wood' ? 'WOOD_SWATCH' : 'VISUAL_COVER');

    const sourceInboxFileId = String(b.sourceInboxFileId || '').trim();
    const fromLoaded = !!b.fromLoaded;
    let parsedUpload = null;
    if (sourceInboxFileId) {
      if (isForbiddenProjectBFolderId_(sourceInboxFileId)) {
        return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: carpeta no permitida.' };
      }
    } else {
      parsedUpload = parseUploadImageDataUrl_(b.dataUrl, b.fileName, label.replace(/[^a-zA-Z0-9_-]+/g, '_'));
      if (!parsedUpload.ok) return parsedUpload;
    }

    ensureProjectAPublicFolders_(false);
    const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
    ensurePublicSharingItem_(targetFolder);

    let finalFileId = '';
    let finalFileName = '';
    let createdUploadFile = null;

    if (!sourceInboxFileId) {
      // P1-01: subir binario a Drive FUERA del ScriptLock global para evitar contención;
      // si el candado de Sheets está ocupado, se revierte a papelera para que reintentos jamás dupliquen archivos.
      createdUploadFile = targetFolder.createFile(parsedUpload.blob);
      ensurePublicSharingItem_(createdUploadFile);
      try {
        createdUploadFile.setDescription(
          'Visual: ' + ovKey +
          ' | Etiqueta: ' + label +
          ' | Tipo: ' + categoryTag +
          ' | Subido por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}
      finalFileId = createdUploadFile.getId();
      finalFileName = String(createdUploadFile.getName() || parsedUpload.fileName).trim();
    }

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      if (createdUploadFile) {
        try { createdUploadFile.setTrashed(true); } catch (eRollback) {}
      }
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      if (sourceInboxFileId) {
        const srcFile = DriveApp.getFileById(sourceInboxFileId);
        const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_upload_visual_override');
        if (!srcCheck.ok) return srcCheck;
        finalFileName = String(srcFile.getName() || '').trim();
        if (!fromLoaded) {
          // Mover desde SUBIR PREN a FOTOS NUEVAS CARGADO conservando su nombre y sacándola de SUBIR PREN para no duplicar
          srcFile.moveTo(targetFolder);
          cleanDuplicatesInSubirInbox_(srcFile, finalFileName, b.shortcutId, null);
        }
        ensurePublicSharingItem_(srcFile);
        finalFileId = srcFile.getId();
      }

      const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';
      const saveRes = handleInvProductOverrideSave_({
        authToken: b.authToken || '',
        advisorEmail: b.advisorEmail || actorEmail,
        accessKey: b.accessKey || '',
        sheetTab: b.sheetTab || TAB_CUENTAS_ADMIN_,
        sku: ovKey,
        op: 'RESTORE',
        name: label,
        category: categoryTag,
        price: '',
        note: driveViewUrl
      }, { skipLock: true });
      invalidateLoadedFileNamesCache_();

      if (!saveRes || !saveRes.ok) {
        return {
          ok: false,
          fileId: finalFileId,
          driveUrl: driveViewUrl,
          error: (saveRes && saveRes.error) || 'Foto subida, pero falló guardar el vínculo.'
        };
      }

      const nextRev = bumpFotosInboxRev_();
      const recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: ovKey,
        targetLabel: label,
        targetKind: kind === 'fabric' ? 'TELA' : (kind === 'wood' ? 'MADERA' : 'PORTADA'),
        kind: 'image',
        ext: (parsedUpload && parsedUpload.ext) || String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: kind === 'fabric' ? 'Tela' : (kind === 'wood' ? 'Madera' : 'Portada'),
        actorEmail: actorEmail,
        ts: Date.now()
      });

      return {
        ok: true,
        rev: nextRev,
        recentUploads: recentUploads,
        overrideKey: ovKey,
        fileId: finalFileId,
        fileName: finalFileName,
        driveUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        override: saveRes.override,
        removedFromInbox: !!(sourceInboxFileId && !fromLoaded),
        timestamp: formatCancunNow_()
      };
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  } catch (errVisUp) {
    return {
      ok: false,
      error: (errVisUp && errVisUp.message) ? errVisUp.message : String(errVisUp)
    };
  }
}

function reubicarFotosSegunSheets_(opts) {
  const cfg = opts || {};
  const startMs = Date.now();
  const timeBudgetMs = Math.max(15000, Math.min(240000, Number(cfg.timeBudgetMs) || 45000));
  const startIndex = Math.max(0, parseInt(String(cfg.startIndex || 0), 10) || 0);
  const maxFiles = Math.max(1, Math.min(600, parseInt(String(cfg.maxFiles || 120), 10) || 120));

  const summary = {
    ok: true,
    foldersPublicUpdated: 0,
    filesChecked: 0,
    filesMoved: 0,
    filesMadePublic: 0,
    subirDuplicatesRemoved: 0,
    visualOverridesPublic: 0,
    nextStartIndex: 0,
    remaining: 0,
    errors: []
  };

  if (startIndex === 0) {
    const pubRes = ensureProjectAPublicFolders_(true);
    summary.foldersPublicUpdated = (pubRes && pubRes.updated) || 0;
  }

  const ss = getSpreadsheet_();
  const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  const sh1 = ss.getSheetByName('1');
  const invBySku = {};

  if (shInv && shInv.getLastRow() >= 3) {
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      const sk = cleanInvCell_(invVals[i][0]).toUpperCase();
      if (!sk || sk === 'SKU') continue;
      invBySku[sk] = {
        tipo: cleanInvCell_(invVals[i][1]),
        nombre: cleanInvCell_(invVals[i][3]),
        categoria: cleanInvCell_(invVals[i][6]),
        photoUrl: String(invVals[i][5] || '').trim()
      };
    }
  }

  // Agrupar por fileId -> categorías destino según Sheets
  const fileEntriesById = {};
  const orderedIds = [];
  const registerSkuFile = (skuUpper, rawUrl, colBName) => {
    const fid = extractDriveFileIdFromCell_(rawUrl);
    if (!fid || isForbiddenProjectBFolderId_(fid)) return;
    const inv = invBySku[skuUpper] || {};
    const dest = resolveCategoryDestFolderForProduct_(inv.categoria || '', inv.tipo || '', inv.nombre || colBName || skuUpper);
    if (!fileEntriesById[fid]) {
      fileEntriesById[fid] = { id: fid, destIds: {}, primaryDest: dest, isVisual: false };
      orderedIds.push(fid);
    }
    fileEntriesById[fid].destIds[dest.id] = dest;
  };

  // Priorizar primero Portadas (VCOV:) y Telas (VFAB:) guardadas en _INV_PRODUCT_OVERRIDES
  // para que siempre queden reparadas en el primer lote sin quedar detrás de miles de SKUs.
  try {
    const ovMap = readProductOverridesMap_(ss);
    Object.keys(ovMap).forEach((k) => {
      const entry = ovMap[k];
      if (!entry || entry.status === 'ELIMINADO' || entry.status === 'ARCHIVADO') return;
      const fid = extractDriveFileIdFromCell_(entry.note);
      if (!fid || isForbiddenProjectBFolderId_(fid) || fileEntriesById[fid]) return;
      fileEntriesById[fid] = {
        id: fid,
        destIds: {},
        primaryDest: { id: FOTOS_NUEVAS_CARGADO_FOLDER_ID_, name: 'FOTOS NUEVAS CARGADO' },
        isVisual: true
      };
      orderedIds.push(fid);
    });
  } catch (eOv) {}

  if (sh1 && sh1.getLastRow() >= 3 && sh1.getLastColumn() >= 4) {
    const vals1 = sh1.getRange(3, 1, sh1.getLastRow() - 2, 4).getDisplayValues();
    for (let i = 0; i < vals1.length; i++) {
      const sk = String(vals1[i][0] || '').trim().toUpperCase();
      const colB = String(vals1[i][1] || '').trim();
      const colD = String(vals1[i][3] || '').trim();
      if (sk && colD) registerSkuFile(sk, colD, colB);
    }
  }

  Object.keys(invBySku).forEach((sk) => {
    if (invBySku[sk].photoUrl) registerSkuFile(sk, invBySku[sk].photoUrl, invBySku[sk].nombre);
  });

  const resolvedInbox = resolveSubirInboxFolders_();
  const inboxMap = Object.assign({}, resolvedInbox.folderIdsMap || {});
  inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
  const folderObjCache = {};
  const getFolderCached = (fid) => {
    if (!folderObjCache[fid]) {
      folderObjCache[fid] = DriveApp.getFolderById(fid);
      ensurePublicSharingItem_(folderObjCache[fid]);
    }
    return folderObjCache[fid];
  };

  const endIndex = Math.min(orderedIds.length, startIndex + maxFiles);
  let idx = startIndex;
  for (; idx < endIndex; idx++) {
    if ((Date.now() - startMs) >= timeBudgetMs) break;
    const rec = fileEntriesById[orderedIds[idx]];
    if (!rec) continue;
    summary.filesChecked++;
    try {
      const file = DriveApp.getFileById(rec.id);
      if (!file || (file.isTrashed && file.isTrashed())) continue;
      if (isFileInForbiddenProjectBFolder_(file)) continue;

      const shareRes = ensurePublicSharingWithStatus_(file);
      if (shareRes && shareRes.changed) {
        summary.filesMadePublic++;
        if (rec.isVisual) summary.visualOverridesPublic++;
      }

      if (!isFileInProjectAAllowedFolders_(file, inboxMap)) continue;

      const parentIds = [];
      const pIt = file.getParents();
      while (pIt.hasNext()) {
        const pf = pIt.next();
        if (pf) parentIds.push(String(pf.getId() || '').trim());
      }

      const distinctDestIds = Object.keys(rec.destIds);
      const targetDestId = rec.primaryDest && rec.primaryDest.id;
      const isInSubir = parentIds.some((pid) => !!inboxMap[pid]);
      const isAlreadyInTarget = targetDestId && parentIds.indexOf(targetDestId) !== -1;

      if (rec.isVisual) {
        if (isInSubir && targetDestId) {
          const destFld = getFolderCached(targetDestId);
          file.moveTo(destFld);
          summary.filesMoved++;
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (targetDestId && distinctDestIds.length === 1 && (!isAlreadyInTarget || isInSubir)) {
        // Reubicar sin renombrar hacia la carpeta exacta de su categoría en Sheets
        const destFld = getFolderCached(targetDestId);
        file.moveTo(destFld);
        summary.filesMoved++;
        if (isInSubir) {
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (isInSubir && targetDestId) {
        // Si estaba compartida entre varias categorías pero aún seguía en SUBIR PREN, sacarla de SUBIR PREN
        const destFld = getFolderCached(targetDestId);
        if (!isAlreadyInTarget) {
          file.moveTo(destFld);
          summary.filesMoved++;
        }
        summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
      }
    } catch (eOne) {
      if (summary.errors.length < 25) {
        summary.errors.push(rec.id + ': ' + String((eOne && eOne.message) || eOne));
      }
    }
  }

  if (summary.filesMoved > 0 || summary.subirDuplicatesRemoved > 0) {
    invalidateLoadedFileNamesCache_();
    bumpFotosInboxRev_();
  }
  summary.nextStartIndex = idx < orderedIds.length ? idx : 0;
  summary.remaining = Math.max(0, orderedIds.length - idx);
  summary.checked = summary.filesChecked;
  summary.moved = summary.filesMoved;
  summary.publicFixed = summary.filesMadePublic + summary.foldersPublicUpdated;
  summary.nextIndex = summary.nextStartIndex;
  return summary;
}

function reubicarFotosSegunSheets() {
  const res = reubicarFotosSegunSheets_({ maxFiles: 500, timeBudgetMs: 240000 });
  Logger.log(JSON.stringify(res));
  return res;
}

function handleFotosReorganizeFromSheets_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;
  return reubicarFotosSegunSheets_({
    startIndex: body && body.startIndex,
    maxFiles: (body && (body.maxFiles || body.maxItems)) || 120,
    timeBudgetMs: 20000
  });
}

function handleFotosDelete_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    let driveFileId = String((body && body.driveFileId) || '').trim();
    const source = String((body && body.source) || '').trim().toUpperCase();
    const keepDriveFile = !!(body && body.keepDriveFile);
    const forceTrash = !!(body && body.forceTrash);

    if (!skuUpper && !driveFileId) {
      return { ok: false, error: 'Falta indicar SKU o ID de archivo a borrar.' };
    }

    const sh1 = ss.getSheetByName('1');
    const rowsToClear = [];
    const clearedRows = [];
    let previousUrl = '';
    let usedByOtherSku = false;
    let usedByVisualOverride = false;

    // Lectura preliminar fuera de ScriptLock para determinar driveFileId y protecciones
    if (sh1 && sh1.getLastRow() >= 3) {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();

      if (skuUpper) {
        for (let i = 2; i < vals1.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
          const cellUrl = String(vals1[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            if (!previousUrl) previousUrl = cellUrl;
            if (!driveFileId) {
              const mId = cellUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || cellUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
              if (mId && mId[1]) driveFileId = mId[1];
            }
            rowsToClear.push(rowNum);
          }
        }
      }

      if (driveFileId) {
        for (let j = 2; j < vals1.length; j++) {
          const otherSku = String(vals1[j][0] || '').trim().toUpperCase();
          const otherUrl = String(vals1[j][3] || '').trim();
          if (otherUrl && otherUrl.indexOf(driveFileId) !== -1 && (!skuUpper || otherSku !== skuUpper)) {
            usedByOtherSku = true;
            break;
          }
        }
      }
    }

    // Proteger archivos que también están referenciados por Portadas (VCOV:) o Telas (VFAB:) activas en _INV_PRODUCT_OVERRIDES
    if (driveFileId) {
      try {
        const ovMap = readProductOverridesMap_(ss);
        const ovKeys = Object.keys(ovMap);
        for (let oi = 0; oi < ovKeys.length; oi++) {
          const ov = ovMap[ovKeys[oi]];
          if (!ov || ov.status === 'ELIMINADO' || ov.status === 'ARCHIVADO') continue;
          const ovNote = String(ov.note || '');
          if (ovNote && ovNote.indexOf(driveFileId) !== -1) {
            usedByVisualOverride = true;
            break;
          }
        }
      } catch (eOvCheck) {}
    }

    // Guardia de aislamiento Proyecto A/B ANTES de modificar Drive o Hoja "1" (incluso si otro SKU comparte el archivo o keepDriveFile: true)
    const shortcutId = String((body && body.shortcutId) || '').trim();
    const deleteTargetId = (source === 'INBOX' && shortcutId) ? shortcutId : driveFileId;
    const willTrashDrive = !!(deleteTargetId && !keepDriveFile && !usedByVisualOverride && (source === 'INBOX' || forceTrash || !usedByOtherSku));
    let targetFile = null;
    if (deleteTargetId) {
      if (isForbiddenProjectBFolderId_(deleteTargetId)) {
        return {
          ok: false,
          forbiddenFolder: true,
          error: 'Aislamiento Proyecto A/B: no se permite eliminar recursos pertenecientes a carpetas exclusivas de Prompts/Odoo.'
        };
      }
      try {
        targetFile = DriveApp.getFileById(deleteTargetId);
      } catch (eLookupDel) {
        targetFile = null;
      }
      if (targetFile) {
        const delCheck = validateProjectASourceFile_(targetFile, 'fotos_delete');
        if (!delCheck.ok) {
          return delCheck;
        }
      }
    }

    // Adquirir ScriptLock corto ÚNICAMENTE para limpiar Columna D en Hoja "1"
    if (sh1 && skuUpper && rowsToClear.length > 0) {
      const lockState = acquireScriptLockSafe_(15000);
      if (!lockState.ok) {
        return {
          ok: false,
          retryable: true,
          error: 'Otro guardado está en curso, reintentando...'
        };
      }
      const lock = lockState.lock;
      try {
        const curLast = Math.max(sh1.getLastRow(), 3);
        const curVals = sh1.getRange(1, 1, curLast, 4).getDisplayValues();
        for (let i = 2; i < curVals.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(curVals[i][0] || '').trim().toUpperCase();
          const cellUrl = String(curVals[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            sh1.getRange(rowNum, 4).clearContent();
            clearedRows.push(rowNum);
          }
        }
        if (clearedRows.length > 0) SpreadsheetApp.flush();
      } finally {
        try { lock.releaseLock(); } catch (eRel) {}
      }
    }

    let driveTrashed = false;
    let deletedFileName = '';
    if (willTrashDrive && targetFile) {
      try {
        deletedFileName = String(targetFile.getName() || '');
        try {
          targetFile.setTrashed(true);
          driveTrashed = true;
        } catch (eTrash) {
          // Si el archivo pertenece a otro propietario en carpeta compartida, quitarlo solo de carpetas permitidas
          const pIt = targetFile.getParents();
          while (pIt.hasNext()) {
            try {
              const pf = pIt.next();
              if (!isForbiddenProjectBFolderId_(pf.getId()) && !isFolderOrAncestorForbiddenProjectB_(pf, 8)) {
                pf.removeFile(targetFile);
                driveTrashed = true;
              }
            } catch (eRemP) {}
          }
        }
      } catch (eGetFile) {}
    }

    try { invalidateLoadedFileNamesCache_(); } catch (eInvCacheDel) {}
    const nextRev = bumpFotosInboxRev_();
    const recentUploads = removeFotosRecentUploadByFileId_(driveFileId);

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: skuUpper ? 'FOTO BORRADA DE HOJA "1" (COLUMNA D)' : 'FOTO BORRADA DE SUBIR PREN',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper ? (skuUpper + (clearedRows.length ? (' · Fila ' + clearedRows.join(',')) : '')) : (deletedFileName || driveFileId),
        detalle: (skuUpper ? ('Limpiada Columna D en Hoja "1" para SKU ' + skuUpper + (previousUrl ? (' (' + previousUrl + ')') : '')) : ('Eliminado archivo Drive ' + (deletedFileName || driveFileId))) + (driveTrashed ? ' · Archivo enviado a papelera Drive.' : (usedByVisualOverride ? ' · Archivo conservado en Drive (usado por Portada/Tela).' : '')),
        analisis: 'Fórmulas maestras B2:F2 intactas.'
      });
    } catch (eHistDel) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      clearedSku: skuUpper,
      clearedRows: clearedRows,
      deletedFileId: driveFileId,
      deletedFileName: deletedFileName,
      driveTrashed: driveTrashed,
      usedByOtherSku: usedByOtherSku,
      usedByVisualOverride: usedByVisualOverride,
      remainingFiles: (body && body.skipListReturn) ? [] : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
  } catch (errDel) {
    return {
      ok: false,
      error: (errDel && errDel.message) ? errDel.message : String(errDel)
    };
  }
}

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

function isFileAllowedForOverrideShareParche_(drvFile) {
  if (!drvFile) return false;
  if (typeof isFileInAllowedOverrideShareFolder_ === 'function') {
    return isFileInAllowedOverrideShareFolder_(drvFile);
  }
  if (isFileInForbiddenProjectBFolder_(drvFile)) return false;
  if (typeof isFileInProjectAAllowedFolders_ === 'function' && isFileInProjectAAllowedFolders_(drvFile)) {
    return true;
  }
  const extraAllowed = {
    '1iSJztVhhrNvopTdX5sDcLSolhSnK_VAy': true, // TELAS ODOO
    '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT': true, // CONFIG.DRIVE_FOLDER_ID
    '1wRhGgjmvRdRG-uVM8WgULScn6hBDmksm': true, // FONDO BLANCO Y SISTEMA
    '1h0EYNwxabLWFeWt_KECi18WMmdDGwSeh': true  // MUEBLES FALTANTES ODOO
  };
  try {
    const pIt = drvFile.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (pid && extraAllowed[pid]) return true;
    }
  } catch (ePar) {}
  return false;
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

  // Permiso de lectura Drive fuera de ScriptLock y restringido únicamente a carpetas autorizadas de Proyecto A / TELAS ODOO (P1-19)
  const rawCandidateNote = (b.note !== undefined) ? sanitizeOverrideTextCell_(b.note, 220) : '';
  if (op !== 'DELETE' && op !== 'ARCHIVE' && rawCandidateNote) {
    try {
      const noteFid = extractDriveFileIdFromCell_(rawCandidateNote);
      if (noteFid && typeof DriveApp !== 'undefined' && DriveApp && typeof DriveApp.getFileById === 'function' && !isForbiddenProjectBFolderId_(noteFid)) {
        const drvFile = DriveApp.getFileById(noteFid);
        if (drvFile && isFileAllowedForOverrideShareParche_(drvFile)) {
          ensurePublicSharingItem_(drvFile);
        }
      }
    } catch (eEnsureVis) {}
  }

  let lock = null;
  const skipLockInternal = !!(optsInternal && optsInternal.skipLock === true);
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
      ? rawCandidateNote
      : (existingRow ? String(existingRow[5] || '').trim() : '');
    const nowStr = formatCancunNow_();

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
