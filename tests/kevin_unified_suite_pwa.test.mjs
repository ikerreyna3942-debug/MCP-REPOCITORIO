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
  assert.ok(shortcutUrls.includes('./prompts.html'));

  const panelHtml = fs.readFileSync(path.join(REPO_ROOT, 'panel.html'), 'utf8');
  assert.match(panelHtml, /rel="manifest"\s+href="\.\/panel-manifest\.json\?v=1"/);
  assert.match(panelHtml, /panel-styles\.css\?v=4/);
  assert.match(panelHtml, /panel-app\.js\?v=9/);
  assert.match(panelHtml, /id="btnInstallPanelApp"/);
  assert.match(panelHtml, /id="suiteGridContainer"/);
  assert.match(panelHtml, /id="panelInstallModal"/);

  // Brace balance check on panel-styles.css
  const panelCss = fs.readFileSync(path.join(REPO_ROOT, 'panel-styles.css'), 'utf8');
  let depth = 0;
  for (const ch of panelCss) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Unbalanced closing brace in panel-styles.css');
  }
  assert.equal(depth, 0, 'Unbalanced braces in panel-styles.css');

  // Execute panel-sw.js in VM
  const swSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-sw.js'), 'utf8');
  const listeners = {};
  const deletedKeys = [];
  const existingKeys = ['creata-panel-app-v0', 'creata-panel-app-v1', 'creata-prompts-app-v7', 'creata-fotos-app-v11', 'creata-inventario-v1'];
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
  assert.deepEqual(deletedKeys, ['creata-panel-app-v0']);

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
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel-app.js?v=9', 'GET'), true);
  assert.equal(checkIntercept('https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel.html', 'GET'), true);
});

test('Panel Suite runtime: renders 3-en-1 Suite cards, registers ./panel-sw.js with scope ./panel, and unwinds install_modal cleanly', () => {
  const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'panel-app.js'), 'utf8');
  const backNavSrc = fs.readFileSync(path.join(REPO_ROOT, 'creata-back-nav.js'), 'utf8');

  const storage = new Map([
    ['creata_private_kevin_panel_v1', JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com', verifiedAt: Date.now() })]
  ]);
  const swRegistrations = [];
  const els = new Map();
  for (const id of [
    'hubGateBackdrop', 'hubMainShell', 'hubGateAlert', 'hubOwnerEmail', 'hubOwnerPassword',
    'suiteGridContainer', 'projectsGridContainer', 'sheetsGridContainer',
    'btnInstallPanelApp', 'panelInstallModal', 'panelNativeInstallBanner', 'panelCopyFeedback'
  ]) {
    const el = makeMockEl(id);
    if (id === 'panelInstallModal' || id === 'panelNativeInstallBanner' || id === 'panelCopyFeedback') {
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

  const suiteHtml = els.get('suiteGridContainer').innerHTML;
  assert.match(suiteHtml, /href="\.\/inventario\.html"/);
  assert.match(suiteHtml, /href="\.\/fotos-productos\.html"/);
  assert.match(suiteHtml, /href="\.\/prompts\.html"/);

  // Open & close install modal via Back action and lockHubPortal
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

test('Prompts IA: Cotizador and Fotos switcher links are strictly Kevin-only and hidden for advisors/guests/iframe embed', () => {
  const promptsHtml = fs.readFileSync(path.join(REPO_ROOT, 'prompts.html'), 'utf8');
  assert.match(promptsHtml, /id="promptsKevinCotizadorLink"[^>]*class="tb-btn hidden"[^>]*href="\.\/inventario\.html"/);
  assert.match(promptsHtml, /id="promptsKevinFotosLink"[^>]*class="tb-btn hidden"[^>]*href="\.\/fotos-productos\.html"/);

  const promptsJs = fs.readFileSync(path.join(REPO_ROOT, 'prompts-app.js'), 'utf8');
  function runPromptsWithSession({ storageEntries = [], sessionEntries = [], embedded = false }) {
    const storage = new Map(storageEntries);
    const session = new Map(sessionEntries);
    const els = new Map();
    for (const id of [
      'promptsStatusPill', 'promptsStatusText', 'promptsLoadingOverlay', 'overlaySpinner',
      'overlayTitle', 'overlaySub', 'overlayTimer', 'overlayActions', 'promptsAppFrame',
      'btnInstallPromptsApp', 'nativeInstallBanner', 'promptsShell', 'floatingExpandBarBtn',
      'proptScriptUrlInput', 'proptOwnerEmailInput', 'proptPinInput', 'proptConnStatus',
      'proptFeedback', 'proptCountBadge', 'proptListCountLabel', 'proptGalleryGrid',
      'proptConfigBox', 'proptDrawer', 'proptDrawerBackdrop', 'proptHealthWarning',
      'proptSkuInput', 'proptSkuResult', 'promptsKevinCotizadorLink', 'promptsKevinFotosLink'
    ]) {
      const el = makeMockEl(id);
      if (id === 'promptsKevinCotizadorLink' || id === 'promptsKevinFotosLink') el.classList.add('hidden');
      els.set(id, el);
    }
    const sandbox = {
      console, Date, Math, JSON, RegExp, Array, Object, String, Number, Boolean, Error, Promise, URL, URLSearchParams, AbortController,
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
        getItem: (k) => (session.has(k) ? session.get(k) : null),
        setItem: (k, v) => session.set(k, String(v)),
        removeItem: (k) => session.delete(k)
      },
      navigator: { onLine: true, userAgent: 'Mozilla/5.0', serviceWorker: { register: () => Promise.resolve() } },
      history: { replaceState() {} },
      location: { protocol: 'https:', pathname: '/MCP-REPOCITORIO/prompts.html', search: '', hash: '', href: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/prompts.html' },
      document: {
        readyState: 'complete',
        getElementById: (id) => els.get(id) || null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => makeMockEl('tmp'),
        body: makeMockEl('body', 'BODY')
      },
      fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    sandbox.window = sandbox;
    sandbox.parent = embedded ? {} : sandbox;
    vm.runInNewContext(promptsJs, vm.createContext(sandbox), { filename: 'prompts-app.js' });
    return {
      cotHidden: els.get('promptsKevinCotizadorLink').classList.contains('hidden'),
      fotosHidden: els.get('promptsKevinFotosLink').classList.contains('hidden')
    };
  }

  // 1) No session -> hidden
  assert.deepEqual(runPromptsWithSession({}), { cotHidden: true, fotosHidden: true });

  // 2) Regular advisor session -> hidden
  assert.deepEqual(
    runPromptsWithSession({
      storageEntries: [['creata_inv_advisor_session_v1', JSON.stringify({ correo: 'asesor@grupoanipa.com', nombre: 'Asesor' })]]
    }),
    { cotHidden: true, fotosHidden: true }
  );

  // 3) Kevin owner session -> visible!
  assert.deepEqual(
    runPromptsWithSession({
      storageEntries: [['creata_private_kevin_panel_v1', JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com', nombre: 'Kevin Reyna' })]]
    }),
    { cotHidden: false, fotosHidden: false }
  );

  // 4) Kevin advisor preview mode -> hidden!
  assert.deepEqual(
    runPromptsWithSession({
      storageEntries: [['creata_inv_advisor_session_v1', JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com' })]],
      sessionEntries: [['creata_inv_kevin_advisor_preview_v1', '1']]
    }),
    { cotHidden: true, fotosHidden: true }
  );

  // 5) Kevin inside split iframe -> hidden (avoids redundant chrome in split-screen)
  assert.deepEqual(
    runPromptsWithSession({
      storageEntries: [['creata_private_kevin_panel_v1', JSON.stringify({ correo: 'kevin.reyna@grupoanipa.com' })]],
      embedded: true
    }),
    { cotHidden: true, fotosHidden: true }
  );
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
  assert.match(invJs, /if \(fabPromptsBtn\) fabPromptsBtn\.classList\.toggle\('hidden', !isOwnerFotos\);/);
  assert.match(invJs, /if \(fabPanelSuiteBtn\) fabPanelSuiteBtn\.classList\.toggle\('hidden', !isOwnerFotos\);/);
  assert.match(invJs, /window\.setInvSplitTarget = function \(target\)\s*\{\s*if \(!isFotosAppOwner\(\)\)/);
  assert.match(invJs, /window\.openPromptsFromCotizador = function \(\)\s*\{\s*if \(!isFotosAppOwner\(\)\) return;/);
  assert.match(invJs, /window\.openPanelFromCotizador = function \(\)\s*\{\s*if \(!isFotosAppOwner\(\)\) return;/);

  // Subir Fotos HTML + JS header link & split switcher
  assert.match(fotosHtml, /id="linkHeaderPrompts"[^>]*href="\.\/prompts\.html"/);
  assert.match(fotosHtml, /id="btnFotosSplitTargetCotizador"[^>]*setFotosSplitTarget\('cotizador'\)/);
  assert.match(fotosHtml, /id="btnFotosSplitTargetPrompts"[^>]*setFotosSplitTarget\('prompts'\)/);
  assert.match(fotosJs, /window\.setFotosSplitTarget = function \(target\)/);
  assert.match(fotosJs, /target === 'prompts' \? '\.\/prompts\.html' : '\.\/inventario\.html\?embed=1'/);
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
