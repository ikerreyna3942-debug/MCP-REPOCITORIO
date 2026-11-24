import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

test('UI & CSS contracts: Sugerencias de compra button in FAB menu for all users and modal with strictly 3 fields', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
  const css = fs.readFileSync(path.join(REPO_ROOT, 'inventario-ui.css'), 'utf8');
  const js = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
  const histJs = fs.readFileSync(path.join(REPO_ROOT, 'historial-app.js'), 'utf8');

  // 1) FAB button exists inside #invFabMenu WITHOUT hidden class (visible to all authenticated users)
  const fabBlockMatch = html.match(/<div id="invFabMenu"[\s\S]*?<button type="button" id="invFabToggleBtn"/);
  assert.ok(fabBlockMatch, 'Missing #invFabMenu block');
  assert.match(
    fabBlockMatch[0],
    /<button type="button" id="fabPurchaseSuggestionBtn" class="inv-fab-item" role="menuitem" onclick="closeFabMenu\(\); openPurchaseSuggestionModal\(\);">[\s\S]*?Sugerencias de compra[\s\S]*?<\/button>/,
    '#fabPurchaseSuggestionBtn must exist in #invFabMenu without hidden class'
  );

  // 2) Modal exists and contains ONLY the 3 requested fields: Interior/Exterior, Tipo de producto, Comentarios
  const modalMatch = html.match(/<div id="purchaseSuggestionModal"[\s\S]*?<\/form>\s*<\/div>\s*<\/div>/);
  assert.ok(modalMatch, 'Missing #purchaseSuggestionModal');
  const modalHtml = modalMatch[0];
  assert.ok(modalHtml.includes('id="purchaseSugAmbInterior"'), 'Missing Interior radio');
  assert.ok(modalHtml.includes('id="purchaseSugAmbExterior"'), 'Missing Exterior radio');
  assert.ok(modalHtml.includes('id="purchaseSugProductTypeInput"'), 'Missing Tipo de producto input');
  assert.ok(modalHtml.includes('id="purchaseSugCommentsInput"'), 'Missing Comentarios textarea');
  assert.ok(modalHtml.includes('id="btnPurchaseSugSubmit"'), 'Missing submit button');

  const fieldBlocks = modalHtml.match(/class="inv-field"/g) || [];
  assert.equal(fieldBlocks.length, 3, `Expected strictly 3 form fields in purchaseSuggestionModal, found ${fieldBlocks.length}`);

  const textInputs = modalHtml.match(/<input\b[^>]*type="text"/g) || [];
  const textareas = modalHtml.match(/<textarea\b/g) || [];
  const radios = modalHtml.match(/<input\b[^>]*type="radio"/g) || [];
  const selects = modalHtml.match(/<select\b/g) || [];
  assert.equal(radios.length, 2, 'Expected exactly 2 radio buttons (Interior & Exterior)');
  assert.equal(textInputs.length, 1, 'Expected exactly 1 text input (Tipo de producto)');
  assert.equal(textareas.length, 1, 'Expected exactly 1 textarea (Comentarios)');
  assert.equal(selects.length, 0, 'Expected no extra select inputs');

  // 3) CSS braces balanced and purchase suggestion classes defined
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert(depth >= 0, 'Unbalanced closing brace in inventario-ui.css');
  }
  assert.equal(depth, 0, 'Unbalanced braces in inventario-ui.css');
  assert.ok(css.includes('.inv-psug-modal-card'), 'Missing .inv-psug-modal-card CSS');
  assert.ok(css.includes('.inv-psug-amb-grid'), 'Missing .inv-psug-amb-grid CSS');
  assert.ok(css.includes('.inv-psug-amb-opt.is-selected'), 'Missing .inv-psug-amb-opt.is-selected CSS');

  // 4) JS: visible to all authenticated users (never hidden by guestMode or admin perms), wired to BackNav & logout
  assert.ok(
    js.includes("if (fabPurchaseSuggestionBtn) fabPurchaseSuggestionBtn.classList.toggle('hidden', !isAuthed);"),
    '#fabPurchaseSuggestionBtn must only toggle on !isAuthed so all roles see it'
  );
  assert.ok(js.includes("id: 'purchase_suggestion_modal'"), 'purchase_suggestion_modal must be registered in CreataBackNav');
  assert.ok(js.includes('closePurchaseSuggestionModal()'), 'logoutAdvisorSession must close purchaseSuggestionModal');
  assert.ok(js.includes("'inv_register_purchase_suggestion'"), 'submitPurchaseSuggestion must call inv_register_purchase_suggestion');
  assert.ok(!/openPurchaseSuggestionModal[\s\S]{0,160}isGuestSession/.test(js), 'openPurchaseSuggestionModal must not block guests');
  assert.ok(!/submitPurchaseSuggestion[\s\S]{0,180}isGuestSession/.test(js), 'submitPurchaseSuggestion must not block guests');

  // 5) historial-app.js no longer queries removed FOTOS NUEVAS CARGADO tab and guards photo header parsing
  assert.ok(!histJs.includes("fetchSheetRows('FOTOS NUEVAS CARGADO'"), 'historial-app.js must not query deleted FOTOS NUEVAS CARGADO tab');
  assert.match(histJs, /if\s*\(headerIdx\s*<\s*0\)\s*return\s*\[\];/, 'parsePhotosSheetRows must ignore non-photo fallback sheets');
});

test('GAS backend: inv_register_purchase_suggestion allows asesor, gerente, admin & invitado, blocks unauth, validates 3 fields & sanitizes formulas', () => {
  const INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const env = createMockGasEnvironment({
    activeSpreadsheetId: INV_ID,
    scriptProperties: {
      INV_AUTH_SECRET: 'psug-test-hmac-secret-key-2026-abcdef'
    }
  });

  const ss = env.makeSpreadsheet(INV_ID, 'CONTROL DE PRODUCTOS PRESENTACIÓN', {
    'CUENTAS ADMINISTRATIVAS': [
      ['CREATA DIRECTORIO UNIFICADO'],
      [
        'NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'ASESOR ERP', 'DESCUENTO',
        'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA', 'VER_PANEL_SUITE',
        'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS', 'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA',
        '', 'PLAYA', 'COLOCIO', 'PTC', 'CASA CREATA', 'PROYECTOS'
      ],
      [
        '1', 'PLAYA', 'Ana Asesora', 'Asesor interiorista', 'ana.playa@creatamuebles.com', '', 'AnaPass2026!', 'ANA PLAYA', '30%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '', 'SI', 'NO', 'NO', 'NO', 'NO'
      ],
      [
        '2', 'COLOCIO', 'Janine Gerente', 'Gerente de tienda', 'janine.colocio@creatamuebles.com', '', 'JanPass2026!', 'JANINE', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '', 'NO', 'SI', 'NO', 'NO', 'NO'
      ]
    ],
    INVITADOS: [
      ['NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'DISPOSITIVOS PERMITIDOS', 'LUGARES ACTIVOS', 'DISPOSITIVOS AUTORIZADOS'],
      ['1', 'SOLO LECTURA', 'Daniel Inventarios', 'INVENTARIOS', 'daniel.inv@grupoanipa.com', '', 'DanPass2026!', 3, '0 / 3', '']
    ],
    HISTORIAL: [
      ['FECHA', 'CLASIFICACION', 'MODULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANALISIS']
    ]
  });

  env.loadScript(path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs'));
  env.context.Utilities.formatDate = (_d, _tz, fmt) => (fmt === 'yyyyMMdd' ? '20261124' : '24/11/2026 11:30:00');
  env.context.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: ['CREATA LIVING PLAYA', 'CREATA LIVING COLOSIO'] });
  env.context.ensureLiveErpSyncTrigger_ = () => {};

  const post = (payload) => JSON.parse(env.context.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).getContent());

  // 1) Unauthenticated request must be rejected
  const unauthRes = post({
    action: 'inv_register_purchase_suggestion',
    ambiente: 'INTERIOR',
    tipoProducto: 'Sofá',
    comments: 'Sin sesión'
  });
  assert.equal(unauthRes.ok, false);
  assert.equal(unauthRes.authRequired, true);

  // 2) Login as Asesor, Gerente, and Invitado
  const asesorLogin = post({ action: 'inv_login', email: 'ana.playa@creatamuebles.com', accessKey: 'AnaPass2026!', deviceId: 'dev_ana_1' });
  const gerenteLogin = post({ action: 'inv_login', email: 'janine.colocio@creatamuebles.com', accessKey: 'JanPass2026!', deviceId: 'dev_jan_1' });
  const guestLogin = post({ action: 'inv_login', email: 'daniel.inv@grupoanipa.com', accessKey: 'DanPass2026!', deviceId: 'dev_dan_1' });
  assert.equal(asesorLogin.ok, true);
  assert.equal(gerenteLogin.ok, true);
  assert.equal(guestLogin.ok, true);

  // 3) Validation errors: invalid ambiente, missing tipoProducto, missing comments
  const badAmb = post({
    action: 'inv_register_purchase_suggestion',
    authToken: asesorLogin.user.authToken,
    ambiente: 'OTRO',
    tipoProducto: 'Comedor',
    comments: 'Falta ambiente válido'
  });
  assert.equal(badAmb.ok, false);
  assert.match(badAmb.error, /Interior o Exterior/i);

  const badType = post({
    action: 'inv_register_purchase_suggestion',
    authToken: asesorLogin.user.authToken,
    ambiente: 'INTERIOR',
    tipoProducto: '   ',
    comments: 'Falta tipo'
  });
  assert.equal(badType.ok, false);
  assert.match(badType.error, /tipo de producto/i);

  const badComments = post({
    action: 'inv_register_purchase_suggestion',
    authToken: asesorLogin.user.authToken,
    ambiente: 'EXTERIOR',
    tipoProducto: 'Camastro',
    comments: ''
  });
  assert.equal(badComments.ok, false);
  assert.match(badComments.error, /comentarios/i);

  // 4) Asesor submits INTERIOR suggestion (with formula injection test in comments)
  const rAsesor = post({
    action: 'inv_register_purchase_suggestion',
    authToken: asesorLogin.user.authToken,
    erpStore: 'PLAYA',
    ambiente: 'Interior',
    tipoProducto: 'Sala modular',
    comments: '=HYPERLINK("http://evil") Clientes piden más salas en lino beige'
  });
  assert.equal(rAsesor.ok, true);
  assert.equal(rAsesor.tabName, 'SUGERENCIAS_DE_COMPRA');
  assert.match(rAsesor.suggestionId, /^SUG-\d{8}-\d{4}$/);
  assert.equal(rAsesor.record.ambiente, 'INTERIOR');
  assert.equal(rAsesor.record.tipoProducto, 'Sala modular');
  assert.equal(rAsesor.record.status, 'PENDIENTE');

  // 5) Gerente submits EXTERIOR suggestion
  const rGerente = post({
    action: 'inv_register_purchase_suggestion',
    authToken: gerenteLogin.user.authToken,
    erpStore: 'COLOCIO',
    ambiente: 'EXTERIOR',
    tipoProducto: 'Comedor de exterior',
    comments: 'Traer comedores de teca para 8 personas en terraza'
  });
  assert.equal(rGerente.ok, true);
  assert.equal(rGerente.record.ambiente, 'EXTERIOR');
  assert.equal(rGerente.record.advisorName, 'Janine Gerente');

  // 6) Invitado submits suggestion too ("para todos")
  const rGuest = post({
    action: 'inv_register_purchase_suggestion',
    authToken: guestLogin.user.authToken,
    ambiente: 'EXTERIOR',
    tipoProducto: 'Camastro',
    comments: 'Camastros apilables blancos con alta rotación'
  });
  assert.equal(rGuest.ok, true);
  assert.equal(rGuest.record.advisorName, 'Daniel Inventarios');

  // 7) Verify sheet rows and formula-injection escaping in raw stored cells
  const shSug = ss.getSheetByName('SUGERENCIAS_DE_COMPRA');
  assert.ok(shSug, 'SUGERENCIAS_DE_COMPRA sheet must be created');
  assert.equal(shSug.getLastRow(), 5, 'Expected banner + header + 3 suggestion rows');
  const storedRows = shSug.getRange(3, 1, 3, 9).getValues();

  assert.equal(storedRows[0][2], 'INTERIOR');
  assert.equal(storedRows[0][3], 'Sala modular');
  assert.ok(String(storedRows[0][4]).startsWith("'="), 'Leading = formula in comments must be prefixed with apostrophe');
  assert.equal(storedRows[0][5], 'Ana Asesora');
  assert.equal(storedRows[0][8], 'PENDIENTE');

  assert.equal(storedRows[1][2], 'EXTERIOR');
  assert.equal(storedRows[1][3], 'Comedor de exterior');
  assert.equal(storedRows[1][5], 'Janine Gerente');
  assert.equal(storedRows[1][6], 'Gerente de tienda');
  assert.equal(storedRows[1][8], 'PENDIENTE');

  assert.equal(storedRows[2][2], 'EXTERIOR');
  assert.equal(storedRows[2][3], 'Camastro');
  assert.equal(storedRows[2][5], 'Daniel Inventarios');
  assert.equal(storedRows[2][8], 'PENDIENTE');
});
