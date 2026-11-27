import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

test('Guest floating menu markup & CSS styles exist in inventario.html and inventario-ui.css', () => {
  const html = fs.readFileSync('inventario.html', 'utf8');
  assert(html.includes('id="fabUploadPhotoBtn"'), 'Missing #fabUploadPhotoBtn');
  assert(html.includes('id="fabGuestSessionsBtn"'), 'Missing #fabGuestSessionsBtn');
  assert(html.includes('id="fabGuestPasswordBtn"'), 'Missing #fabGuestPasswordBtn');
  assert(html.includes('id="fabLogoutBtn"'), 'Missing #fabLogoutBtn');
  assert(html.includes("openSettingsModal('sessions')"), '#fabGuestSessionsBtn must open settings focused on sessions');
  assert(html.includes("openSettingsModal('password')"), '#fabGuestPasswordBtn must open settings focused on password');
  assert(html.includes('Cerrar sesiones en otros dispositivos'), 'Missing guest sessions button label');
  assert(html.includes('Cambiar contraseña'), 'Missing guest password button label');
  assert(html.includes('Subir foto'), 'Missing upload photo button label');
  assert(html.includes('Salir'), 'Missing Salir button label');
  assert(!html.includes('id="headerLogoutBtn"'), 'Salir button must not appear on main header');
  assert(!html.includes('class="inv-guest-exit"'), 'Guest Salir button must not appear on main header');

  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  assert(css.includes('#invFabRoot .inv-fab-item-danger'), 'Missing .inv-fab-item-danger CSS rule');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert(depth >= 0, 'Unmatched } in inventario-ui.css');
  }
  assert.strictEqual(depth, 0, 'Unbalanced braces in inventario-ui.css');
});

test('Frontend inventario-app.js: guest FAB controls, unified deviceId, and strict section isolation', () => {
  const src = fs.readFileSync('inventario-app.js', 'utf8');
  assert(src.includes('function getActiveSessionDeviceId('), 'Missing getActiveSessionDeviceId()');
  assert(src.includes("const fabGuestSessionsBtn = document.getElementById('fabGuestSessionsBtn')"), 'renderAdvisorHeaderBar must toggle #fabGuestSessionsBtn');
  assert(src.includes("const fabGuestPasswordBtn = document.getElementById('fabGuestPasswordBtn')"), 'renderAdvisorHeaderBar must toggle #fabGuestPasswordBtn');
  assert(src.includes("const fabLogoutBtn = document.getElementById('fabLogoutBtn')"), 'renderAdvisorHeaderBar must toggle #fabLogoutBtn');
  assert(src.includes('function syncGuestSlotMetaFromSessionResponse('), 'Missing syncGuestSlotMetaFromSessionResponse()');
  assert(src.includes("window.openSettingsModal = function (focusSection)"), 'openSettingsModal must accept focusSection');

  // Verify canManageProductPhotos blocks SOLO LECTURA guests (P1-04) and still requires completed login
  const cmpMatch = src.match(/function canManageProductPhotos\(\)\s*\{[\s\S]*?\n\s*\}/);
  assert(cmpMatch, 'Missing canManageProductPhotos()');
  assert(cmpMatch[0].includes('isGuestSession'), 'canManageProductPhotos must block SOLO LECTURA guests (P1-04)');
  assert(cmpMatch[0].includes('activeAdvisorSession.mustChangeKey'), 'canManageProductPhotos must still require completed login');

  // Verify renderAdvisorHeaderBar keeps quotes/seguimiento/admin/upload controls properly gated for guests and non-admin userPermissions (P1-05)
  assert(src.includes("const canSeeCotizador = !guestMode && (effectiveAdmin ? hasAdminPerm('cotizador') : (!nonAdminUserPerms || nonAdminUserPerms.cotizador !== false));"));
  assert(src.includes("const canSeeSeguimiento = !guestMode && (effectiveAdmin ? hasAdminPerm('seguimiento') : (!nonAdminUserPerms || nonAdminUserPerms.seguimiento !== false));"));
  assert(src.includes('if (fabQuoteBtn) fabQuoteBtn.classList.toggle(\'hidden\', !canSeeCotizador);'));
  assert(src.includes('if (fabSeguimientoBtn) fabSeguimientoBtn.classList.toggle(\'hidden\', !canSeeSeguimiento);'));
  assert(src.includes('if (fabUploadPhotoBtn) fabUploadPhotoBtn.classList.toggle(\'hidden\', !canUploadDrivePhotos);'));
  assert(src.includes('if (fabGuestSessionsBtn) fabGuestSessionsBtn.classList.toggle(\'hidden\', !isAuthed || !guestMode);'));
  assert(src.includes('if (fabGuestPasswordBtn) fabGuestPasswordBtn.classList.toggle(\'hidden\', !isAuthed || !guestMode);'));
  assert(src.includes('if (fabLogoutBtn) fabLogoutBtn.classList.toggle(\'hidden\', !isAuthed);'));

  // Verify password change & session endpoints use getActiveSessionDeviceId()
  assert(!src.includes('deviceId: getInvPresenceDeviceId()'), 'Session/password/presence endpoints should use getActiveSessionDeviceId()');
});

test('Apps Script backend: guest sessions, Col J revocation, heartbeat kickout, re-login, password change, photo upload, and strict read-only guardrails', () => {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map([['INV_AUTH_SECRET', 'guest-test-hmac-secret-key-9876543210']]);
  const scriptCache = new Map();
  const uploadedFiles = [];
  const auditLogs = [];

  // Mock INVITADOS sheet with 1 guest allowed 2 devices
  const invitadosRows = [
    ['NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'DISPOSITIVOS PERMITIDOS', 'LUGARES ACTIVOS', 'DISPOSITIVOS AUTORIZADOS'],
    ['1', 'SOLO LECTURA', 'Cliente VIP', 'INVITADO (SOLO VER)', 'invitado@cliente.com', '', 'ClaveVip1', 2, '0 / 2', '']
  ];

  function makeCellProxy(rowIdx, colIdx, numRows, numCols) {
    const proxy = {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const row = invitadosRows[rowIdx - 1 + r] || [];
          const slice = [];
          for (let c = 0; c < numCols; c++) slice.push(row[colIdx - 1 + c] ?? '');
          out.push(slice);
        }
        return out;
      },
      getDisplayValues() {
        return this.getValues().map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))));
      },
      setValue(v) {
        while (invitadosRows.length < rowIdx) invitadosRows.push([]);
        invitadosRows[rowIdx - 1][colIdx - 1] = v;
        return proxy;
      },
      clearContent() {
        if (invitadosRows[rowIdx - 1]) invitadosRows[rowIdx - 1][colIdx - 1] = '';
        return proxy;
      },
      setNumberFormat() { return proxy; },
      setHorizontalAlignment() { return proxy; },
      setFontWeight() { return proxy; }
    };
    return proxy;
  }

  const fakeInvitadosSheet = {
    getName: () => 'INVITADOS',
    getLastRow: () => invitadosRows.length,
    getMaxColumns: () => 10,
    insertColumnsAfter() {},
    getRange: (r, c, nr = 1, nc = 1) => makeCellProxy(r, c, nr, nc)
  };

  const fakeSs = {
    getSheetByName: (name) => (String(name || '').toUpperCase() === 'INVITADOS' ? fakeInvitadosSheet : null),
    getSheets: () => [fakeInvitadosSheet]
  };

  const makeMockFile = (id, name) => ({
    _id: id,
    _name: name,
    _desc: '',
    getId: () => id,
    setDescription(d) { this._desc = d; },
    setSharing() {},
    makeCopy(copyName, folder) {
      const c = makeMockFile(id + '_copy_' + (folder && folder.getId ? folder.getId() : 'cat'), copyName);
      uploadedFiles.push({ folderId: folder && folder.getId ? folder.getId() : '', file: c });
      return c;
    }
  });

  const makeMockFolder = (fid) => ({
    getId: () => fid,
    setSharing() {},
    createFile(blob) {
      const f = makeMockFile('file_' + (uploadedFiles.length + 1), blob.getName ? blob.getName() : 'photo.jpg');
      uploadedFiles.push({ folderId: fid, file: f });
      return f;
    }
  });

  const hmacFn = (payload, secret) => Array.from(crypto.createHmac('sha256', String(secret || '')).update(String(payload || ''), 'utf8').digest());

  const sandbox = {
    Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error, isFinite, parseInt,
    CacheService: {
      getScriptCache: () => ({
        get: (k) => scriptCache.get(k) ?? null,
        put: (k, v) => { scriptCache.set(k, String(v)); },
        remove: (k) => { scriptCache.delete(k); }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProps.get(k) ?? null,
        setProperty: (k, v) => { scriptProps.set(k, String(v)); },
        deleteProperty: (k) => { scriptProps.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} })
    },
    SpreadsheetApp: { flush: () => {} },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: (id) => makeMockFolder(id),
      createFile: (blob) => makeMockFile('file_root', blob.getName ? blob.getName() : 'photo.jpg')
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({ _text: txt, setMimeType() { return this; } })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, txt) => Array.from(crypto.createHash('sha256').update(String(txt || ''), 'utf8').digest()),
      computeHmacSha256Signature: hmacFn,
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: (str) => Array.from(Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      base64Decode: (str) => Array.from(Buffer.from(String(str), 'base64')),
      newBlob: (data, mime, name) => ({
        getName: () => name || '',
        getBytes: () => Array.from(Buffer.from(String(data), 'utf8')),
        getDataAsString: () => Buffer.from(data).toString('utf8')
      })
    }
  };

  vm.runInNewContext(gsSrc, sandbox, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });
  sandbox.getSpreadsheet_ = () => fakeSs;
  sandbox.ensureInvitadosSheet_ = () => fakeInvitadosSheet;
  sandbox.formatCancunNow_ = () => '21/11/2026 10:00:00';
  sandbox.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: [] });
  sandbox.sincronizarPasswordEnHojaSeguimiento_ = () => {};
  sandbox.registrarEventoHistorial_ = (_ss, ev) => { auditLogs.push(ev); };

  const callPost = (payload) => JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify(payload) }
  })._text);

  // 1) Guest logs in on Phone + Laptop (fills 2 / 2 slots)
  const loginPhone = callPost({
    action: 'inv_login',
    email: 'invitado@cliente.com',
    accessKey: 'ClaveVip1',
    deviceId: 'dev_guest_phone_1',
    deviceLabel: 'iPhone Safari'
  });
  assert.equal(loginPhone.ok, true);
  assert.equal(loginPhone.user.isGuest, true);
  assert.equal(loginPhone.user.guestActivePlaces, 1);

  const loginLaptop = callPost({
    action: 'inv_login',
    email: 'invitado@cliente.com',
    accessKey: 'ClaveVip1',
    deviceId: 'dev_guest_laptop_2',
    deviceLabel: 'Windows Chrome'
  });
  assert.equal(loginLaptop.ok, true);
  assert.equal(loginLaptop.user.guestActivePlaces, 2);
  assert.equal(invitadosRows[1][8], '2 / 2');
  assert(invitadosRows[1][9].includes('dev_guest_phone_1'));
  assert(invitadosRows[1][9].includes('dev_guest_laptop_2'));

  const laptopToken = loginLaptop.user.authToken;
  assert.ok(laptopToken && laptopToken.includes('.'));

  // 2) Guest lists open sessions via inv_my_sessions
  const mySessRes = callPost({
    action: 'inv_my_sessions',
    authToken: laptopToken,
    advisorEmail: 'invitado@cliente.com',
    sheetTab: 'INVITADOS',
    deviceId: 'dev_guest_laptop_2',
    deviceLabel: 'Windows Chrome'
  });
  assert.equal(mySessRes.ok, true);
  assert.equal(mySessRes.sessions.length, 2);
  assert.equal(mySessRes.sessions[0].deviceId, 'dev_guest_laptop_2');
  assert.equal(mySessRes.sessions[0].isCurrent, true);
  assert.equal(mySessRes.activeCount, 2);
  assert.equal(mySessRes.maxPlaces, 2);

  // 3) Guest closes other open sessions -> updates Col I to "1 / 2" & removes phone from Col J
  const revokeRes = callPost({
    action: 'inv_revoke_session',
    authToken: laptopToken,
    advisorEmail: 'invitado@cliente.com',
    sheetTab: 'INVITADOS',
    deviceId: 'dev_guest_laptop_2',
    targetDeviceId: 'ALL_OTHERS'
  });
  assert.equal(revokeRes.ok, true);
  assert.equal(revokeRes.revokedCount, 1);
  assert.equal(revokeRes.activeCount, 1);
  assert.equal(revokeRes.slotNumber, 1);
  assert.equal(invitadosRows[1][8], '1 / 2');
  assert(!invitadosRows[1][9].includes('dev_guest_phone_1'), 'Revoked device must be removed from INVITADOS Col J');
  assert(invitadosRows[1][9].includes('dev_guest_laptop_2'), 'Current device must stay in INVITADOS Col J');

  // 4) Revoked phone polls inv_guest_heartbeat -> must be kicked out (revoked: true) WITHOUT re-occupying Col J!
  const phoneToken = loginPhone.user.authToken;
  const hbNoTok = callPost({
    action: 'inv_guest_heartbeat',
    email: 'invitado@cliente.com',
    deviceId: 'dev_guest_phone_1',
    deviceLabel: 'iPhone Safari'
  });
  assert.equal(hbNoTok.ok, false, 'Unauthenticated inv_guest_heartbeat must fail closed');

  const hbRevoked = callPost({
    action: 'inv_guest_heartbeat',
    authToken: phoneToken,
    email: 'invitado@cliente.com',
    deviceId: 'dev_guest_phone_1',
    deviceLabel: 'iPhone Safari'
  });
  assert.equal(hbRevoked.ok, false);
  assert.equal(hbRevoked.revoked, true);
  assert.equal(invitadosRows[1][8], '1 / 2', 'Revoked heartbeat must NOT re-add device to Col J');

  // 5) Phone explicitly logs back in -> clears revoked flag and occupies slot 2 again
  const reloginPhone = callPost({
    action: 'inv_login',
    email: 'invitado@cliente.com',
    accessKey: 'ClaveVip1',
    deviceId: 'dev_guest_phone_1',
    deviceLabel: 'iPhone Safari'
  });
  assert.equal(reloginPhone.ok, true);
  assert.equal(invitadosRows[1][8], '2 / 2');
  const hbAfterRelogin = callPost({
    action: 'inv_guest_heartbeat',
    authToken: reloginPhone.user.authToken,
    email: 'invitado@cliente.com',
    deviceId: 'dev_guest_phone_1',
    deviceLabel: 'iPhone Safari'
  });
  assert.equal(hbAfterRelogin.ok, true);

  // 6) Guest changes password via inv_update_key
  const updPassRes = callPost({
    action: 'inv_update_key',
    email: 'invitado@cliente.com',
    currentKey: 'ClaveVip1',
    newKey: 'NuevaVip2026',
    sheetTab: 'INVITADOS',
    authToken: laptopToken
  });
  assert.equal(updPassRes.ok, true);
  assert.match(String(invitadosRows[1][6]), /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/);
  assert.notEqual(invitadosRows[1][6], 'NuevaVip2026');
  assert.equal(sandbox.keysEqualNormalized_('NuevaVip2026', invitadosRows[1][6]), true);
  assert.equal(invitadosRows[1][5], '');
  const updatedToken = updPassRes.authToken;

  // 7) P1-04: SOLO LECTURA guests are strictly blocked from uploading product photos to Drive
  const uploadRes = callPost({
    action: 'inv_upload_product_photo',
    authToken: updatedToken,
    advisorEmail: 'invitado@cliente.com',
    sheetTab: 'INVITADOS',
    sku: 'SILLABRISA01',
    productName: 'SILLA BRISA',
    categoria: 'COMEDORES',
    driveOnly: true,
    skipSheetWrite: true,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
  });
  assert.equal(uploadRes.ok, false, 'SOLO LECTURA guest MUST be blocked from inv_upload_product_photo (P1-04)');
  assert.equal(uploadRes.forbidden, true);
  assert.equal(uploadedFiles.length, 0, 'Blocked guest upload must write 0 files to Drive');

  // 8) Security boundaries: guests remain strictly blocked on quotes, PDF, clients, overrides, and live team presence
  const blockedActions = [
    { action: 'inv_submit_quote', authToken: updatedToken, items: [] },
    { action: 'inv_download_erp_quote_pdf', authToken: updatedToken, quoteId: 1 },
    { action: 'inv_search_erp_clients', authToken: updatedToken, q: 'Juan' },
    { action: 'inv_create_erp_client', authToken: updatedToken, nombre: 'Test' },
    { action: 'inv_product_override_save', authToken: updatedToken, sku: 'SILLABRISA01', op: 'ARCHIVE' },
    { action: 'inv_presence_list', authToken: updatedToken }
  ];
  for (const req of blockedActions) {
    const resp = callPost(req);
    assert.equal(resp.ok, false, `Guest MUST stay blocked on ${req.action}`);
  }
});
