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
    'AppsScript_Prompts_Odoo.gs',
    'creata-back-nav.js',
    'fotos-productos-app.js',
    'fotos-sw.js',
    'prompts-app.js',
    'prompts-sw.js',
    'panel-app.js',
    'panel-sw.js',
    'suite/sw.js'
  ];
  for (const rel of filesToCheck) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `File must exist: ${rel}`);
    assert.doesNotThrow(() => runNodeCheck(abs), `node --check failed on ${rel}`);
  }
});

test('PWA manifests parse as valid JSON with isolated scopes and valid PNG icon headers', () => {
  const promptsManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'prompts-manifest.json'), 'utf8'));
  const fotosManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'fotos-manifest.json'), 'utf8'));
  const panelManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'panel-manifest.json'), 'utf8'));
  const suiteManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'suite/manifest.json'), 'utf8'));

  assert.equal(promptsManifest.scope, './prompts');
  assert.equal(fotosManifest.scope, './fotos-productos');
  assert.equal(panelManifest.scope, './panel');
  assert.equal(suiteManifest.scope, './');
  assert.equal(suiteManifest.start_url, './?source=pwa');
  assert.equal(suiteManifest.display, 'standalone');

  const promptsAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
  const fotosAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');
  const panelAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');
  assert.match(promptsAppSrc, /register\(['"]\.\/prompts-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/prompts['"]\s*\}/);
  assert.match(fotosAppSrc, /register\(['"]\.\/fotos-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/fotos-productos['"]\s*\}/);
  assert.match(panelAppSrc, /register\(['"]\.\/panel-sw\.js['"],\s*\{\s*scope:\s*['"]\.\/panel['"]\s*\}/);
  assert.match(panelAppSrc, /register\(['"]\.\/sw\.js['"],\s*\{\s*scope:\s*['"]\.\/['"]\s*\}/);

  const promptsSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-sw.js'), 'utf8');
  const fotosSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'fotos-sw.js'), 'utf8');
  const panelSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-sw.js'), 'utf8');
  const suiteSwSrc = fs.readFileSync(path.join(REPO_ROOT, 'suite/sw.js'), 'utf8');
  assert.match(promptsSwSrc, /CACHE_PREFIX\s*\+\s*['"]v9['"]/);
  assert.match(promptsSwSrc, /creata-back-nav\.js\?v=1/);
  assert.match(promptsSwSrc, /prompts-styles\.css\?v=7/);
  assert.match(promptsSwSrc, /prompts-app\.js\?v=9/);
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]v16['"]/);
  assert.match(fotosSwSrc, /CACHE_PREFIX\s*\+\s*['"]img-v16['"]/);
  assert.match(panelSwSrc, /CACHE_PREFIX\s*\+\s*['"]v3['"]/);
  assert.match(panelSwSrc, /panel-styles\.css\?v=6/);
  assert.match(panelSwSrc, /panel-app\.js\?v=11/);
  assert.match(suiteSwSrc, /CACHE_PREFIX\s*\+\s*['"]v1['"]/);
  assert.match(suiteSwSrc, /\.\.\/panel-styles\.css\?v=6/);
  assert.match(suiteSwSrc, /\.\.\/panel-app\.js\?v=11/);

  const promptsHtmlSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts.html'), 'utf8');
  assert.match(promptsHtmlSrc, /prompts-manifest\.json\?v=3/);
  assert.match(promptsHtmlSrc, /prompts-styles\.css\?v=7/);
  assert.match(promptsHtmlSrc, /creata-back-nav\.js\?v=1/);
  assert.match(promptsHtmlSrc, /prompts-app\.js\?v=9/);
  assert.match(promptsHtmlSrc, /Configurar PIN/);

  const promptsCssSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-styles.css'), 'utf8');
  assert.match(promptsCssSrc, /@media\s*\(\s*max-width:\s*440px\s*\)/);

  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const iconRel of [
    'prompts-icon-192.png', 'prompts-icon-512.png', 'prompts-apple-icon.png',
    'inventario-icon-192.png', 'inventario-icon-512.png', 'inventario-apple-icon.png',
    'suite/icon-192.png', 'suite/icon-512.png', 'suite/apple-icon.png'
  ]) {
    const abs = path.join(REPO_ROOT, iconRel);
    assert.ok(fs.existsSync(abs), `Missing icon: ${iconRel}`);
    const header = fs.readFileSync(abs).subarray(0, 8);
    assert.deepEqual(header, pngMagic, `Invalid PNG header on ${iconRel}`);
  }
});

test('robots.txt disallows /prompts.html, /*.gs, and /AppsScript_Prompts_Odoo.gs', () => {
  const robots = fs.readFileSync(path.join(REPO_ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /^Disallow:\s*\/prompts\.html$/m);
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

test('Static cross-project isolation invariants hold across Project A, Project B, and Prompts frontend', () => {
  const projA = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Creata_Drive_Sheets.gs'), 'utf8');
  const projB = fs.readFileSync(path.join(REPO_ROOT, 'AppsScript_Prompts_Odoo.gs'), 'utf8');
  const promptsJs = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
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

  // 3. prompts-app.js never references SUBIR PREN or Control de Productos
  assert.ok(!promptsJs.includes('11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'), 'prompts-app.js must not reference SUBIR PREN ID');
  assert.ok(!/SUBIR PREN/i.test(promptsJs), 'prompts-app.js must not reference SUBIR PREN');
  assert.ok(!promptsJs.includes('1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8'), 'prompts-app.js must not reference Control de Productos');

  // 4. App #9 labels updated from SUBIR COTIZACION to SUBIR PREN and cache bumped to ?v=22
  assert.ok(!fotosHtml.includes('SUBIR COTIZACION'), 'fotos-productos.html should use SUBIR PREN label');
  assert.ok(!fotosJs.includes('SUBIR COTIZACION'), 'fotos-productos-app.js should use SUBIR PREN label');
  assert.match(fotosHtml, /fotos-productos-app\.js\?v=26/);
});

test('Prompts PWA (Items 12-14): blocks DOM XSS & javascript: URIs in renderProptGallery, prevents ?scriptUrl= silent overwrite & PIN exfiltration, and handles clipboard fallback', async () => {
  const vm = await import('node:vm');
  const promptsJsSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');

  function makeEl(id) {
    const classes = new Set();
    const listeners = {};
    return {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      src: '',
      style: {},
      disabled: false,
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          if (typeof force === 'boolean') {
            if (force) classes.add(c);
            else classes.delete(c);
          } else if (classes.has(c)) {
            classes.delete(c);
          } else {
            classes.add(c);
          }
        },
        contains: (c) => classes.has(c)
      },
      setAttribute: () => {},
      getAttribute: () => '',
      select: () => {},
      addEventListener: (ev, fn) => {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(fn);
      },
      _trigger: (ev) => (listeners[ev] || []).forEach((fn) => fn())
    };
  }

  const els = new Map();
  for (const id of [
    'promptsStatusPill', 'promptsStatusText', 'promptsLoadingOverlay', 'overlaySpinner',
    'overlayTitle', 'overlaySub', 'overlayTimer', 'overlayActions', 'promptsAppFrame',
    'btnInstallPromptsApp', 'nativeInstallBanner', 'promptsShell', 'floatingExpandBarBtn',
    'proptScriptUrlInput', 'proptOwnerEmailInput', 'proptPinInput', 'proptConnStatus',
    'proptFeedback', 'proptCountBadge', 'proptListCountLabel', 'proptGalleryGrid',
    'proptConfigBox', 'proptDrawer', 'proptDrawerBackdrop', 'proptHealthWarning',
    'proptSkuInput', 'proptSkuResult'
  ]) {
    els.set(id, makeEl(id));
  }

  const storage = new Map([
    ['creata_prompts_webapp_url_v1', 'https://script.google.com/macros/s/LEGIT_SAVED_ID/exec'],
    ['creata_prompts_pin_v1', 'MY_SECRET_PIN_777']
  ]);
  const fetchCalls = [];
  const replaceStateCalls = [];
  let execCopyResult = true;
  let execCopyCalled = false;

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Promise,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0',
      platform: 'Linux',
      maxTouchPoints: 0,
      serviceWorker: { register: () => Promise.resolve() }
    },
    history: {
      replaceState: (_s, _t, u) => replaceStateCalls.push(u)
    },
    location: {
      protocol: 'https:',
      pathname: '/MCP-REPOCITORIO/prompts.html',
      search: '?scriptUrl=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FATTACKER_GAS_999%2Fexec',
      hash: '',
      href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts.html?scriptUrl=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FATTACKER_GAS_999%2Fexec'
    },
    document: {
      readyState: 'complete',
      getElementById: (id) => els.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => makeEl('tmp_ta'),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      },
      execCommand: (cmd) => {
        if (cmd === 'copy') execCopyCalled = true;
        return execCopyResult;
      }
    },
    fetch: async (url, init) => {
      const parsedBody = init && init.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url, body: parsedBody });
      if (parsedBody && parsedBody.action === 'prompts_health') {
        return { text: async () => JSON.stringify({ ok: true, warnings: [] }) };
      }
      if (parsedBody && parsedBody.action === 'prompts_propt_list') {
        return {
          text: async () => JSON.stringify({
            ok: true,
            folderId: '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX',
            files: [
              // Adversarial XSS f.id -> MUST BE SKIPPED!
              { id: "abc'-alert(1)-'", name: 'xss.jpg', viewUrl: 'javascript:alert(1)', thumbUrl: 'javascript:alert(2)' },
              // Valid Drive ID with malicious javascript: viewUrl & thumbUrl -> MUST BE SANITIZED to https://drive/lh3!
              { id: 'ValidDriveId_12345', name: '<img src=x onerror=alert(9)>.jpg', viewUrl: 'javascript:alert(3)', thumbUrl: 'https://evil.example/pwn.jpg', sizeBytes: 2048 }
            ]
          })
        };
      }
      if (parsedBody && parsedBody.action === 'prompts_sku_lookup') {
        return {
          text: async () => JSON.stringify({
            ok: true,
            found: true,
            match: { sku: 'SKU-1', tipo_mueble: 'SILLON', medidas: '80 x 80 cm', nombre: 'LUMINA' }
          })
        };
      }
      return { text: async () => JSON.stringify({ ok: true }) };
    }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });

  vm.runInNewContext(promptsJsSrc, sandbox, { filename: 'prompts-app.js' });

  // Item 13: ?scriptUrl= MUST NOT overwrite localStorage, MUST strip from URL via history.replaceState,
  // MUST prefill input & clear PIN input!
  assert.equal(storage.get('creata_prompts_webapp_url_v1'), 'https://script.google.com/macros/s/LEGIT_SAVED_ID/exec');
  assert.equal(replaceStateCalls.length, 1);
  assert.equal(replaceStateCalls[0], '/MCP-REPOCITORIO/prompts.html');
  assert.equal(els.get('proptScriptUrlInput').value, 'https://script.google.com/macros/s/ATTACKER_GAS_999/exec');
  assert.equal(els.get('proptPinInput').value, '');

  // Opening drawer while pendingSuggestedScriptUrl is active MUST NOT send saved PIN to attacker URL!
  sandbox.window.toggleProptDrawer(true);
  assert.equal(fetchCalls.filter((c) => c.url.includes('ATTACKER_GAS_999')).length, 0);

  // Clicking save with changed URL and blank PIN MUST be rejected (requires re-entering PIN)
  await sandbox.window.saveProptScriptConfig();
  assert.equal(storage.get('creata_prompts_webapp_url_v1'), 'https://script.google.com/macros/s/LEGIT_SAVED_ID/exec');
  assert.equal(fetchCalls.filter((c) => c.url.includes('ATTACKER_GAS_999')).length, 0);

  // Now test Item 12 (XSS + javascript: URI sanitization) against the legit saved URL
  els.get('proptScriptUrlInput').value = 'https://script.google.com/macros/s/LEGIT_SAVED_ID/exec';
  els.get('proptPinInput').value = 'MY_SECRET_PIN_777';
  await sandbox.window.saveProptScriptConfig();

  const galleryHtml = els.get('proptGalleryGrid').innerHTML;
  assert.ok(!galleryHtml.includes("alert(1)"), 'Invalid XSS f.id must be filtered out');
  assert.ok(!galleryHtml.includes('javascript:'), 'javascript: URIs must NEVER appear in rendered gallery HTML');
  assert.ok(!galleryHtml.includes('evil.example'), 'Non-Drive external thumbUrl must be replaced with safe Drive URL');
  assert.ok(galleryHtml.includes('data-fb-src="https://drive.google.com/thumbnail?id=ValidDriveId_12345&amp;sz=w480"'));
  assert.ok(galleryHtml.includes("this.src=this.getAttribute('data-fb-src')||''"), 'onerror must read data-fb-src with zero dynamic JS interpolation');
  assert.ok(galleryHtml.includes('href="https://drive.google.com/file/d/ValidDriveId_12345/view?usp=sharing"'));

  // Item 14: copySkuLookupSummary() fallback with execCommand('copy') and honest error toast when copy fails
  els.get('proptSkuInput').value = 'SKU-1';
  await sandbox.window.lookupPromptsSku();
  await sandbox.window.copySkuLookupSummary();
  assert.equal(execCopyCalled, true);
  assert.match(els.get('proptFeedback').textContent, /copiados/i);

  execCopyResult = false;
  await sandbox.window.copySkuLookupSummary();
  assert.match(els.get('proptFeedback').textContent, /No se pudo copiar/i);
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

test('Prompts SW (Item 14 / M2C): prompts-sw.js v9 evicts v2..v8, preserves other app caches, and intercepts prompts-app.js?v=9 & creata-back-nav.js?v=1 while bypassing script.google.com and buena-espero.onrender.com', async () => {
  const vm = await import('node:vm');
  const swSrc = fs.readFileSync(path.join(REPO_ROOT, 'prompts-sw.js'), 'utf8');
  const listeners = {};
  const deletedKeys = [];
  const existingKeys = ['creata-prompts-app-v2', 'creata-prompts-app-v3', 'creata-prompts-app-v4', 'creata-prompts-app-v5', 'creata-prompts-app-v6', 'creata-prompts-app-v7', 'creata-prompts-app-v8', 'creata-prompts-app-v9', 'creata-fotos-app-v11', 'creata-panel-app-v1', 'creata-inventario-v1'];

  const swSandbox = {
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    Response: { error: () => ({ ok: false }) },
    Request: function (u, o) { return { url: u, ...(o || {}) }; },
    caches: {
      keys: async () => existingKeys.slice(),
      delete: async (k) => { deletedKeys.push(k); return true; },
      open: async () => ({ put: async () => {}, match: async () => null })
    },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    self: {
      location: { origin: 'https://ikerreyna3942-debug.github.io', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts-sw.js' },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (ev, fn) => { listeners[ev] = fn; }
    }
  };
  vm.runInNewContext(swSrc, swSandbox, { filename: 'prompts-sw.js' });

  // Activate evicts ONLY older creata-prompts-app-* caches
  let activatePromise;
  listeners.activate({ waitUntil: (p) => { activatePromise = p; } });
  await activatePromise;
  assert.deepEqual(deletedKeys, ['creata-prompts-app-v2', 'creata-prompts-app-v3', 'creata-prompts-app-v4', 'creata-prompts-app-v5', 'creata-prompts-app-v6', 'creata-prompts-app-v7', 'creata-prompts-app-v8']);

  // Fetch bypasses script.google.com, buena-espero.onrender.com, and POST requests; intercepts same-origin GET
  const checkIntercept = (url, method = 'GET') => {
    let intercepted = false;
    listeners.fetch({
      request: { url, method, mode: 'cors' },
      respondWith: () => { intercepted = true; }
    });
    return intercepted;
  };
  assert.equal(checkIntercept('https://script.google.com/macros/s/ABC/exec', 'GET'), false);
  assert.equal(checkIntercept('https://script.google.com/macros/s/ABC/exec', 'POST'), false);
  assert.equal(checkIntercept('https://buena-espero.onrender.com/', 'GET'), false);
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts-app.js?v=9', 'GET'), true);
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/creata-back-nav.js?v=1', 'GET'), true);
});

test('Prompts App: direct camera button (capture="environment"), TELAS<->TELA / MUEBLES<->MUEBLE sync, and URL/PIN preflight status', async () => {
  const vm = await import('node:vm');
  const promptsHtml = fs.readFileSync(path.join(REPO_ROOT, 'prompts.html'), 'utf8');
  const promptsJs = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');

  assert.match(promptsHtml, /id="proptCameraInput"[\s\S]*?capture="environment"/);
  assert.match(promptsHtml, /id="btnCameraSubirPropt"[\s\S]*?onclick="triggerProptUploadInput\('proptCameraInput'\)"/);
  assert.match(promptsHtml, /id="btnUploadSubirPropt"[\s\S]*?onclick="triggerProptUploadInput\('proptFileInput'\)"/);
  assert.match(promptsHtml, /id="proptDestSelect"[^>]*onchange="onProptDestChange\(\)"/);

  function makeEl(id, initialVal = '') {
    const classes = new Set();
    let clicked = 0;
    return {
      id,
      value: initialVal,
      textContent: '',
      innerHTML: '',
      disabled: false,
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          if (typeof force === 'boolean') {
            if (force) classes.add(c);
            else classes.delete(c);
          } else if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        },
        contains: (c) => classes.has(c)
      },
      click: () => { clicked++; },
      _getClicks: () => clicked,
      focus: () => {},
      setAttribute: () => {},
      getAttribute: () => '',
      addEventListener: () => {}
    };
  }

  const els = new Map([
    ['proptDestSelect', makeEl('proptDestSelect', 'MUEBLES')],
    ['proptTipoSelect', makeEl('proptTipoSelect', 'MUEBLE')],
    ['proptCameraInput', makeEl('proptCameraInput')],
    ['proptFileInput', makeEl('proptFileInput')],
    ['btnCameraSubirPropt', makeEl('btnCameraSubirPropt')],
    ['btnUploadSubirPropt', makeEl('btnUploadSubirPropt')],
    ['proptConfigBox', makeEl('proptConfigBox')],
    ['proptConnStatus', makeEl('proptConnStatus')],
    ['proptFeedback', makeEl('proptFeedback')],
    ['proptScriptUrlInput', makeEl('proptScriptUrlInput')],
    ['proptPinInput', makeEl('proptPinInput')],
    ['proptOwnerEmailInput', makeEl('proptOwnerEmailInput')],
    ['proptHealthWarning', makeEl('proptHealthWarning')],
    ['proptGalleryGrid', makeEl('proptGalleryGrid')],
    ['proptCountBadge', makeEl('proptCountBadge')],
    ['proptListCountLabel', makeEl('proptListCountLabel')]
  ]);
  els.get('proptConfigBox').classList.add('hidden');

  const storage = new Map();
  const sandbox = {
    console, Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    navigator: { onLine: true, userAgent: 'Mozilla/5.0', serviceWorker: { register: () => Promise.resolve() } },
    history: { replaceState: () => {} },
    location: { protocol: 'https:', pathname: '/MCP-REPOCITORIO/prompts.html', search: '', hash: '', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts.html' },
    document: {
      readyState: 'complete',
      getElementById: (id) => els.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    fetch: async () => ({ text: async () => JSON.stringify({ ok: true, files: [] }) })
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });

  vm.runInNewContext(promptsJs, sandbox, { filename: 'prompts-app.js' });

  // 1) TELAS -> TELA and MUEBLES -> MUEBLE automatic sync
  els.get('proptDestSelect').value = 'TELAS';
  sandbox.window.onProptDestChange();
  assert.equal(els.get('proptTipoSelect').value, 'TELA');

  els.get('proptDestSelect').value = 'MUEBLES';
  sandbox.window.onProptDestChange();
  assert.equal(els.get('proptTipoSelect').value, 'MUEBLE');

  // 2) Missing URL /exec blocks picker, opens config box, and sets clear feedback
  assert.equal(sandbox.window.triggerProptUploadInput('proptCameraInput'), false);
  assert.equal(els.get('proptCameraInput')._getClicks(), 0);
  assert.equal(els.get('proptConfigBox').classList.contains('hidden'), false);
  assert.match(els.get('proptFeedback').textContent, /URL \/exec/i);

  // 3) Valid URL but missing PROMPTS_PIN blocks picker and asks for PROMPTS_PIN
  storage.set('creata_prompts_webapp_url_v1', 'https://script.google.com/macros/s/VALID_DEPLOY_123/exec');
  els.get('proptConfigBox').classList.add('hidden');
  assert.equal(sandbox.window.triggerProptUploadInput('proptCameraInput'), false);
  assert.equal(els.get('proptCameraInput')._getClicks(), 0);
  assert.equal(els.get('proptConfigBox').classList.contains('hidden'), false);
  assert.match(els.get('proptFeedback').textContent, /PROMPTS_PIN/i);

  // 4) Both URL and PIN configured allows opening direct camera picker
  storage.set('creata_prompts_pin_v1', '1234');
  assert.equal(sandbox.window.triggerProptUploadInput('proptCameraInput'), true);
  assert.equal(els.get('proptCameraInput')._getClicks(), 1);
});

test('Prompts App: Fuentes de fotos (SM S Mueblería / Cotización / SUBIR PROPT) tabs call prompts_sources_list, render XSS-safe read-only cards, and explain an outdated Apps Script', async () => {
  const vm = await import('node:vm');
  const promptsHtml = fs.readFileSync(path.join(REPO_ROOT, 'prompts.html'), 'utf8');
  const promptsJs = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');

  for (const key of ['SM_MUEBLERIA', 'COTIZACION', 'SUBIR_PROPT']) {
    assert.match(promptsHtml, new RegExp('id="proptSrcTab_' + key + '"[^>]*onclick="selectPromptsSource\\(\'' + key + '\'\\)"'));
  }
  assert.match(promptsHtml, /id="proptSourcesGrid"/);
  assert.match(promptsHtml, /id="proptSourcesStatus"/);
  // Aislamiento Proyecto A/B: el frontend de Prompts jamás conoce IDs/rutas de Proyecto A
  assert.ok(!promptsJs.includes('11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'));
  assert.ok(!/SUBIR PREN/.test(promptsJs));

  function makeEl(id) {
    const classes = new Set();
    return {
      id, value: '', textContent: '', innerHTML: '',
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, f) => { if (f) classes.add(c); else classes.delete(c); },
        contains: (c) => classes.has(c)
      },
      click: () => {}, focus: () => {}, setAttribute: () => {}, getAttribute: () => '', addEventListener: () => {}
    };
  }
  const ids = ['proptSourcesGrid', 'proptSourcesStatus', 'proptConfigBox', 'proptConnStatus', 'proptFeedback',
    'proptScriptUrlInput', 'proptPinInput', 'proptOwnerEmailInput', 'proptSrcTab_SM_MUEBLERIA', 'proptSrcTab_COTIZACION', 'proptSrcTab_SUBIR_PROPT'];
  const els = new Map(ids.map((i) => [i, makeEl(i)]));
  const storage = new Map([
    ['creata_prompts_webapp_url_v1', 'https://script.google.com/macros/s/VALID_DEPLOY_123/exec'],
    ['creata_prompts_pin_v1', '1234']
  ]);
  const calls = [];
  let nextResponse = null;
  const sandbox = {
    console, Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    navigator: { onLine: true, userAgent: 'Mozilla/5.0', serviceWorker: { register: () => Promise.resolve() } },
    history: { replaceState: () => {} },
    location: { protocol: 'https:', pathname: '/MCP-REPOCITORIO/prompts.html', search: '', hash: '', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts.html' },
    document: { readyState: 'complete', getElementById: (id) => els.get(id) || null, querySelectorAll: () => [], addEventListener: () => {} },
    fetch: async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { text: async () => JSON.stringify(nextResponse) };
    }
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });
  vm.runInNewContext(promptsJs, sandbox, { filename: 'prompts-app.js' });

  // Clave inválida: no llama al servidor
  assert.equal(await sandbox.window.selectPromptsSource('SUBIR_PREN'), false);
  assert.equal(calls.length, 0);

  nextResponse = {
    ok: true, sourceKey: 'COTIZACION', folderId: 'src_cot', folderName: 'Cotizacipón', readOnly: true, count: 2, total: 2,
    files: [
      { id: 'abcDEF1234567890', name: '<img src=x onerror=alert(1)>.jpg', sizeBytes: 2048, thumbUrl: 'javascript:alert(1)', viewUrl: 'javascript:alert(2)', subfolder: 'Lote "A"' },
      { id: 'bad id!', name: 'ignorada.jpg' }
    ]
  };
  assert.equal(await sandbox.window.selectPromptsSource('cotizacion'), true);
  assert.equal(calls[0].action, 'prompts_sources_list');
  assert.equal(calls[0].sourceKey, 'COTIZACION');
  assert.equal(calls[0].pin, '1234');
  const html = els.get('proptSourcesGrid').innerHTML;
  assert.ok(!html.includes('<img src=x'), 'file names must be escaped');
  assert.ok(!/javascript:/i.test(html), 'unsafe URLs must be replaced');
  assert.ok(html.includes('https://drive.google.com/file/d/abcDEF1234567890/view'));
  assert.ok(!html.includes('ignorada.jpg'));
  assert.ok(!/propt-mini-btn is-danger/.test(html), 'sources are read-only (no delete button)');
  assert.match(els.get('proptSourcesStatus').textContent, /Cotizacipón: 2 fotos · solo lectura/);

  // Apps Script sin redesplegar => mensaje claro
  nextResponse = { ok: false, error: 'Acción no reconocida en AppsScript_Prompts_Odoo: "prompts_sources_list".' };
  assert.equal(await sandbox.window.selectPromptsSource('SM_MUEBLERIA'), false);
  assert.match(els.get('proptSourcesStatus').textContent, /actualizar AppsScript_Prompts_Odoo\.gs/);
  assert.equal(els.get('proptSourcesStatus').classList.contains('is-err'), true);
});
