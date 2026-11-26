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
      st: Array.isArray(cols[15][i]) ? cols[15][i] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      pr: cols.length > 16 ? cols[16][i] : '',
      fe: cols.length > 17 ? String(cols[17][i] || '').trim() : ''
    });
  }
  return items;
}

function createInventarioAppHarness(items) {
  const src = fs.readFileSync('inventario-app.js', 'utf8');
  const hook =
    'window.__TEST_API__ = {' +
    ' getAllItems: () => allItems,' +
    ' setAllItems: (arr) => { allItems = arr; },' +
    ' indexItemsAndGroups,' +
    ' getAllGroups: () => allGroups,' +
    ' getFilteredGroups: () => filteredGroups,' +
    ' resolveItemModuleBucket,' +
    ' renderGroupVariantsStep,' +
    ' formatGroupBadgeLabel,' +
    ' buildVisualCoverOverrideKey,' +
    ' buildFabricSwatchOverrideKey,' +
    ' getGroupVisualCoverPhotoUrl,' +
    ' getFabricSwatchPhotoUrl,' +
    ' saveLocalProductOverridesMap,' +
    ' renderMoreItems: window.renderMoreItems,' +
    ' setInvCategory: window.setInvCategory,' +
    ' setInvSubCategory: window.setInvSubCategory,' +
    ' openGroupModal: window.openGroupModal,' +
    ' selectGroupFabricStep: window.selectGroupFabricStep,' +
    ' backToCurrentGroupVariants: window.backToCurrentGroupVariants,' +
    ' getCurrentGroupState: () => ({ fabricKey: currentGroupFabricKey, bedSizeKey: currentGroupBedSizeKey, detailSku: currentDetailItem ? currentDetailItem.s : "" }),' +
    ' getDocEl: (id) => document.getElementById(id)' +
    '};';
  const patched = src.replace(/\}\)\(\);\s*$/, '\n' + hook + '\n})();\n');

  const elements = new Map();
  function makeEl(id) {
    const clSet = new Set();
    return {
      id,
      innerHTML: '',
      textContent: '',
      value: '',
      style: { setProperty() {}, removeProperty() {} },
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
    addEventListener() {},
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
  vm.runInContext(patched, sb);

  const api = sb.__TEST_API__;
  api.setAllItems(items);
  api.indexItemsAndGroups();
  return api;
}

const REAL_ITEMS = loadRealCatalogItems();
const API = createInventarioAppHarness(REAL_ITEMS);

test('SILLONES excludes all modular/sectional/directional sala pieces while keeping standalone chairs', () => {
  const sillones = API.getAllItems().filter(it => it._cat === 'SILLONES');
  assert.ok(sillones.length > 50, 'Expected real accent chairs in SILLONES');

  const leakedModular = sillones.filter(it =>
    /\b(MODULAR|MODULO|BRAZO\s+DER|BRAZO\s+IZQ|SIN\s+BRAZO|DERECHO|DEREHO|IZQUIERDO|ESQUINERO|CHAISE|REMATE)\b/i.test(
      (it.n || '') + ' ' + (it.tp || '')
    )
  );
  assert.deepEqual(
    leakedModular.map(x => `${x.s}: ${x.n}`),
    [],
    'Modular or directional sala pieces must never be categorized under SILLONES'
  );

  // Real standalone accent chairs remain in SILLONES
  assert.ok(
    sillones.some(it => /APIENZO|OCASIONAL/i.test(it.n || '')),
    'Standalone accent chairs must remain in SILLONES'
  );
});

test('TODOS keeps SALAS MODULARES, SALAS EN L, SOFÁ CAMAS, and SOFÁ Y LOVE SEAT grouped by Type + Model, while inside SALAS category every subcategory is ungrouped piece by piece', () => {
  // 1) In TODOS (ALL): Salas stay grouped by Type + Model with modules & fabric variations inside
  API.setInvCategory('ALL');
  API.setInvSubCategory('ALL');
  const todosGroups = API.getFilteredGroups();

  const aspen = todosGroups.find(g => g.mo === 'ASPEN' && g.typeKey === 'SALA_MODULAR');
  assert.ok(aspen, 'Expected grouped SALA MODULAR ASPEN card in TODOS');
  assert.equal(aspen.title, 'SALA MODULAR ASPEN');
  assert.ok(aspen.items.length >= 10, 'ASPEN should combine all modular SKUs in TODOS');
  assert.ok(aspen.moduleCount >= 5, 'ASPEN should expose multiple distinct modules in TODOS');
  assert.ok(aspen.variationCount >= 2, 'ASPEN should expose multiple fabric colors in TODOS');
  assert.match(API.formatGroupBadgeLabel(aspen), /colores · \d+ mód\./);

  const nilo = todosGroups.find(g => g.mo === 'NILO' && g.typeKey === 'SALA_MODULAR');
  assert.ok(nilo, 'Expected grouped SALA MODULAR NILO card in TODOS');
  assert.ok(
    nilo.items.some(it => /TABURETE/i.test(it.tp + ' ' + it.n)),
    'NILO TABURETE must group inside SALA MODULAR NILO rather than BANCOS & BANCAS'
  );

  const tessa = todosGroups.find(g => g.mo === 'TESSA' && g.typeKey === 'SALA_MODULAR');
  assert.ok(tessa && tessa.items.length >= 2, 'TESSA modular pieces must group together in TODOS');

  for (const model of ['IBIZA', 'DOVELLI', 'MATERA', 'MELODY', 'PERRY', 'VALENTI', 'VARENA']) {
    const grp = todosGroups.find(g => g.mo === model && g.typeKey === 'SALA_EN_L');
    assert.ok(grp, `Expected SALA EN L ${model} in TODOS`);
    assert.equal(grp.title, `SALA EN L ${model}`);
    assert.ok(grp.moduleCount >= 2, `Expected multiple modules for SALA EN L ${model}`);
  }
  const dovelli = todosGroups.find(g => g.mo === 'DOVELLI' && g.typeKey === 'SALA_EN_L');
  assert.equal(dovelli.variationCount, 1, 'DOVELLI ISMALIA LINEN / COORD variants must unify into 1 color');

  const city = todosGroups.find(g => g.mo === 'CITY' && g.typeKey === 'SOFA_CAMA');
  assert.ok(city, 'Expected grouped SOFÁ CAMA CITY card in TODOS');
  assert.equal(city.title, 'SOFÁ CAMA CITY');
  assert.ok(city.moduleCount >= 3, 'SOFÁ CAMA CITY should group Sofá Cama + Chaise Der + Chaise Izq');

  for (const model of ['AZURA', 'CASCADE', 'GEORGIA', 'GIORGIANO', 'LAVINI', 'MARENO', 'ORIA']) {
    const grp = todosGroups.find(g => g.mo === model && g.typeKey === 'SOFA_LOVESEAT');
    assert.ok(grp, `Expected paired SOFÁ Y LOVE SEAT ${model} in TODOS`);
    assert.equal(grp.title, `SOFÁ Y LOVE SEAT ${model}`);
    assert.equal(grp.moduleCount, 2, `Expected SOFÁ + LOVE SEAT modules for ${model}`);
  }

  // 2) Inside SALAS category (TODO SALAS & every subcategory): EVERY card is ungrouped (1 individual SKU per card)
  API.setInvCategory('SALAS');
  for (const sub of ['ALL', 'SALAS MODULARES', 'SALAS EN L', 'SOFAS & LOVESEATS', 'FUTONES & SOFÁ CAMAS', 'SILLONES']) {
    API.setInvSubCategory(sub);
    const cards = API.getFilteredGroups();
    assert.ok(cards.length > 0, `Expected visible cards in SALAS > ${sub}`);
    assert.equal(
      cards.filter(c => c.items.length > 1).length,
      0,
      `SALAS > ${sub} must render individual ungrouped cards (0 multi-SKU group cards)`
    );
  }
  // Verify ASPEN pieces appear individually inside SALAS MODULARES
  API.setInvSubCategory('SALAS MODULARES');
  const aspenSingles = API.getFilteredGroups().filter(g => g.mo === 'ASPEN');
  assert.ok(aspenSingles.length >= 10, 'SALAS MODULARES must render each ASPEN modular piece as its own card');
});

test('EXTERIOR stays grouped in TODOS and renders individual ungrouped cards inside COMPLEMENTOS > EXTERIOR', () => {
  // 1) In TODOS (ALL): Exterior models stay grouped by Type + Model
  API.setInvCategory('ALL');
  API.setInvSubCategory('ALL');
  const todosGroups = API.getFilteredGroups();

  const alteaSala = todosGroups.find(g => g.mo === 'ALTEA' && g.typeKey === 'EXT_SALA_MODULAR');
  assert.ok(alteaSala, 'Expected SALA MODULAR EXTERIOR ALTEA in TODOS');
  assert.equal(alteaSala.title, 'SALA MODULAR EXTERIOR ALTEA');
  assert.ok(alteaSala.moduleCount >= 2);

  const santhomasSala = todosGroups.find(g => g.mo === 'SANTHOMAS' && g.typeKey === 'EXT_SALA_MODULAR');
  assert.ok(santhomasSala, 'Expected SALA MODULAR EXTERIOR SANTHOMAS in TODOS');
  assert.equal(santhomasSala.title, 'SALA MODULAR EXTERIOR SANTHOMAS');
  assert.ok(santhomasSala.moduleCount >= 3);

  const luminaSala = todosGroups.find(g => g.mo === 'LUMINA' && g.typeKey === 'EXT_SOFA_LOVESEAT');
  assert.ok(luminaSala, 'Expected SOFÁ Y LOVE SEAT EXTERIOR LUMINA in TODOS');
  assert.equal(luminaSala.title, 'SOFÁ Y LOVE SEAT EXTERIOR LUMINA');
  assert.ok(luminaSala.moduleCount >= 2);

  const santaMonicaSala = todosGroups.find(g => g.mo === 'SANTA MONICA' && g.typeKey === 'EXT_SALA');
  assert.ok(santaMonicaSala, 'Expected SALA EXTERIOR SANTA MONICA in TODOS');
  assert.ok(santaMonicaSala.moduleCount >= 2);
  assert.equal(santaMonicaSala.variationCount, 2, 'SANTA MONICA should group cleanly into DARK GREY and WHITE');

  const nidoSala = todosGroups.find(g => g.mo === 'NIDO' && g.typeKey === 'EXT_SALA');
  assert.ok(nidoSala, 'Expected SALA EXTERIOR NIDO in TODOS');
  assert.equal(nidoSala.title, 'SALA EXTERIOR NIDO');
  assert.equal(nidoSala.moduleCount, 2);

  const recifeSala = todosGroups.find(g => g.mo === 'RECIFE' && g.typeKey === 'EXT_SALA');
  assert.ok(recifeSala, 'Expected SALA EXTERIOR RECIFE in TODOS');
  assert.ok(recifeSala.moduleCount >= 2);

  const palmBeachSala = todosGroups.find(g => g.mo === 'PALM BEACH' && g.typeKey === 'EXT_SALA');
  assert.ok(palmBeachSala, 'SALA PALM BEACH must stay SALA EXTERIOR (not MESA DE CENTRO EXTERIOR)');

  const lustroCamastro = todosGroups.find(g => g.mo === 'LUSTRO' && g.typeKey === 'EXT_CAMASTRO');
  assert.ok(lustroCamastro && lustroCamastro.items.length >= 2, 'CAMASTRO EXTERIOR LUSTRO should group its variations in TODOS');

  // 2) Inside COMPLEMENTOS > EXTERIOR: every card is ungrouped piece by piece
  API.setInvCategory('COMPLEMENTOS');
  API.setInvSubCategory('EXTERIOR');
  const extCards = API.getFilteredGroups();
  assert.ok(extCards.length >= 50, 'Expected individual EXTERIOR product cards');
  assert.equal(
    extCards.filter(c => c.items.length > 1).length,
    0,
    'COMPLEMENTOS > EXTERIOR must render individual ungrouped cards'
  );
});

test('3-click flow from TODOS: Click 2 shows Color/Fabric cards with fabric photo, Click 3 shows ordered Modules of chosen Color', () => {
  API.setInvCategory('ALL');
  API.setInvSubCategory('ALL');
  const aspen = API.getFilteredGroups().find(g => g.mo === 'ASPEN' && g.typeKey === 'SALA_MODULAR');
  assert.ok(aspen, 'Expected ASPEN modular group in TODOS');

  // CLICK 2: Selecting ASPEN displays Color / Fabric choice cards (no modules dumped yet)
  API.renderGroupVariantsStep(aspen, '');
  const click2Html = API.getDocEl('detVariantsList').innerHTML;
  const crumb2 = API.getDocEl('detGroupCrumb').textContent;
  assert.match(crumb2, /\d+ colores \/ telas · \d+ módulos/);

  const fabricCards = [...click2Html.matchAll(/class="inv-fabric-choice-title">([^<]+)<\/div>/g)].map(m => m[1]);
  assert.equal(fabricCards[0], 'LILLIE SNOW', 'LILLIE SNOW (6 modules) should appear first in ASPEN Click 2');
  assert.equal(fabricCards[1], 'LILLIE SILVER', 'LILLIE SILVER (4 modules) should appear second in ASPEN Click 2');
  assert.ok(!click2Html.includes('data-var-sku='), 'Click 2 must show only Color/Fabric cards before choosing a fabric');
  assert.ok(!click2Html.includes('data-fabric-pick-key='), 'Cotizador must not expose visual edit buttons (managed in Fotos App)');

  // CLICK 3 (LILLIE SNOW): Selecting LILLIE SNOW displays ONLY LILLIE SNOW modules in commercial order
  API.renderGroupVariantsStep(aspen, 'LILLIE SNOW');
  const snowHtml = API.getDocEl('detVariantsList').innerHTML;
  const crumb3 = API.getDocEl('detGroupCrumb').textContent;
  assert.match(crumb3, /← Colores \/ Telas/);
  assert.match(snowHtml, /SILLÓN BRAZO DERECHO/);
  assert.match(snowHtml, /SILLÓN BRAZO IZQUIERDO/);
  assert.match(snowHtml, /SILLÓN SIN BRAZOS/);
  assert.match(snowHtml, /ESQUINERO/);
  assert.match(snowHtml, /CHAISE LONGUE IZQUIERDO/);
  assert.match(snowHtml, /OTOMÁN/);
  assert.ok(!snowHtml.includes('CHAISE LONGUE DERECHO'), 'LILLIE SNOW step must not mix in LILLIE SILVER modules');

  // CLICK 3 (LILLIE SILVER): Selecting LILLIE SILVER displays ONLY LILLIE SILVER modules
  API.renderGroupVariantsStep(aspen, 'LILLIE SILVER');
  const silverHtml = API.getDocEl('detVariantsList').innerHTML;
  assert.match(silverHtml, /SILLÓN SIN BRAZOS/);
  assert.match(silverHtml, /ESQUINERO/);
  assert.match(silverHtml, /CHAISE LONGUE DERECHO/);
  assert.match(silverHtml, /CHAISE LONGUE IZQUIERDO/);
  assert.ok(!silverHtml.includes('OTOMÁN'), 'LILLIE SILVER step must not mix in LILLIE SNOW modules');

  // Verify visual photo editing lives in fotos-productos.html / fotos-productos-app.js
  const fotosHtml = fs.readFileSync('fotos-productos.html', 'utf8');
  assert.match(fotosHtml, /id="fotosWorkModeBar"/);
  assert.match(fotosHtml, /data-work-mode="COVER"/);
  assert.match(fotosHtml, /data-work-mode="FABRIC"/);
  assert.match(fotosHtml, /id="visualStageContentWrap"/);
});

test('Category pill counts match visible card counts 1:1 for ungrouped Salas and Exterior subcategories', () => {
  API.setInvCategory('SALAS');
  API.setInvSubCategory('ALL');
  const subBarHtml = API.getDocEl('invSubCategoryBar').innerHTML;
  const todoSalasCount = API.getFilteredGroups().length;
  const mTodoSalas = subBarHtml.match(/TODO SALAS \((\d+)\)/);
  assert.ok(mTodoSalas, 'Expected pill for TODO SALAS');
  assert.equal(Number(mTodoSalas[1]), todoSalasCount, 'TODO SALAS pill must match ungrouped visible card count 1:1');

  for (const sub of ['SALAS MODULARES', 'SALAS EN L', 'SOFAS & LOVESEATS', 'FUTONES & SOFÁ CAMAS', 'SILLONES']) {
    API.setInvSubCategory(sub);
    const actualCards = API.getFilteredGroups().length;
    const escaped = sub.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = subBarHtml.match(new RegExp(escaped + ' \\((\\d+)\\)'));
    assert.ok(m, `Expected pill for ${sub}`);
    assert.equal(Number(m[1]), actualCards, `Pill counter for ${sub} must match rendered card count`);
  }

  API.setInvCategory('COMPLEMENTOS');
  API.setInvSubCategory('EXTERIOR');
  const compSubHtml = API.getDocEl('invSubCategoryBar').innerHTML;
  const extCards = API.getFilteredGroups().length;
  const mExt = compSubHtml.match(/EXTERIOR \((\d+)\)/);
  assert.ok(mExt, 'Expected pill for EXTERIOR');
  assert.equal(Number(mExt[1]), extCards, 'EXTERIOR pill counter must match rendered card count');
});

test('inventario-ui.css defines 3-click Color/Fabric cards, selected fabric header bar, swatches, and lightbox styles', () => {
  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  assert.match(css, /#detVariantsList\s+\.inv-row\.inv-fabric-choice-card\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-fabric-selected-bar\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /#detVariantsList\s+\.inv-fabric-swatch\s*\{/);
  assert.match(css, /\.inv-visual-lightbox-card\s*\{/);
});

test('Visual cover photo (home TODOS) and fabric swatch photo (Click 2 & Click 3) render cleanly without altering any SKU photo', () => {
  API.setInvCategory('ALL');
  API.setInvSubCategory('ALL');
  const aspen = API.getFilteredGroups().find(g => g.mo === 'ASPEN' && g.typeKey === 'SALA_MODULAR');
  const origSkuPhotos = aspen.items.map(it => it.f);

  const covKey = API.buildVisualCoverOverrideKey(aspen.key);
  const fabKey = API.buildFabricSwatchOverrideKey('LILLIE SNOW');
  assert.ok(covKey.startsWith('VCOV:') && covKey.length <= 58, 'Cover override key must fit backend 60-char limit');
  assert.ok(fabKey.startsWith('VFAB:') && fabKey.length <= 58, 'Fabric override key must fit backend 60-char limit');

  const fakeCoverDriveUrl = 'https://drive.google.com/file/d/1VisualCoverAspenId9999/view?usp=sharing';
  const fakeFabricDriveUrl = 'https://drive.google.com/file/d/1FabricSwatchSnowId8888/view?usp=sharing';
  API.saveLocalProductOverridesMap({
    [covKey]: { sku: covKey, status: 'VISIBLE', name: aspen.title, category: 'VISUAL_COVER', note: fakeCoverDriveUrl },
    [fabKey]: { sku: fabKey, status: 'VISIBLE', name: 'LILLIE SNOW', category: 'FABRIC_SWATCH', note: fakeFabricDriveUrl }
  });

  assert.equal(API.getGroupVisualCoverPhotoUrl(aspen.key), fakeCoverDriveUrl);
  assert.equal(API.getFabricSwatchPhotoUrl('LILLIE SNOW'), fakeFabricDriveUrl);

  // Click 2 shows the fabric swatch Drive image on LILLIE SNOW card and keeps detGroupCoverBar hidden (read-only Cotizador)
  API.renderGroupVariantsStep(aspen, '');
  const click2Html = API.getDocEl('detVariantsList').innerHTML;
  assert.ok(click2Html.includes('1FabricSwatchSnowId8888'), 'Click 2 LILLIE SNOW card should display the fabric swatch Drive image');
  assert.equal(API.getDocEl('detGroupCoverBar').innerHTML, '', 'Cotizador modal must not render visual cover edit bar');

  // Click 3 also shows the fabric swatch thumb in the selected fabric header bar
  API.renderGroupVariantsStep(aspen, 'LILLIE SNOW');
  const click3Html = API.getDocEl('detVariantsList').innerHTML;
  assert.ok(click3Html.includes('1FabricSwatchSnowId8888'), 'Click 3 selected fabric bar should display the fabric swatch thumb');

  // Verify individual SKU photos are 100% untouched
  assert.deepEqual(aspen.items.map(it => it.f), origSkuPhotos, 'Visual cover and fabric swatch photos must NEVER mutate individual SKU photos');

  // Clean up overrides map for clean state
  API.saveLocalProductOverridesMap({});
});

test('Universal fabric attachment: uploaded VFAB fabric automatically applies to ALL matching products (including non-modular Sillones/Sillas) and non-CORS image recovery avoids false blacklisting', () => {
  const invJs = fs.readFileSync('inventario-app.js', 'utf8');
  const guardJs = fs.readFileSync('creata-guard.js', 'utf8');

  // Verify CreataGuard defers onFallback until all non-CORS Drive retries fail
  assert.match(guardJs, /drive\.google\.com\/thumbnail\?id=/, 'CreataGuard must retry Drive thumbnail endpoint without CORS');
  assert.match(guardJs, /drive\.google\.com\/uc\?export=view&id=/, 'CreataGuard must retry Drive uc?export=view endpoint without CORS');
  assert.match(invJs, /window\.__invHandleCardImgError/, 'inventario-app.js must define 4-step __invHandleCardImgError');
  assert.match(invJs, /function findMatchingFabricSwatchForItem\(/, 'inventario-app.js must define universal findMatchingFabricSwatchForItem');
  assert.match(invJs, /inv-var-fabric-pill/, 'Variant cards must render matched uploaded fabric pill');
  assert.match(invJs, /inv-det-fabric-swatch-card/, 'Detail modal must render matched uploaded fabric swatch card');

  // Runtime test: uploading a fabric matches both exact key and flexible word-order / subset fabric names
  const fabKey = API.buildFabricSwatchOverrideKey('LINO BEIGE');
  const fakeFabUrl = 'https://drive.google.com/file/d/1UniversalFabricLinoBeige99/view?usp=sharing';
  API.saveLocalProductOverridesMap({
    [fabKey]: { sku: fabKey, status: 'VISIBLE', name: 'LINO BEIGE', category: 'FABRIC_SWATCH', note: fakeFabUrl }
  });

  // Exact match, reversed word order, and product object (non-modular Sillón with tl + ct)
  assert.equal(API.getFabricSwatchPhotoUrl('LINO BEIGE'), fakeFabUrl);
  assert.equal(API.getFabricSwatchPhotoUrl('BEIGE LINO'), fakeFabUrl, 'Word-order-independent fabric match must succeed');
  assert.equal(
    API.getFabricSwatchPhotoUrl('', { s: 'SIL-TEST-1', n: 'SILLON ANKARA', tl: 'LINO', ct: 'BEIGE', vr: 'ESTÁNDAR' }),
    fakeFabUrl,
    'Already-uploaded fabric must automatically match existing non-modular products via tl + ct'
  );

  // Clean up
  API.saveLocalProductOverridesMap({});
});

test('Selecting a color with only 1 piece (e.g. SALA ARIA OSI FLAX) opens product detail sheet directly and Back returns to Colors', () => {
  const prevItems = API.getAllItems();
  try {
    const ariaItems = [
      {
        s: 'CVVSALAARIOF',
        n: 'SALA ARIA OSI FLAX INCLUYE LOVE SEAT DER ESQUINERO Y LOVE SEAT IZQ',
        t: 'SALA',
        mo: 'ARIA',
        c: 'SALAS & SOFÁS',
        vr: 'OSI FLAX',
        tl: 'OSI FLAX',
        ct: 'ARENA / FLAX',
        pr: 49296.97,
        f: 'https://drive.google.com/file/d/1sZX6RI01T_l0UHgFxCamRo3UKbj2qBA7/view',
        st: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        lp: 0
      },
      {
        s: 'CVVSALAARIOI',
        n: 'SALA ARIA OSI IVORY INCLUYE LOVE SEAT DER ESQUINERO Y LOVE SEAT IZQ',
        t: 'SALA',
        mo: 'ARIA',
        c: 'SALAS & SOFÁS',
        vr: 'OSI IVORY',
        tl: 'OSI IVORY',
        ct: 'IVORY',
        pr: 49296.97,
        f: 'https://drive.google.com/file/d/1YMAHTajkHItYgS3gUg6kM7gHPpf4JSh1/view',
        st: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        lp: 0
      }
    ];
    API.setAllItems(ariaItems);
    API.indexItemsAndGroups();

    // Inside SALAS category: ungrouped (2 separate cards: OSI FLAX and OSI IVORY)
    API.setInvCategory('SALAS');
    API.setInvSubCategory('ALL');
    const ariaSingles = API.getFilteredGroups();
    assert.equal(ariaSingles.length, 2, 'Inside SALAS category, SALA ARIA must display each color piece separately');
    assert.ok(ariaSingles.every(g => g.items.length === 1), 'Each SALAS card must hold 1 individual SKU');

    // In TODOS (ALL): grouped into 1 SALA ARIA card with 2 colors
    API.setInvCategory('ALL');
    API.setInvSubCategory('ALL');
    const ariaGrp = API.getFilteredGroups().find(g => g.mo === 'ARIA');
    assert.ok(ariaGrp && ariaGrp.items.length === 2, 'Expected SALA ARIA group with 2 color items in TODOS');

    // Step 1: Open group -> shows 2 color cards (OSI FLAX and OSI IVORY)
    assert.equal(API.openGroupModal(ariaGrp.key, false), true);
    const colHtml = API.getDocEl('detVariantsList').innerHTML;
    assert.match(colHtml, /data-fabric-select-key="OSI FLAX"/);
    assert.match(colHtml, /data-fabric-select-key="OSI IVORY"/);

    // Step 2: Select OSI FLAX (only 1 piece) -> opens CVVSALAARIOF detail sheet DIRECTLY!
    assert.equal(API.selectGroupFabricStep('OSI FLAX'), true);
    assert.equal(API.getDocEl('detSingleStep').classList.contains('hidden'), false, 'Single-item color must open product detail sheet directly');
    assert.equal(API.getDocEl('detVariantsStep').classList.contains('hidden'), true, 'Intermediate 1-module variants screen must be skipped');
    assert.equal(API.getCurrentGroupState().detailSku, 'CVVSALAARIOF');
    assert.equal(API.getCurrentGroupState().fabricKey, '', 'fabricKey must remain empty so Back returns cleanly to Color cards');

    // Step 3: Back returns directly to the 2 Color cards (no 1-module intermediate screen)
    API.backToCurrentGroupVariants();
    assert.equal(API.getDocEl('detVariantsStep').classList.contains('hidden'), false);
    assert.match(API.getDocEl('detVariantsList').innerHTML, /data-fabric-select-key="OSI FLAX"/);
    assert.match(API.getDocEl('detVariantsList').innerHTML, /data-fabric-select-key="OSI IVORY"/);
  } finally {
    API.setAllItems(prevItems);
    API.indexItemsAndGroups();
  }
});


