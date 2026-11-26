import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PROJ_A_GS = path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs');
const SHEET_CONTROL = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
const SHEET_COT_DB = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function assertBalancedCssBraces(cssSrc, label) {
  let depth = 0;
  for (const ch of cssSrc) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, `Unmatched closing brace in ${label}`);
  }
  assert.equal(depth, 0, `Unbalanced braces in ${label}`);
}

const HEADERS_27 = [
  'ID_Partida', 'Folio_ERP', 'Fecha_Cotizacion', 'Sucursal', 'Asesor',
  'Correo_Asesor', 'Tel_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Clave_Producto',
  'Nombre_Producto', 'Modelo', 'Precio_Unitario', 'Cantidad_Cotizada', 'Stock_Inicial_Total',
  'Stock_Actual_CEDIS_Bodega', 'Stock_Actual_CEDIS_Piso', 'Stock_Actual_Tienda_Bodega', 'Stock_Actual_Tienda_Piso', 'Stock_Actual_Total',
  'Variacion_Piezas', 'Porcentaje_Caida', 'Nivel_Urgencia', 'Motivo_Urgencia', 'Estatus_ERP',
  'Fecha_Ultimo_Aviso', 'ORIGEN_CREACION'
];

function makeRow27(overrides = {}) {
  const map = {
    ID_Partida: 'COT-001_SKU1',
    Folio_ERP: 'COT-001',
    Fecha_Cotizacion: '2026-11-20',
    Sucursal: 'CASA CREATA',
    Asesor: 'Ana Asesora',
    Correo_Asesor: 'ana@grupoanipa.com',
    Tel_Asesor: '9983334444',
    Cliente: 'Cliente Demo',
    WhatsApp_Cliente: '9981000001',
    Clave_Producto: 'SKU1',
    Nombre_Producto: 'SALA MILAN SAND',
    Modelo: 'MILAN',
    Precio_Unitario: '25900.00',
    Cantidad_Cotizada: '1',
    Stock_Inicial_Total: '10',
    Stock_Actual_CEDIS_Bodega: '4',
    Stock_Actual_CEDIS_Piso: '1',
    Stock_Actual_Tienda_Bodega: '2',
    Stock_Actual_Tienda_Piso: '0',
    Stock_Actual_Total: '7',
    Variacion_Piezas: '-3',
    Porcentaje_Caida: '30%',
    Nivel_Urgencia: 'BAJADA',
    Motivo_Urgencia: 'Cayó 30% stock',
    Estatus_ERP: 'Cotizado',
    Fecha_Ultimo_Aviso: '',
    ORIGEN_CREACION: '',
    ...overrides
  };
  return HEADERS_27.map((h) => map[h] ?? '');
}

function buildTestGasEnv() {
  const invHeader = new Array(50).fill('');
  invHeader[0] = 'SKU';
  invHeader[1] = 'TIPO';
  invHeader[2] = 'MODELO';
  invHeader[3] = 'NOMBRE';
  invHeader[5] = 'FOTO';
  invHeader[20] = 'CEDIS (BODEGA)';
  invHeader[21] = 'CEDIS (PISO)';
  invHeader[22] = 'CASA CREATA (BODEGA)';
  invHeader[23] = 'CASA CREATA (PISO)';
  invHeader[28] = 'PLAYA (BODEGA)';
  invHeader[29] = 'PLAYA (PISO)';
  invHeader[49] = 'PRECIO';

  const invBanner = new Array(50).fill('');
  invBanner[48] = 'Sync OK 2026-11-24 16:00';

  const invRowMilan = new Array(50).fill('');
  invRowMilan[0] = 'SKU-MILAN';
  invRowMilan[1] = 'SALAS';
  invRowMilan[2] = 'MILAN';
  invRowMilan[3] = 'SALA MILAN SAND';
  invRowMilan[20] = 3; // CEDIS BOD
  invRowMilan[21] = 1; // CEDIS PISO
  invRowMilan[22] = 1; // CASA BOD
  invRowMilan[28] = 2; // PLAYA BOD
  invRowMilan[49] = '$25,900';

  const invRowMesa = new Array(50).fill('');
  invRowMesa[0] = 'SKU-MESA';
  invRowMesa[1] = 'COMEDORES';
  invRowMesa[2] = 'ROMA';
  invRowMesa[3] = 'MESA ROMA NOGAL';
  invRowMesa[20] = 0; // CEDIS BOD
  invRowMesa[21] = 1; // CEDIS PISO (solo piso)
  invRowMesa[49] = '$18,500';

  const env = createMockGasEnvironment({
    activeSpreadsheetId: SHEET_CONTROL,
    scriptProperties: {
      INV_AUTH_SECRET: 'TEST_SECRET_SEG_LIVE_999'
    }
  });

  env.makeSpreadsheet(SHEET_CONTROL, 'Control de Productos', {
    INVENTARIO_EN_VIVO: [invHeader, invBanner, invRowMilan, invRowMesa],
    COTIZACIONES_EN_VIVO: [
      ['ID', 'FOLIO', 'FECHA', 'CLIENTE', 'TELEFONO', 'TOTAL', 'SUCURSAL', 'ASESOR_EMAIL', 'ASESOR_NOMBRE', 'ITEMS_JSON']
    ],
    'CUENTAS ADMINISTRATIVAS': [
      ['CARGO', 'SUCURSAL', 'NOMBRE', 'TELEFONO', 'CORREO', 'CLAVE_OLD', 'CLAVE'],
      ['ADMIN', 'TODAS', 'Kevin Reyna', '9981112222', 'kevin.reyna@grupoanipa.com', '', 'pass123'],
      ['GERENTE', 'CASA CREATA', 'Gina Gerente', '9982223333', 'gina@grupoanipa.com', '', 'pass234'],
      ['ASESOR', 'CASA CREATA', 'Ana Asesora', '9983334444', 'ana@grupoanipa.com', '', 'pass456'],
      ['ASESOR', 'PLAYA', 'Luis Playa', '9985556666', 'luis@grupoanipa.com', '', 'pass789']
    ]
  });

  env.makeSpreadsheet(SHEET_COT_DB, 'COTIZACIONES BASE DE DATOS', {
    CONFIG_CREATA: [
      ['PARAMETRO', 'VALOR'],
      ['DIAS_HISTORIAL_ERP', '45'],
      ['UMBRAL_CAIDA_PORCENTAJE', '30']
    ],
    COTIZACIONES_CREATA: [
      HEADERS_27.slice(),
      // Active quote that will be refreshed from ERP (preserve Stock_Inicial=10, WhatsApp, Fecha_Ultimo_Aviso, APP_COTIZACION)
      makeRow27({
        ID_Partida: 'COT-ACTIVA-01_SKU-MILAN',
        Folio_ERP: 'COT-ACTIVA-01',
        Fecha_Cotizacion: '2026-11-22',
        Sucursal: 'CASA CREATA',
        Asesor: 'Ana Asesora',
        Correo_Asesor: 'ana@grupoanipa.com',
        Cliente: 'Cliente Activo',
        WhatsApp_Cliente: '9989990001',
        Clave_Producto: 'SKU-MILAN',
        Stock_Inicial_Total: '10',
        Fecha_Ultimo_Aviso: '2026-11-23 11:00',
        ORIGEN_CREACION: 'APP_COTIZACION',
        Estatus_ERP: 'Cotizado'
      }),
      // Older open quote outside ERP lookback window — MUST be preserved (NO day-25 deletion!)
      makeRow27({
        ID_Partida: 'COT-ANTIGUA-99_SKU-MESA',
        Folio_ERP: 'COT-ANTIGUA-99',
        Fecha_Cotizacion: '2026-09-10',
        Sucursal: 'CASA CREATA',
        Asesor: 'Ana Asesora',
        Correo_Asesor: 'ana@grupoanipa.com',
        Cliente: 'Cliente Antiguo',
        Clave_Producto: 'SKU-MESA',
        Nombre_Producto: 'MESA ROMA NOGAL',
        Stock_Inicial_Total: '5',
        Estatus_ERP: 'Cotizado'
      }),
      // Older quote already closed in CIERRES_COTIZACIONES — MUST be auto-archived!
      makeRow27({
        ID_Partida: 'COT-MANUAL-OLD_SKU-MILAN',
        Folio_ERP: 'COT-MANUAL-OLD',
        Fecha_Cotizacion: '2026-10-15',
        Sucursal: 'PLAYA',
        Asesor: 'Luis Playa',
        Correo_Asesor: 'luis@grupoanipa.com',
        Cliente: 'Cliente Manual',
        Clave_Producto: 'SKU-MILAN',
        Estatus_ERP: 'Cotizado'
      })
    ],
    CIERRES_COTIZACIONES: [
      ['Fecha_Hora', 'Folio_ERP', 'Sucursal', 'Asesor', 'Correo_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Estatus_Cierre', 'Motivo_Cierre', 'Comentarios', 'Total_Productos', 'Piezas_Cotizadas'],
      ['2026-10-20 12:00', 'COT-MANUAL-OLD', 'PLAYA', 'Luis Playa', 'luis@grupoanipa.com', 'Cliente Manual', '9985550000', 'PERDIDA', 'Precio', 'Se fue con competencia', '1', 'SALA MILAN SAND (1 pza)']
    ],
    HISTORIAL_MOVIMIENTOS: [
      ['FECHA_HORA', 'TIPO', 'USUARIO', 'EMAIL', 'SUCURSAL', 'ACCION', 'DETALLE', 'IP', 'ESTATUS']
    ]
  });

  env.loadScript(PROJ_A_GS);
  return env;
}

// ============================================================================
// 1. LIVE ERP QUOTE SYNC (ObtenerReporteCotizaciones) + AUTO-ARCHIVE + NO DAY-25 WIPE
// ============================================================================
test('GAS ERP Quote Sync: parses SOAP XML, excludes service SKUs, preserves memory & older open quotes (no day-25 reset), and auto-archives ERP Vendido/Cancelado + manual closures', () => {
  const env = buildTestGasEnv();

  const mockSoapXml = `
    <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
      <s:Body>
        <ObtenerReporteCotizacionesResponse xmlns="http://tempuri.org/">
          <ObtenerReporteCotizacionesResult xmlns:a="http://schemas.datacontract.org/2004/07/SMuebleria">
            <a:ReporteCotizaciones>
              <a:FolioCotizacion>COT-ACTIVA-01</a:FolioCotizacion>
              <a:Sucursal>CREATA CASA CREATA</a:Sucursal>
              <a:Vendedor>Ana Asesora</a:Vendedor>
              <a:Cliente>Cliente Activo</a:Cliente>
              <a:FechaCotizacion>2026-11-22T10:15:00</a:FechaCotizacion>
              <a:Status>Cotizado</a:Status>
              <a:Detalle>
                <a:ReporteVentasDetalle>
                  <a:Clave>SKU-MILAN</a:Clave>
                  <a:Nombre>SALA MILAN SAND</a:Nombre>
                  <a:Modelo>MILAN</a:Modelo>
                  <a:Cantidad>1</a:Cantidad>
                  <a:Precio>25900</a:Precio>
                </a:ReporteVentasDetalle>
                <a:ReporteVentasDetalle>
                  <a:Clave>FLETE</a:Clave>
                  <a:Nombre>FLETE LOCAL</a:Nombre>
                  <a:Modelo></a:Modelo>
                  <a:Cantidad>1</a:Cantidad>
                  <a:Precio>1500</a:Precio>
                </a:ReporteVentasDetalle>
              </a:Detalle>
            </a:ReporteCotizaciones>
            <a:ReporteCotizaciones>
              <a:FolioCotizacion>COT-VENDIDA-ERP</a:FolioCotizacion>
              <a:Sucursal>CREATA PLAYA</a:Sucursal>
              <a:Vendedor>Luis Playa</a:Vendedor>
              <a:Cliente>Cliente Ganado ERP</a:Cliente>
              <a:FechaCotizacion>2026-11-24T13:00:00</a:FechaCotizacion>
              <a:Status>Vendido</a:Status>
              <a:Detalle>
                <a:ReporteVentasDetalle>
                  <a:Clave>SKU-MILAN</a:Clave>
                  <a:Nombre>SALA MILAN SAND</a:Nombre>
                  <a:Modelo>MILAN</a:Modelo>
                  <a:Cantidad>2</a:Cantidad>
                  <a:Precio>25900</a:Precio>
                </a:ReporteVentasDetalle>
              </a:Detalle>
            </a:ReporteCotizaciones>
            <a:ReporteCotizaciones>
              <a:FolioCotizacion>COT-CANCELADA-ERP</a:FolioCotizacion>
              <a:Sucursal>CREATA CASA CREATA</a:Sucursal>
              <a:Vendedor>Ana Asesora</a:Vendedor>
              <a:Cliente>Cliente Cancelado ERP</a:Cliente>
              <a:FechaCotizacion>2026-11-24T14:20:00</a:FechaCotizacion>
              <a:Status>Cancelado</a:Status>
              <a:Detalle>
                <a:ReporteVentasDetalle>
                  <a:Clave>SKU-MESA</a:Clave>
                  <a:Nombre>MESA ROMA NOGAL</a:Nombre>
                  <a:Modelo>ROMA</a:Modelo>
                  <a:Cantidad>1</a:Cantidad>
                  <a:Precio>18500</a:Precio>
                </a:ReporteVentasDetalle>
              </a:Detalle>
            </a:ReporteCotizaciones>
          </ObtenerReporteCotizacionesResult>
        </ObtenerReporteCotizacionesResponse>
      </s:Body>
    </s:Envelope>
  `;

  let capturedMethod = '';
  let capturedXml = '';
  env.context.callSmuebleriaWcf_ = (method, innerXml) => {
    capturedMethod = method;
    capturedXml = innerXml;
    return mockSoapXml;
  };

  // Direct parser test
  const parsed = env.context.parseObtenerReporteCotizacionesXml_(mockSoapXml);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].folio, 'COT-ACTIVA-01');
  assert.equal(parsed[0].items.length, 1, 'FLETE service SKU must be excluded');
  assert.equal(parsed[0].items[0].sku, 'SKU-MILAN');

  // Full sync execution
  const syncRes = env.context.sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: false });
  assert.equal(syncRes.ok, true);
  assert.equal(capturedMethod, 'ObtenerReporteCotizaciones');
  assert.match(capturedXml, /<FechaInicio>\d{4}-\d{2}-\d{2}T00:00:00<\/FechaInicio>/);
  assert.match(capturedXml, /<FechaFin>\d{4}-\d{2}-\d{2}T23:59:59<\/FechaFin>/);
  assert.equal(syncRes.erpQuotesCount, 3);
  assert.equal(syncRes.activeRows, 2, 'Active sheet must keep COT-ACTIVA-01 + preserved older open COT-ANTIGUA-99');
  assert.equal(syncRes.archivedRows, 3, 'Archive sheet must contain COT-VENDIDA-ERP, COT-CANCELADA-ERP, and COT-MANUAL-OLD');
  assert.equal(syncRes.erpAutoClosuresAdded, 2, 'Both ERP Vendido and Cancelado must be logged in CIERRES_COTIZACIONES');

  const ssSeg = env.spreadsheetsById.get(SHEET_COT_DB);
  const shAct = ssSeg.getSheetByName('COTIZACIONES_CREATA');
  const shArch = ssSeg.getSheetByName('COTIZACIONES_ARCHIVADAS');
  const shCie = ssSeg.getSheetByName('CIERRES_COTIZACIONES');
  const shHist = ssSeg.getSheetByName('HISTORIAL_MOVIMIENTOS');

  const actRows = shAct.getRange(2, 1, shAct.getLastRow() - 1, 27).getDisplayValues();
  const actFolios = actRows.map((r) => r[1]);
  assert.deepEqual(actFolios.sort(), ['COT-ACTIVA-01', 'COT-ANTIGUA-99']);

  // Verify preserved memory on COT-ACTIVA-01
  const rowAct01 = actRows.find((r) => r[1] === 'COT-ACTIVA-01');
  assert.equal(rowAct01[8], '9989990001', 'Must preserve WhatsApp_Cliente');
  assert.equal(rowAct01[14], '10', 'Must preserve Stock_Inicial_Total');
  assert.equal(rowAct01[19], '5', 'Live total for CASA CREATA = CEDIS(3+1) + CASA(1+0) = 5');
  assert.equal(rowAct01[25], '2026-11-23 11:00', 'Must preserve Fecha_Ultimo_Aviso');
  assert.equal(rowAct01[26], 'APP_COTIZACION', 'Must preserve ORIGEN_CREACION');

  // Verify older open quote preserved with live stock refresh (SOLO_PISO for SKU-MESA)
  const rowOld = actRows.find((r) => r[1] === 'COT-ANTIGUA-99');
  assert.equal(rowOld[19], '1');
  assert.equal(rowOld[22], 'SOLO_PISO');

  // Verify COTIZACIONES_ARCHIVADAS contains all 3 closed folios with MOTIVO_ARCHIVO & FECHA_ARCHIVO
  const archRows = shArch.getRange(2, 1, shArch.getLastRow() - 1, 29).getDisplayValues();
  const archFolios = archRows.map((r) => r[1]);
  assert.deepEqual(archFolios.sort(), ['COT-CANCELADA-ERP', 'COT-MANUAL-OLD', 'COT-VENDIDA-ERP']);
  const vendArch = archRows.find((r) => r[1] === 'COT-VENDIDA-ERP');
  assert.match(vendArch[27], /GANADA/);
  assert.ok(vendArch[28].length >= 10, 'FECHA_ARCHIVO must be populated');

  // Verify CIERRES_COTIZACIONES received both ERP auto-closures
  const cieRows = shCie.getRange(2, 1, shCie.getLastRow() - 1, 12).getDisplayValues();
  const cieByFol = Object.fromEntries(cieRows.map((r) => [r[1], r[7]]));
  assert.equal(cieByFol['COT-VENDIDA-ERP'], 'GANADA');
  assert.equal(cieByFol['COT-CANCELADA-ERP'], 'CANCELADA');
  assert.equal(cieByFol['COT-MANUAL-OLD'], 'PERDIDA');

  // Verify HISTORIAL_MOVIMIENTOS logged the live sync
  const histRows = shHist.getRange(2, 1, shHist.getLastRow() - 1, 9).getDisplayValues();
  assert.ok(histRows.some((r) => r[1] === 'SYNC' && r[8] === 'EXITOSO'));

  // Verify throttled call right after skips duplicate ERP hit
  const throttledRes = env.context.sincronizarCotizacionesSeguimientoDesdeERP({ silentUi: true, throttled: true });
  assert.equal(throttledRes.ok, true);
  assert.equal(throttledRes.skippedThrottle, true);
});

// ============================================================================
// 2. MANUAL CLOSE AUTO-ARCHIVE (SEG_CIERRE) + ROLE-SCOPED ARCHIVES IN STATE/DELTA
// ============================================================================
test('GAS Manual SEG_CIERRE archives rows immediately and seg_get_state/seg_get_delta enforce strict role scoping on COTIZACIONES_ARCHIVADAS', () => {
  const env = buildTestGasEnv();
  const USERS = {
    'kevin.reyna@grupoanipa.com': { correo: 'kevin.reyna@grupoanipa.com', nombre: 'Kevin Reyna', puesto: 'ADMIN', sheetTab: 'PROYECTOS', erpStore: 'TODAS', isAdmin: true },
    'gina@grupoanipa.com': { correo: 'gina@grupoanipa.com', nombre: 'Gina Gerente', puesto: 'GERENTE', sheetTab: 'CASA CREATA', erpStore: 'CREATA CASA CREATA', isAdmin: false },
    'ana@grupoanipa.com': { correo: 'ana@grupoanipa.com', nombre: 'Ana Asesora', puesto: 'ASESOR', sheetTab: 'CASA CREATA', erpStore: 'CREATA CASA CREATA', isAdmin: false },
    'luis@grupoanipa.com': { correo: 'luis@grupoanipa.com', nombre: 'Luis Playa', puesto: 'ASESOR', sheetTab: 'PLAYA', erpStore: 'CREATA PLAYA', isAdmin: false }
  };
  env.context.resolveAuthenticatedAdvisor_ = (_ss, _erp, body) => {
    const email = String((body && body.advisorEmail) || '').trim().toLowerCase();
    return USERS[email] ? { ok: true, advisor: USERS[email] } : { ok: false };
  };

  const post = (payload) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
  const kevinTok = env.context.issueInvAuthToken_('kevin.reyna@grupoanipa.com', 'PROYECTOS');
  const ginaTok = env.context.issueInvAuthToken_('gina@grupoanipa.com', 'CASA CREATA');
  const anaTok = env.context.issueInvAuthToken_('ana@grupoanipa.com', 'CASA CREATA');
  const luisTok = env.context.issueInvAuthToken_('luis@grupoanipa.com', 'PLAYA');

  // Ana closes COT-ACTIVA-01 manually -> moves immediately to COTIZACIONES_ARCHIVADAS
  const closeRes = post({
    action: 'seg_action',
    authToken: anaTok,
    advisorEmail: 'ana@grupoanipa.com',
    sheetTab: 'CASA CREATA',
    subAction: 'SEG_CIERRE',
    folio: 'COT-ACTIVA-01',
    payload: {
      fecha_hora: '2026-11-24 16:30',
      estatus: 'GANADA',
      motivo: 'Cierre en Piso',
      comentarios: 'Pagó anticipo',
      cliente: 'Cliente Activo',
      sucursal: 'CASA CREATA',
      asesor: 'Ana Asesora',
      correo_asesor: 'ana@grupoanipa.com'
    }
  });
  assert.equal(closeRes.ok, true);

  // Luis closes COT-MANUAL-OLD manually -> moves immediately to COTIZACIONES_ARCHIVADAS
  const closeLuis = post({
    action: 'seg_action',
    authToken: luisTok,
    advisorEmail: 'luis@grupoanipa.com',
    sheetTab: 'PLAYA',
    subAction: 'SEG_CIERRE',
    folio: 'COT-MANUAL-OLD',
    payload: {
      fecha_hora: '2026-11-24 16:35',
      estatus: 'PERDIDA',
      motivo: 'Precio',
      cliente: 'Cliente Manual',
      sucursal: 'PLAYA',
      asesor: 'Luis Playa',
      correo_asesor: 'luis@grupoanipa.com'
    }
  });
  assert.equal(closeLuis.ok, true);

  const ssSeg = env.spreadsheetsById.get(SHEET_COT_DB);
  const shAct = ssSeg.getSheetByName('COTIZACIONES_CREATA');
  const shArch = ssSeg.getSheetByName('COTIZACIONES_ARCHIVADAS');

  const remainingActive = shAct.getRange(2, 1, shAct.getLastRow() - 1, 2).getDisplayValues().map((r) => r[1]).filter(Boolean);
  assert.deepEqual(remainingActive, ['COT-ANTIGUA-99'], 'Closed folios must be removed from active COTIZACIONES_CREATA');

  const archivedAll = shArch.getRange(2, 1, shArch.getLastRow() - 1, 2).getDisplayValues().map((r) => r[1]).filter(Boolean);
  assert.deepEqual(archivedAll.sort(), ['COT-ACTIVA-01', 'COT-MANUAL-OLD']);

  // Role scoping check in seg_get_state:
  // Admin Kevin sees both archived quotes
  const stateKevin = post({ action: 'seg_get_state', authToken: kevinTok, advisorEmail: 'kevin.reyna@grupoanipa.com', sheetTab: 'PROYECTOS' });
  assert.equal(stateKevin.ok, true);
  assert.deepEqual(stateKevin.sheets.COTIZACIONES_ARCHIVADAS.slice(1).map((r) => r[1]).sort(), ['COT-ACTIVA-01', 'COT-MANUAL-OLD']);

  // Gerente Gina (CASA CREATA) sees CASA CREATA archive only
  const stateGina = post({ action: 'seg_get_state', authToken: ginaTok, advisorEmail: 'gina@grupoanipa.com', sheetTab: 'CASA CREATA' });
  assert.equal(stateGina.ok, true);
  assert.equal(stateGina.roleScope, 'GERENTE');
  assert.deepEqual(stateGina.sheets.COTIZACIONES_ARCHIVADAS.slice(1).map((r) => r[1]), ['COT-ACTIVA-01']);

  // Asesor Ana sees ONLY her own archive + receives cotArchivadas watermark via seg_get_delta
  const deltaBootAna = post({ action: 'seg_get_delta', authToken: anaTok, advisorEmail: 'ana@grupoanipa.com', sheetTab: 'CASA CREATA' });
  assert.equal(deltaBootAna.ok, true);
  assert.equal(deltaBootAna.roleScope, 'ASESOR');
  assert.deepEqual(deltaBootAna.sheets.COTIZACIONES_ARCHIVADAS.slice(1).map((r) => r[1]), ['COT-ACTIVA-01']);
  assert.ok(deltaBootAna.rowWatermarks && deltaBootAna.rowWatermarks.cotArchivadas >= 2, 'cotArchivadas watermark must be returned');

  // Asesor Luis sees ONLY his own archive
  const stateLuis = post({ action: 'seg_get_state', authToken: luisTok, advisorEmail: 'luis@grupoanipa.com', sheetTab: 'PLAYA' });
  assert.equal(stateLuis.ok, true);
  assert.deepEqual(stateLuis.sheets.COTIZACIONES_ARCHIVADAS.slice(1).map((r) => r[1]), ['COT-MANUAL-OLD']);

  // ERP_SYNC delta triggers mode: 'full' refresh for connected clients
  const deltaBootKevin = post({ action: 'seg_get_delta', authToken: kevinTok, advisorEmail: 'kevin.reyna@grupoanipa.com', sheetTab: 'PROYECTOS' });
  assert.equal(deltaBootKevin.ok, true);
  env.context.recordSegDeltaChange_('ERP_SYNC', { folio: 'ERP_SYNC', branch: 'TODAS', data: { timestamp: '2026-11-24 17:00' } });
  const deltaAfterSync = post({
    action: 'seg_get_delta',
    authToken: kevinTok,
    advisorEmail: 'kevin.reyna@grupoanipa.com',
    sheetTab: 'PROYECTOS',
    sinceVersion: deltaBootKevin.version,
    sinceInvVersion: deltaBootKevin.invVersion,
    rowWatermarks: deltaBootKevin.rowWatermarks
  });
  assert.equal(deltaAfterSync.ok, true);
  assert.equal(deltaAfterSync.mode, 'full', 'ERP_SYNC event must deliver fresh full snapshot including COTIZACIONES_ARCHIVADAS');
  assert.ok(Array.isArray(deltaAfterSync.sheets.COTIZACIONES_ARCHIVADAS));
});

// ============================================================================
// 3. STATIC CONTRACTS: 24/7 HOOK, NO 25-DAY CYCLE, BALANCED CSS & CACHE VERSIONS
// ============================================================================
test('Static Contracts: 24/7 ERP sync hook in GAS, zero 25-day commercial cycle in seguimiento-app.js, balanced CSS, and updated cache versions', () => {
  const gs = readRepoFile('AppsScript_Creata_Drive_Sheets.gs');
  const segJs = readRepoFile('seguimiento-app.js');
  const css = readRepoFile('creata-modules.css');
  const invHtml = readRepoFile('inventario.html');

  // 24/7 cloud piggyback inside sincronizarInventarioEnVivoDesdeERP + menu item 5b + seg_sync_now
  assert.match(gs, /5b\.\s*Sincronizar Cotizaciones Seguimiento S Mueblería/);
  assert.match(gs, /sincronizarCotizacionesSeguimientoDesdeERP\(\{\s*silentUi:\s*true,\s*throttled:\s*true\s*\}\)/);
  assert.match(gs, /sincronizarCotizacionesSeguimientoDesdeERP\(\{\s*silentUi:\s*true,\s*throttled:\s*false\s*\}\)/);

  // Zero day-25 cycle reset in seguimiento-app.js
  assert.ok(!segJs.includes('getCommercialCycleInfo'), 'getCommercialCycleInfo (day-25 reset) must be completely removed');
  assert.ok(!segJs.includes('commercial_cycle'), 'commercial_cycle must be completely removed');
  assert.ok(!segJs.includes('seg_sync_now'), 'Frontend must never call seg_sync_now directly');

  // Activas / Archivadas UI + ERP auto-close helpers present
  assert.ok(segJs.includes('id="seg_tabActivas"'));
  assert.ok(segJs.includes('id="seg_tabArchivadas"'));
  assert.match(segJs, /function isErpStatusClosed\(/);
  assert.match(segJs, /function resolveAutoClosureFromErpStatus\(/);
  assert.match(segJs, /function setSegViewMode\(/);
  assert.ok(segJs.includes('COTIZACIONES_ARCHIVADAS'));

  // Balanced CSS + archive styles
  assertBalancedCssBraces(css, 'creata-modules.css');
  assert.match(css, /\.cm-seg-view-tabs\s*\{/);
  assert.match(css, /\.cm-seg-view-tab\.is-active\s*\{/);
  assert.match(css, /\.cm-seg-archive-note\s*\{/);
  assert.match(css, /\.cm-seg-card\.is-archived\s*\{/);

  // Cache versions in inventario.html
  assert.ok(invHtml.includes('./creata-modules.css?v=11'));
  assert.ok(invHtml.includes('./inventario-ui.css?v=29'));
  assert.ok(invHtml.includes('./seguimiento-app.js?v=16'));
  assert.ok(invHtml.includes('inventario-app.js?v=114'));

  // Mobile Phone App Ergonomics + Apple iPhone/iOS PWA support
  const invCss = readRepoFile('inventario-ui.css');
  const invJs = readRepoFile('inventario-app.js');
  assertBalancedCssBraces(invCss, 'inventario-ui.css');
  assert.match(css, /font-size:\s*16px;/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /border-radius:\s*20px 20px 0 0/);
  assert.match(invCss, /font-size:\s*16px !important/);
  assert.match(invCss, /\.inv-erp-client-search-row\s*\{/);
  assert.ok(invHtml.includes('enterkeyhint="search"'), 'Search inputs must declare enterkeyhint="search" for mobile keyboards');
  assert.match(invHtml, /<form class="inv-erp-client-search-row[^"]*" onsubmit="event\.preventDefault\(\);\s*searchErpClientsLive\(\);"/);
  assert.ok(invHtml.includes('id="installIosCard"'), 'Install modal must highlight iPhone/iPad card');
  assert.ok(invHtml.includes('apple-touch-icon'), 'Apple touch icon must be declared for iPhone Home Screen');
  assert.match(invJs, /function isIosMobileDevice\(/, 'inventario-app.js must detect iPhone/iPad cleanly');
  assert.match(invJs, /isIosStandalone[\s\S]*?navigator\.share/, 'iPhone standalone PWA must support native iOS PDF share/preview');
  assert.match(segJs, /isIosPwa[\s\S]*?global\.location\.href = waUrl/, 'Seguimiento WhatsApp must bypass iOS popup blocker on iPhone');
});

// ============================================================================
// 4. FRONTEND RUNTIME DOM: ACTIVAS vs ARCHIVADAS TABS, ERP AUTO-ARCHIVE, CLIENT SEARCH & BACK UNWIND
// ============================================================================
test('Seguimiento Frontend Runtime: separates Activas vs Archivadas/ERP-Vendido, searches clients across tabs & filters, renders Ver detalle modal, and Back unwinds Archivadas -> Activas', async () => {
  const segJs = readRepoFile('seguimiento-app.js');

  class FakeClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    add(...cls) { cls.forEach((c) => c && this.set.add(c)); }
    remove(...cls) { cls.forEach((c) => this.set.delete(c)); }
    toggle(c, force) {
      if (force === undefined) {
        if (this.set.has(c)) { this.set.delete(c); return false; }
        this.set.add(c); return true;
      }
      if (force) this.set.add(c); else this.set.delete(c);
      return Boolean(force);
    }
    contains(c) { return this.set.has(c); }
    setFromString(str) {
      this.set.clear();
      String(str || '').split(/\s+/).filter(Boolean).forEach((c) => this.set.add(c));
    }
  }

  class FakeElement {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.classList = new FakeClassList(this);
      this.dataset = {};
      this.attributes = {};
      this.style = {};
      this.value = '';
      this.options = [];
      this.checked = false;
      this.scrollTop = 0;
      this._blurred = false;
      this._textContent = '';
      this._innerHTML = '';
      this._listeners = {};
      this._byId = new Map();
    }
    blur() { this._blurred = true; }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') this.classList.setFromString(v);
    }
    getAttribute(k) { return this.attributes[k] ?? null; }
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
    removeEventListener(ev, fn) {
      if (!this._listeners[ev]) return;
      this._listeners[ev] = this._listeners[ev].filter((f) => f !== fn);
    }
    dispatch(ev, payload) {
      (this._listeners[ev] || []).forEach((fn) => fn(payload));
    }
    set textContent(v) { this._textContent = String(v ?? ''); }
    get textContent() { return this._textContent; }
    set innerHTML(html) {
      this._innerHTML = String(html ?? '');
      const idRe = /<([a-zA-Z0-9_-]+)([^>]*)id="([^"]+)"([^>]*)>/g;
      let m;
      while ((m = idRe.exec(this._innerHTML)) !== null) {
        const tag = m[1];
        const attrs = (m[2] || '') + ' ' + (m[4] || '');
        const id = m[3];
        const child = new FakeElement(tag, id);
        const clsMatch = attrs.match(/class="([^"]+)"/);
        if (clsMatch) child.classList.setFromString(clsMatch[1]);
        const valMatch = attrs.match(/value="([^"]+)"/);
        if (valMatch) child.value = valMatch[1];
        const dataInMatch = attrs.match(/data-seg-input="([^"]+)"/);
        if (dataInMatch) child.setAttribute('data-seg-input', dataInMatch[1]);
        if (tag.toLowerCase() === 'select') {
          child.value = id === 'seg_filterSucursal' ? 'TODAS' : 'TODOS';
          child.options = [{ value: child.value }];
        }
        this._byId.set(id, child);
      }
    }
    get innerHTML() { return this._innerHTML; }
    querySelector(sel) {
      if (sel && sel.startsWith('#')) {
        const id = sel.slice(1);
        return this._byId.get(id) || null;
      }
      return null;
    }
    closest() { return null; }
  }

  const storageMap = new Map();
  const fakeStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)); },
    removeItem: (k) => { storageMap.delete(k); }
  };

  const rootEl = new FakeElement('div', 'inAppSeguimientoRoot');
  const fullStatePayload = {
    ok: true,
    mode: 'full',
    version: 10,
    invVersion: 'Sync OK 2026-11-24 16:00',
    roleScope: 'ADMIN',
    rowWatermarks: { cotCreata: 3, cotArchivadas: 2, cotVivo: 1, cierres: 2, histMov: 1, histSeg: 1 },
    sheets: {
      COTIZACIONES_CREATA: [
        HEADERS_27.slice(),
        makeRow27({
          ID_Partida: 'COT-OPEN-1_SKU-1',
          Folio_ERP: 'COT-OPEN-1',
          Fecha_Cotizacion: '2026-11-24',
          Cliente: 'Cliente Abierto',
          Estatus_ERP: 'Cotizado'
        }),
        makeRow27({
          ID_Partida: 'COT-ERP-SOLD_SKU-1',
          Folio_ERP: 'COT-ERP-SOLD',
          Fecha_Cotizacion: '2026-11-23',
          Cliente: 'Cliente Vendido ERP',
          Estatus_ERP: 'Vendido'
        })
      ],
      COTIZACIONES_ARCHIVADAS: [
        HEADERS_27.concat(['MOTIVO_ARCHIVO', 'FECHA_ARCHIVO']),
        makeRow27({
          ID_Partida: 'COT-ARCH-1_SKU-1',
          Folio_ERP: 'COT-ARCH-1',
          Fecha_Cotizacion: '2026-11-20',
          Cliente: 'Cliente Archivado Manual',
          Estatus_ERP: 'Vendido'
        }).concat(['GANADA: Cierre en Piso', '2026-11-21 15:00'])
      ],
      COTIZACIONES_EN_VIVO: [
        ['ID', 'FOLIO', 'FECHA', 'CLIENTE', 'TELEFONO', 'TOTAL', 'SUCURSAL', 'ASESOR_EMAIL', 'ASESOR_NOMBRE', 'ITEMS_JSON']
      ],
      CIERRES_COTIZACIONES: [
        ['Fecha_Hora', 'Folio_ERP', 'Sucursal', 'Asesor', 'Correo_Asesor', 'Cliente', 'WhatsApp_Cliente', 'Estatus_Cierre', 'Motivo_Cierre', 'Comentarios', 'Total_Productos', 'Piezas_Cotizadas'],
        ['2026-11-21 15:00', 'COT-ARCH-1', 'CASA CREATA', 'Ana Asesora', 'ana@grupoanipa.com', 'Cliente Archivado Manual', '9981000001', 'GANADA', 'Cierre en Piso', 'Anticipo recibido', '1', 'SALA MILAN SAND (1 pza)']
      ],
      HISTORIAL_MOVIMIENTOS: [],
      HISTORIAL_SEGUIMIENTO: []
    },
    stockBySku: {
      'SKU1': { sku: 'SKU1', modelo: 'MILAN', nombre: 'SALA MILAN SAND', cedis_bod: 4, cedis_pis: 1, casa_bod: 2, casa_pis: 0, precio: 25900 }
    },
    directoryRecords: [
      { nombre: 'Kevin Reyna', correo: 'kevin.reyna@grupoanipa.com', telefono: '9981112222', cargo: 'ADMIN', tab: 'PROYECTOS', esAdmin: true },
      { nombre: 'Ana Asesora', correo: 'ana@grupoanipa.com', telefono: '9983334444', cargo: 'ASESOR', tab: 'CASA CREATA', esAdmin: false }
    ]
  };

  let closedModuleCalled = false;
  const win = {
    localStorage: fakeStorage,
    sessionStorage: fakeStorage,
    location: { href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/inventario.html', search: '' },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    scrollY: 0,
    scrollTo: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    fetch: async (_url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      if (body.action === 'seg_get_delta' || body.action === 'seg_get_state') {
        return { ok: true, json: async () => fullStatePayload };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
    document: {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: (id) => rootEl.querySelector('#' + id),
      createElement: (tag) => new FakeElement(tag),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: class FakeBlob { constructor(parts) { this.parts = parts; } },
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    AbortController
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const ctx = vm.createContext(win);
  vm.runInContext(segJs, ctx, { filename: 'seguimiento-app.js' });

  assert.ok(win.CreataSeguimientoModule && typeof win.CreataSeguimientoModule.mount === 'function');

  const okMount = win.CreataSeguimientoModule.mount(rootEl, {
    session: {
      nombre: 'Kevin Reyna',
      correo: 'kevin.reyna@grupoanipa.com',
      cargo: 'ADMIN',
      esAdmin: true,
      authToken: 'MOCK_TOKEN_123',
      sheetTab: 'PROYECTOS'
    },
    onClose: () => { closedModuleCalled = true; }
  });
  assert.equal(okMount, true);

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(rootEl.querySelector('#seg_countActivas').textContent, '1', 'Only 1 open quote should be in Activas');
  assert.equal(rootEl.querySelector('#seg_countArchivadas').textContent, '2', 'Both ERP-Vendido and COTIZACIONES_ARCHIVADAS should be in Archivadas');

  const listEl = rootEl.querySelector('#seg_mobileCards');
  const tableEl = rootEl.querySelector('#seg_tableBody');
  assert.ok(listEl && tableEl, 'Must render seg_mobileCards and seg_tableBody');
  assert.ok(listEl.innerHTML.includes('COT-OPEN-1'), 'Activas tab must render open quote in cards');
  assert.ok(tableEl.innerHTML.includes('COT-OPEN-1'), 'Activas tab must render open quote in table');
  assert.ok(!listEl.innerHTML.includes('COT-ERP-SOLD'), 'Activas tab must hide ERP-Vendido quote');
  assert.ok(!listEl.innerHTML.includes('COT-ARCH-1'), 'Activas tab must hide archived quote');

  // Switch to Archivadas tab via delegated click
  const fakeArchBtn = {
    getAttribute: (k) => (k === 'data-seg-action' ? 'set-view-mode' : (k === 'data-view' ? 'ARCHIVADAS' : null))
  };
  rootEl.dispatch('click', {
    target: {
      dataset: {},
      closest: () => fakeArchBtn
    }
  });

  assert.ok(rootEl.querySelector('#seg_tabArchivadas').classList.contains('is-active'));
  assert.ok(!listEl.innerHTML.includes('COT-OPEN-1'), 'Archivadas tab must NOT show active quote');
  assert.ok(listEl.innerHTML.includes('COT-ERP-SOLD'), 'Archivadas tab must show ERP-Vendido quote');
  assert.ok(listEl.innerHTML.includes('Ganada (ERP)'), 'ERP-Vendido quote must display Ganada (ERP) badge');
  assert.ok(listEl.innerHTML.includes('COT-ARCH-1'), 'Archivadas tab must show manually archived quote');
  assert.ok(listEl.innerHTML.includes('Ver detalle'), 'Archived cards must provide Ver detalle action');
  assert.ok(tableEl.innerHTML.includes('COT-ARCH-1'), 'Archived table must show archived quote');

  // Searching an active client while on Archivadas tab STILL finds them immediately on Enter & blurs keyboard!
  const searchEl = rootEl.querySelector('#seg_filterSearch');
  searchEl.value = 'Cliente Abierto';
  rootEl.dispatch('keydown', { key: 'Enter', target: searchEl, preventDefault: () => {} });
  assert.equal(searchEl._blurred, true, 'Pressing Enter on mobile search should blur keyboard to show results');
  assert.ok(listEl.innerHTML.includes('COT-OPEN-1'), 'Searching client while on Archivadas tab must still find matching active client');

  // Clear search back to Archivadas view
  searchEl.value = '';
  rootEl.dispatch('search', { target: searchEl });

  // Open detail preview modal on archived quote COT-ARCH-1
  const fakePreviewBtn = {
    getAttribute: (k) => (k === 'data-seg-action' ? 'open-preview' : (k === 'data-folio' ? 'COT-ARCH-1' : null))
  };
  rootEl.dispatch('click', {
    target: {
      dataset: {},
      closest: () => fakePreviewBtn
    }
  });
  assert.equal(win.CreataSeguimientoModule.hasActiveOverlay(), true);
  assert.match(rootEl.querySelector('#seg_previewLastContacted').textContent, /Archivada.*GANADA/);

  // Back #1 closes preview modal
  const b1 = win.CreataSeguimientoModule.handleBackAction({ phase: 'all' });
  assert.equal(b1.handled, true);
  assert.equal(b1.action, 'seg_preview_modal');

  // Back #2 unwinds Archivadas -> Activas
  const b2 = win.CreataSeguimientoModule.handleBackAction({ phase: 'all' });
  assert.equal(b2.handled, true);
  assert.equal(b2.action, 'seg_view_activas');
  assert.ok(rootEl.querySelector('#seg_tabActivas').classList.contains('is-active'));
  assert.ok(listEl.innerHTML.includes('COT-OPEN-1'));

  // Back #3 exits module
  const b3 = win.CreataSeguimientoModule.handleBackAction({ phase: 'all' });
  assert.equal(b3.handled, true);
  assert.equal(b3.action, 'seg_close_module');
  assert.equal(closedModuleCalled, true);

  win.CreataSeguimientoModule.unmount();
});

// ============================================================================
// 5. ADVISOR CLIENT SEARCH REPAIR (GAS inv_search_erp_clients + TOKEN-AWARE ADVISOR MATCHING)
// ============================================================================
test('GAS Client Search Repair: parses ArrayOfCliente2 & plural tags, retries multi-word/accented & phone queries, falls back to recent quotes, and signals authRequired on expired tokens', () => {
  const env = buildTestGasEnv();
  const USERS = {
    'ana@grupoanipa.com': { correo: 'ana@grupoanipa.com', nombre: 'Ana Asesora', puesto: 'ASESOR', sheetTab: 'CASA CREATA', erpStore: 'CREATA CASA CREATA', isAdmin: false }
  };
  env.context.resolveAuthenticatedAdvisor_ = (_ss, _erp, body) => {
    const email = String((body && body.advisorEmail) || '').trim().toLowerCase();
    return USERS[email] ? { ok: true, advisor: USERS[email] } : { ok: false };
  };

  const post = (payload) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());
  const anaTok = env.context.issueInvAuthToken_('ana@grupoanipa.com', 'CASA CREATA');

  // 1) Expired / missing token returns authRequired: true so frontend prompts re-auth instead of silent error
  const expiredRes = post({ action: 'inv_search_erp_clients', authToken: 'EXPIRED_OR_INVALID', advisorEmail: 'ana@grupoanipa.com', query: 'Juan' });
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.authRequired, true);

  // 2) ArrayOfCliente2 wrapper MUST NOT swallow clients #2..N, AND multi-word accented query retries surname token!
  const filtersReceived = [];
  env.context.callSmuebleriaWcf_ = (method, innerXml) => {
    const fMatch = innerXml.match(/<Filtro>([\s\S]*?)<\/Filtro>/);
    const f = fMatch ? fMatch[1] : '';
    filtersReceived.push(method + ':' + f);
    if (method === 'ObtenerClientes' && f.toUpperCase() === 'MARIN') {
      return `
        <ObtenerClientesResponse>
          <ObtenerClientesResult>
            <a:ArrayOfCliente2>
              <a:Cliente2>
                <a:IdCliente>501</a:IdCliente>
                <a:NoCliente>CL501</a:NoCliente>
                <a:Nombre>RODRIGO</a:Nombre>
                <a:Paterno>MARIN</a:Paterno>
                <a:Celular>9981234567</a:Celular>
                <a:Correo>rodrigo@ejemplo.com</a:Correo>
              </a:Cliente2>
              <a:Cliente2>
                <a:IdCliente>502</a:IdCliente>
                <a:NoCliente>CL502</a:NoCliente>
                <a:Nombre>CARLOS</a:Nombre>
                <a:Paterno>MARIN</a:Paterno>
                <a:Celular>9987654321</a:Celular>
              </a:Cliente2>
            </a:ArrayOfCliente2>
          </ObtenerClientesResult>
        </ObtenerClientesResponse>
      `;
    }
    return '<ObtenerClientesResponse><ObtenerClientesResult /></ObtenerClientesResponse>';
  };

  const multiRes = post({
    action: 'inv_search_erp_clients',
    authToken: anaTok,
    advisorEmail: 'ana@grupoanipa.com',
    sheetTab: 'CASA CREATA',
    query: 'Rodrigo Marín'
  });
  assert.equal(multiRes.ok, true);
  assert.ok(multiRes.clients.length >= 1, 'Multi-word accented search must find Rodrigo Marin via token retry');
  assert.equal(multiRes.clients[0].idCliente, 501);
  assert.equal(multiRes.clients[0].nombre, 'RODRIGO MARIN');
  assert.ok(!multiRes.clients.some((c) => c.idCliente === 502), 'Local multi-token filter must exclude Carlos Marin when searching Rodrigo Marin');

  // 3) Phone search with spaces/dashes normalizes to 10 digits AND falls back to local COTIZACIONES_CREATA when ERP returns 0
  const fallbackRes = post({
    action: 'inv_search_erp_clients',
    authToken: anaTok,
    advisorEmail: 'ana@grupoanipa.com',
    sheetTab: 'CASA CREATA',
    query: '998 999 0001'
  });
  assert.equal(fallbackRes.ok, true);
  assert.equal(fallbackRes.usedLocalFallback, true);
  assert.ok(fallbackRes.clients.some((c) => c.type === 'COTIZACION' && c.nombre === 'Cliente Activo'), 'Must find returning client from local COTIZACIONES_CREATA by normalized phone digits');

  // 4) Token-order-independent advisor matching in matchesSegScope_ (Last-Name-First ERP names!)
  assert.equal(
    env.context.namesMatchTokenAware_('PALOMA IBAREZ', 'IBAREZ SALINAS STEPHANIE PALOMA'),
    true,
    'Advisor Paloma Ibarez must match Last-Name-First ERP name IBAREZ SALINAS STEPHANIE PALOMA'
  );
  assert.equal(
    env.context.namesMatchTokenAware_('GRETA TAPIA', 'TAPIA MORALES HEYSER GRETA ARANZA'),
    true,
    'Advisor Greta Tapia must match Last-Name-First ERP name TAPIA MORALES HEYSER GRETA ARANZA'
  );
});

