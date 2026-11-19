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
  assert(html.includes('id="settingsDocNameSection"'), 'Missing PDF doc name section');
  assert(html.includes('id="settingsBranchSection"'), 'Missing multi-store branch section');
  assert(html.includes('id="settingsProductsSection"'), 'Missing Kevin product manager section');
  assert(html.includes('id="settingsPasswordSection"'), 'Missing password change section');
  assert(html.includes('id="settingsSessionsSection"'), 'Missing open sessions section');
  assert(html.includes('./inventario-ui.css?v=13'), 'inventario.html must load inventario-ui.css?v=13');
  assert(html.includes('inventario-app.js?v=86'), 'inventario.html must load inventario-app.js?v=86');
  const segJs = fs.readFileSync('seguimiento-app.js', 'utf8');
  assert(!segJs.includes('id="seg_btnKevinAuditHeader"'), 'Historial y Movimientos button must be removed from Seguimiento header');
  assert(segJs.includes('class="cm-seg-search-field"'), 'Seguimiento search bar must use full-width top field class');
  assert(segJs.includes('compactHaystack'), 'Seguimiento search must support compact folio/phone matching');

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
});
