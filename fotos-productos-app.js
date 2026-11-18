(function () {
    'use strict';

    // =========================================================================
    // CONFIGURACIÓN EXCLUSIVA — TITULAR: kevin.reyna@grupoanipa.com
    // Documento Maestro: CONTROL DE PRODUCTOS PRESENTACIÓN
    // Hoja "1" (gid=620514545): Col A = SKU · Col B = NOMBRE · Col D = LINK FOTO APP
    // Bandeja Drive "SUBIR": 11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p
    // Destino Categorías: 1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN (CATEGORIAS MUEBLES Y ACCESORIOS)
    // =========================================================================
    const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const OWNER_DISPLAY_NAME = 'Kevin Reyna';
    const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
    const SUBIR_FOLDER_ID = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p';
    const CATEGORIAS_ROOT_FOLDER_ID = '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN';
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

    const FOTOS_SESSION_KEY = 'creata_private_kevin_fotos_v1';
    const FOTOS_SECRET_SESSION_KEY = 'creata_private_kevin_fotos_sec_v1';
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

    // =========================================================================
    // UTILIDADES GENERALES Y NORMALIZACIÓN
    // =========================================================================
    function cleanStr(val) {
        if (val === null || val === undefined) return '';
        return String(val).trim();
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
        if (!s) return '';
        if (/^#(N\/A|REF!|VALUE!|ERROR!|NAME\?)/i.test(s)) return '';
        if (/^https?:\/\//i.test(s)) return s;
        return '';
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
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function cleanKeyCellValue(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') {
            return Number.isInteger(val) ? String(val) : String(Math.trunc(val));
        }
        let s = String(val).trim();
        if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
        return s;
    }

    function keysMatchNormalized(a, b) {
        const s1 = String(a || '').trim();
        const s2 = String(b || '').trim();
        if (!s1 || !s2) return false;
        if (s1 === s2) return true;
        const c1 = s1.replace(/\s+/g, '');
        const c2 = s2.replace(/\s+/g, '');
        return !!c1 && c1 === c2;
    }

    // Fallback escalonado de miniaturas Drive por si Google aplica redirección
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
            parent.innerHTML = '<div class="photo-empty-placeholder">Vista previa protegida por el navegador · Usa "Abrir link" arriba para verla en Drive.</div>';
        }
    };

    // =========================================================================
    // RESOLUCIÓN AUTOMÁTICA DE CARPETA DE CATEGORÍA EN DRIVE
    // (Idéntica a resolveCategoryDestFolderForProduct_ en AppsScript)
    // =========================================================================
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

    // =========================================================================
    // LECTURA EN VIVO DE GOOGLE SHEETS (CSV + RESPALDO JSONP) Y APPS SCRIPT POST
    // =========================================================================
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
                    if (i + 1 < len && text[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cur += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(cur);
                cur = '';
            } else if (ch === '\r') {
                if (i + 1 < len && text[i + 1] === '\n') i++;
                row.push(cur);
                rows.push(row);
                row = [];
                cur = '';
            } else if (ch === '\n') {
                row.push(cur);
                rows.push(row);
                row = [];
                cur = '';
            } else {
                cur += ch;
            }
        }
        if (cur.length > 0 || row.length > 0) {
            row.push(cur);
            rows.push(row);
        }
        return rows;
    }

    function fetchSheetViaJsonp(sheetName, rangeStr) {
        return new Promise((resolve) => {
            if (typeof document === 'undefined' || !document.head) {
                resolve(null);
                return;
            }
            const cbName = '__creataFotosGviz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
            let scriptEl = null;
            let settled = false;

            const cleanup = () => {
                window[cbName] = function () {};
                setTimeout(() => {
                    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                }, 60000);
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
                    if (!resp || !resp.table || !Array.isArray(resp.table.rows)) {
                        resolve(null);
                        return;
                    }
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
                            if (!cell) {
                                arr[i] = '';
                            } else if (cell.f !== undefined && cell.f !== null && String(cell.f) !== '') {
                                arr[i] = String(cell.f);
                            } else if (cell.v !== undefined && cell.v !== null) {
                                arr[i] = String(cell.v);
                            } else {
                                arr[i] = '';
                            }
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
            const json = await resp.json();
            return json || { ok: false, unavailable: true };
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

    // =========================================================================
    // CANDADO DE ACCESO EXCLUSIVO (SOLO kevin.reyna@grupoanipa.com)
    // =========================================================================
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

        const candidateKeys = [FOTOS_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
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
                        return {
                            valid: true,
                            authToken: tok,
                            accessKey: cachedSecret
                        };
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

        refreshAllPhotoWorkspace(false);
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
        setGateMessage('Sesión bloqueada. Ingresa tu contraseña personal para volver a abrir el gestor de fotografías.', 'warn');
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
        if (btn) btn.textContent = hiddenNow ? 'Ocultar' : 'Mostrar';
    };

    window.submitOwnerFotosLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailInp = document.getElementById('ownerEmailInput');
        const pwdInp = document.getElementById('ownerPasswordInput');
        const submitBtn = document.getElementById('btnOwnerLoginSubmit');

        const typedEmail = normalizeEmailInput(emailInp ? emailInp.value : OWNER_EMAIL);
        const typedKey = cleanStr(pwdInp ? pwdInp.value : '');

        if (typedEmail !== OWNER_EMAIL) {
            setGateMessage('Acceso exclusivo denegado: únicamente está autorizado ' + OWNER_EMAIL + '.', 'error');
            return;
        }
        if (!typedKey) {
            setGateMessage('Ingresa tu contraseña personal para abrir el gestor de fotografías.', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verificando acceso exclusivo...';
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
                    setGateMessage('No se pudo conectar con Google Sheets para verificar tu acceso. Revisa tu conexión.', 'error');
                    return;
                }
                let localKeyMap = {};
                try {
                    localKeyMap = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}') || {};
                } catch (e) {}

                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i] || [];
                    const em = normalizeEmailInput(r[4]);
                    if (em !== OWNER_EMAIL) continue;
                    let tempKey = cleanKeyCellValue(r[5]);
                    let defKey = cleanKeyCellValue(r[6]);
                    const localUpd = localKeyMap[OWNER_EMAIL];
                    if (!defKey && localUpd && localUpd.newKey) {
                        defKey = localUpd.newKey;
                        tempKey = '';
                    }
                    if ((defKey && keysMatchNormalized(typedKey, defKey)) || (!defKey && tempKey && keysMatchNormalized(typedKey, tempKey))) {
                        verified = true;
                        break;
                    }
                }
                if (!verified) {
                    setGateMessage('Contraseña incorrecta. Usa tu contraseña personal del sistema.', 'error');
                    return;
                }
            }

            if (verified) {
                const issuedToken = cleanStr(
                    (cloudRes && (cloudRes.authToken || (cloudRes.user && cloudRes.user.authToken))) || ''
                );
                state.authToken = issuedToken;
                state.accessKey = typedKey;
                try {
                    localStorage.setItem(FOTOS_SESSION_KEY, JSON.stringify({
                        correo: OWNER_EMAIL,
                        nombre: OWNER_DISPLAY_NAME,
                        sheetTab: 'PROYECTOS',
                        authToken: issuedToken,
                        verifiedAt: Date.now()
                    }));
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
                submitBtn.textContent = 'Entrar al Gestor de Fotos';
            }
        }
    };

    // =========================================================================
    // CARGA Y CRUCE DE HOJA "1" (A=SKU, B=NOMBRE, D=LINK FOTO) + INVENTARIO_EN_VIVO
    // =========================================================================
    function updateSyncStatusText(text) {
        const el = document.getElementById('liveSyncStatusText');
        if (el) el.textContent = text;
    }

    async function loadSheetsCatalog() {
        state.sheetsLoading = true;
        const listEl = document.getElementById('skuResultsList');
        if (listEl && !state.products.length) {
            listEl.innerHTML = '<div class="photo-empty-placeholder">Leyendo Hoja "1" (Columnas A, B y D) e INVENTARIO_EN_VIVO en tiempo real...</div>';
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
                        variante: cleanStr(r[4]),
                        fotoInv: cleanPhotoUrl(r[5]),
                        categoria: cleanStr(r[6])
                    });
                }
            }
        }

        const mergedMap = new Map();
        let sheet1Count = 0;

        if (Array.isArray(rows1)) {
            for (let i = 1; i < rows1.length; i++) {
                // Fila 1 (i=0) es encabezado; Fila 2 (i=1) contiene ARRAYFORMULA/MAP maestras (SKU vacío)
                const r = rows1[i] || [];
                const sku = cleanStr(r[0]).toUpperCase();
                if (!sku || sku === 'SKU') continue;

                const rowNum = i + 1;
                const colBName = cleanStr(r[1]);
                const colDUrl = cleanPhotoUrl(r[3]);
                const inv = invMap.get(sku) || null;

                if (!mergedMap.has(sku)) {
                    sheet1Count++;
                    const displayName = colBName || (inv ? inv.nombreInv : '') || '';
                    const dest = resolveCategoryDestFolderForProduct(
                        inv ? inv.categoria : '',
                        inv ? inv.tipo : '',
                        displayName
                    );
                    mergedMap.set(sku, {
                        sku: sku,
                        colBName: colBName,
                        displayName: displayName || '(Sin nombre en Inventario Vivo)',
                        photoUrl: colDUrl,
                        rowNumber: rowNum,
                        extraRows: [],
                        inSheet1: true,
                        inInv: !!inv,
                        categoria: inv ? inv.categoria : '',
                        tipo: inv ? inv.tipo : '',
                        modelo: inv ? inv.modelo : '',
                        destFolderKey: dest.key,
                        destFolderId: dest.id,
                        destFolderName: dest.name,
                        searchNorm: ''
                    });
                } else {
                    const existing = mergedMap.get(sku);
                    existing.extraRows.push(rowNum);
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

        // Agregar SKUs activos de INVENTARIO_EN_VIVO que aún no estén dados de alta en la Hoja "1"
        let invOnlyCount = 0;
        invMap.forEach((inv, sku) => {
            if (mergedMap.has(sku)) return;
            invOnlyCount++;
            const displayName = inv.nombreInv || [inv.tipo, inv.modelo].filter(Boolean).join(' ') || sku;
            const dest = resolveCategoryDestFolderForProduct(inv.categoria, inv.tipo, displayName);
            mergedMap.set(sku, {
                sku: sku,
                colBName: '',
                displayName: displayName,
                photoUrl: '',
                rowNumber: null,
                extraRows: [],
                inSheet1: false,
                inInv: true,
                categoria: inv.categoria,
                tipo: inv.tipo,
                modelo: inv.modelo,
                destFolderKey: dest.key,
                destFolderId: dest.id,
                destFolderName: dest.name,
                searchNorm: ''
            });
        });

        // Conservar cambios recién guardados en esta sesión frente a caché temporal de gviz
        state.sessionSavedBySku.forEach((savedMeta, sku) => {
            const item = mergedMap.get(sku);
            if (item && savedMeta && savedMeta.newUrl) {
                item.photoUrl = savedMeta.newUrl;
                item.inSheet1 = true;
                if (savedMeta.rowNumber) item.rowNumber = savedMeta.rowNumber;
                if (savedMeta.productName && (!item.colBName || item.displayName.startsWith('(Sin nombre'))) {
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

        // Ordenar priorizando productos activos en INVENTARIO_EN_VIVO y luego orden alfabético por Nombre / SKU
        list.sort((a, b) => {
            if (a.inInv !== b.inInv) return a.inInv ? -1 : 1;
            return a.displayName.localeCompare(b.displayName, 'es') || a.sku.localeCompare(b.sku, 'es');
        });

        state.products = list;
        state.productBySku = mergedMap;
        state.sheetsLoading = false;

        updateKpiCards(sheet1Count, invOnlyCount);
        applySkuFiltersAndRender();
        if (state.selectedSku) {
            renderSelectedProductStage();
        }
    }

    function updateKpiCards(sheet1CountOpt, invOnlyCountOpt) {
        const total = state.products.length;
        let withPhoto = 0;
        let inSheet1Total = 0;
        for (let i = 0; i < total; i++) {
            if (state.products[i].photoUrl) withPhoto++;
            if (state.products[i].inSheet1) inSheet1Total++;
        }
        const withoutPhoto = Math.max(0, total - withPhoto);
        const s1 = typeof sheet1CountOpt === 'number' ? sheet1CountOpt : inSheet1Total;
        const invExtra = typeof invOnlyCountOpt === 'number' ? invOnlyCountOpt : Math.max(0, total - inSheet1Total);

        const elTotal = document.getElementById('kpiTotalSkus');
        const elTotalSub = document.getElementById('kpiTotalSkusSub');
        const elWith = document.getElementById('kpiWithPhoto');
        const elWithout = document.getElementById('kpiWithoutPhoto');
        const elInbox = document.getElementById('kpiInboxCount');
        const elInboxSub = document.getElementById('kpiInboxSub');

        if (elTotal) elTotal.textContent = total.toLocaleString('es-MX');
        if (elTotalSub) {
            elTotalSub.textContent = s1.toLocaleString('es-MX') + ' en Hoja "1"' +
                (invExtra > 0 ? (' + ' + invExtra.toLocaleString('es-MX') + ' nuevos en Inventario') : '');
        }
        if (elWith) elWith.textContent = withPhoto.toLocaleString('es-MX');
        if (elWithout) elWithout.textContent = withoutPhoto.toLocaleString('es-MX');
        if (elInbox) elInbox.textContent = state.inboxFiles.length.toLocaleString('es-MX');
        if (elInboxSub) {
            elInboxSub.textContent = state.webappNeedsDeploy
                ? 'Pendiente publicar versión en Apps Script'
                : (state.inboxFiles.length === 1 ? '1 imagen lista para acomodar' : (state.inboxFiles.length + ' imágenes listas en SUBIR'));
        }
    }

    // =========================================================================
    // BUSCADOR Y FILTROS DE HOJA "1" (COL A = SKU · COL B = NOMBRE)
    // =========================================================================
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
        const btns = document.querySelectorAll('.filter-pill[data-filter]');
        btns.forEach((b) => {
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
                    if (p.searchNorm.indexOf(tokens[t]) === -1) {
                        ok = false;
                        break;
                    }
                }
                if (!ok) continue;
            }
            matches.push(p);
        }

        // Si hay texto buscado, priorizar coincidencia exacta de SKU, luego prefijo de SKU, luego prefijo de Nombre
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
        const hintEl = document.getElementById('skuResultsHint');
        if (!listEl) return;

        const totalMatches = state.filteredProducts.length;
        if (badgeEl) {
            badgeEl.textContent = totalMatches.toLocaleString('es-MX') + (totalMatches === 1 ? ' resultado' : ' resultados');
        }

        const MAX_RENDER = 120;
        const slice = state.filteredProducts.slice(0, MAX_RENDER);
        if (hintEl) {
            if (!totalMatches) {
                hintEl.textContent = 'Sin coincidencias para el filtro actual';
            } else if (totalMatches > MAX_RENDER) {
                hintEl.textContent = 'Mostrando primeros ' + MAX_RENDER + ' de ' + totalMatches.toLocaleString('es-MX') + ' — escribe SKU o Nombre para acotar';
            } else {
                hintEl.textContent = 'Haz clic en un producto para ver su foto actual y asignarle una nueva';
            }
        }

        if (!slice.length) {
            listEl.innerHTML = '<div class="photo-empty-placeholder">No se encontraron productos con ese SKU o Nombre.</div>';
            return;
        }

        listEl.innerHTML = slice.map((p) => {
            const isSel = p.sku === state.selectedSku;
            const fid = extractDriveFileId(p.photoUrl);
            const thumb = p.photoUrl ? buildPhotoThumbUrl(p.photoUrl, 160) : '';
            const rowTag = p.inSheet1
                ? ('Hoja "1" · Fila ' + p.rowNumber)
                : 'Nuevo para Hoja "1" (en Inventario)';
            const catTag = p.destFolderName.replace(/^FOTOS\s+(DE\s+)?/i, '');

            return (
                '<button type="button" class="sku-item' + (isSel ? ' selected' : '') + '" onclick="selectSkuProduct(\'' + escapeHtml(p.sku.replace(/'/g, "\\'")) + '\')">' +
                    '<div class="sku-mini-thumb">' +
                        (thumb
                            ? ('<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(p.sku) + '" loading="lazy" data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)">')
                            : '<span>SIN</span>') +
                    '</div>' +
                    '<div class="sku-item-info">' +
                        '<div class="sku-code-row">' +
                            '<span class="sku-code">' + escapeHtml(p.sku) + '</span>' +
                            '<span class="sku-status-badge ' + (p.photoUrl ? 'has-photo' : 'no-photo') + '">' +
                                (p.photoUrl ? 'Con foto' : 'Sin foto') +
                            '</span>' +
                        '</div>' +
                        '<div class="sku-name">' + escapeHtml(p.displayName) + '</div>' +
                        '<div class="sku-submeta">' + escapeHtml(rowTag + ' · Destino: ' + catTag) + '</div>' +
                    '</div>' +
                '</button>'
            );
        }).join('');
    }

    // =========================================================================
    // SELECCIÓN DE PRODUCTO Y DOBLE COMPARADOR VISUAL (ACTUAL vs SUBIR / CARGADA)
    // =========================================================================
    window.selectSkuProduct = function (skuRaw) {
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod) return;

        state.selectedSku = sku;
        hideAssignFeedback();

        // Seleccionar automáticamente su carpeta de categoría sugerida en el desplegable
        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) {
            destSel.value = prod.destFolderId;
        }

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
        const curUrlText = document.getElementById('curPhotoUrlText');

        if (!prod) {
            if (rowBadge) rowBadge.textContent = 'Sin producto seleccionado';
            if (colASku) colASku.textContent = '—';
            if (colBName) colBName.textContent = 'Selecciona un producto a la izquierda';
            if (catLabel) catLabel.textContent = '—';
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curCanvas) {
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Selecciona un SKU para visualizar la foto actual registrada en la Columna D de la Hoja "1".</div>';
            }
            if (curUrlText) curUrlText.textContent = 'Columna D: sin seleccionar';
            renderNewPhotoStage();
            return;
        }

        if (rowBadge) {
            rowBadge.textContent = prod.inSheet1
                ? ('Hoja "1" · Fila ' + prod.rowNumber + (prod.extraRows.length ? (' (+' + prod.extraRows.length + ' duplicada)') : ''))
                : 'Se agregará al final de Hoja "1" (sin tocar Fila 2)';
        }
        if (colASku) colASku.textContent = prod.sku;
        if (colBName) {
            colBName.textContent = prod.colBName
                ? prod.colBName
                : (prod.inInv ? (prod.displayName + ' (se calcula automático con B2)') : prod.displayName);
        }
        if (catLabel) {
            const catParts = [prod.categoria || prod.tipo || 'Catálogo General', '→ ' + prod.destFolderName];
            catLabel.textContent = catParts.join(' ');
        }

        // Verificar si este SKU acaba de ser actualizado en esta sesión para poder comparar foto previa vs foto ya cargada
        const savedSession = state.sessionSavedBySku.get(prod.sku) || null;
        const curStageTitle = curCanvas && curCanvas.parentElement
            ? curCanvas.parentElement.querySelector('.photo-stage-title')
            : null;

        // Si el usuario NO tiene otra foto de SUBIR preseleccionada y este SKU ya fue guardado en esta sesión
        // mostramos a la izquierda la foto que tenía antes (o la actual si estaba vacío) y a la derecha la foto que ya cargó
        const showBeforeVsLoaded = savedSession && !state.selectedInboxFileId;
        const leftUrl = showBeforeVsLoaded ? (savedSession.previousUrl || '') : prod.photoUrl;

        if (curStageTitle) {
            curStageTitle.textContent = showBeforeVsLoaded
                ? (savedSession.previousUrl ? 'Foto que estaba antes (Columna D previa)' : 'Estado anterior en Columna D (estaba sin foto)')
                : 'Foto que ya está (Columna D actual)';
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
                    '<img src="' + escapeHtml(previewSrc) + '" alt="Foto actual ' + escapeHtml(prod.sku) + '" ' +
                    'data-drive-id="' + escapeHtml(fid) + '" ' +
                    'onclick="openPhotoLightbox(\'' + escapeHtml(previewSrc.replace(/'/g, "\\'")) + '\')" ' +
                    'onerror="handlePhotoImgError(this)">';
            }
            if (curUrlText) {
                curUrlText.textContent = leftUrl;
                curUrlText.title = leftUrl;
            }
        } else {
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curCanvas) {
                curCanvas.innerHTML = showBeforeVsLoaded
                    ? '<div class="photo-empty-placeholder">Antes de tu carga, este SKU (' + escapeHtml(prod.sku) + ') <strong>no tenía foto</strong> en la Columna D. A la derecha ves la foto que ya cargaste.</div>'
                    : '<div class="photo-empty-placeholder">Este producto (<strong>' + escapeHtml(prod.sku) + '</strong>) actualmente <strong>NO tiene foto</strong> en la Columna D de la Hoja "1".</div>';
            }
            if (curUrlText) {
                curUrlText.textContent = showBeforeVsLoaded
                    ? 'Columna D previa: vacía'
                    : 'Columna D: vacía (sin URL asignada)';
                curUrlText.title = '';
            }
        }

        renderNewPhotoStage();
    }

    function renderNewPhotoStage() {
        const stageCard = document.getElementById('newPhotoStageCard');
        const stageTitle = document.getElementById('newPhotoStageTitle');
        const clearBtn = document.getElementById('clearSelectedInboxBtn');
        const canvas = document.getElementById('newPhotoCanvas');
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
            if (stageTitle) stageTitle.textContent = 'Foto seleccionada de SUBIR (lista para cargar)';
            if (clearBtn) clearBtn.classList.remove('hidden');
            const previewUrl = inboxFile.localDataUrl || buildPhotoThumbUrl(inboxFile.id, 900);
            canvas.innerHTML =
                '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(inboxFile.name) + '" ' +
                'data-drive-id="' + escapeHtml(inboxFile.id) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(previewUrl.replace(/'/g, "\\'")) + '\')" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footText) {
                const sz = formatFileSize(inboxFile.sizeBytes);
                footText.textContent = 'SUBIR: ' + inboxFile.name + (sz ? (' (' + sz + ')') : '');
                footText.title = inboxFile.name;
            }
            return;
        }

        if (savedSession) {
            stageCard.classList.add('is-just-saved');
            if (stageTitle) stageTitle.textContent = '✅ Foto que ya cargó (activa en Hoja "1" · Fila ' + savedSession.rowNumber + ')';
            if (clearBtn) clearBtn.classList.add('hidden');
            const savedPreview = savedSession.localDataUrl || buildPhotoThumbUrl(savedSession.fileId || savedSession.newUrl, 900);
            const fid = savedSession.fileId || extractDriveFileId(savedSession.newUrl);
            canvas.innerHTML =
                '<img src="' + escapeHtml(savedPreview) + '" alt="Foto cargada ' + escapeHtml(savedSession.sku) + '" ' +
                'data-drive-id="' + escapeHtml(fid) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(savedPreview.replace(/'/g, "\\'")) + '\')" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footText) {
                footText.innerHTML =
                    'Movida a <strong>' + escapeHtml(savedSession.destFolderName) + '</strong> · ' +
                    '<a href="' + escapeHtml(savedSession.newUrl) + '" target="_blank" rel="noopener" style="color:#065F46;font-weight:800;">Abrir en Drive ↗</a>';
                footText.title = savedSession.newUrl;
            }
            return;
        }

        if (stageTitle) stageTitle.textContent = 'Foto seleccionada de SUBIR (por cargar)';
        if (clearBtn) clearBtn.classList.add('hidden');
        canvas.innerHTML =
            '<div class="photo-empty-placeholder">Elige abajo una imagen de la bandeja <strong>SUBIR</strong> (o sube una desde tu PC) para previsualizarla aquí antes de guardarla en Columna D.</div>';
        if (footText) {
            footText.textContent = 'Ninguna foto de SUBIR seleccionada';
            footText.title = '';
        }
    }

    function updateAssignButtonState() {
        const btn = document.getElementById('btnAssignPhotoNow');
        if (!btn) return;
        const canAssign = !!(state.selectedSku && state.selectedInboxFileId && !state.assignInFlight && !state.uploadInFlight);
        btn.disabled = !canAssign;
        if (!state.assignInFlight) {
            if (state.selectedSku && state.selectedInboxFileId) {
                btn.textContent = 'Guardar en Columna D (' + state.selectedSku + ') y Mover a Categoría';
            } else {
                btn.textContent = 'Guardar en Columna D y Mover a su Categoría';
            }
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

    // =========================================================================
    // BANDEJA GOOGLE DRIVE "SUBIR" (LECTURA, CARGA DESDE PC Y ASIGNACIÓN)
    // =========================================================================
    function findSuggestedSkuForFileName(fileName) {
        const base = cleanStr(fileName).replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
        if (!base || !state.productBySku.size) return '';
        const upperBase = base.toUpperCase();

        if (state.productBySku.has(upperBase)) return upperBase;

        // Probar primer bloque antes de guion o espacio (ej. "GAFGL7824 - Accesorio.jpg" o "2019 foto.png")
        const firstPart = cleanStr(upperBase.split(/[\s_\-]+/)[0]);
        if (firstPart.length >= 3 && state.productBySku.has(firstPart)) {
            return firstPart;
        }

        const tokens = upperBase.split(/[^A-Z0-9]+/).filter((t) => t.length >= 4);
        for (let i = 0; i < tokens.length; i++) {
            if (state.productBySku.has(tokens[i])) return tokens[i];
        }
        return '';
    }

    window.refreshInboxOnly = async function () {
        if (state.inboxLoading) return;
        state.inboxLoading = true;
        const container = document.getElementById('inboxGalleryContainer');
        if (container && !state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Consultando carpeta Drive "SUBIR"...</div>';
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
            updateKpiCards();
            renderInboxGallery();
            renderSelectedProductStage();
            updateAssignButtonState();
            return;
        }

        if (res && res.authRequired) {
            window.lockFotosPortal();
            setGateMessage(res.error || 'Vuelve a ingresar tu contraseña personal para autorizar Drive.', 'warn');
            return;
        }

        const errMsg = cleanStr(res && res.error);
        if (/Acci[óo]n no reconocida/i.test(errMsg)) {
            state.webappNeedsDeploy = true;
            if (banner) banner.classList.remove('hidden');
            updateKpiCards();
            if (container) {
                container.innerHTML =
                    '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                        'Para leer y mover archivos automáticamente de la carpeta <strong>SUBIR</strong>, haz clic arriba en ' +
                        '<strong>"📋 Copiar código Apps Script actualizado"</strong> y publica una <em>Nueva versión</em> en Google Sheets (toma 20 segundos).' +
                    '</div>';
            }
            return;
        }

        if (container) {
            container.innerHTML =
                '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                    escapeHtml(errMsg || 'No se pudo consultar la carpeta SUBIR en este momento. Haz clic en "↻ Refrescar SUBIR".') +
                '</div>';
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

        if (badge) {
            badge.textContent = visible.length + (visible.length === 1 ? ' archivo en SUBIR' : ' archivos en SUBIR');
        }

        if (!state.inboxFiles.length) {
            container.innerHTML =
                '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                    'La carpeta <strong>SUBIR</strong> está limpia en este momento (0 fotos pendientes).<br>' +
                    'Arrastra fotos a <a href="https://drive.google.com/drive/folders/' + SUBIR_FOLDER_ID + '" target="_blank" rel="noopener" style="color:#A38251;font-weight:800;">Drive SUBIR ↗</a> ' +
                    'o usa el botón <strong>"+ Subir foto desde mi PC a SUBIR"</strong>.' +
                '</div>';
            return;
        }

        if (!visible.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Ningún archivo en SUBIR coincide con "' + escapeHtml(state.inboxSearchQuery) + '".</div>';
            return;
        }

        container.innerHTML = visible.map((f) => {
            const isSel = f.id === state.selectedInboxFileId;
            const thumb = f.localDataUrl || buildPhotoThumbUrl(f.id, 400);
            const sz = formatFileSize(f.sizeBytes);
            const suggestedSku = findSuggestedSkuForFileName(f.name);

            return (
                '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" onclick="selectInboxPhoto(\'' + escapeHtml(f.id) + '\')">' +
                    '<div class="inbox-thumb-box">' +
                        '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(f.name) + '" loading="lazy" data-drive-id="' + escapeHtml(f.id) + '" onerror="handlePhotoImgError(this)">' +
                    '</div>' +
                    '<div class="inbox-card-meta">' +
                        '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                        '<div class="inbox-file-sub">' +
                            '<span>' + escapeHtml(sz || 'Imagen') + '</span>' +
                            '<span style="font-weight:800; color:' + (isSel ? '#A38251' : '#727B84') + ';">' + (isSel ? '✓ Elegida' : 'Elegir') + '</span>' +
                        '</div>' +
                        (suggestedSku
                            ? ('<button type="button" class="suggest-sku-btn" onclick="applySuggestedSkuFromInbox(\'' + escapeHtml(f.id) + '\', \'' + escapeHtml(suggestedSku.replace(/'/g, "\\'")) + '\', event)">⚡ Vincular SKU ' + escapeHtml(suggestedSku) + '</button>')
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

        // Si el archivo tiene el SKU en el nombre y aún no había SKU seleccionado, autoseleccionarlo
        if (state.selectedInboxFileId && !state.selectedSku) {
            const fObj = state.inboxFiles.find((f) => f.id === state.selectedInboxFileId);
            if (fObj) {
                const sug = findSuggestedSkuForFileName(fObj.name);
                if (sug) {
                    window.selectSkuProduct(sug);
                }
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

    // =========================================================================
    // SUBIR IMAGEN DESDE LA PC DIRECTAMENTE A LA CARPETA "SUBIR" DE DRIVE
    // =========================================================================
    function readFileAsOptimizedDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer el archivo local.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                // Si pesa menos de 3.2 MB se envía intacta; si es muy pesada se optimiza máx 2200px para rapidez en Apps Script
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
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
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
        updateSyncStatusText('Subiendo ' + files.length + ' imagen(es) a carpeta Drive SUBIR...');

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
                    const errTxt = cleanStr(res && res.error) || 'No se pudo subir la foto a SUBIR.';
                    if (/Acci[óo]n no reconocida/i.test(errTxt)) {
                        state.webappNeedsDeploy = true;
                        const banner = document.getElementById('webappUpdateBanner');
                        if (banner) banner.classList.remove('hidden');
                    }
                    showAssignFeedback('❌ ' + escapeHtml(errTxt), false);
                    break;
                }

                if (Array.isArray(res.files)) {
                    state.inboxFiles = res.files;
                } else if (res.file) {
                    state.inboxFiles.unshift(res.file);
                }
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
                updateKpiCards();
                renderInboxGallery();
                renderSelectedProductStage();
                showAssignFeedback('✅ Imagen cargada en la carpeta <strong>SUBIR</strong> y preseleccionada para guardar.', true);
            }
        } catch (errUp) {
            showAssignFeedback('❌ Error al preparar imagen: ' + escapeHtml(errUp && errUp.message ? errUp.message : String(errUp)), false);
        } finally {
            state.uploadInFlight = false;
            if (inputEl) inputEl.value = '';
            updateAssignButtonState();
            updateSyncStatusText('Sincronizado con Hoja "1" y carpeta SUBIR');
        }
    };

    // =========================================================================
    // GUARDAR URL EN COLUMNA D DE HOJA "1" + MOVER DE "SUBIR" A SU CATEGORÍA
    // =========================================================================
    window.assignSelectedPhotoToProduct = async function () {
        if (state.assignInFlight) return;
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const inboxFile = state.selectedInboxFileId
            ? state.inboxFiles.find((f) => f.id === state.selectedInboxFileId)
            : null;

        if (!prod) {
            showAssignFeedback('Selecciona primero un producto (SKU o Nombre) en la lista izquierda.', false);
            return;
        }
        if (!inboxFile) {
            showAssignFeedback('Selecciona primero una fotografía de la carpeta SUBIR.', false);
            return;
        }

        const destSelect = document.getElementById('destFolderSelect');
        const targetFolderId = cleanStr(destSelect ? destSelect.value : prod.destFolderId);
        const btn = document.getElementById('btnAssignPhotoNow');

        state.assignInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Moviendo de SUBIR y guardando en Hoja "1"...';
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
                    setGateMessage(res.error || 'Confirma tu contraseña personal para guardar cambios.', 'warn');
                    return;
                }
                const errMsg = cleanStr(res && res.error) || 'No se pudo completar el movimiento en Drive / Google Sheets.';
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
                wasAppended: !!res.wasAppended,
                previousUrl: prevUrlBeforeSave,
                newUrl: res.newUrl,
                fileId: res.fileId || inboxFile.id,
                fileName: res.fileName || inboxFile.name,
                destFolderName: res.destFolderName || prod.destFolderName,
                destFolderUrl: res.destFolderUrl || ('https://drive.google.com/drive/folders/' + targetFolderId),
                localDataUrl: inboxFile.localDataUrl || '',
                timestamp: res.timestamp || new Date().toLocaleTimeString('es-MX')
            };

            state.sessionSavedBySku.set(prod.sku, logEntry);
            state.sessionSavedLogs.unshift(logEntry);

            // Actualizar bandeja SUBIR (la foto ya fue removida de SUBIR y colocada en su carpeta de categoría)
            if (Array.isArray(res.remainingFiles)) {
                state.inboxFiles = res.remainingFiles;
            } else {
                state.inboxFiles = state.inboxFiles.filter((f) => f.id !== inboxFile.id);
            }
            state.selectedInboxFileId = '';

            updateKpiCards();
            applySkuFiltersAndRender();
            renderInboxGallery();
            renderSelectedProductStage();
            renderSessionHistoryLog();

            showAssignFeedback(
                '✅ <strong>' + escapeHtml(prod.sku) + '</strong> guardado en <strong>Hoja "1" · Fila ' + escapeHtml(res.rowNumber) + ' (Columna D)</strong>. ' +
                'La imagen salió de <code>SUBIR</code> y quedó en <a href="' + escapeHtml(logEntry.destFolderUrl) + '" target="_blank" rel="noopener" style="color:#065F46;text-decoration:underline;">' +
                escapeHtml(logEntry.destFolderName) + ' ↗</a> como <code>' + escapeHtml(logEntry.fileName) + '</code>.',
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
        if (badge) {
            badge.textContent = state.sessionSavedLogs.length + (state.sessionSavedLogs.length === 1 ? ' guardada' : ' guardadas');
        }

        listEl.innerHTML = state.sessionSavedLogs.map((item) => (
            '<div class="session-log-row">' +
                '<div>' +
                    '<strong>' + escapeHtml(item.sku) + '</strong> · ' + escapeHtml(item.productName) +
                    '<div style="font-size:11px;color:#065F46;margin-top:2px;">' +
                        'Hoja "1" Fila ' + escapeHtml(item.rowNumber) + ' (Col D) · Movida de SUBIR → <strong>' + escapeHtml(item.destFolderName) + '</strong>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;">' +
                    '<button type="button" class="hdr-btn" style="height:26px;background:#252C32;color:#FFF;" onclick="selectSkuProduct(\'' + escapeHtml(item.sku.replace(/'/g, "\\'")) + '\')">Ver comparador</button>' +
                    '<a href="' + escapeHtml(item.newUrl) + '" target="_blank" rel="noopener" class="hdr-btn is-accent" style="height:26px;">Abrir foto ↗</a>' +
                '</div>' +
            '</div>'
        )).join('');
    }

    // =========================================================================
    // COPIADO A 1 CLIC DEL ARCHIVO AppsScript_Creata_Drive_Sheets.gs
    // =========================================================================
    window.copyUpdatedAppsScriptCode = async function () {
        const btn = document.getElementById('btnCopyAppsScriptCode');
        const origText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Descargando código .gs...';
        }
        try {
            const resp = await fetch('./AppsScript_Creata_Drive_Sheets.gs?_t=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) throw new Error('No se pudo leer AppsScript_Creata_Drive_Sheets.gs');
            const code = await resp.text();
            await navigator.clipboard.writeText(code);
            if (btn) btn.textContent = '✅ ¡Código copiado! Pégalo en Apps Script → Nueva versión';
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            }, 5000);
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = origText;
            }
            alert('No se pudo copiar automáticamente: ' + (err && err.message ? err.message : String(err)));
        }
    };

    // =========================================================================
    // REFRESCO GENERAL Y LIGHTBOX DE IMAGEN AMPLIADA
    // =========================================================================
    window.refreshAllPhotoWorkspace = async function (silent) {
        if (!state.unlocked) return;
        if (!silent) {
            updateSyncStatusText('Sincronizando Hoja "1" (A, B, D) y bandeja Drive SUBIR...');
        }
        await Promise.all([
            loadSheetsCatalog(),
            window.refreshInboxOnly()
        ]);
        const nowStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        updateSyncStatusText('En vivo · Hoja "1" + SUBIR actualizados (' + nowStr + ')');
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

    // =========================================================================
    // ARRANQUE INICIAL
    // =========================================================================
    function initFotosApp() {
        // Inyectar logotipo corporativo CREATA
        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        populateDestFolderSelect();

        // Buscador de SKU / Nombre en Hoja "1"
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

        // Filtro rápido dentro de la carpeta SUBIR
        const inboxInp = document.getElementById('inboxSearchInput');
        if (inboxInp) {
            inboxInp.addEventListener('input', () => {
                state.inboxSearchQuery = inboxInp.value || '';
                renderInboxGallery();
            });
        }

        // Cerrar visor ampliado con Escape
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                window.closePhotoLightbox();
            }
        });

        // Verificar si Kevin ya cuenta con sesión autorizada
        const sess = checkExistingFotosOwnerSession();
        if (sess.valid) {
            state.authToken = sess.authToken || '';
            state.accessKey = sess.accessKey || '';
            unlockFotosPortal();
        } else {
            if (sess.otherEmail) {
                setGateMessage(
                    'Se detectó otra sesión activa (' + sess.otherEmail + '). Este enlace es estrictamente exclusivo para ' + OWNER_EMAIL + '.',
                    'error'
                );
            } else if (sess.needsReauth) {
                setGateMessage(
                    'Ingresa tu contraseña personal para autorizar el movimiento de archivos en Google Drive SUBIR y Hoja "1".',
                    'warn'
                );
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
