import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

test('Bug fix F7: historial-app.js visibilitychange calls syncAllProjectHistory(true) and never references undefined syncLiveData', () => {
  const histSrc = readRepoFile('historial-app.js');
  assert.ok(!/\bsyncLiveData\s*\(/.test(histSrc), 'historial-app.js must not call undefined syncLiveData()');
  assert.match(histSrc, /syncAllProjectHistory\(true\)/, 'historial-app.js must call syncAllProjectHistory(true) on visibilitychange');
});

test('Sheet backup: 11-kevin-archive-and-sales-analysis.gs backs up HISTORIAL into RESGUARDO_HISTORIAL inside the same spreadsheet', () => {
  const gs11 = readRepoFile('src/apps-script/11-kevin-archive-and-sales-analysis.gs');
  assert.match(gs11, /TAB_RESGUARDO_HISTORIAL_\s*=\s*'RESGUARDO_HISTORIAL'/, 'Must define TAB_RESGUARDO_HISTORIAL_');
  assert.match(gs11, /backupHistorialToResguardoSheet_/, 'Must define backupHistorialToResguardoSheet_ helper');
});

test('Failure classification: noise silenced (F12, F14, F16, LockService) while Normal (F13, F15, N3) and Critical (F1-F11, N1, N2) are enforced', () => {
  const inv07 = readRepoFile('src/inventario/07-auth-presence-fab-and-modules.js');
  const inv08b = readRepoFile('src/inventario/08b-clients-cart-pdf-and-submit.js');
  const gs02 = readRepoFile('src/apps-script/02-web-entrypoints-and-catalog-crud.gs');
  const gs03 = readRepoFile('src/apps-script/03-inventory-setup-users-and-invitados.gs');
  const gs04 = readRepoFile('src/apps-script/04-auth-tokens-directory-and-quotes-ledger.gs');
  const gs05 = readRepoFile('src/apps-script/05-erp-wcf-client-submit-quote-and-pdf.gs');
  const gs06 = readRepoFile('src/apps-script/06-erp-inventory-sync-autocomplete-and-clients.gs');
  const gs08 = readRepoFile('src/apps-script/08-audit-historial-and-seguimiento-sync.gs');
  const fotos05 = readRepoFile('src/fotos/05-offline-idb-outbox-and-checkpoint.js');

  // F12: benign browser promise rejections ignored (play() interrupted, Clipboard writeText, not allowed by user agent, aborted)
  assert.ok(/play\\\(\\\).*interrupted/i.test(inv07), 'F12 must ignore camera/media play() interruption');
  assert.match(inv07, /writeText.*Clipboard|Document is not focused/i, 'F12 must ignore unfocused Clipboard writeText');
  assert.match(inv07, /not allowed by the user agent/i, 'F12 must ignore user-agent permission rejection');

  // F14: quote clipboard fallback does NOT log history noise on aborted network signal
  assert.ok(!/event:\s*'RESPALDO PORTAPAPELES EN COTIZACIÓN'/.test(inv08b), 'F14 noise event must be removed');

  // F16: guest 2-device limit does NOT pollute HISTORIAL
  assert.ok(!/ACCESO BLOQUEADO POR LÍMITE DE DISPOSITIVOS PERMITIDOS/.test(gs03), 'F16 guest device limit alert must be silenced from HISTORIAL');

  // LockService contention in doPost returns retryable response without logging false FALLO DE CÓDIGO
  assert.match(gs02, /isTransientLockTimeoutError_/, 'doPost must filter transient LockService timeout errors');

  // F13 (<5 tries = ALERTA TÉCNICA) vs N1 (>=5 tries = FALLO DE CÓDIGO critical)
  assert.match(gs04, /INTENTO DE ACCESO CON CONTRASEÑA INCORRECTA/, 'F13 normal alert preserved for <5 attempts');
  assert.match(gs04, /INTENTOS REPETIDOS DE ACCESO SOSPECHOSO/, 'N1 critical failure added for >=5 failed login attempts');

  // F15 remains ALERTA TÉCNICA
  assert.match(gs05, /clasificacion:\s*'ALERTA TÉCNICA'[\s\S]{0,160}DESCUENTO EXTRA RECHAZADO POR TOPE DE PUESTO/, 'F15 remains normal ALERTA TÉCNICA');

  // F6 (LPPT) and F10 (VisorReportes PDF) elevated to FALLO DE CÓDIGO (critical)
  assert.match(gs06, /clasificacion:\s*'FALLO DE CÓDIGO'[\s\S]{0,180}LECTURA LPPT PROVEEDORES CON INCIDENCIA/, 'F6 LPPT incidence elevated to critical');
  assert.match(gs05, /clasificacion:\s*'FALLO DE CÓDIGO'[\s\S]{0,180}AVISO AL DESCARGAR PDF ORIGINAL S MUEBLERÍA/, 'F10 VisorReportes PDF elevated to critical');

  // N2: handleSegAction_ logs FALLO DE CÓDIGO when saving to COTIZACIONES BASE DE DATOS throws
  assert.match(gs08, /FALLA AL GUARDAR EN SEGUIMIENTO DE COTIZACIONES/, 'N2 critical failure logged when Seguimiento persistence fails');

  // N3: Fotos offline outbox logs normal ALERTA TÉCNICA after >=3 failed retries
  assert.match(fotos05, /COLA SIN CONEXIÓN ATORADA EN SUBIDA DE FOTOS/, 'N3 normal alert logged when offline photo queue stalls');
});

test('Live notifications engine (creata-live-alerts.js): notifies exclusively Kevin on quotes, seguimiento, connect/disconnect transitions (zero initial burst), and critical failures only', async () => {
  const alertSrc = readRepoFile('creata-live-alerts.js');
  const notifications = [];
  const toasts = [];
  const store = new Map();

  function FakeNotification(title, opts) {
    notifications.push({ title, body: opts && opts.body, tag: opts && opts.tag });
  }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = async () => 'granted';

  let histRows = [
    ['TITULO'],
    ['KPI'],
    [],
    ['REGLA'],
    [],
    ['FECHA', 'CLASIFICACIÓN', 'MÓDULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REF', 'DETALLE', 'ANÁLISIS'],
    ['27/11/2026 09:00:00', 'MOVIMIENTO', 'AppsScript', 'COTIZACIÓN CREADA EN S MUEBLERÍA', '✅ OK', 'Ana', 'PLAYA', 'PL-100', 'Cliente Base', 'OK']
  ];
  let presenceUsers = [
    { correo: 'ana@creatamuebles.com', nombre: 'Ana López', sucursal: 'PLAYA', rol: 'ASESOR', vista: 'inventario', online: true, lastSeenMs: 1000 },
    { correo: 'luis@creatamuebles.com', nombre: 'Luis Pérez', sucursal: 'COLOSIO', rol: 'ASESOR', vista: 'inventario', online: false, lastSeenMs: 500 }
  ];
  let presenceGuests = [
    { correo: 'inv@test.com', nombre: 'Invitado Demo', sucursal: 'INVITADOS (SOLO VER)', rol: 'INVITADO', vista: 'inventario', online: false, lastSeenMs: 400 }
  ];

  const sandbox = {
    console,
    setTimeout: (fn) => { return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    Notification: FakeNotification,
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    sessionStorage: {
      getItem: (k) => (store.has('s:' + k) ? store.get('s:' + k) : null),
      setItem: (k, v) => store.set('s:' + k, String(v)),
      removeItem: (k) => store.delete('s:' + k)
    },
    document: {
      visibilityState: 'visible',
      body: {
        appendChild: () => {}
      },
      getElementById: () => null,
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        querySelector: () => null,
        children: []
      }),
      addEventListener: () => {}
    },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes('sheet=HISTORIAL')) {
        const csv = histRows.map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        return { ok: true, text: async () => csv };
      }
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body || '{}');
        if (body.action === 'inv_presence_list') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              serverTimeMs: 2000,
              thresholdMs: 180000,
              users: presenceUsers,
              guests: presenceGuests
            })
          };
        }
      }
      return { ok: false, text: async () => '', json: async () => ({ ok: false }) };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__CREATA_LIVE_ALERTS_TEST_HOOK__ = (toast) => toasts.push(toast);

  vm.createContext(sandbox);
  vm.runInContext(alertSrc, sandbox);

  assert.ok(sandbox.CreataLiveAlerts, 'window.CreataLiveAlerts must be exposed');

  // 1) Non-Kevin advisor session MUST NOT receive notifications
  store.set('creata_inv_advisor_session_v1', JSON.stringify({
    correo: 'ana@creatamuebles.com',
    nombre: 'Ana López',
    authToken: 'tok_ana',
    isAdmin: false
  }));
  await sandbox.CreataLiveAlerts.pollNow();
  assert.equal(notifications.length, 0, 'Non-Kevin user must receive 0 notifications');

  // 2) Kevin in forceAdvisorPreview MUST NOT receive notifications
  store.set('creata_inv_advisor_session_v1', JSON.stringify({
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'Kevin Reyna',
    authToken: 'tok_kevin',
    isAdmin: true,
    forceAdvisorPreview: true
  }));
  await sandbox.CreataLiveAlerts.pollNow();
  assert.equal(notifications.length, 0, 'Kevin in advisor preview must receive 0 notifications');

  // 3) Real Kevin session: first poll seeds baseline silently (0 initial burst!)
  store.set('creata_inv_advisor_session_v1', JSON.stringify({
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'Kevin Reyna',
    authToken: 'tok_kevin',
    isAdmin: true
  }));
  await sandbox.CreataLiveAlerts.pollNow();
  assert.equal(notifications.length, 0, 'First poll must seed baseline with 0 burst notifications');

  // 4) Second poll with:
  //    - New quote (PL-101)
  //    - New seguimiento event (SEG_WHATSAPP on PL-101)
  //    - Normal alert F13 (INTENTO DE ACCESO CON CONTRASEÑA INCORRECTA -> MUST BE IGNORED by live push!)
  //    - Critical failure F10 (AVISO AL DESCARGAR PDF ORIGINAL S MUEBLERÍA -> MUST NOTIFY!)
  //    - Presence transitions: Luis connects (offline -> online), Ana disconnects (online -> offline), Invitado connects (offline -> online)
  histRows = histRows.concat([
    ['27/11/2026 09:05:00', 'MOVIMIENTO', 'AppsScript WCF · InsertarCotizacion', 'COTIZACIÓN CREADA EN S MUEBLERÍA', '✅ OK', 'Luis Pérez', 'COLOSIO', 'DTC-205', 'Cliente Juan · $25,000.00', 'OK'],
    ['27/11/2026 09:06:00', 'MOVIMIENTO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_WHATSAPP', '✅ OK', 'Luis Pérez', 'COLOSIO', 'DTC-205', '{"cliente":"Juan","accion":"WhatsApp enviado"}', 'OK'],
    ['27/11/2026 09:06:30', 'ALERTA TÉCNICA', 'AppsScript · handleInvLogin_', 'INTENTO DE ACCESO CON CONTRASEÑA INCORRECTA', '⚠️ RECHAZADO', 'rocio@creatamuebles.com', 'PLAYA', 'Autenticación', 'Clave incorrecta', 'Normal'],
    ['27/11/2026 09:07:00', 'FALLO DE CÓDIGO', 'AppsScript · VisorReportes S Mueblería', 'AVISO AL DESCARGAR PDF ORIGINAL S MUEBLERÍA', '❌ ERROR', 'Luis Pérez', 'COLOSIO', 'DTC-205', 'VisorReportes sin PDF', 'Crítico']
  ]);
  presenceUsers = [
    { correo: 'ana@creatamuebles.com', nombre: 'Ana López', sucursal: 'PLAYA', rol: 'ASESOR', vista: 'inventario', online: false, lastSeenMs: 1000 },
    { correo: 'luis@creatamuebles.com', nombre: 'Luis Pérez', sucursal: 'COLOSIO', rol: 'ASESOR', vista: 'cotizador', online: true, lastSeenMs: 2500 }
  ];
  presenceGuests = [
    { correo: 'inv@test.com', nombre: 'Invitado Demo', sucursal: 'INVITADOS (SOLO VER)', rol: 'INVITADO', vista: 'inventario', online: true, lastSeenMs: 2500 }
  ];

  await sandbox.CreataLiveAlerts.pollNow();

  const titles = notifications.map((n) => n.title);
  assert.ok(titles.some((t) => /Cotizaci[óo]n\s+DTC-205/i.test(t)), 'Must notify on new quote DTC-205');
  assert.ok(titles.some((t) => /Seguimiento.*DTC-205/i.test(t)), 'Must notify on seguimiento event for DTC-205');
  assert.ok(titles.some((t) => /Falla.*PDF ORIGINAL/i.test(t)), 'Must notify on critical F10 failure');
  assert.ok(!titles.some((t) => /CONTRASEÑA INCORRECTA/i.test(t)), 'Must NOT notify on normal F13 alert');
  assert.ok(titles.some((t) => /Conectado.*Luis P[ée]rez/i.test(t)), 'Must notify when Luis connects');
  assert.ok(titles.some((t) => /Desconectado.*Ana L[óo]pez/i.test(t)), 'Must notify when Ana disconnects');
  assert.ok(titles.some((t) => /Conectado.*Invitado Demo/i.test(t)), 'Must notify when Guest connects');
});
