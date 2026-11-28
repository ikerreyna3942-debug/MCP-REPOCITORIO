import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const HIST_JS_PATH = path.join(REPO_ROOT, 'historial-app.js');

function rowsToCsv(rows) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
}

function createHistorialHarness({ histSheetRows, quotesSheetRows }) {
  const histCode = fs.readFileSync(HIST_JS_PATH, 'utf8');
  const byId = new Map();

  function parseIdsIntoMap(html) {
    const tagRe = /<([a-zA-Z0-9]+)([^>]*?\bid="([^"]+)"[^>]*)>/g;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
      const [, tag, attrStr, id] = m;
      let el = byId.get(id);
      if (!el) {
        el = makeEl(tag, id);
        byId.set(id, el);
      }
      if (/\bcm-hidden\b/.test(attrStr)) el.classList.add('cm-hidden');
      else el.classList.remove('cm-hidden');
      const actM = attrStr.match(/\bdata-hist-action="([^"]*)"/);
      if (actM) el.setAttribute('data-hist-action', actM[1]);
    }
  }

  function makeEl(tag, id = '') {
    let _html = '';
    let _text = '';
    const classes = new Set();
    const attrs = new Map();
    const elListeners = new Map();
    const el = {
      id,
      tagName: String(tag || 'DIV').toUpperCase(),
      value: '',
      disabled: false,
      style: {},
      dataset: {},
      options: [],
      get innerHTML() {
        return _html;
      },
      set innerHTML(v) {
        _html = String(v || '');
        parseIdsIntoMap(_html);
        if (el.tagName === 'SELECT') {
          const opts = [];
          const optRe = /<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
          let om;
          while ((om = optRe.exec(_html)) !== null) {
            opts.push({ value: om[1], textContent: om[2] });
          }
          el.options = opts;
        }
      },
      get textContent() {
        return _text;
      },
      set textContent(v) {
        _text = String(v ?? '');
      },
      classList: {
        add(...cs) {
          cs.forEach((c) => classes.add(c));
        },
        remove(...cs) {
          cs.forEach((c) => classes.delete(c));
        },
        toggle(c, force) {
          if (force === undefined) {
            if (classes.has(c)) {
              classes.delete(c);
              return false;
            }
            classes.add(c);
            return true;
          }
          if (force) classes.add(c);
          else classes.delete(c);
          return !!force;
        },
        contains(c) {
          return classes.has(c);
        }
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      addEventListener(ev, fn) {
        if (!elListeners.has(ev)) elListeners.set(ev, []);
        elListeners.get(ev).push(fn);
      },
      removeEventListener() {},
      dispatchClick(targetEl) {
        for (const fn of elListeners.get('click') || []) {
          fn({ target: targetEl });
        }
      },
      querySelector(sel) {
        if (sel && sel.startsWith('#')) return byId.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };
    return el;
  }

  const rootEl = makeEl('DIV', 'inAppHistorialRoot');
  const storage = new Map();
  const session = {
    correo: 'kevin.reyna@grupoanipa.com',
    nombre: 'IRVIN KEVIN REYNA VALDEZ',
    puesto: 'Administrador General',
    isAdmin: true,
    sheetTab: 'CUENTAS ADMINISTRATIVAS',
    authToken: 'tok_kevin_hist_filter'
  };
  storage.set('creata_inv_advisor_session_v1', JSON.stringify(session));

  let capturedCsvContent = '';
  const win = {
    document: {
      visibilityState: 'visible',
      head: { appendChild() {}, removeChild() {} },
      body: { appendChild() {}, removeChild() {} },
      createElement(tag) {
        const el = makeEl(tag);
        el.click = () => {};
        return el;
      },
      addEventListener() {},
      removeEventListener() {},
      execCommand() {
        return true;
      }
    },
    navigator: { userAgent: 'Mozilla/5.0' },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { href: '' },
    fetch: async (url, opts) => {
      if (opts && opts.method === 'POST') {
        return { ok: true, json: async () => ({ ok: true, users: [], guests: [], sheets: {} }) };
      }
      const u = String(url || '');
      if (u.includes('sheet=HISTORIAL')) {
        return { ok: true, text: async () => rowsToCsv(histSheetRows) };
      }
      if (u.includes('sheet=COTIZACIONES_EN_VIVO')) {
        return { ok: true, text: async () => rowsToCsv(quotesSheetRows) };
      }
      return { ok: false, text: async () => '' };
    },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => {
      const t = setTimeout(fn, 0);
      if (t && t.unref) t.unref();
      return t;
    },
    setTimeout: (fn, ms) => {
      const t = setTimeout(fn, ms);
      if (t && t.unref) t.unref();
      return t;
    },
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    URL: { createObjectURL: () => 'blob:csv', revokeObjectURL: () => {} },
    Blob: class FakeBlob {
      constructor(parts) {
        capturedCsvContent = (parts || []).join('');
      }
    },
    AbortController,
    console
  };
  win.window = win;
  win.globalThis = win;

  vm.runInNewContext(histCode, win, { filename: 'historial-app.js' });
  win.CreataHistorialModule.mount(rootEl, { session });

  return {
    win,
    rootEl,
    byId,
    getCapturedCsv: () => capturedCsvContent
  };
}

test('Historial app keeps all buttons + failures/alerts, while filtering operational MOVIMIENTO rows strictly to Cotización and Seguimiento de cotizaciones', async () => {
  const quotesRows = [
    [
      'ORDEN_SUCURSAL', 'FOLIO_SMUEBLERIA', 'ID_COTIZACION_ERP', 'FECHA_HORA', 'MODALIDAD_ORIGEN',
      'HOJA_UBICACION', 'TIENDA_ERP', 'CORREO_ASESOR', 'NOMBRE_ASESOR', 'USUARIO_ERP',
      'ID_USUARIO_ERP', 'CLIENTE_PROYECTO', 'TELEFONO', 'MODALIDAD_CLIENTE', 'CATEGORIA_ERP',
      'ENTREGA_TENTATIVA', 'PARTIDAS_CANT', 'RESUMEN_SKUS', 'SUBTOTAL_SIN_IVA', 'IVA',
      'DESCUENTO_EXTRA', 'TOTAL_CON_IVA', 'ESTADO_ERP', 'NOTAS'
    ],
    [
      'ORD-1', 'PLY-501', '9501', '28/11/2026 09:00', 'SUCURSAL',
      'PLAYA', 'CREATA LIVING PLAYA', 'juliocruz@creatamuebles.com', 'JULIO CRUZ', 'JULIO',
      '39822', 'Cliente Playa', '9841112233', 'CONTADO', 'INTERIOR',
      '', '1', 'SALA-ARIA x1', '20000', '3200', '0', '23200', 'Registrada', ''
    ]
  ];

  const histRows = [
    ['TÍTULO BITÁCORA'],
    [],
    [],
    [],
    [],
    ['FECHA Y HORA', 'CLASIFICACIÓN', 'MÓDULO / ARCHIVO', 'EVENTO / MOVIMIENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANÁLISIS'],
    // --- SHOULD BE KEPT (Cotización + Seguimiento movements) ---
    ['28/11/2026 09:01:00', 'MOVIMIENTO', 'AppsScript WCF · InsertarCotizacion', 'COTIZACIÓN CREADA EN S MUEBLERÍA', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-501', 'Cotización creada por $23,200.00', 'OK'],
    ['28/11/2026 09:02:00', 'MOVIMIENTO', 'AppsScript + servicio_en_vivo.py', 'COTIZACIÓN CREADA VÍA COLA DE RESPALDO', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-502', 'Cola respaldo', 'OK'],
    ['28/11/2026 09:03:00', 'MOVIMIENTO', 'AppsScript · plantilla', 'COTIZACIÓN GUARDADA EN REVISIÓN', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-503', 'Guardada en revisión', 'OK'],
    ['28/11/2026 09:04:00', 'MOVIMIENTO', 'AppsScript · VisorReportes S Mueblería', 'DESCARGA DE PDF ORIGINAL S MUEBLERÍA', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-501', 'PDF descargado', 'OK'],
    ['28/11/2026 09:05:00', 'MOVIMIENTO', 'AppsScript WCF · InsertarCliente', 'ALTA DE CLIENTE EN S MUEBLERÍA', '✅ OK', 'Julio Cruz', 'PLAYA', 'Cliente ID 88', 'Alta cliente cotizador', 'OK'],
    ['28/11/2026 09:06:00', 'MOVIMIENTO', 'AppsScript WCF · InsertarLead', 'ALTA DE PROSPECTO (LEAD) EN S MUEBLERÍA', '✅ OK', 'Julio Cruz', 'PLAYA', 'Lead ID 89', 'Alta prospecto cotizador', 'OK'],
    ['28/11/2026 09:07:00', 'MOVIMIENTO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_WHATSAPP', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-501', '{"folio":"PLY-501","phone":"9841112233"}', 'OK'],
    ['28/11/2026 09:08:00', 'MOVIMIENTO', 'SEGUIMIENTO_COTIZACIONES', 'SEG_CIERRE', '✅ OK', 'Julio Cruz', 'PLAYA', 'PLY-501', '{"folio":"PLY-501","estatus":"GANADA"}', 'OK'],
    // --- SHOULD BE KEPT (Existing classified failures & alerts) ---
    ['28/11/2026 09:09:00', 'FALLO DE CÓDIGO', 'AppsScript · sincronizarInventarioEnVivoDesdeERP', 'ERP S MUEBLERÍA SIN CONEXIÓN EN SINCRONIZACIÓN', '❌ ERROR', 'Sistema', 'GENERAL', 'ERP', 'Timeout WCF', 'Token/red'],
    ['28/11/2026 09:10:00', 'ALERTA TÉCNICA', 'AppsScript · handleInvSubmitQuote_', 'DESCUENTO EXTRA RECHAZADO POR TOPE DE PUESTO', '⚠️ ALERTA', 'Julio Cruz', 'PLAYA', 'PLY-501', 'Intentó 40%', 'Regla 24%'],
    // --- SHOULD BE EXCLUDED FROM BITÁCORA (Other system/app operational movements) ---
    ['28/11/2026 09:11:00', 'MOVIMIENTO', 'AppsScript · Drive FOTOS NUEVAS CARGADO', 'ARCHIVO DE FOTO GUARDADO EN DRIVE PARA DESCARGA', '✅ OK', 'Kevin (kevin.reyna@grupoanipa.com)', 'ADMIN', 'SKU-FOTO-1 · SILLA DEMO', 'Descarga: https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view', 'OK'],
    ['28/11/2026 09:12:00', 'MOVIMIENTO', 'AppsScript · Gestor Fotos Hoja "1"', 'FOTO ARCHIVADA EN FOTOS ARCHIVADAS', '✅ OK', 'Kevin', 'FOTOS', 'SKU-FOTO-1', 'Movida a FOTOS ARCHIVADAS', 'OK'],
    ['28/11/2026 09:13:00', 'MOVIMIENTO', 'AppsScript · Gestor Fotos Hoja "1"', 'FOTO REGRESADA A ARCHIVO ORIGEN (SUBIR PREN)', '✅ OK', 'Kevin', 'FOTOS', 'SKU-FOTO-2', 'Regresada a SUBIR PREN', 'OK'],
    ['28/11/2026 09:14:00', 'MOVIMIENTO', 'AppsScript · handleInvLogin_', 'INICIO DE SESIÓN EN INVENTARIO', '✅ OK', 'Julio Cruz', 'PLAYA', 'LOGIN', 'Sesión iniciada', 'OK'],
    ['28/11/2026 09:15:00', 'MOVIMIENTO', 'AppsScript · handleInvUpdateKey_', 'ACTUALIZACIÓN DE CONTRASEÑA PERSONAL', '✅ OK', 'Julio Cruz', 'PLAYA', 'KEY', 'Clave actualizada', 'OK'],
    ['28/11/2026 09:16:00', 'MOVIMIENTO', 'AppsScript · sincronizarInventarioEnVivoDesdeERP', 'ALTA AUTOMÁTICA DE NUEVOS SKUS EN INVENTARIO Y HOJA "1"', '✅ OK', 'Sincronizador Automático', 'INVENTARIO_EN_VIVO', '+3 inv', 'Sincronización automática', 'OK'],
    ['28/11/2026 09:17:00', 'MOVIMIENTO', 'AppsScript · INVITADOS (Sesiones)', 'CIERRE REMOTO DE SESIONES (INVITADO)', '✅ OK', 'Kevin', 'ADMIN', 'INV-1', 'Revocado', 'OK'],
    ['28/11/2026 09:18:00', 'MOVIMIENTO', 'Configuración · Productos Cotizador', 'PRODUCTO EDITADO (ACTIVO)', '✅ OK', 'Kevin', 'ADMIN', 'SKU-99', 'Precio editado', 'OK'],
    ['28/11/2026 09:19:00', 'MOVIMIENTO', 'Demanda sin stock', 'SOLICITUD SIN STOCK', '✅ OK', 'Julio Cruz', 'PLAYA', 'SKU-00', 'Cliente busca 2 pzas', 'OK'],
    ['28/11/2026 09:20:00', 'MOVIMIENTO', 'Sugerencias de compra', 'SUGERENCIA DE COMPRA', '✅ OK', 'Rocío Esquivel', 'PLAYA', 'SUG-1', 'Sala exterior', 'OK'],
    ['28/11/2026 09:21:00', 'MOVIMIENTO', 'Historial / Análisis Ventas', 'CORTE Y RESGUARDO EJECUTIVO KEVIN', '✅ OK', 'Kevin', 'GLOBAL', 'CORTE-1', 'Corte guardado', 'OK']
  ];

  const h = createHistorialHarness({ histSheetRows: histRows, quotesSheetRows: quotesRows });
  await new Promise((r) => setTimeout(r, 40));

  // 1) All buttons and tabs remain intact
  for (const btnId of [
    'hist_tabBtn_overview',
    'hist_tabBtn_quotes',
    'hist_tabBtn_seguimiento',
    'hist_tabBtn_historial',
    'hist_tabBtn_photos',
    'hist_btnKevinArchiveAnalyze',
    'hist_btnLiveAlerts',
    'hist_btnRefreshLive'
  ]) {
    assert.ok(h.byId.get(btnId), `Button #${btnId} must remain rendered`);
  }

  // 2) Photos tab still extracts Drive photos from raw HISTORIAL rows before commercial movement filtering
  assert.equal(h.byId.get('hist_tabCountPhotos').textContent, '1', 'Photos tab must still receive Drive photo entries');

  // 3) Bitácora count & rendered HTML must ONLY contain the 8 Cotización/Seguimiento movements + 2 Fallo/Alerta = 10 entries
  assert.equal(h.byId.get('hist_tabCountHistorial').textContent, '10', 'Bitácora must keep only 8 commercial movements + 2 failures/alerts');

  const auditHtml = h.byId.get('hist_historialEntriesContainer').innerHTML;
  // Kept entries
  assert.match(auditHtml, /COTIZACIÓN CREADA EN S MUEBLERÍA/);
  assert.match(auditHtml, /COTIZACIÓN CREADA VÍA COLA DE RESPALDO/);
  assert.match(auditHtml, /COTIZACIÓN GUARDADA EN REVISIÓN/);
  assert.match(auditHtml, /DESCARGA DE PDF ORIGINAL S MUEBLERÍA/);
  assert.match(auditHtml, /ALTA DE CLIENTE EN S MUEBLERÍA/);
  assert.match(auditHtml, /ALTA DE PROSPECTO \(LEAD\) EN S MUEBLERÍA/);
  assert.match(auditHtml, /SEG_WHATSAPP/);
  assert.match(auditHtml, /SEG_CIERRE/);
  assert.match(auditHtml, /ERP S MUEBLERÍA SIN CONEXIÓN EN SINCRONIZACIÓN/);
  assert.match(auditHtml, /DESCUENTO EXTRA RECHAZADO POR TOPE DE PUESTO/);

  // Excluded non-quote/non-seguimiento movements
  assert.doesNotMatch(auditHtml, /ARCHIVO DE FOTO GUARDADO EN DRIVE/);
  assert.doesNotMatch(auditHtml, /FOTO ARCHIVADA EN FOTOS ARCHIVADAS/);
  assert.doesNotMatch(auditHtml, /FOTO REGRESADA A ARCHIVO ORIGEN/);
  assert.doesNotMatch(auditHtml, /INICIO DE SESIÓN EN INVENTARIO/);
  assert.doesNotMatch(auditHtml, /ACTUALIZACIÓN DE CONTRASEÑA PERSONAL/);
  assert.doesNotMatch(auditHtml, /ALTA AUTOMÁTICA DE NUEVOS SKUS/);
  assert.doesNotMatch(auditHtml, /CIERRE REMOTO DE SESIONES/);
  assert.doesNotMatch(auditHtml, /PRODUCTO EDITADO/);
  assert.doesNotMatch(auditHtml, /SOLICITUD SIN STOCK/);
  assert.doesNotMatch(auditHtml, /SUGERENCIA DE COMPRA/);
  assert.doesNotMatch(auditHtml, /CORTE Y RESGUARDO EJECUTIVO KEVIN/);

  // 4) Exporting Bitácora CSV also reflects only the filtered entries
  const tabHistBtn = h.byId.get('hist_tabBtn_historial');
  tabHistBtn.setAttribute('data-hist-tab', 'historial');
  tabHistBtn.closest = (sel) => (sel === '[data-hist-tab]' ? tabHistBtn : null);
  h.rootEl.dispatchClick(tabHistBtn);

  const csvBtn = { getAttribute: (k) => (k === 'data-hist-action' ? 'export-csv' : null) };
  csvBtn.closest = (sel) => (sel === '[data-hist-action]' ? csvBtn : null);
  h.rootEl.dispatchClick(csvBtn);

  const csv = h.getCapturedCsv();
  assert.match(csv, /COTIZACIÓN CREADA EN S MUEBLERÍA/);
  assert.match(csv, /SEG_WHATSAPP/);
  assert.match(csv, /ERP S MUEBLERÍA SIN CONEXIÓN EN SINCRONIZACIÓN/);
  assert.doesNotMatch(csv, /INICIO DE SESIÓN EN INVENTARIO/);
  assert.doesNotMatch(csv, /FOTO ARCHIVADA EN FOTOS ARCHIVADAS/);
});
