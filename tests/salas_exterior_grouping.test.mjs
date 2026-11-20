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
    ' setInvCategory: window.setInvCategory,' +
    ' setInvSubCategory: window.setInvSubCategory,' +
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
      style: {},
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

test('SALAS MODULARES, SALAS EN L, SOFÁ CAMAS, and SOFÁ Y LOVE SEAT stay grouped by Type + Model with modules inside', () => {
  // 1) SALAS MODULARES
  API.setInvCategory('SALAS');
  API.setInvSubCategory('SALAS MODULARES');
  const modGroups = API.getFilteredGroups();
  const aspen = modGroups.find(g => g.mo === 'ASPEN');
  assert.ok(aspen, 'Expected grouped SALA MODULAR ASPEN card');
  assert.equal(aspen.title, 'SALA MODULAR ASPEN');
  assert.ok(aspen.items.length >= 10, 'ASPEN should combine all modular SKUs');
  assert.ok(aspen.moduleCount >= 5, 'ASPEN should expose multiple distinct modules');
  assert.match(API.formatGroupBadgeLabel(aspen), /módulos · \d+ var\./);

  const nilo = modGroups.find(g => g.mo === 'NILO');
  assert.ok(nilo, 'Expected grouped SALA MODULAR NILO card');
  assert.ok(
    nilo.items.some(it => /TABURETE/i.test(it.tp + ' ' + it.n)),
    'NILO TABURETE must group inside SALA MODULAR NILO rather than BANCOS & BANCAS'
  );

  const tessa = modGroups.find(g => g.mo === 'TESSA');
  assert.ok(tessa && tessa.items.length >= 2, 'TESSA modular pieces must group together');

  // 2) SALAS EN L
  API.setInvSubCategory('SALAS EN L');
  const lGroups = API.getFilteredGroups();
  for (const model of ['IBIZA', 'DOVELLI', 'MATERA', 'MELODY', 'PERRY', 'VALENTI', 'VARENA']) {
    const grp = lGroups.find(g => g.mo === model);
    assert.ok(grp, `Expected SALA EN L ${model}`);
    assert.equal(grp.title, `SALA EN L ${model}`);
    assert.ok(grp.moduleCount >= 2, `Expected multiple modules for SALA EN L ${model}`);
  }

  // 3) FUTONES & SOFÁ CAMAS
  API.setInvSubCategory('FUTONES & SOFÁ CAMAS');
  const scGroups = API.getFilteredGroups();
  const city = scGroups.find(g => g.mo === 'CITY');
  assert.ok(city, 'Expected grouped SOFÁ CAMA CITY card');
  assert.equal(city.title, 'SOFÁ CAMA CITY');
  assert.ok(city.moduleCount >= 3, 'SOFÁ CAMA CITY should group Sofá Cama + Chaise Der + Chaise Izq');

  // 4) SOFAS & LOVESEATS (paired models -> SOFÁ Y LOVE SEAT <MODELO>)
  API.setInvSubCategory('SOFAS & LOVESEATS');
  const slGroups = API.getFilteredGroups();
  for (const model of ['AZURA', 'CASCADE', 'GEORGIA', 'GIORGIANO', 'LAVINI', 'MARENO', 'ORIA']) {
    const grp = slGroups.find(g => g.mo === model);
    assert.ok(grp, `Expected paired SOFÁ Y LOVE SEAT ${model}`);
    assert.equal(grp.title, `SOFÁ Y LOVE SEAT ${model}`);
    assert.equal(grp.moduleCount, 2, `Expected SOFÁ + LOVE SEAT modules for ${model}`);
  }
});

test('EXTERIOR mirrors Salas grouping by Type + Model + Modules + Variations', () => {
  API.setInvCategory('COMPLEMENTOS');
  API.setInvSubCategory('EXTERIOR');
  const extGroups = API.getFilteredGroups();

  const alteaSala = extGroups.find(g => g.mo === 'ALTEA' && g.typeKey === 'EXT_SALA_MODULAR');
  assert.ok(alteaSala, 'Expected SALA MODULAR EXTERIOR ALTEA');
  assert.equal(alteaSala.title, 'SALA MODULAR EXTERIOR ALTEA');
  assert.ok(alteaSala.moduleCount >= 2);

  const santhomasSala = extGroups.find(g => g.mo === 'SANTHOMAS' && g.typeKey === 'EXT_SALA_MODULAR');
  assert.ok(santhomasSala, 'Expected SALA MODULAR EXTERIOR SANTHOMAS');
  assert.equal(santhomasSala.title, 'SALA MODULAR EXTERIOR SANTHOMAS');
  assert.ok(santhomasSala.moduleCount >= 3);

  const luminaSala = extGroups.find(g => g.mo === 'LUMINA' && g.typeKey === 'EXT_SOFA_LOVESEAT');
  assert.ok(luminaSala, 'Expected SOFÁ Y LOVE SEAT EXTERIOR LUMINA');
  assert.equal(luminaSala.title, 'SOFÁ Y LOVE SEAT EXTERIOR LUMINA');
  assert.ok(luminaSala.moduleCount >= 2);

  const santaMonicaSala = extGroups.find(g => g.mo === 'SANTA MONICA' && g.typeKey === 'EXT_SALA');
  assert.ok(santaMonicaSala, 'Expected SALA EXTERIOR SANTA MONICA');
  assert.ok(santaMonicaSala.moduleCount >= 2);

  const nidoSala = extGroups.find(g => g.mo === 'NIDO' && g.typeKey === 'EXT_SALA');
  assert.ok(nidoSala, 'Expected SALA EXTERIOR NIDO');
  assert.equal(nidoSala.title, 'SALA EXTERIOR NIDO');
  assert.equal(nidoSala.moduleCount, 2);

  const recifeSala = extGroups.find(g => g.mo === 'RECIFE' && g.typeKey === 'EXT_SALA');
  assert.ok(recifeSala, 'Expected SALA EXTERIOR RECIFE');
  assert.ok(recifeSala.moduleCount >= 2);

  const palmBeachSala = extGroups.find(g => g.mo === 'PALM BEACH' && g.typeKey === 'EXT_SALA');
  assert.ok(palmBeachSala, 'SALA PALM BEACH must stay SALA EXTERIOR (not MESA DE CENTRO EXTERIOR)');

  const lustroCamastro = extGroups.find(g => g.mo === 'LUSTRO' && g.typeKey === 'EXT_CAMASTRO');
  assert.ok(lustroCamastro && lustroCamastro.items.length >= 2, 'CAMASTRO EXTERIOR LUSTRO should group its variations');
});

test('renderGroupVariantsStep renders full-width module headers and variations cleanly', () => {
  API.setInvCategory('SALAS');
  API.setInvSubCategory('SALAS MODULARES');
  const aspen = API.getFilteredGroups().find(g => g.mo === 'ASPEN');
  API.renderGroupVariantsStep(aspen);

  const html = API.getDocEl('detVariantsList').innerHTML;
  const crumb = API.getDocEl('detGroupCrumb').textContent;
  assert.match(crumb, /\d+ módulos · \d+ variaciones/);

  const headerTitles = [...html.matchAll(/class="inv-module-group-title">([^<]+)<\/span>/g)].map(m => m[1]);
  assert.ok(headerTitles.includes('ESQUINERO'), 'ASPEN modal should include ESQUINERO module section');
  assert.ok(headerTitles.includes('SILLÓN BRAZO DERECHO'), 'ASPEN modal should include SILLÓN BRAZO DERECHO section');
  assert.ok(headerTitles.includes('SILLÓN SIN BRAZOS'), 'ASPEN modal should include SILLÓN SIN BRAZOS section');
  assert.ok(headerTitles.includes('OTOMÁN'), 'ASPEN modal should include OTOMÁN section');

  // Verify exterior Sofá y Love Seat modal renders SOFÁ and LOVE SEAT sections too
  API.setInvCategory('COMPLEMENTOS');
  API.setInvSubCategory('EXTERIOR');
  const lumina = API.getFilteredGroups().find(g => g.mo === 'LUMINA' && g.typeKey === 'EXT_SOFA_LOVESEAT');
  API.renderGroupVariantsStep(lumina);
  const extHtml = API.getDocEl('detVariantsList').innerHTML;
  const extHeaders = [...extHtml.matchAll(/class="inv-module-group-title">([^<]+)<\/span>/g)].map(m => m[1]);
  assert.ok(extHeaders.includes('SOFÁ'), 'LUMINA exterior modal should include SOFÁ module section');
  assert.ok(extHeaders.includes('LOVE SEAT'), 'LUMINA exterior modal should include LOVE SEAT module section');
});

test('Category pill counts match visible card counts for grouped Salas and Exterior subcategories', () => {
  API.setInvCategory('SALAS');
  API.setInvSubCategory('ALL');
  const subBarHtml = API.getDocEl('invSubCategoryBar').innerHTML;
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

test('inventario-ui.css defines full-width .inv-module-group-header styles', () => {
  const css = fs.readFileSync('inventario-ui.css', 'utf8');
  assert.match(css, /#detVariantsList\s+\.inv-module-group-header\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /#detVariantsList\s+\.inv-module-group-title\s*\{/);
  assert.match(css, /#detVariantsList\s+\.inv-module-group-count\s*\{/);
});
