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
    const LIVE_INBOX_POLL_MS = 6000;
    const LIVE_CATALOG_POLL_MS = 25000;
    const RATE_LIMIT_BACKOFF_MS = 15000;
    const pendingUploadPromises = new Map();

    let _fotosUiCheckpointRestoredOnce = false;
    let _fotosRestoringCheckpoint = false;
    let _fotosUserHasScrolled = false;
    let _fotosFlushingOutbox = false;
    let _deferredFotosInstallPrompt = null;
    let _fotosBackNav = null;
    let _fotosSwRegistration = null;
    let _liveInboxTimer = null;
    let _liveCatalogTimer = null;
    let _lastLiveVisibilitySyncMs = 0;
    let _lastInboxFingerprint = '';
    let _lastCatalogFingerprint = '';
    let _lastVisualFingerprint = '';
    let _lastSharedRecentFp = '';
    let _liveSyncPendingCount = 0;
    let _inboxRateLimitBackoffUntilMs = 0;
    let _backendSupportsInboxRev = false;

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
        inboxRev: '',
        recentUploads: [],
        rawInboxFromDrive: [],
        inboxFiles: [],
        loadedDriveFiles: [],
        archivedFiles: [],
        archivedFolderId: '',
        galleryRenderLimit: 240,
        driveInvPollCounter: 0,
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
        if (pendingUploadPromises && pendingUploadPromises.size > 0) return true;
        if (typeof visualState !== 'undefined' && visualState && visualState.busy) return true;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        return false;
    }

    let _inboxConsecutiveSyncFails = 0;

    async function runSilentFotosLiveTick(kind) {
        if (isFotosBusyForLivePoll()) return;
        const nowMs = Date.now();
        if (kind === 'inbox' && nowMs < _inboxRateLimitBackoffUntilMs) {
            setFotosLiveStatus('syncing', 'Sincronizando...');
            return;
        }
        _liveSyncPendingCount++;
        setFotosLiveStatus('syncing');
        try {
            if (kind === 'inbox') {
                await flushFotosOfflineOutbox();
                if (Date.now() >= _inboxRateLimitBackoffUntilMs) {
                    await window.refreshInboxOnly(false, { silent: true });
                }
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
                    loadSheetsCatalog({ silent: true })
                ];
                if (Date.now() >= _inboxRateLimitBackoffUntilMs) {
                    tasks.unshift(window.refreshInboxOnly(false, { silent: true }));
                }
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
                if (Date.now() < _inboxRateLimitBackoffUntilMs) {
                    setFotosLiveStatus('syncing', 'Sincronizando...');
                } else if (_inboxConsecutiveSyncFails > 0) {
                    setFotosLiveStatus('offline', 'Reconectando');
                } else {
                    setFotosLiveStatus('live');
                }
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
        if (!res || res.ok || res.authRequired || res.rateLimited || res.forbidden || res.forbiddenFolder) return false;
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

        if (res && res.rateLimited) {
            _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
            setFotosLiveStatus('syncing', 'Sincronizando...');
            return res;
        }

        if (isFotosAction && res && !res.ok && !res.unavailable && !res.rateLimited && !res.forbidden && !res.forbiddenFolder) {
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
                        if (res && res.rateLimited) {
                            _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                            setFotosLiveStatus('syncing', 'Sincronizando...');
                            return res;
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
                if (res && res.rateLimited) {
                    _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                    setFotosLiveStatus('syncing', 'Sincronizando...');
                    return res;
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
            deviceId: getFotosPresenceDeviceId(),
            inboxFolderId: SUBIR_FOLDER_ID
        };
        if (!state.authToken && state.accessKey) {
            payload.accessKey = state.accessKey;
        }
        return payload;
    }

    const COMPRAS_DATE_NOTICE = 'Solicitar información con compras';
    function isComprasManagedDateProvider(provRaw) {
        return /\b(?:SKANOR|BARSA)\b/i.test(cleanStr(provRaw));
    }
