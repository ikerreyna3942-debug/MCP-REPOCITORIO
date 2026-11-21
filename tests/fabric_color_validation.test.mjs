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

function createAuditHarness(initialOverrides) {
  const src = fs.readFileSync('inventario-app.js', 'utf8');
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
  if (initialOverrides) {
    storage.set('creata_inv_product_overrides_v1', JSON.stringify(initialOverrides));
  }
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
  assert.ok(sb.__CREATA_INV_AUDIT__, 'inventario-app.js must expose window.__CREATA_INV_AUDIT__');
  return { api: sb.__CREATA_INV_AUDIT__, win: sb, storage };
}

test('Canonical fabric aliasing, grade prefix stripping, and vendor suffix cleaning work cleanly without breaking wood finishes', () => {
  const { api } = createAuditHarness();

  const aliasPairs = [
    ['COLLETE CREAM', 'COLETTE CREAM'],
    ['FLOFFLY PORCELAIN', 'FLOFFY PORCELAIN'],
    ['TITTUS PEARL', 'TITUS PEARL'],
    ['ELEMENT DARKGREY', 'ELEMENT DARK GREY'],
    ['HIGHLIVING NATURAL', 'HIGH LIVING NATURAL'],
    ['BRAXON SNOW', 'BRAXTON SNOW'],
    ['DUNDEE NATRUAL', 'DUNDEE NATURAL'],
    ['NILE BRIKE', 'NILE BRICK'],
    ['KIMMI PORCELAINE', 'KIMI PORCELAIN'],
    ['NUDE BRACH BLUE', 'NUDE BEACH BLUE'],
    ['COPENHAGEN LINEN', 'COPENHAGUE LINEN'],
    ['NUDE BEACH WITHE', 'NUDE BEACH WHITE'],
    ['FRANCE BAIGE', 'FRANCE BEIGE']
  ];
  for (const [input, expected] of aliasPairs) {
    assert.equal(api.canonicalizeFabricAliases(input), expected, `Expected alias ${input} -> ${expected}`);
  }

  assert.equal(api.stripFabricGradeAndVendorNoise('G2 MODENA TUSK'), 'MODENA TUSK');
  assert.equal(api.stripFabricGradeAndVendorNoise('G3 RUSTY NATURAL'), 'RUSTY NATURAL');
  assert.equal(api.stripFabricGradeAndVendorNoise('G4 GELLAR MARBLE'), 'GELLAR MARBLE');
  assert.equal(api.stripFabricGradeAndVendorNoise('GG FRANCE BEIGE'), 'FRANCE BEIGE');
  assert.equal(api.stripFabricGradeAndVendorNoise('TELA GLACIER'), 'GLACIER');
  assert.equal(api.stripFabricGradeAndVendorNoise('TELA ARTELL'), 'TELA ARTELL');
  assert.equal(api.stripFabricGradeAndVendorNoise('OSI IVORY ARMONY'), 'OSI IVORY');
  assert.equal(api.stripFabricGradeAndVendorNoise('BAKER LINEN ATX.'), 'BAKER LINEN');
  assert.equal(api.stripFabricGradeAndVendorNoise('VOIRON CREAM BARSA'), 'VOIRON CREAM');
  assert.equal(api.stripFabricGradeAndVendorNoise('PIEL YOI'), 'PIEL');
  assert.equal(api.stripFabricGradeAndVendorNoise('PAROTA SKANOR'), 'PAROTA SKANOR', 'Wood finish PAROTA SKANOR must be preserved');
  assert.equal(api.stripFabricGradeAndVendorNoise('TELA BEIGE - LEONI'), 'BEIGE');
});

test('sanitizeVisualOverrideUrl and override guards block blob:, data:, javascript:, and malformed URLs while preserving valid Drive swatches and canonical alias matching', async () => {
  const driveFloffy = 'https://drive.google.com/file/d/1jMn-Bg7xdtTOgpQ5_Z320J1cIDs9g4uy/view?usp=sharing';
  const driveRusty = 'https://drive.google.com/file/d/1OJQsRTIgUGs0216PYOxMkrCvb8Yr6kmT/view?usp=sharing';
  const driveSand07 = 'https://drive.google.com/file/d/1qM-cUmFQNJOCb5P3aByAwkqJ58Tf-BOs/view?usp=sharing';
  const drivePielYoi = 'https://drive.google.com/file/d/1Az2MR0E1QGjAKgBGfptQm0Ho926ljSwg/view?usp=sharing';
  const brokenBlob = 'blob:https://ikerreyna3942-debug.github.io/d7166422-864f-4179-b59f-5912ce09321b';
  const sampleDataImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

  const { api } = createAuditHarness({
    'VFAB:DISTRACTION NATURAL': { sku: 'VFAB:DISTRACTION NATURAL', status: 'VISIBLE', name: 'DISTRACTION NATURAL', category: 'FABRIC_SWATCH', note: brokenBlob },
    'VFAB:FLOFFLY PORCELAIN': { sku: 'VFAB:FLOFFLY PORCELAIN', status: 'VISIBLE', name: 'FLOFFLY PORCELAIN', category: 'FABRIC_SWATCH', note: driveFloffy },
    'VFAB:RUSTY NATURAL': { sku: 'VFAB:RUSTY NATURAL', status: 'VISIBLE', name: 'RUSTY NATURAL', category: 'FABRIC_SWATCH', note: driveRusty },
    'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL': { sku: 'VFAB:OCASIONAL SAND 07 ROSA MORADA TONO NATURAL', status: 'VISIBLE', name: 'OCASIONAL SAND 07 ROSA MORADA TONO NATURAL', category: 'FABRIC_SWATCH', note: driveSand07 },
    'VFAB:PIEL YOI': { sku: 'VFAB:PIEL YOI', status: 'VISIBLE', name: 'PIEL YOI', category: 'FABRIC_SWATCH', note: drivePielYoi },
    'VFAB:BAD DATA': { sku: 'VFAB:BAD DATA', status: 'VISIBLE', name: 'BAD DATA', category: 'FABRIC_SWATCH', note: sampleDataImg }
  });

  // Direct URL sanitizer contract
  assert.equal(api.sanitizeVisualOverrideUrl(brokenBlob), '');
  assert.equal(api.sanitizeVisualOverrideUrl(sampleDataImg), '');
  assert.equal(api.sanitizeVisualOverrideUrl(sampleDataImg, { allowDataImage: true }), sampleDataImg);
  assert.equal(api.sanitizeVisualOverrideUrl('javascript:alert(1)'), '');
  assert.equal(api.sanitizeVisualOverrideUrl('file:///etc/passwd'), '');
  assert.equal(api.sanitizeVisualOverrideUrl('https://localhost/foo.jpg'), '');
  assert.equal(api.sanitizeVisualOverrideUrl('not-a-url'), '');
  assert.equal(api.sanitizeVisualOverrideUrl(driveFloffy), driveFloffy);
  assert.equal(api.sanitizeVisualOverrideUrl('https://lh3.googleusercontent.com/d/abc123=w400'), 'https://lh3.googleusercontent.com/d/abc123=w400');

  // resolveVisualImgSrc rejects blob: unconditionally, permits temporary data:image preview
  assert.equal(api.resolveVisualImgSrc(brokenBlob, 400), '');
  assert.equal(api.resolveVisualImgSrc(sampleDataImg, 400), sampleDataImg);
  assert.equal(api.resolveVisualImgSrc(driveFloffy, 400), 'https://lh3.googleusercontent.com/d/1jMn-Bg7xdtTOgpQ5_Z320J1cIDs9g4uy=w400');

  // Broken Row 7 blob: returns '' and never crashes lookup
  assert.equal(api.getVisualOverridePhotoUrl('VFAB:DISTRACTION NATURAL'), '');
  assert.equal(api.getFabricSwatchPhotoUrl('DISTRACTION NATURAL'), '');
  assert.equal(api.getVisualOverridePhotoUrl('VFAB:BAD DATA'), '');

  // Row 11 typo VFAB:FLOFFLY PORCELAIN matches canonical FLOFFY PORCELAIN
  assert.equal(api.getFabricSwatchPhotoUrl('FLOFFY PORCELAIN'), driveFloffy);
  assert.equal(api.getFabricSwatchPhotoUrl('FLOFFLY PORCELAIN'), driveFloffy);

  // Row 24 VFAB:RUSTY NATURAL matches graded G3 RUSTY NATURAL
  assert.equal(api.getFabricSwatchPhotoUrl('G3 RUSTY NATURAL'), driveRusty);

  // Row 22 VFAB:OCASIONAL SAND 07... still matches cleaned SAND 07 item
  const sand07Hit = api.findMatchingFabricSwatchForItem({ s: 'YO1PZURSA07RM', n: 'SILLON OCASIONAL ZUR SAND 07 ROSA MORADA TONO NATURAL', tl: 'SAND 07', ct: 'ARENA', p: 'YOI' });
  assert.ok(sand07Hit && sand07Hit.url === driveSand07, 'Cleaned SAND 07 item must still match live VFAB:OCASIONAL SAND 07 swatch');

  // Row 25 VFAB:PIEL YOI matches YOI leather item but NEVER leaks onto unrelated generic PIEL SKUs
  const yoiPielHit = api.findMatchingFabricSwatchForItem({ s: 'YO1PZURPIERM', n: 'SILLON OCASIONAL ZUR PIEL ROSA MORADA TONO NATURAL', tl: 'PIEL', ct: 'NATURAL', p: 'YOI' });
  assert.ok(yoiPielHit && yoiPielHit.url === drivePielYoi, 'YO1PZURPIERM must match VFAB:PIEL YOI via provider scope');
  const otherPielHit = api.findMatchingFabricSwatchForItem({ s: 'OTHERPIEL1', n: 'SILLON GEN PIEL NEGRO', tl: 'PIEL', ct: 'NEGRO', p: 'OTRO' });
  assert.equal(otherPielHit, null, 'VFAB:PIEL YOI must NOT falsely match unrelated generic PIEL SKUs');

  // persistVisualPhotoOverride strictly rejects blob: and data:
  const blobSaveRes = await api.persistVisualPhotoOverride('VFAB:TEST', 'fabric', 'TEST', brokenBlob, 'SAVE');
  assert.equal(blobSaveRes.ok, false);
  const dataSaveRes = await api.persistVisualPhotoOverride('VFAB:TEST', 'fabric', 'TEST', sampleDataImg, 'SAVE');
  assert.equal(dataSaveRes.ok, false);
});

test('Real-catalog 4,562-item verification: fabric mismatches, COORD/VIVO preservation, pollution stripping, backfills, color contradictions, and safe translations', () => {
  const realItems = loadRealCatalogItems();
  const { api } = createAuditHarness();

  // Capture original exterior names/types/models BEFORE indexing to prove HOLD compliance
  const origSnapshots = new Map(realItems.map(it => [it.s, { n: it.n, tp: it.tp, mo: it.mo }]));

  // Run read-only pre-index audit (must NOT mutate raw items!)
  const sampleBefore = JSON.stringify(realItems.find(x => x.s === 'KUDSCAUGABRSN'));
  const preAudit = api.runInventoryFabricColorAudit(realItems);
  assert.equal(JSON.stringify(realItems.find(x => x.s === 'KUDSCAUGABRSN')), sampleBefore, 'runInventoryFabricColorAudit must be strictly read-only');
  assert.equal(preAudit.totalItems, 4562);
  assert.ok(preAudit.affectedCount > 400, 'Expected substantial real anomalies detected across 4,562-item catalog');
  assert.equal(preAudit.countsByCode.FABRIC_MISMATCH_WITH_NAME, 4);
  assert.equal(preAudit.countsByCode.COORD_PRIMARY_RESTORED, 9);

  // Now index full catalog (runs idempotent validation in Pre-pasada 1)
  api.setAllItems(realItems);
  api.indexItemsAndGroups();
  const bySku = new Map(api.getAllItems().map(x => [x.s, x]));

  // 1) Direct fabric mismatches
  assert.equal(bySku.get('KUDSCAUGABRSN').tl, 'BRAXTON SNOW');
  assert.equal(bySku.get('KUDSCAUGABRSN').ct, 'SNOW');
  assert.match(bySku.get('KUDSCAUGABRSN').vr, /BRAXTON SNOW/);
  assert.equal(bySku.get('DYF1PLENYBPPN').tl, 'BLOIS PINO');
  assert.equal(bySku.get('DYF1PLENYBPPN').ct, 'VERDE PINO');
  assert.equal(bySku.get('HAKSILLUMNASR').tl, 'SESAME RICE');
  assert.equal(bySku.get('HAKSILLUMNASR').ct, 'BLANCO ARROZ');
  assert.equal(bySku.get('MUNJM2006A').tl, '');
  assert.equal(bySku.get('MUNJM2006A').ct, 'CAFÉ');

  // 2) COORD & VIVO body-fabric preservation
  assert.equal(bySku.get('ARMVAL3PDZQKF').tl, 'KIRBY FLAX / COORD MOHAIR COFFE');
  assert.equal(bySku.get('ARMVAL3PDZQKF').ct, 'LINO');
  assert.equal(bySku.get('ARMVALCHIZQKF').tl, 'KIRBY FLAX / COORD MOHAIR COFFE');
  assert.equal(bySku.get('ARMVALCHIZQKF').ct, 'LINO');
  assert.equal(bySku.get('ARMVAL3PIZQKF').tl, 'KIRBY FLAX / COORD MOHAIR COFFE');
  assert.equal(bySku.get('ARMTOR1PMODSE').tl, 'SCAR ECRU / COORD WINDSOR ECRU');
  assert.equal(bySku.get('ARMTOR1PMODSE').ct, 'CRUDO');
  assert.equal(bySku.get('ARMDONCHDERR1').tl, 'ROBLE 01 / COORD RHONA ECRU');
  assert.equal(bySku.get('ARMKAS1PMODAB').tl, 'OSI IVORY / VIVO ALANIS BEIGE');
  assert.equal(bySku.get('ARMOXF3PDERB1').tl, 'BRONI 01 / VIVO NIZA FOSSIL');
  assert.equal(bySku.get('ARMOXF1PDERTC').tl, 'TITUS CHALK / VIVO NIZA FOSSIL');
  assert.equal(bySku.get('ARMOXF1PDERTC').ct, 'BLANCO TIZA');

  // 3) Non-textile & wood/lacquer pollution stripping (preserving genuine leather/vinyl hard-goods)
  for (const sk of ['LPCRE47RMCA', 'LPCEN49CHRMCA', 'LPLAT40RMCA', 'LPLAT46RMCA', 'LPLAT47RMCA']) {
    assert.equal(bySku.get(sk).tl, '', `${sk} non-textile tl must be cleared`);
    assert.equal(bySku.get(sk).ct, '', `${sk} non-textile ct must be cleared`);
    assert.match(bySku.get(sk).cm, /^CAF[EÉ]$/, `${sk} wood color cm must remain CAFE/CAFÉ`);
  }
  assert.equal(bySku.get('ATXBCOBOKGREL').tl, 'ELITE GREY');
  assert.equal(bySku.get('ATXBCOBOKGREL').ct, 'GRIS');
  assert.equal(bySku.get('ATXBCOBOKGREL').cm, 'LACA BELLOTA');
  assert.equal(bySku.get('ATX3PAURBLTA').tl, 'BAKER LINEN');
  assert.equal(bySku.get('ATX3PAURBLTA').ct, 'ARENA / LINO');
  assert.equal(bySku.get('ATX1PBALBOLB').tl, 'BAKER OLIVE');
  assert.equal(bySku.get('ATX1PBALBOLB').ct, 'VERDE OLIVO');
  assert.equal(bySku.get('ATX1PBALRNLB').tl, 'RUSTY NATURAL');
  assert.equal(bySku.get('ATX1PBALRNLB').ct, 'NATURAL');
  assert.equal(bySku.get('MOBCABMADKSRM').tl, '');
  assert.equal(bySku.get('MOBCABMADKSRM').cm, 'NUEZ');
  assert.equal(bySku.get('LPBAS10KS').tl, '');
  assert.equal(bySku.get('VASESETSI1450').tl, '');
  assert.equal(bySku.get('VASESETSI1450').ct, 'GRIS');
  assert.equal(bySku.get('PICMDCSOTSB').tl, '');
  assert.equal(bySku.get('PICMDCSOTSB').ct, '');
  assert.equal(bySku.get('HAKMESACEN002').tl, '');
  assert.equal(bySku.get('HAKMESACEN002').cm, 'CARDEADO BLANQUEADO');
  assert.equal(bySku.get('GOMCONBARIG').tl, '');
  assert.equal(bySku.get('SSPROBCQ').tl, '');
  assert.equal(bySku.get('SSPRORECQ').tl, '');
  assert.equal(bySku.get('YO1PZURSA07RM').tl, 'SAND 07');
  assert.equal(bySku.get('YO1PZURSA07RM').ct, 'ARENA');
  assert.equal(bySku.get('GAFEK447A').tl, '');
  assert.equal(bySku.get('GAFEK447A').ct, '');
  // Genuine secondary leather/vinyl/stone-accent preserved
  assert.equal(bySku.get('BLQTRL902').tl, 'PIEL NEGRO');
  assert.equal(bySku.get('ATXVALCHRECVIN').tl, 'RECUBRIMIENTO VINIL');
  assert.equal(bySku.get('HAKMDCMARPBNB').tl, 'NOSTALGIA BONE BROWN');

  // 4) Backfills, truncated-fabric refinement, grade/vendor normalization, and color contradictions
  assert.equal(bySku.get('ATXCAMAUQSRBB').tl, 'RHONA BONE');
  assert.equal(bySku.get('ATXCAMAUQSRBB').ct, 'HUESO');
  assert.equal(bySku.get('MRFSILOAHRHSA').tl, 'RHONA SAND');
  assert.equal(bySku.get('MRFSILOAHRHSA').ct, 'ARENA');
  assert.equal(bySku.get('CHASILTONRMBF').tl, 'BELOVED FLAX');
  assert.equal(bySku.get('SKSILVERFREOY').tl, 'FRESNO OYSTER');
  assert.equal(bySku.get('MONSILLIZQWOO').ct, 'GRIS PALOMA');
  assert.equal(bySku.get('MONSILSINBRWO').ct, 'GRIS PALOMA');
  assert.equal(bySku.get('HAKCAMLSTTCGI').tl, 'GLACIER ICE');
  assert.equal(bySku.get('HAKCAMLSTTCGI').ct, 'BLANCO HIELO');
  assert.equal(bySku.get('HAKCOLARUOART').tl, 'OATMEAL');
  assert.equal(bySku.get('HAKCOLARUOART').ct, 'AVENA / OATMEAL');
  assert.equal(bySku.get('ADSSILL612001').tl, '');
  assert.equal(bySku.get('ADSSILL612001').ct, 'CAFÉ');
  for (const topSku of ['ART0033379TOP', 'ART0033485TOP', 'ART0033404TOP', 'ART0033405TOP', 'ART0033406TOP']) {
    assert.equal(bySku.get(topSku).tl, 'ALGODÓN SATÍN');
    assert.equal(bySku.get(topSku).ct, 'TAUPE / TOPO');
  }
  assert.equal(bySku.get('FUNDECFABCOR4').tl, 'TEXTIL DE CAMA');
  assert.equal(bySku.get('FUNDECFABCOR4').ct, 'CORAL');
  assert.equal(bySku.get('TELARTOLICOR').tl, 'OLIVETO CORAL');
  assert.equal(bySku.get('TELARTOLICOR').ct, 'CORAL');
  assert.equal(bySku.get('TELARTOLIMAR').tl, 'OLIVETO MARINO');
  assert.equal(bySku.get('TELARTOLIMAR').ct, 'AZUL MARINO');
  assert.equal(bySku.get('GFFUNCHMQNUDB').tl, 'NUDE BEACH BLUE');
  assert.equal(bySku.get('GFFUNCHMQNUDB').ct, 'AZUL');
  assert.equal(bySku.get('GFFUNDMDMQNBG').tl, 'NUDE BEACH GREY');
  assert.equal(bySku.get('GFFUNDMDMQNBG').ct, 'GRIS');
  assert.equal(bySku.get('MONOTTOCOPLIN').tl, 'COPENHAGUE LINEN');
  assert.equal(bySku.get('MONOTTOCOPLIN').ct, 'LINO');
  assert.equal(bySku.get('GFFUNMDMQDISM').tl, 'DISTRACTION MIDNIGHT');
  assert.equal(bySku.get('GFFUNMDMQDISM').ct, 'AZUL MEDIANOCHE');
  assert.equal(bySku.get('SHACRA11').tl, '');
  assert.equal(bySku.get('SHACRA11').ct, 'CREMA / NEGRO');
  assert.equal(bySku.get('AMCOJAM').ct, 'AMARILLO / BLANCO');
  assert.equal(bySku.get('GC555007C').tl, '');
  assert.equal(bySku.get('GC555007C').ct, 'GRIS CLARO');
  assert.equal(bySku.get('GC555006').ct, 'GRIS CLARO');
  assert.equal(bySku.get('ADSGC8720043').ct, 'BEIGE CLARO');
  assert.equal(bySku.get('ATXCABVALOKS').tl, 'MODENA TUSK');
  assert.equal(bySku.get('BARTABSANRMKP').tl, 'KIMI PORCELAIN');
  assert.equal(bySku.get('GMM1PLEOBEI').tl, 'BEIGE');
  assert.equal(bySku.get('GMMSIL7411').tl, '');

  // 5) Safe translations, ERP-only fabrics, and false-positive traps preserved 100%
  assert.equal(bySku.get('FUNCHMQ').tl, 'OLIVETO VERDE');
  assert.equal(bySku.get('NESS1PEE').tl, 'RONDA SILVER');
  assert.equal(bySku.get('PIZFUTTZAEE').tl, 'BLEND TEAL');
  assert.equal(bySku.get('SEN1PEETZA').tl, 'BLEND TEAL');
  assert.equal(bySku.get('SKSILBRICOCR').tl, 'COLETTE CREAM');
  assert.equal(bySku.get('SKSILBRICOCR').ct, 'CREMA');
  assert.equal(bySku.get('CDRINJAL04').ct, 'PERLA / CRUDO');
  assert.equal(bySku.get('PICX9101GG').ct, 'TAUPE');
  // LULLABY OYSTER -> GRIS OSTRA / AVALANCHE BONE -> HUESO / REFLECT DOVE -> GRIS PALOMA
  const oysterItems = api.getAllItems().filter(x => /LULLABY OYSTER/i.test(x.tl));
  assert.ok(oysterItems.length >= 4 && oysterItems.every(x => /OSTRA|OSTI[ÓO]N|MARFIL/i.test(x.ct)));
  const boneItems = api.getAllItems().filter(x => /AVALANCHE BONE/i.test(x.tl));
  assert.ok(boneItems.length >= 2 && boneItems.every(x => /HUESO/i.test(x.ct)));
  const doveItems = api.getAllItems().filter(x => /REFLECT DOVE/i.test(x.tl));
  assert.ok(doveItems.length >= 5 && doveItems.every(x => /PALOMA|GRIS/i.test(x.ct)));
  // ECAENR* roller blinds (MEC SKY mechanism) keep BLANCO
  const mecSkyBlinds = api.getAllItems().filter(x => /MEC\s+SKY/i.test(x.n) && /WHITE/i.test(x.n));
  assert.ok(mecSkyBlinds.length > 0 && mecSkyBlinds.every(x => /BLANC/i.test(x.ct)), 'MEC SKY mechanism must never overwrite WHITE/BLANCO');

  // 6) Strict Idempotency across ALL 4,562 items
  const postAudit = api.runInventoryFabricColorAudit(api.getAllItems());
  assert.equal(postAudit.affectedCount, 0, 'Running audit a second time after indexing MUST report 0 changes (strict idempotency)');

  // 7) ACTIVE HOLD Invariant: Req 2A NEVER mutates it.n, it.tp, or it.mo
  for (const it of api.getAllItems()) {
    const orig = origSnapshots.get(it.s);
    if (!orig) continue;
    assert.equal(it.n, orig.n, `Req 2A must never mutate it.n (${it.s})`);
    assert.equal(it.tp, orig.tp, `Req 2A must never mutate it.tp (${it.s})`);
    if (orig.mo) assert.equal(it.mo, orig.mo, `Req 2A must never mutate populated it.mo (${it.s})`);
  }
});

test('validateAndNormalizeFabricColorAgainstName default mode is pure and normalizeInventoryItemLive applies validation automatically', () => {
  const { api } = createAuditHarness();
  const input = {
    s: 'SYN-TEST-1',
    tp: 'SILLON',
    mo: 'DEMO',
    n: 'SILLON DEMO G3 FLOFFLY PORCELAIN',
    vr: 'G3 FLOFFLY PORCELAIN',
    tl: 'G3 FLOFFLY PORCELAIN ARMONY',
    ct: 'LACA BELLOTA',
    md: 'ENCINO',
    cm: ''
  };
  const copyBefore = JSON.stringify(input);
  const res = api.validateAndNormalizeFabricColorAgainstName(input);
  assert.equal(JSON.stringify(input), copyBefore, 'Default call (mutate !== true) must NOT mutate caller input');
  assert.equal(res.item.tl, 'FLOFFY PORCELAIN');
  assert.equal(res.item.ct, 'BLANCO PORCELANA');
  assert.equal(res.item.cm, 'LACA BELLOTA');
  assert.equal(res.report.changed, true);

  // Second pass on res.item must be strictly idempotent
  const res2 = api.validateAndNormalizeFabricColorAgainstName(res.item);
  assert.equal(res2.report.changed, false);
  assert.deepEqual([...res2.report.issues], []);

  // normalizeInventoryItemLive wires validator automatically for live GViz/ERP items
  const liveIt = api.normalizeInventoryItemLive({
    s: 'SYN-LIVE-1',
    tp: 'SILLON',
    mo: 'DEMO',
    n: 'SILLON DEMO BRAXTON SNOW',
    tl: 'BRAXTON OAT',
    ct: 'SNOW',
    vr: 'BRAXTON OAT'
  });
  assert.equal(liveIt.tl, 'BRAXTON SNOW');
  assert.match(liveIt.vr, /BRAXTON SNOW/);
});
