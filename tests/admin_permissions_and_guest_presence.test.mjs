import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function buildGasMockEnv(sheetsData) {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map([['INV_AUTH_SECRET', 'admin-perm-guest-presence-test-secret-0123456789']]);
  const scriptCache = new Map();
  const auditLogs = [];

  function makeSheet(name, rows) {
    return {
      getName: () => name,
      getLastRow: () => rows.length,
      getMaxRows: () => Math.max(50, rows.length),
      getLastColumn: () => rows.reduce((m, r) => Math.max(m, (r || []).length), 0),
      getMaxColumns: () => Math.max(22, rows.reduce((m, r) => Math.max(m, (r || []).length), 0)),
      getRange: (r, c, nr = 1, nc = 1) => {
        const readVals = () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const srcRow = rows[r - 1 + i] || [];
            const copy = [];
            for (let j = 0; j < nc; j++) copy.push(srcRow[c - 1 + j] !== undefined ? srcRow[c - 1 + j] : '');
            out.push(copy);
          }
          return out;
        };
        return {
        getValues: readVals,
        getDisplayValues: () => readVals().map((row) => row.map((v) => String(v === null || v === undefined ? '' : v))),
        getValue: () => {
          const srcRow = rows[r - 1] || [];
          return srcRow[c - 1] !== undefined ? srcRow[c - 1] : '';
        },
        getDisplayValue: () => {
          const srcRow = rows[r - 1] || [];
          const v = srcRow[c - 1];
          return String(v === null || v === undefined ? '' : v);
        },
        setValue: (v) => {
          while (rows.length < r) rows.push([]);
          while (rows[r - 1].length < c) rows[r - 1].push('');
          rows[r - 1][c - 1] = v;
        },
        setValues: (vals) => {
          for (let i = 0; i < vals.length; i++) {
            while (rows.length < r + i) rows.push([]);
            for (let j = 0; j < vals[i].length; j++) {
              while (rows[r - 1 + i].length < c + j) rows[r - 1 + i].push('');
              rows[r - 1 + i][c - 1 + j] = vals[i][j];
            }
          }
        },
        setFontWeight: () => ({}),
        setBackground: () => ({}),
        setFontColor: () => ({}),
        setHorizontalAlignment: () => ({}),
        setFontSize: () => ({}),
        merge: () => ({}),
        setDataValidation: () => ({})
      }; },
      appendRow: (row) => { rows.push(row.slice()); },
      setFrozenRows: () => {},
      setColumnWidth: () => {}
    };
  }

  const sheetsMap = new Map();
  for (const [name, rows] of Object.entries(sheetsData)) {
    sheetsMap.set(name, makeSheet(name, rows));
  }

  const mockSs = {
    getSheetByName: (name) => sheetsMap.get(name) || null,
    insertSheet: (name) => {
      const rows = [];
      const sh = makeSheet(name, rows);
      sheetsMap.set(name, sh);
      sheetsData[name] = rows;
      return sh;
    }
  };

  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Logger: { log: () => {} },
    Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Map, Set, parseInt, parseFloat, isNaN, isFinite,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      formatDate: () => '21/11/2026 12:00:00',
      computeHmacSha256Signature: (msg, sec) => {
        const out = [];
        const s = String(msg) + '|' + String(sec);
        for (let i = 0; i < 32; i++) out.push((s.charCodeAt(i % s.length) * (i + 7)) % 127);
        return out;
      },
      base64EncodeWebSafe: (input) => {
        if (typeof input === 'string') return Buffer.from(input, 'utf8').toString('base64url');
        return Buffer.from((input || []).map((b) => (b < 0 ? b + 256 : b))).toString('base64url');
      },
      base64DecodeWebSafe: (str) => Array.from(Buffer.from(String(str || ''), 'base64url')),
      newBlob: (data) => ({
        getBytes: () => Array.isArray(data) ? data : Array.from(Buffer.from(String(data || ''), 'utf8')),
        getDataAsString: () => Array.isArray(data) ? Buffer.from(data).toString('utf8') : String(data || '')
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : null),
        setProperty: (k, v) => { scriptProps.set(k, String(v)); },
        deleteProperty: (k) => { scriptProps.delete(k); }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (scriptCache.has(k) ? scriptCache.get(k) : null),
        put: (k, v) => { scriptCache.set(k, String(v)); },
        remove: (k) => { scriptCache.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    SpreadsheetApp: {
      openById: () => mockSs,
      getActiveSpreadsheet: () => mockSs,
      flush: () => {},
      newDataValidation: () => ({
        requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) })
      })
    },
    Session: { getScriptTimeZone: () => 'America/Cancun' }
  };

  vm.runInNewContext(gsSrc, ctx, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });
  ctx.getSpreadsheet_ = () => mockSs;
  ctx.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: ['CEDIS', 'CREATA PUERTO CANCUN'] });
  ctx.registrarEventoHistorial_ = (_ss, entry) => { auditLogs.push(entry); };

  return { ctx, mockSs, scriptProps, scriptCache, auditLogs, sheetsData };
}

test('GAS CUENTAS ADMINISTRATIVAS: per-column SI/NO controls for Kevin & Santy across login, heartbeat, presence, overrides, and Fotos API', () => {
  const adminHeader = [
    '', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'OBSERVACIONES',
    'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA',
    'VER_PANEL_SUITE', 'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS',
    'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA', 'NOTAS'
  ];

  const sheetsData = {
    'CUENTAS ADMINISTRATIVAS': [
      ['', 'CUENTAS ADMINISTRATIVAS · PERMISOS POR COLUMNA'],
      adminHeader,
      ['', '1', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinPass99', 'ACTIVO', 'Owner',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'Full'],
      ['', '2', 'Santy', 'ADMINISTRADOR', 'santiago.torres@grupoanipa.com', '', 'SantyPass88', 'ACTIVO', 'Admin',
        'SI', 'SI', 'SI', 'NO', 'NO', 'NO', 'SI', 'SI', 'NO', 'SI', 'SI', 'Inicial']
    ],
    'PROYECTOS': [
      ['', 'USUARIOS PROYECTOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'OBSERVACIONES'],
      ['', '1', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinPass99', 'ACTIVO', ''],
      ['', '2', 'Santy', 'ADMINISTRADOR', 'santiago.torres@grupoanipa.com', '', 'SantyPass88', 'ACTIVO', ''],
      ['', '3', 'Laura Asesora', 'ASESOR', 'laura.ventas@grupoanipa.com', '', 'LauraPass77', 'ACTIVO', '']
    ],
    'INVITADOS': [
      ['', 'INVITADOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'LUGARES', 'DISPOSITIVOS ACTIVOS'],
      ['', '1', 'Invitado Arquitectura', 'INVITADO', 'arq.invitado@estudio.com', '', 'InvPass123', 'ACTIVO', '2', ''],
      ['', '2', 'Invitado Interiorismo', 'INVITADO', 'interiores@estudio.com', '', 'InvPass456', 'ACTIVO', '3', '']
    ]
  };

  const { ctx, mockSs, scriptCache } = buildGasMockEnv(sheetsData);

  // 1) Santy logs in: receives exact per-column permissions from CUENTAS ADMINISTRATIVAS (propagated even if tab is PROYECTOS)
  const santyLogin = ctx.handleInvLogin_({
    email: 'santiago.torres@grupoanipa.com',
    accessKey: 'SantyPass88',
    sheetTab: 'PROYECTOS',
    deviceId: 'dev-santy-1',
    deviceLabel: 'Mac · Chrome'
  });
  assert.equal(santyLogin.ok, true);
  assert.equal(santyLogin.user.isAdmin, true);
  assert.equal(santyLogin.user.adminPermissions.cotizador, true);
  assert.equal(santyLogin.user.adminPermissions.historial, true);
  assert.equal(santyLogin.user.adminPermissions.equipoInvitados, true);
  assert.equal(santyLogin.user.adminPermissions.fotosApp, false);
  assert.equal(santyLogin.user.adminPermissions.promptsIa, false);
  assert.equal(santyLogin.user.adminPermissions.panelSuite, false);
  assert.equal(santyLogin.user.adminPermissions.gestionProductos, false);

  const santyToken = santyLogin.authToken || (santyLogin.user && santyLogin.user.authToken);
  assert.ok(santyToken, 'santyLogin must issue an authToken');

  // 2) Santy blocked from Fotos API and Product Overrides when VER_FOTOS_APP=NO & VER_GESTION_PRODUCTOS=NO
  const santyFotosDenied = ctx.verifyExclusiveKevinOwner_(mockSs, {
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com'
  });
  assert.equal(santyFotosDenied.ok, false);
  assert.equal(santyFotosDenied.forbidden, true);

  const santyProdDenied = ctx.handleInvProductOverrideSave_({
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com',
    sku: 'SKU001',
    op: 'ARCHIVE'
  });
  assert.equal(santyProdDenied.ok, false);
  assert.equal(santyProdDenied.forbidden, true);

  // 3) Toggle Santy columns in CUENTAS ADMINISTRATIVAS -> VER_FOTOS_APP=SI, VER_GESTION_PRODUCTOS=SI, VER_EQUIPO_Y_INVITADOS=NO
  sheetsData['CUENTAS ADMINISTRATIVAS'][3][12] = 'SI'; // M: VER_FOTOS_APP
  sheetsData['CUENTAS ADMINISTRATIVAS'][3][15] = 'NO'; // P: VER_EQUIPO_Y_INVITADOS
  sheetsData['CUENTAS ADMINISTRATIVAS'][3][17] = 'SI'; // R: VER_GESTION_PRODUCTOS
  scriptCache.clear();

  // Heartbeat returns live updated adminPermissions immediately
  const santyHb = ctx.handleInvPresenceHeartbeat_({
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com',
    vista: 'inventario'
  });
  assert.equal(santyHb.ok, true);
  assert.equal(santyHb.adminPermissions.fotosApp, true);
  assert.equal(santyHb.adminPermissions.gestionProductos, true);
  assert.equal(santyHb.adminPermissions.equipoInvitados, false);

  // Now Santy IS allowed into Fotos API and Product Overrides (and audit logs Santy's email!)
  const santyFotosAllowed = ctx.verifyExclusiveKevinOwner_(mockSs, {
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com'
  });
  assert.equal(santyFotosAllowed.ok, true);

  const santyProdAllowed = ctx.handleInvProductOverrideSave_({
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com',
    sku: 'SKU001',
    op: 'SAVE',
    name: 'Sillón Modificado',
    note: 'Editado por Santy'
  });
  assert.equal(santyProdAllowed.ok, true);
  assert.equal(santyProdAllowed.override.updatedBy, 'santiago.torres@grupoanipa.com');

  // And Santy is now blocked from inv_presence_list because VER_EQUIPO_Y_INVITADOS=NO
  const santyPresenceBlocked = ctx.handleInvPresenceList_({
    authToken: santyToken,
    advisorEmail: 'santiago.torres@grupoanipa.com'
  });
  assert.equal(santyPresenceBlocked.ok, false);
  assert.equal(santyPresenceBlocked.forbidden, true);

  // 4) Non-admin advisor is ALWAYS blocked from Fotos API
  const lauraLogin = ctx.handleInvLogin_({
    email: 'laura.ventas@grupoanipa.com',
    accessKey: 'LauraPass77',
    sheetTab: 'PROYECTOS',
    deviceId: 'dev-laura-1'
  });
  assert.equal(lauraLogin.ok, true);
  const lauraToken = lauraLogin.authToken || (lauraLogin.user && lauraLogin.user.authToken);
  const lauraFotosDenied = ctx.verifyExclusiveKevinOwner_(mockSs, {
    authToken: lauraToken,
    advisorEmail: 'laura.ventas@grupoanipa.com'
  });
  assert.equal(lauraFotosDenied.ok, false);
  assert.equal(lauraFotosDenied.forbidden, true);
});

test('GAS Live Connected Guests: inv_presence_list reports online/offline INVITADOS with deviceLabel, slot usage, and vista alongside team users', () => {
  const sheetsData = {
    'CUENTAS ADMINISTRATIVAS': [
      ['', 'CUENTAS ADMINISTRATIVAS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'OBSERVACIONES',
        'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA',
        'VER_PANEL_SUITE', 'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS',
        'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA', 'NOTAS'],
      ['', '1', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinPass99', 'ACTIVO', 'Owner',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'Full']
    ],
    'PROYECTOS': [
      ['', 'PROYECTOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'OBSERVACIONES'],
      ['', '1', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinPass99', 'ACTIVO', '']
    ],
    'INVITADOS': [
      ['', 'INVITADOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'DISPOSITIVOS MÁX', 'LUGARES EN USO', 'DISPOSITIVOS ACTIVOS'],
      ['', '1', 'Despacho Solís', 'INVITADO', 'solis@arquitectura.mx', '', 'Solis123', '2', '0 / 2', ''],
      ['', '2', 'Estudio Palma', 'INVITADO', 'palma@diseno.mx', '', 'Palma456', '3', '0 / 3', '']
    ]
  };

  const { ctx } = buildGasMockEnv(sheetsData);

  // Kevin logs in
  const kevinLogin = ctx.handleInvLogin_({
    email: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinPass99',
    sheetTab: 'CUENTAS ADMINISTRATIVAS',
    deviceId: 'dev-kevin-mac',
    deviceLabel: 'MacBook · Chrome'
  });
  assert.equal(kevinLogin.ok, true);
  const kevinToken = kevinLogin.authToken || (kevinLogin.user && kevinLogin.user.authToken);

  // Guest 1 logs in and sends heartbeat
  const guest1Login = ctx.handleInvLogin_({
    email: 'solis@arquitectura.mx',
    accessKey: 'Solis123',
    sheetTab: 'INVITADOS',
    deviceId: 'dev-guest-iphone',
    deviceLabel: 'iPhone · Safari'
  });
  assert.equal(guest1Login.ok, true);
  assert.equal(guest1Login.user.isGuest, true);
  const guest1Token = guest1Login.authToken || (guest1Login.user && guest1Login.user.authToken);

  const guest1Hb = ctx.handleInvGuestHeartbeat_({
    authToken: guest1Token,
    email: 'solis@arquitectura.mx',
    deviceId: 'dev-guest-iphone',
    deviceLabel: 'iPhone · Safari'
  });
  assert.equal(guest1Hb.ok, true);

  // Kevin fetches live presence list
  const presenceRes = ctx.handleInvPresenceList_({
    authToken: kevinToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com'
  });
  assert.equal(presenceRes.ok, true);
  assert.ok(Array.isArray(presenceRes.users), 'users array must stay backward-compatible');
  assert.ok(Array.isArray(presenceRes.guests), 'guests array must be included for admin');
  assert.equal(presenceRes.guestTotalCount, 2);
  assert.equal(presenceRes.guestOnlineCount, 1);
  assert.equal(presenceRes.guestOfflineCount, 1);

  const gOnline = presenceRes.guests.find((g) => g.nombre === 'Despacho Solís');
  const gOffline = presenceRes.guests.find((g) => g.nombre === 'Estudio Palma');
  assert.ok(gOnline, 'Despacho Solís must appear in guests list');
  assert.equal(gOnline.online, true);
  assert.equal(gOnline.isGuest, true);
  assert.equal(gOnline.slotLabel, '1 / 2');
  assert.match(gOnline.deviceLabel, /iPhone · Safari/);

  assert.ok(gOffline, 'Estudio Palma must appear as offline guest');
  assert.equal(gOffline.online, false);
  assert.equal(gOffline.slotLabel, '0 / 3');
});

test('Frontend HTML/JS contracts: CUENTAS ADMINISTRATIVAS chips, Invitados filter in Settings & Historial, and 2048x2048 square upload normalization', () => {
  const invHtml = fs.readFileSync('inventario.html', 'utf8');
  const invJs = fs.readFileSync('inventario-app.js', 'utf8');
  const histJs = fs.readFileSync('historial-app.js', 'utf8');
  const panelJs = fs.readFileSync('panel-app.js', 'utf8');
  const fotosJs = fs.readFileSync('fotos-productos-app.js', 'utf8');
  const promptsJs = fs.readFileSync('prompts-app.js', 'utf8');

  // HTML hooks for live guests & admin per-column permissions
  assert.ok(invHtml.includes('id="settingsTeamFilterGuests"'), 'Missing Invitados filter button in Settings modal');
  assert.ok(invHtml.includes('id="settingsAdminPermsSection"'), 'Missing CUENTAS ADMINISTRATIVAS summary section in Settings modal');
  assert.ok(invHtml.includes('id="settingsAdminPermsChips"'), 'Missing #settingsAdminPermsChips container');
  assert.ok(invHtml.includes('id="settingsAdminPermsCountBadge"'), 'Missing #settingsAdminPermsCountBadge');
  assert.ok(invHtml.includes('id="btnSettingsOpenHistorialLink"'), 'Missing #btnSettingsOpenHistorialLink');

  // JS contracts across inventario, historial, panel, fotos, prompts
  assert.ok(invJs.includes('CANONICAL_SQUARE_UPLOAD_PX = 2048'), 'inventario-app.js must normalize square uploads to 2048px');
  assert.ok(invJs.includes("setSettingsTeamPresenceFilter = function (mode)"), 'Missing setSettingsTeamPresenceFilter');
  assert.ok(invJs.includes("mode === 'GUESTS'"), 'Settings presence filter must support GUESTS');
  assert.ok(histJs.includes('data-hist-presence-filter="GUESTS"'), 'Historial must include Invitados filter button');
  assert.ok(histJs.includes('id="hist_presenceGuestOnlineCount"'), 'Historial must display live connected guests count');
  assert.ok(histJs.includes('adminPermissions.equipoInvitados === false'), 'Historial must hide presence panel when VER_EQUIPO_Y_INVITADOS=NO');
  assert.ok(panelJs.includes('perms.panelSuite === true'), 'panel-app.js must honor VER_PANEL_SUITE=SI for admins');
  assert.ok(fotosJs.includes('perms.fotosApp === true'), 'fotos-productos-app.js must honor VER_FOTOS_APP=SI for admins');
  assert.ok(promptsJs.includes('perms.promptsIa === true'), 'prompts-app.js must honor VER_PROMPTS_IA=SI for admins');
});

test('Prompts Studio V8 (MCP-REPOCITORIO): 2048x2048, distinct 3/4 Right vs 3/4 Left with live setField refresh, and Nano Banana 2.1 vs Gemini 3 Pro Image', () => {
  const studioSrc = fs.readFileSync('prompts-studio-v8.js', 'utf8');
  const promptsGs = fs.readFileSync('AppsScript_Prompts_Odoo.gs', 'utf8');

  assert.ok(!/2054/.test(studioSrc), 'prompts-studio-v8.js must have ZERO residual 2054 references');
  assert.ok(!/=s2054/.test(promptsGs), 'AppsScript_Prompts_Odoo.gs must use =s2048 instead of =s2054');

  const store = new Map();
  const sandbox = {
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    document: { getElementById: () => null },
    Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, Set, Map,
    setTimeout: () => 1, clearTimeout: () => {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(studioSrc, sandbox, { filename: 'prompts-studio-v8.js' });
  const studio = sandbox.CreataPromptsStudio;

  // Verify models registry
  assert.deepEqual(Array.from(studio.IMAGE_MODELS, (m) => m.id), ['gemini-nano-banana-2.1', 'gemini-3-pro-image']);

  // Step 1: Generate V8 SINGLE_VIEW with THREE_QUARTER_RIGHT + Nano Banana 2.1
  studio.setField('productName', 'Sofá Modular Valenti Chaise Izquierdo');
  studio.setMode('SINGLE_VIEW');
  studio.setField('angleId', 'THREE_QUARTER_RIGHT');
  studio.setField('targetModel', 'gemini-nano-banana-2.1');
  studio.setField('thinkingLevel', 'high');
  const rightBlocks = studio.generateNow();
  assert.equal(rightBlocks.length, 1);
  const pRight = rightBlocks[0].prompt;
  assert.match(pRight, /2048x2048/);
  assert.match(pRight, /gemini-nano-banana-2\.1/);
  assert.match(pRight, /thinking_level="high"/);
  assert.match(pRight, /FACING TOWARD THE RIGHT/i);
  assert.match(pRight, /NEVER facing left/i);
  assert.match(pRight, /ANTI-MIRROR HANDEDNESS LOCK/i);

  // Step 2: Switch live via setField to THREE_QUARTER_LEFT & Gemini 3 Pro Image (NO extra generateNow needed!)
  studio.setField('angleId', 'THREE_QUARTER_LEFT');
  studio.setField('targetModel', 'gemini-3-pro-image');
  const leftBlocks = studio.getState().generatedBlocks;
  assert.equal(leftBlocks.length, 1);
  const pLeft = leftBlocks[0].prompt;
  assert.notEqual(pRight, pLeft, 'setField must live-refresh prompt when changing 3/4 Right -> 3/4 Left');
  assert.match(pLeft, /2048x2048/);
  assert.match(pLeft, /gemini-3-pro-image/);
  assert.match(pLeft, /FACING TOWARD THE LEFT/i);
  assert.match(pLeft, /NEVER facing right/i);
  assert.match(pLeft, /ANTI-MIRROR HANDEDNESS LOCK/i);
  assert.ok(!/thinking_level=/.test(pLeft), 'Gemini 3 Pro Image prompt must not inject thinking_level');

  // Step 3: Verify V7 1_VISTA with THREE_QUARTER_LEFT does NOT inject contradictory 3/4 Front-Right Hero text
  const v7Left = studio.generatePrompts({
    version: 'V7',
    v7Mode: '1_VISTA',
    angleId: 'THREE_QUARTER_LEFT',
    forceThreeQuarterRight: true,
    productName: 'Silla Brisa'
  });
  assert.equal(v7Left.length, 1);
  assert.match(v7Left[0].prompt, /FACING TOWARD THE LEFT/i);
  assert.ok(!/FACING TOWARD THE RIGHT/i.test(v7Left[0].prompt), 'V7 1_VISTA 3/4 Left must never inject contradictory Right-facing override');
});
