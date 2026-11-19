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
        { num: '6', title: 'Creación de Prompts',       url: 'https://buena-espero.onrender.com/', render: true },
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

    const SHEET_ICON_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="2" y1="6.5" x2="14" y2="6.5"/><line x1="2" y1="10.5" x2="14" y2="10.5"/><line x1="6.5" y1="2" x2="6.5" y2="14"/></svg>';

    let unlocked = false;

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

    async function callWebAppLogin(typedKey) {
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
            ? window.CREATA_CLOUD_CONFIG.getApiUrl()
            : '';
        const targetUrl = cfgUrl || CANONICAL_WEBAPP_URL;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'inv_login',
                    email: OWNER_EMAIL,
                    accessKey: typedKey,
                    sheetTab: 'PROYECTOS'
                }),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return { ok: false, unavailable: true };
            return (await resp.json()) || { ok: false, unavailable: true };
        } catch (e) {
            return { ok: false, unavailable: true };
        } finally {
            if (timer) clearTimeout(timer);
        }
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
                fetch(p.url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
            }
        });
    }

    function unlockHub() {
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
    }

    window.lockHubPortal = function () {
        unlocked = false;
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
                unlockHub();
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        }
    };

    function init() {
        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        document.addEventListener('keydown', (ev) => {
            if (!unlocked || ev.ctrlKey || ev.metaKey || ev.altKey) return;
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

        if (checkExistingOwnerSession()) {
            unlockHub();
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
