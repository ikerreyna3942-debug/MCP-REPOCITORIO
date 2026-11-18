/*
 * CREATA Muebles — Seguimiento de Cotizaciones en Vivo (seguimiento-app.js)
 * Conectado en tiempo real a:
 *  1) COTIZACIONES BASE DE DATOS (1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg)
 *  2) CONTROL DE PRODUCTOS PRESENTACIÓN (1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8: COTIZACIONES_EN_VIVO + INVENTARIO_EN_VIVO)
 *  3) Web App Google Apps Script + S Mueblería ERP WCF 24/7
 */

const SHEET_SEG_ID = '1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg';
const SHEET_INV_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

const SEG_SESSION_KEY = 'creata_seg_session_v1';
const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
const SEG_MANUAL_LOGOUT_KEY = 'creata_seg_manual_logout_v1';
const INV_UPDATED_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
const SEG_UPDATED_KEYS_STORAGE = 'creata_seg_updated_keys_v1';
const APP_QUOTES_BRIDGE_KEY = 'creata_live_app_quotes_bridge_v1';
const SEG_CLOSURES_CACHE_KEY = 'creata_seg_closures_v1';
const SEG_PHONES_CACHE_KEY = 'creata_seg_phones_v1';
const SEG_CONTACTED_CACHE_KEY = 'creata_seg_contacted_v1';
const SEG_AUDIT_CACHE_KEY = 'creata_seg_audit_v1';

const SUCURSAL_RULES = {
  'PLAYA': {
    label: 'Playa del Carmen',
    erp_cotizacion_sucursal: 'CREATA LIVING PLAYA',
    cedis: 'CEDIS',
    tienda: 'CREATA LIVING PLAYA',
    descripcion_regla: 'CEDIS + Tienda Playa del Carmen'
  },
  'COLOSIO': {
    label: 'Colosio',
    erp_cotizacion_sucursal: 'CREATA LIVING COLOSIO',
    cedis: 'CEDIS',
    tienda: 'CREATA LIVING COLOSIO',
    descripcion_regla: 'CEDIS + Tienda Colosio'
  },
  'PUERTO CANCUN': {
    label: 'Puerto Cancún (PTC)',
    erp_cotizacion_sucursal: 'CREATA PUERTO CANCUN',
    cedis: 'CEDIS',
    tienda: 'CREATA PUERTO CANCUN',
    descripcion_regla: 'CEDIS + Tienda Puerto Cancún'
  },
  'CASA CREATA': {
    label: 'Casa Creata',
    erp_cotizacion_sucursal: 'CASA CREATA BONAMPAK',
    cedis: 'CEDIS',
    tienda: 'CASA CREATA BONAMPAK',
    descripcion_regla: 'CEDIS + Tienda Casa Creata'
  },
  'PROYECTOS': {
    label: 'Proyectos',
    erp_cotizacion_sucursal: 'PROYECTOS ANIPA INTERIOR',
    cedis: 'CEDIS',
    tienda: null,
    descripcion_regla: 'Solo CEDIS'
  }
};

const BUILTIN_ADVISORS = [
  { sucursal: 'PLAYA', nombre: 'Julio Cruz', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'juliocruz@creatamuebles.com', telefono: '9842289538' },
  { sucursal: 'PLAYA', nombre: 'Rocio Esquivel', puesto: 'Gerente De Tienda', es_gerente: true, correo: 'rocio.esquivel@creatamuebles.com', telefono: '9841329513' },
  { sucursal: 'PLAYA', nombre: 'Juan Dzul', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'juan.dz@creatamuebles.com', telefono: '9841712145' },
  { sucursal: 'PLAYA', nombre: 'Samantha Silva', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'samantha.silva@creatamuebles.com', telefono: '9842185856' },
  { sucursal: 'COLOSIO', nombre: 'Fernanda Perez', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'fernanda.perez@creatamuebles.com', telefono: '4492271386' },
  { sucursal: 'COLOSIO', nombre: 'Aguasanta Mdz', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'aguasanta.mdz@creatamuebles.com', telefono: '9981891998' },
  { sucursal: 'COLOSIO', nombre: 'Juan Carlos', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'juan.hdz@creatamuebles.com', telefono: '9981962637' },
  { sucursal: 'COLOSIO', nombre: 'Janine Medina', puesto: 'Gerente De Tienda', es_gerente: true, correo: 'janine.medina@creatamuebles.com', telefono: '9989390753' },
  { sucursal: 'COLOSIO', nombre: 'Miguel Sanchez', puesto: 'Gerente De Tienda', es_gerente: true, correo: 'miguel.sanchez@creatamuebles.com', telefono: '9987671626' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Daniela Arroyo', puesto: 'Asesora Interiorista', es_gerente: false, correo: 'daniela.arroyo@creatamuebles.com', telefono: '9983212993' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Eloisa Montoya', puesto: 'Asesora De Proyectos', es_gerente: false, correo: 'eloisa.montoya@creatamuebles.com', telefono: '9982143601' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Alexa Padilla', puesto: 'Gerente De Tienda', es_gerente: true, correo: 'alexa.padilla@creatamuebles.com', telefono: '9984411515' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Paula Duran', puesto: 'Asesora Interiorista', es_gerente: false, correo: 'paula.duran@creatamuebles.com', telefono: '9982142421' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Lupita Sanchez', puesto: 'Gerente De Tienda', es_gerente: true, correo: 'lupita.sanchez@creatamuebles.com', telefono: '9981111841' },
  { sucursal: 'PUERTO CANCUN', nombre: 'Viridiana Castellanos', puesto: 'Asesor De Ventas', es_gerente: false, correo: 'viridiana.castellanos@creatamuebles.com', telefono: '5535660658' },
  { sucursal: 'CASA CREATA', nombre: 'Gonzalez Salas Juan Pablo', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'pablo.gonzalez@creatamuebles.com', telefono: '1234' },
  { sucursal: 'CASA CREATA', nombre: 'Ibarez Salinas Stephanie Paloma', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'paloma.ibarez@creatamuebles.com', telefono: '9981000000' },
  { sucursal: 'CASA CREATA', nombre: 'Tapia Morales Heyser Greta Aranza', puesto: 'Asesor Interiorista', es_gerente: false, correo: 'greta.tapia@creatamuebles.com', telefono: '9981000001' },
  { sucursal: 'PROYECTOS', nombre: 'Johanna Solarte', puesto: 'Asesora De Ventas', es_gerente: false, correo: 'johanna.solarte@creatamuebles.com', telefono: '9983554021' },
  { sucursal: 'PROYECTOS', nombre: 'Renato Cuevas', puesto: 'Coordinador De Proyectos', es_gerente: false, correo: 'renato.cuevas@creatamuebles.com', telefono: '9980645934' },
  { sucursal: 'PROYECTOS', nombre: 'Angel Dadvid', puesto: 'Arquitecto Interiorista', es_gerente: false, correo: 'angel.izquierdo@creatamuebles.com', telefono: '9932620907' },
  { sucursal: 'PROYECTOS', nombre: 'Julian Arevalo', puesto: 'Arquitecto Interiorista', es_gerente: false, correo: 'julian.arevalo@creatamuebles.com', telefono: '9321255062' },
  { sucursal: 'PROYECTOS', nombre: 'Mildred Pacheco Saavedra', puesto: 'Interiorista Corporativa', es_gerente: false, correo: 'mildred.pacheco@creatamuebles.com', telefono: '4423422302' },
  { sucursal: 'PROYECTOS', nombre: 'Nelson Hernandez Rodríguez', puesto: 'Gerente Comercial De Proyectos', es_gerente: true, correo: 'gte.proyectos@creatamuebles.com', telefono: '9981473210' }
];

let APP_STATE = {
  user: null,
  quotes: [],
  rawPartidas: [],
  sucursales: SUCURSAL_RULES,
  advisors: [],
  directoryRecords: [],
  inventoryBySku: {},
  inventoryByName: {},
  closures: {},
  auditLogs: [],
  config: {
    DIAS_SEGUIMIENTO: 3,
    UMBRAL_CAIDA_PORCENTAJE: 30,
    UMBRAL_PIEZAS_CRITICO: 5,
    ALERTA_SOLO_PISO: 'SI'
  },
  commercial_cycle: getCommercialCycleInfo(),
  last_erp_sync: 'En vivo'
};

let ACTIVE_MODAL_QUOTE = null;
let ACTIVE_RECIPIENT = 'CLIENTE';
let ACTIVE_MODAL_TPL_KEY = 'EMOCIONAL';
let SELECTED_ITEMS_SET = new Set();
let ACTIVE_CLOSE_FOLIO = null;
let ACTIVE_CLOSE_STATUS = 'GANADA';

let AUDIT_STATE = {
  activeTab: 'LOGINS',
  logs: [],
  stats: {}
};

// ==============================================================================
// UTILIDADES GENERALES
// ==============================================================================
function cleanStr(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function normalizeText(txt) {
  return cleanStr(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmail(raw) {
  return cleanStr(raw).toLowerCase().replace(/,/g, '.');
}

function cleanPhone(val) {
  const digits = cleanStr(val).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return '';
}

function formatNowStr(includeSeconds = false) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return includeSeconds ? `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}` : `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function getCommercialCycleInfo() {
  const now = new Date();
  let startDt;
  if (now.getDate() >= 25) {
    startDt = new Date(now.getFullYear(), now.getMonth(), 25);
  } else {
    startDt = new Date(now.getFullYear(), now.getMonth() - 1, 25);
  }
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const yyyy = startDt.getFullYear();
  const mm = String(startDt.getMonth() + 1).padStart(2, '0');
  const dd = String(startDt.getDate()).padStart(2, '0');
  return {
    start_date: `${yyyy}-${mm}-${dd}`,
    start_label: `25 de ${months[startDt.getMonth()]} de ${yyyy}`
  };
}

function parseCsvSimple(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

async function fetchSheetCsv(sheetId, sheetName, rangeOpt = '') {
  const rangeParam = rangeOpt ? `&range=${encodeURIComponent(rangeOpt)}` : '';
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}${rangeParam}&_t=${Date.now()}`;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp || !resp.ok) return [];
    const txt = await resp.text();
    if (!txt || txt.trim().startsWith('<')) return [];
    return parseCsvSimple(txt);
  } catch (e) {
    return [];
  }
}

function getWebAppUrl() {
  if (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function') {
    const u = window.CREATA_CLOUD_CONFIG.getApiUrl();
    if (u) return u;
  }
  return CANONICAL_WEBAPP_URL;
}

async function callWebAppPost(payload, timeoutMs = 10000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(getWebAppUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });
    if (!resp || !resp.ok) return { ok: false };
    return (await resp.json()) || { ok: false };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJsonStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

// ==============================================================================
// ROLES, SUCURSALES Y DIRECTORIO UNIFICADO DE USUARIOS (AMBAS HOJAS EN VIVO)
// ==============================================================================
function mapTabToBranchKey(tabOrBranch) {
  const u = normalizeText(tabOrBranch);
  if (u.includes('ADMINISTRATIV') || u === 'TODAS') return 'TODAS';
  if (u.includes('PLAYA') || u === 'PL') return 'PLAYA';
  if (u.includes('COLOSIO') || u.includes('COLOCIO') || u.includes('OUTLET') || u === 'DTC' || u === 'OUT') return 'COLOSIO';
  if (u.includes('PTC') || u.includes('PUERTO')) return 'PUERTO CANCUN';
  if (u.includes('CASA') || u === 'CCB') return 'CASA CREATA';
  if (u.includes('PROYECTO') || u === 'PRO') return 'PROYECTOS';
  return 'PROYECTOS';
}

function getBranchLabel(branchKey) {
  if (branchKey === 'TODAS') return 'Todas las Tiendas';
  return (SUCURSAL_RULES[branchKey] && SUCURSAL_RULES[branchKey].label) || branchKey;
}

function isMasterExecutive(correo, puesto = '', sucursal = '') {
  const c = normalizeEmail(correo);
  const p = normalizeText(puesto);
  const s = normalizeText(sucursal);
  if (['kevin.reyna@grupoanipa.com', 'santiago.torres@grupoanipa.com', 'preci3942@gmail.com'].includes(c)) {
    return true;
  }
  if (s.includes('ADMINISTRATIV') || s === 'TODAS') return true;
  if (['DIRECCION', 'DIRECTOR', 'ADMINISTRADOR', 'GERENCIA GENERAL', 'GERENTE COMERCIAL', 'IMPLEMENTACION'].some(k => p.includes(k))) {
    if (!p.includes('PROYECTOS')) return true;
  }
  return false;
}

function isGerenteRole(puesto = '', isMaster = false) {
  if (isMaster) return true;
  const p = normalizeText(puesto);
  return ['GERENTE', 'COORDINADOR', 'ENCARGAD', 'LIDER', 'JEFE', 'DIRECT'].some(k => p.includes(k));
}

function isKevinReyna(user) {
  if (!user) return false;
  const c = normalizeEmail(user.correo);
  const n = normalizeText(user.nombre);
  const p = normalizeText(user.puesto);
  return c === 'kevin.reyna@grupoanipa.com' || n.includes('KEVIN REYNA') || p === 'IMPLEMENTACION';
}

async function fetchUnifiedAdvisorsDirectory() {
  const segTabs = [
    { tab: 'CUENTAS ADMINISTRATIVAS', branch: 'TODAS' },
    { tab: 'PLAYA', branch: 'PLAYA' },
    { tab: 'COLOCIO', branch: 'COLOSIO' },
    { tab: 'PTC', branch: 'PUERTO CANCUN' },
    { tab: 'CASA CREATA', branch: 'CASA CREATA' },
    { tab: 'PROYECTOS', branch: 'PROYECTOS' }
  ];
  const invTabs = [
    { tab: 'PLAYA', branch: 'PLAYA' },
    { tab: 'COLOCIO', branch: 'COLOSIO' },
    { tab: 'OUTLET COLOSIO', branch: 'COLOSIO' },
    { tab: 'PTC', branch: 'PUERTO CANCUN' },
    { tab: 'CASA CREATA', branch: 'CASA CREATA' },
    { tab: 'PROYECTOS', branch: 'PROYECTOS' }
  ];

  const [segResults, invResults] = await Promise.all([
    Promise.all(segTabs.map(async t => ({ ...t, source: 'SEG', rows: await fetchSheetCsv(SHEET_SEG_ID, t.tab, 'A1:G40') }))),
    Promise.all(invTabs.map(async t => ({ ...t, source: 'INV', rows: await fetchSheetCsv(SHEET_INV_ID, t.tab, 'A1:I40') })))
  ]);

  const updatedInvKeys = readJsonStorage(INV_UPDATED_KEYS_STORAGE, {});
  const updatedSegKeys = readJsonStorage(SEG_UPDATED_KEYS_STORAGE, {});

  const records = [];
  const allTabResults = [...segResults, ...invResults];

  for (const res of allTabResults) {
    const rows = res.rows || [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx] || [];
      const nombre = cleanStr(r[2]);
      const puesto = cleanStr(r[3]) || 'Asesor Interiorista';
      const correo = normalizeEmail(r[4]);
      if (!nombre || !correo || !correo.includes('@')) continue;
      if (['NOMBRE', 'ASESOR', 'EJECUTIVO'].includes(normalizeText(nombre))) continue;

      let pwdTemp = cleanStr(r[5]).replace(/\.0$/, '');
      let pwdDef = cleanStr(r[6]).replace(/\.0$/, '');
      if (updatedSegKeys[correo]) pwdDef = cleanStr(updatedSegKeys[correo]);
      else if (updatedInvKeys[correo]) pwdDef = cleanStr(updatedInvKeys[correo]);

      const isMaster = isMasterExecutive(correo, puesto, res.tab);
      const esGerente = isGerenteRole(puesto, isMaster);
      const sucursalKey = isMaster && res.branch === 'TODAS' ? 'TODAS' : res.branch;

      records.push({
        source: res.source,
        sheet_tab: res.tab,
        sheet_row: idx + 1,
        sucursal: sucursalKey,
        sucursal_label: getBranchLabel(sucursalKey),
        nombre,
        puesto,
        correo,
        telefono: cleanPhone(pwdTemp),
        password_temporal: pwdTemp,
        password_definitiva: pwdDef,
        es_gerente: esGerente,
        es_admin: isMaster,
        is_master: isMaster,
        tokens: normalizeText(nombre).split(' ').filter(t => t.length > 2)
      });
    }
  }

  // Fallback builtin advisors if any missing
  for (const b of BUILTIN_ADVISORS) {
    const em = normalizeEmail(b.correo);
    if (!records.some(r => r.correo === em && r.sucursal === b.sucursal)) {
      records.push({
        source: 'BUILTIN',
        sheet_tab: b.sucursal === 'COLOSIO' ? 'COLOCIO' : (b.sucursal === 'PUERTO CANCUN' ? 'PTC' : b.sucursal),
        sheet_row: 0,
        sucursal: b.sucursal,
        sucursal_label: getBranchLabel(b.sucursal),
        nombre: b.nombre,
        puesto: b.puesto,
        correo: em,
        telefono: cleanPhone(b.telefono),
        password_temporal: cleanStr(b.telefono),
        password_definitiva: '',
        es_gerente: Boolean(b.es_gerente),
        es_admin: false,
        is_master: false,
        tokens: normalizeText(b.nombre).split(' ').filter(t => t.length > 2)
      });
    }
  }

  // Build deduplicated advisors list and collect all branches + all valid passwords per email
  const byEmail = {};
  for (const rec of records) {
    if (!byEmail[rec.correo]) {
      byEmail[rec.correo] = {
        primary: rec,
        branches: new Set(),
        passwordsDef: new Set(),
        passwordsTemp: new Set(),
        phones: new Set()
      };
    }
    const g = byEmail[rec.correo];
    if (rec.sucursal && rec.sucursal !== 'TODAS') g.branches.add(rec.sucursal);
    if (rec.password_definitiva) g.passwordsDef.add(rec.password_definitiva);
    if (rec.password_temporal) g.passwordsTemp.add(rec.password_temporal);
    if (rec.telefono) g.phones.add(rec.telefono);
    if (rec.is_master) g.primary.is_master = true;
    if (rec.es_gerente) g.primary.es_gerente = true;
  }

  const advisors = [];
  const seenAdvKey = new Set();
  for (const rec of records) {
    const info = byEmail[rec.correo];
    rec.all_branches = Array.from(info.branches);
    rec.all_passwords_def = Array.from(info.passwordsDef);
    rec.all_passwords_temp = Array.from(info.passwordsTemp);
    if (!rec.telefono && info.phones.size > 0) {
      rec.telefono = Array.from(info.phones)[0];
    }
    if (rec.sucursal !== 'TODAS') {
      const k = `${rec.sucursal}::${rec.correo}`;
      if (!seenAdvKey.has(k)) {
        seenAdvKey.add(k);
        advisors.push(rec);
      }
    }
  }

  APP_STATE.directoryRecords = records;
  APP_STATE.advisors = advisors;
  return { records, advisors, byEmail };
}

function buildUserSessionObject(matchedRec, byEmailMap) {
  const em = normalizeEmail(matchedRec.correo);
  const grp = (byEmailMap && byEmailMap[em]) || null;
  const allBranches = grp ? Array.from(grp.branches) : (matchedRec.sucursal && matchedRec.sucursal !== 'TODAS' ? [matchedRec.sucursal] : []);
  const hasMultipleBranches = allBranches.length > 1;
  const isMaster = Boolean(matchedRec.is_master || isMasterExecutive(em, matchedRec.puesto, matchedRec.sucursal));
  const esGerente = Boolean(matchedRec.es_gerente || isMaster || hasMultipleBranches);
  const primaryBranch = isMaster ? 'TODAS' : (matchedRec.sucursal || allBranches[0] || 'PROYECTOS');
  const hasDefPwd = grp ? grp.passwordsDef.size > 0 : Boolean(matchedRec.password_definitiva);

  return {
    nombre: matchedRec.nombre,
    correo: em,
    telefono: matchedRec.telefono || '',
    sucursal: primaryBranch,
    sucursal_label: isMaster ? 'Todas las Tiendas' : (hasMultipleBranches ? allBranches.map(getBranchLabel).join(' / ') : getBranchLabel(primaryBranch)),
    all_branches: allBranches,
    puesto: matchedRec.puesto || 'Asesor Interiorista',
    sheet_tab: matchedRec.sheet_tab || primaryBranch,
    sheet_row: matchedRec.sheet_row || 0,
    es_gerente: esGerente,
    es_admin: isMaster,
    is_master: isMaster,
    debe_cambiar_password: Boolean(!hasDefPwd && !isMaster)
  };
}

function tryRestoreExistingSession(byEmailMap) {
  try {
    if (sessionStorage.getItem(SEG_MANUAL_LOGOUT_KEY) === '1') return null;
  } catch (e) {}

  // 1. Direct Seguimiento session
  const segSaved = readJsonStorage(SEG_SESSION_KEY, null);
  if (segSaved && segSaved.correo) {
    const em = normalizeEmail(segSaved.correo);
    if (byEmailMap && byEmailMap[em]) {
      const fresh = buildUserSessionObject(byEmailMap[em].primary, byEmailMap);
      fresh.debe_cambiar_password = Boolean(segSaved.debe_cambiar_password && fresh.debe_cambiar_password);
      writeJsonStorage(SEG_SESSION_KEY, fresh);
      return fresh;
    }
    return segSaved;
  }

  // 2. SSO from inventario.html (Cotizador / App) — skip view-only INVITADOS
  const invSaved = readJsonStorage(INV_SESSION_KEY, null);
  if (invSaved && invSaved.correo && !invSaved.isGuest && !invSaved.viewOnly && String(invSaved.sheetTab || '').toUpperCase() !== 'INVITADOS') {
    const em = normalizeEmail(invSaved.correo);
    if (byEmailMap && byEmailMap[em]) {
      const ssoUser = buildUserSessionObject(byEmailMap[em].primary, byEmailMap);
      const activeInvBranch = mapTabToBranchKey(invSaved.sheetTab || invSaved.erpStore || '');
      if (!ssoUser.is_master && activeInvBranch && activeInvBranch !== 'TODAS') {
        ssoUser.sucursal = activeInvBranch;
      }
      ssoUser.debe_cambiar_password = false;
      writeJsonStorage(SEG_SESSION_KEY, ssoUser);
      return ssoUser;
    }
    const branchKey = mapTabToBranchKey(invSaved.sheetTab || invSaved.erpStore || '');
    const isMaster = Boolean(invSaved.isAdmin || isMasterExecutive(em, invSaved.puesto, invSaved.sheetTab));
    const fallbackUser = {
      nombre: invSaved.nombre || em,
      correo: em,
      telefono: '',
      sucursal: isMaster ? 'TODAS' : branchKey,
      sucursal_label: isMaster ? 'Todas las Tiendas' : getBranchLabel(branchKey),
      all_branches: Array.isArray(invSaved.allLocations)
        ? Array.from(new Set(invSaved.allLocations.map(l => mapTabToBranchKey(l.sheetTab || l.erpStore)).filter(b => b && b !== 'TODAS')))
        : [branchKey],
      puesto: invSaved.puesto || 'Asesor Interiorista',
      sheet_tab: invSaved.sheetTab || branchKey,
      sheet_row: 0,
      es_gerente: Boolean(invSaved.isManager || isMaster),
      es_admin: isMaster,
      is_master: isMaster,
      debe_cambiar_password: false
    };
    writeJsonStorage(SEG_SESSION_KEY, fallbackUser);
    return fallbackUser;
  }

  return null;
}

function authenticateAgainstDirectory(identificador, password, dirData) {
  const identRaw = cleanStr(identificador);
  const identEmail = normalizeEmail(identRaw);
  const identNorm = normalizeText(identRaw);
  const identPhone = cleanPhone(identRaw);
  const pwd = cleanStr(password);
  if (!identRaw || !pwd) return null;

  // PIN maestro directo
  if ((identRaw.toUpperCase() === 'ADMIN' || identRaw === '2717') && pwd === '2717') {
    return {
      nombre: 'Dirección General (Master)',
      correo: 'admin@creatamuebles.com',
      telefono: '',
      sucursal: 'TODAS',
      sucursal_label: 'Todas las Tiendas',
      all_branches: ['PLAYA', 'COLOSIO', 'PUERTO CANCUN', 'CASA CREATA', 'PROYECTOS'],
      puesto: 'Dirección General',
      sheet_tab: 'CUENTAS ADMINISTRATIVAS',
      sheet_row: 0,
      es_gerente: true,
      es_admin: true,
      is_master: true,
      debe_cambiar_password: false
    };
  }

  const records = (dirData && dirData.records) || APP_STATE.directoryRecords || [];
  const byEmail = (dirData && dirData.byEmail) || {};

  for (const rec of records) {
    const emailMatch = identEmail && identEmail === rec.correo;
    const phoneMatch = identPhone && identPhone.length === 10 && identPhone === rec.telefono;
    const nameMatch = identNorm && identNorm.length >= 4 && (identNorm === normalizeText(rec.nombre) || normalizeText(rec.nombre).includes(identNorm));
    if (!emailMatch && !phoneMatch && !nameMatch) continue;

    const grp = byEmail[rec.correo];
    const defList = grp ? Array.from(grp.passwordsDef) : (rec.password_definitiva ? [rec.password_definitiva] : []);
    const tempList = grp ? Array.from(grp.passwordsTemp) : (rec.password_temporal ? [rec.password_temporal] : []);

    // Accept ANY definitive password configured across either spreadsheet (Cotizador or Seguimiento)
    if (defList.includes(pwd)) {
      const userObj = buildUserSessionObject(rec, byEmail);
      userObj.debe_cambiar_password = false;
      return userObj;
    }
    // Also accept temporary password if definitive password wasn't set on that tab
    if (tempList.includes(pwd) || (rec.telefono && pwd === rec.telefono)) {
      const userObj = buildUserSessionObject(rec, byEmail);
      userObj.debe_cambiar_password = Boolean(defList.length === 0 && !userObj.is_master);
      return userObj;
    }
  }

  if (['kevin.reyna@grupoanipa.com', 'kevin reyna'].includes(identEmail) && ['Kevin392', 'Kevin2026!', 'kevin123', '2717'].includes(pwd)) {
    return {
      nombre: 'Irvin Kevin Reyna Valdez',
      correo: 'kevin.reyna@grupoanipa.com',
      telefono: '',
      sucursal: 'TODAS',
      sucursal_label: 'Todas las Tiendas',
      all_branches: ['PLAYA', 'COLOSIO', 'PUERTO CANCUN', 'CASA CREATA', 'PROYECTOS'],
      puesto: 'IMPLEMENTACIÓN',
      sheet_tab: 'CUENTAS ADMINISTRATIVAS',
      sheet_row: 4,
      es_gerente: true,
      es_admin: true,
      is_master: true,
      debe_cambiar_password: false
    };
  }

  return null;
}

// ==============================================================================
// MOTOR DE INVENTARIO Y COTIZACIONES EN VIVO (ERP + COTIZACIONES_CREATA + APP)
// ==============================================================================
function parseInventoryRows(invRows) {
  const bySku = {};
  const byName = {};
  let syncBanner = '';

  if (invRows && invRows.length >= 2) {
    syncBanner = cleanStr((invRows[1] && invRows[1][48]) || '');
  }

  for (let i = 2; i < (invRows || []).length; i++) {
    const r = invRows[i];
    if (!r || !r[0]) continue;
    const sku = cleanStr(r[0]).toUpperCase();
    if (!sku) continue;
    const obj = {
      sku,
      tipo: cleanStr(r[1]),
      modelo: cleanStr(r[2]),
      nombre: cleanStr(r[3]),
      cedis_bod: parseInt(r[20] || '0', 10) || 0,
      cedis_pis: parseInt(r[21] || '0', 10) || 0,
      casa_bod: parseInt(r[22] || '0', 10) || 0,
      casa_pis: parseInt(r[23] || '0', 10) || 0,
      ptc_bod: parseInt(r[24] || '0', 10) || 0,
      ptc_pis: parseInt(r[25] || '0', 10) || 0,
      col_bod: parseInt(r[26] || '0', 10) || 0,
      col_pis: parseInt(r[27] || '0', 10) || 0,
      pla_bod: parseInt(r[28] || '0', 10) || 0,
      pla_pis: parseInt(r[29] || '0', 10) || 0,
      out_bod: parseInt(r[30] || '0', 10) || 0,
      out_pis: parseInt(r[31] || '0', 10) || 0,
      precio: parseFloat(String(r[49] || '0').replace(/[^0-9.]/g, '')) || 0
    };
    bySku[sku] = obj;
    const nNorm = normalizeText(obj.nombre);
    if (nNorm && !byName[nNorm]) byName[nNorm] = obj;
  }

  APP_STATE.inventoryBySku = bySku;
  APP_STATE.inventoryByName = byName;
  if (syncBanner) {
    APP_STATE.last_erp_sync = syncBanner.replace(/^EN VIVO\s*\|\s*/i, '').trim() || syncBanner;
  }
}

function calculateStockForBranch(skuRaw, sucursalKey) {
  const sku = cleanStr(skuRaw).toUpperCase();
  const prod = APP_STATE.inventoryBySku[sku];
  const suc = cleanStr(sucursalKey).toUpperCase();
  const rule = SUCURSAL_RULES[suc] || SUCURSAL_RULES['PROYECTOS'];

  if (!prod) {
    return null;
  }

  const cedis_bodega = prod.cedis_bod;
  const cedis_piso = prod.cedis_pis;
  const cedis_total = cedis_bodega + cedis_piso;

  let tienda_bodega = 0;
  let tienda_piso = 0;
  if (suc.includes('PLAYA')) {
    tienda_bodega = prod.pla_bod;
    tienda_piso = prod.pla_pis;
  } else if (suc.includes('COLOSIO') || suc.includes('COLOCIO')) {
    tienda_bodega = prod.col_bod;
    tienda_piso = prod.col_pis;
  } else if (suc.includes('PUERTO') || suc.includes('PTC')) {
    tienda_bodega = prod.ptc_bod;
    tienda_piso = prod.ptc_pis;
  } else if (suc.includes('CASA')) {
    tienda_bodega = prod.casa_bod;
    tienda_piso = prod.casa_pis;
  }

  const tienda_total = tienda_bodega + tienda_piso;
  const total_disponible = cedis_total + tienda_total;
  const partes = [`${cedis_total} en CEDIS`];
  if (rule && rule.tienda) {
    partes.push(`${tienda_bodega} en bodega + ${tienda_piso} en piso ${rule.label}`);
  }

  return {
    cedis_bodega,
    cedis_piso,
    cedis_total,
    tienda_bodega,
    tienda_piso,
    tienda_total,
    total_disponible,
    detalle_ubicacion: partes.join(' y ')
  };
}

function evaluateItemUrgency(it) {
  const cfg = APP_STATE.config || {};
  const sucursal = cleanStr(it.Sucursal || 'PROYECTOS').toUpperCase();
  const rule = SUCURSAL_RULES[sucursal] || SUCURSAL_RULES['PROYECTOS'];

  const stockIni = parseInt(it.Stock_Inicial_Total || '0', 10) || 0;
  const cedisBod = parseInt(it.Stock_Actual_CEDIS_Bodega || '0', 10) || 0;
  const cedisPis = parseInt(it.Stock_Actual_CEDIS_Piso || '0', 10) || 0;
  const tdaBod = parseInt(it.Stock_Actual_Tienda_Bodega || '0', 10) || 0;
  const tdaPis = parseInt(it.Stock_Actual_Tienda_Piso || '0', 10) || 0;
  const cantPedida = Math.max(1, parseInt(it.Cantidad_Cotizada || '1', 10) || 1);

  const cedisTotal = cedisBod + cedisPis;
  const stockAct = cedisTotal + tdaBod + tdaPis;

  const variacion = stockAct - stockIni;
  const caidaUnidades = Math.max(0, stockIni - stockAct);
  const pctCaida = stockIni > 0 ? Math.round((caidaUnidades / stockIni) * 1000) / 10 : 0.0;

  const umbralPct = parseFloat(cfg.UMBRAL_CAIDA_PORCENTAJE || '30') || 30;
  const umbralPzas = parseInt(cfg.UMBRAL_PIEZAS_CRITICO || '5', 10) || 5;
  const diasSeg = parseInt(cfg.DIAS_SEGUIMIENTO || '3', 10) || 3;
  const alertaSoloPiso = cleanStr(cfg.ALERTA_SOLO_PISO || 'SI').toUpperCase() === 'SI';

  const fechaCotStr = cleanStr(it.Fecha_Cotizacion).slice(0, 10);
  let diasTranscurridos = 0;
  if (fechaCotStr) {
    const dt = new Date(fechaCotStr + 'T00:00:00');
    if (!isNaN(dt.getTime())) {
      diasTranscurridos = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
    }
  }

  const soloQuedaPiso = (stockAct > 0 && cedisBod === 0 && tdaBod === 0 && (cedisPis + tdaPis) > 0);

  let nivel = 'ESTABLE';
  let motivo = 'Stock disponible';

  if (stockAct === 0) {
    nivel = 'CRITICO';
    motivo = 'Agotado (0 pzas)';
  } else if (stockAct < cantPedida) {
    nivel = 'CRITICO';
    motivo = `Stock insuficiente (${stockAct} de ${cantPedida} pzas)`;
  } else if (alertaSoloPiso && soloQuedaPiso) {
    nivel = 'SOLO_PISO';
    motivo = `Solo queda en piso (${stockAct} pza)`;
  } else if (stockAct <= umbralPzas || pctCaida >= umbralPct) {
    nivel = 'CRITICO';
    motivo = stockAct <= umbralPzas ? `Últimas ${stockAct} piezas` : `Bajó ${pctCaida}% el stock`;
  } else if (caidaUnidades > 0) {
    nivel = 'BAJADA';
    motivo = `Bajó de ${stockIni} a ${stockAct} piezas`;
  } else if (diasTranscurridos >= diasSeg) {
    nivel = 'SEGUIMIENTO_DIAS';
    motivo = `${diasTranscurridos} días desde cotización`;
  }

  const partesLoc = [`${cedisTotal} en CEDIS`];
  if (rule && rule.tienda) {
    partesLoc.push(`${tdaBod} en bodega + ${tdaPis} en piso ${rule.label}`);
  }

  it.Stock_Actual_Total = String(stockAct);
  it.Variacion_Stock = String(variacion);
  it.Porcentaje_Caida = `${pctCaida.toFixed(1)}%`;
  it.Nivel_Urgencia = nivel;
  it.Motivo_Urgencia = motivo;
  it.Detalle_Ubicacion = partesLoc.join(' y ');
  it.Dias_Transcurridos = diasTranscurridos;
  it.Solo_Queda_Piso = soloQuedaPiso;
  return it;
}

function matchAdvisorInfo(vendedorOrName, correoRaw, sucursalKey) {
  const em = normalizeEmail(correoRaw);
  const advisors = APP_STATE.advisors || [];
  if (em) {
    const byEm = advisors.find(a => a.correo === em && a.sucursal === sucursalKey) || advisors.find(a => a.correo === em);
    if (byEm) return byEm;
  }
  const vNorm = normalizeText(vendedorOrName);
  if (!vNorm) return null;
  let best = null;
  let bestScore = 0;
  for (const adv of advisors) {
    const tokens = adv.tokens || [];
    let score = 0;
    for (const t of tokens) {
      if (vNorm.includes(t)) score += 1;
    }
    if (adv.sucursal === sucursalKey && score > 0) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = adv;
    }
  }
  return bestScore >= 1 ? best : null;
}

function parseDateToIso(raw) {
  const s = cleanStr(raw);
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function groupQuotesByFolio(itemsList, closuresMap) {
  const priorityOrder = { 'CRITICO': 5, 'SOLO_PISO': 4, 'BAJADA': 3, 'SEGUIMIENTO_DIAS': 2, 'ESTABLE': 1 };
  const grouped = new Map();

  for (const it of itemsList) {
    const folio = cleanStr(it.Folio_ERP).toUpperCase();
    if (!folio) continue;
    if (!grouped.has(folio)) {
      const sucKey = cleanStr(it.Sucursal || 'PROYECTOS').toUpperCase();
      grouped.set(folio, {
        Folio_ERP: folio,
        Fecha_Cotizacion: it.Fecha_Cotizacion || '',
        Sucursal: sucKey,
        Sucursal_Label: getBranchLabel(sucKey),
        Asesor: it.Asesor || '',
        Correo_Asesor: normalizeEmail(it.Correo_Asesor),
        Tel_Asesor: it.Tel_Asesor || '',
        Cliente: it.Cliente || '',
        WhatsApp_Cliente: cleanPhone(it.WhatsApp_Cliente),
        Estatus_ERP: it.Estatus_ERP || 'Cotizado',
        Fecha_Ultimo_Aviso: it.Fecha_Ultimo_Aviso || '',
        Nivel_Urgencia: it.Nivel_Urgencia || 'ESTABLE',
        Motivo_Urgencia: it.Motivo_Urgencia || 'Stock disponible',
        Dias_Transcurridos: it.Dias_Transcurridos || 0,
        Total_Productos: 0,
        Total_Piezas: 0,
        Creada_En_App: Boolean(it.Creada_En_App),
        Cerrada: false,
        Estatus_Cierre: '',
        Motivo_Cierre: '',
        Comentarios_Cierre: '',
        Fecha_Cierre: '',
        items: []
      });
    }
    const g = grouped.get(folio);
    g.items.push(it);
    g.Total_Productos = g.items.length;
    g.Total_Piezas += Math.max(1, parseInt(it.Cantidad_Cotizada || '1', 10) || 1);
    if (it.Creada_En_App) g.Creada_En_App = true;
    if (!g.WhatsApp_Cliente && it.WhatsApp_Cliente) g.WhatsApp_Cliente = cleanPhone(it.WhatsApp_Cliente);
    if (!g.Fecha_Ultimo_Aviso && it.Fecha_Ultimo_Aviso) g.Fecha_Ultimo_Aviso = it.Fecha_Ultimo_Aviso;
    if (!g.Correo_Asesor && it.Correo_Asesor) g.Correo_Asesor = normalizeEmail(it.Correo_Asesor);
    if (!g.Tel_Asesor && it.Tel_Asesor) g.Tel_Asesor = it.Tel_Asesor;

    const curP = priorityOrder[g.Nivel_Urgencia] || 1;
    const newP = priorityOrder[it.Nivel_Urgencia] || 1;
    if (newP > curP) {
      g.Nivel_Urgencia = it.Nivel_Urgencia;
      g.Motivo_Urgencia = it.Motivo_Urgencia;
    }
  }

  for (const [folio, g] of grouped.entries()) {
    const cie = closuresMap && closuresMap[folio];
    if (cie) {
      g.Cerrada = true;
      g.Estatus_Cierre = cie.Estatus_Cierre || 'CERRADA';
      g.Motivo_Cierre = cie.Motivo_Cierre || '';
      g.Comentarios_Cierre = cie.Comentarios || '';
      g.Fecha_Cierre = cie.Fecha_Hora || '';
    }
  }

  const list = Array.from(grouped.values());
  list.sort((a, b) => {
    const dCmp = String(b.Fecha_Cotizacion || '').localeCompare(String(a.Fecha_Cotizacion || ''));
    if (dCmp !== 0) return dCmp;
    return String(b.Folio_ERP || '').localeCompare(String(a.Folio_ERP || ''));
  });
  return list;
}

function filterGroupedQuotesForUser(allGrouped, user) {
  if (!user) return [];
  if (user.is_master || user.es_admin || isMasterExecutive(user.correo, user.puesto, user.sucursal)) {
    return allGrouped;
  }

  const userEmail = normalizeEmail(user.correo);
  const userNameNorm = normalizeText(user.nombre);
  const userTokens = userNameNorm.split(' ').filter(t => t.length > 2);
  const allowedBranches = new Set(
    Array.isArray(user.all_branches) && user.all_branches.length > 0
      ? user.all_branches.map(b => cleanStr(b).toUpperCase())
      : [cleanStr(user.sucursal).toUpperCase()]
  );

  return allGrouped.filter(q => {
    const qSuc = cleanStr(q.Sucursal).toUpperCase();
    const qEmail = normalizeEmail(q.Correo_Asesor);
    const qAsesorNorm = normalizeText(q.Asesor);

    if (user.es_gerente) {
      return allowedBranches.has(qSuc);
    }

    // Asesor: match by email OR exact name OR >= 2 matching name tokens
    if (userEmail && qEmail && userEmail === qEmail) return true;
    if (userNameNorm && qAsesorNorm && (userNameNorm === qAsesorNorm || qAsesorNorm.includes(userNameNorm) || userNameNorm.includes(qAsesorNorm))) {
      return true;
    }
    if (userTokens.length >= 2) {
      const matchedCount = userTokens.filter(t => qAsesorNorm.includes(t)).length;
      if (matchedCount >= 2) return true;
    }
    return false;
  });
}

async function fetchLiveState(isBackground = false) {
  try {
    const dirPromise = fetchUnifiedAdvisorsDirectory();
    const [
      dirData,
      invRows,
      cotCreataRows,
      cotVivoRows,
      cierresRows,
      cfgRows,
      histMovRows,
      histInvRows
    ] = await Promise.all([
      dirPromise,
      fetchSheetCsv(SHEET_INV_ID, 'INVENTARIO_EN_VIVO'),
      fetchSheetCsv(SHEET_SEG_ID, 'COTIZACIONES_CREATA'),
      fetchSheetCsv(SHEET_INV_ID, 'COTIZACIONES_EN_VIVO'),
      fetchSheetCsv(SHEET_SEG_ID, 'CIERRES_COTIZACIONES'),
      fetchSheetCsv(SHEET_SEG_ID, 'CONFIG_CREATA'),
      fetchSheetCsv(SHEET_SEG_ID, 'HISTORIAL_MOVIMIENTOS'),
      fetchSheetCsv(SHEET_INV_ID, 'HISTORIAL')
    ]);

    // Ensure session user is hydrated
    if (!APP_STATE.user) {
      const restored = tryRestoreExistingSession(dirData.byEmail);
      if (!restored) {
        showLoginScreen();
        return;
      }
      APP_STATE.user = restored;
    } else if (dirData.byEmail[normalizeEmail(APP_STATE.user.correo)]) {
      const refreshed = buildUserSessionObject(dirData.byEmail[normalizeEmail(APP_STATE.user.correo)].primary, dirData.byEmail);
      refreshed.debe_cambiar_password = Boolean(APP_STATE.user.debe_cambiar_password && refreshed.debe_cambiar_password);
      APP_STATE.user = refreshed;
      writeJsonStorage(SEG_SESSION_KEY, refreshed);
    }

    hideLoginScreen();
    renderUserHeaderAndRoleControls();

    // Parse config
    for (let i = 1; i < (cfgRows || []).length; i++) {
      const r = cfgRows[i];
      if (r && r[0] && r[1] !== undefined) {
        APP_STATE.config[cleanStr(r[0])] = cleanStr(r[1]);
      }
    }

    // Parse live inventory stock
    if (invRows && invRows.length > 2) {
      parseInventoryRows(invRows);
    }

    // Parse closures from CIERRES_COTIZACIONES + local cache + HISTORIAL events
    const closuresMap = Object.assign({}, readJsonStorage(SEG_CLOSURES_CACHE_KEY, {}));
    for (let i = 1; i < (cierresRows || []).length; i++) {
      const r = cierresRows[i];
      if (!r || !r[1]) continue;
      const fol = cleanStr(r[1]).toUpperCase();
      closuresMap[fol] = {
        Fecha_Hora: cleanStr(r[0]),
        Folio_ERP: fol,
        Sucursal: cleanStr(r[2]),
        Asesor: cleanStr(r[3]),
        Correo_Asesor: normalizeEmail(r[4]),
        Cliente: cleanStr(r[5]),
        WhatsApp_Cliente: cleanPhone(r[6]),
        Estatus_Cierre: cleanStr(r[7]) || 'CERRADA',
        Motivo_Cierre: cleanStr(r[8]),
        Comentarios: cleanStr(r[9]),
        Piezas_Cotizadas: cleanStr(r[11])
      };
    }

    // Parse phone overrides & WhatsApp timestamps from HISTORIAL_MOVIMIENTOS, HISTORIAL, and localStorage
    const phoneByFolio = Object.assign({}, readJsonStorage(SEG_PHONES_CACHE_KEY, {}));
    const contactedByFolio = Object.assign({}, readJsonStorage(SEG_CONTACTED_CACHE_KEY, {}));
    const auditLogs = [];

    for (let i = 1; i < (histMovRows || []).length; i++) {
      const r = histMovRows[i];
      if (!r || !r[0]) continue;
      const fh = cleanStr(r[0]);
      const tipo = cleanStr(r[1]).toUpperCase();
      const usuario = cleanStr(r[2]);
      const email = normalizeEmail(r[3]);
      const sucursal = cleanStr(r[4]);
      const accion = cleanStr(r[5]);
      const detalle = cleanStr(r[6]);
      const ip = cleanStr(r[7]) || 'Web';
      const status = cleanStr(r[8]) || 'EXITOSO';

      auditLogs.push({
        id: `seg_mov_${i}`,
        fecha_hora: fh,
        tipo,
        usuario,
        email,
        sucursal,
        accion,
        detalle,
        ip,
        status
      });

      if (tipo === 'WHATSAPP') {
        const mFol = accion.match(/Folio\s+([A-Z0-9\-]+)/i);
        if (mFol) {
          const fol = mFol[1].toUpperCase();
          contactedByFolio[fol] = fh.slice(0, 16);
          const mCel = detalle.match(/Celular:\s*([0-9+]+)/i);
          if (mCel && cleanPhone(mCel[1])) phoneByFolio[fol] = cleanPhone(mCel[1]);
        }
      } else if (tipo === 'TELEFONO') {
        const mFol = accion.match(/Folio\s+([A-Z0-9\-]+)/i);
        const mCel = detalle.match(/Nuevo Celular:\s*([0-9+]+)/i);
        if (mFol && mCel && cleanPhone(mCel[1])) {
          phoneByFolio[mFol[1].toUpperCase()] = cleanPhone(mCel[1]);
        }
      }
    }

    // Parse events written to HISTORIAL (1xew...) via inv_log_event bridge
    const extraBridgeQuotes = [];
    for (let i = 1; i < (histInvRows || []).length; i++) {
      const r = histInvRows[i];
      if (!r || r.length < 8) continue;
      const fh = cleanStr(r[0]);
      const mod = cleanStr(r[2]);
      if (mod !== 'SEGUIMIENTO_COTIZACIONES') continue;
      const ev = cleanStr(r[3]).toUpperCase();
      const usuarioRaw = cleanStr(r[5]);
      const sucRaw = cleanStr(r[6]);
      const refFol = cleanStr(r[7]).toUpperCase();
      const detRaw = cleanStr(r[8]);

      let payload = null;
      try {
        if (detRaw.startsWith('{')) payload = JSON.parse(detRaw);
      } catch (e) {}

      if (ev === 'SEG_CIERRE' && refFol && payload) {
        closuresMap[refFol] = {
          Fecha_Hora: payload.fecha_hora || fh.slice(0, 16),
          Folio_ERP: refFol,
          Sucursal: payload.sucursal || sucRaw,
          Asesor: payload.asesor || usuarioRaw,
          Correo_Asesor: normalizeEmail(payload.correo_asesor || ''),
          Cliente: payload.cliente || '',
          WhatsApp_Cliente: cleanPhone(payload.whatsapp_cliente || ''),
          Estatus_Cierre: payload.estatus || 'CERRADA',
          Motivo_Cierre: payload.motivo || '',
          Comentarios: payload.comentarios || ''
        };
        auditLogs.push({
          id: `inv_hist_${i}`,
          fecha_hora: fh,
          tipo: 'CIERRE',
          usuario: payload.usuario || usuarioRaw,
          email: payload.email || '',
          sucursal: payload.sucursal || sucRaw,
          accion: `Cotización ${refFol} marcada como ${payload.estatus}`,
          detalle: `Cliente: ${payload.cliente || ''} • Motivo: ${payload.motivo || ''} • Comentarios: ${payload.comentarios || ''}`,
          ip: 'Web-App',
          status: 'EXITOSO'
        });
      } else if (ev === 'SEG_TELEFONO' && refFol && payload) {
        if (cleanPhone(payload.whatsapp_cliente)) {
          phoneByFolio[refFol] = cleanPhone(payload.whatsapp_cliente);
        }
        auditLogs.push({
          id: `inv_hist_${i}`,
          fecha_hora: fh,
          tipo: 'TELEFONO',
          usuario: payload.usuario || usuarioRaw,
          email: payload.email || '',
          sucursal: payload.sucursal || sucRaw,
          accion: `Celular del cliente actualizado para Folio ${refFol}`,
          detalle: `Cliente: ${payload.cliente || ''} • Nuevo Celular: ${payload.whatsapp_cliente || ''}`,
          ip: 'Web-App',
          status: 'EXITOSO'
        });
      } else if ((ev === 'SEG_WHATSAPP' || ev === 'SEG_EMAIL') && refFol && payload) {
        if (ev === 'SEG_WHATSAPP') {
          contactedByFolio[refFol] = payload.fecha_aviso || fh.slice(0, 16);
        }
        auditLogs.push({
          id: `inv_hist_${i}`,
          fecha_hora: fh,
          tipo: ev === 'SEG_WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
          usuario: payload.usuario || usuarioRaw,
          email: payload.email || '',
          sucursal: payload.sucursal || sucRaw,
          accion: `${ev === 'SEG_WHATSAPP' ? 'Seguimiento WhatsApp' : 'Alerta por correo'} (${refFol})`,
          detalle: `Cliente: ${payload.cliente || ''} • Destino: ${payload.phone || payload.destinatario || ''}`,
          ip: 'Web-App',
          status: 'EXITOSO'
        });
      } else if (ev === 'SEG_NUEVA_COTIZACION_APP' && payload && payload.folio) {
        extraBridgeQuotes.push(payload);
      } else if ((ev === 'SEG_LOGIN' || ev === 'SEG_LOGOUT') && payload) {
        auditLogs.push({
          id: `inv_hist_${i}`,
          fecha_hora: fh,
          tipo: ev === 'SEG_LOGIN' ? 'LOGIN' : 'LOGOUT',
          usuario: payload.usuario || usuarioRaw,
          email: payload.email || '',
          sucursal: payload.sucursal || sucRaw,
          accion: payload.accion || (ev === 'SEG_LOGIN' ? 'Inicio de sesión exitoso' : 'Cierre de sesión'),
          detalle: payload.detalle || '',
          ip: 'Web-App',
          status: payload.status || 'EXITOSO'
        });
      }
    }

    // Merge local audit logs
    const localAudits = readJsonStorage(SEG_AUDIT_CACHE_KEY, []);
    for (const la of localAudits) {
      auditLogs.push(la);
    }

    APP_STATE.closures = closuresMap;

    // Build unified partidas map by ID_Partida
    const byPartida = new Map();

    // 1. From COTIZACIONES_CREATA (1_XBm...)
    for (let i = 1; i < (cotCreataRows || []).length; i++) {
      const r = cotCreataRows[i];
      if (!r || !r[0] || !r[1]) continue;
      const idP = cleanStr(r[0]);
      const folio = cleanStr(r[1]).toUpperCase();
      const sucKey = mapTabToBranchKey(r[3] || folio);
      const sku = cleanStr(r[9]).toUpperCase();
      const advMatch = matchAdvisorInfo(r[4], r[5], sucKey);
      const liveSt = calculateStockForBranch(sku, sucKey);
      const prod = APP_STATE.inventoryBySku[sku];

      const itemObj = {
        ID_Partida: idP,
        Folio_ERP: folio,
        Fecha_Cotizacion: parseDateToIso(r[2]),
        Sucursal: sucKey,
        Asesor: (advMatch && advMatch.nombre) || cleanStr(r[4]),
        Correo_Asesor: normalizeEmail(r[5]) || (advMatch && advMatch.correo) || '',
        Tel_Asesor: cleanPhone(r[6]) || (advMatch && advMatch.telefono) || '',
        Cliente: cleanStr(r[7]),
        WhatsApp_Cliente: phoneByFolio[folio] || cleanPhone(r[8]),
        Clave_Producto: sku,
        Nombre_Producto: cleanStr(r[10]) || (prod && prod.nombre) || sku,
        Modelo: cleanStr(r[11]) || (prod && prod.modelo) || '',
        Precio_Unitario: cleanStr(r[12]) || (prod && prod.precio ? prod.precio.toFixed(2) : '0.00'),
        Cantidad_Cotizada: cleanStr(r[13]) || '1',
        Stock_Inicial_Total: cleanStr(r[14]) || (liveSt ? String(liveSt.total_disponible) : '0'),
        Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : (cleanStr(r[15]) || '0'),
        Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : (cleanStr(r[16]) || '0'),
        Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : (cleanStr(r[17]) || '0'),
        Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : (cleanStr(r[18]) || '0'),
        Stock_Actual_Total: liveSt ? String(liveSt.total_disponible) : (cleanStr(r[19]) || '0'),
        Estatus_ERP: cleanStr(r[24]) || 'Cotizado',
        Fecha_Ultimo_Aviso: contactedByFolio[folio] || cleanStr(r[25]),
        Creada_En_App: false
      };
      evaluateItemUrgency(itemObj);
      byPartida.set(idP, itemObj);
    }

    // 2. From COTIZACIONES_EN_VIVO (1xew... — TODAS las cotizaciones creadas en la App / Cotizador inventario.html!)
    for (let i = 1; i < (cotVivoRows || []).length; i++) {
      const r = cotVivoRows[i];
      if (!r || (!r[1] && !r[0])) continue;
      const folio = cleanStr(r[1] || r[0]).toUpperCase();
      if (!folio) continue;
      const fechaIso = parseDateToIso(r[3]);
      const sucKey = mapTabToBranchKey(r[6] || r[5] || folio);
      const correoAsesor = normalizeEmail(r[7]);
      const nombreAsesorRaw = cleanStr(r[8]);
      const advMatch = matchAdvisorInfo(nombreAsesorRaw, correoAsesor, sucKey);
      const nombreAsesor = (advMatch && advMatch.nombre) || nombreAsesorRaw;
      const telAsesor = (advMatch && advMatch.telefono) || '';
      const cliente = cleanStr(r[11]) || 'Prospecto CREATA';
      const telCliente = phoneByFolio[folio] || cleanPhone(r[12]);
      const resumenSkus = cleanStr(r[17]);

      const parts = resumenSkus.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/^([A-Z0-9\-_./]+)\s*x\s*(\d+)/i);
        const sku = cleanStr(m ? m[1] : p).toUpperCase();
        const qty = m ? (parseInt(m[2], 10) || 1) : 1;
        if (!sku) continue;
        const idP = `${folio}_${sku}`;
        const prev = byPartida.get(idP);
        const prod = APP_STATE.inventoryBySku[sku];
        const liveSt = calculateStockForBranch(sku, sucKey);
        const stActual = liveSt ? liveSt.total_disponible : (prev ? parseInt(prev.Stock_Actual_Total || '0', 10) : 0);
        const stIni = prev && parseInt(prev.Stock_Inicial_Total || '0', 10) > 0
          ? parseInt(prev.Stock_Inicial_Total, 10)
          : Math.max(stActual, qty);

        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: fechaIso,
          Sucursal: sucKey,
          Asesor: nombreAsesor,
          Correo_Asesor: correoAsesor || (prev && prev.Correo_Asesor) || '',
          Tel_Asesor: telAsesor || (prev && prev.Tel_Asesor) || '',
          Cliente: cliente,
          WhatsApp_Cliente: telCliente || (prev && prev.WhatsApp_Cliente) || '',
          Clave_Producto: sku,
          Nombre_Producto: (prod && prod.nombre) || (prev && prev.Nombre_Producto) || sku,
          Modelo: (prod && prod.modelo) || (prev && prev.Modelo) || '',
          Precio_Unitario: (prod && prod.precio ? prod.precio.toFixed(2) : ((prev && prev.Precio_Unitario) || '0.00')),
          Cantidad_Cotizada: String(qty),
          Stock_Inicial_Total: String(stIni),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : ((prev && prev.Stock_Actual_CEDIS_Bodega) || '0'),
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : ((prev && prev.Stock_Actual_CEDIS_Piso) || '0'),
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : ((prev && prev.Stock_Actual_Tienda_Bodega) || '0'),
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : ((prev && prev.Stock_Actual_Tienda_Piso) || '0'),
          Stock_Actual_Total: String(stActual),
          Estatus_ERP: 'Cotizado',
          Fecha_Ultimo_Aviso: contactedByFolio[folio] || (prev && prev.Fecha_Ultimo_Aviso) || '',
          Creada_En_App: true
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
      }
    }

    // 3. From localStorage bridge + HISTORIAL SEG_NUEVA_COTIZACION_APP (0ms instant bridge when quote is created in inventario.html)
    const localBridgeQuotes = readJsonStorage(APP_QUOTES_BRIDGE_KEY, []);
    const allBridgeQuotes = [...extraBridgeQuotes, ...(Array.isArray(localBridgeQuotes) ? localBridgeQuotes : [])];
    for (const bq of allBridgeQuotes) {
      if (!bq || !bq.folio || !Array.isArray(bq.items)) continue;
      const folio = cleanStr(bq.folio).toUpperCase();
      const fechaIso = parseDateToIso(bq.fecha || '');
      const sucKey = mapTabToBranchKey(bq.erpStore || bq.sheetTab || folio);
      const correoAsesor = normalizeEmail(bq.advisorEmail);
      const advMatch = matchAdvisorInfo(bq.advisorName, correoAsesor, sucKey);
      const nombreAsesor = (advMatch && advMatch.nombre) || cleanStr(bq.advisorName);
      const telAsesor = (advMatch && advMatch.telefono) || '';
      const cliente = cleanStr(bq.clientName) || 'Prospecto CREATA';
      const telCliente = phoneByFolio[folio] || cleanPhone(bq.clientPhone);

      for (const it of bq.items) {
        const sku = cleanStr(it.sku).toUpperCase();
        if (!sku) continue;
        const qty = Math.max(1, parseInt(it.qty || '1', 10) || 1);
        const idP = `${folio}_${sku}`;
        const prev = byPartida.get(idP);
        const prod = APP_STATE.inventoryBySku[sku];
        const liveSt = calculateStockForBranch(sku, sucKey);
        const stActual = liveSt ? liveSt.total_disponible : (prev ? parseInt(prev.Stock_Actual_Total || '0', 10) : 0);
        const stIni = prev && parseInt(prev.Stock_Inicial_Total || '0', 10) > 0
          ? parseInt(prev.Stock_Inicial_Total, 10)
          : Math.max(stActual, qty);

        const itemObj = {
          ID_Partida: idP,
          Folio_ERP: folio,
          Fecha_Cotizacion: fechaIso,
          Sucursal: sucKey,
          Asesor: nombreAsesor,
          Correo_Asesor: correoAsesor,
          Tel_Asesor: telAsesor,
          Cliente: cliente,
          WhatsApp_Cliente: telCliente || (prev && prev.WhatsApp_Cliente) || '',
          Clave_Producto: sku,
          Nombre_Producto: cleanStr(it.name) || (prod && prod.nombre) || (prev && prev.Nombre_Producto) || sku,
          Modelo: cleanStr(it.model) || (prod && prod.modelo) || (prev && prev.Modelo) || '',
          Precio_Unitario: it.price ? Number(it.price).toFixed(2) : ((prod && prod.precio ? prod.precio.toFixed(2) : '0.00')),
          Cantidad_Cotizada: String(qty),
          Stock_Inicial_Total: String(stIni),
          Stock_Actual_CEDIS_Bodega: liveSt ? String(liveSt.cedis_bodega) : '0',
          Stock_Actual_CEDIS_Piso: liveSt ? String(liveSt.cedis_piso) : '0',
          Stock_Actual_Tienda_Bodega: liveSt ? String(liveSt.tienda_bodega) : '0',
          Stock_Actual_Tienda_Piso: liveSt ? String(liveSt.tienda_piso) : '0',
          Stock_Actual_Total: String(stActual),
          Estatus_ERP: 'Cotizado',
          Fecha_Ultimo_Aviso: contactedByFolio[folio] || (prev && prev.Fecha_Ultimo_Aviso) || '',
          Creada_En_App: true
        };
        evaluateItemUrgency(itemObj);
        byPartida.set(idP, itemObj);
      }
    }

    const allPartidas = Array.from(byPartida.values());
    const allGrouped = groupQuotesByFolio(allPartidas, closuresMap);
    const filteredForUser = filterGroupedQuotesForUser(allGrouped, APP_STATE.user);

    APP_STATE.rawPartidas = allPartidas;
    APP_STATE.quotes = filteredForUser;
    APP_STATE.auditLogs = auditLogs;

    const sl = document.getElementById('lastSyncLabel');
    if (sl) sl.innerText = `ERP: ${APP_STATE.last_erp_sync || 'En vivo'}`;

    populateAdvisorFilter();
    renderQuotes();
  } catch (err) {
    console.error('Error sincronizando Seguimiento en vivo:', err);
  }
}

// ==============================================================================
// INTERFAZ DE AUTENTICACIÓN Y CABECERA POR ROL / MULTI-TIENDA
// ==============================================================================
function showLoginScreen() {
  document.getElementById('loginBackdrop')?.classList.remove('hidden');
  document.getElementById('appShell')?.classList.add('hidden');
}

function hideLoginScreen() {
  document.getElementById('loginBackdrop')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
}

function toggleLoginPassword() {
  const input = document.getElementById('password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function submitSegLogin(e) {
  if (e) e.preventDefault();
  const ident = cleanStr(document.getElementById('identificador')?.value);
  const pwd = cleanStr(document.getElementById('password')?.value);
  const errBox = document.getElementById('loginErrorBox');
  const errTxt = document.getElementById('loginErrorText');
  const btn = document.getElementById('btnLoginSubmit');
  const btnTxt = document.getElementById('btnLoginSubmitText');

  if (errBox) errBox.classList.add('hidden');
  if (btn) btn.disabled = true;
  if (btnTxt) btnTxt.innerText = 'Verificando en vivo...';

  try {
    const dirData = await fetchUnifiedAdvisorsDirectory();
    const user = authenticateAgainstDirectory(ident, pwd, dirData);
    if (!user) {
      if (errTxt) errTxt.innerText = 'Credenciales incorrectas. Verifica tu correo y contraseña o teléfono.';
      if (errBox) errBox.classList.remove('hidden');
      recordSegAuditEvent('LOGIN', 'Intento de acceso fallido', `Identificador ingresado: ${ident} • Contraseña incorrecta`, 'Desconocido', ident, 'N/A', 'FALLIDO');
      return;
    }

    try { sessionStorage.removeItem(SEG_MANUAL_LOGOUT_KEY); } catch (se) {}
    APP_STATE.user = user;
    writeJsonStorage(SEG_SESSION_KEY, user);

    recordSegAuditEvent('LOGIN', 'Inicio de sesión exitoso', `Puesto: ${user.puesto} • Tienda: ${user.sucursal_label}`, user.nombre, user.correo, user.sucursal, 'EXITOSO');

    hideLoginScreen();
    await fetchLiveState();
  } finally {
    if (btn) btn.disabled = false;
    if (btnTxt) btnTxt.innerText = 'Ingresar al Sistema';
  }
}

function logoutSeg() {
  const u = APP_STATE.user;
  if (u) {
    recordSegAuditEvent('LOGOUT', 'Cierre de sesión', 'Usuario cerró su sesión en el sistema', u.nombre, u.correo, u.sucursal, 'EXITOSO');
  }
  try {
    localStorage.removeItem(SEG_SESSION_KEY);
    sessionStorage.setItem(SEG_MANUAL_LOGOUT_KEY, '1');
  } catch (e) {}
  APP_STATE.user = null;
  showLoginScreen();
}

function renderUserHeaderAndRoleControls() {
  const user = APP_STATE.user;
  if (!user) return;

  const hdrName = document.getElementById('hdrUserName');
  const hdrRoleStore = document.getElementById('hdrUserRoleStore');
  if (hdrName) hdrName.innerText = user.nombre || user.correo;
  if (hdrRoleStore) hdrRoleStore.innerText = ` • ${user.puesto || 'Asesor'} (${user.sucursal_label || user.sucursal})`;

  const btnKevin = document.getElementById('btnKevinAuditHeader');
  if (btnKevin) {
    if (isKevinReyna(user)) btnKevin.classList.remove('hidden');
    else btnKevin.classList.add('hidden');
  }

  if (user.debe_cambiar_password) {
    document.getElementById('modalForceChangePassword')?.classList.remove('hidden');
  } else {
    document.getElementById('modalForceChangePassword')?.classList.add('hidden');
  }

  // Banner context
  const banner = document.getElementById('roleContextBanner');
  if (banner) {
    if (user.is_master || user.es_admin) {
      banner.innerHTML = `<span class="text-amber-400 font-bold">● CUENTAS ADMINISTRATIVAS / DIRECCIÓN:</span> <span class="text-slate-200">Supervisión integral de todas las tiendas y cotizaciones en vivo.</span>`;
    } else if (user.es_gerente) {
      banner.innerHTML = `<span class="text-emerald-400 font-bold">● VISTA DE GERENCIA DE TIENDA:</span> <span class="text-slate-200">Cotizaciones activas de <b>${user.sucursal_label}</b>.</span>`;
    } else {
      banner.innerHTML = `<span class="text-emerald-400 font-bold">● VISTA PERSONAL DE ASESOR:</span> <span class="text-slate-200">Tus cotizaciones asignadas en <b>${user.sucursal_label}</b>.</span>`;
    }
  }

  // Configure filter controls according to role & multi-store assignments
  const selSuc = document.getElementById('filterSucursal');
  const fixedBadge = document.getElementById('fixedSucursalBadge');
  const fixedLabel = document.getElementById('fixedSucursalLabel');
  const asesorWrap = document.getElementById('filterAsesorWrap');
  const grid = document.getElementById('filtersGridContainer');

  const userBranches = Array.isArray(user.all_branches) && user.all_branches.length > 0
    ? user.all_branches
    : (user.sucursal && user.sucursal !== 'TODAS' ? [user.sucursal] : []);

  if (user.is_master || user.es_admin) {
    if (selSuc) {
      const prev = selSuc.value;
      selSuc.innerHTML = [
        '<option value="TODAS">Todas las Sucursales</option>',
        '<option value="PLAYA">Playa del Carmen</option>',
        '<option value="COLOSIO">Colosio</option>',
        '<option value="PUERTO CANCUN">Puerto Cancún (PTC)</option>',
        '<option value="CASA CREATA">Casa Creata</option>',
        '<option value="PROYECTOS">Proyectos</option>'
      ].join('');
      if (prev && Array.from(selSuc.options).some(o => o.value === prev)) selSuc.value = prev;
      selSuc.classList.remove('hidden');
    }
    if (fixedBadge) fixedBadge.classList.add('hidden');
    if (asesorWrap) asesorWrap.classList.remove('hidden');
    if (grid) grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4';
  } else if (userBranches.length > 1) {
    // Usuario colocado en varias tiendas/bodegas -> selector de sus tiendas asignadas
    if (selSuc) {
      const prev = selSuc.value;
      selSuc.innerHTML = `<option value="TODAS">Mis Tiendas (${userBranches.length})</option>` +
        userBranches.map(b => `<option value="${b}">${getBranchLabel(b)}</option>`).join('');
      if (prev && Array.from(selSuc.options).some(o => o.value === prev)) selSuc.value = prev;
      selSuc.classList.remove('hidden');
    }
    if (fixedBadge) fixedBadge.classList.add('hidden');
    if (asesorWrap) {
      if (user.es_gerente) asesorWrap.classList.remove('hidden');
      else asesorWrap.classList.add('hidden');
    }
    if (grid) {
      grid.className = user.es_gerente
        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'
        : 'grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4';
    }
  } else {
    // Una sola tienda fija
    const onlyBranch = userBranches[0] || user.sucursal || 'PROYECTOS';
    if (selSuc) {
      selSuc.innerHTML = `<option value="${onlyBranch}">${getBranchLabel(onlyBranch)}</option>`;
      selSuc.value = onlyBranch;
      selSuc.classList.add('hidden');
    }
    if (fixedLabel) fixedLabel.innerText = getBranchLabel(onlyBranch);
    if (fixedBadge) {
      fixedBadge.classList.remove('hidden');
      fixedBadge.classList.add('flex');
    }
    if (asesorWrap) {
      if (user.es_gerente) asesorWrap.classList.remove('hidden');
      else asesorWrap.classList.add('hidden');
    }
    if (grid) {
      grid.className = user.es_gerente
        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'
        : 'grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4';
    }
  }
}

// ==============================================================================
// FILTROS Y RENDERIZADO DE TABLA Y TARJETAS DE COTIZACIONES
// ==============================================================================
function populateAdvisorFilter() {
  const select = document.getElementById('filterAsesor');
  if (!select) return;
  const user = APP_STATE.user;
  if (user && !user.is_master && !user.es_admin && !user.es_gerente) {
    select.innerHTML = `<option value="TODOS">${user.nombre}</option>`;
    select.value = 'TODOS';
    return;
  }

  const currentVal = select.value;
  const advisors = APP_STATE.advisors || [];
  const currentSucursal = cleanStr(document.getElementById('filterSucursal')?.value || 'TODAS').toUpperCase();
  const allowedBranches = (user && !user.is_master && !user.es_admin && Array.isArray(user.all_branches) && user.all_branches.length > 0)
    ? new Set(user.all_branches)
    : null;

  const filtered = advisors.filter(a => {
    const aSuc = cleanStr(a.sucursal).toUpperCase();
    if (allowedBranches && !allowedBranches.has(aSuc)) return false;
    if (currentSucursal === 'TODAS') return true;
    return aSuc === currentSucursal;
  });

  select.innerHTML = '<option value="TODOS">Todos los Asesores</option>' +
    filtered.map(a => `<option value="${a.nombre}">${a.nombre} (${a.puesto})</option>`).join('');

  if (filtered.some(a => a.nombre === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'TODOS';
  }
}

function onSucursalFilterChange() {
  populateAdvisorFilter();
  renderQuotes();
}

function onFilterChange() {
  renderQuotes();
}

function clearSearch() {
  const inp = document.getElementById('filterSearch');
  if (inp) inp.value = '';
  renderQuotes();
}

function renderBadge(q) {
  if (q.Cerrada) {
    if (q.Estatus_Cierre === 'GANADA') {
      return `<span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-emerald-300">✓ VENTA GANADA</span>`;
    }
    return `<span class="inline-flex items-center gap-1 bg-slate-200 text-slate-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-slate-300">🔒 CERRADA (${q.Estatus_Cierre || 'HISTORIAL'})</span>`;
  }

  const items = q.items || [];
  let hasZero = false;
  let hasInsufficient = false;
  let hasAjustado = false;

  for (const it of items) {
    const st = parseInt(it.Stock_Actual_Total || 0, 10);
    const cant = parseInt(it.Cantidad_Cotizada || 1, 10);
    if (st <= 0) hasZero = true;
    else if (st < cant) hasInsufficient = true;
    else if (st <= 3 || st === cant) hasAjustado = true;
  }

  if (hasZero || hasInsufficient) {
    return `<span class="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-red-300 shadow-2xs">🔴 STOCK INCOMPLETO</span>`;
  } else if (hasAjustado) {
    return `<span class="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-amber-300 shadow-2xs">🟡 STOCK AJUSTADO</span>`;
  } else if (items.length > 0) {
    return `<span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-emerald-300 shadow-2xs">🟢 SURTIBLE 100% HOY</span>`;
  }

  const level = q.Nivel_Urgencia || 'ESTABLE';
  if (level === 'CRITICO') {
    return `<span class="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-red-200">🔥 CRÍTICO</span>`;
  } else if (level === 'SOLO_PISO') {
    return `<span class="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-purple-200">🏛️ SOLO PISO</span>`;
  }
  return `<span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-medium px-2.5 py-1 rounded-full border border-emerald-200">🟢 DISPONIBLE</span>`;
}

function renderQuotes() {
  const quotes = APP_STATE.quotes || [];
  const filterSucursal = cleanStr(document.getElementById('filterSucursal')?.value || 'TODAS').toUpperCase();
  const filterAsesor = cleanStr(document.getElementById('filterAsesor')?.value || 'TODOS');
  const filterUrgencia = cleanStr(document.getElementById('filterUrgencia')?.value || 'TODOS');
  const search = cleanStr(document.getElementById('filterSearch')?.value || '').toLowerCase();

  const user = APP_STATE.user;
  const isMasterUser = Boolean(user && (user.is_master || user.es_admin));
  const isGerenteUser = Boolean(user && user.es_gerente);

  const filtered = quotes.filter(q => {
    if (q.Cerrada && !search) return false;
    if (filterSucursal !== 'TODAS' && q.Sucursal !== filterSucursal) return false;
    if ((isMasterUser || isGerenteUser) && filterAsesor !== 'TODOS') {
      if (normalizeText(q.Asesor) !== normalizeText(filterAsesor)) return false;
    }
    if (filterUrgencia !== 'TODOS' && q.Nivel_Urgencia !== filterUrgencia) return false;

    if (search) {
      const normSearch = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const tokens = normSearch.split(/\s+/).filter(Boolean);
      const itemsText = (q.items || []).map(it =>
        `${it.Nombre_Producto || ''} ${it.Clave_Producto || ''} ${it.Modelo || ''}`
      ).join(' ');
      const fullHaystack = `
        ${q.Folio_ERP || ''}
        ${q.Cliente || ''}
        ${q.WhatsApp_Cliente || ''}
        ${q.Asesor || ''}
        ${q.Correo_Asesor || ''}
        ${q.Sucursal || ''}
        ${q.Sucursal_Label || ''}
        ${q.Estatus_ERP || ''}
        ${q.Motivo_Urgencia || ''}
        ${itemsText}
      `.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      if (!tokens.every(tok => fullHaystack.includes(tok))) return false;
    }
    return true;
  });

  const cycleLabel = (APP_STATE.commercial_cycle && APP_STATE.commercial_cycle.start_label) || 'el 25 del mes anterior';
  const statsEl = document.getElementById('statsSummary');
  if (statsEl) {
    statsEl.innerHTML = `Mostrando <b>${filtered.length}</b> cotización(es) activas del ciclo actual (desde <b>${cycleLabel}</b>).`;
  }

  const closuresElem = document.getElementById('closuresMetricsSummary');
  if (closuresElem && user && (user.es_gerente || user.is_master)) {
    const closedQuotes = quotes.filter(q => q.Cerrada);
    const ganadas = closedQuotes.filter(q => q.Estatus_Cierre === 'GANADA').length;
    const perdidas = closedQuotes.filter(q => q.Estatus_Cierre === 'PERDIDA').length;
    if (closedQuotes.length > 0) {
      const pct = Math.round((ganadas / closedQuotes.length) * 100);
      closuresElem.innerHTML = `
        <span class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
          <span>📊 Cierres: <b>${closedQuotes.length}</b></span>
          <span class="text-emerald-700 font-bold">(${ganadas} Ganadas • ${pct}%)</span>
          <span class="text-red-700 font-bold">(${perdidas} Perdidas)</span>
        </span>
      `;
    } else {
      closuresElem.innerHTML = `<span class="text-[11px] text-slate-400">Sin cierres registrados</span>`;
    }
  }

  const tbody = document.getElementById('tableBody');
  const mobileCards = document.getElementById('mobileCards');

  if (!filtered.length) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-slate-400">
            No se encontraron cotizaciones con los filtros seleccionados.
          </td>
        </tr>
      `;
    }
    if (mobileCards) {
      mobileCards.innerHTML = `<div class="bg-white rounded-2xl p-8 text-center text-slate-400 text-sm border border-slate-200">No hay cotizaciones para mostrar.</div>`;
    }
    return;
  }

  // TABLA ESCRITORIO
  if (tbody) {
    tbody.innerHTML = filtered.map(q => {
      const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
      const avisoTag = q.Fecha_Ultimo_Aviso
        ? `<div class="text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-300 rounded-lg py-1 px-2 inline-flex items-center gap-1 shadow-2xs whitespace-nowrap"><span class="text-xs">📲</span> <span>${q.Fecha_Ultimo_Aviso}</span></div>`
        : `<div class="text-[11px] text-slate-400 font-medium py-1 px-2 rounded-lg bg-slate-50 border border-slate-200 inline-block whitespace-nowrap">Sin aviso WhatsApp</div>`;
      const appOriginTag = q.Creada_En_App
        ? `<div class="inline-block text-[10px] text-amber-800 bg-amber-50 border border-amber-200 font-bold px-2 py-0.5 rounded mt-1 whitespace-nowrap">📲 App / Cotizador</div>`
        : '';

      const itemsListHtml = (q.items || []).map(it => {
        const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
        const cantPedida = parseInt(it.Cantidad_Cotizada || 1, 10);
        let stockBadge = '';
        if (stTotal <= 0) {
          stockBadge = `<span class="whitespace-nowrap shrink-0 text-red-700 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">Agotado (0 pzas)</span>`;
        } else if (stTotal < cantPedida) {
          stockBadge = `<span class="whitespace-nowrap shrink-0 text-red-700 font-bold bg-red-100 border border-red-300 px-2 py-0.5 rounded text-[11px]">Insuficiente (${stTotal} de ${cantPedida})</span>`;
        } else if (stTotal === cantPedida || stTotal <= 3) {
          stockBadge = `<span class="whitespace-nowrap shrink-0 text-amber-800 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">Ajustado (${stTotal} pzas)</span>`;
        } else {
          stockBadge = `<span class="whitespace-nowrap shrink-0 text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">Disponible (${stTotal} pzas)</span>`;
        }

        return `
          <div class="flex items-center justify-between gap-3 py-1.5 px-2.5 border-b border-slate-100 last:border-0 hover:bg-white rounded-lg transition text-xs">
            <div class="min-w-0 flex-1">
              <span class="font-bold text-slate-800 leading-snug break-words">${it.Nombre_Producto}</span>
              <span class="text-slate-500 text-[11px] font-normal whitespace-nowrap ml-1">(${it.Cantidad_Cotizada} pza)</span>
            </div>
            <div class="shrink-0 ml-2">${stockBadge}</div>
          </div>
        `;
      }).join('');

      return `
        <tr class="hover:bg-slate-50/70 transition border-b border-slate-100 last:border-0">
          <td class="py-4 px-4 align-top">
            <div class="font-mono font-black text-slate-900 text-xs tracking-tight">${q.Folio_ERP}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">${q.Fecha_Cotizacion}</div>
            <div class="inline-block text-[10px] text-slate-600 bg-slate-100 font-bold px-2 py-0.5 rounded mt-1.5 whitespace-nowrap">${q.Total_Productos} producto(s)</div>
            ${appOriginTag}
          </td>
          <td class="py-4 px-4 align-top">
            <div class="font-bold text-slate-900 text-xs leading-snug">${q.Asesor}</div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
              <span>${sucRule.label || q.Sucursal}</span>
            </div>
          </td>
          <td class="py-4 px-4 align-top">
            <div class="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug">${q.Cliente}</div>
            <div class="text-xs text-slate-500 mt-1.5">
              ${q.WhatsApp_Cliente ? `<span class="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] inline-block">📱 ${q.WhatsApp_Cliente}</span>` : `<button onclick="promptClientPhone('${q.Folio_ERP}')" class="text-amber-700 hover:text-amber-800 hover:underline font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer">+ Celular</button>`}
            </div>
          </td>
          <td class="py-4 px-2 sm:px-4 align-top min-w-[220px] max-w-xl break-words">
            <div class="bg-slate-50/90 rounded-2xl p-2 border border-slate-200/80 max-h-56 overflow-y-auto custom-scrollbar space-y-0.5 shadow-2xs">
              ${itemsListHtml}
            </div>
          </td>
          <td class="py-4 px-3 align-top text-center">
            <div class="flex flex-col items-center">
              ${renderBadge(q)}
              <div class="text-[11px] text-slate-500 mt-1.5 leading-tight font-medium max-w-[130px]">${q.Motivo_Urgencia}</div>
            </div>
          </td>
          <td class="py-4 px-3 align-top text-center">
            ${avisoTag}
          </td>
          <td class="py-4 px-4 align-top text-center">
            <div class="flex flex-col gap-1.5 items-stretch">
              <button onclick="openPreviewModal('${q.Folio_ERP}')" class="w-full inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-xs px-3 py-2 rounded-xl shadow-xs transition hover:shadow-md cursor-pointer whitespace-nowrap">
                <svg class="w-3.5 h-3.5 shrink-0 fill-current" viewBox="0 0 20 20">
                  <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5l-3 3V5z"/>
                </svg>
                <span>Enviar Seguimiento</span>
              </button>
              ${q.Cerrada ? `
                <div class="py-1 px-2 rounded-lg text-[10px] font-extrabold ${q.Estatus_Cierre === 'GANADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}" title="${q.Motivo_Cierre || ''} - ${q.Comentarios_Cierre || ''}">
                  ${q.Estatus_Cierre === 'GANADA' ? '✓ VENTA GANADA' : '✓ CERRADA (' + (q.Estatus_Cierre || 'HISTORIAL') + ')'}
                </div>
              ` : `
                <button onclick="openModalCerrar('${q.Folio_ERP}')" class="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 py-1 px-2 rounded-lg transition cursor-pointer text-center flex items-center justify-center gap-1">
                  <span>🔒 Cerrar Cotización</span>
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // TARJETAS MÓVILES
  if (mobileCards) {
    mobileCards.innerHTML = filtered.map(q => {
      const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
      const itemsListHtml = (q.items || []).map(it => {
        const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
        const cantPedida = parseInt(it.Cantidad_Cotizada || 1, 10);
        const color = stTotal <= 0 || stTotal < cantPedida ? 'text-red-700 bg-red-50 border-red-200' : (stTotal <= 3 ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200');
        return `
          <div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0 text-xs">
            <div class="truncate flex-1">
              <span class="font-semibold text-slate-800">${it.Nombre_Producto}</span>
              <span class="text-slate-400 text-[11px]"> (${it.Cantidad_Cotizada})</span>
            </div>
            <span class="shrink-0 font-bold text-[10px] px-1.5 py-0.5 rounded border ${color}">${stTotal} pzas</span>
          </div>
        `;
      }).join('');

      return `
        <div class="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono font-black text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded">${q.Folio_ERP}</span>
                <span class="text-[11px] font-semibold text-amber-700">${sucRule.label || q.Sucursal}</span>
                <span class="text-[11px] text-slate-400">• ${q.Fecha_Cotizacion}</span>
                ${q.Creada_En_App ? `<span class="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">📲 App</span>` : ''}
              </div>
              <h3 class="font-extrabold text-slate-900 text-sm mt-1">👤 ${q.Cliente}</h3>
              <div class="text-xs text-slate-500 mt-0.5">
                ${q.WhatsApp_Cliente ? `📱 <span class="font-mono font-bold text-slate-700">${q.WhatsApp_Cliente}</span>` : `<button onclick="promptClientPhone('${q.Folio_ERP}')" class="text-amber-700 font-bold underline">+ Agregar WhatsApp</button>`}
              </div>
            </div>
            <div class="shrink-0">${renderBadge(q)}</div>
          </div>

          <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
            <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Muebles cotizados:</span>
              <span class="text-slate-400 font-normal">${q.Total_Productos} producto(s)</span>
            </div>
            ${itemsListHtml}
          </div>

          <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span class="text-slate-500">Asesor: <b class="text-slate-800">${q.Asesor}</b></span>
            ${q.Fecha_Ultimo_Aviso ? `<span class="text-emerald-800 font-bold text-[11px] bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">📲 ${q.Fecha_Ultimo_Aviso}</span>` : `<span class="text-slate-400 text-[11px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">Sin aviso WhatsApp</span>`}
          </div>

          <div class="flex flex-col gap-2 pt-1">
            <button onclick="openPreviewModal('${q.Folio_ERP}')" class="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-extrabold text-xs sm:text-sm py-3 rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer">
              <svg class="w-4 h-4 shrink-0 fill-current" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5l-3 3V5z"/>
              </svg>
              <span>Enviar Seguimiento</span>
            </button>
            ${q.Cerrada ? `
              <div class="py-1.5 px-3 rounded-xl text-center text-xs font-extrabold ${q.Estatus_Cierre === 'GANADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                ${q.Estatus_Cierre === 'GANADA' ? '✓ VENTA GANADA' : '✓ CERRADA (' + (q.Estatus_Cierre || 'HISTORIAL') + ')'}
              </div>
            ` : `
              <button onclick="openModalCerrar('${q.Folio_ERP}')" class="w-full text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 font-bold text-xs py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1">
                <span>🔒 Cerrar Cotización</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }
}

// ==============================================================================
// MODAL DE SEGUIMIENTO PERSUASIVO (WHATSAPP Y CORREO)
// ==============================================================================
function openPreviewModal(folio) {
  const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
  if (!q) return;

  ACTIVE_MODAL_QUOTE = q;
  const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};

  document.getElementById('previewCliente').innerText = q.Cliente || 'Cliente';
  document.getElementById('previewPhoneVal').innerText = q.WhatsApp_Cliente ? q.WhatsApp_Cliente : 'Sin número asignado';
  document.getElementById('previewAsesor').innerText = q.Asesor || '--';
  document.getElementById('previewAsesorContact').innerText = `Tel: ${q.Tel_Asesor || 'S/N'} • ${q.Correo_Asesor || ''}`;
  document.getElementById('previewSucursal').innerText = `${sucRule.label || q.Sucursal} • Folio ${q.Folio_ERP} (${q.Fecha_Cotizacion})`;
  document.getElementById('previewUrgencyBadge').innerHTML = renderBadge(q);

  const contactBox = document.getElementById('previewLastContacted');
  if (q.Fecha_Ultimo_Aviso) {
    contactBox.className = 'text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between';
    contactBox.innerHTML = `<span>✓ Último aviso registrado el <b>${q.Fecha_Ultimo_Aviso}</b></span>`;
  } else {
    contactBox.className = 'text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between';
    contactBox.innerHTML = `<span>🕒 Aún no se ha registrado aviso para esta cotización</span>`;
  }

  SELECTED_ITEMS_SET.clear();
  (q.items || []).forEach(it => SELECTED_ITEMS_SET.add(it.ID_Partida));

  renderModalItemsCheckboxes();

  const tabsWrap = document.getElementById('modalRecipientTabs');
  if (tabsWrap) {
    if (APP_STATE.user && (APP_STATE.user.es_gerente || APP_STATE.user.is_master)) {
      tabsWrap.classList.remove('hidden');
    } else {
      tabsWrap.classList.add('hidden');
    }
  }
  setModalRecipient('CLIENTE');
  document.getElementById('previewModal').classList.remove('hidden');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.add('hidden');
  ACTIVE_MODAL_QUOTE = null;
}

function renderModalItemsCheckboxes() {
  if (!ACTIVE_MODAL_QUOTE) return;
  const container = document.getElementById('modalItemsList');
  const items = ACTIVE_MODAL_QUOTE.items || [];

  container.innerHTML = items.map(it => {
    const isChecked = SELECTED_ITEMS_SET.has(it.ID_Partida);
    const stTotal = parseInt(it.Stock_Actual_Total || 0, 10);
    const badgeColor = stTotal <= 5 ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';

    return `
      <label class="flex items-center justify-between gap-3 p-2 rounded-xl border ${isChecked ? 'bg-amber-50/60 border-amber-300' : 'bg-white border-slate-200'} cursor-pointer hover:border-amber-400 transition text-xs">
        <div class="flex items-center gap-2.5 truncate">
          <input type="checkbox" value="${it.ID_Partida}" onchange="toggleItemSelection('${it.ID_Partida}', this.checked)" ${isChecked ? 'checked' : ''} class="item-chk rounded text-amber-600 focus:ring-amber-500 w-4 h-4">
          <div class="truncate">
            <span class="font-bold text-slate-900">${it.Nombre_Producto}</span>
            <span class="text-slate-500 text-[11px]"> • Clave: ${it.Clave_Producto} (Cotizado: ${it.Cantidad_Cotizada})</span>
          </div>
        </div>
        <span class="font-bold text-[10px] px-2 py-0.5 rounded border ${badgeColor} whitespace-nowrap">
          ${stTotal} pzas hoy
        </span>
      </label>
    `;
  }).join('');

  const masterChk = document.getElementById('chkSelectAllItems');
  if (masterChk) {
    masterChk.checked = (SELECTED_ITEMS_SET.size === items.length && items.length > 0);
  }
}

function toggleItemSelection(idPartida, isChecked) {
  if (isChecked) SELECTED_ITEMS_SET.add(idPartida);
  else SELECTED_ITEMS_SET.delete(idPartida);
  renderModalItemsCheckboxes();
  rebuildModalMessage();
}

function toggleSelectAllItems(selectAll) {
  if (!ACTIVE_MODAL_QUOTE) return;
  const items = ACTIVE_MODAL_QUOTE.items || [];
  if (selectAll) items.forEach(it => SELECTED_ITEMS_SET.add(it.ID_Partida));
  else SELECTED_ITEMS_SET.clear();
  renderModalItemsCheckboxes();
  rebuildModalMessage();
}

function setModalRecipient(recipient) {
  ACTIVE_RECIPIENT = recipient;
  const btnCli = document.getElementById('btnRecipientCliente');
  const btnAdv = document.getElementById('btnRecipientAsesor');
  const tplSelector = document.getElementById('modalToneSelectorWrap');
  const btnActionWhatsApp = document.getElementById('btnActionWhatsApp');
  const btnActionEmail = document.getElementById('btnActionEmail');

  if (recipient === 'CLIENTE') {
    if (btnCli) btnCli.className = 'py-2 px-1 border-b-2 border-amber-500 text-amber-700 flex items-center gap-1.5 cursor-pointer';
    if (btnAdv) btnAdv.className = 'py-2 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer';
    if (tplSelector) tplSelector.classList.remove('hidden');
    if (btnActionWhatsApp) btnActionWhatsApp.innerHTML = '<span>📲</span> <span>Enviar WhatsApp al Cliente</span>';
    if (btnActionEmail) btnActionEmail.innerHTML = '<span>✉️</span> <span>Enviar Correo al Cliente</span>';
    rebuildModalMessage();
  } else {
    if (btnCli) btnCli.className = 'py-2 px-1 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer';
    if (btnAdv) btnAdv.className = 'py-2 px-1 border-b-2 border-amber-500 text-amber-700 flex items-center gap-1.5 cursor-pointer';
    if (tplSelector) tplSelector.classList.add('hidden');
    if (btnActionWhatsApp) btnActionWhatsApp.innerHTML = '<span>📲</span> <span>Alertar al Asesor por WhatsApp</span>';
    if (btnActionEmail) btnActionEmail.innerHTML = '<span>✉️</span> <span>Enviar Alerta por Correo</span>';
    buildAdvisorAlertMessage();
  }
}

function selectModalTemplate(tplKey) {
  ACTIVE_MODAL_TPL_KEY = tplKey;
  ACTIVE_RECIPIENT = 'CLIENTE';
  const idMap = {
    'EMOCIONAL': 'btnTplEmocional',
    'SOLO_PISO': 'btnTplPiso',
    'SEGUIMIENTO': 'btnTplSeguimiento'
  };
  Object.keys(idMap).forEach(k => {
    const btn = document.getElementById(idMap[k]);
    if (!btn) return;
    if (k === tplKey) {
      btn.className = 'tpl-btn px-3 py-2.5 rounded-xl border text-xs font-bold text-left transition shadow-2xs bg-amber-500 text-slate-950 border-amber-600 ring-2 ring-amber-500/20 cursor-pointer';
    } else {
      btn.className = 'tpl-btn px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold text-left transition shadow-2xs cursor-pointer';
    }
  });
  rebuildModalMessage();
}

function buildAdvisorAlertMessage() {
  if (!ACTIVE_MODAL_QUOTE) return;
  const q = ACTIVE_MODAL_QUOTE;
  const sucRule = (APP_STATE.sucursales && APP_STATE.sucursales[q.Sucursal]) || {};
  const selectedItems = (q.items || []).filter(it => SELECTED_ITEMS_SET.has(it.ID_Partida));

  let listaPiezas = '';
  selectedItems.forEach(it => {
    const st = parseInt(it.Stock_Actual_Total || 0, 10);
    listaPiezas += `• ${it.Nombre_Producto} — Stock actual: ${st} pzas (Cotizadas: ${it.Cantidad_Cotizada})\n`;
  });
  if (!listaPiezas) listaPiezas = '• Mobiliario seleccionado en cotización.\n';

  const msg = `Hola *${q.Asesor || 'Asesor'}* (${sucRule.label || q.Sucursal}), seguimiento prioritario de cotización en *CREATA muebles*:\n\n` +
    `• Cliente: *${q.Cliente}* (Folio *${q.Folio_ERP}*)\n` +
    `• Teléfono Cliente: *${q.WhatsApp_Cliente || 'Sin número registrado'}*\n` +
    `• Mobiliario con stock urgente:\n${listaPiezas}\n` +
    `Favor de contactar hoy al cliente para coordinar el apartado y asegurar la entrega inmediata. ¡Quedo atento a tus comentarios!`;

  const area = document.getElementById('previewMessageText');
  if (area) area.value = msg;
}

function rebuildModalMessage() {
  if (!ACTIVE_MODAL_QUOTE) return;
  if (ACTIVE_RECIPIENT === 'ASESOR') {
    buildAdvisorAlertMessage();
    return;
  }
  const q = ACTIVE_MODAL_QUOTE;
  const selectedItems = (q.items || []).filter(it => SELECTED_ITEMS_SET.has(it.ID_Partida));
  if (selectedItems.length === 0) {
    document.getElementById('previewMessageText').value = '(Selecciona al menos una pieza de la lista superior para generar el mensaje).';
    return;
  }

  const bulletLines = selectedItems.map(it => {
    const st = parseInt(it.Stock_Actual_Total || 0, 10);
    const cant = parseInt(it.Cantidad_Cotizada || 1, 10);
    let disponibilidad = '';
    if (st <= 0) {
      disponibilidad = 'actualmente agotado para entrega inmediata (requiere pedido de fábrica).';
    } else if (st < cant) {
      disponibilidad = `contamos con ${st} pza(s) listas de las ${cant} que necesitas.`;
    } else if (st === 1) {
      disponibilidad = '¡última pieza disponible para entrega inmediata!';
    } else if (st <= 3) {
      disponibilidad = `¡solo nos quedan ${st} piezas disponibles!`;
    } else {
      disponibilidad = `contamos con ${st} piezas listas para entrega inmediata.`;
    }
    return `• ${it.Nombre_Producto} (${cant} pza) — ${disponibilidad}`;
  }).join('\n');

  let rendered = '';
  if (ACTIVE_MODAL_TPL_KEY === 'SOLO_PISO') {
    rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
      `Dando seguimiento al proyecto de tu hogar, te aviso con mucho cariño que del mobiliario que te encantó ya se agotaron las existencias de almacén y únicamente nos queda la última pieza disponible en piso de exhibición:\n` +
      `${bulletLines}\n\n` +
      `Está en excelente estado y lista para entrega inmediata. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
      `¡Quedo a tus órdenes para lo que necesites!`;
  } else if (ACTIVE_MODAL_TPL_KEY === 'SEGUIMIENTO') {
    rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
      `Espero que estés teniendo un excelente día. Dando seguimiento a tu proyecto y al mobiliario que revisamos juntos:\n` +
      `${bulletLines}\n\n` +
      `Sé la gran ilusión que tienes de ver tu espacio listo y quería verificar cómo vas con las decisiones de tu hogar. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
      `¡Quedo a tus órdenes para lo que necesites!`;
  } else {
    rendered = `¡Hola ${q.Cliente}! Te saluda ${q.Asesor} de CREATA muebles. 😊\n\n` +
      `Te escribo este mensaje porque revisando disponibilidad en inventario vi que del mobiliario que te encantó:\n` +
      `${bulletLines}\n\n` +
      `Sé la gran ilusión que tienes de ver tu espacio listo y no quisiera que te los ganen, ya que son modelos de alta demanda. ¿Te gustaría que te genere el apartado hoy mismo, aprovechar la promoción y asegurar la entrega inmediata en tu casa?\n\n` +
      `¡Quedo a tus órdenes para lo que necesites!`;
  }
  document.getElementById('previewMessageText').value = rendered;
}

async function sendModalWhatsApp() {
  if (!ACTIVE_MODAL_QUOTE) return;
  const q = ACTIVE_MODAL_QUOTE;
  const msg = document.getElementById('previewMessageText').value.trim();

  let phone = '';
  if (ACTIVE_RECIPIENT === 'CLIENTE') {
    phone = cleanPhone(q.WhatsApp_Cliente);
    if (!phone || phone.length < 10) {
      alert("⚠️ Esta cotización aún no tiene número de WhatsApp del cliente. Pulsa '✏️ Editar celular' arriba para agregarlo.");
      return;
    }
  } else {
    phone = cleanPhone(q.Tel_Asesor);
    if (!phone || phone.length < 10) {
      const promptTel = prompt(`Ingresa el número de WhatsApp del asesor (${q.Asesor}):`, '');
      if (!promptTel) return;
      phone = cleanPhone(promptTel);
    }
  }

  const waUrl = `https://wa.me/52${phone.slice(-10)}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');

  const nowStr = formatNowStr(false);
  q.Fecha_Ultimo_Aviso = nowStr;
  const contactedMap = readJsonStorage(SEG_CONTACTED_CACHE_KEY, {});
  contactedMap[q.Folio_ERP] = nowStr;
  writeJsonStorage(SEG_CONTACTED_CACHE_KEY, contactedMap);

  persistSeguimientoEvent('SEG_WHATSAPP', q.Folio_ERP, {
    folio: q.Folio_ERP,
    fecha_aviso: nowStr,
    recipient: ACTIVE_RECIPIENT,
    phone,
    template: ACTIVE_MODAL_TPL_KEY,
    cliente: q.Cliente,
    asesor: q.Asesor,
    sucursal: q.Sucursal,
    usuario: (APP_STATE.user && APP_STATE.user.nombre) || q.Asesor,
    email: (APP_STATE.user && APP_STATE.user.correo) || q.Correo_Asesor
  });

  showToast(`WhatsApp abierto para ${ACTIVE_RECIPIENT === 'CLIENTE' ? 'el cliente' : 'el asesor'}`, '📲');
  closePreviewModal();
  renderQuotes();
}

async function sendModalEmail() {
  if (!ACTIVE_MODAL_QUOTE) return;
  const q = ACTIVE_MODAL_QUOTE;
  const msg = document.getElementById('previewMessageText').value.trim();

  let destinatario = '';
  let subject = '';

  if (ACTIVE_RECIPIENT === 'CLIENTE') {
    subject = `Seguimiento de tu cotización ${q.Folio_ERP} - CREATA muebles`;
    const promptEmail = prompt('Ingresa el correo del cliente:', '');
    if (!promptEmail) return;
    destinatario = promptEmail.trim();
  } else {
    subject = `Alerta de seguimiento cotización ${q.Folio_ERP} (${q.Cliente}) - CREATA muebles`;
    destinatario = cleanStr(q.Correo_Asesor);
    if (!destinatario) {
      destinatario = prompt(`Ingresa el correo del asesor (${q.Asesor}):`, '') || '';
    }
  }
  if (!destinatario) return;

  window.location.href = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;

  persistSeguimientoEvent('SEG_EMAIL', q.Folio_ERP, {
    folio: q.Folio_ERP,
    destinatario,
    asunto: subject,
    cliente: q.Cliente,
    asesor: q.Asesor,
    sucursal: q.Sucursal,
    usuario: (APP_STATE.user && APP_STATE.user.nombre) || q.Asesor,
    email: (APP_STATE.user && APP_STATE.user.correo) || q.Correo_Asesor
  });

  showToast('Aviso por correo registrado correctamente', '✉️');
  closePreviewModal();
}

function copyModalMessage() {
  const txt = document.getElementById('previewMessageText').value;
  navigator.clipboard.writeText(txt);
  showToast('Texto copiado al portapapeles', '📋');
}

function editModalClientPhone() {
  if (!ACTIVE_MODAL_QUOTE) return;
  promptClientPhone(ACTIVE_MODAL_QUOTE.Folio_ERP);
}

async function promptClientPhone(folio) {
  const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
  const current = q ? q.WhatsApp_Cliente : '';
  const input = prompt(`Ingresa el WhatsApp del cliente (${q ? q.Cliente : ''}):`, current || '');
  if (input === null) return;

  const clean = cleanPhone(input);
  if (q) {
    q.WhatsApp_Cliente = clean;
    (q.items || []).forEach(it => { it.WhatsApp_Cliente = clean; });
  }
  const phoneMap = readJsonStorage(SEG_PHONES_CACHE_KEY, {});
  phoneMap[folio] = clean;
  writeJsonStorage(SEG_PHONES_CACHE_KEY, phoneMap);

  if (ACTIVE_MODAL_QUOTE && ACTIVE_MODAL_QUOTE.Folio_ERP === folio) {
    ACTIVE_MODAL_QUOTE.WhatsApp_Cliente = clean;
    document.getElementById('previewPhoneVal').innerText = clean || 'Sin número asignado';
    rebuildModalMessage();
  }

  persistSeguimientoEvent('SEG_TELEFONO', folio, {
    folio,
    whatsapp_cliente: clean,
    cliente: q ? q.Cliente : '',
    sucursal: q ? q.Sucursal : 'N/A',
    usuario: (APP_STATE.user && APP_STATE.user.nombre) || 'Usuario',
    email: (APP_STATE.user && APP_STATE.user.correo) || ''
  });

  showToast('Teléfono guardado exitosamente', '📞');
  renderQuotes();
}

// ==============================================================================
// CIERRE DE COTIZACIÓN (GANADA / PERDIDA / CANCELADA)
// ==============================================================================
function openModalCerrar(folio) {
  const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
  if (!q) return;
  ACTIVE_CLOSE_FOLIO = folio;
  document.getElementById('closeModalFolio').innerText = folio;
  document.getElementById('closeModalCliente').innerText = `Cliente: ${q.Cliente || '--'}`;
  document.getElementById('closeModalComentarios').value = '';
  selectCloseStatus('GANADA');
  document.getElementById('modalCerrarCotizacion').classList.remove('hidden');
}

function closeModalCerrar() {
  document.getElementById('modalCerrarCotizacion').classList.add('hidden');
  ACTIVE_CLOSE_FOLIO = null;
}

function selectCloseStatus(status) {
  ACTIVE_CLOSE_STATUS = status;
  const btnG = document.getElementById('btnCloseStatusGanada');
  const btnP = document.getElementById('btnCloseStatusPerdida');
  const btnC = document.getElementById('btnCloseStatusCancelada');
  const selectMotivo = document.getElementById('closeModalMotivo');

  const baseClass = 'p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold text-center transition cursor-pointer';
  if (btnG) btnG.className = baseClass;
  if (btnP) btnP.className = baseClass;
  if (btnC) btnC.className = baseClass;

  if (status === 'GANADA') {
    if (btnG) btnG.className = 'p-2.5 rounded-xl border border-emerald-500 bg-emerald-50 text-emerald-800 text-xs font-bold text-center transition cursor-pointer';
    if (selectMotivo) selectMotivo.value = 'Venta Concretada Exitosamente';
  } else if (status === 'PERDIDA') {
    if (btnP) btnP.className = 'p-2.5 rounded-xl border border-red-500 bg-red-50 text-red-800 text-xs font-bold text-center transition cursor-pointer';
    if (selectMotivo && selectMotivo.value === 'Venta Concretada Exitosamente') {
      selectMotivo.value = 'Falta de Inventario / Producto Agotado';
    }
  } else {
    if (btnC) btnC.className = 'p-2.5 rounded-xl border border-amber-500 bg-amber-50 text-amber-800 text-xs font-bold text-center transition cursor-pointer';
    if (selectMotivo) selectMotivo.value = 'Cambio de Proyecto / No Requiere Mobiliario';
  }
}

async function submitCloseQuote() {
  if (!ACTIVE_CLOSE_FOLIO) return;
  const folio = ACTIVE_CLOSE_FOLIO;
  const motivo = document.getElementById('closeModalMotivo').value;
  const comentarios = cleanStr(document.getElementById('closeModalComentarios').value);
  const q = (APP_STATE.quotes || []).find(x => x.Folio_ERP === folio);
  const nowStr = formatNowStr(false);

  const piezasStr = q && Array.isArray(q.items)
    ? q.items.map(it => `${it.Nombre_Producto} (${it.Cantidad_Cotizada} pza)`).join(' | ')
    : '';

  const closureObj = {
    Fecha_Hora: nowStr,
    Folio_ERP: folio,
    Sucursal: q ? q.Sucursal : '',
    Asesor: q ? q.Asesor : '',
    Correo_Asesor: q ? q.Correo_Asesor : '',
    Cliente: q ? q.Cliente : '',
    WhatsApp_Cliente: q ? q.WhatsApp_Cliente : '',
    Estatus_Cierre: ACTIVE_CLOSE_STATUS,
    Motivo_Cierre: motivo,
    Comentarios: comentarios,
    Total_Productos: q && q.items ? String(q.items.length) : '1',
    Piezas_Cotizadas: piezasStr
  };

  if (q) {
    q.Cerrada = true;
    q.Estatus_Cierre = ACTIVE_CLOSE_STATUS;
    q.Motivo_Cierre = motivo;
    q.Comentarios_Cierre = comentarios;
    q.Fecha_Cierre = nowStr;
  }

  APP_STATE.closures[folio] = closureObj;
  const savedClosures = readJsonStorage(SEG_CLOSURES_CACHE_KEY, {});
  savedClosures[folio] = closureObj;
  writeJsonStorage(SEG_CLOSURES_CACHE_KEY, savedClosures);

  persistSeguimientoEvent('SEG_CIERRE', folio, {
    folio,
    fecha_hora: nowStr,
    estatus: ACTIVE_CLOSE_STATUS,
    motivo,
    comentarios,
    sucursal: closureObj.Sucursal,
    asesor: closureObj.Asesor,
    correo_asesor: closureObj.Correo_Asesor,
    cliente: closureObj.Cliente,
    whatsapp_cliente: closureObj.WhatsApp_Cliente,
    total_productos: closureObj.Total_Productos,
    piezas_cotizadas: piezasStr,
    usuario: (APP_STATE.user && APP_STATE.user.nombre) || closureObj.Asesor,
    email: (APP_STATE.user && APP_STATE.user.correo) || closureObj.Correo_Asesor
  });

  closeModalCerrar();
  showToast(`Cotización ${folio} marcada como ${ACTIVE_CLOSE_STATUS}`, '🏆');
  renderQuotes();
}

// ==============================================================================
// CAMBIO DE CONTRASEÑA Y PERSISTENCIA EN GOOGLE SHEETS
// ==============================================================================
async function submitForceChangePassword() {
  const newPwd = cleanStr(document.getElementById('inputNewPassword')?.value);
  const confirmPwd = cleanStr(document.getElementById('inputConfirmPassword')?.value);
  const errEl = document.getElementById('pwdChangeError');
  const btn = document.getElementById('btnSubmitChangePwd');

  if (errEl) errEl.classList.add('hidden');
  if (!newPwd || newPwd.length < 5) {
    if (errEl) {
      errEl.innerText = 'La contraseña debe tener al menos 5 caracteres.';
      errEl.classList.remove('hidden');
    }
    return;
  }
  if (newPwd !== confirmPwd) {
    if (errEl) {
      errEl.innerText = 'Las contraseñas no coinciden.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const user = APP_STATE.user;
  if (!user) return;
  const em = normalizeEmail(user.correo);

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Guardando contraseña...';
  }

  try {
    const segKeys = readJsonStorage(SEG_UPDATED_KEYS_STORAGE, {});
    segKeys[em] = newPwd;
    writeJsonStorage(SEG_UPDATED_KEYS_STORAGE, segKeys);

    const invKeys = readJsonStorage(INV_UPDATED_KEYS_STORAGE, {});
    invKeys[em] = newPwd;
    writeJsonStorage(INV_UPDATED_KEYS_STORAGE, invKeys);

    user.debe_cambiar_password = false;
    writeJsonStorage(SEG_SESSION_KEY, user);

    await callWebAppPost({
      action: 'inv_update_key',
      email: em,
      newKey: newPwd,
      sheetTab: user.sheet_tab || user.sucursal
    });

    document.getElementById('modalForceChangePassword')?.classList.add('hidden');
    showToast('Contraseña actualizada exitosamente', '🔒');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Guardar y Entrar al Sistema</span><span>→</span>';
    }
  }
}

async function persistSeguimientoEvent(eventCode, refFolio, payload) {
  // 1) Try native seg_action on Apps Script Web App
  const res = await callWebAppPost({
    action: 'seg_action',
    subAction: eventCode,
    folio: refFolio,
    payload
  });
  if (res && res.ok) return;

  // 2) Fallback to already-deployed inv_log_event on Apps Script Web App (persists in Google Sheets HISTORIAL!)
  await callWebAppPost({
    action: 'inv_log_event',
    classification: 'MOVIMIENTO',
    module: 'SEGUIMIENTO_COTIZACIONES',
    event: eventCode,
    status: '✅ OK',
    user: payload.usuario || (APP_STATE.user && APP_STATE.user.nombre) || 'Usuario',
    branch: payload.sucursal || (APP_STATE.user && APP_STATE.user.sucursal) || 'TODAS',
    ref: refFolio || 'SEGUIMIENTO',
    detail: JSON.stringify(payload)
  });
}

function recordSegAuditEvent(tipo, accion, detalle, usuario, email, sucursal, status = 'EXITOSO') {
  const item = {
    id: `local_${Date.now()}`,
    fecha_hora: formatNowStr(true),
    tipo,
    usuario,
    email,
    sucursal,
    accion,
    detalle,
    ip: 'Web-App',
    status
  };
  const list = readJsonStorage(SEG_AUDIT_CACHE_KEY, []);
  list.unshift(item);
  writeJsonStorage(SEG_AUDIT_CACHE_KEY, list.slice(0, 200));

  const eventCode = tipo === 'LOGIN' ? 'SEG_LOGIN' : (tipo === 'LOGOUT' ? 'SEG_LOGOUT' : 'SEG_AUDIT');
  persistSeguimientoEvent(eventCode, sucursal || 'SISTEMA', {
    tipo,
    accion,
    detalle,
    usuario,
    email,
    sucursal,
    status
  });
}

// ==============================================================================
// SINCRONIZACIÓN MANUAL CON S MUEBLERÍA ERP
// ==============================================================================
async function triggerManualSync() {
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  if (icon) icon.classList.add('animate-spin');
  if (text) text.innerText = 'Sincronizando...';

  showToast('Sincronizando cotizaciones y existencias con S Mueblería ERP...', '🔄');
  try {
    await Promise.race([
      callWebAppPost({ action: 'seg_sync_now' }, 12000),
      callWebAppPost({ action: 'inv_erp_sync_now' }, 12000)
    ]);
  } catch (e) {}

  await fetchLiveState();
  if (icon) icon.classList.remove('animate-spin');
  if (text) text.innerText = 'Actualizar ERP';
  showToast('Información actualizada en vivo con S Mueblería ERP', '✅');
}

// ==============================================================================
// PANEL MAESTRO DE AUDITORÍA E HISTORIAL (EXCLUSIVO KEVIN REYNA)
// ==============================================================================
async function openKevinAuditModal() {
  if (!isKevinReyna(APP_STATE.user)) return;
  const modal = document.getElementById('modalKevinAudit');
  if (!modal) return;
  modal.classList.remove('hidden');
  await fetchLiveState(true);
  loadKevinAuditData();
}

function closeKevinAuditModal() {
  document.getElementById('modalKevinAudit')?.classList.add('hidden');
}

function loadKevinAuditData() {
  const logs = (APP_STATE.auditLogs || []).slice().reverse();
  AUDIT_STATE.logs = logs;

  let loginsOk = 0;
  let loginsFail = 0;
  let totalWa = 0;
  let totalCierres = 0;

  for (const l of logs) {
    if (l.tipo === 'LOGIN') {
      if (l.status === 'EXITOSO') loginsOk++;
      else loginsFail++;
    } else if (l.tipo === 'WHATSAPP') {
      totalWa++;
    } else if (l.tipo === 'CIERRE') {
      totalCierres++;
    }
  }

  document.getElementById('auditMetricLoginsOk').innerText = loginsOk;
  document.getElementById('auditMetricLoginsFail').innerText = loginsFail;
  document.getElementById('auditMetricWhatsApps').innerText = totalWa;
  document.getElementById('auditMetricCierres').innerText = totalCierres;

  filterAuditView();
}

function setAuditTab(tabKey) {
  AUDIT_STATE.activeTab = tabKey;
  const tabs = {
    'LOGINS': 'tabAuditLogins',
    'MOVIMIENTOS': 'tabAuditMovimientos',
    'HISTORIAL_COTIZACIONES': 'tabAuditCotizaciones'
  };
  Object.keys(tabs).forEach(k => {
    const btn = document.getElementById(tabs[k]);
    if (!btn) return;
    if (k === tabKey) {
      btn.className = 'audit-tab-btn py-1.5 px-3 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs shadow-2xs cursor-pointer';
    } else {
      btn.className = 'audit-tab-btn py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer';
    }
  });
  filterAuditView();
}

function filterAuditView() {
  const searchTerm = cleanStr(document.getElementById('auditSearchInput')?.value || '').toLowerCase();
  if (AUDIT_STATE.activeTab === 'LOGINS') renderAuditLogins(searchTerm);
  else if (AUDIT_STATE.activeTab === 'MOVIMIENTOS') renderAuditMovimientos(searchTerm);
  else renderAuditCotizaciones(searchTerm);
}

function renderAuditLogins(searchTerm) {
  const container = document.getElementById('auditTableContainer');
  const logins = (AUDIT_STATE.logs || []).filter(l => l.tipo === 'LOGIN' || l.tipo === 'LOGOUT');
  const filtered = logins.filter(l => {
    if (!searchTerm) return true;
    return `${l.usuario} ${l.email} ${l.sucursal} ${l.ip} ${l.detalle} ${l.status}`.toLowerCase().includes(searchTerm);
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="py-12 text-center text-slate-400 text-xs">No hay registros de inicio de sesión que coincidan.</div>';
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
            <th class="py-2.5 px-3">Fecha y Hora</th>
            <th class="py-2.5 px-3">Usuario / Correo</th>
            <th class="py-2.5 px-3">Tienda</th>
            <th class="py-2.5 px-3">IP / Origen</th>
            <th class="py-2.5 px-3 text-center">Estado</th>
            <th class="py-2.5 px-3">Detalle</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${filtered.map(l => {
            const isOk = l.status === 'EXITOSO';
            const badgeClass = l.tipo === 'LOGOUT'
              ? 'bg-slate-100 text-slate-700 border-slate-200'
              : (isOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200');
            const badgeLabel = l.tipo === 'LOGOUT' ? '🚪 SALIDA' : (isOk ? '🟢 EXITOSO' : '🔴 FALLIDO');
            return `
              <tr class="hover:bg-slate-50/70 transition">
                <td class="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">${l.fecha_hora}</td>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-900">${l.usuario || 'Desconocido'}</div>
                  <div class="text-[11px] text-slate-500 font-mono">${l.email || '--'}</div>
                </td>
                <td class="py-2.5 px-3 text-slate-600">${l.sucursal || 'General'}</td>
                <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500">${l.ip || 'Web'}</td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                  <span class="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] border ${badgeClass}">${badgeLabel}</span>
                </td>
                <td class="py-2.5 px-3 text-slate-500 max-w-xs truncate" title="${l.detalle}">${l.detalle}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditMovimientos(searchTerm) {
  const container = document.getElementById('auditTableContainer');
  const movements = (AUDIT_STATE.logs || []).filter(l => l.tipo !== 'LOGIN' && l.tipo !== 'LOGOUT');
  const filtered = movements.filter(l => {
    if (!searchTerm) return true;
    return `${l.tipo} ${l.usuario} ${l.accion} ${l.detalle} ${l.sucursal}`.toLowerCase().includes(searchTerm);
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="py-12 text-center text-slate-400 text-xs">No hay movimientos operativos registrados aún.</div>';
    return;
  }

  const iconMap = {
    'WHATSAPP': '📲',
    'EMAIL': '✉️',
    'TELEFONO': '📱',
    'CIERRE': '🏆',
    'SYNC': '🔄',
    'SEGURIDAD': '🔒',
    'EXPORT': '📥'
  };

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
            <th class="py-2.5 px-3">Fecha y Hora</th>
            <th class="py-2.5 px-3">Tipo</th>
            <th class="py-2.5 px-3">Usuario Responsable</th>
            <th class="py-2.5 px-3">Acción Realizada</th>
            <th class="py-2.5 px-3">Detalle Operativo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${filtered.map(m => {
            const icon = iconMap[m.tipo] || '📝';
            return `
              <tr class="hover:bg-slate-50/70 transition">
                <td class="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">${m.fecha_hora}</td>
                <td class="py-2.5 px-3 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    <span>${icon}</span>
                    <span>${m.tipo}</span>
                  </span>
                </td>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-900">${m.usuario}</div>
                  <div class="text-[11px] text-slate-500">${m.sucursal}</div>
                </td>
                <td class="py-2.5 px-3 font-semibold text-slate-800">${m.accion}</td>
                <td class="py-2.5 px-3 text-slate-600 max-w-sm truncate" title="${m.detalle}">${m.detalle}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditCotizaciones(searchTerm) {
  const container = document.getElementById('auditTableContainer');
  const quotes = APP_STATE.quotes || [];
  const filtered = quotes.filter(q => {
    if (!searchTerm) return true;
    return `${q.Folio_ERP} ${q.Cliente} ${q.Asesor} ${q.Sucursal} ${q.Estatus_Cierre}`.toLowerCase().includes(searchTerm);
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="py-12 text-center text-slate-400 text-xs">No se encontraron cotizaciones con la búsqueda.</div>';
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
            <th class="py-2.5 px-3">Folio</th>
            <th class="py-2.5 px-3">Fecha</th>
            <th class="py-2.5 px-3">Cliente</th>
            <th class="py-2.5 px-3">Asesor / Tienda</th>
            <th class="py-2.5 px-3">Teléfono</th>
            <th class="py-2.5 px-3 text-center">Estado</th>
            <th class="py-2.5 px-3">Productos</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${filtered.map(q => {
            const badge = q.Cerrada
              ? `<span class="px-2 py-0.5 rounded font-bold text-[10px] ${q.Estatus_Cierre === 'GANADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${q.Estatus_Cierre || 'CERRADA'}</span>`
              : `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200">ABIERTA</span>`;
            return `
              <tr class="hover:bg-slate-50/70 transition">
                <td class="py-2.5 px-3 font-mono font-black text-slate-900">${q.Folio_ERP}</td>
                <td class="py-2.5 px-3 text-slate-600">${q.Fecha_Cotizacion}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${q.Cliente}</td>
                <td class="py-2.5 px-3 text-slate-700">${q.Asesor} (${q.Sucursal})</td>
                <td class="py-2.5 px-3 font-mono text-slate-600">${q.WhatsApp_Cliente || 'Sin cel'}</td>
                <td class="py-2.5 px-3 text-center">${badge}</td>
                <td class="py-2.5 px-3 text-slate-500">${q.Total_Productos || (q.items || []).length} muebles</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportKevinAuditReport() {
  const logs = AUDIT_STATE.logs || [];
  const header = ['FECHA_HORA', 'TIPO', 'USUARIO', 'EMAIL', 'SUCURSAL', 'ACCION', 'DETALLE', 'IP', 'ESTATUS'];
  const csvLines = [header.join(',')];
  for (const l of logs) {
    const row = [
      l.fecha_hora || '',
      l.tipo || '',
      l.usuario || '',
      l.email || '',
      l.sucursal || '',
      l.accion || '',
      l.detalle || '',
      l.ip || 'Web',
      l.status || 'EXITOSO'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    csvLines.push(row.join(','));
  }
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `REPORTE_AUDITORIA_Y_MOVIMIENTOS_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Reporte CSV descargado exitosamente', '📥');
}

function showToast(msg, icon = '📋') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toastIcon').innerText = icon;
  document.getElementById('toastMsg').innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3000);
}

// ==============================================================================
// INICIALIZACIÓN AUTOMÁTICA
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await fetchLiveState();
  setInterval(() => fetchLiveState(true), 30000);
});
