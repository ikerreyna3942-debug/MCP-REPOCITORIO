// ============================================================================
// CREATA · Parche ligero para celular (App de Fotos + Drive público + Sheets)
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

    // Acciones autenticadas de inventario, cotización en vivo S Mueblería y seguimiento
    if (action === 'inv_log_event') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_log', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvLogEvent_(body));
    }
    if (action === 'seg_action') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_seg_act', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegAction_(body));
    }
    if (action === 'seg_get_state') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'seg_state', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
      return jsonResponse_(handleSegGetState_(body));
    }
    if (action === 'seg_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_login') {
      const loginEmailKey = String((body && body.email) || 'anon').trim().toLowerCase();
      if (!checkRateLimitSilent_('post_login:' + loginEmailKey, 20, 600)) {
        return jsonResponse_({ ok: false });
      }
      return jsonResponse_(handleInvLogin_(body));
    }
    if (action === 'inv_guest_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_hb', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvGuestHeartbeat_(body));
    }
    if (action === 'inv_presence_heartbeat') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_pres_hb', maxHits: 60, windowSec: 60 });
      if (!gate.ok) {
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_hb_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_({ ok: false, error: 'Demasiadas solicitudes. Intenta en unos segundos.' });
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
        const reqEmailNorm = String((body && (body.advisorEmail || body.email || body.correo)) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(reqEmailNorm && body && String(body.accessKey || '').trim());
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada o token de presencia inválido.' });
        }
        if (!checkRateLimitSilent_('post_pres_list_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_({ ok: false, error: 'Demasiadas solicitudes. Intenta en unos segundos.' });
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
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_mysess', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvMySessions_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_revoke_session') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_revsess', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvRevokeSession_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_overrides_get') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_ovr_get', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      try {
        return jsonResponse_(handleInvProductOverridesGet_(body));
      } catch (err) {
        return jsonResponse_({ ok: false });
      }
    }
    if (action === 'inv_product_override_save') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_ovr_save', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      try {
        if (!body.authToken) body.authToken = extractAuthTokenFromRequest_(e, body);
        return jsonResponse_(handleInvProductOverrideSave_(body));
      } catch (err) {
        return jsonResponse_({ ok: false, error: (err && err.message) ? err.message : 'Error al guardar producto.' });
      }
    }
    if (action === 'inv_ensure_invitados') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      const shGuest = ensureInvitadosSheet_(getSpreadsheet_());
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
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvSubmitQuote_(body));
    }
    if (action === 'inv_my_quotes') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: false, rateBucket: 'post_myq', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvMyQuotes_(body));
    }
    if (action === 'inv_download_erp_quote_pdf') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_pdf', maxHits: 30, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvDownloadErpQuotePdf_(body));
    }
    if (action === 'inv_search_erp_clients') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_s', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvSearchErpClients_(body));
    }
    if (action === 'inv_create_erp_client') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_cli_c', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvCreateErpClient_(body));
    }
    if (action === 'inv_upload_product_photo') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_photo', maxHits: 40, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvUploadProductPhoto_(body));
    }
    if (action === 'inv_plantilla_status') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_plantilla', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvPlantillaStatus_());
    }
    if (action === 'inv_record_search') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_search', maxHits: 60, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvRecordSearch_(body));
    }
    if (action === 'inv_top_searched') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: true, allowAdminPin: true, rateBucket: 'post_top', maxHits: 45, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(handleInvTopSearched_());
    }
    if (action === 'inv_ensure_precio_lista') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      const resCol = asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true, force: true });
      return jsonResponse_(Object.assign({ ok: true }, resCol));
    }
    if (action === 'inv_erp_sync_now') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_erp_sync', maxHits: 15, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      const syncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true });
      ensureLiveErpSyncTrigger_();
      return jsonResponse_(Object.assign({ ok: true }, syncRes));
    }
    if (action === 'inv_autocomplete_sort') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: true, rateBucket: 'post_maint', maxHits: 20, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      const resAuto = autocompletarYOrdenarInventarioEnVivo_(getSpreadsheet_(), { silentUi: true, force: true });
      asegurarColumnaPrecioListaInventario_(getSpreadsheet_(), { silentUi: true });
      return jsonResponse_(Object.assign({ ok: true }, resAuto));
    }
    if (action === 'inv_repair_photo_permissions') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_repair_perms', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
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
      const fotosMaxHits = action === 'fotos_sync_skus' ? 30 : 60;
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, allowAdminPin: false, rateBucket: 'post_fotos', maxHits: fotosMaxHits, windowSec: 60 });
      let shouldMintFreshToken = false;
      if (!gate.ok) {
        const reqEmailNorm = String((body && body.advisorEmail) || '').trim().toLowerCase().replace(/,/g, '.');
        const hasKeyFallback = Boolean(body && String(body.accessKey || '').trim() && reqEmailNorm === OWNER_FOTOS_EMAIL_);
        if (!hasKeyFallback) {
          return jsonResponse_({ ok: false, authRequired: true, error: 'Sesión expirada. Ingresa tu contraseña.' });
        }
        if (!checkRateLimitSilent_('post_fotos_key:' + reqEmailNorm, 20, 60)) {
          return jsonResponse_({ ok: false, error: 'Demasiadas solicitudes. Intenta en unos segundos.' });
        }
        shouldMintFreshToken = true;
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
          fotosRes.renewedAuthToken = issueInvAuthToken_(OWNER_FOTOS_EMAIL_, 'PROYECTOS');
        } catch (eMint) {}
      }
      return jsonResponse_(fotosRes);
    }
    if (action === 'inv_setup_accounts') {
      const gate = authorizePrivateTokenOrPin_(e, body, { allowGuest: false, requireAdmin: true, allowAdminPin: true, rateBucket: 'post_setup', maxHits: 10, windowSec: 60 });
      if (!gate.ok) return jsonResponse_({ ok: false });
      return jsonResponse_(organizarCuentasYDescuentosEnHojas({ silentUi: true }));
    }

    const adminPin = getProp_('ADMIN_PIN');
    if (adminPin && String(body.pin || '') !== adminPin) {
      return jsonResponse_({ ok: false, error: 'PIN de administrador incorrecto' });
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
          detalle: (err && err.message) ? err.message : String(err),
          analisis: analizarCausaFalloCodigo_(err, 'AppsScript · doPost', parsedAction)
        });
      } catch (eHistIgnore) {}
    }
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function handleInvUploadProductPhoto_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
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
        error: 'Tu cuenta de Invitado (Solo Ver) no tiene permisos para subir fotografías.'
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

    // Organizar copia automáticamente en la carpeta de categoría correspondiente (excepto Portadas/Telas que van en 1 sola carpeta sin duplicarse)
    let categoryFolderId = '';
    let categoryFolderName = '';
    const skipCategoryCopy = !!(body && body.skipCategoryCopy) || /^V(?:COV|FAB):/i.test(skuUpper);
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
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function ensurePublicSharingItem_(item) {
  if (!item) return false;
  try {
    if (typeof item.getSharingAccess === 'function') {
      const access = item.getSharingAccess();
      if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
        return true;
      }
    }
    if (typeof item.setSharing === 'function') {
      item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return true;
    }
  } catch (eShare) {}
  return false;
}

function ensureProjectAPublicFolders_(forceNow) {
  try {
    if (!forceNow) {
      const cached = CacheService.getScriptCache().get('CREATA_PA_PUBLIC_FOLDERS_OK_V1');
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
    CacheService.getScriptCache().put('CREATA_PA_PUBLIC_FOLDERS_OK_V1', '1', 600);
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

    // 2) Si venía de un acceso directo en SUBIR PREN, enviar a papelera únicamente ese acceso directo
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

    // 3) Eliminar copias duplicadas residuales con el mismo nombre exacto ÚNICAMENTE dentro de SUBIR PREN
    const normOrig = String(origName || '').trim().toLowerCase();
    if (normOrig) {
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
            if (!cid || cid === movedId || isForbiddenProjectBFolderId_(cid)) continue;
            const cMime = String((cand.getMimeType && cand.getMimeType()) || '').toLowerCase();
            const isTargetShortcut = cMime === 'application/vnd.google-apps.shortcut' && String((cand.getTargetId && cand.getTargetId()) || '').trim() === movedId;
            const sameNameInInbox = String((cand.getName && cand.getName()) || '').trim().toLowerCase() === normOrig;
            if (isTargetShortcut || sameNameInInbox) {
              try {
                // Solo borrar si vive únicamente en SUBIR PREN (nunca tocar si también vive en una carpeta de categoría)
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
      const cached = CacheService.getScriptCache().get('CREATA_PA_LOADED_NAMES_V1');
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
    if (serialized.length < 95000) {
      CacheService.getScriptCache().put('CREATA_PA_LOADED_NAMES_V1', serialized, 300);
    }
  } catch (ePut) {}
  return map;
}

function invalidateLoadedFileNamesCache_() {
  try { CacheService.getScriptCache().remove('CREATA_PA_LOADED_NAMES_V1'); } catch (e) {}
}

function resolveSubirInboxFolders_() {
  const folders = [];
  const folderIdsMap = {};
  let primaryFolder = null;

  function addFolderSafe(folderObj) {
    if (!folderObj) return;
    try {
      if (folderObj.isTrashed && folderObj.isTrashed()) return;
      const fid = String(folderObj.getId() || '').trim();
      if (!fid || folderIdsMap[fid]) return;
      if (isForbiddenProjectBFolderId_(fid) || isFolderOrAncestorForbiddenProjectB_(folderObj, 8)) return;
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
  ensureProjectAPublicFolders_(false);
  const resolved = resolveSubirInboxFolders_();
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
        if (isFileInForbiddenProjectBFolder_(f)) continue;
        if (!isFileInProjectAAllowedFolders_(f, inboxMap)) continue;
        const name = String(f.getName() || '').trim();
        const isImg = mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/i.test(name);
        if (!isImg) continue;
        seenFileIds[fid] = true;
        if ((Date.now() - startListMs) < 2500) {
          ensurePublicSharingItem_(f);
        }
        const updated = f.getLastUpdated();
        rawItems.push({
          fileObj: f,
          id: fid,
          shortcutId: shortcutId,
          name: name,
          mimeType: mime.indexOf('image/') === 0 ? mime : 'image/jpeg',
          sizeBytes: Number(f.getSize() || 0) || 0,
          updatedAt: updated ? updated.toISOString() : ''
        });
      } catch (eItem) {}
    }
  }

  rawItems.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const files = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const f = item.fileObj;
    let thumbDataUrl = '';
    if (includeThumbs && i < 16) {
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
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      updatedAt: item.updatedAt,
      viewUrl: 'https://drive.google.com/file/d/' + item.id + '/view?usp=sharing',
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + item.id + '=w800',
      thumbDataUrl: thumbDataUrl
    });
  }
  return files;
}

function handleFotosSubirList_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  ensureProjectAPublicFolders_(false);

  let pendingDeletesProcessed = false;
  if (body && body.pendingDeletes && typeof body.pendingDeletes === 'object') {
    const startPendMs = Date.now();
    const MAX_PEND_MS = 8000;
    try {
      const pd = body.pendingDeletes;
      const pSkus = Array.isArray(pd.skus) ? pd.skus : [];
      const pFiles = Array.isArray(pd.fileIds) ? pd.fileIds : [];
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

  const resolved = resolveSubirInboxFolders_();
  const primaryId = (resolved.primaryFolder && resolved.primaryFolder.getId()) || SUBIR_INBOX_FOLDER_ID_;
  const files = listSubirInboxFilesInternal_({ includeThumbs: !!(body && body.includeThumbs) });
  const loadedFileNames = (body && body.includeLoadedNames) ? collectLoadedFileNamesMap_(false) : undefined;
  return {
    ok: true,
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
  const auth = verifyExclusiveKevinOwner_(null, body);
  if (!auth.ok) return auth;

  const parsed = parseUploadImageDataUrl_(body && body.dataUrl, body && body.fileName, 'foto-' + Date.now());
  if (!parsed.ok) return parsed;

  ensureProjectAPublicFolders_(false);
  const resolved = resolveSubirInboxFolders_();
  const inbox = resolved.primaryFolder || DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
  ensurePublicSharingItem_(inbox);
  const created = inbox.createFile(parsed.blob);
  ensurePublicSharingItem_(created);
  const fid = created.getId();
  return {
    ok: true,
    file: {
      id: fid,
      name: created.getName(),
      mimeType: parsed.mime,
      sizeBytes: Number(created.getSize() || 0) || 0,
      updatedAt: new Date().toISOString(),
      viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + fid + '=w800'
    },
    files: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_()
  };
}

function handleFotosSubirAssign_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;

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

    // Localizar fila(s) del SKU en la hoja "1" (respetando Fila 1 encabezados y Fila 2 ARRAYFORMULA)
    const maxScanRows = Math.max(sh1.getLastRow(), 3);
    const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();
    const matchedRows = [];
    let lastSkuRowInColA = 2; // Nunca escribir en fila 1 ni fila 2 (fórmulas maestras)
    let sheetProductName = '';
    let previousUrl = '';
    let isUsedByOtherSku = false;

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
        } else if (cellUrl && cellUrl.indexOf(driveFileId) !== -1) {
          isUsedByOtherSku = true;
        }
      }
    }

    const effectiveName = sheetProductName || invMeta.nombre || providedName || skuUpper;

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
        ' | Asignado por: ' + OWNER_FOTOS_EMAIL_ +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = file.getId();
    const finalFileName = String(file.getName() || preservedFileName).trim();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Escribir URL en Columna D de la hoja "1" sin tocar jamás las fórmulas de Fila 2 (B2, C2, E2, F2)
    let primaryRowNumber = 0;
    let wasAppended = false;
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
      // Solo escribir Columna A (SKU) y Columna D (LINK FOTO APP) para que B2 y C2 calculen solos
      sh1.getRange(primaryRowNumber, 1).setValue(skuUpper);
      sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
    }

    SpreadsheetApp.flush();
    invalidateLoadedFileNamesCache_();
    let formulaResolvedName = effectiveName;
    if (wasAppended) {
      try {
        const bVal = String(sh1.getRange(primaryRowNumber, 2).getDisplayValue() || '').trim();
        if (bVal) formulaResolvedName = bVal;
      } catch (eReadB) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: reuseFromLoaded
          ? 'FOTO TOMADA DE CARGADAS Y ASIGNADA EN HOJA "1"'
          : (wasAppended ? 'NUEVO SKU + FOTO ASIGNADA DESDE SUBIR PREN' : 'FOTO ACTUALIZADA EN HOJA "1" DESDE SUBIR PREN'),
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: (reuseFromLoaded ? 'Tomada de fotos cargadas hacia "' : 'Movida de SUBIR PREN a "') + destMeta.name + '" conservando nombre "' + finalFileName + '" · Guardada en Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto en Columna D.'
      });
    } catch (eHist) {}

    return {
      ok: true,
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
        usuario: OWNER_FOTOS_EMAIL_,
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
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleFotosDirectUploadAssign_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;

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

    // Crear archivo directamente en su carpeta de categoría conservando exactamente el nombre con que se cargó (0 pasos por SUBIR PREN)
    const created = destFolder.createFile(parsed.blob);
    ensurePublicSharingItem_(created);
    try {
      created.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + invMeta.nombre +
        ' | Categoría Drive: ' + destMeta.name +
        ' | Subido directo por: ' + OWNER_FOTOS_EMAIL_ +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = created.getId();
    const finalFileName = String(created.getName() || parsed.fileName).trim();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Búsqueda rápida en Col A de Hoja "1" (protegiendo Fila 1 encabezados y Fila 2 fórmulas maestras)
    const matchedRows = [];
    let previousUrl = '';
    let primaryRowNumber = 0;
    let wasAppended = false;
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
      sh1.getRange(primaryRowNumber, 1).setValue(skuUpper);
      sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
    }

    SpreadsheetApp.flush();
    invalidateLoadedFileNamesCache_();

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SUBIDA DIRECTA RÁPIDA EN HOJA "1"',
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: 'Subida directa a "' + destMeta.name + '" conservando nombre "' + finalFileName + '" · Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto.'
      });
    } catch (eHist) {}

    return {
      ok: true,
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
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleFotosUploadVisualOverride_(body) {
  const b = body || {};
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, b);
  if (!auth.ok) return auth;

  const ovKey = String(b.overrideKey || b.sku || '').trim().toUpperCase();
  if (!ovKey || !/^V(?:COV|FAB):/i.test(ovKey) || ovKey.length > 60) {
    return { ok: false, error: 'Clave de portada/tela inválida.' };
  }
  const kind = String(b.kind || (ovKey.indexOf('VFAB:') === 0 ? 'fabric' : 'cover')).trim().toLowerCase();
  const label = String(b.label || b.name || ovKey).trim().slice(0, 140);
  const categoryTag = kind === 'fabric' ? 'FABRIC_SWATCH' : 'VISUAL_COVER';

  ensureProjectAPublicFolders_(false);
  const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
  ensurePublicSharingItem_(targetFolder);

  let finalFileId = '';
  let finalFileName = '';
  const sourceInboxFileId = String(b.sourceInboxFileId || '').trim();
  const fromLoaded = !!b.fromLoaded;

  if (sourceInboxFileId) {
    if (isForbiddenProjectBFolderId_(sourceInboxFileId)) {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: carpeta no permitida.' };
    }
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
  } else {
    const parsed = parseUploadImageDataUrl_(b.dataUrl, b.fileName, label.replace(/[^a-zA-Z0-9_-]+/g, '_'));
    if (!parsed.ok) return parsed;
    const created = targetFolder.createFile(parsed.blob);
    ensurePublicSharingItem_(created);
    try {
      created.setDescription(
        'Visual: ' + ovKey +
        ' | Etiqueta: ' + label +
        ' | Tipo: ' + categoryTag +
        ' | Subido por: ' + OWNER_FOTOS_EMAIL_ +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}
    finalFileId = created.getId();
    finalFileName = String(created.getName() || parsed.fileName).trim();
  }

  const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';
  const saveRes = handleInvProductOverrideSave_({
    authToken: b.authToken || '',
    advisorEmail: b.advisorEmail || OWNER_FOTOS_EMAIL_,
    accessKey: b.accessKey || '',
    sheetTab: b.sheetTab || 'PROYECTOS',
    sku: ovKey,
    op: 'RESTORE',
    name: label,
    category: categoryTag,
    price: '',
    note: driveViewUrl
  });
  invalidateLoadedFileNamesCache_();

  if (!saveRes || !saveRes.ok) {
    return {
      ok: false,
      fileId: finalFileId,
      driveUrl: driveViewUrl,
      error: (saveRes && saveRes.error) || 'Foto subida, pero falló guardar el vínculo.'
    };
  }

  return {
    ok: true,
    overrideKey: ovKey,
    fileId: finalFileId,
    fileName: finalFileName,
    driveUrl: driveViewUrl,
    thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
    override: saveRes.override,
    removedFromInbox: !!(sourceInboxFileId && !fromLoaded),
    timestamp: formatCancunNow_()
  };
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

  // Incluir también Portadas (VCOV:) y Telas (VFAB:) guardadas en _INV_PRODUCT_OVERRIDES
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

      if (ensurePublicSharingItem_(file)) {
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

  if (summary.filesMoved > 0) invalidateLoadedFileNamesCache_();
  summary.nextStartIndex = idx < orderedIds.length ? idx : 0;
  summary.remaining = Math.max(0, orderedIds.length - idx);
  summary.checked = summary.filesChecked;
  summary.moved = summary.filesMoved;
  summary.publicFixed = summary.filesMadePublic + summary.foldersPublicUpdated + summary.visualOverridesPublic;
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
      '1CI3J-86sx9aCW6RX-i1k26mJ52xT_Nyw'
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

  // 2) IDs únicos leídos EN SOLO LECTURA desde INVENTARIO_EN_VIVO Col F, Hoja '1' Col D y _INV_PRODUCT_OVERRIDES (Portadas/Telas)
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
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY);
    if (shInv && shInv.getLastRow() >= 4) {
      const colF = shInv.getRange(4, 6, shInv.getLastRow() - 3, 1).getDisplayValues();
      for (let i = 0; i < colF.length; i++) addFileId(colF[i][0]);
    }
    const sh1 = ss.getSheetByName('1');
    if (sh1 && sh1.getLastRow() >= 2 && sh1.getLastColumn() >= 4) {
      const colD = sh1.getRange(2, 4, sh1.getLastRow() - 1, 1).getDisplayValues();
      for (let i = 0; i < colD.length; i++) addFileId(colD[i][0]);
    }
    const shOv = ss.getSheetByName(INV_PRODUCT_OVERRIDES_TAB_);
    if (shOv && shOv.getLastRow() >= 2 && shOv.getLastColumn() >= 6) {
      const colNote = shOv.getRange(2, 6, shOv.getLastRow() - 1, 1).getDisplayValues();
      for (let i = 0; i < colNote.length; i++) addFileId(colNote[i][0]);
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
