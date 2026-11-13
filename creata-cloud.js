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
const esc = mw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
getGeminiApiKey: function () {
try { return (localStorage.getItem('creata_gemini_api_key') || '').trim(); } catch (e) { return ''; }
},
setGeminiApiKey: function (key) { const clean = (key || '').trim();
if (!clean) { localStorage.removeItem('creata_gemini_api_key'); } else { localStorage.setItem('creata_gemini_api_key', clean); }
return clean;
},
hasGeminiApiKey: function () { return !!this.getGeminiApiKey();
},
hasWriteApi: function () { return !!this.getApiUrl();
},
isConfigured: function () { return !!this.sheetId || !!this.getApiUrl(); } };
try {
if (global.location && global.location.search) { const params = new URLSearchParams(global.location.search);
const paramUrl = params.get('webapp') || params.get('api');
if (paramUrl && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(paramUrl.trim())) { CREATA_CLOUD_CONFIG.setApiUrl(paramUrl.trim()); }
const paramPin = params.get('pin');
if (paramPin) CREATA_CLOUD_CONFIG.setAdminPin(paramPin.trim());
const paramGem = params.get('gemini_key');
if (paramGem) CREATA_CLOUD_CONFIG.setGeminiApiKey(paramGem.trim()); } } catch (e) {}
function isValidPhotoUrl(val) { if (!val || typeof val !== 'string') return false;
const s = val.trim();
if (!s || s === 'undefined' || s === 'null' || s === '#') return false;
return s.startsWith('data:image/') || s.startsWith('https://') || s.startsWith('http://') || s.startsWith('./') || s.startsWith('fotos/'); }
function bustRepoFotoCache(val) { if (!val || typeof val !== 'string') return '';
const s = val.trim();
if (!s || s.startsWith('data:') || s.includes('?')) return s;
if (/raw\.githubusercontent\.com\/ikerreyna3942-debug\/MCP-REPOCITORIO\/main\/fotos\//i.test(s) || /^(?:\.\/)?fotos\//i.test(s)) { return s + '?v=27'; }
return s; }
const KNOWN_SALA_MODULES_FALLBACK_ = {
'SALA-CARRARA': [
{ name: 'Sillón con brazo derecho (Altman Cotton)', price: 8392.6, width: '155 cm', depth: '114 cm', height: '90 cm', qty: 1, checked: true, optional: false },
{ name: 'Esquinero curvo (Altman Cotton)', price: 8560.8, width: '140 cm', depth: '140 cm', height: '90 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón con brazo izquierdo (Altman Cotton)', price: 8392.6, width: '155 cm', depth: '114 cm', height: '90 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón sin brazos opcional (Módulo central)', price: 5469.4, width: '101 cm', depth: '103 cm', height: '90 cm', qty: 1, checked: false, optional: true }
],
'SALA-DONATI': [
{ name: 'Sillón / Love con brazo derecho (Roble 01)', price: 9193, width: '150 cm', depth: '112 cm', height: '88 cm', qty: 1, checked: true, optional: false },
{ name: 'Chaise longue con brazo izquierdo (Roble 01)', price: 10793.8, width: '150 cm', depth: '157 cm', height: '88 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón / Love con brazo izquierdo (Opción opuesta)', price: 9193, width: '150 cm', depth: '112 cm', height: '88 cm', qty: 1, checked: false, optional: true },
{ name: 'Chaise longue con brazo derecho (Opción opuesta)', price: 10793.8, width: '150 cm', depth: '157 cm', height: '88 cm', qty: 1, checked: false, optional: true }
],
'SALA-DYLAN': [
{ name: 'Sillón con brazo derecho (Mercury Peyote)', price: 8027.2, width: '152 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón sin brazos (Mercury Peyote)', price: 7128.2, width: '135 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Esquinero (Mercury Peyote)', price: 6733.8, width: '113 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón con brazo izquierdo (Mercury Peyote)', price: 8027.2, width: '152 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Ottoman (Mercury Peyote)', price: 4976.4, width: '135 cm', depth: '113 cm', height: '48 cm', qty: 1, checked: false, optional: true }
],
'SALA-LUGANO': [
{ name: 'Sillón con brazo derecho (Nature Linen)', price: 6675.8, width: '120 cm', depth: '105 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón sin brazos (Nature Linen)', price: 5370.8, width: '102 cm', depth: '105 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Esquinero curvo (Nature Linen)', price: 5562.2, width: '135 cm', depth: '135 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Chaise lounge izquierdo (Nature Linen)', price: 10080.4, width: '120 cm', depth: '205 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón con brazo izquierdo (Opción)', price: 6675.8, width: '120 cm', depth: '105 cm', height: '94 cm', qty: 1, checked: false, optional: true },
{ name: 'Chaise lounge derecho (Opción)', price: 10080.4, width: '120 cm', depth: '205 cm', height: '94 cm', qty: 1, checked: false, optional: true },
{ name: 'Esquinero recto 90° (Opción)', price: 5562.2, width: '105 cm', depth: '105 cm', height: '94 cm', qty: 1, checked: false, optional: true }
],
'SALA-MARENO': [
{ name: 'Sofá 3 plazas (Kelsi Cotton)', price: 11942.2, width: '245 cm', depth: '106 cm', height: '90 cm', qty: 1, checked: true, optional: false },
{ name: 'Love seat 2 plazas (Kelsi Cotton)', price: 9297.4, width: '188 cm', depth: '106 cm', height: '90 cm', qty: 1, checked: true, optional: false }
],
'SALA-MATERA': [
{ name: 'Sillón brazo derecho (Scar Putty)', price: 11107, width: '155 cm', depth: '134 cm', height: '94 cm', qty: 1, checked: false, optional: true },
{ name: 'Sillón brazo izquierdo (Scar Putty)', price: 11107, width: '155 cm', depth: '134 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Chaise longue derecho', price: 12731, width: '139 cm', depth: '182 cm', height: '94 cm', qty: 1, checked: true, optional: false },
{ name: 'Chaise longue izquierdo (Opción)', price: 12731, width: '139 cm', depth: '182 cm', height: '94 cm', qty: 1, checked: false, optional: true }
],
'SALA-MONACO': [
{ name: 'Sillón brazo izquierdo (Bikendi Linen)', price: 6281.4, width: '117 cm', depth: '103 cm', height: '93 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón sin brazos (Fancy Pewter)', price: 4593.6, width: '101 cm', depth: '103 cm', height: '93 cm', qty: 1, checked: true, optional: false },
{ name: 'Esquinero (Fancy Pewter)', price: 5411.4, width: '103 cm', depth: '103 cm', height: '93 cm', qty: 1, checked: true, optional: false },
{ name: 'Ottoman (Fancy Pewter)', price: 3828, width: '101 cm', depth: '103 cm', height: '48 cm', qty: 1, checked: false, optional: true },
{ name: 'Esquinero (Bikendi Linen - variante)', price: 5869.6, width: '103 cm', depth: '103 cm', height: '93 cm', qty: 1, checked: false, optional: true }
],
'SALA-MONET': [
{ name: 'Sofá 3 plazas (Fresh Flax)', price: 16037, width: '284 cm', depth: '108 cm', height: '98 cm', qty: 1, checked: true, optional: false },
{ name: 'Love seat 2 plazas (Fresh Flax)', price: 12725.2, width: '225 cm', depth: '108 cm', height: '98 cm', qty: 1, checked: true, optional: false }
],
'SALA-SHELBY': [
{ name: 'Sillón con brazo derecho (Napoli 01)', price: 7806.8, width: '152 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón sin brazos (Napoli 01)', price: 6507.6, width: '135 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Esquinero (Napoli 01)', price: 6797.6, width: '113 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Sillón con brazo izquierdo (Napoli 01)', price: 7806.8, width: '152 cm', depth: '113 cm', height: '91 cm', qty: 1, checked: true, optional: false },
{ name: 'Ottoman (Napoli 01)', price: 5011.2, width: '135 cm', depth: '113 cm', height: '48 cm', qty: 1, checked: false, optional: true }
]
};
function isSalaCategoryProduct_(prod) {
if (!prod || typeof prod !== 'object') return false;
const cat = String(prod.category || '').toUpperCase();
const upId = String(prod.id || '').trim().toUpperCase();
return cat.includes('SALA') || upId.startsWith('SALA-') || /^ARM(MAT|MAR|MON|CAR|DON|DYL|LUG|SHE)/i.test(upId);
}
function resolveModuleBreakdown(prod) { if (!prod || typeof prod !== 'object') return [];
if (!isSalaCategoryProduct_(prod)) return [];
if (Array.isArray(prod.sala_modules) && prod.sala_modules.some((m) => (parseFloat(m && m.price) || 0) > 0)) { return prod.sala_modules; }
const upId = String(prod.id || '').trim().toUpperCase();
const upName = String(prod.model_name || '').trim().toUpperCase();
const matchKey = Object.keys(KNOWN_SALA_MODULES_FALLBACK_).find((k) => { if (upId === k) return true;
const alias = k.replace(/^SALA-/, '');
if (alias === 'MONET') return upName.includes('MONET') && !upName.includes('LOVE');
if (alias === 'MARENO') return upName.includes('MARENO') && !upName.includes('LOVE');
return alias.length >= 4 && upName.includes(alias); });
return matchKey ? KNOWN_SALA_MODULES_FALLBACK_[matchKey].map((m) => Object.assign({}, m)) : []; }
function renderModulePricesBox(elOrId, prod, compact = false) { const el = typeof elOrId === 'string' && global.document ? global.document.getElementById(elOrId) : elOrId;
if (!el) return;
if (!isSalaCategoryProduct_(prod)) { el.innerHTML = ''; el.classList.add('hidden'); return; }
const mods = resolveModuleBreakdown(prod).filter((m) => m && (parseFloat(m.price) || 0) > 0);
if (mods.length <= 1) { el.innerHTML = '';
el.classList.add('hidden');
return; }
const textCls = compact ? 'text-[9px]' : 'text-[10.5px] lg:text-[11px]';
const ordered = mods.slice().sort((a, b) => ((a.checked === false ? 1 : 0) - (b.checked === false ? 1 : 0)));
el.innerHTML = ordered.map((m) => { const isIncluded = m.checked !== false;
const qty = Math.max(1, parseInt(m.qty, 10) || 1);
const unitPrice = parseFloat(m.price) || 0;
const lineTotal = unitPrice * qty;
let cleanName = scrubForbiddenPublicText(String(m.name || 'Módulo'))
.replace(/\s*\((?:Opci[oó]n(?:\s+opuesta)?|M[oó]dulo\s+central)\)/gi, '')
.replace(/\s*\([^)]*\)\s*$/, '')
.trim();
if (!cleanName) cleanName = scrubForbiddenPublicText(String(m.name || 'Módulo')).trim();
const escName = cleanName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const qtyPrefix = (isIncluded && qty > 1) ? `${qty}× ` : '';
const optBadge = !isIncluded ? `<span class="ml-1 px-1 py-0.2 rounded bg-green-900/10 text-[#1B7A3E]/80 font-bold text-[8px] uppercase">Opc.</span>` : '';
const priceTxt = formatCurrencyMXN(isIncluded ? lineTotal : unitPrice);
return `<div class="flex items-center justify-between gap-2 ${textCls} leading-snug ${isIncluded ? 'text-[#1B7A3E]/95 font-semibold' : 'text-[#1B7A3E]/70 font-medium'}"><span class="truncate">• ${qtyPrefix}${escName}${optBadge}</span><span class="font-bold whitespace-nowrap shrink-0">${priceTxt}</span></div>`;
}).join('');
el.classList.remove('hidden'); }
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
const rawMods = isSalaCategoryProduct_(clone)
? ((Array.isArray(clone.sala_modules) && clone.sala_modules.length > 0) ? clone.sala_modules : resolveModuleBreakdown(clone))
: [];
if (Array.isArray(rawMods) && rawMods.length > 0) {
clone.sala_modules = rawMods.map((m) => ({ name: scrubForbiddenPublicText(m.name),
price: parseFloat(m.price) || 0,
width: m.width || '',
depth: m.depth || '',
height: m.height || '',
qty: parseInt(m.qty, 10) || 1,
checked: m.checked !== false,
optional: !!m.optional || m.checked === false
}));
clone.is_multipiece = clone.sala_modules.length > 1;
} else { clone.sala_modules = []; clone.is_multipiece = false; }
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
const upRowId = id.toUpperCase();
if (seenIds.has(upRowId)) return;
const estado = String(gvizCell(r, 1) || 'ARCHIVADO').trim().toUpperCase();
const isArchived = estado !== 'VISIBLE';
const isStubRow = (upRowId.startsWith('DRV-') || upRowId.startsWith('IND-')) && isArchived;
if (isStubRow && mode === 'public') return;
if (mode === 'public' && isArchived) return;
seenIds.add(upRowId);
const baseMatchById = baseById[upRowId] || null;
const indivExact = (master.indivBySku[upRowId] && master.indivBySku[upRowId][0]) ? master.indivBySku[upRowId][0] : null;
let modelName = scrubForbiddenPublicText(String(gvizCell(r, 4) || '').trim());
if (!modelName && baseMatchById && baseMatchById.model_name) modelName = scrubForbiddenPublicText(String(baseMatchById.model_name));
if (!modelName) return;
if (baseMatchById && baseMatchById.model_name) {
const authModel = scrubForbiddenPublicText(String(baseMatchById.model_name));
if (authModel && modelName.toUpperCase() !== authModel.toUpperCase()) {
const wrongOther = baseByModel[modelName.toUpperCase()];
if (wrongOther && String(wrongOther.id || '').toUpperCase() !== upRowId) { modelName = authModel; }
}
}
const prov = String(gvizCell(r, 2) || (baseMatchById && baseMatchById.provider_abbr) || 'CREATA').trim();
let cat = normalizeCategoryClient_(gvizCell(r, 5) || (baseMatchById && baseMatchById.category));
if (baseMatchById && baseMatchById.category) cat = normalizeCategoryClient_(baseMatchById.category);
const isSalaItem = isSalaCategoryProduct_({ id: upRowId, category: cat });
const sKey = isSalaItem ? matchSalaKeyForProduct_(modelName, id, master.salasById) : '';
let sku = String(gvizCell(r, 3) || '').trim();
if (upRowId === 'CVVSALLEXPROL' && /CVVSALLUN|CVVSALPIE/i.test(sku)) { sku = 'CVVSALLEXPROL'; }
if (!isSalaItem && sku.includes('/')) {
const authSku = (baseMatchById && baseMatchById.sku) ? String(baseMatchById.sku).trim() : '';
if (authSku) { sku = authSku; } else if (indivExact) { sku = upRowId; }
}
if (!isStubRow) {
sku.split('/').forEach((s) => { if (s.trim()) seenSkus.add(s.trim().toUpperCase()); });
seenModels.add(modelName.toUpperCase());
}
const nonSeatCats = new Set(['RECÁMARAS', 'BUFETERAS & CREDENZAS', 'MESAS DE CENTRO & LATERALES', 'COMEDORES', 'COMPLEMENTOS']);
let width = fmtMeasureClient_(gvizCell(r, 8), 'cm') || (baseMatchById && baseMatchById.width) || (indivExact && indivExact.width) || '';
let depth = fmtMeasureClient_(gvizCell(r, 9), 'cm') || (baseMatchById && baseMatchById.depth) || (indivExact && indivExact.depth) || '';
let height = fmtMeasureClient_(gvizCell(r, 10), 'cm') || (baseMatchById && baseMatchById.height) || (indivExact && indivExact.height) || '';
let seat = nonSeatCats.has(cat) ? '' : (fmtMeasureClient_(gvizCell(r, 11), 'cm') || (baseMatchById && baseMatchById.seat) || (indivExact && indivExact.seat) || '');
const pkgRaw = String(gvizCell(r, 12) || '').trim();
let packages = pkgRaw ? (/bulto|pieza/i.test(pkgRaw) ? pkgRaw : `${pkgRaw} bultos`) : '1 bulto';
if (indivExact && indivExact.packages && (!pkgRaw || /^1(\s*bultos?)?$/i.test(packages))) { packages = indivExact.packages; }
else if (baseMatchById && baseMatchById.packages && (!pkgRaw || /^1(\s*bultos?)?$/i.test(packages))) { packages = baseMatchById.packages; }
let volume = fmtMeasureClient_(gvizCell(r, 13), 'm³') || (baseMatchById && baseMatchById.volume) || (indivExact && indivExact.volume) || '';
let priceNum = parseCurrencyValue(gvizCell(r, 14));
if (!sKey && indivExact && indivExact.priceNum > 0) { priceNum = indivExact.priceNum; }
else if (!sKey && priceNum <= 0 && baseMatchById && baseMatchById.price) { priceNum = parseCurrencyValue(baseMatchById.price); }
let materials = scrubForbiddenPublicText(String(gvizCell(r, 15) || '').trim());
if ((!materials || /100\s*%\s*POLI[EÉ]STE\b(?!R)/i.test(materials)) && baseMatchById && baseMatchById.materials) {
materials = scrubForbiddenPublicText(String(baseMatchById.materials));
}
let driveUrl = resolveDriveUrlClient_(gvizCell(r, 16), id, sku);
if (baseMatchById && baseMatchById.drive_ficha_url) { driveUrl = baseMatchById.drive_ficha_url; }
else if (!driveUrl && indivExact && indivExact.driveUrl) { driveUrl = indivExact.driveUrl; }
const baseMatch = baseMatchById || baseByModel[modelName.toUpperCase()] || null;
const baseVar0 = (baseMatch && Array.isArray(baseMatch.variants) && baseMatch.variants[0]) ? baseMatch.variants[0] : {};
const baseGal0 = (baseVar0 && baseVar0.gallery && typeof baseVar0.gallery === 'object') ? baseVar0.gallery : {};
let heroUrl = isValidPhotoUrl(String(gvizCell(r, 17) || '')) ? String(gvizCell(r, 17)).trim() : (isValidPhotoUrl(baseVar0.hero_b64) ? String(baseVar0.hero_b64).trim() : '');
const ambUrl = isValidPhotoUrl(String(gvizCell(r, 18) || '')) ? String(gvizCell(r, 18)).trim() : (isValidPhotoUrl(baseGal0.ambiente) ? String(baseGal0.ambiente).trim() : '');
let finUrl = isValidPhotoUrl(String(gvizCell(r, 19) || '')) ? String(gvizCell(r, 19)).trim() : (isValidPhotoUrl(baseVar0.swatch_img) ? String(baseVar0.swatch_img).trim() : '');
let viewsArr = [];
try { const rawJson = String(gvizCell(r, 20) || '[]').trim();
const parsedV = JSON.parse(rawJson || '[]');
if (Array.isArray(parsedV)) {
viewsArr = parsedV.map((u) => (isValidPhotoUrl(String(u || '')) ? String(u).trim() : '')); } } catch (e) {}
for (let vi = 0; vi < 4; vi++) {
const bk = `view${vi + 1}`;
if (!viewsArr[vi] && isValidPhotoUrl(baseGal0[bk])) viewsArr[vi] = String(baseGal0[bk]).trim();
}
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
const prodInv = {};
invCols.forEach((locName, idx) => { const rawInv = gvizCell(r, 23 + idx);
if (rawInv !== '' && rawInv !== null && rawInv !== undefined) { const n = Number(rawInv);
if (!isNaN(n) && n > 0) prodInv[locName] = n; } });
let mods = (isSalaItem && piecesByParent[id]) ? piecesByParent[id].slice() : [];
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
if (master.salasById[sKey].totalPrice > 0) { priceNum = master.salasById[sKey].totalPrice; } }
else if (!isSalaItem) { mods = []; }
const isMulti = isSalaItem && mods.length > 1;
const clampHeroScale_ = (val) => { const n = Number(val) || 1; return (n < 0.78 || n > 1.35) ? 1 : n; };
const sanitizeSlotScales_ = (ssObj) => {
if (!ssObj || typeof ssObj !== 'object') return {};
const clean = {};
Object.keys(ssObj).forEach((k) => { const v = Number(ssObj[k]) || 1;
if (k === 'ambiente' && (v > 1.35 || v < 0.8)) return;
if (v >= 0.75 && v <= 1.6) clean[k] = v; });
return clean;
};
const sanitizeSlotPos_ = (spObj, ssClean) => {
if (!spObj || typeof spObj !== 'object') return {};
const clean = {};
Object.keys(spObj).forEach((k) => { if (k === 'ambiente' && !ssClean.ambiente) return;
const p = spObj[k];
if (p && typeof p === 'object') {
const px = Number(p.x) || 0; const py = Number(p.y) || 0;
if (Math.abs(px) <= 30 && Math.abs(py) <= 30) clean[k] = { x: px, y: py };
} });
return clean;
};
let builtVariants = [];
if (savedMetaVars && savedMetaVars.length > 0) {
builtVariants = savedMetaVars.map((sv, vIdx) => { const isFirst = vIdx === 0;
const baseVarIdx = (baseMatch && Array.isArray(baseMatch.variants) && baseMatch.variants[vIdx]) ? baseMatch.variants[vIdx] : baseVar0;
const baseGalIdx = (baseVarIdx && baseVarIdx.gallery && typeof baseVarIdx.gallery === 'object') ? baseVarIdx.gallery : {};
const vSku = (baseVarIdx && baseVarIdx.sku) ? String(baseVarIdx.sku).trim().toUpperCase() : (isFirst ? upRowId : '');
const vIndiv = (vSku && master.indivBySku[vSku] && master.indivBySku[vSku][0]) ? master.indivBySku[vSku][0] : null;
const ajHit = resolveAjFinishClient_(id, modelName, sku, sKey, vIdx, vSku);
const rawLblCandidate = (sv.cl && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*\d*|EST[AÁ]NDAR|ACABADO|ACABADO OFICIAL)$/i.test(String(sv.cl).trim()))
? sv.cl
: ((ajHit && ajHit.label) || inferColorLabelFromData(sv.cl, sv.mat || materials, baseVarIdx ? baseVarIdx.color_label : ''));
const vLabel = cleanFinishLabelClient_(rawLblCandidate, modelName) || (ajHit && ajHit.label) || 'NATURAL';
const vType = inferFinishType(vLabel, sv.mat || materials) || sv.ft || 'TELA';
const savedFinish = isValidPhotoUrl(sv.sw || '') ? sv.sw : (isValidPhotoUrl(sv.fin || '') ? sv.fin : (isFirst ? finUrl : ''));
const linkedFinish = savedFinish || (baseVarIdx && isValidPhotoUrl(baseVarIdx.swatch_img) ? baseVarIdx.swatch_img : '') || (ajHit && ajHit.img) || '';
const vHeroRaw = isValidPhotoUrl(sv.hero || '') ? sv.hero : (isFirst ? heroUrl : (baseVarIdx && isValidPhotoUrl(baseVarIdx.hero_b64) ? baseVarIdx.hero_b64 : ''));
const vAmbRaw = isValidPhotoUrl(sv.amb || '') ? sv.amb : (isFirst ? ambUrl : (isValidPhotoUrl(baseGalIdx.ambiente) ? baseGalIdx.ambiente : ''));
const vHero = (vHeroRaw && /-finish-\d+\./i.test(vHeroRaw) && !vAmbRaw) ? '' : vHeroRaw;
const rawVw = Array.isArray(sv.vw) ? sv.vw.map((u) => (isValidPhotoUrl(String(u || '')) ? String(u).trim() : '')) : (isFirst ? [viewsArr[0] || '', viewsArr[1] || '', viewsArr[2] || '', viewsArr[3] || ''] : ['', '', '', '']);
const vViews = [0, 1, 2, 3].map((i) => rawVw[i] || (isValidPhotoUrl(baseGalIdx[`view${i + 1}`]) ? String(baseGalIdx[`view${i + 1}`]).trim() : ''));
const ssClean = sanitizeSlotScales_(sv.ss);
const spClean = sanitizeSlotPos_(sv.sp, ssClean);
const vPriceNum = (!sKey && vIndiv && vIndiv.priceNum > 0) ? vIndiv.priceNum : (baseVarIdx && baseVarIdx.price ? parseCurrencyValue(baseVarIdx.price) : priceNum);
const vDriveUrl = (baseVarIdx && baseVarIdx.drive_ficha_url) ? baseVarIdx.drive_ficha_url : (sv.du && !baseMatchById ? sv.du : driveUrl);
const vMatRaw = (sv.mat !== undefined && !/100\s*%\s*POLI[EÉ]STE\b(?!R)/i.test(String(sv.mat))) ? scrubForbiddenPublicText(sv.mat) : '';
return { id: `${id}-v${vIdx + 1}`,
sku: vSku || undefined,
name: modelName,
price: formatCurrencyMXN(vPriceNum > 0 ? vPriceNum : priceNum),
finish_type: vType,
color_label: vLabel,
swatch_hex: sv.hex || baseVar0.swatch_hex || (vType === 'MADERA' ? '#A2703F' : '#A38251'),
swatch_img: linkedFinish,
hero_b64: vHero,
hero_scale: clampHeroScale_(sv.hs),
hero_pos: (sv.hp && typeof sv.hp === 'object') ? { x: Number(sv.hp.x) || 0, y: Number(sv.hp.y) || 0 } : { x: 0, y: 0 },
slot_scales: ssClean,
slot_pos: spClean,
width: sv.w || (isFirst ? width : (baseVarIdx && baseVarIdx.width) || width),
depth: sv.d || (isFirst ? depth : (baseVarIdx && baseVarIdx.depth) || depth),
height: sv.h || (isFirst ? height : (baseVarIdx && baseVarIdx.height) || height),
seat: nonSeatCats.has(cat) ? '' : (sv.s || (isFirst ? seat : (baseVarIdx && baseVarIdx.seat) || seat)),
packages: (indivExact && indivExact.packages) ? packages : (sv.pk && !/^1(\s*bultos?)?$/i.test(String(sv.pk)) ? sv.pk : packages),
volume: sv.vl || (isFirst ? volume : (baseVarIdx && baseVarIdx.volume) || volume),
materials: vMatRaw || (baseVarIdx && baseVarIdx.materials ? scrubForbiddenPublicText(baseVarIdx.materials) : materials),
drive_ficha_url: vDriveUrl,
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
price: formatCurrencyMXN(priceNum),
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
is_multipiece: isMulti,
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
const vgOrig = (v && v.gallery && typeof v.gallery === 'object') ? v.gallery : {};
let inferredVarSku = String((v && v.sku) || '').trim().toUpperCase();
if (!inferredVarSku) {
const photoSample = String(v.hero_b64 || vgOrig.view1 || '').trim();
const mFotoSku = photoSample.match(/\/fotos\/([a-z0-9-]+)-(?:hero|view\d|ambiente|finish)/i);
if (mFotoSku && mFotoSku[1]) inferredVarSku = mFotoSku[1].toUpperCase();
}
const vSkuLookup = inferredVarSku || skuParts[vIdx] || pid.toUpperCase();
const vIndivHit = (master.indivBySku[vSkuLookup] && master.indivBySku[vSkuLookup][0]) ? master.indivBySku[vSkuLookup][0] : null;
if (vIndivHit && vIndivHit.priceNum > 0) { v.price = formatCurrencyMXN(vIndivHit.priceNum); }
const ajHit = resolveAjFinishClient_(vIdx === 0 ? pid : vSkuLookup, modelName, vSkuLookup, '', vIdx, vSkuLookup);
const hasValidOrigSwatch = isValidPhotoUrl(v.swatch_img);
const finImg = hasValidOrigSwatch ? v.swatch_img : ((ajHit && ajHit.img) || '');
const hasExplicitLabel = v.color_label && !/^(ACABADO FICHA T[EÉ]CNICA|OPCI[OÓ]N\s*\d*|EST[AÁ]NDAR|ACABADO|ACABADO OFICIAL|NATURAL)$/i.test(String(v.color_label).trim());
const rawLbl = hasExplicitLabel ? v.color_label : ((ajHit && ajHit.label) || inferColorLabelFromData(v.color_label, v.materials || clone.materials, v.color_label));
v.color_label = cleanFinishLabelClient_(rawLbl, modelName) || 'NATURAL';
v.finish_type = inferFinishType(v.color_label, v.materials || clone.materials) || v.finish_type || 'TELA';
const rawHeroOrig = (isValidPhotoUrl(v.hero_b64) && v.hero_b64 !== finImg && !/-finish(?:-\d+)?\./i.test(v.hero_b64)) ? String(v.hero_b64).trim() : '';
const ambOrig = isValidPhotoUrl(vgOrig.ambiente) ? String(vgOrig.ambiente).trim() : '';
const v1Orig = isValidPhotoUrl(vgOrig.view1) ? String(vgOrig.view1).trim() : '';
const v2Orig = isValidPhotoUrl(vgOrig.view2) ? String(vgOrig.view2).trim() : '';
const v3Orig = isValidPhotoUrl(vgOrig.view3) ? String(vgOrig.view3).trim() : '';
const v4Orig = isValidPhotoUrl(vgOrig.view4) ? String(vgOrig.view4).trim() : '';
v.hero_b64 = rawHeroOrig;
v.hero_scale = Number(v.hero_scale) || 1;
v.hero_pos = (v.hero_pos && typeof v.hero_pos === 'object') ? { x: Number(v.hero_pos.x) || 0, y: Number(v.hero_pos.y) || 0 } : { x: 0, y: 0 };
v.slot_scales = (v.slot_scales && typeof v.slot_scales === 'object') ? v.slot_scales : {};
v.slot_pos = (v.slot_pos && typeof v.slot_pos === 'object') ? v.slot_pos : {};
v.swatch_img = finImg;
v.gallery = { ambiente: ambOrig, finish: finImg, finishes: finImg ? [finImg] : [], fabric: finImg, view1: v1Orig, view2: v2Orig, view3: v3Orig, view4: v4Orig, all_views: [v1Orig, v2Orig, v3Orig, v4Orig] }; }); }
skuParts.forEach((sk, skIdx) => { seenSkus.add(sk);
if (master.indivBySku[sk]) {
master.indivBySku[sk].forEach((m, mIdx) => { usedIndivRows[m.rowIdx] = true;
if (skIdx === 0 && mIdx === 0) { if (m.priceNum > 0) clone.price = formatCurrencyMXN(m.priceNum);
if (!clone.drive_ficha_url && m.driveUrl) clone.drive_ficha_url = m.driveUrl;
clone.inventory = m.inventory || {}; } }); } });
const sKey = isSalaCategoryProduct_(clone) ? matchSalaKeyForProduct_(modelName, pid, master.salasById) : '';
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
bustRepoFotoCache,
resolveModuleBreakdown,
renderModulePricesBox,
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
