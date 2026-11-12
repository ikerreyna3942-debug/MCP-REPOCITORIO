// CREATA MUEBLES — CLOUD & GVIZ ENGINE
(function (global) { 'use strict';
const DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';
const DRIVE_ID_BY_KEY = global.CREATA_DRIVE_ID_BY_KEY || {};
const FINISH_BY_KEY = global.CREATA_FINISH_BY_KEY || {};
const KNOWN_PROVIDERS_RE_ = /(?:^|[\s\-/]+)(?:SKANOR|ARMONY|ARM|ARTEX|ATX|BARSA|BRS|MOBEL\s+INN|MOBEL|MBI|GOMPE|GMP|YOI|LUIS\s+PEDRO\s+MOBILIARIO|LUIS\s+PEDRO|LPM|KASAM|KSM|KUDU|KDU|PAYMA|PYM|PICCOLA|PCC|PCL|REVICA|RVC|CASA\s+V&V|CVV|CASA\s+CREATA|CREATA|KEU)(?=$|[\s\-/]+)/gi;
function cleanFinishLabelClient_(rawLbl, modelName) { let s = String(rawLbl || '').trim()
.replace(/\.(png|jpe?g|webp|gif|pdf)$/i, '')
.replace(/_/g, ' ')
.replace(/\bPIXEL\s+LIMEN\b/gi, 'PIXEL LINEN')
.replace(/\bBRAXON\b/gi, 'BRAXTON')
.replace(/\s+/g, ' ')
.trim()
.toUpperCase();
if (!s) return '';
s = s.replace(KNOWN_PROVIDERS_RE_, ' ').trim();
s = s.replace(/\b(ACABADOS?\s+DE\s+|ACABADOS?\s+|MADERAS?\s+DE\s+MESA\s+|MADERAS?\s+MESA\s+)\b/gi, ' ').trim();
if (modelName) {
const safeSet = new Set(['ROSA','MORADA','CLARA','OSCURA','NATURAL','NOGAL','PAROTA','TZALAM','ENCINO','ROBLE','NUEZ','BEIGE','GRIS','BLANCO','NEGRO','CAFE','COFFE','TAUPE','IVORY','OLIVE','PUTTY','SCAR','KIMI','PORCELAINE','ALTMAN','COTTON','LINEN','PIEL','CUERDA','ESPIGA','BAKER','KELSI','TACUBA','BELLOTA','HABANO','NOCHE','PIXEL','RUSTY','GELLAR','MARBLE','RHONA','ECRU','OSI','FLAX','PRISMA','MUSHROOM','FOREVER','PLUS','BUTTERMILK','MOSS','HADI','HADY','BRAXTON','OAT','SNOW','SAND','LILA','ALINE','CASHMERE','TOAST','BERKELEY','LUXOR','NORDIC','GREY','POINT','JEANS','QUINCY','CHARCOAL','MERCURY','PEYOTE','NATURE','FRESH','NAPOLI','TELA','MADERA','METAL']);
String(modelName).toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÑ\s]/g, ' ').split(/\s+/).forEach((mw) => {
if (mw.length >= 4 && !safeSet.has(mw)) {
const esc = mw.replace(/[.*+?^${}()|[\]\\]/g, '\\    const CREATA_CLOUD_CONFIG = {');
s = s.replace(new RegExp('(?:^|[\\s\\-/]+)' + esc + '(?=$|[\\s\\-/]+)', 'gi'), ' ').trim(); } }); }
s = s.replace(/(?:^|\s+)\d+(?=\s+|$)/g, ' ')
.replace(/\s*-\s*/g, ' - ')
.replace(/(?:\s*-\s*)+/g, ' - ')
.replace(/^(?:[\s\-/]+|DE\s+)+|(?:\s+DE|[\s\-/]+)+$/g, '')
.replace(/\s+/g, ' ')
.trim();
return s; }
function resolveAjFinishClient_(id, modelName, rawSku, salaKey, vIdx, variantSku) {
const skuParts = String(rawSku || '').split('/').map((x) => x.trim().toUpperCase()).filter(Boolean);
const candidates = [
variantSku ? String(variantSku).trim().toUpperCase() : '',
skuParts[vIdx || 0] || '',
skuParts[0] || '',
salaKey ? String(salaKey).trim().toUpperCase() : '',
id ? String(id).trim().toUpperCase() : '',
id ? String(id).trim().toUpperCase().replace(/^IND-/, '') : '',
modelName ? ('SALA:' + String(modelName).trim().toUpperCase()) : ''
];
for (let i = 0; i < candidates.length; i++) { const k = candidates[i];
if (k && FINISH_BY_KEY[k]) return FINISH_BY_KEY[k]; }
return null; }
const CREATA_CLOUD_CONFIG = { sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
driveFolderId: '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT',
inventoryLocations: ['CEDIS', 'CASA CREATA', 'COLOSIO', 'PLAYA', 'PUERTO CANCUN'],
githubOwner: 'ikerreyna3942-debug',
githubRepo: 'MCP-REPOCITORIO',
getApiUrl: function () {
try { const localUrl = localStorage.getItem('creata_sheets_webapp_url');
if (localUrl && /^https:\/\/script\.google(usercontent)?\.com\//i.test(localUrl.trim())) { return localUrl.trim(); } } catch (e) {}
return DEFAULT_WEBAPP_URL;
},
setApiUrl: function (url) { const clean = (url || '').trim();
if (!clean) { localStorage.removeItem('creata_sheets_webapp_url'); } else { localStorage.setItem('creata_sheets_webapp_url', clean); }
return clean;
},
getAdminPin: function () {
try { return (localStorage.getItem('creata_admin_pin') || '').trim(); } catch (e) { return ''; }
},
setAdminPin: function (pin) { const clean = (pin || '').trim();
if (!clean) { localStorage.removeItem('creata_admin_pin'); } else { localStorage.setItem('creata_admin_pin', clean); }
return clean;
},
hasWriteApi: function () { return !!this.getApiUrl();
},
isConfigured: function () { return !!this.sheetId || !!this.getApiUrl(); } };
try {
if (global.location && global.location.search) { const params = new URLSearchParams(global.location.search);
const paramUrl = params.get('webapp') || params.get('api');
if (paramUrl && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(paramUrl.trim())) { CREATA_CLOUD_CONFIG.setApiUrl(paramUrl.trim()); }
const paramPin = params.get('pin');
if (paramPin) CREATA_CLOUD_CONFIG.setAdminPin(paramPin.trim()); } } catch (e) {}
function isValidPhotoUrl(val) { if (!val || typeof val !== 'string') return false;
const s = val.trim();
if (!s || s === 'undefined' || s === 'null' || s === '#') return false;
return s.startsWith('data:image/') || s.startsWith('https://') || s.startsWith('http://') || s.startsWith('./') || s.startsWith('fotos/'); }
function scrubForbiddenPublicText(txt) { if (!txt || typeof txt !== 'string') return txt || '';
return txt
.replace(/JUEGO COMPLETO\s*\([^)]*\)/gi, '')
.replace(/JUEGO COMPLETO/gi, '')
.replace(/JUEGO MODULAR COMPLETO/gi, '')
.replace(/\n?\[Composición\]:[\s\S]*$/i, '')
.replace(/\bSin descripción\b\.?/gi, '')
.trim(); }
function sanitizePublicProduct(prod) { if (!prod || typeof prod !== 'object') return null;
const clone = {};
const forbiddenKeys = new Set([
'sku', 'sku_base', 'sku_mode', 'is_unified_sku',
'temp_unified_sku', 'piece_composition', 'cost',
'sheet_specs', 'drive_file_id', 'inventory'
]);
Object.keys(prod).forEach((k) => { if (forbiddenKeys.has(k)) return;
clone[k] = prod[k]; });
clone.model_name = scrubForbiddenPublicText(clone.model_name);
clone.materials = scrubForbiddenPublicText(clone.materials);
clone.category = normalizeCategoryClient_(clone.category);
const ajProdFallback = resolveAjFinishClient_(clone.id, clone.model_name, prod.sku || '');
if (Array.isArray(clone.variants)) {
clone.variants = clone.variants.map((v, vIdx) => { const vc = {};
Object.keys(v || {}).forEach((vk) => { if (forbiddenKeys.has(vk)) return;
vc[vk] = v[vk]; });
vc.materials = scrubForbiddenPublicText(vc.materials);
let inferredLbl = cleanFinishLabelClient_(
inferColorLabelFromData(
scrubForbiddenPublicText(vc.color_label),
vc.materials || clone.materials,
''
),
clone.model_name
);
if ((!inferredLbl || /^(EST[AÁ]NDAR|ACABADO|OPCI[OÓ]N\s*\d+|NATURAL)$/i.test(inferredLbl)) && vIdx === 0 && ajProdFallback && ajProdFallback.label) { inferredLbl = ajProdFallback.label; }
vc.color_label = inferredLbl || 'NATURAL';
vc.finish_type = vc.finish_type || inferFinishType(vc.color_label, vc.materials || clone.materials);
vc.hero_scale = Number(v.hero_scale) || 1;
vc.hero_pos = (v.hero_pos && typeof v.hero_pos === 'object') ? { x: Number(v.hero_pos.x) || 0, y: Number(v.hero_pos.y) || 0 } : { x: 0, y: 0 };
vc.slot_scales = (v.slot_scales && typeof v.slot_scales === 'object') ? Object.assign({}, v.slot_scales) : {};
vc.slot_pos = (v.slot_pos && typeof v.slot_pos === 'object') ? JSON.parse(JSON.stringify(v.slot_pos)) : {};
vc.hero_b64 = isValidPhotoUrl(vc.hero_b64) ? vc.hero_b64.trim() : '';
vc.swatch_img = isValidPhotoUrl(vc.swatch_img) ? vc.swatch_img.trim() : ((vIdx === 0 && ajProdFallback && ajProdFallback.img) ? ajProdFallback.img : '');
if (vc.gallery && typeof vc.gallery === 'object') { const g = Object.assign({}, vc.gallery);
g.ambiente = isValidPhotoUrl(g.ambiente) ? g.ambiente.trim() : '';
g.finish = isValidPhotoUrl(g.finish) ? g.finish.trim() : '';
g.fabric = isValidPhotoUrl(g.fabric) ? g.fabric.trim() : '';
['view1', 'view2', 'view3', 'view4'].forEach((k) => { g[k] = isValidPhotoUrl(g[k]) ? g[k].trim() : ''; });
if (Array.isArray(g.all_views)) {
g.all_views = g.all_views.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')); }
const hasAnyView = !!(g.view1 || g.view2 || g.view3 || g.view4 || (Array.isArray(g.all_views) && g.all_views.some(Boolean)));
if (Array.isArray(g.finishes)) {
g.finishes = g.finishes.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')).filter(Boolean); }
const linkedFinish = vc.swatch_img || g.finish || g.fabric || (g.finishes && g.finishes[0]) || '';
vc.swatch_img = linkedFinish;
g.finish = linkedFinish;
g.fabric = linkedFinish;
if (linkedFinish) g.finishes = [linkedFinish];
if (vc.hero_b64 && /-finish-\d+\./i.test(vc.hero_b64) && !g.ambiente && !hasAnyView) { vc.hero_b64 = ''; }
vc.gallery = g; }
return vc; }); } else { clone.variants = []; }
if (Array.isArray(clone.sala_modules)) {
clone.sala_modules = clone.sala_modules.map((m) => ({ name: scrubForbiddenPublicText(m.name),
price: parseFloat(m.price) || 0,
width: m.width || '',
depth: m.depth || '',
height: m.height || '',
qty: parseInt(m.qty, 10) || 1,
checked: m.checked !== false
})); }
return clone; }
const parseCurrencyValue = (v) => global.CreataImg.parseCurrencyValue(v);
const formatCurrencyMXN = (n) => global.CreataImg.formatCurrencyMXN(n);
const detectProductPieces = (p, s, k) => global.CreataImg.detectProductPieces(p, s, k);
function inferFinishType(colorLabel, materials) { const lbl = String(colorLabel || '').trim();
if (/MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO|CHAPA|BELLOTA|PINO|FRESNO|TECA/i.test(lbl)) return 'MADERA';
if (!lbl && /MADERA|ROBLE|NOGAL|TZALAM|PAROTA|ENCINO|CHAPA|BELLOTA/i.test(String(materials || '')) && !/TELA|PIEL|LINO|POLI[EÉ]STER|TERCIOPELO/i.test(String(materials || ''))) { return 'MADERA'; }
return 'TELA'; }
function inferColorLabelFromData(existingLabel, materials, baseLabel) { const cleanExisting = String(existingLabel || '').trim();
if (cleanExisting && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*1|EST[AÁ]NDAR|ACABADO)$/i.test(cleanExisting)) { return cleanExisting.toUpperCase(); }
const cleanBase = String(baseLabel || '').trim();
if (cleanBase && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*1|EST[AÁ]NDAR|ACABADO)$/i.test(cleanBase)) { return cleanBase.toUpperCase(); }
const mat = String(materials || '');
const mTela = mat.match(/Tela(?:\s+Base\s*[A-Z]?)?\s*:\s*([^|(\n]+)/i);
if (mTela && mTela[1]) { const candidate = mTela[1].trim();
if (candidate && !/^\d+%/.test(candidate)) return candidate.toUpperCase(); }
const mMad = mat.match(/(?:Tono\s+madera|Madera|Acabado)\s*:\s*([^|(\n]+)/i);
if (mMad && mMad[1]) return mMad[1].trim().toUpperCase();
return cleanBase ? cleanBase.toUpperCase() : 'ACABADO OFICIAL'; }
const compressImageFast = (src, mw, mh, q, o) => global.CreataImg.compressImageFast(src, mw, mh, q, o);
let __gvizSeq = 0;
let __discoverPromise = null;
function gvizJsonpQuery(sheetName, timeoutMs = 6000) {
return new Promise((resolve) => {
if (!global.document || !CREATA_CLOUD_CONFIG.sheetId) { resolve(null);
return; }
const cbName = `__creataGvizCb_${Date.now()}_${++__gvizSeq}`;
const script = global.document.createElement('script');
let settled = false;
const cleanup = () => { try { delete global[cbName]; } catch (e) { global[cbName] = undefined; }
if (script && script.parentNode) script.parentNode.removeChild(script); };
const timer = setTimeout(() => { if (settled) return;
settled = true;
cleanup();
resolve(null);
}, timeoutMs);
global[cbName] = (payload) => { if (settled) return;
settled = true;
clearTimeout(timer);
cleanup();
if (payload && payload.status === 'ok' && payload.table) { resolve(payload.table); } else { resolve(null); } };
script.onerror = () => { if (settled) return;
settled = true;
clearTimeout(timer);
cleanup();
resolve(null); };
const sid = encodeURIComponent(CREATA_CLOUD_CONFIG.sheetId);
const sname = encodeURIComponent(sheetName);
script.async = true;
script.src = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${sname}&_t=${Date.now()}`;
(global.document.head || global.document.body).appendChild(script); }); }
function gvizCell(row, idx) { if (!row || !Array.isArray(row.c) || !row.c[idx]) return '';
const c = row.c[idx];
if (c.v !== null && c.v !== undefined) return c.v;
return c.f || ''; }
async function discoverWebAppUrlFromSheet() {
if (CREATA_CLOUD_CONFIG.getApiUrl()) return CREATA_CLOUD_CONFIG.getApiUrl();
if (__discoverPromise) return __discoverPromise;
__discoverPromise = (async () => {
try { const tbl = await gvizJsonpQuery('_CREATA_CONFIG', 4500);
if (tbl && Array.isArray(tbl.rows)) {
for (let i = 0; i < tbl.rows.length; i++) { const k = String(gvizCell(tbl.rows[i], 0) || '').trim().toUpperCase();
const v = String(gvizCell(tbl.rows[i], 1) || '').trim();
if ((k === 'WEBAPP_URL' || !k) && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(v)) { CREATA_CLOUD_CONFIG.setApiUrl(v);
return v; } }
if (Array.isArray(tbl.cols)) {
for (let j = 0; j < tbl.cols.length; j++) { const lbl = String((tbl.cols[j] && tbl.cols[j].label) || '').trim();
if (/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(lbl)) { CREATA_CLOUD_CONFIG.setApiUrl(lbl);
return lbl; } } } } } catch (e) {}
return CREATA_CLOUD_CONFIG.getApiUrl();
})();
const res = await __discoverPromise;
__discoverPromise = null;
return res; }
function fmtMeasureClient_(val, unit) { const s = String(val === null || val === undefined ? '' : val).trim();
if (!s || s === '0') return '';
return s.toLowerCase().includes(unit.toLowerCase()) ? s : `${s} ${unit}`; }
function normalizeCategoryClient_(cat) { const c = String(cat || '').trim().toUpperCase();
if (!c) return 'COMPLEMENTOS';
const exact7 = [
'SALAS & SOFÁS',
'SILLAS & SILLONES',
'COMEDORES',
'BUFETERAS & CREDENZAS',
'MESAS DE CENTRO & LATERALES',
'RECÁMARAS',
'COMPLEMENTOS'
];
if (exact7.indexOf(c) >= 0) return c;
if (c === 'MESAS DE CENTRO' || c.includes('MESA DE CENTRO') || c.includes('MESAS DE CENTRO') || c.includes('MESA LATERAL') || c.includes('MESAS LATERALES')) return 'MESAS DE CENTRO & LATERALES';
if (c.includes('SALA') || c.includes('SOF')) return 'SALAS & SOFÁS';
if (c.includes('SILLA') || c.includes('SILL')) return 'SILLAS & SILLONES';
if (c.includes('COMEDOR') || c.includes('COMED')) return 'COMEDORES';
if (c.includes('BUFET') || c.includes('CREDEN')) return 'BUFETERAS & CREDENZAS';
if (c.includes('RECÁMARA') || c.includes('RECAMARA') || c.includes('CAMA') || c.includes('BURÓ') || c.includes('BURO') || c.includes('CÓMODA') || c.includes('COMODA') || c.includes('CAJONERA')) return 'RECÁMARAS';
if (c.includes('COMPLEMENTO') || c.includes('ESPEJO') || c.includes('LIBRERO') || c.includes('ENTRETENIMIENTO')) return 'COMPLEMENTOS';
return c; }
function resolveDriveUrlClient_(rawVal, ...lookupKeys) { const rawStr = String(rawVal || '').trim();
if (/^https?:\/\//i.test(rawStr)) return rawStr;
const candidates = [...lookupKeys, rawStr];
for (let i = 0; i < candidates.length; i++) { const k = String(candidates[i] || '').trim().toUpperCase();
if (k && DRIVE_ID_BY_KEY[k]) {
return `https://drive.google.com/file/d/${DRIVE_ID_BY_KEY[k]}/view?usp=sharing`; } }
return ''; }
function parseMasterTabsFromGviz_(salasTbl, indivTbl) { const invCols = CREATA_CLOUD_CONFIG.inventoryLocations || [];
const salasById = {};
const salasList = [];
if (salasTbl && Array.isArray(salasTbl.rows)) { let curPieces = [];
salasTbl.rows.forEach((sr) => { const sid = String(gvizCell(sr, 0) || '').trim();
if (!sid || sid.toUpperCase() === 'ID SALA') return;
const sname = scrubForbiddenPublicText(String(gvizCell(sr, 1) || '').trim());
const psku = String(gvizCell(sr, 2) || '').trim().toUpperCase();
const pname = scrubForbiddenPublicText(String(gvizCell(sr, 3) || '').trim());
const qtyRaw = gvizCell(sr, 4);
const qtyParsed = (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) ? 0 : Number(qtyRaw);
const sheetQty = isNaN(qtyParsed) ? 0 : qtyParsed;
const showFlag = String(gvizCell(sr, 12) || '').trim().toUpperCase();
const rawLinkCell = gvizCell(sr, 13);
const rowInv = {};
invCols.forEach((locName, idx) => { const rawInv = gvizCell(sr, 14 + idx);
if (rawInv !== '' && rawInv !== null && rawInv !== undefined) { const n = Number(rawInv);
if (!isNaN(n) && n > 0) rowInv[locName] = n; } });
if (showFlag.includes('SÍ') || showFlag.includes('SI') || psku.includes('-TOTAL')) { const totalPrice = parseCurrencyValue(gvizCell(sr, 10));
const sumChecked = curPieces
.filter((x) => x.checked)
.reduce((acc, x) => acc + (x.price * (x.qty || 1)), 0);
const finalTotal = totalPrice > 0 ? totalPrice : sumChecked;
const driveUrl = resolveDriveUrlClient_(rawLinkCell, sid, ...(curPieces.map((x) => x.sku)));
const salaObj = { id: sid,
name: sname || sid,
totalPrice: finalTotal,
dimsSummary: String(gvizCell(sr, 11) || '').trim(),
driveUrl: driveUrl,
pieces: curPieces.slice(),
inventory: rowInv };
salasById[sid.toUpperCase()] = salaObj;
salasList.push(salaObj);
curPieces = []; } else if (psku) {
curPieces.push({ sku: psku,
code: psku.slice(-6) || 'MOD',
name: pname || psku,
qty: sheetQty > 0 ? sheetQty : 1,
sheetQty: sheetQty,
checked: sheetQty > 0,
optional: sheetQty === 0,
width: fmtMeasureClient_(gvizCell(sr, 5), 'cm'),
depth: fmtMeasureClient_(gvizCell(sr, 6), 'cm'),
height: fmtMeasureClient_(gvizCell(sr, 7), 'cm'),
price: parseCurrencyValue(gvizCell(sr, 8)),
photoSlot: `view${Math.min(4, curPieces.length + 1)}`,
inventory: rowInv }); } }); }
const indivList = [];
const indivBySku = {};
if (indivTbl && Array.isArray(indivTbl.rows)) {
indivTbl.rows.forEach((ir, rIdx) => { const sku = String(gvizCell(ir, 1) || '').trim().toUpperCase();
if (!sku || sku === 'SKU') return;
const prov = String(gvizCell(ir, 0) || 'CREATA').trim();
const name = scrubForbiddenPublicText(String(gvizCell(ir, 2) || '').trim());
if (!name) return;
const cat = normalizeCategoryClient_(gvizCell(ir, 3));
const rawFile = gvizCell(ir, 12);
const rawLink = gvizCell(ir, 13);
const driveUrl = resolveDriveUrlClient_(rawLink, sku, rawFile);
const rowInv = {};
invCols.forEach((locName, idx) => { const rawInv = gvizCell(ir, 14 + idx);
if (rawInv !== '' && rawInv !== null && rawInv !== undefined) { const n = Number(rawInv);
if (!isNaN(n) && n > 0) rowInv[locName] = n; } });
const pkgRaw = String(gvizCell(ir, 9) || '1 bulto').trim();
const item = { rowIdx: rIdx,
provider: prov,
sku: sku,
name: name,
category: cat,
width: fmtMeasureClient_(gvizCell(ir, 4), 'cm'),
depth: fmtMeasureClient_(gvizCell(ir, 5), 'cm'),
height: fmtMeasureClient_(gvizCell(ir, 6), 'cm'),
seat: fmtMeasureClient_(gvizCell(ir, 7), 'cm'),
volume: fmtMeasureClient_(gvizCell(ir, 8), 'm³'),
packages: /bulto|pieza/i.test(pkgRaw) ? pkgRaw : `${pkgRaw} bultos`,
priceNum: parseCurrencyValue(gvizCell(ir, 10)),
materials: scrubForbiddenPublicText(String(gvizCell(ir, 11) || '').trim()),
driveUrl: driveUrl,
inventory: rowInv };
indivList.push(item);
if (!indivBySku[sku]) indivBySku[sku] = [];
indivBySku[sku].push(item); }); }
global.LIVE_SHEET_SALAS = salasById;
global.LIVE_SHEET_INDIV = indivBySku;
return { salasById, salasList, indivList, indivBySku }; }
function matchSalaKeyForProduct_(modelName, prodId, salasById) { const upId = String(prodId || '').trim().toUpperCase();
if (salasById[upId]) return upId;
const upName = String(modelName || '').trim().toUpperCase();
if (upName.includes('MATERA') && salasById['SALA-MATERA']) return 'SALA-MATERA';
if (upName.includes('MARENO') && !upName.includes('LOVE') && salasById['SALA-MARENO']) return 'SALA-MARENO';
if (upName.includes('MONET') && !upName.includes('LOVE') && salasById['SALA-MONET']) return 'SALA-MONET';
const foundKey = Object.keys(salasById).find((k) => { const s = salasById[k];
return s && s.name && upName === s.name.toUpperCase(); });
return foundKey || ''; }
function buildArchivedSalaProduct_(sdata) { const pList = (sdata.pieces || []).map((x) => Object.assign({}, x));
const activeP = pList.filter((x) => x.checked !== false);
const totalQty = activeP.reduce((acc, x) => acc + (parseInt(x.qty, 10) || 1), 0) || pList.length || 1;
const allSkus = pList.map((x) => x.sku).filter(Boolean).join(' / ') || (sdata.id + '-SET');
const widthStr = pList.map((x) => x.width.replace(/\s*cm$/i, '').trim()).filter(Boolean).join(' / ');
const fullWidth = widthStr ? `${widthStr} cm` : '';
const depth = (pList[0] && pList[0].depth) || '';
const height = (pList[0] && pList[0].height) || '';
const priceFmt = formatCurrencyMXN(sdata.totalPrice || 0);
return { id: sdata.id,
archived: true,
provider_abbr: 'ARM',
provider: 'ARM',
sku: allSkus,
model_name: sdata.name,
category: 'SALAS & SOFÁS',
is_multipiece: pList.length > 1,
width: fullWidth,
depth: depth,
height: height,
seat: '',
packages: `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`,
volume: '',
price: priceFmt,
materials: scrubForbiddenPublicText(sdata.dimsSummary || ''),
drive_ficha_url: sdata.driveUrl || '',
sala_modules: pList,
inventory: sdata.inventory || {},
variants: [(function () {
const ajHit = resolveAjFinishClient_(sdata.id, sdata.name, allSkus, sdata.id, 0, '');
const finImg = (ajHit && ajHit.img) ? ajHit.img : '';
const finLbl = (ajHit && ajHit.label) ? ajHit.label : (cleanFinishLabelClient_(inferColorLabelFromData('', sdata.dimsSummary || (pList[0] && pList[0].name) || '', ''), sdata.name) || 'NATURAL');
return { id: `${sdata.id}-v1`,
name: sdata.name,
finish_type: inferFinishType(finLbl, sdata.dimsSummary || ''),
color_label: finLbl,
swatch_hex: '#A38251',
swatch_img: finImg,
hero_b64: '',
hero_scale: 1,
slot_scales: {},
width: fullWidth,
depth: depth,
height: height,
seat: '',
packages: `${totalQty} ${totalQty === 1 ? 'bulto' : 'bultos'}`,
volume: '',
materials: scrubForbiddenPublicText(sdata.dimsSummary || ''),
drive_ficha_url: sdata.driveUrl || '',
gallery: { ambiente: '', finish: finImg, finishes: finImg ? [finImg] : [], fabric: finImg, view1: '', view2: '', view3: '', view4: '', all_views: [] } };
})()] }; }
function buildArchivedIndivProduct_(it) { const pid = 'IND-' + it.sku;
const priceFmt = formatCurrencyMXN(it.priceNum || 0);
return { id: pid,
archived: true,
provider_abbr: it.provider || 'CREATA',
provider: it.provider || 'CREATA',
sku: it.sku,
model_name: it.name,
category: it.category || 'COMPLEMENTOS',
is_multipiece: false,
width: it.width,
depth: it.depth,
height: it.height,
seat: it.seat,
packages: it.packages || '1 bulto',
volume: it.volume,
price: priceFmt,
materials: it.materials,
drive_ficha_url: it.driveUrl || '',
sala_modules: [],
inventory: it.inventory || {},
variants: [(function () { const ajHit = resolveAjFinishClient_(pid, it.name, it.sku, '', 0, it.sku);
const finImg = (ajHit && ajHit.img) ? ajHit.img : '';
const finLbl = (ajHit && ajHit.label) ? ajHit.label : (cleanFinishLabelClient_(inferColorLabelFromData('', it.materials, ''), it.name) || 'NATURAL');
return { id: `${pid}-v1`,
name: it.name,
finish_type: inferFinishType(finLbl, it.materials),
color_label: finLbl,
swatch_hex: '#A38251',
swatch_img: finImg,
hero_b64: '',
hero_scale: 1,
slot_scales: {},
width: it.width,
depth: it.depth,
height: it.height,
seat: it.seat,
packages: it.packages || '1 bulto',
volume: it.volume,
materials: it.materials,
drive_ficha_url: it.driveUrl || '',
gallery: { ambiente: '', finish: finImg, finishes: finImg ? [finImg] : [], fabric: finImg, view1: '', view2: '', view3: '', view4: '', all_views: [] } };
})()] }; }
async function fetchDirectGvizCatalog(mode = 'public', timeoutMs = 15000) { const effTimeout = Math.max(Number(timeoutMs) || 0, 15000);
const [prodTbl, pieceTbl, salasTbl, indivTbl] = await Promise.all([
gvizJsonpQuery('CATALOGO_PRODUCTOS', effTimeout),
gvizJsonpQuery('PIEZAS_MODULOS', effTimeout),
gvizJsonpQuery('SALAS_MODULARES', effTimeout),
gvizJsonpQuery('MUEBLES_INDIVIDUALES', effTimeout)
]);
const master = parseMasterTabsFromGviz_(salasTbl, indivTbl);
const hasCatalogRows = !!(prodTbl && Array.isArray(prodTbl.rows) && prodTbl.rows.some((r) => { const id = String(gvizCell(r, 0) || '').trim();
return id && id.toUpperCase() !== 'ID_INTERNO';
}));
if (!hasCatalogRows && master.salasList.length === 0 && master.indivList.length === 0) { return null; }
const invCols = CREATA_CLOUD_CONFIG.inventoryLocations || [];
const piecesByParent = {};
if (pieceTbl && Array.isArray(pieceTbl.rows)) {
pieceTbl.rows.forEach((pr) => { const parentId = String(gvizCell(pr, 0) || '').trim();
if (!parentId || parentId.toUpperCase() === 'ID_PADRE') return;
const qtyRaw = gvizCell(pr, 4);
const qtyParsed = (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) ? 1 : Number(qtyRaw);
const sheetQty = isNaN(qtyParsed) ? 1 : qtyParsed;
const pieceInv = {};
invCols.forEach((locName, idx) => { const rawInv = gvizCell(pr, 10 + idx);
if (rawInv !== '' && rawInv !== null && rawInv !== undefined) { const n = Number(rawInv);
if (!isNaN(n) && n > 0) pieceInv[locName] = n; } });
const pSku = String(gvizCell(pr, 2) || '').trim().toUpperCase();
if (!piecesByParent[parentId]) piecesByParent[parentId] = [];
piecesByParent[parentId].push({ sku: pSku,
code: pSku.slice(-6) || 'MOD',
name: scrubForbiddenPublicText(String(gvizCell(pr, 3) || '').trim()),
qty: sheetQty > 0 ? sheetQty : 1,
sheetQty: sheetQty,
width: fmtMeasureClient_(gvizCell(pr, 5), 'cm'),
depth: fmtMeasureClient_(gvizCell(pr, 6), 'cm'),
height: fmtMeasureClient_(gvizCell(pr, 7), 'cm'),
price: parseCurrencyValue(gvizCell(pr, 8)),
checked: sheetQty > 0,
optional: sheetQty === 0,
inventory: pieceInv }); }); }
const baseRaw = (mode === 'admin' && (global.ADMIN_RAW_P1 || global.ADMIN_RAW_P2))
? [...(global.ADMIN_RAW_P1 || []), ...(global.ADMIN_RAW_P2 || [])]
: [...(global.CREATA_CATALOG_P1 || global.ADMIN_RAW_P1 || []), ...(global.CREATA_CATALOG_P2 || global.ADMIN_RAW_P2 || [])];
const baseById = {};
const baseByModel = {};
baseRaw.forEach((bp) => { if (!bp) return;
if (bp.id) baseById[String(bp.id).trim().toUpperCase()] = bp;
const bm = scrubForbiddenPublicText(String(bp.model_name || '')).toUpperCase();
if (bm) baseByModel[bm] = bp; });
const out = [];
const seenIds = new Set();
const seenSkus = new Set();
const seenModels = new Set();
const usedSalasInCat = {};
const catalogRows = (prodTbl && Array.isArray(prodTbl.rows)) ? prodTbl.rows : [];
catalogRows.forEach((r) => { const id = String(gvizCell(r, 0) || '').trim();
if (!id || id.toUpperCase() === 'ID_INTERNO') return;
seenIds.add(id.toUpperCase());
let sku = String(gvizCell(r, 3) || '').trim();
sku.split('/').forEach((s) => { if (s.trim()) seenSkus.add(s.trim().toUpperCase()); });
const modelName = scrubForbiddenPublicText(String(gvizCell(r, 4) || '').trim());
if (!modelName) return;
seenModels.add(modelName.toUpperCase());
const estado = String(gvizCell(r, 1) || 'ARCHIVADO').trim().toUpperCase();
const isArchived = estado !== 'VISIBLE';
if (mode === 'public' && isArchived) return;
const prov = String(gvizCell(r, 2) || 'CREATA').trim();
const cat = normalizeCategoryClient_(gvizCell(r, 5));
const isMulti = String(gvizCell(r, 6) || '').trim().toUpperCase() === 'SI';
const width = fmtMeasureClient_(gvizCell(r, 8), 'cm');
const depth = fmtMeasureClient_(gvizCell(r, 9), 'cm');
const height = fmtMeasureClient_(gvizCell(r, 10), 'cm');
const seat = fmtMeasureClient_(gvizCell(r, 11), 'cm');
const pkgRaw = String(gvizCell(r, 12) || '1').trim();
const packages = /bulto|pieza/i.test(pkgRaw) ? pkgRaw : `${pkgRaw} bultos`;
const volume = fmtMeasureClient_(gvizCell(r, 13), 'm³');
let priceNum = parseCurrencyValue(gvizCell(r, 14));
const materials = scrubForbiddenPublicText(String(gvizCell(r, 15) || '').trim());
const driveUrl = resolveDriveUrlClient_(gvizCell(r, 16), id, sku);
let heroUrl = isValidPhotoUrl(String(gvizCell(r, 17) || '')) ? String(gvizCell(r, 17)).trim() : '';
const ambUrl = isValidPhotoUrl(String(gvizCell(r, 18) || '')) ? String(gvizCell(r, 18)).trim() : '';
let finUrl = isValidPhotoUrl(String(gvizCell(r, 19) || '')) ? String(gvizCell(r, 19)).trim() : '';
let viewsArr = [];
try { const rawJson = String(gvizCell(r, 20) || '[]').trim();
const parsedV = JSON.parse(rawJson || '[]');
if (Array.isArray(parsedV)) {
viewsArr = parsedV.map((u) => (isValidPhotoUrl(String(u || '')) ? String(u).trim() : '')); } } catch (e) {}
const hasAnyViewArr = viewsArr.some(Boolean);
if (heroUrl && /-finish-\d+\./i.test(heroUrl) && !ambUrl && !hasAnyViewArr) { if (!finUrl) finUrl = heroUrl;
heroUrl = ''; }
const rawMetaCell = String(gvizCell(r, 21) || '').trim();
let unpackedDriveId = rawMetaCell;
let savedMetaVars = null;
if (rawMetaCell.startsWith('{')) {
try { const parsedMeta = JSON.parse(rawMetaCell);
if (parsedMeta && parsedMeta._cm) { unpackedDriveId = String(parsedMeta.did || '');
if (Array.isArray(parsedMeta.vars) && parsedMeta.vars.length > 0) { savedMetaVars = parsedMeta.vars; } } } catch (e) {} }
const baseMatch = baseById[id.toUpperCase()] || baseByModel[modelName.toUpperCase()] || null;
const baseVar0 = (baseMatch && Array.isArray(baseMatch.variants) && baseMatch.variants[0]) ? baseMatch.variants[0] : {};
const prodInv = {};
invCols.forEach((locName, idx) => { const rawInv = gvizCell(r, 23 + idx);
if (rawInv !== '' && rawInv !== null && rawInv !== undefined) { const n = Number(rawInv);
if (!isNaN(n) && n > 0) prodInv[locName] = n; } });
let mods = piecesByParent[id] ? piecesByParent[id].slice() : [];
const sKey = matchSalaKeyForProduct_(modelName, id, master.salasById);
if (sKey && master.salasById[sKey]) { usedSalasInCat[sKey] = true;
const masterPieces = master.salasById[sKey].pieces || [];
if (masterPieces.length > 0) { const savedBySku = {};
mods.forEach((m) => { if (m && m.sku) savedBySku[m.sku] = m; });
mods = masterPieces.map((mp) => { const sv = savedBySku[mp.sku];
if (!sv) return Object.assign({}, mp);
return Object.assign({}, mp, { checked: sv.checked,
qty: sv.qty || mp.qty }); }); }
if (mods.length > 0) { sku = mods.map((m) => m.sku).filter(Boolean).join(' / ') || sku;
mods.forEach((m) => { if (m.sku) seenSkus.add(m.sku); }); }
if (priceNum <= 0 && master.salasById[sKey].totalPrice > 0) { priceNum = master.salasById[sKey].totalPrice; } }
let builtVariants = [];
if (savedMetaVars && savedMetaVars.length > 0) {
builtVariants = savedMetaVars.map((sv, vIdx) => { const isFirst = vIdx === 0;
const baseVarIdx = (baseMatch && Array.isArray(baseMatch.variants) && baseMatch.variants[vIdx]) ? baseMatch.variants[vIdx] : baseVar0;
const ajHit = resolveAjFinishClient_(id, modelName, sku, sKey, vIdx, baseVarIdx && baseVarIdx.sku);
const rawLblCandidate = (sv.cl && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*\d*|EST[AÁ]NDAR|ACABADO|ACABADO OFICIAL)$/i.test(String(sv.cl).trim()))
? sv.cl
: ((ajHit && ajHit.label) || inferColorLabelFromData(sv.cl, sv.mat || materials, baseVarIdx ? baseVarIdx.color_label : ''));
const vLabel = cleanFinishLabelClient_(rawLblCandidate, modelName) || (ajHit && ajHit.label) || 'NATURAL';
const vType = sv.ft || inferFinishType(vLabel, sv.mat || materials);
const savedFinish = isValidPhotoUrl(sv.sw || '') ? sv.sw : (isValidPhotoUrl(sv.fin || '') ? sv.fin : (isFirst ? finUrl : ''));
const linkedFinish = savedFinish || (ajHit && ajHit.img) || '';
const vHeroRaw = isValidPhotoUrl(sv.hero || '') ? sv.hero : (isFirst ? heroUrl : '');
const vAmbRaw = isValidPhotoUrl(sv.amb || '') ? sv.amb : (isFirst ? ambUrl : '');
const vHero = (vHeroRaw && /-finish-\d+\./i.test(vHeroRaw) && !vAmbRaw) ? '' : vHeroRaw;
const vViews = Array.isArray(sv.vw) ? sv.vw.map((u) => (isValidPhotoUrl(String(u || '')) ? String(u).trim() : '')) : (isFirst ? [viewsArr[0] || '', viewsArr[1] || '', viewsArr[2] || '', viewsArr[3] || ''] : ['', '', '', '']);
return { id: `${id}-v${vIdx + 1}`,
name: modelName,
finish_type: vType,
color_label: vLabel,
swatch_hex: sv.hex || baseVar0.swatch_hex || (vType === 'MADERA' ? '#A2703F' : '#A38251'),
swatch_img: linkedFinish,
hero_b64: vHero,
hero_scale: Number(sv.hs) || 1,
hero_pos: (sv.hp && typeof sv.hp === 'object') ? { x: Number(sv.hp.x) || 0, y: Number(sv.hp.y) || 0 } : { x: 0, y: 0 },
slot_scales: (sv.ss && typeof sv.ss === 'object') ? sv.ss : {},
slot_pos: (sv.sp && typeof sv.sp === 'object') ? sv.sp : {},
width: sv.w !== undefined ? sv.w : (isFirst ? width : ''),
depth: sv.d !== undefined ? sv.d : (isFirst ? depth : ''),
height: sv.h !== undefined ? sv.h : (isFirst ? height : ''),
seat: sv.s !== undefined ? sv.s : (isFirst ? seat : ''),
packages: sv.pk !== undefined ? sv.pk : (isFirst ? packages : ''),
volume: sv.vl !== undefined ? sv.vl : (isFirst ? volume : ''),
materials: sv.mat !== undefined ? scrubForbiddenPublicText(sv.mat) : (isFirst ? materials : ''),
drive_ficha_url: sv.du || driveUrl,
gallery: { ambiente: vAmbRaw,
finish: linkedFinish,
finishes: linkedFinish ? [linkedFinish] : [],
fabric: linkedFinish,
view1: vViews[0] || '',
view2: vViews[1] || '',
view3: vViews[2] || '',
view4: vViews[3] || '',
all_views: [vViews[0] || '', vViews[1] || '', vViews[2] || '', vViews[3] || ''] } }; }); } else {
const ajHit0 = resolveAjFinishClient_(id, modelName, sku, sKey, 0, baseVar0 && baseVar0.sku);
const resolvedLabel = cleanFinishLabelClient_((ajHit0 && ajHit0.label) || inferColorLabelFromData('', materials, baseVar0.color_label), modelName) || 'NATURAL';
const resolvedType = baseVar0.finish_type || inferFinishType(resolvedLabel, materials);
const resolvedFinUrl = finUrl || (ajHit0 && ajHit0.img) || '';
builtVariants = [{ id: `${id}-v1`,
name: modelName,
finish_type: resolvedType,
color_label: resolvedLabel,
swatch_hex: baseVar0.swatch_hex || (resolvedType === 'MADERA' ? '#A2703F' : '#A38251'),
swatch_img: resolvedFinUrl,
hero_b64: heroUrl,
hero_scale: 1,
hero_pos: { x: 0, y: 0 },
slot_scales: {},
slot_pos: {},
width: width,
depth: depth,
height: height,
seat: seat,
packages: packages,
volume: volume,
materials: materials,
drive_ficha_url: driveUrl,
gallery: { ambiente: ambUrl,
finish: resolvedFinUrl,
finishes: resolvedFinUrl ? [resolvedFinUrl] : [],
fabric: resolvedFinUrl,
view1: viewsArr[0] || '',
view2: viewsArr[1] || '',
view3: viewsArr[2] || '',
view4: viewsArr[3] || '',
all_views: [viewsArr[0] || '', viewsArr[1] || '', viewsArr[2] || '', viewsArr[3] || ''] }
}]; }
const prodObj = { id: id,
archived: isArchived,
provider_abbr: prov,
provider: prov,
model_name: modelName,
category: cat,
is_multipiece: isMulti || mods.length > 1,
width: width,
depth: depth,
height: height,
seat: seat,
packages: packages,
volume: volume,
price: formatCurrencyMXN(priceNum),
materials: materials,
drive_ficha_url: driveUrl,
sala_modules: mods,
variants: builtVariants };
if (mode === 'admin') { prodObj.sku = sku;
prodObj.drive_file_id = unpackedDriveId;
prodObj.inventory = prodInv;
out.push(prodObj); } else { const cleanPub = sanitizePublicProduct(prodObj);
if (cleanPub) out.push(cleanPub); } });
const usedIndivRows = {};
baseRaw.forEach((bp) => { if (!bp) return;
const pid = String(bp.id || '').trim();
if (pid && seenIds.has(pid.toUpperCase())) return;
const bpModel = scrubForbiddenPublicText(String(bp.model_name || '')).toUpperCase();
if (bpModel && seenModels.has(bpModel)) return;
let rawSku = String(bp.sku || pid).trim().toUpperCase();
const skuParts = rawSku.split('/').map((s) => s.trim().toUpperCase()).filter(Boolean);
if (skuParts.length > 0 && skuParts.every((s) => seenSkus.has(s))) return;
const clone = JSON.parse(JSON.stringify(bp));
const modelName = scrubForbiddenPublicText(String(clone.model_name || ''));
clone.model_name = modelName;
clone.category = normalizeCategoryClient_(clone.category);
clone.archived = false;
if (pid) seenIds.add(pid.toUpperCase());
if (modelName) seenModels.add(modelName.toUpperCase());
if (Array.isArray(clone.variants)) {
clone.variants.forEach((v, vIdx) => {
const ajHit = resolveAjFinishClient_(pid, modelName, rawSku, '', vIdx, v && v.sku);
const finImg = (ajHit && ajHit.img) || (isValidPhotoUrl(v.swatch_img) ? v.swatch_img : '');
const rawLbl = (ajHit && ajHit.label) || inferColorLabelFromData(v.color_label, v.materials || clone.materials, v.color_label);
v.color_label = cleanFinishLabelClient_(rawLbl, modelName) || 'NATURAL';
v.finish_type = v.finish_type || inferFinishType(v.color_label, v.materials || clone.materials);
v.hero_b64 = '';
v.hero_scale = Number(v.hero_scale) || 1;
v.slot_scales = (v.slot_scales && typeof v.slot_scales === 'object') ? v.slot_scales : {};
v.swatch_img = finImg;
v.gallery = { ambiente: '', finish: finImg, finishes: finImg ? [finImg] : [], fabric: finImg, view1: '', view2: '', view3: '', view4: '', all_views: [] }; }); }
skuParts.forEach((sk) => { seenSkus.add(sk);
if (master.indivBySku[sk]) {
master.indivBySku[sk].forEach((m, mIdx) => { usedIndivRows[m.rowIdx] = true;
if (mIdx === 0) { if (m.priceNum > 0) clone.price = formatCurrencyMXN(m.priceNum);
if (!clone.drive_ficha_url && m.driveUrl) clone.drive_ficha_url = m.driveUrl;
clone.inventory = m.inventory || {}; } }); } });
const sKey = matchSalaKeyForProduct_(modelName, pid, master.salasById);
if (sKey && master.salasById[sKey]) { usedSalasInCat[sKey] = true;
const sdata = master.salasById[sKey];
const pList = sdata.pieces.map((x) => Object.assign({}, x));
clone.sala_modules = pList;
clone.is_multipiece = pList.length > 1;
rawSku = pList.map((x) => x.sku).filter(Boolean).join(' / ') || rawSku;
pList.forEach((x) => { if (x.sku) seenSkus.add(x.sku); });
if (sdata.totalPrice > 0) clone.price = formatCurrencyMXN(sdata.totalPrice);
if (sdata.driveUrl) { clone.drive_ficha_url = sdata.driveUrl;
if (clone.variants && clone.variants[0]) clone.variants[0].drive_ficha_url = sdata.driveUrl; }
clone.inventory = sdata.inventory || {}; }
if (mode === 'admin') { clone.sku = rawSku;
out.push(clone); } else { const pub = sanitizePublicProduct(clone);
if (pub) out.push(pub); } });
if (mode === 'admin') {
master.salasList.forEach((sdata) => { const sKey = sdata.id.toUpperCase();
const hasAnyPiece = (sdata.pieces || []).some((p) => seenSkus.has(p.sku));
if (!usedSalasInCat[sKey] && !seenIds.has(sKey) && !hasAnyPiece) { out.push(buildArchivedSalaProduct_(sdata)); } });
master.indivList.forEach((it) => {
if (!usedIndivRows[it.rowIdx] && !seenSkus.has(it.sku) && !seenIds.has('IND-' + it.sku) && !seenIds.has(it.sku)) { out.push(buildArchivedIndivProduct_(it));
seenSkus.add(it.sku); } }); }
return out; }
async function fetchCloudCatalog(mode = 'public', timeoutMs = 15000) { const effTimeout = Math.max(Number(timeoutMs) || 0, 15000);
discoverWebAppUrlFromSheet().catch(() => {});
const directRows = await fetchDirectGvizCatalog(mode, effTimeout);
if (Array.isArray(directRows) && directRows.length > 0) { return directRows; }
const apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
if (apiUrl) {
const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), effTimeout) : null;
try { const sep = apiUrl.includes('?') ? '&' : '?';
let targetUrl = `${apiUrl}${sep}mode=${encodeURIComponent(mode)}&_t=${Date.now()}`;
if (mode === 'admin') { const pin = CREATA_CLOUD_CONFIG.getAdminPin();
if (pin) targetUrl += `&pin=${encodeURIComponent(pin)}`; }
const resp = await fetch(targetUrl, { method: 'GET',
signal: controller ? controller.signal : undefined });
if (resp.ok) { const data = await resp.json();
if (data && data.ok && Array.isArray(data.products) && data.products.length > 0) { return data.products; } } } catch (err) { console.warn('[Creata Cloud WebApp Fetch]', err);
} finally { if (timer) clearTimeout(timer); } }
return null; }
function packProductForCloudSave(prod) { if (!prod || typeof prod !== 'object') return prod;
const pClone = JSON.parse(JSON.stringify(prod));
let rawDid = String(pClone.drive_file_id || '').trim();
if (rawDid.startsWith('{')) {
try { const prev = JSON.parse(rawDid);
rawDid = String((prev && prev.did) || ''); } catch (e) { rawDid = ''; } }
const compactVars = (Array.isArray(pClone.variants) ? pClone.variants : []).map((v) => { const g = (v && v.gallery) || {};
const linkedFinish = v.swatch_img || g.finish || g.fabric || (Array.isArray(g.finishes) && g.finishes[0]) || '';
if (v) { v.swatch_img = linkedFinish;
if (!v.gallery) v.gallery = {};
v.gallery.finish = linkedFinish;
v.gallery.fabric = linkedFinish;
v.gallery.finishes = linkedFinish ? [linkedFinish] : []; }
const isRemote = (u) => typeof u === 'string' && !u.startsWith('data:');
return { cl: String((v && v.color_label) || '').trim(),
ft: String((v && v.finish_type) || inferFinishType(v && v.color_label, (v && v.materials) || pClone.materials)),
hex: String((v && v.swatch_hex) || '#B8893E'),
sw: isRemote(linkedFinish) ? linkedFinish : '',
fin: isRemote(linkedFinish) ? linkedFinish : '',
hero: isRemote(v && v.hero_b64) ? v.hero_b64 : '',
amb: isRemote(g.ambiente) ? g.ambiente : '',
vw: [g.view1 || '', g.view2 || '', g.view3 || '', g.view4 || ''].map((u) => (isRemote(u) ? u : '')),
hs: (v && v.hero_scale && Number(v.hero_scale) !== 1) ? Number(v.hero_scale) : undefined,
hp: (v && v.hero_pos && (Number(v.hero_pos.x) || Number(v.hero_pos.y))) ? { x: Number(v.hero_pos.x) || 0, y: Number(v.hero_pos.y) || 0 } : undefined,
ss: (v && v.slot_scales && Object.keys(v.slot_scales).length > 0) ? v.slot_scales : undefined,
sp: (v && v.slot_pos && Object.keys(v.slot_pos).length > 0) ? v.slot_pos : undefined,
w: v && v.width !== undefined ? v.width : undefined,
d: v && v.depth !== undefined ? v.depth : undefined,
h: v && v.height !== undefined ? v.height : undefined,
s: v && v.seat !== undefined ? v.seat : undefined,
pk: v && v.packages !== undefined ? v.packages : undefined,
vl: v && v.volume !== undefined ? v.volume : undefined,
mat: v && v.materials !== undefined ? v.materials : undefined,
du: v && v.drive_ficha_url ? v.drive_ficha_url : undefined }; });
pClone.drive_file_id = JSON.stringify({ _cm: 1, did: rawDid, vars: compactVars });
return pClone; }
function notifyLiveCatalogSync(detail) {
try {
if (typeof BroadcastChannel !== 'undefined') { const bc = new BroadcastChannel('creata_live_sync');
bc.postMessage(Object.assign({ ts: Date.now() }, detail || {}));
bc.close(); } } catch (e) {}
try {
localStorage.setItem('creata_live_sync_ping', JSON.stringify({ ts: Date.now(), detail: detail || {} })); } catch (e) {} }
async function cloudPost(action, payload, timeoutMs = 25000) { let apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
if (!apiUrl) { apiUrl = await discoverWebAppUrlFromSheet(); }
if (!apiUrl) return { ok: false, offline: true, error: 'Web App pendiente de publicar en Apps Script' };
const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
try { const preparedPayload = Object.assign({}, payload || {});
if (action === 'save_product' && preparedPayload.product) {
preparedPayload.product = packProductForCloudSave(preparedPayload.product); }
const body = Object.assign({}, preparedPayload, { action: action,
pin: CREATA_CLOUD_CONFIG.getAdminPin() });
const resp = await fetch(apiUrl, { method: 'POST',
headers: { 'Content-Type': 'text/plain;charset=utf-8' },
body: JSON.stringify(body),
signal: controller ? controller.signal : undefined });
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
const resJson = await resp.json();
if (resJson && !resJson.ok && /PIN de administrador/i.test(resJson.error || '') && !payload?.__retriedPin && typeof global.prompt === 'function') {
const entered = global.prompt('Ingresa tu PIN de administrador configurado en Apps Script (se guardará automáticamente en este navegador):');
if (entered && entered.trim()) { CREATA_CLOUD_CONFIG.setAdminPin(entered.trim());
return await cloudPost(action, Object.assign({}, payload || {}, { __retriedPin: true }), timeoutMs); } }
if (resJson && resJson.ok && (action === 'save_product' || action === 'upload_photo' || action === 'toggle_archive' || action === 'delete_product')) { notifyLiveCatalogSync({ action }); }
return resJson; } catch (err) { console.warn(`[Creata Cloud POST:${action}]`, err);
return { ok: false, error: err.message || 'Error de red' };
} finally { if (timer) clearTimeout(timer); } }
async function cloudUploadPhoto(product, variantIdx, slotKey, dataUrl) { let apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
if (!apiUrl) { apiUrl = await discoverWebAppUrlFromSheet(); }
if (!apiUrl) { return { ok: true, localOnly: true, url: dataUrl }; }
const safeId = ((product && (product.id || product.model_name)) || 'mueble')
.toString()
.toLowerCase()
.replace(/[^a-z0-9]+/g, '-')
.replace(/^-|-$/g, '')
.slice(0, 40);
const res = await cloudPost('upload_photo', { productId: (product && product.id) || '',
modelName: (product && product.model_name) || '',
variantIndex: variantIdx || 0,
slot: slotKey || 'hero',
filePrefix: safeId,
dataUrl: dataUrl
}, 35000);
if (res && res.ok && res.url) { return { ok: true, localOnly: false, url: res.url }; }
return { ok: false, fallbackUrl: dataUrl, error: (res && res.error) || 'No se pudo subir a la nube' }; }
global.CREATA_CLOUD_CONFIG = CREATA_CLOUD_CONFIG;
global.CreataCloud = { config: CREATA_CLOUD_CONFIG,
isValidPhotoUrl,
scrubForbiddenPublicText,
sanitizePublicProduct,
inferFinishType,
inferColorLabelFromData,
cleanFinishLabel: cleanFinishLabelClient_,
resolveAjFinish: resolveAjFinishClient_,
parseCurrencyValue,
formatCurrencyMXN,
detectProductPieces,
compressImageFast,
notifyLiveCatalogSync,
discoverWebAppUrlFromSheet,
fetchDirectGvizCatalog,
fetchCloudCatalog,
cloudPost,
cloudUploadPhoto };
})(window);
