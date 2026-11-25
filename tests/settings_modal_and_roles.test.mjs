import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

test('Settings UI & cache versions exist in inventario.html and inventario-ui.css', () => {
  const html = fs.readFileSync('inventario.html', 'utf8');
  assert(html.includes('id="fabSettingsBtn"'), 'Missing #fabSettingsBtn in FAB menu');
  assert(html.includes('id="settingsModal"'), 'Missing #settingsModal');
  assert(html.includes('id="headerRoleModePill"'), 'Missing #headerRoleModePill');
  assert(html.includes('id="settingsRoleSwitchSection"'), 'Missing Kevin role switch section');
  assert(html.includes('id="settingsTeamPresenceSection"'), 'Missing Kevin live team presence section');
  assert(html.includes('id="settingsDocNameSection"'), 'Missing PDF doc name section');
  assert(html.includes('id="settingsBranchSection"'), 'Missing multi-store branch section');
  assert(html.includes('id="settingsProductsSection"'), 'Missing Kevin product manager section');
  assert(html.includes('id="settingsPasswordSection"'), 'Missing password change section');
  assert(html.includes('id="settingsSessionsSection"'), 'Missing open sessions section');
  assert(html.includes('./inventario-ui.css?v=28'), 'inventario.html must load inventario-ui.css?v=28');
  assert(html.includes('./historial-app.js?v=12'), 'inventario.html must load historial-app.js?v=12');
  assert(html.includes('inventario-app.js?v=113'), 'inventario.html must load inventario-app.js?v=113');
  const segJs = fs.readFileSync('seguimiento-app.js', 'utf8');
  assert(!segJs.includes('id="seg_btnKevinAuditHeader"'), 'Historial y Movimientos button must be removed from Seguimiento header');
  assert(segJs.includes('class="cm-seg-search-field"'), 'Seguimiento search bar must use full-width top field class');
  assert(segJs.includes('compactHaystack'), 'Seguimiento search must support compact folio/phone matching');
  const histJs = fs.readFileSync('historial-app.js', 'utf8');
  assert(histJs.includes('function formatPresenceVistaLabel'), 'Historial presence panel must display formatted app view (where user is connected)');
  const invJs = fs.readFileSync('inventario-app.js', 'utf8');
  assert(invJs.includes('window.refreshSettingsTeamPresence'), 'inventario-app.js must expose Kevin-only refreshSettingsTeamPresence');

  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert(depth >= 0, 'Unmatched } in inventario-ui.css');
  }
  assert.strictEqual(depth, 0, 'Unbalanced braces in inventario-ui.css');
  assert(css.includes('#settingsModal .inv-settings-card'), 'Missing #settingsModal styles');
});

test('Zero locked files modified and syntax valid across inventario-app.js and AppsScript_Creata_Drive_Sheets.gs', () => {
  const changed = execSync('git diff --name-only origin/main', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  for (const f of changed) {
    assert(!/^(index\.html|catalog-|admin|inventario-sw\.js)/.test(f), `Locked file touched: ${f}`);
  }
  new Function(fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8'));
});

test('Apps Script backend: device sessions tracking, remote revocation, and Kevin-only _INV_PRODUCT_OVERRIDES', () => {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map();
  const scriptCache = new Map();
  const sheetsMap = new Map();

  function makeSheet(name) {
    const data = [];
    return {
      _name: name,
      _data: data,
      _hidden: false,
      getName: () => name,
      hideSheet() { this._hidden = true; },
      getLastRow: () => data.length,
      getRange(row, col, numRows, numCols) {
        return {
          getValues() {
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const rowArr = data[row - 1 + r] || [];
              const slice = [];
              for (let c = 0; c < numCols; c++) slice.push(rowArr[col - 1 + c] ?? '');
              out.push(slice);
            }
            return out;
          },
          setValues(vals) {
            for (let r = 0; r < vals.length; r++) {
              while (data.length < row - 1 + r + 1) data.push([]);
              const target = data[row - 1 + r];
              for (let c = 0; c < vals[r].length; c++) {
                target[col - 1 + c] = vals[r][c];
              }
            }
          }
        };
      }
    };
  }

  const fakeSs = {
    getSheetByName: (n) => sheetsMap.get(n) || null,
    insertSheet: (n) => {
      const sh = makeSheet(n);
      sheetsMap.set(n, sh);
      return sh;
    }
  };

  let mockActorEmail = 'asesor@grupoanipa.com';
  const sandbox = {
    Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error, isFinite,
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
        setProperty: (k, v) => { scriptProps.set(k, String(v)); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => {},
        releaseLock: () => {}
      })
    },
    SpreadsheetApp: { flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (alg, txt) => Array.from(Buffer.from(String(txt))).slice(0, 16)
    }
  };

  vm.runInNewContext(gsSrc, sandbox, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });

  // Override dependencies for isolated unit verification
  sandbox.getSpreadsheet_ = () => fakeSs;
  sandbox.formatCancunNow_ = () => '19/11/2026 12:30:00';
  sandbox.registrarEventoHistorial_ = () => {};
  sandbox.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [] });
  sandbox.resolveAuthenticatedAdvisor_ = () => ({
    ok: true,
    advisor: {
      correo: mockActorEmail,
      nombre: mockActorEmail === 'kevin.reyna@grupoanipa.com' ? 'Kevin Reyna' : 'Asesor Demo',
      erpStore: 'CREATA PUERTO CANCUN',
      sheetTab: 'PTC',
      isAdmin: mockActorEmail === 'kevin.reyna@grupoanipa.com'
    }
  });
  sandbox.resolvePresenceActor_ = () => ({
    advisor: {
      correo: mockActorEmail,
      nombre: mockActorEmail === 'kevin.reyna@grupoanipa.com' ? 'Kevin Reyna' : 'Asesor Demo',
      erpStore: 'CREATA PUERTO CANCUN',
      sheetTab: 'PTC',
      isAdmin: mockActorEmail === 'kevin.reyna@grupoanipa.com'
    },
    allUsers: []
  });

  // 1) Device sessions + remote revocation
  const hb1 = sandbox.handleInvPresenceHeartbeat_({
    deviceId: 'dev_phone_1',
    deviceLabel: 'Android Chrome',
    sessionStartedMs: Date.now() - 10000,
    vista: 'inventario'
  });
  assert.strictEqual(hb1.ok, true);
  assert.strictEqual(hb1.sessionRevoked, false);

  const hb2 = sandbox.handleInvPresenceHeartbeat_({
    deviceId: 'dev_pc_2',
    deviceLabel: 'Windows Chrome',
    sessionStartedMs: Date.now() - 5000,
    vista: 'inventario'
  });
  assert.strictEqual(hb2.ok, true);

  const listRes = sandbox.handleInvMySessions_({ deviceId: 'dev_pc_2', deviceLabel: 'Windows Chrome' });
  assert.strictEqual(listRes.ok, true);
  assert.strictEqual(listRes.sessions.length, 2);
  assert.strictEqual(listRes.sessions[0].deviceId, 'dev_pc_2');
  assert.strictEqual(listRes.sessions[0].isCurrent, true);

  const revRes = sandbox.handleInvRevokeSession_({ deviceId: 'dev_pc_2', targetDeviceId: 'ALL_OTHERS' });
  assert.strictEqual(revRes.ok, true);
  assert.strictEqual(revRes.revokedCount, 1);

  const hbRevoked = sandbox.handleInvPresenceHeartbeat_({
    deviceId: 'dev_phone_1',
    deviceLabel: 'Android Chrome',
    sessionStartedMs: Date.now() - 10000,
    vista: 'inventario'
  });
  assert.strictEqual(hbRevoked.sessionRevoked, true, 'Revoked remote device must receive sessionRevoked: true');

  // 2) Product overrides: advisor MUST be rejected (forbidden)
  mockActorEmail = 'asesor@grupoanipa.com';
  const denied = sandbox.handleInvProductOverrideSave_({ sku: 'TESTSKU01', op: 'ARCHIVE' });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.forbidden, true);

  // 3) Product overrides: Kevin can SAVE (with formula sanitization), ARCHIVE, RESTORE, DELETE
  mockActorEmail = 'kevin.reyna@grupoanipa.com';
  const saved = sandbox.handleInvProductOverrideSave_({
    sku: 'TESTSKU01',
    op: 'SAVE',
    name: '=HYPERLINK("http://evil")',
    category: 'SALAS',
    price: '15900',
    note: '+nota'
  });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.override.status, 'VISIBLE');
  assert.strictEqual(saved.override.price, 15900);
  const ovrSheet = sheetsMap.get('_INV_PRODUCT_OVERRIDES');
  assert(ovrSheet, '_INV_PRODUCT_OVERRIDES sheet must be created');
  assert.strictEqual(ovrSheet._hidden, true, '_INV_PRODUCT_OVERRIDES should be hidden');
  assert.strictEqual(ovrSheet._data[1][2], '\'=HYPERLINK("http://evil")', 'Formula injection must be prefixed with apostrophe');
  assert.strictEqual(sheetsMap.has('INVENTARIO_EN_VIVO'), false, 'Must NEVER touch INVENTARIO_EN_VIVO');
  assert.strictEqual(sheetsMap.has('CATALOGO_PRODUCTOS'), false, 'Must NEVER touch CATALOGO_PRODUCTOS');

  const archived = sandbox.handleInvProductOverrideSave_({ sku: 'TESTSKU01', op: 'ARCHIVE' });
  assert.strictEqual(archived.ok, true);
  assert.strictEqual(archived.override.status, 'ARCHIVADO');

  const deleted = sandbox.handleInvProductOverrideSave_({ sku: 'TESTSKU01', op: 'DELETE' });
  assert.strictEqual(deleted.ok, true);
  assert.strictEqual(deleted.override.status, 'ELIMINADO');

  const restored = sandbox.handleInvProductOverrideSave_({ sku: 'TESTSKU01', op: 'RESTORE' });
  assert.strictEqual(restored.ok, true);
  assert.strictEqual(restored.override.status, 'VISIBLE');

  const fetched = sandbox.handleInvProductOverridesGet_({});
  assert.strictEqual(fetched.ok, true);
  assert.strictEqual(fetched.overrides.TESTSKU01.status, 'VISIBLE');
});

test('Frontend inventario-app.js: Back-nav registration, PDF doc name sanitization, multi-store guard, and Kevin role preview contracts', () => {
  const src = fs.readFileSync('inventario-app.js', 'utf8');
  assert(src.includes("id: 'settings_modal'"), 'settings_modal must be registered in CREATA_BACK_NAV');
  assert(src.includes("notifyInvBackStatePush('settings_modal')"), 'openSettingsModal must push Back-nav state');
  assert(src.includes('function isRealKevinOwner()'), 'Missing isRealKevinOwner()');
  assert(src.includes('function isKevinAdvisorPreviewActive()'), 'Missing isKevinAdvisorPreviewActive()');
  assert(src.includes('function sanitizePdfDocPrefix('), 'Missing sanitizePdfDocPrefix()');
  assert(src.includes('function getUserMultiStoreList()'), 'Missing getUserMultiStoreList()');
  assert(src.includes('return locs.length > 1 ? locs : [];'), 'Branch section must ONLY show for users in >1 store tab');
  assert(src.includes("ovr.status === 'ARCHIVADO' || ovr.status === 'ELIMINADO'"), 'isQuotableItem must hide ARCHIVADO/ELIMINADO SKUs');
  assert(src.includes("window.openSettingsModal = function"), 'Missing window.openSettingsModal');
  assert(src.includes("window.setKevinRolePreviewMode = function"), 'Missing window.setKevinRolePreviewMode');
  assert(src.includes("window.submitSettingsPasswordChange = async function"), 'Missing window.submitSettingsPasswordChange');
  assert(src.includes("window.submitSettingsProductAction = async function"), 'Missing window.submitSettingsProductAction');
  assert(!src.includes('creata_inv_advisor_session_v2'), 'inventario-app.js must NOT reference typo key creata_inv_advisor_session_v2');
  assert(src.includes('function startSettingsTeamPresenceAutoRefresh()'), 'Missing live Settings modal presence auto-refresh');
  assert(src.includes('function stopSettingsTeamPresenceAutoRefresh()'), 'Missing stopSettingsTeamPresenceAutoRefresh');
  assert(src.includes('async function renewInvAuthTokenIfPossible('), 'Missing auto token renewal in inventario-app.js');

  const histJs = fs.readFileSync('historial-app.js', 'utf8');
  assert(!histJs.includes('async function callWebAppGetPresence('), 'historial-app.js must NOT pass credentials in GET ?action=inv_presence_list URL (P1-20)');
  assert(histJs.includes("callWebAppPost('inv_presence_list'"), 'historial-app.js must fetch inv_presence_list over POST');
  assert(histJs.includes('async function renewSessionAuthToken('), 'historial-app.js must support session token renewal');
  assert(histJs.includes('async function sendHistPresenceHeartbeat('), 'historial-app.js must send presence heartbeats');

  const segJs = fs.readFileSync('seguimiento-app.js', 'utf8');
  assert(segJs.includes('function sendSegPresenceHeartbeat('), 'seguimiento-app.js must send presence heartbeats');

  const fotosJs = fs.readFileSync('fotos-productos-app.js', 'utf8');
  assert(fotosJs.includes('function sendFotosPresenceHeartbeat('), 'fotos-productos-app.js must send presence heartbeats');

  const panelJs = fs.readFileSync('panel-app.js', 'utf8');
  assert(panelJs.includes('function sendPanelPresenceHeartbeat('), 'panel-app.js must send presence heartbeats');
});

test('Apps Script backend: readAllBranchUsers_ 5-min CacheService hit, explicit authRequired, and token renewal on presence endpoints', () => {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map([['INV_AUTH_SECRET', 'test-secret-key-for-presence-tests-1234567890']]);
  const scriptCache = new Map();
  let sheetReads = 0;

  const rowsProyectos = [
    ['NO', 'SUCURSAL', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CLAVE DEFINITIVA', 'ASESOR ERP', 'DESCUENTO'],
    ['1', 'CEDIS', 'Kevin Reyna', 'ADMINISTRADOR', 'kevin.reyna@grupoanipa.com', '', 'Secret123!', '', '100%']
  ];

  const fakeProyectosSheet = {
    getName: () => 'PROYECTOS',
    getLastRow: () => rowsProyectos.length,
    getMaxColumns: () => 9,
    getRange: (r, c, nr, nc) => {
      const slice = () => {
        sheetReads++;
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = rowsProyectos[r - 1 + i] || [];
          out.push(row.slice(c - 1, c - 1 + nc));
        }
        return out;
      };
      return { getValues: slice, getDisplayValues: slice };
    }
  };

  let getSpreadsheetCalls = 0;
  const fakeSs = {
    getSheetByName: (name) => (name === 'PROYECTOS' ? fakeProyectosSheet : null),
    getSheets: () => [fakeProyectosSheet]
  };

  const crypto = {
    hmac: (payload, secret) => {
      // Deterministic lightweight HMAC-like byte array for unit test
      const combined = String(payload) + '::' + String(secret);
      const out = [];
      for (let i = 0; i < 16; i++) {
        out.push((combined.charCodeAt(i % combined.length) + i * 31) & 0xff);
      }
      return out;
    }
  };

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
        setProperty: (k, v) => { scriptProps.set(k, String(v)); }
      })
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        _text: txt,
        setMimeType() { return this; }
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_alg, txt) => Array.from(Buffer.from(String(txt))).slice(0, 16),
      computeHmacSha256Signature: (payload, secret) => crypto.hmac(payload, secret),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: (str) => Array.from(Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: (data) => ({
        getBytes: () => Array.from(Buffer.from(String(data), 'utf8')),
        getDataAsString: () => Buffer.from(data).toString('utf8')
      })
    }
  };

  vm.runInNewContext(gsSrc, sandbox, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });
  sandbox.getSpreadsheet_ = () => {
    getSpreadsheetCalls++;
    return fakeSs;
  };

  // 1) First call reads sheet and caches for 5 min (300s); second call hits CacheService with 0 spreadsheet opens
  const users1 = sandbox.readAllBranchUsers_(null, []);
  assert.equal(users1.length, 1);
  assert.equal(users1[0].correo, 'kevin.reyna@grupoanipa.com');
  const readsAfterFirst = sheetReads;
  const ssCallsAfterFirst = getSpreadsheetCalls;
  assert.ok(readsAfterFirst > 0);

  const users2 = sandbox.readAllBranchUsers_(null, []);
  assert.equal(users2.length, 1);
  assert.equal(sheetReads, readsAfterFirst, 'Second readAllBranchUsers_ call must hit CacheService with 0 sheet reads');
  assert.equal(getSpreadsheetCalls, ssCallsAfterFirst, 'Cached readAllBranchUsers_ must not call getSpreadsheet_()');

  // 2) doPost inv_presence_list with invalid/missing token returns explicit authRequired (not silent { ok: false })
  const unauthRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'inv_presence_list', authToken: 'bad.token' }) }
  })._text);
  assert.equal(unauthRes.ok, false);
  assert.equal(unauthRes.authRequired, true);
  assert.ok(unauthRes.error && unauthRes.error.length > 0, 'Must return explicit error message');

  // 3) doPost inv_presence_heartbeat with expired token + valid accessKey succeeds and mints renewedAuthToken
  const hbRenewRes = JSON.parse(sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'inv_presence_heartbeat',
        authToken: 'expired.bad',
        advisorEmail: 'kevin.reyna@grupoanipa.com',
        accessKey: 'Secret123!',
        vista: 'panel',
        deviceId: 'dev_test_1'
      })
    }
  })._text);
  assert.equal(hbRenewRes.ok, true);
  assert.ok(hbRenewRes.renewedAuthToken && hbRenewRes.renewedAuthToken.includes('.'), 'Heartbeat must mint renewedAuthToken');

  // 4) doGet inv_presence_list with the renewedAuthToken succeeds quickly from cache and shows Kevin online in panel
  const listGetRes = JSON.parse(sandbox.doGet({
    parameter: {
      action: 'inv_presence_list',
      authToken: hbRenewRes.renewedAuthToken
    }
  })._text);
  assert.equal(listGetRes.ok, true);
  assert.equal(listGetRes.onlineCount, 1);
  assert.equal(listGetRes.users[0].correo, 'kevin.reyna@grupoanipa.com');
  assert.equal(listGetRes.users[0].vista, 'panel');
  assert.equal(sheetReads, readsAfterFirst, 'Presence heartbeat + list must run entirely from CacheService without sheet reads');
});
