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
    const DELETED_QUEUE_STORAGE = 'creata_fotos_deleted_queue_v1';
    const SAVED_OVERRIDES_STORAGE = 'creata_fotos_saved_overrides_v1';
    const FAST_CACHE_STORAGE = 'creata_fotos_fast_cache_v6';
    const FOTOS_UI_CHECKPOINT_STORAGE = 'creata_fotos_ui_checkpoint_v1';
    const FOTOS_OFFLINE_OUTBOX_STORAGE = 'creata_fotos_offline_outbox_v1';
    const FOTOS_OFFLINE_IDB_NAME = 'creata_fotos_offline_idb_v1';
    const FOTOS_OFFLINE_IDB_STORE = 'pending_photos';
    const FOTOS_INBOX_SYNC_STORAGE = 'creata_fotos_inbox_sync_v1';
    const RECENT_UPLOADS_STORAGE = 'creata_fotos_recent_uploads_v1';
    const FOTOS_TAB_ID = 'ftab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const LIVE_INBOX_POLL_MS = 10000;
    const LIVE_CATALOG_POLL_MS = 25000;

    let _fotosUiCheckpointRestoredOnce = false;
    let _fotosRestoringCheckpoint = false;
    let _fotosUserHasScrolled = false;
    let _fotosFlushingOutbox = false;
    let _deferredFotosInstallPrompt = null;
    let _fotosBackNav = null;
    let _liveInboxTimer = null;
    let _liveCatalogTimer = null;
    let _lastLiveVisibilitySyncMs = 0;
    let _lastInboxFingerprint = '';
    let _lastCatalogFingerprint = '';
    let _lastVisualFingerprint = '';
    let _liveSyncPendingCount = 0;

    const SHEET_GIDS = {
        '1': '620514545',
        'INVENTARIO_EN_VIVO': '690403633',
        'CUENTAS ADMINISTRATIVAS': '1488878870',
        'PROYECTOS': '461542063'
    };

    const LPPT_SHEET_ID = '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE';
    const LPPT_GID = '1025729459';
    const SUPPLIER_COMMITMENT_BUFFER_DAYS = 14;
    const SYNC_BROADCAST_CHANNEL_NAME = 'creata_fotos_cotizador_sync_v1';
    let _fotosSyncChannel = null;

    // Las 11 ubicaciones oficiales del ecosistema CREATA (idénticas a inventario.html / ESTRUCTURA_Y_BASE_BLOQUEADA_PROYECTO.txt)
    const FOTOS_WAREHOUSES = [
        { idx: 0,  key: 'WH_0',  label: 'LPPT',                    short: 'LPPT',             colNames: ['LPPT', 'LLPT'],                                  defaultCol: 15, isLppt: true },
        { idx: 1,  key: 'WH_1',  label: 'CEDIS (BODEGA)',          short: 'CEDIS Bod.',       colNames: ['CEDIS BODEGA', 'CEDIS (BODEGA)'],                defaultCol: 20 },
        { idx: 2,  key: 'WH_2',  label: 'CEDIS (PISO)',            short: 'CEDIS Piso',       colNames: ['CEDIS PISO', 'CEDIS (PISO)'],                    defaultCol: 21 },
        { idx: 3,  key: 'WH_3',  label: 'CASA CREATA (BODEGA)',    short: 'Casa Creata Bod.', colNames: ['CASA CREATA BODEGA', 'CASA CREATA (BODEGA)'],    defaultCol: 22 },
        { idx: 4,  key: 'WH_4',  label: 'CASA CREATA (PISO)',      short: 'Casa Creata Piso', colNames: ['CASA CREATA PISO', 'CASA CREATA (PISO)'],        defaultCol: 23 },
        { idx: 5,  key: 'WH_5',  label: 'PUERTO CANCUN (BODEGA)',  short: 'Pto. Cancún Bod.', colNames: ['PUERTO CANCUN BODEGA', 'PUERTO CANCUN (BODEGA)'], defaultCol: 24 },
        { idx: 6,  key: 'WH_6',  label: 'PUERTO CANCUN (PISO)',    short: 'Pto. Cancún Piso', colNames: ['PUERTO CANCUN PISO', 'PUERTO CANCUN (PISO)'],    defaultCol: 25 },
        { idx: 7,  key: 'WH_7',  label: 'COLOSIO (BODEGA)',        short: 'Colosio Bod.',     colNames: ['COLOSIO BODEGA', 'COLOSIO (BODEGA)'],            defaultCol: 26 },
        { idx: 8,  key: 'WH_8',  label: 'COLOSIO (PISO)',          short: 'Colosio Piso',     colNames: ['COLOSIO PISO', 'COLOSIO (PISO)'],                defaultCol: 27 },
        { idx: 9,  key: 'WH_9',  label: 'PLAYA (BODEGA)',          short: 'Playa Bod.',       colNames: ['PLAYA BODEGA', 'PLAYA (BODEGA)'],                defaultCol: 28 },
        { idx: 10, key: 'WH_10', label: 'PLAYA (PISO)',            short: 'Playa Piso',       colNames: ['PLAYA PISO', 'PLAYA (PISO)'],                    defaultCol: 29 }
    ];
    const FOTOS_WAREHOUSE_BY_KEY = new Map(FOTOS_WAREHOUSES.map((w) => [w.key, w]));

    function emptyFotosStocks() {
        return new Array(FOTOS_WAREHOUSES.length).fill(0);
    }

    function normalizeStocksArray(arr) {
        const out = emptyFotosStocks();
        if (!Array.isArray(arr)) return out;
        const lim = Math.min(out.length, arr.length);
        for (let i = 0; i < lim; i++) {
            const n = Number(arr[i]);
            out[i] = (!isNaN(n) && isFinite(n) && n > 0) ? Math.round(n) : 0;
        }
        return out;
    }

    function computeStockTotals(stArr) {
        const st = Array.isArray(stArr) ? stArr : emptyFotosStocks();
        const lpptStock = Math.max(0, Number(st[0]) || 0);
        let totalBodegaPiso = 0;
        for (let i = 1; i < FOTOS_WAREHOUSES.length; i++) {
            totalBodegaPiso += Math.max(0, Number(st[i]) || 0);
        }
        return {
            totalBodegaPiso: totalBodegaPiso,
            lpptStock: lpptStock,
            isQuotable: (totalBodegaPiso >= 1 || lpptStock >= 1)
        };
    }

    function buildActiveLocationsMeta(stArr) {
        const st = Array.isArray(stArr) ? stArr : [];
        const shortParts = [];
        const searchParts = [];
        for (let i = 1; i < FOTOS_WAREHOUSES.length; i++) {
            const q = Math.max(0, Number(st[i]) || 0);
            if (q > 0) {
                shortParts.push(FOTOS_WAREHOUSES[i].short + ': ' + q);
                searchParts.push(FOTOS_WAREHOUSES[i].label + ' ' + FOTOS_WAREHOUSES[i].short);
            }
        }
        const lpptQ = Math.max(0, Number(st[0]) || 0);
        if (lpptQ > 0) {
            shortParts.unshift('LPPT: ' + lpptQ);
            searchParts.push('LPPT');
        }
        return {
            locSummary: shortParts.slice(0, 3).join(' · ') + (shortParts.length > 3 ? (' +' + (shortParts.length - 3)) : ''),
            locSearchTokens: searchParts.join(' ')
        };
    }

    function formatListPriceText(raw) {
        if (raw === null || raw === undefined) return '';
        const cleaned = String(raw).replace(/[^0-9.-]/g, '');
        if (!cleaned) return '';
        const n = Number(cleaned);
        if (isNaN(n) || !isFinite(n) || n <= 0) return '';
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const CATEGORIAS_DEST_FOLDERS = [
        { key: 'SALAS',        id: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', name: 'FOTOS SALAS',                  short: 'Salas' },
        { key: 'SILLONES',     id: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm', name: 'FOTOS SILLONES',               short: 'Sillones' },
        { key: 'SOFA_CAMA',    id: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_', name: 'FOTOS SOFÁ CAMA Y FUTTONES',   short: 'Sofá Cama' },
        { key: 'MESA_CENTRO',  id: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A', name: 'FOTOS MESA DE CENTRO',         short: 'Mesa Centro' },
        { key: 'MESA_LATERAL', id: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX', name: 'FOTOS MESA LATERALES',         short: 'Mesa Lateral' },
        { key: 'COMEDORES',    id: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', name: 'FOTOS COMEDORES',              short: 'Comedores' },
        { key: 'RECAMARAS',    id: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6', name: 'FOTOS RECAMARAS',              short: 'Recámaras' },
        { key: 'AUXILIARES',   id: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8', name: 'FOTOS DE AUXILIARES',          short: 'Auxiliares' },
        { key: 'ACCESORIOS',   id: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9', name: 'FOTOS ACCESORIOS Y ESPEJOS',   short: 'Accesorios' },
        { key: 'INTERIOR',     id: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9', name: 'FOTOS INTERIOR',               short: 'Interior' }
    ];

    const DEST_FOLDER_BY_ID = new Map(CATEGORIAS_DEST_FOLDERS.map((f) => [f.id, f]));
    const DEST_FOLDER_BY_KEY = new Map(CATEGORIAS_DEST_FOLDERS.map((f) => [f.key, f]));

    const state = {
        unlocked: false,
        authToken: '',
        accessKey: '',
        products: [],
        productBySku: new Map(),
        productByNormName: new Map(),
        siblingsByGroupKey: new Map(),
        filteredProducts: [],
        skuFilterMode: 'ALL',
        skuCategoryFilter: 'ALL',
        skuLocationFilter: 'ALL',
        skuSearchQuery: '',
        selectedSku: '',
        galleryMode: 'INBOX',
        rawInboxFromDrive: [],
        inboxFiles: [],
        fotosNuevasSheetItems: [],
        cachedLoadedList: null,
        inboxSearchQuery: '',
        selectedInboxFileId: '',
        selectedPhotoItem: null,
        inboxLoading: false,
        sheetsLoading: false,
        sheetsPromise: null,
        assignInFlight: 0,
        syncSkusInFlight: false,
        repairInFlight: false,
        loadedFileNamesById: {},
        sessionSavedLogs: [],
        sessionSavedBySku: new Map(),
        deletedQueue: null,
        lightboxUrl: '',
        lightboxOpen: false,
        activeMobileSection: 'secSkuFinder',
        mobileSectionHistory: []
    };

    function syncFotosBackNav(reason) {
        if (_fotosRestoringCheckpoint) return;
        if (_fotosBackNav && typeof _fotosBackNav.syncDepthOnUserAction === 'function') {
            _fotosBackNav.syncDepthOnUserAction(reason);
        }
    }

    function isElHidden(id) {
        const el = document.getElementById(id);
        return !el || (el.classList && el.classList.contains('hidden'));
    }

    function isMobileViewport() {
        try {
            if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0) {
                return window.innerWidth <= 1024;
            }
        } catch (e) {}
        return false;
    }

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
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normPlainCat(str) {
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cleanPhotoUrl(val) {
        const s = cleanStr(val);
        if (!s || s.charCodeAt(0) === 35) return '';
        return /^https?:\/\//i.test(s) ? s : '';
    }

    function isLocalTempPhotoId(val) {
        const s = cleanStr(val);
        return /^local_(?:dir|inb|vis)_/i.test(s);
    }

    function extractDriveFileId(url) {
        const s = cleanStr(url);
        if (!s || isLocalTempPhotoId(s)) return '';
        if (/^[a-zA-Z0-9_-]{18,}$/.test(s)) return s;
        const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
        if (m1 && m1[1]) return m1[1];
        const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        if (m2 && m2[1]) return m2[1];
        return '';
    }

    function buildPhotoThumbUrl(urlOrFileId, widthPx) {
        const w = widthPx || 800;
        const raw = cleanStr(urlOrFileId);
        if (!raw || isLocalTempPhotoId(raw)) return '';
        if (raw.startsWith('data:image/') || raw.startsWith('blob:')) return raw;
        const fid = extractDriveFileId(raw);
        if (fid) {
            return 'https://lh3.googleusercontent.com/d/' + fid + '=w' + w;
        }
        return raw;
    }

    function setFotosLiveStatus(mode, label) {
        const pill = document.getElementById('fotosLiveStatusPill');
        const txt = document.getElementById('fotosLiveStatusText');
        if (!pill) return;
        const isOff = typeof navigator !== 'undefined' && navigator.onLine === false;
        const effectiveMode = isOff ? 'offline' : (mode || 'live');
        pill.classList.remove('is-live', 'is-syncing', 'is-offline');
        if (effectiveMode === 'offline') {
            pill.classList.add('is-offline');
            if (txt) txt.textContent = label || 'Sin red';
            pill.title = 'Sin conexión · los cambios se guardan en el teléfono y subirán solos';
        } else if (effectiveMode === 'syncing') {
            pill.classList.add('is-syncing');
            if (txt) txt.textContent = label || 'Sincronizando';
            pill.title = 'Actualizando cambios nuevos en vivo...';
        } else {
            pill.classList.add('is-live');
            if (txt) txt.textContent = label || 'En vivo';
            pill.title = 'Sincronización automática en vivo activa';
        }
    }

    function computeInboxFingerprint(files) {
        const arr = Array.isArray(files) ? files : [];
        let out = String(arr.length) + '|';
        for (let i = 0; i < arr.length; i++) {
            const f = arr[i];
            if (!f) continue;
            out += (f.id || '') + ':' + (f.shortcutId || '') + ':' + (f.name || '') + ':' + (f.updatedAt || '') + ';';
        }
        return out;
    }

    function computeCatalogFingerprint(list) {
        const arr = Array.isArray(list) ? list : [];
        let photoCount = 0;
        let hash = 5381;
        for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            if (!p) continue;
            if (p.photoUrl) photoCount++;
            const s = (p.sku || '') + '|' + (p.photoFileId || p.photoUrl || '') + '|' + (p.totalBodegaPiso || 0) + '|' + (p.lpptStock || 0);
            for (let j = 0; j < s.length; j++) {
                hash = ((hash << 5) + hash + s.charCodeAt(j)) | 0;
            }
        }
        return arr.length + ':' + photoCount + ':' + (hash >>> 0).toString(36);
    }

    function computeVisualFingerprint(map) {
        const obj = (map && typeof map === 'object') ? map : {};
        const keys = Object.keys(obj).sort();
        let out = String(keys.length) + '|';
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const v = obj[k];
            out += k + ':' + (v ? ((v.status || '') + ':' + (v.note || '') + ':' + (v.updatedAt || '')) : '') + ';';
        }
        return out;
    }

    function notifyFotosInboxChanged(reason) {
        const payload = {
            type: 'CREATA_FOTOS_INBOX_CHANGED',
            source: 'fotos',
            tabId: FOTOS_TAB_ID,
            reason: cleanStr(reason) || 'change',
            ts: Date.now()
        };
        try {
            if (_fotosSyncChannel) _fotosSyncChannel.postMessage(payload);
        } catch (eBc) {}
        try {
            localStorage.setItem(FOTOS_INBOX_SYNC_STORAGE, JSON.stringify({ tabId: FOTOS_TAB_ID, reason: payload.reason, ts: payload.ts }));
        } catch (eLs) {}
    }

    function isFotosBusyForLivePoll() {
        if (!state.unlocked) return true;
        if (state.assignInFlight > 0 || state.repairInFlight || state.syncSkusInFlight) return true;
        if (typeof visualState !== 'undefined' && visualState && visualState.busy) return true;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        return false;
    }

    async function runSilentFotosLiveTick(kind) {
        if (isFotosBusyForLivePoll()) return;
        _liveSyncPendingCount++;
        setFotosLiveStatus('syncing');
        try {
            if (kind === 'inbox') {
                await flushFotosOfflineOutbox();
                await window.refreshInboxOnly(false, { silent: true });
            } else if (kind === 'catalog') {
                await flushFotosOfflineOutbox();
                const tasks = [loadSheetsCatalog({ silent: true })];
                if (typeof syncVisualOverridesFromCloudInFotos === 'function') {
                    tasks.push(syncVisualOverridesFromCloudInFotos({ silent: true }));
                }
                await Promise.all(tasks);
            } else {
                await flushFotosOfflineOutbox();
                const tasks = [
                    window.refreshInboxOnly(false, { silent: true }),
                    loadSheetsCatalog({ silent: true })
                ];
                if (typeof syncVisualOverridesFromCloudInFotos === 'function') {
                    tasks.push(syncVisualOverridesFromCloudInFotos({ silent: true }));
                }
                await Promise.all(tasks);
            }
        } catch (eTick) {
            // Silencioso en auto-sync en segundo plano
        } finally {
            _liveSyncPendingCount = Math.max(0, _liveSyncPendingCount - 1);
            if (_liveSyncPendingCount === 0) {
                setFotosLiveStatus('live');
            }
        }
    }

    function stopFotosLiveAutoSync() {
        if (_liveInboxTimer) {
            clearInterval(_liveInboxTimer);
            _liveInboxTimer = null;
        }
        if (_liveCatalogTimer) {
            clearInterval(_liveCatalogTimer);
            _liveCatalogTimer = null;
        }
    }

    function startFotosLiveAutoSync() {
        stopFotosLiveAutoSync();
        setFotosLiveStatus(
            (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'live'
        );
        _liveInboxTimer = setInterval(() => {
            if (!state.unlocked) {
                stopFotosLiveAutoSync();
                return;
            }
            if (!state.inboxLoading) {
                runSilentFotosLiveTick('inbox');
            }
        }, LIVE_INBOX_POLL_MS);
        _liveCatalogTimer = setInterval(() => {
            if (!state.unlocked) {
                stopFotosLiveAutoSync();
                return;
            }
            if (!state.sheetsLoading) {
                runSilentFotosLiveTick('catalog');
            }
        }, LIVE_CATALOG_POLL_MS);
    }

    function triggerThrottledLiveVisibilitySync() {
        if (!state.unlocked) return;
        const now = Date.now();
        if (now - _lastLiveVisibilitySyncMs < 3500) return;
        _lastLiveVisibilitySyncMs = now;
        runSilentFotosLiveTick('all');
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
        const rawDataFid = cleanStr(imgEl.getAttribute('data-drive-id'));
        const fid = (rawDataFid && !isLocalTempPhotoId(rawDataFid))
            ? rawDataFid
            : extractDriveFileId(imgEl.getAttribute('src') || '');
        const step = parseInt(imgEl.getAttribute('data-fb-step') || '0', 10);
        if (fid && !isLocalTempPhotoId(fid) && /^[a-zA-Z0-9_-]{15,}$/.test(fid)) {
            try { imgEl.removeAttribute('crossorigin'); } catch (eCr) {}
            if (step === 0) {
                imgEl.setAttribute('data-fb-step', '1');
                imgEl.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fid) + '=w800';
                return;
            }
            if (step === 1) {
                imgEl.setAttribute('data-fb-step', '2');
                imgEl.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fid) + '=w400';
                return;
            }
            if (step === 2) {
                imgEl.setAttribute('data-fb-step', '3');
                imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fid) + '&sz=w800';
                return;
            }
            if (step === 3) {
                imgEl.setAttribute('data-fb-step', '4');
                imgEl.src = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fid);
                return;
            }
        }
        imgEl.onerror = null;
        imgEl.style.display = 'none';
        const parent = imgEl.parentElement;
        if (parent && !parent.querySelector('.img-fallback-dash')) {
            const dash = document.createElement('span');
            dash.className = 'img-fallback-dash';
            dash.style.color = 'var(--ink-muted)';
            dash.style.fontSize = '12px';
            dash.textContent = '—';
            parent.appendChild(dash);
        }
    };

    function cleanCategoryForPhotoSearch(categoriaRaw, tipoRaw, nombreRaw) {
        const cat = normPlainCat(categoriaRaw);
        const tp = normPlainCat(tipoRaw);
        const nom = normPlainCat(nombreRaw);
        if (cat.indexOf('SILLAS') !== -1 && cat.indexOf('SILLON') !== -1) {
            if (/\bSILLON(?:ES)?\b/.test(nom + ' ' + tp) && !/\bSILLAS?\b/.test(nom)) return 'SILLONES';
            if (/\bSILLAS?\b/.test(nom + ' ' + tp) && !/\bSILLON(?:ES)?\b/.test(nom)) return 'SILLAS COMEDORES';
            return '';
        }
        return categoriaRaw || '';
    }

    function resolveCategoryDestFolderForProduct(categoriaRaw, tipoRaw, nombreRaw) {
        const cat = normPlainCat(categoriaRaw);
        const tp = normPlainCat(tipoRaw);
        const nom = normPlainCat(nombreRaw);
        const nomHead = nom.split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
        const tpNom = (tp + ' ' + nom).trim();
        const text = (tpNom + ' ' + cat).trim();

        if (/\bFUTON|\bFUTTON|SOFA\s*CAMAS?|\bSALA\s+ASHA\b/.test(text)) return CATEGORIAS_DEST_FOLDERS[2];
        if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(tpNom) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL(?:ES)?\b|\bAUXILIAR(?:ES)?\b/.test(tpNom))) {
            return CATEGORIAS_DEST_FOLDERS[4];
        }
        if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRO|MESA\s+CENTRAL|MESA\s+NIDO/.test(tpNom) || cat === 'MESAS DE CENTRO & LATERALES') {
            return CATEGORIAS_DEST_FOLDERS[3];
        }
        const isModularSalaModule =
            /\b(SIN\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO)?|IZQ(?:UIERDO)?)|MODULO\s+CENTRAL|ESQUINERO|CHAISE|LOVE\s*SEAT|MODULAR)\b/.test(tpNom) ||
            (cat === 'SALAS & SOFAS' && /\bSILLON(?:ES)?\b/.test(tpNom) && /\b(DER(?:ECHO)?|IZQ(?:UIERDO)?|SIN\s+BRAZOS?|CENTRAL|MODULO)\b/.test(tpNom));
        if (isModularSalaModule) {
            return CATEGORIAS_DEST_FOLDERS[0];
        }
        if (/\bSILLAS?\b/.test(nomHead) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
            return CATEGORIAS_DEST_FOLDERS[5];
        }
        if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA)\b/.test(nomHead) && !/\bSILLAS?\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
            return CATEGORIAS_DEST_FOLDERS[1];
        }
        if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tpNom)) {
            return CATEGORIAS_DEST_FOLDERS[1];
        }
        if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tpNom)) {
            return CATEGORIAS_DEST_FOLDERS[0];
        }
        if (
            cat === 'OFICINA' ||
            cat === 'EXTERIOR & TERRAZA' ||
            /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tpNom)
        ) {
            return CATEGORIAS_DEST_FOLDERS[7];
        }
        if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tpNom)) {
            return CATEGORIAS_DEST_FOLDERS[5];
        }
        if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tpNom)) {
            return CATEGORIAS_DEST_FOLDERS[6];
        }
        if (
            cat === 'ACCESORIOS DECORATIVOS' ||
            cat === 'COJINES & TEXTILES' ||
            cat === 'ESPEJOS & ARTE' ||
            cat === 'ILUMINACION' ||
            /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tpNom)
        ) {
            return CATEGORIAS_DEST_FOLDERS[8];
        }
        if (
            cat === 'BUFETERAS & CREDENZAS' ||
            cat === 'COMPLEMENTOS' ||
            /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tpNom)
        ) {
            return CATEGORIAS_DEST_FOLDERS[7];
        }
        return CATEGORIAS_DEST_FOLDERS[9];
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
                setTimeout(() => { try { delete window[cbName]; } catch (e) { window[cbName] = undefined; } }, 30000);
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
                    if (!resp || !resp.table || !Array.isArray(resp.table.rows)) { resolve(null); return; }
                    const colsCount = Array.isArray(resp.table.cols) ? resp.table.cols.length : 0;
                    const out = [];
                    if (Array.isArray(resp.table.cols)) {
                        const hdrLabels = resp.table.cols.map((c) => cleanStr(c && c.label));
                        if (hdrLabels.some(Boolean)) out.push(hdrLabels);
                    }
                    const rows = resp.table.rows;
                    for (let r = 0; r < rows.length; r++) {
                        const rObj = rows[r];
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
                    }
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
        // Para Hoja "1" (gid=620514545) usar primero /export?format=csv&gid=620514545
        // porque ignora cualquier basicFilter activo en Google Sheets y no tiene caché (max-age=0).
        if (sheetName === '1' && SHEET_GIDS['1']) {
            const exportUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
                '/export?format=csv&gid=' + encodeURIComponent(SHEET_GIDS['1']) +
                '&_t=' + Date.now();
            try {
                const expResp = await fetch(exportUrl, { cache: 'no-store' });
                if (expResp && expResp.ok) {
                    const expTxt = await expResp.text();
                    if (expTxt && !expTxt.trimStart().startsWith('<!DOCTYPE') && !expTxt.trimStart().startsWith('<html')) {
                        const expParsed = parseCsvText(expTxt);
                        if (Array.isArray(expParsed) && expParsed.length > 0) return expParsed;
                    }
                }
            } catch (eExp) {}
        }

        const csvUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(SHEET_ID) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName) +
            (rangeStr ? ('&range=' + encodeURIComponent(rangeStr)) : '') +
            '&_t=' + Date.now();
        try {
            const resp = await fetch(csvUrl, { cache: 'no-store' });
            if (resp && resp.ok) {
                const txt = await resp.text();
                if (txt && !txt.trimStart().startsWith('<!DOCTYPE') && !txt.trimStart().startsWith('<html')) {
                    const parsed = parseCsvText(txt);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                }
            }
        } catch (e) {}
        return fetchSheetViaJsonp(sheetName, rangeStr);
    }

    function extractAuthTokenFromLoginRes(cloudRes) {
        if (!cloudRes || typeof cloudRes !== 'object') return '';
        const direct = cleanStr(cloudRes.authToken || cloudRes.renewedAuthToken || (cloudRes.user && cloudRes.user.authToken));
        if (direct) return direct;
        const activeEmail = normalizeEmailInput(state.activeEmail) || OWNER_EMAIL;
        if (Array.isArray(cloudRes.locations)) {
            for (let i = 0; i < cloudRes.locations.length; i++) {
                const loc = cloudRes.locations[i];
                if (loc && normalizeEmailInput(loc.correo) === activeEmail && cleanStr(loc.authToken)) {
                    return cleanStr(loc.authToken);
                }
            }
        }
        return '';
    }

    function persistRefreshedOwnerToken(newToken) {
        const tok = cleanStr(newToken);
        if (!tok) return;
        state.authToken = tok;
        const activeEmail = normalizeEmailInput(state.activeEmail) || OWNER_EMAIL;
        const activeName = cleanStr(state.activeDisplayName) || OWNER_DISPLAY_NAME;
        const activeTab = cleanStr(state.activeSheetTab) || 'CUENTAS ADMINISTRATIVAS';
        const keys = [FOTOS_SESSION_KEY, PANEL_SESSION_KEY, HIST_SESSION_KEY];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                const prev = raw ? (JSON.parse(raw) || {}) : {};
                if (prev.correo && normalizeEmailInput(prev.correo) !== activeEmail) continue;
                const nextObj = Object.assign({}, prev, {
                    correo: activeEmail,
                    nombre: prev.nombre || activeName,
                    sheetTab: prev.sheetTab || activeTab,
                    authToken: tok,
                    verifiedAt: Date.now()
                });
                delete nextObj.accessKey;
                localStorage.setItem(keys[i], JSON.stringify(nextObj));
            } catch (e) {}
        }
    }

    let _ownerTokenRenewPromise = null;

    async function sendRawWebAppPost(action, payloadObj, timeoutMs) {
        // P0-02: usar siempre CANONICAL_WEBAPP_URL para evitar desvío de credenciales/escrituras vía ?webapp= o localStorage
        const targetUrl = CANONICAL_WEBAPP_URL;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 22000) : null;
        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({}, payloadObj || {}, { action: action })),
                signal: controller ? controller.signal : undefined
            });
            if (!resp || !resp.ok) return { ok: false, unavailable: true };
            return (await resp.json()) || { ok: false, unavailable: true };
        } catch (err) {
            return { ok: false, unavailable: true };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    const FOTOS_PRESENCE_DEVICE_KEY = 'creata_inv_presence_dev_v1';
    let _fotosLastHeartbeatMs = 0;
    let _fotosPresenceTimer = null;

    function getFotosPresenceDeviceId() {
        try {
            let id = localStorage.getItem(FOTOS_PRESENCE_DEVICE_KEY);
            if (!id) {
                id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(FOTOS_PRESENCE_DEVICE_KEY, id);
            }
            return id;
        } catch (e) {
            return 'dev_mem_fotos';
        }
    }

    function sendFotosPresenceHeartbeat(forceNow, _isRetry) {
        if (!state.unlocked) return;
        const now = Date.now();
        if (!forceNow && (now - _fotosLastHeartbeatMs) < 45000) return;
        if (!forceNow && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const tok = cleanStr(state.authToken);
        const key = cleanStr(state.accessKey);
        if (!tok && !key) return;
        _fotosLastHeartbeatMs = now;
        const activeEmail = cleanStr(state.activeEmail) || OWNER_EMAIL;
        const activeName = cleanStr(state.activeDisplayName) || OWNER_DISPLAY_NAME;
        const payload = {
            authToken: tok,
            advisorEmail: activeEmail,
            correo: activeEmail,
            nombre: activeName,
            puesto: 'ADMINISTRADOR',
            sheetTab: cleanStr(state.activeSheetTab) || 'CUENTAS ADMINISTRATIVAS',
            erpStore: 'CEDIS',
            deviceId: getFotosPresenceDeviceId(),
            vista: 'fotos',
            view: 'fotos',
            page: 'fotos-productos'
        };
        if (!tok && key) payload.accessKey = key;
        sendRawWebAppPost('inv_presence_heartbeat', payload, 8000).then(async (hbRes) => {
            if (hbRes && hbRes.renewedAuthToken) {
                persistRefreshedOwnerToken(hbRes.renewedAuthToken);
            }
            if (!_isRetry && hbRes && !hbRes.ok && !hbRes.unavailable && (hbRes.authRequired || !hbRes.error) && key) {
                const freshTok = await renewOwnerAuthTokenSilently();
                if (freshTok) {
                    _fotosLastHeartbeatMs = 0;
                    sendFotosPresenceHeartbeat(true, true);
                }
            }
        }).catch(() => {});
    }

    function stopFotosPresenceHeartbeatLoop() {
        if (_fotosPresenceTimer) {
            clearInterval(_fotosPresenceTimer);
            _fotosPresenceTimer = null;
        }
    }

    function startFotosPresenceHeartbeatLoop() {
        stopFotosPresenceHeartbeatLoop();
        _fotosPresenceTimer = setInterval(() => {
            if (state.unlocked && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
                sendFotosPresenceHeartbeat(false);
            }
        }, 60000);
    }

    async function renewOwnerAuthTokenSilently() {
        const key = cleanStr(state.accessKey);
        if (!key) return '';
        if (_ownerTokenRenewPromise) return _ownerTokenRenewPromise;
        const activeEmail = normalizeEmailInput(state.activeEmail) || OWNER_EMAIL;
        const activeTab = cleanStr(state.activeSheetTab) || 'CUENTAS ADMINISTRATIVAS';
        _ownerTokenRenewPromise = (async () => {
            try {
                const loginRes = await sendRawWebAppPost('inv_login', {
                    email: activeEmail,
                    accessKey: key,
                    sheetTab: activeTab
                }, 10000);
                const tok = extractAuthTokenFromLoginRes(loginRes);
                if (tok) {
                    persistRefreshedOwnerToken(tok);
                    return tok;
                }
                return '';
            } catch (e) {
                return '';
            } finally {
                _ownerTokenRenewPromise = null;
            }
        })();
        return _ownerTokenRenewPromise;
    }

    function isOwnerFotosProtectedAction(action) {
        return action === 'fotos_subir_list' ||
            action === 'fotos_subir_upload_inbox' ||
            action === 'fotos_subir_assign' ||
            action === 'fotos_direct_upload_assign' ||
            action === 'fotos_upload_visual_override' ||
            action === 'fotos_reorganize_from_sheets' ||
            action === 'inv_repair_photo_permissions' ||
            action === 'fotos_delete' ||
            action === 'fotos_subir_delete' ||
            action === 'fotos_sync_skus' ||
            action === 'inv_product_overrides_get' ||
            action === 'inv_product_override_save' ||
            action === 'inv_upload_product_photo';
    }

    function isTransientLockError(res) {
        if (!res || res.ok || res.authRequired || res.forbidden || res.forbiddenFolder) return false;
        const msg = cleanStr(res.error).toLowerCase();
        return !!res.retryable || /candado|bloqueo|bloquear|lock|tiempo de espera.*candado|waitlock|otro proceso.*modificando/.test(msg);
    }

    function isRetryablePhotoWriteAction(action) {
        return action === 'fotos_upload_visual_override' ||
            action === 'fotos_direct_upload_assign' ||
            action === 'fotos_subir_assign' ||
            action === 'fotos_subir_upload_inbox' ||
            action === 'fotos_delete' ||
            action === 'fotos_subir_delete' ||
            action === 'inv_product_override_save' ||
            action === 'inv_upload_product_photo';
    }

    // P1-01: Cola FIFO estricta (concurrencia = 1) para escrituras de fotos en Drive/Sheets, evitando colisiones de ScriptLock en toques rápidos
    let _fotosWriteQueueTail = Promise.resolve();
    function enqueueFotosWriteTask(taskFn) {
        const next = _fotosWriteQueueTail.then(taskFn, taskFn);
        _fotosWriteQueueTail = next.then(() => undefined, () => undefined);
        return next;
    }

    async function executeCallWebAppPost(action, payloadObj, timeoutMs) {
        const isFotosAction = isOwnerFotosProtectedAction(action);
        if (isFotosAction && !cleanStr(state.authToken) && cleanStr(state.accessKey)) {
            const preRenewed = await renewOwnerAuthTokenSilently();
            if (preRenewed && payloadObj && typeof payloadObj === 'object') {
                payloadObj = Object.assign({}, payloadObj, { authToken: preRenewed });
            }
        }

        let activePayload = payloadObj;
        let res = await sendRawWebAppPost(action, activePayload, timeoutMs);
        if (res && res.renewedAuthToken) {
            persistRefreshedOwnerToken(res.renewedAuthToken);
        }

        if (isFotosAction && res && !res.ok && !res.unavailable && !res.forbidden && !res.forbiddenFolder) {
            const isSilentGateReject = !cleanStr(res.error) || !!res.authRequired;
            if (isSilentGateReject) {
                if (cleanStr(state.accessKey)) {
                    const freshTok = await renewOwnerAuthTokenSilently();
                    if (freshTok) {
                        activePayload = Object.assign({}, activePayload || {}, { authToken: freshTok });
                        res = await sendRawWebAppPost(action, activePayload, timeoutMs);
                        if (res && res.renewedAuthToken) {
                            persistRefreshedOwnerToken(res.renewedAuthToken);
                        }
                    } else if (!cleanStr(res.error)) {
                        res = Object.assign({}, res, {
                            authRequired: true,
                            error: 'Sesión expirada. Ingresa tu contraseña para conectar con SUBIR PREN.'
                        });
                    }
                } else if (!cleanStr(res.error)) {
                    res = Object.assign({}, res, {
                        authRequired: true,
                        error: 'Sesión expirada. Ingresa tu contraseña para conectar con SUBIR PREN.'
                    });
                }
            }
        }

        if (isRetryablePhotoWriteAction(action) && isTransientLockError(res)) {
            const backoffs = [1500, 3200];
            for (let attempt = 0; attempt < backoffs.length; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, backoffs[attempt]));
                if (cleanStr(state.authToken) && activePayload && typeof activePayload === 'object') {
                    activePayload = Object.assign({}, activePayload, { authToken: state.authToken });
                }
                res = await sendRawWebAppPost(action, activePayload, timeoutMs);
                if (res && res.renewedAuthToken) {
                    persistRefreshedOwnerToken(res.renewedAuthToken);
                }
                if (!isTransientLockError(res)) break;
            }
        }
        return res;
    }

    async function callWebAppPost(action, payloadObj, timeoutMs) {
        if (isRetryablePhotoWriteAction(action)) {
            return enqueueFotosWriteTask(() => executeCallWebAppPost(action, payloadObj, timeoutMs));
        }
        return executeCallWebAppPost(action, payloadObj, timeoutMs);
    }

    function buildOwnerAuthPayload() {
        const payload = {
            authToken: state.authToken || '',
            advisorEmail: cleanStr(state.activeEmail) || OWNER_EMAIL,
            sheetTab: cleanStr(state.activeSheetTab) || 'CUENTAS ADMINISTRATIVAS',
            inboxFolderId: SUBIR_FOLDER_ID
        };
        if (!state.authToken && state.accessKey) {
            payload.accessKey = state.accessKey;
        }
        return payload;
    }

    const DELETED_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
    let _drainingDeletedQueue = false;

    function readDeletedQueue() {
        if (state.deletedQueue) return state.deletedQueue;
        try {
            const raw = localStorage.getItem(DELETED_QUEUE_STORAGE);
            if (!raw) {
                state.deletedQueue = { fileIds: {}, skus: {} };
                return state.deletedQueue;
            }
            const parsed = JSON.parse(raw);
            const rawFileIds = (parsed && typeof parsed.fileIds === 'object' && parsed.fileIds) ? parsed.fileIds : {};
            const rawSkus = (parsed && typeof parsed.skus === 'object' && parsed.skus) ? parsed.skus : {};
            const now = Date.now();
            const cleanFileIds = {};
            let pruned = false;
            Object.keys(rawFileIds).forEach((fid) => {
                const ts = Number(rawFileIds[fid] || 0);
                if (ts > 0 && (now - ts) > DELETED_QUEUE_TTL_MS) {
                    pruned = true;
                    return;
                }
                cleanFileIds[fid] = ts || now;
            });
            state.deletedQueue = {
                fileIds: cleanFileIds,
                skus: rawSkus
            };
            if (pruned) {
                try {
                    localStorage.setItem(DELETED_QUEUE_STORAGE, JSON.stringify(state.deletedQueue));
                } catch (eSavePrune) {}
            }
            return state.deletedQueue;
        } catch (e) {
            state.deletedQueue = { fileIds: {}, skus: {} };
            return state.deletedQueue;
        }
    }

    function writeDeletedQueue(qObj) {
        state.deletedQueue = {
            fileIds: (qObj && qObj.fileIds) || {},
            skus: (qObj && qObj.skus) || {}
        };
        try {
            localStorage.setItem(DELETED_QUEUE_STORAGE, JSON.stringify(state.deletedQueue));
        } catch (e) {}
    }

    function markDeletedInQueue(fileIdRaw, skuRaw) {
        const fid = cleanStr(fileIdRaw);
        const sku = cleanStr(skuRaw).toUpperCase();
        const q = readDeletedQueue();
        if (fid) q.fileIds[fid] = Date.now();
        if (sku) q.skus[sku] = fid || '1';
        writeDeletedQueue(q);
        invalidateLoadedPhotosCache();
    }

    function unmarkSkuDeletedInQueue(skuRaw, fileIdRaw) {
        const sku = cleanStr(skuRaw).toUpperCase();
        const fid = cleanStr(fileIdRaw);
        const q = readDeletedQueue();
        let changed = false;
        if (sku && q.skus[sku]) {
            delete q.skus[sku];
            changed = true;
        }
        if (fid && q.fileIds[fid]) {
            delete q.fileIds[fid];
            changed = true;
        }
        if (changed) {
            writeDeletedQueue(q);
            invalidateLoadedPhotosCache();
        }
    }

    function reconcileDeletedQueueWithLiveState(liveDriveFiles) {
        const q = readDeletedQueue();
        let changed = false;
        if (Array.isArray(liveDriveFiles)) {
            const liveIds = new Set();
            for (let i = 0; i < liveDriveFiles.length; i++) {
                const fid = cleanStr(liveDriveFiles[i] && liveDriveFiles[i].id);
                if (fid) liveIds.add(fid);
            }
            Object.keys(q.fileIds || {}).forEach((fid) => {
                if (!liveIds.has(fid)) {
                    delete q.fileIds[fid];
                    changed = true;
                }
            });
        }
        if (state.productBySku && state.productBySku.size > 0) {
            Object.keys(q.skus || {}).forEach((sku) => {
                const prod = state.productBySku.get(sku);
                if (!prod || !cleanStr(prod.photoUrl)) {
                    delete q.skus[sku];
                    changed = true;
                }
            });
        }
        if (changed) {
            writeDeletedQueue(q);
            invalidateLoadedPhotosCache();
        }
    }

    async function drainPendingDeletedQueueAsync() {
        if (_drainingDeletedQueue) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const q = readDeletedQueue();
        const pendingSkus = Object.keys(q.skus || {});
        const pendingFileIds = Object.keys(q.fileIds || {});
        if (!pendingSkus.length && !pendingFileIds.length) return;

        _drainingDeletedQueue = true;
        try {
            for (let i = 0; i < pendingSkus.length; i++) {
                const sku = pendingSkus[i];
                const fid = cleanStr(q.skus[sku] === '1' ? '' : q.skus[sku]);
                const res = await callWebAppPost('fotos_delete', Object.assign({
                    sku: sku,
                    driveFileId: fid,
                    source: 'LOADED',
                    skipListReturn: true
                }, buildOwnerAuthPayload()), 25000);
                if (res && res.ok) {
                    unmarkSkuDeletedInQueue(sku, fid);
                } else if (res && res.authRequired) {
                    break;
                }
            }
            for (let j = 0; j < pendingFileIds.length; j++) {
                const fid = pendingFileIds[j];
                if (!readDeletedQueue().fileIds[fid]) continue;
                const res = await callWebAppPost('fotos_delete', Object.assign({
                    driveFileId: fid,
                    source: 'INBOX',
                    skipListReturn: true
                }, buildOwnerAuthPayload()), 25000);
                if (res && res.ok) {
                    unmarkSkuDeletedInQueue('', fid);
                } else if (res && res.authRequired) {
                    break;
                }
            }
        } catch (eDrain) {
        } finally {
            _drainingDeletedQueue = false;
        }
    }

    function saveSavedOverridesNow() {
        try {
            const list = [];
            const slice = state.sessionSavedLogs.slice(0, 120);
            for (let i = 0; i < slice.length; i++) {
                const it = slice[i];
                if (!it || !it.sku) continue;
                let persistUrl = cleanStr(it.newUrl);
                if (persistUrl.indexOf('blob:') === 0) {
                    persistUrl = (it.localDataUrl && String(it.localDataUrl).indexOf('data:image/') === 0)
                        ? String(it.localDataUrl)
                        : '';
                }
                const fid = cleanStr(it.fileId);
                if (!persistUrl && fid.indexOf('local_') !== 0) continue;
                list.push({
                    sku: it.sku,
                    productName: it.productName || '',
                    rowNumber: it.rowNumber || '',
                    previousUrl: it.previousUrl || '',
                    newUrl: persistUrl,
                    fileId: fid,
                    fileName: it.fileName || '',
                    destFolderName: it.destFolderName || '',
                    destFolderUrl: it.destFolderUrl || '',
                    ts: it.ts || Date.now()
                });
            }
            try {
                localStorage.setItem(SAVED_OVERRIDES_STORAGE, JSON.stringify(list));
            } catch (eQuota) {
                const slimList = list.map((entry) => Object.assign({}, entry, {
                    newUrl: String(entry.newUrl || '').indexOf('data:image/') === 0 ? '' : entry.newUrl
                }));
                localStorage.setItem(SAVED_OVERRIDES_STORAGE, JSON.stringify(slimList));
            }
        } catch (e) {}
    }

    function hydrateSavedOverrides() {
        try {
            const raw = localStorage.getItem(SAVED_OVERRIDES_STORAGE);
            if (!raw) return;
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return;
            const delQueue = readDeletedQueue();
            const delSkus = delQueue.skus || {};
            const delFiles = delQueue.fileIds || {};
            const logs = [];
            const bySku = new Map();
            const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                if (!it || !it.sku) continue;
                const cleanUrl = cleanStr(it.newUrl);
                const fid = cleanStr(it.fileId || extractDriveFileId(cleanUrl));
                const isLocalPending = fid.indexOf('local_') === 0;
                if ((!cleanUrl || cleanUrl.indexOf('blob:') === 0) && !isLocalPending) continue;
                const sku = cleanStr(it.sku).toUpperCase();
                if (delSkus[sku] || (fid && delFiles[fid])) continue;
                if (it.ts && (now - Number(it.ts)) > maxAgeMs) continue;
                if (bySku.has(sku)) continue;
                const entry = {
                    sku: sku,
                    productName: cleanStr(it.productName),
                    rowNumber: it.rowNumber || '',
                    previousUrl: cleanStr(it.previousUrl),
                    newUrl: cleanUrl,
                    fileId: fid,
                    fileName: cleanStr(it.fileName),
                    destFolderName: cleanStr(it.destFolderName),
                    destFolderUrl: cleanStr(it.destFolderUrl),
                    localDataUrl: cleanUrl.indexOf('data:image/') === 0 ? cleanUrl : '',
                    ts: Number(it.ts) || now
                };
                bySku.set(sku, entry);
                logs.push(entry);
            }
            state.sessionSavedBySku = bySku;
            state.sessionSavedLogs = logs;
        } catch (e) {}
    }

    function invalidateLoadedPhotosCache() {
        state.cachedLoadedList = null;
    }

    let saveCacheTimer = null;
    function scheduleSaveFastCache() {
        if (saveCacheTimer) clearTimeout(saveCacheTimer);
        saveCacheTimer = setTimeout(saveFastCacheNow, 250);
    }

    function buildProductGroupKey(p) {
        if (!p) return '';
        const mo = normPlainCat(p.modelo || '');
        const tp = normPlainCat(p.tipo || '');
        if (!mo || mo.length < 3 || /^(ESTANDAR|PRODUCTO|ACCESORIO|ACCESORIOS|SIN|VARIOS)$/.test(mo)) return '';
        return (tp || p.destFolderId || 'GEN') + '::' + mo;
    }

    function rebuildSiblingVariantsIndex() {
        const byGrp = new Map();
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            const gk = buildProductGroupKey(p);
            p._groupKey = gk;
            if (!gk) continue;
            if (!byGrp.has(gk)) byGrp.set(gk, []);
            byGrp.get(gk).push(p);
        }
        state.siblingsByGroupKey = byGrp;
    }

    function saveFastCacheNow() {
        try {
            const compactProducts = new Array(state.products.length);
            for (let i = 0; i < state.products.length; i++) {
                const p = state.products[i];
                const persistPhotoUrl = (p.photoUrl && String(p.photoUrl).indexOf('blob:') === 0) ? '' : (p.photoUrl || '');
                compactProducts[i] = [
                    p.sku,
                    p.colBName,
                    p.displayName,
                    persistPhotoUrl,
                    p.rowNumber || 0,
                    p.inSheet1 ? 1 : 0,
                    p.inInv ? 1 : 0,
                    p.categoria,
                    p.tipo,
                    p.destFolderId,
                    p.modelo || '',
                    p.variante || '',
                    p.medidas || '',
                    p.acabado || '',
                    Array.isArray(p.st) ? p.st : emptyFotosStocks(),
                    p.precio || '',
                    p.fe || '',
                    p.tl || '',
                    p.ct || '',
                    p.md || '',
                    p.cm || '',
                    p.proveedor || ''
                ];
            }
            const compactInbox = state.rawInboxFromDrive.slice(0, 220).map((f) => ({
                id: f.id,
                name: f.name,
                shortcutId: f.shortcutId || '',
                skuOrigin: f.skuOrigin || '',
                sizeBytes: f.sizeBytes || 0,
                updatedAt: f.updatedAt || '',
                viewUrl: f.viewUrl || ''
            }));
            const compactFn = state.fotosNuevasSheetItems.slice(0, 220).map((f) => ({
                id: f.id,
                name: f.name,
                skuOrigin: f.skuOrigin || '',
                updatedAt: f.updatedAt || '',
                viewUrl: f.viewUrl || ''
            }));
            localStorage.setItem(FAST_CACHE_STORAGE, JSON.stringify({
                ts: Date.now(),
                p: compactProducts,
                inb: compactInbox,
                fn: compactFn,
                lfn: (state.loadedFileNamesById && typeof state.loadedFileNamesById === 'object') ? state.loadedFileNamesById : {}
            }));
        } catch (e) {}
    }

    function hydrateFromFastCache() {
        try {
            localStorage.removeItem('creata_fotos_fast_cache_v2');
            localStorage.removeItem('creata_fotos_fast_cache_v3');
            localStorage.removeItem('creata_fotos_fast_cache_v4');
            localStorage.removeItem('creata_fotos_fast_cache_v5');
            const raw = localStorage.getItem(FAST_CACHE_STORAGE);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.p) || !parsed.p.length) return false;

            const delQueue = readDeletedQueue();
            const delSkus = delQueue.skus || {};
            const delFiles = delQueue.fileIds || {};

            const list = [];
            const bySku = new Map();
            const byNormName = new Map();

            for (let i = 0; i < parsed.p.length; i++) {
                const r = parsed.p[i];
                if (!Array.isArray(r) || !r[0]) continue;
                const sku = String(r[0]);
                const colBName = String(r[1] || '');
                const displayName = String(r[2] || '—');
                let photoUrl = String(r[3] || '');
                let photoFileId = extractDriveFileId(photoUrl);
                const savedOv = state.sessionSavedBySku.get(sku);
                if (savedOv && savedOv.newUrl) {
                    const savedFid = savedOv.fileId || extractDriveFileId(savedOv.newUrl);
                    const prevFid = extractDriveFileId(savedOv.previousUrl);
                    if (!photoFileId || photoFileId === savedFid || photoFileId === prevFid) {
                        photoUrl = savedOv.newUrl;
                        photoFileId = savedFid;
                    }
                }
                if (delSkus[sku] || (photoFileId && delFiles[photoFileId])) {
                    photoUrl = '';
                    photoFileId = '';
                }
                const destId = String(r[9] || '');
                const destMeta = DEST_FOLDER_BY_ID.get(destId) || CATEGORIAS_DEST_FOLDERS[9];
                const modelo = String(r[10] || '');
                const variante = String(r[11] || '');
                const medidas = String(r[12] || '');
                const acabado = String(r[13] || '');
                const hasStocksTuple = Array.isArray(r[14]);
                const st = normalizeStocksArray(r[14]);
                const totals = computeStockTotals(st);
                const locMeta = buildActiveLocationsMeta(st);
                const precio = formatListPriceText(r[15]);
                const fe = cleanStr(r[16]);
                const tl = cleanStr(r[17]);
                const ct = cleanStr(r[18]);
                const md = cleanStr(r[19]);
                const cm = cleanStr(r[20]);
                const proveedor = cleanStr(r[21]);
                const searchSkuNorm = normalizeSearchText(sku);
                const dispNorm = normalizeSearchText(displayName);
                const cleanCat = cleanCategoryForPhotoSearch(r[7] || '', r[8] || '', displayName + ' ' + colBName);
                const searchNameNorm = normalizeSearchText(
                    displayName + ' ' + colBName + ' ' + cleanCat + ' ' + (r[8] || '') + ' ' +
                    modelo + ' ' + variante + ' ' + medidas + ' ' + acabado + ' ' + destMeta.name + ' ' + locMeta.locSearchTokens
                );
                const item = {
                    sku: sku,
                    colBName: colBName,
                    displayName: displayName,
                    photoUrl: photoUrl,
                    photoFileId: photoFileId,
                    rowNumber: (savedOv && savedOv.rowNumber && savedOv.rowNumber !== '...') ? savedOv.rowNumber : (r[4] || null),
                    inSheet1: !!(r[5] || (savedOv && savedOv.newUrl)),
                    inInv: !!r[6],
                    categoria: String(r[7] || ''),
                    tipo: String(r[8] || ''),
                    modelo: modelo,
                    variante: variante,
                    tl: tl,
                    ct: ct,
                    md: md,
                    cm: cm,
                    proveedor: proveedor,
                    medidas: medidas,
                    acabado: acabado,
                    st: st,
                    hasStocksLoaded: hasStocksTuple,
                    totalBodegaPiso: totals.totalBodegaPiso,
                    lpptStock: totals.lpptStock,
                    locSummary: locMeta.locSummary,
                    precio: precio,
                    fe: fe,
                    destFolderId: destMeta.id,
                    destFolderName: destMeta.name,
                    searchSkuNorm: searchSkuNorm,
                    searchNameNorm: searchNameNorm,
                    searchNorm: (searchSkuNorm + ' ' + searchNameNorm).trim()
                };
                list.push(item);
                bySku.set(sku, item);
                if (dispNorm && dispNorm.length >= 5 && !byNormName.has(dispNorm)) {
                    byNormName.set(dispNorm, sku);
                }
            }

            state.products = list;
            state.productBySku = bySku;
            state.productByNormName = byNormName;
            if (parsed.lfn && typeof parsed.lfn === 'object' && !Array.isArray(parsed.lfn)) {
                state.loadedFileNamesById = Object.assign({}, parsed.lfn, state.loadedFileNamesById || {});
            }
            rebuildSiblingVariantsIndex();
            state.fotosNuevasSheetItems = Array.isArray(parsed.fn) ? parsed.fn : [];
            state.rawInboxFromDrive = Array.isArray(parsed.inb) ? parsed.inb : [];
            state.inboxFiles = filterAndMergeInboxFiles(state.rawInboxFromDrive);
            invalidateLoadedPhotosCache();
            return true;
        } catch (e) {
            return false;
        }
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
            // P0-07: limpiar cualquier clave en texto plano heredada de versiones anteriores
            localStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
            }
        } catch (e) {}

        const candidateKeys = [FOTOS_SESSION_KEY, PANEL_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
        let matchedOwner = false;
        let matchedEmail = OWNER_EMAIL;
        let matchedName = OWNER_DISPLAY_NAME;
        let matchedSheetTab = 'CUENTAS ADMINISTRATIVAS';
        let bestToken = '';
        let otherInvEmail = '';

        for (let i = 0; i < candidateKeys.length; i++) {
            try {
                const raw = localStorage.getItem(candidateKeys[i]);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!parsed) continue;
                // Purgar accessKey si quedara de una sesión antigua
                if (parsed.accessKey) {
                    try {
                        const cleaned = Object.assign({}, parsed);
                        delete cleaned.accessKey;
                        localStorage.setItem(candidateKeys[i], JSON.stringify(cleaned));
                    } catch (eStrip) {}
                }
                const email = normalizeEmailInput(parsed.correo);
                const perms = (parsed.adminPermissions && typeof parsed.adminPermissions === 'object') ? parsed.adminPermissions : null;
                const isKevinAllowed = (email === OWNER_EMAIL && !(perms && perms.fotosApp === false));
                const isPermittedAdmin = Boolean(parsed.isAdmin === true && perms && perms.fotosApp === true);
                if (!isKevinAllowed && !isPermittedAdmin) {
                    if (email && candidateKeys[i] === INV_SESSION_KEY) {
                        otherInvEmail = email;
                    }
                    continue;
                }
                if (!parsed.mustChangeKey) {
                    matchedOwner = true;
                    if (email) matchedEmail = email;
                    if (cleanStr(parsed.nombre)) matchedName = cleanStr(parsed.nombre);
                    if (cleanStr(parsed.sheetTab)) matchedSheetTab = cleanStr(parsed.sheetTab);
                    const tok = cleanStr(parsed.authToken);
                    if (tok && !bestToken) bestToken = tok;
                }
            } catch (e) {}
        }

        if (matchedOwner) {
            if (bestToken) {
                return {
                    valid: true,
                    authToken: bestToken,
                    accessKey: '',
                    email: matchedEmail,
                    nombre: matchedName,
                    sheetTab: matchedSheetTab
                };
            }
            return { valid: false, otherEmail: '', needsReauth: true };
        }
        if (otherInvEmail) {
            return { valid: false, otherEmail: otherInvEmail, needsReauth: false };
        }

        return { valid: false, otherEmail: '', needsReauth: false };
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

        if (state.products.length > 0) {
            if (!_fotosUiCheckpointRestoredOnce) {
                restoreFotosUiCheckpointOnce();
            } else {
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
            }
        }
        renderSessionHistoryLog();
        hydrateOfflinePendingPhotos();

        sendFotosPresenceHeartbeat(true);
        startFotosPresenceHeartbeatLoop();
        startFotosLiveAutoSync();

        window.refreshAllPhotoWorkspace(false);
    }

    window.lockFotosPortal = function () {
        state.unlocked = false;
        stopFotosPresenceHeartbeatLoop();
        stopFotosLiveAutoSync();
        state.authToken = '';
        state.accessKey = '';
        if (typeof window.closePhotoLightbox === 'function') window.closePhotoLightbox();
        if (typeof window.closeFotosInstallModal === 'function') window.closeFotosInstallModal();
        if (typeof window.closeFotosSplitCotizador === 'function') window.closeFotosSplitCotizador();
        if (_fotosBackNav && typeof _fotosBackNav.resetToBase === 'function') {
            _fotosBackNav.resetToBase();
        }
        try {
            // P0-07: purgar todas las sesiones hermanas y secretos al cerrar sesión
            localStorage.removeItem(FOTOS_SESSION_KEY);
            localStorage.removeItem(PANEL_SESSION_KEY);
            localStorage.removeItem(HIST_SESSION_KEY);
            localStorage.removeItem(INV_SESSION_KEY);
            localStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
            localStorage.removeItem(PENDING_KEYS_STORAGE);
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

        if (!typedEmail || typedEmail.indexOf('@') === -1) {
            setGateMessage('Ingresa un correo electrónico válido.', 'error');
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
            // P0-01 / P1-10: autenticar siempre contra Apps Script (sin fallback público de contraseñas vía GViz)
            const cloudRes = await callWebAppPost('inv_login', {
                email: typedEmail,
                accessKey: typedKey,
                sheetTab: 'CUENTAS ADMINISTRATIVAS'
            }, 12000);

            if (!cloudRes || cloudRes.unavailable) {
                setGateMessage('Sin conexión con el servidor de autenticación. Intenta de nuevo en unos segundos.', 'error');
                return;
            }
            if (!cloudRes.ok) {
                setGateMessage(cloudRes.error || 'Correo o contraseña incorrectos.', 'error');
                return;
            }

            const usr = cloudRes.user || cloudRes.advisor || {};
            const perms = (usr.adminPermissions && typeof usr.adminPermissions === 'object') ? usr.adminPermissions : null;
            const resolvedEmail = normalizeEmailInput(usr.correo || typedEmail);
            const isKevinAllowed = (resolvedEmail === OWNER_EMAIL && !(perms && perms.fotosApp === false));
            const isPermittedAdmin = Boolean(usr.isAdmin === true && perms && perms.fotosApp === true);
            if (!isKevinAllowed && !isPermittedAdmin) {
                setGateMessage('Esta cuenta no tiene permiso VER_FOTOS_APP activo en CUENTAS ADMINISTRATIVAS.', 'error');
                return;
            }

            const issuedToken = extractAuthTokenFromLoginRes(cloudRes);
            if (!issuedToken) {
                setGateMessage('El servidor no emitió un token de sesión válido. Intenta de nuevo.', 'error');
                return;
            }

            const resolvedName = cleanStr(usr.nombre) || (resolvedEmail === OWNER_EMAIL ? OWNER_DISPLAY_NAME : resolvedEmail);
            const resolvedTab = cleanStr(usr.sheetTab) || 'CUENTAS ADMINISTRATIVAS';
            state.authToken = issuedToken;
            state.accessKey = '';
            state.activeEmail = resolvedEmail;
            state.activeDisplayName = resolvedName;
            state.activeSheetTab = resolvedTab;

            // P0-07: guardar únicamente token HMAC firmado (nunca contraseñas en texto plano)
            const payload = JSON.stringify({
                correo: resolvedEmail,
                nombre: resolvedName,
                sheetTab: resolvedTab,
                isAdmin: true,
                adminPermissions: perms || undefined,
                authToken: issuedToken,
                verifiedAt: Date.now()
            });
            try {
                localStorage.setItem(FOTOS_SESSION_KEY, payload);
                localStorage.setItem(PANEL_SESSION_KEY, payload);
                localStorage.setItem(HIST_SESSION_KEY, payload);
                localStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
                }
            } catch (e) {}
            if (pwdInp) pwdInp.value = '';
            unlockFotosPortal();
            syncFotosBackNav('unlock');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Entrar';
            }
        }
    };

    const NON_SKU_GENERIC_WORDS = new Set([
        'SILLA', 'SILLAS', 'SILLON', 'SILLONES', 'MESA', 'MESAS', 'SALA', 'SALAS', 'SOFA', 'SOFAS',
        'CAMA', 'CAMAS', 'BURO', 'BUROS', 'COMODA', 'COMODAS', 'ESPEJO', 'ESPEJOS', 'TAPETE', 'TAPETES',
        'LAMPARA', 'LAMPARAS', 'CUADRO', 'CUADROS', 'BANCO', 'BANCOS', 'BANCA', 'BANCAS', 'BUFETERA',
        'BUFETERO', 'CREDENZA', 'LIBRERO', 'ESCRITORIO', 'CABECERA', 'COLCHON', 'TABURETE', 'OTTOMAN',
        'PAROTA', 'TABACO', 'CLARO', 'OSCURO', 'NATURAL', 'NOGAL', 'ENCINO', 'TECA', 'ROBLE', 'TZALAM',
        'IVORY', 'SOUL', 'LINEN', 'COTTON', 'SAND', 'CREAM', 'BEIGE', 'GRIS', 'BLANCO', 'NEGRO',
        'FOTO', 'FOTOS', 'IMAGE', 'WHATSAPP', 'COPIA', 'NUEVA', 'NUEVO'
    ]);

    function extractExplicitSkuFromFileName(fileName) {
        const base = cleanStr(fileName).replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
        if (!base || !state.productBySku.size) return '';
        const upperBase = base.toUpperCase();
        if (state.productBySku.has(upperBase)) return upperBase;

        const firstWord = cleanStr(upperBase.split(/\s+/)[0]);
        if (firstWord.length >= 3 && !NON_SKU_GENERIC_WORDS.has(firstWord) && state.productBySku.has(firstWord)) {
            return firstWord;
        }

        const firstPart = cleanStr(upperBase.split(/[\s_\-]+/)[0]);
        if (firstPart.length >= 3 && !NON_SKU_GENERIC_WORDS.has(firstPart) && state.productBySku.has(firstPart)) {
            return firstPart;
        }

        const tokens = upperBase.split(/[^A-Z0-9]+/);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.length >= 4 && !NON_SKU_GENERIC_WORDS.has(t) && state.productBySku.has(t)) return t;
        }
        return '';
    }

    function findSuggestedSkuForFileName(fileName) {
        const base = cleanStr(fileName).replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim();
        if (!base || !state.productBySku.size) return '';

        const explicitSku = extractExplicitSkuFromFileName(fileName);
        if (explicitSku) return explicitSku;

        const normBase = normalizeSearchText(base).replace(/[^a-z0-9]+/g, ' ').trim();
        if (normBase.length >= 5 && state.productByNormName.has(normBase)) {
            return state.productByNormName.get(normBase) || '';
        }

        const fileWords = normBase.split(/\s+/).filter((w) => w.length >= 2 && !/^(de|del|la|el|con|en|y|copia|img|foto|whatsapp|image)$/.test(w));
        if (fileWords.length < 2) return '';

        const fileHasSilla = fileWords.some((w) => w === 'silla' || w === 'sillas');
        const fileHasSillon = fileWords.some((w) => w === 'sillon' || w === 'sillones');

        let bestSku = '';
        let bestScore = 0;
        let tied = false;

        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            const pNorm = normalizeSearchText((p.displayName || '') + ' ' + (p.colBName || '') + ' ' + (p.tipo || '')).replace(/[^a-z0-9]+/g, ' ').trim();
            if (!pNorm) continue;
            const pWords = new Set(pNorm.split(/\s+/).filter(Boolean));
            const pHasSilla = pWords.has('silla') || pWords.has('sillas');
            const pHasSillon = pWords.has('sillon') || pWords.has('sillones');

            if (fileHasSilla && !fileHasSillon && (!pHasSilla || pHasSillon)) continue;
            if (fileHasSillon && !fileHasSilla && (!pHasSillon || pHasSilla)) continue;

            let matched = 0;
            for (let w = 0; w < fileWords.length; w++) {
                if (pWords.has(fileWords[w])) matched++;
            }
            if (matched < Math.max(2, fileWords.length - 1)) continue;

            const score = (matched * 10) - Math.abs(pWords.size - fileWords.length) + (p.inInv ? 2 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestSku = p.sku;
                tied = false;
            } else if (score === bestScore && bestSku !== p.sku) {
                tied = true;
            }
        }

        return (!tied && bestScore >= 18) ? bestSku : '';
    }

    function enrichInboxFileItem(f) {
        const name = cleanStr(f.name);
        const skuOrigin = cleanStr(f.skuOrigin);
        f._searchNorm = normalizeSearchText(name + ' ' + skuOrigin);
        f._suggestedSku = findSuggestedSkuForFileName(name) || skuOrigin;
        f._sizeText = formatFileSize(f.sizeBytes);
        return f;
    }

    function filterAndMergeInboxFiles(rawFiles) {
        const q = readDeletedQueue();
        const delFileMap = q.fileIds || {};
        const seen = new Set();
        const out = [];
        const localPending = Array.isArray(state.inboxFiles)
            ? state.inboxFiles.filter((it) => it && String(it.id || '').indexOf('local_inb_') === 0)
            : [];
        const baseArr = localPending.concat(Array.isArray(rawFiles) ? rawFiles : []);

        for (let i = 0; i < baseArr.length; i++) {
            const f = baseArr[i];
            if (!f || !f.id) continue;
            const fid = cleanStr(f.id);
            if (!fid || !/^[a-zA-Z0-9_-]{15,}$/.test(fid) || delFileMap[fid] || seen.has(fid)) continue;
            seen.add(fid);
            out.push(enrichInboxFileItem(Object.assign({}, f, { id: fid })));
        }

        return out;
    }

    let _recentUploadsMem = null;

    function getVisualOverridesMapSafe() {
        try {
            return (visualState && visualState.overridesMap && typeof visualState.overridesMap === 'object')
                ? visualState.overridesMap
                : {};
        } catch (e) {
            return {};
        }
    }

    function parseMxDateTimestamp(rawStr) {
        const s = cleanStr(rawStr);
        if (!s) return 0;
        if (/^\d{10,13}$/.test(s)) {
            const n = Number(s);
            return n > 1e12 ? n : (n * 1000);
        }
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            const d = parseInt(m[1], 10);
            const mo = parseInt(m[2], 10) - 1;
            let y = parseInt(m[3], 10);
            if (y < 100) y += 2000;
            const hh = m[4] ? parseInt(m[4], 10) : 0;
            const mm = m[5] ? parseInt(m[5], 10) : 0;
            const ss = m[6] ? parseInt(m[6], 10) : 0;
            const dt = new Date(y, mo, d, hh, mm, ss);
            return isNaN(dt.getTime()) ? 0 : dt.getTime();
        }
        const parsed = Date.parse(s);
        return isNaN(parsed) ? 0 : parsed;
    }

    function readRecentUploadsStore() {
        if (Array.isArray(_recentUploadsMem)) return _recentUploadsMem;
        try {
            const raw = localStorage.getItem(RECENT_UPLOADS_STORAGE);
            if (!raw) {
                _recentUploadsMem = [];
                return _recentUploadsMem;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                _recentUploadsMem = parsed.filter((it) => it && it.id && !/^blob:/i.test(cleanStr(it.viewUrl)));
                return _recentUploadsMem;
            }
        } catch (e) {}
        _recentUploadsMem = [];
        return _recentUploadsMem;
    }

    function writeRecentUploadsStore(list) {
        const cleanList = (Array.isArray(list) ? list : []).slice(0, 40);
        _recentUploadsMem = cleanList;
        try {
            const serializable = cleanList.map((it) => {
                const hasDriveId = !isLocalTempPhotoId(it.id) && /^[a-zA-Z0-9_-]{15,}$/.test(cleanStr(it.id));
                return {
                    id: cleanStr(it.id),
                    targetKey: cleanStr(it.targetKey),
                    targetLabel: cleanStr(it.targetLabel).slice(0, 140),
                    targetKind: cleanStr(it.targetKind || 'SKU'),
                    fileName: cleanStr(it.fileName).slice(0, 140),
                    viewUrl: /^blob:/i.test(cleanStr(it.viewUrl)) ? '' : cleanStr(it.viewUrl),
                    localDataUrl: hasDriveId ? '' : (String(it.localDataUrl || '').indexOf('data:image/') === 0 && String(it.localDataUrl).length < 180000 ? it.localDataUrl : ''),
                    destFolderName: cleanStr(it.destFolderName).slice(0, 80),
                    ts: Number(it.ts || 0) || Date.now()
                };
            });
            localStorage.setItem(RECENT_UPLOADS_STORAGE, JSON.stringify(serializable));
        } catch (e) {}
    }

    function recordRecentUploadedPhoto(entry) {
        if (!entry || typeof entry !== 'object') return;
        const rawUrl = cleanStr(entry.viewUrl || entry.newUrl || '');
        if (/^blob:/i.test(rawUrl) && !cleanStr(entry.fileId) && !cleanStr(entry.id)) return;
        const fid = cleanStr(entry.fileId || entry.id || extractDriveFileId(rawUrl));
        const isLocal = isLocalTempPhotoId(fid);
        const safeDataUrl = String(entry.localDataUrl || '').indexOf('data:image/') === 0 ? String(entry.localDataUrl) : '';
        if (!fid || (!isLocal && !/^[a-zA-Z0-9_-]{15,}$/.test(fid)) || (isLocal && !safeDataUrl)) return;

        const targetKey = cleanStr(entry.targetKey || entry.sku || entry.overrideKey).toUpperCase();
        const targetKind = cleanStr(entry.targetKind) || (targetKey.indexOf('VFAB:') === 0 ? 'TELA' : (targetKey.indexOf('VWOD:') === 0 ? 'MADERA' : (targetKey.indexOf('VCOV:') === 0 ? 'PORTADA' : 'SKU')));
        const targetLabel = cleanStr(entry.targetLabel || entry.productName || entry.label || targetKey);
        const fileName = cleanStr(entry.fileName || (state.loadedFileNamesById && state.loadedFileNamesById[fid]) || '');
        const viewUrl = (!/^blob:/i.test(rawUrl) && rawUrl) || (!isLocal ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '');
        const nextRec = {
            id: fid,
            targetKey: targetKey,
            targetLabel: targetLabel,
            targetKind: targetKind,
            fileName: fileName,
            viewUrl: viewUrl,
            localDataUrl: safeDataUrl,
            destFolderName: cleanStr(entry.destFolderName || (targetKind === 'TELA' ? 'Tela' : (targetKind === 'MADERA' ? 'Madera' : (targetKind === 'PORTADA' ? 'Portada' : '')))),
            ts: Number(entry.ts || Date.now()) || Date.now()
        };

        const prev = readRecentUploadsStore();
        const merged = [nextRec].concat(prev.filter((it) => it && it.id !== fid));
        writeRecentUploadsStore(merged);
        if (fileName && !isLocal) {
            state.loadedFileNamesById[fid] = fileName;
        }
        invalidateLoadedPhotosCache();
        if (typeof renderRecentUploadedStrip === 'function') {
            renderRecentUploadedStrip();
        }
    }

    function formatShortTimeLabel(ts) {
        const n = Number(ts || 0);
        if (!n || !isFinite(n)) return '';
        const diffMin = Math.floor((Date.now() - n) / 60000);
        if (diffMin >= 0 && diffMin < 1) return 'Ahora';
        if (diffMin >= 1 && diffMin < 60) return diffMin + 'm';
        try {
            const d = new Date(n);
            const now = new Date();
            if (d.toDateString() === now.toDateString()) {
                return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            }
            return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        } catch (e) {
            return '';
        }
    }

    function getRecentUploadedPhotosList() {
        const q = readDeletedQueue();
        const delFileMap = q.fileIds || {};
        const delSkuMap = q.skus || {};
        const fileNameMap = (state.loadedFileNamesById && typeof state.loadedFileNamesById === 'object')
            ? state.loadedFileNamesById
            : {};

        const byId = new Map();
        const pushCandidate = (cand) => {
            if (!cand || !cand.id) return;
            const fid = cleanStr(cand.id);
            const isLocal = isLocalTempPhotoId(fid);
            if (!fid || (!isLocal && !/^[a-zA-Z0-9_-]{15,}$/.test(fid))) return;
            if (delFileMap[fid]) return;
            if (cand.targetKey && delSkuMap[cand.targetKey]) return;
            if (isLocal && !cand.localDataUrl) return;
            if (/^blob:/i.test(cleanStr(cand.viewUrl))) return;

            const prev = byId.get(fid);
            if (!prev || (cand.ts || 0) > (prev.ts || 0)) {
                byId.set(fid, Object.assign({}, prev || {}, cand, {
                    fileName: cleanStr(cand.fileName || (prev && prev.fileName) || fileNameMap[fid] || ''),
                    localDataUrl: cand.localDataUrl || (prev && prev.localDataUrl) || ''
                }));
            } else {
                if (!prev.fileName && cand.fileName) prev.fileName = cand.fileName;
                if (!prev.localDataUrl && cand.localDataUrl) prev.localDataUrl = cand.localDataUrl;
            }
        };

        // 1) Historial reciente guardado en dispositivo
        const stored = readRecentUploadsStore();
        for (let i = 0; i < stored.length; i++) {
            pushCandidate(stored[i]);
        }

        // 2) Subidas de SKU de la sesión actual
        for (let s = 0; s < state.sessionSavedLogs.length; s++) {
            const log = state.sessionSavedLogs[s];
            if (!log || !log.sku) continue;
            const sku = cleanStr(log.sku).toUpperCase();
            const fid = cleanStr(log.fileId || extractDriveFileId(log.newUrl));
            pushCandidate({
                id: fid,
                targetKey: sku,
                targetLabel: log.productName || sku,
                targetKind: 'SKU',
                fileName: cleanStr(log.fileName || fileNameMap[fid] || ''),
                viewUrl: log.newUrl || (!isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : ''),
                localDataUrl: log.localDataUrl || '',
                destFolderName: cleanStr(log.destFolderName || ''),
                ts: Number(log.ts || 0) || parseMxDateTimestamp(log.timestamp) || (Date.now() - (s + 1) * 1000)
            });
        }

        // 3) Portadas, Telas y Maderas en la nube (_INV_PRODUCT_OVERRIDES)
        const ovMap = getVisualOverridesMapSafe();
        const ovKeys = Object.keys(ovMap);
        for (let i = 0; i < ovKeys.length; i++) {
            const ovKey = cleanStr(ovKeys[i]).toUpperCase();
            if (ovKey.indexOf('VCOV:') !== 0 && ovKey.indexOf('VFAB:') !== 0 && ovKey.indexOf('VWOD:') !== 0) continue;
            const ov = ovMap[ovKeys[i]];
            const ovStatus = ov ? cleanStr(ov.status).toUpperCase() : '';
            if (!ov || ovStatus === 'DELETED' || ovStatus === 'ELIMINADO' || ovStatus === 'ARCHIVADO') continue;
            const rawUrl = cleanStr(ov.note);
            if (!rawUrl || /^blob:/i.test(rawUrl)) continue;
            const isDataUri = rawUrl.indexOf('data:image/') === 0;
            const fid = isDataUri ? cleanStr(ov.localFileId) : extractDriveFileId(rawUrl);
            if (!fid) continue;
            const kind = ovKey.indexOf('VFAB:') === 0 ? 'TELA' : (ovKey.indexOf('VWOD:') === 0 ? 'MADERA' : 'PORTADA');
            const label = cleanStr(ov.name) || ovKey.replace(/^V(?:COV|FAB|WOD):/, '');
            pushCandidate({
                id: fid,
                targetKey: ovKey,
                targetLabel: label,
                targetKind: kind,
                fileName: cleanStr(fileNameMap[fid] || ''),
                viewUrl: isDataUri ? '' : ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing'),
                localDataUrl: isDataUri ? rawUrl : '',
                destFolderName: kind === 'TELA' ? 'Tela' : (kind === 'MADERA' ? 'Madera' : 'Portada'),
                ts: parseMxDateTimestamp(ov.updatedAt) || 0
            });
        }

        return Array.from(byId.values())
            .sort((a, b) => (Number(b.ts || 0) - Number(a.ts || 0)))
            .slice(0, 24);
    }

    function getLoadedPhotosList() {
        if (state.cachedLoadedList) return state.cachedLoadedList;

        const q = readDeletedQueue();
        const delFileMap = q.fileIds || {};
        const delSkuMap = q.skus || {};
        const fileNameMap = (state.loadedFileNamesById && typeof state.loadedFileNamesById === 'object')
            ? state.loadedFileNamesById
            : {};
        const items = [];
        const seenKey = new Set();

        // 1) Recién cargadas primero (incluye SKUs, Portadas, Telas y Maderas)
        const recent = getRecentUploadedPhotosList();
        for (let r = 0; r < recent.length; r++) {
            const it = recent[r];
            const sku = cleanStr(it.targetKey || it.id).toUpperCase();
            const fid = cleanStr(it.id);
            const key = sku + '::' + fid;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            const kindLabel = it.targetKind === 'TELA' ? '🧵 Tela' : (it.targetKind === 'MADERA' ? '🪵 Madera' : (it.targetKind === 'PORTADA' ? '🖼️ Portada' : (it.destFolderName || '').replace(/^FOTOS\s+(DE\s+)?/i, '')));
            items.push({
                id: fid,
                sku: sku,
                name: it.targetLabel || sku,
                fileName: it.fileName || '',
                viewUrl: it.viewUrl || (!isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : ''),
                localDataUrl: it.localDataUrl || '',
                destFolderName: it.destFolderName || kindLabel,
                shortFolder: kindLabel || 'Reciente',
                targetKind: it.targetKind || 'SKU',
                rowNumber: null,
                fromLoaded: true,
                _searchNorm: normalizeSearchText(sku + ' ' + (it.fileName || '') + ' ' + (it.targetLabel || '') + ' ' + kindLabel)
            });
        }

        for (let s = 0; s < state.sessionSavedLogs.length; s++) {
            const log = state.sessionSavedLogs[s];
            if (!log || !log.sku) continue;
            const sku = cleanStr(log.sku).toUpperCase();
            const fid = cleanStr(log.fileId || extractDriveFileId(log.newUrl));
            const isLocal = isLocalTempPhotoId(fid);
            if (!fid || (!isLocal && !/^[a-zA-Z0-9_-]{15,}$/.test(fid)) || (isLocal && !log.localDataUrl) || delFileMap[fid] || delSkuMap[sku]) continue;
            const key = sku + '::' + fid;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            const name = log.productName || sku;
            const fileName = cleanStr(log.fileName || fileNameMap[fid] || '');
            const destName = log.destFolderName || '';
            items.push({
                id: fid,
                sku: sku,
                name: name,
                fileName: fileName,
                viewUrl: log.newUrl || (!isLocal ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : ''),
                localDataUrl: log.localDataUrl || '',
                destFolderName: destName,
                shortFolder: destName.replace(/^FOTOS\s+(DE\s+)?/i, ''),
                rowNumber: log.rowNumber || null,
                fromLoaded: true,
                _searchNorm: normalizeSearchText(sku + ' ' + fileName + ' ' + name + ' ' + destName)
            });
        }

        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (!p || !p.photoUrl || /^blob:/i.test(cleanStr(p.photoUrl))) continue;
            const sku = p.sku;
            const fid = p.photoFileId || extractDriveFileId(p.photoUrl);
            const isLocal = isLocalTempPhotoId(fid);
            if (!fid || (!isLocal && !/^[a-zA-Z0-9_-]{15,}$/.test(fid)) || (isLocal && String(p.photoUrl).indexOf('data:image/') !== 0) || delFileMap[fid] || delSkuMap[sku]) continue;
            const key = sku + '::' + fid;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            const name = p.displayName || p.colBName || sku;
            const fileName = cleanStr(fileNameMap[fid] || '');
            const destName = p.destFolderName || '';
            items.push({
                id: fid,
                sku: sku,
                name: name,
                fileName: fileName,
                viewUrl: p.photoUrl,
                localDataUrl: '',
                destFolderName: destName,
                shortFolder: destName.replace(/^FOTOS\s+(DE\s+)?/i, ''),
                rowNumber: p.rowNumber || null,
                fromLoaded: true,
                _searchNorm: (p.searchSkuNorm || '') + ' ' + normalizeSearchText(fileName) + ' ' + (p.searchNameNorm || '') + ' ' + normalizeSearchText(destName)
            });
        }

        state.cachedLoadedList = items;
        return items;
    }

    function parseFotosDateSimple(rawStr) {
        const s = cleanStr(rawStr);
        if (!s) return null;
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m1) {
            const d = parseInt(m1[1], 10);
            const m = parseInt(m1[2], 10) - 1;
            let y = parseInt(m1[3], 10);
            if (y < 100) y += 2000;
            const dt = new Date(y, m, d);
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (m2) {
            const dt = new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        return null;
    }

    function formatFotosDateDMY(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + dt.getFullYear();
    }

    // Lectura ESTRICTAMENTE EN SOLO LECTURA de LPPT Proveedores ([BLOQUEADO-4])
    async function fetchLiveLpptSummaryReadOnly() {
        const lpptUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(LPPT_SHEET_ID) +
            '/gviz/tq?tqx=out:csv&headers=0&gid=' + encodeURIComponent(LPPT_GID) + '&_t=' + Date.now();
        try {
            const resp = await fetch(lpptUrl, { cache: 'no-store' });
            if (!resp || !resp.ok) return null;
            const txt = await resp.text();
            if (!txt || txt.trimStart().startsWith('<!DOCTYPE') || txt.trimStart().startsWith('<html')) return null;
            const rows = parseCsvText(txt);
            if (!Array.isArray(rows) || rows.length < 3) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const map = new Map();

            for (let i = 2; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length <= 9) continue;
                const sku = cleanStr(r[9]).toUpperCase();
                const oc = cleanStr(r[3]);
                if (!sku || !oc || sku === 'CLA00E') continue;

                const folio = r.length > 12 ? cleanStr(r[12]) : '';
                const cliente = r.length > 15 ? cleanStr(r[15]) : '';
                const estatus = r.length > 16 ? normPlainCat(r[16]) : '';
                const garantia = r.length > 17 ? normPlainCat(r[17]) : '';
                const comComp = r.length > 18 ? normPlainCat(r[18]) : '';
                const comAsesRaw = r.length > 19 ? String(r[19] || '') : '';
                const comAsesNorm = normPlainCat(comAsesRaw);

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
                const matches = comAsesRaw.match(/\((\d+)\)/g);
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

                const rawFcomp = r.length > 5 ? parseFotosDateSimple(r[5]) : null;
                let bufferedDate = null;
                if (rawFcomp) {
                    bufferedDate = new Date(rawFcomp.getTime());
                    bufferedDate.setDate(bufferedDate.getDate() + SUPPLIER_COMMITMENT_BUFFER_DAYS);
                }

                let cur = map.get(sku);
                if (!cur) {
                    cur = { qty: 0, bestDate: null, nom: r.length > 8 ? cleanStr(r[8]) : '' };
                    map.set(sku, cur);
                }
                cur.qty += freeQty;
                if (bufferedDate) {
                    if (
                        !cur.bestDate ||
                        (bufferedDate >= today && (cur.bestDate < today || bufferedDate < cur.bestDate)) ||
                        (bufferedDate < today && cur.bestDate < today && bufferedDate > cur.bestDate)
                    ) {
                        cur.bestDate = bufferedDate;
                    }
                }
            }
            return map;
        } catch (eLppt) {
            return null;
        }
    }

    async function loadSheetsCatalog(opts) {
        if (state.sheetsPromise) return state.sheetsPromise;
        const isSilent = !!(opts && opts.silent);
        state.sheetsLoading = true;
        const listEl = document.getElementById('skuResultsList');
        if (!isSilent && listEl && !state.products.length) {
            listEl.innerHTML = '<div class="photo-empty-placeholder">Cargando...</div>';
        }

        state.sheetsPromise = (async () => {
            try {
                const [rows1, rowsInv, lpptMap] = await Promise.all([
                    fetchSheetRows('1', 'A1:D9500'),
                    fetchSheetRows('INVENTARIO_EN_VIVO', 'A1:AX5500'),
                    fetchLiveLpptSummaryReadOnly()
                ]);

                if ((!rows1 || !rows1.length) && (!rowsInv || !rowsInv.length) && state.products.length > 0) {
                    return;
                }

                const delQueue = readDeletedQueue();
                const delSkus = delQueue.skus || {};
                const delFiles = delQueue.fileIds || {};
                state.fotosNuevasSheetItems = [];

                const buildAcabadoSummary = (tl, ct, md, cm, mt) => {
                    const parts = [];
                    if (tl) parts.push(tl + (ct && normPlainCat(tl).indexOf(normPlainCat(ct)) === -1 ? (' (' + ct + ')') : ''));
                    else if (ct) parts.push(ct);
                    if (md) parts.push(md + (cm && normPlainCat(md).indexOf(normPlainCat(cm)) === -1 ? (' ' + cm) : ''));
                    else if (cm) parts.push(cm);
                    if (!parts.length && mt) parts.push(mt);
                    return parts.join(' · ');
                };

                // Resolver índices de columnas de las 11 ubicaciones, fecha LPPT, proveedor y precio en INVENTARIO_EN_VIVO
                let whColIndices = FOTOS_WAREHOUSES.map((w) => w.defaultCol);
                let colFeIdx = 16;
                let colProvIdx = 13;
                let colPrecioIdx = 49;
                let hasStockColsInInv = false;

                if (Array.isArray(rowsInv) && rowsInv.length > 0) {
                    const hdrRow = (rowsInv[0] || []).map((h) => normPlainCat(String(h || '').replace(/[()]/g, ' ')));
                    const findHdrCol = (candidates, fallbackIdx) => {
                        for (let c = 0; c < candidates.length; c++) {
                            const normC = normPlainCat(String(candidates[c]).replace(/[()]/g, ' '));
                            const found = hdrRow.indexOf(normC);
                            if (found !== -1) return found;
                        }
                        return hdrRow.length > fallbackIdx ? fallbackIdx : -1;
                    };
                    whColIndices = FOTOS_WAREHOUSES.map((w) => findHdrCol(w.colNames, w.defaultCol));
                    colFeIdx = findHdrCol(['FECHA ESTIMADA DE LLEGADA', 'FECHA ESTIMADA'], 16);
                    colProvIdx = findHdrCol(['PROVEEDOR', 'MARCA'], 13);
                    colPrecioIdx = findHdrCol(['PRECIO DE LISTA', 'PRECIO LISTA', 'PRECIO'], 49);
                    hasStockColsInInv = whColIndices.some((idx, w) => w > 0 && idx !== -1 && hdrRow.length > idx);
                }

                const invMap = new Map();
                if (Array.isArray(rowsInv)) {
                    for (let i = 1; i < rowsInv.length; i++) {
                        const r = rowsInv[i] || [];
                        const sku = cleanStr(r[0]).toUpperCase();
                        if (!sku || sku === 'SKU') continue;
                        if (!r[1] && !r[3] && /^=SUM/i.test(String(r[18] || ''))) continue;

                        const photoInvRaw = cleanPhotoUrl(r[5]);
                        const tl = cleanStr(r[7]);
                        const ct = cleanStr(r[8]);
                        const md = cleanStr(r[9]);
                        const cm = cleanStr(r[10]);
                        const mt = cleanStr(r[11]);
                        const med = cleanStr(r[12]);
                        const prov = (colProvIdx !== -1 && colProvIdx < r.length) ? cleanStr(r[colProvIdx]) : '';
                        const acabado = buildAcabadoSummary(tl, ct, md, cm, mt);

                        const st = emptyFotosStocks();
                        for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
                            const cIdx = whColIndices[w];
                            if (cIdx !== -1 && cIdx < r.length) {
                                const rawVal = String(r[cIdx] === null || r[cIdx] === undefined ? '' : r[cIdx]).replace(/,/g, '').trim();
                                const numVal = Number(rawVal);
                                st[w] = (!isNaN(numVal) && isFinite(numVal) && numVal > 0) ? Math.round(numVal) : 0;
                            }
                        }

                        let feText = (colFeIdx !== -1 && colFeIdx < r.length) ? cleanStr(r[colFeIdx]) : '';
                        if (feText === 'Sin piezas solicitadas') feText = '';
                        const liveLppt = lpptMap ? lpptMap.get(sku) : null;
                        if (liveLppt && liveLppt.qty > 0) {
                            st[0] = liveLppt.qty;
                            if (liveLppt.bestDate) {
                                feText = formatFotosDateDMY(liveLppt.bestDate);
                            }
                        }

                        const precioFmt = (colPrecioIdx !== -1 && colPrecioIdx < r.length)
                            ? formatListPriceText(r[colPrecioIdx])
                            : '';

                        if (!invMap.has(sku)) {
                            invMap.set(sku, {
                                sku: sku,
                                tipo: cleanStr(r[1]),
                                modelo: cleanStr(r[2]),
                                nombreInv: cleanStr(r[3]),
                                variante: cleanStr(r[4]),
                                photoInv: photoInvRaw,
                                categoria: cleanStr(r[6]),
                                tl: tl,
                                ct: ct,
                                md: md,
                                cm: cm,
                                proveedor: prov,
                                medidas: med,
                                acabado: acabado,
                                st: st,
                                hasStocksLoaded: hasStockColsInInv || !!(liveLppt && liveLppt.qty > 0),
                                fe: feText,
                                precio: precioFmt
                            });
                        } else {
                            const prevInv = invMap.get(sku);
                            if (photoInvRaw && !prevInv.photoInv) prevInv.photoInv = photoInvRaw;
                            if (!prevInv.precio && precioFmt) prevInv.precio = precioFmt;
                            if (!prevInv.proveedor && prov) prevInv.proveedor = prov;
                        }
                    }
                }

                // Incluir piezas que vengan únicamente en LPPT Proveedores aunque aún no estén en INVENTARIO_EN_VIVO
                if (lpptMap && lpptMap.size > 0) {
                    lpptMap.forEach((lpInfo, sku) => {
                        if (invMap.has(sku) || !lpInfo || lpInfo.qty <= 0) return;
                        const st = emptyFotosStocks();
                        st[0] = lpInfo.qty;
                        invMap.set(sku, {
                            sku: sku,
                            tipo: '',
                            modelo: '',
                            nombreInv: lpInfo.nom || sku,
                            variante: '',
                            photoInv: '',
                            categoria: '',
                            tl: '',
                            ct: '',
                            md: '',
                            cm: '',
                            proveedor: '',
                            medidas: '',
                            acabado: '',
                            st: st,
                            hasStocksLoaded: true,
                            fe: lpInfo.bestDate ? formatFotosDateDMY(lpInfo.bestDate) : '',
                            precio: ''
                        });
                    });
                }

                const mergedMap = new Map();
                if (Array.isArray(rows1)) {
                    for (let i = 1; i < rows1.length; i++) {
                        const r = rows1[i] || [];
                        const sku = cleanStr(r[0]).toUpperCase();
                        if (!sku || sku === 'SKU') continue;

                        const rowNum = i + 1;
                        const colBName = cleanStr(r[1]);
                        const inv = invMap.get(sku) || null;
                        let colDUrl = cleanPhotoUrl(r[3]) || (inv ? inv.photoInv : '');
                        let colDFid = extractDriveFileId(colDUrl);
                        if (delSkus[sku] || (colDFid && delFiles[colDFid])) {
                            colDUrl = '';
                            colDFid = '';
                        }

                        if (!mergedMap.has(sku)) {
                            // Fuente canónica única: priorizar NOMBRE de INVENTARIO_EN_VIVO en CONTROL DE PRODUCTOS PRESENTACIÓN
                            const displayName = (inv && inv.nombreInv) || colBName || '';
                            const dest = resolveCategoryDestFolderForProduct(
                                inv ? inv.categoria : '',
                                inv ? inv.tipo : '',
                                displayName
                            );
                            const prevCached = state.productBySku.get(sku) || null;
                            const stArr = inv
                                ? inv.st
                                : (prevCached && prevCached.hasStocksLoaded ? normalizeStocksArray(prevCached.st) : emptyFotosStocks());
                            const totals = computeStockTotals(stArr);
                            const locMeta = buildActiveLocationsMeta(stArr);
                            mergedMap.set(sku, {
                                sku: sku,
                                colBName: colBName,
                                displayName: displayName || '—',
                                photoUrl: colDUrl,
                                photoFileId: colDFid,
                                rowNumber: rowNum,
                                inSheet1: true,
                                inInv: !!inv,
                                categoria: inv ? inv.categoria : '',
                                tipo: inv ? inv.tipo : '',
                                modelo: inv ? inv.modelo : '',
                                variante: inv ? inv.variante : '',
                                tl: inv ? (inv.tl || '') : '',
                                ct: inv ? (inv.ct || '') : '',
                                md: inv ? (inv.md || '') : '',
                                cm: inv ? (inv.cm || '') : '',
                                proveedor: inv ? (inv.proveedor || '') : ((prevCached && prevCached.proveedor) || ''),
                                medidas: inv ? inv.medidas : '',
                                acabado: inv ? inv.acabado : '',
                                st: stArr,
                                hasStocksLoaded: inv ? !!inv.hasStocksLoaded : !!(prevCached && prevCached.hasStocksLoaded),
                                totalBodegaPiso: totals.totalBodegaPiso,
                                lpptStock: totals.lpptStock,
                                locSummary: locMeta.locSummary,
                                locSearchTokens: locMeta.locSearchTokens,
                                precio: inv ? (inv.precio || '') : ((prevCached && prevCached.precio) || ''),
                                fe: inv ? (inv.fe || '') : ((prevCached && prevCached.fe) || ''),
                                destFolderId: dest.id,
                                destFolderName: dest.name,
                                searchSkuNorm: '',
                                searchNameNorm: '',
                                searchNorm: ''
                            });
                        } else {
                            const existing = mergedMap.get(sku);
                            if (!existing.colBName && colBName) {
                                existing.colBName = colBName;
                                if (!existing.displayName || existing.displayName === '—') existing.displayName = colBName;
                            }
                            if (!existing.photoUrl && colDUrl) {
                                existing.photoUrl = colDUrl;
                                existing.photoFileId = colDFid;
                            }
                        }
                    }
                }

                invMap.forEach((inv, sku) => {
                    if (mergedMap.has(sku)) return;
                    const displayName = inv.nombreInv || [inv.tipo, inv.modelo].filter(Boolean).join(' ') || sku;
                    const dest = resolveCategoryDestFolderForProduct(inv.categoria, inv.tipo, displayName);
                    let invPhotoUrl = inv.photoInv || '';
                    let invPhotoFid = extractDriveFileId(invPhotoUrl);
                    if (delSkus[sku] || (invPhotoFid && delFiles[invPhotoFid])) {
                        invPhotoUrl = '';
                        invPhotoFid = '';
                    }
                    const totals = computeStockTotals(inv.st);
                    const locMeta = buildActiveLocationsMeta(inv.st);
                    mergedMap.set(sku, {
                        sku: sku,
                        colBName: '',
                        displayName: displayName,
                        photoUrl: invPhotoUrl,
                        photoFileId: invPhotoFid,
                        rowNumber: null,
                        inSheet1: !!invPhotoUrl,
                        inInv: true,
                        categoria: inv.categoria,
                        tipo: inv.tipo,
                        modelo: inv.modelo || '',
                        variante: inv.variante || '',
                        tl: inv.tl || '',
                        ct: inv.ct || '',
                        md: inv.md || '',
                        cm: inv.cm || '',
                        proveedor: inv.proveedor || '',
                        medidas: inv.medidas || '',
                        acabado: inv.acabado || '',
                        st: inv.st,
                        hasStocksLoaded: !!inv.hasStocksLoaded,
                        totalBodegaPiso: totals.totalBodegaPiso,
                        lpptStock: totals.lpptStock,
                        locSummary: locMeta.locSummary,
                        locSearchTokens: locMeta.locSearchTokens,
                        precio: inv.precio || '',
                        fe: inv.fe || '',
                        destFolderId: dest.id,
                        destFolderName: dest.name,
                        searchSkuNorm: '',
                        searchNameNorm: '',
                        searchNorm: ''
                    });
                });

                let overridesPruned = false;
                const pendingOutboxSkus = new Set(
                    readFotosOfflineOutbox()
                        .filter((e) => e && e.sku && (e.type === 'direct_upload_assign' || e.type === 'assign_photo'))
                        .map((e) => cleanStr(e.sku).toUpperCase())
                );
                const nowMs = Date.now();
                state.sessionSavedBySku.forEach((savedMeta, sku) => {
                    if (delSkus[sku]) return;
                    const item = mergedMap.get(sku);
                    if (item && savedMeta && savedMeta.newUrl) {
                        const savedFid = savedMeta.fileId || extractDriveFileId(savedMeta.newUrl);
                        if (savedFid && delFiles[savedFid]) return;
                        const prevFid = extractDriveFileId(savedMeta.previousUrl);
                        const savedAtMs = Number(savedMeta.savedAt || savedMeta.ts || 0);
                        const isPendingOutbox = pendingOutboxSkus.has(sku) || isLocalTempPhotoId(savedFid);
                        if (!item.photoFileId && !isPendingOutbox && savedAtMs > 0 && (nowMs - savedAtMs) > 90000) {
                            // La foto fue borrada en Sheets desde otro dispositivo (>90s atrás): respetar eliminación remota
                            state.sessionSavedBySku.delete(sku);
                            state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it.sku !== sku);
                            overridesPruned = true;
                            return;
                        }
                        if (item.photoFileId && item.photoFileId !== savedFid && item.photoFileId !== prevFid) {
                            state.sessionSavedBySku.delete(sku);
                            state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it.sku !== sku);
                            overridesPruned = true;
                            return;
                        }
                        item.photoUrl = savedMeta.newUrl;
                        item.photoFileId = savedFid;
                        item.inSheet1 = true;
                        if (savedMeta.rowNumber && savedMeta.rowNumber !== '...') item.rowNumber = savedMeta.rowNumber;
                        if (savedMeta.productName && (!item.colBName || item.displayName === '—')) {
                            item.colBName = savedMeta.productName;
                            item.displayName = savedMeta.productName;
                        }
                    }
                });
                if (overridesPruned) saveSavedOverridesNow();

                const list = Array.from(mergedMap.values());
                const byNormName = new Map();
                for (let i = 0; i < list.length; i++) {
                    const p = list[i];
                    p.searchSkuNorm = normalizeSearchText(p.sku);
                    const dispNorm = normalizeSearchText(p.displayName);
                    if (dispNorm && dispNorm.length >= 5 && !byNormName.has(dispNorm)) {
                        byNormName.set(dispNorm, skuKeySafe(p.sku));
                    }
                    const cleanCat = cleanCategoryForPhotoSearch(p.categoria, p.tipo, p.displayName + ' ' + p.colBName);
                    p.searchNameNorm = normalizeSearchText(
                        p.displayName + ' ' + p.colBName + ' ' + cleanCat + ' ' + p.tipo + ' ' +
                        (p.modelo || '') + ' ' + (p.variante || '') + ' ' + (p.medidas || '') + ' ' + (p.acabado || '') + ' ' +
                        (p.destFolderName || '') + ' ' + (p.locSearchTokens || '')
                    );
                    p.searchNorm = (p.searchSkuNorm + ' ' + p.searchNameNorm).trim();
                }

                list.sort((a, b) => {
                    const aQuot = (a.totalBodegaPiso > 0 || a.lpptStock > 0) ? 1 : 0;
                    const bQuot = (b.totalBodegaPiso > 0 || b.lpptStock > 0) ? 1 : 0;
                    if (aQuot !== bQuot) return bQuot - aQuot;
                    if (a.inInv !== b.inInv) return a.inInv ? -1 : 1;
                    return a.displayName.localeCompare(b.displayName, 'es') || a.sku.localeCompare(b.sku, 'es');
                });

                const nextCatalogFp = computeCatalogFingerprint(list);
                const catalogChanged = !isSilent || !_lastCatalogFingerprint || nextCatalogFp !== _lastCatalogFingerprint || state.products.length === 0;
                _lastCatalogFingerprint = nextCatalogFp;

                state.products = list;
                state.productBySku = mergedMap;
                state.productByNormName = byNormName;
                rebuildSiblingVariantsIndex();
                if (typeof rebuildVisualTargetsCatalog === 'function') rebuildVisualTargetsCatalog();
                state.inboxFiles = filterAndMergeInboxFiles(state.rawInboxFromDrive.length ? state.rawInboxFromDrive : state.inboxFiles);
                invalidateLoadedPhotosCache();
                scheduleSaveFastCache();

                if (state.unlocked && catalogChanged) {
                    if (!_fotosUiCheckpointRestoredOnce) {
                        restoreFotosUiCheckpointOnce();
                    } else {
                        renderSkuCategoryFilterRow();
                        renderSkuLocationFilterRow();
                        applySkuFiltersAndRender();
                        renderInboxGallery();
                        if (state.selectedSku) renderSelectedProductStage();
                    }
                }
            } finally {
                state.sheetsLoading = false;
                state.sheetsPromise = null;
            }
        })();

        return state.sheetsPromise;
    }

    function skuKeySafe(s) {
        return cleanStr(s).toUpperCase();
    }

    function matchesLocationFilter(p, locKey) {
        const key = locKey || 'ALL';
        if (key === 'ALL') return true;
        if (!p) return false;
        if (key === 'QUOTABLE') {
            return (Number(p.totalBodegaPiso) || 0) >= 1 || (Number(p.lpptStock) || 0) >= 1;
        }
        const whMeta = FOTOS_WAREHOUSE_BY_KEY.get(key);
        if (!whMeta) return true;
        const st = Array.isArray(p.st) ? p.st : [];
        return (Number(st[whMeta.idx]) || 0) >= 1;
    }

    function renderSkuCategoryFilterRow() {
        const wrap = document.getElementById('skuCategoryFilterRow');
        if (!wrap) return;

        const countsByFolderId = new Map();
        const mode = state.skuFilterMode;
        const locKey = state.skuLocationFilter || 'ALL';
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (!matchesLocationFilter(p, locKey)) continue;
            const fid = p.destFolderId || CATEGORIAS_DEST_FOLDERS[9].id;
            countsByFolderId.set(fid, (countsByFolderId.get(fid) || 0) + 1);
        }

        const activeCatKey = state.skuCategoryFilter || 'ALL';
        const pills = [
            '<button type="button" class="cat-filter-pill' + (activeCatKey === 'ALL' ? ' active' : '') + '" data-cat-key="ALL" data-fotos-act="cat-filter">' +
                '<span>Todas</span>' +
            '</button>'
        ];
        for (let i = 0; i < CATEGORIAS_DEST_FOLDERS.length; i++) {
            const f = CATEGORIAS_DEST_FOLDERS[i];
            const cnt = countsByFolderId.get(f.id) || 0;
            const isAct = activeCatKey === f.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-cat-key="' + escapeHtml(f.key) + '" data-fotos-act="cat-filter">' +
                    '<span>' + escapeHtml(f.short || f.name.replace(/^FOTOS\s+(DE\s+)?/i, '')) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
        syncSkuExtraFiltersBadge();
    }

    function syncSkuExtraFiltersBadge() {
        const badge = document.getElementById('skuExtraFiltersBadge');
        if (!badge) return;
        let activeCount = 0;
        if (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL') activeCount++;
        if (state.skuLocationFilter && state.skuLocationFilter !== 'ALL') activeCount++;
        badge.textContent = String(activeCount);
        badge.classList.toggle('hidden', activeCount === 0);
    }

    function renderSkuLocationFilterRow() {
        const wrap = document.getElementById('skuLocationFilterRow');
        if (!wrap) return;

        const mode = state.skuFilterMode;
        const catFilterMeta = (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL')
            ? DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter)
            : null;
        const requiredFolderId = catFilterMeta ? catFilterMeta.id : '';

        let quotableCount = 0;
        const countsByWh = new Array(FOTOS_WAREHOUSES.length).fill(0);

        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (requiredFolderId && p.destFolderId !== requiredFolderId) continue;

            if ((Number(p.totalBodegaPiso) || 0) >= 1 || (Number(p.lpptStock) || 0) >= 1) {
                quotableCount++;
            }
            const st = Array.isArray(p.st) ? p.st : [];
            for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
                if ((Number(st[w]) || 0) >= 1) countsByWh[w]++;
            }
        }

        const activeLocKey = state.skuLocationFilter || 'ALL';
        const pills = [
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'ALL' ? ' active' : '') + '" data-loc-key="ALL" data-fotos-act="loc-filter">' +
                '<span>Todas ubic.</span>' +
            '</button>',
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'QUOTABLE' ? ' active' : '') + '" data-loc-key="QUOTABLE" data-fotos-act="loc-filter" title="Visibles en Cotizador">' +
                '<span>En Cotizador</span>' +
                '<span class="cat-cnt">' + quotableCount + '</span>' +
            '</button>'
        ];

        for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
            const wh = FOTOS_WAREHOUSES[w];
            const cnt = countsByWh[w] || 0;
            const isAct = activeLocKey === wh.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-loc-key="' + escapeHtml(wh.key) + '" data-fotos-act="loc-filter" title="' + escapeHtml(wh.label) + '">' +
                    '<span>' + escapeHtml(wh.short) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
        syncSkuExtraFiltersBadge();
    }

    window.setSkuCategoryFilter = function (catKey) {
        state.skuCategoryFilter = catKey || 'ALL';
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        if (state.skuCategoryFilter !== 'ALL') {
            const fMeta = DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter);
            const destSel = document.getElementById('destFolderSelect');
            if (fMeta && destSel && !state.selectedSku) {
                destSel.value = fMeta.id;
            }
        }
        applySkuFiltersAndRender();
        if (state.galleryMode === 'LOADED') {
            renderInboxGallery();
        }
        saveFotosUiCheckpointNow();
        if (state.skuCategoryFilter !== 'ALL') {
            syncFotosBackNav('sku_category');
        }
    };

    window.setSkuLocationFilter = function (locKey) {
        state.skuLocationFilter = locKey || 'ALL';
        renderSkuLocationFilterRow();
        renderSkuCategoryFilterRow();
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (state.skuLocationFilter !== 'ALL') {
            syncFotosBackNav('sku_location');
        }
    };

    window.clearSkuSearch = function (opts) {
        const inp = document.getElementById('skuSearchInput');
        const clr = document.getElementById('skuSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.skuSearchQuery = '';
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (inp) {
            if (opts && opts.focus === false) {
                if (typeof inp.blur === 'function') inp.blur();
            } else {
                if (typeof inp.focus === 'function') inp.focus();
            }
        }
    };

    window.setSkuFilterMode = function (mode) {
        state.skuFilterMode = mode || 'ALL';
        document.querySelectorAll('.filter-pill[data-filter]').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-filter') === state.skuFilterMode);
        });
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        saveFotosUiCheckpointNow();
        if (state.skuFilterMode !== 'ALL') {
            syncFotosBackNav('sku_filter');
        }
    };

    function applySkuFiltersAndRender() {
        const q = normalizeSearchText(state.skuSearchQuery);
        const tokens = q ? q.split(' ').filter(Boolean) : [];
        const mode = state.skuFilterMode;
        const locKey = state.skuLocationFilter || 'ALL';
        const catFilterMeta = (state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL')
            ? DEST_FOLDER_BY_KEY.get(state.skuCategoryFilter)
            : null;
        const requiredFolderId = catFilterMeta ? catFilterMeta.id : '';

        const matches = [];
        const products = state.products;
        const len = products.length;
        const tLen = tokens.length;

        for (let i = 0; i < len; i++) {
            const p = products[i];
            if (mode === 'NO_PHOTO' && p.photoUrl) continue;
            if (mode === 'HAS_PHOTO' && !p.photoUrl) continue;
            if (mode === 'IN_INV' && !p.inInv) continue;
            if (requiredFolderId && p.destFolderId !== requiredFolderId) continue;
            if (!matchesLocationFilter(p, locKey)) continue;

            if (tLen > 0) {
                let ok = true;
                const paddedWords = ' ' + p.searchNorm.replace(/[^a-z0-9]+/g, ' ') + ' ';
                for (let t = 0; t < tLen; t++) {
                    const tok = tokens[t];
                    if (tok === 'silla' || tok === 'sillas') {
                        if (paddedWords.indexOf(' silla ') === -1 && paddedWords.indexOf(' sillas ') === -1) {
                            ok = false;
                            break;
                        }
                    } else if (tok === 'sillon' || tok === 'sillones') {
                        if (paddedWords.indexOf(' sillon ') === -1 && paddedWords.indexOf(' sillones ') === -1) {
                            ok = false;
                            break;
                        }
                    } else if (p.searchNorm.indexOf(tok) === -1) {
                        ok = false;
                        break;
                    }
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
                const aQuot = (a.totalBodegaPiso > 0 || a.lpptStock > 0) ? 1 : 0;
                const bQuot = (b.totalBodegaPiso > 0 || b.lpptStock > 0) ? 1 : 0;
                if (aQuot !== bQuot) return bQuot - aQuot;
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
                        ? ('<button type="button" class="hdr-btn is-accent is-compact-btn" data-fotos-act="sync-sku" data-raw="' + escapeHtml(rawTyped) + '">↻ ERP "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                    (looksLikeSku
                        ? ('<button type="button" class="hdr-btn is-neutral is-compact-btn" data-fotos-act="manual-sku" data-raw="' + escapeHtml(rawTyped) + '">+ SKU "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                '</div>';
            return;
        }

        const selSku = state.selectedSku;
        const htmlParts = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            const p = slice[i];
            const isSel = p.sku === selSku;
            const fid = p.photoFileId || '';
            const safeDriveFid = isLocalTempPhotoId(fid) ? '' : fid;
            const thumb = p.photoUrl ? buildPhotoThumbUrl(safeDriveFid || p.photoUrl, 160) : '';
            const destMeta = DEST_FOLDER_BY_ID.get(p.destFolderId);
            const catShort = destMeta ? (destMeta.short || destMeta.name.replace(/^FOTOS\s+(DE\s+)?/i, '')) : (p.destFolderName || '').replace(/^FOTOS\s+(DE\s+)?/i, '');
            const bodPiso = Number(p.totalBodegaPiso) || 0;
            const lpptQ = Number(p.lpptStock) || 0;
            let stockBadgeHtml = '';
            if (bodPiso > 0) {
                stockBadgeHtml = '<span class="sku-stock-badge in-stock" title="Stock Bodega/Piso">Stock ' + bodPiso + (lpptQ > 0 ? (' + LPPT ' + lpptQ) : '') + '</span>';
            } else if (lpptQ > 0) {
                stockBadgeHtml = '<span class="sku-stock-badge in-lppt" title="Entrantes LPPT">LPPT ' + lpptQ + '</span>';
            } else if (p.hasStocksLoaded && p.inInv) {
                stockBadgeHtml = '<span class="sku-stock-badge zero-stock">0 pz</span>';
            }

            const subParts = [];
            if (p.modelo) subParts.push(p.modelo);
            if (p.variante && p.variante !== 'ESTÁNDAR' && normPlainCat(p.variante) !== normPlainCat(p.modelo)) subParts.push(p.variante);
            if (p.medidas) subParts.push(p.medidas);
            if (p.locSummary) subParts.push(p.locSummary);

            htmlParts[i] =
                '<div class="sku-item' + (isSel ? ' selected' : '') + '" data-sku="' + escapeHtml(p.sku) + '" data-fotos-act="select-sku">' +
                    '<div class="sku-mini-thumb">' +
                        (thumb
                            ? ('<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(safeDriveFid) + '" onerror="handlePhotoImgError(this)">')
                            : '<span>—</span>') +
                    '</div>' +
                    '<div class="sku-item-info">' +
                        '<div class="sku-code-row">' +
                            '<span class="sku-code">' + escapeHtml(p.sku) + '</span>' +
                            '<span class="sku-status-badge ' + (p.photoUrl ? 'has-photo' : 'no-photo') + '">' +
                                (p.photoUrl ? 'Foto' : 'Sin foto') +
                            '</span>' +
                            (catShort ? ('<span class="sku-cat-chip">' + escapeHtml(catShort) + '</span>') : '') +
                            stockBadgeHtml +
                            (p.photoUrl
                                ? ('<span class="sku-quick-actions">' +
                                    '<button type="button" class="sku-quick-btn is-take" data-fotos-act="take-sku-row" data-sku="' + escapeHtml(p.sku) + '">Tomar</button>' +
                                    '<button type="button" class="sku-quick-btn is-del" data-fotos-act="del-loaded-sku" data-sku="' + escapeHtml(p.sku) + '" data-fid="' + escapeHtml(fid) + '">🗑</button>' +
                                   '</span>')
                                : '') +
                        '</div>' +
                        '<div class="sku-name">' + escapeHtml(p.displayName) + '</div>' +
                        (subParts.length ? ('<div class="sku-submeta">' + escapeHtml(subParts.join(' · ')) + '</div>') : '') +
                    '</div>' +
                '</div>';
        }
        const prevScrollTop = Number(listEl.scrollTop) || 0;
        listEl.innerHTML = htmlParts.join('');
        if (prevScrollTop > 0) listEl.scrollTop = prevScrollTop;
    }

    function updateSkuListSelectionInDom(prevSku, nextSku) {
        const listEl = document.getElementById('skuResultsList');
        if (!listEl) return;
        const items = listEl.querySelectorAll('.sku-item');
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            const sk = el.getAttribute('data-sku');
            if (sk === prevSku && sk !== nextSku) el.classList.remove('selected');
            else if (sk === nextSku) el.classList.add('selected');
        }
    }

    window.selectSkuProduct = function (skuRaw, opts) {
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod) return;

        const prevSku = state.selectedSku;
        state.selectedSku = sku;
        hideAssignFeedback();

        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) destSel.value = prod.destFolderId;

        updateSkuListSelectionInDom(prevSku, sku);
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!(opts && opts.skipBackSync)) {
            syncFotosBackNav('selected_sku');
        }
        if (!(opts && opts.fromPeerSync) && !_fotosRestoringCheckpoint) {
            const isEmbedded = !!(window.parent && window.parent !== window);
            if (_fotosSplitActive || isEmbedded) {
                notifySplitPeerOfSkuSelect(sku, false);
            }
        }
    };

    window.clearSelectedSku = function () {
        if (!state.selectedSku) return;
        const prevSku = state.selectedSku;
        state.selectedSku = '';
        updateSkuListSelectionInDom(prevSku, '');
        hideAssignFeedback();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
    };

    function getActiveSelectedPhotoObject() {
        if (state.selectedPhotoItem && state.selectedPhotoItem.id) {
            return state.selectedPhotoItem;
        }
        if (state.selectedInboxFileId) {
            const f = state.inboxFiles.find((it) => it.id === state.selectedInboxFileId);
            if (f) {
                return {
                    id: f.id,
                    name: f.name,
                    viewUrl: f.viewUrl || ('https://drive.google.com/file/d/' + f.id + '/view?usp=sharing'),
                    thumbDataUrl: f.thumbDataUrl || '',
                    localDataUrl: f.localDataUrl || '',
                    fromLoaded: false,
                    skuOrigin: ''
                };
            }
        }
        return null;
    }

    function renderSelectedProductStage() {
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const rowBadge = document.getElementById('selectedRowBadge');
        const btnOpenCotizador = document.getElementById('btnOpenInCotizadorStage');
        const btnClearSku = document.getElementById('btnClearSelectedSku');
        const autoDestPill = document.getElementById('autoDestFolderPill');
        const linkedFabricChip = document.getElementById('skuLinkedFabricChip');
        const colASku = document.getElementById('selColASku');
        const colBName = document.getElementById('selColBName');
        const catLabel = document.getElementById('selCategoryLabel');
        const moVarVal = document.getElementById('selModelVariantVal');
        const dimsFinVal = document.getElementById('selDimsFinishVal');
        const locWrap = document.getElementById('selLocationsWrap');
        const locSummaryBadge = document.getElementById('selLocationsSummaryBadge');
        const locGrid = document.getElementById('selLocationsGrid');
        const sibWrap = document.getElementById('selSiblingVariantsWrap');
        const sibList = document.getElementById('selSiblingVariantsList');

        const curOpenLink = document.getElementById('curPhotoOpenLink');
        const curTakeBtn = document.getElementById('curPhotoTakeBtn');
        const curDeleteBtn = document.getElementById('curPhotoDeleteBtn');
        const curCanvas = document.getElementById('curPhotoCanvas');
        const quickNameEl = document.getElementById('skuQuickName');
        const quickSkuEl = document.getElementById('skuQuickSku');
        const quickCatEl = document.getElementById('skuQuickCat');

        if (!prod) {
            if (rowBadge) rowBadge.textContent = '—';
            if (btnOpenCotizador) btnOpenCotizador.classList.add('hidden');
            if (btnClearSku) btnClearSku.classList.add('hidden');
            if (autoDestPill) autoDestPill.textContent = '📁 Auto';
            if (linkedFabricChip) {
                linkedFabricChip.classList.add('hidden');
                linkedFabricChip.innerHTML = '';
            }
            if (colASku) colASku.textContent = '—';
            if (colBName) colBName.textContent = '—';
            if (catLabel) catLabel.textContent = '—';
            if (quickNameEl) quickNameEl.textContent = 'Elige un SKU';
            if (quickSkuEl) quickSkuEl.textContent = '—';
            if (quickCatEl) quickCatEl.textContent = '—';
            if (moVarVal) moVarVal.textContent = '—';
            if (dimsFinVal) dimsFinVal.textContent = '—';
            if (locWrap) locWrap.classList.add('hidden');
            if (locGrid) locGrid.innerHTML = '';
            if (sibWrap) sibWrap.classList.add('hidden');
            if (sibList) sibList.innerHTML = '';
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curTakeBtn) curTakeBtn.classList.add('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.add('hidden');
            if (curCanvas) curCanvas.innerHTML = '<div class="photo-empty-placeholder">Sin foto</div>';
            renderNewPhotoStage();
            return;
        }

        if (btnOpenCotizador) btnOpenCotizador.classList.remove('hidden');
        if (btnClearSku) btnClearSku.classList.remove('hidden');
        if (rowBadge) {
            rowBadge.textContent = prod.inSheet1 ? (prod.rowNumber ? ('Fila ' + prod.rowNumber) : 'Hoja 1') : 'Nuevo';
        }
        const autoDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
        prod.destFolderId = autoDestMeta.id;
        prod.destFolderName = autoDestMeta.name;
        const destSel = document.getElementById('destFolderSelect');
        if (destSel && prod.destFolderId) destSel.value = prod.destFolderId;

        const shortCatName = prod.destFolderName.replace(/^FOTOS\s+(DE\s+)?/i, '');
        if (autoDestPill) autoDestPill.textContent = '📁 Auto: ' + shortCatName;
        if (colASku) colASku.textContent = prod.sku;
        if (colBName) colBName.textContent = prod.colBName || prod.displayName;
        if (catLabel) catLabel.textContent = shortCatName;
        if (quickNameEl) quickNameEl.textContent = prod.colBName || prod.displayName || prod.sku;
        if (quickSkuEl) quickSkuEl.textContent = prod.sku;
        if (quickCatEl) quickCatEl.textContent = shortCatName;

        if (linkedFabricChip) {
            const matchedFab = (typeof findMatchingUploadedFabricForProduct === 'function')
                ? findMatchingUploadedFabricForProduct(prod)
                : null;
            const matchedWood = (!matchedFab && typeof findMatchingUploadedWoodForProduct === 'function')
                ? findMatchingUploadedWoodForProduct(prod)
                : null;
            const matchedSwatch = (matchedFab && matchedFab.url)
                ? { label: matchedFab.label, url: matchedFab.url, prefix: '🧵 Tela: ' }
                : ((matchedWood && matchedWood.url) ? { label: matchedWood.label, url: matchedWood.url, prefix: '🪵 Madera: ' } : null);
            if (matchedSwatch) {
                const swThumb = resolveVisualThumbSrcInFotos(matchedSwatch.url, 140);
                const swFull = resolveVisualThumbSrcInFotos(matchedSwatch.url, 900);
                const swFid = extractDriveFileId(matchedSwatch.url);
                linkedFabricChip.innerHTML =
                    '<img src="' + escapeHtml(swThumb) + '" alt="' + escapeHtml(matchedSwatch.label) + '" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(swFid) + '" onerror="handlePhotoImgError(this)">' +
                    '<span>' + matchedSwatch.prefix + escapeHtml(matchedSwatch.label) + '</span>';
                linkedFabricChip.onclick = function () { openPhotoLightbox(swFull); };
                linkedFabricChip.classList.remove('hidden');
            } else {
                linkedFabricChip.classList.add('hidden');
                linkedFabricChip.innerHTML = '';
                linkedFabricChip.onclick = null;
            }
        }

        if (moVarVal) {
            const mvParts = [];
            if (prod.modelo) mvParts.push(prod.modelo);
            if (prod.variante && prod.variante !== 'ESTÁNDAR' && normPlainCat(prod.variante) !== normPlainCat(prod.modelo)) {
                mvParts.push(prod.variante);
            } else if (!mvParts.length && prod.tipo) {
                mvParts.push(prod.tipo);
            }
            moVarVal.textContent = mvParts.length ? mvParts.join(' · ') : (prod.tipo || 'Estándar');
        }

        if (dimsFinVal) {
            const dfParts = [];
            if (prod.medidas) dfParts.push(prod.medidas);
            if (prod.acabado) dfParts.push(prod.acabado);
            dimsFinVal.textContent = dfParts.length ? dfParts.join(' · ') : (prod.categoria || '—');
        }

        // Renderizar las 11 ubicaciones oficiales (LPPT + 10 posiciones Bodega/Piso)
        if (locWrap && locGrid) {
            const st = Array.isArray(prod.st) ? prod.st : emptyFotosStocks();
            const bodPiso = Number(prod.totalBodegaPiso) || 0;
            const lpptQ = Number(prod.lpptStock) || 0;
            const summaryParts = ['Bodega/Piso: ' + bodPiso];
            if (lpptQ > 0) summaryParts.push('LPPT: ' + lpptQ);
            if (prod.precio) summaryParts.push(prod.precio);
            if (locSummaryBadge) locSummaryBadge.textContent = summaryParts.join(' · ');

            const chipsHtml = [];
            for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
                const wh = FOTOS_WAREHOUSES[w];
                const qty = Math.max(0, Number(st[w]) || 0);
                const semClass = qty <= 0 ? 'sem-red' : (qty <= 2 ? 'sem-yellow' : 'sem-green');
                const lpptClass = wh.isLppt ? ' is-lppt' : '';
                const labelText = (wh.isLppt && qty > 0)
                    ? ('LPPT: ' + qty + (prod.fe ? (' · ' + prod.fe) : ''))
                    : (wh.short || wh.label);
                chipsHtml.push(
                    '<div class="loc-stock-chip ' + semClass + lpptClass + '" title="' + escapeHtml(wh.label) + '">' +
                        '<span class="loc-stock-lbl"><span class="loc-stock-dot"></span><span>' + escapeHtml(labelText) + '</span></span>' +
                        '<span class="loc-stock-val">' + qty + '</span>' +
                    '</div>'
                );
            }
            locGrid.innerHTML = chipsHtml.join('');
            locWrap.classList.remove('hidden');
        }

        if (sibWrap && sibList) {
            const gk = prod._groupKey || buildProductGroupKey(prod);
            const sibs = (gk && state.siblingsByGroupKey.get(gk)) || [];
            if (sibs.length > 1) {
                sibList.innerHTML = sibs.slice(0, 24).map((sItem) => {
                    const isAct = sItem.sku === prod.sku;
                    const vLabel = (sItem.variante && sItem.variante !== 'ESTÁNDAR' && normPlainCat(sItem.variante) !== normPlainCat(sItem.modelo))
                        ? sItem.variante
                        : (sItem.acabado || sItem.medidas || sItem.sku);
                    return '<button type="button" class="sib-var-pill' + (isAct ? ' active' : '') + '" data-fotos-act="select-sku" data-sku="' + escapeHtml(sItem.sku) + '" title="' + escapeHtml(sItem.sku + ' · ' + sItem.displayName) + '">' +
                        '<span class="sib-var-dot' + (sItem.photoUrl ? ' has-photo' : '') + '"></span>' +
                        '<span>' + escapeHtml(sItem.sku) + ' · ' + escapeHtml(vLabel.slice(0, 26)) + '</span>' +
                    '</button>';
                }).join('');
                sibWrap.classList.remove('hidden');
            } else {
                sibWrap.classList.add('hidden');
                sibList.innerHTML = '';
            }
        }

        const savedSession = state.sessionSavedBySku.get(prod.sku) || null;
        const curStageTitle = curCanvas && curCanvas.parentElement
            ? curCanvas.parentElement.querySelector('.photo-stage-title')
            : null;

        const hasSelPhoto = !!getActiveSelectedPhotoObject();
        const showBeforeVsLoaded = savedSession && !hasSelPhoto;
        const leftUrl = showBeforeVsLoaded ? (savedSession.previousUrl || '') : prod.photoUrl;

        if (curStageTitle) {
            curStageTitle.textContent = showBeforeVsLoaded ? 'Anterior' : 'Actual';
        }

        if (leftUrl) {
            const fid = extractDriveFileId(leftUrl);
            const previewSrc = (!showBeforeVsLoaded && savedSession && savedSession.localDataUrl)
                ? savedSession.localDataUrl
                : buildPhotoThumbUrl(fid || leftUrl, 900);
            if (curOpenLink) {
                curOpenLink.href = leftUrl;
                curOpenLink.classList.remove('hidden');
            }
            if (curTakeBtn) curTakeBtn.classList.remove('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.remove('hidden');
            if (curCanvas) {
                curCanvas.innerHTML =
                    '<img src="' + escapeHtml(previewSrc) + '" alt="' + escapeHtml(prod.sku) + '" decoding="async" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(fid) + '" ' +
                    'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(previewSrc) + '" ' +
                    'onerror="handlePhotoImgError(this)">';
            }
        } else {
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curTakeBtn) curTakeBtn.classList.add('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.add('hidden');
            if (curCanvas) {
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Sin foto</div>';
            }
        }

        renderNewPhotoStage();
    }

    function renderNewPhotoStage() {
        const stageCard = document.getElementById('newPhotoStageCard');
        const stageTitle = document.getElementById('newPhotoStageTitle');
        const clearBtn = document.getElementById('clearSelectedInboxBtn');
        const delBtn = document.getElementById('deleteSelectedPhotoBtn');
        const canvas = document.getElementById('newPhotoCanvas');
        const footWrap = document.getElementById('newPhotoFootWrap');
        const footText = document.getElementById('newPhotoFileText');
        if (!canvas || !stageCard) return;

        const selPhoto = getActiveSelectedPhotoObject();
        const savedSession = (!selPhoto && state.selectedSku)
            ? (state.sessionSavedBySku.get(state.selectedSku) || null)
            : null;

        stageCard.classList.remove('is-new-selected', 'is-just-saved');

        if (selPhoto) {
            stageCard.classList.add('is-new-selected');
            if (stageTitle) {
                stageTitle.textContent = selPhoto.fromLoaded
                    ? ('Tomada (' + (selPhoto.skuOrigin || 'Cargada') + ')')
                    : 'SUBIR PREN';
            }
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (delBtn) delBtn.classList.remove('hidden');
            const safeSelFid = isLocalTempPhotoId(selPhoto.id) ? '' : cleanStr(selPhoto.id);
            const previewUrl = selPhoto.localDataUrl || selPhoto.thumbDataUrl || buildPhotoThumbUrl(safeSelFid || selPhoto.viewUrl, 900);
            canvas.innerHTML =
                '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(selPhoto.name) + '" decoding="async" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(safeSelFid) + '" ' +
                'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(previewUrl) + '" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) footText.textContent = selPhoto.name;
            return;
        }

        if (savedSession) {
            stageCard.classList.add('is-just-saved');
            if (stageTitle) stageTitle.textContent = savedSession.rowNumber ? ('✅ Fila ' + savedSession.rowNumber) : '✅ Guardada';
            if (clearBtn) clearBtn.classList.add('hidden');
            if (delBtn) delBtn.classList.remove('hidden');
            const rawSavedFid = cleanStr(savedSession.fileId);
            const safeSavedFid = isLocalTempPhotoId(rawSavedFid) ? '' : (rawSavedFid || extractDriveFileId(savedSession.newUrl));
            const savedPreview = savedSession.localDataUrl || buildPhotoThumbUrl(safeSavedFid || savedSession.newUrl, 900);
            canvas.innerHTML =
                '<img src="' + escapeHtml(savedPreview) + '" alt="' + escapeHtml(savedSession.sku) + '" decoding="async" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(safeSavedFid) + '" ' +
                'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(savedPreview) + '" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) {
                const safeLinkHref = /^https?:\/\//i.test(cleanStr(savedSession.newUrl))
                    ? (' · <a href="' + escapeHtml(savedSession.newUrl) + '" target="_blank" rel="noopener" style="color:#6EE7B7;font-weight:800;">↗</a>')
                    : ' · Pendiente';
                footText.innerHTML = escapeHtml(savedSession.fileName || savedSession.destFolderName) + safeLinkHref;
            }
            return;
        }

        if (stageTitle) stageTitle.textContent = 'Nueva';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (delBtn) delBtn.classList.add('hidden');
        if (footWrap) footWrap.classList.add('hidden');
        canvas.innerHTML = '<div class="photo-empty-placeholder">Sube o arrastra</div>';
    }

    function updateAssignButtonState() {
        const btn = document.getElementById('btnAssignPhotoNow');
        const selPhoto = getActiveSelectedPhotoObject();
        const isSkuMode = (typeof visualState === 'undefined' || !visualState || visualState.workMode === 'SKU');
        const canAssign = !!(state.selectedSku && selPhoto);
        if (btn) {
            btn.disabled = !canAssign;
            btn.textContent = 'Guardar';
        }
        const quickBar = document.getElementById('mobileQuickSaveBar');
        const quickSku = document.getElementById('mobileQuickSaveSku');
        const quickBtn = document.getElementById('btnMobileQuickSaveNow');
        const showQuick = isSkuMode && canAssign && !_fotosSplitActive;
        if (quickBar) quickBar.classList.toggle('hidden', !showQuick);
        if (quickSku) quickSku.textContent = state.selectedSku || '—';
        if (quickBtn) quickBtn.disabled = !canAssign;
        if (document.body && document.body.classList) {
            document.body.classList.toggle('has-mobile-quick-save', showQuick);
        }
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
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

    window.setGalleryMode = function (mode) {
        state.galleryMode = mode === 'LOADED' ? 'LOADED' : 'INBOX';
        const tabInbox = document.getElementById('tabGalleryInbox');
        const tabLoaded = document.getElementById('tabGalleryLoaded');
        if (tabInbox) tabInbox.classList.toggle('active', state.galleryMode === 'INBOX');
        if (tabLoaded) tabLoaded.classList.toggle('active', state.galleryMode === 'LOADED');
        renderInboxGallery();
        saveFotosUiCheckpointNow();
        if (state.galleryMode === 'LOADED') {
            syncFotosBackNav('gallery_mode');
        }
    };

    window.clearInboxSearch = function (opts) {
        const inp = document.getElementById('inboxSearchInput');
        const clr = document.getElementById('inboxSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        state.inboxSearchQuery = '';
        renderInboxGallery();
        saveFotosUiCheckpointNow();
        if (inp) {
            if (opts && opts.focus === false) {
                if (typeof inp.blur === 'function') inp.blur();
            } else if (opts && opts.focus === true) {
                if (typeof inp.focus === 'function') inp.focus();
            }
        }
    };

    window.refreshInboxOnly = async function (manualRefresh, opts) {
        if (state.inboxLoading) return;
        const isSilent = !!(opts && opts.silent) && !manualRefresh;
        state.inboxLoading = true;
        const btnInb = document.getElementById('btnRefreshInbox');
        if (!isSilent && btnInb) { btnInb.disabled = true; btnInb.textContent = '↻...'; }
        const container = document.getElementById('inboxGalleryContainer');
        if (!isSilent && container && !state.inboxFiles.length && state.galleryMode === 'INBOX') {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Cargando...</div>';
        }

        let res = null;
        try {
            const listPayload = Object.assign({ includeLoadedNames: true }, buildOwnerAuthPayload());
            res = await callWebAppPost('fotos_subir_list', listPayload, 30000);
            if ((!res || res.unavailable) && !isSilent && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
                res = await callWebAppPost('fotos_subir_list', listPayload, 30000);
            }
        } finally {
            state.inboxLoading = false;
            if (!isSilent && btnInb) { btnInb.disabled = false; btnInb.textContent = '↻'; }
        }

        if (res && res.ok && Array.isArray(res.files)) {
            let loadedNamesChanged = false;
            if (res.loadedFileNames && typeof res.loadedFileNames === 'object' && !Array.isArray(res.loadedFileNames)) {
                const prevCount = Object.keys(state.loadedFileNamesById || {}).length;
                state.loadedFileNamesById = Object.assign({}, state.loadedFileNamesById || {}, res.loadedFileNames);
                const nextCount = Object.keys(state.loadedFileNamesById || {}).length;
                if (nextCount !== prevCount) {
                    loadedNamesChanged = true;
                    invalidateLoadedPhotosCache();
                }
            }
            reconcileDeletedQueueWithLiveState(res.files);
            state.rawInboxFromDrive = res.files;
            const nextInbox = filterAndMergeInboxFiles(res.files);
            const nextFp = computeInboxFingerprint(nextInbox) + '::' + Object.keys(state.loadedFileNamesById || {}).length;
            const inboxChanged = !isSilent || !_lastInboxFingerprint || nextFp !== _lastInboxFingerprint || loadedNamesChanged;
            _lastInboxFingerprint = nextFp;
            state.inboxFiles = nextInbox;
            if (inboxChanged) {
                scheduleSaveFastCache();
                if (state.selectedInboxFileId && (!state.selectedPhotoItem || !state.selectedPhotoItem.fromLoaded)) {
                    if (!state.inboxFiles.some((f) => f.id === state.selectedInboxFileId)) {
                        state.selectedInboxFileId = '';
                        state.selectedPhotoItem = null;
                    }
                }
                renderInboxGallery();
                renderSelectedProductStage();
                updateAssignButtonState();
            }
            drainPendingDeletedQueueAsync();
            if (manualRefresh) {
                showAssignFeedback('✅ Carpeta actualizada (' + state.inboxFiles.length + ').', true);
            }
            return;
        }

        if (res && res.authRequired) {
            window.lockFotosPortal();
            setGateMessage('Ingresa tu contraseña.', 'warn');
            return;
        }

        const errMsg = cleanStr(res && res.error);
        if (/Acci[óo]n no reconocida/i.test(errMsg)) {
            state.inboxFiles = filterAndMergeInboxFiles(state.rawInboxFromDrive);
            if (!isSilent) renderInboxGallery();
            return;
        }

        if (!isSilent && container && state.galleryMode === 'INBOX' && !state.inboxFiles.length) {
            const isOff = typeof navigator !== 'undefined' && navigator.onLine === false;
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                escapeHtml(isOff
                    ? '📡 Modo sin conexión · usa + Foto o 📤 Subir para agregar fotos desde tu teléfono.'
                    : (errMsg || 'Reconectando automáticamente con Google Drive en vivo...')) +
                '</div>';
        }
    };

    function renderRecentUploadedStrip() {
        const strip = document.getElementById('recentUploadedPhotosStrip');
        const rail = document.getElementById('recentUploadedPhotosRail');
        const badge = document.getElementById('recentUploadsCountBadge');
        if (!strip || !rail) return;

        const recent = getRecentUploadedPhotosList();
        if (badge) badge.textContent = String(recent.length);
        if (!recent.length) {
            strip.classList.add('hidden');
            rail.innerHTML = '';
            return;
        }

        strip.classList.remove('hidden');
        const activePhoto = getActiveSelectedPhotoObject();
        const activeId = activePhoto ? activePhoto.id : '';
        const parts = new Array(recent.length);

        for (let i = 0; i < recent.length; i++) {
            const it = recent[i];
            const isSel = !!(activeId && activeId === it.id && activePhoto && activePhoto.fromLoaded);
            const thumb = it.localDataUrl || buildPhotoThumbUrl(it.id || it.viewUrl, 320);
            const fullSrc = it.localDataUrl || buildPhotoThumbUrl(it.id || it.viewUrl, 1200);
            const kindClass = it.targetKind === 'TELA' ? 'is-fabric' : (it.targetKind === 'PORTADA' ? 'is-cover' : 'is-sku');
            const kindTag = it.targetKind === 'TELA' ? '🧵 Tela' : (it.targetKind === 'PORTADA' ? '🖼️ Portada' : (it.targetKey || 'SKU'));
            const displayTitle = it.fileName || it.targetLabel || it.targetKey || 'Foto';
            const timeTxt = formatShortTimeLabel(it.ts);
            const tooltip = [displayTitle, it.targetLabel, timeTxt].filter(Boolean).join(' · ');

            parts[i] =
                '<div class="recent-upload-card' + (isSel ? ' selected' : '') + '" data-recent-id="' + escapeHtml(it.id) + '" data-fotos-act="recent-select" data-fid="' + escapeHtml(it.id || '') + '" data-recent-key="' + escapeHtml(it.targetKey || '') + '" title="' + escapeHtml(tooltip) + '">' +
                    '<div class="recent-upload-thumb-wrap ' + kindClass + '">' +
                        '<button type="button" class="recent-upload-eye-btn" title="Ver en grande" aria-label="Ver foto" data-fotos-act="recent-preview" data-lightbox-src="' + escapeHtml(fullSrc || '') + '">👁</button>' +
                        '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(it.id) + '" onerror="handlePhotoImgError(this)">' +
                        '<span class="recent-upload-kind-tag">' + escapeHtml(kindTag) + '</span>' +
                    '</div>' +
                    '<div class="recent-upload-meta">' +
                        '<div class="recent-upload-name">' + escapeHtml(displayTitle) + '</div>' +
                        '<div class="recent-upload-sub">' +
                            '<span>' + escapeHtml(timeTxt || 'Reciente') + '</span>' +
                            '<span class="is-reuse-pill" data-recent-lbl="1">' + (isSel ? '✓ Lista' : 'Reusar') + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }
        rail.innerHTML = parts.join('');
    }

    window.previewRecentUploadedPhoto = function (src, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (src && typeof window.openPhotoLightbox === 'function') {
            window.openPhotoLightbox(src);
        }
    };

    window.selectRecentUploadedPhoto = function (fileIdRaw, targetKeyRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        window.takeLoadedPhotoForAssign(targetKeyRaw || '', fileIdRaw || '', ev);
    };

    function renderInboxGallery() {
        renderRecentUploadedStrip();
        const container = document.getElementById('inboxGalleryContainer');
        const inboxBadge = document.getElementById('inboxHeaderBadge');
        const loadedBadge = document.getElementById('loadedHeaderBadge');
        if (!container) return;

        const loadedAll = getLoadedPhotosList();
        const q = normalizeSearchText(state.inboxSearchQuery);

        const visibleInbox = q
            ? state.inboxFiles.filter((f) => (f._searchNorm || '').indexOf(q) !== -1)
            : state.inboxFiles;

        const visibleLoaded = q
            ? loadedAll.filter((it) => (it._searchNorm || '').indexOf(q) !== -1)
            : loadedAll;

        if (inboxBadge) inboxBadge.textContent = String(visibleInbox.length);
        if (loadedBadge) loadedBadge.textContent = String(visibleLoaded.length);

        const activePhoto = getActiveSelectedPhotoObject();
        const activeId = activePhoto ? activePhoto.id : '';

        if (state.galleryMode === 'LOADED') {
            const sliceLoaded = visibleLoaded.slice(0, 140);
            if (!sliceLoaded.length) {
                container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">—</div>';
                return;
            }
            const parts = new Array(sliceLoaded.length);
            for (let i = 0; i < sliceLoaded.length; i++) {
                const item = sliceLoaded[i];
                const isSel = activeId === item.id && activePhoto && activePhoto.fromLoaded && activePhoto.skuOrigin === item.sku;
                const thumb = item.localDataUrl || buildPhotoThumbUrl(item.id || item.viewUrl, 360);
                const cardKey = 'L::' + (item.sku || '') + '::' + item.id;
                const primaryTitle = item.fileName || item.name || item.sku;
                const isVisualItem = /^V(?:COV|FAB|WOD):/i.test(item.sku || '');
                const displaySkuTag = isVisualItem ? (item.name || item.sku.replace(/^V(?:COV|FAB|WOD):/i, '')) : item.sku;
                const subText = [displaySkuTag, item.shortFolder].filter(Boolean).join(' · ');
                const titleTooltip = item.fileName
                    ? (item.fileName + (displaySkuTag ? (' · ' + displaySkuTag) : '') + (item.name && item.name !== item.fileName && item.name !== displaySkuTag ? (' · ' + item.name) : ''))
                    : (displaySkuTag ? (displaySkuTag + (item.name && item.name !== displaySkuTag ? (' · ' + item.name) : '')) : item.name);

                parts[i] =
                    '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" data-fotos-act="take-loaded" data-sku="' + escapeHtml(item.sku || '') + '" data-fid="' + escapeHtml(item.id || '') + '">' +
                        '<div class="inbox-thumb-box">' +
                            (!isVisualItem
                                ? ('<button type="button" class="card-del-btn" title="Borrar" data-fotos-act="del-loaded-sku" data-sku="' + escapeHtml(item.sku || '') + '" data-fid="' + escapeHtml(item.id || '') + '">🗑</button>')
                                : '') +
                            '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(item.id) + '" onerror="handlePhotoImgError(this)">' +
                        '</div>' +
                        '<div class="inbox-card-meta">' +
                            '<div class="inbox-file-name" title="' + escapeHtml(titleTooltip) + '">' + escapeHtml(primaryTitle) + '</div>' +
                            '<div class="inbox-file-sub">' +
                                '<span>' + escapeHtml(subText) + '</span>' +
                                '<span data-take-lbl="1" style="font-weight:800;color:' + (isSel ? '#CCA66B' : '#D0D9E4') + ';">' + (isSel ? '✓' : 'Tomar') + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            }
            container.innerHTML = parts.join('');
            return;
        }

        if (!state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">SUBIR PREN vacía</div>';
            return;
        }

        if (!visibleInbox.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">—</div>';
            return;
        }

        const sliceInbox = visibleInbox.slice(0, 160);
        const parts = new Array(sliceInbox.length);
        for (let i = 0; i < sliceInbox.length; i++) {
            const f = sliceInbox[i];
            const isSel = f.id === activeId && (!activePhoto || !activePhoto.fromLoaded);
            const thumb = f.localDataUrl || f.thumbDataUrl || buildPhotoThumbUrl(f.id, 360);
            const sz = f._sizeText || '';
            const suggestedSku = f._suggestedSku || '';
            const cardKey = 'I::' + f.id;

            parts[i] =
                '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" data-fotos-act="select-inbox" data-fid="' + escapeHtml(f.id || '') + '">' +
                    '<div class="inbox-thumb-box">' +
                        '<button type="button" class="card-del-btn" title="Borrar" data-fotos-act="del-inbox" data-fid="' + escapeHtml(f.id || '') + '">🗑</button>' +
                        '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(f.id) + '" onerror="handlePhotoImgError(this)">' +
                    '</div>' +
                    '<div class="inbox-card-meta">' +
                        '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                        '<div class="inbox-file-sub">' +
                            '<span>' + escapeHtml(sz) + '</span>' +
                            '<span data-take-lbl="1" style="font-weight:800;color:' + (isSel ? '#CCA66B' : '#D0D9E4') + ';">' + (isSel ? '✓' : 'Tomar') + '</span>' +
                        '</div>' +
                        (suggestedSku
                            ? ('<button type="button" class="suggest-sku-btn" data-fotos-act="suggest-sku" data-fid="' + escapeHtml(f.id || '') + '" data-suggested-sku="' + escapeHtml(suggestedSku) + '">SKU ' + escapeHtml(suggestedSku) + '</button>')
                            : '') +
                    '</div>' +
                '</div>';
        }
        container.innerHTML = parts.join('');
    }

    function updateGallerySelectionInDom() {
        const activePhoto = getActiveSelectedPhotoObject();
        const container = document.getElementById('inboxGalleryContainer');
        if (container) {
            const targetKey = activePhoto
                ? (activePhoto.fromLoaded ? ('L::' + (activePhoto.skuOrigin || '') + '::' + activePhoto.id) : ('I::' + activePhoto.id))
                : '';

            const cards = container.querySelectorAll('.inbox-photo-card');
            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const isSel = targetKey && card.getAttribute('data-card-key') === targetKey;
                card.classList.toggle('selected', !!isSel);
                const lbl = card.querySelector('[data-take-lbl]');
                if (lbl) {
                    lbl.textContent = isSel ? '✓' : 'Tomar';
                    lbl.style.color = isSel ? '#CCA66B' : '#D0D9E4';
                }
            }
        }

        const rail = document.getElementById('recentUploadedPhotosRail');
        if (rail) {
            const activeRecentId = (activePhoto && activePhoto.fromLoaded) ? activePhoto.id : '';
            const rCards = rail.querySelectorAll('.recent-upload-card');
            for (let i = 0; i < rCards.length; i++) {
                const card = rCards[i];
                const isSel = !!(activeRecentId && card.getAttribute('data-recent-id') === activeRecentId);
                card.classList.toggle('selected', isSel);
                const rLbl = card.querySelector('[data-recent-lbl]');
                if (rLbl) rLbl.textContent = isSel ? '✓ Lista' : 'Reusar';
            }
        }
    }

    window.selectInboxPhoto = function (fileId) {
        const id = cleanStr(fileId);
        if (!id) return;
        const alreadySame = state.selectedInboxFileId === id && (!state.selectedPhotoItem || !state.selectedPhotoItem.fromLoaded);
        if (alreadySame) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        } else {
            const fObj = state.inboxFiles.find((f) => f.id === id);
            state.selectedInboxFileId = id;
            state.selectedPhotoItem = fObj ? {
                id: fObj.id,
                name: fObj.name,
                shortcutId: cleanStr(fObj.shortcutId),
                viewUrl: fObj.viewUrl || ('https://drive.google.com/file/d/' + fObj.id + '/view?usp=sharing'),
                thumbDataUrl: fObj.thumbDataUrl || '',
                localDataUrl: fObj.localDataUrl || '',
                fromLoaded: false,
                skuOrigin: cleanStr(fObj.skuOrigin)
            } : null;

            // Seguridad: NUNCA cambiar silenciosamente el SKU si el usuario ya eligió uno
            if (fObj && visualState.workMode === 'SKU' && !state.selectedSku) {
                const sug = fObj._suggestedSku || findSuggestedSkuForFileName(fObj.name) || cleanStr(fObj.skuOrigin);
                const explicitInName = sug ? extractExplicitSkuFromFileName(fObj.name) : '';
                if (sug && explicitInName === sug && state.productBySku.has(sug)) {
                    window.selectSkuProduct(sug, { skipBackSync: true });
                }
            }
        }
        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
        }
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!alreadySame) {
            syncFotosBackNav('selected_photo');
        }
    };

    window.takeLoadedPhotoForAssign = function (skuRaw, fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        let fid = cleanStr(fileIdRaw);
        const prod = sku ? state.productBySku.get(sku) : null;
        const saved = sku ? state.sessionSavedBySku.get(sku) : null;
        const ovMap = getVisualOverridesMapSafe();
        const visOv = sku && ovMap[sku] ? ovMap[sku] : null;
        const recentMatch = getRecentUploadedPhotosList().find((r) => (fid && r.id === fid) || (sku && r.targetKey === sku)) || null;
        const rawCandidateUrl = (prod && prod.photoUrl) ||
            (saved && saved.newUrl) ||
            (recentMatch && recentMatch.viewUrl) ||
            (visOv && !/^blob:/i.test(cleanStr(visOv.note)) && cleanStr(visOv.note).indexOf('data:image/') !== 0 ? cleanStr(visOv.note) : '') ||
            (fid && !isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '');
        const url = /^blob:/i.test(cleanStr(rawCandidateUrl)) ? '' : rawCandidateUrl;
        if (!fid && url) fid = extractDriveFileId(url);
        if (!fid) return;

        const alreadySame = state.selectedPhotoItem &&
            state.selectedPhotoItem.id === fid &&
            state.selectedPhotoItem.fromLoaded &&
            (state.selectedPhotoItem.skuOrigin === sku || !sku);

        if (alreadySame) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        } else {
            const origFileName = cleanStr(
                (saved && saved.fileName) ||
                (recentMatch && recentMatch.fileName) ||
                (state.loadedFileNamesById && state.loadedFileNamesById[fid]) ||
                ''
            );
            const displayLabel = origFileName || (prod
                ? (prod.sku + ' · ' + (prod.displayName || prod.colBName || prod.sku))
                : ((recentMatch && recentMatch.targetLabel) || (visOv && visOv.name) || sku || fid));
            const localDataUrl = (saved && saved.localDataUrl) ||
                (recentMatch && recentMatch.localDataUrl) ||
                (visOv && cleanStr(visOv.note).indexOf('data:image/') === 0 ? cleanStr(visOv.note) : '') ||
                '';
            state.selectedInboxFileId = fid;
            state.selectedPhotoItem = {
                id: fid,
                name: displayLabel,
                viewUrl: url || (!isLocalTempPhotoId(fid) ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : ''),
                thumbDataUrl: '',
                localDataUrl: localDataUrl,
                fromLoaded: true,
                skuOrigin: sku || (recentMatch && recentMatch.targetKey) || ''
            };
        }

        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        if (typeof syncVisualStageSelectedGalleryPreview === 'function') {
            syncVisualStageSelectedGalleryPreview();
        }
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (!alreadySame) {
            syncFotosBackNav('selected_photo');
        }
    };

    window.takeCurrentProductPhoto = function () {
        if (!state.selectedSku) return;
        const prod = state.productBySku.get(state.selectedSku);
        const saved = state.sessionSavedBySku.get(state.selectedSku);
        const url = (prod && prod.photoUrl) || (saved && saved.newUrl) || '';
        const fid = (prod && prod.photoFileId) || extractDriveFileId(url) || (saved && saved.fileId) || '';
        if (!fid) return;
        window.takeLoadedPhotoForAssign(state.selectedSku, fid);
    };

    window.takePhotoFromSkuRow = function (skuRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = state.productBySku.get(sku);
        if (!prod || !prod.photoUrl) return;
        const fid = prod.photoFileId || extractDriveFileId(prod.photoUrl);
        if (!fid) return;
        window.takeLoadedPhotoForAssign(sku, fid);
    };

    window.deleteInboxPhotoById = async function (fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const fid = cleanStr(fileIdRaw);
        if (!fid) return;

        const targetItem = state.inboxFiles.find((f) => f && f.id === fid) ||
            state.rawInboxFromDrive.find((f) => f && f.id === fid) || null;
        const shortcutId = cleanStr(targetItem && targetItem.shortcutId);

        markDeletedInQueue(fid, '');
        state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== fid);
        state.inboxFiles = state.inboxFiles.filter((f) => f.id !== fid);
        state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== fid);
        scheduleSaveFastCache();

        if (state.selectedInboxFileId === fid || (state.selectedPhotoItem && state.selectedPhotoItem.id === fid)) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        }

        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        notifyFotosInboxChanged('delete_inbox');
        showAssignFeedback('🗑 Foto borrada de SUBIR PREN.', true);

        if (isLocalTempPhotoId(fid)) {
            removeOutboxEntriesForLocalFileId(fid);
            deleteOfflinePhotoBlobIdb(fid);
            unmarkSkuDeletedInQueue('', fid);
            return;
        }

        const res = await callWebAppPost('fotos_delete', Object.assign({
            driveFileId: fid,
            shortcutId: shortcutId,
            source: 'INBOX',
            skipListReturn: true
        }, buildOwnerAuthPayload()), 22000);

        if (res && res.ok) {
            unmarkSkuDeletedInQueue('', fid);
        }
    };

    window.deleteLoadedPhotoBySku = async function (skuRaw, fileIdRaw, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const sku = cleanStr(skuRaw).toUpperCase();
        const prod = sku ? state.productBySku.get(sku) : null;
        const saved = sku ? state.sessionSavedBySku.get(sku) : null;
        const fid = cleanStr(fileIdRaw) ||
            (prod ? (prod.photoFileId || extractDriveFileId(prod.photoUrl)) : '') ||
            (saved ? (saved.fileId || extractDriveFileId(saved.newUrl)) : '');
        const wasLocalOnly = isLocalTempPhotoId(fid) && !(prod && prod.inSheet1 && extractDriveFileId(saved && saved.previousUrl));

        if (!sku && !fid) return;

        markDeletedInQueue(fid, sku);

        if (isLocalTempPhotoId(fid)) {
            removeOutboxEntriesForLocalFileId(fid);
            deleteOfflinePhotoBlobIdb(fid);
        }
        if (sku) {
            const cleanedQ = readFotosOfflineOutbox().filter((it) => {
                if (!it) return false;
                if ((it.type === 'direct_upload_assign' || it.type === 'assign_photo') && cleanStr(it.sku).toUpperCase() === sku) {
                    if (it.localFileId) deleteOfflinePhotoBlobIdb(it.localFileId);
                    return false;
                }
                return true;
            });
            writeFotosOfflineOutbox(cleanedQ);
        }

        if (prod) {
            prod.photoUrl = '';
            prod.photoFileId = '';
        }
        if (sku) {
            state.sessionSavedBySku.delete(sku);
            state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it.sku !== sku);
            saveSavedOverridesNow();
        }
        if (fid) {
            state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== fid);
            state.inboxFiles = state.inboxFiles.filter((f) => f.id !== fid);
            state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== fid);
        }
        if (
            (fid && state.selectedInboxFileId === fid) ||
            (state.selectedPhotoItem && ((fid && state.selectedPhotoItem.id === fid) || (sku && state.selectedPhotoItem.skuOrigin === sku)))
        ) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        }

        invalidateLoadedPhotosCache();
        scheduleSaveFastCache();
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        renderInboxGallery();
        renderSelectedProductStage();
        renderSessionHistoryLog();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        if (sku) {
            notifySplitPeerOfPhotoUpdate(sku, '', '', '');
        }
        notifyFotosInboxChanged('delete_loaded');
        showAssignFeedback('🗑 Foto borrada' + (sku ? (' de ' + escapeHtml(sku)) : '') + '.', true);

        if (wasLocalOnly) {
            unmarkSkuDeletedInQueue(sku, fid);
            return;
        }

        const res = await callWebAppPost('fotos_delete', Object.assign({
            sku: sku,
            driveFileId: isLocalTempPhotoId(fid) ? '' : fid,
            source: 'LOADED',
            skipListReturn: true
        }, buildOwnerAuthPayload()), 22000);

        if (res && res.ok) {
            unmarkSkuDeletedInQueue(sku, fid);
        }
    };

    window.deleteCurrentProductPhoto = function () {
        if (!state.selectedSku) return;
        const prod = state.productBySku.get(state.selectedSku);
        const fid = prod ? (prod.photoFileId || extractDriveFileId(prod.photoUrl)) : '';
        window.deleteLoadedPhotoBySku(state.selectedSku, fid);
    };

    window.deleteSelectedStagePhoto = function () {
        const sel = getActiveSelectedPhotoObject();
        if (sel) {
            if (sel.fromLoaded) {
                window.deleteLoadedPhotoBySku(sel.skuOrigin || '', sel.id);
            } else {
                window.deleteInboxPhotoById(sel.id);
            }
            return;
        }
        if (state.selectedSku) {
            const saved = state.sessionSavedBySku.get(state.selectedSku);
            if (saved) {
                window.deleteLoadedPhotoBySku(state.selectedSku, saved.fileId || extractDriveFileId(saved.newUrl));
            }
        }
    };

    window.applySuggestedSkuFromInbox = function (fileId, sku, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const id = cleanStr(fileId);
        const fObj = state.inboxFiles.find((f) => f.id === id);
        state.selectedInboxFileId = id;
        state.selectedPhotoItem = fObj ? {
            id: fObj.id,
            name: fObj.name,
            viewUrl: fObj.viewUrl || ('https://drive.google.com/file/d/' + fObj.id + '/view?usp=sharing'),
            thumbDataUrl: fObj.thumbDataUrl || '',
            localDataUrl: fObj.localDataUrl || '',
            fromLoaded: false,
            skuOrigin: cleanStr(fObj.skuOrigin)
        } : null;
        window.selectSkuProduct(sku, { skipBackSync: true });
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
        syncFotosBackNav('selected_photo');
    };

    window.clearSelectedInboxPhoto = function () {
        state.selectedInboxFileId = '';
        state.selectedPhotoItem = null;
        updateGallerySelectionInDom();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();
    };

    const pendingUploadPromises = new Map();

    function notifySplitPeerOfPhotoUpdate(sku, photoUrl, fileId, destFolderName) {
        const cleanUrl = cleanStr(photoUrl);
        const msg = {
            type: 'CREATA_SPLIT_PHOTO_SAVED',
            sku: cleanStr(sku).toUpperCase(),
            photoUrl: cleanUrl,
            deleted: !cleanUrl,
            fileId: cleanStr(fileId),
            destFolderName: cleanStr(destFolderName),
            source: 'fotos',
            tabId: FOTOS_TAB_ID
        };
        try {
            if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (e) {}
        try {
            const splitFrame = document.getElementById('fotosSplitCotizadorFrame');
            if (splitFrame && splitFrame.contentWindow && typeof splitFrame.contentWindow.postMessage === 'function') {
                splitFrame.contentWindow.postMessage(msg, '*');
            }
        } catch (e2) {}
        try {
            if (_fotosSyncChannel && cleanUrl.indexOf('blob:') !== 0) {
                _fotosSyncChannel.postMessage(msg);
            }
        } catch (e3) {}
    }

    function notifySplitPeerOfSkuSelect(sku, openDetail) {
        const msg = {
            type: 'CREATA_SPLIT_SELECT_SKU',
            sku: cleanStr(sku).toUpperCase(),
            openDetail: !!openDetail,
            source: 'fotos'
        };
        try {
            if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (e) {}
        try {
            const splitFrame = document.getElementById('fotosSplitCotizadorFrame');
            if (splitFrame && splitFrame.contentWindow && typeof splitFrame.contentWindow.postMessage === 'function') {
                splitFrame.contentWindow.postMessage(msg, '*');
            }
        } catch (e2) {}
        try {
            if (_fotosSyncChannel && openDetail) {
                _fotosSyncChannel.postMessage(msg);
            }
        } catch (e3) {}
    }

    function inferImageMimeFromName(fileName) {
        const lower = String(fileName || '').toLowerCase();
        if (/\.png$/.test(lower)) return 'image/png';
        if (/\.webp$/.test(lower)) return 'image/webp';
        if (/\.gif$/.test(lower)) return 'image/gif';
        return 'image/jpeg';
    }

    function normalizeImageDataUrl(rawDataUrl, fileName) {
        const s = String(rawDataUrl || '').trim();
        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(s)) return s;
        const commaIdx = s.indexOf(',');
        if (commaIdx > 0 && /^data:[^;]*;base64$/i.test(s.slice(0, commaIdx))) {
            return 'data:' + inferImageMimeFromName(fileName) + ';base64,' + s.slice(commaIdx + 1);
        }
        return s;
    }

    function autoFrameStudioProductToDataUrl(source, maxDim, jpegQ) {
        const nw = (source && (source.naturalWidth || source.width)) || 0;
        const nh = (source && (source.naturalHeight || source.height)) || 0;
        if (!nw || !nh) return '';

        // Muestreo compacto (máx 96px) sobre píxeles reales sin letterbox para detectar fondo de estudio
        let sx = 0, sy = 0, sw = nw, sh = nh, isStudio = false;
        try {
            const cap = 96;
            const sScale = Math.min(1, cap / Math.max(nw, nh));
            const sdw = Math.max(16, Math.round(nw * sScale));
            const sdh = Math.max(16, Math.round(nh * sScale));
            const probe = document.createElement('canvas');
            probe.width = sdw;
            probe.height = sdh;
            const pCtx = probe.getContext('2d', { willReadFrequently: true });
            if (pCtx) {
                pCtx.clearRect(0, 0, sdw, sdh);
                pCtx.drawImage(source, 0, 0, sdw, sdh);
                const rgba = pCtx.getImageData(0, 0, sdw, sdh).data;
                const ring = (sdw < 24 || sdh < 24) ? 1 : 2;
                let bCount = 0, tCount = 0, rSum = 0, gSum = 0, bSum = 0;
                const bRgb = [];
                for (let y = 0; y < sdh; y++) {
                    for (let x = 0; x < sdw; x++) {
                        if (x >= ring && x < sdw - ring && y >= ring && y < sdh - ring) continue;
                        const p = (y * sdw + x) * 4;
                        bCount++;
                        if (rgba[p + 3] < 24) {
                            tCount++;
                        } else {
                            rSum += rgba[p];
                            gSum += rgba[p + 1];
                            bSum += rgba[p + 2];
                            bRgb.push(rgba[p], rgba[p + 1], rgba[p + 2]);
                        }
                    }
                }
                const transRatio = bCount > 0 ? (tCount / bCount) : 0;
                const useAlpha = transRatio >= 0.08;
                const opqN = bRgb.length / 3;
                const mR = opqN > 0 ? rSum / opqN : 255;
                const mG = opqN > 0 ? gSum / opqN : 255;
                const mB = opqN > 0 ? bSum / opqN : 255;
                let vSum = 0;
                for (let i = 0; i < bRgb.length; i += 3) {
                    const dr = bRgb[i] - mR, dg = bRgb[i + 1] - mG, db = bRgb[i + 2] - mB;
                    vSum += (dr * dr + dg * dg + db * db) / 3;
                }
                const stdDev = opqN > 0 ? Math.sqrt(vSum / opqN) : 0;
                const maxCh = Math.max(mR, mG, mB);
                const minCh = Math.min(mR, mG, mB);
                const isNearWhite = useAlpha || (minCh >= 244 && (maxCh - minCh) <= 12);

                if (useAlpha || (isNearWhite && stdDev <= 24)) {
                    const thresh = Math.max(30, Math.min(64, Math.round(28 + stdDev * 2.2)));
                    const mask = new Uint8Array(sdw * sdh);
                    for (let y = 0; y < sdh; y++) {
                        const rOff = y * sdw;
                        for (let x = 0; x < sdw; x++) {
                            const p = (rOff + x) * 4;
                            if (rgba[p + 3] <= 24) continue;
                            if (useAlpha) {
                                mask[rOff + x] = 1;
                            } else {
                                const dist = Math.abs(rgba[p] - mR) + Math.abs(rgba[p + 1] - mG) + Math.abs(rgba[p + 2] - mB);
                                if (dist > thresh) mask[rOff + x] = 1;
                            }
                        }
                    }
                    let minX = sdw, minY = sdh, maxX = -1, maxY = -1, fgN = 0;
                    for (let y = 0; y < sdh; y++) {
                        const rOff = y * sdw;
                        const y0 = y > 0 ? y - 1 : 0;
                        const y1 = y < sdh - 1 ? y + 1 : sdh - 1;
                        for (let x = 0; x < sdw; x++) {
                            if (!mask[rOff + x]) continue;
                            const x0 = x > 0 ? x - 1 : 0;
                            const x1 = x < sdw - 1 ? x + 1 : sdw - 1;
                            let hasNb = false;
                            for (let ny = y0; ny <= y1 && !hasNb; ny++) {
                                const nRow = ny * sdw;
                                for (let nx = x0; nx <= x1; nx++) {
                                    if (nx === x && ny === y) continue;
                                    if (mask[nRow + nx]) { hasNb = true; break; }
                                }
                            }
                            if (!hasNb) continue;
                            fgN++;
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                    if (fgN >= Math.max(24, Math.floor(sdw * sdh * 0.008)) && maxX > minX && maxY > minY) {
                        const bx = Math.max(0, Math.floor((minX / sdw) * nw) - Math.round(nw * 0.015));
                        const by = Math.max(0, Math.floor((minY / sdh) * nh) - Math.round(nh * 0.015));
                        const bx2 = Math.min(nw, Math.ceil(((maxX + 1) / sdw) * nw) + Math.round(nw * 0.015));
                        const by2 = Math.min(nh, Math.ceil(((maxY + 1) / sdh) * nh) + Math.round(nh * 0.015));
                        if ((bx2 - bx) >= nw * 0.08 && (by2 - by) >= nh * 0.08) {
                            sx = bx;
                            sy = by;
                            sw = bx2 - bx;
                            sh = by2 - by;
                            isStudio = true;
                        }
                    }
                }
            }
        } catch (eProbe) {}

        const canvas = document.createElement('canvas');
        if (isStudio) {
            const outSize = Math.min(2048, maxDim || 2048);
            const outW = outSize;
            const outH = outSize;
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, outW, outH);
            const padX = Math.round(outW * 0.08);
            const padY = Math.round(outH * 0.08);
            const fitScale = Math.min((outW - padX * 2) / sw, (outH - padY * 2) / sh);
            const dw = Math.max(1, Math.round(sw * fitScale));
            const dh = Math.max(1, Math.round(sh * fitScale));
            const dx = Math.round((outW - dw) / 2);
            const dy = Math.round((outH - dh) / 2);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
            return canvas.toDataURL('image/jpeg', jpegQ);
        }

        let w = nw;
        let h = nh;
        if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', jpegQ);
    }

    async function readFileAsOptimizedDataUrl(file) {
        const MAX_DIM = 2048;
        const JPEG_Q = 0.86;
        const fileName = (file && file.name) || 'foto.jpg';
        if (typeof createImageBitmap === 'function' && file) {
            try {
                const bmp = await createImageBitmap(file);
                const framed = autoFrameStudioProductToDataUrl(bmp, MAX_DIM, JPEG_Q);
                if (bmp.close) bmp.close();
                if (framed) return framed;
            } catch (eBmp) {}
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                const normalized = normalizeImageDataUrl(rawDataUrl, fileName);
                if (typeof Image === 'undefined') {
                    resolve(normalized);
                    return;
                }
                const img = new Image();
                img.onerror = () => resolve(normalized);
                img.onload = () => {
                    try {
                        const framed = autoFrameStudioProductToDataUrl(img, MAX_DIM, JPEG_Q);
                        resolve(framed || normalized);
                    } catch (errC) {
                        resolve(normalized);
                    }
                };
                img.src = normalized;
            };
            reader.readAsDataURL(file);
        });
    }

    function isAcceptedImageFile(f) {
        if (!f) return false;
        const mime = String(f.type || '').toLowerCase();
        return mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(f.name || '');
    }

    window.uploadLocalFilesToSubir = async function (inputEl, opts) {
        const uploadOpts = (opts && typeof opts === 'object') ? opts : {};
        const rawList = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
        const files = rawList.filter(isAcceptedImageFile);
        if (!files.length) {
            if (rawList.length > 0) {
                showAssignFeedback('⚠️ Selecciona una imagen válida.', false);
            }
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            return [];
        }

        // 1) CARGA INSTANTÁNEA EN UI (0ms): Mostrar las fotos al instante con URL.createObjectURL antes de subir a la nube
        const stagedEntries = [];
        const nowTs = Date.now();
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const safeFileName = cleanStr(f.name) || ('foto_' + nowTs + '_' + (i + 1) + '.jpg');
            const localId = 'local_inb_' + nowTs + '_' + i + '_' + Math.floor(Math.random() * 9000 + 1000);
            let blobUrl = '';
            try {
                if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                    blobUrl = URL.createObjectURL(f);
                }
            } catch (eBlob) {}

            const instantItem = enrichInboxFileItem({
                id: localId,
                name: safeFileName,
                sizeBytes: f.size || 0,
                updatedAt: new Date().toISOString(),
                viewUrl: blobUrl,
                localDataUrl: blobUrl,
                thumbDataUrl: blobUrl,
                isUploadingNow: true
            });
            state.rawInboxFromDrive.unshift(instantItem);
            state.inboxFiles.unshift(instantItem);
            stagedEntries.push({ file: f, fileName: safeFileName, localId: localId, blobUrl: blobUrl, item: instantItem });
        }

        if (stagedEntries.length > 0) {
            const firstEntry = stagedEntries[0];
            state.selectedInboxFileId = firstEntry.localId;
            state.selectedPhotoItem = {
                id: firstEntry.localId,
                name: firstEntry.fileName,
                viewUrl: firstEntry.blobUrl,
                thumbDataUrl: firstEntry.blobUrl,
                localDataUrl: firstEntry.blobUrl,
                fromLoaded: false,
                skuOrigin: ''
            };
            if (!state.selectedSku && firstEntry.item._suggestedSku && state.productBySku.has(firstEntry.item._suggestedSku)) {
                window.selectSkuProduct(firstEntry.item._suggestedSku, { skipBackSync: true });
            }
            state.galleryMode = 'INBOX';
            window.setGalleryMode('INBOX');
            renderSelectedProductStage();
            updateAssignButtonState();
            syncFotosBackNav('selected_photo');
        }

        if (!uploadOpts.suppressSummaryFeedback) {
            showAssignFeedback('⚡ Subiendo ' + files.length + ' foto(s)...', true);
        }

        // 2) SUBIDA EN SEGUNDO PLANO (2 WORKERS EN PARALELO PARA EVITAR CONGESTIÓN / TIMEOUTS EN GAS)
        let uploadedCount = 0;
        let queuedOfflineCount = 0;
        let failedCount = 0;
        let authFailed = false;
        let lastUploadError = '';
        let completedCount = 0;
        const CONCURRENCY = 2;
        let cursor = 0;

        const removeFailedTempEntry = (localId) => {
            state.rawInboxFromDrive = state.rawInboxFromDrive.filter((it) => it && it.id !== localId);
            state.inboxFiles = state.inboxFiles.filter((it) => it && it.id !== localId);
            if (state.selectedInboxFileId === localId) state.selectedInboxFileId = '';
            if (state.selectedPhotoItem && state.selectedPhotoItem.id === localId) state.selectedPhotoItem = null;
        };

        const uploadSingleEntry = (entry) => {
            const p = (async () => {
                const f = entry.file;
                const localId = entry.localId;
                const uploadName = entry.fileName;
                try {
                    const dataUrl = await readFileAsOptimizedDataUrl(f);
                    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(String(dataUrl || ''))) {
                        failedCount++;
                        lastUploadError = 'Formato de imagen no compatible (' + uploadName + ').';
                        removeFailedTempEntry(localId);
                        completedCount++;
                        return { ok: false, error: lastUploadError };
                    }

                    // Actualizar localDataUrl con el base64 comprimido para persistencia offline
                    entry.item.localDataUrl = dataUrl;
                    if (!entry.item.viewUrl) entry.item.viewUrl = dataUrl;
                    if (state.selectedPhotoItem && state.selectedPhotoItem.id === localId) {
                        state.selectedPhotoItem.localDataUrl = dataUrl;
                        if (!state.selectedPhotoItem.viewUrl) state.selectedPhotoItem.viewUrl = dataUrl;
                    }

                    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
                    const res = isOfflineNow
                        ? { ok: false, unavailable: true }
                        : await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                            fileName: uploadName,
                            dataUrl: dataUrl,
                            skipListReturn: true
                        }, buildOwnerAuthPayload()), 45000);

                    completedCount++;
                    if (res && res.ok && res.file && res.file.id) {
                        uploadedCount++;
                        const realId = res.file.id;
                        entry.realId = realId;
                        const newFile = enrichInboxFileItem(Object.assign({}, res.file, {
                            localDataUrl: entry.blobUrl || dataUrl,
                            thumbDataUrl: entry.blobUrl || dataUrl
                        }));
                        state.rawInboxFromDrive = state.rawInboxFromDrive.map((it) => (it && it.id === localId ? newFile : it));
                        state.inboxFiles = state.inboxFiles.map((it) => (it && it.id === localId ? newFile : it));
                        if (state.selectedInboxFileId === localId) {
                            state.selectedInboxFileId = realId;
                        }
                        if (state.selectedPhotoItem && state.selectedPhotoItem.id === localId) {
                            state.selectedPhotoItem.id = realId;
                            state.selectedPhotoItem.viewUrl = newFile.viewUrl || entry.blobUrl || dataUrl;
                            state.selectedPhotoItem.localDataUrl = dataUrl;
                        }
                        return { ok: true, realId: realId, file: newFile, dataUrl: dataUrl, blobUrl: entry.blobUrl };
                    }
                    if (res && res.authRequired) {
                        authFailed = true;
                        lastUploadError = cleanStr(res.error) || 'Sesión expirada.';
                        removeFailedTempEntry(localId);
                        return { ok: false, authRequired: true, error: lastUploadError };
                    }
                    if (isOfflineNow || !res || res.unavailable) {
                        queuedOfflineCount++;
                        await putOfflinePhotoBlobIdb({
                            id: localId,
                            fileName: uploadName,
                            dataUrl: dataUrl,
                            sizeBytes: f.size || 0,
                            createdAt: Date.now()
                        });
                        enqueueFotosOfflineOutbox({
                            id: 'op_up_' + localId,
                            type: 'upload_inbox',
                            localFileId: localId,
                            fileName: uploadName,
                            sizeBytes: f.size || 0,
                            queuedAt: Date.now()
                        });
                        entry.item.isOfflinePending = true;
                        entry.item.isUploadingNow = false;
                        return { ok: false, offlineQueued: true, localId: localId, dataUrl: dataUrl, blobUrl: entry.blobUrl };
                    }

                    failedCount++;
                    lastUploadError = cleanStr(res && res.error) || 'Error al subir ' + uploadName + '.';
                    removeFailedTempEntry(localId);
                    return { ok: false, error: lastUploadError };
                } catch (errUp) {
                    completedCount++;
                    failedCount++;
                    lastUploadError = (errUp && errUp.message) ? errUp.message : ('Error al subir ' + uploadName + '.');
                    removeFailedTempEntry(localId);
                    return { ok: false, error: lastUploadError };
                }
            })();
            pendingUploadPromises.set(entry.localId, p);
            p.finally(() => {
                setTimeout(() => pendingUploadPromises.delete(entry.localId), 15000);
            });
            return p;
        };

        const worker = async () => {
            while (cursor < stagedEntries.length) {
                const idx = cursor++;
                await uploadSingleEntry(stagedEntries[idx]);
                if (!uploadOpts.suppressSummaryFeedback && stagedEntries.length > 1 && completedCount < stagedEntries.length) {
                    showAssignFeedback('⚡ Subiendo ' + completedCount + '/' + stagedEntries.length + '...', true);
                }
            }
        };

        try {
            const workers = [];
            for (let w = 0; w < Math.min(CONCURRENCY, stagedEntries.length); w++) {
                workers.push(worker());
            }
            await Promise.all(workers);
        } finally {
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
        }

        renderInboxGallery();
        renderSelectedProductStage();
        scheduleSaveFastCache();
        saveFotosUiCheckpointNow();
        updateAssignButtonState();

        if (authFailed) {
            showAssignFeedback('❌ ' + escapeHtml(lastUploadError || 'Sesión expirada.'), false);
            window.lockFotosPortal();
        } else if (!uploadOpts.suppressSummaryFeedback) {
            if (failedCount > 0 && uploadedCount === 0 && queuedOfflineCount === 0) {
                showAssignFeedback('❌ ' + escapeHtml(lastUploadError || 'Error al subir.'), false);
            } else if (queuedOfflineCount > 0 && uploadedCount === 0) {
                showAssignFeedback('⚡ ' + queuedOfflineCount + ' en cola (sin red).', true);
            } else if (queuedOfflineCount > 0) {
                showAssignFeedback('✅ Subidas: ' + uploadedCount + ' · Cola: ' + queuedOfflineCount + '.', true);
            } else if (uploadedCount > 0 && failedCount > 0) {
                showAssignFeedback('⚠️ Subidas: ' + uploadedCount + ' · Error: ' + failedCount + '.', false);
            } else if (uploadedCount > 0) {
                showAssignFeedback('✅ ' + uploadedCount + ' subida(s) a SUBIR PREN.', true);
            }
        }
        return stagedEntries;
    };

    const SUBIR_PREN_WINDOWS_PATH = 'G:\\Mi unidad\\DOC ANIPA\\Fotos general\\Fotos de del proyeto\\SUBIR PREN';
    const SUBIR_PREN_DIR_IDB_NAME = 'creata_subir_pren_dir_idb_v1';
    const SUBIR_PREN_DIR_IDB_STORE = 'dir_handles';
    const SUBIR_PREN_DIR_IDB_KEY = 'subir_pren';

    function openSubirPrenDirHandleDb() {
        return new Promise((resolve) => {
            try {
                if (typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.open !== 'function') {
                    resolve(null);
                    return;
                }
                const req = indexedDB.open(SUBIR_PREN_DIR_IDB_NAME, 1);
                req.onupgradeneeded = () => {
                    try {
                        const db = req.result;
                        if (db && !db.objectStoreNames.contains(SUBIR_PREN_DIR_IDB_STORE)) {
                            db.createObjectStore(SUBIR_PREN_DIR_IDB_STORE);
                        }
                    } catch (eUp) {}
                };
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function readSavedSubirPrenDirHandle() {
        const db = await openSubirPrenDirHandleDb();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(SUBIR_PREN_DIR_IDB_STORE, 'readonly');
                const req = tx.objectStore(SUBIR_PREN_DIR_IDB_STORE).get(SUBIR_PREN_DIR_IDB_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function writeSavedSubirPrenDirHandle(dirHandle) {
        const db = await openSubirPrenDirHandleDb();
        if (!db || !dirHandle) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(SUBIR_PREN_DIR_IDB_STORE, 'readwrite');
                tx.objectStore(SUBIR_PREN_DIR_IDB_STORE).put(dirHandle, SUBIR_PREN_DIR_IDB_KEY);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    function updateSubirPrenLocalBadgeUi(linkedFolderName) {
        const badgeEl = document.getElementById('subirPrenLocalPathBadge');
        const rebindBtn = document.getElementById('btnRebindLocalSubirPrenFolder');
        const pickBtn = document.getElementById('btnPickLocalSubirPrenFolder');
        if (linkedFolderName) {
            if (badgeEl) {
                badgeEl.textContent = '✓ ' + SUBIR_PREN_WINDOWS_PATH + ' (' + linkedFolderName + ')';
                badgeEl.classList.add('is-linked');
            }
            if (rebindBtn) rebindBtn.classList.remove('hidden');
            if (pickBtn) pickBtn.textContent = '💻 PC';
        } else {
            if (badgeEl) {
                badgeEl.textContent = SUBIR_PREN_WINDOWS_PATH;
                badgeEl.classList.remove('is-linked');
            }
            if (rebindBtn) rebindBtn.classList.add('hidden');
            if (pickBtn) pickBtn.textContent = '💻 PC';
        }
    }

    async function syncLocalSubirPrenFolderBadge() {
        try {
            const savedHandle = await readSavedSubirPrenDirHandle();
            if (savedHandle && savedHandle.name) {
                updateSubirPrenLocalBadgeUi(String(savedHandle.name));
            } else {
                updateSubirPrenLocalBadgeUi('');
            }
        } catch (e) {}
    }

    async function collectImageFilesFromDirHandle(dirHandle, depth) {
        const out = [];
        if (!dirHandle || typeof dirHandle.values !== 'function') return out;
        const curDepth = typeof depth === 'number' ? depth : 0;
        for await (const entry of dirHandle.values()) {
            if (!entry) continue;
            if (entry.kind === 'file' && typeof entry.getFile === 'function') {
                try {
                    const file = await entry.getFile();
                    if (!file) continue;
                    const mime = String(file.type || '').toLowerCase();
                    const isImg = mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name || '');
                    if (isImg) out.push(file);
                } catch (eFile) {}
            } else if (entry.kind === 'directory' && curDepth < 1) {
                const subFiles = await collectImageFilesFromDirHandle(entry, curDepth + 1);
                for (let s = 0; s < subFiles.length; s++) out.push(subFiles[s]);
            }
        }
        return out;
    }

    async function ingestLocalSubirPrenFilesDeduped(files, sourceLabel) {
        const validFiles = (Array.isArray(files) ? files : []).filter((f) => {
            if (!f) return false;
            const mime = String(f.type || '').toLowerCase();
            return mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name || '');
        });
        if (!validFiles.length) {
            showAssignFeedback('ℹ️ Sin imágenes en ' + escapeHtml(sourceLabel || 'SUBIR PREN') + '.', false);
            return [];
        }

        const existingNameSet = new Set();
        for (let i = 0; i < state.inboxFiles.length; i++) {
            const ex = state.inboxFiles[i];
            if (ex && ex.name) {
                existingNameSet.add(cleanStr(ex.name).toLowerCase());
            }
        }

        const brandNewFiles = [];
        let firstExistingMatchId = '';
        for (let j = 0; j < validFiles.length; j++) {
            const f = validFiles[j];
            const keyLower = cleanStr(f.name).toLowerCase();
            if (existingNameSet.has(keyLower)) {
                if (!firstExistingMatchId) {
                    const foundEx = state.inboxFiles.find((it) => cleanStr(it && it.name).toLowerCase() === keyLower);
                    if (foundEx) firstExistingMatchId = foundEx.id;
                }
            } else {
                brandNewFiles.push(f);
            }
        }

        state.galleryMode = 'INBOX';
        window.setGalleryMode('INBOX');

        if (!brandNewFiles.length) {
            if (firstExistingMatchId && !state.selectedInboxFileId) {
                window.selectInboxPhoto(firstExistingMatchId);
            }
            renderInboxGallery();
            showAssignFeedback('✅ ' + validFiles.length + ' foto(s) ya en bandeja.', true);
            return [];
        }

        return window.uploadLocalFilesToSubir({ files: brandNewFiles });
    }

    window.loadFromLocalSubirPrenFolder = async function (forcePickNew) {
        if (typeof window.showDirectoryPicker !== 'function') {
            const fallbackInp = document.getElementById('pcUploadToSubirInput');
            if (fallbackInp && typeof fallbackInp.click === 'function') {
                fallbackInp.click();
                return [];
            }
            showAssignFeedback('ℹ️ Usa "+ Foto" para agregar imágenes a SUBIR PREN.', false);
            return [];
        }

        try {
            let dirHandle = forcePickNew ? null : await readSavedSubirPrenDirHandle();
            if (dirHandle) {
                let perm = 'granted';
                if (typeof dirHandle.queryPermission === 'function') {
                    perm = await dirHandle.queryPermission({ mode: 'read' });
                }
                if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') {
                    perm = await dirHandle.requestPermission({ mode: 'read' });
                }
                if (perm !== 'granted') {
                    dirHandle = null;
                }
            }

            if (!dirHandle) {
                dirHandle = await window.showDirectoryPicker({ id: 'creata_subir_pren_pc', mode: 'read' });
                if (!dirHandle) return [];
                await writeSavedSubirPrenDirHandle(dirHandle);
            }

            updateSubirPrenLocalBadgeUi(String(dirHandle.name || 'SUBIR PREN'));
            const collected = await collectImageFilesFromDirHandle(dirHandle, 0);
            if (!collected.length) {
                await window.refreshInboxOnly(false);
                showAssignFeedback('ℹ️ Carpeta "' + escapeHtml(dirHandle.name || 'SUBIR PREN') + '" vacía.', true);
                return [];
            }
            return await ingestLocalSubirPrenFilesDeduped(collected, dirHandle.name || 'SUBIR PREN');
        } catch (errPick) {
            if (errPick && (errPick.name === 'AbortError' || /abort/i.test(String(errPick.message || '')))) {
                return [];
            }
            const fallbackInp = document.getElementById('pcUploadToSubirInput');
            if (fallbackInp && typeof fallbackInp.click === 'function') {
                fallbackInp.click();
            }
            return [];
        }
    };

    async function readDroppedEntriesRecursive(entry, depth) {
        const out = [];
        if (!entry) return out;
        const curDepth = typeof depth === 'number' ? depth : 0;
        if (entry.isFile && typeof entry.file === 'function') {
            const f = await new Promise((resolve) => entry.file(resolve, () => resolve(null)));
            if (f) out.push(f);
        } else if (entry.isDirectory && curDepth < 2 && typeof entry.createReader === 'function') {
            const reader = entry.createReader();
            const readBatch = () => new Promise((resolve) => reader.readEntries((arr) => resolve(arr || []), () => resolve([])));
            let batch = await readBatch();
            while (batch.length > 0) {
                for (let i = 0; i < batch.length; i++) {
                    const nested = await readDroppedEntriesRecursive(batch[i], curDepth + 1);
                    for (let n = 0; n < nested.length; n++) out.push(nested[n]);
                }
                batch = await readBatch();
            }
        }
        return out;
    }

    function bindSubirPrenDragAndDrop() {
        const card = document.getElementById('secGalleryInbox');
        if (!card) return;
        card.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            card.classList.add('is-drop-active');
        });
        card.addEventListener('dragleave', (ev) => {
            if (!ev.relatedTarget || (typeof card.contains === 'function' && !card.contains(ev.relatedTarget))) {
                card.classList.remove('is-drop-active');
            }
        });
        card.addEventListener('drop', async (ev) => {
            ev.preventDefault();
            card.classList.remove('is-drop-active');
            const dt = ev.dataTransfer;
            if (!dt) return;
            const gathered = [];
            if (dt.items && dt.items.length && typeof dt.items[0].webkitGetAsEntry === 'function') {
                for (let i = 0; i < dt.items.length; i++) {
                    const entry = dt.items[i].webkitGetAsEntry();
                    if (entry) {
                        const sub = await readDroppedEntriesRecursive(entry, 0);
                        for (let s = 0; s < sub.length; s++) gathered.push(sub[s]);
                    }
                }
            }
            if (!gathered.length && dt.files && dt.files.length) {
                for (let f = 0; f < dt.files.length; f++) gathered.push(dt.files[f]);
            }
            if (gathered.length > 0) {
                await ingestLocalSubirPrenFilesDeduped(gathered, 'SUBIR PREN');
            }
        });

        // Arrastre directo sobre la tarjeta derecha (#secProductStage): sube y guarda al instante
        const stageCard = document.getElementById('secProductStage');
        if (stageCard && !stageCard.__creataStageDropBound) {
            stageCard.__creataStageDropBound = true;
            stageCard.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                stageCard.classList.add('is-stage-drop-active');
            });
            stageCard.addEventListener('dragleave', (ev) => {
                if (!ev.relatedTarget || (typeof stageCard.contains === 'function' && !stageCard.contains(ev.relatedTarget))) {
                    stageCard.classList.remove('is-stage-drop-active');
                }
            });
            stageCard.addEventListener('drop', async (ev) => {
                ev.preventDefault();
                stageCard.classList.remove('is-stage-drop-active');
                const dt = ev.dataTransfer;
                const dropped = (dt && dt.files && dt.files.length)
                    ? Array.from(dt.files).filter(isAcceptedImageFile)
                    : [];
                if (!dropped.length) return;
                if (visualState && visualState.workMode !== 'SKU') {
                    await window.uploadVisualTargetPhotoFile({ files: [dropped[0]] });
                } else {
                    await window.uploadDirectToSelectedCategory({ files: dropped });
                }
            });
        }
    }

    window.uploadDirectToSelectedCategory = async function (inputEl) {
        const rawList = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
        const files = rawList.filter(isAcceptedImageFile);
        if (!files.length) {
            if (rawList.length > 0) {
                showAssignFeedback('⚠️ Selecciona una imagen válida.', false);
            }
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            return;
        }

        try {
            // Si solo se seleccionó 1 archivo y no hay SKU elegido, intentar detectar el SKU por el nombre del archivo
            if (!state.selectedSku && files.length === 1) {
                const autoSku = findSuggestedSkuForFileName(files[0].name);
                if (autoSku && state.productBySku.has(autoSku)) {
                    window.selectSkuProduct(autoSku);
                }
            }

            // Si no hay SKU elegido pero las fotos tienen nombre de SKU, cargarlas al instante y auto-acomodar por categoría
            if (!state.selectedSku) {
                let anyMatched = false;
                for (let i = 0; i < files.length; i++) {
                    if (findSuggestedSkuForFileName(files[i].name)) { anyMatched = true; break; }
                }
                if (!anyMatched) {
                    showAssignFeedback('⚠️ Selecciona un SKU primero.', false);
                    return;
                }
                const stagedBatch = await window.uploadLocalFilesToSubir({ files: files }, { suppressSummaryFeedback: true });
                const uploadedIds = new Set((stagedBatch || []).map((e) => cleanStr(e && (e.realId || e.localId))).filter(Boolean));
                await window.autoAssignMatchedInboxByCategory(false, uploadedIds);
                return;
            }

            // SUBIDA DIRECTA EN 1 SOLO PASO (rápida, conserva nombre exacto, acomoda según Sheets y deselecciona SKU)
            const targetSku = state.selectedSku;
            const prod = state.productBySku.get(targetSku);
            if (!prod) return;

            const targetDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
            const destSelect = document.getElementById('destFolderSelect');
            if (destSelect && targetDestMeta) destSelect.value = targetDestMeta.id;

            const firstFile = files[0];
            const safeFileName = cleanStr(firstFile.name) || ('foto_' + Date.now() + '.jpg');
            const dataUrl = await readFileAsOptimizedDataUrl(firstFile);
            if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(String(dataUrl || ''))) {
                showAssignFeedback('❌ Formato de imagen no compatible (' + escapeHtml(safeFileName) + ').', false);
                return;
            }

            const prevUrlBeforeSave = prod.photoUrl || '';
            const prevFidBeforeSave = prod.photoFileId || '';
            const localId = 'local_dir_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);

            unmarkSkuDeletedInQueue(prod.sku, localId);

            // Actualización optimista inmediata en Fotos y Cotizador (data:image/ visible al instante)
            prod.photoUrl = dataUrl;
            prod.photoFileId = localId;
            prod.inSheet1 = true;
            prod.destFolderId = targetDestMeta.id;
            prod.destFolderName = targetDestMeta.name;

            const logEntry = {
                sku: prod.sku,
                productName: prod.displayName,
                rowNumber: prod.rowNumber || '...',
                previousUrl: prevUrlBeforeSave,
                newUrl: dataUrl,
                fileId: localId,
                fileName: safeFileName,
                destFolderName: targetDestMeta.name,
                destFolderUrl: 'https://drive.google.com/drive/folders/' + targetDestMeta.id,
                localDataUrl: dataUrl,
                ts: Date.now()
            };

            state.sessionSavedBySku.set(prod.sku, logEntry);
            state.sessionSavedLogs = [logEntry].concat(state.sessionSavedLogs.filter((it) => it.sku !== prod.sku));
            saveSavedOverridesNow();

            // Seguridad: limpiar inmediatamente el producto seleccionado para evitar sobrescribir por error
            state.selectedSku = '';
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;

            invalidateLoadedPhotosCache();
            scheduleSaveFastCache();
            renderSkuCategoryFilterRow();
            renderSkuLocationFilterRow();
            applySkuFiltersAndRender();
            renderInboxGallery();
            renderSelectedProductStage();
            updateAssignButtonState();
            saveFotosUiCheckpointNow();

            notifySplitPeerOfPhotoUpdate(prod.sku, dataUrl, localId, targetDestMeta.name);
            showAssignFeedback(
                '⚡ Guardando <strong>' + escapeHtml(prod.sku) + '</strong> → <strong>' + escapeHtml(targetDestMeta.name) + '</strong>...',
                true
            );

            const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (isOfflineNow) {
                await putOfflinePhotoBlobIdb(localId, dataUrl, safeFileName);
                enqueueFotosOfflineOutbox({
                    id: 'op_dir_' + Date.now() + '_' + prod.sku,
                    type: 'direct_upload_assign',
                    sku: prod.sku,
                    fileName: safeFileName,
                    localFileId: localId,
                    productName: prod.displayName,
                    categoria: prod.categoria,
                    tipo: prod.tipo,
                    targetFolderId: targetDestMeta.id,
                    queuedAt: Date.now()
                });
                showAssignFeedback('⚡ En cola offline: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
            } else {
                state.assignInFlight++;
                try {
                    let res = await callWebAppPost('fotos_direct_upload_assign', Object.assign({
                        sku: prod.sku,
                        fileName: safeFileName,
                        dataUrl: dataUrl,
                        productName: prod.displayName,
                        categoria: prod.categoria,
                        tipo: prod.tipo,
                        targetFolderId: targetDestMeta.id
                    }, buildOwnerAuthPayload()), 45000);

                    // Fallback automático si Apps Script aún no se ha republicado con fotos_direct_upload_assign
                    if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                        const upRes = await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                            fileName: safeFileName,
                            dataUrl: dataUrl,
                            skipListReturn: true
                        }, buildOwnerAuthPayload()), 45000);
                        if (upRes && upRes.ok && upRes.file && upRes.file.id) {
                            res = await callWebAppPost('fotos_subir_assign', Object.assign({
                                sku: prod.sku,
                                productName: prod.displayName,
                                categoria: prod.categoria,
                                tipo: prod.tipo,
                                driveFileId: upRes.file.id,
                                fromLoaded: false,
                                targetFolderId: targetDestMeta.id,
                                skipListReturn: true
                            }, buildOwnerAuthPayload()), 30000);
                        } else {
                            res = upRes;
                        }
                    }

                    if (!res || !res.ok) {
                        if (res && res.authRequired) {
                            window.lockFotosPortal();
                            return;
                        }
                        if (res && res.unavailable) {
                            await putOfflinePhotoBlobIdb(localId, dataUrl, safeFileName);
                            enqueueFotosOfflineOutbox({
                                id: 'op_dir_' + Date.now() + '_' + prod.sku,
                                type: 'direct_upload_assign',
                                sku: prod.sku,
                                fileName: safeFileName,
                                localFileId: localId,
                                productName: prod.displayName,
                                categoria: prod.categoria,
                                tipo: prod.tipo,
                                targetFolderId: targetDestMeta.id,
                                queuedAt: Date.now()
                            });
                            showAssignFeedback('⚡ Sin red · en cola: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
                        } else {
                            prod.photoUrl = prevUrlBeforeSave;
                            prod.photoFileId = prevFidBeforeSave;
                            state.sessionSavedBySku.delete(prod.sku);
                            state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it !== logEntry);
                            saveSavedOverridesNow();
                            invalidateLoadedPhotosCache();
                            renderSkuCategoryFilterRow();
                            renderSkuLocationFilterRow();
                            applySkuFiltersAndRender();
                            renderInboxGallery();
                            renderSelectedProductStage();
                            notifySplitPeerOfPhotoUpdate(prod.sku, prevUrlBeforeSave, prevFidBeforeSave, targetDestMeta.name);
                            showAssignFeedback('❌ ' + escapeHtml(cleanStr(res && res.error) || 'Error al subir.'), false);
                        }
                    } else {
                        if (res.newUrl) {
                            prod.photoUrl = res.newUrl;
                            logEntry.newUrl = res.newUrl;
                        }
                        if (res.fileId) {
                            prod.photoFileId = res.fileId;
                            logEntry.fileId = res.fileId;
                            state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || safeFileName);
                        }
                        if (res.rowNumber) {
                            prod.rowNumber = res.rowNumber;
                            logEntry.rowNumber = res.rowNumber;
                        }
                        if (res.destFolderName) {
                            prod.destFolderName = res.destFolderName;
                            logEntry.destFolderName = res.destFolderName;
                        }
                        if (res.destFolderId) {
                            prod.destFolderId = res.destFolderId;
                            logEntry.destFolderUrl = 'https://drive.google.com/drive/folders/' + res.destFolderId;
                        }
                        if (res.fileName) {
                            logEntry.fileName = res.fileName;
                        }
                        if (res.productName && (!prod.colBName || prod.displayName === '—')) {
                            prod.colBName = res.productName;
                            prod.displayName = res.productName;
                            logEntry.productName = res.productName;
                        }
                        notifySplitPeerOfPhotoUpdate(prod.sku, prod.photoUrl, prod.photoFileId, logEntry.destFolderName);
                        recordRecentUploadedPhoto({
                            fileId: prod.photoFileId,
                            viewUrl: prod.photoUrl,
                            fileName: logEntry.fileName || safeFileName,
                            targetKey: prod.sku,
                            targetLabel: prod.displayName || prod.colBName || prod.sku,
                            targetKind: 'SKU',
                            localDataUrl: logEntry.localDataUrl || '',
                            destFolderName: logEntry.destFolderName || '',
                            ts: Date.now()
                        });
                        saveSavedOverridesNow();
                        invalidateLoadedPhotosCache();
                        scheduleSaveFastCache();
                        applySkuFiltersAndRender();
                        renderInboxGallery();
                        showAssignFeedback(
                            '✅ <strong>' + escapeHtml(prod.sku) + '</strong> → <strong>' + escapeHtml(logEntry.destFolderName) + '</strong>.',
                            true
                        );
                    }
                } finally {
                    state.assignInFlight = Math.max(0, state.assignInFlight - 1);
                }
            }

            if (files.length > 1) {
                const stagedRest = await window.uploadLocalFilesToSubir({ files: files.slice(1) }, { suppressSummaryFeedback: true });
                const restIds = new Set((stagedRest || []).map((e) => cleanStr(e && (e.realId || e.localId))).filter(Boolean));
                await window.autoAssignMatchedInboxByCategory(true, restIds);
            }
        } finally {
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
        }
    };

    window.autoAssignMatchedInboxByCategory = async function (silentIfNone, onlyFileIds) {
        if (!state.inboxFiles.length) {
            if (!silentIfNone) showAssignFeedback('ℹ️ Bandeja vacía.', true);
            return;
        }
        const restrictIds = (onlyFileIds instanceof Set && onlyFileIds.size > 0) ? onlyFileIds : null;
        const candidates = [];
        for (let i = 0; i < state.inboxFiles.length; i++) {
            const f = state.inboxFiles[i];
            if (!f || !f.id) continue;
            if (restrictIds && !restrictIds.has(cleanStr(f.id))) continue;
            const sugSku = cleanStr(findSuggestedSkuForFileName(f.name)).toUpperCase();
            if (sugSku && state.productBySku.has(sugSku)) {
                candidates.push({ file: f, sku: sugSku });
            }
        }
        if (!candidates.length) {
            if (!silentIfNone) {
                showAssignFeedback('ℹ️ Selecciona un SKU y toca Guardar.', false);
            }
            return;
        }

        let assignedCount = 0;
        const lastCategories = [];
        for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            const prod = state.productBySku.get(item.sku);
            if (!prod) continue;
            const catDest = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
            prod.destFolderId = catDest.id;
            prod.destFolderName = catDest.name;

            state.selectedSku = prod.sku;
            const destSel = document.getElementById('destFolderSelect');
            if (destSel) destSel.value = catDest.id;

            state.selectedInboxFileId = item.file.id;
            state.selectedPhotoItem = {
                id: item.file.id,
                name: item.file.name,
                shortcutId: cleanStr(item.file.shortcutId),
                viewUrl: item.file.viewUrl || ('https://drive.google.com/file/d/' + item.file.id + '/view?usp=sharing'),
                thumbDataUrl: item.file.thumbDataUrl || '',
                localDataUrl: item.file.localDataUrl || '',
                fromLoaded: false,
                skuOrigin: cleanStr(item.file.skuOrigin)
            };
            await window.assignSelectedPhotoToProduct();
            assignedCount++;
            if (lastCategories.indexOf(catDest.name) === -1) lastCategories.push(catDest.name);
        }

        if (assignedCount > 0) {
            showAssignFeedback(
                '✅ ' + assignedCount + ' guardada(s) (' + escapeHtml(lastCategories.slice(0, 3).join(', ')) + ').',
                true
            );
        }
    };

    window.jumpToFotosSection = function (secId, btnEl, opts) {
        const nextSec = cleanStr(secId) || 'secSkuFinder';
        const prevSec = state.activeMobileSection || 'secSkuFinder';
        const isFromBack = Boolean(opts && opts.fromBack);
        if (!isFromBack && prevSec !== nextSec) {
            if (state.mobileSectionHistory[state.mobileSectionHistory.length - 1] !== prevSec) {
                state.mobileSectionHistory.push(prevSec);
                if (state.mobileSectionHistory.length > 8) {
                    state.mobileSectionHistory.shift();
                }
            }
        }
        state.activeMobileSection = nextSec;
        const el = document.getElementById(nextSec);
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        document.querySelectorAll('#mobileFotosJumpBar .mobile-jump-btn').forEach((b) => {
            b.classList.toggle('active', b === btnEl || b.getAttribute('data-jump') === nextSec);
        });
        if (!isFromBack && prevSec !== nextSec) {
            syncFotosBackNav('mobile_section');
        }
    };

    function isFotosStandaloneInstalled() {
        try {
            if (window.navigator && window.navigator.standalone === true) return true;
            if (window.matchMedia && (
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches
            )) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function syncFotosInstallAppBtn() {
        const btn = document.getElementById('btnInstallFotosApp');
        if (!btn) return;
        if (isFotosStandaloneInstalled()) {
            btn.classList.add('hidden');
        } else {
            btn.classList.remove('hidden');
        }
    }

    window.closeFotosInstallModal = function () {
        const m = document.getElementById('fotosInstallModal');
        if (m) m.classList.add('hidden');
    };

    window.triggerInstallFotosApp = async function () {
        if (_deferredFotosInstallPrompt) {
            try {
                _deferredFotosInstallPrompt.prompt();
                const choice = await _deferredFotosInstallPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    _deferredFotosInstallPrompt = null;
                    const btn = document.getElementById('btnInstallFotosApp');
                    if (btn) btn.classList.add('hidden');
                }
            } catch (e) {}
            return;
        }
        const m = document.getElementById('fotosInstallModal');
        if (m) {
            m.classList.remove('hidden');
            syncFotosBackNav('install_modal');
        } else {
            showAssignFeedback('📲 Menú del navegador → Instalar app.', true);
        }
    };

    window.assignSelectedPhotoToProduct = async function () {
        const prod = state.selectedSku ? state.productBySku.get(state.selectedSku) : null;
        const selPhoto = getActiveSelectedPhotoObject();
        if (!prod || !selPhoto) return;

        // Carpeta siempre auto-resuelta según Sheets (categoría/tipo/nombre del producto)
        const autoDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
        const targetDestMeta = (autoDestMeta && DEST_FOLDER_BY_ID.get(autoDestMeta.id)) || autoDestMeta;
        const targetFolderId = targetDestMeta.id;
        const destSelect = document.getElementById('destFolderSelect');
        if (destSelect && targetFolderId) destSelect.value = targetFolderId;

        let activeFileId = selPhoto.id;
        const isLocalPendingPhoto = String(activeFileId || '').indexOf('local_inb_') === 0;
        const dataUrlPreview = (selPhoto.localDataUrl && String(selPhoto.localDataUrl).indexOf('data:image/') === 0)
            ? String(selPhoto.localDataUrl)
            : '';
        const optimisticUrl = isLocalPendingPhoto
            ? (dataUrlPreview || selPhoto.localDataUrl || selPhoto.thumbDataUrl || selPhoto.viewUrl || '')
            : (selPhoto.viewUrl || ('https://drive.google.com/file/d/' + activeFileId + '/view?usp=sharing'));
        const peerPreviewUrl = dataUrlPreview || optimisticUrl;
        const prevUrlBeforeSave = prod.photoUrl || '';
        const prevFidBeforeSave = prod.photoFileId || '';

        unmarkSkuDeletedInQueue(prod.sku, activeFileId);

        // ACTUALIZACIÓN OPTIMISTA INSTANTÁNEA (0ms de espera en UI)
        prod.photoUrl = optimisticUrl;
        prod.photoFileId = activeFileId;
        prod.inSheet1 = true;
        prod.destFolderId = targetDestMeta.id;
        prod.destFolderName = targetDestMeta.name;

        const logEntry = {
            sku: prod.sku,
            productName: prod.displayName,
            rowNumber: prod.rowNumber || '...',
            previousUrl: prevUrlBeforeSave,
            newUrl: optimisticUrl,
            fileId: activeFileId,
            fileName: selPhoto.name,
            destFolderName: targetDestMeta.name,
            destFolderUrl: 'https://drive.google.com/drive/folders/' + targetDestMeta.id,
            localDataUrl: dataUrlPreview || selPhoto.localDataUrl || selPhoto.thumbDataUrl || '',
            ts: Date.now()
        };

        state.sessionSavedBySku.set(prod.sku, logEntry);
        state.sessionSavedLogs = [logEntry].concat(state.sessionSavedLogs.filter((it) => it.sku !== prod.sku));
        saveSavedOverridesNow();

        if (!selPhoto.fromLoaded) {
            state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== activeFileId);
            state.inboxFiles = state.inboxFiles.filter((f) => f.id !== activeFileId);
            state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== activeFileId);
        }

        // Seguridad: quitar selección del producto y de la foto inmediatamente al guardar
        state.selectedSku = '';
        state.selectedInboxFileId = '';
        state.selectedPhotoItem = null;

        invalidateLoadedPhotosCache();
        scheduleSaveFastCache();
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        renderInboxGallery();
        renderSelectedProductStage();
        updateAssignButtonState();
        saveFotosUiCheckpointNow();

        notifySplitPeerOfPhotoUpdate(prod.sku, peerPreviewUrl, activeFileId, targetDestMeta.name);

        showAssignFeedback(
            '⚡ <strong>' + escapeHtml(prod.sku) + '</strong> → <strong>' + escapeHtml(targetDestMeta.name) + '</strong>',
            true
        );

        // Si la foto aún se está subiendo a Drive en segundo plano, esperar su promesa en segundo plano sin bloquear la pantalla
        let pendingUploadRes = null;
        if (isLocalPendingPhoto && pendingUploadPromises.has(activeFileId)) {
            try {
                pendingUploadRes = await pendingUploadPromises.get(activeFileId);
                if (pendingUploadRes && pendingUploadRes.ok && pendingUploadRes.realId) {
                    const oldLocalId = activeFileId;
                    activeFileId = pendingUploadRes.realId;
                    prod.photoFileId = activeFileId;
                    logEntry.fileId = activeFileId;
                    if (pendingUploadRes.dataUrl) {
                        logEntry.localDataUrl = pendingUploadRes.dataUrl;
                    }
                    if (pendingUploadRes.file && pendingUploadRes.file.viewUrl) {
                        prod.photoUrl = pendingUploadRes.file.viewUrl;
                        logEntry.newUrl = pendingUploadRes.file.viewUrl;
                    } else if (pendingUploadRes.dataUrl) {
                        prod.photoUrl = pendingUploadRes.dataUrl;
                        logEntry.newUrl = pendingUploadRes.dataUrl;
                    }
                    state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== oldLocalId && f.id !== activeFileId);
                    state.inboxFiles = state.inboxFiles.filter((f) => f.id !== oldLocalId && f.id !== activeFileId);
                    if (pendingUploadRes.dataUrl) {
                        notifySplitPeerOfPhotoUpdate(prod.sku, pendingUploadRes.dataUrl, activeFileId, targetDestMeta.name);
                    }
                } else if (pendingUploadRes && pendingUploadRes.offlineQueued && pendingUploadRes.dataUrl) {
                    logEntry.localDataUrl = pendingUploadRes.dataUrl;
                    if (String(prod.photoUrl || '').indexOf('blob:') === 0) {
                        prod.photoUrl = pendingUploadRes.dataUrl;
                        logEntry.newUrl = pendingUploadRes.dataUrl;
                    }
                } else if (pendingUploadRes && !pendingUploadRes.ok && !pendingUploadRes.offlineQueued) {
                    prod.photoUrl = prevUrlBeforeSave;
                    prod.photoFileId = prevFidBeforeSave;
                    state.sessionSavedBySku.delete(prod.sku);
                    state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it !== logEntry);
                    saveSavedOverridesNow();
                    invalidateLoadedPhotosCache();
                    renderSkuCategoryFilterRow();
                    renderSkuLocationFilterRow();
                    applySkuFiltersAndRender();
                    renderInboxGallery();
                    renderSelectedProductStage();
                    notifySplitPeerOfPhotoUpdate(prod.sku, prevUrlBeforeSave, prevFidBeforeSave, targetDestMeta.name);
                    if (pendingUploadRes.authRequired) {
                        window.lockFotosPortal();
                    } else {
                        showAssignFeedback('❌ ' + escapeHtml(cleanStr(pendingUploadRes.error) || 'Error al subir.'), false);
                    }
                    return;
                }
            } catch (eWait) {}
        }

        const stillLocalId = String(activeFileId || '').indexOf('local_inb_') === 0;
        const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (stillLocalId || isOfflineNow) {
            enqueueFotosOfflineOutbox({
                id: 'op_as_' + Date.now() + '_' + prod.sku,
                type: 'assign_photo',
                sku: prod.sku,
                productName: prod.displayName,
                categoria: prod.categoria,
                tipo: prod.tipo,
                driveFileId: activeFileId,
                shortcutId: cleanStr(selPhoto.shortcutId),
                fromLoaded: !!selPhoto.fromLoaded,
                targetFolderId: targetFolderId,
                queuedAt: Date.now()
            });
            showAssignFeedback('⚡ En cola offline: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
            return;
        }

        state.assignInFlight++;
        try {
            const res = await callWebAppPost('fotos_subir_assign', Object.assign({
                sku: prod.sku,
                productName: prod.displayName,
                categoria: prod.categoria,
                tipo: prod.tipo,
                driveFileId: activeFileId,
                shortcutId: cleanStr(selPhoto.shortcutId),
                fromLoaded: !!selPhoto.fromLoaded,
                targetFolderId: targetFolderId,
                skipListReturn: true
            }, buildOwnerAuthPayload()), 30000);

            if (!res || !res.ok) {
                if (res && res.authRequired) {
                    window.lockFotosPortal();
                    return;
                }
                if (res && res.unavailable) {
                    enqueueFotosOfflineOutbox({
                        id: 'op_as_' + Date.now() + '_' + prod.sku,
                        type: 'assign_photo',
                        sku: prod.sku,
                        productName: prod.displayName,
                        categoria: prod.categoria,
                        tipo: prod.tipo,
                        driveFileId: activeFileId,
                        shortcutId: cleanStr(selPhoto.shortcutId),
                        fromLoaded: !!selPhoto.fromLoaded,
                        targetFolderId: targetFolderId,
                        queuedAt: Date.now()
                    });
                    showAssignFeedback('⚡ Sin red · en cola: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
                    return;
                }
                prod.photoUrl = prevUrlBeforeSave;
                prod.photoFileId = prevFidBeforeSave;
                state.sessionSavedBySku.delete(prod.sku);
                state.sessionSavedLogs = state.sessionSavedLogs.filter((it) => it !== logEntry);
                saveSavedOverridesNow();
                invalidateLoadedPhotosCache();
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                notifySplitPeerOfPhotoUpdate(prod.sku, prevUrlBeforeSave, prevFidBeforeSave, targetDestMeta.name);
                showAssignFeedback('❌ ' + escapeHtml(cleanStr(res && res.error) || 'Error al guardar.'), false);
                return;
            }

            if (res.newUrl) {
                prod.photoUrl = res.newUrl;
                logEntry.newUrl = res.newUrl;
            }
            if (res.fileId) {
                prod.photoFileId = res.fileId;
                logEntry.fileId = res.fileId;
                state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || selPhoto.name);
            }
            if (res.fileName) {
                logEntry.fileName = res.fileName;
            }
            if (res.destFolderName) {
                prod.destFolderName = res.destFolderName;
                logEntry.destFolderName = res.destFolderName;
            }
            if (res.destFolderId) {
                prod.destFolderId = res.destFolderId;
                logEntry.destFolderUrl = 'https://drive.google.com/drive/folders/' + res.destFolderId;
            }
            if (res.rowNumber) {
                prod.rowNumber = res.rowNumber;
                logEntry.rowNumber = res.rowNumber;
            }
            if (res.productName && (!prod.colBName || prod.displayName === '—')) {
                prod.colBName = res.productName;
                prod.displayName = res.productName;
                logEntry.productName = res.productName;
            }

            notifySplitPeerOfPhotoUpdate(prod.sku, prod.photoUrl, prod.photoFileId, logEntry.destFolderName);
            recordRecentUploadedPhoto({
                fileId: prod.photoFileId || activeFileId,
                viewUrl: prod.photoUrl,
                fileName: logEntry.fileName || (selPhoto && selPhoto.name) || '',
                targetKey: prod.sku,
                targetLabel: prod.displayName || prod.colBName || prod.sku,
                targetKind: 'SKU',
                localDataUrl: logEntry.localDataUrl || '',
                destFolderName: logEntry.destFolderName || '',
                ts: Date.now()
            });
            saveSavedOverridesNow();
            invalidateLoadedPhotosCache();
            scheduleSaveFastCache();
            applySkuFiltersAndRender();
            renderInboxGallery();
            if (state.selectedSku === prod.sku) {
                renderSelectedProductStage();
            }
            showAssignFeedback(
                '✅ Fila ' + escapeHtml(logEntry.rowNumber) + ' → <strong>' + escapeHtml(logEntry.destFolderName) + '</strong>.',
                true
            );
        } finally {
            state.assignInFlight = Math.max(0, state.assignInFlight - 1);
        }
    };

    function renderSessionHistoryLog() {
        // Historial inferior eliminado por solicitud del usuario
        return;
    }

    function upsertProductFromCotizadorPeer(skuRaw, meta) {
        const sku = cleanStr(skuRaw).toUpperCase().replace(/\s+/g, '');
        if (!sku) return null;
        const m = (meta && typeof meta === 'object') ? meta : null;
        const existing = state.productBySku.get(sku);

        if (existing) {
            if (m && Array.isArray(m.st)) {
                const stArr = normalizeStocksArray(m.st);
                const totals = computeStockTotals(stArr);
                const locMeta = buildActiveLocationsMeta(stArr);
                existing.st = stArr;
                existing.hasStocksLoaded = true;
                existing.totalBodegaPiso = totals.totalBodegaPiso;
                existing.lpptStock = totals.lpptStock;
                existing.locSummary = locMeta.locSummary;
                existing.locSearchTokens = locMeta.locSearchTokens;
                existing.inInv = true;
                if (m.pr) existing.precio = formatListPriceText(m.pr) || existing.precio;
                if (m.fe && m.fe !== 'Sin piezas solicitadas') existing.fe = cleanStr(m.fe);
            }
            return existing;
        }

        const displayName = (m && cleanStr(m.n)) || sku;
        const categoria = (m && cleanStr(m.c)) || '';
        const tipo = (m && cleanStr(m.tp)) || '';
        const modelo = (m && cleanStr(m.mo)) || '';
        const variante = (m && cleanStr(m.vr)) || '';
        const medidas = (m && cleanStr(m.m)) || '';
        const acabado = (m && cleanStr(m.acabado)) || '';
        const photoUrl = m ? cleanPhotoUrl(m.f) : '';
        const photoFid = extractDriveFileId(photoUrl);
        const dest = resolveCategoryDestFolderForProduct(categoria, tipo, displayName);
        const stArr = (m && Array.isArray(m.st)) ? normalizeStocksArray(m.st) : emptyFotosStocks();
        const totals = computeStockTotals(stArr);
        const locMeta = buildActiveLocationsMeta(stArr);
        const searchSkuNorm = normalizeSearchText(sku);
        const searchNameNorm = normalizeSearchText(
            displayName + ' ' + categoria + ' ' + tipo + ' ' + modelo + ' ' + variante + ' ' +
            medidas + ' ' + acabado + ' ' + dest.name + ' ' + locMeta.locSearchTokens
        );
        const item = {
            sku: sku,
            colBName: displayName === sku ? '' : displayName,
            displayName: displayName,
            photoUrl: photoUrl,
            photoFileId: photoFid,
            rowNumber: null,
            inSheet1: !!photoUrl,
            inInv: !!(m && Array.isArray(m.st)),
            categoria: categoria,
            tipo: tipo,
            modelo: modelo,
            variante: variante,
            tl: (m && cleanStr(m.tl)) || '',
            ct: (m && cleanStr(m.ct)) || '',
            md: (m && cleanStr(m.md)) || '',
            cm: (m && cleanStr(m.cm)) || '',
            proveedor: (m && cleanStr(m.p || m.proveedor)) || '',
            medidas: medidas,
            acabado: acabado,
            st: stArr,
            hasStocksLoaded: !!(m && Array.isArray(m.st)),
            totalBodegaPiso: totals.totalBodegaPiso,
            lpptStock: totals.lpptStock,
            locSummary: locMeta.locSummary,
            locSearchTokens: locMeta.locSearchTokens,
            precio: m ? formatListPriceText(m.pr) : '',
            fe: (m && m.fe && m.fe !== 'Sin piezas solicitadas') ? cleanStr(m.fe) : '',
            destFolderId: dest.id,
            destFolderName: dest.name,
            searchSkuNorm: searchSkuNorm,
            searchNameNorm: searchNameNorm,
            searchNorm: (searchSkuNorm + ' ' + searchNameNorm).trim()
        };
        state.products.unshift(item);
        state.productBySku.set(sku, item);
        return item;
    }

    window.useNewManualSku = function (skuRaw) {
        const sku = cleanStr(skuRaw).toUpperCase().replace(/\s+/g, '');
        if (!sku) return;
        if (!state.productBySku.has(sku)) {
            upsertProductFromCotizadorPeer(sku, null);
        }
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        applySkuFiltersAndRender();
        window.selectSkuProduct(sku);
    };

    window.syncSkusNow = async function (querySkuOpt) {
        if (state.syncSkusInFlight) return;
        state.syncSkusInFlight = true;

        const btnHdr = document.getElementById('btnHeaderSyncSkus');
        const btnCard = document.getElementById('btnSyncSkusCard');
        const origHdr = btnHdr ? btnHdr.textContent : '↻ SKUs';
        const origCard = btnCard ? btnCard.textContent : '↻ SKUs';

        if (btnHdr) { btnHdr.disabled = true; btnHdr.textContent = '↻...'; }
        if (btnCard) { btnCard.disabled = true; btnCard.textContent = '↻...'; }
        hideAssignFeedback();

        try {
            const qSku = cleanStr(querySkuOpt || '').toUpperCase();
            let res = await callWebAppPost('fotos_sync_skus', Object.assign({
                querySku: qSku
            }, buildOwnerAuthPayload()), 40000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                res = await callWebAppPost('inv_erp_sync_now', buildOwnerAuthPayload(), 40000);
            }

            await loadSheetsCatalog();

            if (qSku && state.productBySku.has(qSku)) {
                window.selectSkuProduct(qSku);
            }

            const added1 = Number((res && (res.hoja1Added || res.hoja1SkusAdded)) || 0);
            const addedInv = Number((res && (res.invAdded || res.newSkusAdded)) || 0);
            const total1 = state.products.length;
            if (added1 > 0 || addedInv > 0) {
                showAssignFeedback('✅ SKUs actualizados (+' + Math.max(added1, addedInv) + ' nuevos · ' + total1.toLocaleString('es-MX') + ').', true);
            } else {
                showAssignFeedback('✅ SKUs al día (' + total1.toLocaleString('es-MX') + ').', true);
            }
        } catch (errSync) {
            showAssignFeedback('❌ ' + escapeHtml(errSync && errSync.message ? errSync.message : String(errSync)), false);
        } finally {
            state.syncSkusInFlight = false;
            if (btnHdr) { btnHdr.disabled = false; btnHdr.textContent = origHdr; }
            if (btnCard) { btnCard.disabled = false; btnCard.textContent = origCard; }
        }
    };

    window.refreshAllPhotoWorkspace = async function (manualRefresh) {
        if (!state.unlocked) return;
        const btnRef = document.getElementById('btnHeaderRefreshFotos');
        const origTxt = btnRef ? btnRef.textContent : '↻ Actualizar';
        if (btnRef) { btnRef.disabled = true; btnRef.textContent = '↻...'; }
        try {
            await flushFotosOfflineOutbox();
            const tasks = [
                loadSheetsCatalog(),
                window.refreshInboxOnly(false)
            ];
            if (typeof syncVisualOverridesFromCloudInFotos === 'function') {
                tasks.push(syncVisualOverridesFromCloudInFotos());
            }
            await Promise.all(tasks);
            if (manualRefresh) {
                const loadedCount = getLoadedPhotosList().length;
                showAssignFeedback(
                    '✅ ' + state.products.length.toLocaleString('es-MX') + ' SKUs · ' +
                    loadedCount.toLocaleString('es-MX') + ' cargadas · ' +
                    state.inboxFiles.length + ' bandeja.',
                    true
                );
            }
        } finally {
            if (btnRef) { btnRef.disabled = false; btnRef.textContent = origTxt; }
        }
    };

    window.reorganizeAndRepairFotosNow = async function () {
        if (!state.unlocked || state.repairInFlight) return;
        state.repairInFlight = true;
        const btn = document.getElementById('btnRepairReorganizeFotos');
        const origTxt = btn ? btn.textContent : '🔧 Reparar';
        if (btn) { btn.disabled = true; btn.textContent = '🔧 ...'; }
        showAssignFeedback('🔧 Reubicando fotos según Sheets y abriendo permisos públicos en Drive...', true);

        let totalChecked = 0;
        let totalMoved = 0;
        let totalPublicFixed = 0;
        let startIndex = 0;
        let lastRemaining = 0;
        let fallbackUsed = false;

        try {
            for (let batch = 0; batch < 80; batch++) {
                if (btn) btn.textContent = '🔧 ' + (batch + 1) + '...';
                const res = await callWebAppPost('fotos_reorganize_from_sheets', Object.assign({
                    startIndex: startIndex,
                    maxFiles: 60,
                    maxItems: 60,
                    repairPublic: batch === 0
                }, buildOwnerAuthPayload()), 55000);

                if (res && res.authRequired) {
                    window.lockFotosPortal();
                    return;
                }

                if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                    fallbackUsed = true;
                    const fbRes = await callWebAppPost('inv_repair_photo_permissions', buildOwnerAuthPayload(), 55000);
                    if (fbRes && fbRes.ok) {
                        totalPublicFixed += Number(fbRes.fixed || fbRes.updated || 0);
                        totalChecked += Number(fbRes.checked || fbRes.total || 0);
                    }
                    break;
                }

                if (!res || !res.ok) {
                    showAssignFeedback('❌ ' + escapeHtml(cleanStr(res && res.error) || 'No se pudo reparar/reubicar.'), false);
                    return;
                }

                totalChecked += Number(res.filesChecked != null ? res.filesChecked : (res.checked || 0));
                totalMoved += Number(res.filesMoved != null ? res.filesMoved : (res.moved || 0));
                totalPublicFixed += Number(
                    res.publicFixed != null
                        ? res.publicFixed
                        : ((Number(res.filesMadePublic) || 0) + (Number(res.foldersPublicUpdated) || 0) + (Number(res.visualOverridesPublic) || 0))
                );

                const remaining = Number(res.remaining || 0);
                lastRemaining = remaining;
                const nextIdx = Number(res.nextStartIndex != null ? res.nextStartIndex : (res.nextIndex || 0));
                if (remaining <= 0 || !nextIdx || nextIdx <= startIndex) {
                    lastRemaining = Math.max(0, remaining);
                    break;
                }
                startIndex = nextIdx;
            }

            await window.refreshAllPhotoWorkspace(false);
            if (fallbackUsed) {
                showAssignFeedback(
                    '✅ Permisos públicos reparados (' + totalPublicFixed + ' fotos). Publica el Apps Script nuevo para habilitar reubicación automática por lotes.',
                    true
                );
            } else {
                const remNote = lastRemaining > 0
                    ? (' · Quedan ' + lastRemaining + ' pendientes (toca 🔧 Reparar otra vez para continuar).')
                    : '.';
                showAssignFeedback(
                    '✅ ' + totalChecked + ' revisadas · ' + totalMoved + ' reubicadas · ' + totalPublicFixed + ' públicas' + remNote,
                    true
                );
            }
        } catch (errRep) {
            showAssignFeedback('❌ ' + escapeHtml(errRep && errRep.message ? errRep.message : String(errRep)), false);
        } finally {
            state.repairInFlight = false;
            if (btn) { btn.disabled = false; btn.textContent = origTxt; }
        }
    };

    window.openPhotoLightbox = function (url) {
        const clean = cleanStr(url);
        if (!clean) return;
        const box = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImg');
        if (!box || !img) return;
        img.src = clean;
        box.classList.remove('hidden');
        state.lightboxOpen = true;
        state.lightboxUrl = clean.indexOf('data:') === 0 ? '' : clean;
        saveFotosUiCheckpointNow();
        syncFotosBackNav('lightbox');
    };

    window.closePhotoLightbox = function () {
        const box = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImg');
        if (box) box.classList.add('hidden');
        if (img) img.src = '';
        state.lightboxOpen = false;
        if (state.lightboxUrl) {
            state.lightboxUrl = '';
            saveFotosUiCheckpointNow();
        }
    };

    // =========================================================================
    // PERSISTENCIA ("DÓNDE ME QUEDÉ") + INDEXEDDB + COLA OFFLINE DE FOTOS
    // =========================================================================
    function openFotosOfflineIdb() {
        return new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') { resolve(null); return; }
            try {
                const req = indexedDB.open(FOTOS_OFFLINE_IDB_NAME, 1);
                req.onupgradeneeded = function (ev) {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains(FOTOS_OFFLINE_IDB_STORE)) {
                        db.createObjectStore(FOTOS_OFFLINE_IDB_STORE, { keyPath: 'id' });
                    }
                };
                req.onsuccess = function (ev) { resolve(ev.target.result); };
                req.onerror = function () { resolve(null); };
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function putOfflinePhotoBlobIdb(recordOrId, optDataUrl, optFileName) {
        let record = recordOrId;
        if (typeof recordOrId === 'string') {
            record = {
                id: recordOrId,
                dataUrl: String(optDataUrl || ''),
                fileName: String(optFileName || 'foto.jpg'),
                sizeBytes: String(optDataUrl || '').length,
                createdAt: Date.now()
            };
        }
        const db = await openFotosOfflineIdb();
        if (!db || !record || !record.id) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(FOTOS_OFFLINE_IDB_STORE, 'readwrite');
                tx.objectStore(FOTOS_OFFLINE_IDB_STORE).put(record);
                tx.oncomplete = () => { db.close(); resolve(true); };
                tx.onerror = () => { db.close(); resolve(false); };
            } catch (e) {
                try { db.close(); } catch (e2) {}
                resolve(false);
            }
        });
    }

    async function getOfflinePhotoBlobIdb(id) {
        const db = await openFotosOfflineIdb();
        if (!db || !id) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(FOTOS_OFFLINE_IDB_STORE, 'readonly');
                const req = tx.objectStore(FOTOS_OFFLINE_IDB_STORE).get(id);
                req.onsuccess = () => { db.close(); resolve(req.result || null); };
                req.onerror = () => { db.close(); resolve(null); };
            } catch (e) {
                try { db.close(); } catch (e2) {}
                resolve(null);
            }
        });
    }

    async function deleteOfflinePhotoBlobIdb(id) {
        const db = await openFotosOfflineIdb();
        if (!db || !id) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(FOTOS_OFFLINE_IDB_STORE, 'readwrite');
                tx.objectStore(FOTOS_OFFLINE_IDB_STORE).delete(id);
                tx.oncomplete = () => { db.close(); resolve(true); };
                tx.onerror = () => { db.close(); resolve(false); };
            } catch (e) {
                try { db.close(); } catch (e2) {}
                resolve(false);
            }
        });
    }

    async function getAllOfflinePhotoBlobsIdb() {
        const db = await openFotosOfflineIdb();
        if (!db) return [];
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(FOTOS_OFFLINE_IDB_STORE, 'readonly');
                const req = tx.objectStore(FOTOS_OFFLINE_IDB_STORE).getAll();
                req.onsuccess = () => { db.close(); resolve(Array.isArray(req.result) ? req.result : []); };
                req.onerror = () => { db.close(); resolve([]); };
            } catch (e) {
                try { db.close(); } catch (e2) {}
                resolve([]);
            }
        });
    }

    function readFotosOfflineOutbox() {
        try {
            const raw = localStorage.getItem(FOTOS_OFFLINE_OUTBOX_STORAGE);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function updateOfflineSyncBanner() {
        const bar = document.getElementById('offlineSyncStatusBar');
        const txt = document.getElementById('offlineSyncStatusText');
        const btn = document.getElementById('btnOfflineSyncNow');
        if (!bar || !txt) return;
        const isOff = typeof navigator !== 'undefined' && navigator.onLine === false;
        const queueLen = readFotosOfflineOutbox().length;
        if (!isOff && queueLen === 0) {
            bar.classList.add('hidden');
            bar.classList.remove('is-online-pending');
            if (btn) btn.classList.add('hidden');
            return;
        }
        bar.classList.remove('hidden');
        if (isOff) {
            bar.classList.remove('is-online-pending');
            txt.textContent = queueLen > 0
                ? ('📡 Sin conexión · ' + queueLen + ' foto(s) guardada(s) en teléfono para subir al volver la señal')
                : '📡 Sin conexión · Puedes seguir subiendo fotos (se guardan en tu teléfono)';
            if (btn) btn.classList.add('hidden');
        } else {
            bar.classList.add('is-online-pending');
            txt.textContent = _fotosFlushingOutbox
                ? ('⏳ Subiendo ' + queueLen + ' foto(s) guardada(s) en teléfono...')
                : ('⏳ ' + queueLen + ' foto(s) pendiente(s) en teléfono lista(s) para sincronizar');
            if (btn) {
                btn.classList.toggle('hidden', !!_fotosFlushingOutbox);
                btn.disabled = !!_fotosFlushingOutbox;
            }
        }
    }

    function writeFotosOfflineOutbox(arr) {
        try {
            localStorage.setItem(FOTOS_OFFLINE_OUTBOX_STORAGE, JSON.stringify((arr || []).slice(-120)));
        } catch (e) {}
        updateOfflineSyncBanner();
    }

    function enqueueFotosOfflineOutbox(entry) {
        const q = readFotosOfflineOutbox();
        if (entry && entry.type === 'visual_override_upload' && entry.overrideKey) {
            for (let i = q.length - 1; i >= 0; i--) {
                if (q[i] && q[i].type === 'visual_override_upload' && q[i].overrideKey === entry.overrideKey) {
                    if (q[i].localFileId && q[i].localFileId !== entry.localFileId) {
                        deleteOfflinePhotoBlobIdb(q[i].localFileId);
                    }
                    q.splice(i, 1);
                }
            }
        } else if (entry && entry.type === 'direct_upload_assign' && entry.sku) {
            for (let i = q.length - 1; i >= 0; i--) {
                if (q[i] && q[i].type === 'direct_upload_assign' && q[i].sku === entry.sku) {
                    if (q[i].localFileId && q[i].localFileId !== entry.localFileId) {
                        deleteOfflinePhotoBlobIdb(q[i].localFileId);
                    }
                    q.splice(i, 1);
                }
            }
        }
        q.push(entry);
        writeFotosOfflineOutbox(q);
    }

    function removeOutboxEntriesForLocalFileId(localId) {
        const q = readFotosOfflineOutbox().filter((it) => {
            if (!it) return false;
            if (it.localFileId === localId || it.driveFileId === localId) return false;
            return true;
        });
        writeFotosOfflineOutbox(q);
    }

    async function hydrateOfflinePendingPhotos() {
        updateOfflineSyncBanner();
        try {
            const blobs = await getAllOfflinePhotoBlobsIdb();
            if (!blobs.length) return;
            const blobById = new Map(blobs.map((b) => [b.id, b]));
            let changed = false;
            let visualChanged = false;

            const queue = readFotosOfflineOutbox();
            const assignedLocalIds = new Set(
                queue
                    .filter((it) => it && (it.type === 'assign_photo' || it.type === 'direct_upload_assign' || it.type === 'visual_override_upload'))
                    .map((it) => it.driveFileId || it.localFileId)
            );

            for (let i = 0; i < blobs.length; i++) {
                const b = blobs[i];
                if (!b || !b.id || !b.dataUrl) continue;
                const isDirectBlob = String(b.id).indexOf('local_dir_') === 0 || String(b.id).indexOf('local_vis_') === 0;
                if (!isDirectBlob && !assignedLocalIds.has(b.id) && !state.inboxFiles.some((f) => f.id === b.id)) {
                    const localItem = enrichInboxFileItem({
                        id: b.id,
                        name: b.fileName || 'Foto pendiente',
                        sizeBytes: b.sizeBytes || 0,
                        updatedAt: new Date(b.createdAt || Date.now()).toISOString(),
                        viewUrl: b.dataUrl,
                        localDataUrl: b.dataUrl,
                        isOfflinePending: true
                    });
                    state.rawInboxFromDrive.unshift(localItem);
                    state.inboxFiles.unshift(localItem);
                    changed = true;
                }
            }

            state.inboxFiles.forEach((f) => {
                if (f && String(f.id || '').indexOf('local_inb_') === 0 && !f.localDataUrl && blobById.has(f.id)) {
                    const b = blobById.get(f.id);
                    f.localDataUrl = b.dataUrl;
                    f.viewUrl = b.dataUrl;
                    changed = true;
                }
            });

            state.sessionSavedLogs.forEach((log) => {
                const isLocalLog = log && (String(log.fileId || '').indexOf('local_inb_') === 0 || String(log.fileId || '').indexOf('local_dir_') === 0);
                if (isLocalLog && !log.localDataUrl && blobById.has(log.fileId)) {
                    const b = blobById.get(log.fileId);
                    log.localDataUrl = b.dataUrl;
                    log.newUrl = b.dataUrl;
                    const prod = state.productBySku.get(log.sku);
                    if (prod && (prod.photoFileId === log.fileId || !prod.photoUrl)) {
                        prod.photoUrl = b.dataUrl;
                        prod.photoFileId = log.fileId;
                    }
                    changed = true;
                }
            });

            // Rehidratar también Portadas y Telas pendientes guardadas en IndexedDB sin red
            queue.forEach((entry) => {
                if (!entry || entry.type !== 'visual_override_upload' || !entry.overrideKey) return;
                const ovKey = String(entry.overrideKey).trim().toUpperCase();
                const b = (entry.localFileId && blobById.get(entry.localFileId)) ||
                    (entry.sourceInboxFileId && blobById.get(entry.sourceInboxFileId)) || null;
                const previewUrl = (b && b.dataUrl) || entry.directUrl || '';
                if (!previewUrl) return;
                const cur = visualState.overridesMap[ovKey];
                if (!cur || !cur.note || isLocalTempPhotoId(cur.note)) {
                    visualState.overridesMap[ovKey] = {
                        sku: ovKey,
                        status: 'VISIBLE',
                        name: cleanStr(entry.label || ovKey).slice(0, 140),
                        category: entry.categoryTag || (ovKey.indexOf('VFAB:') === 0 ? 'FABRIC_SWATCH' : (ovKey.indexOf('VWOD:') === 0 ? 'WOOD_SWATCH' : 'VISUAL_COVER')),
                        price: null,
                        note: previewUrl,
                        localFileId: entry.localFileId || '',
                        updatedBy: OWNER_EMAIL,
                        updatedAt: new Date(entry.queuedAt || Date.now()).toLocaleString('es-MX')
                    };
                    visualChanged = true;
                }
            });

            if (state.selectedPhotoItem && String(state.selectedPhotoItem.id || '').indexOf('local_inb_') === 0 && !state.selectedPhotoItem.localDataUrl) {
                const b = blobById.get(state.selectedPhotoItem.id);
                if (b && b.dataUrl) {
                    state.selectedPhotoItem.localDataUrl = b.dataUrl;
                    state.selectedPhotoItem.viewUrl = b.dataUrl;
                    changed = true;
                }
            }

            if ((changed || visualChanged) && state.unlocked) {
                invalidateLoadedPhotosCache();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                if (visualChanged) {
                    renderVisualTargetsList();
                    renderVisualTargetStage();
                }
            }
        } catch (e) {}
    }

    window.flushFotosOfflineOutboxNow = function () {
        return flushFotosOfflineOutbox();
    };

    async function flushFotosOfflineOutbox() {
        updateOfflineSyncBanner();
        if (_fotosFlushingOutbox || !state.unlocked) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const queue = readFotosOfflineOutbox();
        if (!queue.length) return;

        _fotosFlushingOutbox = true;
        updateOfflineSyncBanner();
        try {
            const localToRealId = {};
            const remaining = [];
            let syncedAny = false;
            let syncedVisualAny = false;

            for (let i = 0; i < queue.length; i++) {
                const entry = queue[i];
                if (!entry) continue;

                if (entry.type === 'direct_upload_assign') {
                    const blobRec = await getOfflinePhotoBlobIdb(entry.localFileId);
                    if (!blobRec || !blobRec.dataUrl) {
                        continue;
                    }
                    let res = await callWebAppPost('fotos_direct_upload_assign', Object.assign({
                        sku: entry.sku,
                        fileName: entry.fileName || blobRec.fileName || 'foto.jpg',
                        dataUrl: blobRec.dataUrl,
                        productName: entry.productName,
                        categoria: entry.categoria,
                        tipo: entry.tipo,
                        targetFolderId: entry.targetFolderId
                    }, buildOwnerAuthPayload()), 45000);

                    if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                        const upRes = await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                            fileName: entry.fileName || blobRec.fileName || 'foto.jpg',
                            dataUrl: blobRec.dataUrl,
                            skipListReturn: true
                        }, buildOwnerAuthPayload()), 45000);
                        if (upRes && upRes.ok && upRes.file && upRes.file.id) {
                            res = await callWebAppPost('fotos_subir_assign', Object.assign({
                                sku: entry.sku,
                                productName: entry.productName,
                                categoria: entry.categoria,
                                tipo: entry.tipo,
                                driveFileId: upRes.file.id,
                                fromLoaded: false,
                                targetFolderId: entry.targetFolderId,
                                skipListReturn: true
                            }, buildOwnerAuthPayload()), 30000);
                        } else {
                            res = upRes;
                        }
                    }

                    if (res && res.ok) {
                        syncedAny = true;
                        await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        const prod = state.productBySku.get(entry.sku);
                        const saved = state.sessionSavedBySku.get(entry.sku);
                        if (prod) {
                            if (res.newUrl) prod.photoUrl = res.newUrl;
                            if (res.fileId) prod.photoFileId = res.fileId;
                            if (res.rowNumber) prod.rowNumber = res.rowNumber;
                            if (res.destFolderName) prod.destFolderName = res.destFolderName;
                            if (res.destFolderId) prod.destFolderId = res.destFolderId;
                        }
                        if (saved) {
                            if (res.newUrl) saved.newUrl = res.newUrl;
                            if (res.fileId) saved.fileId = res.fileId;
                            if (res.rowNumber) saved.rowNumber = res.rowNumber;
                            if (res.destFolderName) saved.destFolderName = res.destFolderName;
                            if (res.fileName) saved.fileName = res.fileName;
                        }
                        if (res.fileId) {
                            state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || entry.fileName);
                        }
                        if (entry.sku && (res.newUrl || (prod && prod.photoUrl))) {
                            notifySplitPeerOfPhotoUpdate(
                                entry.sku,
                                res.newUrl || (prod && prod.photoUrl) || '',
                                res.fileId || (prod && prod.photoFileId) || '',
                                (res.destFolderName || (prod && prod.destFolderName) || '')
                            );
                        }
                    } else if (res && res.authRequired) {
                        remaining.push(...queue.slice(i));
                        window.lockFotosPortal();
                        setGateMessage('Ingresa tu contraseña para subir las fotos pendientes.', 'warn');
                        break;
                    } else if (!res || res.unavailable) {
                        remaining.push(...queue.slice(i));
                        break;
                    } else {
                        entry.retryCount = (Number(entry.retryCount) || 0) + 1;
                        entry.lastError = cleanStr(res && res.error);
                        if (entry.retryCount < 10) {
                            remaining.push(entry);
                        }
                    }
                } else if (entry.type === 'visual_override_upload') {
                    const ovKey = String(entry.overrideKey || '').trim().toUpperCase();
                    if (!ovKey) continue;
                    const isFabric = entry.categoryTag === 'FABRIC_SWATCH' || ovKey.indexOf('VFAB:') === 0;
                    const isWood = entry.categoryTag === 'WOOD_SWATCH' || ovKey.indexOf('VWOD:') === 0;
                    const label = cleanStr(entry.label || ovKey);
                    const categoryTag = entry.categoryTag || (isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER'));
                    const blobRec = entry.localFileId ? await getOfflinePhotoBlobIdb(entry.localFileId) : null;
                    const dataUrl = (blobRec && blobRec.dataUrl) || cleanStr(entry.dataUrl);
                    const directUrl = cleanStr(entry.directUrl);
                    const resolvedInboxId = entry.sourceInboxFileId ? (localToRealId[entry.sourceInboxFileId] || entry.sourceInboxFileId) : '';
                    if (!dataUrl && !directUrl && !resolvedInboxId) {
                        continue;
                    }
                    const auth = buildOwnerAuthPayload();
                    let res = null;
                    if (directUrl && !dataUrl && !resolvedInboxId) {
                        res = await callWebAppPost('inv_product_override_save', Object.assign({
                            sku: ovKey,
                            op: 'RESTORE',
                            name: label.slice(0, 140),
                            category: categoryTag,
                            price: '',
                            note: directUrl
                        }, auth), 25000);
                        if (res && res.ok) {
                            res = { ok: true, driveUrl: directUrl, override: res.override };
                        }
                    } else {
                        res = await callWebAppPost('fotos_upload_visual_override', Object.assign({
                            overrideKey: ovKey,
                            kind: isFabric ? 'fabric' : (isWood ? 'wood' : 'cover'),
                            label: label,
                            categoryTag: categoryTag,
                            fileName: cleanStr(entry.fileName || (blobRec && blobRec.fileName) || 'foto.jpg'),
                            sourceInboxFileId: /^local_/i.test(resolvedInboxId) ? '' : resolvedInboxId,
                            shortcutId: cleanStr(entry.shortcutId),
                            fromLoaded: !!entry.fromLoaded,
                            dataUrl: dataUrl || ''
                        }, auth), 45000);

                        if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                            let finalUrl = directUrl;
                            let fidFb = '';
                            if (!finalUrl && dataUrl) {
                                const upRes = await callWebAppPost('inv_upload_product_photo', Object.assign({
                                    advisorName: 'Kevin Reyna',
                                    sku: ovKey,
                                    fileName: cleanStr(entry.fileName || (blobRec && blobRec.fileName) || 'foto.jpg'),
                                    productName: (isFabric ? 'TELA ' : (isWood ? 'MADERA ' : 'PORTADA ')) + label,
                                    categoria: isFabric ? 'TELAS' : (isWood ? 'MADERAS' : 'SALAS'),
                                    tipo: isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA'),
                                    targetFolderId: VISUAL_UPLOAD_DRIVE_FOLDER_ID,
                                    driveOnly: true,
                                    skipSheetWrite: true,
                                    skipCategoryCopy: true,
                                    dataUrl: dataUrl
                                }, auth), 40000);
                                fidFb = cleanStr((upRes && upRes.fileId) || (upRes && upRes.driveUrl && extractDriveFileId(upRes.driveUrl)));
                                finalUrl = cleanStr(upRes && upRes.driveUrl) || (fidFb ? ('https://drive.google.com/file/d/' + fidFb + '/view?usp=sharing') : '');
                            }
                            if (finalUrl) {
                                const saveRes = await callWebAppPost('inv_product_override_save', Object.assign({
                                    sku: ovKey,
                                    op: 'RESTORE',
                                    name: label.slice(0, 140),
                                    category: categoryTag,
                                    price: '',
                                    note: finalUrl
                                }, auth), 25000);
                                res = (saveRes && saveRes.ok) ? { ok: true, driveUrl: finalUrl, fileId: fidFb, override: saveRes.override } : saveRes;
                            }
                        }
                    }

                    if (res && res.ok) {
                        syncedAny = true;
                        syncedVisualAny = true;
                        if (entry.localFileId) {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }
                        const finalDriveUrl = cleanStr(res.driveUrl || res.newUrl || directUrl);
                        const finalOverride = res.override || {
                            sku: ovKey,
                            status: 'VISIBLE',
                            name: label.slice(0, 140),
                            category: categoryTag,
                            price: null,
                            note: finalDriveUrl || dataUrl,
                            updatedBy: OWNER_EMAIL,
                            updatedAt: new Date().toLocaleString('es-MX')
                        };
                        visualState.overridesMap[ovKey] = finalOverride;
                        if (res.fileId) {
                            state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || entry.fileName);
                        }
                        saveVisualOverridesToLocalStorage();
                        broadcastVisualOverrideUpdateToCotizador(ovKey, finalOverride, false);
                    } else if (res && res.authRequired) {
                        remaining.push(...queue.slice(i));
                        window.lockFotosPortal();
                        setGateMessage('Ingresa tu contraseña para subir las fotos pendientes.', 'warn');
                        break;
                    } else if (!res || res.unavailable) {
                        remaining.push(...queue.slice(i));
                        break;
                    } else {
                        entry.retryCount = (Number(entry.retryCount) || 0) + 1;
                        entry.lastError = cleanStr(res && res.error);
                        if (entry.retryCount < 10) {
                            remaining.push(entry);
                        }
                    }
                } else if (entry.type === 'upload_inbox') {
                    const blobRec = await getOfflinePhotoBlobIdb(entry.localFileId);
                    if (!blobRec || !blobRec.dataUrl) {
                        continue;
                    }
                    const res = await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                        fileName: entry.fileName || blobRec.fileName || 'foto.jpg',
                        dataUrl: blobRec.dataUrl,
                        skipListReturn: true
                    }, buildOwnerAuthPayload()), 30000);

                    if (res && res.ok && res.file && res.file.id) {
                        const realId = res.file.id;
                        localToRealId[entry.localFileId] = realId;
                        syncedAny = true;

                        const hasPendingAssign = queue.slice(i + 1).some((nx) => nx && nx.type === 'assign_photo' && nx.driveFileId === entry.localFileId);
                        if (!hasPendingAssign) {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }

                        state.rawInboxFromDrive = state.rawInboxFromDrive.map((f) => {
                            if (f && f.id === entry.localFileId) {
                                return enrichInboxFileItem(Object.assign({}, res.file, { localDataUrl: blobRec.dataUrl }));
                            }
                            return f;
                        });
                        state.inboxFiles = state.inboxFiles.map((f) => {
                            if (f && f.id === entry.localFileId) {
                                return enrichInboxFileItem(Object.assign({}, res.file, { localDataUrl: blobRec.dataUrl }));
                            }
                            return f;
                        });
                        if (state.selectedInboxFileId === entry.localFileId) {
                            state.selectedInboxFileId = realId;
                        }
                        if (state.selectedPhotoItem && state.selectedPhotoItem.id === entry.localFileId) {
                            state.selectedPhotoItem.id = realId;
                            state.selectedPhotoItem.viewUrl = res.file.viewUrl || ('https://drive.google.com/file/d/' + realId + '/view?usp=sharing');
                        }
                    } else if (res && res.authRequired) {
                        remaining.push(...queue.slice(i));
                        window.lockFotosPortal();
                        setGateMessage('Ingresa tu contraseña para subir las fotos pendientes.', 'warn');
                        break;
                    } else if (!res || res.unavailable) {
                        remaining.push(...queue.slice(i));
                        break;
                    } else {
                        entry.retryCount = (Number(entry.retryCount) || 0) + 1;
                        entry.lastError = cleanStr(res && res.error);
                        if (entry.retryCount < 10) {
                            remaining.push(entry);
                        } else {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }
                    }
                } else if (entry.type === 'assign_photo') {
                    const resolvedFid = localToRealId[entry.driveFileId] || entry.driveFileId;
                    if (String(resolvedFid || '').indexOf('local_inb_') === 0) {
                        remaining.push(entry);
                        continue;
                    }
                    const res = await callWebAppPost('fotos_subir_assign', Object.assign({
                        sku: entry.sku,
                        productName: entry.productName,
                        categoria: entry.categoria,
                        tipo: entry.tipo,
                        driveFileId: resolvedFid,
                        shortcutId: cleanStr(entry.shortcutId),
                        fromLoaded: !!entry.fromLoaded,
                        targetFolderId: entry.targetFolderId,
                        skipListReturn: true
                    }, buildOwnerAuthPayload()), 30000);

                    if (res && res.ok) {
                        syncedAny = true;
                        if (String(entry.driveFileId || '').indexOf('local_inb_') === 0) {
                            await deleteOfflinePhotoBlobIdb(entry.driveFileId);
                        }
                        const prod = state.productBySku.get(entry.sku);
                        const saved = state.sessionSavedBySku.get(entry.sku);
                        if (prod) {
                            if (res.newUrl) prod.photoUrl = res.newUrl;
                            if (res.fileId) prod.photoFileId = res.fileId;
                            if (res.rowNumber) prod.rowNumber = res.rowNumber;
                        }
                        if (saved) {
                            if (res.newUrl) saved.newUrl = res.newUrl;
                            if (res.fileId) saved.fileId = res.fileId;
                            if (res.rowNumber) saved.rowNumber = res.rowNumber;
                        }
                        if (res.fileId && res.fileName) {
                            state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName);
                        }
                        if (entry.sku && (res.newUrl || (prod && prod.photoUrl))) {
                            notifySplitPeerOfPhotoUpdate(
                                entry.sku,
                                res.newUrl || (prod && prod.photoUrl) || '',
                                res.fileId || (prod && prod.photoFileId) || '',
                                (prod && prod.destFolderName) || ''
                            );
                        }
                    } else if (res && res.authRequired) {
                        entry.driveFileId = resolvedFid;
                        remaining.push(...queue.slice(i));
                        window.lockFotosPortal();
                        setGateMessage('Ingresa tu contraseña para subir las fotos pendientes.', 'warn');
                        break;
                    } else if (!res || res.unavailable) {
                        entry.driveFileId = resolvedFid;
                        remaining.push(...queue.slice(i));
                        break;
                    } else {
                        entry.driveFileId = resolvedFid;
                        entry.retryCount = (Number(entry.retryCount) || 0) + 1;
                        entry.lastError = cleanStr(res && res.error);
                        if (entry.retryCount < 10) {
                            remaining.push(entry);
                        }
                    }
                }
            }

            writeFotosOfflineOutbox(remaining);
            if (syncedAny) {
                saveSavedOverridesNow();
                invalidateLoadedPhotosCache();
                scheduleSaveFastCache();
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                if (syncedVisualAny) {
                    renderVisualTargetsList();
                    renderVisualTargetStage();
                }
                renderSessionHistoryLog();
                showAssignFeedback('✅ Fotos pendientes sincronizadas con Drive y Sheets.', true);
                if (visualState.workMode !== 'SKU') {
                    showVisualStageFeedback('✅ Fotos pendientes sincronizadas.', true);
                }
            }
        } catch (e) {
            // Keep remaining queue
        } finally {
            _fotosFlushingOutbox = false;
            updateOfflineSyncBanner();
        }
    }

    function saveFotosUiCheckpointNow() {
        if (!_fotosUiCheckpointRestoredOnce || _fotosRestoringCheckpoint) return;
        try {
            const skuListEl = document.getElementById('skuResultsList');
            const galEl = document.getElementById('inboxGalleryContainer');
            const destSel = document.getElementById('destFolderSelect');
            const selPhoto = state.selectedPhotoItem ? {
                id: state.selectedPhotoItem.id || '',
                name: state.selectedPhotoItem.name || '',
                viewUrl: (state.selectedPhotoItem.viewUrl && !String(state.selectedPhotoItem.viewUrl).startsWith('data:'))
                    ? state.selectedPhotoItem.viewUrl
                    : '',
                fromLoaded: !!state.selectedPhotoItem.fromLoaded,
                skuOrigin: state.selectedPhotoItem.skuOrigin || ''
            } : null;

            const cp = {
                savedAt: Date.now(),
                skuSearchQuery: state.skuSearchQuery || '',
                skuFilterMode: state.skuFilterMode || 'ALL',
                skuCategoryFilter: state.skuCategoryFilter || 'ALL',
                skuLocationFilter: state.skuLocationFilter || 'ALL',
                selectedSku: state.selectedSku || '',
                destFolderId: destSel ? (destSel.value || '') : '',
                galleryMode: state.galleryMode || 'INBOX',
                inboxSearchQuery: state.inboxSearchQuery || '',
                selectedInboxFileId: state.selectedInboxFileId || '',
                selectedPhotoItem: selPhoto,
                lightboxUrl: (state.lightboxUrl && !String(state.lightboxUrl).startsWith('data:')) ? state.lightboxUrl : '',
                skuListScrollTop: skuListEl ? Math.round(skuListEl.scrollTop || 0) : 0,
                galleryScrollTop: galEl ? Math.round(galEl.scrollTop || 0) : 0,
                windowScrollY: Math.round(window.scrollY || 0)
            };
            localStorage.setItem(FOTOS_UI_CHECKPOINT_STORAGE, JSON.stringify(cp));
        } catch (e) {}
    }

    function restoreFotosUiCheckpointOnce() {
        _fotosUiCheckpointRestoredOnce = true;
        _fotosRestoringCheckpoint = true;
        try {
            const raw = localStorage.getItem(FOTOS_UI_CHECKPOINT_STORAGE);
            if (!raw) {
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                _fotosRestoringCheckpoint = false;
                return;
            }
            const cp = JSON.parse(raw);
            if (!cp || typeof cp !== 'object') {
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                _fotosRestoringCheckpoint = false;
                return;
            }

            if (typeof cp.skuSearchQuery === 'string') {
                state.skuSearchQuery = cp.skuSearchQuery;
                const skuInp = document.getElementById('skuSearchInput');
                const clrBtn = document.getElementById('skuSearchClearBtn');
                if (skuInp) skuInp.value = cp.skuSearchQuery;
                if (clrBtn) clrBtn.classList.toggle('hidden', !cp.skuSearchQuery.trim());
            }

            if (cp.skuFilterMode) {
                state.skuFilterMode = cp.skuFilterMode;
                document.querySelectorAll('.filter-pill[data-filter]').forEach((b) => {
                    b.classList.toggle('active', b.getAttribute('data-filter') === state.skuFilterMode);
                });
            }

            if (typeof cp.skuCategoryFilter === 'string' && cp.skuCategoryFilter) {
                state.skuCategoryFilter = cp.skuCategoryFilter;
            }

            if (typeof cp.skuLocationFilter === 'string' && cp.skuLocationFilter) {
                state.skuLocationFilter = cp.skuLocationFilter;
            }

            if (typeof cp.inboxSearchQuery === 'string') {
                state.inboxSearchQuery = cp.inboxSearchQuery;
                const inboxInp = document.getElementById('inboxSearchInput');
                const inboxClr = document.getElementById('inboxSearchClearBtn');
                if (inboxInp) inboxInp.value = cp.inboxSearchQuery;
                if (inboxClr) inboxClr.classList.toggle('hidden', !cp.inboxSearchQuery.trim());
            }

            if (cp.galleryMode === 'LOADED' || cp.galleryMode === 'INBOX') {
                state.galleryMode = cp.galleryMode;
                const tabInbox = document.getElementById('tabGalleryInbox');
                const tabLoaded = document.getElementById('tabGalleryLoaded');
                if (tabInbox) tabInbox.classList.toggle('active', state.galleryMode === 'INBOX');
                if (tabLoaded) tabLoaded.classList.toggle('active', state.galleryMode === 'LOADED');
            }

            if (cp.selectedInboxFileId) {
                state.selectedInboxFileId = cp.selectedInboxFileId;
            }
            if (cp.selectedPhotoItem && cp.selectedPhotoItem.id) {
                const matchInb = state.inboxFiles.find((f) => f.id === cp.selectedPhotoItem.id);
                state.selectedPhotoItem = {
                    id: cp.selectedPhotoItem.id,
                    name: cp.selectedPhotoItem.name || (matchInb ? matchInb.name : ''),
                    viewUrl: cp.selectedPhotoItem.viewUrl || (matchInb ? matchInb.viewUrl : ''),
                    thumbDataUrl: matchInb ? (matchInb.thumbDataUrl || '') : '',
                    localDataUrl: matchInb ? (matchInb.localDataUrl || '') : '',
                    fromLoaded: !!cp.selectedPhotoItem.fromLoaded,
                    skuOrigin: cp.selectedPhotoItem.skuOrigin || ''
                };
            }

            renderSkuCategoryFilterRow();
            renderSkuLocationFilterRow();
            applySkuFiltersAndRender();
            renderInboxGallery();

            if (cp.selectedSku && state.productBySku.has(cp.selectedSku)) {
                window.selectSkuProduct(cp.selectedSku);
            } else {
                renderSelectedProductStage();
                updateAssignButtonState();
            }

            if (cp.destFolderId && DEST_FOLDER_BY_ID.has(cp.destFolderId)) {
                const destSel = document.getElementById('destFolderSelect');
                if (destSel) destSel.value = cp.destFolderId;
            }

            const finishRestore = () => {
                try {
                    if (!_fotosUserHasScrolled) {
                        const skuListEl = document.getElementById('skuResultsList');
                        if (skuListEl && skuListEl.scrollTop === 0 && typeof cp.skuListScrollTop === 'number' && cp.skuListScrollTop > 0) {
                            skuListEl.scrollTop = cp.skuListScrollTop;
                        }
                    }
                    if (typeof cp.lightboxUrl === 'string' && /^https?:\/\//i.test(cp.lightboxUrl)) {
                        window.openPhotoLightbox(cp.lightboxUrl);
                    }
                } catch (e) {
                } finally {
                    _fotosRestoringCheckpoint = false;
                }
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(finishRestore, 60));
            } else {
                setTimeout(finishRestore, 60);
            }
        } catch (e) {
            _fotosRestoringCheckpoint = false;
            renderSkuCategoryFilterRow();
            renderSkuLocationFilterRow();
            applySkuFiltersAndRender();
            renderInboxGallery();
            renderSelectedProductStage();
        }
    }

    async function hydrateFromLocalCompressedBundleIfEmpty() {
        if (state.products.length > 0) return;
        const b64 = window.CREATA_INV_GZ;
        if (!b64 || typeof DecompressionStream === 'undefined' || typeof atob !== 'function') return;
        try {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const ds = new DecompressionStream('gzip');
            const stream = new Blob([bytes]).stream().pipeThrough(ds);
            const jsonText = await new Response(stream).text();
            const parsed = JSON.parse(jsonText);
            if (!parsed || state.products.length > 0) return;

            // Soportar tanto la matriz columnar real de inventario-data-1/2/3.js (cols[0..20]) como arreglos de objetos
            let rawItems = [];
            const colsMatrix = (parsed && Array.isArray(parsed.cols)) ? parsed.cols : parsed;
            if (Array.isArray(colsMatrix) && colsMatrix.length >= 16 && Array.isArray(colsMatrix[0])) {
                const colLen = colsMatrix[0].length;
                rawItems = new Array(colLen);
                for (let c = 0; c < colLen; c++) {
                    rawItems[c] = {
                        s: colsMatrix[0][c],
                        tp: colsMatrix[1][c],
                        mo: colsMatrix[2][c],
                        n: colsMatrix[3][c],
                        vr: colsMatrix[4][c],
                        f: colsMatrix[5][c],
                        c: colsMatrix[6][c],
                        tl: colsMatrix[7][c],
                        ct: colsMatrix[8][c],
                        md: colsMatrix[9][c],
                        cm: colsMatrix[10][c],
                        mt: colsMatrix[11][c],
                        m: colsMatrix[12][c],
                        st: Array.isArray(colsMatrix[15] && colsMatrix[15][c]) ? colsMatrix[15][c] : null,
                        pr: colsMatrix.length > 16 && colsMatrix[16] ? colsMatrix[16][c] : '',
                        fe: colsMatrix.length > 17 && colsMatrix[17] ? colsMatrix[17][c] : ''
                    };
                }
            } else {
                rawItems = (parsed && Array.isArray(parsed.items)) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
            }
            if (!rawItems.length || state.products.length > 0) return;

            const delQueue = readDeletedQueue();
            const delSkus = delQueue.skus || {};
            const delFiles = delQueue.fileIds || {};
            const mergedMap = new Map();
            const byNormName = new Map();

            const buildAcabadoSummary = (tl, ct, md, cm, mt) => {
                const parts = [];
                if (tl) parts.push(tl + (ct && normPlainCat(tl).indexOf(normPlainCat(ct)) === -1 ? (' (' + ct + ')') : ''));
                else if (ct) parts.push(ct);
                if (md) parts.push(md + (cm && normPlainCat(md).indexOf(normPlainCat(cm)) === -1 ? (' ' + cm) : ''));
                else if (cm) parts.push(cm);
                if (!parts.length && mt) parts.push(mt);
                return parts.join(' · ');
            };

            for (let i = 0; i < rawItems.length; i++) {
                const it = rawItems[i];
                if (!it || !it.s) continue;
                const sku = cleanStr(it.s).toUpperCase();
                if (!sku || mergedMap.has(sku)) continue;
                const displayName = cleanStr(it.n) || [cleanStr(it.tp), cleanStr(it.mo)].filter(Boolean).join(' ') || sku;
                const categoria = cleanStr(it.c);
                const tipo = cleanStr(it.tp);
                const dest = resolveCategoryDestFolderForProduct(categoria, tipo, displayName);
                let photoUrl = cleanPhotoUrl(it.f || it.img);
                let photoFid = extractDriveFileId(photoUrl);
                if (delSkus[sku] || (photoFid && delFiles[photoFid])) {
                    photoUrl = '';
                    photoFid = '';
                }
                const savedMeta = state.sessionSavedBySku.get(sku);
                if (savedMeta && savedMeta.newUrl && !delSkus[sku]) {
                    photoUrl = savedMeta.newUrl;
                    photoFid = savedMeta.fileId || extractDriveFileId(photoUrl);
                }
                const stArr = normalizeStocksArray(it.st);
                const totals = computeStockTotals(stArr);
                const locMeta = buildActiveLocationsMeta(stArr);
                const feRaw = cleanStr(it.fe);
                const acabado = buildAcabadoSummary(cleanStr(it.tl), cleanStr(it.ct), cleanStr(it.md), cleanStr(it.cm), cleanStr(it.mt));
                const p = {
                    sku: sku,
                    colBName: displayName,
                    displayName: displayName,
                    photoUrl: photoUrl,
                    photoFileId: photoFid,
                    rowNumber: it.r || null,
                    inSheet1: !!photoUrl,
                    inInv: true,
                    categoria: categoria,
                    tipo: tipo,
                    modelo: cleanStr(it.mo),
                    variante: cleanStr(it.vr),
                    tl: cleanStr(it.tl),
                    ct: cleanStr(it.ct),
                    md: cleanStr(it.md),
                    cm: cleanStr(it.cm),
                    proveedor: cleanStr(it.p || it.proveedor),
                    medidas: cleanStr(it.m),
                    acabado: acabado,
                    st: stArr,
                    hasStocksLoaded: Array.isArray(it.st),
                    totalBodegaPiso: totals.totalBodegaPiso,
                    lpptStock: totals.lpptStock,
                    locSummary: locMeta.locSummary,
                    locSearchTokens: locMeta.locSearchTokens,
                    precio: formatListPriceText(it.pr),
                    fe: feRaw === 'Sin piezas solicitadas' ? '' : feRaw,
                    destFolderId: dest.id,
                    destFolderName: dest.name,
                    searchSkuNorm: normalizeSearchText(sku),
                    searchNameNorm: '',
                    searchNorm: ''
                };
                const cleanCat = cleanCategoryForPhotoSearch(p.categoria, p.tipo, p.displayName);
                p.searchNameNorm = normalizeSearchText(
                    p.displayName + ' ' + cleanCat + ' ' + p.tipo + ' ' + p.modelo + ' ' + p.variante + ' ' +
                    p.medidas + ' ' + p.acabado + ' ' + p.destFolderName + ' ' + p.locSearchTokens
                );
                p.searchNorm = (p.searchSkuNorm + ' ' + p.searchNameNorm).trim();
                const dispNorm = normalizeSearchText(p.displayName);
                if (dispNorm && dispNorm.length >= 5 && !byNormName.has(dispNorm)) {
                    byNormName.set(dispNorm, sku);
                }
                mergedMap.set(sku, p);
            }

            const list = Array.from(mergedMap.values());
            list.sort((a, b) => {
                const aQuot = (a.totalBodegaPiso > 0 || a.lpptStock > 0) ? 1 : 0;
                const bQuot = (b.totalBodegaPiso > 0 || b.lpptStock > 0) ? 1 : 0;
                if (aQuot !== bQuot) return bQuot - aQuot;
                return a.displayName.localeCompare(b.displayName, 'es') || a.sku.localeCompare(b.sku, 'es');
            });
            state.products = list;
            state.productBySku = mergedMap;
            state.productByNormName = byNormName;
            rebuildSiblingVariantsIndex();
            if (typeof rebuildVisualTargetsCatalog === 'function') rebuildVisualTargetsCatalog();
            invalidateLoadedPhotosCache();
            if (state.unlocked) {
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
                if (state.selectedSku) renderSelectedProductStage();
            }
        } catch (eBundle) {}
    }

    // =========================================================================
    // PANTALLA DIVIDIDA REDIMENSIONABLE (APP FOTOS + COTIZADOR EN UNA SOLA APP)
    // =========================================================================
    const FOTOS_SPLIT_PCT_STORAGE = 'creata_unified_split_pct_v1';
    const FOTOS_SPLIT_AXIS_STORAGE = 'creata_unified_split_axis_v1';
    let _fotosSplitActive = false;
    let _fotosSplitPct = 50;
    let _fotosSplitVertical = false;
    let _fotosSplitTarget = 'cotizador';

    function getFotosSplitTargetUrl(target) {
        return target === 'prompts' ? 'https://buena-espero.onrender.com/?embed=true&embed_options=dark_theme' : './inventario.html?embed=1';
    }

    function loadFotosSplitPrefs() {
        try {
            const savedPct = parseFloat(localStorage.getItem(FOTOS_SPLIT_PCT_STORAGE) || '');
            if (Number.isFinite(savedPct) && savedPct >= 20 && savedPct <= 80) {
                _fotosSplitPct = Math.round(savedPct);
            } else {
                _fotosSplitPct = 50;
            }
            const savedAxis = localStorage.getItem(FOTOS_SPLIT_AXIS_STORAGE) || '';
            if (savedAxis === 'vertical' || savedAxis === 'horizontal') {
                _fotosSplitVertical = savedAxis === 'vertical';
            } else {
                _fotosSplitVertical = window.innerWidth < 768;
            }
        } catch (e) {
            _fotosSplitPct = 50;
            _fotosSplitVertical = window.innerWidth < 768;
        }
    }

    function applyFotosSplitDomState() {
        const dock = document.getElementById('fotosSplitCotizadorDock');
        const btn = document.getElementById('btnSplitWithCotizador');
        const badge = document.getElementById('fotosSplitRatioBadge');
        const frame = document.getElementById('fotosSplitCotizadorFrame');
        const btnCot = document.getElementById('btnFotosSplitTargetCotizador');
        const btnPrompts = document.getElementById('btnFotosSplitTargetPrompts');

        document.body.classList.toggle('fotos-split-active', _fotosSplitActive);
        document.body.classList.toggle('fotos-split-vertical', _fotosSplitActive && _fotosSplitVertical);
        document.documentElement.style.setProperty('--fotos-split-pct', _fotosSplitPct + '%');
        document.body.style.setProperty('--fotos-split-pct', _fotosSplitPct + '%');

        if (dock) dock.classList.toggle('hidden', !_fotosSplitActive);
        if (btn) {
            btn.classList.toggle('active', _fotosSplitActive);
            btn.textContent = _fotosSplitActive ? '✕ Dividir' : '⬛⬜ Dividir';
        }
        if (badge) {
            badge.textContent = _fotosSplitPct + '% / ' + (100 - _fotosSplitPct) + '%';
        }
        if (btnCot) btnCot.classList.toggle('active', _fotosSplitTarget !== 'prompts');
        if (btnPrompts) btnPrompts.classList.toggle('active', _fotosSplitTarget === 'prompts');
        if (_fotosSplitActive && frame) {
            const targetUrl = getFotosSplitTargetUrl(_fotosSplitTarget);
            const loadedSrc = (frame.dataset && frame.dataset.loadedSrc) || frame.getAttribute('src') || '';
            if (!loadedSrc || loadedSrc === 'about:blank' || loadedSrc !== targetUrl) {
                if (typeof frame.setAttribute === 'function') {
                    frame.setAttribute('title', _fotosSplitTarget === 'prompts' ? 'Generador de Prompts IA' : 'Cotizador CREATA');
                }
                if (window.CreataBackNav && typeof window.CreataBackNav.replaceIframeUrl === 'function') {
                    window.CreataBackNav.replaceIframeUrl(frame, targetUrl);
                } else if (typeof frame.setAttribute === 'function') {
                    frame.setAttribute('src', targetUrl);
                }
                try {
                    if (frame.dataset) frame.dataset.loadedSrc = targetUrl;
                } catch (e) {}
            }
        }
        updateAssignButtonState();
    }

    window.setFotosSplitTarget = function (target) {
        const nextTarget = target === 'prompts' ? 'prompts' : 'cotizador';
        _fotosSplitTarget = nextTarget;
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
            applyFotosSplitDomState();
            syncFotosBackNav('split_cotizador');
        } else {
            applyFotosSplitDomState();
        }
        if (_fotosSplitTarget === 'cotizador' && state.selectedSku) {
            setTimeout(() => notifySplitPeerOfSkuSelect(state.selectedSku, true), 450);
        }
    };

    window.setFotosSplitPreset = function (pctVal) {
        const p = Math.max(20, Math.min(80, Math.round(Number(pctVal) || 50)));
        _fotosSplitPct = p;
        try { localStorage.setItem(FOTOS_SPLIT_PCT_STORAGE, String(p)); } catch (e) {}
        applyFotosSplitDomState();
    };

    window.toggleFotosSplitAxis = function () {
        _fotosSplitVertical = !_fotosSplitVertical;
        try { localStorage.setItem(FOTOS_SPLIT_AXIS_STORAGE, _fotosSplitVertical ? 'vertical' : 'horizontal'); } catch (e) {}
        applyFotosSplitDomState();
    };

    window.closeFotosSplitCotizador = function () {
        _fotosSplitActive = false;
        applyFotosSplitDomState();
    };

    window.toggleSplitCotizadorInFotos = function () {
        // Si esta ventana ya está embebida dentro del Cotizador en modo pantalla dividida, pedirle al padre ajustar/cerrar
        const isEmbedded = (window.parent && window.parent !== window);
        if (isEmbedded) {
            try {
                if (typeof window.parent.postMessage === 'function') {
                    window.parent.postMessage({ type: 'CREATA_SPLIT_TOGGLE_FROM_CHILD' }, '*');
                }
                return;
            } catch (e) {}
        }
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
        } else {
            _fotosSplitActive = false;
        }
        applyFotosSplitDomState();
        if (_fotosSplitActive) {
            syncFotosBackNav('split_cotizador');
            if (state.selectedSku) {
                setTimeout(() => notifySplitPeerOfSkuSelect(state.selectedSku, true), 450);
            }
        }
    };

    window.openSelectedSkuInCotizador = function () {
        if (!state.selectedSku) return;
        const targetSku = state.selectedSku;
        const isEmbedded = !!(window.parent && window.parent !== window);
        if (isEmbedded) {
            notifySplitPeerOfSkuSelect(targetSku, true);
            return;
        }
        if (!_fotosSplitActive) {
            loadFotosSplitPrefs();
            _fotosSplitActive = true;
            applyFotosSplitDomState();
            syncFotosBackNav('split_cotizador');
            setTimeout(() => notifySplitPeerOfSkuSelect(targetSku, true), 500);
        } else {
            notifySplitPeerOfSkuSelect(targetSku, true);
        }
    };

    function bindFotosSplitResizerDrag() {
        const bar = document.getElementById('fotosSplitResizerBar');
        if (!bar) return;

        let dragging = false;

        const updateFromPointer = (clientX, clientY) => {
            if (!dragging || !_fotosSplitActive) return;
            const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
            const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
            const rawPct = _fotosSplitVertical ? ((clientY / vh) * 100) : ((clientX / vw) * 100);
            const clamped = Math.max(20, Math.min(80, Math.round(rawPct)));
            _fotosSplitPct = clamped;
            document.documentElement.style.setProperty('--fotos-split-pct', clamped + '%');
            document.body.style.setProperty('--fotos-split-pct', clamped + '%');
            const badge = document.getElementById('fotosSplitRatioBadge');
            if (badge) badge.textContent = clamped + '% / ' + (100 - clamped) + '%';
        };

        const stopDrag = () => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('fotos-split-dragging');
            try { localStorage.setItem(FOTOS_SPLIT_PCT_STORAGE, String(_fotosSplitPct)); } catch (e) {}
        };

        bar.addEventListener('mousedown', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.fotos-split-presets')) return;
            dragging = true;
            document.body.classList.add('fotos-split-dragging');
            ev.preventDefault();
        });

        window.addEventListener('mousemove', (ev) => {
            if (!dragging) return;
            updateFromPointer(ev.clientX, ev.clientY);
        });

        window.addEventListener('mouseup', stopDrag);

        bar.addEventListener('touchstart', (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest('.fotos-split-presets')) return;
            if (!ev.touches || !ev.touches.length) return;
            dragging = true;
            document.body.classList.add('fotos-split-dragging');
        }, { passive: true });

        window.addEventListener('touchmove', (ev) => {
            if (!dragging || !ev.touches || !ev.touches.length) return;
            const t = ev.touches[0];
            updateFromPointer(t.clientX, t.clientY);
        }, { passive: true });

        window.addEventListener('touchend', stopDrag);
        window.addEventListener('touchcancel', stopDrag);
    }

    function initFotosBackNav() {
        const factory = (window.CreataBackNav && typeof window.CreataBackNav.createController === 'function')
            ? window.CreataBackNav.createController
            : (typeof window.createCreataBackNavController === 'function' ? window.createCreataBackNavController : null);
        if (!factory) return;

        _fotosBackNav = factory({
            appId: 'fotos',
            toastId: 'fotosBackToast',
            maxDepth: 12,
            exitGuardMs: 2500,
            exitMessage: 'Presiona Atrás otra vez para salir',
            isEnabled: () => state.unlocked === true,
            steps: [
                {
                    id: 'lightbox',
                    isActive: () => Boolean(state.lightboxOpen || state.lightboxUrl || !isElHidden('photoLightbox')),
                    undo: () => window.closePhotoLightbox(),
                    escapeAllowed: true
                },
                {
                    id: 'install_modal',
                    isActive: () => !isElHidden('fotosInstallModal'),
                    undo: () => window.closeFotosInstallModal(),
                    escapeAllowed: true
                },
                {
                    id: 'split_cotizador',
                    isActive: () => _fotosSplitActive === true,
                    undo: () => window.closeFotosSplitCotizador(),
                    escapeAllowed: true,
                    toast: 'Pantalla dividida cerrada'
                },
                {
                    id: 'selected_photo',
                    isActive: () => Boolean(state.selectedInboxFileId || state.selectedPhotoItem),
                    undo: () => window.clearSelectedInboxPhoto(),
                    escapeAllowed: true,
                    toast: 'Foto deseleccionada'
                },
                {
                    id: 'inbox_search',
                    isActive: () => Boolean(cleanStr(state.inboxSearchQuery)),
                    undo: () => window.clearInboxSearch({ focus: false }),
                    escapeAllowed: true,
                    toast: 'Filtro de galería limpiado'
                },
                {
                    id: 'gallery_mode',
                    isActive: () => state.galleryMode === 'LOADED',
                    undo: () => window.setGalleryMode('INBOX'),
                    escapeAllowed: false,
                    toast: 'Volviendo a SUBIR PREN'
                },
                {
                    id: 'mobile_section',
                    isActive: () => state.mobileSectionHistory.length > 0 || (isMobileViewport() && state.activeMobileSection !== 'secSkuFinder'),
                    depthWeight: () => Math.max(1, state.mobileSectionHistory.length),
                    undo: () => {
                        const prev = state.mobileSectionHistory.length > 0
                            ? state.mobileSectionHistory.pop()
                            : 'secSkuFinder';
                        window.jumpToFotosSection(prev, null, { fromBack: true });
                    },
                    escapeAllowed: false,
                    toast: 'Paso anterior'
                },
                {
                    id: 'selected_visual_target',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(visualState.selectedOverrideKey),
                    undo: () => { if (typeof window.clearSelectedVisualTarget === 'function') window.clearSelectedVisualTarget(); },
                    escapeAllowed: true,
                    toast: 'Selección quitada'
                },
                {
                    id: 'visual_search',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(cleanStr(visualState.searchQuery)),
                    undo: () => { if (typeof window.clearVisualTargetSearch === 'function') window.clearVisualTargetSearch(); },
                    escapeAllowed: true,
                    toast: 'Búsqueda limpiada'
                },
                {
                    id: 'visual_filter',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU' && Boolean(visualState.filterMode && visualState.filterMode !== 'ALL'),
                    undo: () => { if (typeof window.setVisualTargetFilter === 'function') window.setVisualTargetFilter('ALL'); },
                    escapeAllowed: false,
                    toast: 'Filtro: Todos'
                },
                {
                    id: 'visual_work_mode',
                    isActive: () => typeof visualState !== 'undefined' && visualState.workMode !== 'SKU',
                    undo: () => { if (typeof window.setFotosWorkMode === 'function') window.setFotosWorkMode('SKU'); },
                    escapeAllowed: false,
                    toast: 'Volviendo a SKUs'
                },
                {
                    id: 'selected_sku',
                    isActive: () => Boolean(state.selectedSku),
                    undo: () => window.clearSelectedSku(),
                    escapeAllowed: true,
                    toast: 'SKU deseleccionado'
                },
                {
                    id: 'sku_search',
                    isActive: () => Boolean(cleanStr(state.skuSearchQuery)),
                    undo: () => window.clearSkuSearch({ focus: false }),
                    escapeAllowed: true,
                    toast: 'Búsqueda limpiada'
                },
                {
                    id: 'sku_location',
                    isActive: () => Boolean(state.skuLocationFilter && state.skuLocationFilter !== 'ALL'),
                    undo: () => window.setSkuLocationFilter('ALL'),
                    escapeAllowed: false,
                    toast: 'Ubicación: Todas'
                },
                {
                    id: 'sku_category',
                    isActive: () => Boolean(state.skuCategoryFilter && state.skuCategoryFilter !== 'ALL'),
                    undo: () => window.setSkuCategoryFilter('ALL'),
                    escapeAllowed: false,
                    toast: 'Categoría: Todas'
                },
                {
                    id: 'sku_filter',
                    isActive: () => Boolean(state.skuFilterMode && state.skuFilterMode !== 'ALL'),
                    undo: () => window.setSkuFilterMode('ALL'),
                    escapeAllowed: false,
                    toast: 'Filtro: Todos'
                }
            ]
        });

        _fotosBackNav.init();
        window.__CREATA_FOTOS_BACK_NAV__ = _fotosBackNav;
        window.handleFotosBackAction = function () {
            if (!state.unlocked) return { handled: false, blocked: false };
            return _fotosBackNav ? _fotosBackNav.stepBackOnce() : { handled: false };
        };
    }

    function handleIncomingPeerMessageInFotos(d) {
        if (!d || typeof d !== 'object') return;
        const fromSelfTab = Boolean(d.tabId && d.tabId === FOTOS_TAB_ID);
        if (fromSelfTab) return;

        if (d.type === 'CREATA_SPLIT_PHOTO_SAVED' && d.sku) {
            if (d.source === 'fotos' && !d.tabId) return;
            const targetSku = cleanStr(d.sku).toUpperCase();
            if (!targetSku) return;
            const nextUrl = d.deleted ? '' : cleanPhotoUrl(d.photoUrl);
            const nextFid = d.deleted ? '' : (cleanStr(d.fileId) || extractDriveFileId(nextUrl));
            if (!state.productBySku.has(targetSku)) {
                upsertProductFromCotizadorPeer(targetSku, { f: nextUrl });
            }
            const prod = state.productBySku.get(targetSku);
            if (prod) {
                prod.photoUrl = nextUrl;
                prod.photoFileId = nextFid;
                if (nextUrl) prod.inSheet1 = true;
            }
            if (d.fileId) {
                state.rawInboxFromDrive = state.rawInboxFromDrive.filter((x) => x && x.id !== d.fileId);
                state.inboxFiles = state.inboxFiles.filter((x) => x && x.id !== d.fileId);
            }
            invalidateLoadedPhotosCache();
            renderSkuCategoryFilterRow();
            renderSkuLocationFilterRow();
            applySkuFiltersAndRender();
            renderInboxGallery();
            if (state.selectedSku === targetSku) {
                renderSelectedProductStage();
            }
            return;
        }
        if (d.type === 'CREATA_VISUAL_OVERRIDE_SAVED' && d.overrideKey) {
            const ovKey = cleanStr(d.overrideKey).toUpperCase();
            if (!ovKey) return;
            if (d.deleted) {
                delete visualState.overridesMap[ovKey];
            } else if (d.override && typeof d.override === 'object') {
                visualState.overridesMap[ovKey] = d.override;
            }
            saveVisualOverridesToLocalStorage();
            if (visualState.workMode !== 'SKU') {
                renderVisualTargetsList();
                renderVisualTargetStage();
            } else if (state.selectedSku) {
                renderSelectedProductStage();
            }
            return;
        }
        if (d.type === 'CREATA_FOTOS_INBOX_CHANGED') {
            if (state.unlocked && !state.inboxLoading) {
                runSilentFotosLiveTick('inbox');
            }
            return;
        }
        if (d.type === 'CREATA_SPLIT_SELECT_SKU' && d.source !== 'fotos' && d.sku) {
            const targetSku = cleanStr(d.sku).toUpperCase();
            if (!targetSku) return;
            if (!state.productBySku.has(targetSku) || (d.meta && Array.isArray(d.meta.st))) {
                upsertProductFromCotizadorPeer(targetSku, d.meta || null);
                renderSkuCategoryFilterRow();
                renderSkuLocationFilterRow();
                applySkuFiltersAndRender();
            }
            if (state.selectedSku !== targetSku) {
                window.selectSkuProduct(targetSku, { skipBackSync: true, fromPeerSync: true });
            } else if (d.meta && Array.isArray(d.meta.st)) {
                renderSelectedProductStage();
            }
        }
    }

    function handleDelegatedFotosClick(ev) {
        if (!ev || !ev.target || typeof ev.target.closest !== 'function') return;
        const el = ev.target.closest('[data-fotos-act]');
        if (!el) return;
        const act = el.getAttribute('data-fotos-act');
        if (!act) return;
        if (act === 'cat-filter') {
            if (typeof window.setSkuCategoryFilter === 'function') window.setSkuCategoryFilter(el.getAttribute('data-cat-key') || 'ALL');
        } else if (act === 'loc-filter') {
            if (typeof window.setSkuLocationFilter === 'function') window.setSkuLocationFilter(el.getAttribute('data-loc-key') || 'ALL');
        } else if (act === 'sync-sku') {
            if (typeof window.syncSkusNow === 'function') window.syncSkusNow(el.getAttribute('data-raw') || '');
        } else if (act === 'manual-sku') {
            if (typeof window.useNewManualSku === 'function') window.useNewManualSku(el.getAttribute('data-raw') || '');
        } else if (act === 'select-sku') {
            if (typeof window.selectSkuProduct === 'function') window.selectSkuProduct(el.getAttribute('data-sku') || '');
        } else if (act === 'take-sku-row') {
            ev.stopPropagation();
            if (typeof window.takePhotoFromSkuRow === 'function') window.takePhotoFromSkuRow(el.getAttribute('data-sku') || '', ev);
        } else if (act === 'del-loaded-sku') {
            ev.stopPropagation();
            if (typeof window.deleteLoadedPhotoBySku === 'function') window.deleteLoadedPhotoBySku(el.getAttribute('data-sku') || '', el.getAttribute('data-fid') || '', ev);
        } else if (act === 'lightbox') {
            const src = el.getAttribute('data-lightbox-src') || '';
            if (src && typeof window.openPhotoLightbox === 'function') window.openPhotoLightbox(src);
        } else if (act === 'recent-select') {
            if (typeof window.selectRecentUploadedPhoto === 'function') window.selectRecentUploadedPhoto(el.getAttribute('data-fid') || '', el.getAttribute('data-recent-key') || '', ev);
        } else if (act === 'recent-preview') {
            ev.stopPropagation();
            if (typeof window.previewRecentUploadedPhoto === 'function') window.previewRecentUploadedPhoto(el.getAttribute('data-lightbox-src') || '', ev);
        } else if (act === 'take-loaded') {
            if (typeof window.takeLoadedPhotoForAssign === 'function') window.takeLoadedPhotoForAssign(el.getAttribute('data-sku') || '', el.getAttribute('data-fid') || '');
        } else if (act === 'select-inbox') {
            if (typeof window.selectInboxPhoto === 'function') window.selectInboxPhoto(el.getAttribute('data-fid') || '');
        } else if (act === 'del-inbox') {
            ev.stopPropagation();
            if (typeof window.deleteInboxPhotoById === 'function') window.deleteInboxPhotoById(el.getAttribute('data-fid') || '', ev);
        } else if (act === 'suggest-sku') {
            ev.stopPropagation();
            if (typeof window.applySuggestedSkuFromInbox === 'function') window.applySuggestedSkuFromInbox(el.getAttribute('data-fid') || '', el.getAttribute('data-suggested-sku') || '', ev);
        } else if (act === 'select-visual') {
            if (typeof window.selectVisualTarget === 'function') window.selectVisualTarget(el.getAttribute('data-visual-key') || '');
        }
    }

    function initFotosApp() {
        try {
            if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
                navigator.serviceWorker.register('./fotos-sw.js', { scope: './fotos-productos' }).catch(() => {});
            }
        } catch (eSw) {}

        document.addEventListener('click', handleDelegatedFotosClick);

        window.addEventListener('beforeinstallprompt', (ev) => {
            ev.preventDefault();
            _deferredFotosInstallPrompt = ev;
            syncFotosInstallAppBtn();
        });
        window.addEventListener('appinstalled', () => {
            _deferredFotosInstallPrompt = null;
            const btn = document.getElementById('btnInstallFotosApp');
            if (btn) btn.classList.add('hidden');
            window.closeFotosInstallModal();
        });
        syncFotosInstallAppBtn();
        bindFotosSplitResizerDrag();
        initFotosBackNav();

        // Sincronización en vivo con el Cotizador, pestañas hermanas y puente de portapapeles con Prompts IA (P1-20 / P1-28)
        const PROMPTS_EMBED_ORIGIN = 'https://buena-espero.onrender.com';
        window.addEventListener('message', async (ev) => {
            if (!ev) return;
            const curOrigin = (window.location && window.location.origin) || '';
            const isSameOrigin = (ev.origin === curOrigin) || (!ev.origin && window.location && window.location.protocol === 'file:');
            const isPromptsOrigin = ev.origin === PROMPTS_EMBED_ORIGIN;
            if (!isSameOrigin && !isPromptsOrigin) return;
            const data = ev.data;
            if (!data || typeof data !== 'object') return;
            if (isPromptsOrigin) {
                if (data.type === 'CREATA_PROMPTS_COPY_IMAGE' && typeof data.dataUrl === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(data.dataUrl)) {
                    try {
                        if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem === 'function') {
                            const blob = await (await fetch(data.dataUrl)).blob();
                            const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' });
                            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                            if (ev.source && typeof ev.source.postMessage === 'function') {
                                ev.source.postMessage({ type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT', ok: true, requestId: data.requestId || '' }, PROMPTS_EMBED_ORIGIN);
                            }
                        }
                    } catch (eClip) {
                        if (ev.source && typeof ev.source.postMessage === 'function') {
                            ev.source.postMessage({ type: 'CREATA_PROMPTS_COPY_IMAGE_RESULT', ok: false, requestId: data.requestId || '' }, PROMPTS_EMBED_ORIGIN);
                        }
                    }
                }
                return;
            }
            handleIncomingPeerMessageInFotos(data);
        });
        try {
            if (typeof BroadcastChannel === 'function') {
                _fotosSyncChannel = new BroadcastChannel(SYNC_BROADCAST_CHANNEL_NAME);
                _fotosSyncChannel.onmessage = (ev) => {
                    handleIncomingPeerMessageInFotos(ev && ev.data);
                };
            }
        } catch (eBc) {
            _fotosSyncChannel = null;
        }
        window.addEventListener('storage', (ev) => {
            if (!ev || !ev.key || !state.unlocked) return;
            if (ev.key === VISUAL_OVERRIDES_STORAGE_KEY) {
                loadVisualOverridesFromLocalStorage();
                if (visualState.workMode !== 'SKU') {
                    renderVisualTargetsList();
                    renderVisualTargetStage();
                } else if (state.selectedSku) {
                    renderSelectedProductStage();
                }
            } else if (ev.key === SAVED_OVERRIDES_STORAGE || ev.key === DELETED_QUEUE_STORAGE) {
                hydrateSavedOverrides();
                runSilentFotosLiveTick('catalog');
            } else if (ev.key === FOTOS_INBOX_SYNC_STORAGE) {
                try {
                    const parsed = ev.newValue ? JSON.parse(ev.newValue) : null;
                    if (parsed && parsed.tabId === FOTOS_TAB_ID) return;
                } catch (eP) {}
                runSilentFotosLiveTick('inbox');
            }
        });

        if (window.CREATA_LOGO_B64) {
            document.querySelectorAll('[data-creata-logo]').forEach((img) => {
                img.src = window.CREATA_LOGO_B64;
            });
        }

        populateDestFolderSelect();
        syncLocalSubirPrenFolderBadge();
        bindSubirPrenDragAndDrop();
        hydrateSavedOverrides();
        hydrateFromFastCache();
        hydrateFromLocalCompressedBundleIfEmpty();
        renderSkuCategoryFilterRow();
        renderSkuLocationFilterRow();
        loadSheetsCatalog();

        const skuInp = document.getElementById('skuSearchInput');
        const clrBtn = document.getElementById('skuSearchClearBtn');
        let skuRaf = 0;
        if (skuInp) {
            skuInp.addEventListener('input', () => {
                const val = skuInp.value || '';
                const wasEmpty = !cleanStr(state.skuSearchQuery);
                state.skuSearchQuery = val;
                if (clrBtn) clrBtn.classList.toggle('hidden', !val.trim());
                if (wasEmpty && Boolean(cleanStr(val))) {
                    syncFotosBackNav('sku_search');
                }
                if (skuRaf) cancelAnimationFrame(skuRaf);
                skuRaf = requestAnimationFrame(() => {
                    state.skuSearchQuery = val;
                    applySkuFiltersAndRender();
                    saveFotosUiCheckpointNow();
                });
            });
            skuInp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    state.skuSearchQuery = skuInp.value || '';
                    applySkuFiltersAndRender();
                    saveFotosUiCheckpointNow();
                    if (state.filteredProducts.length > 0) {
                        window.selectSkuProduct(state.filteredProducts[0].sku);
                    }
                }
            });
        }

        const inboxInp = document.getElementById('inboxSearchInput');
        const inboxClrBtn = document.getElementById('inboxSearchClearBtn');
        let inboxRaf = 0;
        if (inboxInp) {
            inboxInp.addEventListener('input', () => {
                const val = inboxInp.value || '';
                const wasEmpty = !cleanStr(state.inboxSearchQuery);
                state.inboxSearchQuery = val;
                if (inboxClrBtn) inboxClrBtn.classList.toggle('hidden', !val.trim());
                if (wasEmpty && Boolean(cleanStr(val))) {
                    syncFotosBackNav('inbox_search');
                }
                if (inboxRaf) cancelAnimationFrame(inboxRaf);
                inboxRaf = requestAnimationFrame(() => {
                    state.inboxSearchQuery = val;
                    renderInboxGallery();
                    saveFotosUiCheckpointNow();
                });
            });
        }

        const destSel = document.getElementById('destFolderSelect');
        if (destSel) {
            destSel.addEventListener('change', () => saveFotosUiCheckpointNow());
        }

        const markManualScroll = () => { _fotosUserHasScrolled = true; };
        window.addEventListener('touchstart', markManualScroll, { passive: true, once: true });
        window.addEventListener('wheel', markManualScroll, { passive: true, once: true });

        const skuListEl = document.getElementById('skuResultsList');
        let skuScrollTimer = null;
        if (skuListEl) {
            skuListEl.addEventListener('scroll', () => {
                if (!_fotosRestoringCheckpoint) _fotosUserHasScrolled = true;
                if (skuScrollTimer) clearTimeout(skuScrollTimer);
                skuScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        const galEl = document.getElementById('inboxGalleryContainer');
        let galScrollTimer = null;
        if (galEl) {
            galEl.addEventListener('scroll', () => {
                if (!_fotosRestoringCheckpoint) _fotosUserHasScrolled = true;
                if (galScrollTimer) clearTimeout(galScrollTimer);
                galScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        let winScrollTimer = null;
        window.addEventListener('scroll', () => {
            if (!_fotosRestoringCheckpoint && (window.scrollY || 0) > 8) {
                _fotosUserHasScrolled = true;
            }
            if (winScrollTimer) clearTimeout(winScrollTimer);
            winScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
        }, { passive: true });

        window.addEventListener('pagehide', () => saveFotosUiCheckpointNow());
        window.addEventListener('beforeunload', () => saveFotosUiCheckpointNow());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                saveFotosUiCheckpointNow();
            } else if (document.visibilityState === 'visible' && state.unlocked) {
                updateOfflineSyncBanner();
                flushFotosOfflineOutbox();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });
        window.addEventListener('focus', () => {
            if (state.unlocked) {
                updateOfflineSyncBanner();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });

        window.addEventListener('online', () => {
            updateOfflineSyncBanner();
            setFotosLiveStatus('live');
            if (state.unlocked) {
                showAssignFeedback('🌐 Conexión recuperada · sincronizando fotos guardadas...', true);
                flushFotosOfflineOutbox();
                drainPendingDeletedQueueAsync();
                sendFotosPresenceHeartbeat(false);
                triggerThrottledLiveVisibilitySync();
            }
        });

        window.addEventListener('offline', () => {
            updateOfflineSyncBanner();
            setFotosLiveStatus('offline');
            if (state.unlocked) {
                showAssignFeedback('📡 Modo sin conexión · tus fotos se guardarán en el teléfono.', true);
            }
        });

        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                if (!state.unlocked) return;
                if (_fotosBackNav && typeof _fotosBackNav.handleEscape === 'function') {
                    _fotosBackNav.handleEscape();
                } else if (state.lightboxOpen || state.lightboxUrl || !isElHidden('photoLightbox')) {
                    window.closePhotoLightbox();
                } else if (!isElHidden('fotosInstallModal')) {
                    window.closeFotosInstallModal();
                }
            }
        });

        const sess = checkExistingFotosOwnerSession();
        if (sess.valid) {
            state.authToken = sess.authToken || '';
            state.accessKey = sess.accessKey || '';
            state.activeEmail = sess.email || OWNER_EMAIL;
            state.activeDisplayName = sess.nombre || OWNER_DISPLAY_NAME;
            state.activeSheetTab = sess.sheetTab || 'CUENTAS ADMINISTRATIVAS';
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

        try {
            const urlParams = new URLSearchParams(window.location.search || '');
            const isInSuiteEmbed = urlParams.get('embed') === '1' || (typeof window !== 'undefined' && window.parent && window.parent !== window);
            if (document.body) {
                if (isInSuiteEmbed) document.body.classList.add('is-suite-embed');
                if (typeof window.showDirectoryPicker !== 'function') document.body.classList.add('no-local-fs');
            }
            if (urlParams.get('split') === '1') {
                loadFotosSplitPrefs();
                _fotosSplitActive = true;
                applyFotosSplitDomState();
            }
            const initialSkuParam = cleanStr(urlParams.get('sku')).toUpperCase();
            if (initialSkuParam) {
                if (!state.productBySku.has(initialSkuParam)) {
                    upsertProductFromCotizadorPeer(initialSkuParam, null);
                }
                window.selectSkuProduct(initialSkuParam, { skipBackSync: true, fromPeerSync: true });
            }
        } catch (eParam) {}

        // Sincronizar pestaña activa inferior (1. SKU / 2. PRODUCTO / 3. GALERÍA) al hacer scroll en celular
        if (typeof window.addEventListener === 'function' && typeof document.getElementById === 'function') {
            let scrollRaf = 0;
            const syncMobileTabOnScroll = () => {
                scrollRaf = 0;
                const ids = ['secSkuFinder', 'secProductStage', 'secGalleryInbox'];
                let activeId = ids[0];
                const threshold = 140;
                for (let i = 0; i < ids.length; i++) {
                    const sec = document.getElementById(ids[i]);
                    if (sec && typeof sec.getBoundingClientRect === 'function') {
                        const rect = sec.getBoundingClientRect();
                        if (rect.top <= threshold) activeId = ids[i];
                    }
                }
                if (state.activeMobileSection !== activeId) {
                    state.activeMobileSection = activeId;
                    document.querySelectorAll('#mobileFotosJumpBar .mobile-jump-btn').forEach((b) => {
                        b.classList.toggle('active', b.getAttribute('data-jump') === activeId);
                    });
                }
            };
            window.addEventListener('scroll', () => {
                if (scrollRaf) return;
                if (typeof window.requestAnimationFrame === 'function') {
                    scrollRaf = window.requestAnimationFrame(syncMobileTabOnScroll);
                } else {
                    syncMobileTabOnScroll();
                }
            }, { passive: true });
        }

        const visInp = document.getElementById('visualTargetSearchInput');
        const visClr = document.getElementById('visualTargetSearchClearBtn');
        if (visInp) {
            visInp.addEventListener('input', () => {
                visualState.searchQuery = visInp.value || '';
                if (visClr) visClr.classList.toggle('hidden', !visualState.searchQuery.trim());
                renderVisualTargetsList();
            });
        }
        loadVisualOverridesFromLocalStorage();
        rebuildVisualTargetsCatalog();
    }

    // ========================================================================
    // GESTOR DE PORTADAS VISUALES (INICIO), TELAS Y MADERAS (SOLO APP DE FOTOS)
    // Persistido en _INV_PRODUCT_OVERRIDES (VCOV:... / VFAB:... / VWOD:...) sin tocar SKUs ni Hoja 1
    // ========================================================================
    const VISUAL_OVERRIDES_STORAGE_KEY = 'creata_inv_product_overrides_v1';
    const VISUAL_TARGETS_INDEX_STORAGE_KEY = 'creata_visual_targets_index_v1';
    const VISUAL_UPLOAD_DRIVE_FOLDER_ID = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';

    const visualState = {
        workMode: 'SKU', // 'SKU' | 'COVER' | 'FABRIC' | 'WOOD'
        filterMode: 'ALL', // 'ALL' | 'NO_PHOTO' | 'HAS_PHOTO'
        searchQuery: '',
        overridesMap: {},
        covers: [],
        fabrics: [],
        woods: [],
        selectedOverrideKey: '',
        busy: false
    };

    function compactVisualOverrideKeyFotos(prefix, rawKey) {
        const clean = String(rawKey || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9_ -]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return '';
        const full = prefix + clean;
        if (full.length <= 58) return full;
        let h = 2166136261;
        for (let i = 0; i < clean.length; i++) {
            h ^= clean.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        const hash8 = (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
        const maxStem = Math.max(8, 50 - prefix.length);
        return prefix + clean.slice(0, maxStem).trim() + '_' + hash8;
    }

    const DEFAULT_WOOD_SWATCHES_FOTOS = (function buildDefaultWoodSwatchesFotos() {
        const pairs = [
            ['BELLOTA ARTEX', '1jmUL8QeEN7ZneS0Od9zd2O89yn1HJeNV'],
            ['CAMEL ARTC', '1tvAuI_UncBB5g_gioiblyOkL7VxAVC0y'],
            ['ESPIGA ATX', '1x7MiM15EuEDZ1JOiO3sg7Bm_xDefsR7n'],
            ['GINGER SKANOR', '1hOlPkHT9G6snRpcCs83Vqj8x7ZkAvglY'],
            ['HABANO ATX', '17wdbsUu5c2oIXGLFCmZ2_ijL9AXPzjtn'],
            ['MADERA KASAM', '1lregsGb_cffKVFOO9INpSCUzTmv96Dnr'],
            ['NOCHE ATX', '1rtGHK0czW7DIEX3uW-eTAb9wUt2347FW'],
            ['NOGAL CHAVOYA', '1g79_faoLRWwXT-Xo3va33E8LqceOdK71'],
            ['NOGAL SKANOR', '1S63fCXcQnciqACYzX4_c2O6GWjJDTnrM'],
            ['NOGAL YOI', '1oV-AD6PW9KrZvSNHRcUDTkedcIEO_1I2'],
            ['NUEZ MOBEL INN', '1bYK_yd_FxB068b6xa5lPnWywr7qKsrZS'],
            ['PALO DE ROSA SKANOR', '17EPrJrIXuW8JiUajsZJXlyHgGt8Ur5dT'],
            ['PAROTA BARSA', '1pTmpK3UJhRwVILV9jnwhfDM7VUG57fQ5'],
            ['PAROTA BLOQUEART', '1_MqpkKNHRxTY60Q7z_yHe6mLSMMGAs0X'],
            ['PAROTA CASA AURA', '1jzVG_TQb0vo3wqDVK_rG3eOpJPOfgD9k'],
            ['PAROTA MOBEL INN', '1xe8pC3qjn6PwRMuOWuEvAAEGqsXS61gS'],
            ['PAROTA REVICA', '15MFirKRhBxEI5a95ORFpPc5d3cFlImh3'],
            ['PAROTA SKANOR', '1IIS0teeWDXTAvOjt_9wad16hgdKBr21L'],
            ['PAROTA VANGARDI', '1ZNz_5OyESFMDTEGDCsSA9VajsJ_20niR'],
            ['PAROTA YOI', '1PyY2qKpl0DcWSb-z9Ro0XHHGnhE-i61E'],
            ['ROSA MORADA ACEITE WHITE LUX', '1F8BXPaq8c7hsHsceNBKcBn4qibtSfX-5'],
            ['ROSA MORADA BARSA', '11mtWQdUDna0NY7H8ByqsDcirfM0vlc7J'],
            ['ROSA MORADA CHAVOYA', '1VPiMBn-fkzTWUDXOfkZiflVpopMHB7A0'],
            ['ROSA MORADA CLARA LUIS PEDRO', '1HsvWAhnrYYmh4onu1_MKaLCdq_ttvbEg'],
            ['ROSA MORADA LUX FACTORI', '1bQAXEl8vKmHCNZrojNgiFpo1lYXtZEqT'],
            ['ROSA MORADA MR FURNITURE', '1zwJMUcnJ-6HaL3YkfmTHBy9vEBnk4a2U'],
            ['ROSA MORADA YOI', '1q9h-KKXsLWV1ayMsjnalnsGA5j5OVU-W'],
            ['TABACO ARTEX', '1vmrA0h1ZS1fYHMCAgBuKX13jBvMowaK1'],
            ['TABACO CLARO BARSA', '1MdGLIMP-TdIyuqUgCpflwO7K_8SXUA4V'],
            ['TACUBA ARTEX', '1z6v5DsNBTui5-tqj8u17sj8H_bVRcnkm'],
            ['TECA ENTINTADO SKANOR', '1ZnbTMhNvEKRLDst1qnvJD-gunLHeHlaF'],
            ['TECA SKANOR', '1V-79ezpoTDDAd8cDwzp89lfoSMJoN9Ox'],
            ['TZALAM BARSA', '1Ssl8rC2jS1geqEG_monA6EzjZ_1XNC-_'],
            ['TZALAM CHAVOYA', '1GcCznfI3-X62IiV1Cz1wnE5H2hAuGZ7i']
        ];
        const map = {};
        for (let i = 0; i < pairs.length; i++) {
            const name = pairs[i][0];
            const fid = pairs[i][1];
            const key = compactVisualOverrideKeyFotos('VWOD:', name);
            if (!key) continue;
            map[key] = {
                sku: key,
                status: 'VISIBLE',
                name: name,
                category: 'WOOD_SWATCH',
                note: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing'
            };
        }
        return map;
    })();

    const FOTOS_WOOD_SPECIES_CORE_RE = /\b(ROSA\s+MORADA|PAROTA|TZALAM|NOGAL|TECA|ENCINO|ROBLE|CEDRO|PINO|CAOBA|FRESNO|HAYA|OKUME|MAPLE|ABEDUL|PALO\s+DE\s+ROSA|MADERA|CHAPA|MELAMINA|MDF|TRIPLAY|ALAMO|BANAK|PRIMAVERA|CEREZO|EBANO|WENGUE|BAMBU)\b/i;
    const FOTOS_WOOD_FINISH_RE = /\b(TABACO|TACUBA|BELLOTA|ESPIGA|HABANO|CAMEL|GINGER|NOCHE|NUEZ)\b/i;
    const FOTOS_WOOD_PROVIDER_RE = /\b(BARSA|YOI|SKANOR|CHAVOYA|ARTEX|ATX|ARTC|KASAM|MOBEL\s+INN|BLOQUEART|CASA\s+AURA|REVICA|VANGARDI|LUX\s+FACTOR[IY]|LUIS\s+PEDRO|MR\s+FURNITURE)\b/i;
    const FOTOS_NON_WOOD_ONLY_RE = /^(MARMOL|MARBOL|TRAVERTINO|ONIX|PIEDRA|GRANITO|CUARZO|CRISTAL|VIDRIO|ESPEJO|METAL|ACERO|ALUMINIO|HIERRO|HERRERIA|LATON|BRONCE|COBRE|CERAMICA|PORCELANA|PORCELANATO|RESINA|PLASTICO|POLIPROPILENO|RATAN|RATTAN|MIMBRE|CUERDA|SOGA|FIBRA|CONCRETO|CEMENTO|N\/A|NA|NO APLICA|NINGUNA|NINGUNO|SIN MADERA|-)$/i;
    const FOTOS_WOOD_ALLOWED_TOKENS = new Set([
        'ROSA', 'MORADA', 'PAROTA', 'TZALAM', 'NOGAL', 'TECA', 'ENCINO', 'ROBLE', 'CEDRO', 'PINO',
        'CAOBA', 'FRESNO', 'HAYA', 'OKUME', 'MAPLE', 'ABEDUL', 'PALO', 'TABACO', 'TACUBA', 'BELLOTA',
        'ESPIGA', 'HABANO', 'MADERA', 'CHAPA', 'MELAMINA', 'MDF', 'TRIPLAY', 'ALAMO', 'BANAK',
        'PRIMAVERA', 'CEREZO', 'EBANO', 'WENGUE', 'BAMBU', 'CAMEL', 'GINGER', 'NOCHE', 'NUEZ',
        'TONO', 'NATURAL', 'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'MATE', 'SEMI', 'BRILLANTE',
        'SATIN', 'SATINADO', 'SATINADA', 'ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'BLANCO',
        'BLANCA', 'NEGRO', 'NEGRA', 'CAFE', 'CHOCOLATE', 'MIEL', 'AHUMADO', 'AHUMADA', 'NOGALADO',
        'AVELLANA', 'CARAMELO', 'CENIZA', 'GRIS', 'BEIGE', 'DORADO', 'LACA', 'BARNIZ', 'ACABADO',
        'CEPILLADO', 'RUSTICO', 'RUSTICA', 'SOLIDA', 'SOLIDO', 'MACIZA', 'MACIZO', 'EN', 'CON',
        'SIN', 'DE', 'AL', 'DEL', 'LA', 'EL', 'Y', 'BASE', 'PATAS', 'CUBIERTA',
        'BARSA', 'YOI', 'SKANOR', 'CHAVOYA', 'ARTEX', 'ATX', 'ARTC', 'KASAM', 'MOBEL', 'INN',
        'BLOQUEART', 'CASA', 'AURA', 'REVICA', 'VANGARDI', 'LUX', 'FACTORI', 'FACTORY', 'LUIS',
        'PEDRO', 'MR', 'FURNITURE', 'HAKO', 'KAI', 'CREATA', 'MOBA', 'MONTE'
    ]);

    function isPureWoodDescriptorFotos(rawText) {
        const norm = plainVisToken(rawText);
        if (!norm) return false;
        const hasCore = FOTOS_WOOD_SPECIES_CORE_RE.test(norm) || (FOTOS_WOOD_FINISH_RE.test(norm) && FOTOS_WOOD_PROVIDER_RE.test(norm));
        if (!hasCore) return false;
        const toks = norm.split(/\s+/).filter(Boolean);
        return toks.length > 0 && toks.every((t) => FOTOS_WOOD_ALLOWED_TOKENS.has(t));
    }

    function plainVisToken(raw) {
        return String(raw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizePlainLowerVis(raw) {
        return String(raw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cleanFabricVariationNameFotos(rawText) {
        let s = plainVisToken(String(rawText || '').replace(/\b\d+(?:\.\d+)?\s*(?:X|×)\s*\d+(?:\.\d+)?(?:\s*(?:X|×)\s*\d+(?:\.\d+)?)?\s*(?:CM|MM|M|MTS)?\b/gi, ' '));
        if (!s) return '';
        s = s.replace(/\s*(?:\/|\||·)?\s*\bCOORD\.?\b[\s\S]*$/i, '').trim();
        s = s.replace(/^(?:(?:CON|SIN)\s+BRAZOS?\s+|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)\s+|(?:DERECHO|DEREHO|IZQUIERDO|DER|IZQ|CENTRAL|MODULAR|IND|INV|TELA|3P|2P|1P)\s+)+/i, '').trim();
        s = s.replace(/^(?:DE|DEL|EN|CON|LA|EL)\s+/i, '').trim();
        return s.replace(/\s+/g, ' ').trim();
    }

    function loadVisualOverridesFromLocalStorage() {
        try {
            const raw = localStorage.getItem(VISUAL_OVERRIDES_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    visualState.overridesMap = parsed;
                    return;
                }
            }
        } catch (e) {}
        visualState.overridesMap = {};
    }

    function saveVisualOverridesToLocalStorage() {
        try {
            localStorage.setItem(VISUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(visualState.overridesMap || {}));
        } catch (eQuota) {
            try {
                const slim = {};
                const src = visualState.overridesMap || {};
                Object.keys(src).forEach((k) => {
                    const entry = src[k];
                    if (!entry) return;
                    const note = String(entry.note || '');
                    slim[k] = note.indexOf('data:image/') === 0
                        ? Object.assign({}, entry, { note: entry.localFileId || '' })
                        : entry;
                });
                localStorage.setItem(VISUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(slim));
            } catch (e2) {}
        }
    }

    function getVisualOverridePhotoUrlInFotos(overrideKey) {
        const k = String(overrideKey || '').trim().toUpperCase();
        if (!k) return '';
        if (visualState.overridesMap && Object.prototype.hasOwnProperty.call(visualState.overridesMap, k)) {
            const ovr = visualState.overridesMap[k];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') return '';
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl) return '';
            return (/^https?:\/\//i.test(rawUrl) || /^data:image\//i.test(rawUrl)) ? rawUrl : '';
        }
        if (k.indexOf('VWOD:') === 0 && DEFAULT_WOOD_SWATCHES_FOTOS[k]) {
            return cleanStr(DEFAULT_WOOD_SWATCHES_FOTOS[k].note);
        }
        return '';
    }

    function resolveVisualThumbSrcInFotos(rawUrl, sizePx) {
        const u = cleanStr(rawUrl);
        if (!u) return '';
        if (/^data:image\//i.test(u)) return u;
        const fid = extractDriveFileId(u);
        if (fid) return 'https://lh3.googleusercontent.com/d/' + fid + '=w' + (Number(sizePx) || 400);
        return /^https?:\/\//i.test(u) ? u : '';
    }

    function broadcastVisualOverrideUpdateToCotizador(overrideKey, overrideObj, deleted) {
        const msg = {
            type: 'CREATA_VISUAL_OVERRIDE_SAVED',
            source: 'fotos',
            tabId: FOTOS_TAB_ID,
            overrideKey: String(overrideKey || '').trim().toUpperCase(),
            override: deleted ? null : (overrideObj || null),
            deleted: !!deleted,
            ts: Date.now()
        };
        try {
            if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage(msg, '*');
            }
        } catch (e) {}
        try {
            const splitFrame = document.getElementById('fotosSplitCotizadorFrame');
            if (splitFrame && splitFrame.contentWindow && typeof splitFrame.contentWindow.postMessage === 'function') {
                splitFrame.contentWindow.postMessage(msg, '*');
            }
        } catch (e2) {}
        try {
            if (_fotosSyncChannel) _fotosSyncChannel.postMessage(msg);
        } catch (e3) {}
    }

    const FOTOS_VFAB_GENERIC_SINGLE_TOKENS = new Set([
        'TELA', 'COLOR', 'ESTANDAR', 'CLARO', 'OSCURO', 'NATURAL', 'MEDIO', 'LINO', 'PIEL',
        'BEIGE', 'BLANCO', 'BLANCA', 'WHITE', 'NEGRO', 'NEGRA', 'BLACK',
        'GRIS', 'GREY', 'GRAY', 'AZUL', 'BLUE', 'VERDE', 'GREEN',
        'ROJO', 'ROJA', 'RED', 'CAFE', 'BROWN', 'MARRON', 'ARENA', 'SAND',
        'CREMA', 'CREAM', 'HUESO', 'BONE', 'IVORY', 'MARFIL',
        'DORADO', 'ORO', 'GOLD', 'PLATA', 'SILVER', 'BRONCE', 'ROSA', 'PINK',
        'TERRACOTA', 'TAUPE', 'CAMEL', 'CHOCOLATE', 'OLIVO', 'OLIVE',
        'MOSTAZA', 'MUSTARD', 'OCRE', 'CRUDO', 'PERLA', 'PEARL',
        'SNOW', 'FLAX', 'ECRU', 'OAT', 'TOAST', 'ALABASTER', 'PIEDRA', 'STONE'
    ]);

    function getUploadedFabricEntriesInFotos() {
        const out = [];
        const map = visualState.overridesMap || {};
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i++) {
            const k = String(keys[i] || '').trim().toUpperCase();
            if (!k || k.indexOf('VFAB:') !== 0) continue;
            const ovr = map[keys[i]];
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') continue;
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl || (!/^https?:\/\//i.test(rawUrl) && !/^data:image\//i.test(rawUrl))) continue;
            const rawName = cleanStr(ovr.name || k.slice(5));
            let label = cleanFabricVariationNameFotos(rawName) || rawName;
            const rawTokens = plainVisToken(rawName).split(' ').filter((w) => w.length >= 2);
            let tokens = plainVisToken(label).split(' ').filter((w) => w.length >= 2);
            if (tokens.length === 1 && FOTOS_VFAB_GENERIC_SINGLE_TOKENS.has(tokens[0]) && rawTokens.length >= 2) {
                label = rawName;
                tokens = rawTokens;
            }
            const strippedWood = plainVisToken(label)
                .replace(/\bROSA\s+MORADA(?:\s+(?:TONO\s+)?(?:NATURAL|BARSA|YOI|CHAVOYA|CLARA|OSCURA|NOGAL))?\b/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (strippedWood) {
                tokens = strippedWood.split(' ').filter((w) => w.length >= 2);
            }
            if (!tokens.length) continue;
            out.push({
                overrideKey: k,
                label: rawName.toUpperCase(),
                url: rawUrl,
                plain: tokens.join(' '),
                sortedKey: tokens.slice().sort().join(' '),
                tokens: tokens
            });
        }
        return out;
    }

    function findMatchingUploadedFabricForProduct(prod) {
        if (!prod) return null;
        const tlClean = cleanStr(prod.tl);
        const ctClean = cleanStr(prod.ct);
        const hasRealFabricCols = Boolean(
            (tlClean && !isPureWoodDescriptorFotos(tlClean)) ||
            (ctClean && !isPureWoodDescriptorFotos(ctClean))
        );
        if (!hasRealFabricCols) {
            const catTok = plainVisToken(prod.categoria || '');
            const typeNameTok = plainVisToken(cleanStr(prod.tipo || '') + ' ' + cleanStr(prod.displayName || prod.colBName || ''));
            const hasUph = /\b(SILLA|SILLON|SOFA|SALA|LOVESEAT|LOVE\s+SEAT|MODULAR|CHAISE|COJIN|COJINES|CABECERA|CAMA|BANCO|TABURETE|PERIQUERA|POUF|PUF|OTTOMAN|OTOMAN|CAMASTRO|TAPIZ|TELA|PIEL|LINO|BOUCLE|VELVET|TERCIOPELO|CHENILLE|BAUL)\b/i.test(typeNameTok);
            if (!hasUph && (catTok === 'MESAS' || catTok === 'MESAS DE CENTRO LATERALES' || catTok === 'BUFETERAS CREDENZAS' || catTok === 'ILUMINACION' || catTok === 'ESPEJOS ARTE' || /\b(MESA|COMEDOR|CREDENZA|BUFETERA|BURO|CONSOLA|ESCRITORIO|LIBRERO|MUEBLE\s+TV|PEDESTAL|BASE|CUBIERTA|ESPEJO|CUADRO|LAMPARA|CANDIL|ARBOTANTE|MACETA|FLORERO|JARRON|FOLLAJE|BOTELLA|ESCULTURA|RELOJ)\b/i.test(typeNameTok))) {
                return null;
            }
        }
        const entries = getUploadedFabricEntriesInFotos();
        if (!entries.length) return null;

        const candidates = [];
        const addCand = (raw) => {
            if (isPureWoodDescriptorFotos(raw)) return;
            const c = cleanFabricVariationNameFotos(raw);
            if (c && !isPureWoodDescriptorFotos(c) && candidates.indexOf(c) === -1) candidates.push(c);
        };
        if (prod.tl && prod.ct) addCand(prod.tl + ' ' + prod.ct);
        addCand(prod.tl);
        if (prod.variante) {
            String(prod.variante).split(/\s*[·|\/]\s*/).forEach(addCand);
        }
        if (prod.acabado) {
            String(prod.acabado).split(/\s*[·|\/]\s*/).forEach(addCand);
        }
        addCand(prod.ct);
        if (!candidates.length) return null;

        // 1) Exact VFAB override key match
        for (let i = 0; i < candidates.length; i++) {
            const k = compactVisualOverrideKeyFotos('VFAB:', candidates[i]);
            const exact = entries.find((e) => e.overrideKey === k);
            if (exact) return exact;
        }
        // 2) Exact plain or word-order-independent match
        for (let i = 0; i < candidates.length; i++) {
            const cTokens = plainVisToken(candidates[i]).split(' ').filter((w) => w.length >= 2);
            if (!cTokens.length) continue;
            const cPlain = cTokens.join(' ');
            const cSorted = cTokens.slice().sort().join(' ');
            const hit = entries.find((e) => e.plain === cPlain || e.sortedKey === cSorted);
            if (hit) return hit;
        }
        // 3) Subset match (uploaded fabric tokens contained in product fabric or vice-versa)
        let best = null;
        let bestScore = 0;
        for (let i = 0; i < candidates.length; i++) {
            const cTokens = plainVisToken(candidates[i]).split(' ').filter((w) => w.length >= 2);
            if (!cTokens.length) continue;
            if (cTokens.every((t) => FOTOS_WOOD_ALLOWED_TOKENS.has(t))) continue;
            const cSet = new Set(cTokens);
            for (let j = 0; j < entries.length; j++) {
                const e = entries[j];
                if (e.tokens.length === 1 && FOTOS_VFAB_GENERIC_SINGLE_TOKENS.has(e.tokens[0])) continue;
                const eSet = new Set(e.tokens);
                const allEntryInCand = e.tokens.every((t) => cSet.has(t));
                const allCandInEntry = cTokens.length >= 2 && cTokens.every((t) => eSet.has(t));
                if (allEntryInCand || allCandInEntry) {
                    const score = (allEntryInCand ? e.tokens.length * 10 : cTokens.length * 8) - Math.abs(e.tokens.length - cTokens.length);
                    if (score > bestScore) {
                        bestScore = score;
                        best = e;
                    }
                }
            }
        }
        return best;
    }

    const NON_WOOD_MATERIAL_ONLY_RE_FOTOS = /^(MARMOL|MARBOL|TRAVERTINO|ONIX|PIEDRA|GRANITO|CUARZO|CRISTAL|VIDRIO|ESPEJO|METAL|ACERO|ALUMINIO|HIERRO|HERRERIA|LATON|BRONCE|COBRE|CERAMICA|PORCELANA|PORCELANATO|RESINA|PLASTICO|POLIPROPILENO|RATAN|RATTAN|MIMBRE|CUERDA|SOGA|FIBRA|CONCRETO|CEMENTO|PINO|PINO\s+ESTUFADO|MADERA\s+DE\s+PINO|MDF|TRIPLAY|CONTRACHAPADO|AGLOMERADO|POLIESTER|ESPUMA|DELCRON|N\/A|NA|NO APLICA|NINGUNA|NINGUNO|SIN MADERA|-)$/i;
    const WOOD_PROVIDER_RE_FOTOS = /^(?:BARSA|ARTEX|ATX|ARTC|BGA|COSTA|CRISS|DIANA|DILU|DISE|DUKE|HAKO|HEMA|INHABIT|KASA|KUA|LUX|FACTORI|FACTORY|MARMOL|MOBEL|INN|MUEBLES|NORDICO|NOVO|OAXACA|PACIFICO|PALMA|QUINTA|RIVIERA|SOLARIS|TULUM|VALENCIA|VENECIA)$/i;
    const WOOD_FILLER_TOKENS_FOTOS = new Set(['MADERA', 'DE', 'EN', 'CON', 'TONO', 'NATURAL', 'ACABADO', 'LACA', 'BARNIZ', 'BASE', 'PATAS', 'CUBIERTA', 'SOLIDA', 'SOLIDO', 'MACIZA', 'MACIZO', 'CHAPA', 'LAMINADO', 'LAMINADA', 'ENCHAPADO', 'ENCHAPADA']);
    const WOOD_SPECIAL_FINISH_TOKENS_FOTOS = new Set(['ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'CLARA', 'CLARO', 'OSCURO', 'OSCURA']);
    const WOOD_MODIFIER_ONLY_TOKENS_FOTOS = new Set([
        'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'OBSCURO', 'OBSCURA',
        'ENTINTADO', 'ENTINTADA', 'ACEITE', 'WHITE', 'BLANCO', 'BLANCA',
        'NEGRO', 'NEGRA', 'GRIS', 'BEIGE', 'CAFE', 'NATURAL', 'TONO',
        'LACA', 'MATTE', 'MATE', 'BARNIZ', 'BRILLANTE', 'SEMI', 'CARDEADO', 'BLANQUEADO'
    ]);

    function expandWoodProviderAliasesFotos(provRaw) {
        const p = plainVisToken(provRaw);
        if (!p) return [];
        const out = new Set(p.split(/\s+/).filter((t) => t.length >= 2));
        if (p.indexOf('ARTEX') !== -1 || p === 'ATX' || p === 'ARTC') {
            out.add('ARTEX');
            out.add('ATX');
            out.add('ARTC');
        }
        if (p.indexOf('LUX') !== -1) {
            out.add('LUX');
            out.add('FACTORI');
            out.add('FACTORY');
        }
        if (p.indexOf('MOBEL') !== -1) {
            out.add('MOBEL');
            out.add('INN');
        }
        return Array.from(out);
    }

    function normalizeWoodCanonicalTextFotos(raw) {
        return plainVisToken(raw)
            .replace(/\bFACTORY\b/g, 'FACTORI')
            .replace(/\b(?:TEKA|TEAK)\b/g, 'TECA')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function findMatchingUploadedWoodForProduct(prod) {
        if (!prod) return null;
        const catTok = plainVisToken(prod.categoria || '');
        const nameTok = plainVisToken(prod.displayName || prod.colBName || '');
        const typeNameTok = plainVisToken(cleanStr(prod.tipo || '') + ' ' + nameTok);
        const visibleWoodInNameRe = /\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE|FRESNO|CEDRO|CAOBA|OLMO|HAYA|TABACO|TACUBA|BELLOTA|HABANO|ESPIGA|GINGER|CAMEL|NOCHE|NUEZ|MADERA|PATA(?:S)?\s+DE\s+MADERA|BASE\s+(?:EN\s+)?MADERA)\b/i;
        if (/^(COJINES\s+TEXTILES|TEXTILES|ROPA\s+DE\s+CAMA|TAPETES|ALFOMBRAS|COLCHONES|BLANCOS)$/i.test(catTok) || /\b(COJIN|COJINES|FUNDA|FUNDAS|ALMOHADON|SABANA|DUVET|MANTEL|HILO|CONO\s+DE\s+HILO|TOALLA|TAPETE|ALFOMBRA|COLCHON|CORTINA)\b/i.test(typeNameTok)) {
            return null;
        }
        if (/\b(SALA|SALAS|SOFA|SOFAS|SOFACAMA|SOFA\s+CAMA|MODULAR|SECCIONAL|ESCUADRA|LOVESEAT|LOVE\s+SEAT|CHAISE|ESQUINERO|FUTON|FUTTON)\b/i.test(catTok + ' ' + typeNameTok) && !visibleWoodInNameRe.test(nameTok)) {
            return null;
        }

        const md = cleanStr(prod.md);
        const cm = cleanStr(prod.cm);
        const prov = cleanStr(prod.proveedor || prod.p);
        const mdNorm = plainVisToken(md);
        const cmNorm = plainVisToken(cm);
        if (mdNorm && NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(mdNorm) && (!cmNorm || NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(cmNorm))) {
            return null;
        }
        if (/^(?:LACA\s+)?(?:NEGR[OA]|BLANC[OA])$/i.test(cmNorm) && /\b(?:PATA(?:S)?\s+NEGR[OA]S?|LACA\s+(?:NEGR[OA]|BLANC[OA]))\b/i.test(nameTok) && !visibleWoodInNameRe.test(nameTok)) {
            return null;
        }

        const map = visualState.overridesMap || {};
        const woodEntries = [];
        const seenKeys = new Set();
        const addWoodEntry = (k, ovr, isDefault) => {
            if (!k || seenKeys.has(k)) return;
            if (!ovr || ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO') return;
            const rawUrl = cleanStr(ovr.note);
            if (!rawUrl || (!/^https?:\/\//i.test(rawUrl) && !/^data:image\//i.test(rawUrl))) return;
            const label = cleanStr(ovr.name || k.slice(5)).toUpperCase();
            const normName = normalizeWoodCanonicalTextFotos(label);
            const tokens = normName.split(/\s+/).filter((w) => w.length >= 2);
            if (!normName || !tokens.length) return;
            seenKeys.add(k);
            woodEntries.push({
                overrideKey: k,
                label: label,
                url: rawUrl,
                normName: normName,
                tokens: tokens,
                tokenSet: new Set(tokens),
                sortedSig: tokens.slice().sort().join(' '),
                isDefault: !!isDefault
            });
        };
        Object.keys(map).forEach((rk) => {
            const k = String(rk || '').trim().toUpperCase();
            if (k.indexOf('VWOD:') === 0) addWoodEntry(k, map[rk], false);
        });
        Object.keys(DEFAULT_WOOD_SWATCHES_FOTOS).forEach((dk) => {
            const ovr = Object.prototype.hasOwnProperty.call(map, dk) ? map[dk] : null;
            if (ovr && (ovr.status === 'ELIMINADO' || ovr.status === 'ARCHIVADO')) return;
            addWoodEntry(dk, (ovr && cleanStr(ovr.note)) ? ovr : DEFAULT_WOOD_SWATCHES_FOTOS[dk], !ovr);
        });
        if (!woodEntries.length) return null;
        woodEntries.sort((a, b) => (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (b.tokens.length - a.tokens.length) || a.label.localeCompare(b.label));

        const provAliases = expandWoodProviderAliasesFotos(prov);
        const provNorm = plainVisToken(prov);

        const matchCandidate = (rawCand) => {
            const cleanRaw = cleanStr(rawCand);
            if (!cleanRaw || NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(plainVisToken(cleanRaw))) return null;
            const normCand = normalizeWoodCanonicalTextFotos(cleanRaw);
            if (!normCand || normCand === 'ESTANDAR' || normCand === 'MADERA' || normCand === 'NATURAL' || normCand === 'TONO NATURAL') return null;

            const directTries = [];
            if (provNorm && normCand.indexOf(provNorm) === -1) directTries.push(normCand + ' ' + provNorm);
            directTries.push(cleanRaw, normCand);
            for (let d = 0; d < directTries.length; d++) {
                const dk = compactVisualOverrideKeyFotos('VWOD:', directTries[d]);
                const exact = woodEntries.find((e) => e.overrideKey === dk);
                if (exact) return exact;
            }

            const candTokens = normCand.split(/\s+/).filter((t) => t.length >= 2);
            const coreCandTokens = candTokens.filter((t) => !WOOD_FILLER_TOKENS_FOTOS.has(t));
            if (!coreCandTokens.length) return null;
            const nonProvCore = coreCandTokens.filter((t) => !provAliases.includes(t) && !WOOD_PROVIDER_RE_FOTOS.test(t));
            if (!nonProvCore.length || nonProvCore.every((t) => WOOD_MODIFIER_ONLY_TOKENS_FOTOS.has(t))) return null;

            const candSet = new Set(candTokens);
            const candSortedSig = candTokens.slice().sort().join(' ');
            const candWantsSpecial = candTokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t));

            for (let i = 0; i < woodEntries.length; i++) {
                const e = woodEntries[i];
                if (e.normName === normCand || e.sortedSig === candSortedSig) return e;
            }

            const subsetOfCand = woodEntries.filter((e) => e.tokens.every((tok) => candSet.has(tok)));
            if (subsetOfCand.length) {
                subsetOfCand.sort((a, b) => {
                    const aProv = provAliases.some((p) => a.tokenSet.has(p)) ? 0 : 1;
                    const bProv = provAliases.some((p) => b.tokenSet.has(p)) ? 0 : 1;
                    if (aProv !== bProv) return aProv - bProv;
                    return b.tokens.length - a.tokens.length;
                });
                return subsetOfCand[0];
            }

            const matchingEntries = woodEntries.filter((e) => coreCandTokens.every((tok) => e.tokenSet.has(tok)));
            if (matchingEntries.length) {
                matchingEntries.sort((a, b) => {
                    const aProv = provAliases.length && provAliases.some((p) => a.tokenSet.has(p)) ? 0 : 1;
                    const bProv = provAliases.length && provAliases.some((p) => b.tokenSet.has(p)) ? 0 : 1;
                    if (aProv !== bProv) return aProv - bProv;
                    const aSpec = (!candWantsSpecial && a.tokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t))) ? 1 : 0;
                    const bSpec = (!candWantsSpecial && b.tokens.some((t) => WOOD_SPECIAL_FINISH_TOKENS_FOTOS.has(t))) ? 1 : 0;
                    if (aSpec !== bSpec) return aSpec - bSpec;
                    return (a.isDefault === b.isDefault ? 0 : (a.isDefault ? 1 : -1)) || (a.tokens.length - b.tokens.length);
                });
                return matchingEntries[0];
            }

            if (coreCandTokens.length >= 2) {
                const speciesOnly = coreCandTokens.filter((t) => !provAliases.includes(t) && !WOOD_PROVIDER_RE_FOTOS.test(t));
                if (speciesOnly.length > 0 && speciesOnly.length < coreCandTokens.length) {
                    return matchCandidate(speciesOnly.join(' '));
                }
            }
            return null;
        };

        const cands = [];
        const mdOk = Boolean(md && !NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(mdNorm));
        const cmOk = Boolean(cm && !NON_WOOD_MATERIAL_ONLY_RE_FOTOS.test(cmNorm));
        if (mdOk && cmOk && cmNorm.indexOf(mdNorm) === -1) {
            if (provNorm && (mdNorm + ' ' + cmNorm).indexOf(provNorm) === -1) cands.push(md + ' ' + cm + ' ' + prov);
            cands.push(md + ' ' + cm);
        }
        if (cmOk) {
            if (provNorm && cmNorm.indexOf(provNorm) === -1) cands.push(cm + ' ' + prov);
            cands.push(cm);
        }
        if (mdOk) {
            if (provNorm && mdNorm.indexOf(provNorm) === -1) cands.push(md + ' ' + prov);
            cands.push(md);
        }
        if (prod.variante) String(prod.variante).split(/\s*[·|\/]\s*/).forEach((p) => { if (isPureWoodDescriptorFotos(p)) cands.push(p); });
        if (prod.acabado) String(prod.acabado).split(/\s*[·|\/]\s*/).forEach((p) => { if (isPureWoodDescriptorFotos(p)) cands.push(p); });

        const tried = new Set();
        for (let i = 0; i < cands.length; i++) {
            const c = cleanStr(cands[i]);
            if (!c || tried.has(c)) continue;
            tried.add(c);
            const hit = matchCandidate(c);
            if (hit && hit.url) return hit;
        }

        if (!md && !cm && nameTok) {
            const spMatch = nameTok.match(/\b(ROSA\s+MORADA|PALO\s+DE\s+ROSA|PAROTA|TZALAM|NOGAL|TECA|TEKA|TEAK|ENCINO|ROBLE)\b/i);
            if (spMatch && spMatch[1]) {
                const hit = matchCandidate(spMatch[1]);
                if (hit && hit.url) return hit;
            }
        }
        return null;
    }

    async function syncVisualOverridesFromCloudInFotos(opts) {
        const isSilent = !!(opts && opts.silent);
        if (!isSilent) loadVisualOverridesFromLocalStorage();
        if (!state.unlocked) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        try {
            const auth = buildOwnerAuthPayload();
            const res = await callWebAppPost('inv_product_overrides_get', Object.assign({}, auth), 18000);
            if (res && res.ok && res.overrides && typeof res.overrides === 'object') {
                const pendingVis = {};
                readFotosOfflineOutbox().forEach((entry) => {
                    if (entry && entry.type === 'visual_override_upload' && entry.overrideKey) {
                        const k = String(entry.overrideKey).trim().toUpperCase();
                        if (visualState.overridesMap && visualState.overridesMap[k]) {
                            pendingVis[k] = visualState.overridesMap[k];
                        }
                    }
                });
                const nextMap = Object.assign({}, res.overrides, pendingVis);
                const nextVisFp = computeVisualFingerprint(nextMap);
                const visChanged = !isSilent || !_lastVisualFingerprint || nextVisFp !== _lastVisualFingerprint;
                _lastVisualFingerprint = nextVisFp;
                visualState.overridesMap = nextMap;
                if (visChanged) {
                    saveVisualOverridesToLocalStorage();
                    invalidateLoadedPhotosCache();
                    if (visualState.workMode !== 'SKU') {
                        renderVisualTargetsList();
                        renderVisualTargetStage();
                    } else if (state.selectedSku) {
                        renderSelectedProductStage();
                    }
                    if (state.galleryMode === 'LOADED') {
                        renderInboxGallery();
                    } else {
                        renderRecentUploadedStrip();
                    }
                }
            }
        } catch (e) {}
    }

    function buildFallbackVisualTargetsFromProducts() {
        const coversMap = new Map();
        const fabricsMap = new Map();
        const woodsMap = new Map();
        const packItems = [];
        try {
            if (typeof window !== 'undefined' && Array.isArray(window.CREATA_INV_DATA)) {
                for (let i = 0; i < window.CREATA_INV_DATA.length; i++) {
                    const it = window.CREATA_INV_DATA[i];
                    if (it && it.s) packItems.push(it);
                }
            }
        } catch (e) {}

        const sourceList = [];
        const seenSkus = new Set();
        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (!p || !p.sku) continue;
            seenSkus.add(p.sku.toUpperCase());
            sourceList.push({
                s: p.sku,
                n: p.displayName || p.colBName || p.sku,
                c: p.categoria || '',
                tp: p.tipo || '',
                mo: p.modelo || '',
                p: p.proveedor || '',
                vr: p.variante || '',
                tl: p.tl || '',
                ct: p.ct || '',
                md: p.md || '',
                cm: p.cm || '',
                f: p.photoUrl || ''
            });
        }
        for (let i = 0; i < packItems.length; i++) {
            const it = packItems[i];
            const k = String(it.s || '').toUpperCase();
            if (!k || seenSkus.has(k)) continue;
            sourceList.push(it);
        }

        const isPureDirection = (txt) => /^(?:(?:CON|SIN)\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?)|DER(?:ECHO|EHO)?|IZQ(?:UIERDO)?|CENTRAL|MODULAR|IND|INV|1P|2P|3P|4P|5P|SALA|SOFA|LOVE\s*SEAT|SILLON|ESQUINERO|CHAISE(?:\s+LONGUE)?|OTTOMAN|OTOMAN|TABURETE|REMATE)$/.test(txt);

        const registerWoodEntry = (woodRaw, colorHintRaw, modelKey, modelTitle) => {
            const cleanWood = plainVisToken(woodRaw);
            if (!cleanWood || cleanWood.length < 3 || FOTOS_NON_WOOD_ONLY_RE.test(cleanWood) || cleanWood === 'MADERA' || cleanWood === 'NATURAL') return '';
            const woodOvKey = compactVisualOverrideKeyFotos('VWOD:', cleanWood);
            if (!woodOvKey) return '';
            if (!woodsMap.has(woodOvKey)) {
                woodsMap.set(woodOvKey, {
                    woodKey: cleanWood,
                    overrideKey: woodOvKey,
                    label: cleanWood,
                    colorHint: cleanStr(colorHintRaw).toUpperCase(),
                    modelCount: 0,
                    moduleCount: 0,
                    sampleModels: [],
                    _models: new Set()
                });
            }
            const wRec = woodsMap.get(woodOvKey);
            if (modelKey) {
                wRec.moduleCount++;
                if (!wRec._models.has(modelKey)) {
                    wRec._models.add(modelKey);
                    wRec.modelCount++;
                    if (modelTitle && wRec.sampleModels.length < 4) wRec.sampleModels.push(modelTitle);
                }
            }
            return cleanWood;
        };

        // Pre-sembrar las 34 muestras verificadas de la carpeta Drive MADERAS + cualquier VWOD: guardado en la nube
        Object.keys(DEFAULT_WOOD_SWATCHES_FOTOS).forEach((wk) => {
            const def = DEFAULT_WOOD_SWATCHES_FOTOS[wk];
            if (def && def.name) registerWoodEntry(def.name, '', '', '');
        });
        const ovMapNow = visualState.overridesMap || {};
        Object.keys(ovMapNow).forEach((ok) => {
            const ku = String(ok || '').trim().toUpperCase();
            if (ku.indexOf('VWOD:') !== 0) return;
            const ov = ovMapNow[ok];
            if (!ov || ov.status === 'ELIMINADO' || ov.status === 'ARCHIVADO') return;
            registerWoodEntry(ov.name || ku.slice(5), '', '', '');
        });

        const registerFabricEntry = (fabRaw, colorRaw, modelKey, modelTitle) => {
            if (isPureWoodDescriptorFotos(fabRaw)) return '';
            const fab = cleanFabricVariationNameFotos(fabRaw);
            if (!fab || fab.length < 2 || isPureDirection(fab) || isPureWoodDescriptorFotos(fab)) return '';
            const fabOvKey = compactVisualOverrideKeyFotos('VFAB:', fab);
            if (!fabOvKey) return '';
            if (!fabricsMap.has(fabOvKey)) {
                fabricsMap.set(fabOvKey, {
                    fabricKey: fab,
                    overrideKey: fabOvKey,
                    label: fab,
                    colorHint: cleanStr(colorRaw).toUpperCase(),
                    modelCount: 0,
                    moduleCount: 0,
                    sampleModels: [],
                    _models: new Set()
                });
            }
            const fRec = fabricsMap.get(fabOvKey);
            fRec.moduleCount++;
            if (modelKey && !fRec._models.has(modelKey)) {
                fRec._models.add(modelKey);
                fRec.modelCount++;
                if (modelTitle && fRec.sampleModels.length < 4) fRec.sampleModels.push(modelTitle);
            }
            return fab;
        };

        for (let i = 0; i < sourceList.length; i++) {
            const it = sourceList[i];
            const mo = cleanStr(it.mo).toUpperCase();
            const catTok = plainVisToken(it.c);
            const tpTok = plainVisToken(it.tp);
            const nomTok = plainVisToken(it.n);
            const fullTok = (catTok + ' ' + tpTok + ' ' + nomTok).trim();

            const isExt = /\bEXTERIOR\b/.test(fullTok);
            const isSala = /\b(SALA|SOFA|LOVE\s*SEAT|LOVESEAT|ESQUINERO|CHAISE|MODULAR|FUTON|FUTTON|SILLON)\b/.test(fullTok);

            // Registrar maderas de todos los productos con MADERA o COLOR DE MADERA
            const mdClean = cleanStr(it.md);
            const cmClean = cleanStr(it.cm);
            const provClean = cleanStr(it.p);
            if (mdClean || cmClean) {
                const woodTitle = (cleanStr(it.tp) || cleanStr(it.c) || 'MUEBLE') + (mo ? (' ' + mo) : '');
                const woodModelKey = plainVisToken(woodTitle) || cleanStr(it.s);
                const mdTok = plainVisToken(mdClean);
                const cmTok = plainVisToken(cmClean);
                let woodCand = '';
                if (cmTok && !FOTOS_NON_WOOD_ONLY_RE.test(cmTok) && cmTok !== 'NATURAL' && cmTok !== 'TONO NATURAL') {
                    woodCand = (mdTok && !FOTOS_NON_WOOD_ONLY_RE.test(mdTok) && cmTok.indexOf(mdTok) === -1 && mdTok !== 'MADERA')
                        ? (mdTok + ' ' + cmTok)
                        : cmTok;
                } else if (mdTok && !FOTOS_NON_WOOD_ONLY_RE.test(mdTok)) {
                    woodCand = provClean ? (mdTok + ' ' + plainVisToken(provClean)) : mdTok;
                }
                if (woodCand) {
                    registerWoodEntry(woodCand, mdClean, woodModelKey, woodTitle.toUpperCase());
                }
            }

            // Registrar telas de TODOS los productos tapizados (Sillones, Sillas, Camas, Sofás, Salas, Exterior, etc.)
            if (cleanStr(it.tl)) {
                const genericModelTitle = (cleanStr(it.tp) || cleanStr(it.c) || 'MUEBLE') + (mo ? (' ' + mo) : '');
                const genericModelKey = plainVisToken(genericModelTitle) || cleanStr(it.s);
                registerFabricEntry(it.tl, it.ct, genericModelKey, genericModelTitle.toUpperCase());
            }

            if (!mo || mo.length < 2) continue;
            if (!isSala && !isExt) continue;

            let typeKey = 'SALA_MODULAR';
            let typeLabel = 'SALA MODULAR';
            if (isExt) {
                if (/\bSALAS?\s+EN\s+L\b/.test(fullTok)) { typeKey = 'EXT_SALA_EN_L'; typeLabel = 'SALA EN L EXTERIOR'; }
                else if (/\bSOFA\s*CAMA\b/.test(fullTok)) { typeKey = 'EXT_SOFA_CAMA'; typeLabel = 'SOFÁ CAMA EXTERIOR'; }
                else { typeKey = 'EXT_SALA_MODULAR'; typeLabel = 'SALA MODULAR EXTERIOR'; }
            } else if (/\bSALAS?\s+EN\s+L\b/.test(fullTok)) {
                typeKey = 'SALA_EN_L'; typeLabel = 'SALA EN L';
            } else if (/\bSOFA\s*CAMAS?\b/.test(fullTok) || mo === 'ASHA' || mo === 'CITY') {
                typeKey = 'SOFA_CAMA'; typeLabel = 'SOFÁ CAMA';
            } else if (/\b(FUTON|FUTTON)\b/.test(fullTok)) {
                typeKey = 'FUTON'; typeLabel = 'FUTÓN';
            } else if (!/\b(MODULAR|MODULO|ESQUINERO|CHAISE|SIN\s+BRAZOS?|BRAZO\s+(?:DER|IZQ)|DERECHO|IZQUIERDO|REMATE)\b/.test(fullTok)) {
                if (/^LOVE\s*SEAT\b|^LOVESEAT\b/.test(tpTok)) { typeKey = 'LOVE_SEAT'; typeLabel = 'LOVE SEAT'; }
                else if (/^SOFA\b/.test(tpTok)) { typeKey = 'SOFA'; typeLabel = 'SOFÁ'; }
                else continue;
            }

            const gKey = 'type_' + normalizePlainLowerVis(typeKey) + '__mo_' + normalizePlainLowerVis(mo);
            const ovKey = compactVisualOverrideKeyFotos('VCOV:', gKey);
            const title = (typeLabel + ' ' + mo).toUpperCase();
            if (!coversMap.has(ovKey)) {
                coversMap.set(ovKey, {
                    groupKey: gKey,
                    overrideKey: ovKey,
                    title: title,
                    subCat: isExt ? 'EXTERIOR' : typeLabel,
                    mainCat: isExt ? 'COMPLEMENTOS' : 'SALAS',
                    isModular: 1,
                    itemCount: 0,
                    fabricCount: 0,
                    samplePhoto: it.f || '',
                    _fabrics: new Set()
                });
            }
            const cov = coversMap.get(ovKey);
            cov.itemCount++;
            if (!cov.samplePhoto && it.f) cov.samplePhoto = it.f;

            let fab = cleanFabricVariationNameFotos(it.tl);
            if (fab && (isPureDirection(fab) || isPureWoodDescriptorFotos(fab))) fab = '';
            if (!fab && cleanStr(it.vr)) {
                const parts = String(it.vr).split(/\s*[·|\/]\s*/).map(cleanFabricVariationNameFotos).filter(Boolean);
                for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                    if (!isPureDirection(parts[pIdx]) && !isPureWoodDescriptorFotos(parts[pIdx])) { fab = parts[pIdx]; break; }
                }
            }
            if (!fab) {
                const ctC = cleanFabricVariationNameFotos(it.ct);
                if (ctC && !isPureDirection(ctC) && !isPureWoodDescriptorFotos(ctC)) fab = ctC;
            }
            if (fab) {
                cov._fabrics.add(fab);
                if (!cleanStr(it.tl)) {
                    registerFabricEntry(fab, it.ct, ovKey, title);
                }
            }
        }

        const covers = Array.from(coversMap.values())
            .filter((c) => c.itemCount >= 2)
            .map((c) => ({
                groupKey: c.groupKey,
                overrideKey: c.overrideKey,
                title: c.title,
                subCat: c.subCat,
                mainCat: c.mainCat,
                isModular: c.isModular,
                itemCount: c.itemCount,
                fabricCount: c._fabrics.size,
                samplePhoto: c.samplePhoto
            }))
            .sort((a, b) => (b.itemCount - a.itemCount) || a.title.localeCompare(b.title, 'es'));

        const fabrics = Array.from(fabricsMap.values())
            .map((f) => ({
                fabricKey: f.fabricKey,
                overrideKey: f.overrideKey,
                label: f.label,
                colorHint: (f.colorHint && plainVisToken(f.colorHint) !== f.fabricKey) ? f.colorHint : '',
                modelCount: f.modelCount,
                moduleCount: f.moduleCount,
                sampleModels: f.sampleModels
            }))
            .sort((a, b) => (b.moduleCount - a.moduleCount) || a.label.localeCompare(b.label, 'es'));

        const woods = Array.from(woodsMap.values())
            .map((w) => ({
                woodKey: w.woodKey,
                overrideKey: w.overrideKey,
                label: w.label,
                colorHint: (w.colorHint && plainVisToken(w.colorHint) !== w.woodKey) ? w.colorHint : '',
                modelCount: w.modelCount,
                moduleCount: w.moduleCount,
                sampleModels: w.sampleModels
            }))
            .sort((a, b) => {
                const aHas = getVisualOverridePhotoUrlInFotos(a.overrideKey) ? 0 : 1;
                const bHas = getVisualOverridePhotoUrlInFotos(b.overrideKey) ? 0 : 1;
                return (b.moduleCount - a.moduleCount) || (aHas - bHas) || a.label.localeCompare(b.label, 'es');
            });

        return { covers: covers, fabrics: fabrics, woods: woods };
    }

    function rebuildVisualTargetsCatalog() {
        let covers = [];
        let fabrics = [];
        let woods = [];
        try {
            const raw = localStorage.getItem(VISUAL_TARGETS_INDEX_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.covers) && parsed.covers.length > 0) {
                    covers = parsed.covers.slice();
                }
                if (parsed && Array.isArray(parsed.fabrics) && parsed.fabrics.length > 0) {
                    fabrics = parsed.fabrics.slice();
                }
                if (parsed && Array.isArray(parsed.woods) && parsed.woods.length > 0) {
                    woods = parsed.woods.slice();
                }
            }
        } catch (e) {}

        if (!covers.length || !fabrics.length || !woods.length) {
            const fb = buildFallbackVisualTargetsFromProducts();
            if (!covers.length) covers = fb.covers;
            if (!fabrics.length) fabrics = fb.fabrics;
            if (!woods.length) woods = fb.woods;
        }

        // Priorizar Salas Modulares, Salas en L, Sofá Camas y Exterior primero en Portadas
        covers.sort((a, b) =>
            ((b.isModular || 0) - (a.isModular || 0)) ||
            ((b.itemCount || 0) - (a.itemCount || 0)) ||
            String(a.title || '').localeCompare(String(b.title || ''), 'es')
        );

        visualState.covers = covers;
        visualState.fabrics = fabrics;
        visualState.woods = woods;

        if (visualState.workMode !== 'SKU') {
            renderVisualTargetsList();
            renderVisualTargetStage();
        }
    }

    function getActiveVisualTargetsList() {
        if (visualState.workMode === 'FABRIC') return visualState.fabrics;
        if (visualState.workMode === 'WOOD') return visualState.woods;
        return visualState.covers;
    }

    function getSelectedVisualTargetObj() {
        const list = getActiveVisualTargetsList();
        const key = String(visualState.selectedOverrideKey || '').trim().toUpperCase();
        if (!key) return null;
        return list.find((it) => String(it.overrideKey || '').toUpperCase() === key) || null;
    }

    function showVisualStageFeedback(msg, isOk) {
        const box = document.getElementById('visualStageFeedbackBox');
        if (!box) return;
        const clean = cleanStr(msg);
        if (!clean) {
            box.textContent = '';
            box.className = 'assign-feedback-banner hidden';
            return;
        }
        box.textContent = clean;
        box.className = 'assign-feedback-banner ' + (isOk ? 'is-ok' : 'is-err');
    }

    window.clearSelectedVisualTarget = function () {
        if (!visualState.selectedOverrideKey) return;
        visualState.selectedOverrideKey = '';
        showVisualStageFeedback('', true);
        renderVisualTargetsList();
        renderVisualTargetStage();
    };

    window.setFotosWorkMode = function (modeRaw) {
        const nextMode = (modeRaw === 'COVER' || modeRaw === 'FABRIC' || modeRaw === 'WOOD') ? modeRaw : 'SKU';
        visualState.workMode = nextMode;
        visualState.selectedOverrideKey = '';
        showVisualStageFeedback('', true);

        document.querySelectorAll('#fotosWorkModeBar .fotos-work-mode-btn').forEach((btn) => {
            const active = btn.getAttribute('data-work-mode') === nextMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        const isSku = nextMode === 'SKU';
        const skuControls = document.getElementById('skuFinderSkuControls');
        const visControls = document.getElementById('visualTargetsFinderWrap');
        const skuStage = document.getElementById('skuStageContentWrap');
        const visStage = document.getElementById('visualStageContentWrap');
        const finderTitle = document.getElementById('skuFinderPanelTitle');
        const stageTitle = document.getElementById('productStagePanelTitle');
        const modeHint = document.getElementById('fotosWorkModeHint');
        const galHint = document.getElementById('galleryQuickHint');
        const directUploadLbl = document.getElementById('btnDirectUploadLabel');
        const openCotBtn = document.getElementById('btnOpenInCotizadorStage');
        const rowBadge = document.getElementById('selectedRowBadge');
        const visSearchInp = document.getElementById('visualTargetSearchInput');

        if (skuControls) skuControls.classList.toggle('hidden', !isSku);
        if (visControls) visControls.classList.toggle('hidden', isSku);
        if (skuStage) skuStage.classList.toggle('hidden', !isSku);
        if (visStage) visStage.classList.toggle('hidden', isSku);
        if (directUploadLbl) directUploadLbl.classList.toggle('hidden', !isSku);
        if (openCotBtn && !isSku) openCotBtn.classList.add('hidden');

        if (finderTitle) {
            finderTitle.textContent = nextMode === 'COVER'
                ? 'Portadas'
                : (nextMode === 'FABRIC' ? 'Telas' : (nextMode === 'WOOD' ? 'Maderas' : 'Buscar SKU'));
        }
        if (stageTitle) {
            stageTitle.textContent = nextMode === 'COVER'
                ? 'Portada'
                : (nextMode === 'FABRIC' ? 'Tela' : (nextMode === 'WOOD' ? 'Madera' : 'Producto'));
        }
        if (modeHint) {
            modeHint.textContent = '';
            modeHint.classList.add('hidden');
        }
        if (galHint) {
            galHint.textContent = '';
            galHint.classList.add('hidden');
        }
        if (visSearchInp) {
            visSearchInp.placeholder = nextMode === 'COVER'
                ? 'Buscar modelo...'
                : (nextMode === 'WOOD' ? 'Buscar madera...' : 'Buscar tela...');
        }

        const jumpFirstBtn = document.querySelector('#mobileFotosJumpBar .mobile-jump-btn[data-jump="secSkuFinder"]');
        if (jumpFirstBtn) {
            jumpFirstBtn.textContent = nextMode === 'COVER'
                ? 'Portadas'
                : (nextMode === 'FABRIC' ? 'Telas' : (nextMode === 'WOOD' ? 'Maderas' : 'SKU'));
        }

        if (isSku) {
            applySkuFiltersAndRender();
            renderSelectedProductStage();
        } else {
            if (rowBadge) rowBadge.textContent = nextMode === 'COVER' ? 'PORTADA' : (nextMode === 'WOOD' ? 'MADERA' : 'TELA');
            loadVisualOverridesFromLocalStorage();
            rebuildVisualTargetsCatalog();
            // Seguridad: nunca pre-seleccionar automáticamente el primer elemento
            visualState.selectedOverrideKey = '';
            renderVisualTargetsList();
            renderVisualTargetStage();
            syncFotosBackNav('visual_work_mode');
        }
        updateAssignButtonState();
    };

    window.selectNextMissingPhotoTarget = function () {
        if (visualState.workMode === 'SKU') {
            const pool = (Array.isArray(state.filteredProducts) && state.filteredProducts.length)
                ? state.filteredProducts
                : state.products;
            if (!pool.length) return false;
            const curIdx = state.selectedSku
                ? pool.findIndex((p) => p && p.sku === state.selectedSku)
                : -1;
            for (let step = 1; step <= pool.length; step++) {
                const cand = pool[(curIdx + step) % pool.length];
                if (cand && !cand.photoUrl) {
                    window.selectSkuProduct(cand.sku);
                    return true;
                }
            }
            showAssignFeedback('✅ Todo con foto.', true);
            return false;
        }

        const list = getActiveVisualTargetsList();
        if (!list.length) return false;
        const curKey = String(visualState.selectedOverrideKey || '').toUpperCase();
        const curIdx = list.findIndex((it) => String(it.overrideKey || '').toUpperCase() === curKey);
        for (let step = 1; step <= list.length; step++) {
            const cand = list[(curIdx + step) % list.length];
            if (cand && !getVisualOverridePhotoUrlInFotos(cand.overrideKey)) {
                window.selectVisualTarget(cand.overrideKey);
                return true;
            }
        }
        showVisualStageFeedback('✅ Todo con foto.', true);
        return false;
    };

    window.setVisualTargetFilter = function (filterMode) {
        visualState.filterMode = (filterMode === 'NO_PHOTO' || filterMode === 'HAS_PHOTO') ? filterMode : 'ALL';
        document.querySelectorAll('#visualTargetsFinderWrap [data-visual-filter]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-visual-filter') === visualState.filterMode);
        });
        renderVisualTargetsList();
    };

    window.clearVisualTargetSearch = function () {
        visualState.searchQuery = '';
        const inp = document.getElementById('visualTargetSearchInput');
        const clr = document.getElementById('visualTargetSearchClearBtn');
        if (inp) inp.value = '';
        if (clr) clr.classList.add('hidden');
        renderVisualTargetsList();
    };

    function renderVisualTargetsList() {
        const listEl = document.getElementById('visualTargetsList');
        const countBadge = document.getElementById('skuListCountBadge');
        if (!listEl) return;

        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const rawList = getActiveVisualTargetsList();
        const qNorm = normalizeSearchText(visualState.searchQuery || '');

        const filtered = rawList.filter((item) => {
            const hasPhoto = !!getVisualOverridePhotoUrlInFotos(item.overrideKey);
            if (visualState.filterMode === 'HAS_PHOTO' && !hasPhoto) return false;
            if (visualState.filterMode === 'NO_PHOTO' && hasPhoto) return false;
            if (qNorm) {
                const hay = normalizeSearchText(
                    (item.title || item.label || '') + ' ' +
                    (item.subCat || item.colorHint || '') + ' ' +
                    (Array.isArray(item.sampleModels) ? item.sampleModels.join(' ') : '')
                );
                if (hay.indexOf(qNorm) === -1) return false;
            }
            return true;
        });

        if (countBadge && visualState.workMode !== 'SKU') {
            countBadge.textContent = String(filtered.length);
        }

        if (!filtered.length) {
            listEl.innerHTML = '<div class="empty-list-msg">Sin resultados</div>';
            return;
        }

        const prevScrollTop = Number(listEl.scrollTop) || 0;
        const selKey = String(visualState.selectedOverrideKey || '').toUpperCase();
        listEl.innerHTML = filtered.slice(0, 220).map((item) => {
            const ovKey = String(item.overrideKey || '').toUpperCase();
            const active = ovKey === selKey;
            const photoUrl = getVisualOverridePhotoUrlInFotos(ovKey);
            const thumbSrc = photoUrl ? resolveVisualThumbSrcInFotos(photoUrl, 160) : '';
            const fid = extractDriveFileId(photoUrl);
            const title = isSwatch ? (item.label || item.fabricKey || item.woodKey) : (item.title || item.groupKey);
            const sub = isSwatch
                ? ((item.colorHint ? (item.colorHint + ' · ') : '') + (item.moduleCount ? (item.moduleCount + ' pzas') : (isWood ? 'Drive Maderas' : '0 pzas')))
                : ((item.subCat ? (item.subCat + ' · ') : '') + item.itemCount + ' pzas');

            const thumbInner = thumbSrc
                ? ('<img src="' + escapeHtml(thumbSrc) + '" alt="' + escapeHtml(title) + '" loading="lazy" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)">')
                : ('<span aria-hidden="true">' + (isFabric ? '🧵' : (isWood ? '🪵' : '🖼️')) + '</span>');

            return (
                '<button type="button" class="visual-target-item' + (active ? ' active' : '') + '" data-visual-key="' + escapeHtml(ovKey) + '" data-fotos-act="select-visual">' +
                    '<div class="visual-target-thumb' + (isSwatch ? '' : ' is-cover') + '">' + thumbInner + '</div>' +
                    '<div class="visual-target-info">' +
                        '<div class="visual-target-title">' + escapeHtml(title) + '</div>' +
                        '<div class="visual-target-sub">' + escapeHtml(sub) + '</div>' +
                    '</div>' +
                    '<span class="visual-target-pill ' + (photoUrl ? 'has-photo' : 'no-photo') + '">' + (photoUrl ? 'Foto' : 'Sin foto') + '</span>' +
                '</button>'
            );
        }).join('');
        if (prevScrollTop > 0) listEl.scrollTop = prevScrollTop;
    }

    function syncVisualStageSelectedGalleryPreview() {
        if (visualState.workMode === 'SKU') return;
        const btn = document.getElementById('btnAssignVisualGalleryPhoto');
        const curCanvas = document.getElementById('visualCurPhotoCanvas');
        const badgeEl = document.getElementById('visualPreviewBadge');
        const selPhoto = getActiveSelectedPhotoObject();
        const target = getSelectedVisualTargetObj();
        const isSwatch = visualState.workMode === 'FABRIC' || visualState.workMode === 'WOOD';

        const canAssignGallery = !!(selPhoto && target);
        if (btn) {
            btn.classList.toggle('hidden', !canAssignGallery);
            btn.disabled = !(canAssignGallery && !visualState.busy);
        }

        if (canAssignGallery && curCanvas) {
            const previewSrc = selPhoto.localDataUrl || selPhoto.thumbDataUrl || buildPhotoThumbUrl(selPhoto.id || selPhoto.viewUrl, 700);
            const fid = extractDriveFileId(selPhoto.id || selPhoto.viewUrl || '');
            if (badgeEl) badgeEl.textContent = 'Lista';
            curCanvas.onclick = null;
            curCanvas.innerHTML =
                '<img src="' + escapeHtml(previewSrc) + '" alt="' + escapeHtml(selPhoto.name || 'Vista') + '" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)" ' +
                'style="' + (isSwatch ? 'width:100%;height:100%;object-fit:cover;' : 'max-width:100%;max-height:100%;object-fit:contain;') + '">';
        } else if (!canAssignGallery) {
            renderVisualTargetStage(true);
        }
    }

    function renderVisualTargetStage(skipGallerySync) {
        const eyebrow = document.getElementById('visualStageEyebrow');
        const titleEl = document.getElementById('visualStageTitle');
        const subEl = document.getElementById('visualStageSub');
        const badgeEl = document.getElementById('visualPreviewBadge');
        const curCanvas = document.getElementById('visualCurPhotoCanvas');
        const delBtn = document.getElementById('visualCurDeleteBtn');
        const clearBtn = document.getElementById('btnClearSelectedVisual');
        const urlInp = document.getElementById('visualTargetUrlInput');
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const target = getSelectedVisualTargetObj();

        if (!target) {
            if (eyebrow) eyebrow.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
            if (titleEl) titleEl.textContent = isFabric ? 'Elige tela' : (isWood ? 'Elige madera' : 'Elige modelo');
            if (subEl) subEl.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Solo inicio');
            if (badgeEl) badgeEl.textContent = 'Foto';
            if (curCanvas) {
                curCanvas.onclick = null;
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Toca o arrastra</div>';
            }
            if (delBtn) delBtn.classList.add('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
            if (urlInp) urlInp.value = '';
            if (!skipGallerySync) syncVisualStageSelectedGalleryPreview();
            return;
        }

        if (clearBtn) clearBtn.classList.remove('hidden');
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const curUrl = getVisualOverridePhotoUrlInFotos(target.overrideKey);
        const curThumb = curUrl ? resolveVisualThumbSrcInFotos(curUrl, 700) : '';
        const curFid = extractDriveFileId(curUrl);

        if (eyebrow) {
            eyebrow.textContent = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        }
        if (titleEl) titleEl.textContent = label;
        if (subEl) {
            if (isSwatch) {
                subEl.textContent = target.moduleCount
                    ? (target.moduleCount + ' pzas · ' + target.modelCount + (target.modelCount === 1 ? ' modelo' : ' modelos'))
                    : (isWood ? 'Catálogo Maderas Drive' : '0 pzas');
            } else {
                subEl.textContent = (target.subCat ? (target.subCat + ' · ') : '') + target.itemCount + ' pzas';
            }
        }
        if (curCanvas) {
            if (curThumb) {
                if (badgeEl) badgeEl.textContent = 'Foto';
                curCanvas.onclick = null;
                curCanvas.innerHTML =
                    '<img src="' + escapeHtml(curThumb) + '" alt="' + escapeHtml(label) + '" referrerpolicy="no-referrer" ' +
                    'data-drive-id="' + escapeHtml(curFid) + '" onerror="handlePhotoImgError(this)" ' +
                    'style="' + (isSwatch ? 'width:100%;height:100%;object-fit:cover;' : 'max-width:100%;max-height:100%;object-fit:contain;') + '" ' +
                    'data-fotos-act="lightbox" data-lightbox-src="' + escapeHtml(curThumb) + '">';
            } else {
                if (badgeEl) badgeEl.textContent = 'Sin foto';
                curCanvas.innerHTML = '<div class="photo-empty-placeholder">Toca o arrastra</div>';
                curCanvas.onclick = function () {
                    const inp = document.getElementById('visualTargetFileInput');
                    if (inp) inp.click();
                };
            }
        }
        if (delBtn) delBtn.classList.toggle('hidden', !curUrl);
        if (urlInp) urlInp.value = curUrl || '';
        if (!skipGallerySync) syncVisualStageSelectedGalleryPreview();
    }

    window.selectVisualTarget = function (overrideKey) {
        visualState.selectedOverrideKey = String(overrideKey || '').trim().toUpperCase();
        showVisualStageFeedback('', true);
        renderVisualTargetsList();
        renderVisualTargetStage();
    };

    function optimizeVisualFileForMode(file, isFabric) {
        if (!isFabric) {
            return readFileAsOptimizedDataUrl(file);
        }
        // Tela / Swatch: conservar textura completa (sin recortar bordes blancos) hasta 640px
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawUrl = normalizeImageDataUrl(String(reader.result || ''), (file && file.name) || 'tela.jpg');
                if (typeof Image === 'undefined') { resolve(rawUrl); return; }
                const img = new Image();
                img.onerror = () => resolve(rawUrl);
                img.onload = () => {
                    try {
                        const nw = img.naturalWidth || img.width || 1;
                        const nh = img.naturalHeight || img.height || 1;
                        const cap = 640;
                        const sc = Math.min(1, cap / Math.max(nw, nh));
                        const tw = Math.max(1, Math.round(nw * sc));
                        const th = Math.max(1, Math.round(nh * sc));
                        const c = document.createElement('canvas');
                        c.width = tw;
                        c.height = th;
                        const ctx = c.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, tw, th);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, tw, th);
                        resolve(c.toDataURL('image/jpeg', 0.84));
                    } catch (eC) {
                        resolve(rawUrl);
                    }
                };
                img.src = rawUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    async function persistVisualPhotoOverrideFromFotos(target, photoUrl, opMode) {
        if (!target || !target.overrideKey) return { ok: false, error: 'Elige primero.' };
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const op = opMode === 'DELETE' ? 'DELETE' : 'SAVE';
        const nextUrl = op === 'DELETE' ? '' : cleanStr(photoUrl);
        if (op === 'SAVE' && /^blob:/i.test(nextUrl)) {
            return { ok: false, error: 'URL temporal inválida; vuelve a subir la imagen.' };
        }
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');

        const localEntry = op === 'DELETE' ? null : {
            sku: ovKey,
            status: 'VISIBLE',
            name: cleanStr(label).slice(0, 140),
            category: categoryTag,
            price: null,
            note: nextUrl,
            updatedBy: OWNER_EMAIL,
            updatedAt: new Date().toLocaleString('es-MX')
        };

        if (op === 'DELETE') {
            const deletedPrev = visualState.overridesMap[ovKey];
            const deletedPrevUrl = deletedPrev ? cleanStr(deletedPrev.note) : '';
            const deletedPrevFid = deletedPrev ? (cleanStr(deletedPrev.localFileId) || extractDriveFileId(deletedPrevUrl)) : '';
            if (isWood && DEFAULT_WOOD_SWATCHES_FOTOS[ovKey]) {
                visualState.overridesMap[ovKey] = {
                    sku: ovKey,
                    status: 'ELIMINADO',
                    name: cleanStr(label).slice(0, 140),
                    category: 'WOOD_SWATCH',
                    price: null,
                    note: '',
                    updatedBy: OWNER_EMAIL,
                    updatedAt: new Date().toLocaleString('es-MX')
                };
            } else {
                delete visualState.overridesMap[ovKey];
            }
            const cleanedQ = readFotosOfflineOutbox().filter((it) => {
                if (!it) return false;
                if (it.type === 'visual_override_upload' && cleanStr(it.overrideKey).toUpperCase() === ovKey) {
                    if (it.localFileId) deleteOfflinePhotoBlobIdb(it.localFileId);
                    return false;
                }
                return true;
            });
            writeFotosOfflineOutbox(cleanedQ);
            const cleanedRecents = readRecentUploadsStore().filter((it) => {
                if (!it) return false;
                if (cleanStr(it.targetKey).toUpperCase() === ovKey) return false;
                if (deletedPrevFid && cleanStr(it.id) === deletedPrevFid) return false;
                return true;
            });
            writeRecentUploadsStore(cleanedRecents);
            if (typeof renderRecentUploadedStrip === 'function') {
                renderRecentUploadedStrip();
            }
        } else {
            visualState.overridesMap[ovKey] = localEntry;
        }
        saveVisualOverridesToLocalStorage();
        invalidateLoadedPhotosCache();
        broadcastVisualOverrideUpdateToCotizador(ovKey, localEntry, op === 'DELETE');
        renderVisualTargetsList();
        renderVisualTargetStage();
        if (op === 'SAVE' && nextUrl) {
            recordRecentUploadedPhoto({
                viewUrl: nextUrl,
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                destFolderName: destFolderTag,
                ts: Date.now()
            });
        } else {
            renderInboxGallery();
        }

        const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (isOfflineNow && op === 'SAVE' && nextUrl) {
            enqueueFotosOfflineOutbox({
                id: 'op_vis_' + Date.now() + '_' + ovKey,
                type: 'visual_override_upload',
                overrideKey: ovKey,
                label: label,
                categoryTag: categoryTag,
                directUrl: nextUrl,
                queuedAt: Date.now()
            });
            return { ok: true, offlineQueued: true };
        }

        try {
            const auth = buildOwnerAuthPayload();
            const res = await callWebAppPost('inv_product_override_save', Object.assign({
                sku: ovKey,
                op: op === 'DELETE' ? 'DELETE' : 'RESTORE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: '',
                note: nextUrl
            }, auth), 22000);
            if (res && res.ok) {
                if (op !== 'DELETE' && res.override) {
                    visualState.overridesMap[ovKey] = res.override;
                    saveVisualOverridesToLocalStorage();
                    invalidateLoadedPhotosCache();
                    broadcastVisualOverrideUpdateToCotizador(ovKey, res.override, false);
                    renderInboxGallery();
                }
                return { ok: true };
            }
            if (res && res.unavailable && op === 'SAVE' && nextUrl) {
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    directUrl: nextUrl,
                    queuedAt: Date.now()
                });
                return { ok: true, offlineQueued: true };
            }
            return { ok: false, error: (res && res.error) || 'Guardado local.' };
        } catch (err) {
            return { ok: false, error: (err && err.message) || 'Guardado local.' };
        }
    }

    window.uploadVisualTargetPhotoFile = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file || visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        if (!target) {
            showVisualStageFeedback('Elige primero de la lista.', false);
            if (inputEl) inputEl.value = '';
            return;
        }
        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const kindParam = isFabric ? 'fabric' : (isWood ? 'wood' : 'cover');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        const safeFileName = cleanStr(file.name) || ((isFabric ? 'tela_' : (isWood ? 'madera_' : 'portada_')) + Date.now() + '.jpg');
        const localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
        const hasPrevOverride = Object.prototype.hasOwnProperty.call(visualState.overridesMap, ovKey);
        const prevOverrideBeforeSave = hasPrevOverride ? visualState.overridesMap[ovKey] : null;
        const rollbackVisualUpload = () => {
            if (hasPrevOverride && prevOverrideBeforeSave) {
                visualState.overridesMap[ovKey] = prevOverrideBeforeSave;
            } else {
                delete visualState.overridesMap[ovKey];
            }
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, prevOverrideBeforeSave, !hasPrevOverride);
            renderVisualTargetsList();
            renderVisualTargetStage();
            renderInboxGallery();
        };

        visualState.busy = true;
        showVisualStageFeedback('⚡ Subiendo ' + label + '...', true);

        try {
            const dataUrl = await optimizeVisualFileForMode(file, isSwatch);
            const optimisticEntry = {
                sku: ovKey,
                status: 'VISIBLE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: null,
                note: dataUrl,
                localFileId: localVisId,
                updatedBy: OWNER_EMAIL,
                updatedAt: new Date().toLocaleString('es-MX')
            };

            // Actualización optimista inmediata en Cotizador + quitar selección para no sobrescribir por error
            visualState.overridesMap[ovKey] = optimisticEntry;
            saveVisualOverridesToLocalStorage();
            broadcastVisualOverrideUpdateToCotizador(ovKey, optimisticEntry, false);
            visualState.selectedOverrideKey = '';
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
            renderVisualTargetsList();
            renderVisualTargetStage();
            updateGallerySelectionInDom();

            const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (isOfflineNow) {
                await putOfflinePhotoBlobIdb(localVisId, dataUrl, safeFileName);
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    fileName: safeFileName,
                    localFileId: localVisId,
                    queuedAt: Date.now()
                });
                showVisualStageFeedback('⚡ En cola offline: ' + label + ' (se subirá al volver la red).', true);
                return;
            }

            const auth = buildOwnerAuthPayload();
            let res = await callWebAppPost('fotos_upload_visual_override', Object.assign({
                overrideKey: ovKey,
                kind: kindParam,
                label: label,
                categoryTag: categoryTag,
                fileName: safeFileName,
                dataUrl: dataUrl
            }, auth), 45000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                const upRes = await callWebAppPost('inv_upload_product_photo', Object.assign({
                    advisorName: 'Kevin Reyna',
                    sku: ovKey,
                    fileName: safeFileName,
                    productName: (isFabric ? 'TELA ' : (isWood ? 'MADERA ' : 'PORTADA ')) + label,
                    categoria: isFabric ? 'TELAS' : (isWood ? 'MADERAS' : 'SALAS'),
                    tipo: targetKindTag,
                    targetFolderId: VISUAL_UPLOAD_DRIVE_FOLDER_ID,
                    driveOnly: true,
                    skipSheetWrite: true,
                    skipCategoryCopy: true,
                    dataUrl: dataUrl
                }, auth), 40000);
                const fidFb = cleanStr((upRes && upRes.fileId) || (upRes && upRes.driveUrl && extractDriveFileId(upRes.driveUrl)));
                const urlFb = cleanStr(upRes && upRes.driveUrl) || (fidFb ? ('https://drive.google.com/file/d/' + fidFb + '/view?usp=sharing') : '');
                if (upRes && upRes.ok && urlFb) {
                    const saveFb = await persistVisualPhotoOverrideFromFotos(target, urlFb, 'SAVE');
                    res = saveFb.ok ? { ok: true, driveUrl: urlFb, fileId: fidFb } : { ok: false, error: saveFb.error };
                } else {
                    res = upRes;
                }
            }

            if (!res || !res.ok) {
                if (res && res.authRequired) {
                    rollbackVisualUpload();
                    window.lockFotosPortal();
                    return;
                }
                if (res && res.unavailable) {
                    await putOfflinePhotoBlobIdb(localVisId, dataUrl, safeFileName);
                    enqueueFotosOfflineOutbox({
                        id: 'op_vis_' + Date.now() + '_' + ovKey,
                        type: 'visual_override_upload',
                        overrideKey: ovKey,
                        label: label,
                        categoryTag: categoryTag,
                        fileName: safeFileName,
                        localFileId: localVisId,
                        queuedAt: Date.now()
                    });
                    showVisualStageFeedback('⚡ Sin red · en cola: ' + label + '.', true);
                    return;
                }
                rollbackVisualUpload();
                showVisualStageFeedback('❌ ' + ((res && res.error) || 'Error al subir.'), false);
                return;
            }
            const finalDriveUrl = cleanStr(res.driveUrl || res.newUrl);
            const finalOverride = res.override || Object.assign({}, optimisticEntry, { note: finalDriveUrl || dataUrl });
            visualState.overridesMap[ovKey] = finalOverride;
            if (res.fileId) {
                state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || safeFileName);
            }
            recordRecentUploadedPhoto({
                fileId: cleanStr(res.fileId || extractDriveFileId(finalDriveUrl) || localVisId),
                viewUrl: finalDriveUrl,
                fileName: cleanStr(res.fileName || safeFileName),
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                localDataUrl: dataUrl,
                destFolderName: destFolderTag,
                ts: Date.now()
            });
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, finalOverride, false);
            renderVisualTargetsList();
            renderInboxGallery();
            showVisualStageFeedback('✅ ' + label + ' guardada.', true);
        } catch (err) {
            rollbackVisualUpload();
            showVisualStageFeedback('❌ ' + ((err && err.message) || 'Error al subir.'), false);
        } finally {
            visualState.busy = false;
            if (inputEl) {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.assignGalleryPhotoToVisualTarget = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        const selPhoto = getActiveSelectedPhotoObject();
        if (!target || !selPhoto) return;

        const isFabric = visualState.workMode === 'FABRIC';
        const isWood = visualState.workMode === 'WOOD';
        const isSwatch = isFabric || isWood;
        const label = isSwatch ? (target.label || target.fabricKey || target.woodKey) : (target.title || target.groupKey);
        const ovKey = String(target.overrideKey).trim().toUpperCase();
        const categoryTag = isFabric ? 'FABRIC_SWATCH' : (isWood ? 'WOOD_SWATCH' : 'VISUAL_COVER');
        const kindParam = isFabric ? 'fabric' : (isWood ? 'wood' : 'cover');
        const targetKindTag = isFabric ? 'TELA' : (isWood ? 'MADERA' : 'PORTADA');
        const destFolderTag = isFabric ? 'Tela' : (isWood ? 'Madera' : 'Portada');
        const fromLoaded = !!selPhoto.fromLoaded;
        const rawPhotoId = cleanStr(selPhoto.id);
        let activePhotoId = rawPhotoId;
        let isLocal = isLocalTempPhotoId(activePhotoId);
        let directUrl = cleanStr(selPhoto.viewUrl) || (!isLocal && activePhotoId ? ('https://drive.google.com/file/d/' + activePhotoId + '/view?usp=sharing') : '');
        const optimisticPreview = (selPhoto.localDataUrl && String(selPhoto.localDataUrl).indexOf('data:image/') === 0)
            ? String(selPhoto.localDataUrl)
            : directUrl;

        const hasPrevOverride = Object.prototype.hasOwnProperty.call(visualState.overridesMap, ovKey);
        const prevOverrideBeforeSave = hasPrevOverride ? visualState.overridesMap[ovKey] : null;
        const prevRawInboxItem = (!fromLoaded && rawPhotoId) ? (state.rawInboxFromDrive.find((f) => f && f.id === rawPhotoId) || null) : null;
        const prevInboxItem = (!fromLoaded && rawPhotoId) ? (state.inboxFiles.find((f) => f && f.id === rawPhotoId) || null) : null;
        const prevNuevasItem = (!fromLoaded && rawPhotoId) ? (state.fotosNuevasSheetItems.find((f) => f && f.id === rawPhotoId) || null) : null;
        const rollbackVisualAssign = () => {
            if (hasPrevOverride && prevOverrideBeforeSave) {
                visualState.overridesMap[ovKey] = prevOverrideBeforeSave;
            } else {
                delete visualState.overridesMap[ovKey];
            }
            if (prevRawInboxItem && !state.rawInboxFromDrive.some((f) => f && f.id === rawPhotoId)) {
                state.rawInboxFromDrive = [prevRawInboxItem].concat(state.rawInboxFromDrive);
            }
            if (prevInboxItem && !state.inboxFiles.some((f) => f && f.id === rawPhotoId)) {
                state.inboxFiles = [prevInboxItem].concat(state.inboxFiles);
            }
            if (prevNuevasItem && !state.fotosNuevasSheetItems.some((f) => f && f.id === rawPhotoId)) {
                state.fotosNuevasSheetItems = [prevNuevasItem].concat(state.fotosNuevasSheetItems);
            }
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, prevOverrideBeforeSave, !hasPrevOverride);
            renderInboxGallery();
            renderVisualTargetsList();
            renderVisualTargetStage();
        };

        visualState.busy = true;
        showVisualStageFeedback('⚡ Guardando ' + label + '...', true);

        try {
            const optimisticEntry = {
                sku: ovKey,
                status: 'VISIBLE',
                name: cleanStr(label).slice(0, 140),
                category: categoryTag,
                price: null,
                note: optimisticPreview || directUrl,
                localFileId: isLocal ? activePhotoId : '',
                updatedBy: OWNER_EMAIL,
                updatedAt: new Date().toLocaleString('es-MX')
            };

            if (optimisticPreview || directUrl) {
                visualState.overridesMap[ovKey] = optimisticEntry;
                saveVisualOverridesToLocalStorage();
                broadcastVisualOverrideUpdateToCotizador(ovKey, optimisticEntry, false);
            }

            // Remover de bandeja SUBIR PREN si venía de extracción + limpiar selección para evitar errores
            if (!fromLoaded && rawPhotoId) {
                state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f.id !== rawPhotoId);
                state.inboxFiles = state.inboxFiles.filter((f) => f.id !== rawPhotoId);
                state.fotosNuevasSheetItems = state.fotosNuevasSheetItems.filter((f) => f.id !== rawPhotoId);
            }
            visualState.selectedOverrideKey = '';
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
            renderInboxGallery();
            renderVisualTargetsList();
            renderVisualTargetStage();

            if (isLocal && pendingUploadPromises.has(rawPhotoId)) {
                try {
                    const pendingUp = await pendingUploadPromises.get(rawPhotoId);
                    if (pendingUp && pendingUp.ok && pendingUp.file && pendingUp.file.id) {
                        activePhotoId = cleanStr(pendingUp.file.id);
                        isLocal = isLocalTempPhotoId(activePhotoId);
                        directUrl = cleanStr(pendingUp.file.viewUrl) || ('https://drive.google.com/file/d/' + activePhotoId + '/view?usp=sharing');
                    }
                } catch (eWait) {}
            }

            const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (isOfflineNow) {
                let localVisId = isLocal ? activePhotoId : '';
                if (!localVisId && optimisticPreview && optimisticPreview.indexOf('data:image/') === 0) {
                    localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
                    await putOfflinePhotoBlobIdb(localVisId, optimisticPreview, cleanStr(selPhoto.name));
                }
                enqueueFotosOfflineOutbox({
                    id: 'op_vis_' + Date.now() + '_' + ovKey,
                    type: 'visual_override_upload',
                    overrideKey: ovKey,
                    label: label,
                    categoryTag: categoryTag,
                    fileName: cleanStr(selPhoto.name),
                    localFileId: localVisId,
                    sourceInboxFileId: activePhotoId,
                    shortcutId: cleanStr(selPhoto.shortcutId),
                    fromLoaded: fromLoaded,
                    directUrl: isLocal ? '' : directUrl,
                    queuedAt: Date.now()
                });
                showVisualStageFeedback('⚡ En cola offline: ' + label + '.', true);
                return;
            }

            const auth = buildOwnerAuthPayload();
            let res = await callWebAppPost('fotos_upload_visual_override', Object.assign({
                overrideKey: ovKey,
                kind: kindParam,
                label: label,
                categoryTag: categoryTag,
                fileName: cleanStr(selPhoto.name),
                sourceInboxFileId: isLocal ? '' : activePhotoId,
                shortcutId: cleanStr(selPhoto.shortcutId),
                fromLoaded: fromLoaded,
                dataUrl: isLocal ? cleanStr(selPhoto.localDataUrl) : ''
            }, auth), 45000);

            if (res && !res.ok && /Acci[óo]n no reconocida/i.test(cleanStr(res.error))) {
                let finalUrl = directUrl;
                if (!finalUrl && selPhoto.localDataUrl) {
                    const upRes = await callWebAppPost('inv_upload_product_photo', Object.assign({
                        advisorName: 'Kevin Reyna',
                        sku: ovKey,
                        fileName: cleanStr(selPhoto.name),
                        productName: (isFabric ? 'TELA ' : (isWood ? 'MADERA ' : 'PORTADA ')) + label,
                        categoria: isFabric ? 'TELAS' : (isWood ? 'MADERAS' : 'SALAS'),
                        tipo: targetKindTag,
                        targetFolderId: VISUAL_UPLOAD_DRIVE_FOLDER_ID,
                        driveOnly: true,
                        skipSheetWrite: true,
                        skipCategoryCopy: true,
                        dataUrl: selPhoto.localDataUrl
                    }, auth), 40000);
                    const fidFb = cleanStr((upRes && upRes.fileId) || (upRes && upRes.driveUrl && extractDriveFileId(upRes.driveUrl)));
                    finalUrl = cleanStr(upRes && upRes.driveUrl) || (fidFb ? ('https://drive.google.com/file/d/' + fidFb + '/view?usp=sharing') : '');
                }
                if (finalUrl) {
                    const saveFb = await persistVisualPhotoOverrideFromFotos(target, finalUrl, 'SAVE');
                    res = saveFb.ok ? { ok: true, driveUrl: finalUrl } : { ok: false, error: saveFb.error };
                }
            }

            if (!res || !res.ok) {
                if (res && res.authRequired) {
                    rollbackVisualAssign();
                    window.lockFotosPortal();
                    return;
                }
                if (res && res.unavailable) {
                    let localVisId = isLocal ? activePhotoId : '';
                    if (!localVisId && optimisticPreview && optimisticPreview.indexOf('data:image/') === 0) {
                        localVisId = 'local_vis_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
                        await putOfflinePhotoBlobIdb(localVisId, optimisticPreview, cleanStr(selPhoto.name));
                    }
                    enqueueFotosOfflineOutbox({
                        id: 'op_vis_' + Date.now() + '_' + ovKey,
                        type: 'visual_override_upload',
                        overrideKey: ovKey,
                        label: label,
                        categoryTag: categoryTag,
                        fileName: cleanStr(selPhoto.name),
                        localFileId: localVisId,
                        sourceInboxFileId: activePhotoId,
                        shortcutId: cleanStr(selPhoto.shortcutId),
                        fromLoaded: fromLoaded,
                        directUrl: isLocal ? '' : directUrl,
                        queuedAt: Date.now()
                    });
                    showVisualStageFeedback('⚡ Sin red · en cola: ' + label + '.', true);
                    return;
                }
                rollbackVisualAssign();
                showVisualStageFeedback('❌ ' + ((res && res.error) || 'Error al guardar.'), false);
                return;
            }
            const finalDriveUrl = cleanStr(res.driveUrl || res.newUrl || directUrl);
            const finalOverride = res.override || Object.assign({}, optimisticEntry, { note: finalDriveUrl });
            visualState.overridesMap[ovKey] = finalOverride;
            if (res.fileId) {
                state.loadedFileNamesById[res.fileId] = cleanStr(res.fileName || selPhoto.name);
            }
            recordRecentUploadedPhoto({
                fileId: cleanStr(res.fileId || extractDriveFileId(finalDriveUrl) || activePhotoId),
                viewUrl: finalDriveUrl,
                fileName: cleanStr(res.fileName || selPhoto.name),
                targetKey: ovKey,
                targetLabel: label,
                targetKind: targetKindTag,
                localDataUrl: cleanStr(selPhoto.localDataUrl || ''),
                destFolderName: destFolderTag,
                ts: Date.now()
            });
            saveVisualOverridesToLocalStorage();
            invalidateLoadedPhotosCache();
            broadcastVisualOverrideUpdateToCotizador(ovKey, finalOverride, false);
            if (!fromLoaded) notifyFotosInboxChanged('assign_visual');
            renderVisualTargetsList();
            renderInboxGallery();
            showVisualStageFeedback('✅ ' + label + ' guardada.', true);
        } catch (err) {
            rollbackVisualAssign();
            showVisualStageFeedback('❌ ' + ((err && err.message) || 'Error.'), false);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.saveVisualTargetPhotoUrl = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        const urlInp = document.getElementById('visualTargetUrlInput');
        const url = cleanStr(urlInp && urlInp.value);
        if (!target) {
            showVisualStageFeedback('Elige primero.', false);
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            showVisualStageFeedback('Link inválido.', false);
            return;
        }
        visualState.busy = true;
        showVisualStageFeedback('Guardando...', true);
        try {
            const saveRes = await persistVisualPhotoOverrideFromFotos(target, url, 'SAVE');
            visualState.selectedOverrideKey = '';
            renderVisualTargetsList();
            renderVisualTargetStage();
            showVisualStageFeedback(saveRes.ok ? '✅ Guardado.' : (saveRes.error || 'Guardado local.'), true);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.deleteSelectedVisualPhotoOverride = async function () {
        if (visualState.busy) return;
        const target = getSelectedVisualTargetObj();
        if (!target) return;
        visualState.busy = true;
        showVisualStageFeedback('Quitando...', true);
        try {
            const saveRes = await persistVisualPhotoOverrideFromFotos(target, '', 'DELETE');
            showVisualStageFeedback(saveRes.ok ? '✅ Eliminada.' : (saveRes.error || 'Eliminada local.'), true);
        } finally {
            visualState.busy = false;
            syncVisualStageSelectedGalleryPreview();
        }
    };

    window.__CREATA_FOTOS_VISUAL_TEST__ = {
        compactVisualOverrideKeyFotos: compactVisualOverrideKeyFotos,
        cleanFabricVariationNameFotos: cleanFabricVariationNameFotos,
        isPureWoodDescriptorFotos: isPureWoodDescriptorFotos,
        DEFAULT_WOOD_SWATCHES_FOTOS: DEFAULT_WOOD_SWATCHES_FOTOS,
        getVisualOverridePhotoUrlInFotos: getVisualOverridePhotoUrlInFotos,
        buildFallbackVisualTargetsFromProducts: buildFallbackVisualTargetsFromProducts,
        findMatchingUploadedFabricForProduct: findMatchingUploadedFabricForProduct,
        rebuildVisualTargetsCatalog: rebuildVisualTargetsCatalog,
        recordRecentUploadedPhoto: recordRecentUploadedPhoto,
        getRecentUploadedPhotosList: getRecentUploadedPhotosList,
        getLoadedPhotosList: getLoadedPhotosList,
        isTransientLockError: isTransientLockError,
        getVisualState: function () { return visualState; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFotosApp);
    } else {
        initFotosApp();
    }
})();
