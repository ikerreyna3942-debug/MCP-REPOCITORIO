(function () {
    'use strict';

    const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const OWNER_DISPLAY_NAME = 'Kevin Reyna';
    const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
    const SUBIR_FOLDER_ID = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p';
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

    const FOTOS_SESSION_KEY = 'creata_private_kevin_fotos_v1';
    const FOTOS_SECRET_SESSION_KEY = 'creata_private_kevin_fotos_sec_v1';
    const PANEL_SESSION_KEY = 'creata_private_kevin_panel_v1';
    const HIST_SESSION_KEY = 'creata_private_kevin_hist_v1';
    const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const MANUAL_LOCK_FLAG = 'creata_private_fotos_manual_lock';

    const CATEGORIAS_DEST_FOLDERS = [
        { key: 'SALAS',        id: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', name: 'FOTOS SALAS' },
        { key: 'SILLONES',     id: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm', name: 'FOTOS SILLONES' },
        { key: 'SOFA_CAMA',    id: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_', name: 'FOTOS SOFÁ CAMA Y FUTTONES' },
        { key: 'MESA_CENTRO',  id: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A', name: 'FOTOS MESA DE CENTRO' },
        { key: 'MESA_LATERAL', id: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX', name: 'FOTOS MESA LATERALES' },
        { key: 'COMEDORES',    id: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', name: 'FOTOS COMEDORES' },
        { key: 'RECAMARAS',    id: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6', name: 'FOTOS RECAMARAS' },
        { key: 'AUXILIARES',   id: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8', name: 'FOTOS DE AUXILIARES' },
        { key: 'ACCESORIOS',   id: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9', name: 'FOTOS ACCESORIOS Y ESPEJOS' },
        { key: 'INTERIOR',     id: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9', name: 'FOTOS INTERIOR' }
    ];

    const state = {
        unlocked: false,
        authToken: '',
        accessKey: '',
        products: [],
        productBySku: new Map(),
        filteredProducts: [],
        skuFilterMode: 'ALL',
        skuSearchQuery: '',
        selectedSku: '',
        inboxFiles: [],
        inboxSearchQuery: '',
        selectedInboxFileId: '',
        inboxLoading: false,
        sheetsLoading: false,
        assignInFlight: false,
        uploadInFlight: false,
        webappNeedsDeploy: false,
        sessionSavedLogs: [],
        sessionSavedBySku: new Map()
    };

    function cleanStr(val) {
        return val === null || val === undefined ? '' : String(val).trim();
    }

    function normalizeEmailInput(raw) {
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

    function normalizeSearchText(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normPlainCat(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cleanPhotoUrl(val) {
        const s = cleanStr(val);
        if (!s || /^#(N\/A|REF!|VALUE!|ERROR!|NAME\?)/i.test(s)) return '';
        return /^https?:\/\//i.test(s) ? s : '';
    }

    function extractDriveFileId(url) {
        const s = cleanStr(url);
        if (!s) return '';
        const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
        if (m1 && m1[1]) return m1[1];
        const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        if (m2 && m2[1]) return m2[1];
        return '';
    }

    function buildPhotoThumbUrl(urlOrFileId, widthPx) {
        const w = widthPx || 800;
        const raw = cleanStr(urlOrFileId);
        if (!raw) return '';
        if (/^data:image\//i.test(raw)) return raw;
        const fid = /^[a-zA-Z0-9_-]{18,}$/.test(raw) ? raw : extractDriveFileId(raw);
        if (fid) {
            return 'https://lh3.googleusercontent.com/d/' + fid + '=w' + w;
        }
        return raw;
    }

    function formatFileSize(bytes) {
        const n = Number(bytes || 0);
        if (!n || n <= 0) return '';
        if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function cleanKeyCellValue(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') return String(Math.trunc(val));
        return String(val).trim().replace(/\.0+$/, '');
    }

    window.handlePhotoImgError = function (imgEl) {
        if (!imgEl) return;
        const fid = imgEl.getAttribute('data-drive-id') || '';
        const step = parseInt(imgEl.getAttribute('data-fb-step') || '0', 10);
        if (fid && step === 0) {
            imgEl.setAttribute('data-fb-step', '1');
            imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fid) + '&sz=w1000';
            return;
        }
        if (fid && step === 1) {
            imgEl.setAttribute('data-fb-step', '2');
            imgEl.src = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fid);
            return;
        }
        imgEl.onerror = null;
        const parent = imgEl.parentElement;
        if (parent && parent.classList.contains('sku-mini-thumb')) {
            parent.innerHTML = '<span>FOTO</span>';
        } else if (parent) {
            parent.innerHTML = '<div class="photo-empty-placeholder">Abrir link arriba ↗</div>';
        }
    };

    function resolveCategoryDestFolderForProduct(categoriaRaw, tipoRaw, nombreRaw) {
        const cat = normPlainCat(categoriaRaw);
        const tp = normPlainCat(tipoRaw);
        const nom = normPlainCat(nombreRaw);
        const text = (tp + ' ' + nom + ' ' + cat).trim();
        const byKey = (k) => CATEGORIAS_DEST_FOLDERS.find((f) => f.key === k) || CATEGORIAS_DEST_FOLDERS[CATEGORIAS_DEST_FOLDERS.length - 1];

        if (/\bFUTON|\bFUTTON|SOFA\s*CAMA/.test(text)) return byKey('SOFA_CAMA');
        if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(text) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL|\bAUXILIAR/.test(text))) {
            return byKey('MESA_LATERAL');
        }
        if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRAL|\bNIDO\b/.test(text) || cat === 'MESAS DE CENTRO & LATERALES') {
            return byKey('MESA_CENTRO');
        }
        if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tp + ' ' + nom)) {
            return byKey('SILLONES');
        }
        if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tp + ' ' + nom)) {
            return byKey('SALAS');
        }
        if (
            cat === 'OFICINA' ||
            cat === 'EXTERIOR & TERRAZA' ||
            /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tp + ' ' + nom)
        ) {
            return byKey('AUXILIARES');
        }
        if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tp + ' ' + nom)) {
            return byKey('COMEDORES');
        }
        if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tp + ' ' + nom)) {
            return byKey('RECAMARAS');
        }
        if (
            cat === 'ACCESORIOS DECORATIVOS' ||
            cat === 'COJINES & TEXTILES' ||
            cat === 'ESPEJOS & ARTE' ||
            cat === 'ILUMINACION' ||
            /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tp + ' ' + nom)
        ) {
            return byKey('ACCESORIOS');
        }
        if (
            cat === 'BUFETERAS & CREDENZAS' ||
            cat === 'COMPLEMENTOS' ||
            /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tp + ' ' + nom)
        ) {
            return byKey('AUXILIARES');
        }
        return byKey('INTERIOR');
    }

    function populateDestFolderSelect() {
        const sel = document.getElementById('destFolderSelect');
        if (!sel) return;
        sel.innerHTML = CATEGORIAS_DEST_FOLDERS.map((f) => (
            '<option value="' + escapeHtml(f.id) + '">' + escapeHtml(f.name) + '</option>'
        )).join('');
    }

    function parseCsvText(text) {
        const rows = [];
        let row = [];
        let cur = '';
        let inQuotes = false;
        const len = text.length;
        for (let i = 0; i < len; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < len && text[i + 1] === '"') { cur += '"'; i++; }
                    else inQuotes = false;
                } else cur += ch;
            } else if (ch === '"') inQuotes = true;
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\r') {
                if (i + 1 < len && text[i + 1] === '\n') i++;
                row.push(cur); rows.push(row); row = []; cur = '';
            } else if (ch === '\n') {
                row.push(cur); rows.push(row); row = []; cur = '';
            } else cur += ch;
        }
        if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
        return rows;
    }

    function fetchSheetViaJsonp(sheetName, rangeStr) {
        return new Promise((resolve) => {
            if (typeof document === 'undefined' || !document.head) { resolve(null); return; }
            const cbName = '__creataFotosGviz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
            let scriptEl = null;
            let settled = false;

            const cleanup = () => {
                window[cbName] = function () {};
                setTimeout(() => { try { delete window[cbName]; } catch (e) { window[cbName] = undefined; } }, 60000);
                if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
            };

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(null);
            }, 14000);

            window[cbName] = function (resp) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                cleanup();
                try {
                    if (!resp || !resp.table || !Array.isArray(resp.table.rows)) { resolve(null); return; }
                    const colsCount = Array.isArray(resp.table.cols) ? resp.table.cols.length : 0;
                    const out = [];
                    if (Array.isArray(resp.table.cols)) {
                        const hdrLabels = resp.table.cols.map((c) => cleanStr(c && c.label));
                        if (hdrLabels.some(Boolean)) out.push(hdrLabels);
                    }
                    resp.table.rows.forEach((rObj) => {
                        const cells = (rObj && Array.isArray(rObj.c)) ? rObj.c : [];
                        const len = Math.max(colsCount, cells.length);
                        const arr = new Array(len);
                        for (let i = 0; i < len; i++) {
                            const cell = cells[i];
                            if (!cell) arr[i] = '';
                            else if (cell.f !== undefined && cell.f !== null && String(cell.f) !== '') arr[i] = String(cell.f);
                            else if (cell.v !== undefined && cell.v !== null) arr[i] = String(cell.v);
                            else arr[i] = '';
                        }
                        out.push(arr);
                    });
                    resolve(out);
                } catch (err) {
                    resolve(null);
                }
            };

            scriptEl = document.createElement('script');
            scriptEl.async = true;
            scriptEl.src = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
                '/gviz/tq?headers=0&sheet=' + encodeURIComponent(sheetName) +
                (rangeStr ? ('&range=' + encodeURIComponent(rangeStr)) : '') +
                '&tqx=responseHandler:' + cbName + '&_t=' + Date.now();
            scriptEl.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                cleanup();
                resolve(null);
            };
            document.head.appendChild(scriptEl);
        });
    }

    async function fetchSheetRows(sheetName, rangeStr) {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName) +
            (rangeStr ? ('&range=' + encodeURIComponent(rangeStr)) : '') +
            '&_t=' + Date.now();
        try {
            const resp = await fetch(csvUrl, { cache: 'no-store' });
            if (resp && resp.ok) {
                const txt = await resp.text();
                if (txt && !txt.trim().startsWith('<!DOCTYPE') && !txt.trim().startsWith('<html')) {
                    const parsed = parseCsvText(txt);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                }
            }
        } catch (e) {}
        return fetchSheetViaJsonp(sheetName, rangeStr);
    }

    async function callWebAppPost(action, payloadObj, timeoutMs) {
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
            ? window.CREATA_CLOUD_CONFIG.getApiUrl()
            : '';
        const targetUrl = cfgUrl || CANONICAL_WEBAPP_URL;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 25000) : null;
        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({}, payloadObj || {}, { action: action })),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return { ok: false, unavailable: true };
            return (await resp.json()) || { ok: false, unavailable: true };
        } catch (err) {
            return { ok: false, unavailable: true };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    function buildOwnerAuthPayload() {
        return {
            authToken: state.authToken || '',
            advisorEmail: OWNER_EMAIL,
            accessKey: state.accessKey || '',
            sheetTab: 'PROYECTOS'
        };
    }

    function setGateMessage(msg, tone) {
        const box = document.getElementById('privateGateMsg');
        if (!box) return;
        if (!msg) {
            box.textContent = '';
            box.className = 'gate-feedback hidden';
            return;
        }
        box.textContent = msg;
        box.className = 'gate-feedback ' + (tone === 'warn' ? 'is-warn' : 'is-error');
    }

    function checkExistingFotosOwnerSession() {
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(MANUAL_LOCK_FLAG) === '1') {
                return { valid: false, otherEmail: '', needsReauth: false };
            }
        } catch (e) {}

        let cachedSecret = '';
        try {
            if (typeof sessionStorage !== 'undefined') {
                cachedSecret = cleanStr(sessionStorage.getItem(FOTOS_SECRET_SESSION_KEY));
            }
        } catch (e) {}

        const candidateKeys = [FOTOS_SESSION_KEY, PANEL_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
        let sawOwnerWithoutCreds = false;

        for (let i = 0; i < candidateKeys.length; i++) {
            try {
                const raw = localStorage.getItem(candidateKeys[i]);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!parsed) continue;
                const email = normalizeEmailInput(parsed.correo);
                if (email && email !== OWNER_EMAIL) {
                    if (candidateKeys[i] === INV_SESSION_KEY) {
                        return { valid: false, otherEmail: email, needsReauth: false };
                    }
                    continue;
                }
                if (email === OWNER_EMAIL && !parsed.mustChangeKey) {
                    const tok = cleanStr(parsed.authToken);
                    if (tok || cachedSecret) {
                        return { valid: true, authToken: tok, accessKey: cachedSecret };
                    }
                    sawOwnerWithoutCreds = true;
                }
            } catch (e) {}
        }

        return { valid: false, otherEmail: '', needsReauth: sawOwnerWithoutCreds };
    }

    function unlockFotosPortal() {
        state.unlocked = true;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(MANUAL_LOCK_FLAG);
        } catch (e) {}

        const gate = document.getElementById('privateGateBackdrop');
        const shell = document.getElementById('privateAppShell');
        if (gate) gate.classList.add('hidden');
        if (shell) shell.classList.remove('hidden');

        window.refreshAllPhotoWorkspace(false);
    }

    window.lockFotosPortal = function () {
        state.unlocked = false;
        state.authToken = '';
        state.accessKey = '';
        try {
            localStorage.removeItem(FOTOS_SESSION_KEY);
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
                sessionStorage.setItem(MANUAL_LOCK_FLAG, '1');
            }
        } catch (e) {}

        const gate = document.getElementById('privateGateBackdrop');
        const shell = document.getElementById('privateAppShell');
        const pwdInp = document.getElementById('ownerPasswordInput');
        if (pwdInp) pwdInp.value = '';
        setGateMessage('', '');
        if (shell) shell.classList.add('hidden');
        if (gate) gate.classList.remove('hidden');
        if (pwdInp) setTimeout(() => pwdInp.focus(), 60);
    };

    window.toggleOwnerFotosPwd = function () {
        const inp = document.getElementById('ownerPasswordInput');
        const btn = document.getElementById('btnToggleOwnerPwd');
        if (!inp) return;
        const hiddenNow = inp.type === 'password';
        inp.type = hiddenNow ? 'text' : 'password';
        if (btn) btn.textContent = hiddenNow ? 'Ocultar' : 'Ver';
    };

    window.submitOwnerFotosLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailInp = document.getElementById('ownerEmailInput');
        const pwdInp = document.getElementById('ownerPasswordInput');
        const submitBtn = document.getElementById('btnOwnerLoginSubmit');

        const typedEmail = normalizeEmailInput(emailInp ? emailInp.value : OWNER_EMAIL);
        const typedKey = cleanStr(pwdInp ? pwdInp.value : '');

        if (typedEmail !== OWNER_EMAIL) {
            setGateMessage('Solo autorizado para ' + OWNER_EMAIL, 'error');
            return;
        }
        if (!typedKey) {
            setGateMessage('Ingresa tu contraseña.', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Entrando...';
        }
        setGateMessage('', '');

        try {
            const cloudRes = await callWebAppPost('inv_login', {
                email: OWNER_EMAIL,
                accessKey: typedKey,
                sheetTab: 'PROYECTOS'
            }, 9500);

            let verified = false;
            if (cloudRes && cloudRes.ok) {
                verified = true;
            } else if (cloudRes && !cloudRes.unavailable && cloudRes.error && !/Acci[óo]n no reconocida/i.test(cloudRes.error)) {
                setGateMessage(cloudRes.error, 'error');
                return;
            } else {
                const rows = await fetchSheetRows('PROYECTOS', 'A1:I40');
                if (!rows || rows.length < 2) {
                    setGateMessage('Sin conexión con Google Sheets.', 'error');
                    return;
                }
                let localKeyMap = {};
                try { localKeyMap = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}') || {}; } catch (e) {}

                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i] || [];
                    if (normalizeEmailInput(r[4]) !== OWNER_EMAIL) continue;
                    let tempKey = cleanKeyCellValue(r[5]);
                    let defKey = cleanKeyCellValue(r[6]);
                    const localUpd = localKeyMap[OWNER_EMAIL];
                    if (!defKey && localUpd && localUpd.newKey) { defKey = localUpd.newKey; tempKey = ''; }
                    if ((defKey && typedKey === defKey) || (!defKey && tempKey && typedKey === tempKey)) {
                        verified = true;
                        break;
                    }
                }
                if (!verified) {
                    setGateMessage('Contraseña incorrecta.', 'error');
                    return;
                }
            }

            if (verified) {
                const issuedToken = cleanStr(
                    (cloudRes && (cloudRes.authToken || (cloudRes.user && cloudRes.user.authToken))) || ''
                );
                state.authToken = issuedToken;
                state.accessKey = typedKey;
                const payload = JSON.stringify({
                    correo: OWNER_EMAIL,
                    nombre: OWNER_DISPLAY_NAME,
                    sheetTab: 'PROYECTOS',
                    authToken: issuedToken,
                    verifiedAt: Date.now()
                });
                try {
                    localStorage.setItem(FOTOS_SESSION_KEY, payload);
                    localStorage.setItem(PANEL_SESSION_KEY, payload);
                    localStorage.setItem(HIST_SESSION_KEY, payload);
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem(FOTOS_SECRET_SESSION_KEY, typedKey);
                    }
                } catch (e) {}
                if (pwdInp) pwdInp.value = '';
                unlockFotosPortal();
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Entrar';
            }
        }
    };

    async function loadSheetsCatalog() {
        state.sheetsLoading = true;
        const listEl = document.getElementById('skuResultsList');
        if (listEl && !state.products.length) {
            listEl.innerHTML = '<div class="photo-empty-placeholder">Cargando...</div>';
        }

        const [rows1, rowsInv] = await Promise.all([
            fetchSheetRows('1', 'A1:D9500'),
            fetchSheetRows('INVENTARIO_EN_VIVO', 'A1:G5500')
        ]);

        const invMap = new Map();
        if (Array.isArray(rowsInv)) {
            for (let i = 1; i < rowsInv.length; i++) {
                const r = rowsInv[i] || [];
                const sku = cleanStr(r[0]).toUpperCase();
                if (!sku || sku === 'SKU') continue;
                if (!invMap.has(sku)) {
                    invMap.set(sku, {
                        sku: sku,
                        tipo: cleanStr(r[1]),
                        modelo: cleanStr(r[2]),
                        nombreInv: cleanStr(r[3]),
                        categoria: cleanStr(r[6])
                    });
                }
            }
        }

        const mergedMap = new Map();
        if (Array.isArray(rows1)) {
            for (let i = 1; i < rows1.length; i++) {
                const r = rows1[i] || [];
                const sku = cleanStr(r[0]).toUpperCase();
                if (!sku || sku === 'SKU') continue;

                const rowNum = i + 1;
                const colBName = cleanStr(r[1]);
                const colDUrl = cleanPhotoUrl(r[3]);
                const inv = invMap.get(sku) || null;

                if (!mergedMap.has(sku)) {
                    const displayName = colBName || (inv ? inv.nombreInv : '') || '';
                    const dest = resolveCategoryDestFolderForProduct(
                        inv ? inv.categoria : '',
                        inv ? inv.tipo : '',
                        displayName
                    );
                    mergedMap.set(sku, {
                        sku: sku,
                        colBName: colBName,
                        displayName: displayName || '—',
                        photoUrl: colDUrl,
                        rowNumber: rowNum,
                        inSheet1: true,
                        inInv: !!inv,
                        categoria: inv ? inv.categoria : '',
                        tipo: inv ? inv.tipo : '',
                        destFolderId: dest.id,
                        destFolderName: dest.name,
                        searchNorm: ''
                    });
                } else {
                    const existing = mergedMap.get(sku);
                    if (!existing.colBName && colBName) {
                        existing.colBName = colBName;
                        existing.displayName = colBName;
                    }
                    if (!existing.photoUrl && colDUrl) {
                        existing.photoUrl = colDUrl;
                    }
                }
            }
        }

        invMap.forEach((inv, sku) => {
            if (mergedMap.has(sku)) return;
            const displayName = inv.nombreInv || [inv.tipo, inv.modelo].filter(Boolean).join(' ') || sku;
            const dest = resolveCategoryDestFolderForProduct(inv.categoria, inv.tipo, displayName);
            mergedMap.set(sku, {
                sku: sku,
                colBName: '',
                displayName: displayName,
                photoUrl: '',
                rowNumber: null,
                inSheet1: false,
                inInv: true,
                categoria: inv.categoria,
                tipo: inv.tipo,
                destFolderId: dest.id,
                destFolderName: dest.name,
                searchNorm: ''
            });
        });

        state.sessionSavedBySku.forEach((savedMeta, sku) => {
            const item = mergedMap.get(sku);
            if (item && savedMeta && savedMeta.newUrl) {
                item.photoUrl = savedMeta.newUrl;
                item.inSheet1 = true;
                if (savedMeta.rowNumber) item.rowNumber = savedMeta.rowNumber;
                if (savedMeta.productName && (!item.colBName || item.displayName === '—')) {
                    item.colBName = savedMeta.productName;
                    item.displayName = savedMeta.productName;
                }
            }
        });

        const list = Array.from(mergedMap.values());
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            p.searchSkuNorm = normalizeSearchText(p.sku);
            p.searchNameNorm = normalizeSearchText(p.displayName + ' ' + p.colBName + ' ' + p.categoria + ' ' + p.tipo);
            p.searchNorm = (p.searchSkuNorm + ' ' + p.searchNameNorm).trim();
        }

        list.sort((a, b) => {
            if (a.inInv !== b.inInv) return a.inInv ? -1 : 1;
            return a.displayName.localeCompare(b.displayName, 'es') || a.sku.localeCompare(b.sku, 'es');
        });

        state.products = list;
        state.productBySku = mergedMap;
        state.sheetsLoading = false;

        applySkuFiltersAndRender();
        if (state.selectedSku) renderSelectedProductStage();
    }

    window.clearSkuSearch = function () {
        const inp = document.getElementById('skuSearchInput');
        const clr = document.getElementById('skuSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.skuSearchQuery = '';
        applySkuFiltersAndRender();
        if (inp) inp.focus();
    };

    window.setSkuFilterMode = function (mode) {
        state.skuFilterMode = mode || 'ALL';
        document.querySelectorAll('.filter-pill[data-filter]').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-filter') === state.skuFilterMode);
        });
        applySkuFiltersAndRender();
    };

    function applySkuFiltersAndRender() {
        const q = normalizeSearchText(state.skuSearchQuery);
        const tokens = q ? q.split(' ').filter(Boolean) : [];
        const mode = state.skuFilterMode;

        const matches = [];
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;

            if (tokens.length > 0) {
                let ok = true;
                for (let t = 0; t < tokens.length; t++) {
                    if (p.searchNorm.indexOf(tokens[t]) === -1) { ok = false; break; }
                }
                if (!ok) continue;
            }
            matches.push(p);
        }

        if (q) {
            matches.sort((a, b) => {
                const aExact = a.searchSkuNorm === q ? 0 : (a.searchSkuNorm.indexOf(q) === 0 ? 1 : (a.searchNameNorm.indexOf(q) === 0 ? 2 : 3));
                const bExact = b.searchSkuNorm === q ? 0 : (b.searchSkuNorm.indexOf(q) === 0 ? 1 : (b.searchNameNorm.indexOf(q) === 0 ? 2 : 3));
                if (aExact !== bExact) return aExact - bExact;
                if (a.inInv !== b.inInv) return a.inInv ? -1 : 1;
                return a.sku.localeCompare(b.sku, 'es');
            });
        }

        state.filteredProducts = matches;
        renderSkuResultsList();
    }

    function renderSkuResultsList() {
        const listEl = document.getElementById('skuResultsList');
        const badgeEl = document.getElementById('skuListCountBadge');
        if (!listEl) return;

        const totalMatches = state.filteredProducts.length;
        if (badgeEl) badgeEl.textContent = totalMatches.toLocaleString('es-MX');

        const slice = state.filteredProducts.slice(0, 120);
        if (!slice.length) {
            const rawTyped = cleanStr(state.skuSearchQuery).toUpperCase().replace(/\s+/g, '');
            const looksLikeSku = /^[A-Z0-9_-]{3,28}$/.test(rawTyped);
            listEl.innerHTML =
                '<div class="photo-empty-placeholder" style="display:flex;flex-direction:column;gap:8px;padding:18px 12px;">' +
                    '<span>Sin resultados</span>' +
                    (rawTyped.length >= 3
                        ? ('<button type="button" class="hdr-btn is-accent" style="height:30px;padding:0 12px;" onclick="syncSkusNow(\'' + escapeHtml(rawTyped.replace(/'/g, "\\'")) + '\')">↻ Buscar "' + escapeHtml(rawTyped) + '" en ERP</button>')
                        : '') +
                    (looksLikeSku
                        ? ('<button type="button" class="hdr-btn" style="height:28px;padding:0 12px;background:#252C32;color:#FFF;" onclick="useNewManualSku(\'' + escapeHtml(rawTyped.replace(/'/g, "\\'")) + '\')">+ Usar SKU "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                '</div>';
            return;
        }

        listEl.innerHTML = slice.map((p) => {
            const isSel = p.sku === state.selectedSku;
            const fid = extractDriveFileId(p.photoUrl);
            const thumb = p.photoUrl ? buildPhotoThumbUrl(p.photoUrl, 160) : '';

            return (
                '<button type="button" class="sku-item' + (isSel ? ' selected' : '') + '" onclick="selectSkuProduct(\'' + escapeHtml(p.sku.replace(/'/g, "\\'")) + '\')">' +
                    '<div class="sku-mini-thumb">' +
                        (thumb
                            ? ('<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)">')
                            : '<span>—</span>') +
                    '</div>' +
                    '<div class="sku-item-info">' +
                        '<div class="sku-code-row">' +
                            '<span class="sku-code">' + escapeHtml(p.sku) + '</span>' +
                            '<span class="sku-status-badge ' + (p.photoUrl ? 'has-photo' : 'no-photo') + '">' +
                                (p.photoUrl ? 'Foto' : 'Sin foto') +
                            '</span>' +
                        '</div>' +
                        '<div class="sku-name">' + escapeHtml(p.displayName) + '</div>' +
                    '</div>' +
                '</button>'
            );
        }).join('');
    }

    window.selectSkuProduct = function (skuRaw) {
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod) return;

        state.selectedSku = sku;
        hideAssignFeedback();

        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) destSel.value = prod.destFolderId;

        renderSkuResultsList();
        renderSelectedProductStage();
        updateAssignButtonState();
    };

    function renderSelectedProductStage() {
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const rowBadge = document.getElementById('selectedRowBadge');
        const colASku = document.getElementById('selColASku');
        const colBName = document.getElementById('selColBName');
        const catLabel = document.getElementById('selCategoryLabel');

        const curOpenLink = document.getElementById('curPhotoOpenLink');
        const curCanvas = document.getElementById('curPhotoCanvas');

        if (!prod) {
            if (rowBadge) rowBadge.textContent = '—';
            if (colASku) colASku.textContent = '—';
            if (colBName) colBName.textContent = '—';
            if (catLabel) catLabel.textContent = '—';
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curCanvas) curCanvas.innerHTML = '<div class="photo-empty-placeholder">Elige un SKU</div>';
            renderNewPhotoStage();
            return;
        }

        if (rowBadge) {
            rowBadge.textContent = prod.inSheet1 ? ('Fila ' + prod.rowNumber) : 'Nuevo';
        }
        if (colASku) colASku.textContent = prod.sku;
        if (colBName) colBName.textContent = prod.colBName || prod.displayName;
        if (catLabel) catLabel.textContent = prod.destFolderName.replace(/^FOTOS\s+(DE\s+)?/i, '');

        const savedSession = state.sessionSavedBySku.get(prod.sku) || null;
        const curStageTitle = curCanvas && curCanvas.parentElement
            ? curCanvas.parentElement.querySelector('.photo-stage-title')
            : null;

        const showBeforeVsLoaded = savedSession && !state.selectedInboxFileId;
        const leftUrl = showBeforeVsLoaded ? (savedSession.previousUrl || '') : prod.photoUrl;

        if (curStageTitle) {
            curStageTitle.textContent = showBeforeVsLoaded ? 'Foto anterior (Col D)' : 'Foto actual (Col D)';
        }

        if (leftUrl) {
            const fid = extractDriveFileId(leftUrl);
            const previewSrc = buildPhotoThumbUrl(leftUrl, 900);
            if (curOpenLink) {
                curOpenLink.href = leftUrl;
                curOpenLink.classList.remove('hidden');
            }
            if (curCanvas) {
                curCanvas.innerHTML =
                    '<img src="' + escapeHtml(previewSrc) + '" alt="' + escapeHtml(prod.sku) + '" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(fid) + '" ' +
                    'onclick="openPhotoLightbox(\'' + escapeHtml(previewSrc.replace(/'/g, "\\'")) + '\')" ' +
                    'onerror="handlePhotoImgError(this)">';
            }
        } else {
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curCanvas) {
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Sin foto en Columna D</div>';
            }
        }

        renderNewPhotoStage();
    }

    function renderNewPhotoStage() {
        const stageCard = document.getElementById('newPhotoStageCard');
        const stageTitle = document.getElementById('newPhotoStageTitle');
        const clearBtn = document.getElementById('clearSelectedInboxBtn');
        const canvas = document.getElementById('newPhotoCanvas');
        const footWrap = document.getElementById('newPhotoFootWrap');
        const footText = document.getElementById('newPhotoFileText');
        if (!canvas || !stageCard) return;

        const inboxFile = state.selectedInboxFileId
            ? state.inboxFiles.find((f) => f.id === state.selectedInboxFileId)
            : null;
        const savedSession = (!inboxFile && state.selectedSku)
            ? (state.sessionSavedBySku.get(state.selectedSku) || null)
            : null;

        stageCard.classList.remove('is-new-selected', 'is-just-saved');

        if (inboxFile) {
            stageCard.classList.add('is-new-selected');
            if (stageTitle) stageTitle.textContent = 'Foto nueva (SUBIR)';
            if (clearBtn) clearBtn.classList.remove('hidden');
            const previewUrl = inboxFile.localDataUrl || inboxFile.thumbDataUrl || buildPhotoThumbUrl(inboxFile.id, 900);
            canvas.innerHTML =
                '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(inboxFile.name) + '" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(inboxFile.id) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(previewUrl.replace(/'/g, "\\'")) + '\')" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) footText.textContent = inboxFile.name;
            return;
        }

        if (savedSession) {
            stageCard.classList.add('is-just-saved');
            if (stageTitle) stageTitle.textContent = '✅ Foto cargada (Fila ' + savedSession.rowNumber + ')';
            if (clearBtn) clearBtn.classList.add('hidden');
            const savedPreview = savedSession.localDataUrl || buildPhotoThumbUrl(savedSession.fileId || savedSession.newUrl, 900);
            const fid = savedSession.fileId || extractDriveFileId(savedSession.newUrl);
            canvas.innerHTML =
                '<img src="' + escapeHtml(savedPreview) + '" alt="' + escapeHtml(savedSession.sku) + '" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(fid) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(savedPreview.replace(/'/g, "\\'")) + '\')" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) {
                footText.innerHTML = escapeHtml(savedSession.destFolderName) + ' · <a href="' + escapeHtml(savedSession.newUrl) + '" target="_blank" rel="noopener" style="color:#065F46;font-weight:800;">Abrir ↗</a>';
            }
            return;
        }

        if (stageTitle) stageTitle.textContent = 'Foto nueva (SUBIR)';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (footWrap) footWrap.classList.add('hidden');
        canvas.innerHTML = '<div class="photo-empty-placeholder">Elige una foto de SUBIR</div>';
    }

    function updateAssignButtonState() {
        const btn = document.getElementById('btnAssignPhotoNow');
        if (!btn) return;
        const canAssign = !!(state.selectedSku && state.selectedInboxFileId && !state.assignInFlight && !state.uploadInFlight);
        btn.disabled = !canAssign;
        if (!state.assignInFlight) {
            btn.textContent = state.selectedSku ? ('Guardar en ' + state.selectedSku + ' y Mover') : 'Guardar y Mover';
        }
    }

    function showAssignFeedback(msgHtml, isOk) {
        const box = document.getElementById('assignFeedbackBox');
        if (!box) return;
        box.innerHTML = msgHtml;
        box.className = 'assign-feedback-banner ' + (isOk ? 'ok' : 'err');
    }

    function hideAssignFeedback() {
        const box = document.getElementById('assignFeedbackBox');
        if (!box) return;
        box.innerHTML = '';
        box.className = 'assign-feedback-banner hidden';
    }

    function findSuggestedSkuForFileName(fileName) {
        const base = cleanStr(fileName).replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
        if (!base || !state.productBySku.size) return '';
        const upperBase = base.toUpperCase();
        if (state.productBySku.has(upperBase)) return upperBase;

        const firstPart = cleanStr(upperBase.split(/[\s_\-]+/)[0]);
        if (firstPart.length >= 3 && state.productBySku.has(firstPart)) return firstPart;

        const tokens = upperBase.split(/[^A-Z0-9]+/).filter((t) => t.length >= 4);
        for (let i = 0; i < tokens.length; i++) {
            if (state.productBySku.has(tokens[i])) return tokens[i];
        }

        const normBase = normalizeSearchText(base);
        if (normBase.length >= 5) {
            for (let i = 0; i < state.products.length; i++) {
                const pName = normalizeSearchText(state.products[i].displayName);
                if (pName && pName === normBase) return state.products[i].sku;
            }
        }
        return '';
    }

    window.refreshInboxOnly = async function () {
        if (state.inboxLoading) return;
        state.inboxLoading = true;
        const container = document.getElementById('inboxGalleryContainer');
        if (container && !state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Cargando SUBIR...</div>';
        }

        const res = await callWebAppPost('fotos_subir_list', buildOwnerAuthPayload(), 20000);
        state.inboxLoading = false;

        const banner = document.getElementById('webappUpdateBanner');

        if (res && res.ok && Array.isArray(res.files)) {
            state.webappNeedsDeploy = false;
            if (banner) banner.classList.add('hidden');
            state.inboxFiles = res.files;
            if (state.selectedInboxFileId && !state.inboxFiles.some((f) => f.id === state.selectedInboxFileId)) {
                state.selectedInboxFileId = '';
            }
            if (Number(res.hoja1SkusAdded || 0) > 0 && !state.sheetsLoading) {
                loadSheetsCatalog();
            }
            renderInboxGallery();
            renderSelectedProductStage();
            updateAssignButtonState();
            return;
        }

        if (res && res.authRequired) {
            window.lockFotosPortal();
            setGateMessage('Ingresa tu contraseña para conectar Drive.', 'warn');
            return;
        }

        const errMsg = cleanStr(res && res.error);
        if (/Acci[óo]n no reconocida/i.test(errMsg)) {
            state.webappNeedsDeploy = true;
            if (banner) banner.classList.remove('hidden');
            if (container) {
                container.innerHTML =
                    '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                        'Haz clic arriba en <strong>"📋 Copiar código"</strong> y publícalo como <em>Nueva versión</em> en Apps Script para mostrar las fotos de SUBIR.' +
                    '</div>';
            }
            return;
        }

        if (container) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' + escapeHtml(errMsg || 'Reintenta con ↻') + '</div>';
        }
    };

    function renderInboxGallery() {
        const container = document.getElementById('inboxGalleryContainer');
        const badge = document.getElementById('inboxHeaderBadge');
        if (!container) return;

        const q = normalizeSearchText(state.inboxSearchQuery);
        const visible = q
            ? state.inboxFiles.filter((f) => normalizeSearchText(f.name).indexOf(q) !== -1)
            : state.inboxFiles;

        if (badge) badge.textContent = String(visible.length);

        if (!state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Carpeta SUBIR vacía</div>';
            return;
        }

        if (!visible.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Sin coincidencias</div>';
            return;
        }

        container.innerHTML = visible.map((f) => {
            const isSel = f.id === state.selectedInboxFileId;
            const thumb = f.localDataUrl || f.thumbDataUrl || buildPhotoThumbUrl(f.id, 400);
            const sz = formatFileSize(f.sizeBytes);
            const suggestedSku = findSuggestedSkuForFileName(f.name);

            return (
                '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" onclick="selectInboxPhoto(\'' + escapeHtml(f.id) + '\')">' +
                    '<div class="inbox-thumb-box">' +
                        '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(f.name) + '" loading="lazy" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(f.id) + '" onerror="handlePhotoImgError(this)">' +
                    '</div>' +
                    '<div class="inbox-card-meta">' +
                        '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                        '<div class="inbox-file-sub">' +
                            '<span>' + escapeHtml(sz) + '</span>' +
                            '<span style="font-weight:800;color:' + (isSel ? '#A38251' : '#727B84') + ';">' + (isSel ? '✓' : 'Elegir') + '</span>' +
                        '</div>' +
                        (suggestedSku
                            ? ('<button type="button" class="suggest-sku-btn" onclick="applySuggestedSkuFromInbox(\'' + escapeHtml(f.id) + '\', \'' + escapeHtml(suggestedSku.replace(/'/g, "\\'")) + '\', event)">SKU ' + escapeHtml(suggestedSku) + '</button>')
                            : '') +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    window.selectInboxPhoto = function (fileId) {
        const id = cleanStr(fileId);
        if (!id) return;
        state.selectedInboxFileId = state.selectedInboxFileId === id ? '' : id;
        hideAssignFeedback();

        if (state.selectedInboxFileId && !state.selectedSku) {
            const fObj = state.inboxFiles.find((f) => f.id === state.selectedInboxFileId);
            if (fObj) {
                const sug = findSuggestedSkuForFileName(fObj.name);
                if (sug) window.selectSkuProduct(sug);
            }
        }

        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
    };

    window.applySuggestedSkuFromInbox = function (fileId, sku, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        state.selectedInboxFileId = cleanStr(fileId);
        window.selectSkuProduct(sku);
        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
    };

    window.clearSelectedInboxPhoto = function () {
        state.selectedInboxFileId = '';
        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
    };

    function readFileAsOptimizedDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Error al leer archivo.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                if (file.size <= 3200000 || typeof Image === 'undefined') {
                    resolve(rawDataUrl);
                    return;
                }
                const img = new Image();
                img.onerror = () => resolve(rawDataUrl);
                img.onload = () => {
                    try {
                        const maxDim = 2200;
                        let w = img.naturalWidth || img.width;
                        let h = img.naturalHeight || img.height;
                        if (w > maxDim || h > maxDim) {
                            const scale = Math.min(maxDim / w, maxDim / h);
                            w = Math.round(w * scale);
                            h = Math.round(h * scale);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', 0.9));
                    } catch (errC) {
                        resolve(rawDataUrl);
                    }
                };
                img.src = rawDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    window.uploadLocalFilesToSubir = async function (inputEl) {
        const files = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
        if (!files.length || state.uploadInFlight) return;

        state.uploadInFlight = true;
        updateAssignButtonState();

        let lastUploadedId = '';
        let lastLocalPreview = '';

        try {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                const dataUrl = await readFileAsOptimizedDataUrl(f);
                const res = await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                    fileName: f.name,
                    dataUrl: dataUrl
                }, buildOwnerAuthPayload()), 35000);

                if (!res || !res.ok) {
                    const errTxt = cleanStr(res && res.error) || 'Error al subir.';
                    if (/Acci[óo]n no reconocida/i.test(errTxt)) {
                        state.webappNeedsDeploy = true;
                        const banner = document.getElementById('webappUpdateBanner');
                        if (banner) banner.classList.remove('hidden');
                    }
                    showAssignFeedback('❌ ' + escapeHtml(errTxt), false);
                    break;
                }

                if (Array.isArray(res.files)) state.inboxFiles = res.files;
                else if (res.file) state.inboxFiles.unshift(res.file);

                if (res.file && res.file.id) {
                    lastUploadedId = res.file.id;
                    lastLocalPreview = dataUrl;
                    const matchItem = state.inboxFiles.find((it) => it.id === lastUploadedId);
                    if (matchItem) matchItem.localDataUrl = dataUrl;
                }
            }

            if (lastUploadedId) {
                state.selectedInboxFileId = lastUploadedId;
                const matchItem = state.inboxFiles.find((it) => it.id === lastUploadedId);
                if (matchItem && lastLocalPreview) matchItem.localDataUrl = lastLocalPreview;
                renderInboxGallery();
                renderSelectedProductStage();
                showAssignFeedback('✅ Subida a SUBIR.', true);
            }
        } catch (errUp) {
            showAssignFeedback('❌ ' + escapeHtml(errUp && errUp.message ? errUp.message : String(errUp)), false);
        } finally {
            state.uploadInFlight = false;
            if (inputEl) inputEl.value = '';
            updateAssignButtonState();
        }
    };

    window.assignSelectedPhotoToProduct = async function () {
        if (state.assignInFlight) return;
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const inboxFile = state.selectedInboxFileId
            ? state.inboxFiles.find((f) => f.id === state.selectedInboxFileId)
            : null;

        if (!prod || !inboxFile) return;

        const destSelect = document.getElementById('destFolderSelect');
        const targetFolderId = cleanStr(destSelect ? destSelect.value : prod.destFolderId);
        const btn = document.getElementById('btnAssignPhotoNow');

        state.assignInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }
        hideAssignFeedback();

        try {
            const res = await callWebAppPost('fotos_subir_assign', Object.assign({
                sku: prod.sku,
                productName: prod.displayName,
                categoria: prod.categoria,
                tipo: prod.tipo,
                driveFileId: inboxFile.id,
                targetFolderId: targetFolderId
            }, buildOwnerAuthPayload()), 35000);

            if (!res || !res.ok) {
                if (res && res.authRequired) {
                    window.lockFotosPortal();
                    return;
                }
                const errMsg = cleanStr(res && res.error) || 'Error al guardar.';
                if (/Acci[óo]n no reconocida/i.test(errMsg)) {
                    state.webappNeedsDeploy = true;
                    const banner = document.getElementById('webappUpdateBanner');
                    if (banner) banner.classList.remove('hidden');
                }
                showAssignFeedback('❌ ' + escapeHtml(errMsg), false);
                return;
            }

            const prevUrlBeforeSave = cleanStr(res.previousUrl) || prod.photoUrl || '';
            prod.photoUrl = res.newUrl;
            prod.inSheet1 = true;
            if (res.rowNumber) prod.rowNumber = res.rowNumber;
            if (res.productName) {
                prod.colBName = res.productName;
                prod.displayName = res.productName;
            }
            if (res.destFolderId) prod.destFolderId = res.destFolderId;
            if (res.destFolderName) prod.destFolderName = res.destFolderName;

            const logEntry = {
                sku: prod.sku,
                productName: prod.displayName,
                rowNumber: res.rowNumber,
                previousUrl: prevUrlBeforeSave,
                newUrl: res.newUrl,
                fileId: res.fileId || inboxFile.id,
                fileName: res.fileName || inboxFile.name,
                destFolderName: res.destFolderName || prod.destFolderName,
                destFolderUrl: res.destFolderUrl || ('https://drive.google.com/drive/folders/' + targetFolderId),
                localDataUrl: inboxFile.localDataUrl || inboxFile.thumbDataUrl || ''
            };

            state.sessionSavedBySku.set(prod.sku, logEntry);
            state.sessionSavedLogs.unshift(logEntry);

            if (Array.isArray(res.remainingFiles)) {
                state.inboxFiles = res.remainingFiles;
            } else {
                state.inboxFiles = state.inboxFiles.filter((f) => f.id !== inboxFile.id);
            }
            state.selectedInboxFileId = '';

            applySkuFiltersAndRender();
            renderInboxGallery();
            renderSelectedProductStage();
            renderSessionHistoryLog();

            showAssignFeedback(
                '✅ Guardada en Fila ' + escapeHtml(res.rowNumber) + ' y movida a <strong>' + escapeHtml(logEntry.destFolderName) + '</strong>.',
                true
            );
        } finally {
            state.assignInFlight = false;
            updateAssignButtonState();
        }
    };

    function renderSessionHistoryLog() {
        const panel = document.getElementById('sessionHistoryPanel');
        const badge = document.getElementById('sessionSavedCountBadge');
        const listEl = document.getElementById('sessionSavedList');
        if (!panel || !listEl) return;

        if (!state.sessionSavedLogs.length) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');
        if (badge) badge.textContent = String(state.sessionSavedLogs.length);

        listEl.innerHTML = state.sessionSavedLogs.map((item) => (
            '<div class="session-log-row">' +
                '<span><strong>' + escapeHtml(item.sku) + '</strong> → ' + escapeHtml(item.destFolderName) + ' (Fila ' + escapeHtml(item.rowNumber) + ')</span>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button type="button" class="hdr-btn" style="height:24px;background:#252C32;color:#FFF;" onclick="selectSkuProduct(\'' + escapeHtml(item.sku.replace(/'/g, "\\'")) + '\')">Ver</button>' +
                    '<a href="' + escapeHtml(item.newUrl) + '" target="_blank" rel="noopener" class="hdr-btn is-accent" style="height:24px;">Drive ↗</a>' +
                '</div>' +
            '</div>'
        )).join('');
    }

    window.useNewManualSku = function (skuRaw) {
        const sku = cleanStr(skuRaw).toUpperCase().replace(/\s+/g, '');
        if (!sku) return;
        if (!state.productBySku.has(sku)) {
            const dest = resolveCategoryDestFolderForProduct('', '', sku);
            const item = {
                sku: sku,
                colBName: '',
                displayName: sku,
                photoUrl: '',
                rowNumber: null,
                inSheet1: false,
                inInv: false,
                categoria: '',
                tipo: '',
                destFolderId: dest.id,
                destFolderName: dest.name,
                searchSkuNorm: normalizeSearchText(sku),
                searchNameNorm: normalizeSearchText(sku),
                searchNorm: normalizeSearchText(sku)
            };
            state.products.unshift(item);
            state.productBySku.set(sku, item);
        }
        applySkuFiltersAndRender();
        window.selectSkuProduct(sku);
    };

    window.syncSkusNow = async function (querySkuOpt) {
        if (state.syncSkusInFlight) return;
        state.syncSkusInFlight = true;

        const btnHdr = document.getElementById('btnHeaderSyncSkus');
        const btnCard = document.getElementById('btnSyncSkusCard');
        const origHdr = btnHdr ? btnHdr.textContent : '↻ SKUs';
        const origCard = btnCard ? btnCard.textContent : '↻ Actualizar SKUs';

        if (btnHdr) { btnHdr.disabled = true; btnHdr.textContent = 'Sincronizando...'; }
        if (btnCard) { btnCard.disabled = true; btnCard.textContent = 'Sincronizando...'; }
        hideAssignFeedback();

        try {
            const qSku = cleanStr(querySkuOpt || '').toUpperCase();
            let res = await callWebAppPost('fotos_sync_skus', Object.assign({
                querySku: qSku
            }, buildOwnerAuthPayload()), 45000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                res = await callWebAppPost('inv_erp_sync_now', buildOwnerAuthPayload(), 45000);
            }

            await loadSheetsCatalog();

            if (qSku && state.productBySku.has(qSku)) {
                window.selectSkuProduct(qSku);
            }

            const added1 = Number((res && (res.hoja1Added || res.hoja1SkusAdded)) || 0);
            const addedInv = Number((res && (res.invAdded || res.newSkusAdded)) || 0);
            const total1 = state.products.length;
            if (added1 > 0 || addedInv > 0) {
                showAssignFeedback('✅ SKUs actualizados (+' + Math.max(added1, addedInv) + ' nuevos · ' + total1.toLocaleString('es-MX') + ' en total).', true);
            } else {
                showAssignFeedback('✅ SKUs al día (' + total1.toLocaleString('es-MX') + ' productos).', true);
            }
        } catch (errSync) {
            showAssignFeedback('❌ ' + escapeHtml(errSync && errSync.message ? errSync.message : String(errSync)), false);
        } finally {
            state.syncSkusInFlight = false;
            if (btnHdr) { btnHdr.disabled = false; btnHdr.textContent = origHdr; }
            if (btnCard) { btnCard.disabled = false; btnCard.textContent = origCard; }
        }
    };

    window.copyUpdatedAppsScriptCode = async function () {
        const btn = document.getElementById('btnCopyAppsScriptCode');
        const btnHdr = document.getElementById('btnHeaderCopyScript');
        const origText = btn ? btn.textContent : '';
        const origHdr = btnHdr ? btnHdr.textContent : '📋 Script';
        if (btn) { btn.disabled = true; btn.textContent = 'Copiando...'; }
        if (btnHdr) { btnHdr.disabled = true; btnHdr.textContent = 'Copiando...'; }
        try {
            const resp = await fetch('./AppsScript_Creata_Drive_Sheets.gs?_t=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) throw new Error('Error al descargar .gs');
            const code = await resp.text();
            await navigator.clipboard.writeText(code);
            if (btn) btn.textContent = '✅ ¡Copiado! Pégalo en Apps Script';
            if (btnHdr) btnHdr.textContent = '✅ Copiado';
            setTimeout(() => {
                if (btn) { btn.disabled = false; btn.textContent = origText; }
                if (btnHdr) { btnHdr.disabled = false; btnHdr.textContent = origHdr; }
            }, 4500);
        } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = origText; }
            if (btnHdr) { btnHdr.disabled = false; btnHdr.textContent = origHdr; }
            alert('Error al copiar: ' + (err && err.message ? err.message : String(err)));
        }
    };

    window.refreshAllPhotoWorkspace = async function () {
        if (!state.unlocked) return;
        await Promise.all([
            loadSheetsCatalog(),
            window.refreshInboxOnly()
        ]);
    };

    window.openPhotoLightbox = function (url) {
        const clean = cleanStr(url);
        if (!clean) return;
        const box = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImg');
        if (!box || !img) return;
        img.src = clean;
        box.classList.remove('hidden');
    };

    window.closePhotoLightbox = function () {
        const box = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImg');
        if (box) box.classList.add('hidden');
        if (img) img.src = '';
    };

    function initFotosApp() {
        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        populateDestFolderSelect();

        const skuInp = document.getElementById('skuSearchInput');
        const clrBtn = document.getElementById('skuSearchClearBtn');
        let searchTimer = null;
        if (skuInp) {
            skuInp.addEventListener('input', () => {
                const val = skuInp.value || '';
                if (clrBtn) clrBtn.classList.toggle('hidden', !val.trim());
                if (searchTimer) clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    state.skuSearchQuery = val;
                    applySkuFiltersAndRender();
                }, 80);
            });
            skuInp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    state.skuSearchQuery = skuInp.value || '';
                    applySkuFiltersAndRender();
                    if (state.filteredProducts.length > 0) {
                        window.selectSkuProduct(state.filteredProducts[0].sku);
                    }
                }
            });
        }

        const inboxInp = document.getElementById('inboxSearchInput');
        if (inboxInp) {
            inboxInp.addEventListener('input', () => {
                state.inboxSearchQuery = inboxInp.value || '';
                renderInboxGallery();
            });
        }

        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') window.closePhotoLightbox();
        });

        const sess = checkExistingFotosOwnerSession();
        if (sess.valid) {
            state.authToken = sess.authToken || '';
            state.accessKey = sess.accessKey || '';
            unlockFotosPortal();
        } else {
            if (sess.otherEmail) {
                setGateMessage('Solo autorizado para ' + OWNER_EMAIL, 'error');
            } else if (sess.needsReauth) {
                setGateMessage('Ingresa tu contraseña.', 'warn');
            }
            const pwdInp = document.getElementById('ownerPasswordInput');
            if (pwdInp) setTimeout(() => pwdInp.focus(), 80);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFotosApp);
    } else {
        initFotosApp();
    }
})();
