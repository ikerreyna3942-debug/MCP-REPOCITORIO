import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadOptFitApi() {
  const code = fs.readFileSync('inventario-app.js', 'utf8');
  const elStub = () => ({
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: { setProperty() {}, removeProperty() {} },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => '',
    querySelector: () => null,
    querySelectorAll: () => [],
    innerHTML: '',
    textContent: '',
    value: ''
  });
  const storage = new Map();
  const sandbox = {
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    Uint8Array,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    URLSearchParams,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    navigator: { userAgent: 'node-test' },
    location: { href: 'https://example.test/inventario.html', search: '', pathname: '/inventario.html', origin: 'https://example.test' },
    addEventListener: () => {},
    removeEventListener: () => {},
    document: {
      readyState: 'complete',
      body: elStub(),
      documentElement: elStub(),
      getElementById: () => elStub(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => elStub(),
      addEventListener: () => {}
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'inventario-app.js' });
  return sandbox.__CREATA_OPTFIT_TEST__;
}

function makeRgbaBuffer(w, h, bgRgba, rects = [], speckles = []) {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bgRgba[0];
    buf[i * 4 + 1] = bgRgba[1];
    buf[i * 4 + 2] = bgRgba[2];
    buf[i * 4 + 3] = bgRgba[3];
  }
  for (const r of rects) {
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const p = (y * w + x) * 4;
        buf[p] = r.rgba[0];
        buf[p + 1] = r.rgba[1];
        buf[p + 2] = r.rgba[2];
        buf[p + 3] = r.rgba[3];
      }
    }
  }
  for (const sp of speckles) {
    const p = (sp.y * w + sp.x) * 4;
    buf[p] = sp.rgba[0];
    buf[p + 1] = sp.rgba[1];
    buf[p + 2] = sp.rgba[2];
    buf[p + 3] = sp.rgba[3];
  }
  return buf;
}

const OPT = loadOptFitApi();

test('Parejo auto-frame detects non-square rectangular opaque JPEGs (fixing old letterbox bug) and centers to 78%', () => {
  assert.equal(OPT.OPTFIT_STORAGE_KEY, 'creata_optfit_bbox_v2');
  assert.equal(OPT.OPTFIT_TARGET_FILL, 0.78);

  // 1200x800 (3:2) white studio sofa sampled at 96x64, sofa off-center low-right
  const w = 96;
  const h = 64;
  const rgba = makeRgbaBuffer(w, h, [255, 255, 255, 255], [
    { x0: 24, y0: 22, x1: 82, y1: 56, rgba: [185, 178, 168, 255] }
  ]);
  const bbox = OPT.detectStudioContentBounds(rgba, w, h, 1200, 800);
  assert.ok(bbox, 'Rectangular opaque JPEG on white background must be detected (never skipped by letterbox)');
  assert.equal(bbox.isWhiteBg, true);
  assert.ok(Math.abs(bbox.uMin - 24 / 96) < 0.02);
  assert.ok(Math.abs(bbox.uMax - 82 / 96) < 0.02);

  // Verify exact centering math inside a 4:3 variant card
  const fit = OPT.computeOpticalFitForBox(bbox, 4 / 3);
  assert.ok(fit.s > 1.15 && fit.s <= 1.65, `Expected balanced uniform scale, got ${fit.s}`);
  assert.ok(fit.tx < -3, `Sofa pushed right must translate left, got tx=${fit.tx}`);
  assert.ok(fit.ty < -3, `Sofa pushed low must translate up, got ty=${fit.ty}`);

  // Verify transformed center lands within 0.5% of geometric center (0, 0) with zero clipping
  const rw = 1;
  const rh = (4 / 3) / (1200 / 800);
  const uc = (bbox.uMin + bbox.uMax) / 2;
  const vc = (bbox.vMin + bbox.vMax) / 2;
  const finalCx = fit.s * ((uc - 0.5) * rw) + (fit.tx / 100);
  const finalCy = fit.s * ((vc - 0.5) * rh) + (fit.ty / 100);
  assert.ok(Math.abs(finalCx) < 0.006, `Expected dead-center X, got ${finalCx}`);
  assert.ok(Math.abs(finalCy) < 0.006, `Expected dead-center Y, got ${finalCy}`);
});

test('Parejo auto-frame detects subtle ivory/white furniture on #FFFFFF and ignores isolated 1px dust speckles', () => {
  const w = 96;
  const h = 96;
  const rgba = makeRgbaBuffer(
    w,
    h,
    [255, 255, 255, 255],
    // Subtle ivory chair (RGB 238, 236, 232) occupying 50% centered
    [{ x0: 24, y0: 24, x1: 72, y1: 72, rgba: [238, 236, 232, 255] }],
    // Isolated 1px dark dust pixel near top-left corner
    [{ x: 3, y: 3, rgba: [20, 20, 20, 255] }]
  );
  const bbox = OPT.detectStudioContentBounds(rgba, w, h, 1000, 1000);
  assert.ok(bbox, 'Subtle ivory furniture on pure white must be detected');
  assert.ok(bbox.uMin >= 0.24, `1px corner dust must be ignored by 8-neighbor filter, got uMin=${bbox.uMin}`);
  assert.ok(bbox.vMin >= 0.24, `1px corner dust must be ignored by 8-neighbor filter, got vMin=${bbox.vMin}`);

  const fit = OPT.computeOpticalFitForBox(bbox, 1);
  // 0.78 / 0.50 = 1.56
  assert.ok(fit.s > 1.45 && fit.s <= 1.65, `Expected uniform 78% fill scale ~1.56, got ${fit.s}`);
});

test('Parejo auto-frame gently steps back overly tight white-bg photos so all cards look uniform side-by-side', () => {
  const w = 96;
  const h = 96;
  // Furniture touching 96% of frame on pure white background
  const rgba = makeRgbaBuffer(w, h, [255, 255, 255, 255], [
    { x0: 2, y0: 2, x1: 94, y1: 94, rgba: [130, 120, 110, 255] }
  ]);
  const bbox = OPT.detectStudioContentBounds(rgba, w, h, 1000, 1000);
  assert.ok(bbox);
  const fit = OPT.computeOpticalFitForBox(bbox, 1);
  // 0.78 / 0.958 = ~0.814 => aligns cleanly with 78% neighbors!
  assert.ok(fit.s >= 0.76 && fit.s <= 0.85, `Over-tight white-bg photo should step back cleanly to ~0.81, got ${fit.s}`);
});

test('Full-bleed lifestyle/room photos with varied borders are safely skipped (never cropped or zoomed)', () => {
  const w = 96;
  const h = 64;
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      // Top half blue sky / wall, bottom half dark wood floor
      buf[p] = y < h / 2 ? 170 : 75;
      buf[p + 1] = y < h / 2 ? 195 : 55;
      buf[p + 2] = y < h / 2 ? 220 : 38;
      buf[p + 3] = 255;
    }
  }
  const bbox = OPT.detectStudioContentBounds(buf, w, h, 1200, 800);
  assert.equal(bbox, null, 'Lifestyle room photo with non-uniform border must be skipped');
});

test('Off-white light-gray studio background never shrinks below 1.0 or reveals edge seams against #FFFFFF', () => {
  const w = 96;
  const h = 96;
  // Slightly gray studio background RGB(230,230,230) with tight 94% chair
  const rgba = makeRgbaBuffer(w, h, [230, 230, 230, 255], [
    { x0: 3, y0: 3, x1: 93, y1: 93, rgba: [110, 100, 90, 255] }
  ]);
  const bbox = OPT.detectStudioContentBounds(rgba, w, h, 1000, 1000);
  assert.ok(bbox, 'Uniform light-gray studio background is detected');
  assert.equal(bbox.isWhiteBg, false, 'RGB 230 must not be classified as pure #FFFFFF');
  const fit = OPT.computeOpticalFitForBox(bbox, 1);
  assert.ok(fit.s >= 1.0, `Off-white background must never shrink below 1.0, got ${fit.s}`);
  assert.equal(fit.tx, 0, 'Off-white background with no bleed must stay centered without edge seams');
  assert.equal(fit.ty, 0, 'Off-white background with no bleed must stay centered without edge seams');
});

test('CreataGuard, Fotos App, and Apps Script wiring cover Portadas/Telas auth, delete->resave, and mobile scroll spy', () => {
  const guardSrc = fs.readFileSync('creata-guard.js', 'utf8');
  assert.match(guardSrc, /function detectCanvasStudioBounds\(/);
  assert.match(guardSrc, /opts\.autoFrame\s*\?\s*detectCanvasStudioBounds\(img\)/);

  const fotosJs = fs.readFileSync('fotos-productos-app.js', 'utf8');
  assert.match(fotosJs, /function autoFrameStudioProductToDataUrl\(/);
  assert.match(fotosJs, /window\.setFotosWorkMode = function/);
  assert.match(fotosJs, /CREATA_VISUAL_OVERRIDE_SAVED/);
  assert.match(fotosJs, /action === 'inv_product_override_save'/);
  assert.match(fotosJs, /action === 'inv_upload_product_photo'/);
  assert.match(fotosJs, /\['secSkuFinder',\s*'secProductStage',\s*'secGalleryInbox'\]/);
  assert.match(fotosJs, /op:\s*op === 'DELETE' \? 'DELETE' : 'RESTORE'/);

  const gasSrc = fs.readFileSync('AppsScript_Creata_Drive_Sheets.gs', 'utf8');
  assert.match(gasSrc, /\^V\(\?:COV\|FAB\|WOD\):\/i\.test\(sku\)/);
});

test('Streamlined practical Fotos App UX: top 3-mode bar, collapsible filters & specs, single visual dropzone, direct stage drop, and Next Missing Photo', () => {
  const html = fs.readFileSync('fotos-productos.html', 'utf8');
  assert.match(html, /class="fotos-mode-hero"/);
  assert.match(html, /id="skuExtraFiltersDetails"/);
  assert.match(html, /id="skuQuickBanner"/);
  assert.match(html, /id="skuDetailsAccordion"/);
  assert.match(html, /id="visualSinglePreviewCard"/);
  assert.match(html, /id="btnNextMissingPhoto"[^>]*onclick="selectNextMissingPhotoTarget\(\)"/);
  assert.match(html, /id="visualUrlDetails"/);

  // Photo stage appears BEFORE collapsible specs accordion in SKU view
  const idxPhotos = html.indexOf('id="curPhotoCanvas"');
  const idxSpecs = html.indexOf('id="skuDetailsAccordion"');
  assert.ok(idxPhotos > 0 && idxSpecs > idxPhotos, 'Photo stage must appear before collapsible specs accordion');

  const js = fs.readFileSync('fotos-productos-app.js', 'utf8');
  assert.match(js, /window\.selectNextMissingPhotoTarget = function/);
  assert.match(js, /__creataStageDropBound/);
  assert.match(js, /function syncSkuExtraFiltersBadge\(/);
});

test('Fotos App: fixes scroll-down-then-scroll-up pull-down bug and uses ultra-simplified labels', () => {
  const css = fs.readFileSync('fotos-productos-styles.css', 'utf8');
  const html = fs.readFileSync('fotos-productos.html', 'utf8');
  const js = fs.readFileSync('fotos-productos-app.js', 'utf8');

  // 1) No content-visibility/contain-intrinsic-size height-mismatch jumps + overflow-anchor disabled
  assert.ok(!css.includes('content-visibility: auto'), 'content-visibility: auto must be removed from SKU/gallery cards to prevent Chrome upward-scroll jump-down bug');
  assert.ok(!css.includes('contain-intrinsic-size'), 'contain-intrinsic-size must be removed to avoid anchor height shifts');
  assert.match(css, /html\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /body\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.sku-list\s*\{[^}]*overflow-anchor:\s*none/);
  assert.match(css, /\.inbox-grid\s*\{[^}]*overflow-anchor:\s*none/);

  // 2) Mobile .sku-list uses stable svh height (never resizes on URL-bar toggle) and natural scroll chaining
  assert.ok(!css.includes('max-height: min(46dvh, 380px)'), 'Mobile .sku-list must not resize dynamically with 46dvh on scroll reversal');
  assert.match(css, /max-height:\s*min\(44svh,\s*340px\)/);
  assert.ok(!css.includes('overscroll-behavior-y: contain'), '.sku-list must allow smooth scroll chaining back up');

  // 3) Checkpoint restore must never yank window.scrollTo downward and tracks manual scroll
  assert.match(js, /let _fotosUserHasScrolled = false;/);
  assert.ok(!js.includes('window.scrollTo({ top: cp.windowScrollY'), 'Checkpoint restore must never force window.scrollTo downward');
  assert.match(js, /const prevScrollTop = Number\(listEl\.scrollTop\) \|\| 0;/);

  // 4) Ultra-simplified labels & hidden instructional hint noise
  assert.match(html, /data-work-mode="SKU"[^>]*>📦 SKUs<\/button>/);
  assert.match(html, /data-work-mode="COVER"[^>]*>🖼️ Portadas<\/button>/);
  assert.match(html, /data-work-mode="FABRIC"[^>]*>🧵 Telas<\/button>/);
  assert.match(html, /id="fotosWorkModeHint"[^>]*class="[^"]*hidden/);
  assert.match(html, /id="galleryQuickHint"[^>]*class="[^"]*hidden/);
  assert.match(html, /<span>Filtros<\/span>/);
  assert.match(html, /<span>Ficha y stock<\/span>/);
  assert.match(html, /id="btnNextMissingPhoto"[^>]*>Siguiente →<\/button>/);
});



