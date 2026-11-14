(function () {
    'use strict';

    const OWNER_EMAIL = 'kevin.reyna@grupoanipa.com';
    const OWNER_DISPLAY_NAME = 'Kevin Reyna';
    const SHEET_ID = '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8';
    const DRIVE_PHOTOS_FOLDER_ID = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';

    const PRIVATE_SESSION_KEY = 'creata_private_kevin_hist_v1';
    const INV_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';

    const AUTO_REFRESH_MS = 30000;

    // Cronología integral de hitos técnicos del proyecto de cotización
    const PROJECT_MILESTONES = [
        {
            version: 'Portal Privado',
            commit: 'historial.html',
            date: '14/11/2026',
            module: 'historial.html · historial-app.js · historial-styles.css',
            title: 'Panel Ejecutivo Privado de Historial del Proyecto de Cotización',
            summary: 'Portal independiente y desvinculado de las vistas públicas, restringido exclusivamente a kevin.reyna@grupoanipa.com con lectura en tiempo real de HISTORIAL, COTIZACIONES_EN_VIVO, FOTOS NUEVAS CARGADO e INVENTARIO_EN_VIVO.'
        },
        {
            version: 'v51 · SW v10',
            commit: 'a5f878b',
            date: '14/11/2026',
            module: 'inventario-app.js · inventario-sw.js',
            title: 'Corrección de arranque inicial (TDZ) y deduplicación de ficha técnica',
            summary: 'Declaración anticipada de FIXED_QUOTE_CLIENT_MODE antes de loadQuoteDraftMeta() para eliminar pantalla blanca al iniciar, e incorporación de buildCleanProductSpecRows() para evitar campos repetidos (Variante/Tela/Color/Materiales).'
        },
        {
            version: 'v50 · SW v9',
            commit: '3427f27',
            date: '14/11/2026',
            module: 'inventario-app.js · applyFilter(STOCK)',
            title: 'Botón STOCK ordenado por mayor existencia física sin contar LPPT',
            summary: 'El filtro STOCK lista cada pieza individual con existencia física (Bodega + Piso >= 1) de mayor a menor cantidad real excluyendo 100% las unidades de LPPT.'
        },
        {
            version: 'v49 · SW v8',
            commit: 'af9f751',
            date: '14/11/2026',
            module: 'inventario.html · inventario-app.js · AppsScript',
            title: 'Automatización y ocultamiento de Modalidad de Cliente y Categoría ERP',
            summary: 'Modalidad bloqueada e invisible en PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR) y Categoría fija automática en COTIZACIONES [ID: 2] en frontend y backend WCF.'
        },
        {
            version: 'v48 · SW v7',
            commit: 'c9f6ca0',
            date: '14/11/2026',
            module: 'HISTORIAL · FOTOS NUEVAS CARGADO · LPPT · Descuentos',
            title: 'Bitácora única HISTORIAL, fotos en Drive, +2 semanas proveedor y descuento 30%',
            summary: 'Creación de pestaña exclusiva HISTORIAL para fallos de código y movimientos, carga de fotos en carpeta Drive FOTOS NUEVAS CARGADO, +14 días en fecha compromiso proveedor y tope 30% asesores hasta el 30/11/2026.'
        },
        {
            version: 'v47 · SW v6',
            commit: 'f067021',
            date: '14/11/2026',
            module: 'inventario-app.js · Modal Confirmación ERP',
            title: 'Confirmación previa obligatoria y acuse con Folio Oficial S Mueblería',
            summary: 'Verificación de creación real vía InsertarCotizacion en sistema.smuebleria.com con diálogo de confirmación antes de emitir y modal de éxito con Folio oficial e ID ERP.'
        },
        {
            version: 'v45–v46',
            commit: '46f7e9b · 535d123',
            date: '14/11/2026',
            module: 'inventario.html · inventario-app.js',
            title: 'Borradores de 3 horas, filtros LPPT/STOCK/Categorías y reinicio limpio de plantilla',
            summary: 'Persistencia temporal de borradores por 3 horas, separación de botones de cabecera, orden alfabético A-Z automático y limpieza de plantilla al cerrar cotización.'
        },
        {
            version: 'v40–v44',
            commit: 'b74ab0c · 3b0bade · 8bc1e96',
            date: '13/11/2026',
            module: 'AppsScript WCF · INVENTARIO_EN_VIVO · Service Worker',
            title: 'Renovación automática de sesión S Mueblería 24/7, Precio de Lista en vivo y modo offline',
            summary: 'Respaldo de sesión Telerik (.erp_session_cache.json), conservación de Bodega/Piso si el ERP cae, columna AW de Precio de Lista vinculada y filtro de piezas cotizables.'
        }
    ];

    const ACTIVE_PROJECT_RULES = [
        {
            key: 'Conexión ERP en Vivo',
            val: 'sistema.smuebleria.com · WCF InsertarCotizacion',
            desc: 'Emisión directa de cotizaciones reales con confirmación previa obligatoria, asignación de Folio oficial por serie de tienda y respaldo en COTIZACIONES_EN_VIVO.'
        },
        {
            key: 'Modalidad y Categoría Automáticas',
            val: 'Prospecto Provisional · COTIZACIONES [ID: 2]',
            desc: 'Ambos campos están bloqueados y ocultos para todos los usuarios; el sistema los envía automáticamente sin posibilidad de alteración manual.'
        },
        {
            key: 'Política de Descuento Asesores',
            val: 'Hasta 30% vigente al 30/11/2026',
            desc: 'Doble candado activo en hojas de sucursales y código (America/Cancun). Regresa de forma automática a 24% el 01/12/2026. Titular Kevin Reyna: 100%.'
        },
        {
            key: 'Fechas de Compromiso Proveedor (LPPT)',
            val: '+14 días (+2 semanas) de holgura automática',
            desc: 'Se suman 14 días calendario en solo lectura sobre la columna F de LPPT Proveedores (y +21 días para llegada estimada a CEDIS) sin modificar el archivo externo.'
        },
        {
            key: 'Criterio del Botón STOCK',
            val: 'Mayor a menor cantidad física (0% LPPT)',
            desc: 'Muestra piezas individuales con existencia física en las 10 ubicaciones Bodega/Piso (>= 1 pz) ordenadas estrictamente de mayor a menor sin sumar LPPT.'
        },
        {
            key: 'Auditoría y Fotografías Nuevas',
            val: 'Hoja única HISTORIAL + Drive FOTOS NUEVAS CARGADO',
            desc: 'Todo movimiento o excepción JS/AppsScript se concentra únicamente en HISTORIAL; cada foto subida guarda URL directa, autor, sucursal y producto.'
        }
    ];

    const state = {
        unlocked: false,
        activeTab: 'overview',
        searchQuery: '',
        historialClassFilter: 'ALL',
        historialBranchFilter: 'ALL',
        quotesStoreFilter: 'ALL',
        quotesModeFilter: 'ALL',
        syncInFlight: false,
        lastSyncLabel: '',
        erpLiveCellText: '',
        historialRows: [],
        quoteRows: [],
        photoRows: [],
        refreshTimer: null
    };

    function cleanStr(val) {
        if (val === null || val === undefined) return '';
        return String(val).trim();
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
            .trim();
    }

    function parseMoneyMXN(val) {
        if (typeof val === 'number') return isFinite(val) ? val : 0;
        const cleaned = String(val || '').replace(/[^0-9.-]/g, '');
        const n = parseFloat(cleaned);
        return isFinite(n) ? n : 0;
    }

    function formatMoneyMXN(num) {
        const val = isFinite(num) ? Number(num) : 0;
        return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function parseMxDateTime(raw) {
        const s = cleanStr(raw);
        if (!s) return 0;
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            const day = parseInt(m[1], 10);
            const mon = parseInt(m[2], 10) - 1;
            let yr = parseInt(m[3], 10);
            if (yr < 100) yr += 2000;
            const hr = m[4] ? parseInt(m[4], 10) : 0;
            const min = m[5] ? parseInt(m[5], 10) : 0;
            const sec = m[6] ? parseInt(m[6], 10) : 0;
            const ts = new Date(yr, mon, day, hr, min, sec).getTime();
            if (!isNaN(ts)) return ts;
        }
        const fallback = Date.parse(s);
        return isNaN(fallback) ? 0 : fallback;
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

    function resolveDrivePhotoPreview(directUrl, driveLink) {
        const cand = cleanStr(directUrl) || cleanStr(driveLink);
        if (!cand) return '';
        const idMatch = cand.match(/\/d\/([a-zA-Z0-9_-]{18,})/) || cand.match(/[?&]id=([a-zA-Z0-9_-]{18,})/);
        if (idMatch && idMatch[1]) {
            return 'https://lh3.googleusercontent.com/d/' + idMatch[1] + '=w900';
        }
        if (/^https?:\/\//i.test(cand)) return cand;
        return '';
    }

    // ------------------------------------------------------------------------
    // CSV PARSER + DUAL FETCH / JSONP GOOGLE SHEETS LIVE READER
    // ------------------------------------------------------------------------
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
            const cbName = '__creataHistGviz_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
            let scriptEl = null;
            let settled = false;

            const cleanup = () => {
                try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
            };

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(null);
            }, 11000);

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
                        const hdrLabels = resp.table.cols.map(c => cleanStr(c && c.label));
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
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 10000) : null;
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

    // ------------------------------------------------------------------------
    // EXCLUSIVE ACCESS CONTROL (ONLY kevin.reyna@grupoanipa.com)
    // ------------------------------------------------------------------------
    function checkExistingOwnerSession() {
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('creata_private_hist_manual_lock') === '1') {
                return { valid: false, otherEmail: '' };
            }
        } catch (e) {}

        try {
            const privRaw = localStorage.getItem(PRIVATE_SESSION_KEY);
            if (privRaw) {
                const priv = JSON.parse(privRaw);
                if (priv && cleanStr(priv.correo).toLowerCase() === OWNER_EMAIL) {
                    return { valid: true, source: 'private' };
                }
            }
        } catch (e) {}

        try {
            const invRaw = localStorage.getItem(INV_SESSION_KEY);
            if (invRaw) {
                const inv = JSON.parse(invRaw);
                const invEmail = cleanStr(inv && inv.correo).toLowerCase();
                if (invEmail === OWNER_EMAIL && !inv.mustChangeKey) {
                    return { valid: true, source: 'inventario' };
                }
                if (invEmail && invEmail !== OWNER_EMAIL) {
                    return { valid: false, otherEmail: invEmail };
                }
            }
        } catch (e) {}

        return { valid: false, otherEmail: '' };
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

    function unlockPortal() {
        state.unlocked = true;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('creata_private_hist_manual_lock');
        } catch (e) {}
        const gate = document.getElementById('privateGateBackdrop');
        const appShell = document.getElementById('privateAppShell');
        if (gate) gate.classList.add('hidden');
        if (appShell) appShell.classList.remove('hidden');

        syncAllProjectHistory(false);
        if (state.refreshTimer) clearInterval(state.refreshTimer);
        state.refreshTimer = setInterval(() => {
            if (state.unlocked && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
                syncAllProjectHistory(true);
            }
        }, AUTO_REFRESH_MS);
    }

    window.lockPrivatePortal = function () {
        state.unlocked = false;
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
        try {
            localStorage.removeItem(PRIVATE_SESSION_KEY);
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('creata_private_hist_manual_lock', '1');
        } catch (e) {}

        // Si tenía sesión abierta en inventario en el mismo navegador, pedir contraseña explícita en este portal
        const gate = document.getElementById('privateGateBackdrop');
        const appShell = document.getElementById('privateAppShell');
        const keyInp = document.getElementById('ownerPasswordInput');
        if (keyInp) keyInp.value = '';
        setGateMessage('Sesión privada bloqueada. Ingresa tu contraseña personal para volver a abrir el historial.', 'warn');
        if (appShell) appShell.classList.add('hidden');
        if (gate) gate.classList.remove('hidden');
        if (keyInp) setTimeout(() => keyInp.focus(), 60);
    };

    window.togglePrivatePwdVisibility = function () {
        const inp = document.getElementById('ownerPasswordInput');
        const btn = document.getElementById('btnToggleOwnerPwd');
        if (!inp) return;
        const hiddenNow = inp.type === 'password';
        inp.type = hiddenNow ? 'text' : 'password';
        if (btn) btn.textContent = hiddenNow ? 'Ocultar' : 'Mostrar';
    };

    window.submitPrivateOwnerLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailInp = document.getElementById('ownerEmailInput');
        const pwdInp = document.getElementById('ownerPasswordInput');
        const submitBtn = document.getElementById('btnOwnerLoginSubmit');

        const typedEmail = cleanStr(emailInp ? emailInp.value : '').toLowerCase();
        const typedKey = cleanStr(pwdInp ? pwdInp.value : '');

        if (typedEmail !== OWNER_EMAIL) {
            setGateMessage('Acceso denegado: este enlace es estrictamente exclusivo para ' + OWNER_EMAIL + '.', 'error');
            return;
        }
        if (!typedKey) {
            setGateMessage('Ingresa tu contraseña personal del sistema para desbloquear tu historial.', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verificando titularidad...';
        }
        setGateMessage('', '');

        try {
            // 1) Validación directa contra Apps Script WebApp oficial
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
                // 2) Respaldo directo en vivo contra hoja PROYECTOS (donde reside kevin.reyna@grupoanipa.com)
                const rows = await fetchSheetRows('PROYECTOS', 'A1:I40');
                if (!rows || rows.length < 2) {
                    setGateMessage('No se pudo conectar con la hoja de verificación. Revisa tu conexión a internet.', 'error');
                    return;
                }
                let localKeyMap = {};
                try {
                    localKeyMap = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}') || {};
                } catch (e) {}

                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i] || [];
                    const em = cleanStr(r[4]).toLowerCase();
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
                    setGateMessage('Contraseña incorrecta. Usa la misma contraseña personal con la que ingresas al cotizador.', 'error');
                    return;
                }
            }

            if (verified) {
                try {
                    localStorage.setItem(PRIVATE_SESSION_KEY, JSON.stringify({
                        correo: OWNER_EMAIL,
                        nombre: OWNER_DISPLAY_NAME,
                        verifiedAt: Date.now()
                    }));
                } catch (e) {}
                if (pwdInp) pwdInp.value = '';
                unlockPortal();
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Desbloquear Historial Privado';
            }
        }
    };

    // ------------------------------------------------------------------------
    // LIVE MULTI-SHEET PARSERS
    // ------------------------------------------------------------------------
    function parseHistorialSheetRows(rawRows) {
        if (!Array.isArray(rawRows) || !rawRows.length) return [];
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
            const r = rawRows[i] || [];
            if (/^FECHA/i.test(cleanStr(r[0])) && /CLASIFICACI/i.test(cleanStr(r[1]))) {
                headerIdx = i;
                break;
            }
        }
        const startIdx = headerIdx >= 0 ? headerIdx + 1 : 6;
        const list = [];
        for (let i = startIdx; i < rawRows.length; i++) {
            const r = rawRows[i] || [];
            const fecha = cleanStr(r[0]);
            const clasificacion = cleanStr(r[1]);
            const modulo = cleanStr(r[2]);
            const evento = cleanStr(r[3]);
            const estado = cleanStr(r[4]);
            const usuario = cleanStr(r[5]);
            const sucursal = cleanStr(r[6]);
            const referencia = cleanStr(r[7]);
            const detalle = cleanStr(r[8]);
            const analisis = cleanStr(r[9]);
            if (!fecha && !evento && !detalle) continue;

            const upperClass = clasificacion.toUpperCase();
            let normKind = 'MOVIMIENTO';
            if (/FALLO|ERROR|BUG/.test(upperClass)) normKind = 'FALLO';
            else if (/ALERTA|PREVENTIV/.test(upperClass)) normKind = 'ALERTA';

            list.push({
                idx: i + 1,
                fecha,
                ts: parseMxDateTime(fecha),
                clasificacion: clasificacion || 'MOVIMIENTO',
                normKind,
                modulo,
                evento,
                estado,
                usuario,
                sucursal,
                referencia,
                detalle,
                analisis,
                _search: normalizeSearchText([fecha, clasificacion, modulo, evento, estado, usuario, sucursal, referencia, detalle, analisis].join(' '))
            });
        }
        list.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
        return list;
    }

    function parseQuotesSheetRows(rawRows) {
        if (!Array.isArray(rawRows) || rawRows.length < 2) return [];
        let headerIdx = 0;
        for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
            const r = rawRows[i] || [];
            if (/FOLIO_SMUEBLERIA|ORDEN_SUCURSAL/i.test(cleanStr(r[0]) + ' ' + cleanStr(r[1]))) {
                headerIdx = i;
                break;
            }
        }
        const out = [];
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const r = rawRows[i] || [];
            const ordenSucursal = cleanStr(r[0]);
            const folioErp = cleanStr(r[1]) || ordenSucursal;
            const idErp = cleanStr(r[2]);
            const fechaHora = cleanStr(r[3]);
            if (!folioErp && !idErp && !fechaHora) continue;

            const modalidadOrigen = cleanStr(r[4]) || 'SUCURSAL';
            const hojaUbicacion = cleanStr(r[5]);
            const tiendaErp = cleanStr(r[6]) || hojaUbicacion || 'SIN TIENDA';
            const correoAsesor = cleanStr(r[7]);
            const nombreAsesor = cleanStr(r[8]) || correoAsesor;
            const usuarioErp = cleanStr(r[9]);
            const idUsuarioErp = cleanStr(r[10]);
            const cliente = cleanStr(r[11]) || 'Sin nombre';
            const telefono = cleanStr(r[12]);
            const modalidadCliente = cleanStr(r[13]);
            const categoriaErp = cleanStr(r[14]);
            const entregaTentativa = cleanStr(r[15]);
            const partidasCant = Math.max(0, parseInt(cleanStr(r[16]), 10) || 0);
            const resumenSkus = cleanStr(r[17]);
            const subtotalNum = parseMoneyMXN(r[18]);
            const ivaNum = parseMoneyMXN(r[19]);
            const descuentoExtraNum = parseMoneyMXN(r[20]);
            const totalNum = parseMoneyMXN(r[21]);
            const estadoErp = cleanStr(r[22]) || 'EN VIVO EN S MUEBLERÍA';
            const notas = cleanStr(r[23]);

            out.push({
                idx: i + 1,
                ordenSucursal,
                folioErp,
                idErp,
                fechaHora,
                ts: parseMxDateTime(fechaHora),
                modalidadOrigen: modalidadOrigen.toUpperCase(),
                hojaUbicacion,
                tiendaErp,
                correoAsesor,
                nombreAsesor,
                usuarioErp,
                idUsuarioErp,
                cliente,
                telefono,
                modalidadCliente,
                categoriaErp,
                entregaTentativa,
                partidasCant,
                resumenSkus,
                subtotalNum,
                ivaNum,
                descuentoExtraNum,
                totalNum,
                estadoErp,
                notas,
                _search: normalizeSearchText([
                    folioErp, idErp, fechaHora, modalidadOrigen, tiendaErp,
                    correoAsesor, nombreAsesor, cliente, telefono, resumenSkus, notas
                ].join(' '))
            });
        }
        out.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
        return out;
    }

    function parsePhotosSheetRows(rawRows) {
        if (!Array.isArray(rawRows) || rawRows.length < 2) return [];
        let headerIdx = 0;
        for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
            const r = rawRows[i] || [];
            if (/^SKU/i.test(cleanStr(r[0]))) {
                headerIdx = i;
                break;
            }
        }
        const out = [];
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
            const r = rawRows[i] || [];
            const sku = cleanStr(r[0]);
            const nombreProducto = cleanStr(r[1]);
            const directUrl = cleanStr(r[3]) || (cleanStr(r[2]).indexOf('http') === 0 ? cleanStr(r[2]) : '');
            const driveLink = cleanStr(r[4]);
            const quienSubio = cleanStr(r[5]) || 'Usuario Autorizado';
            const puestoSucursal = cleanStr(r[6]);
            const correoUsuario = cleanStr(r[7]);
            const fechaHora = cleanStr(r[8]);
            const carpetaDrive = cleanStr(r[9]) || ('https://drive.google.com/drive/folders/' + DRIVE_PHOTOS_FOLDER_ID);

            if (!sku && !directUrl && !driveLink) continue;
            const previewUrl = resolveDrivePhotoPreview(directUrl, driveLink);

            out.push({
                idx: i + 1,
                sku: sku || 'SIN-SKU',
                nombreProducto: nombreProducto || sku || 'Producto sin título',
                previewUrl,
                directUrl: directUrl || previewUrl,
                driveLink: driveLink || carpetaDrive,
                quienSubio,
                puestoSucursal,
                correoUsuario,
                fechaHora,
                ts: parseMxDateTime(fechaHora),
                carpetaDrive,
                _search: normalizeSearchText([sku, nombreProducto, quienSubio, puestoSucursal, correoUsuario, fechaHora].join(' '))
            });
        }
        out.sort((a, b) => (b.ts - a.ts) || (b.idx - a.idx));
        return out;
    }

    // ------------------------------------------------------------------------
    // LIVE SYNC CONTROLLER
    // ------------------------------------------------------------------------
    window.syncAllProjectHistory = async function (silent) {
        if (state.syncInFlight) return;
        state.syncInFlight = true;

        const refreshBtn = document.getElementById('btnRefreshLive');
        const syncDot = document.getElementById('liveSyncDot');
        const syncText = document.getElementById('liveSyncText');

        if (!silent && refreshBtn) {
            refreshBtn.disabled = true;
        }
        if (syncDot) syncDot.classList.add('is-syncing');
        if (!silent && syncText) syncText.textContent = 'Sincronizando hojas en vivo...';

        try {
            const [histRaw, quotesRaw, photosRaw, invStatusRaw] = await Promise.all([
                fetchSheetRows('HISTORIAL', 'A1:J500'),
                fetchSheetRows('COTIZACIONES_EN_VIVO', 'A1:X1000'),
                fetchSheetRows('FOTOS NUEVAS CARGADO', 'A1:J500'),
                fetchSheetRows('INVENTARIO_EN_VIVO', 'AV1:AV3')
            ]);

            if (Array.isArray(histRaw)) {
                state.historialRows = parseHistorialSheetRows(histRaw);
            }
            if (Array.isArray(quotesRaw)) {
                state.quoteRows = parseQuotesSheetRows(quotesRaw);
            }
            if (Array.isArray(photosRaw)) {
                state.photoRows = parsePhotosSheetRows(photosRaw);
            }
            if (Array.isArray(invStatusRaw) && invStatusRaw.length >= 2) {
                const cellVal = cleanStr((invStatusRaw[1] && invStatusRaw[1][0]) || (invStatusRaw[2] && invStatusRaw[2][0]));
                if (cellVal) state.erpLiveCellText = cellVal;
            }

            const nowStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            state.lastSyncLabel = nowStr;

            populateDynamicFilterSelects();
            renderAll();
        } finally {
            state.syncInFlight = false;
            if (refreshBtn) refreshBtn.disabled = false;
            if (syncDot) syncDot.classList.remove('is-syncing');
            if (syncText) {
                const erpPart = state.erpLiveCellText ? ('ERP ' + state.erpLiveCellText) : 'Conectado a Google Sheets';
                syncText.textContent = erpPart + (state.lastSyncLabel ? (' · Leído ' + state.lastSyncLabel) : '');
            }
        }
    };

    function populateDynamicFilterSelects() {
        const branchSel = document.getElementById('historialBranchSelect');
        if (branchSel) {
            const prevVal = branchSel.value || 'ALL';
            const branches = Array.from(new Set(state.historialRows.map(r => r.sucursal).filter(Boolean))).sort();
            branchSel.innerHTML = '<option value="ALL">Todas las áreas / sucursales</option>' +
                branches.map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
            branchSel.value = branches.indexOf(prevVal) !== -1 ? prevVal : 'ALL';
            state.historialBranchFilter = branchSel.value;
        }

        const storeSel = document.getElementById('quotesStoreSelect');
        if (storeSel) {
            const prevStore = storeSel.value || 'ALL';
            const stores = Array.from(new Set(state.quoteRows.map(q => q.tiendaErp).filter(Boolean))).sort();
            storeSel.innerHTML = '<option value="ALL">Todas las tiendas ERP</option>' +
                stores.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
            storeSel.value = stores.indexOf(prevStore) !== -1 ? prevStore : 'ALL';
            state.quotesStoreFilter = storeSel.value;
        }
    }

    // ------------------------------------------------------------------------
    // RENDERERS
    // ------------------------------------------------------------------------
    function getFilteredHistorial() {
        const q = normalizeSearchText(state.searchQuery);
        return state.historialRows.filter(r => {
            if (state.historialClassFilter !== 'ALL' && r.normKind !== state.historialClassFilter) return false;
            if (state.historialBranchFilter !== 'ALL' && r.sucursal !== state.historialBranchFilter) return false;
            if (q && r._search.indexOf(q) === -1) return false;
            return true;
        });
    }

    function getFilteredQuotes() {
        const q = normalizeSearchText(state.searchQuery);
        return state.quoteRows.filter(item => {
            if (state.quotesStoreFilter !== 'ALL' && item.tiendaErp !== state.quotesStoreFilter) return false;
            if (state.quotesModeFilter !== 'ALL' && item.modalidadOrigen !== state.quotesModeFilter) return false;
            if (q && item._search.indexOf(q) === -1) return false;
            return true;
        });
    }

    function getFilteredPhotos() {
        const q = normalizeSearchText(state.searchQuery);
        return state.photoRows.filter(p => {
            if (q && p._search.indexOf(q) === -1) return false;
            return true;
        });
    }

    function renderKpisAndCounts() {
        const totalQuotes = state.quoteRows.length;
        const totalMxn = state.quoteRows.reduce((acc, q) => acc + q.totalNum, 0);
        const avgTicket = totalQuotes > 0 ? (totalMxn / totalQuotes) : 0;

        const totalHist = state.historialRows.length;
        const movCount = state.historialRows.filter(r => r.normKind === 'MOVIMIENTO').length;
        const failCount = state.historialRows.filter(r => r.normKind === 'FALLO').length;
        const unresolvedFails = state.historialRows.filter(r => r.normKind === 'FALLO' && /ERROR|PENDIENTE/i.test(r.estado) && !/CORREGIDO/i.test(r.estado)).length;
        const alertCount = state.historialRows.filter(r => r.normKind === 'ALERTA').length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('kpiQuotesTotalMxn', formatMoneyMXN(totalMxn));
        setTxt('kpiQuotesCount', totalQuotes + (totalQuotes === 1 ? ' cotización emitida' : ' cotizaciones emitidas'));
        setTxt('kpiQuotesAvg', 'Ticket prom. ' + formatMoneyMXN(avgTicket));

        setTxt('kpiMovementsCount', String(totalHist));
        setTxt('kpiMovementsSub', movCount + ' movimientos · ' + PROJECT_MILESTONES.length + ' entregas Git');

        setTxt('kpiBugsCount', String(failCount));
        setTxt('kpiBugsStatus', unresolvedFails === 0 ? '100% corregidos · ' + alertCount + ' alertas prev.' : (unresolvedFails + ' pendientes de revisión'));

        setTxt('kpiPhotosCount', String(state.photoRows.length));
        const latestPhoto = state.photoRows[0];
        setTxt('kpiPhotosSub', latestPhoto ? ('Última: ' + latestPhoto.sku) : 'Carpeta Drive vinculada');

        // Tab counts
        setTxt('tabCountHistorial', String(state.historialRows.length));
        setTxt('tabCountQuotes', String(state.quoteRows.length));
        setTxt('tabCountPhotos', String(state.photoRows.length));
    }

    function renderOverviewTab() {
        const qNorm = normalizeSearchText(state.searchQuery);

        // 1) Store breakdown
        const storeBody = document.getElementById('overviewStoresTbody');
        if (storeBody) {
            const byStore = new Map();
            let grandTotal = 0;
            state.quoteRows.forEach(q => {
                grandTotal += q.totalNum;
                const key = q.tiendaErp || 'SIN TIENDA';
                const cur = byStore.get(key) || { store: key, count: 0, items: 0, total: 0, lastFolio: q.folioErp };
                cur.count += 1;
                cur.items += q.partidasCant;
                cur.total += q.totalNum;
                byStore.set(key, cur);
            });
            const storeList = Array.from(byStore.values())
                .filter(s => !qNorm || normalizeSearchText(s.store + ' ' + s.lastFolio).indexOf(qNorm) !== -1)
                .sort((a, b) => b.total - a.total);

            if (!storeList.length) {
                storeBody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin cotizaciones registradas para este filtro.</td></tr>';
            } else {
                storeBody.innerHTML = storeList.map(s => {
                    const pct = grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0;
                    return '<tr>' +
                        '<td><strong>' + escapeHtml(s.store) + '</strong></td>' +
                        '<td class="tabular">' + s.count + '</td>' +
                        '<td class="tabular">' + s.items + ' pz</td>' +
                        '<td><span class="mono">' + escapeHtml(s.lastFolio) + '</span></td>' +
                        '<td class="text-right tabular">' +
                            '<strong>' + escapeHtml(formatMoneyMXN(s.total)) + '</strong>' +
                            '<div class="share-bar-track" style="margin-left:auto;"><div class="share-bar-fill" style="width:' + pct + '%;"></div></div>' +
                        '</td>' +
                    '</tr>';
                }).join('');
            }
        }

        // 2) Advisor breakdown
        const advBody = document.getElementById('overviewAdvisorsTbody');
        if (advBody) {
            const byAdv = new Map();
            state.quoteRows.forEach(q => {
                const key = (q.correoAsesor || q.nombreAsesor || 'sin-correo').toLowerCase();
                const cur = byAdv.get(key) || {
                    name: q.nombreAsesor || 'Asesor',
                    email: q.correoAsesor || '',
                    store: q.tiendaErp || '',
                    count: 0,
                    total: 0,
                    lastFolio: q.folioErp
                };
                cur.count += 1;
                cur.total += q.totalNum;
                byAdv.set(key, cur);
            });
            const advList = Array.from(byAdv.values())
                .filter(a => !qNorm || normalizeSearchText(a.name + ' ' + a.email + ' ' + a.store + ' ' + a.lastFolio).indexOf(qNorm) !== -1)
                .sort((a, b) => b.total - a.total);

            if (!advList.length) {
                advBody.innerHTML = '<tr><td colspan="4" class="empty-state">Sin asesores con cotizaciones para este filtro.</td></tr>';
            } else {
                advBody.innerHTML = advList.map(a => (
                    '<tr>' +
                        '<td>' +
                            '<strong>' + escapeHtml(a.name) + '</strong>' +
                            (a.email ? ('<div style="font-size:0.73rem;color:var(--ink-muted);">' + escapeHtml(a.email) + '</div>') : '') +
                        '</td>' +
                        '<td>' + escapeHtml(a.store) + '</td>' +
                        '<td class="tabular">' + a.count + ' <span style="color:var(--ink-muted);font-size:0.74rem;">(' + escapeHtml(a.lastFolio) + ')</span></td>' +
                        '<td class="text-right tabular"><strong>' + escapeHtml(formatMoneyMXN(a.total)) + '</strong></td>' +
                    '</tr>'
                )).join('');
            }
        }

        // 3) Active rules
        const rulesEl = document.getElementById('overviewRulesContainer');
        if (rulesEl) {
            rulesEl.innerHTML = ACTIVE_PROJECT_RULES.map(rule => (
                '<div class="rule-item">' +
                    '<div class="rule-key">' + escapeHtml(rule.key) + '</div>' +
                    '<div class="rule-val">' + escapeHtml(rule.val) + '</div>' +
                    '<div class="rule-desc">' + escapeHtml(rule.desc) + '</div>' +
                '</div>'
            )).join('');
        }

        // 4) Chronological Git & System Milestones
        const mileBody = document.getElementById('overviewMilestonesTbody');
        if (mileBody) {
            const miles = PROJECT_MILESTONES.filter(m => (
                !qNorm || normalizeSearchText(m.version + ' ' + m.commit + ' ' + m.module + ' ' + m.title + ' ' + m.summary).indexOf(qNorm) !== -1
            ));
            mileBody.innerHTML = miles.map(m => (
                '<tr>' +
                    '<td class="tabular" style="white-space:nowrap;">' +
                        '<div><strong>' + escapeHtml(m.date) + '</strong></div>' +
                        '<span class="badge badge-neutral mono" style="margin-top:0.25rem;">' + escapeHtml(m.commit) + '</span>' +
                    '</td>' +
                    '<td>' +
                        '<span class="badge badge-ok" style="margin-bottom:0.3rem;">' + escapeHtml(m.version) + '</span>' +
                        '<div class="mono" style="color:var(--ink-muted);font-size:0.74rem;">' + escapeHtml(m.module) + '</div>' +
                    '</td>' +
                    '<td>' +
                        '<div style="font-weight:700;margin-bottom:0.2rem;">' + escapeHtml(m.title) + '</div>' +
                        '<div style="color:var(--ink-secondary);font-size:0.79rem;line-height:1.45;">' + escapeHtml(m.summary) + '</div>' +
                    '</td>' +
                '</tr>'
            )).join('');
        }
    }

    function getStatusBadgeClass(row) {
        if (row.normKind === 'FALLO') {
            return /CORREGIDO/i.test(row.estado) ? 'badge-fix' : 'badge-err';
        }
        if (row.normKind === 'ALERTA') return 'badge-warn';
        return 'badge-ok';
    }

    function renderHistorialTab() {
        const container = document.getElementById('historialEntriesContainer');
        if (!container) return;
        const rows = getFilteredHistorial();
        if (!rows.length) {
            container.innerHTML = '<div class="empty-state">No hay registros en HISTORIAL que coincidan con el filtro seleccionado.</div>';
            return;
        }

        container.innerHTML = rows.map(r => {
            const kindClass = getStatusBadgeClass(r);
            return '<article class="audit-entry">' +
                '<div class="audit-top-row">' +
                    '<div class="audit-badges">' +
                        '<span class="badge ' + kindClass + '">' + escapeHtml(r.clasificacion) + '</span>' +
                        (r.estado ? ('<span class="badge badge-neutral">' + escapeHtml(r.estado) + '</span>') : '') +
                        (r.referencia ? ('<span class="badge badge-neutral mono">' + escapeHtml(r.referencia) + '</span>') : '') +
                    '</div>' +
                    '<time class="audit-timestamp">' + escapeHtml(r.fecha) + '</time>' +
                '</div>' +
                '<h3 class="audit-event-title">' + escapeHtml(r.evento || 'Registro del sistema') + '</h3>' +
                '<div class="audit-meta-line">' +
                    (r.modulo ? ('<span><strong>Módulo:</strong> <code class="mono">' + escapeHtml(r.modulo) + '</code></span>') : '') +
                    (r.usuario ? ('<span><strong>Autor / Origen:</strong> ' + escapeHtml(r.usuario) + '</span>') : '') +
                    (r.sucursal ? ('<span><strong>Área / Sucursal:</strong> ' + escapeHtml(r.sucursal) + '</span>') : '') +
                '</div>' +
                (r.detalle ? ('<p class="audit-detail">' + escapeHtml(r.detalle) + '</p>') : '') +
                (r.analisis ? ('<div class="audit-analysis-box"><strong>Análisis Técnico / Causa y Solución:</strong> ' + escapeHtml(r.analisis) + '</div>') : '') +
            '</article>';
        }).join('');
    }

    function renderQuotesTab() {
        const tbody = document.getElementById('quotesTableBody');
        const summaryEl = document.getElementById('quotesFilterSummary');
        if (!tbody) return;

        const list = getFilteredQuotes();
        const sumMxn = list.reduce((acc, q) => acc + q.totalNum, 0);
        if (summaryEl) {
            summaryEl.textContent = list.length + ' cotizaciones · Suma filtrada: ' + formatMoneyMXN(sumMxn);
        }

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No se encontraron cotizaciones emitidas con los criterios actuales.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map((q, idx) => (
            '<tr class="is-clickable" data-quote-row-idx="' + idx + '" title="Clic para inspeccionar desglose completo de la cotización">' +
                '<td class="tabular">' +
                    '<strong class="mono">' + escapeHtml(q.folioErp) + '</strong>' +
                    (q.idErp ? ('<div class="mono" style="font-size:0.71rem;color:var(--ink-muted);">ID ERP #' + escapeHtml(q.idErp) + '</div>') : '') +
                '</td>' +
                '<td class="tabular" style="white-space:nowrap;">' + escapeHtml(q.fechaHora) + '</td>' +
                '<td>' +
                    '<strong>' + escapeHtml(q.tiendaErp) + '</strong>' +
                    '<div><span class="badge badge-neutral" style="margin-top:0.2rem;">' + escapeHtml(q.modalidadOrigen) + '</span></div>' +
                '</td>' +
                '<td>' +
                    '<div><strong>' + escapeHtml(q.nombreAsesor) + '</strong></div>' +
                    (q.correoAsesor ? ('<div style="font-size:0.73rem;color:var(--ink-muted);">' + escapeHtml(q.correoAsesor) + '</div>') : '') +
                '</td>' +
                '<td>' +
                    '<div><strong>' + escapeHtml(q.cliente) + '</strong></div>' +
                    (q.telefono ? ('<div class="tabular" style="font-size:0.73rem;color:var(--ink-muted);">Tel. ' + escapeHtml(q.telefono) + '</div>') : '') +
                '</td>' +
                '<td>' +
                    '<div class="tabular"><strong>' + q.partidasCant + '</strong> partida(s)</div>' +
                    '<div class="mono" style="font-size:0.72rem;color:var(--ink-secondary);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(q.resumenSkus) + '</div>' +
                '</td>' +
                '<td class="text-right tabular"><strong>' + escapeHtml(formatMoneyMXN(q.totalNum)) + '</strong></td>' +
                '<td><span class="badge badge-ok">' + escapeHtml(q.estadoErp) + '</span></td>' +
            '</tr>'
        )).join('');

        tbody.querySelectorAll('tr[data-quote-row-idx]').forEach(tr => {
            tr.addEventListener('click', function () {
                const i = parseInt(tr.getAttribute('data-quote-row-idx'), 10);
                if (!isNaN(i) && list[i]) openQuoteDetailModal(list[i]);
            });
        });
    }

    function renderPhotosTab() {
        const grid = document.getElementById('photosGalleryContainer');
        if (!grid) return;
        const list = getFilteredPhotos();
        if (!list.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No hay fotografías registradas que coincidan con la búsqueda.</div>';
            return;
        }

        grid.innerHTML = list.map((p, idx) => (
            '<article class="photo-card">' +
                '<div class="photo-thumb-wrap" data-photo-idx="' + idx + '" title="Ampliar fotografía">' +
                    (p.previewUrl
                        ? '<img src="' + escapeHtml(p.previewUrl) + '" alt="' + escapeHtml(p.nombreProducto) + '" loading="lazy">'
                        : '<div class="empty-state">Sin vista previa</div>') +
                '</div>' +
                '<div class="photo-card-body">' +
                    '<div class="photo-sku">SKU · ' + escapeHtml(p.sku) + '</div>' +
                    '<h3 class="photo-prod-name">' + escapeHtml(p.nombreProducto) + '</h3>' +
                    '<div class="photo-uploader-box">' +
                        '<div><strong>Subida por:</strong> ' + escapeHtml(p.quienSubio) + '</div>' +
                        (p.puestoSucursal ? ('<div>' + escapeHtml(p.puestoSucursal) + '</div>') : '') +
                        (p.correoUsuario ? ('<div class="mono" style="font-size:0.71rem;">' + escapeHtml(p.correoUsuario) + '</div>') : '') +
                        (p.fechaHora ? ('<div class="tabular" style="margin-top:0.2rem;color:var(--ink-muted);">' + escapeHtml(p.fechaHora) + '</div>') : '') +
                    '</div>' +
                    '<div class="photo-card-actions">' +
                        (p.directUrl ? ('<a class="btn-outline-sm" href="' + escapeHtml(p.directUrl) + '" target="_blank" rel="noopener">URL Foto</a>') : '') +
                        (p.driveLink ? ('<a class="btn-outline-sm" href="' + escapeHtml(p.driveLink) + '" target="_blank" rel="noopener">Abrir Drive</a>') : '') +
                    '</div>' +
                '</div>' +
            '</article>'
        )).join('');

        grid.querySelectorAll('[data-photo-idx]').forEach(el => {
            el.addEventListener('click', function () {
                const i = parseInt(el.getAttribute('data-photo-idx'), 10);
                if (!isNaN(i) && list[i]) openPhotoLightbox(list[i]);
            });
        });
    }

    function renderAll() {
        renderKpisAndCounts();
        renderOverviewTab();
        renderHistorialTab();
        renderQuotesTab();
        renderPhotosTab();
    }

    // ------------------------------------------------------------------------
    // MODALS (QUOTE INSPECTOR & PHOTO LIGHTBOX)
    // ------------------------------------------------------------------------
    function openQuoteDetailModal(q) {
        const modal = document.getElementById('quoteInspectModal');
        const titleEl = document.getElementById('quoteInspectTitle');
        const bodyEl = document.getElementById('quoteInspectBody');
        if (!modal || !bodyEl) return;

        if (titleEl) {
            titleEl.textContent = 'Cotización ' + q.folioErp + (q.idErp ? (' · ID S Mueblería #' + q.idErp) : '');
        }

        const skuItems = q.resumenSkus
            ? q.resumenSkus.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        bodyEl.innerHTML =
            '<div class="detail-kv-grid">' +
                '<div class="detail-kv"><div class="detail-kv-label">Folio Oficial S Mueblería</div><div class="detail-kv-val mono">' + escapeHtml(q.folioErp) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Fecha y Hora Emisión</div><div class="detail-kv-val tabular">' + escapeHtml(q.fechaHora) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Tienda ERP / Modalidad</div><div class="detail-kv-val">' + escapeHtml(q.tiendaErp + ' · ' + q.modalidadOrigen) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Asesor Emisor</div><div class="detail-kv-val">' + escapeHtml(q.nombreAsesor) + (q.idUsuarioErp ? (' (ERP #' + escapeHtml(q.idUsuarioErp) + ')') : '') + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Cliente / Prospecto</div><div class="detail-kv-val">' + escapeHtml(q.cliente) + (q.telefono ? (' · Tel. ' + escapeHtml(q.telefono)) : '') + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Entrega Tentativa</div><div class="detail-kv-val tabular">' + escapeHtml(q.entregaTentativa || 'Por definir') + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Modalidad de Cliente</div><div class="detail-kv-val">' + escapeHtml(q.modalidadCliente || 'PROSPECTO PROVISIONAL') + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Categoría ERP</div><div class="detail-kv-val">' + escapeHtml(q.categoriaErp || 'COTIZACIONES [ID: 2]') + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Subtotal (Sin IVA)</div><div class="detail-kv-val tabular">' + escapeHtml(formatMoneyMXN(q.subtotalNum)) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">IVA (16%)</div><div class="detail-kv-val tabular">' + escapeHtml(formatMoneyMXN(q.ivaNum)) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Descuento Extra</div><div class="detail-kv-val tabular">' + escapeHtml(formatMoneyMXN(q.descuentoExtraNum)) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Total Cotizado (Con IVA)</div><div class="detail-kv-val tabular" style="color:var(--brand-gold-hover);font-size:1rem;">' + escapeHtml(formatMoneyMXN(q.totalNum)) + '</div></div>' +
            '</div>' +
            '<div class="detail-kv" style="margin-bottom:0.85rem;">' +
                '<div class="detail-kv-label">Partidas Cotizadas (' + q.partidasCant + ')</div>' +
                '<div class="sku-chips-wrap">' +
                    (skuItems.length
                        ? skuItems.map(tok => '<span class="sku-chip">' + escapeHtml(tok) + '</span>').join('')
                        : '<span style="font-size:0.82rem;color:var(--ink-muted);">Sin detalle de SKUs</span>') +
                '</div>' +
            '</div>' +
            (q.notas
                ? ('<div class="detail-kv"><div class="detail-kv-label">Notas / Observaciones</div><div class="detail-kv-val" style="font-weight:500;">' + escapeHtml(q.notas) + '</div></div>')
                : '');

        modal.classList.remove('hidden');
    }

    function openPhotoLightbox(p) {
        const modal = document.getElementById('photoPreviewModal');
        const titleEl = document.getElementById('photoPreviewTitle');
        const bodyEl = document.getElementById('photoPreviewBody');
        if (!modal || !bodyEl) return;

        if (titleEl) titleEl.textContent = p.sku + ' · ' + p.nombreProducto;
        bodyEl.innerHTML =
            (p.previewUrl
                ? '<div style="background:#FAF9F6;border:1px solid var(--border-hairline);border-radius:10px;padding:0.75rem;margin-bottom:1rem;text-align:center;">' +
                    '<img src="' + escapeHtml(p.previewUrl) + '" alt="' + escapeHtml(p.nombreProducto) + '" style="max-width:100%;max-height:52vh;object-fit:contain;border-radius:6px;">' +
                  '</div>'
                : '') +
            '<div class="detail-kv-grid">' +
                '<div class="detail-kv"><div class="detail-kv-label">SKU Producto</div><div class="detail-kv-val mono">' + escapeHtml(p.sku) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Fecha y Hora Carga</div><div class="detail-kv-val tabular">' + escapeHtml(p.fechaHora) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Quién Subió la Foto</div><div class="detail-kv-val">' + escapeHtml(p.quienSubio) + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">Puesto y Sucursal</div><div class="detail-kv-val">' + escapeHtml(p.puestoSucursal || '-') + '</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:0.65rem;flex-wrap:wrap;">' +
                (p.directUrl ? ('<a class="btn-outline-sm" href="' + escapeHtml(p.directUrl) + '" target="_blank" rel="noopener">Abrir URL directa de la foto</a>') : '') +
                (p.driveLink ? ('<a class="btn-outline-sm" href="' + escapeHtml(p.driveLink) + '" target="_blank" rel="noopener">Ver archivo en Google Drive</a>') : '') +
            '</div>';

        modal.classList.remove('hidden');
    }

    window.closeHistoryModal = function (modalId) {
        const el = document.getElementById(modalId);
        if (el) el.classList.add('hidden');
    };

    // ------------------------------------------------------------------------
    // NAVIGATION, FILTERS & CSV EXPORT
    // ------------------------------------------------------------------------
    window.switchHistoryTab = function (tabName) {
        state.activeTab = tabName;
        const tabs = ['overview', 'historial', 'quotes', 'photos'];
        tabs.forEach(t => {
            const btn = document.getElementById('tabBtn_' + t);
            const panel = document.getElementById('tabPanel_' + t);
            if (btn) btn.classList.toggle('is-active', t === tabName);
            if (panel) panel.classList.toggle('hidden', t !== tabName);
        });
    };

    window.setHistorialClassFilter = function (kind) {
        state.historialClassFilter = kind;
        document.querySelectorAll('[data-hist-filter]').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-hist-filter') === kind);
        });
        renderHistorialTab();
    };

    window.exportActiveHistoryCsv = function () {
        let filename = 'CREATA_Historial_Proyecto.csv';
        let headers = [];
        let rows = [];

        if (state.activeTab === 'quotes') {
            filename = 'CREATA_Cotizaciones_SMuebleria.csv';
            headers = ['FOLIO_SMUEBLERIA', 'ID_ERP', 'FECHA_HORA', 'MODALIDAD', 'TIENDA_ERP', 'ASESOR', 'CORREO_ASESOR', 'CLIENTE', 'TELEFONO', 'ENTREGA_TENTATIVA', 'PARTIDAS', 'SKUS', 'SUBTOTAL_SIN_IVA', 'IVA', 'DESCUENTO_EXTRA', 'TOTAL_CON_IVA', 'ESTADO_ERP', 'NOTAS'];
            rows = getFilteredQuotes().map(q => [
                q.folioErp, q.idErp, q.fechaHora, q.modalidadOrigen, q.tiendaErp,
                q.nombreAsesor, q.correoAsesor, q.cliente, q.telefono, q.entregaTentativa,
                q.partidasCant, q.resumenSkus, q.subtotalNum.toFixed(2), q.ivaNum.toFixed(2),
                q.descuentoExtraNum.toFixed(2), q.totalNum.toFixed(2), q.estadoErp, q.notas
            ]);
        } else if (state.activeTab === 'photos') {
            filename = 'CREATA_Fotos_Nuevas_Cargado.csv';
            headers = ['SKU', 'NOMBRE_PRODUCTO', 'QUIEN_SUBIO', 'PUESTO_SUCURSAL', 'CORREO', 'FECHA_HORA', 'URL_FOTO', 'LINK_DRIVE'];
            rows = getFilteredPhotos().map(p => [
                p.sku, p.nombreProducto, p.quienSubio, p.puestoSucursal, p.correoUsuario, p.fechaHora, p.directUrl, p.driveLink
            ]);
        } else {
            filename = 'CREATA_Bitacora_HISTORIAL.csv';
            headers = ['FECHA_HORA', 'CLASIFICACION', 'MODULO', 'EVENTO', 'ESTADO', 'USUARIO', 'SUCURSAL', 'REFERENCIA', 'DETALLE', 'ANALISIS_TECNICO'];
            rows = getFilteredHistorial().map(r => [
                r.fecha, r.clasificacion, r.modulo, r.evento, r.estado, r.usuario, r.sucursal, r.referencia, r.detalle, r.analisis
            ]);
        }

        const escapeCsvCell = (v) => {
            const s = String(v === null || v === undefined ? '' : v);
            if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };

        const csvContent = '\uFEFF' + [headers].concat(rows).map(r => r.map(escapeCsvCell).join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ------------------------------------------------------------------------
    // INITIALIZATION
    // ------------------------------------------------------------------------
    function initPrivateHistoryApp() {
        // Hydrate official CREATA logo on gate and header
        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach(img => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        const searchInp = document.getElementById('globalHistorySearch');
        const clearBtn = document.getElementById('btnClearHistorySearch');
        if (searchInp) {
            searchInp.addEventListener('input', function () {
                state.searchQuery = searchInp.value || '';
                if (clearBtn) clearBtn.classList.toggle('hidden', !state.searchQuery);
                renderAll();
            });
        }
        if (clearBtn && searchInp) {
            clearBtn.addEventListener('click', function () {
                searchInp.value = '';
                state.searchQuery = '';
                clearBtn.classList.add('hidden');
                renderAll();
                searchInp.focus();
            });
        }

        const branchSel = document.getElementById('historialBranchSelect');
        if (branchSel) {
            branchSel.addEventListener('change', function () {
                state.historialBranchFilter = branchSel.value || 'ALL';
                renderHistorialTab();
            });
        }

        const storeSel = document.getElementById('quotesStoreSelect');
        if (storeSel) {
            storeSel.addEventListener('change', function () {
                state.quotesStoreFilter = storeSel.value || 'ALL';
                renderQuotesTab();
            });
        }

        const modeSel = document.getElementById('quotesModeSelect');
        if (modeSel) {
            modeSel.addEventListener('change', function () {
                state.quotesModeFilter = modeSel.value || 'ALL';
                renderQuotesTab();
            });
        }

        // Close modals on Escape or backdrop click
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                closeHistoryModal('quoteInspectModal');
                closeHistoryModal('photoPreviewModal');
            }
        });
        ['quoteInspectModal', 'photoPreviewModal'].forEach(id => {
            const m = document.getElementById(id);
            if (m) {
                m.addEventListener('click', function (ev) {
                    if (ev.target === m) closeHistoryModal(id);
                });
            }
        });

        // Verify exclusive session for Kevin Reyna
        const sessStatus = checkExistingOwnerSession();
        if (sessStatus.valid) {
            unlockPortal();
        } else {
            if (sessStatus.otherEmail) {
                setGateMessage(
                    'Se detectó sesión activa de ' + sessStatus.otherEmail + '. Este panel está restringido únicamente a ' + OWNER_EMAIL + '.',
                    'warn'
                );
            }
            const pwdInp = document.getElementById('ownerPasswordInput');
            if (pwdInp) setTimeout(() => pwdInp.focus(), 80);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPrivateHistoryApp);
    } else {
        initPrivateHistoryApp();
    }
})();
