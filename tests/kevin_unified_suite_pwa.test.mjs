import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function makeMockEl(id, tagName = 'DIV') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];
  const dataset = {};
  return {
    id,
    tagName,
    value: '',
    innerHTML: '',
    textContent: '',
    src: '',
    style: { setProperty() {}, removeProperty() {} },
    dataset,
    children,
    parentNode: null,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        if (typeof force === 'boolean') {
          if (force) classes.add(c);
          else classes.delete(c);
          return force;
        }
        if (classes.has(c)) {
          classes.delete(c);
          return false;
        }
        classes.add(c);
        return true;
      },
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : ''),
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of (listeners.get(ev.type) || []).slice()) fn(ev);
    },
    appendChild(ch) {
      ch.parentNode = this;
      children.push(ch);
      return ch;
    },
    removeChild(ch) {
      const idx = children.indexOf(ch);
      if (idx >= 0) children.splice(idx, 1);
      ch.parentNode = null;
      return ch;
    },
    focus() {},
    select() {}
  };
}

test('Panel Suite PWA: panel-manifest.json, panel-sw.js lifecycle & isolated scope, and panel.html/panel-styles.css', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'panel-manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, './panel.html');
  assert.equal(manifest.scope, './panel');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);
  const shortcutUrls = manifest.shortcuts.map((s) => s.url);
  assert.ok(shortcutUrls.includes('./inventario.html'));
  assert.ok(shortcutUrls.includes('./fotos-productos.html'));
  assert.ok(shortcutUrls.includes('./panel.html?app=prompts'));

  const panelHtml = fs.readFileSync(path.join(REPO_ROOT, 'panel.html'), 'utf8');
  assert.match(panelHtml, /rel="manifest"\s+href="\.\/panel-manifest\.json\?v=2"/);
  assert.match(panelHtml, /panel-styles\.css\?v=7/);
  assert.match(panelHtml, /panel-app\.js\?v=15/);
  assert.match(panelHtml, /id="btnSuiteAdd"/);
  assert.match(panelHtml, /id="btnSuiteOrientation"/);
  assert.match(panelHtml, /id="suiteAddMenu"/);
  assert.match(panelHtml, /id="suiteSlotTop"/);
  assert.match(panelHtml, /id="suiteSlotBottom"/);
  assert.match(panelHtml, /id="suiteSplitBar"/);
  assert.match(panelHtml, /id="btnInstallPanelApp"/);
  assert.match(panelHtml, /id="suiteGridContainer"/);
  assert.match(panelHtml, /id="panelInstallModal"/);
  assert.ok(!panelHtml.includes('./suite/'), 'Removed /suite/ link must not appear in panel.html');
  assert.ok(!panelHtml.includes('projectsGridContainer'), 'Extra Projects grid buttons must be removed');
  assert.ok(!panelHtml.includes('sheetsGridContainer'), 'Extra Sheets grid buttons must be removed');

  // Brace balance check on panel-styles.css
  const panelCss = fs.readFileSync(path.join(REPO_ROOT, 'panel-styles.css'), 'utf8');
  let depth = 0;
  for (const ch of panelCss) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Unbalanced closing brace in panel-styles.css');
  }
  assert.equal(depth, 0, 'Unbalanced braces in panel-styles.css');
  assert.match(panelCss, /\.suite-workspace\.is-split\.is-horizontal\s*\{[\s\S]*?flex-direction:\s*row/);

  // Execute panel-sw.js in VM
  const swSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-sw.js'), 'utf8');
  const listeners = {};
  const deletedKeys = [];
  const existingKeys = ['creata-panel-app-v0', 'creata-panel-app-v1', 'creata-panel-app-v2', 'creata-panel-app-v3', 'creata-panel-app-v4', 'creata-panel-app-v5', 'creata-panel-app-v6', 'creata-panel-app-v7', 'creata-fotos-app-v28', 'creata-inventario-v1'];
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
      location: { origin: 'https://ikerreyna3942-debug.github.io', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel-sw.js' },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (ev, fn) => { listeners[ev] = fn; }
    }
  };
  vm.runInNewContext(swSrc, swSandbox, { filename: 'panel-sw.js' });

  let activatePromise;
  listeners.activate({ waitUntil: (p) => { activatePromise = p; } });
  await activatePromise;
  assert.deepEqual(deletedKeys, ['creata-panel-app-v0', 'creata-panel-app-v1', 'creata-panel-app-v2', 'creata-panel-app-v3', 'creata-panel-app-v4', 'creata-panel-app-v5', 'creata-panel-app-v6']);

  const checkIntercept = (url, method = 'GET') => {
    let intercepted = false;
    listeners.fetch({
      request: { url, method, mode: 'cors' },
      respondWith: () => { intercepted = true; }
    });
    return intercepted;
  };
  assert.equal(checkIntercept('https://script.google.com/macros/s/ABC/exec', 'GET'), false);
  assert.equal(checkIntercept('https://buena-espero.onrender.com/', 'GET'), false);
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel-app.js?v=15', 'GET'), true);
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel.html', 'GET'), true);
});

test('Panel Suite runtime: Kevin-only 3-en-1 workspace (+ Agregar Top/Bottom/Left/Right, swap, close, live frames, Back-nav unwind)', () => {
  const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');
  const backNavSrc = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');

  const storage = new Map([
    ['creata_private_kevin_panel_v1', JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com', verifiedAt: Date.now() })]
  ]);
  const swRegistrations = [];
  const els = new Map();
  for (const id of [
    'hubGateBackdrop', 'hubMainShell', 'hubGateAlert', 'hubOwnerEmail', 'hubOwnerPassword',
    'btnSuiteAdd', 'suiteAddMenu', 'suiteAddBackdrop', 'suiteGridContainer', 'suiteActiveChips',
    'btnSuiteOrientation', 'btnSuiteSwap', 'suiteWorkspace', 'suiteSlotTop', 'suiteSlotBottom', 'suiteSplitBar',
    'suiteSplitTopName', 'suiteSplitBottomName', 'suiteSplitDots', 'suiteSplitPct',
    'btnInstallPanelApp', 'panelInstallModal', 'panelNativeInstallBanner', 'panelStandaloneBreakout', 'panelCopyFeedback'
  ]) {
    const el = makeMockEl(id);
    if (['panelInstallModal', 'panelNativeInstallBanner', 'panelCopyFeedback', 'suiteAddMenu', 'suiteAddBackdrop', 'suiteSlotBottom', 'suiteSplitBar', 'btnSuiteSwap', 'btnSuiteOrientation'].includes(id)) {
      el.classList.add('hidden');
    }
    els.set(id, el);
  }
  const body = makeMockEl('body', 'BODY');
  const head = makeMockEl('head', 'HEAD');
  const docListeners = new Map();
  const winListeners = new Map();

  const sandbox = {
    console, Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, Map, Set, URL, AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    navigator: {
      onLine: true,
      userAgent: 'Mozilla/5.0',
      serviceWorker: {
        register: (url, opts) => {
          swRegistrations.push({ url, opts });
          return Promise.resolve();
        }
      }
    },
    location: { protocol: 'https:', origin: 'https://ikerreyna3942-debug.github.io', pathname: '/MCP-REPOCITORIO/panel.html', search: '', hash: '' },
    history: { state: null, pushState() {}, replaceState() {}, back() {}, go() {} },
    document: {
      readyState: 'complete',
      body,
      head,
      documentElement: makeMockEl('html', 'HTML'),
      getElementById: (id) => els.get(id) || null,
      querySelectorAll: () => [],
      createElement: (t) => makeMockEl('', t),
      addEventListener: (ev, fn) => {
        if (!docListeners.has(ev)) docListeners.set(ev, []);
        docListeners.get(ev).push(fn);
      },
      removeEventListener: () => {}
    },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    open: () => {},
    matchMedia: () => ({ matches: false })
  };
  sandbox.window = sandbox;
  sandbox.parent = sandbox;
  sandbox.addEventListener = (ev, fn) => {
    if (!winListeners.has(ev)) winListeners.set(ev, []);
    winListeners.get(ev).push(fn);
  };
  sandbox.removeEventListener = () => {};

  const ctx = vm.createContext(sandbox);
  vm.runInContext(backNavSrc, ctx, { filename: 'creata-back-nav.js' });
  vm.runInContext(panelSrc, ctx, { filename: 'panel-app.js' });

  assert.equal(swRegistrations.length, 1);
  assert.equal(swRegistrations[0].url, './panel-sw.js');
  assert.equal(swRegistrations[0].opts.scope, './panel');

  // Default: Cotizador mounted full screen on top slot
  assert.equal(sandbox.getSuiteLayoutState().top, 'cotizador');
  assert.equal(sandbox.getSuiteLayoutState().bottom, '');
  assert.equal(els.get('suiteSlotTop').children.length, 1);
  assert.equal(els.get('suiteSlotTop').children[0].src, './inventario.html?embed=1');
  assert.equal(els.get('suiteSlotBottom').classList.contains('hidden'), true);
  assert.equal(els.get('suiteSplitBar').classList.contains('hidden'), true);

  // Open "+ Agregar" menu -> lists ONLY the 3 apps with Arriba / Abajo / Izquierda / Derecha buttons
  sandbox.toggleSuiteAddMenu(true);
  assert.equal(els.get('suiteAddMenu').classList.contains('hidden'), false);
  const addHtml = els.get('suiteGridContainer').innerHTML;
  assert.match(addHtml, /Cotizador/);
  assert.match(addHtml, /Carga de Fotos/);
  assert.match(addHtml, /Prompts IA/);
  assert.match(addHtml, /placeSuiteApp\('fotos', 'bottom'\)/);
  assert.match(addHtml, /placeSuiteApp\('fotos', 'right'\)/);
  assert.match(addHtml, /placeSuiteApp\('prompts', 'top'\)/);
  assert.match(addHtml, /placeSuiteApp\('prompts', 'left'\)/);

  // Add Carga de Fotos to bottom -> activates split screen
  sandbox.placeSuiteApp('fotos', 'bottom');
  assert.equal(els.get('suiteAddMenu').classList.contains('hidden'), true);
  assert.equal(sandbox.getSuiteLayoutState().top, 'cotizador');
  assert.equal(sandbox.getSuiteLayoutState().bottom, 'fotos');
  assert.equal(sandbox.getSuiteLayoutState().orientation, 'vertical');
  assert.equal(els.get('suiteWorkspace').classList.contains('is-split'), true);
  assert.equal(els.get('suiteSlotBottom').classList.contains('hidden'), false);
  assert.equal(els.get('suiteSlotBottom').children[0].src, './fotos-productos.html?embed=1');

  // Swap top & bottom preserves live iframe instances without recreating
  const cotFrame = els.get('suiteSlotTop').children[0];
  const fotFrame = els.get('suiteSlotBottom').children[0];
  sandbox.swapSuiteSlots();
  assert.equal(sandbox.getSuiteLayoutState().top, 'fotos');
  assert.equal(sandbox.getSuiteLayoutState().bottom, 'cotizador');
  assert.equal(els.get('suiteSlotTop').children[0], fotFrame);
  assert.equal(els.get('suiteSlotBottom').children[0], cotFrame);

  // Switch to side-by-side via placeSuiteApp('prompts', 'left') and swap left/right
  sandbox.placeSuiteApp('prompts', 'left');
  assert.equal(sandbox.getSuiteLayoutState().orientation, 'horizontal');
  assert.equal(sandbox.getSuiteLayoutState().top, 'prompts');
  assert.equal(sandbox.getSuiteLayoutState().bottom, 'cotizador');
  assert.equal(els.get('suiteWorkspace').classList.contains('is-horizontal'), true);
  assert.equal(els.get('suiteSlotTop').children[0].src, 'https://buena-espero.onrender.com/?embed=true&embed_options=dark_theme');

  // Close right slot -> Prompts takes full screen
  sandbox.removeSuiteSlot('right');
  assert.equal(sandbox.getSuiteLayoutState().bottom, '');
  assert.equal(els.get('suiteWorkspace').classList.contains('is-split'), false);
  assert.equal(els.get('suiteWorkspace').classList.contains('is-horizontal'), false);

  // Back action unwinds add_menu & install_modal cleanly
  sandbox.toggleSuiteAddMenu(true);
  const backAdd = sandbox.handlePanelBackAction({ source: 'manual' });
  assert.equal(backAdd.handled, true);
  assert.equal(backAdd.stepId, 'add_menu');
  assert.equal(els.get('suiteAddMenu').classList.contains('hidden'), true);

  sandbox.openPanelInstallModal();
  assert.equal(els.get('panelInstallModal').classList.contains('hidden'), false);
  const backRes = sandbox.handlePanelBackAction({ source: 'manual' });
  assert.equal(backRes.handled, true);
  assert.equal(backRes.stepId, 'install_modal');
  assert.equal(els.get('panelInstallModal').classList.contains('hidden'), true);

  sandbox.openPanelInstallModal();
  sandbox.lockHubPortal();
  assert.equal(els.get('panelInstallModal').classList.contains('hidden'), true);
});

test('Cotizador & Subir Fotos: Kevin-only FAB Prompts/Panel buttons and split-screen Fotos/Cotizador/Prompts target switchers', () => {
  const invHtml = fs.readFileSync(path.join(REPO_ROOT, 'inventario.html'), 'utf8');
  const invJs = fs.readFileSync(path.join(REPO_ROOT, 'inventario-app.js'), 'utf8');
  const fotosHtml = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos.html'), 'utf8');
  const fotosJs = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-app.js'), 'utf8');

  // Cotizador HTML + JS Kevin-only gating & split switcher
  assert.match(invHtml, /id="fabPromptsBtn"[^>]*class="inv-fab-item hidden"[^>]*openPromptsFromCotizador\(\)/);
  assert.match(invHtml, /id="fabPanelSuiteBtn"[^>]*class="inv-fab-item hidden"[^>]*openPanelFromCotizador\(\)/);
  assert.match(invHtml, /id="btnInvSplitTargetFotos"[^>]*setInvSplitTarget\('fotos'\)/);
  assert.match(invHtml, /id="btnInvSplitTargetPrompts"[^>]*setInvSplitTarget\('prompts'\)/);
  assert.match(invJs, /if \(fabPromptsBtn\) fabPromptsBtn\.classList\.toggle\('hidden', !canSeePromptsIa\);/);
  assert.match(invJs, /if \(fabPanelSuiteBtn\) fabPanelSuiteBtn\.classList\.toggle\('hidden', !canSeePanelSuite\);/);
  assert.match(invJs, /window\.setInvSplitTarget = function \(target\)\s*\{\s*if \(!isFotosAppOwner\(\)\)/);
  assert.match(invJs, /window\.openPromptsFromCotizador = function \(\)\s*\{\s*if \(!isEffectiveAdminSession\(\) \|\| !hasAdminPerm\('promptsIa'\)\) return;/);
  assert.match(invJs, /window\.openPanelFromCotizador = function \(\)\s*\{\s*if \(!isEffectiveAdminSession\(\) \|\| !hasAdminPerm\('panelSuite'\)\) return;/);
  assert.match(invJs, /https:\/\/buena-espero\.onrender\.com\//);
  assert.match(invJs, /\.\/panel\.html/);

  // Subir Fotos HTML + JS streamlined header & split switcher (Prompts routes to official Buena Espero Render)
  assert.match(fotosHtml, /id="btnSplitWithCotizador"/);
  assert.match(fotosHtml, /id="btnFotosSplitTargetCotizador"[^>]*setFotosSplitTarget\('cotizador'\)/);
  assert.match(fotosHtml, /id="btnFotosSplitTargetPrompts"[^>]*setFotosSplitTarget\('prompts'\)/);
  assert.match(fotosJs, /window\.setFotosSplitTarget = function \(target\)/);
  assert.match(fotosJs, /target === 'prompts' \? 'https:\/\/buena-espero\.onrender\.com\/\?embed=true(?:&embed_options=dark_theme)?' : '\.\/inventario\.html\?embed=1'/);
});

test('Split-screen responsive adaptation: modals stay inside split pane, header/grid adapt, resizer wraps, and dark thin chip scrollbars', () => {
  const invCss = fs.readFileSync(path.join(REPO_ROOT, 'inventario-ui.css'), 'utf8');
  const fotosCss = fs.readFileSync(path.join(REPO_ROOT, 'fotos-productos-styles.css'), 'utf8');

  // Cotizador split-screen modal containment (prevents product modal from being cut behind right dock)
  assert.match(invCss, /body\.inv-split-active:not\(\.inv-split-vertical\)\s+\.modal-backdrop:not\(#authModal\)[\s\S]*?width:\s*var\(--inv-split-pct,\s*50%\)\s*!important/);
  assert.match(invCss, /body\.inv-split-active\.inv-split-vertical\s+\.modal-backdrop:not\(#authModal\)[\s\S]*?height:\s*var\(--inv-split-pct,\s*50%\)\s*!important/);
  assert.match(invCss, /body\.inv-split-active:not\(\.inv-split-vertical\)\s+#invHeader\s+\.inv-top-row[\s\S]*?"search search"/);
  assert.match(invCss, /\.inv-split-resizer\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(invCss, /\.inv-split-presets\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(invCss, /\.inv-split-frame-wrap\s*\{[\s\S]*?min-height:\s*0/);

  // Fotos split-screen lightbox/modal containment, resizer wrap, and thin dark scrollbars
  assert.match(fotosCss, /body\.fotos-split-active:not\(\.fotos-split-vertical\)\s+\.lightbox-backdrop[\s\S]*?width:\s*var\(--fotos-split-pct,\s*50%\)/);
  assert.match(fotosCss, /body\.fotos-split-active\.fotos-split-vertical\s+\.lightbox-backdrop[\s\S]*?height:\s*var\(--fotos-split-pct,\s*50%\)/);
  assert.match(fotosCss, /\.fotos-split-resizer\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(fotosCss, /\.fotos-split-presets\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(fotosCss, /\.fotos-split-frame-wrap\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(fotosCss, /\.category-pills-scroll::-webkit-scrollbar\s*\{[\s\S]*?height:\s*4px/);
});
