import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CREATA_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
const PARCHE_GS = path.join(REPO_ROOT, 'AppsScript_Parche_Fotos_V2.gs');
const PROMPTS_GS = path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs');

function readRepo(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function buildCreataRuntime(extraOpts = {}) {
  const INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const SEG_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';
  const AUTH_ID = extraOpts.authSheetId || '';

  const props = {
    INV_AUTH_SECRET: 'audit-regression-hmac-secret-key-2026-abcdef',
    SEG_SHEET_ID: SEG_ID,
    ...(extraOpts.scriptProperties || {})
  };
  if (AUTH_ID) props.AUTH_SHEET_ID = AUTH_ID;

  const env = createMockGasEnvironment({
    activeSpreadsheetId: INV_ID,
    scriptProperties: props
  });

  const ssInv = env.makeSpreadsheet(INV_ID, 'CONTROL DE PRODUCTOS PRESENTACIÓN', {
    'CUENTAS ADMINISTRATIVAS': extraOpts.adminRows || [
      ['CREATA DIRECTORIO UNIFICADO'],
      [
        'NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'ASESOR ERP', 'DESCUENTO',
        'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA', 'VER_PANEL_SUITE',
        'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS', 'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA',
        '', 'PLAYA', 'COLOCIO', 'PTC', 'CASA CREATA', 'PROYECTOS'
      ],
      [
        '1', 'CEDIS', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinAudit2026!', 'KEVIN', '100%',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', '', 'SI', 'SI', 'SI', 'SI', 'SI'
      ],
      [
        '2', 'PLAYA', 'Ana Playa', 'ASESOR', 'ana.playa@grupoanipa.com', '', 'AnaPlaya2026!', 'ANA PLAYA', '24%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ],
      [
        '3', 'COLOCIO', 'Luis Colocio', 'ASESOR', 'luis.colocio@grupoanipa.com', '', 'LuisColocio2026!', 'LUIS COLOCIO', '24%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '', 'NO', 'SI', 'NO', 'NO', 'NO'
      ],
      [
        '4', 'PTC', 'Gerente PTC', 'GERENTE', 'gerente.ptc@grupoanipa.com', '', 'GerentePtc2026!', 'GERENTE PTC', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '', 'NO', 'NO', 'SI', 'NO', 'NO'
      ],
      [
        '5', 'PLAYA', 'Ex Empleado', 'ASESOR', 'ex.empleado@grupoanipa.com', '', 'ExEmp2026!', 'EX EMP', '24%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ]
    ],
    INVITADOS: extraOpts.guestRows || [
      ['NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'DISPOSITIVOS PERMITIDOS', 'LUGARES ACTIVOS', 'DISPOSITIVOS AUTORIZADOS'],
      ['1', 'SOLO LECTURA', 'Invitado Demo', 'INVITADO (SOLO VER)', 'invitado.audit@cliente.com', '', 'InvAudit2026!', 2, '0 / 2', '']
    ],
    HISTORIAL: [
      ['FECHA', 'CLASIFICACION', 'MODULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANALISIS']
    ],
    '1': [
      ['SKU', 'NOMBRE', 'FOTO APP', 'URL'],
      ['', '', '', ''],
      ['SKU-TEST-01', 'SALA ARIA BEIGE', '', 'https://drive.google.com/file/d/1existingPhotoId123456/view?usp=sharing']
    ]
  });

  const ssSeg = env.makeSpreadsheet(SEG_ID, 'SEGUIMIENTO', {
    CONFIG_CREATA: [
      ['CLAVE', 'VALOR'],
      ['PUBLIC_BRAND', 'CREATA LIVING'],
      ['ADMIN_PIN', '999999'],
      ['ERP_API_KEY', 'sk-secret-value'],
      ['WEBHOOK_TOKEN', 'tok-secret-value'],
      ['DB_PASSWORD', 'pass-secret-value'],
      ['INV_AUTH_SECRET', 'hmac-secret-value']
    ],
    COTIZACIONES_EN_VIVO: [
      ['FECHA', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'TOTAL'],
      ['2026-11-23', 'COT-PLAYA-100', 'CREATA LIVING PLAYA', 'Ana Playa', 'ana.playa@grupoanipa.com', 'Cliente A', '15000'],
      ['2026-11-23', 'COT-COLOCIO-200', 'CREATA LIVING COLOSIO', 'Luis Colocio', 'luis.colocio@grupoanipa.com', 'Cliente B', '28000']
    ],
    COTIZACIONES_CREATA: [
      ['ID_PARTIDA', 'FOLIO', 'FECHA', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'NOTAS', 'CLIENTE', 'TELEFONO', 'SKU'],
      ['P-1', 'COT-PLAYA-100', '2026-11-23', 'CREATA LIVING PLAYA', 'Ana Playa', 'ana.playa@grupoanipa.com', '', 'Cliente A', '9981112222', 'SKU-TEST-01'],
      ['P-2', 'COT-COLOCIO-200', '2026-11-23', 'CREATA LIVING COLOSIO', 'Luis Colocio', 'luis.colocio@grupoanipa.com', '', 'Cliente B', '9983334444', 'SKU-TEST-01']
    ],
    CIERRES_COTIZACIONES: [
      ['FECHA_HORA', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'MONTO', 'ESTATUS', 'MOTIVO']
    ],
    TELEFONOS_CLIENTES: [
      ['FECHA_HORA', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'TELEFONO']
    ],
    WHATSAPP_ENVIADOS: [
      ['FECHA_HORA', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'TELEFONO', 'FECHA_AVISO']
    ]
  });

  let ssAuth = null;
  if (AUTH_ID) {
    ssAuth = env.makeSpreadsheet(AUTH_ID, 'AUTH PRIVADO', { Hoja1: [['']] });
  }

  env.loadScript(CREATA_GS);
  env.context.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: ['CREATA LIVING PLAYA', 'CREATA LIVING COLOSIO', 'CREATA PUERTO CANCUN'] });
  env.context.ensureLiveErpSyncTrigger_ = () => {};

  const post = (payload) => JSON.parse(env.context.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).getContent());

  const get = (params) => JSON.parse(env.context.doGet({
    parameter: params
  }).getContent());

  return { env, ssInv, ssSeg, ssAuth, post, get };
}

test('P0-01: Salted SHA-256 hashing, private AUTH_SPREADSHEET_ID migration, constant-time compare, and zero public GViz password fallback', () => {
  const PRIVATE_AUTH_ID = '1PRIVATE_AUTH_BOOK_AUDIT_999999';
  const rt = buildCreataRuntime({ authSheetId: PRIVATE_AUTH_ID });

  // 1) hashUserPassword_ creates salted iterated sha256i$iters$salt$hex verified by keysEqualNormalized_
  const h1 = rt.env.context.hashUserPassword_('ClaveSecreta2026!');
  const h2 = rt.env.context.hashUserPassword_('ClaveSecreta2026!');
  assert.match(h1, /^sha256i\$\d+\$[a-f0-9]+\$[a-f0-9]{64}$/);
  assert.notEqual(h1, h2, 'Each password hash must use a unique random salt');
  assert.equal(rt.env.context.keysEqualNormalized_('ClaveSecreta2026!', h1), true);
  assert.equal(rt.env.context.keysEqualNormalized_('ClaveSecreta2026!', h2), true);
  assert.equal(rt.env.context.keysEqualNormalized_('WrongPass!', h1), false);
  assert.equal(rt.env.context.constantTimeEquals_('abc123', 'abc123'), true);
  assert.equal(rt.env.context.constantTimeEquals_('abc123', 'abc124'), false);
  assert.equal(rt.env.context.constantTimeEquals_('abc123', 'abc1234'), false);

  // 2) migrarCuentasALibroPrivadoYHash copies CUENTAS ADMINISTRATIVAS + INVITADOS to private workbook & hashes credentials
  const mig = rt.env.context.migrarCuentasALibroPrivadoYHash(PRIVATE_AUTH_ID, true);
  assert.equal(mig.ok, true);
  assert.equal(mig.authSpreadsheetId, PRIVATE_AUTH_ID);
  assert.equal(mig.hashEnabled, true);
  assert.ok(mig.copiedTabs.includes('CUENTAS ADMINISTRATIVAS'));
  assert.ok(mig.copiedTabs.includes('INVITADOS'));

  const privAdmin = rt.ssAuth.getSheetByName('CUENTAS ADMINISTRATIVAS');
  assert.ok(privAdmin, 'Private auth workbook must receive CUENTAS ADMINISTRATIVAS');
  const kevinHashed = privAdmin.getRange(3, 7).getValue();
  assert.match(String(kevinHashed), /^sha256i?\$/, 'Kevin password must be stored as salted SHA-256 hash');
  assert.notEqual(String(kevinHashed), 'KevinAudit2026!');

  // 3) Delete CUENTAS ADMINISTRATIVAS from public workbook, activate private workbook via activarLibroAuthPrivado,
  //    and verify login + authenticated admin directory STILL succeed 100% from the private workbook!
  rt.ssInv.deleteSheet(rt.ssInv.getSheetByName('CUENTAS ADMINISTRATIVAS'));
  const actPriv = rt.env.context.activarLibroAuthPrivado(PRIVATE_AUTH_ID);
  assert.equal(actPriv.ok, true);
  assert.equal(actPriv.authSpreadsheetId, PRIVATE_AUTH_ID);
  assert.ok(actPriv.adminRows >= 4);

  const loginRes = rt.post({
    action: 'inv_login',
    email: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinAudit2026!',
    deviceId: 'dev_audit_kevin_1'
  });
  assert.equal(loginRes.ok, true);
  assert.equal(loginRes.user.isAdmin, true);

  const dirRes = rt.get({
    action: 'inv_users_directory',
    authToken: loginRes.user.authToken
  });
  assert.equal(dirRes.ok, true, 'Authenticated inv_users_directory must read private auth workbook after public tabs are deleted');
  assert.ok(Array.isArray(dirRes.users) && dirRes.users.length >= 4);

  const sessRes = rt.post({
    action: 'inv_my_sessions',
    authToken: loginRes.user.authToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    deviceId: 'dev_audit_kevin_1'
  });
  assert.equal(sessRes.ok, true, 'Authenticated POST actions must resolve users from private auth workbook after public tabs are deleted');

  // 4) Zero public GViz plaintext password fallback across frontends
  for (const rel of ['panel-app.js', 'fotos-productos-app.js', 'inventario-app.js']) {
    const src = readRepo(rel);
    assert.ok(!/checkKeyMatch\([^)]*tempKey/.test(src), `${rel} must not verify passwords client-side against GViz`);
  }
});

test('P0-02: creata-cloud.js ignores URL query overrides (?webapp/?api/?pin/?gemini_key) and all frontends pin CANONICAL_WEBAPP_URL', () => {
  const cloudSrc = readRepo('creata-cloud.js');
  const store = new Map();
  const sb = {
    window: {},
    document: { head: { appendChild: () => {} }, createElement: () => ({}) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    location: {
      href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html?webapp=https://evil.example/steal&pin=1234&gemini_key=AIzaEvil',
      search: '?webapp=https://evil.example/steal&pin=1234&gemini_key=AIzaEvil'
    },
    URLSearchParams,
    console, Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error, Promise
  };
  sb.window = sb;
  vm.runInNewContext(cloudSrc, sb, { filename: 'creata-cloud.js' });

  // Evil URL params must NOT poison localStorage or CreataCloud config
  for (const [, val] of store.entries()) {
    assert.ok(!val.includes('evil.example'), 'creata-cloud.js must never persist ?webapp= override');
    assert.ok(!val.includes('AIzaEvil'), 'creata-cloud.js must never persist ?gemini_key= override');
  }
  assert.match(cloudSrc, /headers=1/, 'P1-16: gvizJsonpQuery must append &headers=1 on non-_CREATA_CONFIG sheets');

  for (const rel of ['panel-app.js', 'fotos-productos-app.js', 'inventario-app.js', 'seguimiento-app.js', 'historial-app.js']) {
    const src = readRepo(rel);
    assert.match(src, /CANONICAL_WEBAPP_URL/, `${rel} must define and use CANONICAL_WEBAPP_URL`);
  }
});

test('P0-03, P0-04, P0-05: Safe CONFIG filter, fail-closed ADMIN_PIN, admin-only maintenance routes, removed-user token block, and epoch token revocation on password change', () => {
  const rt = buildCreataRuntime(); // Note: ADMIN_PIN is intentionally NOT set in ScriptProperties!

  // P0-04: doGet with no ADMIN_PIN configured MUST fail closed (never allow unauthenticated sync_now or debug)
  const unauthSyncGet = rt.get({ action: 'sync_now', pin: '' });
  assert.equal(unauthSyncGet.ok, false, 'doGet(sync_now) must fail closed when ADMIN_PIN is unset');

  // P0-05: Removing a user from CUENTAS ADMINISTRATIVAS immediately invalidates their previously-issued HMAC token
  const exLogin = rt.post({
    action: 'inv_login',
    email: 'ex.empleado@grupoanipa.com',
    accessKey: 'ExEmp2026!',
    deviceId: 'dev_ex_1'
  });
  assert.equal(exLogin.ok, true);
  rt.ssInv.getSheetByName('CUENTAS ADMINISTRATIVAS').deleteRow(7); // remove Ex Empleado row
  rt.env.context.invalidateBranchUsersCache_();
  const revokedUserCall = rt.post({
    action: 'inv_my_sessions',
    authToken: exLogin.user.authToken,
    advisorEmail: 'ex.empleado@grupoanipa.com',
    deviceId: 'dev_ex_1'
  });
  assert.equal(revokedUserCall.ok, false, 'Removed user token must immediately fail active-user check (P0-05)');

  // Log in as regular advisor Ana and admin Kevin
  const anaLogin = rt.post({
    action: 'inv_login',
    email: 'ana.playa@grupoanipa.com',
    accessKey: 'AnaPlaya2026!',
    deviceId: 'dev_ana_1'
  });
  assert.equal(anaLogin.ok, true);
  const anaTok = anaLogin.user.authToken;

  const kevinLogin = rt.post({
    action: 'inv_login',
    email: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinAudit2026!',
    deviceId: 'dev_kevin_1'
  });
  assert.equal(kevinLogin.ok, true);
  const kevinTok = kevinLogin.user.authToken;

  // P0-05: Non-admin advisor token MUST be rejected on admin-only routes
  for (const adminAction of ['inv_users_directory', 'inv_erp_sync_now', 'seg_sync_now', 'init_now', 'sync_now', 'audit_now', 'drive_sync_now']) {
    const denied = rt.post({
      action: adminAction,
      authToken: anaTok,
      advisorEmail: 'ana.playa@grupoanipa.com'
    });
    assert.equal(denied.ok, false, `Non-admin advisor MUST be blocked on ${adminAction}`);
  }

  // P0-03: seg_get_state strips ADMIN_PIN, API_KEY, TOKEN, PASSWORD, SECRET rows from CONFIG_CREATA!
  const segState = rt.post({
    action: 'seg_get_state',
    authToken: kevinTok,
    advisorEmail: 'kevin.reyna@grupoanipa.com'
  });
  assert.equal(segState.ok, true);
  const cfgRows = (segState.sheets && segState.sheets.CONFIG_CREATA) || [];
  const cfgSerialized = JSON.stringify(cfgRows);
  assert.ok(cfgSerialized.includes('PUBLIC_BRAND'), 'Safe non-secret CONFIG_CREATA key should remain visible');
  for (const secretWord of ['ADMIN_PIN', '999999', 'ERP_API_KEY', 'sk-secret-value', 'WEBHOOK_TOKEN', 'DB_PASSWORD', 'INV_AUTH_SECRET']) {
    assert.ok(!cfgSerialized.includes(secretWord), `CONFIG_CREATA leaked sensitive value: ${secretWord}`);
  }

  // P0-05 + P1-21: Changing password requires currentKey AND bumps INV_KEY_EPOCH_ so old tokens immediately become invalid!
  const missingCurr = rt.post({
    action: 'inv_update_key',
    email: 'ana.playa@grupoanipa.com',
    newKey: 'AnaNew2027!',
    authToken: anaTok
  });
  assert.equal(missingCurr.ok, false, 'inv_update_key without currentKey must fail (P1-21)');

  const updOk = rt.post({
    action: 'inv_update_key',
    email: 'ana.playa@grupoanipa.com',
    currentKey: 'AnaPlaya2026!',
    newKey: 'AnaNew2027!',
    authToken: anaTok
  });
  assert.equal(updOk.ok, true);
  assert.ok(updOk.authToken && updOk.authToken !== anaTok);

  // Old token MUST now be rejected!
  const oldTokCheck = rt.post({
    action: 'inv_my_sessions',
    authToken: anaTok,
    advisorEmail: 'ana.playa@grupoanipa.com',
    deviceId: 'dev_ana_1'
  });
  assert.equal(oldTokCheck.ok, false, 'Old HMAC token must be invalidated immediately after password change (epoch bump)');

  // New token works!
  const newTokCheck = rt.post({
    action: 'inv_my_sessions',
    authToken: updOk.authToken,
    advisorEmail: 'ana.playa@grupoanipa.com',
    deviceId: 'dev_ana_1'
  });
  assert.equal(newTokCheck.ok, true, 'Fresh token issued after password change must work');
});

test('P0-06: Guest slot enforcement rejects empty devId, binds inv_guest_heartbeat to verified token email, and prevents sessionStartedMs unrevoke bypass', () => {
  const rt = buildCreataRuntime();

  // Empty deviceId on guest login -> rejected!
  const noDev = rt.post({
    action: 'inv_login',
    email: 'invitado.audit@cliente.com',
    accessKey: 'InvAudit2026!',
    deviceId: ''
  });
  assert.equal(noDev.ok, false, 'Guest login without deviceId must be rejected (P0-06)');

  // Legitimate login on dev1 + dev2
  const g1 = rt.post({ action: 'inv_login', email: 'invitado.audit@cliente.com', accessKey: 'InvAudit2026!', deviceId: 'guest_dev_A' });
  const g2 = rt.post({ action: 'inv_login', email: 'invitado.audit@cliente.com', accessKey: 'InvAudit2026!', deviceId: 'guest_dev_B' });
  assert.equal(g1.ok, true);
  assert.equal(g2.ok, true);

  // Third device rejected (2 / 2 full)
  const g3 = rt.post({ action: 'inv_login', email: 'invitado.audit@cliente.com', accessKey: 'InvAudit2026!', deviceId: 'guest_dev_C' });
  assert.equal(g3.ok, false, 'Third guest device must be blocked when 2/2 slots are occupied');

  // Revoke guest_dev_A from guest_dev_B
  const rev = rt.post({
    action: 'inv_revoke_session',
    authToken: g2.user.authToken,
    deviceId: 'guest_dev_B',
    targetDeviceId: 'guest_dev_A'
  });
  assert.equal(rev.ok, true);

  // Forged future sessionStartedMs on revoked device must NOT unrevoke!
  const hbForged = rt.post({
    action: 'inv_presence_heartbeat',
    authToken: g1.user.authToken,
    deviceId: 'guest_dev_A',
    sessionStartedMs: Date.now() + 3600000
  });
  assert.equal(hbForged.sessionRevoked, true, 'Client-supplied future sessionStartedMs must NEVER bypass device revocation (P0-06)');

  // Forged email in inv_guest_heartbeat using advisor token must fail!
  const anaLogin = rt.post({ action: 'inv_login', email: 'ana.playa@grupoanipa.com', accessKey: 'AnaPlaya2026!', deviceId: 'dev_ana_hb' });
  const spoofHb = rt.post({
    action: 'inv_guest_heartbeat',
    authToken: anaLogin.user.authToken,
    email: 'invitado.audit@cliente.com',
    deviceId: 'guest_dev_B'
  });
  assert.equal(spoofHb.ok, false, 'inv_guest_heartbeat must ignore forged body.email and require verified guest token');
});

test('P1-04, P1-08, P1-09: Subir foto permission check, equipoInvitados presence gate, and handleSegAction_ IDOR protection', () => {
  const rt = buildCreataRuntime();

  const anaTok = rt.post({ action: 'inv_login', email: 'ana.playa@grupoanipa.com', accessKey: 'AnaPlaya2026!', deviceId: 'dev_ana_p1' }).user.authToken;
  const luisTok = rt.post({ action: 'inv_login', email: 'luis.colocio@grupoanipa.com', accessKey: 'LuisColocio2026!', deviceId: 'dev_luis_p1' }).user.authToken;
  const gerentePtcTok = rt.post({ action: 'inv_login', email: 'gerente.ptc@grupoanipa.com', accessKey: 'GerentePtc2026!', deviceId: 'dev_gptc_p1' }).user.authToken;

  // P1-04: Luis has VER_SUBIR_FOTO = NO -> blocked from inv_upload_product_photo!
  const luisUp = rt.post({
    action: 'inv_upload_product_photo',
    authToken: luisTok,
    advisorEmail: 'luis.colocio@grupoanipa.com',
    sku: 'SKU-TEST-01',
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
  });
  assert.equal(luisUp.ok, false, 'User with VER_SUBIR_FOTO=NO must be blocked from inv_upload_product_photo');
  assert.equal(luisUp.forbidden, true);

  // P1-08: Gerente with VER_EQUIPO_Y_INVITADOS = NO -> blocked from inv_presence_list!
  const presDenied = rt.post({
    action: 'inv_presence_list',
    authToken: gerentePtcTok,
    advisorEmail: 'gerente.ptc@grupoanipa.com'
  });
  assert.equal(presDenied.ok, false, 'Manager with VER_EQUIPO_Y_INVITADOS=NO must be blocked from inv_presence_list (P1-08)');

  // P1-09: Ana (PLAYA) CANNOT mutate Luis's Colocio folio (IDOR blocked!)
  const idorAttempt = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    advisorEmail: 'ana.playa@grupoanipa.com',
    subAction: 'SEG_CIERRE',
    folio: 'COT-COLOCIO-200',
    payload: { estatus: 'CERRADA', asesor: 'Kevin Reyna', sucursal: 'CREATA LIVING COLOSIO' }
  });
  assert.equal(idorAttempt.ok, false, 'Advisor MUST be blocked from mutating another advisor/branch folio (P1-09 IDOR)');
  assert.equal(idorAttempt.forbidden, true);

  // Ana CAN mutate her own folio COT-PLAYA-100, and server locks actor identity (ignoring spoofed payload.asesor)
  const ownAction = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    advisorEmail: 'ana.playa@grupoanipa.com',
    subAction: 'SEG_CIERRE',
    folio: 'COT-PLAYA-100',
    payload: { estatus: 'CERRADA', asesor: 'Spoofed Name', correo_asesor: 'spoof@evil.com', cliente: '=HYPERLINK("http://evil")' }
  });
  assert.equal(ownAction.ok, true);
  const cierresSheet = rt.ssSeg.getSheetByName('CIERRES_COTIZACIONES');
  const lastRow = cierresSheet.getRange(cierresSheet.getLastRow(), 1, 1, 9).getValues()[0];
  assert.equal(lastRow[3], 'Ana Playa', 'Non-admin actorName must come from verified token, not spoofed payload');
  assert.equal(lastRow[4], 'ana.playa@grupoanipa.com', 'Non-admin actorEmail must come from verified token');
  assert.equal(lastRow[5], '\'=HYPERLINK("http://evil")', 'Client cell formula must be sanitized');
});

test('P1-02, P1-17, P1-18, P1-22, P1-23, P1-24: Internal _skipLock blocked externally, advisor match scoring, WCF token scope, unitList ignored, Parche safe cache getters, Prompts PIN rate-limit & fullScan auth', () => {
  const creataSrc = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const parcheSrc = readRepo('AppsScript_Parche_Fotos_V2.gs');
  const promptsSrc = readRepo('AppsScript_Prompts_Odoo.gs');

  // P1-02: handleInvProductOverrideSave_ uses internal 2nd arg (optsInternal), never trusting body._skipLock
  assert.match(creataSrc, /function handleInvProductOverrideSave_\(body,\s*optsInternal\)/);
  assert.match(parcheSrc, /function handleInvProductOverrideSave_\(body,\s*optsInternal\)/);
  assert.ok(!/b\._skipLock/.test(creataSrc), 'Creata must NOT read untrusted b._skipLock from external JSON body');
  assert.ok(!/b\._skipLock/.test(parcheSrc), 'Parche must NOT read untrusted b._skipLock from external JSON body');

  // P1-17: matchBestErpAdvisor_ scores exact full-name + store higher than partial single-token match
  const rt = buildCreataRuntime();
  const matched = rt.env.context.matchBestErpAdvisor_('ANA MARIA LOPEZ', 'CREATA LIVING PLAYA', [
    { id: 10, tokens: ['ANA'], branch: 'CREATA LIVING COLOSIO' },
    { id: 20, tokens: ['ANA', 'MARIA', 'LOPEZ'], branch: 'CREATA LIVING PLAYA' }
  ]);
  assert.equal(matched && matched.id, 20, 'matchBestErpAdvisor_ must prefer exact full-name & store match');

  // P1-18: {TOKEN} replacement restricted to <ClaveServicio>{TOKEN}</ClaveServicio> (prevents SOAP injection from client fields)
  assert.ok(creataSrc.includes('/<ClaveServicio>\\{TOKEN\\}<\\/ClaveServicio>/g'), 'callSmuebleriaWcf_ must scope {TOKEN} replacement strictly to <ClaveServicio>');

  // P1-22 / SEC-02: handleInvSubmitQuote_ inspects ENTIRE body and NEVER lets client reqItem.unitList override ERP price
  const submitFnMatch = /^function handleInvSubmitQuote_\([^\n]*\{[\s\S]*?^\}/m.exec(creataSrc);
  assert.ok(submitFnMatch && submitFnMatch[0].length > 15000, 'Must extract complete handleInvSubmitQuote_ body');
  assert.ok(!/reqItem\.unitList/.test(submitFnMatch[0]), 'handleInvSubmitQuote_ must ignore client-supplied reqItem.unitList across ENTIRE body (P1-22 / SEC-02)');

  // P1-23: Parche avoids top-level const redeclaration collision with Creata GAS
  assert.match(parcheSrc, /function getProjectAPublicFoldersCacheKey_\(/);
  assert.match(parcheSrc, /function getProjectALoadedNamesCacheKey_\(/);

  // P1-24: Project B Prompts PIN rate limiting (8 failures -> locked) and fullScan requires auth
  const envB = createMockGasEnvironment({
    activeSpreadsheetId: '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg',
    scriptProperties: { PROMPTS_PIN: '7788' }
  });
  envB.loadScript(PROMPTS_GS);
  const postB = (p) => JSON.parse(envB.context.doPost({ postData: { contents: JSON.stringify(p) } }).getContent());
  const getB = (params) => JSON.parse(envB.context.doGet({ parameter: params }).getContent());

  const unauthFullScan = getB({ action: 'prompts_health', fullScan: 'true' });
  assert.equal(unauthFullScan.ok, false, 'prompts_health?fullScan=true must require owner auth (P1-24)');

  for (let i = 0; i < 8; i++) {
    const bad = postB({ action: 'prompts_materials_list', ownerEmail: 'kevin.reyna@grupoanipa.com', pin: '0000' });
    assert.equal(bad.ok, false);
  }
  const lockedOut = postB({ action: 'prompts_materials_list', ownerEmail: 'kevin.reyna@grupoanipa.com', pin: '7788' });
  assert.equal(lockedOut.ok, false, 'Correct PIN must be rate-limited after 8 consecutive failed attempts (P1-24)');
  assert.match(String(lockedOut.error || ''), /intentos|bloquead|espera/i);
  assert.match(promptsSrc, /timeBudgetMs/, 'handlePromptsRepairPermissions_ must enforce a time budget cap');
});

test('P0-07, P0-08, P1-07, P1-11, P1-12, P1-13, P1-20, P1-28, P1-29, P2-01, P2-02, P2-12, P2-13, P2-22, P2-23: Frontend security & stability invariants', () => {
  const fotosJs = readRepo('fotos-productos-app.js');
  const invJs = readRepo('inventario-app.js');
  const panelJs = readRepo('panel-app.js');
  const segJs = readRepo('seguimiento-app.js');
  const histJs = readRepo('historial-app.js');

  // P0-08: ZERO inline onclick= sinks in fotos-productos-app.js; escapeHtml escapes apostrophe in inventario-app.js
  assert.equal(/\bonclick=/i.test(fotosJs), false, 'fotos-productos-app.js must have ZERO inline onclick= DOM XSS sinks (P0-08)');
  assert.match(fotosJs, /data-fotos-act/);
  assert.match(invJs, /replace\(\/'\/g,\s*'&#39;'\)/, 'inventario-app.js escapeHtml must escape single quotes (P0-08)');

  // P0-07: Logout purges all sibling session keys + secret session key
  assert.match(panelJs, /creata_private_kevin_fotos_v1/);
  assert.match(fotosJs, /creata_private_kevin_panel_v1/);
  assert.match(invJs, /creata_private_kevin_fotos_v1/);
  assert.match(invJs, /creata_private_kevin_panel_v1/);

  // P1-07: seguimiento-app.js must NOT escalate multi-store advisors to esGerente via allBranches.length > 1
  assert.ok(!/allBranches\.length\s*>\s*1\s*&&\s*!esAdmin/.test(segJs), 'seguimiento-app.js must not escalate multi-store advisors to manager');
  assert.match(segJs, /VER_SEGUIMIENTO|seguimiento\s*===\s*false/);

  // P1-11: Canonical 2048x2048 studio resolution in fotos-productos-app.js and inventario-app.js
  assert.match(fotosJs, /MAX_DIM\s*=\s*2048|TARGET_SIZE\s*=\s*2048/);
  assert.match(invJs, /CANONICAL_SQUARE_UPLOAD_PX\s*=\s*2048/);

  // P1-12, P1-13, P2-13, P3-04: Historial & Seguimiento fixes
  assert.match(histJs, /fetchSheetRows\('HISTORIAL',\s*'A:J'/, 'Historial must query full A:J range instead of truncating at row 600 (P1-12)');
  assert.ok(!/\.classList\.toggle\('hidden'/.test(histJs), 'historial-app.js must use cm-hidden, never undefined hidden class (P1-12)');
  assert.ok(!histJs.includes('AU1:AZ3'), 'Dead AU1:AZ3 query removed from historial-app.js');
  assert.ok(!/function\s+fetchPrivateSegGviz/i.test(segJs), 'seguimiento-app.js must not query private SEG_SHEET_ID over public GViz');
  assert.match(segJs, /sheet_tab/, 'P2-01: Seguimiento heartbeat reads sheet_tab');
  assert.match(segJs, /sucursal_label/, 'P2-01: Seguimiento heartbeat reads sucursal_label');
  assert.ok(histJs.includes('/^[=+\\-@\\t\\r]/'), 'P2-13: historial-app.js sanitizes CSV formula injection');
  assert.ok(segJs.includes('escCsv') && segJs.includes('/^[=+\\-@\\t\\r]/'), 'P2-13: seguimiento-app.js sanitizes CSV formula injection');

  // P1-20 & P1-28 & P1-29: postMessage origin check, dark_theme embed, clipboard bridge, shared quote URL sanitization
  assert.match(fotosJs, /CREATA_PROMPTS_COPY_IMAGE/);
  assert.match(invJs, /CREATA_PROMPTS_COPY_IMAGE/);
  assert.match(fotosJs, /ev\.origin/);
  assert.match(invJs, /ev\.origin/);
  assert.match(invJs, /sanitizeVisualOverrideUrl\([^)]*doc\.u/, 'P1-29: shared quote doc.u must be sanitized');

  // P2-12 & P2-22: scroll selector & FastCache metadata
  assert.match(invJs, /#productDetailModal\s*>\s*\.inv-det-modal-card/, 'P2-12: fixed scroll selector');
  assert.match(fotosJs, /proveedor/, 'P2-22: Fotos captures proveedor for provider-aware wood matching');
});
