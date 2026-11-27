    // ------------------------------------------------------------------------
    // ESCÁNER BLUETOOTH P2300L (HID KEYBOARD WEDGE) + ENTER DIRECTO EN BUSCADOR
    // ------------------------------------------------------------------------
    let scanBuffer = '';
    let scanFirstKeyTime = 0;
    let lastKeyTime = 0;
    let scanAutoFlushTimer = null;

    function resetGlobalScanBuffer() {
        scanBuffer = '';
        scanFirstKeyTime = 0;
        if (scanAutoFlushTimer) {
            clearTimeout(scanAutoFlushTimer);
            scanAutoFlushTimer = null;
        }
    }

    function commitGlobalScanBuffer(srcLabel) {
        const code = normalizeScannedBarcodeText(scanBuffer);
        resetGlobalScanBuffer();
        if (code.length < 3) return false;
        processScannedBarcode(code, { source: srcLabel || 'Bluetooth HID (P2300L)' });
        return true;
    }

    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
            const confirmCreateEl = document.getElementById('quoteConfirmCreateModal');
            if (confirmCreateEl && confirmCreateEl.classList.contains('open')) {
                window.closeQuoteConfirmCreateModal();
                return;
            }
            if (_invBackNav && typeof window.handleInventarioBackAction === 'function') {
                window.handleInventarioBackAction({ source: 'escape' });
                return;
            }
            // Offline fallback when creata-back-nav.js is unavailable
            if (isMandatoryAuthGateActive()) { ev.__creataEscapeHandled = true; return; }
            if (isModalOpenById('scanModal')) { ev.__creataEscapeHandled = true; window.closeBarcodeScanner(); return; }
            if (isModalOpenById('priceCalculatorModal')) { ev.__creataEscapeHandled = true; window.closePriceCalculatorModal(); return; }
            if (isModalOpenById('installAppModal')) { ev.__creataEscapeHandled = true; window.closeInstallAppModal(); return; }
            if (isOptionalAuthModalActive()) {
                ev.__creataEscapeHandled = true;
                if (isElVisibleById('authStepBranch')) window.cancelBranchSelection();
                else {
                    pendingQuoteRetrySendToErp = null;
                    const m = document.getElementById('authModal');
                    if (m) m.classList.remove('open');
                }
                return;
            }
            if (isModalOpenById('uploadPhotoModal') && isElVisibleById('uploadPhotoModelDropdown')) {
                ev.__creataEscapeHandled = true;
                const dd = document.getElementById('uploadPhotoModelDropdown');
                if (dd) dd.classList.add('hidden');
                return;
            }
            if (isModalOpenById('uploadPhotoModal')) {
                ev.__creataEscapeHandled = true;
                if (!managerPhotoUploadInFlight) window.closeUploadPhotoModal();
                return;
            }
            if (activeInAppModule === 'seguimiento' && window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.handleBackAction === 'function') {
                const segRes = window.CreataSeguimientoModule.handleBackAction({ phase: 'overlay', source: 'escape' });
                if (segRes && segRes.handled) { ev.__creataEscapeHandled = true; return; }
            }
            if (activeInAppModule === 'historial' && window.CreataHistorialModule && typeof window.CreataHistorialModule.handleBackAction === 'function') {
                const histRes = window.CreataHistorialModule.handleBackAction({ phase: 'overlay', source: 'escape' });
                if (histRes && histRes.handled) { ev.__creataEscapeHandled = true; return; }
            }
            if (isModalOpenById('quoteAcceptedModal')) { ev.__creataEscapeHandled = true; acceptGeneratedQuoteAndReset(); return; }
            if (isModalOpenById('quoteGeneratedPdfsModal')) { ev.__creataEscapeHandled = true; window.closeQuoteGeneratedPdfsModal(); return; }
            if (invFabIsOpen) { ev.__creataEscapeHandled = true; window.closeFabMenu(); return; }
            if (isModalOpenById('cartModal') && isElVisibleById('quoteNewErpClientPanel')) {
                ev.__creataEscapeHandled = true;
                window.toggleNewErpClientForm(false);
                return;
            }
            if (isModalOpenById('cartModal')) { ev.__creataEscapeHandled = true; closeCartModal(); return; }
            if (isModalOpenById('productDetailModal') && (relatedStockExpanded || isElVisibleById('detRelatedStockPanel'))) {
                ev.__creataEscapeHandled = true;
                if (relatedStockRefItem && relatedStockExpanded && typeof window.toggleRelatedInStockProducts === 'function') {
                    window.toggleRelatedInStockProducts();
                } else {
                    relatedStockExpanded = false;
                    const panel = document.getElementById('detRelatedStockPanel');
                    if (panel) panel.classList.add('hidden');
                }
                return;
            }
            if (isModalOpenById('productDetailModal') && isElVisibleById('detSingleStep') && isElVisibleById('detGroupCrumb') && currentGroup && Array.isArray(currentGroup.items) && currentGroup.items.length > 1) {
                ev.__creataEscapeHandled = true;
                window.backToCurrentGroupVariants();
                return;
            }
            if (isModalOpenById('productDetailModal') && isElVisibleById('detVariantsStep') && currentGroup && (currentGroupFabricKey || currentGroupBedSizeKey)) {
                ev.__creataEscapeHandled = true;
                window.backToCurrentGroupVariants();
                return;
            }
            if (isModalOpenById('productDetailModal')) { ev.__creataEscapeHandled = true; closeProductDetail(); return; }
            if (_invSplitActive) { ev.__creataEscapeHandled = true; window.closeInvSplitFotosDock(); return; }
            return;
        }
        const authModalEl = document.getElementById('authModal');
        if (authModalEl && authModalEl.classList.contains('open')) {
            return;
        }
        const activeEl = document.activeElement;
        const activeTag = activeEl ? activeEl.tagName : '';
        const isSearchFocused = activeEl && activeEl.id === 'invSearchInput';

        if (isSearchFocused && (ev.key === 'Enter' || ev.key === 'Go' || ev.key === 'Search' || ev.key === 'Accept' || ev.key === 'Tab' || ev.keyCode === 13 || ev.keyCode === 9)) {
            const val = normalizeScannedBarcodeText(activeEl.value);
            if (val) {
                const res = resolveScannedBarcode(val);
                if (res && (res.status === 'quotable' || res.status === 'out_of_stock')) {
                    ev.preventDefault();
                    processScannedBarcode(val, { source: 'Buscador / P2300L', force: true });
                    try {
                        if (typeof activeEl.select === 'function') activeEl.select();
                        if (typeof activeEl.setSelectionRange === 'function') {
                            activeEl.setSelectionRange(0, String(activeEl.value || '').length);
                        }
                        if (isModalOpenById('productDetailModal') && typeof activeEl.blur === 'function') {
                            activeEl.blur();
                        }
                    } catch (e) {}
                    return;
                }
                if (ev.key !== 'Tab' && ev.keyCode !== 9 && filteredGroups.length === 1) {
                    ev.preventDefault();
                    const g = filteredGroups[0];
                    if (g.items.length > 1) openGroupModal(g.key);
                    else openProductDetail(g.items[0].s, false);
                    return;
                }
            }
        }

        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (activeEl && activeEl.isContentEditable)) {
            return;
        }

        // Ignorar teclas modificadoras puras sin reiniciar el buffer del escáner Bluetooth
        if (ev.key === 'Shift' || ev.key === 'CapsLock' || ev.key === 'AltGraph' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta') {
            return;
        }

        const now = Date.now();
        // Ventana de 260ms tolera el jitter típico de Bluetooth HID en iOS / Android
        if (scanBuffer && (now - lastKeyTime > 260)) {
            resetGlobalScanBuffer();
        }
        lastKeyTime = now;

        const isTerminator = (
            ev.key === 'Enter' || ev.key === 'Tab' || ev.key === 'Go' ||
            ev.key === 'Search' || ev.key === 'Accept' ||
            ev.keyCode === 13 || ev.keyCode === 9
        );

        if (isTerminator) {
            if (scanBuffer.trim().length >= 3) {
                ev.preventDefault();
                commitGlobalScanBuffer('Bluetooth HID (P2300L)');
            } else {
                resetGlobalScanBuffer();
            }
        } else if (typeof ev.key === 'string' && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            if (!scanBuffer) scanFirstKeyTime = now;
            scanBuffer += ev.key;
            if (scanAutoFlushTimer) {
                clearTimeout(scanAutoFlushTimer);
                scanAutoFlushTimer = null;
            }
            // Respaldo para lectores P2300L configurados sin sufijo Enter/CR:
            // si llegan >= 4 caracteres a velocidad de escáner (<= 95 ms promedio) y cesan 280 ms, procesar automáticamente
            if (scanBuffer.length >= 4) {
                const avgDelta = (now - scanFirstKeyTime) / Math.max(1, scanBuffer.length - 1);
                if (avgDelta <= 95) {
                    scanAutoFlushTimer = setTimeout(function () {
                        scanAutoFlushTimer = null;
                        if (scanBuffer.trim().length >= 4) {
                            commitGlobalScanBuffer('Bluetooth HID (P2300L)');
                        }
                    }, 280);
                }
            }
        }
    });

    // ------------------------------------------------------------------------
    // LECTURA EN VIVO (SOLO LECTURA) DE LPPT Y SINCRONIZACIÓN CON INVENTARIO_EN_VIVO
    // ------------------------------------------------------------------------
    let liveSyncInFlight = false;

    // ------------------------------------------------------------------------
    // RESPALDO SIN CONEXIÓN: último inventario en vivo guardado en este dispositivo
    // (Bodega/Piso de CEDIS, CASA CREATA, PTC, COLOSIO, PLAYA + LPPT y fecha estimada)
    // ------------------------------------------------------------------------
    const LIVE_CACHE_KEY = 'creata_inv_live_cache_v5';
    const LIVE_OK_TS_KEY = 'creata_inv_live_ok_ts_v1';
    const LIVE_CACHE_FIELDS = ['s', 'tp', 'mo', 'n', 'vr', 'f', 'c', 'tl', 'ct', 'md', 'cm', 'mt', 'm', 'p', 'pr', 'lt', 'baseLt', 'fe', 'fcomp', 'out_bod', 'out_pis'];
    const LIVE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    let liveCacheSaveTimer = null;
    let liveSyncFailStreak = 0;
    let lastLiveOkMs = 0;
    try {
        localStorage.removeItem('creata_inv_live_cache_v2');
        localStorage.removeItem('creata_inv_live_cache_v3');
        localStorage.removeItem('creata_inv_live_cache_v4');
        lastLiveOkMs = Number(localStorage.getItem(LIVE_OK_TS_KEY) || 0) || 0;
    } catch (e) {}

    async function gzipTextToB64(text) {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = new Uint8Array(await new Response(stream).arrayBuffer());
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }

    async function gunzipB64ToText(b64) {
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
    }

    function scheduleSaveLiveInventoryCache(items) {
        if (typeof CompressionStream === 'undefined' || !Array.isArray(items) || items.length === 0) return;
        if (liveCacheSaveTimer) clearTimeout(liveCacheSaveTimer);
        liveCacheSaveTimer = setTimeout(async function () {
            liveCacheSaveTimer = null;
            try {
                const rows = new Array(items.length);
                for (let i = 0; i < items.length; i++) {
                    const it = items[i] || {};
                    const r = LIVE_CACHE_FIELDS.map(k => (it[k] === null || it[k] === undefined) ? '' : it[k]);
                    r.push(Array.isArray(it.st) ? it.st : []);
                    rows[i] = r;
                }
                const gz = await gzipTextToB64(JSON.stringify({ v: 2, fields: LIVE_CACHE_FIELDS, wh: WAREHOUSES, rows: rows }));
                localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ ts: Date.now(), gz: gz }));
            } catch (e) {
                // Si el almacenamiento del navegador está lleno, simplemente no se guarda el respaldo
            }
        }, 200);
    }

    async function restoreLiveInventoryCacheIfAny() {
        if (typeof DecompressionStream === 'undefined') return false;
        try {
            const raw = localStorage.getItem(LIVE_CACHE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || !obj.gz || !obj.ts || (Date.now() - Number(obj.ts)) > LIVE_CACHE_MAX_AGE_MS) return false;
            const data = JSON.parse(await gunzipB64ToText(obj.gz));
            if (!data || !Array.isArray(data.rows) || !Array.isArray(data.wh)) return false;
            if (data.wh.join('|') !== WAREHOUSES.join('|')) return false;
            const fieldList = Array.isArray(data.fields)
                ? data.fields
                : ((Number(data.v) || 1) >= 2 ? LIVE_CACHE_FIELDS : LIVE_CACHE_FIELDS.slice(0, 18));
            const items = [];
            for (let i = 0; i < data.rows.length; i++) {
                const r = data.rows[i];
                if (!Array.isArray(r)) continue;
                const it = {};
                for (let k = 0; k < fieldList.length; k++) it[fieldList[k]] = r[k];
                if (it.fcomp === undefined) it.fcomp = '';
                const st = r[fieldList.length];
                it.st = (Array.isArray(st) && st.length === WAREHOUSES.length) ? st.map(v => Math.max(0, Number(v) || 0)) : emptyStocks();
                it._fromLiveInvSheet = true;
                if (cleanStr(it.s)) items.push(normalizeInventoryItemLive(it, null));
            }
            if (items.length === 0) return false;
            allItems = items;
            window.CREATA_INV_DATA = items;
            if (!lastLiveOkMs) lastLiveOkMs = Number(obj.ts) || 0;
            return true;
        } catch (e) {
            return false;
        }
    }

    function formatLiveOkStamp(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        return formatDateDMY(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function setLiveConnectionStatus(ok) {
        let el = document.getElementById('invLiveStatus');
        if (ok) {
            liveSyncFailStreak = 0;
            lastLiveOkMs = Date.now();
            try { localStorage.setItem(LIVE_OK_TS_KEY, String(lastLiveOkMs)); } catch (e) {}
            if (el) el.style.display = 'none';
            return;
        }
        liveSyncFailStreak++;
        const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
        if (!isOffline && liveSyncFailStreak < 2) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'invLiveStatus';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:70;max-width:calc(100vw - 24px);' +
                'padding:8px 14px;border-radius:999px;background:#252C32;color:#FFFFFF;font-size:11px;font-weight:700;' +
                'letter-spacing:.02em;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;';
            document.body.appendChild(el);
        }
        const stamp = formatLiveOkStamp(lastLiveOkMs);
        el.textContent = 'Sin conexión · mostrando el último inventario guardado' + (stamp ? ' (' + stamp + ')' : '');
        el.style.display = '';
    }

    function setErpLiveStatusBanner(rawBannerText) {
        const txt = cleanStr(rawBannerText);
        const isErpDown = /ERP\s+SIN\s+CONEXI[OÓ]N|SIN\s+CONEXI[OÓ]N\s+ERP/i.test(txt);
        let el = document.getElementById('invErpHealthBanner');
        if (!isErpDown) {
            if (el) el.style.display = 'none';
            return;
        }
        if (!el && typeof document !== 'undefined' && document.body) {
            el = document.createElement('div');
            el.id = 'invErpHealthBanner';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:12px;bottom:52px;z-index:69;max-width:calc(100vw - 24px);' +
                'padding:7px 13px;border-radius:999px;background:#92400E;color:#FFFFFF;font-size:11px;font-weight:700;' +
                'letter-spacing:.01em;box-shadow:0 4px 14px rgba(0,0,0,.22);pointer-events:none;';
            document.body.appendChild(el);
        }
        if (el) {
            el.textContent = '⚠️ ' + txt;
            el.style.display = '';
        }
    }

    let _invToastTimer = null;
    function showToast(msg) {
        const cleanMsg = cleanStr(msg);
        if (!cleanMsg || typeof document === 'undefined' || !document.body) return;
        let el = document.getElementById('invQuickToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'invQuickToast';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9999;' +
                'max-width:calc(100vw - 32px);padding:9px 16px;border-radius:999px;background:#1F2937;color:#FFFFFF;' +
                'font-size:11px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.28);pointer-events:none;transition:opacity .2s;';
            document.body.appendChild(el);
        }
        el.textContent = cleanMsg;
        el.style.display = '';
        el.style.opacity = '1';
        if (_invToastTimer) clearTimeout(_invToastTimer);
        _invToastTimer = setTimeout(() => {
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => { if (el) el.style.display = 'none'; }, 220);
            }
        }, 3200);
    }

    function normHeader(h) {
        return String(h || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseCsvText(csvText) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < csvText.length; i++) {
            const ch = csvText[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (csvText[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    row.push(field);
                    field = '';
                } else if (ch === '\r') {
                    // ignore
                } else if (ch === '\n') {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = '';
                } else {
                    field += ch;
                }
            }
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        return rows;
    }

    function restoreLpptOrdersFromLocalCache() {
        try {
            if (liveLpptBySku.size > 0) return true;
            const raw = localStorage.getItem(INV_LPPT_CACHE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.entries)) return false;
            const restored = new Map();
            for (let i = 0; i < data.entries.length; i++) {
                const pair = data.entries[i];
                if (!Array.isArray(pair) || !pair[0] || !Array.isArray(pair[1])) continue;
                const list = pair[1].map(item => ({
                    fc: item.fcMs ? new Date(item.fcMs) : parseSheetDate(item.fcStr || ''),
                    fcStr: item.fcStr || '',
                    oc: item.oc || '',
                    fcomp: item.fcompMs ? new Date(item.fcompMs) : null,
                    fcompOrig: item.fcompOrigMs ? new Date(item.fcompOrigMs) : null,
                    free: Number(item.free) || 0,
                    nom: item.nom || '',
                    prov: item.prov || ''
                }));
                if (list.length > 0) restored.set(pair[0], list);
            }
            if (restored.size > 0) {
                liveLpptBySku = restored;
                return true;
            }
        } catch (e) {}
        return false;
    }

    async function fetchLiveLpptOrders() {
        restoreLpptOrdersFromLocalCache();
        if (!LPPT_SHEET_ID) return;
        try {
            const url = 'https://docs.google.com/spreadsheets/d/' + LPPT_SHEET_ID +
                '/export?format=csv&gid=' + encodeURIComponent(LPPT_GID);
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return;
            const text = await res.text();
            const rows = parseCsvText(text);
            if (rows.length < 3) return;

            const normUp = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            const nextMap = new Map();
            let observedAnyFolio = false;
            for (let i = 2; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length <= 9) continue;

                const folio = r.length > 12 ? cleanStr(r[12]) : '';
                const comAses = r.length > 19 ? String(r[19] || '') : '';
                if (folio && registerObservedFolio(folio, '')) {
                    observedAnyFolio = true;
                }
                if (comAses) {
                    const fMatches = comAses.match(/\b(?:PTC|CCB|DTC|PL|PRO|OUT|CED|ADM)\s*\d{2,7}\b/gi);
                    if (fMatches) {
                        for (let fm = 0; fm < fMatches.length; fm++) {
                            if (registerObservedFolio(fMatches[fm], '')) observedAnyFolio = true;
                        }
                    }
                }

                const sku = cleanStr(r[9]).toUpperCase();
                const oc = cleanStr(r[3]); // Columna D: Orden de compra
                if (!sku || !oc || sku === 'CLA00E') continue;

                const cliente = r.length > 15 ? cleanStr(r[15]) : '';
                const estatus = r.length > 16 ? normUp(r[16]) : '';
                const garantia = r.length > 17 ? normUp(r[17]) : '';
                const comComp = r.length > 18 ? normUp(r[18]) : '';
                const comAsesNorm = normUp(comAses);
                if (
                    folio ||
                    cliente ||
                    /CANCEL|RECIBID|ENTREGAD|BAJA/.test(estatus) ||
                    /NO DISPONIBLE|GARANTIA|APARTAD|ASIGNAD/.test(comComp) ||
                    /GARANTIA|NO DISPONIBLE/.test(garantia)
                ) {
                    continue;
                }

                const rawCant = r.length > 6 ? String(r[6] || '').replace(/,/g, '') : '0';
                const cant = Math.max(0, Math.floor(Number(rawCant) || 0));
                let reserved = 0;
                const matches = comAses.match(/\((\d+)\)/g);
                if (matches) {
                    for (let m = 0; m < matches.length; m++) {
                        reserved += parseInt(matches[m].slice(1, -1), 10) || 0;
                    }
                } else if (
                    comAsesNorm &&
                    (/APARTAD|VENDID|NO DISPONIBLE|GARANTIA/.test(comAsesNorm) || /\b(?:PTC|CCB|DTC|PL|PRO|OUT|CED|ADM)\s*\d{2,7}\b/.test(comAsesNorm))
                ) {
                    continue;
                }
                const freeQty = Math.max(0, cant - reserved);
                if (freeQty <= 0) continue;

                const fcStr = cleanStr(r[2]); // Columna C: Fecha compra
                const fcompStr = r.length > 5 ? cleanStr(r[5]) : ''; // Columna F: Fecha compromiso proveedor
                const rawFcompDate = parseSheetDate(fcompStr);
                const bufferedFcompDate = rawFcompDate ? addDaysLocal(rawFcompDate, SUPPLIER_COMMITMENT_BUFFER_DAYS) : null;
                let list = nextMap.get(sku);
                if (!list) {
                    list = [];
                    nextMap.set(sku, list);
                }
                list.push({
                    fc: parseSheetDate(fcStr),
                    fcStr: fcStr,
                    oc: oc,
                    fcomp: bufferedFcompDate,
                    fcompOrig: rawFcompDate,
                    free: freeQty,
                    nom: r.length > 8 ? cleanStr(r[8]) : '',
                    prov: r.length > 1 ? cleanStr(r[1]) : ''
                });
            }
            if (nextMap.size > 0) {
                liveLpptBySku = nextMap;
                try {
                    const serializable = [];
                    nextMap.forEach((arr, k) => {
                        serializable.push([k, arr.map(e => ({
                            fcMs: (e.fc && !isNaN(e.fc.getTime())) ? e.fc.getTime() : 0,
                            fcStr: e.fcStr || '',
                            oc: e.oc || '',
                            fcompMs: (e.fcomp && !isNaN(e.fcomp.getTime())) ? e.fcomp.getTime() : 0,
                            fcompOrigMs: (e.fcompOrig && !isNaN(e.fcompOrig.getTime())) ? e.fcompOrig.getTime() : 0,
                            free: e.free || 0,
                            nom: e.nom || '',
                            prov: e.prov || ''
                        }))]);
                    });
                    localStorage.setItem(INV_LPPT_CACHE_KEY, JSON.stringify({ ts: Date.now(), entries: serializable }));
                } catch (eCacheLppt) {}
            }
            if (observedAnyFolio && activeAdvisorSession) {
                populateQuoteAdvisorControls();
            }
        } catch (err) {
            // Conservar último mapa LPPT en memoria si falla la red
        }
    }

    function gvizCellRaw(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.v !== null && c.v !== undefined) return c.v;
        if (c.f !== null && c.f !== undefined) return c.f;
        return '';
    }

    function gvizCellFormatted(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return c.f;
        if (c.v !== null && c.v !== undefined) return c.v;
        return '';
    }

    function normalizeLeadTimeVal(rawVal) {
        const s = cleanStr(rawVal);
        if (!s) return '';
        const n = Number(s);
        if (!isNaN(n)) return n >= 0 ? Math.round(n) : '';
        return s;
    }

    function computeLpptAndLeadTime(skuUpper, baseLtRaw, invLpptVal, invFeStr, prevItem, provHint) {
        const baseLtNum = Number(baseLtRaw);
        const validBaseLt = (!isNaN(baseLtNum) && isFinite(baseLtNum) && baseLtNum > 0) ? Math.round(baseLtNum) : '';
        const entries = liveLpptBySku.get(skuUpper);
        const resolvedProv = cleanStr(provHint)
            || cleanStr(prevItem && prevItem.p)
            || (entries && entries.length > 0 ? cleanStr(entries[0] && entries[0].prov) : '');
        const isComprasDateProv = isComprasManagedDateProvider(resolvedProv)
            || (entries && entries.length > 0 && !cleanStr(provHint) && !cleanStr(prevItem && prevItem.p) && entries.some(e => isComprasManagedDateProvider(e && e.prov)));

        if (isComprasDateProv) {
            let lpptQty = 0;
            if (entries && entries.length > 0) {
                for (let k = 0; k < entries.length; k++) {
                    lpptQty += (entries[k] && entries[k].free) || 0;
                }
            } else {
                lpptQty = Math.max(0, Number(invLpptVal) || 0);
            }
            return {
                lpptQty: lpptQty,
                lt: '',
                baseLt: validBaseLt,
                fe: COMPRAS_DATE_NOTICE,
                fcomp: ''
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (entries && entries.length > 0) {
            let lpptQty = 0;
            let bestArr = null;
            let bestComp = null;

            for (let k = 0; k < entries.length; k++) {
                const e = entries[k];
                lpptQty += e.free;

                if (e.fcomp) {
                    if (
                        !bestComp ||
                        (e.fcomp >= today && (bestComp < today || e.fcomp < bestComp)) ||
                        (e.fcomp < today && bestComp < today && e.fcomp > bestComp)
                    ) {
                        bestComp = e.fcomp;
                    }
                }

                let dCompraLt = null;
                if (e.fc && validBaseLt) {
                    dCompraLt = new Date(e.fc.getTime());
                    dCompraLt.setDate(dCompraLt.getDate() + validBaseLt);
                }

                let arr = null;
                if (e.fcomp && e.fcomp >= today) {
                    arr = e.fcomp;
                } else if (dCompraLt && (!e.fcomp || dCompraLt > e.fcomp)) {
                    arr = dCompraLt;
                } else {
                    arr = e.fcomp || dCompraLt;
                }

                if (arr) {
                    if (
                        !bestArr ||
                        (arr >= today && (bestArr < today || arr < bestArr)) ||
                        (arr < today && bestArr < today && arr > bestArr)
                    ) {
                        bestArr = arr;
                    }
                }
            }

            if (!bestArr && invFeStr) {
                bestArr = parseSheetDate(invFeStr);
            }
            const feFormatted = bestArr
                ? formatDateDMY(bestArr)
                : (cleanStr(invFeStr) || 'Sin piezas solicitadas');
            const fcompFormatted = bestComp ? formatDateDMY(bestComp) : '';
            const remDays = bestArr
                ? Math.max(0, Math.round((bestArr.getTime() - today.getTime()) / 86400000))
                : validBaseLt;

            return {
                lpptQty: lpptQty,
                lt: remDays,
                baseLt: validBaseLt,
                fe: feFormatted,
                fcomp: fcompFormatted
            };
        }

        const fallbackQty = Math.max(0, Number(invLpptVal) || 0);
        const feClean = cleanStr(invFeStr) || (prevItem && cleanStr(prevItem.fe)) || 'Sin piezas solicitadas';
        const parsedFe = parseSheetDate(feClean);
        let ltOut = validBaseLt;
        if (fallbackQty > 0 && parsedFe) {
            ltOut = Math.max(0, Math.round((parsedFe.getTime() - today.getTime()) / 86400000));
        } else if (prevItem && prevItem.lt !== undefined && prevItem.lt !== '') {
            ltOut = prevItem.lt;
        }

        return {
            lpptQty: fallbackQty,
            lt: ltOut,
            baseLt: validBaseLt || (prevItem && prevItem.baseLt) || '',
            fe: feClean,
            fcomp: fallbackQty > 0 ? ((prevItem && cleanStr(prevItem.fcomp)) || '') : ''
        };
    }

    function applyLiveGvizTable(table) {
        if (!table || !Array.isArray(table.rows) || !Array.isArray(table.cols)) return false;

        let headers = table.cols.map(c => normHeader((c && c.label) || ''));
        let startRowIdx = 0;

        if (!headers[0] && table.rows.length > 0 && Array.isArray(table.rows[0].c)) {
            headers = table.rows[0].c.map(cell => normHeader((cell && cell.v != null) ? cell.v : ''));
            startRowIdx = 1;
        }

        function findCol(names) {
            const list = Array.isArray(names) ? names : [names];
            for (let k = 0; k < list.length; k++) {
                const idx = headers.indexOf(normHeader(list[k]));
                if (idx !== -1) return idx;
            }
            return -1;
        }

        function resolveWarehouseCol(whLabel) {
            const raw = String(whLabel || '').trim();
            const noParens = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
            const candidates = [raw, noParens];
            if (/^(LPPT|LLPT)$/i.test(noParens)) {
                candidates.push('LPPT', 'LLPT');
            }
            return findCol(candidates);
        }

        const colSku = findCol('SKU');
        const colCedis = findCol(['CEDIS BODEGA', 'CEDIS (BODEGA)', 'CEDIS']);
        const colCasa = findCol(['CASA CREATA BODEGA', 'CASA CREATA (BODEGA)', 'CASA CREATA']);

        if (colSku === -1 || colCedis === -1 || colCasa === -1) {
            return false;
        }

        const colTp = findCol('TIPO DE PRODUCTO');
        const colMo = findCol('MODELO');
        const colNombre = findCol('NOMBRE');
        const colVar = findCol('VARIANTE');
        const colFoto = findCol('FOTO');
        const colCat = findCol('CATEGORIA');
        const colTela = findCol('TELA');
        const colColorTela = findCol('COLOR DE TELA');
        const colMadera = findCol('MADERA');
        const colColorMadera = findCol('COLOR DE MADERA');
        const colMat = findCol('MATERIALES');
        const colMed = findCol('MEDIDAS');
        const colProv = findCol('PROVEEDOR');
        const colPrecio = findCol(['PRECIO DE LISTA', 'PRECIO LISTA', 'PRECIO']);
        const colLt = findCol(['TIEMPO DE ENTREGA (DIAS)', 'TIEMPO DE ENTREGA']);
        const colFe = findCol(['FECHA ESTIMADA DE LLEGADA', 'FECHA ESTIMADA']);
        const colLiveStatus = findCol(['ULTIMA ACTUALIZACION EN VIVO', 'ULTIMA ACTUALIZACION']);
        const whCols = WAREHOUSES.map(wh => resolveWarehouseCol(wh));
        let colOutBod = findCol(['OUTLET COLOSIO (BODEGA)', 'OUTLET COLOSIO BODEGA', 'OUTLET (BODEGA)', 'OUTLET BODEGA', 'OUTLET COLOCIO (BODEGA)', 'OUTLET COLOCIO BODEGA']);
        let colOutPis = findCol(['OUTLET COLOSIO (PISO)', 'OUTLET COLOSIO PISO', 'OUTLET (PISO)', 'OUTLET PISO', 'OUTLET COLOCIO (PISO)', 'OUTLET COLOCIO PISO']);
        if (colOutBod === -1 && headers.length > 30 && /OUTLET/i.test(headers[30] || '')) colOutBod = 30;
        if (colOutPis === -1 && headers.length > 31 && /OUTLET/i.test(headers[31] || '')) colOutPis = 31;

        const liveItems = [];
        const seenLiveSkus = new Set();
        let erpBannerText = '';

        for (let i = startRowIdx; i < table.rows.length; i++) {
            const rowCells = (table.rows[i] && table.rows[i].c) || [];
            const sku = cleanStr(gvizCellRaw(rowCells, colSku));
            if (!sku || sku.toUpperCase() === 'SKU') {
                if (!erpBannerText && colLiveStatus !== -1) {
                    const candBanner = cleanStr(gvizCellFormatted(rowCells, colLiveStatus) || gvizCellRaw(rowCells, colLiveStatus));
                    if (candBanner && /EN\s+VIVO|ERP|LPPT/i.test(candBanner)) {
                        erpBannerText = candBanner;
                    }
                }
                continue;
            }
            const skuUpper = sku.toUpperCase();
            seenLiveSkus.add(skuUpper);
            const prevIt = bySkuMap.get(skuUpper);

            const st = new Array(WAREHOUSES.length);
            for (let w = 0; w < WAREHOUSES.length; w++) {
                const wIdx = whCols[w];
                const rawStock = wIdx !== -1 ? gvizCellRaw(rowCells, wIdx) : 0;
                const numStock = Number(rawStock);
                st[w] = (!isNaN(numStock) && isFinite(numStock)) ? Math.max(0, Math.round(numStock)) : 0;
            }
            const rawOutBod = colOutBod !== -1 ? Number(gvizCellRaw(rowCells, colOutBod)) : (prevIt && prevIt.out_bod !== undefined ? Number(prevIt.out_bod) : 0);
            const rawOutPis = colOutPis !== -1 ? Number(gvizCellRaw(rowCells, colOutPis)) : (prevIt && prevIt.out_pis !== undefined ? Number(prevIt.out_pis) : 0);
            const outBodVal = (!isNaN(rawOutBod) && isFinite(rawOutBod)) ? Math.max(0, Math.round(rawOutBod)) : 0;
            const outPisVal = (!isNaN(rawOutPis) && isFinite(rawOutPis)) ? Math.max(0, Math.round(rawOutPis)) : 0;

            const baseLtVal = normalizeLeadTimeVal(gvizCellRaw(rowCells, colLt));
            const rawFe = colFe !== -1 ? cleanStr(gvizCellFormatted(rowCells, colFe)) : '';
            const rawProvLive = colProv >= 0 ? cleanStr(gvizCellRaw(rowCells, colProv)) : cleanStr(prevIt && prevIt.p);
            const lpptInfo = computeLpptAndLeadTime(skuUpper, baseLtVal, st[0], rawFe, prevIt, rawProvLive);

            if (isLpptWarehouse(WAREHOUSES[0])) {
                st[0] = lpptInfo.lpptQty;
            }

            const rawPrCell = colPrecio !== -1 ? gvizCellRaw(rowCells, colPrecio) : '';
            const rawPr = (rawPrCell !== '' && rawPrCell !== null && rawPrCell !== undefined)
                ? rawPrCell
                : (colPrecio !== -1 ? gvizCellFormatted(rowCells, colPrecio) : '');
            const erpFallbackPr = liveErpPricesBySku.get(skuUpper) || '';
            const prFormatted = formatPrice(rawPr) || formatPrice(erpFallbackPr) || '';

            // Fuente canónica única: cada columna presente en INVENTARIO_EN_VIVO manda 100% (incluso si está vacía).
            // Solo recurrir a prevIt si la columna no vino en la respuesta (colIdx < 0), nunca resucitar caché vieja.
            const liveCol = (colIdx, prevVal) => (colIdx >= 0 ? cleanStr(gvizCellRaw(rowCells, colIdx)) : cleanStr(prevVal));
            liveItems.push(normalizeInventoryItemLive({
                s: sku,
                _fromLiveInvSheet: true,
                tp: liveCol(colTp, prevIt && prevIt.tp),
                mo: liveCol(colMo, prevIt && prevIt.mo),
                n: liveCol(colNombre, prevIt && prevIt.n) || sku,
                vr: liveCol(colVar, prevIt && prevIt.vr),
                f: liveCol(colFoto, prevIt && prevIt.f),
                c: liveCol(colCat, prevIt && prevIt.c),
                tl: liveCol(colTela, prevIt && prevIt.tl),
                ct: liveCol(colColorTela, prevIt && prevIt.ct),
                md: liveCol(colMadera, prevIt && prevIt.md),
                cm: liveCol(colColorMadera, prevIt && prevIt.cm),
                mt: liveCol(colMat, prevIt && prevIt.mt),
                m: liveCol(colMed, prevIt && prevIt.m),
                p: liveCol(colProv, prevIt && prevIt.p),
                pr: prFormatted,
                lt: lpptInfo.lt,
                baseLt: lpptInfo.baseLt,
                fe: lpptInfo.fe,
                fcomp: lpptInfo.fcomp,
                out_bod: outBodVal,
                out_pis: outPisVal,
                st: st
            }, null));
        }

        // Si existe un producto nuevo en el catálogo ERP de S Mueblería (plantilla!AE:AH) que aún no está en INVENTARIO_EN_VIVO, agregarlo y completarlo en automático
        if (liveErpCatalogBySku.size > 0) {
            rebuildLiveAutoVocab(liveItems);
            liveErpCatalogBySku.forEach((erpMeta, skuUpper) => {
                if (!skuUpper || seenLiveSkus.has(skuUpper)) return;
                seenLiveSkus.add(skuUpper);
                const prevIt = bySkuMap.get(skuUpper) || null;
                const st = emptyStocks();
                const lpptInfo = computeLpptAndLeadTime(skuUpper, '', 0, '', prevIt);
                if (isLpptWarehouse(WAREHOUSES[0])) {
                    st[0] = lpptInfo.lpptQty;
                }
                liveItems.push(normalizeInventoryItemLive({
                    s: erpMeta.sku || skuUpper,
                    tp: (prevIt && prevIt.tp) || '',
                    mo: (erpMeta && erpMeta.mo) || (prevIt && prevIt.mo) || '',
                    n: (erpMeta && erpMeta.n) || (prevIt && prevIt.n) || skuUpper,
                    vr: (prevIt && prevIt.vr) || '',
                    f: '',
                    c: (prevIt && prevIt.c) || '',
                    tl: (prevIt && prevIt.tl) || '',
                    ct: (prevIt && prevIt.ct) || '',
                    md: (prevIt && prevIt.md) || '',
                    cm: (prevIt && prevIt.cm) || '',
                    mt: (prevIt && prevIt.mt) || '',
                    m: (prevIt && prevIt.m) || '',
                    p: (prevIt && prevIt.p) || '',
                    pr: formatPrice(erpMeta && erpMeta.pr) || (prevIt && formatPrice(prevIt.pr)) || '',
                    lt: lpptInfo.lt,
                    baseLt: lpptInfo.baseLt,
                    fe: lpptInfo.fe,
                    fcomp: lpptInfo.fcomp,
                    st: st
                }, prevIt));
            });
        }

        // Si viene una pieza nueva en la LPPT que aún no está en INVENTARIO_EN_VIVO ni en plantilla!AE:AH, registrarla en memoria (solo será cotizable si tiene precio ERP válido)
        if (liveLpptBySku.size > 0) {
            rebuildLiveAutoVocab(liveItems);
            liveLpptBySku.forEach((entries, skuUpper) => {
                if (!skuUpper || seenLiveSkus.has(skuUpper) || !entries || entries.length === 0) return;
                seenLiveSkus.add(skuUpper);
                const prevIt = bySkuMap.get(skuUpper) || null;
                const firstEntry = entries[0] || {};
                const st = emptyStocks();
                const lpptInfo = computeLpptAndLeadTime(skuUpper, '', 0, '', prevIt);
                if (isLpptWarehouse(WAREHOUSES[0])) {
                    st[0] = lpptInfo.lpptQty;
                }
                if (st[0] <= 0) return;
                const erpFallbackPr = liveErpPricesBySku.get(skuUpper) || '';
                liveItems.push(normalizeInventoryItemLive({
                    s: skuUpper,
                    tp: (prevIt && prevIt.tp) || '',
                    mo: (prevIt && prevIt.mo) || '',
                    n: firstEntry.nom || (prevIt && prevIt.n) || skuUpper,
                    vr: (prevIt && prevIt.vr) || '',
                    f: '',
                    c: (prevIt && prevIt.c) || '',
                    tl: (prevIt && prevIt.tl) || '',
                    ct: (prevIt && prevIt.ct) || '',
                    md: (prevIt && prevIt.md) || '',
                    cm: (prevIt && prevIt.cm) || '',
                    mt: (prevIt && prevIt.mt) || '',
                    m: (prevIt && prevIt.m) || '',
                    p: firstEntry.prov || (prevIt && prevIt.p) || '',
                    pr: formatPrice(erpFallbackPr) || (prevIt && formatPrice(prevIt.pr)) || '',
                    lt: lpptInfo.lt,
                    baseLt: lpptInfo.baseLt,
                    fe: lpptInfo.fe,
                    fcomp: lpptInfo.fcomp,
                    st: st
                }, prevIt));
            });
        }

        if (liveItems.length === 0) return false;
        setErpLiveStatusBanner(erpBannerText);

        liveItems.sort((a, b) =>
            compareAlphaEs(a.n || a.s, b.n || b.s) ||
            String(a.s || '').localeCompare(String(b.s || ''))
        );

        const nextSig = computeItemsSignature(liveItems);
        if (nextSig !== lastLiveSignature) {
            lastLiveSignature = nextSig;
            // Guardar respaldo offline limpio (antes de overrides locales) para evitar arrastrar ediciones viejas
            const cleanLiveCacheSnapshot = liveItems.map(x => Object.assign({}, x, { st: Array.isArray(x.st) ? x.st.slice() : [] }));
            allItems = liveItems;
            window.CREATA_INV_DATA = liveItems;
            applyAllProductOverridesToCatalog();
            indexItemsAndGroups();
            scheduleSaveLiveInventoryCache(cleanLiveCacheSnapshot);

            const inp = document.getElementById('invSearchInput');
            applyFilter(inp ? inp.value : '', true);
            if (typeof tryFulfillPendingWorkspaceDetailRestore === 'function') {
                tryFulfillPendingWorkspaceDetailRestore();
            }

            const modalEl = document.getElementById('productDetailModal');
            const isModalOpen = modalEl && modalEl.classList.contains('open');
            if (isModalOpen) {
                if (currentDetailItem) {
                    const refreshed = bySkuMap.get(String(currentDetailItem.s).toUpperCase());
                    if (refreshed) {
                        currentDetailItem = refreshed;
                        if (currentGroup) {
                            const updatedGrp = resolveActiveGroup(refreshed._groupKey);
                            currentGroup = (updatedGrp && updatedGrp.items.length > 1) ? updatedGrp : null;
                        }
                        const crumbVisible = !document.getElementById('detGroupCrumb').classList.contains('hidden');
                        renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                    } else {
                        closeProductDetail();
                    }
                } else if (currentGroup) {
                    const refreshedGrp = resolveActiveGroup(currentGroup.key);
                    if (refreshedGrp && refreshedGrp.items.length > 1) {
                        renderGroupVariantsStep(refreshedGrp);
                    } else if (refreshedGrp && refreshedGrp.items.length === 1) {
                        openProductDetail(refreshedGrp.items[0].s, false);
                    } else {
                        closeProductDetail();
                    }
                }
            }
        } else if (typeof tryFulfillPendingWorkspaceDetailRestore === 'function') {
            tryFulfillPendingWorkspaceDetailRestore();
        }

        return true;
    }

    function tryGvizSource(sheetId, queryParam) {
        return new Promise((resolve) => {
            if (!sheetId) {
                resolve(false);
                return;
            }
            const cbName = '__creataInvGviz_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, 7000);

            function cleanup() {
                clearTimeout(timer);
                window[cbName] = function () {};
                setTimeout(() => {
                    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                }, 60000);
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[cbName] = function (resp) {
                cleanup();
                if (!resp || !resp.table) {
                    resolve(false);
                    return;
                }
                resolve(applyLiveGvizTable(resp.table));
            };

            script.onerror = function () {
                cleanup();
                resolve(false);
            };
            script.src = 'https://docs.google.com/spreadsheets/d/' + sheetId +
                '/gviz/tq?tqx=responseHandler:' + cbName +
                '&' + queryParam + '&_t=' + Date.now();
            document.head.appendChild(script);
        });
    }

    async function tryWebAppLiveSync() {
        try {
            const tok = cleanStr(activeAdvisorSession && activeAdvisorSession.authToken);
            if (!tok) return false;
            const json = await callInvWebAppPost('cm_inventory', {
                authToken: tok,
                sheetId: META.sheetId,
                tab: META.tabName || 'INVENTARIO_EN_VIVO'
            }, 15000, true);
            if (json && json.ok && Array.isArray(json.rows) && json.rows.length > 1) {
                const fakeTable = {
                    cols: json.rows[0].map(h => ({ label: String(h || '') })),
                    rows: json.rows.slice(1).map(r => ({ c: r.map(v => ({ v: v })) }))
                };
                return applyLiveGvizTable(fakeTable);
            }
        } catch (e) {}
        return false;
    }

    async function syncHoja1PhotoFallbackLive() {
        if (!META.sheetId || !Array.isArray(allItems) || !allItems.length) return false;
        try {
            const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) +
                '/gviz/tq?tqx=out:csv&headers=0&sheet=1&range=A1:D9500&_t=' + Date.now();
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp || !resp.ok) return false;
            const csv = await resp.text();
            if (!csv || /^\s*</.test(csv)) return false;
            const lines = csv.split(/\r?\n/);
            if (lines.length < 3) return false;
            const photoBySku = new Map();
            for (let i = 2; i < lines.length; i++) {
                const ln = lines[i];
                if (!ln || ln.indexOf('http') === -1) continue;
                // Parse 4 simple CSV cells (SKU, Nombre, Foto, Link)
                const cols = [];
                let cur = '';
                let inQ = false;
                for (let c = 0; c < ln.length; c++) {
                    const ch = ln[c];
                    if (ch === '"') {
                        if (inQ && ln[c + 1] === '"') { cur += '"'; c++; }
                        else inQ = !inQ;
                    } else if (ch === ',' && !inQ) {
                        cols.push(cur);
                        cur = '';
                    } else {
                        cur += ch;
                    }
                }
                cols.push(cur);
                const sk = cleanStr(cols[0]).toUpperCase();
                const link = cleanStr(cols[3]);
                if (sk && /^https?:\/\//i.test(link) && !photoBySku.has(sk)) {
                    photoBySku.set(sk, link);
                }
            }
            if (!photoBySku.size) return false;
            let changed = false;
            for (let i = 0; i < allItems.length; i++) {
                const it = allItems[i];
                if (!it || !it.s) continue;
                const sk = cleanStr(it.s).toUpperCase();
                const liveLink = photoBySku.get(sk);
                if (!liveLink) continue;
                const liveFid = extractDriveFileId(liveLink);
                const curFid = extractDriveFileId(it.f);
                if (!curFid || (liveFid && curFid !== liveFid)) {
                    it.f = liveLink;
                    if (liveFid) failedDrivePhotoIds.delete(liveFid);
                    changed = true;
                }
            }
            if (changed) {
                indexItemsAndGroups();
                const inp = document.getElementById('invSearchInput');
                if (typeof applyFilter === 'function') applyFilter(inp ? inp.value : '', true);
            }
            return changed;
        } catch (eH1) {
            return false;
        }
    }

    let lastLiveSyncCompletedMs = 0;
    let lastOverridesSyncMs = 0;
    const MIN_LIVE_SYNC_GAP_MS = 30000;
    window.refreshLiveSheetNow = async function (forceNow) {
        if (liveSyncInFlight) return;
        if (forceNow !== true && lastLiveSyncCompletedMs > 0 && (Date.now() - lastLiveSyncCompletedMs) < MIN_LIVE_SYNC_GAP_MS) return;
        liveSyncInFlight = true;
        try {
            syncPendingKeyUpdatesToCloud().catch(() => {});
            flushInvOfflineOutbox().catch(() => {});
            if (isGuestSession()) {
                verifyActiveGuestSessionLive().catch(() => {});
            }
            if (forceNow === true || (Date.now() - lastOverridesSyncMs) > 45000) {
                lastOverridesSyncMs = Date.now();
                syncProductOverridesFromCloud(true, { silent: forceNow !== true }).catch(() => {});
            }
            if (Date.now() - lastErpCatalogSyncMs > 60000) {
                await loadErpCatalogLiveFromSheet().catch(() => {});
            }
            await fetchLiveLpptOrders();
            let ok = false;
            if (META.gid != null) {
                ok = await tryGvizSource(META.sheetId, 'gid=' + encodeURIComponent(META.gid));
            }
            if (!ok) {
                ok = await tryGvizSource(META.sheetId, 'sheet=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO'));
            }
            if (!ok) {
                ok = await tryWebAppLiveSync();
            }
            if (ok) {
                syncHoja1PhotoFallbackLive().catch(() => {});
            }
            setLiveConnectionStatus(!!ok);
        } catch (e) {
            setLiveConnectionStatus(false);
        } finally {
            liveSyncInFlight = false;
            lastLiveSyncCompletedMs = Date.now();
        }
    };

    async function unpackInitialInventoryIfNeeded() {
        if (Array.isArray(allItems) && allItems.length > 0) return;
        if (typeof window.CREATA_INV_GZ === 'string' && window.CREATA_INV_GZ.length > 0 && typeof DecompressionStream !== 'undefined') {
            try {
                const binStr = atob(window.CREATA_INV_GZ);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const ds = new DecompressionStream('gzip');
                const stream = new Blob([bytes]).stream().pipeThrough(ds);
                const jsonText = await new Response(stream).text();
                const cols = JSON.parse(jsonText);
                if (Array.isArray(cols) && cols.length >= 16 && Array.isArray(cols[0])) {
                    const len = cols[0].length;
                    const unpacked = new Array(len);
                    for (let i = 0; i < len; i++) {
                        const sku = cleanStr(cols[0][i]);
                        unpacked[i] = normalizeInventoryItemLive({
                            s: sku,
                            tp: cleanStr(cols[1][i]),
                            mo: cleanStr(cols[2][i]),
                            n: cleanStr(cols[3][i]) || sku,
                            vr: cleanStr(cols[4][i]),
                            f: cleanStr(cols[5][i]),
                            c: cleanStr(cols[6][i]),
                            tl: cleanStr(cols[7][i]),
                            ct: cleanStr(cols[8][i]),
                            md: cleanStr(cols[9][i]),
                            cm: cleanStr(cols[10][i]),
                            mt: cleanStr(cols[11][i]),
                            m: cleanStr(cols[12][i]),
                            p: cleanStr(cols[13][i]),
                            lt: normalizeLeadTimeVal(cols[14][i]),
                            st: Array.isArray(cols[15][i]) ? cols[15][i] : emptyStocks(),
                            pr: cols.length > 16 ? formatPrice(cols[16][i]) : '',
                            fe: cols.length > 17 ? cleanStr(cols[17][i]) : '',
                            baseLt: cols.length > 20 ? normalizeLeadTimeVal(cols[20][i]) : normalizeLeadTimeVal(cols[14][i]),
                            fcomp: cols.length > 21 ? shiftDateStringDays(cols[21][i], SUPPLIER_COMMITMENT_BUFFER_DAYS) : ''
                        }, null);
                    }
                    allItems = unpacked;
                    window.CREATA_INV_DATA = unpacked;
                }
            } catch (err) {
                console.error('[Inventario Unpack Error]', err);
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'inventario-app.js · unpackInitialInventoryIfNeeded',
                    event: 'ERROR DESCOMPRIMIENDO INVENTARIO BASE',
                    status: '❌ ERROR',
                    detail: (err && err.message) ? err.message : String(err),
                    analysis: 'Fallo al descomprimir CREATA_INV_GZ con DecompressionStream; el sistema continuará cargando en vivo desde Google Sheets.'
                });
            }
        }
    }

    // ------------------------------------------------------------------------
    // GUARDADO AUTOMÁTICO "DÓNDE ME QUEDÉ" (CATEGORÍA, BUSCADOR, SCROLL,
    // FICHA DE PRODUCTO, CARRITO ABIERTO Y FORMULARIO DE ALTA DE CLIENTE)
    // ------------------------------------------------------------------------
    const INV_WORKSPACE_CHECKPOINT_KEY = 'creata_inv_workspace_checkpoint_v1';
    const NEW_ERP_CLIENT_FIELD_IDS = [
        'newCliNombre', 'newCliPaterno', 'newCliMaterno', 'newCliTelefono',
        'newCliCorreo', 'newCliEmpresa', 'newCliRfc', 'newCliCalle',
        'newCliColonia', 'newCliCp', 'newCliCiudad', 'newCliEstado'
    ];
    let invWorkspaceRestoring = false;
    let invWorkspaceSaveTimer = null;
    let pendingWorkspaceDetailRestore = null;

    function applyRestoredDetailModalExtraState(cpObj) {
        if (!cpObj) return;
        const detDiscInp = document.getElementById('detVisualDiscInput');
        if (cpObj.detailSku && detDiscInp && typeof cpObj.detailVisualDisc === 'string' && cpObj.detailVisualDisc !== '') {
            detDiscInp.value = cpObj.detailVisualDisc;
            if (typeof window.updateDetailVisualDiscount === 'function') window.updateDetailVisualDiscount();
        }
        if (cpObj.detailSku && cpObj.detailRelatedOpen && currentDetailItem) {
            prepareRelatedInStockSection(currentDetailItem, true);
        }
        if (Number(cpObj.detailScrollTop) > 0) {
            const targetScroll = Number(cpObj.detailScrollTop);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    const detScrollEl = document.querySelector('#productDetailModal > .inv-det-modal-card');
                    if (detScrollEl) detScrollEl.scrollTop = targetScroll;
                });
            });
        }
    }

    function tryFulfillPendingWorkspaceDetailRestore() {
        if (!pendingWorkspaceDetailRestore) return false;
        const authReady = !!(activeAdvisorSession && !activeAdvisorSession.mustChangeKey);
        if (!authReady) return false;
        const p = pendingWorkspaceDetailRestore;
        let opened = false;
        invWorkspaceRestoring = true;
        try {
            if (p.detailSku) {
                opened = !!openProductDetail(p.detailSku, !!p.detailFromGroup, true);
            } else if (p.groupKey) {
                opened = !!openGroupModal(p.groupKey);
            }
            if (opened) {
                pendingWorkspaceDetailRestore = null;
                applyRestoredDetailModalExtraState(p);
            }
        } finally {
            invWorkspaceRestoring = false;
        }
        if (opened) {
            saveInvWorkspaceCheckpointNow();
        }
        return opened;
    }

    function readStoredInvWorkspaceCheckpoint() {
        try {
            const raw = localStorage.getItem(INV_WORKSPACE_CHECKPOINT_KEY);
            const cp = raw ? JSON.parse(raw) : null;
            return (cp && typeof cp === 'object') ? cp : null;
        } catch (e) {
            return null;
        }
    }

    function saveInvWorkspaceCheckpointNow(opts) {
        if (invWorkspaceRestoring) return;
        const o = opts || {};
        try {
            const searchInp = document.getElementById('invSearchInput');
            const prodModal = document.getElementById('productDetailModal');
            const cartModal = document.getElementById('cartModal');
            const cartScrollEl = document.querySelector('#cartModal .overflow-y-auto');
            const newCliPanel = document.getElementById('quoteNewErpClientPanel');
            const erpSearchInp = document.getElementById('quoteErpClientSearchInput');
            const crumbEl = document.getElementById('detGroupCrumb');
            const catBar = document.getElementById('invCategoryBar');
            const subBar = document.getElementById('invSubCategoryBar');
            const detScrollEl = document.querySelector('#productDetailModal > .inv-det-modal-card');
            const detDiscInp = document.getElementById('detVisualDiscInput');
            const relPanel = document.getElementById('detRelatedStockPanel');

            const newCliFields = {};
            let hasAnyNewCliVal = false;
            for (let i = 0; i < NEW_ERP_CLIENT_FIELD_IDS.length; i++) {
                const fid = NEW_ERP_CLIENT_FIELD_IDS[i];
                const el = document.getElementById(fid);
                if (el && el.value) {
                    newCliFields[fid] = el.value;
                    hasAnyNewCliVal = true;
                }
            }

            const prodOpen = !!(prodModal && prodModal.classList.contains('open'));
            const keepPendingDetail = !prodOpen && !!pendingWorkspaceDetailRestore;
            const cartOpen = !!(cartModal && cartModal.classList.contains('open'));
            const newCliOpen = !!(newCliPanel && !newCliPanel.classList.contains('hidden'));
            const moduleNow = (activeInAppModule && activeInAppModule !== 'home') ? activeInAppModule : 'inventario';
            const prevCp = readStoredInvWorkspaceCheckpoint();
            let scrollYVal = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
            if (typeof o.forceScrollY === 'number') {
                scrollYVal = Math.max(0, o.forceScrollY);
            } else if (moduleNow !== 'inventario') {
                // La vista de Seguimiento/Historial tiene su propio scroll: conservar el del inventario
                scrollYVal = (prevCp && Number(prevCp.scrollY) > 0) ? Number(prevCp.scrollY) : 0;
            }

            const cp = {
                ts: Date.now(),
                activeModule: moduleNow,
                category: activeCategory || 'ALL',
                subCategory: activeSubCategory || 'ALL',
                searchQuery: searchInp ? String(searchInp.value || '') : '',
                renderedCount: (moduleNow === 'inventario')
                    ? Math.max(0, Number(renderedCount) || 0)
                    : Math.max(0, Number(prevCp && prevCp.renderedCount) || Number(renderedCount) || 0),
                scrollY: scrollYVal,
                catScrollLeft: catBar ? Math.max(0, Math.round(catBar.scrollLeft || 0)) : 0,
                subCatScrollLeft: subBar ? Math.max(0, Math.round(subBar.scrollLeft || 0)) : 0,
                detailOpen: prodOpen || keepPendingDetail,
                detailSku: prodOpen
                    ? ((currentDetailItem && currentDetailItem.s) ? String(currentDetailItem.s) : '')
                    : (keepPendingDetail ? String(pendingWorkspaceDetailRestore.detailSku || '') : ''),
                detailFromGroup: prodOpen
                    ? !!(crumbEl && !crumbEl.classList.contains('hidden'))
                    : (keepPendingDetail ? !!pendingWorkspaceDetailRestore.detailFromGroup : false),
                groupKey: prodOpen
                    ? ((!currentDetailItem && currentGroup && currentGroup.key) ? String(currentGroup.key) : '')
                    : (keepPendingDetail ? String(pendingWorkspaceDetailRestore.groupKey || '') : ''),
                detailVisualDisc: prodOpen
                    ? ((detDiscInp && detDiscInp.value !== '') ? String(detDiscInp.value) : '')
                    : (keepPendingDetail ? String(pendingWorkspaceDetailRestore.detailVisualDisc || '') : ''),
                detailScrollTop: prodOpen
                    ? (detScrollEl ? Math.max(0, Math.round(detScrollEl.scrollTop || 0)) : 0)
                    : (keepPendingDetail ? (Number(pendingWorkspaceDetailRestore.detailScrollTop) || 0) : 0),
                detailRelatedOpen: prodOpen
                    ? !!(relatedStockExpanded || (relPanel && !relPanel.classList.contains('hidden')))
                    : (keepPendingDetail ? !!pendingWorkspaceDetailRestore.detailRelatedOpen : false),
                cartOpen: cartOpen,
                cartScrollTop: (cartOpen && cartScrollEl) ? Math.max(0, Math.round(cartScrollEl.scrollTop || 0)) : 0,
                erpClientSearchQuery: erpSearchInp ? String(erpSearchInp.value || '') : '',
                newCliOpen: newCliOpen,
                newCliFields: hasAnyNewCliVal ? newCliFields : null
            };
            localStorage.setItem(INV_WORKSPACE_CHECKPOINT_KEY, JSON.stringify(cp));
        } catch (e) {}
    }

    function scheduleSaveInvWorkspaceCheckpoint() {
        if (invWorkspaceRestoring) return;
        if (invWorkspaceSaveTimer) clearTimeout(invWorkspaceSaveTimer);
        invWorkspaceSaveTimer = setTimeout(function () {
            invWorkspaceSaveTimer = null;
            saveInvWorkspaceCheckpointNow();
        }, 180);
    }

    function restoreInvWorkspaceCheckpoint() {
        let restoredModule = '';
        try {
            const raw = localStorage.getItem(INV_WORKSPACE_CHECKPOINT_KEY);
            if (!raw) return restoredModule;
            const cp = JSON.parse(raw);
            if (!cp || typeof cp !== 'object') return restoredModule;
            if (cp.ts && (Date.now() - Number(cp.ts)) > (7 * 24 * 60 * 60 * 1000)) return restoredModule;

            invWorkspaceRestoring = true;
            try {
                if (cp.category && typeof cp.category === 'string') {
                    activeCategory = cp.category;
                }
                if (cp.subCategory && typeof cp.subCategory === 'string') {
                    activeSubCategory = cp.subCategory;
                }
                const searchInp = document.getElementById('invSearchInput');
                const qStr = typeof cp.searchQuery === 'string' ? cp.searchQuery : '';
                if (searchInp && qStr) {
                    searchInp.value = qStr;
                }
                const savedCount = Math.max(0, Number(cp.renderedCount) || 0);
                applyFilter(qStr, false, savedCount > 0 ? savedCount : undefined);

                const catBar = document.getElementById('invCategoryBar');
                const subBar = document.getElementById('invSubCategoryBar');
                const applyStripScroll = function () {
                    if (catBar && Number(cp.catScrollLeft) > 0) {
                        catBar.scrollLeft = Number(cp.catScrollLeft);
                        updateHorizontalStripFade(catBar);
                    }
                    if (subBar && Number(cp.subCatScrollLeft) > 0) {
                        subBar.scrollLeft = Number(cp.subCatScrollLeft);
                        updateHorizontalStripFade(subBar);
                    }
                };
                applyStripScroll();
                requestAnimationFrame(applyStripScroll);

                if (cp.newCliFields && typeof cp.newCliFields === 'object') {
                    Object.keys(cp.newCliFields).forEach(fid => {
                        const el = document.getElementById(fid);
                        if (el) el.value = cp.newCliFields[fid];
                    });
                }
                const erpSearchInp = document.getElementById('quoteErpClientSearchInput');
                if (erpSearchInp && cp.erpClientSearchQuery) {
                    erpSearchInp.value = cp.erpClientSearchQuery;
                }

                const authReady = !!(activeAdvisorSession && !activeAdvisorSession.mustChangeKey);
                const wantModule = (cp.activeModule === 'seguimiento' || cp.activeModule === 'historial') ? cp.activeModule : '';
                if (authReady && wantModule && !isGuestSession()) {
                    if (wantModule === 'seguimiento') window.openInAppSeguimiento();
                    else window.openInAppHistorial();
                    restoredModule = wantModule;
                } else if (authReady) {
                    if (cp.detailOpen) {
                        let openedNow = false;
                        if (cp.detailSku) {
                            openedNow = !!openProductDetail(cp.detailSku, !!cp.detailFromGroup, true);
                        } else if (cp.groupKey) {
                            openedNow = !!openGroupModal(cp.groupKey);
                        }
                        if (openedNow) {
                            pendingWorkspaceDetailRestore = null;
                            applyRestoredDetailModalExtraState(cp);
                        } else if (cp.detailSku || cp.groupKey) {
                            pendingWorkspaceDetailRestore = {
                                detailSku: cp.detailSku || '',
                                detailFromGroup: !!cp.detailFromGroup,
                                groupKey: cp.groupKey || '',
                                detailVisualDisc: cp.detailVisualDisc || '',
                                detailScrollTop: Number(cp.detailScrollTop) || 0,
                                detailRelatedOpen: !!cp.detailRelatedOpen
                            };
                        }
                    }
                    if (cp.cartOpen && !isGuestSession()) {
                        window.openCartModal();
                        if (cp.newCliOpen) {
                            window.toggleNewErpClientForm(true);
                        }
                        if (cp.cartScrollTop > 0) {
                            setTimeout(() => {
                                const cartScrollEl = document.querySelector('#cartModal .overflow-y-auto');
                                if (cartScrollEl) cartScrollEl.scrollTop = cp.cartScrollTop;
                            }, 60);
                        }
                    }
                    // Si el modal de cotización recién creada estaba abierto antes de perder conexión/recargar, restaurarlo
                    try {
                        const accRaw = localStorage.getItem(ACCEPTED_QUOTE_MODAL_STORAGE_KEY);
                        if (accRaw) {
                            const accObj = JSON.parse(accRaw);
                            if (accObj && accObj.payload && (!accObj.ts || (Date.now() - Number(accObj.ts)) < (24 * 60 * 60 * 1000))) {
                                openQuoteAcceptedModal(accObj.payload, accObj.submittedMeta, {
                                    isQueued: !!accObj.isQueued,
                                    pdfFileName: accObj.pdfFileName || '',
                                    pdfDriveUrl: accObj.pdfDriveUrl || '',
                                    pdfDownloadUrl: accObj.pdfDownloadUrl || ''
                                });
                            }
                        }
                    } catch (eAcc) {}
                }

                if (!restoredModule && Number(cp.scrollY) > 0) {
                    const targetY = Number(cp.scrollY);
                    const applyScroll = function () {
                        if (activeInAppModule !== 'home') return;
                        window.scrollTo({ top: targetY, behavior: 'auto' });
                    };
                    requestAnimationFrame(function () {
                        requestAnimationFrame(function () {
                            applyScroll();
                            setTimeout(function () {
                                if (Math.abs((window.scrollY || 0) - targetY) > 4) applyScroll();
                            }, 120);
                        });
                    });
                }
            } finally {
                invWorkspaceRestoring = false;
            }
        } catch (e) {
            invWorkspaceRestoring = false;
        }
        return restoredModule;
    }

    function bindInvPersistenceListeners() {
        const quoteFieldIds = [
            'quoteClientNameInput', 'quoteClientPhoneInput', 'quoteClientEmailInput',
            'quoteDeliveryDateInput', 'quoteNotesInput', 'quoteExtraDiscountInput'
        ];
        quoteFieldIds.forEach(fid => {
            const el = document.getElementById(fid);
            if (!el) return;
            el.addEventListener('input', function () {
                if (typeof window.saveQuoteDraftMeta === 'function') window.saveQuoteDraftMeta();
                if (fid === 'quoteExtraDiscountInput') renderQuoteTotalsOnly();
            });
            el.addEventListener('change', function () {
                if (typeof window.saveQuoteDraftMeta === 'function') window.saveQuoteDraftMeta();
            });
        });

        NEW_ERP_CLIENT_FIELD_IDS.concat(['quoteErpClientSearchInput', 'detVisualDiscInput']).forEach(fid => {
            const el = document.getElementById(fid);
            if (!el) return;
            el.addEventListener('input', scheduleSaveInvWorkspaceCheckpoint);
            el.addEventListener('change', scheduleSaveInvWorkspaceCheckpoint);
        });

        ['invCategoryBar', 'invSubCategoryBar'].forEach(function (barId) {
            const bar = document.getElementById(barId);
            if (bar) bar.addEventListener('scroll', scheduleSaveInvWorkspaceCheckpoint, { passive: true });
        });
        const detScrollEl = document.querySelector('#productDetailModal > .inv-det-modal-card');
        if (detScrollEl) detScrollEl.addEventListener('scroll', scheduleSaveInvWorkspaceCheckpoint, { passive: true });

        window.addEventListener('scroll', scheduleSaveInvWorkspaceCheckpoint, { passive: true });
        const cartScrollEl = document.querySelector('#cartModal .overflow-y-auto');
        if (cartScrollEl) {
            cartScrollEl.addEventListener('scroll', scheduleSaveInvWorkspaceCheckpoint, { passive: true });
        }
        document.addEventListener('click', function () {
            scheduleSaveInvWorkspaceCheckpoint();
        }, true);
    }

    // ------------------------------------------------------------------------
    // ALERTAS EN VIVO EN LAPTOP Y CELULAR (CREACIÓN DE COTIZACIONES Y FALLAS CRÍTICAS)
    // ------------------------------------------------------------------------
    const LIVE_ALERTS_SEEN_KEY = 'creata_live_alerts_seen_v1';
    const LIVE_POLL_INTERVAL_MS = 60000;

    (function initCreataLiveAlertsModule() {
        if (window.CreataLiveAlerts && window.CreataLiveAlerts.__unifiedV2) {
            window.toggleLiveAlertsPermission = window.CreataLiveAlerts.enableAndTest;
            return;
        }
        let seenMap = {};
        let pollBaselineSeeded = false;
        let pollInFlight = false;
        try {
            const raw = sessionStorage.getItem(LIVE_ALERTS_SEEN_KEY) || localStorage.getItem(LIVE_ALERTS_SEEN_KEY);
            if (raw) seenMap = JSON.parse(raw) || {};
        } catch (e) {}

        function markAlertSeen(sig) {
            if (!sig) return false;
            if (seenMap[sig]) return false;
            seenMap[sig] = Date.now();
            try {
                const keys = Object.keys(seenMap);
                if (keys.length > 240) {
                    keys.slice(0, keys.length - 180).forEach(k => { delete seenMap[k]; });
                }
                const json = JSON.stringify(seenMap);
                sessionStorage.setItem(LIVE_ALERTS_SEEN_KEY, json);
                localStorage.setItem(LIVE_ALERTS_SEEN_KEY, json);
            } catch (e) {}
            return true;
        }

        function ensureToastContainer() {
            let wrap = document.getElementById('creataLiveAlertToastWrap');
            if (!wrap && document.body) {
                wrap = document.createElement('div');
                wrap.id = 'creataLiveAlertToastWrap';
                wrap.setAttribute('aria-live', 'polite');
                wrap.style.cssText = 'position:fixed;top:14px;right:14px;z-index:96;max-width:min(370px,calc(100vw - 28px));display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(wrap);
            }
            return wrap;
        }

        function showInAppToast(opts) {
            const o = opts || {};
            const wrap = ensureToastContainer();
            if (!wrap) return;
            const isErr = o.kind === 'error';
            const card = document.createElement('div');
            card.style.cssText = 'pointer-events:auto;background:#FFFFFF;border:1.5px solid ' + (isErr ? '#DC2626' : '#10B981') +
                ';border-left:5px solid ' + (isErr ? '#DC2626' : '#10B981') +
                ';border-radius:14px;padding:11px 13px;box-shadow:0 12px 28px rgba(26,24,22,0.18);font-family:"Plus Jakarta Sans",sans-serif;color:#1A1816;transition:opacity .2s ease;';
            card.innerHTML =
                '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
                    '<div style="font-size:12px;font-weight:800;line-height:1.3;color:' + (isErr ? '#991B1B' : '#065F46') + ';">' +
                        escapeHtml(o.title || 'Aviso en vivo') +
                    '</div>' +
                    '<button type="button" aria-label="Cerrar aviso" style="background:transparent;border:none;font-size:14px;font-weight:800;color:#6B655E;cursor:pointer;line-height:1;padding:0 2px;">✕</button>' +
                '</div>' +
                '<div style="font-size:11px;font-weight:600;color:#252C32;margin-top:4px;line-height:1.35;">' +
                    escapeHtml(o.body || '') +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:7px;">' +
                    '<button type="button" data-open-hist="1" style="background:transparent;border:none;font-size:11px;font-weight:800;color:#9E7B4F;cursor:pointer;text-decoration:underline;padding:0;">Ver en Historial</button>' +
                '</div>';

            const closeBtn = card.querySelector('button[aria-label="Cerrar aviso"]');
            const histBtn = card.querySelector('button[data-open-hist="1"]');
            const removeCard = function () {
                if (card.parentNode) card.parentNode.removeChild(card);
            };
            if (closeBtn) closeBtn.addEventListener('click', removeCard);
            if (histBtn) {
                histBtn.addEventListener('click', function () {
                    removeCard();
                    if (typeof window.openInAppHistorial === 'function') window.openInAppHistorial();
                });
            }
            wrap.appendChild(card);
            while (wrap.children.length > 3) {
                wrap.removeChild(wrap.firstChild);
            }
            setTimeout(removeCard, 6500);
        }

        function dispatchSystemNotification(title, body, tag) {
            try {
                if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
                const notifOpts = {
                    body: String(body || ''),
                    tag: String(tag || ('creata-alert-' + Date.now())),
                    renotify: false,
                    data: { openModule: 'historial' }
                };
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistration('./inventario').then(function (reg) {
                        if (reg && typeof reg.showNotification === 'function') {
                            reg.showNotification(title, notifOpts).catch(function () {
                                try { new Notification(title, notifOpts); } catch (eN) {}
                            });
                        } else {
                            try { new Notification(title, notifOpts); } catch (eN2) {}
                        }
                    }).catch(function () {
                        try { new Notification(title, notifOpts); } catch (eN3) {}
                    });
                } else {
                    new Notification(title, notifOpts);
                }
            } catch (e) {}
        }

        function notifyQuoteCreated(info) {
            if (!(typeof isFotosAppOwner === 'function' && isFotosAppOwner())) return;
            const d = info || {};
            const folio = cleanStr(d.folio) || 'SIN-FOLIO';
            const client = cleanStr(d.clientName) || 'Cliente';
            const store = cleanStr(d.erpStore) || '';
            const advisor = cleanStr(d.advisorName).split('|')[0].trim();
            const total = cleanStr(d.total);
            const sig = 'QUOTE|' + folio;
            if (!markAlertSeen(sig)) return;

            const title = '📋 Nueva Cotización ' + folio;
            const bodyParts = [client];
            if (store) bodyParts.push(store);
            if (advisor) bodyParts.push(advisor);
            if (total) bodyParts.push(total);
            const body = bodyParts.join(' · ');

            if (d.showToast !== false) {
                showInAppToast({ kind: 'quote', title: title, body: body });
            }
            dispatchSystemNotification(title, body, sig);
        }

        function notifyFailure(info) {
            if (!(typeof isFotosAppOwner === 'function' && isFotosAppOwner())) return;
            const d = info || {};
            const clas = cleanStr(d.classification).toUpperCase();
            if (clas && clas.indexOf('ALERTA') !== -1 && clas.indexOf('FALLO') === -1) return;
            if (/CORREGIDO/i.test(cleanStr(d.status))) return;
            const ev = cleanStr(d.event) || 'Falla crítica';
            const mod = cleanStr(d.module) || 'Sistema';
            const det = cleanStr(d.detail).slice(0, 120);
            const ref = cleanStr(d.ref);
            const sig = 'ERR|' + mod + '|' + ev + '|' + ref + '|' + det.slice(0, 60);
            if (!markAlertSeen(sig)) return;

            const title = '⚠️ Falla crítica: ' + ev;
            const body = [mod, ref, det].filter(Boolean).join(' · ');
            showInAppToast({ kind: 'error', title: title, body: body });
            dispatchSystemNotification(title, body, sig);
        }

        async function enableAndTest() {
            let perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
            if (perm === 'default' && typeof Notification.requestPermission === 'function') {
                try {
                    perm = await Notification.requestPermission();
                } catch (e) {}
            }
            try { localStorage.setItem('creata_live_alerts_enabled_v1', '1'); } catch (e) {}
            const title = '🔔 Alertas en vivo activas';
            const body = (perm === 'granted')
                ? 'Recibirás avisos de cotizaciones, seguimiento, conexiones/desconexiones y fallas críticas.'
                : 'Avisos en pantalla activos para cotizaciones, seguimiento, conexiones y fallas críticas.';
            showInAppToast({ kind: 'quote', title: title, body: body });
            if (perm === 'granted') {
                dispatchSystemNotification(title, body, 'creata-alert-test-' + Date.now());
            }
            return perm;
        }

        async function poll() {
            if (pollInFlight || !activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) return;
            if (!(typeof isFotosAppOwner === 'function' && isFotosAppOwner())) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            pollInFlight = true;
            try {
                const histRows = await fetchSheetCsvRows('HISTORIAL');
                if (Array.isArray(histRows) && histRows.length > 1) {
                    const startIdx = Math.max(1, histRows.length - 12);
                    for (let i = startIdx; i < histRows.length; i++) {
                        const r = histRows[i] || [];
                        const ts = cleanStr(r[0]);
                        const clas = cleanStr(r[1]).toUpperCase();
                        const mod = cleanStr(r[2]);
                        const ev = cleanStr(r[3]);
                        const st = cleanStr(r[4]);
                        const usr = cleanStr(r[5]);
                        const suc = cleanStr(r[6]);
                        const ref = cleanStr(r[7]);
                        const det = cleanStr(r[8]);
                        const rowSig = 'HROW|' + ts + '|' + ev + '|' + ref;
                        if (!pollBaselineSeeded) {
                            markAlertSeen(rowSig);
                            if (ref) markAlertSeen('QUOTE|' + ref);
                            continue;
                        }
                        if (!markAlertSeen(rowSig)) continue;
                        if (/COTIZACI[ÓO]N CREADA|NUEVA_COTIZACION/i.test(ev)) {
                            notifyQuoteCreated({
                                folio: ref || ts,
                                clientName: det.slice(0, 48) || usr,
                                erpStore: suc,
                                advisorName: usr
                            });
                            refreshMyLiveQuotesThrottled(true);
                        } else if (clas.indexOf('FALLO') !== -1 && !/CORREGIDO/i.test(st)) {
                            notifyFailure({
                                classification: clas,
                                module: mod,
                                event: ev,
                                status: st,
                                ref: ref,
                                detail: det || st,
                                user: usr,
                                branch: suc
                            });
                        }
                    }
                    pollBaselineSeeded = true;
                }
            } catch (e) {} finally {
                pollInFlight = false;
            }
        }

        window.CreataLiveAlerts = {
            notifyQuoteCreated: notifyQuoteCreated,
            notifySeguimientoEvent: function () {},
            ingestPresenceSnapshot: function () {},
            notifyFailure: notifyFailure,
            enableAndTest: enableAndTest,
            poll: poll
        };
        window.toggleLiveAlertsPermission = enableAndTest;
    })();

    document.addEventListener('DOMContentLoaded', async function () {
        await unpackInitialInventoryIfNeeded();
        // Usar el último inventario en vivo guardado en este dispositivo (sirve si no hay conexión);
        // en cuanto responde Google Sheets se reemplaza por el inventario en vivo.
        await restoreLiveInventoryCacheIfAny();
        restoreLpptOrdersFromLocalCache();
        restoreErpCatalogFromLocalCache();
        indexItemsAndGroups();
        lastLiveSignature = computeItemsSignature(allItems);

        // Si el enlace fue abierto por un cliente con ?cotizacion=..., mostrar el Documento Oficial de Cotización sin pedir login
        if (checkAndRenderSharedQuoteDocumentMode()) {
            return;
        }

        initQuoteDraftsSystem();
        openAuthModalForStartup();
        loadErpCatalogLiveFromSheet().then(() => {
            if ((liveErpPricesBySku.size > 0 || liveErpCatalogBySku.size > 0) && Array.isArray(allItems) && allItems.length > 0) {
                let updatedCatalog = false;
                const existingSkus = new Set();
                for (let i = 0; i < allItems.length; i++) {
                    const it = allItems[i];
                    if (!it || !it.s) continue;
                    const skuU = String(it.s).toUpperCase();
                    existingSkus.add(skuU);
                    if (!it.pr) {
                        const livePr = liveErpPricesBySku.get(skuU);
                        if (livePr) {
                            it.pr = livePr;
                            updatedCatalog = true;
                        }
                    }
                    if (!it._avail && getLpptStock(it) >= 1 && hasValidErpPrice(it)) {
                        updatedCatalog = true;
                    }
                }
                liveErpCatalogBySku.forEach((erpMeta, skuU) => {
                    if (!skuU || existingSkus.has(skuU)) return;
                    existingSkus.add(skuU);
                    const st = emptyStocks();
                    const lpptInfo = computeLpptAndLeadTime(skuU, '', 0, '', null);
                    if (isLpptWarehouse(WAREHOUSES[0])) st[0] = lpptInfo.lpptQty;
                    allItems.push(normalizeInventoryItemLive({
                        s: erpMeta.sku || skuU,
                        tp: '',
                        mo: erpMeta.mo || '',
                        n: erpMeta.n || skuU,
                        vr: '',
                        f: '',
                        c: '',
                        tl: '',
                        ct: '',
                        md: '',
                        cm: '',
                        mt: '',
                        m: '',
                        p: '',
                        pr: formatPrice(erpMeta.pr) || '',
                        lt: lpptInfo.lt,
                        baseLt: lpptInfo.baseLt,
                        fe: lpptInfo.fe,
                        fcomp: lpptInfo.fcomp,
                        st: st
                    }, null));
                    updatedCatalog = true;
                });
                if (updatedCatalog) {
                    indexItemsAndGroups();
                    lastLiveSignature = computeItemsSignature(allItems);
                    const curInp = document.getElementById('invSearchInput');
                    applyFilter(curInp ? curInp.value : '', true);
                    tryFulfillPendingWorkspaceDetailRestore();
                }
            }
            if (activeAdvisorSession) {
                if (!activeAdvisorSession.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
                    const matched = matchBestErpAdvisorClient(activeAdvisorSession.nombre, activeAdvisorSession.erpStore, erpAdvisorsCatalog);
                    if (matched) {
                        activeAdvisorSession.erpAdvisorLabel = matched.label;
                        activeAdvisorSession.erpAdvisorId = matched.id;
                        activeAdvisorSession.erpAdvisorBranch = matched.branch;
                        saveAdvisorSession(activeAdvisorSession);
                        renderAdvisorHeaderBar();
                    }
                }
                populateQuoteAdvisorControls();
            }
        }).catch(() => {});

        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            _invPrevSearchNonEmpty = Boolean(cleanStr(inp.value));
            let searchBurstFirstTs = 0;
            let searchBurstLastTs = 0;
            let searchBurstEvents = 0;
            let searchBurstTimer = null;
            inp.addEventListener('input', function () {
                const selfInp = this;
                const val = selfInp.value;
                if (searchBurstTimer) {
                    clearTimeout(searchBurstTimer);
                    searchBurstTimer = null;
                }
                if (/[\r\n]/.test(val)) {
                    const cleanedScan = normalizeScannedBarcodeText(val);
                    selfInp.value = cleanedScan;
                    searchBurstFirstTs = 0;
                    searchBurstLastTs = 0;
                    searchBurstEvents = 0;
                    if (cleanedScan) {
                        processScannedBarcode(cleanedScan, { source: 'Buscador / P2300L' });
                        try {
                            if (typeof selfInp.select === 'function') selfInp.select();
                            if (typeof selfInp.setSelectionRange === 'function') {
                                selfInp.setSelectionRange(0, String(selfInp.value || '').length);
                            }
                            if (isModalOpenById('productDetailModal') && typeof selfInp.blur === 'function') {
                                selfInp.blur();
                            }
                        } catch (e) {}
                        return;
                    }
                }
                const nowTs = Date.now();
                if (!val.trim()) {
                    searchBurstFirstTs = 0;
                    searchBurstLastTs = 0;
                    searchBurstEvents = 0;
                } else {
                    if (!searchBurstFirstTs || (nowTs - searchBurstLastTs) > 420) {
                        searchBurstFirstTs = nowTs;
                        searchBurstEvents = 1;
                    } else {
                        searchBurstEvents++;
                    }
                    searchBurstLastTs = nowTs;
                    const cleanedCandidate = normalizeScannedBarcodeText(val);
                    const elapsed = Math.max(1, nowTs - searchBurstFirstTs);
                    const avgPerChar = elapsed / Math.max(1, cleanedCandidate.length - 1);
                    if (cleanedCandidate.length >= 4 && searchBurstEvents >= 2 && avgPerChar <= 95 && elapsed <= 1600) {
                        searchBurstTimer = setTimeout(function () {
                            searchBurstTimer = null;
                            const latest = normalizeScannedBarcodeText(selfInp.value);
                            if (latest.length >= 4) {
                                const hit = resolveScannedBarcode(latest);
                                if (hit && (hit.status === 'quotable' || hit.status === 'out_of_stock')) {
                                    processScannedBarcode(latest, { source: 'Buscador / P2300L' });
                                    try {
                                        if (typeof selfInp.select === 'function') selfInp.select();
                                        if (typeof selfInp.setSelectionRange === 'function') {
                                            selfInp.setSelectionRange(0, String(selfInp.value || '').length);
                                        }
                                        if (isModalOpenById('productDetailModal') && typeof selfInp.blur === 'function') {
                                            selfInp.blur();
                                        }
                                    } catch (e) {}
                                }
                            }
                        }, 260);
                    }
                }
                const nowNonEmpty = Boolean(cleanStr(val));
                if (!_invPrevSearchNonEmpty && nowNonEmpty) {
                    notifyInvBackStatePush('inv_search');
                }
                _invPrevSearchNonEmpty = nowNonEmpty;
                const clearBtn = document.getElementById('invClearBtn');
                if (clearBtn) {
                    clearBtn.style.display = '';
                    clearBtn.classList.toggle('hidden', !nowNonEmpty);
                }
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(function () {
                    searchDebounceTimer = null;
                    applyFilter(val);
                    scheduleSaveInvWorkspaceCheckpoint();
                }, 150);
            });
        }
        applyIosNoAutoZoomViewportGuard();
        applyFilter('');
        bindInvPersistenceListeners();
        const bootModuleIntent = readAndConsumeOpenModuleIntent();
        const bootAuthReady = !!(activeAdvisorSession && !activeAdvisorSession.mustChangeKey);
        const bootRestoredModule = restoreInvWorkspaceCheckpoint();
        if (bootModuleIntent) {
            if (bootAuthReady) {
                if (!isGuestSession() && bootModuleIntent !== bootRestoredModule) {
                    window.openInAppModule(bootModuleIntent);
                }
            } else {
                pendingPostAuthModuleIntent = bootModuleIntent;
            }
        }
        if (inp) _invPrevSearchNonEmpty = Boolean(cleanStr(inp.value));
        initInventarioBackNav();

        const loadMoreSentinel = document.getElementById('invLoadMoreWrap');
        if (loadMoreSentinel && typeof IntersectionObserver !== 'undefined') {
            const moreObs = new IntersectionObserver(function (entries) {
                if (entries && entries.some(e => e.isIntersecting) && renderedCount < filteredGroups.length) {
                    renderMoreItems(getAdaptivePageSize());
                }
            }, { rootMargin: '420px 0px' });
            moreObs.observe(loadMoreSentinel);
        }
        refreshLiveSheetNow(true);
        function runSmartLivePollTick() {
            if (document.visibilityState === 'visible') {
                if (activeInAppModule !== 'seguimiento') {
                    refreshLiveSheetNow(false);
                }
                sendInvPresenceHeartbeat(activeAdvisorSession, false);
                refreshMyLiveQuotesThrottled(false);
                if (window.CreataLiveAlerts && typeof window.CreataLiveAlerts.poll === 'function') {
                    window.CreataLiveAlerts.poll();
                }
            }
        }
        setInterval(runSmartLivePollTick, 60000);
        window.addEventListener('focus', function () {
            if (activeInAppModule !== 'seguimiento') {
                refreshLiveSheetNow(false);
            }
            sendInvPresenceHeartbeat(activeAdvisorSession, false);
            refreshMyLiveQuotesThrottled(false);
            const modal = document.getElementById('settingsModal');
            if (modal && modal.classList.contains('open') && isRealAdminAccount() && !isKevinAdvisorPreviewActive() && hasAdminPerm('equipoInvitados') && typeof window.refreshSettingsTeamPresence === 'function') {
                window.refreshSettingsTeamPresence(false);
            }
        });
        window.addEventListener('online', function () {
            flushInvOfflineOutbox().catch(() => {});
            refreshLiveSheetNow(true);
            refreshMyLiveQuotesThrottled(true);
        });
        window.addEventListener('offline', function () {
            if (typeof window.saveQuoteDraftMeta === 'function' && !isActiveQuoteCompleted()) {
                window.saveQuoteDraftMeta();
            }
            saveInvWorkspaceCheckpointNow();
            setLiveConnectionStatus(false);
        });
        const saveMountedModuleCheckpoints = function () {
            try {
                if (window.CreataSeguimientoModule && typeof window.CreataSeguimientoModule.isMounted === 'function' && window.CreataSeguimientoModule.isMounted()) {
                    window.CreataSeguimientoModule.saveCheckpoint();
                }
            } catch (e) {}
            try {
                if (window.CreataHistorialModule && typeof window.CreataHistorialModule.isMounted === 'function' && window.CreataHistorialModule.isMounted()) {
                    window.CreataHistorialModule.saveCheckpoint();
                }
            } catch (e) {}
        };
        // Sin purgar borradores al salir: en celular abrir WhatsApp dispara pagehide
        window.addEventListener('pagehide', function () {
            if (typeof window.saveQuoteDraftMeta === 'function' && !isActiveQuoteCompleted()) {
                window.saveQuoteDraftMeta();
            }
            saveInvWorkspaceCheckpointNow();
            saveMountedModuleCheckpoints();
        });
        window.addEventListener('beforeunload', function () {
            if (typeof window.saveQuoteDraftMeta === 'function' && !isActiveQuoteCompleted()) {
                window.saveQuoteDraftMeta();
            }
            saveInvWorkspaceCheckpointNow();
            saveMountedModuleCheckpoints();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                if (typeof window.saveQuoteDraftMeta === 'function' && !isActiveQuoteCompleted()) {
                    window.saveQuoteDraftMeta();
                }
                saveInvWorkspaceCheckpointNow();
                saveMountedModuleCheckpoints();
            } else if (document.visibilityState === 'visible') {
                pruneExpiredQuoteDrafts(true);
                refreshLiveSheetNow(false);
                sendInvPresenceHeartbeat(activeAdvisorSession, false);
                refreshMyLiveQuotesThrottled(false);
            }
        });

        // Abrir inventario.html aun sin internet (solo controla esta página; Catálogo/Admin no se tocan)
        if ('serviceWorker' in navigator && window.isSecureContext) {
            navigator.serviceWorker.register('inventario-sw.js', { scope: './inventario' }).catch(function () {});
        }
        syncPwaInstallButtonState();
    });

    // ------------------------------------------------------------------------
    // INSTALACIÓN DE APP MÓVIL (PWA iOS / ANDROID / DESKTOP) — EN MENÚ FLOTANTE
    // ------------------------------------------------------------------------
    const PWA_INSTALLED_STORAGE_KEY = 'creata_pwa_installed_v1';
    let deferredPwaInstallPrompt = null;

    function isRunningStandalonePwa() {
        try {
            if (window.matchMedia && (
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches ||
                window.matchMedia('(display-mode: window-controls-overlay)').matches
            )) return true;
            if (window.navigator && window.navigator.standalone === true) return true;
            if (typeof document !== 'undefined' && document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
        } catch (e) {}
        return false;
    }

    function isIosMobileDevice() {
        try {
            const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
            if (/iPhone|iPad|iPod/i.test(ua)) return true;
            if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 1) return true;
        } catch (e) {}
        return false;
    }

    function applyIosNoAutoZoomViewportGuard() {
        try {
            if (window.CreataBackNav && typeof window.CreataBackNav.installZoomLock === 'function') {
                window.CreataBackNav.installZoomLock({ win: window, doc: document });
                return;
            }
            if (typeof document === 'undefined' || !document.querySelector) return;
            const vp = document.querySelector('meta[name="viewport"]');
            if (!vp) return;
            const cur = String(vp.getAttribute('content') || '');
            const hasInteractiveWidget = /\binteractive-widget\s*=\s*resizes-content\b/i.test(cur);
            vp.setAttribute(
                'content',
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
                + (hasInteractiveWidget ? ', interactive-widget=resizes-content' : '')
            );
        } catch (e) {}
    }

    applyIosNoAutoZoomViewportGuard();

    function syncPwaInstallButtonState() {
        const fabBtn = document.getElementById('fabInstallAppBtn');
        const headerBtn = document.getElementById('headerInstallAppBtn');
        const nativeModalBtn = document.getElementById('btnTriggerNativeAppInstall');
        const iosCard = document.getElementById('installIosCard');
        const androidCard = document.getElementById('installAndroidCard');
        const isInstalled = isRunningStandalonePwa();
        const isIos = isIosMobileDevice();
        if (fabBtn) {
            fabBtn.classList.toggle('hidden', isInstalled);
            fabBtn.style.display = isInstalled ? 'none' : '';
        }
        if (headerBtn) {
            headerBtn.classList.toggle('hidden', isInstalled);
            headerBtn.style.display = isInstalled ? 'none' : '';
        }
        if (nativeModalBtn) {
            nativeModalBtn.classList.toggle('hidden', !deferredPwaInstallPrompt || isInstalled);
        }
        if (iosCard) {
            iosCard.classList.toggle('inv-install-card-highlight', isIos);
            iosCard.style.order = isIos ? '-1' : '';
        }
        if (androidCard) {
            androidCard.classList.toggle('inv-install-card-highlight', !isIos && !!deferredPwaInstallPrompt);
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPwaInstallPrompt = e;
            try { localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY); } catch (err) {}
            syncPwaInstallButtonState();
        });
        window.addEventListener('appinstalled', function () {
            deferredPwaInstallPrompt = null;
            try { localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1'); } catch (err) {}
            syncPwaInstallButtonState();
            window.closeInstallAppModal();
        });
        if (window.matchMedia) {
            try {
                const mq = window.matchMedia('(display-mode: standalone)');
                if (mq && typeof mq.addEventListener === 'function') {
                    mq.addEventListener('change', syncPwaInstallButtonState);
                }
            } catch (e) {}
        }
        if (window.navigator && typeof window.navigator.getInstalledRelatedApps === 'function') {
            window.navigator.getInstalledRelatedApps().then(function (apps) {
                if (Array.isArray(apps) && apps.length > 0) {
                    try { localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1'); } catch (err) {}
                    syncPwaInstallButtonState();
                }
            }).catch(function () {});
        }
    }

    window.openInstallAppModal = function () {
        syncPwaInstallButtonState();
        const modal = document.getElementById('installAppModal');
        if (modal) {
            modal.classList.add('open');
            notifyInvBackStatePush('install_modal');
        }
    };

    window.closeInstallAppModal = function () {
        const modal = document.getElementById('installAppModal');
        if (modal) modal.classList.remove('open');
    };

    window.triggerNativeAppInstall = async function () {
        if (!deferredPwaInstallPrompt) return;
        try {
            deferredPwaInstallPrompt.prompt();
            const choice = await deferredPwaInstallPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
                try { localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1'); } catch (err) {}
                window.closeInstallAppModal();
            }
        } catch (e) {}
        deferredPwaInstallPrompt = null;
        syncPwaInstallButtonState();
    };
