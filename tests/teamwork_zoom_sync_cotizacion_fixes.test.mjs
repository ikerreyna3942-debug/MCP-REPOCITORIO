import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockGasEnvironment } from './gas_mock_env.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ============================================================================
// 1. UNIVERSAL ZOOM LOCK (ANDROID + APPLE iOS/iPadOS + PC)
// ============================================================================
test('Zoom Lock: all active non-locked HTML apps enforce maximum-scale=1.0, user-scalable=no and creata-back-nav.js installs pinch/wheel/keyboard guards', () => {
  const htmlFiles = [
    'inventario.html',
    'fotos-productos.html',
    'panel.html',
    'seguimiento.html',
    'historial.html',
    'seguimiento-manual.html'
  ];
  for (const file of htmlFiles) {
    const html = readRepo(file);
    assert.match(html, /<meta[^>]+name="viewport"[^>]+maximum-scale=1\.0/i, `${file} must include maximum-scale=1.0`);
    assert.match(html, /<meta[^>]+name="viewport"[^>]+user-scalable=no/i, `${file} must include user-scalable=no`);
  }

  // Runtime test of CreataBackNav.installZoomLock inside node:vm
  const backNavSrc = readRepo('creata-back-nav.js');
  const listeners = new Map();
  const stylesAppended = [];
  let viewportContent = 'width=device-width, initial-scale=1.0';
  const viewportMeta = {
    getAttribute: () => viewportContent,
    setAttribute: (_k, v) => { viewportContent = v; }
  };
  const doc = {
    head: { appendChild: (el) => stylesAppended.push(el) },
    body: { appendChild: () => {} },
    documentElement: { appendChild: () => {} },
    getElementById: (id) => stylesAppended.find((s) => s.id === id) || null,
    querySelector: (sel) => (sel === 'meta[name="viewport"]' ? viewportMeta : null),
    createElement: (tag) => ({ tagName: tag.toUpperCase(), id: '', textContent: '', setAttribute: () => {} }),
    addEventListener: (ev, fn, opts) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push({ fn, opts });
    }
  };
  const win = {
    document: doc,
    addEventListener: () => {},
    history: { pushState: () => {}, replaceState: () => {} },
    location: { href: 'https://example.com/inventario.html', pathname: '/inventario.html', search: '' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
    setTimeout,
    clearTimeout
  };
  win.window = win;
  win.parent = win;
  vm.runInNewContext(backNavSrc, { window: win, document: doc, navigator: win.navigator, history: win.history, location: win.location, console, Date, Map, Set, Math, Object, Array, String, Number, Boolean, RegExp, Error, setTimeout, clearTimeout }, { filename: 'creata-back-nav.js' });

  assert.equal(win.__creataZoomLockInstalled, true, 'installZoomLock must auto-install on load');
  assert.match(viewportContent, /maximum-scale=1\.0/);
  assert.match(viewportContent, /user-scalable=no/);
  assert.ok(stylesAppended.some((s) => s.id === 'creata-zoom-lock-style' && /touch-action:\s*pan-x pan-y/.test(s.textContent)));

  const fire = (evName, payload = {}) => {
    let prevented = false;
    const ev = { ...payload, preventDefault: () => { prevented = true; } };
    for (const entry of (listeners.get(evName) || [])) {
      entry.fn(ev);
    }
    return prevented;
  };

  assert.equal(fire('gesturestart'), true, 'iOS gesturestart must be prevented');
  assert.equal(fire('gesturechange'), true, 'iOS gesturechange must be prevented');
  assert.equal(fire('touchmove', { touches: [{}, {}] }), true, '2-finger pinch touchmove must be prevented');
  assert.equal(fire('touchmove', { touches: [{}] }), false, 'Single-finger scroll touchmove must NOT be blocked');
  assert.equal(fire('wheel', { ctrlKey: true }), true, 'PC Ctrl+Wheel zoom must be prevented');
  assert.equal(fire('wheel', { ctrlKey: false, metaKey: false }), false, 'Normal PC mouse scroll must NOT be blocked');
  assert.equal(fire('keydown', { ctrlKey: true, key: '+' }), true, 'PC Ctrl++ zoom must be prevented');
  assert.equal(fire('keydown', { metaKey: true, key: '-' }), true, 'Mac Cmd+- zoom must be prevented');
  assert.equal(fire('keydown', { ctrlKey: false, metaKey: false, key: '+' }), false, 'Typing + without Ctrl/Cmd must NOT be blocked');
});

// ============================================================================
// 2. COTIZACIÓN UI EXACT REQUIREMENTS (4 BUTTONS REMOVED, "Ver pdf" MODAL, 3 PILLS HIDDEN, SCANNER INTACT)
// ============================================================================
test('Cotización UI: removes Vaciar/Vista-PDF/Copiar/Solo-Revisar, adds "Ver pdf" modal housing generated PDFs, hides 3 badges, keeps scanner intact', () => {
  const html = readRepo('inventario.html');
  const css = readRepo('inventario-ui.css');
  const js = readRepo('inventario-app.js');

  // Extract #cartModal footer HTML
  const footerMatch = html.match(/<div class="inv-cart-modal-footer[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<!-- MODAL DE PDFs/);
  assert.ok(footerMatch, 'Must find #cartModal footer block');
  const footerHtml = footerMatch[0];

  // 1) Four removed buttons MUST NOT exist in Cotización footer
  assert.ok(!/>[\s]*Vaciar[\s]*</.test(footerHtml), 'Vaciar button must be removed from Cotización footer');
  assert.ok(!/Vista\s*\/\s*PDF/.test(footerHtml), 'Vista / PDF button must be removed from Cotización footer');
  assert.ok(!/id="copyCartBtn"/.test(footerHtml), 'Copiar button (#copyCartBtn) must be removed from Cotización footer');
  assert.ok(!/Solo Revisar en Hoja/.test(footerHtml), 'Solo Revisar en Hoja button must be removed from Cotización footer');
  assert.ok(!/id="btnLoadPlantillaReview"/.test(footerHtml), '#btnLoadPlantillaReview must be removed from Cotización footer');

  // 2) Single "Ver pdf" button exists in footer alongside "Crear Cotización", opening #quoteGeneratedPdfsModal
  assert.match(footerHtml, /id="btnOpenGeneratedQuotePdfs"[^>]*onclick="openQuoteGeneratedPdfsModal\(\)"[^>]*>[\s]*Ver pdf/i, 'Footer must contain "Ver pdf" button opening generated PDFs modal');
  assert.match(footerHtml, /id="btnSendQuoteErp"[^>]*>[\s]*Crear Cotización/i, 'Footer must keep Crear Cotización button');
  assert.ok(!html.includes('id="quoteJumpToPdfsBtn"'), 'Redundant #quoteJumpToPdfsBtn pill must be removed so there is only 1 Ver pdf button');

  // Dedicated modal houses the generated PDFs section
  const pdfModalMatch = html.match(/<div id="quoteGeneratedPdfsModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(pdfModalMatch, '#quoteGeneratedPdfsModal must exist in inventario.html');
  assert.ok(pdfModalMatch[0].includes('id="quoteGeneratedPdfsTitle"'), 'Modal must contain #quoteGeneratedPdfsTitle');
  assert.ok(pdfModalMatch[0].includes('id="quoteGeneratedPdfsCountBadge"'), 'Modal must contain #quoteGeneratedPdfsCountBadge');
  assert.ok(pdfModalMatch[0].includes('id="quoteGeneratedPdfsList"'), 'Modal must contain #quoteGeneratedPdfsList');
  assert.match(js, /window\.openQuoteGeneratedPdfsModal\s*=\s*function/, 'openQuoteGeneratedPdfsModal must be defined');
  assert.match(js, /window\.closeQuoteGeneratedPdfsModal\s*=\s*function/, 'closeQuoteGeneratedPdfsModal must be defined');

  // 3) The 3 giant badges ("ADMIN · CED", "Folio: Serie CED", "ID: 38954") MUST be hidden in both HTML and CSS
  assert.match(html, /<span id="quoteOriginTypeBadge"[^>]*class="[^"]*\bhidden\b[^"]*"[^>]*aria-hidden="true"/, '#quoteOriginTypeBadge must be hidden');
  assert.match(html, /<span id="quoteNextOrderBadge"[^>]*class="[^"]*\bhidden\b[^"]*"[^>]*aria-hidden="true"/, '#quoteNextOrderBadge must be hidden');
  assert.match(html, /<span id="quoteErpUserIdBadge"[^>]*class="[^"]*\bhidden\b[^"]*"[^>]*aria-hidden="true"/, '#quoteErpUserIdBadge must be hidden');
  assert.match(css, /#quoteOriginTypeBadge,\s*#quoteNextOrderBadge,\s*#quoteErpUserIdBadge\s*\{\s*display:\s*none\s*!important;/, 'CSS must force-hide all 3 quote badges');

  // 4) Scanner remains intact + submit timeout increased to 65000ms + Prompts clipboard bridge accepts dataUri
  assert.ok(html.includes('id="fabScanBtn"') && html.includes('id="scanModal"'), 'Camera scanner button and modal must remain intact');
  assert.match(js, /callInvWebAppPost\('inv_submit_quote',\s*payload,\s*65000\)/, 'Quote submission timeout must be raised to 65000ms');
  assert.match(js, /CREATA_PROMPTS_COPY_IMAGE[\s\S]{0,260}data\.dataUri[\s\S]{0,160}data\.dataUrl/, 'inventario-app.js Prompts clipboard bridge must accept dataUri and dataUrl');
});

// ============================================================================
// 3. SEGUIMIENTO, HISTORIAL & MANUAL BUG FIXES
// ============================================================================
test('Seguimiento, Historial & Manual: fixes getApiUrl bug, seg_get_state sheets.* parsing, HH:mm:ss timestamps, Cancun TZ, iOS PDF share & manual edit persistence', () => {
  const segJs = readRepo('seguimiento-app.js');
  const histJs = readRepo('historial-app.js');
  const manualHtml = readRepo('seguimiento-manual.html');
  const modulesCss = readRepo('creata-modules.css');

  // Seguimiento fixes
  assert.ok(!/\bgetApiUrl\s*\(/.test(segJs), 'seguimiento-app.js must NEVER call undefined getApiUrl()');
  assert.match(segJs, /getCancunTodayIso/, 'seguimiento-app.js must use Cancun timezone date helper instead of UTC');
  assert.match(segJs, /out_bod/, 'seguimiento-app.js must include Outlet Colosio out_bod/out_pis stock');
  assert.match(segJs, /keepalive:\s*true/, 'seguimiento-app.js must send keepalive: true for WhatsApp/Email persistence');
  assert.match(segJs, /sessionRevoked/, 'seguimiento-app.js must handle sessionRevoked');

  // Historial fixes
  assert.match(histJs, /segStateRes\.sheets[\s\S]{0,200}CIERRES_COTIZACIONES/, 'historial-app.js must read segStateRes.sheets.CIERRES_COTIZACIONES');
  assert.match(histJs, /COTIZACIONES_ARCHIVADAS/, 'historial-app.js must read COTIZACIONES_ARCHIVADAS from seg_get_state');
  assert.match(histJs, /createShareLink:\s*wantShareLink/, 'historial-app.js must pass createShareLink on mobile/iOS');
  assert.match(histJs, /navigator\.share\(\{\s*files:\s*\[pdfFile\]/, 'historial-app.js must support native iOS PDF share');
  assert.ok(!histJs.includes("'A1:Z1500'"), 'historial-app.js must not truncate COTIZACIONES_EN_VIVO at row 1500');

  // Manual & CSS fixes
  assert.match(manualHtml, /name="robots"[^>]+noindex/i, 'seguimiento-manual.html must declare noindex robots meta');
  assert.match(manualHtml, /persistActiveSlideEdits/, 'seguimiento-manual.html must persist contenteditable edits back to slides[]');
  assert.match(modulesCss, /\.cm-seg-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto;/, 'creata-modules.css must allow horizontal scroll on Seguimiento table');
});

// ============================================================================
// 4. ALTA DE FOTOS FRONTEND + APPS SCRIPT MULTI-DEVICE SYNC & SAFETY FIXES
// ============================================================================
test('Alta de Fotos + Apps Script: cross-device photo & document staging, rev/sinceRev fast poll, rateLimited!=authRequired, iOS image.jpg safety & formula escaping', () => {
  const fotosHtml = readRepo('fotos-productos.html');
  const fotosJs = readRepo('fotos-productos-app.js');
  const creataGas = readRepo('AppsScript_Creata_Drive_Sheets.gs');
  const parcheGas = readRepo('AppsScript_Parche_Fotos_V2.gs');

  // Frontend Alta de Fotos supports both photos & documents + 6s sinceRev polling + clipboard bridge + rateLimited guard
  assert.match(fotosHtml, /id="pcUploadToSubirInput"[^>]+accept="image\/\*,\.pdf/, 'SUBIR PREN input must accept both images and documents');
  assert.match(fotosJs, /LIVE_INBOX_POLL_MS\s*=\s*6000/, 'Alta de Fotos must poll every 6s for multi-device sync');
  assert.match(fotosJs, /sinceRev/, 'Alta de Fotos must send sinceRev for 0-DriveApp unchanged polls');
  assert.match(fotosJs, /rateLimited/, 'Alta de Fotos must handle rateLimited without logging out');
  assert.match(fotosJs, /URL\.revokeObjectURL/, 'Alta de Fotos must revoke object URLs to prevent memory leaks');
  assert.match(fotosJs, /CREATA_PROMPTS_COPY_IMAGE[\s\S]{0,260}data\.dataUri[\s\S]{0,160}data\.dataUrl/, 'Alta de Fotos Prompts clipboard bridge must accept dataUri and dataUrl');

  // Backend Creata GAS + Parche V2 parity
  assert.match(creataGas, /action\s*===\s*'cm_inventory'/, 'AppsScript_Creata_Drive_Sheets.gs must handle cm_inventory in doPost');
  assert.match(creataGas, /escapeSheetPlainText_/, 'AppsScript_Creata_Drive_Sheets.gs must escape formula-like phone strings (+52...)');
  assert.match(parcheGas, /SALA\\s\+ASHA/, 'AppsScript_Parche_Fotos_V2.gs must keep SALA ASHA routing parity with Creata GAS');

  // Runtime test on AppsScript_Creata_Drive_Sheets.gs:
  // 1) Documents + photos listed in SUBIR PREN
  // 2) iOS duplicate filename image.jpg is NOT trashed when assigning 1st photo
  // 3) escapeSheetPlainText_ prevents #ERROR! on +52 phone numbers
  const env = createMockGasEnvironment({
    activeSpreadsheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
    activeUserEmail: 'kevin.reyna@grupoanipa.com'
  });
  env.makeFolder('11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p', 'SUBIR PREN');
  env.makeFolder('1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9', 'FOTOS NUEVAS CARGADO');
  env.makeFolder('12F836sJ6M2qN92kG4P76d8tJ_iG89R5x', 'CATEGORIAS MUEBLES Y ACCESORIOS');
  env.makeFile('ios_img_1', 'image.jpg', { parentId: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p', mimeType: 'image/jpeg', bytes: Buffer.from('jpeg-photo-1') });
  env.makeFile('ios_img_2', 'image.jpg', { parentId: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p', mimeType: 'image/jpeg', bytes: Buffer.from('jpeg-photo-2-different') });
  env.makeFile('staged_doc_1', 'Lista_Precios_2026.pdf', { parentId: '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 sample') });

  env.loadScript(path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs'));

  // Verify escapeSheetPlainText_
  assert.equal(env.context.escapeSheetPlainText_('+52 55 8805 8703'), "'+52 55 8805 8703");
  assert.equal(env.context.escapeSheetPlainText_('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(env.context.escapeSheetPlainText_('998 123 4567'), '998 123 4567');

  // Verify SUBIR PREN lists BOTH images and documents
  const listed = env.context.listSubirInboxFilesInternal_();
  const docItem = listed.find((f) => f.id === 'staged_doc_1');
  const imgItem = listed.find((f) => f.id === 'ios_img_1');
  assert.ok(imgItem && imgItem.kind === 'image', 'SUBIR PREN must list images with kind=image');
  assert.ok(docItem && docItem.kind === 'document', 'SUBIR PREN must list staged PDF/documents with kind=document');

  // Verify cleanDuplicatesInSubirInbox_ does NOT trash distinct iOS image.jpg photo #2
  env.context.cleanDuplicatesInSubirInbox_('ios_img_1', 'image.jpg', '');
  const img2After = env.context.DriveApp.getFileById('ios_img_2');
  assert.equal(img2After.isTrashed(), false, 'Distinct iOS photo #2 named image.jpg MUST NOT be trashed');

  // Verify Prompts_Odoo doPost prompts_health fullScan:true enforces owner auth
  const envB = createMockGasEnvironment({
    activeSpreadsheetId: '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg',
    scriptProperties: { PROMPTS_PIN: '1234' }
  });
  envB.loadScript(path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs'));
  const unauthRes = JSON.parse(
    envB.context.doPost({
      postData: { contents: JSON.stringify({ action: 'prompts_health', fullScan: true }) }
    }).getContent()
  );
  assert.equal(unauthRes.ok, false, 'Unauthenticated doPost prompts_health fullScan:true must be rejected');
});
