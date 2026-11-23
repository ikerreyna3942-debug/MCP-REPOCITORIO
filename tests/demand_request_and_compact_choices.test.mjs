import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('UI & CSS contracts: opposite-side Sin stock / Solicitar button, modal fields, and 50% compact choice cards (Color/Tela & Bed Size)', () => {
  const html = fs.readFileSync('inventario.html', 'utf8');
  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  const js = fs.readFileSync('inventario-app.js', 'utf8');

  // 1) Opposite-side button in #detHeaderActionsRow + dedicated #outOfStockRequestModal
  assert.match(html, /id="detHeaderActionsRow"[^>]*justify-between/);
  assert.ok(html.includes('id="detOutOfStockRequestBtn"'), 'Missing #detOutOfStockRequestBtn opposite Agregar');
  assert.ok(html.includes('onclick="openOutOfStockRequestModal()"'), 'Missing openOutOfStockRequestModal() handler');
  assert.ok(html.includes('id="outOfStockRequestModal"'), 'Missing #outOfStockRequestModal');
  assert.ok(html.includes('id="oosReqSkuInput"'), 'Missing #oosReqSkuInput');
  assert.ok(html.includes('id="oosReqModelInput"'), 'Missing #oosReqModelInput');
  assert.ok(html.includes('id="oosReqQtyInput"'), 'Missing #oosReqQtyInput');
  assert.ok(html.includes('id="oosReqVariantInput"'), 'Missing #oosReqVariantInput');
  assert.ok(html.includes('id="oosReqCommentsInput"'), 'Missing #oosReqCommentsInput');
  assert.ok(html.includes('id="oosReqMetaSummary"'), 'Missing #oosReqMetaSummary');
  assert.ok(html.includes('id="btnOosReqSubmit"'), 'Missing #btnOosReqSubmit');

  // 2) CSS: balanced braces + opposite-side button + 50% smaller choice card grid (2-col mobile / 3-col desktop)
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert(depth >= 0, 'Unbalanced closing brace in inventario-ui.css');
  }
  assert.equal(depth, 0, 'Unbalanced braces in inventario-ui.css');

  assert.match(css, /#productDetailModal\s+\.inv-det-oos-btn\s*\{[\s\S]*?margin-left:\s*auto;/);
  assert.match(css, /#detVariantsList\.inv-det-variants-grid\.inv-variants-compact-choices\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /@media\s*\(min-width:\s*640px\)\s*\{\s*#detVariantsList\.inv-det-variants-grid\.inv-variants-compact-choices\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);

  const fabStageMatch = css.match(/#detVariantsList\s+\.inv-fabric-choice-stage\s*\{([\s\S]*?)\}/);
  assert.ok(fabStageMatch, 'Missing .inv-fabric-choice-stage CSS');
  const fabMaxH = Number((fabStageMatch[1].match(/max-height:\s*(\d+)px/) || [])[1]);
  const fabMinH = Number((fabStageMatch[1].match(/min-height:\s*(\d+)px/) || [])[1]);
  assert.ok(fabMaxH > 0 && fabMaxH <= 115, `Expected .inv-fabric-choice-stage max-height <= 115px (50% smaller), got ${fabMaxH}`);
  assert.ok(fabMinH > 0 && fabMinH <= 85, `Expected .inv-fabric-choice-stage min-height <= 85px (50% smaller), got ${fabMinH}`);

  const bedStageMatch = css.match(/#detVariantsList\s+\.inv-bed-size-stage\s*\{([\s\S]*?)\}/);
  assert.ok(bedStageMatch, 'Missing .inv-bed-size-stage CSS');
  const bedMaxH = Number((bedStageMatch[1].match(/max-height:\s*(\d+)px/) || [])[1]);
  assert.ok(bedMaxH > 0 && bedMaxH <= 115, `Expected .inv-bed-size-stage max-height <= 115px (50% smaller), got ${bedMaxH}`);

  // 3) JS: back-nav registration, logout cleanup, compact-choice class toggle, and endpoint name
  assert.ok(js.includes("id: 'out_of_stock_request_modal'"), 'out_of_stock_request_modal must be registered in creata-back-nav');
  assert.ok(js.includes('closeOutOfStockRequestModal'), 'Missing closeOutOfStockRequestModal');
  assert.ok(js.includes("inv-variants-compact-choices"), 'renderGroupVariantsStep must toggle inv-variants-compact-choices');
  assert.ok(js.includes("'inv_register_demand_request'"), 'submitOutOfStockRequest must POST inv_register_demand_request');
});

test('GAS backend: inv_register_demand_request saves auto-filled SKU, model, qty, comments & store into DEMANDA_SIN_STOCK, blocks guests & formula injection', () => {
  const gsSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  const scriptProps = new Map([['INV_AUTH_SECRET', 'demand-test-secret-0123456789abcdef']]);
  const scriptCache = new Map();
  const auditLogs = [];

  const sheetsData = {
    'PROYECTOS': [
      ['', 'USUARIOS PROYECTOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'ESTADO', 'OBSERVACIONES'],
      ['', '1', 'Ana Ventas', 'ASESOR', 'ana.ventas@grupoanipa.com', '', 'AnaPass123', 'ACTIVO', '']
    ],
    'INVITADOS': [
      ['', 'INVITADOS'],
      ['', 'NO.', 'NOMBRE', 'PUESTO', 'CORREO', 'CLAVE TEMPORAL', 'CONTRASEÑA DEFINITIVA', 'DISPOSITIVOS MÁX', 'LUGARES EN USO', 'DISPOSITIVOS ACTIVOS'],
      ['', '1', 'Invitado Prueba', 'INVITADO', 'inv@estudio.com', '', 'InvPass123', '2', '0 / 2', '']
    ]
  };

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
        const api = {
          getValues: readVals,
          getDisplayValues: () => readVals().map((row) => row.map((v) => String(v === null || v === undefined ? '' : v))),
          getValue: () => ((rows[r - 1] || [])[c - 1] !== undefined ? (rows[r - 1] || [])[c - 1] : ''),
          getDisplayValue: () => String(((rows[r - 1] || [])[c - 1] !== undefined ? (rows[r - 1] || [])[c - 1] : '')),
          setValues: (vals) => {
            for (let i = 0; i < vals.length; i++) {
              while (rows.length < r + i) rows.push([]);
              for (let j = 0; j < vals[i].length; j++) {
                while (rows[r - 1 + i].length < c + j) rows[r - 1 + i].push('');
                rows[r - 1 + i][c - 1 + j] = vals[i][j];
              }
            }
            return api;
          },
          setValue: (v) => {
            while (rows.length < r) rows.push([]);
            while (rows[r - 1].length < c) rows[r - 1].push('');
            rows[r - 1][c - 1] = v;
            return api;
          },
          merge: () => api,
          setFontWeight: () => api,
          setBackground: () => api,
          setFontColor: () => api,
          setHorizontalAlignment: () => api
        };
        return api;
      },
      setFrozenRows: () => {}
    };
  }

  const sheetsMap = new Map();
  for (const [n, rows] of Object.entries(sheetsData)) sheetsMap.set(n, makeSheet(n, rows));

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
      formatDate: (_d, _tz, fmt) => (fmt === 'yyyyMMdd' ? '20261121' : '21/11/2026 17:30:00'),
      computeHmacSha256Signature: (msg, sec) => {
        const out = [];
        const s = String(msg) + '|' + String(sec);
        for (let i = 0; i < 32; i++) out.push((s.charCodeAt(i % s.length) * (i + 7)) % 127);
        return out;
      },
      base64EncodeWebSafe: (input) => typeof input === 'string'
        ? Buffer.from(input, 'utf8').toString('base64url')
        : Buffer.from((input || []).map((b) => (b < 0 ? b + 256 : b))).toString('base64url'),
      base64DecodeWebSafe: (str) => Array.from(Buffer.from(String(str || ''), 'base64url')),
      newBlob: (data) => ({
        getBytes: () => (Array.isArray(data) ? data : Array.from(Buffer.from(String(data || ''), 'utf8'))),
        getDataAsString: () => (Array.isArray(data) ? Buffer.from(data).toString('utf8') : String(data || ''))
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
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: () => mockSs, getActiveSpreadsheet: () => mockSs, flush: () => {} },
    Session: { getScriptTimeZone: () => 'America/Cancun' }
  };

  vm.runInNewContext(gsSrc, ctx, { filename: 'AppsScript_Creata_Drive_Sheets.gs' });
  ctx.getSpreadsheet_ = () => mockSs;
  ctx.readErpAdvisorsFromPlantilla_ = () => ({ advisors: [], stores: ['CREATA PUERTO CANCUN'] });
  ctx.registrarEventoHistorial_ = (_ss, entry) => { auditLogs.push(entry); };

  // 1) Authenticated advisor logs in and registers an out-of-stock demand request
  const anaLogin = ctx.handleInvLogin_({
    email: 'ana.ventas@grupoanipa.com',
    accessKey: 'AnaPass123',
    sheetTab: 'PROYECTOS',
    deviceId: 'dev-ana-1'
  });
  assert.equal(anaLogin.ok, true);
  const anaTok = anaLogin.authToken || anaLogin.user.authToken;

  const missingComment = ctx.handleInvRegisterDemandRequest_({
    authToken: anaTok,
    advisorEmail: 'ana.ventas@grupoanipa.com',
    sku: 'PIERO001',
    modelName: 'SALA EN L PIERO',
    comments: ''
  });
  assert.equal(missingComment.ok, false);

  const reqRes = ctx.handleInvRegisterDemandRequest_({
    authToken: anaTok,
    advisorEmail: 'ana.ventas@grupoanipa.com',
    erpStore: 'CREATA PUERTO CANCUN',
    sku: 'PIERO001',
    modelName: 'SALA EN L PIERO',
    category: 'SALAS & SOFAS',
    variantInfo: 'FOREVER PLUS MOSS',
    qty: 2,
    comments: '=Cliente solicita 2 piezas en Verde Musgo para entrega esta semana',
    stockSummary: '0 en tiendas · 0 LPPT (Agotado)'
  });
  assert.equal(reqRes.ok, true);
  assert.match(reqRes.requestId, /^DEM-20261121-\d{4}$/);
  assert.equal(reqRes.tabName, 'DEMANDA_SIN_STOCK');
  assert.equal(reqRes.record.sku, 'PIERO001');
  assert.equal(reqRes.record.qty, 2);
  assert.equal(reqRes.record.status, 'PENDIENTE');

  const tabRows = sheetsData['DEMANDA_SIN_STOCK'];
  assert.ok(tabRows && tabRows.length === 3, 'DEMANDA_SIN_STOCK must have title, headers, and 1 appended request row');
  assert.equal(tabRows[2][2], 'PIERO001');
  assert.equal(tabRows[2][3], 'SALA EN L PIERO');
  assert.equal(tabRows[2][6], 2);
  assert.ok(String(tabRows[2][7]).startsWith("'="), 'Leading = must be neutralized against spreadsheet formula injection');
  assert.equal(tabRows[2][9], 'CREATA PUERTO CANCUN');
  assert.equal(tabRows[2][12], 'PENDIENTE');
  assert.ok(auditLogs.some((e) => e.modulo === 'Demanda sin stock' && e.referencia === 'PIERO001'), 'Must log demand request into HISTORIAL');

  // 2) Guest account is strictly blocked from registering internal demand requests
  const guestLogin = ctx.handleInvLogin_({
    email: 'inv@estudio.com',
    accessKey: 'InvPass123',
    sheetTab: 'INVITADOS',
    deviceId: 'dev-guest-1'
  });
  assert.equal(guestLogin.ok, true);
  const guestTok = guestLogin.authToken || guestLogin.user.authToken;
  const guestDenied = ctx.handleInvRegisterDemandRequest_({
    authToken: guestTok,
    advisorEmail: 'inv@estudio.com',
    sku: 'PIERO001',
    modelName: 'SALA EN L PIERO',
    comments: 'Intento de invitado'
  });
  assert.equal(guestDenied.ok, false);
  assert.equal(guestDenied.forbidden, true);
});
