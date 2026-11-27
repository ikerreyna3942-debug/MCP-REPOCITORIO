import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

function buildUnifiedGasMockEnv(sheetsData) {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map([['INV_AUTH_SECRET', 'unified-users-sheet-test-secret-0123456789']]);
  const scriptCache = new Map();
  const auditLogs = [];

  function makeSheet(name, rows) {
    return {
      getName: () => name,
      getLastRow: () => rows.length,
      getMaxRows: () => Math.max(50, rows.length),
      getLastColumn: () => rows.reduce((m, r) => Math.max(m, (r || []).length), 0),
      getMaxColumns: () => Math.max(26, rows.reduce((m, r) => Math.max(m, (r || []).length), 0)),
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
        const chain = {
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
            return chain;
          },
          setValues: (vals) => {
            for (let i = 0; i < vals.length; i++) {
              while (rows.length < r + i) rows.push([]);
              for (let j = 0; j < vals[i].length; j++) {
                while (rows[r - 1 + i].length < c + j) rows[r - 1 + i].push('');
                rows[r - 1 + i][c - 1 + j] = vals[i][j];
              }
            }
            return chain;
          },
          clearContent: () => {
            for (let i = 0; i < nr; i++) {
              if (!rows[r - 1 + i]) continue;
              for (let j = 0; j < nc; j++) {
                if (c - 1 + j < rows[r - 1 + i].length) rows[r - 1 + i][c - 1 + j] = '';
              }
            }
            return chain;
          },
          setNumberFormat: () => chain,
          setFontWeight: () => chain,
          setBackground: () => chain,
          setFontColor: () => chain,
          setHorizontalAlignment: () => chain,
          setFontSize: () => chain,
          merge: () => chain,
          setDataValidation: () => chain
        };
        return chain;
      },
      appendRow: (row) => { rows.push(row.slice()); },
      setFrozenRows: () => {},
      setColumnWidth: () => {},
      insertColumnsAfter: () => {},
      insertRowsAfter: () => {}
    };
  }

  const sheetsMap = new Map();
  for (const [name, rows] of Object.entries(sheetsData)) {
    sheetsMap.set(name, makeSheet(name, rows));
  }

  const mockSs = {
    getSheets: () => Array.from(sheetsMap.values()),
    getSheetByName: (name) => sheetsMap.get(name) || null,
    insertSheet: (name) => {
      const rows = [];
      const sh = makeSheet(name, rows);
      sheetsMap.set(name, sh);
      sheetsData[name] = rows;
      return sh;
    },
    deleteSheet: (sh) => {
      if (sh && typeof sh.getName === 'function') {
        sheetsMap.delete(sh.getName());
        delete sheetsData[sh.getName()];
      }
    }
  };

  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Logger: { log: () => {} },
    Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Map, Set, parseInt, parseFloat, isNaN, isFinite,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      formatDate: () => '23/11/2026 09:00:00',
      computeDigest: (_alg, val) => Array.from(crypto.createHash('sha256').update(String(val || ''), 'utf8').digest()),
      computeHmacSha256Signature: (msg, sec) => Array.from(crypto.createHmac('sha256', String(sec || '')).update(String(msg || ''), 'utf8').digest()),
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
  ctx.getSpreadsheetSeguimiento_ = () => null;
  ctx.readErpAdvisorsFromPlantilla_ = () => ({
    advisors: [],
    stores: ['CEDIS', 'CREATA LIVING COLOSIO', 'CREATA LIVING PLAYA', 'CREATA PUERTO CANCUN', 'CASA CREATA BONAMPAK', 'PROYECTOS ANIPA INTERIOR']
  });
  ctx.registrarEventoHistorial_ = (_ss, entry) => { auditLogs.push(entry); };
  ctx.ensureLiveErpSyncTrigger_ = () => {};

  return { ctx, mockSs, scriptProps, scriptCache, auditLogs, sheetsData, sheetsMap };
}

function buildUnifiedFixtureSheets() {
  // ZERO legacy store tabs (COLOCIO, PLAYA, PTC, CASA CREATA, PROYECTOS are ALL absent!)
  const header26 = [
    '', 'AREA / SUCURSAL', 'Nombre', 'Puesto', 'Correo', 'Contraseña Temporal', 'Contraseña',
    'Usuario / ID Asesor', 'Descuento',
    'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA',
    'VER_PANEL_SUITE', 'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS',
    'PERMITIR_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA', 'NOTAS',
    'COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS'
  ];

  return {
    'CUENTAS ADMINISTRATIVAS': [
      ['', 'USUARIOS Y CUENTAS ADMINISTRATIVAS — PERMISOS POR COLUMNA (J:T) Y TIENDAS ASIGNADAS (V:Z)'],
      header26,
      ['', 'ADMINISTRACIÓN GENERAL', 'IRVIN KEVIN REYNA VALDEZ', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'KevinTest1!', '', '100%',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'Admin total',
        'SI', 'SI', 'SI', 'SI', 'SI'],
      ['', 'ADMINISTRACIÓN GENERAL', 'SANTIAGO TORRES', 'ADMINISTRADOR', 'santiago.torres@grupoanipa.com', '', 'SantyTest1!', '', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'Editado por Kevin',
        'NO', 'NO', 'NO', 'NO', 'SI'],
      ['', 'ADMINISTRACIÓN GENERAL', 'clau', 'administración', 'claudette.angulo@creatamuebles.com', '', 'ClauTest1!', '', '100%',
        'SI', 'SI', 'SI', 'NO', 'NO', 'NO', 'SI', 'NO', 'NO', 'NO', 'NO', 'Admin Casa Creata',
        'NO', 'NO', 'NO', 'SI', 'NO'],
      ['', 'MULTITIENDA', 'MARIA GARCIA', 'Gerente de Tienda', 'maria.garcia@creatamuebles.com', '', 'MariaTest1!', '', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'SI', 'Todas las tiendas',
        'SI', 'SI', 'SI', 'SI', 'SI'],
      ['', 'SUC. COLOCIO', 'JANINE MEDINA', 'Gerente de tienda', 'janine.medina@creatamuebles.com', '', 'JanineTest1!', '', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '',
        'SI', 'NO', 'NO', 'NO', 'NO'],
      ['', 'SUC. COLOCIO', 'FERNANDA PEREZ', 'Asesor interiorista', 'fernanda.perez@creatamuebles.com', '', 'FerTest1!', '', '30%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '',
        'SI', 'NO', 'NO', 'NO', 'NO'],
      ['', 'SUC. PLAYA', 'JULIO DE LA CRUZ RAMON', 'Asesor interiorista', 'juliocruz@creatamuebles.com', '', 'JulioTest1!', '', '30%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', '',
        'NO', 'SI', 'NO', 'NO', 'NO'],
      ['', 'PROYECTOS', 'NELSON HERNANDEZ RODRIGUEZ', 'Gerente Comercial De Proyectos', 'gte.proyectos@creatamuebles.com', '', 'NelsonTest1!', '', '100%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '',
        'NO', 'NO', 'NO', 'NO', 'SI'],
      ['', 'PROYECTOS', 'JOHANA SOLARTE', 'Asesora de Ventas', 'johanna.solarte@creatamuebles.com', '', 'JohaTest1!', '', '30%',
        'SI', 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'NO', '',
        'NO', 'NO', 'NO', 'NO', 'SI']
    ],
    'INVITADOS': [
      ['', 'INVITADOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'LUGARES', 'DISPOSITIVOS ACTIVOS'],
      ['', '1', 'Invitado Estudio', 'INVITADO', 'invitado@estudio.mx', '', 'InvTest1!', 'ACTIVO', '2', '']
    ]
  };
}

test('GAS Unified CUENTAS ADMINISTRATIVAS (ZERO legacy store tabs): admins, single-store advisors/managers, multi-store Maria, password update, presence dedup, and setup guard', () => {
  const sheetsData = buildUnifiedFixtureSheets();
  const { ctx, mockSs, scriptCache, sheetsMap } = buildUnifiedGasMockEnv(sheetsData);

  // Confirm ZERO legacy store tabs exist in mock workbook
  for (const legacyTab of ['COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS']) {
    assert.equal(mockSs.getSheetByName(legacyTab), null, `Legacy tab ${legacyTab} must NOT exist`);
  }

  // 1) Kevin: Admin total, single login (no branch chooser), all 5 assignedStores
  const kevinRes = ctx.handleInvLogin_({
    email: 'kevin.reyna@grupoanipa.com',
    accessKey: 'KevinTest1!',
    deviceId: 'dev-kevin-1',
    deviceLabel: 'Desktop'
  });
  assert.equal(kevinRes.ok, true);
  assert.equal(kevinRes.chooseBranch, false);
  assert.equal(kevinRes.user.isAdmin, true);
  assert.equal(kevinRes.user.sheetTab, 'CUENTAS ADMINISTRATIVAS');
  assert.equal(kevinRes.user.adminPermissions.fotosApp, true);
  assert.equal(kevinRes.user.adminPermissions.equipoInvitados, true);
  assert.deepEqual(Array.from(kevinRes.user.assignedStores), ['COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS']);

  // 2) Santy: Admin with Kevin's exact custom column permissions (J,K,T=SI; L..S=NO)
  const santyRes = ctx.handleInvLogin_({
    email: 'santiago.torres@grupoanipa.com',
    accessKey: 'SantyTest1!',
    deviceId: 'dev-santy-1'
  });
  assert.equal(santyRes.ok, true);
  assert.equal(santyRes.chooseBranch, false);
  assert.equal(santyRes.user.isAdmin, true);
  assert.equal(santyRes.user.adminPermissions.cotizador, true);
  assert.equal(santyRes.user.adminPermissions.seguimiento, true);
  assert.equal(santyRes.user.adminPermissions.cambiarTienda, true);
  assert.equal(santyRes.user.adminPermissions.fotosApp, false);
  assert.equal(santyRes.user.adminPermissions.equipoInvitados, false);
  assert.equal(santyRes.user.adminPermissions.historial, false);

  // 3) clau: Admin in ADMINISTRACIÓN GENERAL assigned specifically to CASA CREATA
  const clauRes = ctx.handleInvLogin_({
    email: 'claudette.angulo@creatamuebles.com',
    accessKey: 'ClauTest1!',
    deviceId: 'dev-clau-1'
  });
  assert.equal(clauRes.ok, true);
  assert.equal(clauRes.chooseBranch, false);
  assert.equal(clauRes.user.isAdmin, true);
  assert.equal(clauRes.user.erpStore, 'CASA CREATA BONAMPAK');
  assert.equal(clauRes.user.orderPrefix, 'CCB');
  assert.equal(clauRes.user.adminPermissions.equipoInvitados, true);
  assert.equal(clauRes.user.adminPermissions.fotosApp, false);

  // 4) MARIA: MULTITIENDA Gerente de Tienda (NOT admin!) with ALL 5 stores = SI -> chooseBranch: true with 5 exact store locations
  const mariaChoose = ctx.handleInvLogin_({
    email: 'maria.garcia@creatamuebles.com',
    accessKey: 'MariaTest1!',
    deviceId: 'dev-maria-1'
  });
  assert.equal(mariaChoose.ok, true);
  assert.equal(mariaChoose.chooseBranch, true);
  assert.equal(mariaChoose.locations.length, 5);
  assert.deepEqual(
    Array.from(mariaChoose.locations, (l) => l.sheetTab),
    ['COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS']
  );
  assert.deepEqual(
    Array.from(mariaChoose.locations, (l) => l.orderPrefix),
    ['DTC', 'PL', 'PTC', 'CCB', 'PRO']
  );
  for (const loc of mariaChoose.locations) {
    assert.equal(loc.isAdmin, false, 'Maria must NEVER be promoted to isAdmin');
    assert.equal(loc.isManager, true, 'Maria must keep Gerente de Tienda isManager=true');
    assert.equal(loc.maxDiscountPct, 100);
    assert.equal(loc.isProyecto, loc.sheetTab === 'PROYECTOS');
  }

  // Maria chooses PLAYA -> exact Playa store scope + branchAdvisorEmails includes Julio (Playa) and excludes Fernanda (Colocio)
  const mariaPlaya = ctx.handleInvLogin_({
    email: 'maria.garcia@creatamuebles.com',
    accessKey: 'MariaTest1!',
    sheetTab: 'PLAYA',
    deviceId: 'dev-maria-1'
  });
  assert.equal(mariaPlaya.ok, true);
  assert.equal(mariaPlaya.chooseBranch, false);
  assert.equal(mariaPlaya.user.sheetTab, 'PLAYA');
  assert.equal(mariaPlaya.user.erpStore, 'CREATA LIVING PLAYA');
  assert.equal(mariaPlaya.user.orderPrefix, 'PL');
  assert.ok(mariaPlaya.user.branchAdvisorEmails.includes('juliocruz@creatamuebles.com'));
  assert.ok(!mariaPlaya.user.branchAdvisorEmails.includes('fernanda.perez@creatamuebles.com'));

  // 5) Maria updates password -> updates single row in CUENTAS ADMINISTRATIVAS and issues tokensByTab for all 5 stores!
  const mariaUpd = ctx.handleInvUpdateKey_({
    email: 'maria.garcia@creatamuebles.com',
    currentKey: 'MariaTest1!',
    newKey: 'MariaNueva2026!',
    sheetTab: 'PLAYA',
    authToken: mariaPlaya.user.authToken
  });
  assert.equal(mariaUpd.ok, true);
  assert.equal(mariaUpd.updatedRows, 1);
  assert.equal(sheetsData['CUENTAS ADMINISTRATIVAS'][5][5], '', 'Col F tempKey must be cleared');
  assert.match(String(sheetsData['CUENTAS ADMINISTRATIVAS'][5][6]), /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/, 'Col G defKey must be stored hashed (SEC-10)');
  assert.notEqual(sheetsData['CUENTAS ADMINISTRATIVAS'][5][6], 'MariaNueva2026!');
  for (const expectedTab of ['CUENTAS ADMINISTRATIVAS', 'COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS']) {
    assert.ok(mariaUpd.tokensByTab[expectedTab], `tokensByTab must include refreshed token for ${expectedTab}`);
  }
  scriptCache.clear();
  const mariaNewLogin = ctx.handleInvLogin_({
    email: 'maria.garcia@creatamuebles.com',
    accessKey: 'MariaNueva2026!',
    sheetTab: 'PTC'
  });
  assert.equal(mariaNewLogin.ok, true);
  assert.equal(mariaNewLogin.user.sheetTab, 'PTC');
  assert.equal(mariaNewLogin.user.orderPrefix, 'PTC');

  // 6) Fernanda (SUC. COLOCIO Asesor, 30%) -> single location, NOT admin, NOT manager
  const ferRes = ctx.handleInvLogin_({
    email: 'fernanda.perez@creatamuebles.com',
    accessKey: 'FerTest1!',
    deviceId: 'dev-fer-1'
  });
  assert.equal(ferRes.ok, true);
  assert.equal(ferRes.chooseBranch, false);
  assert.equal(ferRes.user.isAdmin, false);
  assert.equal(ferRes.user.isManager, false);
  assert.equal(ferRes.user.sheetTab, 'COLOCIO');
  assert.equal(ferRes.user.erpStore, 'CREATA LIVING COLOSIO');
  assert.equal(ferRes.user.orderPrefix, 'DTC');
  assert.equal(ferRes.user.maxDiscountPct, 30);

  // resolveAuthenticatedAdvisor_ works for Fernanda with ZERO legacy store tabs
  const ferResolved = ctx.resolveAuthenticatedAdvisor_(mockSs, [], {
    authToken: ferRes.user.authToken,
    sheetTab: 'COLOCIO'
  });
  assert.equal(ferResolved.ok, true);
  assert.equal(ferResolved.advisor.correo, 'fernanda.perez@creatamuebles.com');
  assert.equal(ferResolved.advisor.erpStore, 'CREATA LIVING COLOSIO');

  // 7) Janine (SUC. COLOCIO Gerente, 100%) -> manager scope includes Fernanda
  const janineRes = ctx.handleInvLogin_({
    email: 'janine.medina@creatamuebles.com',
    accessKey: 'JanineTest1!'
  });
  assert.equal(janineRes.ok, true);
  assert.equal(janineRes.user.isAdmin, false);
  assert.equal(janineRes.user.isManager, true);
  assert.equal(janineRes.user.maxDiscountPct, 100);
  assert.ok(janineRes.user.branchAdvisorEmails.includes('fernanda.perez@creatamuebles.com'));
  assert.ok(!janineRes.user.branchAdvisorEmails.includes('juliocruz@creatamuebles.com'));

  // 8) Nelson (PROYECTOS Gerente Comercial De Proyectos, 100%) -> isProyecto=true, orderPrefix=PRO, includes Johana
  const nelsonRes = ctx.handleInvLogin_({
    email: 'gte.proyectos@creatamuebles.com',
    accessKey: 'NelsonTest1!'
  });
  assert.equal(nelsonRes.ok, true);
  assert.equal(nelsonRes.user.isAdmin, false);
  assert.equal(nelsonRes.user.isManager, true);
  assert.equal(nelsonRes.user.isProyecto, true);
  assert.equal(nelsonRes.user.erpStore, 'PROYECTOS ANIPA INTERIOR');
  assert.equal(nelsonRes.user.orderPrefix, 'PRO');
  assert.ok(nelsonRes.user.branchAdvisorEmails.includes('johanna.solarte@creatamuebles.com'));

  // 9) Julio has PERMITIR_SUBIR_FOTO = NO -> userPermissions.subirFoto === false (and heartbeat returns it)
  const julioRes = ctx.handleInvLogin_({
    email: 'juliocruz@creatamuebles.com',
    accessKey: 'JulioTest1!'
  });
  assert.equal(julioRes.ok, true);
  assert.equal(julioRes.user.userPermissions.subirFoto, false);
  const julioHb = ctx.handleInvPresenceHeartbeat_({
    authToken: julioRes.user.authToken,
    advisorEmail: 'juliocruz@creatamuebles.com',
    vista: 'inventario'
  });
  assert.equal(julioHb.ok, true);
  assert.equal(julioHb.userPermissions.subirFoto, false);

  // 10) Invitado (INVITADOS tab) still works in Solo Lectura mode
  const invRes = ctx.handleInvLogin_({
    email: 'invitado@estudio.mx',
    accessKey: 'InvTest1!',
    deviceId: 'dev-inv-1',
    deviceLabel: 'iPhone'
  });
  assert.equal(invRes.ok, true);
  assert.equal(invRes.user.isGuest, true);
  assert.equal(invRes.user.soloLectura, true);

  // 11) Live team presence list deduplicates multi-store Maria (1 entry, not 5!) and includes invitados
  const presList = ctx.handleInvPresenceList_({
    authToken: kevinRes.user.authToken,
    advisorEmail: 'kevin.reyna@grupoanipa.com'
  });
  assert.equal(presList.ok, true);
  const mariaEntries = (presList.users || []).filter((u) => u.correo === 'maria.garcia@creatamuebles.com');
  assert.equal(mariaEntries.length, 1, 'Multi-store user Maria must appear ONCE in live team presence list');
  assert.equal((presList.guests || []).length, 1);

  // 12) organizarCuentasYDescuentosEnHojas protects unified directory and NEVER recreates deleted store tabs or wipes passwords
  const setupRes = ctx.organizarCuentasYDescuentosEnHojas({ silentUi: true });
  assert.equal(setupRes.ok, true);
  assert.equal(setupRes.unified, true);
  for (const legacyTab of ['COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS']) {
    assert.equal(sheetsMap.has(legacyTab), false, `Setup safeguard must NOT recreate deleted tab ${legacyTab}`);
  }
  assert.match(String(sheetsData['CUENTAS ADMINISTRATIVAS'][5][6]), /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/, 'Setup safeguard must preserve hashed passwords');
  assert.equal(ctx.keysEqualNormalized_('MariaNueva2026!', sheetsData['CUENTAS ADMINISTRATIVAS'][5][6]), true, 'Setup safeguard must preserve Maria password validity');
});

test('Frontend Unified Directory Contracts: inventario-app.js, seguimiento-app.js, fotos-productos-app.js, panel-app.js, historial-app.js', () => {
  const invJs = fs.readFileSync('inventario-app.js', 'utf8');
  const segJs = fs.readFileSync('seguimiento-app.js', 'utf8');
  const fotosJs = fs.readFileSync('fotos-productos-app.js', 'utf8');
  const panelJs = fs.readFileSync('panel-app.js', 'utf8');
  const histJs = fs.readFileSync('historial-app.js', 'utf8');

  // inventario-app.js: fetchAllAdvisorRowsLiveGviz prefers role-scoped inv_my_directory and only queries CUENTAS ADMINISTRATIVAS + INVITADOS as fallback
  const gvizFnStart = invJs.indexOf('async function fetchAllAdvisorRowsLiveGviz(');
  assert.ok(gvizFnStart > 0, 'fetchAllAdvisorRowsLiveGviz must exist');
  const gvizFnBody = invJs.slice(gvizFnStart, gvizFnStart + 1400);
  assert.match(gvizFnBody, /'inv_my_directory'/);
  assert.match(gvizFnBody, /[a-zA-Z_]\w*\.tab === 'CUENTAS ADMINISTRATIVAS' \|\| [a-zA-Z_]\w*\.isGuest/, 'GViz loader must only fetch CUENTAS ADMINISTRATIVAS and INVITADOS');
  assert.match(invJs, /UNIFIED_STORE_COLUMNS_CLIENT/);
  assert.match(invJs, /function isAdministrativeUnifiedRowClient\(/);
  assert.match(invJs, /function extractAssignedStoresFromRowClient\(/);
  assert.match(invJs, /userPermissions\.subirFoto === false/, 'canManageProductPhotos must honor userPermissions.subirFoto === false');

  // submitNewPersonalKey must NEVER silently close modal or clear mustChangeKey if inv_update_key fails
  const keyFnStart = invJs.indexOf('window.submitNewPersonalKey = async function');
  assert.ok(keyFnStart > 0, 'submitNewPersonalKey must exist');
  const keyFnBody = invJs.slice(keyFnStart, keyFnStart + 2400);
  assert.match(keyFnBody, /if \(!res \|\| !res\.ok\)\s*\{[\s\S]*?showAuthBanner\('authNewKeyMsg'[\s\S]*?return;/, 'submitNewPersonalKey must abort and show error banner when inv_update_key fails');
  assert.match(keyFnBody, /recoverStoredInvAuthToken\(activeAdvisorSession\)/);

  // seguimiento-app.js: prefers authenticated advisorsDirectory / inv_my_directory and only queries CUENTAS ADMINISTRATIVAS A1:Z100 as transition fallback
  const segDirStart = segJs.indexOf('async function fetchUnifiedAdvisorsDirectory(');
  assert.ok(segDirStart > 0, 'fetchUnifiedAdvisorsDirectory must exist');
  const segDirBody = segJs.slice(segDirStart, segDirStart + 2800);
  assert.match(segDirBody, /buildSegDirectoryFromApiUsers/);
  assert.match(segDirBody, /'inv_my_directory'/);
  assert.match(segDirBody, /const invTabs = \[\s*\{\s*tab:\s*'CUENTAS ADMINISTRATIVAS',\s*branch:\s*'UNIFIED',\s*range:\s*'A1:Z100'\s*\}\s*\]/);
  assert.match(segDirBody, /UNIFIED_SEG_STORE_COLS/);

  // fotos-productos-app.js, panel-app.js, historial-app.js use CUENTAS ADMINISTRATIVAS without public GViz password fallback or legacy PROYECTOS tab
  assert.match(fotosJs, /'CUENTAS ADMINISTRATIVAS':\s*'1488878870'/);
  assert.ok(!/fetchSheetRows\('CUENTAS ADMINISTRATIVAS',\s*'A1:Z60'\)/.test(fotosJs), 'fotos-productos-app.js must NOT verify passwords via public GViz (P0-01)');
  assert.ok(!panelJs.includes("'PROYECTOS'"), 'panel-app.js must NOT reference deleted PROYECTOS tab (P2-11)');
  assert.match(panelJs, /sheetTab:\s*'CUENTAS ADMINISTRATIVAS'/);
  assert.match(histJs, /isAdmin \? 'CUENTAS ADMINISTRATIVAS'/);
});

test('Single private auth workbook (CREATA_AUTH_PRIVADO_NO_COMPARTIR) default routing + Paula first-time password upgrade persistence + role-scoped directory', () => {
  const PUBLIC_INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
  const PRIVATE_AUTH_ID = '1CqZyNaHUU5YiOFrN-8hXuTvJqoD_IgSvULhiffSF_lQ';
  const SEG_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

  const env = createMockGasEnvironment({
    activeSpreadsheetId: PUBLIC_INV_ID,
    scriptProperties: { INV_AUTH_SECRET: 'single-private-vault-secret-2026-abcdef' }
  });

  const publicBook = env.makeSpreadsheet(PUBLIC_INV_ID, 'CONTROL DE PRODUCTOS PRESENTACIÓN', {
    HISTORIAL: [['FECHA', 'CLAS', 'MOD', 'EV', 'EST', 'USR', 'SUC', 'REF', 'DET', 'ANA']],
    COTIZACIONES_EN_VIVO: [['ORDEN', 'FOLIO', 'ID', 'FECHA', 'MOD', 'HOJA', 'TIENDA', 'CORREO', 'NOMBRE', 'USR', 'IDU', 'CLI', 'TEL', 'MC', 'CAT', 'ENT', 'PC', 'SKU', 'SUB', 'IVA', 'DESC', 'TOT', 'EST', 'NOTAS', 'ORIGEN']],
    INVENTARIO_EN_VIVO: [['BANNER'], ['SKU', 'NOMBRE'], ['SKU1', 'SILLA']]
  });

  const privateAuthBook = env.makeSpreadsheet(PRIVATE_AUTH_ID, 'CREATA_AUTH_PRIVADO_NO_COMPARTIR', {
    'CUENTAS ADMINISTRATIVAS': [
      ['USUARIOS Y CUENTAS ADMINISTRATIVAS'],
      [
        'NO', 'TIPO / ÁREA', 'Nombre', 'Puesto', 'Correo', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'Asesor ERP', 'Descuento',
        'VER_COTIZADOR', 'VER_SEGUIMIENTO', 'VER_HISTORIAL', 'VER_FOTOS_APP', 'VER_PROMPTS_IA', 'VER_PANEL_SUITE',
        'VER_EQUIPO_Y_INVITADOS', 'VER_CAMBIAR_ROL', 'VER_GESTION_PRODUCTOS', 'VER_SUBIR_FOTO', 'VER_CAMBIAR_TIENDA',
        'NOTAS', 'COLOCIO', 'PLAYA', 'PTC', 'CASA CREATA', 'PROYECTOS'
      ],
      [
        '1', 'ADMINISTRACIÓN GENERAL', 'Irvin Kevin Reyna', 'ADMINISTRADOR GENERAL', 'kevin.reyna@grupoanipa.com', '', 'Kevin2026!', '', '100%',
        'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', '', 'SI', 'SI', 'SI', 'SI', 'SI'
      ],
      [
        '32', 'GARANTIAS', 'PAULA', 'PRUEBAS', 'paula.bri@creatamuebles.com', '123', '', '', '0%',
        'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'NO', 'SI', 'SI', '', 'NO', 'NO', 'NO', 'NO', 'NO'
      ]
    ],
    INVITADOS: [
      ['INVITADOS'],
      ['NO', 'INVITADOS (SOLO VER)', 'Nombre', 'Puesto', 'Correo', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'DISPOSITIVOS PERMITIDOS', 'LUGARES ACTIVOS', 'DISPOSITIVOS AUTORIZADOS']
    ]
  });

  env.makeSpreadsheet(SEG_ID, 'COTIZACIONES BASE DE DATOS', {
    COTIZACIONES_CREATA: [['H1', 'Folio', 'Fecha', 'Sucursal', 'Asesor', 'Correo', 'Cliente', 'Tel', 'Estatus', 'SKU']],
    COTIZACIONES_ARCHIVADAS: [['H1', 'Folio', 'Fecha', 'Sucursal', 'Asesor', 'Correo', 'Cliente', 'Tel', 'Estatus', 'SKU']],
    CIERRES_COTIZACIONES: [['Fecha', 'Folio', 'Sucursal', 'Asesor', 'Correo']],
    CONFIG_CREATA: [['CLAVE', 'VALOR'], ['DIAS_SEGUIMIENTO', '3']],
    HISTORIAL_MOVIMIENTOS: [['FECHA', 'TIPO', 'USUARIO', 'EMAIL', 'SUCURSAL', 'ACCION', 'DETALLE']]
  });

  env.loadScript('AppsScript_Creata_Drive_Sheets.gs');
  env.context.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: ['PROYECTOS ANIPA INTERIOR'] });
  env.context.ensureLiveErpSyncTrigger_ = () => {};

  const post = (payload) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());

  // 1) Even WITHOUT ScriptProperties AUTH_SPREADSHEET_ID set AND WITHOUT auth tabs in public book,
  //    Paula logs in seamlessly from CREATA_AUTH_PRIVADO_NO_COMPARTIR!
  const paulaLogin1 = post({ action: 'inv_login', email: 'paula.bri@creatamuebles.com', accessKey: '123', deviceId: 'dev_paula_1' });
  assert.equal(paulaLogin1.ok, true, 'Paula must log in from default private auth workbook');
  assert.equal(paulaLogin1.user.mustChangeKey, true, 'Temp key login must require personal password setup');
  assert.equal(paulaLogin1.user.sheetTab, 'PROYECTOS');
  assert.equal(publicBook.getSheetByName('CUENTAS ADMINISTRATIVAS'), null, 'Public workbook must remain free of CUENTAS ADMINISTRATIVAS');
  assert.equal(publicBook.getSheetByName('INVITADOS'), null, 'Public workbook must remain free of INVITADOS');

  // 2) Paula updates her password EVEN IF currentKey is empty (e.g. after mobile page reload) using her valid HMAC token!
  const updRes = post({
    action: 'inv_update_key',
    email: 'paula.bri@creatamuebles.com',
    currentKey: '',
    newKey: 'PaulaFirme2026!',
    sheetTab: 'PROYECTOS',
    authToken: paulaLogin1.user.authToken
  });
  assert.equal(updRes.ok, true, 'First-time temp-key upgrade must succeed with valid HMAC token even if currentKey is empty');
  assert.ok(updRes.tokensByTab && updRes.tokensByTab.PROYECTOS, 'Update must mint renewed token for PROYECTOS');

  // Verify Col F cleared & Col G saved strictly in CREATA_AUTH_PRIVADO_NO_COMPARTIR
  const privSheet = privateAuthBook.getSheetByName('CUENTAS ADMINISTRATIVAS');
  assert.equal(privSheet.getRange(4, 6).getValue(), '', 'Col F (temp key) must be cleared in private auth workbook');
  assert.match(String(privSheet.getRange(4, 7).getValue()), /^sha256i\$\d+\$[a-zA-Z0-9_-]{8,}\$[a-f0-9]{64}$/, 'Col G (definitive key) must be stored hashed in private auth workbook (SEC-10)');
  assert.notEqual(privSheet.getRange(4, 7).getValue(), 'PaulaFirme2026!');

  // 3) Old temp key now fails, new definitive password logs in cleanly with mustChangeKey=false
  const oldKeyAttempt = post({ action: 'inv_login', email: 'paula.bri@creatamuebles.com', accessKey: '123', deviceId: 'dev_paula_1' });
  assert.equal(oldKeyAttempt.ok, false, 'Old temp key must be rejected after password update');
  const newKeyLogin = post({ action: 'inv_login', email: 'paula.bri@creatamuebles.com', accessKey: 'PaulaFirme2026!', deviceId: 'dev_paula_1' });
  assert.equal(newKeyLogin.ok, true, 'New personal password must log in cleanly');
  assert.equal(newKeyLogin.user.mustChangeKey, false);

  // 4) Non-admin Paula stays blocked from admin-only inv_users_directory (P0-03),
  //    while role-scoped inv_my_directory & seg_get_state return ONLY her own sanitized profile (zero passwords!)
  const blockedFullDir = post({ action: 'inv_users_directory', authToken: newKeyLogin.user.authToken });
  assert.equal(blockedFullDir.ok, false, 'Non-admin must remain blocked from full inv_users_directory');

  const myDirRes = post({ action: 'inv_my_directory', authToken: newKeyLogin.user.authToken });
  assert.equal(myDirRes.ok, true, 'Role-scoped inv_my_directory must succeed for Paula');
  assert.equal(myDirRes.users.length, 1);
  assert.equal(myDirRes.users[0].correo, 'paula.bri@creatamuebles.com');
  assert.equal(myDirRes.users[0].tempKey, undefined);
  assert.equal(myDirRes.users[0].defKey, undefined);

  const segDeniedRes = post({ action: 'seg_get_state', authToken: newKeyLogin.user.authToken });
  assert.equal(segDeniedRes.ok, false, 'Paula with VER_SEGUIMIENTO=NO & VER_HISTORIAL=NO must be blocked on seg_get_state (SEC-03)');
  assert.equal(segDeniedRes.forbidden, true);

  privSheet.getRange(4, 11).setValue('SI'); // Grant VER_SEGUIMIENTO in private auth workbook
  env.context.invalidateBranchUsersCache_();
  const segRes = post({ action: 'seg_get_state', authToken: newKeyLogin.user.authToken });
  assert.equal(segRes.ok, true, 'seg_get_state must succeed from private auth workbook once VER_SEGUIMIENTO=SI');
  assert.equal(segRes.advisorsDirectory.length, 1);
  assert.equal(segRes.advisorsDirectory[0].correo, 'paula.bri@creatamuebles.com');
  assert.equal(segRes.advisorsDirectory[0].defKey, undefined);

  // 5) Admin Kevin receives full sanitized directory from private auth workbook
  const kevinLogin = post({ action: 'inv_login', email: 'kevin.reyna@grupoanipa.com', accessKey: 'Kevin2026!', deviceId: 'dev_kev_1' });
  assert.equal(kevinLogin.ok, true);
  const kevinDir = post({ action: 'inv_my_directory', authToken: kevinLogin.user.authToken });
  assert.equal(kevinDir.ok, true);
  assert.equal(kevinDir.users.length, 2);
});


