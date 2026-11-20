(function () {
    'use strict';

    const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const OWNER_DISPLAY_NAME = 'Kevin Reyna';
    const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

    const PANEL_SESSION_KEY = 'creata_private_kevin_panel_v1';
    const FOTOS_SESSION_KEY = 'creata_private_kevin_fotos_v1';
    const FOTOS_SECRET_SESSION_KEY = 'creata_private_kevin_fotos_sec_v1';
    const HIST_SESSION_KEY = 'creata_private_kevin_hist_v1';
    const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const MANUAL_LOCK_FLAG = 'creata_private_panel_manual_lock';

    const PROJECTS = [
        { num: '1', title: 'Creación de Cotización',    url: './inventario.html', openModule: 'inventario' },
        { num: '2', title: 'Seguimiento de Cotización', url: './inventario.html', openModule: 'seguimiento' },
        { num: '3', title: 'Catálogo',                  url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/index.html' },
        { num: '4', title: 'Cambios de Precio Web',     url: 'https://creata-control-precios.onrender.com/', render: true },
        { num: '5', title: 'Mapa 3D · Casa CREATA',     url: 'https://ikerreyna3942-debug.github.io/Casa-creata/' },
        { num: '6', title: 'Creación de Prompts',       url: './prompts.html', render: true, wakeUrl: 'https://buena-espero.onrender.com/' },
        { num: '7', title: 'Alta de Odoo',              url: 'https://app-1-3y7y.onrender.com/', render: true },
        { num: '8', title: 'Historial de Cotización',   url: './inventario.html', openModule: 'historial' },
        { num: '9', title: 'Subida de Fotos (Hoja 1)',  url: 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/fotos-productos.html' }
    ];

    const SHEETS = [
        { title: 'Control de Productos',     ref: '#1 · #3 · #8 · #9', url: 'https://docs.google.com/spreadsheets/d/1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8/edit' },
        { title: 'LPPT Proveedores',         ref: '#1',                url: 'https://docs.google.com/spreadsheets/d/1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE/edit' },
        { title: 'Cotizaciones BD',          ref: '#2',                url: 'https://docs.google.com/spreadsheets/d/1_XBmM6WPJ2kI89RvzPO7JchHu_xL1zSnssUfUHRQ-cg/edit' },
        { title: 'Configuración de Web',     ref: '#4',                url: 'https://docs.google.com/spreadsheets/d/1Ib2n4rv71TLfRdGp4zMu-Bv1yw6HvzbiwAZ5eTYccfg/edit' },
        { title: 'Ventas e Inventario',      ref: '#5',                url: 'https://docs.google.com/spreadsheets/d/18FMqtvQkSjhmrVzeuuR1ZDfU8IeDCF41D6myHMsNxRM/edit' },
        { title: 'Base de Datos Generales',  ref: '#6 · #7',           url: 'https://docs.google.com/spreadsheets/d/1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg/edit' }
    ];

    const SUITE_APPS = [
        { id: 'cotizador', icon: '📋', title: 'Cotizador',   sub: 'Inventario + Pantalla dividida', url: './inventario.html', openModule: 'inventario' },
        { id: 'fotos',     icon: '📷', title: 'Subir Fotos', sub: 'Categorías Drive + Hoja 1',      url: './fotos-productos.html' },
        { id: 'prompts',   icon: '✨', title: 'Prompts IA',  sub: 'Estudio IA + Odoo / Sheet',      url: './prompts.html' }
    ];

    const SHEET_ICON_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="2" y1="10.5" x2="14" y2="10.5"/><line x1="6.5" y1="2" x2="6.5" y2="14"/></svg>';

    let unlocked = false;
    let panelBackNav = null;
    let deferredPanelInstallPrompt = null;

    function cleanStr(v) {
        return v === null || v === undefined ? '' : String(v).trim();
    }

    function normalizeEmail(raw) {
        return cleanStr(raw).toLowerCase().replace(/,/g, '.');
    }

    function escapeHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseCsvSimple(text) {
        const rows = [];
        let row = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQ) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
                    else inQ = false;
                } else cur += ch;
            } else if (ch === '"') inQ = true;
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\r') {
                if (i + 1 < text.length && text[i + 1] === '\n') i++;
                row.push(cur); rows.push(row); row = []; cur = '';
            } else if (ch === '\n') {
                row.push(cur); rows.push(row); row = []; cur = '';
            } else cur += ch;
        }
        if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
        return rows;
    }

    async function fetchProyectosRowsFallback() {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=PROYECTOS&range=A1%3AI40&_t=' + Date.now();
        try {
            const resp = await fetch(csvUrl, { cache: 'no-store' });
            if (resp && resp.ok) {
                const txt = await resp.text();
                if (txt && !txt.trim().startsWith('<')) return parseCsvSimple(txt);
            }
        } catch (e) {}
        return null;
    }

    async function callPanelWebAppPost(action, payloadObj, timeoutMs) {
        if (typeof fetch !== 'function') return { ok: false, unavailable: true };
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
            ? cleanStr(window.CREATA_CLOUD_CONFIG.getApiUrl())
            : '';
        const primaryUrl = cfgUrl || CANONICAL_WEBAPP_URL;

        const postOnce = async (targetUrl) => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 9000) : null;
            try {
                const resp = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(Object.assign({}, payloadObj || {}, { action: action })),
                    signal: controller ? controller.signal : undefined
                });
                if (!resp || !resp.ok) return { ok: false, unavailable: true };
                return (await resp.json()) || { ok: false, unavailable: true };
            } catch (e) {
                return { ok: false, unavailable: true };
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        const res = await postOnce(primaryUrl);
        if (CANONICAL_WEBAPP_URL && primaryUrl !== CANONICAL_WEBAPP_URL && (!res || res.unavailable)) {
            const fb = await postOnce(CANONICAL_WEBAPP_URL);
            if (fb && !fb.unavailable) return fb;
        }
        return res;
    }

    async function callWebAppLogin(typedKey) {
        return callPanelWebAppPost('inv_login', {
            email: OWNER_EMAIL,
            accessKey: typedKey,
            sheetTab: 'PROYECTOS'
        }, 9000);
    }

    const PANEL_PRESENCE_DEVICE_KEY = 'creata_inv_presence_dev_v1';
    let _panelLastHeartbeatMs = 0;
    let _panelPresenceTimer = null;

    function getPanelPresenceDeviceId() {
        try {
            let id = localStorage.getItem(PANEL_PRESENCE_DEVICE_KEY);
            if (!id) {
                id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(PANEL_PRESENCE_DEVICE_KEY, id);
            }
            return id;
        } catch (e) {
            return 'dev_mem_panel';
        }
    }

    function readActiveOwnerPresenceCreds() {
        const keys = [PANEL_SESSION_KEY, INV_SESSION_KEY, FOTOS_SESSION_KEY, HIST_SESSION_KEY];
        let token = '';
        let accessKey = '';
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                if (!obj || normalizeEmail(obj.correo) !== OWNER_EMAIL) continue;
                if (!token && cleanStr(obj.authToken)) token = cleanStr(obj.authToken);
                if (!accessKey && cleanStr(obj.accessKey)) accessKey = cleanStr(obj.accessKey);
            } catch (e) {}
        }
        if (!accessKey) {
            try {
                if (typeof sessionStorage !== 'undefined') {
                    accessKey = cleanStr(sessionStorage.getItem(FOTOS_SECRET_SESSION_KEY));
                }
                if (!accessKey) accessKey = cleanStr(localStorage.getItem(FOTOS_SECRET_SESSION_KEY));
            } catch (e) {}
        }
        return { authToken: token, accessKey: accessKey };
    }

    function persistPanelRenewedToken(newToken) {
        const tok = cleanStr(newToken);
        if (!tok) return;
        const keys = [PANEL_SESSION_KEY, INV_SESSION_KEY, FOTOS_SESSION_KEY, HIST_SESSION_KEY];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                if (obj && normalizeEmail(obj.correo) === OWNER_EMAIL) {
                    obj.authToken = tok;
                    localStorage.setItem(keys[i], JSON.stringify(obj));
                }
            } catch (e) {}
        }
    }

    function sendPanelPresenceHeartbeat(forceNow, _isRetry) {
        if (!unlocked) return;
        const now = Date.now();
        if (!forceNow && (now - _panelLastHeartbeatMs) < 45000) return;
        if (!forceNow && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const creds = readActiveOwnerPresenceCreds();
        if (!creds.authToken && !creds.accessKey) return;
        _panelLastHeartbeatMs = now;
        const payload = {
            authToken: creds.authToken,
            advisorEmail: OWNER_EMAIL,
            correo: OWNER_EMAIL,
            nombre: OWNER_DISPLAY_NAME,
            puesto: 'ADMINISTRADOR',
            sheetTab: 'PROYECTOS',
            erpStore: 'CEDIS',
            deviceId: getPanelPresenceDeviceId(),
            vista: 'panel',
            view: 'panel',
            page: 'panel'
        };
        if (!creds.authToken && creds.accessKey) payload.accessKey = creds.accessKey;
        callPanelWebAppPost('inv_presence_heartbeat', payload, 8000).then(async (hbRes) => {
            if (hbRes && hbRes.renewedAuthToken) {
                persistPanelRenewedToken(hbRes.renewedAuthToken);
            }
            if (!_isRetry && hbRes && !hbRes.ok && !hbRes.unavailable && (hbRes.authRequired || !hbRes.error) && creds.accessKey) {
                const loginRes = await callWebAppLogin(creds.accessKey);
                const freshTok = cleanStr((loginRes && (loginRes.authToken || (loginRes.user && loginRes.user.authToken))) || '');
                if (freshTok) {
                    persistPanelRenewedToken(freshTok);
                    _panelLastHeartbeatMs = 0;
                    sendPanelPresenceHeartbeat(true, true);
                }
            }
        }).catch(() => {});
    }

    function stopPanelPresenceHeartbeatLoop() {
        if (_panelPresenceTimer) {
            clearInterval(_panelPresenceTimer);
            _panelPresenceTimer = null;
        }
    }

    function startPanelPresenceHeartbeatLoop() {
        stopPanelPresenceHeartbeatLoop();
        _panelPresenceTimer = setInterval(() => {
            if (unlocked && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
                sendPanelPresenceHeartbeat(false);
            }
        }, 60000);
    }

    function setGateAlert(msg) {
        const el = document.getElementById('hubGateAlert');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function checkExistingOwnerSession() {
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(MANUAL_LOCK_FLAG) === '1') {
                return false;
            }
        } catch (e) {}
        const keys = [PANEL_SESSION_KEY, FOTOS_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                if (obj && normalizeEmail(obj.correo) === OWNER_EMAIL && !obj.mustChangeKey) return true;
            } catch (e) {}
        }
        return false;
    }

    function prepareModuleLaunch(mod) {
        try {
            if (!mod || mod === 'inventario') {
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('creata_open_module');
                localStorage.removeItem('creata_open_module');
            } else {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('creata_open_module', mod);
                localStorage.setItem('creata_open_module', JSON.stringify({ module: mod, ts: Date.now() }));
            }
        } catch (e) {}
    }

    function renderButtons() {
        const suiteGrid = document.getElementById('suiteGridContainer');
        if (suiteGrid) {
            suiteGrid.innerHTML = SUITE_APPS.map((app, idx) => (
                '<div class="suite-card" data-suite-id="' + escapeHtml(app.id) + '">' +
                    '<a class="suite-card-main" data-suite-idx="' + idx + '" href="' + escapeHtml(app.url) + '">' +
                        '<span class="suite-card-ico" aria-hidden="true">' + app.icon + '</span>' +
                        '<span class="suite-card-meta">' +
                            '<span class="suite-card-title">' + escapeHtml(app.title) + '</span>' +
                            '<span class="suite-card-sub">' + escapeHtml(app.sub) + '</span>' +
                        '</span>' +
                    '</a>' +
                    '<a class="suite-card-ext" data-suite-idx="' + idx + '" href="' + escapeHtml(app.url) + '" target="_blank" rel="noopener" title="Abrir en pestaña nueva" aria-label="Abrir ' + escapeHtml(app.title) + ' en pestaña nueva">↗</a>' +
                '</div>'
            )).join('');
            if (!suiteGrid.dataset.creataBoundSuite) {
                suiteGrid.dataset.creataBoundSuite = '1';
                const onSuiteLaunch = (ev) => {
                    const link = ev.target && ev.target.closest ? ev.target.closest('a[data-suite-idx]') : null;
                    if (!link) return;
                    const idx = parseInt(link.getAttribute('data-suite-idx'), 10);
                    const app = !isNaN(idx) ? SUITE_APPS[idx] : null;
                    if (app && app.openModule) {
                        prepareModuleLaunch(app.openModule);
                    }
                };
                suiteGrid.addEventListener('click', onSuiteLaunch);
                suiteGrid.addEventListener('auxclick', onSuiteLaunch);
            }
        }

        const grid = document.getElementById('projectsGridContainer');
        if (grid) {
            grid.innerHTML = PROJECTS.map((p, idx) => (
                '<a class="proj-btn" data-proj-idx="' + idx + '" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' +
                    '<span class="proj-btn-left">' +
                        '<span class="proj-num">' + escapeHtml(p.num) + '</span>' +
                        '<span class="proj-name">' + escapeHtml(p.title) + '</span>' +
                    '</span>' +
                    '<span class="proj-arrow">↗</span>' +
                '</a>'
            )).join('');
            if (!grid.dataset.creataBoundLaunch) {
                grid.dataset.creataBoundLaunch = '1';
                const onLaunch = (ev) => {
                    const link = ev.target && ev.target.closest ? ev.target.closest('a[data-proj-idx]') : null;
                    if (!link) return;
                    const idx = parseInt(link.getAttribute('data-proj-idx'), 10);
                    const proj = !isNaN(idx) ? PROJECTS[idx] : null;
                    if (proj && proj.openModule) {
                        prepareModuleLaunch(proj.openModule);
                    }
                };
                grid.addEventListener('click', onLaunch);
                grid.addEventListener('auxclick', onLaunch);
            }
        }

        const sheetsGrid = document.getElementById('sheetsGridContainer');
        if (sheetsGrid) {
            sheetsGrid.innerHTML = SHEETS.map((s) => (
                '<a class="proj-btn sheet-btn" href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' +
                    '<span class="proj-btn-left">' +
                        '<span class="sheet-badge">' + SHEET_ICON_SVG + '</span>' +
                        '<span class="proj-meta">' +
                            '<span class="proj-name">' + escapeHtml(s.title) + '</span>' +
                            '<span class="sheet-ref">' + escapeHtml(s.ref) + '</span>' +
                        '</span>' +
                    '</span>' +
                    '<span class="proj-arrow sheet-arrow">↗</span>' +
                '</a>'
            )).join('');
        }
    }

    function wakeRenderServersSilently() {
        PROJECTS.forEach((p) => {
            if (p.render) {
                const target = p.wakeUrl || p.url;
                fetch(target, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
            }
        });
    }

    function unlockHub(fromUserAction) {
        unlocked = true;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(MANUAL_LOCK_FLAG);
        } catch (e) {}
        const gate = document.getElementById('hubGateBackdrop');
        const main = document.getElementById('hubMainShell');
        if (gate) gate.classList.add('hidden');
        if (main) main.classList.remove('hidden');
        renderButtons();
        wakeRenderServersSilently();
        sendPanelPresenceHeartbeat(true);
        startPanelPresenceHeartbeatLoop();
        if (fromUserAction && panelBackNav && typeof panelBackNav.syncDepthOnUserAction === 'function') {
            panelBackNav.syncDepthOnUserAction('unlock');
        }
    }

    function isPanelElHidden(id) {
        const el = document.getElementById(id);
        return !el || el.classList.contains('hidden');
    }

    function isPanelStandaloneMode() {
        try {
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
            if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
        } catch (e) {}
        return false;
    }

    function syncPanelInstallControls() {
        const btn = document.getElementById('btnInstallPanelApp');
        const banner = document.getElementById('panelNativeInstallBanner');
        const standalone = isPanelStandaloneMode();
        if (btn) {
            btn.classList.toggle('hidden', standalone);
            btn.textContent = deferredPanelInstallPrompt ? '📲 Instalar App' : '📲 Instalar';
        }
        if (banner) {
            banner.classList.toggle('hidden', !deferredPanelInstallPrompt || standalone);
        }
    }

    function registerPanelServiceWorker() {
        try {
            if (typeof navigator === 'undefined' || !navigator.serviceWorker || typeof navigator.serviceWorker.register !== 'function') {
                return;
            }
            if (typeof location !== 'undefined' && !/^https?:$/.test(location.protocol || '')) return;
            navigator.serviceWorker.register('./panel-sw.js', { scope: './panel' }).catch(() => {});
        } catch (e) {}
    }

    window.openPanelInstallModal = function () {
        const modal = document.getElementById('panelInstallModal');
        const fb = document.getElementById('panelCopyFeedback');
        if (fb) { fb.textContent = ''; fb.classList.add('hidden'); }
        syncPanelInstallControls();
        if (modal) {
            modal.classList.remove('hidden');
            if (panelBackNav && typeof panelBackNav.syncDepthOnUserAction === 'function') {
                panelBackNav.syncDepthOnUserAction('install_modal');
            }
        }
    };

    window.closePanelInstallModal = function () {
        const modal = document.getElementById('panelInstallModal');
        if (modal) modal.classList.add('hidden');
    };

    window.triggerPanelInstall = async function () {
        if (deferredPanelInstallPrompt && typeof deferredPanelInstallPrompt.prompt === 'function') {
            try {
                deferredPanelInstallPrompt.prompt();
                await deferredPanelInstallPrompt.userChoice;
            } catch (e) {}
            deferredPanelInstallPrompt = null;
            syncPanelInstallControls();
            window.closePanelInstallModal();
            return;
        }
        window.openPanelInstallModal();
    };

    window.copyPanelAppLink = async function () {
        const fb = document.getElementById('panelCopyFeedback');
        const appUrl = (typeof location !== 'undefined' && location.origin && location.pathname)
            ? (location.origin + location.pathname)
            : 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/panel.html';
        let copied = false;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(appUrl);
                copied = true;
            }
        } catch (e) {}
        if (!copied) {
            try {
                const ta = document.createElement('textarea');
                ta.value = appUrl;
                document.body.appendChild(ta);
                if (typeof ta.select === 'function') ta.select();
                copied = document.execCommand ? !!document.execCommand('copy') : false;
                if (ta.parentNode) ta.parentNode.removeChild(ta);
            } catch (e2) {}
        }
        if (fb) {
            fb.textContent = copied ? 'Enlace copiado: ' + appUrl : appUrl;
            fb.classList.remove('hidden');
        }
    };

    window.lockHubPortal = function () {
        unlocked = false;
        stopPanelPresenceHeartbeatLoop();
        window.closePanelInstallModal();
        if (panelBackNav && typeof panelBackNav.resetToBase === 'function') {
            panelBackNav.resetToBase();
        }
        try {
            localStorage.removeItem(PANEL_SESSION_KEY);
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(MANUAL_LOCK_FLAG, '1');
        } catch (e) {}
        const gate = document.getElementById('hubGateBackdrop');
        const main = document.getElementById('hubMainShell');
        const pwd = document.getElementById('hubOwnerPassword');
        if (pwd) pwd.value = '';
        setGateAlert('');
        if (main) main.classList.add('hidden');
        if (gate) gate.classList.remove('hidden');
        if (pwd) setTimeout(() => pwd.focus(), 60);
    };

    window.toggleHubPwdVisibility = function () {
        const inp = document.getElementById('hubOwnerPassword');
        const btn = document.getElementById('btnToggleHubPwd');
        if (!inp) return;
        const isPwd = inp.type === 'password';
        inp.type = isPwd ? 'text' : 'password';
        if (btn) btn.textContent = isPwd ? 'Ocultar' : 'Ver';
    };

    window.submitHubOwnerLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailInp = document.getElementById('hubOwnerEmail');
        const pwdInp = document.getElementById('hubOwnerPassword');
        const btn = document.getElementById('btnHubLoginSubmit');

        const typedEmail = normalizeEmail(emailInp ? emailInp.value : OWNER_EMAIL);
        const typedKey = cleanStr(pwdInp ? pwdInp.value : '');

        if (typedEmail !== OWNER_EMAIL) {
            setGateAlert('Solo autorizado para ' + OWNER_EMAIL);
            return;
        }
        if (!typedKey) {
            setGateAlert('Ingresa tu contraseña.');
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
        setGateAlert('');

        try {
            const cloudRes = await callWebAppLogin(typedKey);
            let verified = false;
            if (cloudRes && cloudRes.ok) {
                verified = true;
            } else if (cloudRes && !cloudRes.unavailable && cloudRes.error && !/Acci[óo]n no reconocida/i.test(cloudRes.error)) {
                setGateAlert(cloudRes.error);
                return;
            } else {
                const rows = await fetchProyectosRowsFallback();
                if (!rows || rows.length < 2) {
                    setGateAlert('Sin conexión con Google Sheets.');
                    return;
                }
                let localKeyMap = {};
                try { localKeyMap = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}') || {}; } catch (e) {}
                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i] || [];
                    if (normalizeEmail(r[4]) !== OWNER_EMAIL) continue;
                    let tempK = cleanStr(r[5]).replace(/\.0+$/, '');
                    let defK = cleanStr(r[6]).replace(/\.0+$/, '');
                    const upd = localKeyMap[OWNER_EMAIL];
                    if (!defK && upd && upd.newKey) { defK = upd.newKey; tempK = ''; }
                    if ((defK && typedKey === defK) || (!defK && tempK && typedKey === tempK)) {
                        verified = true;
                        break;
                    }
                }
                if (!verified) {
                    setGateAlert('Contraseña incorrecta.');
                    return;
                }
            }

            if (verified) {
                const tok = cleanStr((cloudRes && (cloudRes.authToken || (cloudRes.user && cloudRes.user.authToken))) || '');
                const payload = JSON.stringify({
                    correo: OWNER_EMAIL,
                    nombre: OWNER_DISPLAY_NAME,
                    sheetTab: 'PROYECTOS',
                    authToken: tok,
                    accessKey: typedKey,
                    verifiedAt: Date.now()
                });
                try {
                    localStorage.setItem(PANEL_SESSION_KEY, payload);
                    localStorage.setItem(FOTOS_SESSION_KEY, payload);
                    localStorage.setItem(HIST_SESSION_KEY, payload);
                    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(FOTOS_SECRET_SESSION_KEY, typedKey);
                } catch (e) {}
                if (pwdInp) pwdInp.value = '';
                unlockHub(true);
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        }
    };

    function initPanelBackNav() {
        if (!window.CreataBackNav || typeof window.CreataBackNav.createController !== 'function') {
            return;
        }
        panelBackNav = window.CreataBackNav.createController({
            appId: 'panel',
            exitGuardMs: 2500,
            exitMessage: 'Presiona Atrás otra vez para salir',
            isEnabled: () => unlocked === true,
            steps: [
                {
                    id: 'install_modal',
                    isActive: () => !isPanelElHidden('panelInstallModal'),
                    undo: () => { window.closePanelInstallModal(); },
                    escapeAllowed: true
                }
            ]
        });
        panelBackNav.init();
        window.__CREATA_PANEL_BACK_NAV__ = panelBackNav;
        window.handlePanelBackAction = function (opts) {
            return panelBackNav
                ? panelBackNav.stepBackOnce(opts)
                : { handled: false, blocked: false, stepId: null, toast: '', source: 'manual' };
        };
    }

    function init() {
        registerPanelServiceWorker();

        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        initPanelBackNav();

        window.addEventListener('beforeinstallprompt', (ev) => {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            deferredPanelInstallPrompt = ev;
            syncPanelInstallControls();
        });
        window.addEventListener('appinstalled', () => {
            deferredPanelInstallPrompt = null;
            syncPanelInstallControls();
            window.closePanelInstallModal();
        });
        syncPanelInstallControls();

        document.addEventListener('keydown', (ev) => {
            if (!unlocked) return;
            if (ev.key === 'Escape') {
                if (panelBackNav && typeof panelBackNav.handleEscape === 'function') {
                    panelBackNav.handleEscape();
                } else {
                    window.closePanelInstallModal();
                }
                return;
            }
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
            const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (/^[1-9]$/.test(ev.key)) {
                const p = PROJECTS[parseInt(ev.key, 10) - 1];
                if (p) {
                    if (p.openModule) prepareModuleLaunch(p.openModule);
                    window.open(p.url, '_blank', 'noopener');
                }
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (unlocked && document.visibilityState === 'visible') {
                sendPanelPresenceHeartbeat(false);
            }
        });
        window.addEventListener('focus', () => {
            if (unlocked) sendPanelPresenceHeartbeat(false);
        });

        if (checkExistingOwnerSession()) {
            unlockHub(false);
        } else {
            const pwd = document.getElementById('hubOwnerPassword');
            if (pwd) setTimeout(() => pwd.focus(), 80);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
