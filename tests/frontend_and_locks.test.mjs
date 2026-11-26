import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function runNodeCheck(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  execFileSync(process.execPath, ['--check'], {
    input: src,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

test('Syntax check (node --check) passes for all Apps Script (.gs) and frontend JS/SW files', () => {
  const filesToCheck = [
    'AppsScript_Creata_Drive_Sheets.gs',
    'AppsScript_Parche_Fotos_V2.gs',
    'AppsScript_Prompts_Odoo.gs',
    'creata-back-nav.js',
    'fotos-productos-app.js',
    'fotos-sw.js',
    'panel-app.js',
    'panel-sw.js'
  ];
  for (const rel of filesToCheck) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `File must exist: ${rel}`);
    assert.doesNotThrow(() => runNodeCheck(abs), `node --check failed on ${rel}`);
  }
});

test('PWA manifests parse as valid JSON with isolated scopes and valid PNG icon headers', () => {
  const fotosManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'fotos-manifest.json'), 'utf8'));
  const panelManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'panel-manifest.json'), 'utf8'));

  assert.equal(fotosManifest.scope, './fotos-productos');
  assert.equal(panelManifest.scope, './panel');

  const fotosAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
  const panelAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');
  assert.match(fotosAppSrc, /register\(['"]\.\/fotos-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/fotos-productos['"](?:,\s*updateViaCache:\s*['"]none['"])?\s*\}/);
  assert.match(panelAppSrc, /register\(['"]\.\/panel-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/panel['"]\s*\}/);

  const fotosSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-sw.js'), 'utf8');
  const panelSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-sw.js'), 'utf8');
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]v32['"]/);
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]img-v32['"]/);
  assert.match(panelSwSrc, /CACHE_PREFIX\s*\+\s*['"]v7['"]/);
  assert.match(panelSwSrc, /panel-styles\.css\?v=7/);
  assert.match(panelSwSrc, /panel-app\.js\?v=15/);
  assert.match(panelSwSrc, /panel-manifest\.json\?v=2/);

  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const iconRel of [
    'inventario-icon-192.png', 'inventario-icon-512.png', 'inventario-apple-icon.png'
  ]) {
    const abs = path.join(REPO_ROOT, iconRel);
    assert.ok(fs.existsSync(abs), `Missing icon: ${iconRel}`);
    const header = fs.readFileSync(abs).subarray(0, 8);
    assert.deepEqual(header, pngMagic, `Invalid PNG header on ${iconRel}`);
  }
});

test('robots.txt disallows /*.gs, /AppsScript_Prompts_Odoo.gs, and internal apps without dead /suite/ or /prompts.html entries', () => {
  const robots = fs.readFileSync(path.join(REPO_ROOT, 'robots.txt'), 'utf8');
  assert.ok(!/^Disallow:\s*\/prompts\.html$/m.test(robots), 'Deleted /prompts.html entry removed from robots.txt (P3-10)');
  assert.ok(!/^Disallow:\s*\/suite\//m.test(robots), 'Deleted /suite/ entry removed from robots.txt (P3-10)');
  assert.match(robots, /^Disallow:\s*\/\*\.gs$/m);
  assert.match(robots, /^Disallow:\s*\/AppsScript_Prompts_Odoo\.gs$/m);
});

test('Zero locked files from ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO.txt are modified relative to origin/main', () => {
  const diffOut = execFileSync('git', ['diff', '--name-only', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  const changedFiles = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  const lockedMatchers = [
    /^index\.html$/,
    /^catalog-/,
    /^admin/,
    /^inventario-sw\.js$/,
    /^ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO\.txt$/
  ];

  const violations = changedFiles.filter((f) => lockedMatchers.some((re) => re.test(f)));
  assert.deepEqual(violations, [], `Locked files must NEVER be modified: ${violations.join(', ')}`);
});

test('Static cross-project isolation invariants hold across Project A, Project B, and active frontends', () => {
  const projA = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs'), 'utf8');
  const projB = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs'), 'utf8');
  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const fotosJs = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');

  // 1. SUBIR PROPT ID never passed to DriveApp.getFolderById in Project A
  assert.ok(
    !/DriveApp\.getFolderById\(\s*['"]1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX['"]\s*\)/.test(projA),
    'Project A must never call DriveApp.getFolderById on SUBIR PROPT'
  );
  // SUBIR PROPT only appears in Project A inside FORBIDDEN_PROJECT_B_FOLDER_IDS_
  const proptLinesA = projA.split(/\r?\n/).filter((l) => l.includes('1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX'));
  assert.equal(proptLinesA.length, 1);
  assert.match(proptLinesA[0], /'1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX':\s*'SUBIR PROPT'/);

  // 2. SUBIR PREN & Control de Productos never passed to DriveApp.getFolderById or SpreadsheetApp.openById in Project B
  assert.ok(
    !/DriveApp\.getFolderById\(\s*['"]11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p['"]\s*\)/.test(projB),
    'Project B must never open SUBIR PREN'
  );
  assert.ok(
    !/SpreadsheetApp\.openById\(\s*['"]1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8['"]\s*\)/.test(projB),
    'Project B must never open Control de Productos'
  );

  // 3. Deprecated prompts.html and suite/ are completely removed
  for (const deprecated of ['prompts.html', 'prompts-app.js', 'prompts-studio-v8.js', 'prompts-sw.js', 'prompts-manifest.json', 'suite/index.html', 'suite/sw.js', 'suite/manifest.json']) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, deprecated)), false, `Removed deprecated file must not exist: ${deprecated}`);
  }

  // 4. App #9 labels updated from SUBIR COTIZACION to SUBIR PREN and cache bumped to ?v=40
  assert.ok(!fotosHtml.includes('SUBIR COTIZACION'), 'fotos-productos.html should use SUBIR PREN label');
  assert.ok(!fotosJs.includes('SUBIR COTIZACION'), 'fotos-productos-app.js should use SUBIR PREN label');
  assert.match(fotosHtml, /fotos-productos-app\.js\?v=40/);
});

test('App #9 (Feature F8): Auto-acomodar por categoría button removed from fotos-productos.html while Guardar preserves automatic category folder resolution with zero dead DOM refs', () => {
  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const fotosJs = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');

  // 1) Separate Auto-acomodar button/control MUST NOT exist in fotos-productos.html
  assert.ok(!/Auto-acomodar por categor/i.test(fotosHtml), 'Auto-acomodar por categoría label must be removed from fotos-productos.html');
  assert.ok(!fotosHtml.includes('btnAutoAssignByCategory'), 'btnAutoAssignByCategory must be removed from fotos-productos.html');
  assert.ok(!fotosHtml.includes('autoAssignMatchedInboxByCategory'), 'fotos-productos.html must not wire onclick to autoAssignMatchedInboxByCategory');

  // 2) Zero dead DOM references to btnAutoAssignByCategory in fotos-productos-app.js
  assert.ok(!fotosJs.includes('btnAutoAssignByCategory'), 'fotos-productos-app.js must not reference removed btnAutoAssignByCategory');

  // 3) Guardar button remains intact and assignSelectedPhotoToProduct resolves category folder automatically
  assert.match(fotosHtml, /id="btnAssignPhotoNow"[\s\S]*?onclick="assignSelectedPhotoToProduct\(\)"[\s\S]*?>\s*Guardar\s*</);
  const assignFnMatch = fotosJs.match(/window\.assignSelectedPhotoToProduct\s*=\s*async function[\s\S]*?showAssignFeedback\(/);
  assert.ok(assignFnMatch, 'assignSelectedPhotoToProduct must exist');
  assert.match(assignFnMatch[0], /resolveCategoryDestFolderForProduct\(/, 'Guardar must resolve category folder automatically');
  assert.match(assignFnMatch[0], /DEST_FOLDER_BY_ID\.get\(/, 'Guardar must validate against DEST_FOLDER_BY_ID');
});

test('Panel Suite (Copy Photo Image Bridge): CREATA_PROMPTS_COPY_IMAGE writes binary image/png from official https://buena-espero.onrender.com and rejects untrusted origins', async () => {
  const vm = await import('node:vm');
  const panelJs = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');

  assert.ok(panelJs.includes("type !== 'CREATA_PROMPTS_COPY_IMAGE'"), 'panel-app.js must support CREATA_PROMPTS_COPY_IMAGE bridge');

  const msgListeners = [];
  const writtenClipboardItems = [];
  const replies = [];
  class FakeClipboardItem {
    constructor(map) { this.map = map; }
  }
  const sandbox = {
    console, Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, URL, URLSearchParams, AbortController, Uint8Array, Blob, atob,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    ClipboardItem: FakeClipboardItem,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {
      onLine: true, userAgent: 'Mozilla/5.0', platform: 'Linux', maxTouchPoints: 0,
      serviceWorker: { register: () => Promise.resolve() },
      clipboard: {
        write: async (items) => { writtenClipboardItems.push(items); },
        writeText: async () => { throw new Error('MUST NOT call writeText for photo copy'); }
      }
    },
    history: { replaceState: () => {}, pushState: () => {} },
    location: { protocol: 'https:', origin: 'https://ikerreyna3942-debug.github.io', pathname: '/MCP-REPOCITORIO/panel.html', search: '', hash: '', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel.html' },
    document: { readyState: 'complete', getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) })
  };
  sandbox.window = sandbox;
  sandbox.parent = sandbox;
  sandbox.window.addEventListener = (ev, fn) => { if (ev === 'message') msgListeners.push(fn); };
  sandbox.window.matchMedia = () => ({ matches: false });
  vm.runInNewContext(panelJs, sandbox, { filename: 'panel-app.js' });

  assert.ok(msgListeners.length >= 1, 'panel-app.js must register a window message listener');

  // 1) Untrusted origin must be ignored
  for (const fn of msgListeners) {
    await fn({
      origin: 'https://evil.example',
      data: { type: 'CREATA_PROMPTS_COPY_IMAGE', requestId: 'bad1', dataUri: 'data:image/png;base64,iVBORw0KGgo=' },
      source: { postMessage: (m, o) => replies.push({ m, o }) }
    });
  }
  assert.equal(writtenClipboardItems.length, 0);
  assert.equal(replies.length, 0);

  // 2) Trusted official Render origin writes binary image/png Blob and replies ok: true
  for (const fn of msgListeners) {
    await fn({
      origin: 'https://buena-espero.onrender.com',
      data: { type: 'CREATA_PROMPTS_COPY_IMAGE', requestId: 'ok1', dataUri: 'data:image/png;base64,iVBORw0KGgo=' },
      source: { postMessage: (m, o) => replies.push({ m, o }) }
    });
  }
  assert.equal(writtenClipboardItems.length, 1);
  assert.ok(writtenClipboardItems[0][0].map['image/png'] instanceof Blob, 'ClipboardItem must contain binary image/png Blob');
  assert.equal(writtenClipboardItems[0][0].map['image/png'].type, 'image/png');
  assert.deepEqual(JSON.parse(JSON.stringify(replies[0])), {
    m: { type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT', requestId: 'ok1', ok: true },
    o: 'https://buena-espero.onrender.com'
  });
});
