import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const FOTOS_DIR = path.join(REPO_ROOT, 'fotos');

const NO_TOCAR_RE = /^(index\.html|catalog-|admin|inventario-sw\.js|ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO\.txt)/;

const REMOVED_DUPLICATES = [
  'fotos/armmat-mod-unif-finish-1794460521297.webp',
  'fotos/armmat-mod-unif-finish-1794460540391.webp',
  'fotos/cvvsallexprol-ambiente-1794503522296.webp',
  'fotos/cvvsallexprol-view4-1794503575520.webp',
  'fotos/mobespcor45rm-hero.webp',
  'fotos/armmat-mod-unif-hero-1794585024390.webp',
  'fotos/cvvsallexprol-view1-1794503543625.webp',
  'fotos/atxlibmazenca-ambiente-1794541027429.webp',
  'fotos/armmat-mod-unif-view2-1794460694294.webp',
  'fotos/armmar-unif-3p2p-view4-1794491205472.webp',
  'fotos/atxbuflumbent-hero-1794615341051.webp',
  'fotos/armmar-unif-3p2p-view3-1794482155268.webp',
  'fotos/armmar-unif-3p2p-hero-1794501883302.webp',
  'fotos/armmar-unif-3p2p-view2-1794482052219.webp',
  'fotos/armmar-unif-3p2p-hero-1794482467910.webp'
];

const KEPT_CANONICALS = [
  'fotos/armmat-mod-unif-finish-1794460802679.webp',
  'fotos/cvvsallexprol-ambiente-1794503541210.webp',
  'fotos/mobespcor45rm-view1.webp',
  'fotos/armmat-mod-unif-hero-1794585042788.webp',
  'fotos/cvvsallexprol-view3-1794503553984.webp',
  'fotos/atxlibmazenca-ambiente-1794541051699.webp',
  'fotos/armmat-mod-unif-view3-1794460697820.webp',
  'fotos/armmar-unif-3p2p-view4-1794495363645.webp',
  'fotos/atxbuflumbent-hero-1794615427123.webp',
  'fotos/armmar-unif-3p2p-hero-1794504634653.webp',
  'fotos/armmar-unif-3p2p-hero-1794501924228.webp',
  'fotos/armmar-unif-3p2p-view3-1794482126133.webp',
  'fotos/armmar-unif-3p2p-view3-1794484435769.webp'
];

function walkProductionTextFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'fotos' || ent.name === 'node_modules' || ent.name === 'tests') {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkProductionTextFiles(full, out);
    } else if (/\.(html|js|css|json|gs|txt|md)$/i.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

function scanRepoWebpReferences() {
  const prodFiles = walkProductionTextFiles(REPO_ROOT);
  const refsByWebp = new Map();
  const webpRefRe = /fotos\/[A-Za-z0-9._-]+\.webp/g;

  for (const fp of prodFiles) {
    const rel = path.relative(REPO_ROOT, fp).replace(/\\/g, '/');
    const txt = fs.readFileSync(fp, 'utf8');
    const matches = txt.match(webpRefRe);
    if (!matches) continue;
    for (const m of new Set(matches)) {
      if (!refsByWebp.has(m)) refsByWebp.set(m, []);
      refsByWebp.get(m).push(rel);
    }
  }
  return refsByWebp;
}

test('Zero broken fotos/*.webp references across all repo files and all 377 NO TOCAR-referenced webp files exist', () => {
  const refsByWebp = scanRepoWebpReferences();
  const broken = [];
  let noTocarReferencedCount = 0;

  for (const [webpRel, referrers] of refsByWebp.entries()) {
    const abs = path.join(REPO_ROOT, webpRel);
    if (!fs.existsSync(abs)) {
      broken.push({ webpRel, referrers });
    }
    if (referrers.some((r) => NO_TOCAR_RE.test(r))) {
      noTocarReferencedCount++;
    }
  }

  assert.deepEqual(broken, [], `Broken fotos/*.webp references found: ${JSON.stringify(broken)}`);
  assert.equal(noTocarReferencedCount, 377, 'All 377 NO TOCAR-referenced .webp assets must remain intact');
});

test('Dynamic SHA-256 deduplication guard: zero unreferenced duplicate .webp files remain in fotos/', () => {
  const refsByWebp = scanRepoWebpReferences();
  const webpFiles = fs.readdirSync(FOTOS_DIR).filter((f) => f.endsWith('.webp')).sort();
  assert.ok(webpFiles.length >= 377, 'fotos/ must retain at least all 377 referenced assets');

  const byHash = new Map();
  for (const fname of webpFiles) {
    const rel = `fotos/${fname}`;
    const buf = fs.readFileSync(path.join(FOTOS_DIR, fname));
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(rel);
  }

  const unreferencedDuplicateViolations = [];
  for (const [hash, group] of byHash.entries()) {
    if (group.length < 2) continue;
    const unref = group.filter((rel) => !refsByWebp.has(rel));
    if (unref.length > 0) {
      unreferencedDuplicateViolations.push({ hash: hash.slice(0, 16), unref, group });
    }
  }

  assert.deepEqual(
    unreferencedDuplicateViolations,
    [],
    `Unreferenced exact-duplicate .webp files found: ${JSON.stringify(unreferencedDuplicateViolations)}`
  );
});

test('All 15 deduplicated unreferenced .webp files are removed and all 13 canonical .webp files exist with valid WEBP headers', () => {
  for (const removedRel of REMOVED_DUPLICATES) {
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, removedRel)),
      false,
      `Expected removed duplicate to be absent: ${removedRel}`
    );
  }

  for (const keptRel of KEPT_CANONICALS) {
    const abs = path.join(REPO_ROOT, keptRel);
    assert.equal(fs.existsSync(abs), true, `Expected canonical file to exist: ${keptRel}`);
    const header = fs.readFileSync(abs).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF', `Invalid RIFF header on ${keptRel}`);
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP', `Invalid WEBP signature on ${keptRel}`);
  }
});

test('Origin preconnect hints are configured in inventario.html, panel.html, and seguimiento-manual.html', () => {
  const invHtml = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
  assert.match(invHtml, /<link\s+rel="preconnect"\s+href="https:\/\/script\.google\.com"\s+crossorigin\s*>/i);
  assert.match(invHtml, /<link\s+rel="preconnect"\s+href="https:\/\/docs\.google\.com"\s+crossorigin\s*>/i);
  assert.match(invHtml, /<link\s+rel="preconnect"\s+href="https:\/\/lh3\.googleusercontent\.com"\s+crossorigin\s*>/i);

  const panelHtml = fs.readFileSync(path.join(REPO_ROOT, 'panel.html'), 'utf8');
  assert.match(panelHtml, /<link\s+rel="preconnect"\s+href="https:\/\/script\.google\.com"\s+crossorigin\s*>/i);
  assert.match(panelHtml, /<link\s+rel="preconnect"\s+href="https:\/\/docs\.google\.com"\s+crossorigin\s*>/i);

  const manualHtml = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-manual.html'), 'utf8');
  assert.match(manualHtml, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*>/i);
  assert.match(manualHtml, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin\s*>/i);
});

test('seguimiento-manual.html removes render-blocking pptxgen.bundle.js and lazy-loads it cleanly via ensurePptxGenLoaded()', async () => {
  const manualHtml = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-manual.html'), 'utf8');

  // 1) Zero synchronous <script src="...pptxgen..."> tags in HTML
  const staticScriptTags = manualHtml.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
  const blockingPptxTags = staticScriptTags.filter((tag) => /pptxgen/i.test(tag));
  assert.deepEqual(blockingPptxTags, [], 'seguimiento-manual.html must not load pptxgen.bundle.js synchronously');

  // Extract inline script body containing ensurePptxGenLoaded and exportToPPTX
  const inlineScripts = [...manualHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .filter((code) => code.includes('ensurePptxGenLoaded') && code.includes('exportToPPTX'));
  assert.equal(inlineScripts.length, 1, 'Expected inline script defining ensurePptxGenLoaded and exportToPPTX');
  const scriptSrc = inlineScripts[0];

  function createManualSandbox(initialPptxCtor) {
    const appendedScripts = [];
    const alerts = [];
    const btnPptx = { textContent: '', innerHTML: '', disabled: false };

    const head = {
      children: [],
      appendChild(node) {
        node.parentNode = head;
        head.children.push(node);
        appendedScripts.push(node);
        return node;
      },
      removeChild(node) {
        const idx = head.children.indexOf(node);
        if (idx !== -1) head.children.splice(idx, 1);
        node.parentNode = null;
        return node;
      }
    };

    const dummyEl = () => ({
      innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
      appendChild() {}
    });

    const elementsById = new Map([['btnPptx', btnPptx]]);
    const document = {
      head,
      body: dummyEl(),
      documentElement: dummyEl(),
      fullscreenElement: null,
      createElement(tag) {
        return { tagName: String(tag).toUpperCase(), src: '', async: false, crossOrigin: '', onload: null, onerror: null, parentNode: null };
      },
      getElementById(id) {
        if (!elementsById.has(id)) elementsById.set(id, dummyEl());
        return elementsById.get(id);
      },
      querySelectorAll: () => [],
      addEventListener() {}
    };

    const windowObj = {
      document,
      PptxGenJS: initialPptxCtor,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      addEventListener() {},
      print() {}
    };

    const activeTimers = new Set();
    const recordedTimeouts = [];
    const trackedSetTimeout = (fn, ms) => {
      recordedTimeouts.push(ms);
      const id = setTimeout(() => {
        activeTimers.delete(id);
        fn();
      }, ms);
      activeTimers.add(id);
      return id;
    };
    const trackedClearTimeout = (id) => {
      activeTimers.delete(id);
      clearTimeout(id);
    };
    const cleanupTimers = () => {
      for (const id of activeTimers) clearTimeout(id);
      activeTimers.clear();
    };

    const sandbox = {
      window: windowObj,
      document,
      localStorage: windowObj.localStorage,
      alert: (msg) => alerts.push(String(msg)),
      console,
      setTimeout: trackedSetTimeout,
      clearTimeout: trackedClearTimeout,
      Promise,
      Error
    };
    vm.createContext(sandbox);
    vm.runInContext(scriptSrc, sandbox);
    return { sandbox, windowObj, document, head, appendedScripts, alerts, btnPptx, activeTimers, recordedTimeouts, cleanupTimers };
  }

  // Case A: Already-loaded fast path
  {
    const FakeExistingCtor = function FakeExisting() {};
    const { windowObj, appendedScripts, cleanupTimers } = createManualSandbox(FakeExistingCtor);
    try {
      const resolved = await windowObj.ensurePptxGenLoaded();
      assert.equal(resolved, FakeExistingCtor);
      assert.equal(appendedScripts.length, 0, 'Fast path must not inject any <script> tag');
    } finally {
      cleanupTimers();
    }
  }

  // Case B: Concurrent calls deduplicate into a single script injection & verify attributes
  {
    const { windowObj, appendedScripts, cleanupTimers } = createManualSandbox(undefined);
    try {
      const p1 = windowObj.ensurePptxGenLoaded();
      const p2 = windowObj.ensurePptxGenLoaded();
      const p3 = windowObj.ensurePptxGenLoaded();

      assert.equal(p1, p2, 'Concurrent calls must share the exact in-flight Promise');
      assert.equal(p2, p3, 'Concurrent calls must share the exact in-flight Promise');
      assert.equal(appendedScripts.length, 1, 'Concurrent calls must append only one <script> tag');

      const injected = appendedScripts[0];
      assert.equal(injected.tagName, 'SCRIPT');
      assert.match(injected.src, /pptxgenjs@3\.12\.0\/dist\/pptxgen\.bundle\.js$/);
      assert.equal(injected.async, true);
      assert.equal(injected.crossOrigin, 'anonymous');

      const LoadedCtor = function LoadedPptxGenJS() {};
      windowObj.PptxGenJS = LoadedCtor;
      injected.onload();

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      assert.equal(r1, LoadedCtor);
      assert.equal(r2, LoadedCtor);
      assert.equal(r3, LoadedCtor);
    } finally {
      cleanupTimers();
    }
  }

  // Case C: Error recovery removes failed script, clears cached Promise, and succeeds on retry
  {
    const { windowObj, head, appendedScripts, cleanupTimers } = createManualSandbox(undefined);
    try {
      const firstAttempt = windowObj.ensurePptxGenLoaded();
      assert.equal(appendedScripts.length, 1);
      appendedScripts[0].onerror();

      await assert.rejects(firstAttempt, /PowerPoint/i);
      assert.equal(head.children.length, 0, 'Failed <script> must be removed from DOM');

      const retryAttempt = windowObj.ensurePptxGenLoaded();
      assert.equal(appendedScripts.length, 2, 'Retry after error must inject a fresh <script>');
      const RetryCtor = function RetryPptxGenJS() {};
      windowObj.PptxGenJS = RetryCtor;
      appendedScripts[1].onload();

      assert.equal(await retryAttempt, RetryCtor);
    } finally {
      cleanupTimers();
    }
  }

  // Case D: Timeout recovery rejects cleanly, removes script, and allows retry
  {
    const { windowObj, head, appendedScripts, cleanupTimers } = createManualSandbox(undefined);
    try {
      const timedOut = windowObj.ensurePptxGenLoaded(25);
      assert.equal(appendedScripts.length, 1);

      await assert.rejects(timedOut, /Tiempo de espera/i);
      assert.equal(head.children.length, 0, 'Timed-out <script> must be cleaned up');

      const retryAfterTimeout = windowObj.ensurePptxGenLoaded(500);
      assert.equal(appendedScripts.length, 2);
      const AfterTimeoutCtor = function AfterTimeoutPptx() {};
      windowObj.PptxGenJS = AfterTimeoutCtor;
      appendedScripts[1].onload();
      assert.equal(await retryAfterTimeout, AfterTimeoutCtor);
    } finally {
      cleanupTimers();
    }
  }

  // Case E: exportToPPTX() awaits ensurePptxGenLoaded() and handles both failure & success cleanly
  {
    const { sandbox, windowObj, appendedScripts, alerts, btnPptx, cleanupTimers } = createManualSandbox(undefined);
    try {
      const failRun = sandbox.exportToPPTX();
      assert.equal(btnPptx.disabled, true);
      assert.equal(appendedScripts.length, 1);
      appendedScripts[0].onerror();
      await failRun;
      assert.equal(alerts.length, 1, 'exportToPPTX must show user-friendly alert on load failure');
      assert.match(alerts[0], /Error al generar PPTX:/);
      assert.equal(btnPptx.disabled, false, 'exportToPPTX must re-enable button after load failure');

      // Now succeed on retry
      let wroteFileName = '';
      let slideCount = 0;
      function MockPptx() {
        this.ShapeType = { rect: 'rect' };
        this.addSlide = () => {
          slideCount++;
          return { addShape() {}, addText() {} };
        };
        this.writeFile = ({ fileName }) => {
          wroteFileName = fileName;
          return Promise.resolve();
        };
      }
      const okRun = sandbox.exportToPPTX();
      assert.equal(appendedScripts.length, 2);
      windowObj.PptxGenJS = MockPptx;
      appendedScripts[1].onload();
      await okRun;
      assert.equal(wroteFileName, 'Manual_Asesores_y_Gerentes_CREATA.pptx');
      assert.ok(slideCount > 0, 'exportToPPTX must generate slides');
      assert.match(btnPptx.textContent, /PowerPoint Descargado/);
    } finally {
      cleanupTimers();
    }
  }

  // Case F: onload without window.PptxGenJS rejects, removes script, and allows retry
  {
    const { windowObj, head, appendedScripts, cleanupTimers } = createManualSandbox(undefined);
    try {
      const missingGlobal = windowObj.ensurePptxGenLoaded();
      assert.equal(appendedScripts.length, 1);
      appendedScripts[0].onload();
      await assert.rejects(missingGlobal, /PptxGenJS/);
      assert.equal(head.children.length, 0, 'Script that did not expose PptxGenJS must be removed');

      const retry = windowObj.ensurePptxGenLoaded();
      assert.equal(appendedScripts.length, 2);
      const GoodCtor = function GoodPptx() {};
      windowObj.PptxGenJS = GoodCtor;
      appendedScripts[1].onload();
      assert.equal(await retry, GoodCtor);
    } finally {
      cleanupTimers();
    }
  }

  // Case G: Missing DOM hosts (head/body/documentElement all null) rejects without poisoning cache; retry succeeds once host returns
  {
    const { windowObj, document, head, appendedScripts, activeTimers, cleanupTimers } = createManualSandbox(undefined);
    try {
      const origBody = document.body;
      const origDocEl = document.documentElement;
      document.head = null;
      document.body = null;
      document.documentElement = null;

      const p1 = windowObj.ensurePptxGenLoaded();
      await assert.rejects(p1, /contenedor del documento/i);
      assert.equal(appendedScripts.length, 0, 'Missing host must not append any script');
      assert.equal(activeTimers.size, 0, 'Missing host must not leak any timer');

      // Restore host and retry — must NOT return stale cached rejection
      document.head = head;
      document.body = origBody;
      document.documentElement = origDocEl;

      const p2 = windowObj.ensurePptxGenLoaded();
      assert.notEqual(p1, p2, 'Retry after missing DOM host must create a fresh Promise');
      assert.equal(appendedScripts.length, 1, 'Retry after missing DOM host must inject <script>');

      const RecoveredCtor = function RecoveredAfterMissingHost() {};
      windowObj.PptxGenJS = RecoveredCtor;
      appendedScripts[0].onload();
      assert.equal(await p2, RecoveredCtor);
      assert.equal(activeTimers.size, 0);
    } finally {
      cleanupTimers();
    }
  }

  // Case H: Synchronous host.appendChild throw rejects cleanly, clears timer & cache, and allows immediate retry
  {
    const { windowObj, head, appendedScripts, activeTimers, cleanupTimers } = createManualSandbox(undefined);
    try {
      const realAppendChild = head.appendChild.bind(head);
      let shouldThrow = true;
      head.appendChild = (node) => {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error('Simulated CSP/DOM append failure');
        }
        return realAppendChild(node);
      };

      const p1 = windowObj.ensurePptxGenLoaded();
      // Even a synchronous retry before microtask flush must NOT receive the rejected p1
      const p2 = windowObj.ensurePptxGenLoaded();
      assert.notEqual(p1, p2, 'Synchronous appendChild throw must never poison _pptxGenLoadPromise');

      await assert.rejects(p1, /Simulated CSP\/DOM append failure/);
      assert.equal(appendedScripts.length, 1, 'Retry after sync appendChild throw must inject <script>');
      assert.equal(activeTimers.size, 1, 'Only the active retry timer should exist');

      const SyncThrowRetryCtor = function SyncThrowRetryPptx() {};
      windowObj.PptxGenJS = SyncThrowRetryCtor;
      appendedScripts[0].onload();
      assert.equal(await p2, SyncThrowRetryCtor);
      assert.equal(activeTimers.size, 0, 'No timers may leak after retry completes');
    } finally {
      cleanupTimers();
    }
  }

  // Case I: Synchronous script.onerror() invoked inside host.appendChild removes script, clears timer & cache, and allows retry
  {
    const { windowObj, head, appendedScripts, activeTimers, cleanupTimers } = createManualSandbox(undefined);
    try {
      const realAppendChild = head.appendChild.bind(head);
      let triggerSyncError = true;
      head.appendChild = (node) => {
        const res = realAppendChild(node);
        if (triggerSyncError) {
          triggerSyncError = false;
          node.onerror();
        }
        return res;
      };

      const p1 = windowObj.ensurePptxGenLoaded();
      assert.equal(head.children.length, 0, 'Synchronous onerror must immediately remove script from DOM');
      assert.equal(activeTimers.size, 0, 'Synchronous onerror must immediately clear timer');

      const p2 = windowObj.ensurePptxGenLoaded();
      assert.notEqual(p1, p2, 'Synchronous onerror must never poison _pptxGenLoadPromise');
      assert.equal(appendedScripts.length, 2, 'Retry after sync onerror must inject a second <script>');

      await assert.rejects(p1, /No se pudo descargar el generador de PowerPoint/i);

      const SyncErrRetryCtor = function SyncErrRetryPptx() {};
      windowObj.PptxGenJS = SyncErrRetryCtor;
      appendedScripts[1].onload();
      assert.equal(await p2, SyncErrRetryCtor);
      assert.equal(activeTimers.size, 0);
    } finally {
      cleanupTimers();
    }
  }

  // Case J: Non-finite timeoutMs (Infinity) falls back safely to default 15000ms
  {
    const { windowObj, appendedScripts, recordedTimeouts, activeTimers, cleanupTimers } = createManualSandbox(undefined);
    try {
      const p = windowObj.ensurePptxGenLoaded(Infinity);
      assert.equal(recordedTimeouts.length, 1);
      assert.equal(recordedTimeouts[0], 15000, 'timeoutMs = Infinity must fall back to default 15000ms');

      const FiniteCtor = function FinitePptx() {};
      windowObj.PptxGenJS = FiniteCtor;
      appendedScripts[0].onload();
      assert.equal(await p, FiniteCtor);
      assert.equal(activeTimers.size, 0);
    } finally {
      cleanupTimers();
    }
  }
});

test('All static and dynamic <img> tags across modifiable pages/apps declare dimensions, async decoding, and conflict-free loading/fetchpriority', () => {
  const targets = [
    'inventario.html',
    'inventario-app.js',
    'fotos-productos.html',
    'fotos-productos-app.js',
    'panel.html',
    'seguimiento-app.js',
    'historial-app.js',
    'seguimiento-manual.html'
  ];

  let totalImgs = 0;
  for (const rel of targets) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const tags = src.match(/<img\b[^>]*>/gi) || [];
    assert.ok(tags.length > 0, `Expected at least 1 <img> tag in ${rel}`);

    for (const tag of tags) {
      totalImgs++;
      const hasWidth = /\bwidth\s*=\s*"(?:\d+|'\s*\+\s*imgW)/i.test(tag);
      const hasHeight = /\bheight\s*=\s*"(?:\d+|'\s*\+\s*imgH)/i.test(tag);
      const hasDecodingAsync = /\bdecoding\s*=\s*"async"/i.test(tag);
      const hasLazy = /\bloading\s*=\s*"lazy"/i.test(tag);
      const hasFetchPriorityHigh = /\bfetchpriority\s*=\s*"high"/i.test(tag);
      const hasDynamicLoadingAttr = /\bloadingAttr\b/.test(tag);

      assert.ok(hasWidth && hasHeight, `Missing explicit width/height in ${rel}: ${tag.slice(0, 140)}`);
      assert.ok(hasDecodingAsync, `Missing decoding="async" in ${rel}: ${tag.slice(0, 140)}`);
      assert.ok(
        hasLazy || hasFetchPriorityHigh || hasDynamicLoadingAttr,
        `Missing loading="lazy" or fetchpriority="high" in ${rel}: ${tag.slice(0, 140)}`
      );
      assert.ok(
        !(hasLazy && hasFetchPriorityHigh),
        `Conflicting loading="lazy" and fetchpriority="high" on same <img> in ${rel}: ${tag.slice(0, 140)}`
      );
    }
  }

  assert.equal(totalImgs, 44, 'Expected all 44 <img> tags across modifiable files to be audited');

  // Verify specific above-the-fold logos & primary stages use fetchpriority="high" (never loading="lazy")
  const invHtml = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
  for (const id of ['headerLogoImg', 'detPhotoImg', 'authLogoImg']) {
    const m = invHtml.match(new RegExp(`<img\\b[^>]*id="${id}"[^>]*>`, 'i'));
    assert.ok(m, `Missing #${id} in inventario.html`);
    assert.match(m[0], /fetchpriority="high"/i, `#${id} must use fetchpriority="high"`);
    assert.doesNotMatch(m[0], /loading="lazy"/i, `#${id} must NOT use loading="lazy"`);
  }

  const panelHtml = fs.readFileSync(path.join(REPO_ROOT, 'panel.html'), 'utf8');
  const panelLogo = panelHtml.match(/<img\b[^>]*class="gate-logo"[^>]*>/i);
  assert.ok(panelLogo, 'Missing gate-logo in panel.html');
  assert.match(panelLogo[0], /fetchpriority="high"/i);
  assert.doesNotMatch(panelLogo[0], /loading="lazy"/i);

  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  for (const cls of ['gate-logo', 'header-logo']) {
    const m = fotosHtml.match(new RegExp(`<img\\b[^>]*class="${cls}"[^>]*>`, 'i'));
    assert.ok(m, `Missing .${cls} in fotos-productos.html`);
    assert.match(m[0], /fetchpriority="high"/i);
    assert.doesNotMatch(m[0], /loading="lazy"/i);
  }

  // Verify buildThumbHtml in inventario-app.js uses mutually exclusive eager/fetchpriority vs lazy
  const invJs = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
  assert.match(
    invJs,
    /const\s+loadingAttr\s*=\s*o\.eager\s*\?\s*'loading="eager" fetchpriority="high"'\s*:\s*'loading="lazy"'/,
    'buildThumbHtml must cleanly separate eager+fetchpriority="high" from loading="lazy"'
  );
  assert.match(
    invJs,
    /const\s+imgW\s*=\s*o\.compact\s*\?\s*80\s*:\s*400;/,
    'buildThumbHtml must compute explicit imgW'
  );
  assert.match(
    invJs,
    /const\s+imgH\s*=\s*o\.compact\s*\?\s*80\s*:\s*Math\.max\(100,\s*Math\.round\(400\s*\/\s*boxRatio\)\);/,
    'buildThumbHtml must compute explicit imgH matching boxRatio'
  );
});

test('Max-dimension-constrained <img> elements preserve auto box-sizing in CSS, HTML, and dynamic templates with balanced CSS braces', () => {
  function assertBalancedCssBraces(relPath, css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let depth = 0;
    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') {
        depth--;
        assert.ok(depth >= 0, `Unmatched closing brace in ${relPath} near offset ${i}`);
      }
    }
    assert.equal(depth, 0, `Unclosed CSS brace(s) in ${relPath} (final depth=${depth})`);
  }

  function extractCssRuleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm');
    const m = css.match(re);
    assert.ok(m, `Missing CSS rule block for selector: ${selector}`);
    return m[1];
  }

  // 1) fotos-productos-styles.css
  const fotosCss = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-styles.css'), 'utf8');
  assertBalancedCssBraces('fotos-productos-styles.css', fotosCss);
  for (const sel of ['.photo-stage-canvas img', '.inbox-thumb-box img', '.lightbox-backdrop img']) {
    const body = extractCssRuleBody(fotosCss, sel);
    assert.match(body, /\bwidth\s*:\s*auto\s*;/i, `${sel} must declare width: auto;`);
    assert.match(body, /\bheight\s*:\s*auto\s*;/i, `${sel} must declare height: auto;`);
  }
  const lightboxBody = extractCssRuleBody(fotosCss, '.lightbox-backdrop img');
  assert.match(
    lightboxBody,
    /\bmax-width\s*:\s*min\(\s*94vw\s*,\s*100%\s*\)\s*;/i,
    '.lightbox-backdrop img must clamp max-width: min(94vw, 100%) for split-screen safety'
  );

  // 2) inventario-ui.css
  const invCss = fs.readFileSync(path.join(REPO_ROOT, 'inventario-ui.css'), 'utf8');
  assertBalancedCssBraces('inventario-ui.css', invCss);
  for (const sel of ['.inv-visual-preview-img', '.inv-visual-lightbox-stage img']) {
    const body = extractCssRuleBody(invCss, sel);
    assert.match(body, /\bwidth\s*:\s*auto\s*;/i, `${sel} must declare width: auto;`);
    assert.match(body, /\bheight\s*:\s*auto\s*;/i, `${sel} must declare height: auto;`);
  }

  // 3) fotos-productos.html (#photoLightboxImg)
  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const photoLightboxImg = fotosHtml.match(/<img\b[^>]*id="photoLightboxImg"[^>]*>/i);
  assert.ok(photoLightboxImg, 'Missing #photoLightboxImg in fotos-productos.html');
  assert.match(photoLightboxImg[0], /style="[^"]*width\s*:\s*auto\s*;\s*height\s*:\s*auto\s*;[^"]*"/i);
  assert.match(photoLightboxImg[0], /\bfetchpriority="high"/i);
  assert.doesNotMatch(photoLightboxImg[0], /\bloading="lazy"/i);

  // 4) inventario.html (#visualPhotoPreviewImg & #visualPhotoLightboxImg)
  const invHtml = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
  const visualPreviewImg = invHtml.match(/<img\b[^>]*id="visualPhotoPreviewImg"[^>]*>/i);
  assert.ok(visualPreviewImg, 'Missing #visualPhotoPreviewImg in inventario.html');
  assert.match(visualPreviewImg[0], /class="[^"]*\binv-visual-preview-img\b[^"]*\bw-auto\b[^"]*"/i);
  assert.match(visualPreviewImg[0], /\bfetchpriority="high"/i);
  assert.doesNotMatch(visualPreviewImg[0], /\bloading="lazy"/i);

  const visualLightboxImg = invHtml.match(/<img\b[^>]*id="visualPhotoLightboxImg"[^>]*>/i);
  assert.ok(visualLightboxImg, 'Missing #visualPhotoLightboxImg in inventario.html');
  assert.match(visualLightboxImg[0], /class="[^"]*\bw-auto\b[^"]*\bh-auto\b[^"]*"/i);
  assert.match(visualLightboxImg[0], /\bfetchpriority="high"/i);
  assert.doesNotMatch(visualLightboxImg[0], /\bloading="lazy"/i);

  // 5) seguimiento-manual.html (slide preview <img>)
  const manualHtml = fs.readFileSync(path.join(REPO_ROOT, 'seguimiento-manual.html'), 'utf8');
  const manualImg = manualHtml.match(/<img\b[^>]*src="\$\{slide\.imgUrl\}"[^>]*>/i);
  assert.ok(manualImg, 'Missing slide preview <img> in seguimiento-manual.html');
  assert.match(manualImg[0], /class="[^"]*\bw-auto\b[^"]*\bmax-h-24\b[^"]*\bobject-contain\b[^"]*"/i);

  // 6) fotos-productos-app.js dynamic <img> tags (.photo-stage-canvas, .inbox-thumb-box, .visual-single-canvas !isSwatch)
  const fotosJs = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
  const stageAndInboxImgs = fotosJs.match(/<img\s+width="(?:360|160)"\s+height="(?:270|120)"[^>]*>/gi) || [];
  assert.equal(stageAndInboxImgs.length, 8, 'Expected 8 constrained dynamic <img> tags in fotos-productos-app.js');

  let plainAutoCount = 0;
  let visualTernaryCount = 0;
  for (const tag of stageAndInboxImgs) {
    if (tag.includes('isSwatch')) {
      visualTernaryCount++;
      assert.match(
        tag,
        /'width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;'/,
        `Visual stage !isSwatch branch must declare width:auto;height:auto: ${tag}`
      );
    } else {
      plainAutoCount++;
      assert.match(
        tag,
        /style="width:auto;height:auto;"/i,
        `Stage/inbox <img> must declare inline style="width:auto;height:auto;": ${tag}`
      );
    }
  }
  assert.equal(plainAutoCount, 6, 'Expected 3 .photo-stage-canvas + 3 .inbox-thumb-box <img> tags with style="width:auto;height:auto;"');
  assert.equal(visualTernaryCount, 2, 'Expected 2 .visual-single-canvas <img> tags with width:auto;height:auto on !isSwatch branch');
});
