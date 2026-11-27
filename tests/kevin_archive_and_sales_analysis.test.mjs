import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PROJ_A_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
const HIST_JS = fs.readFileSync(path.join(REPO_ROOT, 'historial-app.js'), 'utf8');
const SHEET_CONTROL = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
const SHEET_COT_DB = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

const HEADERS_27 = [
  'ID_Partida', 'Folio_ERP', 'Fecha_Cotizacion', 'Sucursal', 'Asesor',
  'Correo_Asesor', 'Tel_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Clave_Producto',
  'Nombre_Producto', 'Modelo', 'Precio_Unitario', 'Cantidad_Cotizada', 'Stock_Inicial_Total',
  'Stock_Actual_CEDIS_Bodega', 'Stock_Actual_CEDIS_Piso', 'Stock_Actual_Tienda_Bodega', 'Stock_Actual_Tienda_Piso', 'Stock_Actual_Total',
  'Variacion_Piezas', 'Porcentaje_Caida', 'Nivel_Urgencia', 'Motivo_Urgencia', 'Estatus_ERP',
  'Fecha_Ultimo_Aviso', 'ORIGEN_CREACION'
];

function makeRow27(overrides = {}) {
  const map = Object.assign({
    ID_Partida: 'PLY-001_SKU1',
    Folio_ERP: 'PLY-001',
    Fecha_Cotizacion: '2026-11-24',
    Sucursal: 'PLAYA',
    Asesor: 'Julio de la Cruz Ramon',
    Correo_Asesor: 'juliocruz@creatamuebles.com',
    Tel_Asesor: '9841000001',
    Cliente: 'Cliente Demo',
    WhatsApp_Cliente: '9842000002',
    Clave_Producto: 'ARIA-BI',
    Nombre_Producto: 'SALA ARIA MODULO BI',
    Modelo: 'ARIA',
    Precio_Unitario: '18000.00',
    Cantidad_Cotizada: '2',
    Stock_Inicial_Total: '5',
    Stock_Actual_CEDIS_Bodega: '2',
    Stock_Actual_CEDIS_Piso: '1',
    Stock_Actual_Tienda_Bodega: '1',
    Stock_Actual_Tienda_Piso: '0',
    Stock_Actual_Total: '4',
    Variacion_Piezas: '-1',
    Porcentaje_Caida: '20%',
    Nivel_Urgencia: 'ESTABLE',
    Motivo_Urgencia: 'Stock disponible',
    Estatus_ERP: 'Cotizado',
    Fecha_Ultimo_Aviso: '',
    ORIGEN_CREACION: 'APP_COTIZACION'
  }, overrides);
  return HEADERS_27.map((h) => map[h] ?? '');
}

test('GAS Backend: hist_archive_and_analyze_kevin is strictly exclusive to kevin.reyna@grupoanipa.com, moves closed/lost/cancelled to COTIZACIONES_ARCHIVADAS, keeps open active, backs up ALL states + quotes + stockouts + suggestions, and diagnoses why sales are not closing', () => {
  const env = createMockGasEnvironment({
    activeSpreadsheetId: SHEET_CONTROL,
    scriptProperties: {
      INV_AUTH_SECRET: 'TEST_SECRET_KEVIN_ARCH_777'
    }
  });

  const quotesLiveHeaders = [
    'ORDEN_SUCURSAL', 'FOLIO_SMUEBLERIA', 'ID_COTIZACION_ERP', 'FECHA_HORA', 'MODALIDAD_ORIGEN',
    'HOJA_UBICACION', 'TIENDA_ERP', 'CORREO_ASESOR', 'NOMBRE_ASESOR', 'USUARIO_ERP',
    'ID_USUARIO_ERP', 'CLIENTE_PROYECTO', 'TELEFONO', 'MODALIDAD_CLIENTE', 'CATEGORIA_ERP',
    'ENTREGA_TENTATIVA', 'PARTIDAS_CANT', 'RESUMEN_SKUS', 'SUBTOTAL_SIN_IVA', 'IVA',
    'DESCUENTO_EXTRA', 'TOTAL_CON_IVA', 'ESTADO_ERP', 'NOTAS', 'ORIGEN_CREACION'
  ];

  env.makeSpreadsheet(SHEET_CONTROL, 'Control de Productos', {
    HISTORIAL: [
      ['TÍTULO BITÁCORA'], [], [], [], [],
      ['FECHA', 'CLASIFICACIÓN', 'MÓDULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANÁLISIS']
    ],
    COTIZACIONES_EN_VIVO: [
      quotesLiveHeaders,
      // 1) Open WITHOUT follow-up ($45,000) -> Fuga por falta de seguimiento
      ['ORD-1', 'PLY-101', '9001', '25/11/2026 10:00', 'SUCURSAL', 'PLAYA', 'CREATA LIVING PLAYA', 'juliocruz@creatamuebles.com', 'JULIO DE LA CRUZ RAMON', 'JULIO', '39822', 'Hotel Riviera', '9841112233', 'CONTADO', 'INTERIOR', '', '2', 'ARIA-BI x2', '38793.10', '6206.90', '0', '45000.00', 'Registrada', '', 'APP'],
      // 2) Lost due to out-of-stock ($32,000)
      ['ORD-2', 'PLY-102', '9002', '24/11/2026 14:00', 'SUCURSAL', 'PLAYA', 'CREATA LIVING PLAYA', 'juliocruz@creatamuebles.com', 'JULIO DE LA CRUZ RAMON', 'JULIO', '39822', 'Carlos Gómez', '9842223344', 'CONTADO', 'INTERIOR', '', '1', 'MESA-ROMA x1', '27586.21', '4413.79', '0', '32000.00', 'Registrada', '', 'APP'],
      // 3) Won in ERP ($60,000)
      ['ORD-3', 'CCB-201', '9003', '23/11/2026 16:00', 'SUCURSAL', 'CASA CREATA', 'CASA CREATA BONAMPAK', 'pablo.gonzalez@creatamuebles.com', 'JUAN PABLO GONZALEZ SALAS', 'PABLO', '40613', 'María López', '9983334455', 'CONTADO', 'INTERIOR', '', '3', 'SALA-NILO x3', '51724.14', '8275.86', '0', '60000.00', 'Vendido', '', 'APP'],
      // 4) Cancelled ($18,000)
      ['ORD-4', 'CCB-202', '9004', '23/11/2026 18:00', 'SUCURSAL', 'CASA CREATA', 'CASA CREATA BONAMPAK', 'pablo.gonzalez@creatamuebles.com', 'JUAN PABLO GONZALEZ SALAS', 'PABLO', '40613', 'Pedro Ruiz', '9984445566', 'CONTADO', 'INTERIOR', '', '1', 'SILLA-ANK x4', '15517.24', '2482.76', '0', '18000.00', 'Registrada', '', 'APP']
    ],
    DEMANDA_SIN_STOCK: [
      ['CREATA · REGISTRO DE DEMANDA Y PIEZAS SOLICITADAS SIN STOCK'],
      ['FECHA_HORA', 'ID_SOLICITUD', 'SKU', 'NOMBRE_MODELO', 'CATEGORIA', 'COLOR_TELA_TAMANO', 'PIEZAS_SOLICITADAS', 'COMENTARIOS', 'STOCK_SISTEMA_ACTUAL', 'TIENDA_SUCURSAL', 'ASESOR', 'CORREO_ASESOR', 'ESTATUS'],
      ['25/11/2026 11:00', 'DEM-20261125-1001', 'MESA-ROMA', 'MESA DE COMEDOR ROMA', 'COMEDORES', 'NOGAL', 2, 'Cliente la quería para entrega inmediata', '0 pzas', 'CREATA LIVING PLAYA', 'JULIO DE LA CRUZ RAMON', 'juliocruz@creatamuebles.com', 'PENDIENTE']
    ],
    SUGERENCIAS_DE_COMPRA: [
      ['CREATA · SUGERENCIAS DE COMPRA DE PRODUCTOS'],
      ['FECHA_HORA', 'ID_SUGERENCIA', 'INTERIOR_EXTERIOR', 'TIPO_DE_PRODUCTO', 'COMENTARIOS', 'ASESOR_USUARIO', 'PUESTO_ROL', 'TIENDA_SUCURSAL', 'ESTATUS'],
      ['25/11/2026 12:30', 'SUG-20261125-2001', 'EXTERIOR', 'SALA DE CUERDA NÁUTICA', 'Tres clientes pidieron sala exterior tejida resistente a brisa marina', 'ROCIO ESQUIVEL', 'Gerente de Tienda', 'CREATA LIVING PLAYA', 'PENDIENTE']
    ],
    'CUENTAS ADMINISTRATIVAS': [
      ['', 'ADMINISTRACIÓN', 'Nombre', 'Puesto', 'Correo', 'Contraseña Temporal', 'Contraseña', 'Usuario / ID Asesor', 'Descuento', '', '', '', '', '', '', '', '', '', '', '', '', 'PLAYA', 'COLOSIO', 'PTC', 'CASA CREATA', 'PROYECTOS'],
      ['', 'TODAS LAS TIENDAS / CEDIS', 'IRVIN KEVIN REYNA VALDEZ', 'Administrador General', 'kevin.reyna@grupoanipa.com', '', 'KevinPass#1', 'IRVIN KEVIN REYNA VALDEZ | CEDIS [ID: 38954]', '100%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'TODAS LAS TIENDAS / CEDIS', 'SANTIAGO TORRES', 'Administrador General', 'santiago.torres@grupoanipa.com', '', 'SantiPass#1', 'SANTIAGO TORRES | ADMINISTRACION [ID: 24599]', '100%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'SUC. PLAYA', 'ROCIO ESQUIVEL', 'Gerente de Tienda', 'rocio.esquivel@creatamuebles.com', '', 'RocioPass#1', 'ROCIO ESQUIVEL | CREATA LIVING PLAYA [ID: 14472]', '100%', '', '', '', '', '', '', '', '', '', '', '', '', 'SI', '', '', '', ''],
      ['', 'SUC. PLAYA', 'JULIO DE LA CRUZ RAMON', 'Asesor Interiorista', 'juliocruz@creatamuebles.com', '', 'JulioPass#1', 'JULIO DE LA CRUZ RAMON | CREATA LIVING PLAYA [ID: 39822]', '24%', '', '', '', '', '', '', '', '', '', '', '', '', 'SI', '', '', '', ''],
      ['', 'SUC. CASA CREATA', 'GUADALUPE SANCHEZ', 'Gerente de Tienda', 'lupita.sanchez@creatamuebles.com', '', 'LupitaPass#1', 'GUADALUPE SANCHEZ | CASA CREATA BONAMPAK [ID: 14478]', '100%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'SI', ''],
      ['', 'SUC. CASA CREATA', 'JUAN PABLO GONZALEZ SALAS', 'Asesor Interiorista', 'pablo.gonzalez@creatamuebles.com', '', 'PabloPass#1', 'JUAN PABLO GONZALEZ SALAS | CASA CREATA BONAMPAK [ID: 40613]', '24%', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'SI', '']
    ]
  });

  env.makeSpreadsheet(SHEET_COT_DB, 'COTIZACIONES BASE DE DATOS', {
    COTIZACIONES_CREATA: [
      HEADERS_27.slice(),
      // Open uncontacted -> MUST STAY ACTIVE in COTIZACIONES_CREATA
      makeRow27({
        ID_Partida: 'PLY-101_ARIA-BI',
        Folio_ERP: 'PLY-101',
        Sucursal: 'PLAYA',
        Asesor: 'JULIO DE LA CRUZ RAMON',
        Correo_Asesor: 'juliocruz@creatamuebles.com',
        Precio_Unitario: '22500.00',
        Cantidad_Cotizada: '2',
        Estatus_ERP: 'Cotizado',
        Fecha_Ultimo_Aviso: ''
      }),
      // Lost in CIERRES_COTIZACIONES -> MUST MOVE to COTIZACIONES_ARCHIVADAS
      makeRow27({
        ID_Partida: 'PLY-102_MESA-ROMA',
        Folio_ERP: 'PLY-102',
        Sucursal: 'PLAYA',
        Asesor: 'JULIO DE LA CRUZ RAMON',
        Correo_Asesor: 'juliocruz@creatamuebles.com',
        Clave_Producto: 'MESA-ROMA',
        Nombre_Producto: 'MESA DE COMEDOR ROMA',
        Precio_Unitario: '32000.00',
        Cantidad_Cotizada: '1',
        Estatus_ERP: 'Cotizado'
      }),
      // Won in ERP -> MUST MOVE to COTIZACIONES_ARCHIVADAS
      makeRow27({
        ID_Partida: 'CCB-201_SALA-NILO',
        Folio_ERP: 'CCB-201',
        Sucursal: 'CASA CREATA',
        Asesor: 'JUAN PABLO GONZALEZ SALAS',
        Correo_Asesor: 'pablo.gonzalez@creatamuebles.com',
        Clave_Producto: 'SALA-NILO',
        Nombre_Producto: 'SALA NILO',
        Precio_Unitario: '20000.00',
        Cantidad_Cotizada: '3',
        Estatus_ERP: 'Vendido'
      }),
      // Cancelled in CIERRES_COTIZACIONES -> MUST MOVE to COTIZACIONES_ARCHIVADAS
      makeRow27({
        ID_Partida: 'CCB-202_SILLA-ANK',
        Folio_ERP: 'CCB-202',
        Sucursal: 'CASA CREATA',
        Asesor: 'JUAN PABLO GONZALEZ SALAS',
        Correo_Asesor: 'pablo.gonzalez@creatamuebles.com',
        Clave_Producto: 'SILLA-ANK',
        Nombre_Producto: 'SILLA ANKARA',
        Precio_Unitario: '18000.00',
        Cantidad_Cotizada: '1',
        Estatus_ERP: 'Cotizado'
      })
    ],
    CIERRES_COTIZACIONES: [
      ['Fecha_Hora', 'Folio_ERP', 'Sucursal', 'Asesor', 'Correo_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Estatus_Cierre', 'Motivo_Cierre', 'Comentarios', 'Total_Prod', 'Piezas'],
      ['25/11/2026 15:00', 'PLY-102', 'PLAYA', 'JULIO DE LA CRUZ RAMON', 'juliocruz@creatamuebles.com', 'Carlos Gómez', '9842223344', 'PERDIDA', 'Falta de Inventario / Producto Agotado', 'No había Mesa Roma en bodega', '1', 'MESA-ROMA x1'],
      ['24/11/2026 19:00', 'CCB-202', 'CASA CREATA', 'JUAN PABLO GONZALEZ SALAS', 'pablo.gonzalez@creatamuebles.com', 'Pedro Ruiz', '9984445566', 'CANCELADA', 'Precio / Fuera de Presupuesto', 'Cliente buscaba menor precio', '1', 'SILLA-ANK x1']
    ],
    HISTORIAL_MOVIMIENTOS: [
      ['Fecha_Hora', 'Tipo', 'Usuario', 'Correo', 'Sucursal', 'Accion', 'Detalle'],
      ['25/11/2026 15:00', 'CIERRE', 'JULIO DE LA CRUZ RAMON', 'juliocruz@creatamuebles.com', 'PLAYA', 'Cierre Folio PLY-102', 'PERDIDA'],
      ['25/11/2026 11:00', 'WHATSAPP', 'JULIO DE LA CRUZ RAMON', 'juliocruz@creatamuebles.com', 'PLAYA', 'WhatsApp Folio PLY-999', 'Seguimiento abierto']
    ]
  });

  env.loadScript(PROJ_A_GS);
  const ctx = env.context;

  const loginAs = (email, accessKey) => {
    const raw = ctx.doPost({
      postData: { contents: JSON.stringify({ action: 'inv_login', email, accessKey }) }
    }).getContent();
    const parsed = JSON.parse(raw);
    assert.equal(parsed.ok, true, `Login failed for ${email}: ${raw}`);
    return parsed.authToken || parsed.user.authToken;
  };

  const santiToken = loginAs('santiago.torres@grupoanipa.com', 'SantiPass#1');
  const rocioToken = loginAs('rocio.esquivel@creatamuebles.com', 'RocioPass#1');
  const julioToken = loginAs('juliocruz@creatamuebles.com', 'JulioPass#1');
  const kevinToken = loginAs('kevin.reyna@grupoanipa.com', 'KevinPass#1');

  // 1) STRICT EXCLUSIVITY: Advisors, Managers, and even OTHER Admins MUST be forbidden!
  for (const [who, tok, email] of [
    ['Advisor', julioToken, 'juliocruz@creatamuebles.com'],
    ['Manager', rocioToken, 'rocio.esquivel@creatamuebles.com'],
    ['Other Admin', santiToken, 'santiago.torres@grupoanipa.com']
  ]) {
    const resDenied = JSON.parse(ctx.doPost({
      postData: { contents: JSON.stringify({ action: 'hist_archive_and_analyze_kevin', authToken: tok, advisorEmail: email }) }
    }).getContent());
    assert.equal(resDenied.ok, false, `${who} must NOT be allowed to run Kevin archive/analysis`);
    assert.equal(resDenied.forbidden, true, `${who} must receive forbidden=true`);
  }

  // Advisor preview mode must also be rejected
  const resPreviewDenied = JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'hist_archive_and_analyze_kevin', authToken: kevinToken, advisorEmail: 'kevin.reyna@grupoanipa.com', forceAdvisorPreview: true }) }
  }).getContent());
  assert.equal(resPreviewDenied.ok, false);
  assert.equal(resPreviewDenied.forbidden, true);

  // 2) KEVIN EXECUTION: Archives closed/lost/cancelled, keeps open active, writes backup tabs, and builds full analysis
  const res = JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'hist_archive_and_analyze_kevin', authToken: kevinToken, advisorEmail: 'kevin.reyna@grupoanipa.com' }) }
  }).getContent());

  assert.equal(res.ok, true, `Expected Kevin archive & analysis to succeed, got: ${JSON.stringify(res)}`);
  assert.match(res.cutId, /^CORTE-\d{8}-\d{6}$/);

  // Verify Seguimiento active vs archived sheets
  const ssSeg = ctx.SpreadsheetApp.openById(SHEET_COT_DB);
  const shCotActive = ssSeg.getSheetByName('COTIZACIONES_CREATA');
  const shCotArch = ssSeg.getSheetByName('COTIZACIONES_ARCHIVADAS');
  const shSegBackup = ssSeg.getSheetByName('RESGUARDO_SEGUIMIENTO');
  const shHistArch = ssSeg.getSheetByName('HISTORIAL_SEG_ARCHIVO');
  const shHistMov = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');

  assert.equal(shCotActive.getLastRow(), 2, 'Only the 1 open quote (PLY-101) + header must remain in COTIZACIONES_CREATA');
  assert.equal(String(shCotActive.getRange(2, 2, 1, 1).getValues()[0][0]), 'PLY-101', 'Open quote PLY-101 must stay active for advisor follow-up');
  assert.equal(shCotArch.getLastRow(), 4, '3 closed/lost/cancelled rows (PLY-102, CCB-201, CCB-202) + header must be in COTIZACIONES_ARCHIVADAS');
  assert.equal(shSegBackup.getLastRow(), 5, 'ALL 4 partidas across all states + header must be backed up in RESGUARDO_SEGUIMIENTO');
  assert.equal(shHistMov.getLastRow(), 2, 'Closed folio movement event must be cleaned from HISTORIAL_MOVIMIENTOS while open PLY-999 event stays');
  assert.equal(shHistArch.getLastRow(), 3, 'All movement events must be backed up in HISTORIAL_SEG_ARCHIVO');

  // Verify Cotización / Inventario backup sheets
  const ssInv = ctx.SpreadsheetApp.openById(SHEET_CONTROL);
  const shQuotesBackup = ssInv.getSheetByName('RESGUARDO_COTIZACIONES_APP');
  const shStockSugBackup = ssInv.getSheetByName('RESGUARDO_STOCK_Y_SUGERENCIAS');
  const shExec = ssInv.getSheetByName('ANALISIS_VENTAS_KEVIN');

  assert.equal(shQuotesBackup.getLastRow(), 5, 'All 4 quotes + header must be backed up in RESGUARDO_COTIZACIONES_APP');
  assert.equal(shStockSugBackup.getLastRow(), 3, '1 out-of-stock request + 1 purchase suggestion + header must be backed up in RESGUARDO_STOCK_Y_SUGERENCIAS');
  assert.ok(shExec.getLastRow() >= 8, 'ANALISIS_VENTAS_KEVIN must record GLOBAL + GERENTE + ASESOR summary rows');

  // Verify KPIs & "Why sales are not closing" diagnosis
  assert.equal(res.kpis.totalQuotes, 4);
  assert.equal(res.kpis.totalMxn, 155000);
  assert.equal(res.kpis.wonCount, 1);
  assert.equal(res.kpis.wonMxn, 60000);
  assert.equal(res.kpis.lostCount, 1);
  assert.equal(res.kpis.cancelledCount, 1);
  assert.equal(res.kpis.uncontactedOpenCount, 1);
  assert.equal(res.kpis.uncontactedOpenMxn, 45000);
  assert.equal(res.kpis.demandCount, 1);
  assert.equal(res.kpis.demandPieces, 2);
  assert.equal(res.kpis.suggestionCount, 1);

  assert.ok(res.whyNotClosing.some((c) => c.code === 'SIN_SEGUIMIENTO' && c.amountMxn === 45000), 'Must flag uncontacted open quotes as sales leakage');
  assert.ok(res.whyNotClosing.some((c) => /Falta de Inventario/i.test(c.title)), 'Must flag out-of-stock loss reason');
  assert.ok(res.whyNotClosing.some((c) => /Precio/i.test(c.title)), 'Must flag price/budget cancellation reason');
  assert.ok(res.whyNotClosing.some((c) => c.code === 'QUIEBRE_DE_STOCK'), 'Must include stockout requests in diagnosis');
  assert.ok(res.whyNotClosing.some((c) => c.code === 'SUGERENCIAS_CATALOGO'), 'Must include purchase suggestions in diagnosis');

  // Verify Manager & Advisor breakdown
  const playaMgr = res.byManager.find((m) => m.branchKey === 'PLAYA');
  assert.ok(playaMgr && playaMgr.managerName === 'ROCIO ESQUIVEL');
  assert.equal(playaMgr.quotesCount, 2);
  assert.equal(playaMgr.demandCount, 1);
  assert.equal(playaMgr.suggestionCount, 1);

  const julioAdv = res.byAdvisor.find((a) => a.advisorEmail === 'juliocruz@creatamuebles.com');
  assert.ok(julioAdv);
  assert.equal(julioAdv.quotesCount, 2);
  assert.equal(julioAdv.uncontactedCount, 1);
  assert.equal(julioAdv.lostCount, 1);
  assert.equal(julioAdv.demandPieces, 2);

  // Verify pre-filled email draft
  assert.equal(res.emailDraft.to, 'kevin.reyna@grupoanipa.com');
  assert.match(res.emailDraft.subject, /Corte y Análisis de No Cierre de Ventas CREATA/);
  assert.match(res.emailDraft.body, /¿POR QUÉ NO SE ESTÁN CERRANDO LAS VENTAS\?/);
  assert.match(res.emailDraft.body, /ROCIO ESQUIVEL/);
  assert.match(res.emailDraft.body, /JULIO DE LA CRUZ RAMON/);

  // Idempotency check: pressing button a 2nd time updates backup rows in place without duplicating RESGUARDO_SEGUIMIENTO or RESGUARDO_COTIZACIONES_APP!
  const res2 = JSON.parse(ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'hist_archive_and_analyze_kevin', authToken: kevinToken, advisorEmail: 'kevin.reyna@grupoanipa.com' }) }
  }).getContent());
  assert.equal(res2.ok, true);
  assert.equal(shSegBackup.getLastRow(), 5, 'Re-running cut must upsert RESGUARDO_SEGUIMIENTO without duplicating rows');
  assert.equal(shQuotesBackup.getLastRow(), 5, 'Re-running cut must upsert RESGUARDO_COTIZACIONES_APP without duplicating rows');
});

function createHistDomHarness({ session, mockPostHandler }) {
  const listeners = new Map();
  let lastHref = '';
  let clipboardText = '';

  function makeEl(tag, id = '') {
    const classes = new Set();
    const attrs = new Map();
    const elListeners = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      id,
      value: '',
      disabled: false,
      dataset: {},
      style: {},
      options: [],
      _innerHTML: '',
      _textContent: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) {
        this._innerHTML = String(v || '');
        parseIdsIntoMap(this._innerHTML);
      },
      get textContent() { return this._textContent; },
      set textContent(v) { this._textContent = String(v || ''); },
      classList: {
        add(...cs) { cs.forEach((c) => c && classes.add(c)); },
        remove(...cs) { cs.forEach((c) => classes.delete(c)); },
        toggle(c, force) {
          if (force === undefined) {
            if (classes.has(c)) { classes.delete(c); return false; }
            classes.add(c); return true;
          }
          if (force) classes.add(c); else classes.delete(c);
          return !!force;
        },
        contains(c) { return classes.has(c); }
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      addEventListener(ev, fn) {
        if (!elListeners.has(ev)) elListeners.set(ev, []);
        elListeners.get(ev).push(fn);
      },
      removeEventListener() {},
      dispatchClick(targetEl) {
        for (const fn of (elListeners.get('click') || [])) {
          fn({ target: targetEl });
        }
      },
      querySelector(sel) {
        if (sel && sel.startsWith('#')) return byId.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll() { return []; },
      focus() {},
      select() {},
      setSelectionRange() {}
    };
    return el;
  }

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
      const valM = attrStr.match(/\bvalue="([^"]*)"/);
      if (valM) el.value = valM[1];
      const actM = attrStr.match(/\bdata-hist-action="([^"]*)"/);
      if (actM) el.setAttribute('data-hist-action', actM[1]);
    }
    const taRe = /<textarea[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g;
    let tm;
    while ((tm = taRe.exec(html)) !== null) {
      const taEl = byId.get(tm[1]);
      if (taEl) taEl.value = tm[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    }
  }

  const rootEl = makeEl('DIV', 'inAppHistorialRoot');
  const storage = new Map();
  if (session) {
    storage.set('creata_inv_advisor_session_v1', JSON.stringify(session));
  }

  const locationObj = {
    get href() { return lastHref; },
    set href(v) { lastHref = String(v || ''); }
  };

  const doc = {
    visibilityState: 'visible',
    head: { appendChild() {}, removeChild() {} },
    body: { appendChild() {}, removeChild() {} },
    createElement(tag) { return makeEl(tag); },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    removeEventListener() {},
    execCommand() { return true; }
  };

  const win = {
    document: doc,
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      clipboard: { writeText: async (t) => { clipboardText = String(t || ''); } }
    },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: locationObj,
    fetch: async (_url, opts) => {
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body || '{}');
        const resObj = await mockPostHandler(body);
        return { ok: true, json: async () => resObj };
      }
      return { ok: false, text: async () => '' };
    },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (fn) => { const t = setTimeout(fn, 0); if (t && t.unref) t.unref(); return t; },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    Blob: class FakeBlob {},
    AbortController,
    console
  };
  win.window = win;
  win.globalThis = win;

  vm.runInNewContext(HIST_JS, win, { filename: 'historial-app.js' });
  win.CreataHistorialModule.mount(rootEl, { session });

  return {
    win,
    rootEl,
    byId,
    getLastHref: () => lastHref,
    getClipboard: () => clipboardText
  };
}

test('Frontend Historial: #hist_btnKevinArchiveAnalyze is visible ONLY to kevin.reyna@grupoanipa.com, pre-fills mailto draft + modal on click, and unwinds cleanly on Back', async () => {
  // 1) Non-Kevin admin (Santiago), Manager, Advisor, and Kevin in Advisor Preview MUST NOT see the button
  for (const nonKevinSession of [
    { correo: 'santiago.torres@grupoanipa.com', nombre: 'Santiago Torres', puesto: 'Administrador General', isAdmin: true, authToken: 'tok_santi' },
    { correo: 'rocio.esquivel@creatamuebles.com', nombre: 'Rocío Esquivel', puesto: 'Gerente de Tienda', isManager: true, sheetTab: 'PLAYA', authToken: 'tok_rocio' },
    { correo: 'juliocruz@creatamuebles.com', nombre: 'Julio Cruz', puesto: 'Asesor', sheetTab: 'PLAYA', authToken: 'tok_julio' },
    { correo: 'kevin.reyna@grupoanipa.com', nombre: 'Kevin Reyna', puesto: 'Administrador General', isAdmin: true, forceAdvisorPreview: true, authToken: 'tok_kev' }
  ]) {
    const h = createHistDomHarness({
      session: nonKevinSession,
      mockPostHandler: async () => ({ ok: true, users: [], sheets: {} })
    });
    assert.equal(h.byId.get('hist_btnKevinArchiveAnalyze'), undefined, `${nonKevinSession.correo} (preview=${!!nonKevinSession.forceAdvisorPreview}) must NOT render #hist_btnKevinArchiveAnalyze`);
    assert.equal(h.byId.get('hist_kevinArchiveModal'), undefined, 'Must NOT render #hist_kevinArchiveModal for non-Kevin sessions');
  }

  // 2) Real Kevin session sees the button, triggers archive+analysis, pre-fills email draft & opens modal, and Back closes modal
  let archiveActionCalled = false;
  const hKevin = createHistDomHarness({
    session: {
      correo: 'kevin.reyna@grupoanipa.com',
      nombre: 'IRVIN KEVIN REYNA VALDEZ',
      puesto: 'Administrador General',
      isAdmin: true,
      sheetTab: 'CUENTAS ADMINISTRATIVAS',
      authToken: 'tok_kevin_real'
    },
    mockPostHandler: async (body) => {
      if (body.action === 'hist_archive_and_analyze_kevin') {
        archiveActionCalled = true;
        return {
          ok: true,
          cutId: 'CORTE-20261126-180000',
          cutDateStr: '26/11/2026 18:00:00',
          archiveSummary: {
            segNewlyArchivedPartidas: 3,
            segActiveRemainingPartidas: 1,
            segBackedUpAllStatesCount: 4,
            quotesBackedUpCount: 4,
            stockAndSugBackedUpCount: 2
          },
          executiveHeadline: 'Cotizado: $155,000.00 (4 cot.) · Ganadas: 1 (25%) · Sin contacto: 1 ($45,000.00)',
          kpis: {
            totalQuotes: 4, totalMxn: 155000, wonCount: 1, wonMxn: 60000,
            lostCount: 1, lostMxn: 32000, cancelledCount: 1, cancelledMxn: 18000,
            contactedOpenCount: 0, uncontactedOpenCount: 1, uncontactedOpenMxn: 45000,
            winRateClosedPct: 33, winRateTotalPct: 25, demandCount: 1, demandPieces: 2, suggestionCount: 1
          },
          whyNotClosing: [
            { code: 'SIN_SEGUIMIENTO', title: 'Falta de seguimiento comercial', count: 1, amountMxn: 45000, detail: '1 cotización sin contacto ($45,000.00).', recommendation: 'Exigir primer toque el mismo día.' }
          ],
          byManager: [
            { branchKey: 'PLAYA', branchLabel: 'PLAYA', managerName: 'ROCIO ESQUIVEL', quotesCount: 2, totalMxn: 77000, wonCount: 0, winRatePct: 0, lostCount: 1, cancelledCount: 0, uncontactedCount: 1, demandCount: 1, demandPieces: 2, suggestionCount: 1, topReason: 'Sin seguimiento', diagnosis: '1 cot. sin contacto · 1 pérdida por stock' }
          ],
          byAdvisor: [
            { advisorName: 'JULIO DE LA CRUZ RAMON', advisorEmail: 'juliocruz@creatamuebles.com', branchLabel: 'PLAYA', managerName: 'ROCIO ESQUIVEL', quotesCount: 2, totalMxn: 77000, wonCount: 0, winRatePct: 0, lostCount: 1, cancelledCount: 0, uncontactedCount: 1, demandCount: 1, demandPieces: 2, suggestionCount: 0, topReason: 'Sin seguimiento', diagnosis: '1 cot. sin contacto ($45,000.00)' }
          ],
          topStockoutSkus: [{ sku: 'MESA-ROMA', model: 'MESA ROMA', requests: 1, pieces: 2, source: 'Solicitud sin stock' }],
          topSuggestions: [{ label: 'EXTERIOR · SALA DE CUERDA NÁUTICA', count: 1, sampleComment: 'Pedida en Playa' }],
          emailDraft: {
            to: 'kevin.reyna@grupoanipa.com',
            subject: 'Corte y Análisis de No Cierre de Ventas CREATA · 26/11/2026 (CORTE-20261126-180000)',
            body: 'REPORTE COMPLETO POR GERENTE Y ASESOR — ¿POR QUÉ NO SE CIERRAN LAS VENTAS?',
            shortMailtoBody: 'RESUMEN CORTO'
          }
        };
      }
      return { ok: true, users: [], sheets: {} };
    }
  });

  const archBtn = hKevin.byId.get('hist_btnKevinArchiveAnalyze');
  assert.ok(archBtn, 'Kevin session MUST render #hist_btnKevinArchiveAnalyze');
  archBtn.closest = (sel) => (sel === '[data-hist-action]' ? archBtn : null);

  hKevin.rootEl.dispatchClick(archBtn);
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(archiveActionCalled, true, 'Clicking button must call hist_archive_and_analyze_kevin');
  const modal = hKevin.byId.get('hist_kevinArchiveModal');
  assert.equal(modal.classList.contains('cm-hidden'), false, '#hist_kevinArchiveModal must open with results');
  assert.equal(hKevin.byId.get('hist_kevinMailTo').value, 'kevin.reyna@grupoanipa.com');
  assert.match(hKevin.byId.get('hist_kevinMailSubject').value, /CORTE-20261126-180000/);
  assert.match(hKevin.getLastHref(), /^mailto:kevin\.reyna%40grupoanipa\.com\?subject=/, 'Must auto-open pre-filled mailto: draft for Kevin');
  assert.match(hKevin.getClipboard(), /¿POR QUÉ NO SE CIERRAN LAS VENTAS\?/, 'Must copy full report to clipboard');

  // Verify Back navigation closes the modal first without unmounting Historial
  assert.equal(hKevin.win.CreataHistorialModule.hasActiveOverlay(), true);
  const backRes = hKevin.win.CreataHistorialModule.handleBackAction({ phase: 'overlay' });
  assert.equal(backRes.handled, true);
  assert.equal(backRes.action, 'hist_kevin_archive_modal');
  assert.equal(modal.classList.contains('cm-hidden'), true, 'Back must close #hist_kevinArchiveModal cleanly');
});
