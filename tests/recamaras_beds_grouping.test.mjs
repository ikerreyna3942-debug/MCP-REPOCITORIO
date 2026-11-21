import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

function loadRealCatalogItems() {
  const dataSb = { window: {} };
  dataSb.self = dataSb;
  dataSb.globalThis = dataSb;
  vm.createContext(dataSb);
  for (const f of ['inventario-data-1.js', 'inventario-data-2.js', 'inventario-data-3.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), dataSb);
  }
  const b64 = String(dataSb.window.CREATA_INV_GZ || dataSb.CREATA_INV_GZ || '');
  const cols = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
  const items = [];
  for (let i = 0; i < cols[0].length; i++) {
    items.push({
      s: String(cols[0][i] || '').trim(),
      tp: String(cols[1][i] || '').trim(),
      mo: String(cols[2][i] || '').trim(),
      n: String(cols[3][i] || cols[0][i] || '').trim(),
      vr: String(cols[4][i] || '').trim(),
      f: String(cols[5][i] || '').trim(),
      c: String(cols[6][i] || '').trim(),
      tl: String(cols[7][i] || '').trim(),
      ct: String(cols[8][i] || '').trim(),
      md: String(cols[9][i] || '').trim(),
      cm: String(cols[10][i] || '').trim(),
      mt: String(cols[11][i] || '').trim(),
      m: String(cols[12][i] || '').trim(),
      p: String(cols[13][i] || '').trim(),
      lt: cols[14][i],
      st: Array.isArray(cols[15][i]) ? cols[15][i].slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      pr: cols.length > 16 ? cols[16][i] : '',
      fe: cols.length > 17 ? String(cols[17][i] || '').trim() : ''
    });
  }
  return items;
}

function createBedsHarness(items) {
  const src = fs.readFileSync('inventario-app.js', 'utf8');
  const elements = new Map();
  const docListeners = new Map();
  function makeEl(id) {
    const clSet = new Set();
    return {
      id,
      innerHTML: '',
      textContent: '',
      value: '',
      style: { removeProperty() {}, setProperty() {} },
      children: [],
      scrollLeft: 0,
      scrollWidth: 0,
      clientWidth: 0,
      classList: {
        add(c) { clSet.add(c); },
        remove(c) { clSet.delete(c); },
        toggle(c, f) {
          if (f === undefined) {
            if (clSet.has(c)) clSet.delete(c); else clSet.add(c);
          } else if (f) clSet.add(c); else clSet.delete(c);
        },
        contains(c) { return clSet.has(c); }
      },
      setAttribute() {},
      removeAttribute() {},
      getAttribute() { return ''; },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      appendChild() {},
      remove() {}
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeEl(id));
      return elements.get(id);
    },
    createElement(tag) { return makeEl(tag); },
    createDocumentFragment() { return { appendChild() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(evt, fn) {
      if (!docListeners.has(evt)) docListeners.set(evt, []);
      docListeners.get(evt).push(fn);
    },
    dispatchKeydown(key) {
      const ev = { key, preventDefault() {}, stopPropagation() {} };
      for (const fn of (docListeners.get('keydown') || [])) fn(ev);
      return ev;
    },
    body: makeEl('body'),
    documentElement: makeEl('html')
  };
  const storage = new Map();
  const localStorage = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); }
  };
  const sb = {
    window: null,
    document,
    localStorage,
    sessionStorage: localStorage,
    location: { href: 'https://example.com/inventario.html', search: '', pathname: '/inventario.html', hash: '' },
    navigator: { userAgent: 'node-test' },
    history: { pushState() {}, replaceState() {}, state: null },
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    URL,
    URLSearchParams,
    innerWidth: 1280,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.reject(new Error('offline'))
  };
  sb.window = sb;
  sb.self = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb);

  const api = sb.__CREATA_INV_AUDIT__;
  api.setAllItems(items);
  api.indexItemsAndGroups();
  return { api, win: sb, doc: document };
}

const REAL_ITEMS = loadRealCatalogItems();
const H = createBedsHarness(REAL_ITEMS);
const { api, win, doc } = H;
const BY_SKU = new Map(api.getAllItems().map(x => [x.s, x]));

test('Bed classification fixes: bedding textiles, Safety protectors, mattresses, rescued cabeceras, combo camas, and FOSSANO->FOSSENZO alias', () => {
  // Bedding textiles excluded from CAMAS -> COJINES & TEXTILES
  assert.equal(BY_SKU.get('ABCUBCAMINDBC')._cat, 'COJINES & TEXTILES');
  assert.equal(BY_SKU.get('VIVSTVL0206')._cat, 'COJINES & TEXTILES');
  assert.equal(BY_SKU.get('VIVSTCS0401')._cat, 'COJINES & TEXTILES');
  assert.equal(BY_SKU.get('VIVSTOR0409')._cat, 'COJINES & TEXTILES');
  assert.equal(BY_SKU.get('VIVSALN0403B')._cat, 'COJINES & TEXTILES');

  // Protectors excluded from bed grouping -> ACCESORIOS DECORATIVOS
  assert.equal(BY_SKU.get('SSPROBCQ')._cat, 'ACCESORIOS DECORATIVOS');
  assert.equal(BY_SKU.get('SSPRORECQ')._cat, 'ACCESORIOS DECORATIVOS');

  // Mattress stays in COLCHONES; rescued headboard stays in CABECERAS
  assert.equal(BY_SKU.get('REYCOLCKROOSM')._cat, 'COLCHONES');
  assert.equal(BY_SKU.get('ZOLCABRECSEC')._cat, 'CABECERAS');

  // Combo CAMA SKUs stay in CAMAS (not hijacked into BASES)
  assert.equal(BY_SKU.get('SKFOSBOLINDMM')._cat, 'CAMAS');
  assert.equal(BY_SKU.get('SKCAMFOBOQSGM')._cat, 'CAMAS');
  assert.equal(BY_SKU.get('SKCAMVEBOKSLC')._cat, 'CAMAS');

  // FOSSANO unifies into FOSSENZO
  assert.equal(BY_SKU.get('8196FOSBCKPAR')._groupTitle, 'CAMA, BASE Y CABECERA FOSSENZO');

  // LITERA, CUNA, and PIE DE CAMA preserve exact types and subcategories
  assert.equal(BY_SKU.get('CHALITVENMSMU')._typeKey, 'LITERA');
  assert.equal(BY_SKU.get('CHALITVENMSMU')._cat, 'CAMAS');
  assert.equal(BY_SKU.get('8303RAGCUNOLM')._typeKey, 'CUNA');
  assert.equal(BY_SKU.get('8303RAGCUNOLM')._cat, 'CAMAS');
  assert.equal(BY_SKU.get('SKPIEBAU01') ? BY_SKU.get('SKPIEBAU01')._cat : 'PIE DE CAMA', 'PIE DE CAMA');
  const pieItems = api.getAllItems().filter(x => /^SKPIE(BAU|ROM)/.test(x.s));
  assert.ok(pieItems.length >= 8 && pieItems.every(x => x._cat === 'PIE DE CAMA'));
});

test('Bed size extraction, wood-only finish fallback (zero size-as-fabric bugs), grade stripping, and cross-piece isolation', () => {
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('SK8195FOSBCIP')) }, { key: 'INDIVIDUAL', label: 'INDIVIDUAL', rank: 1 });
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('BARSANMATPLRM')) }, { key: 'MATRIMONIAL', label: 'MATRIMONIAL', rank: 2 });
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('SK8172BARCAQP')) }, { key: 'MATRIMONIAL_QUEEN', label: 'MAT / QUEEN', rank: 3 });
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('SKSEQSFOSLOCO')) }, { key: 'QUEEN_SIZE', label: 'QUEEN SIZE', rank: 4 });
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('ATXBATEKSASTA')) }, { key: 'KING_SIZE', label: 'KING SIZE', rank: 5 });
  assert.deepEqual({ ...api.resolveItemBedSize({ n: 'CAMA DEMO SUPER KING LINO', vr: 'SKS' }) }, { key: 'SUPER_KING', label: 'SUPER KING', rank: 6 });
  assert.deepEqual({ ...api.resolveItemBedSize(BY_SKU.get('SKVENSETEXTEF')) }, { key: 'UNSPECIFIED', label: 'ESTÁNDAR', rank: 99 });

  // Zero size-as-fabric bugs across wood-only and plain beds
  const sizeTokensRe = /^(?:KS|QS|SKS|MAT|MTR|IND|INDIV|KING(?:\s+SIZE)?|QUEEN(?:\s+SIZE)?|MATRIMONIAL|INDIVIDUAL|SUPER\s+KING|MATRIMONIAL\s+QUEEN(?:\s+SIZE)?)$/i;
  const woodChecks = [
    ['SK8195FOSBCIP', 'PAROTA SKANOR', true],
    ['ATXCABTORINKS', 'ENCINO LACA BELLOTA', true],
    ['ATXBASBLOKSLB', 'ENCINO LACA BELLOTA', true],
    ['BARCAMMYKONKS', 'TABACO CLARO', true],
    ['SK8172BARCAQP', 'PAROTA SKANOR', true],
    ['ATXBASEVALOQS', 'ENCINO LACA BELLOTA', true],
    ['CVVDITBASEKS', 'PINO ESTUFADO', true],
    ['3003ALIBCK', 'ESTÁNDAR', false],
    ['BOXHOTELIND', 'ESTÁNDAR', false]
  ];
  for (const [sku, expectedLabel, expectedWood] of woodChecks) {
    const res = api.resolveItemBedColorOrFinish(BY_SKU.get(sku));
    assert.ok(!sizeTokensRe.test(res.label), `${sku} must NEVER emit a bed size as fabric/color (got "${res.label}")`);
    assert.equal(res.label, expectedLabel, `${sku} expected "${expectedLabel}", got "${res.label}"`);
    assert.equal(res.isWood, expectedWood, `${sku} expected isWood=${expectedWood}`);
  }

  // Grade prefixes stripped cleanly
  assert.equal(api.resolveItemBedColorOrFinish(BY_SKU.get('ATXCABVALOKS')).label, 'MODENA TUSK');
  assert.equal(api.resolveItemBedColorOrFinish(BY_SKU.get('ATXCAMAUQSGMB')).label, 'GELLAR MARBLE');
  assert.equal(api.resolveItemBedColorOrFinish(BY_SKU.get('ATXCAMSFEKSLC')).label, 'LOVEME COTTON');

  // Safeguard #2: FOSSENZO upholstered Cabeceras do NOT inherit PAROTA wood from Bases, and ATENAS Cabeceras keep own dimensions
  assert.equal(BY_SKU.get('SKCAQSFOSBLEN').md, '', 'FOSSENZO upholstered Cabecera must not inherit PAROTA from Bases');
  assert.equal(BY_SKU.get('SKCAINFOSRECH').md, '', 'FOSSENZO upholstered Cabecera must not inherit PAROTA from Bases');
  assert.notEqual(BY_SKU.get('ATXCATEKSASTA').m, BY_SKU.get('ATXBATEKSASTA').m, 'ATENAS Cabecera and Base must keep distinct dimensions');
});

test('Unified bed model grouping, strict Exterior Title HOLD (Tipo + Modelo ONLY), subcategory narrowing, and Safeguard #1 single-piece STOCK titles', () => {
  win.setInvCategory('RECÁMARAS');
  win.setInvSubCategory('ALL');
  const recGroups = api.getFilteredGroups();

  const expectedUnified = [
    ['ATENAS', 'BASE Y CABECERA ATENAS', 5],
    ['FOSSENZO', 'CAMA, BASE Y CABECERA FOSSENZO', 10],
    ['VALO', 'BASE Y CABECERA VALO', 5],
    ['PORTOFINO', 'CAMA PORTOFINO', 5],
    ['BOLENZO', 'BASE DE CAMA BOLENZO', 7],
    ['MYKONOS', 'CAMA MYKONOS', 4],
    ['TORINO', 'CABECERA TORINO', 3],
    ['BLONDY', 'BASE DE CAMA BLONDY', 3],
    ['FOSSELLO', 'CAMA FOSSELLO', 3],
    ['VENECIA', 'CABECERA VENECIA', 5]
  ];
  for (const [mo, expectedTitle, expectedCount] of expectedUnified) {
    const grp = recGroups.find(g => g.mo === mo && api.BED_GROUPABLE_TYPE_KEYS.has(g.typeKey));
    assert.ok(grp, `Expected grouped bed card for ${mo}`);
    assert.equal(grp.displayTitle, expectedTitle);
    assert.equal(grp.items.length, expectedCount);
  }

  // STRICT EXTERIOR TITLE RULE: every multi-SKU bed grouped card displays Tipo + Modelo ONLY (zero size, fabric, wood, or '·')
  const multiBedCards = recGroups.filter(g => g.items.length > 1 && api.BED_GROUPABLE_TYPE_KEYS.has(g.typeKey));
  assert.equal(multiBedCards.length, 16);
  for (const g of multiBedCards) {
    assert.ok(!g.displayTitle.includes('·'), `Grouped bed title "${g.displayTitle}" must NOT contain "·"`);
    assert.ok(!/\b(KING|QUEEN|MATRIMONIAL|INDIVIDUAL|KS|QS|MAT|MTR|IND|PAROTA|ENCINO|LACA|BELLOTA|TACUBA|ATENEA|LOVEME|GLOSS|BOLTON|REFLECT)\b/i.test(g.displayTitle),
      `Grouped bed title "${g.displayTitle}" must contain strictly Tipo + Modelo ONLY`);
  }

  // Safeguard #3: Narrowed titles inside BASES and CABECERAS filters
  win.setInvSubCategory('BASES');
  const atenasBases = api.getFilteredGroups().find(g => g.mo === 'ATENAS');
  assert.ok(atenasBases);
  assert.equal(atenasBases.displayTitle, 'BASE DE CAMA ATENAS');
  assert.equal(atenasBases.items.length, 2);

  win.setInvSubCategory('CABECERAS');
  const atenasCabs = api.getFilteredGroups().find(g => g.mo === 'ATENAS');
  assert.ok(atenasCabs);
  assert.equal(atenasCabs.displayTitle, 'CABECERA ATENAS');
  assert.equal(atenasCabs.items.length, 3);

  // Safeguard #1: Single-piece STOCK titles use own piece label (BASE DE CAMA ATENAS / CABECERA ATENAS), NOT combined label
  assert.match(BY_SKU.get('ATXBATEKSASTA')._singleTitle, /^BASE DE CAMA ATENAS\b/);
  assert.match(BY_SKU.get('ATXCATEKSASTA')._singleTitle, /^CABECERA ATENAS\b/);
});

test('Strict 1:1 pill-to-card count parity across TODO RECÁMARAS, all 7 subcategories, TODOS, and STOCK', () => {
  win.setInvCategory('ALL');
  win.setInvSubCategory('ALL');
  const mainBarHtml = doc.getElementById('invCategoryBar').innerHTML;
  const mTodos = mainBarHtml.match(/TODOS \((\d+)\)/);
  assert.ok(mTodos);
  assert.equal(Number(mTodos[1]), api.getAllGroups().length, 'TODOS pill count must equal allGroups.length');

  win.setInvCategory('RECÁMARAS');
  win.setInvSubCategory('ALL');
  const subBarHtml = doc.getElementById('invSubCategoryBar').innerHTML;
  const todoRecCards = api.getFilteredGroups().length;
  const mTodoRec = subBarHtml.match(/TODO RECÁMARAS \((\d+)\)/);
  assert.ok(mTodoRec);
  assert.equal(todoRecCards, 141);
  assert.equal(Number(mTodoRec[1]), todoRecCards, 'TODO RECÁMARAS pill must match card count 1:1');

  const expectedSubs = [
    ['CAMAS', 18],
    ['CABECERAS', 9],
    ['COLCHONES', 14],
    ['BASES', 12],
    ['BURÓS', 40],
    ['COMODAS Y TOCADORES', 43],
    ['PIE DE CAMA', 9]
  ];
  for (const [sub, expectedCount] of expectedSubs) {
    win.setInvSubCategory(sub);
    const actualCards = api.getFilteredGroups().length;
    const esc = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = subBarHtml.match(new RegExp(esc + ' \\((\\d+)\\)'));
    assert.ok(m, `Expected subcategory pill for ${sub}`);
    assert.equal(actualCards, expectedCount, `${sub} expected ${expectedCount} cards`);
    assert.equal(Number(m[1]), actualCards, `Pill counter for ${sub} must match visible cards 1:1`);
  }

  win.setInvCategory('STOCK');
  win.setInvSubCategory('ALL');
  assert.equal(api.getFilteredGroups().length, 3236, 'STOCK must remain flat per-piece with 3,236 pieces');
});

test('Interactive bed modal drill-down (Size -> Color/Wood -> Piece), auto-skips, disambiguation, VFAB swatch, and Back/Escape unwind', () => {
  // Attach VFAB:ATENEA SNOW override and verify zero mutation of SKU .f
  win.setInvCategory('RECÁMARAS');
  win.setInvSubCategory('ALL');
  const atenas = api.getFilteredGroups().find(g => g.mo === 'ATENAS');
  const origAtenasPhotos = atenas.items.map(x => x.f);
  const fabKey = api.buildFabricSwatchOverrideKey('ATENEA SNOW');
  const fakeAteneaUrl = 'https://drive.google.com/file/d/1BedSwatchAteneaSnow777/view?usp=sharing';
  api.saveLocalProductOverridesMap({
    [fabKey]: { sku: fabKey, status: 'VISIBLE', name: 'ATENEA SNOW', category: 'FABRIC_SWATCH', note: fakeAteneaUrl }
  });

  // 1) ATENAS: Step 1 (Sizes) -> KING_SIZE Step 2 (Colors with swatch) -> ATENEA SNOW Step 3 (Base + Cabecera)
  assert.equal(win.openGroupModal(atenas.key, false), true);
  const step1Html = doc.getElementById('detVariantsList').innerHTML;
  assert.match(step1Html, /data-bed-size-select-key="QUEEN_SIZE"/);
  assert.match(step1Html, /data-bed-size-select-key="KING_SIZE"/);
  assert.ok(!step1Html.includes('data-var-sku='), 'Step 1 Sizes must not dump SKU cards yet');

  assert.equal(win.selectGroupBedSizeStep('KING_SIZE'), true);
  const step2Html = doc.getElementById('detVariantsList').innerHTML;
  assert.match(step2Html, /data-fabric-select-key="ATENEA SNOW"/);
  assert.match(step2Html, /data-fabric-select-key="OUTRIGGER WHITE"/);
  assert.ok(step2Html.includes('1BedSwatchAteneaSnow777'), 'ATENAS Step 2 must render VFAB:ATENEA SNOW swatch');
  assert.match(doc.getElementById('detGroupCrumb').textContent, /← Tamaños \(2\)/);

  assert.equal(win.selectGroupFabricStep('ATENEA SNOW'), true);
  const step3Html = doc.getElementById('detVariantsList').innerHTML;
  assert.ok(step3Html.includes('1BedSwatchAteneaSnow777'), 'ATENAS Step 3 bar must render VFAB:ATENEA SNOW swatch thumb');
  assert.match(step3Html, /data-var-sku="ATXBATEKSASTA"/);
  assert.match(step3Html, /data-var-sku="ATXCATEKSASTA"/);
  assert.match(step3Html, /BASE DE CAMA/);
  assert.match(step3Html, /CABECERA/);

  // Open SKU detail from Step 3, then unwind cleanly: Detail -> Step 3 -> Step 2 -> Step 1 -> Close (via back & Escape)
  assert.equal(win.openProductDetail('ATXBATEKSASTA', true), true);
  assert.match(doc.getElementById('detGroupCrumb').textContent, /KING SIZE · ATENEA SNOW · BASE Y CABECERA ATENAS/);
  win.backToCurrentGroupVariants();
  assert.equal(api.getCurrentGroupState().bedSizeKey, 'KING_SIZE');
  assert.equal(api.getCurrentGroupState().fabricKey, 'ATENEA SNOW');
  // Unwind Step 3 -> Step 2 via Escape
  doc.dispatchKeydown('Escape');
  assert.equal(api.getCurrentGroupState().bedSizeKey, 'KING_SIZE');
  assert.equal(api.getCurrentGroupState().fabricKey, '');
  // Unwind Step 2 -> Step 1 via Escape
  doc.dispatchKeydown('Escape');
  assert.equal(api.getCurrentGroupState().bedSizeKey, '');
  assert.equal(api.getCurrentGroupState().fabricKey, '');
  assert.match(doc.getElementById('detVariantsList').innerHTML, /data-bed-size-select-key="KING_SIZE"/);

  // ATENAS QUEEN_SIZE (1 color) auto-skips Step 2 straight to Step 3, then unwinds directly to Step 1
  win.selectGroupBedSizeStep('QUEEN_SIZE');
  const qsHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.match(qsHtml, /data-var-sku="ATXBATEQSASTA"/);
  assert.match(qsHtml, /data-var-sku="ATXCATEQSASTA"/);
  assert.match(qsHtml, /data-bed-size-back="1"/);
  win.backToCurrentGroupVariants();
  assert.equal(api.getCurrentGroupState().bedSizeKey, '');
  assert.match(doc.getElementById('detVariantsList').innerHTML, /data-bed-size-select-key="QUEEN_SIZE"/);

  // Clean up overrides & verify SKU photos untouched
  assert.deepEqual(atenas.items.map(x => x.f), origAtenasPhotos);
  api.saveLocalProductOverridesMap({});

  // 2) FOSSELLO (1 size QUEEN SIZE, 3 fabrics) & VENECIA (1 size ESTÁNDAR, 5 colors) auto-skip Step 1 -> Step 2
  const fossello = api.getFilteredGroups().find(g => g.mo === 'FOSSELLO');
  win.openGroupModal(fossello.key, false);
  const fosHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.ok(!fosHtml.includes('data-bed-size-select-key='), '1-size FOSSELLO must auto-skip Step 1');
  assert.match(fosHtml, /data-fabric-select-key="LOVEME COTTON"/);
  assert.match(fosHtml, /data-fabric-select-key="LOVEME SAND"/);
  assert.match(fosHtml, /data-fabric-select-key="REFLECT CHARCOAL"/);

  const venecia = api.getFilteredGroups().find(g => g.mo === 'VENECIA');
  win.openGroupModal(venecia.key, false);
  const venHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.ok(!venHtml.includes('data-bed-size-select-key='), '1-size VENECIA must auto-skip Step 1');
  assert.match(venHtml, /Acabado Madera/, 'VENECIA wood extension must display wood indicator');

  // 3) MYKONOS (4 sizes, 1 wood finish TABACO CLARO): Step 1 -> KING_SIZE auto-skips Step 2 straight to Step 3 with 🪵 + ← Tamaños
  const mykonos = api.getFilteredGroups().find(g => g.mo === 'MYKONOS');
  win.openGroupModal(mykonos.key, false);
  const mykStep1 = doc.getElementById('detVariantsList').innerHTML;
  assert.match(mykStep1, /data-bed-size-select-key="INDIVIDUAL"/);
  assert.match(mykStep1, /data-bed-size-select-key="MATRIMONIAL"/);
  assert.match(mykStep1, /data-bed-size-select-key="QUEEN_SIZE"/);
  assert.match(mykStep1, /data-bed-size-select-key="KING_SIZE"/);
  win.selectGroupBedSizeStep('KING_SIZE');
  const mykStep3 = doc.getElementById('detVariantsList').innerHTML;
  assert.match(mykStep3, /🪵/);
  assert.match(mykStep3, /← Tamaños/);
  assert.match(mykStep3, /data-var-sku="BARCAMMYKONKS"/);
  win.backToCurrentGroupVariants();
  assert.equal(api.getCurrentGroupState().bedSizeKey, '');

  // 4) Duplicate-piece disambiguation: PORTOFINO KS GLOSS COTTON (PAROTA vs ROSA MORADA), SALERMO (TABACO vs LACA TACUBA), VALO QS ATENEA SNOW (SIN CINCHOS)
  const portofino = api.getFilteredGroups().find(g => g.mo === 'PORTOFINO');
  api.renderGroupVariantsStep(portofino, 'GLOSS COTTON', 'KING_SIZE');
  const portHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.match(portHtml, /CAMA · PAROTA/);
  assert.match(portHtml, /CAMA · ROSA MORADA/);

  const salermo = api.getFilteredGroups().find(g => g.mo === 'SALERMO');
  win.openGroupModal(salermo.key, false);
  const salHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.match(salHtml, /CABECERA · TABACO/);
  assert.match(salHtml, /CABECERA · LACA TACUBA/);

  const valo = api.getFilteredGroups().find(g => g.mo === 'VALO');
  api.renderGroupVariantsStep(valo, 'ATENEA SNOW', 'QUEEN_SIZE');
  const valoHtml = doc.getElementById('detVariantsList').innerHTML;
  assert.match(valoHtml, /SIN CINCHOS/);
});

test('CSS selectors for bed grouping exist with strictly balanced braces and zero banned UI strings', () => {
  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Unmatched closing brace in inventario-ui.css');
  }
  assert.equal(depth, 0, 'Unbalanced braces in inventario-ui.css');
  assert.match(css, /#detVariantsList\s+\.inv-row\.inv-bed-size-card\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-bed-size-stage\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-bed-size-pill\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-bed-size-chip\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-bed-selected-bar\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);

  const js = fs.readFileSync('inventario-app.js', 'utf8');
  assert.ok(!/muestra de tela/i.test(js.replace(/\/\/[^\n]*/g, '')), 'inventario-app.js UI strings must never contain banned phrase "muestra de tela"');
  assert.match(js, /id:\s*'bed_size_back_to_sizes'/);
});
