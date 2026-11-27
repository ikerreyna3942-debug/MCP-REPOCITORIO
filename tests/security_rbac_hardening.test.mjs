import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CREATA_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
const PARCHE_GS = path.join(REPO_ROOT, 'AppsScript_Parche_Fotos_V2.gs');

function readRepo(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function extractTopLevelFunction(src, fnName) {
  const re = new RegExp(`^function ${fnName}\\([^\\n]*\\{[\\s\\S]*?^\\}`, 'm');
  const m = re.exec(src);
  assert.ok(m, `Missing top-level function ${fnName}`);
  return m[0];
}

function buildSecurityRuntime(extraOpts = {}) {
  const INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const SEG_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

  const props = {
    INV_AUTH_SECRET: 'sec-rbac-hardening-secret-2026-abcdef012345',
    SEG_SHEET_ID: SEG_ID,
    ...(extraOpts.scriptProperties || {})
  };

  const env = createMockGasEnvironment({
    activeSpreadsheetId: INV_ID,
    scriptProperties: props
  });

  const plantillaRows = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'STORE', 'ADVISOR', 'BRANCH', 'ID'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'CREATA LIVING PLAYA', 'ANA PLAYA | CREATA LIVING PLAYA [ID: 101]', 'CREATA LIVING PLAYA', '101'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'CREATA LIVING COLOSIO', 'LUIS COLOCIO | CREATA LIVING COLOSIO [ID: 102]', 'CREATA LIVING COLOSIO', '102'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'CASA CREATA BONAMPAK', 'KEVIN | CEDIS [ID: 38954]', 'CASA CREATA BONAMPAK', '38954'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['SKU-ZERO', 'SILLA SIN PRECIO', 1, 0, 0, 0, 0, 0, 0, 0, 0, '9901']
  ];

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
        '1', 'CEDIS', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinSec2026!', 'KEVIN | CEDIS [ID: 38954]', '100%',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', '', 'SI', 'SI', 'SI', 'SI', 'SI'
      ],
      [
        '2', 'CEDIS', 'Admin Restringido', 'ADMINISTRADOR', 'admin.limited@grupoanipa.com', '', 'AdminLim2026!', 'ADMIN LIM | CREATA LIVING PLAYA [ID: 201]', '100%',
        'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', 'NO', 'SI', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ],
      [
        '3', 'CEDIS', 'Admin Sin Cotizador', 'ADMINISTRADOR', 'admin.nocot@grupoanipa.com', '', 'AdminNoCot26!', 'ADMIN NOCOT | CEDIS [ID: 202]', '100%',
        'NO', 'SI', 'SI', 'NO', 'NO', 'NO', 'SI', 'NO', 'NO', 'SI', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ],
      [
        '4', 'PLAYA', 'Ana Playa', 'ASESOR', 'ana.playa@grupoanipa.com', '', 'AnaPlaya2026!', 'ANA PLAYA | CREATA LIVING PLAYA [ID: 101]', '24%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ],
      [
        '5', 'COLOCIO', 'Luis Sin Permisos', 'ASESOR', 'luis.noperm@grupoanipa.com', '', 'LuisNoPerm26!', 'LUIS COLOCIO | CREATA LIVING COLOSIO [ID: 102]', '24%',
        'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '', 'NO', 'SI', 'NO', 'NO', 'NO'
      ],
      [
        '6', 'PTC', 'Sofi Solo Historial', 'ASESOR', 'sofi.hist@grupoanipa.com', '', 'SofiHist2026!', 'SOFI PTC [ID: 103]', '24%',
        'SI', 'NO', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '', 'NO', 'NO', 'SI', 'NO', 'NO'
      ],
      [
        '7', 'PLAYA', 'Multi Tienda', 'ASESOR', 'multi.tienda@grupoanipa.com', '', 'MultiTienda26!', 'MULTI [ID: 104]', '24%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '', 'SI', 'SI', 'NO', 'NO', 'NO'
      ]
    ],
    INVITADOS: [
      ['NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'DISPOSITIVOS PERMITIDOS', 'LUGARES ACTIVOS', 'DISPOSITIVOS AUTORIZADOS'],
      ['1', 'SOLO LECTURA', 'Invitado Demo', 'INVITADO (SOLO VER)', 'invitado.sec@cliente.com', '', 'InvSec2026!', 2, '0 / 2', '']
    ],
    plantilla: plantillaRows,
    COTIZACIONES_EN_VIVO: [
      ['ORDEN_SUCURSAL', 'FOLIO_SMUEBLERIA', 'ID_COTIZACION_ERP', 'FECHA_HORA', 'MODALIDAD_ORIGEN', 'HOJA_UBICACION', 'TIENDA_ERP', 'CORREO_ASESOR', 'NOMBRE_ASESOR', 'USUARIO_ERP', 'ID_USUARIO_ERP', 'CLIENTE_PROYECTO', 'TELEFONO', 'MODALIDAD_CLIENTE', 'CATEGORIA_ERP', 'ENTREGA_TENTATIVA', 'PARTIDAS_CANT', 'RESUMEN_SKUS', 'SUBTOTAL_SIN_IVA', 'IVA', 'DESCUENTO_EXTRA', 'TOTAL_CON_IVA', 'ESTADO_ERP', 'NOTAS'],
      ['ORD-1', 'PL-100', '9001', '26/11/2026 10:00', 'SUCURSAL', 'PLAYA', 'CREATA LIVING PLAYA', 'ana.playa@grupoanipa.com', 'Ana Playa', 'ANA PLAYA', '101', 'Cliente Ana', '9841112233', 'CONTADO', 'INTERIOR', '', '1', 'SKU-OK x1', '10000', '1600', '0', '11600', 'Registrada', ''],
      ['ORD-2', 'CO-200', '9002', '26/11/2026 11:00', 'SUCURSAL', 'COLOCIO', 'CREATA LIVING COLOSIO', 'luis.noperm@grupoanipa.com', 'Luis Sin Permisos', 'LUIS COLOCIO', '102', 'Cliente Luis', '9981112233', 'CONTADO', 'INTERIOR', '', '1', 'SKU-OK x1', '20000', '3200', '0', '23200', 'Registrada', '']
    ],
    HISTORIAL: [
      ['TITULO'], [], [], [], [],
      ['FECHA', 'CLASIFICACION', 'MODULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANALISIS'],
      ['26/11/2026 09:00', 'MOVIMIENTO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_WHATSAPP', '✅ OK', 'sofi.hist@grupoanipa.com', 'PTC', 'PTC-10', '{}', 'Demo'],
      ['26/11/2026 09:10', 'MOVIMIENTO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_WHATSAPP', '✅ OK', 'ana.playa@grupoanipa.com', 'PLAYA', 'PL-100', '{}', 'Demo']
    ],
    INVENTARIO_EN_VIVO: [
      ['SKU', '', 'MODELO', 'NOMBRE', '', 'FOTO'],
      ['', '', '', '', '', ''],
      ['SKU-ZERO', '', 'ZERO', 'SILLA SIN PRECIO', '', '']
    ]
  });

  const ssSeg = env.makeSpreadsheet(SEG_ID, 'SEGUIMIENTO', {
    CONFIG_CREATA: [
      ['CLAVE', 'VALOR'],
      ['PUBLIC_BRAND', 'CREATA LIVING']
    ],
    COTIZACIONES_CREATA: [
      ['ID_PARTIDA', 'FOLIO', 'FECHA', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'NOTAS', 'CLIENTE', 'TELEFONO', 'SKU'],
      ['P-1', 'PL-100', '2026-11-26', 'PLAYA', 'Ana Playa', 'ana.playa@grupoanipa.com', '', 'Cliente Ana', '9841112233', 'SKU-ZERO'],
      ['P-2', 'CO-200', '2026-11-26', 'COLOCIO', 'Luis Sin Permisos', 'luis.noperm@grupoanipa.com', '', 'Cliente Luis', '9981112233', 'SKU-ZERO']
    ],
    COTIZACIONES_ARCHIVADAS: [
      ['ID_PARTIDA', 'FOLIO', 'FECHA', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'NOTAS', 'CLIENTE', 'TELEFONO', 'SKU']
    ],
    CIERRES_COTIZACIONES: [
      ['FECHA_HORA', 'FOLIO', 'SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'MONTO', 'ESTATUS', 'MOTIVO']
    ],
    HISTORIAL_MOVIMIENTOS: [
      ['FECHA', 'ACCION', 'ASESOR', 'EMAIL', 'SUCURSAL', 'DESC', 'DETALLE', 'ORIGEN', 'STATUS'],
      ['2026-11-26 09:00:00', 'WHATSAPP', 'Sofi Solo Historial', 'sofi.hist@grupoanipa.com', 'PTC', 'Aviso', '{}', 'Web-App', 'EXITOSO'],
      ['2026-11-26 09:05:00', 'WHATSAPP', 'Ana Playa', 'ana.playa@grupoanipa.com', 'PLAYA', 'Aviso', '{}', 'Web-App', 'EXITOSO']
    ]
  });

  const shPlantilla = ssInv.getSheetByName('plantilla');
  if (shPlantilla) {
    const origPlantGetRange = shPlantilla.getRange.bind(shPlantilla);
    const colLettersToNum = (letters) => {
      let n = 0;
      for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
      return n;
    };
    shPlantilla.getRange = (a, b, c, d) => {
      if (typeof a === 'string') {
        const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(a.trim());
        if (m) {
          const r1 = parseInt(m[2], 10);
          const c1 = colLettersToNum(m[1].toUpperCase());
          const r2 = m[4] ? parseInt(m[4], 10) : r1;
          const c2 = m[3] ? colLettersToNum(m[3].toUpperCase()) : c1;
          return origPlantGetRange(r1, c1, Math.max(1, r2 - r1 + 1), Math.max(1, c2 - c1 + 1));
        }
      }
      return origPlantGetRange(a, b, c, d);
    };
  }

  env.loadScript(CREATA_GS);
  if (extraOpts.withParche) {
    env.loadScript(PARCHE_GS);
  }
  env.context.ensureLiveErpSyncTrigger_ = () => {};

  const post = (payload) => JSON.parse(env.context.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).getContent());

  const get = (params) => JSON.parse(env.context.doGet({
    parameter: params
  }).getContent());

  const login = (email, accessKey, extra = {}) => {
    const res = post({ action: 'inv_login', email, accessKey, deviceId: extra.deviceId || ('dev_' + email), ...extra });
    assert.equal(res.ok, true, `Login failed for ${email}: ${JSON.stringify(res)}`);
    return res.user.authToken;
  };

  return { env, ssInv, ssSeg, post, get, login };
}

test('SEC-01: inventario-app.js never persists plaintext passwords in PENDING_KEYS_STORAGE and purges legacy synced entries on startup', () => {
  const invJs = readRepo('inventario-app.js');

  assert.ok(
    !/pMap\[activeAdvisorSession\.correo\]\s*=\s*\{\s*newKey:\s*newPass/.test(invJs),
    'inventario-app.js MUST NOT persist plaintext newPass/currPass into PENDING_KEYS_STORAGE after inv_update_key succeeds (SEC-01)'
  );
  assert.ok(
    !/prevKey:\s*currPass,\s*synced:\s*true/.test(invJs),
    'inventario-app.js MUST NOT write synced:true plaintext password entries into localStorage (SEC-01)'
  );

  // Verify startup purge helper exists and purges legacy synced:true entries cleanly
  assert.match(invJs, /function purgeLegacySyncedPendingKeys\(/, 'inventario-app.js must define purgeLegacySyncedPendingKeys()');
  const fnStart = invJs.indexOf('function purgeLegacySyncedPendingKeys(');
  assert.ok(fnStart > 0);
  // Find function body via brace depth
  let depth = 0, started = false, endIdx = fnStart;
  for (let i = fnStart; i < invJs.length; i++) {
    if (invJs[i] === '{') { depth++; started = true; }
    else if (invJs[i] === '}') { depth--; if (started && depth === 0) { endIdx = i + 1; break; } }
  }
  const purgeSrc = invJs.slice(fnStart, endIdx);

  const store = new Map();
  store.set('creata_inv_updated_keys_v1', JSON.stringify({
    'kevin.reyna@grupoanipa.com': { newKey: 'Plain1234!', prevKey: 'Old1234!', synced: true, updatedAt: Date.now() },
    'other@grupoanipa.com': { newKey: 'Unsynced1!', prevKey: 'Temp1!', synced: false, updatedAt: Date.now() }
  }));
  const sb = {
    PENDING_KEYS_STORAGE: 'creata_inv_updated_keys_v1',
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    JSON, Object, String, Boolean
  };
  vm.runInNewContext(`${purgeSrc}\npurgeLegacySyncedPendingKeys();`, sb);
  const remaining = JSON.parse(store.get('creata_inv_updated_keys_v1') || '{}');
  assert.equal(remaining['kevin.reyna@grupoanipa.com'], undefined, 'Legacy synced:true plaintext entry MUST be purged on startup');

  // When only legacy synced entries exist, remove the entire localStorage key
  store.set('creata_inv_updated_keys_v1', JSON.stringify({
    'only@grupoanipa.com': { newKey: 'Secret1234!', prevKey: 'Old1234!', synced: true }
  }));
  vm.runInNewContext(`${purgeSrc}\npurgeLegacySyncedPendingKeys();`, sb);
  assert.equal(store.has('creata_inv_updated_keys_v1'), false, 'Empty PENDING_KEYS_STORAGE key should be removed completely');
});

test('SEC-02: handleInvSubmitQuote_ rejects SKU with invalid/zero server price instead of trusting client reqItem.unitList', () => {
  const creataSrc = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const submitFn = extractTopLevelFunction(creataSrc, 'handleInvSubmitQuote_');
  assert.ok(!/reqItem\.unitList/.test(submitFn), 'Entire handleInvSubmitQuote_ body must NEVER reference client reqItem.unitList');

  const rt = buildSecurityRuntime();
  let erpCreateCalled = false;
  rt.env.context.buscarProductoPorClaveWcf_ = (sku) => ({ IdProducto: '9901', Nombre: 'SILLA SIN PRECIO', Precio: 0 });
  rt.env.context.crearCotizacionEnSmuebleriaWcf_ = () => { erpCreateCalled = true; return { ok: true, idCotizacion: 555, folio: 'PL-999' }; };

  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const res = rt.post({
    action: 'inv_submit_quote',
    authToken: anaTok,
    sendToErp: true,
    clientName: 'Cliente Precio Cero',
    items: [{ sku: 'SKU-ZERO', name: 'SILLA SIN PRECIO', qty: 1, unitList: 1, discountPct: 0 }]
  });
  assert.equal(res.ok, false, 'Quote with zero server/WCF price MUST be rejected even when client sends unitList');
  assert.match(String(res.error || ''), /precio de lista válido/i);
  assert.equal(erpCreateCalled, false, 'ERP CrearCotizacion must NOT be invoked for zero-price SKU');
});

test('SEC-03: seg_get_state, seg_get_delta, and seg_action enforce VER_SEGUIMIENTO and VER_HISTORIAL granular permissions', () => {
  const rt = buildSecurityRuntime();
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');
  const adminLimTok = rt.login('admin.limited@grupoanipa.com', 'AdminLim2026!');
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const luisTok = rt.login('luis.noperm@grupoanipa.com', 'LuisNoPerm26!');
  const sofiTok = rt.login('sofi.hist@grupoanipa.com', 'SofiHist2026!');

  // 1) Non-admin and Admin with VER_SEGUIMIENTO=NO & VER_HISTORIAL=NO are blocked on all 3 endpoints
  for (const [label, tok] of [['non-admin', luisTok], ['admin-limited', adminLimTok]]) {
    const st = rt.post({ action: 'seg_get_state', authToken: tok });
    assert.equal(st.ok, false, `${label} without seguimiento/historial must be blocked from seg_get_state`);
    assert.equal(st.forbidden, true);

    const dl = rt.post({ action: 'seg_get_delta', authToken: tok });
    assert.equal(dl.ok, false, `${label} without seguimiento/historial must be blocked from seg_get_delta`);
    assert.equal(dl.forbidden, true);

    const act = rt.post({ action: 'seg_action', authToken: tok, subAction: 'SEG_WHATSAPP', folio: 'CO-200', payload: {} });
    assert.equal(act.ok, false, `${label} without seguimiento must be blocked from seg_action`);
    assert.equal(act.forbidden, true);
  }

  // 2) Sofi has VER_SEGUIMIENTO=NO, VER_HISTORIAL=SI:
  //    - Blocked on seg_action
  //    - Allowed on seg_get_state & seg_get_delta, with quote sheets stripped and history kept
  const sofiAct = rt.post({ action: 'seg_action', authToken: sofiTok, subAction: 'SEG_WHATSAPP', folio: 'PL-100', payload: {} });
  assert.equal(sofiAct.ok, false, 'User with VER_SEGUIMIENTO=NO must be blocked on seg_action');
  assert.equal(sofiAct.forbidden, true);

  const sofiState = rt.post({ action: 'seg_get_state', authToken: sofiTok });
  assert.equal(sofiState.ok, true, 'User with VER_HISTORIAL=SI must be allowed on seg_get_state');
  assert.equal((sofiState.sheets.COTIZACIONES_CREATA || []).length, 0, 'Quote sheet COTIZACIONES_CREATA must be stripped when VER_SEGUIMIENTO=NO');
  assert.equal((sofiState.sheets.COTIZACIONES_EN_VIVO || []).length, 0, 'Quote sheet COTIZACIONES_EN_VIVO must be stripped when VER_SEGUIMIENTO=NO');
  assert.equal((sofiState.sheets.CIERRES_COTIZACIONES || []).length, 0, 'CIERRES_COTIZACIONES must be stripped when VER_SEGUIMIENTO=NO');
  assert.ok((sofiState.sheets.HISTORIAL_MOVIMIENTOS || []).length >= 2, 'HISTORIAL_MOVIMIENTOS must remain accessible when VER_HISTORIAL=SI');
  assert.ok((sofiState.sheets.HISTORIAL_SEG || []).length >= 2, 'HISTORIAL_SEG must remain accessible when VER_HISTORIAL=SI');

  // 3) Ana has VER_SEGUIMIENTO=SI, VER_HISTORIAL=NO:
  //    - Allowed on seg_get_state & seg_get_delta, with history sheets stripped and her quotes kept
  const anaState = rt.post({ action: 'seg_get_state', authToken: anaTok });
  assert.equal(anaState.ok, true, 'Ana with VER_SEGUIMIENTO=SI must succeed on seg_get_state');
  assert.ok((anaState.sheets.COTIZACIONES_CREATA || []).length >= 2, 'Ana sees her quotes');
  assert.equal((anaState.sheets.HISTORIAL_MOVIMIENTOS || []).length, 0, 'HISTORIAL_MOVIMIENTOS must be stripped when VER_HISTORIAL=NO');
  assert.equal((anaState.sheets.HISTORIAL_SEG || []).length, 0, 'HISTORIAL_SEG must be stripped when VER_HISTORIAL=NO');

  // 4) Kevin (full admin) sees both
  const kevinState = rt.post({ action: 'seg_get_state', authToken: kevinTok });
  assert.equal(kevinState.ok, true);
  assert.ok((kevinState.sheets.COTIZACIONES_CREATA || []).length >= 3);
  assert.ok((kevinState.sheets.HISTORIAL_MOVIMIENTOS || []).length >= 3);
});

test('SEC-04: VER_COTIZADOR enforced for ALL roles across all 5 quote/client endpoints & VER_CAMBIAR_TIENDA enforced for admins', () => {
  const rt = buildSecurityRuntime();
  const luisTok = rt.login('luis.noperm@grupoanipa.com', 'LuisNoPerm26!');
  const adminNoCotTok = rt.login('admin.nocot@grupoanipa.com', 'AdminNoCot26!');
  const adminLimTok = rt.login('admin.limited@grupoanipa.com', 'AdminLim2026!');

  // Both non-admin and admin with VER_COTIZADOR=NO must be blocked on all 5 quote/client actions
  for (const [label, tok] of [['non-admin', luisTok], ['admin', adminNoCotTok]]) {
    const rSubmit = rt.post({ action: 'inv_submit_quote', authToken: tok, items: [{ sku: 'SKU-ZERO', qty: 1 }] });
    assert.equal(rSubmit.ok, false, `${label} VER_COTIZADOR=NO blocked on inv_submit_quote`);
    assert.equal(rSubmit.forbidden, true);

    const rMyQ = rt.post({ action: 'inv_my_quotes', authToken: tok });
    assert.equal(rMyQ.ok, false, `${label} VER_COTIZADOR=NO blocked on inv_my_quotes`);
    assert.equal(rMyQ.forbidden, true);

    const rPdf = rt.post({ action: 'inv_download_erp_quote_pdf', authToken: tok, quoteId: 9002 });
    assert.equal(rPdf.ok, false, `${label} VER_COTIZADOR=NO blocked on inv_download_erp_quote_pdf`);
    assert.equal(rPdf.forbidden, true);

    const rSearch = rt.post({ action: 'inv_search_erp_clients', authToken: tok, query: 'Cliente' });
    assert.equal(rSearch.ok, false, `${label} VER_COTIZADOR=NO blocked on inv_search_erp_clients`);
    assert.equal(rSearch.forbidden, true);

    const rCreate = rt.post({ action: 'inv_create_erp_client', authToken: tok, nombre: 'Juan Test' });
    assert.equal(rCreate.ok, false, `${label} VER_COTIZADOR=NO blocked on inv_create_erp_client`);
    assert.equal(rCreate.forbidden, true);
  }

  // Admin with VER_CAMBIAR_TIENDA=NO cannot override erpStore in inv_my_quotes or erpAdvisorId in inv_create_erp_client
  const myQOverride = rt.post({
    action: 'inv_my_quotes',
    authToken: adminLimTok,
    erpStore: 'CASA CREATA BONAMPAK'
  });
  assert.equal(myQOverride.ok, true);
  assert.notEqual(
    String(myQOverride.activeStore || '').toUpperCase(),
    'CASA CREATA BONAMPAK',
    'Admin with VER_CAMBIAR_TIENDA=NO must NOT switch erpStore in inv_my_quotes'
  );

  let capturedAgentId = null;
  rt.env.context.callSmuebleriaWcf_ = (_soapAction, bodyXml) => {
    const m = String(bodyXml || '').match(/<IdAgenteVentas>(\d+)<\/IdAgenteVentas>/);
    if (m) capturedAgentId = Number(m[1]);
    return '<InsertarClienteResult>777</InsertarClienteResult>';
  };
  rt.post({
    action: 'inv_create_erp_client',
    authToken: adminLimTok,
    nombre: 'Cliente Restringido',
    erpAdvisorId: '99999'
  });
  assert.notEqual(capturedAgentId, 99999, 'Admin with VER_CAMBIAR_TIENDA=NO must NOT override erpAdvisorId in inv_create_erp_client');
  assert.equal(capturedAgentId, 201, 'Admin with VER_CAMBIAR_TIENDA=NO must use their own erpAdvisorId');
});

test('SEC-05: handleSegAction_ enforces strict subAction allowlist before logging and validates SEG_NUEVA_COTIZACION_APP items & folio ownership', () => {
  const rt = buildSecurityRuntime();
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');

  const shHistInv = rt.ssInv.getSheetByName('HISTORIAL');
  const shHistSeg = rt.ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
  const shCotSeg = rt.ssSeg.getSheetByName('COTIZACIONES_CREATA');

  const histInvBefore = shHistInv.getLastRow();
  const histSegBefore = shHistSeg.getLastRow();
  const cotBefore = shCotSeg.getLastRow();

  // 1) Unknown subAction rejected BEFORE logging anything
  const badSub = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_ARBITRARY_FORGED_EVENT',
    folio: 'PL-100',
    payload: { note: 'poison' }
  });
  assert.equal(badSub.ok, false);
  assert.match(String(badSub.error || ''), /no permitida/i);
  assert.equal(shHistInv.getLastRow(), histInvBefore, 'Rejected unknown subAction must NOT write to HISTORIAL');
  assert.equal(shHistSeg.getLastRow(), histSegBefore, 'Rejected unknown subAction must NOT write to HISTORIAL_MOVIMIENTOS');

  // 2) SEG_NUEVA_COTIZACION_APP with > 15 items rejected
  const tooManyItems = Array.from({ length: 16 }, (_, idx) => ({ sku: 'SKU-' + idx, qty: 1, price: 100 }));
  const overCap = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'PL-100',
    payload: { folio: 'PL-100', clientName: 'Cliente Ana', items: tooManyItems }
  });
  assert.equal(overCap.ok, false, 'SEG_NUEVA_COTIZACION_APP with > 15 items must be rejected');

  // 3) Non-admin attempting SEG_NUEVA_COTIZACION_APP with fabricated folio (not in COTIZACIONES_EN_VIVO) -> rejected
  const fakeFolio = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'PL-FORGED-999',
    payload: { folio: 'PL-FORGED-999', clientName: 'Fake Client', items: [{ sku: 'SKU-ZERO', qty: 1, price: 1 }] }
  });
  assert.equal(fakeFolio.ok, false, 'Non-admin must NOT inject fabricated folio not in COTIZACIONES_EN_VIVO');
  assert.equal(fakeFolio.forbidden, true);
  assert.equal(shCotSeg.getLastRow(), cotBefore, 'Rejected fabricated quote must write 0 rows to COTIZACIONES_CREATA');

  // 4) Non-admin attempting SEG_NUEVA_COTIZACION_APP for ANOTHER advisor's folio (CO-200 owned by Luis) -> rejected
  const stolenFolio = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'CO-200',
    payload: { folio: 'CO-200', clientName: 'Hijacked', items: [{ sku: 'SKU-ZERO', qty: 1, price: 1 }] }
  });
  assert.equal(stolenFolio.ok, false, 'Non-admin must NOT overwrite another advisor folio');
  assert.equal(stolenFolio.forbidden, true);

  // 5) Non-admin with valid owned folio in COTIZACIONES_EN_VIVO (PL-100) and <= 15 items -> allowed
  const validOwn = rt.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'PL-100',
    payload: { folio: 'PL-100', clientName: 'Cliente Ana', items: [{ sku: 'SKU-ZERO', qty: 1, price: 10000 }] }
  });
  assert.equal(validOwn.ok, true, 'Non-admin must be allowed to sync their own verified folio from COTIZACIONES_EN_VIVO');

  // 6) Admin can register valid folio with <= 15 items
  const validAdmin = rt.post({
    action: 'seg_action',
    authToken: kevinTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'PL-ADMIN-1',
    payload: { folio: 'PL-ADMIN-1', clientName: 'Admin Quote', items: [{ sku: 'SKU-ZERO', qty: 1, price: 10000 }] }
  });
  assert.equal(validAdmin.ok, true);
});

test('SEC-06: AppsScript_Parche_Fotos_V2.gs has 100% doPost route parity with Creata, includes hist_archive_and_analyze_kevin, and zero top-level const/let', () => {
  const creataSrc = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const parcheSrc = readRepo('AppsScript_Parche_Fotos_V2.gs');

  assert.ok(!/^(?:const|let)\s+/m.test(parcheSrc), 'AppsScript_Parche_Fotos_V2.gs must have ZERO top-level const/let');

  const creataDoPost = extractTopLevelFunction(creataSrc, 'doPost');
  const parcheDoPost = extractTopLevelFunction(parcheSrc, 'doPost');

  const getActions = (fnBody) => Array.from(new Set(Array.from(fnBody.matchAll(/action\s*===\s*'([^']+)'/g), (m) => m[1]))).sort();
  const creataActions = getActions(creataDoPost);
  const parcheActions = getActions(parcheDoPost);

  const missingInParche = creataActions.filter((a) => !parcheActions.includes(a));
  const extraInParche = parcheActions.filter((a) => !creataActions.includes(a));
  assert.deepEqual(missingInParche, [], `AppsScript_Parche_Fotos_V2.gs doPost is missing routes: ${missingInParche.join(', ')}`);
  assert.deepEqual(extraInParche, [], `AppsScript_Parche_Fotos_V2.gs doPost has unexpected extra routes: ${extraInParche.join(', ')}`);
  assert.equal(creataActions.length, 53, 'Expected 53 doPost routes in AppsScript_Creata_Drive_Sheets.gs');
  assert.equal(parcheActions.length, 53, 'Expected 53 doPost routes in AppsScript_Parche_Fotos_V2.gs');
  assert.ok(parcheActions.includes('hist_archive_and_analyze_kevin'), 'Parche doPost must route hist_archive_and_analyze_kevin');
  assert.ok(parcheActions.includes('fotos_photo_action'), 'Parche doPost must route fotos_photo_action');

  // Ensure auth gate parity on SEC-07 & SEC-09 inside BOTH Creata and Parche doPost
  assert.match(creataDoPost, /handleInvLogEvent_\(body,\s*gate\.tokenInfo \|\| null,\s*!!gate\.viaPin\)/, 'Creata doPost must forward gate.tokenInfo || null and !!gate.viaPin into handleInvLogEvent_');
  assert.match(parcheDoPost, /handleInvLogEvent_\(body,\s*gate\.tokenInfo \|\| null,\s*!!gate\.viaPin\)/, 'Parche doPost must forward gate.tokenInfo || null and !!gate.viaPin into handleInvLogEvent_');
  const plantMatch = parcheDoPost.match(/if \(action === 'inv_plantilla_status'\)[\s\S]{0,260}/);
  assert.ok(plantMatch && /allowGuest:\s*false/.test(plantMatch[0]), 'Parche doPost inv_plantilla_status must enforce allowGuest: false');
});

test('SEC-07: inv_log_event binds non-admin usuario & branch, restricts classification, blocks SEGUIMIENTO_COTIZACIONES/SEG_* injection, and fails closed without viaPin', () => {
  const rt = buildSecurityRuntime();
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');
  const adminLimTok = rt.login('admin.limited@grupoanipa.com', 'AdminLim2026!');
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const luisTok = rt.login('luis.noperm@grupoanipa.com', 'LuisNoPerm26!');
  const guestTok = rt.login('invitado.sec@cliente.com', 'InvSec2026!');
  const shHist = rt.ssInv.getSheetByName('HISTORIAL');

  // 1) Non-admin tries to spoof user = "Kevin Reyna", branch = "CEDIS", classification = "MOVIMIENTO", and inject formulas
  const anaLog = rt.post({
    action: 'inv_log_event',
    authToken: anaTok,
    classification: 'MOVIMIENTO',
    module: '=HYPERLINK("evil")',
    event: '+FORGED_EVENT',
    user: 'Kevin Reyna (kevin.reyna@grupoanipa.com)',
    branch: 'CEDIS',
    ref: '=1+1',
    detail: '@SUM(A1:A10)'
  });
  assert.equal(anaLog.ok, true);
  const lastAnaRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
  assert.equal(lastAnaRow[1], 'FALLO DE CÓDIGO', 'Non-admin inv_log_event MUST NOT spoof MOVIMIENTO classification');
  assert.equal(lastAnaRow[5], 'ana.playa@grupoanipa.com', 'Non-admin inv_log_event MUST force usuario to verified tokenInfo.email');
  assert.equal(lastAnaRow[6], 'CREATA LIVING PLAYA', 'Non-admin inv_log_event MUST bind branch to verified assigned store');
  assert.ok(String(lastAnaRow[2]).startsWith("'="), 'Module formula injection must be neutralized');
  assert.ok(String(lastAnaRow[3]).startsWith("'+"), 'Event formula injection must be neutralized');
  assert.ok(String(lastAnaRow[7]).startsWith("'="), 'Ref formula injection must be neutralized');
  assert.ok(String(lastAnaRow[8]).startsWith("'@"), 'Detail formula injection must be neutralized');

  // Legitimate non-admin ALERTA TÉCNICA telemetry stays allowed and store-bound
  const anaAlert = rt.post({
    action: 'inv_log_event',
    authToken: anaTok,
    classification: 'ALERTA TÉCNICA',
    module: 'inventario-app.js',
    event: 'ERROR_RED_CARGA',
    branch: 'CASA CREATA BONAMPAK',
    detail: 'Timeout cargando foto'
  });
  assert.equal(anaAlert.ok, true);
  const lastAnaAlertRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
  assert.equal(lastAnaAlertRow[1], 'ALERTA TÉCNICA');
  assert.equal(lastAnaAlertRow[6], 'CREATA LIVING PLAYA');

  // 2) Guest tries to forge MOVIMIENTO as Kevin Reyna -> forced to guest email, SOLO LECTURA branch, & non-MOVIMIENTO classification
  const guestLog = rt.post({
    action: 'inv_log_event',
    authToken: guestTok,
    classification: 'MOVIMIENTO',
    module: 'inventario-app.js',
    event: 'FAKE_QUOTE_APPROVED',
    user: 'Kevin Reyna',
    branch: 'PLAYA',
    detail: 'Spoofed movement'
  });
  assert.equal(guestLog.ok, true);
  const lastGuestRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
  assert.equal(lastGuestRow[5], 'invitado.sec@cliente.com', 'Guest inv_log_event MUST force usuario to verified guest email');
  assert.equal(lastGuestRow[6], 'SOLO LECTURA', 'Guest inv_log_event MUST bind branch to SOLO LECTURA');
  assert.notEqual(lastGuestRow[1], 'MOVIMIENTO', 'Read-only guest MUST NOT write MOVIMIENTO entries to HISTORIAL');
  assert.ok(lastGuestRow[1] === 'FALLO DE CÓDIGO' || lastGuestRow[1] === 'ALERTA TÉCNICA');

  // 3) CRITICAL REGRESSION: Guest & VER_SEGUIMIENTO=NO advisor & VER_SEGUIMIENTO=NO admin CANNOT inject SEGUIMIENTO_COTIZACIONES or SEG_* via inv_log_event
  const kevinBefore = rt.post({ action: 'seg_get_state', authToken: kevinTok });
  assert.equal(kevinBefore.ok, true);
  const histSegCountBefore = (kevinBefore.sheets.HISTORIAL_SEG || []).length;
  const histRowsBefore = shHist.getLastRow();

  const guestSegAttack = rt.post({
    action: 'inv_log_event',
    authToken: guestTok,
    classification: 'MOVIMIENTO',
    module: 'SEGUIMIENTO_COTIZACIONES',
    event: 'SEG_CIERRE',
    branch: 'PLAYA',
    ref: 'PL-100',
    detail: '{"estatus":"PERDIDA","motivo":"HIJACKED_BY_GUEST","asesor":"Kevin Reyna"}'
  });
  assert.equal(guestSegAttack.ok, false, 'Guest MUST be blocked from logging SEGUIMIENTO_COTIZACIONES via inv_log_event');
  assert.equal(guestSegAttack.forbidden, true);

  const luisSegNewAttack = rt.post({
    action: 'inv_log_event',
    authToken: luisTok,
    classification: 'MOVIMIENTO',
    module: 'SEGUIMIENTO_COTIZACIONES',
    event: 'SEG_NUEVA_COTIZACION_APP',
    branch: 'PLAYA',
    ref: 'PL-FORGED-999',
    detail: '{"folio":"PL-FORGED-999","clientName":"Injected","items":[{"sku":"X","qty":1,"price":1}]}'
  });
  assert.equal(luisSegNewAttack.ok, false, 'VER_SEGUIMIENTO=NO advisor MUST be blocked from logging SEG_NUEVA_COTIZACION_APP via inv_log_event');
  assert.equal(luisSegNewAttack.forbidden, true);

  const luisSegPrefixOnly = rt.post({
    action: 'inv_log_event',
    authToken: luisTok,
    classification: 'FALLO DE CÓDIGO',
    module: 'inventario-app.js',
    event: 'seg_cierre',
    ref: 'PL-100',
    detail: '{}'
  });
  assert.equal(luisSegPrefixOnly.ok, false, 'Non-admin MUST be blocked on /^SEG_/i event prefix even with different module');
  assert.equal(luisSegPrefixOnly.forbidden, true);

  const adminNoSegAttack = rt.post({
    action: 'inv_log_event',
    authToken: adminLimTok,
    classification: 'MOVIMIENTO',
    module: 'SEGUIMIENTO_COTIZACIONES',
    event: 'SEG_CIERRE',
    ref: 'PL-100',
    detail: '{"estatus":"PERDIDA"}'
  });
  assert.equal(adminNoSegAttack.ok, false, 'Admin with VER_SEGUIMIENTO=NO MUST also be blocked from injecting Seguimiento events via inv_log_event');
  assert.equal(adminNoSegAttack.forbidden, true);

  assert.equal(shHist.getLastRow(), histRowsBefore, 'Blocked Seguimiento injection attempts must write 0 rows to HISTORIAL');
  const kevinAfterAttacks = rt.post({ action: 'seg_get_state', authToken: kevinTok });
  assert.equal(kevinAfterAttacks.ok, true);
  assert.equal((kevinAfterAttacks.sheets.HISTORIAL_SEG || []).length, histSegCountBefore, 'Kevin HISTORIAL_SEG must contain 0 injected rows after guest/advisor attacks');

  // 4) Direct handleInvLogEvent_ call with tokenInfo=null and viaPin=false/omitted MUST fail closed (authRequired: true)
  const failClosedFalse = rt.env.context.handleInvLogEvent_({ module: 'inventario-app.js', event: 'UNAUTH_TEST' }, null, false);
  assert.equal(failClosedFalse.ok, false, 'handleInvLogEvent_(body, null, false) MUST fail closed');
  assert.equal(failClosedFalse.authRequired, true);
  const failClosedOmitted = rt.env.context.handleInvLogEvent_({ module: 'inventario-app.js', event: 'UNAUTH_TEST' }, null);
  assert.equal(failClosedOmitted.ok, false, 'handleInvLogEvent_(body, null) without viaPin MUST fail closed');
  assert.equal(failClosedOmitted.authRequired, true);
  assert.equal(shHist.getLastRow(), histRowsBefore, 'Fail-closed handleInvLogEvent_ calls must write 0 rows');

  // Explicitly verified viaPin === true succeeds
  const pinAllowed = rt.env.context.handleInvLogEvent_({ classification: 'MOVIMIENTO', module: 'inventario-app.js', event: 'ADMIN_PIN_AUDIT', user: 'Admin PIN', branch: 'CEDIS' }, null, true);
  assert.equal(pinAllowed.ok, true, 'handleInvLogEvent_ with explicit viaPin === true must succeed');

  // 5) Defense-in-depth in handleSegGetState_: non-MOVIMIENTO rows in HISTORIAL are NEVER replayed into HISTORIAL_SEG even if MODULO === SEGUIMIENTO_COTIZACIONES
  shHist.appendRow(['27/11/2026 08:00', 'FALLO DE CÓDIGO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_CIERRE', '❌ ERROR', 'invitado.sec@cliente.com', 'PLAYA', 'PL-100', '{"estatus":"PERDIDA"}', 'Injected non-movimiento']);
  shHist.appendRow(['27/11/2026 08:01', 'ALERTA TÉCNICA', 'SEGUIMIENTO_COTIZACIONES', 'SEG_TELEFONO', '⚠️ ALERTA', 'ana.playa@grupoanipa.com', 'PLAYA', 'PL-100', '{"telefono":"000"}', 'Injected alert']);
  const kevinAfterNonMov = rt.post({ action: 'seg_get_state', authToken: kevinTok });
  assert.equal(kevinAfterNonMov.ok, true);
  const segRowsAfter = kevinAfterNonMov.sheets.HISTORIAL_SEG || [];
  assert.equal(segRowsAfter.length, histSegCountBefore, 'handleSegGetState_ MUST ignore non-MOVIMIENTO rows in HISTORIAL even when MODULO === SEGUIMIENTO_COTIZACIONES');
  assert.ok(segRowsAfter.slice(1).every((r) => String(r[1] || '').trim().toUpperCase() === 'MOVIMIENTO'), 'Every replayed HISTORIAL_SEG row must have classification === MOVIMIENTO');
});

test('SEC-08: doGet inv_presence_list rejects accessKey in URL query parameters (POST-only for key fallback)', () => {
  const rt = buildSecurityRuntime();
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');

  // Passing accessKey via GET query params must be rejected even with valid credentials
  const getWithKey = rt.get({
    action: 'inv_presence_list',
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinSec2026!'
  });
  assert.equal(getWithKey.ok, false, 'doGet inv_presence_list MUST reject accessKey query parameter (SEC-08)');

  // Even alongside a token, passing accessKey in GET URL must be rejected
  const getWithTokAndKey = rt.get({
    action: 'inv_presence_list',
    authToken: kevinTok,
    accessKey: 'KevinSec2026!'
  });
  assert.equal(getWithTokAndKey.ok, false, 'doGet inv_presence_list MUST reject requests leaking accessKey in URL query params');

  // Valid signed authToken without accessKey still succeeds on doGet
  const getWithTok = rt.get({
    action: 'inv_presence_list',
    authToken: kevinTok
  });
  assert.equal(getWithTok.ok, true, 'doGet inv_presence_list with valid authToken only must still work');
});

test('SEC-09: inv_plantilla_status blocks read-only guests on both doGet and doPost', () => {
  const rt = buildSecurityRuntime();
  const shPlant = rt.ssInv.getSheetByName('plantilla');
  const origGetRange = shPlant.getRange.bind(shPlant);
  shPlant.getRange = (a, b, c, d) => {
    if (typeof a === 'string') {
      if (a === 'A5:M11') {
        return { getDisplayValues: () => [['', '', 'CREATA LIVING PLAYA', '', '', '', '', '', '', '', 'OK', '', ''], ['', '', 'ANA PLAYA', '', '', '', '101', '', '', '', 'Registrada', '', ''], ['', '', '', '', '', '', '', '', '', '', '9001', '', 'PL-100'], ['', '', '', '', '', '', '', '', '', '', 'Cliente A', '', ''], ['', '', '', '', '', '', '', '', '', '', '2026-11-26', '', '']] };
      }
      if (a === 'F30:H33') {
        return { getDisplayValues: () => [['', '', '0'], ['', '', '10000'], ['', '', '1600'], ['', '', '11600']] };
      }
    }
    return origGetRange(a, b, c, d);
  };
  const guestTok = rt.login('invitado.sec@cliente.com', 'InvSec2026!');
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');

  const getGuest = rt.get({ action: 'inv_plantilla_status', authToken: guestTok });
  assert.equal(getGuest.ok, false, 'Guest MUST be blocked from doGet inv_plantilla_status (SEC-09)');

  const postGuest = rt.post({ action: 'inv_plantilla_status', authToken: guestTok });
  assert.equal(postGuest.ok, false, 'Guest MUST be blocked from doPost inv_plantilla_status (SEC-09)');

  const postStaff = rt.post({ action: 'inv_plantilla_status', authToken: anaTok });
  assert.equal(postStaff.ok, true, 'Authenticated staff must still access inv_plantilla_status');
  assert.equal(postStaff.folio, 'PL-100');
});

test('SEC-10: Password hashing defaults ON with iterated sha256i$, verifies legacy sha256$ & plaintext, and enforces min length >= 8', () => {
  const rt = buildSecurityRuntime(); // HASH_USER_PASSWORDS intentionally NOT set

  // 1) hashUserPassword_ uses iterated format sha256i$<iters>$<salt>$<hex> with >= 2000 rounds
  const h1 = rt.env.context.hashUserPassword_('ClaveFuerte2026!');
  const h2 = rt.env.context.hashUserPassword_('ClaveFuerte2026!');
  const m = /^sha256i\$(\d+)\$([a-zA-Z0-9_-]{8,})\$([a-f0-9]{64})$/.exec(h1);
  assert.ok(m, `Expected iterated sha256i$ hash, got: ${h1}`);
  assert.ok(Number(m[1]) >= 2000, `Expected >= 2000 iterations, got ${m[1]}`);
  assert.notEqual(h1, h2, 'Each hash must have a unique salt');
  assert.equal(rt.env.context.keysEqualNormalized_('ClaveFuerte2026!', h1), true);
  assert.equal(rt.env.context.keysEqualNormalized_('OtraClave!', h1), false);

  // 2) Backward compatibility: legacy single-round sha256$<salt>$<hex> and plaintext still verify
  const legacyDigest = rt.env.context.bytesToHex_(
    rt.env.context.Utilities.computeDigest(rt.env.context.Utilities.DigestAlgorithm.SHA_256, 'legacysalt123456:LegacyPass2026!')
  );
  const legacyStored = 'sha256$legacysalt123456$' + legacyDigest;
  assert.equal(rt.env.context.isHashedPassword_(legacyStored), true);
  assert.equal(rt.env.context.keysEqualNormalized_('LegacyPass2026!', legacyStored), true);
  assert.equal(rt.env.context.keysEqualNormalized_('WrongLegacy!', legacyStored), false);
  assert.equal(rt.env.context.keysEqualNormalized_('PlainOld1!', 'PlainOld1!'), true);

  // 3) Short password (< 8 chars) rejected in inv_update_key
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const tooShort = rt.post({
    action: 'inv_update_key',
    email: 'ana.playa@grupoanipa.com',
    currentKey: 'AnaPlaya2026!',
    newKey: 'abc123',
    authToken: anaTok
  });
  assert.equal(tooShort.ok, false, 'inv_update_key must reject passwords shorter than 8 chars');

  // 4) Valid password update stores iterated hash by default (when HASH_USER_PASSWORDS is unset)
  const updOk = rt.post({
    action: 'inv_update_key',
    email: 'ana.playa@grupoanipa.com',
    currentKey: 'AnaPlaya2026!',
    newKey: 'AnaSuperClave2026!',
    authToken: anaTok
  });
  assert.equal(updOk.ok, true);
  const shUsers = rt.ssInv.getSheetByName('CUENTAS ADMINISTRATIVAS');
  const storedAnaKey = String(shUsers.getRange(6, 7).getValue() || '');
  assert.match(storedAnaKey, /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/, 'Updated key must be stored as iterated sha256i$ hash by default');
  assert.notEqual(storedAnaKey, 'AnaSuperClave2026!');

  // And login with the new password works cleanly!
  const relogin = rt.post({
    action: 'inv_login',
    email: 'ana.playa@grupoanipa.com',
    accessKey: 'AnaSuperClave2026!',
    deviceId: 'dev_ana_relogin'
  });
  assert.equal(relogin.ok, true, 'Login must succeed against iterated sha256i$ stored hash');
});

test('SEC-11: seguimiento-app.js tightens isKevinReyna() & master list, GAS binds non-admin erpStore on demand/suggestions, and quote print template coerces fields', () => {
  // 1) seguimiento-app.js checks
  const segJs = readRepo('seguimiento-app.js');
  assert.ok(!segJs.includes('preci3942@gmail.com'), 'seguimiento-app.js must NOT hardcode preci3942@gmail.com as master executive');

  const isKevinFnMatch = segJs.match(/function isKevinReyna\(user\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(isKevinFnMatch, 'isKevinReyna(user) must exist in seguimiento-app.js');
  const ctx = {
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    normalizeText: (v) => String(v || '').trim().toUpperCase()
  };
  vm.runInNewContext(`${isKevinFnMatch[0]}\nthis.isKevinReyna = isKevinReyna;`, ctx);
  assert.equal(ctx.isKevinReyna({ correo: 'kevin.reyna@grupoanipa.com', nombre: 'Kevin', puesto: 'Admin' }), true);
  assert.equal(ctx.isKevinReyna({ correo: 'impostor@grupoanipa.com', nombre: 'KEVIN REYNA', puesto: 'IMPLEMENTACION' }), false, 'isKevinReyna must NOT trust display name or puesto');

  // 2) GAS demand request & purchase suggestion store binding for non-admins
  const rt = buildSecurityRuntime();
  const anaTok = rt.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const multiTok = rt.login('multi.tienda@grupoanipa.com', 'MultiTienda26!', { sheetTab: 'PLAYA' });
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');

  const anaDemand = rt.post({
    action: 'inv_register_demand_request',
    authToken: anaTok,
    erpStore: 'CASA CREATA BONAMPAK',
    sku: 'SKU-ZERO',
    modelName: 'SILLA ZERO',
    comments: 'Cliente pide reposición'
  });
  assert.equal(anaDemand.ok, true);
  assert.equal(anaDemand.record.store, 'CREATA LIVING PLAYA', 'Non-admin demand request must be bound to verified assigned store, not spoofed erpStore');

  const anaSug = rt.post({
    action: 'inv_register_purchase_suggestion',
    authToken: anaTok,
    erpStore: 'CASA CREATA BONAMPAK',
    ambiente: 'INTERIOR',
    tipoProducto: 'Sofá',
    comments: 'Sugerencia en tienda equivocada'
  });
  assert.equal(anaSug.ok, true);
  assert.equal(anaSug.record.store, 'CREATA LIVING PLAYA', 'Non-admin purchase suggestion must be bound to verified assigned store');

  // Multi-store advisor CAN choose one of their own assigned stores (COLOCIO)
  const multiSug = rt.post({
    action: 'inv_register_purchase_suggestion',
    authToken: multiTok,
    erpStore: 'CREATA LIVING COLOSIO',
    ambiente: 'EXTERIOR',
    tipoProducto: 'Camastro',
    comments: 'Desde su otra tienda asignada'
  });
  assert.equal(multiSug.ok, true);
  assert.equal(multiSug.record.store, 'CREATA LIVING COLOSIO', 'Multi-store user may select one of their own assigned stores');

  // Admin CAN specify target store
  const kevinDemand = rt.post({
    action: 'inv_register_demand_request',
    authToken: kevinTok,
    erpStore: 'CASA CREATA BONAMPAK',
    sku: 'SKU-ZERO',
    modelName: 'SILLA ZERO',
    comments: 'Registro administrativo para Casa Creata'
  });
  assert.equal(kevinDemand.ok, true);
  assert.equal(kevinDemand.record.store, 'CASA CREATA BONAMPAK');

  // 3) resolveAuthenticatedAdvisor_ supports advisorEmail || email || correo fallback
  const authFallback = rt.env.context.resolveAuthenticatedAdvisor_(rt.ssInv, [], {
    email: 'ana.playa@grupoanipa.com',
    accessKey: 'AnaPlaya2026!'
  });
  assert.equal(authFallback.ok, true, 'resolveAuthenticatedAdvisor_ must accept body.email fallback consistently');

  // 4) inventario-app.js printable quote template coerces numeric qty/discountPct and validates/escapes logoSrc
  const invJs = readRepo('inventario-app.js');
  const printFnStart = invJs.indexOf('function openPrintableQuoteWindow(');
  assert.ok(printFnStart > 0);
  const printSlice = invJs.slice(printFnStart, printFnStart + 3800);
  assert.ok(!/' \+ ln\.qty \+ '/.test(printSlice), 'openPrintableQuoteWindow must coerce ln.qty numerically instead of raw concatenation');
  assert.ok(!/' \+ logoSrc \+ '/.test(printSlice), 'openPrintableQuoteWindow must validate & escape logoSrc before injecting into img src');
});

test('SEC-12 (R2 defense-in-depth): targetFolio alignment, admin cambiarTienda store gate, multi-store hash memoization, array purge, and printable quote Infinity/photoUrl hardening', () => {
  const rt = buildSecurityRuntime();
  const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');
  const adminLimTok = rt.login('admin.limited@grupoanipa.com', 'AdminLim2026!');

  // 1) handleSegAction_ SEG_NUEVA_COTIZACION_APP uses validated targetFolio (payload.folio) in HISTORIAL referencia
  const shHist = rt.ssInv.getSheetByName('HISTORIAL');
  const segAlign = rt.post({
    action: 'seg_action',
    authToken: kevinTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'RAW-MISMATCH-999',
    payload: { folio: 'PL-ALIGN-777', clientName: 'Cliente Align', items: [{ sku: 'SKU-ZERO', qty: 1, price: 100 }] }
  });
  assert.equal(segAlign.ok, true);
  const lastHistRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
  assert.equal(lastHistRow[7], 'PL-ALIGN-777', 'HISTORIAL referencia must match validated targetFolio instead of mismatched raw folio');

  // 2) resolveAuthorizedUserStoreForLog_ enforces VER_CAMBIAR_TIENDA for admins (admin.limited has VER_CAMBIAR_TIENDA=NO)
  const adminLimDemand = rt.post({
    action: 'inv_register_demand_request',
    authToken: adminLimTok,
    erpStore: 'CASA CREATA BONAMPAK',
    sku: 'SKU-ZERO',
    modelName: 'SILLA ZERO',
    comments: 'Admin sin permiso cambiarTienda'
  });
  assert.equal(adminLimDemand.ok, true);
  assert.notEqual(
    String(adminLimDemand.record.store || '').toUpperCase(),
    'CASA CREATA BONAMPAK',
    'Admin with VER_CAMBIAR_TIENDA=NO must NOT override store on inv_register_demand_request'
  );

  // 3) handleInvLogin_ memoizes keysEqualNormalized_ per stored hash across multi-store rows (5 stores = 1 hash verification, not 6)
  const hashedMulti = rt.env.context.hashUserPassword_('KevinSec2026!');
  const shUsers = rt.ssInv.getSheetByName('CUENTAS ADMINISTRATIVAS');
  shUsers.getRange(3, 7).setValue(hashedMulti); // Kevin is assigned to all 5 stores (PLAYA..PROYECTOS)
  let keysEqCalls = 0;
  const origKeysEq = rt.env.context.keysEqualNormalized_;
  rt.env.context.keysEqualNormalized_ = function (rawKey, storedKey) {
    keysEqCalls++;
    return origKeysEq.call(this, rawKey, storedKey);
  };
  const multiLogin = rt.post({
    action: 'inv_login',
    email: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinSec2026!',
    deviceId: 'dev_memo_test'
  });
  rt.env.context.keysEqualNormalized_ = origKeysEq;
  assert.equal(multiLogin.ok, true);
  assert.equal(keysEqCalls, 1, `Expected 1 memoized keysEqualNormalized_ call for 5-store user sharing 1 hash, got ${keysEqCalls}`);

  // 4) inventario-app.js: purgeLegacySyncedPendingKeys() removes array-corrupted "[]" entry
  const invJs = readRepo('inventario-app.js');
  const purgeStart = invJs.indexOf('function purgeLegacySyncedPendingKeys(');
  let pDepth = 0, pStarted = false, pEnd = purgeStart;
  for (let i = purgeStart; i < invJs.length; i++) {
    if (invJs[i] === '{') { pDepth++; pStarted = true; }
    else if (invJs[i] === '}') { pDepth--; if (pStarted && pDepth === 0) { pEnd = i + 1; break; } }
  }
  const store = new Map([['creata_inv_updated_keys_v1', '[]']]);
  vm.runInNewContext(`${invJs.slice(purgeStart, pEnd)}\npurgeLegacySyncedPendingKeys();`, {
    PENDING_KEYS_STORAGE: 'creata_inv_updated_keys_v1',
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    JSON, Object, Array, String, Boolean
  });
  assert.equal(store.has('creata_inv_updated_keys_v1'), false, 'Array-corrupted "[]" PENDING_KEYS_STORAGE entry MUST be removed cleanly');

  // 5) inventario-app.js: openPrintableQuoteWindow() guards Infinity qty/discountPct and blocks javascript:/vbscript: photoUrl
  const printStart = invJs.indexOf('function openPrintableQuoteWindow(');
  let qDepth = 0, qStarted = false, qEnd = printStart;
  for (let i = printStart; i < invJs.length; i++) {
    if (invJs[i] === '{') { qDepth++; qStarted = true; }
    else if (invJs[i] === '}') { qDepth--; if (qStarted && qDepth === 0) { qEnd = i + 1; break; } }
  }
  let writtenHtml = '';
  const printCtx = {
    window: {
      CREATA_LOGO_B64: 'fotos/logo-creata.webp',
      open: () => ({
        document: { write: (h) => { writtenHtml += h; }, close: () => {} }
      })
    },
    formatDateDMY: () => '27/11/2026',
    formatPrice: (n) => '$' + String(n || 0),
    escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    Number, Math, String, Array, Date
  };
  vm.runInNewContext(`${invJs.slice(printStart, qEnd)}\nthis.openPrintableQuoteWindow = openPrintableQuoteWindow;`, printCtx);
  printCtx.openPrintableQuoteWindow({
    clientName: 'Cliente Seguro',
    erpStore: 'PLAYA',
    deliveryDate: '2026-12-27',
    advisorName: 'Ana',
    breakdown: {
      subtotalNet: 1000,
      extraDiscountAmt: 0,
      iva: 160,
      total: 1160,
      lines: [
        { name: 'Attack Line', qty: 'Infinity', discountPct: 'Infinity', unitList: 100, lineSubtotal: 100, photoUrl: 'javascript:alert(1)' },
        { name: 'VBScript Line', qty: -3, discountPct: 150, unitList: 100, lineSubtotal: 100, photoUrl: 'vbscript:msgbox(1)' },
        { name: 'Safe HTTPS', qty: 2, discountPct: 10, unitList: 500, lineSubtotal: 900, photoUrl: 'https://lh3.googleusercontent.com/d/abc123=w400' },
        { name: 'Safe Relative', qty: 1, discountPct: 0, unitList: 100, lineSubtotal: 100, photoUrl: 'fotos/silla_ok.webp' }
      ]
    }
  }, { folio: 'PL-SAFE-1' });
  assert.ok(!writtenHtml.includes('>Infinity<'), 'Non-finite qty MUST NOT render as Infinity');
  assert.ok(!/javascript:/i.test(writtenHtml), 'javascript: photoUrl MUST be stripped');
  assert.ok(!/vbscript:/i.test(writtenHtml), 'vbscript: photoUrl MUST be stripped');
  assert.ok(writtenHtml.includes('https://lh3.googleusercontent.com/d/abc123=w400'), 'Safe HTTPS photoUrl must render');
  assert.ok(writtenHtml.includes('fotos/silla_ok.webp'), 'Safe relative photoUrl must render');
});

test('SEC-13 (R3 final hardening): inv_log_event canonicalization/truncation/apostrophe bypasses (CREATA_ONLY & CREATA+PARCHE), restricted admin branch binding, historial MOVIMIENTO guard, seg_action folio alignment, tempKey memoization, and printable SVG/path blocking', () => {
  // 1) Truncation + double-trim (121-char space & CRLF) and leading apostrophe/formula prefix bypasses blocked in BOTH CREATA_ONLY and CREATA+PARCHE
  for (const withParche of [false, true]) {
    const mode = withParche ? 'CREATA+PARCHE' : 'CREATA_ONLY';
    const rt = buildSecurityRuntime({ withParche });
    const kevinTok = rt.login('kevin.reyna@grupoanipa.com', 'KevinSec2026!');
    const guestTok = rt.login('invitado.sec@cliente.com', 'InvSec2026!');
    const luisTok = rt.login('luis.noperm@grupoanipa.com', 'LuisNoPerm26!');
    const adminLimTok = rt.login('admin.limited@grupoanipa.com', 'AdminLim2026!');
    const shHist = rt.ssInv.getSheetByName('HISTORIAL');

    const segBefore = rt.post({ action: 'seg_get_state', authToken: kevinTok });
    assert.equal(segBefore.ok, true);
    const histSegBefore = (segBefore.sheets.HISTORIAL_SEG || []).length;
    const histRowsBefore = shHist.getLastRow();

    const payloads = [
      { label: '121-char space-padded module', module: 'SEGUIMIENTO_COTIZACIONES' + ' '.repeat(96) + 'X', event: 'CIERRE_FORGED' },
      { label: 'CRLF-padded 120+ module', module: 'SEGUIMIENTO_COTIZACIONES\r\n' + ' '.repeat(96) + 'Z', event: 'NOT_SEG_PREFIX' },
      { label: 'leading apostrophe module', module: "'SEGUIMIENTO_COTIZACIONES", event: 'CUSTOM_EV' },
      { label: 'leading apostrophe SEG_ event', module: 'inventario-app.js', event: "'SEG_CIERRE" },
      { label: 'leading formula =SEG_ event', module: 'inventario-app.js', event: '=SEG_CIERRE' },
      { label: 'leading apostrophe module + event', module: "'SEGUIMIENTO_COTIZACIONES", event: "'SEG_CIERRE" }
    ];
    const callers = [
      { label: 'guest', tok: guestTok },
      { label: 'VER_SEGUIMIENTO=NO advisor', tok: luisTok },
      { label: 'VER_SEGUIMIENTO=NO restricted admin', tok: adminLimTok }
    ];

    for (const caller of callers) {
      for (const p of payloads) {
        const res = rt.post({
          action: 'inv_log_event',
          authToken: caller.tok,
          classification: 'MOVIMIENTO',
          module: p.module,
          event: p.event,
          user: 'Kevin Reyna',
          branch: 'PLAYA',
          ref: 'PL-100',
          detail: '{"estatus":"PERDIDA","motivo":"BYPASS_ATTEMPT"}'
        });
        assert.equal(res.ok, false, `[${mode}] ${caller.label} MUST be blocked for ${p.label}`);
        assert.equal(res.forbidden, true, `[${mode}] ${caller.label} MUST receive forbidden:true for ${p.label}`);
      }
    }

    assert.equal(shHist.getLastRow(), histRowsBefore, `[${mode}] Blocked canonicalization/truncation attacks MUST write 0 rows to HISTORIAL`);
    const segAfter = rt.post({ action: 'seg_get_state', authToken: kevinTok });
    assert.equal(segAfter.ok, true);
    assert.equal((segAfter.sheets.HISTORIAL_SEG || []).length, histSegBefore, `[${mode}] Kevin HISTORIAL_SEG MUST remain completely untouched`);

    // 2) Restricted admin (VER_CAMBIAR_TIENDA = NO) calling inv_log_event has branch bound to verified store (CREATA LIVING PLAYA)
    const adminLimLog = rt.post({
      action: 'inv_log_event',
      authToken: adminLimTok,
      classification: 'MOVIMIENTO',
      module: 'inventario-app.js',
      event: 'AUDIT_NON_SEG_EVENT',
      branch: 'CASA CREATA BONAMPAK',
      ref: 'REF-1',
      detail: 'Normal audit log'
    });
    assert.equal(adminLimLog.ok, true, `[${mode}] Restricted admin non-Seguimiento log should succeed`);
    const lastRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
    assert.equal(lastRow[6], 'CREATA LIVING PLAYA', `[${mode}] Restricted admin with VER_CAMBIAR_TIENDA=NO MUST have inv_log_event branch bound to CREATA LIVING PLAYA`);

    // Full admin (VER_CAMBIAR_TIENDA = SI) can still specify branch
    const kevinLog = rt.post({
      action: 'inv_log_event',
      authToken: kevinTok,
      classification: 'MOVIMIENTO',
      module: 'inventario-app.js',
      event: 'AUDIT_KEVIN_BRANCH',
      branch: 'CASA CREATA BONAMPAK',
      ref: 'REF-2',
      detail: 'Full admin branch override'
    });
    assert.equal(kevinLog.ok, true);
    const kevinRow = shHist.getRange(shHist.getLastRow(), 1, 1, 10).getValues()[0];
    assert.equal(kevinRow[6], 'CASA CREATA BONAMPAK', `[${mode}] Full admin with VER_CAMBIAR_TIENDA=SI may select branch`);
  }

  // 3) historial-app.js enforces h.normKind !== 'MOVIMIENTO' at the SEGUIMIENTO_COTIZACIONES replay loop
  const histJs = readRepo('historial-app.js');
  assert.ok(
    histJs.includes("if (!h || h.normKind !== 'MOVIMIENTO' || h.modulo !== 'SEGUIMIENTO_COTIZACIONES') continue;"),
    'historial-app.js MUST guard h.normKind !== MOVIMIENTO before replaying SEGUIMIENTO_COTIZACIONES rows'
  );
  const fnStart = histJs.indexOf('function buildUnifiedSeguimientoData(');
  const hEnd = histJs.indexOf('\n  function parsePhotosSheetRows(', fnStart);
  assert.ok(fnStart > 0 && hEnd > fnStart, 'buildUnifiedSeguimientoData must exist in historial-app.js');
  const histCtx = {
    SEG_CLOSURES_CACHE_KEY: 'k_closures',
    SEG_AUDIT_CACHE_KEY: 'k_audit',
    readJsonStorage: (_k, def) => def,
    cleanStr: (v) => String(v === null || v === undefined ? '' : v).trim(),
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    normalizeSearchText: (v) => String(v || '').trim().toLowerCase(),
    parseMxDateTime: () => 1700000000000,
    Object, Array, JSON, Set, String
  };
  vm.runInNewContext(`${histJs.slice(fnStart, hEnd)}\nthis.buildUnifiedSeguimientoData = buildUnifiedSeguimientoData;`, histCtx);
  const quotes = [
    { folioErp: 'PL-100', segStatus: 'ABIERTA', segMotivo: '', segComentarios: '', segLastContact: '', _search: 'pl-100' },
    { folioErp: 'PL-200', segStatus: 'ABIERTA', segMotivo: '', segComentarios: '', segLastContact: '', _search: 'pl-200' }
  ];
  const timeline = histCtx.buildUnifiedSeguimientoData(quotes, [], [], [
    {
      normKind: 'FALLO',
      modulo: 'SEGUIMIENTO_COTIZACIONES',
      evento: 'SEG_CIERRE',
      fecha: '27/11/2026 08:00',
      referencia: 'PL-100',
      sucursal: 'PLAYA',
      usuario: 'invitado.sec@cliente.com',
      detalle: JSON.stringify({ folio: 'PL-100', estatus: 'PERDIDA', motivo: 'FORGED_GUEST' })
    },
    {
      normKind: 'ALERTA',
      modulo: 'SEGUIMIENTO_COTIZACIONES',
      evento: 'SEG_CIERRE',
      fecha: '27/11/2026 08:01',
      referencia: 'PL-100',
      sucursal: 'PLAYA',
      usuario: 'luis.noperm@grupoanipa.com',
      detalle: JSON.stringify({ folio: 'PL-100', estatus: 'PERDIDA', motivo: 'FORGED_ALERT' })
    },
    {
      normKind: 'MOVIMIENTO',
      modulo: 'SEGUIMIENTO_COTIZACIONES',
      evento: 'SEG_CIERRE',
      fecha: '27/11/2026 08:02',
      referencia: 'PL-200',
      sucursal: 'PLAYA',
      usuario: 'Kevin Reyna',
      detalle: JSON.stringify({ folio: 'PL-200', estatus: 'GANADA', motivo: 'VALID_CLOSURE' })
    }
  ]);
  assert.equal(quotes[0].segStatus, 'ABIERTA', 'Non-MOVIMIENTO (FALLO/ALERTA) HISTORIAL rows MUST NOT mutate quote closure status in historial-app.js');
  assert.equal(quotes[1].segStatus, 'GANADA', 'Legitimate MOVIMIENTO HISTORIAL row MUST still replay in historial-app.js');
  assert.equal(timeline.length, 1, 'Only legitimate MOVIMIENTO SEGUIMIENTO_COTIZACIONES row should enter timeline');
  assert.equal(timeline[0].folio, 'PL-200');

  // 4) handleSegAction_ SEG_NUEVA_COTIZACION_APP with mismatched body.folio vs payload.folio logs targetFolio (PL-100) in HISTORIAL_MOVIMIENTOS, HISTORIAL & COTIZACIONES_CREATA
  const rtSeg = buildSecurityRuntime({ withParche: true });
  const anaTok = rtSeg.login('ana.playa@grupoanipa.com', 'AnaPlaya2026!');
  const shHistSeg = rtSeg.ssInv.getSheetByName('HISTORIAL');
  const shHistMov = rtSeg.ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');
  const shCotSeg = rtSeg.ssSeg.getSheetByName('COTIZACIONES_CREATA');
  const segMismatch = rtSeg.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_NUEVA_COTIZACION_APP',
    folio: 'CO-200', // Luis's foreign folio
    payload: { folio: 'PL-100', clientName: 'Cliente Ana', items: [{ sku: 'SKU-ZERO', qty: 1, price: 100 }] }
  });
  assert.equal(segMismatch.ok, true, 'Ana owns PL-100 so SEG_NUEVA_COTIZACION_APP should succeed with targetFolio PL-100');
  const lastHistRow = shHistSeg.getRange(shHistSeg.getLastRow(), 1, 1, 10).getValues()[0];
  const lastMovRow = shHistMov.getRange(shHistMov.getLastRow(), 1, 1, 9).getValues()[0];
  const lastCotRow = shCotSeg.getRange(shCotSeg.getLastRow(), 1, 1, 10).getValues()[0];
  assert.equal(lastHistRow[7], 'PL-100', 'HISTORIAL ref must be targetFolio PL-100');
  assert.equal(lastCotRow[1], 'PL-100', 'COTIZACIONES_CREATA folio must be targetFolio PL-100');
  assert.ok(String(lastMovRow[5]).includes('Folio PL-100'), `HISTORIAL_MOVIMIENTOS desc must log targetFolio PL-100, got: ${lastMovRow[5]}`);
  assert.ok(!String(lastMovRow[5]).includes('CO-200'), `HISTORIAL_MOVIMIENTOS desc MUST NOT log mismatched body.folio CO-200, got: ${lastMovRow[5]}`);

  // Also verify non-SEG_NUEVA_COTIZACION_APP aligns payload.folio to validated folio before serializing detalle
  const segCierreMismatch = rtSeg.post({
    action: 'seg_action',
    authToken: anaTok,
    subAction: 'SEG_CIERRE',
    folio: 'PL-100',
    payload: { folio: 'CO-200', estatus: 'GANADA', motivo: 'OK' }
  });
  assert.equal(segCierreMismatch.ok, true);
  const cierreHistRow = shHistSeg.getRange(shHistSeg.getLastRow(), 1, 1, 10).getValues()[0];
  const cierreDetailParsed = JSON.parse(cierreHistRow[8]);
  assert.equal(cierreDetailParsed.folio, 'PL-100', 'Non-SEG_NUEVA_COTIZACION_APP serialized payload.folio MUST be aligned with validated histRefFolio');

  // 5) handleInvLogin_ with multi-store hashed tempKey calls keysEqualNormalized_ once (calls === 1)
  const rtTemp = buildSecurityRuntime({ withParche: true });
  const hashedTemp = rtTemp.env.context.hashUserPassword_('MultiTemp26!');
  const shUsers = rtTemp.ssInv.getSheetByName('CUENTAS ADMINISTRATIVAS');
  // Row 9 is multi.tienda@grupoanipa.com (assigned to PLAYA & COLOCIO): col 6 = CLAVE TEMPORAL, col 7 = CLAVE DEFINITIVA
  shUsers.getRange(9, 6).setValue(hashedTemp);
  shUsers.getRange(9, 7).setValue('');
  let tempKeyCalls = 0;
  const origKeysEq = rtTemp.env.context.keysEqualNormalized_;
  rtTemp.env.context.keysEqualNormalized_ = function (rawKey, storedKey) {
    tempKeyCalls++;
    return origKeysEq.call(this, rawKey, storedKey);
  };
  const tempLogin = rtTemp.post({
    action: 'inv_login',
    email: 'multi.tienda@grupoanipa.com',
    accessKey: 'MultiTemp26!',
    deviceId: 'dev_temp_memo'
  });
  rtTemp.env.context.keysEqualNormalized_ = origKeysEq;
  assert.equal(tempLogin.ok, true, 'Multi-store hashed tempKey login should succeed');
  assert.equal(tempLogin.chooseBranch, true);
  assert.ok(tempLogin.locations.every((loc) => loc.mustChangeKey === true), 'All tempKey locations must flag mustChangeKey === true');
  assert.equal(tempKeyCalls, 1, `Expected 1 memoized keysEqualNormalized_ call for multi-store hashed tempKey, got ${tempKeyCalls}`);

  // 6) openPrintableQuoteWindow() blocks data:image/svg+xml (both photoUrl & CREATA_LOGO_B64), //evil.com/logo.png, and ../../../evil.png while allowing valid PNG data URI & fotos/logo-creata.webp
  const invJs = readRepo('inventario-app.js');
  const printStart = invJs.indexOf('function openPrintableQuoteWindow(');
  let qDepth = 0, qStarted = false, qEnd = printStart;
  for (let i = printStart; i < invJs.length; i++) {
    if (invJs[i] === '{') { qDepth++; qStarted = true; }
    else if (invJs[i] === '}') { qDepth--; if (qStarted && qDepth === 0) { qEnd = i + 1; break; } }
  }
  const runPrint = (logoSrc, photoUrls) => {
    let html = '';
    const ctx = {
      window: {
        CREATA_LOGO_B64: logoSrc,
        open: () => ({ document: { write: (h) => { html += h; }, close: () => {} } })
      },
      formatDateDMY: () => '27/11/2026',
      formatPrice: (n) => '$' + String(n || 0),
      escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      Number, Math, String, Array, Date
    };
    vm.runInNewContext(`${invJs.slice(printStart, qEnd)}\nthis.openPrintableQuoteWindow = openPrintableQuoteWindow;`, ctx);
    ctx.openPrintableQuoteWindow({
      clientName: 'Cliente SVG Test',
      erpStore: 'PLAYA',
      deliveryDate: '2026-12-27',
      advisorName: 'Ana',
      breakdown: {
        subtotalNet: 100,
        extraDiscountAmt: 0,
        iva: 16,
        total: 116,
        lines: photoUrls.map((u, idx) => ({ name: 'Item ' + idx, qty: 1, discountPct: 0, unitList: 100, lineSubtotal: 100, photoUrl: u }))
      }
    }, { folio: 'PL-SVG-1' });
    return html;
  };

  const svgB64 = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=';
  const svgUpper = 'data:image/SVG+XML;base64,PHN2Zy8+';
  const pngB64 = 'data:image/png;base64,iVBORw0KGgo=';

  const htmlBlockedLogos = [
    runPrint(svgB64, ['']),
    runPrint(svgUpper, ['']),
    runPrint('//evil.com/logo.png', ['']),
    runPrint('../../../evil.png', ['']),
    runPrint('fotos/logo.svg', [''])
  ];
  for (const h of htmlBlockedLogos) {
    assert.ok(h.includes('Cliente SVG Test'), 'Printable HTML must render even when logoSrc is rejected');
    assert.ok(!/<img\b/i.test(h), `Blocked logoSrc MUST NOT render any <img> tag, got HTML snippet: ${h.slice(0, 400)}`);
  }

  const htmlMixedPhotos = runPrint('fotos/logo-creata.webp', [
    svgB64,
    svgUpper,
    '//evil.com/logo.png',
    '../../../evil.png',
    'fotos/../secret.png',
    pngB64
  ]);
  assert.ok(htmlMixedPhotos.includes('src="fotos/logo-creata.webp"'), 'Valid fotos/logo-creata.webp logo MUST render');
  assert.ok(htmlMixedPhotos.includes(`src="${pngB64}"`), 'Valid raster data:image/png;base64,... photoUrl MUST render');
  assert.ok(!/svg\+xml/i.test(htmlMixedPhotos), 'data:image/svg+xml;base64,... MUST be stripped');
  assert.ok(!htmlMixedPhotos.includes('//evil.com/logo.png'), 'Protocol-relative //evil.com MUST be stripped');
  assert.ok(!htmlMixedPhotos.includes('../../../evil.png'), 'Path traversal ../../../evil.png MUST be stripped');
  assert.ok(!htmlMixedPhotos.includes('fotos/../secret.png'), 'Mid-path traversal fotos/../secret.png MUST be stripped');

  const htmlPngLogo = runPrint(pngB64, ['fotos/silla_ok.webp']);
  assert.ok(htmlPngLogo.includes(`src="${pngB64}"`), 'Valid raster data:image/png;base64,... CREATA_LOGO_B64 MUST render');
});


