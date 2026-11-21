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
    const SUITE_LAYOUT_KEY = 'creata_kevin_suite_layout_v1';

    const IS_SUITE_DIR = (typeof location !== 'undefined' && /\/suite(?:\/(?:index\.html)?)?$/i.test(location.pathname || ''));
    const ASSET_BASE = IS_SUITE_DIR ? '../' : './';

    // Exclusivo Kevin: solo las 3 apps unificadas en el menú "+ Agregar" (Arriba / Abajo / Izquierda / Derecha)
    const SUITE_APPS = [
        { id: 'cotizador', icon: '📋', title: 'Cotizador',      url: ASSET_BASE + 'inventario.html?embed=1',      openModule: 'inventario' },
        { id: 'fotos',     icon: '📷', title: 'Carga de Fotos', url: ASSET_BASE + 'fotos-productos.html?embed=1' },
        { id: 'prompts',   icon: '✨', title: 'Prompts IA',     url: ASSET_BASE + 'prompts.html?embed=1',         wakeUrl: 'https://buena-espero.onrender.com/' }
    ];
    const SUITE_APPS_BY_ID = {};
    SUITE_APPS.forEach((a) => { SUITE_APPS_BY_ID[a.id] = a; });

    let unlocked = false;
    let panelBackNav = null;
    let deferredPanelInstallPrompt = null;
    let suiteLayout = { top: 'cotizador', bottom: '', splitPct: 50, orientation: 'vertical' };
    const liveFramesById = {};

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
                if (!obj || obj.mustChangeKey) continue;
                const email = normalizeEmail(obj.correo);
                const perms = (obj.adminPermissions && typeof obj.adminPermissions === 'object') ? obj.adminPermissions : null;
                if (email === OWNER_EMAIL) {
                    if (perms && perms.panelSuite === false) continue;
                    return true;
                }
                if (obj.isAdmin === true && perms && perms.panelSuite === true) {
                    return true;
                }
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

    // =========================================================================
    // SUITE 3 EN 1: "+ AGREGAR" (ARRIBA / ABAJO / IZQUIERDA / DERECHA) + PANELES VIVOS + REDIMENSIONAR
    // =========================================================================
    function getRequestedQueryAppId() {
        try {
            if (typeof location === 'undefined' || !location.search) return '';
            const m = String(location.search).match(/[?&]app=([a-z0-9_-]+)/i);
            const id = m ? cleanStr(m[1]).toLowerCase() : '';
            return SUITE_APPS_BY_ID[id] ? id : '';
        } catch (e) {
            return '';
        }
    }

    function loadSavedSuiteLayout() {
        try {
            const raw = localStorage.getItem(SUITE_LAYOUT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    const top = SUITE_APPS_BY_ID[parsed.top] ? parsed.top : '';
                    const bottom = SUITE_APPS_BY_ID[parsed.bottom] && parsed.bottom !== top ? parsed.bottom : '';
                    const pct = Number(parsed.splitPct);
                    const orient = parsed.orientation === 'horizontal' ? 'horizontal' : 'vertical';
                    suiteLayout = {
                        top: top || bottom || 'cotizador',
                        bottom: top ? bottom : '',
                        splitPct: isFinite(pct) ? Math.max(20, Math.min(80, Math.round(pct))) : 50,
                        orientation: orient
                    };
                }
            }
        } catch (e) {}

        const reqApp = getRequestedQueryAppId();
        if (reqApp) {
            if (suiteLayout.bottom === reqApp) {
                suiteLayout.bottom = suiteLayout.top && suiteLayout.top !== reqApp ? suiteLayout.top : '';
            }
            suiteLayout.top = reqApp;
        }
    }

    function persistSuiteLayout() {
        try {
            localStorage.setItem(SUITE_LAYOUT_KEY, JSON.stringify(suiteLayout));
        } catch (e) {}
    }

    function getOrCreateAppFrame(appId) {
        const app = SUITE_APPS_BY_ID[appId];
        if (!app) return null;
        if (liveFramesById[appId]) return liveFramesById[appId];
        if (app.openModule) prepareModuleLaunch(app.openModule);
        const fr = document.createElement('iframe');
        fr.className = 'suite-app-frame';
        fr.setAttribute('data-app-id', appId);
        fr.setAttribute('title', app.title);
        fr.setAttribute('allow', 'clipboard-read; clipboard-write; camera; microphone; fullscreen; display-capture');
        fr.setAttribute('allowfullscreen', 'true');
        fr.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        fr.src = app.url;
        liveFramesById[appId] = fr;
        return fr;
    }

    function mountAppInSlot(slotEl, appId) {
        if (!slotEl) return;
        if (!appId) {
            while (slotEl.children && slotEl.children.length > 0) {
                slotEl.removeChild(slotEl.children[0]);
            }
            slotEl.classList.add('hidden');
            return;
        }
        slotEl.classList.remove('hidden');
        const frame = getOrCreateAppFrame(appId);
        if (!frame) return;
        const alreadyMounted = frame.parentNode === slotEl;
        while (slotEl.children && slotEl.children.length > 0) {
            if (slotEl.children[0] === frame && slotEl.children.length === 1) break;
            slotEl.removeChild(slotEl.children[0]);
        }
        if (!alreadyMounted) {
            slotEl.appendChild(frame);
        }
    }

    function applySplitPct(pct) {
        const clamped = Math.max(20, Math.min(80, Math.round(Number(pct) || 50)));
        suiteLayout.splitPct = clamped;
        const ws = document.getElementById('suiteWorkspace');
        if (ws && ws.style && typeof ws.style.setProperty === 'function') {
            ws.style.setProperty('--suite-split-pct', clamped + '%');
        }
        const pctLbl = document.getElementById('suiteSplitPct');
        if (pctLbl) pctLbl.textContent = clamped + '%';
    }

    function renderSuiteAddList() {
        const listEl = document.getElementById('suiteGridContainer');
        if (!listEl) return;
        const isHoriz = suiteLayout.orientation === 'horizontal';
        const hasBoth = Boolean(suiteLayout.top && suiteLayout.bottom);
        listEl.innerHTML = SUITE_APPS.map((app) => {
            const isSlot1 = suiteLayout.top === app.id;
            const isSlot2 = suiteLayout.bottom === app.id;
            const isTopCur = isSlot1 && (!hasBoth || !isHoriz);
            const isBottomCur = isSlot2 && !isHoriz;
            const isLeftCur = isSlot1 && hasBoth && isHoriz;
            const isRightCur = isSlot2 && isHoriz;
            let badge = '';
            if (isSlot1) badge = hasBoth ? (isHoriz ? 'Izquierda' : 'Arriba') : 'Activa';
            else if (isSlot2) badge = isHoriz ? 'Derecha' : 'Abajo';
            return (
                '<div class="suite-add-row' + (badge ? ' is-active' : '') + '" data-suite-id="' + escapeHtml(app.id) + '">' +
                    '<div class="suite-add-row-head">' +
                        '<span class="suite-add-title"><span aria-hidden="true">' + app.icon + '</span> ' + escapeHtml(app.title) + '</span>' +
                        (badge ? '<span class="suite-add-state">' + badge + '</span>' : '') +
                    '</div>' +
                    '<div class="suite-add-actions">' +
                        '<button type="button" class="suite-place-btn' + (isTopCur ? ' is-current' : '') + '" data-app-id="' + escapeHtml(app.id) + '" data-pos="top" onclick="placeSuiteApp(\'' + escapeHtml(app.id) + '\', \'top\')">⬆ Arriba</button>' +
                        '<button type="button" class="suite-place-btn' + (isBottomCur ? ' is-current' : '') + '" data-app-id="' + escapeHtml(app.id) + '" data-pos="bottom" onclick="placeSuiteApp(\'' + escapeHtml(app.id) + '\', \'bottom\')">⬇ Abajo</button>' +
                        '<button type="button" class="suite-place-btn' + (isLeftCur ? ' is-current' : '') + '" data-app-id="' + escapeHtml(app.id) + '" data-pos="left" onclick="placeSuiteApp(\'' + escapeHtml(app.id) + '\', \'left\')">⬅ Izquierda</button>' +
                        '<button type="button" class="suite-place-btn' + (isRightCur ? ' is-current' : '') + '" data-app-id="' + escapeHtml(app.id) + '" data-pos="right" onclick="placeSuiteApp(\'' + escapeHtml(app.id) + '\', \'right\')">➡ Derecha</button>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    function renderSuiteActiveChips() {
        const chipsEl = document.getElementById('suiteActiveChips');
        const swapBtn = document.getElementById('btnSuiteSwap');
        const orientBtn = document.getElementById('btnSuiteOrientation');
        const hasBoth = Boolean(suiteLayout.top && suiteLayout.bottom);
        const isHoriz = suiteLayout.orientation === 'horizontal';

        if (swapBtn) {
            swapBtn.classList.toggle('hidden', !hasBoth);
            swapBtn.textContent = isHoriz ? '⇄' : '⇅';
            const swapTitle = isHoriz ? 'Intercambiar izquierda y derecha' : 'Intercambiar arriba y abajo';
            swapBtn.setAttribute('title', swapTitle);
            swapBtn.setAttribute('aria-label', swapTitle);
        }
        if (orientBtn) {
            orientBtn.classList.toggle('hidden', !hasBoth);
            orientBtn.textContent = isHoriz ? '⬓' : '◫';
            const orientTitle = isHoriz ? 'Cambiar a arriba y abajo' : 'Cambiar a lado a lado';
            orientBtn.setAttribute('title', orientTitle);
            orientBtn.setAttribute('aria-label', orientTitle);
        }
        if (!chipsEl) return;

        const pos1Ico = isHoriz ? '⬅' : '⬆';
        const pos2Ico = isHoriz ? '➡' : '⬇';
        const parts = [];
        if (suiteLayout.top && SUITE_APPS_BY_ID[suiteLayout.top]) {
            const a = SUITE_APPS_BY_ID[suiteLayout.top];
            parts.push(
                '<span class="suite-slot-chip">' +
                    (hasBoth ? '<span class="suite-slot-pos">' + pos1Ico + '</span>' : '') +
                    '<span>' + a.icon + ' ' + escapeHtml(a.title) + '</span>' +
                    (hasBoth ? '<button type="button" class="suite-chip-close" title="Cerrar panel" aria-label="Cerrar ' + escapeHtml(a.title) + '" onclick="removeSuiteSlot(\'top\')">✕</button>' : '') +
                '</span>'
            );
        }
        if (suiteLayout.bottom && SUITE_APPS_BY_ID[suiteLayout.bottom]) {
            const b = SUITE_APPS_BY_ID[suiteLayout.bottom];
            parts.push(
                '<span class="suite-slot-chip">' +
                    '<span class="suite-slot-pos">' + pos2Ico + '</span>' +
                    '<span>' + b.icon + ' ' + escapeHtml(b.title) + '</span>' +
                    '<button type="button" class="suite-chip-close" title="Cerrar panel" aria-label="Cerrar ' + escapeHtml(b.title) + '" onclick="removeSuiteSlot(\'bottom\')">✕</button>' +
                '</span>'
            );
        }
        chipsEl.innerHTML = parts.join('');
    }

    function renderSuiteWorkspace() {
        if (!suiteLayout.top && suiteLayout.bottom) {
            suiteLayout.top = suiteLayout.bottom;
            suiteLayout.bottom = '';
        }
        if (!suiteLayout.top) {
            suiteLayout.top = 'cotizador';
        }
        if (suiteLayout.orientation !== 'horizontal' && suiteLayout.orientation !== 'vertical') {
            suiteLayout.orientation = 'vertical';
        }
        const ws = document.getElementById('suiteWorkspace');
        const topEl = document.getElementById('suiteSlotTop');
        const botEl = document.getElementById('suiteSlotBottom');
        const splitBar = document.getElementById('suiteSplitBar');
        const splitDots = document.getElementById('suiteSplitDots');
        const hasBoth = Boolean(suiteLayout.top && suiteLayout.bottom);
        const isHoriz = hasBoth && suiteLayout.orientation === 'horizontal';

        if (ws) {
            ws.classList.toggle('is-split', hasBoth);
            ws.classList.toggle('is-horizontal', isHoriz);
        }
        if (splitBar) {
            splitBar.classList.toggle('hidden', !hasBoth);
            splitBar.setAttribute('aria-orientation', isHoriz ? 'vertical' : 'horizontal');
        }
        if (splitDots) {
            splitDots.textContent = isHoriz ? '║' : '══';
        }

        const topLbl = document.getElementById('suiteSplitTopName');
        const botLbl = document.getElementById('suiteSplitBottomName');
        if (topLbl) topLbl.textContent = suiteLayout.top && SUITE_APPS_BY_ID[suiteLayout.top] ? (isHoriz ? '⬅ ' : '⬆ ') + SUITE_APPS_BY_ID[suiteLayout.top].title : '';
        if (botLbl) botLbl.textContent = suiteLayout.bottom && SUITE_APPS_BY_ID[suiteLayout.bottom] ? (isHoriz ? '➡ ' : '⬇ ') + SUITE_APPS_BY_ID[suiteLayout.bottom].title : '';

        applySplitPct(suiteLayout.splitPct);
        mountAppInSlot(topEl, suiteLayout.top);
        mountAppInSlot(botEl, hasBoth ? suiteLayout.bottom : '');
        renderSuiteAddList();
        renderSuiteActiveChips();
        persistSuiteLayout();
    }

    window.toggleSuiteAddMenu = function (forceOpen) {
        const menu = document.getElementById('suiteAddMenu');
        const bd = document.getElementById('suiteAddBackdrop');
        const btn = document.getElementById('btnSuiteAdd');
        if (!menu) return;
        const currentlyOpen = !menu.classList.contains('hidden');
        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !currentlyOpen;
        if (nextOpen) renderSuiteAddList();
        menu.classList.toggle('hidden', !nextOpen);
        if (bd) bd.classList.toggle('hidden', !nextOpen);
        if (btn) btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        if (nextOpen && panelBackNav && typeof panelBackNav.syncDepthOnUserAction === 'function') {
            panelBackNav.syncDepthOnUserAction('add_menu');
        }
    };

    window.closeSuiteAddMenu = function () {
        window.toggleSuiteAddMenu(false);
    };

    window.placeSuiteApp = function (appId, position) {
        const id = cleanStr(appId).toLowerCase();
        if (!SUITE_APPS_BY_ID[id]) return false;
        const rawPos = cleanStr(position).toLowerCase();
        const isHorizPos = rawPos === 'left' || rawPos === 'right';
        suiteLayout.orientation = isHorizPos ? 'horizontal' : 'vertical';
        const isFirstSlot = rawPos === 'top' || rawPos === 'left' || (!isHorizPos && rawPos !== 'bottom');

        if (isFirstSlot) {
            if (suiteLayout.bottom === id) {
                suiteLayout.bottom = suiteLayout.top && suiteLayout.top !== id ? suiteLayout.top : '';
            }
            suiteLayout.top = id;
        } else {
            if (suiteLayout.top === id) {
                if (suiteLayout.bottom && suiteLayout.bottom !== id) {
                    suiteLayout.top = suiteLayout.bottom;
                    suiteLayout.bottom = id;
                } else {
                    suiteLayout.top = id;
                    suiteLayout.bottom = '';
                }
            } else {
                suiteLayout.bottom = id;
            }
        }
        renderSuiteWorkspace();
        window.closeSuiteAddMenu();
        return true;
    };

    window.toggleSuiteOrientation = function (explicitOrientation) {
        if (explicitOrientation === 'horizontal' || explicitOrientation === 'vertical') {
            suiteLayout.orientation = explicitOrientation;
        } else {
            suiteLayout.orientation = suiteLayout.orientation === 'horizontal' ? 'vertical' : 'horizontal';
        }
        renderSuiteWorkspace();
        return suiteLayout.orientation;
    };

    window.removeSuiteSlot = function (position) {
        if (position === 'bottom' || position === 'right') {
            suiteLayout.bottom = '';
        } else if ((position === 'top' || position === 'left') && suiteLayout.bottom) {
            suiteLayout.top = suiteLayout.bottom;
            suiteLayout.bottom = '';
        }
        renderSuiteWorkspace();
    };

    window.swapSuiteSlots = function () {
        if (!suiteLayout.top || !suiteLayout.bottom) return false;
        const tmp = suiteLayout.top;
        suiteLayout.top = suiteLayout.bottom;
        suiteLayout.bottom = tmp;
        renderSuiteWorkspace();
        return true;
    };

    window.getSuiteLayoutState = function () {
        return Object.assign({}, suiteLayout);
    };

    function bindSplitBarDrag() {
        const bar = document.getElementById('suiteSplitBar');
        const ws = document.getElementById('suiteWorkspace');
        if (!bar || !ws || bar.dataset.boundDrag === '1') return;
        bar.dataset.boundDrag = '1';

        let dragging = false;
        const updateFromPointer = (clientX, clientY) => {
            if (!ws.getBoundingClientRect) return;
            const rect = ws.getBoundingClientRect();
            if (!rect) return;
            if (suiteLayout.orientation === 'horizontal') {
                if (rect.width <= 40) return;
                applySplitPct(((clientX - rect.left) / rect.width) * 100);
            } else {
                if (rect.height <= 40) return;
                applySplitPct(((clientY - rect.top) / rect.height) * 100);
            }
        };
        const stop = () => {
            if (!dragging) return;
            dragging = false;
            if (document.body) document.body.classList.remove('suite-dragging');
            persistSuiteLayout();
        };
        const start = (clientX, clientY) => {
            dragging = true;
            if (document.body) document.body.classList.add('suite-dragging');
            updateFromPointer(clientX, clientY);
        };

        bar.addEventListener('pointerdown', (ev) => {
            if (ev.preventDefault) ev.preventDefault();
            start(ev.clientX, ev.clientY);
        });
        bar.addEventListener('dblclick', () => {
            applySplitPct(50);
            persistSuiteLayout();
        });
        window.addEventListener('pointermove', (ev) => {
            if (dragging) updateFromPointer(ev.clientX, ev.clientY);
        });
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    }

    function wakeRenderServersSilently() {
        SUITE_APPS.forEach((app) => {
            if (app.wakeUrl) {
                fetch(app.wakeUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
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
        loadSavedSuiteLayout();
        renderSuiteWorkspace();
        bindSplitBarDrag();
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

    function isAnyStandaloneDisplay() {
        try {
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
            if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
        } catch (e) {}
        return false;
    }

    function isPanelStandaloneMode() {
        if (!isAnyStandaloneDisplay()) return false;
        if (IS_SUITE_DIR) return true;
        try {
            if (typeof location !== 'undefined' && /[?&]source=pwa\b/i.test(location.search || '')) return true;
            const ctrl = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
            if (ctrl && /(?:\/suite\/sw\.js|\/panel-sw\.js)(?:\?|$)/i.test(String(ctrl.scriptURL || ''))) return true;
        } catch (e) {}
        return false;
    }

    function syncPanelInstallControls() {
        const btn = document.getElementById('btnInstallPanelApp');
        const banner = document.getElementById('panelNativeInstallBanner');
        const breakout = document.getElementById('panelStandaloneBreakout');
        const ownStandalone = isPanelStandaloneMode();
        const trappedInOtherPwa = isAnyStandaloneDisplay() && !ownStandalone;
        if (btn) {
            btn.classList.toggle('hidden', ownStandalone);
        }
        if (banner) {
            banner.classList.toggle('hidden', !deferredPanelInstallPrompt || ownStandalone);
        }
        if (breakout) {
            breakout.classList.toggle('hidden', ownStandalone || (IS_SUITE_DIR && !trappedInOtherPwa));
        }
    }

    function registerPanelServiceWorker() {
        try {
            if (typeof navigator === 'undefined' || !navigator.serviceWorker || typeof navigator.serviceWorker.register !== 'function') {
                return;
            }
            if (typeof location !== 'undefined' && !/^https?:$/.test(location.protocol || '')) return;
            if (IS_SUITE_DIR) {
                navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
            } else {
                navigator.serviceWorker.register('./panel-sw.js', { scope: './panel' }).catch(() => {});
            }
        } catch (e) {}
    }

    window.openPanelInstallModal = function () {
        window.closeSuiteAddMenu();
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
        let appUrl = 'https://ikerreyna3942-debug.github.io/MCP-REPOCITORIO/suite/';
        try {
            if (typeof location !== 'undefined' && location.origin && location.pathname) {
                const baseDir = IS_SUITE_DIR
                    ? location.pathname.replace(/\/index\.html$/i, '/').replace(/\/?$/, '/')
                    : location.pathname.replace(/\/[^/]*$/, '/suite/');
                appUrl = location.origin + baseDir;
            }
        } catch (e) {}
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
        window.closeSuiteAddMenu();
        window.closePanelInstallModal();
        if (panelBackNav && typeof panelBackNav.resetToBase === 'function') {
            panelBackNav.resetToBase();
        }
        try {
            const topEl = document.getElementById('suiteSlotTop');
            const botEl = document.getElementById('suiteSlotBottom');
            if (topEl) topEl.innerHTML = '';
            if (botEl) botEl.innerHTML = '';
            Object.keys(liveFramesById).forEach((k) => {
                try {
                    const fr = liveFramesById[k];
                    if (fr && fr.parentNode) fr.parentNode.removeChild(fr);
                    if (fr) fr.src = 'about:blank';
                } catch (eFr) {}
                delete liveFramesById[k];
            });
        } catch (eClrFr) {}
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
                },
                {
                    id: 'add_menu',
                    isActive: () => !isPanelElHidden('suiteAddMenu'),
                    undo: () => { window.closeSuiteAddMenu(); },
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

    async function handleSuiteCopyImageMessage(ev) {
        const origin = ev && ev.origin;
        const isAllowedOrigin = origin === 'https://buena-espero.onrender.com' ||
            (typeof location !== 'undefined' && location.origin && origin === location.origin);
        if (!isAllowedOrigin) return;
        const data = ev.data;
        if (!data || data.type !== 'CREATA_PROMPTS_COPY_IMAGE') return;
        const reqId = String(data.requestId || '');
        const dataUri = typeof data.dataUri === 'string' ? data.dataUri.trim() : '';
        let ok = false;
        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/.test(dataUri)) {
            try {
                let pngBlob = null;
                if (dataUri.indexOf('data:image/png;base64,') === 0) {
                    const bin = atob(dataUri.slice('data:image/png;base64,'.length));
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    pngBlob = new Blob([bytes], { type: 'image/png' });
                } else if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
                    pngBlob = await new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => {
                            try {
                                const c = document.createElement('canvas');
                                c.width = img.naturalWidth || img.width || 1;
                                c.height = img.naturalHeight || img.height || 1;
                                const ctx = c.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
                            } catch (e) { reject(e); }
                        };
                        img.onerror = () => reject(new Error('img'));
                        img.src = dataUri;
                    });
                }
                if (pngBlob && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem === 'function') {
                    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
                    ok = true;
                }
            } catch (e) {
                ok = false;
            }
        }
        try {
            if (ev.source && typeof ev.source.postMessage === 'function') {
                ev.source.postMessage({
                    type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT',
                    requestId: reqId,
                    ok: ok
                }, origin);
            }
        } catch (eReply) {}
    }

    function init() {
        registerPanelServiceWorker();
        window.addEventListener('message', handleSuiteCopyImageMessage);

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
                    window.closeSuiteAddMenu();
                    window.closePanelInstallModal();
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
