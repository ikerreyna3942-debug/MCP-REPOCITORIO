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

    let _fotosUiCheckpointRestoredOnce = false;
    let _fotosRestoringCheckpoint = false;
    let _fotosFlushingOutbox = false;
    let _deferredFotosInstallPrompt = null;
    let _fotosBackNav = null;

    const SHEET_GIDS = {
        '1': '620514545',
        'INVENTARIO_EN_VIVO': '690403633',
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
        uploadInFlight: false,
        syncSkusInFlight: false,
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

    function extractDriveFileId(url) {
        const s = cleanStr(url);
        if (!s) return '';
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
        if (!raw) return '';
        if (raw.startsWith('data:image/') || raw.startsWith('blob:')) return raw;
        const fid = extractDriveFileId(raw);
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
        if (fid && /^[a-zA-Z0-9_-]{15,}$/.test(fid)) {
            if (step === 0) {
                imgEl.setAttribute('data-fb-step', '1');
                imgEl.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fid) + '=w400';
                return;
            }
            if (step === 1) {
                imgEl.setAttribute('data-fb-step', '2');
                imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fid) + '&sz=w480';
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

        if (/\bFUTON|\bFUTTON|SOFA\s*CAMA/.test(text)) return CATEGORIAS_DEST_FOLDERS[2];
        if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(text) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL|\bAUXILIAR/.test(text))) {
            return CATEGORIAS_DEST_FOLDERS[4];
        }
        if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRAL|\bNIDO\b/.test(text) || cat === 'MESAS DE CENTRO & LATERALES') {
            return CATEGORIAS_DEST_FOLDERS[3];
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
        if (Array.isArray(cloudRes.locations)) {
            for (let i = 0; i < cloudRes.locations.length; i++) {
                const loc = cloudRes.locations[i];
                if (loc && normalizeEmailInput(loc.correo) === OWNER_EMAIL && cleanStr(loc.authToken)) {
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
        const keys = [FOTOS_SESSION_KEY, PANEL_SESSION_KEY, HIST_SESSION_KEY];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                const prev = raw ? (JSON.parse(raw) || {}) : {};
                if (prev.correo && normalizeEmailInput(prev.correo) !== OWNER_EMAIL) continue;
                const nextObj = Object.assign({}, prev, {
                    correo: OWNER_EMAIL,
                    nombre: prev.nombre || OWNER_DISPLAY_NAME,
                    sheetTab: prev.sheetTab || 'PROYECTOS',
                    authToken: tok,
                    verifiedAt: Date.now()
                });
                localStorage.setItem(keys[i], JSON.stringify(nextObj));
            } catch (e) {}
        }
    }

    let _ownerTokenRenewPromise = null;

    async function sendRawWebAppPost(action, payloadObj, timeoutMs) {
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.getApiUrl === 'function')
            ? cleanStr(window.CREATA_CLOUD_CONFIG.getApiUrl())
            : '';
        const primaryUrl = cfgUrl || CANONICAL_WEBAPP_URL;

        const postOnce = async (targetUrl) => {
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
        };

        const res = await postOnce(primaryUrl);
        if (CANONICAL_WEBAPP_URL && primaryUrl !== CANONICAL_WEBAPP_URL && (!res || res.unavailable)) {
            const fb = await postOnce(CANONICAL_WEBAPP_URL);
            if (fb && !fb.unavailable) return fb;
        }
        return res;
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
        const payload = {
            authToken: tok,
            advisorEmail: OWNER_EMAIL,
            correo: OWNER_EMAIL,
            nombre: OWNER_DISPLAY_NAME,
            puesto: 'ADMINISTRADOR',
            sheetTab: 'PROYECTOS',
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
        _ownerTokenRenewPromise = (async () => {
            try {
                const loginRes = await sendRawWebAppPost('inv_login', {
                    email: OWNER_EMAIL,
                    accessKey: key,
                    sheetTab: 'PROYECTOS'
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
            action === 'fotos_delete' ||
            action === 'fotos_subir_delete' ||
            action === 'fotos_sync_skus';
    }

    async function callWebAppPost(action, payloadObj, timeoutMs) {
        const isFotosAction = isOwnerFotosProtectedAction(action);
        if (isFotosAction && !cleanStr(state.authToken) && cleanStr(state.accessKey)) {
            const preRenewed = await renewOwnerAuthTokenSilently();
            if (preRenewed && payloadObj && typeof payloadObj === 'object') {
                payloadObj = Object.assign({}, payloadObj, { authToken: preRenewed });
            }
        }

        let res = await sendRawWebAppPost(action, payloadObj, timeoutMs);
        if (res && res.renewedAuthToken) {
            persistRefreshedOwnerToken(res.renewedAuthToken);
        }

        if (isFotosAction && res && !res.ok && !res.unavailable && !res.forbidden && !res.forbiddenFolder) {
            const isSilentGateReject = !cleanStr(res.error) || !!res.authRequired;
            if (isSilentGateReject) {
                if (cleanStr(state.accessKey)) {
                    const freshTok = await renewOwnerAuthTokenSilently();
                    if (freshTok) {
                        const retryPayload = Object.assign({}, payloadObj || {}, { authToken: freshTok });
                        res = await sendRawWebAppPost(action, retryPayload, timeoutMs);
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
        return res;
    }

    function buildOwnerAuthPayload() {
        const payload = {
            authToken: state.authToken || '',
            advisorEmail: OWNER_EMAIL,
            sheetTab: 'PROYECTOS',
            inboxFolderId: SUBIR_FOLDER_ID
        };
        if (state.accessKey) {
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
                if (!persistUrl) continue;
                list.push({
                    sku: it.sku,
                    productName: it.productName || '',
                    rowNumber: it.rowNumber || '',
                    previousUrl: it.previousUrl || '',
                    newUrl: persistUrl,
                    fileId: it.fileId || '',
                    fileName: it.fileName || '',
                    destFolderName: it.destFolderName || '',
                    destFolderUrl: it.destFolderUrl || '',
                    ts: it.ts || Date.now()
                });
            }
            localStorage.setItem(SAVED_OVERRIDES_STORAGE, JSON.stringify(list));
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
                if (!it || !it.sku || !it.newUrl) continue;
                const cleanUrl = cleanStr(it.newUrl);
                if (!cleanUrl || cleanUrl.indexOf('blob:') === 0) continue;
                const sku = cleanStr(it.sku).toUpperCase();
                const fid = cleanStr(it.fileId || extractDriveFileId(cleanUrl));
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
                    p.fe || ''
                ];
            }
            const compactInbox = state.rawInboxFromDrive.slice(0, 220).map((f) => ({
                id: f.id,
                name: f.name,
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
                fn: compactFn
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
        } catch (e) {}

        let cachedSecret = '';
        try {
            if (typeof sessionStorage !== 'undefined') {
                cachedSecret = cleanStr(sessionStorage.getItem(FOTOS_SECRET_SESSION_KEY));
            }
            if (!cachedSecret) {
                cachedSecret = cleanStr(localStorage.getItem(FOTOS_SECRET_SESSION_KEY));
            }
        } catch (e) {}

        const candidateKeys = [FOTOS_SESSION_KEY, PANEL_SESSION_KEY, HIST_SESSION_KEY, INV_SESSION_KEY];
        let matchedOwner = false;
        let bestToken = '';
        let bestKey = cachedSecret;
        let otherInvEmail = '';

        for (let i = 0; i < candidateKeys.length; i++) {
            try {
                const raw = localStorage.getItem(candidateKeys[i]);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!parsed) continue;
                const email = normalizeEmailInput(parsed.correo);
                if (email && email !== OWNER_EMAIL) {
                    if (candidateKeys[i] === INV_SESSION_KEY) {
                        otherInvEmail = email;
                    }
                    continue;
                }
                if (email === OWNER_EMAIL && !parsed.mustChangeKey) {
                    matchedOwner = true;
                    const tok = cleanStr(parsed.authToken);
                    const storedKey = cleanStr(parsed.accessKey);
                    if (tok && !bestToken) bestToken = tok;
                    if (storedKey && !bestKey) bestKey = storedKey;
                }
            } catch (e) {}
        }

        if (matchedOwner) {
            if (bestToken || bestKey) {
                return { valid: true, authToken: bestToken, accessKey: bestKey };
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

        window.refreshAllPhotoWorkspace(false);
    }

    window.lockFotosPortal = function () {
        state.unlocked = false;
        stopFotosPresenceHeartbeatLoop();
        state.authToken = '';
        state.accessKey = '';
        if (typeof window.closePhotoLightbox === 'function') window.closePhotoLightbox();
        if (typeof window.closeFotosInstallModal === 'function') window.closeFotosInstallModal();
        if (typeof window.closeFotosSplitCotizador === 'function') window.closeFotosSplitCotizador();
        if (_fotosBackNav && typeof _fotosBackNav.resetToBase === 'function') {
            _fotosBackNav.resetToBase();
        }
        try {
            localStorage.removeItem(FOTOS_SESSION_KEY);
            localStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
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
            }, 8500);

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
                const issuedToken = extractAuthTokenFromLoginRes(cloudRes);
                state.authToken = issuedToken;
                state.accessKey = typedKey;
                const payload = JSON.stringify({
                    correo: OWNER_EMAIL,
                    nombre: OWNER_DISPLAY_NAME,
                    sheetTab: 'PROYECTOS',
                    authToken: issuedToken,
                    accessKey: typedKey,
                    verifiedAt: Date.now()
                });
                try {
                    localStorage.setItem(FOTOS_SESSION_KEY, payload);
                    localStorage.setItem(PANEL_SESSION_KEY, payload);
                    localStorage.setItem(HIST_SESSION_KEY, payload);
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem(FOTOS_SECRET_SESSION_KEY, typedKey);
                    }
                    if (!issuedToken) {
                        localStorage.setItem(FOTOS_SECRET_SESSION_KEY, typedKey);
                    } else {
                        localStorage.removeItem(FOTOS_SECRET_SESSION_KEY);
                    }
                } catch (e) {}
                if (pwdInp) pwdInp.value = '';
                unlockFotosPortal();
                syncFotosBackNav('unlock');
            }
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

    function getLoadedPhotosList() {
        if (state.cachedLoadedList) return state.cachedLoadedList;

        const q = readDeletedQueue();
        const delFileMap = q.fileIds || {};
        const delSkuMap = q.skus || {};
        const items = [];
        const seenKey = new Set();

        for (let s = 0; s < state.sessionSavedLogs.length; s++) {
            const log = state.sessionSavedLogs[s];
            if (!log || !log.sku) continue;
            const sku = cleanStr(log.sku).toUpperCase();
            const fid = cleanStr(log.fileId || extractDriveFileId(log.newUrl));
            if (!fid || !/^[a-zA-Z0-9_-]{15,}$/.test(fid) || delFileMap[fid] || delSkuMap[sku]) continue;
            const key = sku + '::' + fid;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            const name = log.productName || sku;
            const destName = log.destFolderName || '';
            items.push({
                id: fid,
                sku: sku,
                name: name,
                viewUrl: log.newUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing'),
                localDataUrl: log.localDataUrl || '',
                destFolderName: destName,
                shortFolder: destName.replace(/^FOTOS\s+(DE\s+)?/i, ''),
                rowNumber: log.rowNumber || null,
                fromLoaded: true,
                _searchNorm: normalizeSearchText(sku + ' ' + name + ' ' + destName)
            });
        }

        for (let i = 0; i < state.products.length; i++) {
            const p = state.products[i];
            if (!p || !p.photoUrl) continue;
            const sku = p.sku;
            const fid = p.photoFileId || extractDriveFileId(p.photoUrl);
            if (!fid || !/^[a-zA-Z0-9_-]{15,}$/.test(fid) || delFileMap[fid] || delSkuMap[sku]) continue;
            const key = sku + '::' + fid;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            const name = p.displayName || p.colBName || sku;
            const destName = p.destFolderName || '';
            items.push({
                id: fid,
                sku: sku,
                name: name,
                viewUrl: p.photoUrl,
                localDataUrl: '',
                destFolderName: destName,
                shortFolder: destName.replace(/^FOTOS\s+(DE\s+)?/i, ''),
                rowNumber: p.rowNumber || null,
                fromLoaded: true,
                _searchNorm: (p.searchSkuNorm || '') + ' ' + (p.searchNameNorm || '') + ' ' + normalizeSearchText(destName)
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

    async function loadSheetsCatalog() {
        if (state.sheetsPromise) return state.sheetsPromise;
        state.sheetsLoading = true;
        const listEl = document.getElementById('skuResultsList');
        if (listEl && !state.products.length) {
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

                // Resolver índices de columnas de las 11 ubicaciones, fecha LPPT y precio en INVENTARIO_EN_VIVO
                let whColIndices = FOTOS_WAREHOUSES.map((w) => w.defaultCol);
                let colFeIdx = 16;
                let colPrecioIdx = 48;
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
                    colPrecioIdx = findHdrCol(['PRECIO DE LISTA', 'PRECIO LISTA', 'PRECIO'], 48);
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
                            const displayName = colBName || (inv ? inv.nombreInv : '') || '';
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
                                existing.displayName = colBName;
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
                state.sessionSavedBySku.forEach((savedMeta, sku) => {
                    if (delSkus[sku]) return;
                    const item = mergedMap.get(sku);
                    if (item && savedMeta && savedMeta.newUrl) {
                        const savedFid = savedMeta.fileId || extractDriveFileId(savedMeta.newUrl);
                        if (savedFid && delFiles[savedFid]) return;
                        const prevFid = extractDriveFileId(savedMeta.previousUrl);
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

                state.products = list;
                state.productBySku = mergedMap;
                state.productByNormName = byNormName;
                rebuildSiblingVariantsIndex();
                state.inboxFiles = filterAndMergeInboxFiles(state.rawInboxFromDrive.length ? state.rawInboxFromDrive : state.inboxFiles);
                invalidateLoadedPhotosCache();
                scheduleSaveFastCache();

                if (state.unlocked) {
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
            '<button type="button" class="cat-filter-pill' + (activeCatKey === 'ALL' ? ' active' : '') + '" data-cat-key="ALL" onclick="setSkuCategoryFilter(\'ALL\')">' +
                '<span>Todas</span>' +
            '</button>'
        ];
        for (let i = 0; i < CATEGORIAS_DEST_FOLDERS.length; i++) {
            const f = CATEGORIAS_DEST_FOLDERS[i];
            const cnt = countsByFolderId.get(f.id) || 0;
            const isAct = activeCatKey === f.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-cat-key="' + escapeHtml(f.key) + '" onclick="setSkuCategoryFilter(\'' + escapeHtml(f.key) + '\')">' +
                    '<span>' + escapeHtml(f.short || f.name.replace(/^FOTOS\s+(DE\s+)?/i, '')) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
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
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'ALL' ? ' active' : '') + '" data-loc-key="ALL" onclick="setSkuLocationFilter(\'ALL\')">' +
                '<span>Todas ubic.</span>' +
            '</button>',
            '<button type="button" class="cat-filter-pill' + (activeLocKey === 'QUOTABLE' ? ' active' : '') + '" data-loc-key="QUOTABLE" onclick="setSkuLocationFilter(\'QUOTABLE\')" title="Visibles en Cotizador">' +
                '<span>En Cotizador</span>' +
                '<span class="cat-cnt">' + quotableCount + '</span>' +
            '</button>'
        ];

        for (let w = 0; w < FOTOS_WAREHOUSES.length; w++) {
            const wh = FOTOS_WAREHOUSES[w];
            const cnt = countsByWh[w] || 0;
            const isAct = activeLocKey === wh.key;
            pills.push(
                '<button type="button" class="cat-filter-pill' + (isAct ? ' active' : '') + '" data-loc-key="' + escapeHtml(wh.key) + '" onclick="setSkuLocationFilter(\'' + escapeHtml(wh.key) + '\')" title="' + escapeHtml(wh.label) + '">' +
                    '<span>' + escapeHtml(wh.short) + '</span>' +
                    '<span class="cat-cnt">' + cnt + '</span>' +
                '</button>'
            );
        }
        wrap.innerHTML = pills.join('');
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
                        ? ('<button type="button" class="hdr-btn is-accent is-compact-btn" onclick="syncSkusNow(\'' + escapeHtml(rawTyped.replace(/'/g, "\\'")) + '\')">↻ ERP "' + escapeHtml(rawTyped) + '"</button>')
                        : '') +
                    (looksLikeSku
                        ? ('<button type="button" class="hdr-btn is-neutral is-compact-btn" onclick="useNewManualSku(\'' + escapeHtml(rawTyped.replace(/'/g, "\\'")) + '\')">+ SKU "' + escapeHtml(rawTyped) + '"</button>')
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
            const thumb = p.photoUrl ? buildPhotoThumbUrl(fid || p.photoUrl, 160) : '';
            const safeSku = escapeHtml(p.sku.replace(/'/g, "\\'"));
            const safeFid = escapeHtml(fid.replace(/'/g, "\\'"));
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
                '<div class="sku-item' + (isSel ? ' selected' : '') + '" data-sku="' + escapeHtml(p.sku) + '" onclick="selectSkuProduct(\'' + safeSku + '\')">' +
                    '<div class="sku-mini-thumb">' +
                        (thumb
                            ? ('<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(fid) + '" onerror="handlePhotoImgError(this)">')
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
                                    '<button type="button" class="sku-quick-btn is-take" onclick="takePhotoFromSkuRow(\'' + safeSku + '\', event)">Tomar</button>' +
                                    '<button type="button" class="sku-quick-btn is-del" onclick="deleteLoadedPhotoBySku(\'' + safeSku + '\', \'' + safeFid + '\', event)">🗑</button>' +
                                   '</span>')
                                : '') +
                        '</div>' +
                        '<div class="sku-name">' + escapeHtml(p.displayName) + '</div>' +
                        (subParts.length ? ('<div class="sku-submeta">' + escapeHtml(subParts.join(' · ')) + '</div>') : '') +
                    '</div>' +
                '</div>';
        }
        listEl.innerHTML = htmlParts.join('');
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

        if (!prod) {
            if (rowBadge) rowBadge.textContent = '—';
            if (btnOpenCotizador) btnOpenCotizador.classList.add('hidden');
            if (colASku) colASku.textContent = '—';
            if (colBName) colBName.textContent = '—';
            if (catLabel) catLabel.textContent = '—';
            if (moVarVal) moVarVal.textContent = '—';
            if (dimsFinVal) dimsFinVal.textContent = '—';
            if (locWrap) locWrap.classList.add('hidden');
            if (locGrid) locGrid.innerHTML = '';
            if (sibWrap) sibWrap.classList.add('hidden');
            if (sibList) sibList.innerHTML = '';
            if (curOpenLink) curOpenLink.classList.add('hidden');
            if (curTakeBtn) curTakeBtn.classList.add('hidden');
            if (curDeleteBtn) curDeleteBtn.classList.add('hidden');
            if (curCanvas) curCanvas.innerHTML = '<div class="photo-empty-placeholder">—</div>';
            renderNewPhotoStage();
            return;
        }

        if (btnOpenCotizador) btnOpenCotizador.classList.remove('hidden');
        if (rowBadge) {
            rowBadge.textContent = prod.inSheet1 ? (prod.rowNumber ? ('Fila ' + prod.rowNumber) : 'Hoja 1') : 'Nuevo';
        }
        if (colASku) colASku.textContent = prod.sku;
        if (colBName) colBName.textContent = prod.colBName || prod.displayName;
        if (catLabel) catLabel.textContent = prod.destFolderName.replace(/^FOTOS\s+(DE\s+)?/i, '');

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
                    ? ('LPPT: ' + qty + (qty === 1 ? ' disponible' : ' disponibles') + (prod.fe ? (' · Entrega est. ' + prod.fe) : ''))
                    : wh.label;
                chipsHtml.push(
                    '<div class="loc-stock-chip ' + semClass + lpptClass + '">' +
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
                    const safeSku = escapeHtml(sItem.sku.replace(/'/g, "\\'"));
                    return '<button type="button" class="sib-var-pill' + (isAct ? ' active' : '') + '" onclick="selectSkuProduct(\'' + safeSku + '\')" title="' + escapeHtml(sItem.sku + ' · ' + sItem.displayName) + '">' +
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
                    'onclick="openPhotoLightbox(\'' + escapeHtml(previewSrc.replace(/'/g, "\\'")) + '\')" ' +
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
            const previewUrl = selPhoto.localDataUrl || selPhoto.thumbDataUrl || buildPhotoThumbUrl(selPhoto.id, 900);
            canvas.innerHTML =
                '<img src="' + escapeHtml(previewUrl) + '" alt="' + escapeHtml(selPhoto.name) + '" decoding="async" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(selPhoto.id) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(previewUrl.replace(/'/g, "\\'")) + '\')" ' +
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
            const savedPreview = savedSession.localDataUrl || buildPhotoThumbUrl(savedSession.fileId || savedSession.newUrl, 900);
            const fid = savedSession.fileId || extractDriveFileId(savedSession.newUrl);
            canvas.innerHTML =
                '<img src="' + escapeHtml(savedPreview) + '" alt="' + escapeHtml(savedSession.sku) + '" decoding="async" referrerpolicy="no-referrer" ' +
                'data-drive-id="' + escapeHtml(fid) + '" ' +
                'onclick="openPhotoLightbox(\'' + escapeHtml(savedPreview.replace(/'/g, "\\'")) + '\')" ' +
                'onerror="handlePhotoImgError(this)">';
            if (footWrap) footWrap.classList.remove('hidden');
            if (footText) {
                footText.innerHTML = escapeHtml(savedSession.destFolderName) + ' · <a href="' + escapeHtml(savedSession.newUrl) + '" target="_blank" rel="noopener" style="color:#6EE7B7;font-weight:800;">↗</a>';
            }
            return;
        }

        if (stageTitle) stageTitle.textContent = 'Seleccionada';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (delBtn) delBtn.classList.add('hidden');
        if (footWrap) footWrap.classList.add('hidden');
        canvas.innerHTML = '<div class="photo-empty-placeholder">—</div>';
    }

    function updateAssignButtonState() {
        const btn = document.getElementById('btnAssignPhotoNow');
        const selPhoto = getActiveSelectedPhotoObject();
        const canAssign = !!(state.selectedSku && selPhoto);
        if (btn) {
            btn.disabled = !canAssign;
            btn.textContent = state.selectedSku ? ('Guardar en ' + state.selectedSku) : 'Guardar';
        }
        const quickBar = document.getElementById('mobileQuickSaveBar');
        const quickSku = document.getElementById('mobileQuickSaveSku');
        const quickBtn = document.getElementById('btnMobileQuickSaveNow');
        const showQuick = canAssign && !_fotosSplitActive;
        if (quickBar) quickBar.classList.toggle('hidden', !showQuick);
        if (quickSku) quickSku.textContent = state.selectedSku || '—';
        if (quickBtn) quickBtn.disabled = !canAssign;
        if (document.body && document.body.classList) {
            document.body.classList.toggle('has-mobile-quick-save', showQuick);
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

    window.refreshInboxOnly = async function (manualRefresh) {
        if (state.inboxLoading) return;
        state.inboxLoading = true;
        const btnInb = document.getElementById('btnRefreshInbox');
        if (btnInb) { btnInb.disabled = true; btnInb.textContent = '↻...'; }
        const container = document.getElementById('inboxGalleryContainer');
        if (container && !state.inboxFiles.length && state.galleryMode === 'INBOX') {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">Cargando...</div>';
        }

        let res = null;
        try {
            res = await callWebAppPost('fotos_subir_list', buildOwnerAuthPayload(), 30000);
            if ((!res || res.unavailable) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
                res = await callWebAppPost('fotos_subir_list', buildOwnerAuthPayload(), 30000);
            }
        } finally {
            state.inboxLoading = false;
            if (btnInb) { btnInb.disabled = false; btnInb.textContent = '↻'; }
        }

        if (res && res.ok && Array.isArray(res.files)) {
            reconcileDeletedQueueWithLiveState(res.files);
            state.rawInboxFromDrive = res.files;
            state.inboxFiles = filterAndMergeInboxFiles(res.files);
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
            renderInboxGallery();
            return;
        }

        if (container && state.galleryMode === 'INBOX' && !state.inboxFiles.length) {
            container.innerHTML = '<div class="photo-empty-placeholder" style="grid-column:1/-1;">' +
                escapeHtml(errMsg || 'No se pudo cargar la carpeta de Drive. Toca ↻ para reintentar.') +
                '</div>';
        }
    };

    function renderInboxGallery() {
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
                const safeSku = escapeHtml((item.sku || '').replace(/'/g, "\\'"));
                const safeId = escapeHtml((item.id || '').replace(/'/g, "\\'"));
                const cardKey = 'L::' + (item.sku || '') + '::' + item.id;

                parts[i] =
                    '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" onclick="takeLoadedPhotoForAssign(\'' + safeSku + '\', \'' + safeId + '\')">' +
                        '<div class="inbox-thumb-box">' +
                            '<button type="button" class="card-del-btn" title="Borrar" onclick="deleteLoadedPhotoBySku(\'' + safeSku + '\', \'' + safeId + '\', event)">🗑</button>' +
                            '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(item.id) + '" onerror="handlePhotoImgError(this)">' +
                        '</div>' +
                        '<div class="inbox-card-meta">' +
                            '<div class="inbox-file-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.sku ? (item.sku + ' · ' + item.name) : item.name) + '</div>' +
                            '<div class="inbox-file-sub">' +
                                '<span>' + escapeHtml(item.shortFolder || '') + '</span>' +
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
            const safeFid = escapeHtml((f.id || '').replace(/'/g, "\\'"));
            const cardKey = 'I::' + f.id;

            parts[i] =
                '<div class="inbox-photo-card' + (isSel ? ' selected' : '') + '" data-card-key="' + escapeHtml(cardKey) + '" onclick="selectInboxPhoto(\'' + safeFid + '\')">' +
                    '<div class="inbox-thumb-box">' +
                        '<button type="button" class="card-del-btn" title="Borrar" onclick="deleteInboxPhotoById(\'' + safeFid + '\', event)">🗑</button>' +
                        '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drive-id="' + escapeHtml(f.id) + '" onerror="handlePhotoImgError(this)">' +
                    '</div>' +
                    '<div class="inbox-card-meta">' +
                        '<div class="inbox-file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>' +
                        '<div class="inbox-file-sub">' +
                            '<span>' + escapeHtml(sz) + '</span>' +
                            '<span data-take-lbl="1" style="font-weight:800;color:' + (isSel ? '#CCA66B' : '#D0D9E4') + ';">' + (isSel ? '✓' : 'Tomar') + '</span>' +
                        '</div>' +
                        (suggestedSku
                            ? ('<button type="button" class="suggest-sku-btn" onclick="applySuggestedSkuFromInbox(\'' + safeFid + '\', \'' + escapeHtml(suggestedSku.replace(/'/g, "\\'")) + '\', event)">SKU ' + escapeHtml(suggestedSku) + '</button>')
                            : '') +
                    '</div>' +
                '</div>';
        }
        container.innerHTML = parts.join('');
    }

    function updateGallerySelectionInDom() {
        const container = document.getElementById('inboxGalleryContainer');
        if (!container) return;
        const activePhoto = getActiveSelectedPhotoObject();
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
                viewUrl: fObj.viewUrl || ('https://drive.google.com/file/d/' + fObj.id + '/view?usp=sharing'),
                thumbDataUrl: fObj.thumbDataUrl || '',
                localDataUrl: fObj.localDataUrl || '',
                fromLoaded: false,
                skuOrigin: cleanStr(fObj.skuOrigin)
            } : null;

            if (fObj) {
                const sug = fObj._suggestedSku || findSuggestedSkuForFileName(fObj.name) || cleanStr(fObj.skuOrigin);
                if (sug) {
                    const explicitInName = extractExplicitSkuFromFileName(fObj.name);
                    let typeConflict = false;
                    if (state.selectedSku && state.selectedSku !== sug) {
                        const curProd = state.productBySku.get(state.selectedSku);
                        const curTxt = normPlainCat((curProd && (curProd.displayName + ' ' + curProd.tipo)) || '');
                        const fTxt = normPlainCat(fObj.name || '');
                        if (
                            (/\bSILLAS?\b/.test(curTxt) && /\bSILLON(?:ES)?\b/.test(fTxt)) ||
                            (/\bSILLON(?:ES)?\b/.test(curTxt) && /\bSILLAS?\b/.test(fTxt))
                        ) {
                            typeConflict = true;
                        }
                    }
                    if (!state.selectedSku || explicitInName === sug || typeConflict) {
                        window.selectSkuProduct(sug, { skipBackSync: true });
                    }
                }
            }
        }
        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
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
        const url = (prod && prod.photoUrl) || (saved && saved.newUrl) || (fid ? ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing') : '');
        if (!fid && url) fid = extractDriveFileId(url);
        if (!fid) return;

        const alreadySame = state.selectedPhotoItem &&
            state.selectedPhotoItem.id === fid &&
            state.selectedPhotoItem.fromLoaded &&
            state.selectedPhotoItem.skuOrigin === sku;

        if (alreadySame) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
        } else {
            const displayLabel = prod
                ? (prod.sku + ' · ' + (prod.displayName || prod.colBName || prod.sku))
                : (sku || fid);
            state.selectedInboxFileId = fid;
            state.selectedPhotoItem = {
                id: fid,
                name: displayLabel,
                viewUrl: url,
                thumbDataUrl: '',
                localDataUrl: (saved && saved.localDataUrl) || '',
                fromLoaded: true,
                skuOrigin: sku
            };
        }

        hideAssignFeedback();
        updateGallerySelectionInDom();
        renderSelectedProductStage();
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
        showAssignFeedback('🗑 Foto borrada de SUBIR PREN.', true);

        if (fid.indexOf('local_inb_') === 0) {
            removeOutboxEntriesForLocalFileId(fid);
            deleteOfflinePhotoBlobIdb(fid);
            unmarkSkuDeletedInQueue('', fid);
            return;
        }

        const res = await callWebAppPost('fotos_delete', Object.assign({
            driveFileId: fid,
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

        if (!sku && !fid) return;

        markDeletedInQueue(fid, sku);

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
        showAssignFeedback('🗑 Foto borrada' + (sku ? (' de ' + escapeHtml(sku)) : '') + '.', true);

        const res = await callWebAppPost('fotos_delete', Object.assign({
            sku: sku,
            driveFileId: fid,
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

    async function readFileAsOptimizedDataUrl(file) {
        const MAX_DIM = 1150;
        const JPEG_Q = 0.78;
        const fileName = (file && file.name) || 'foto.jpg';
        if (typeof createImageBitmap === 'function' && file && file.size > 110000) {
            try {
                const bmp = await createImageBitmap(file);
                let w = bmp.width;
                let h = bmp.height;
                if (w > MAX_DIM || h > MAX_DIM) {
                    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
                    w = Math.max(1, Math.round(w * scale));
                    h = Math.max(1, Math.round(h * scale));
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, w, h);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(bmp, 0, 0, w, h);
                if (bmp.close) bmp.close();
                return canvas.toDataURL('image/jpeg', JPEG_Q);
            } catch (eBmp) {}
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                const normalized = normalizeImageDataUrl(rawDataUrl, fileName);
                const needsCanvas = (file && file.size > 140000) || !/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(rawDataUrl);
                if (!needsCanvas || typeof Image === 'undefined') {
                    resolve(normalized);
                    return;
                }
                const img = new Image();
                img.onerror = () => resolve(normalized);
                img.onload = () => {
                    try {
                        let w = img.naturalWidth || img.width;
                        let h = img.naturalHeight || img.height;
                        if (w > MAX_DIM || h > MAX_DIM) {
                            const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
                            w = Math.max(1, Math.round(w * scale));
                            h = Math.max(1, Math.round(h * scale));
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, w, h);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', JPEG_Q));
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
            const fallbackInp = document.getElementById('pcUploadFolderToSubirInput');
            if (fallbackInp && typeof fallbackInp.click === 'function') {
                fallbackInp.click();
                return [];
            }
            showAssignFeedback('ℹ️ Usa "📁 Carpeta" para elegir SUBIR PREN.', false);
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
            const fallbackInp = document.getElementById('pcUploadFolderToSubirInput');
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
                    window.jumpToFotosSection('secSkuFinder');
                    return;
                }
                await window.uploadLocalFilesToSubir({ files: files }, { suppressSummaryFeedback: true });
                await window.autoAssignMatchedInboxByCategory();
                return;
            }

            // CARGA Y ASIGNACIÓN INSTANTÁNEA (0ms en pantalla, subida en paralelo a su carpeta de Categoría)
            const targetSku = state.selectedSku;
            const prod = state.productBySku.get(targetSku);
            if (!prod) return;

            const destSelect = document.getElementById('destFolderSelect');
            const chosenFolderId = cleanStr(destSelect ? destSelect.value : prod.destFolderId) || prod.destFolderId;
            const chosenFolderMeta = DEST_FOLDER_BY_ID.get(chosenFolderId) || resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
            if (destSelect && chosenFolderMeta) destSelect.value = chosenFolderMeta.id;

            // Disparamos la carga instantánea del primer archivo con suppressSummaryFeedback para no pisar el estado de Guardar
            const uploadPromise = window.uploadLocalFilesToSubir({ files: [files[0]] }, { suppressSummaryFeedback: true });
            // Como uploadLocalFilesToSubir inserta el archivo de forma síncrona en los primeros milisegundos, ya está seleccionado:
            if (state.selectedSku === targetSku && getActiveSelectedPhotoObject()) {
                await window.assignSelectedPhotoToProduct();
                await uploadPromise;
            } else {
                await uploadPromise;
                if (state.selectedSku === targetSku && getActiveSelectedPhotoObject()) {
                    await window.assignSelectedPhotoToProduct();
                }
            }

            if (files.length > 1) {
                await window.uploadLocalFilesToSubir({ files: files.slice(1) }, { suppressSummaryFeedback: true });
                await window.autoAssignMatchedInboxByCategory(true);
            }
        } finally {
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
        }
    };

    window.autoAssignMatchedInboxByCategory = async function (silentIfNone) {
        if (!state.inboxFiles.length) {
            if (!silentIfNone) showAssignFeedback('ℹ️ Bandeja vacía.', true);
            return;
        }
        const candidates = [];
        for (let i = 0; i < state.inboxFiles.length; i++) {
            const f = state.inboxFiles[i];
            if (!f || !f.id) continue;
            const sugSku = cleanStr(f._suggestedSku || findSuggestedSkuForFileName(f.name) || f.skuOrigin).toUpperCase();
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

        const autoDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
        const destSelect = document.getElementById('destFolderSelect');
        const requestedFolderId = cleanStr(destSelect ? destSelect.value : '') || cleanStr(prod.destFolderId);
        const targetDestMeta = (requestedFolderId && DEST_FOLDER_BY_ID.get(requestedFolderId)) || autoDestMeta;
        const targetFolderId = targetDestMeta.id;
        if (destSelect && targetFolderId) destSelect.value = targetFolderId;

        let activeFileId = selPhoto.id;
        const isLocalPendingPhoto = String(activeFileId || '').indexOf('local_inb_') === 0;
        const optimisticUrl = isLocalPendingPhoto
            ? (selPhoto.localDataUrl || selPhoto.thumbDataUrl || selPhoto.viewUrl || '')
            : (selPhoto.viewUrl || ('https://drive.google.com/file/d/' + activeFileId + '/view?usp=sharing'));
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
            localDataUrl: selPhoto.localDataUrl || selPhoto.thumbDataUrl || '',
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

        state.selectedInboxFileId = '';
        state.selectedPhotoItem = null;

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

        notifySplitPeerOfPhotoUpdate(prod.sku, optimisticUrl, activeFileId, targetDestMeta.name);

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
                    renderSessionHistoryLog();
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
                renderSessionHistoryLog();
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
            saveSavedOverridesNow();
            invalidateLoadedPhotosCache();
            scheduleSaveFastCache();
            if (state.selectedSku === prod.sku) {
                renderSelectedProductStage();
            }
            renderSessionHistoryLog();
            showAssignFeedback(
                '✅ Fila ' + escapeHtml(logEntry.rowNumber) + ' → <strong>' + escapeHtml(logEntry.destFolderName) + '</strong>.',
                true
            );
        } finally {
            state.assignInFlight = Math.max(0, state.assignInFlight - 1);
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

        listEl.innerHTML = state.sessionSavedLogs.map((item) => {
            const safeSku = escapeHtml(item.sku.replace(/'/g, "\\'"));
            const safeFid = escapeHtml((item.fileId || extractDriveFileId(item.newUrl)).replace(/'/g, "\\'"));
            return (
                '<div class="session-log-row">' +
                    '<span><strong>' + escapeHtml(item.sku) + '</strong> → ' + escapeHtml(item.destFolderName) + ' (Fila ' + escapeHtml(item.rowNumber) + ')</span>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<button type="button" class="hdr-btn is-accent stage-action-btn" onclick="takeLoadedPhotoForAssign(\'' + safeSku + '\', \'' + safeFid + '\', event)">Tomar</button>' +
                        '<button type="button" class="hdr-btn is-danger stage-action-btn" onclick="deleteLoadedPhotoBySku(\'' + safeSku + '\', \'' + safeFid + '\', event)">🗑</button>' +
                        '<button type="button" class="hdr-btn is-neutral stage-action-btn" onclick="selectSkuProduct(\'' + safeSku + '\')">Ver</button>' +
                        '<a href="' + escapeHtml(item.newUrl) + '" target="_blank" rel="noopener" class="hdr-btn stage-action-btn">↗</a>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
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
        const origTxt = btnRef ? btnRef.textContent : '↻ Fotos';
        if (btnRef) { btnRef.disabled = true; btnRef.textContent = '↻...'; }
        try {
            await flushFotosOfflineOutbox();
            await Promise.all([
                loadSheetsCatalog(),
                window.refreshInboxOnly(false)
            ]);
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

    async function putOfflinePhotoBlobIdb(record) {
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

    function writeFotosOfflineOutbox(arr) {
        try {
            localStorage.setItem(FOTOS_OFFLINE_OUTBOX_STORAGE, JSON.stringify((arr || []).slice(-120)));
        } catch (e) {}
    }

    function enqueueFotosOfflineOutbox(entry) {
        const q = readFotosOfflineOutbox();
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
        try {
            const blobs = await getAllOfflinePhotoBlobsIdb();
            if (!blobs.length) return;
            const blobById = new Map(blobs.map((b) => [b.id, b]));
            let changed = false;

            const queue = readFotosOfflineOutbox();
            const assignedLocalIds = new Set(
                queue.filter((it) => it && it.type === 'assign_photo').map((it) => it.driveFileId)
            );

            for (let i = 0; i < blobs.length; i++) {
                const b = blobs[i];
                if (!b || !b.id || !b.dataUrl) continue;
                if (!assignedLocalIds.has(b.id) && !state.inboxFiles.some((f) => f.id === b.id)) {
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
                if (log && String(log.fileId || '').indexOf('local_inb_') === 0 && !log.localDataUrl && blobById.has(log.fileId)) {
                    const b = blobById.get(log.fileId);
                    log.localDataUrl = b.dataUrl;
                    log.newUrl = b.dataUrl;
                    const prod = state.productBySku.get(log.sku);
                    if (prod && prod.photoFileId === log.fileId) {
                        prod.photoUrl = b.dataUrl;
                    }
                    changed = true;
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

            if (changed && state.unlocked) {
                invalidateLoadedPhotosCache();
                applySkuFiltersAndRender();
                renderInboxGallery();
                renderSelectedProductStage();
                renderSessionHistoryLog();
            }
        } catch (e) {}
    }

    async function flushFotosOfflineOutbox() {
        if (_fotosFlushingOutbox || !state.unlocked) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const queue = readFotosOfflineOutbox();
        if (!queue.length) return;

        _fotosFlushingOutbox = true;
        try {
            const localToRealId = {};
            const remaining = [];
            let syncedAny = false;

            for (let i = 0; i < queue.length; i++) {
                const entry = queue[i];
                if (!entry) continue;

                if (entry.type === 'upload_inbox') {
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
                    } else {
                        remaining.push(...queue.slice(i));
                        break;
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
                        if (entry.sku && (res.newUrl || (prod && prod.photoUrl))) {
                            notifySplitPeerOfPhotoUpdate(
                                entry.sku,
                                res.newUrl || (prod && prod.photoUrl) || '',
                                res.fileId || (prod && prod.photoFileId) || '',
                                (prod && prod.destFolderName) || ''
                            );
                        }
                    } else if (res && res.unavailable) {
                        entry.driveFileId = resolvedFid;
                        remaining.push(...queue.slice(i));
                        break;
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
                renderSessionHistoryLog();
                showAssignFeedback('✅ Pendientes sincronizadas.', true);
            }
        } catch (e) {
            // Keep remaining queue
        } finally {
            _fotosFlushingOutbox = false;
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
                    const skuListEl = document.getElementById('skuResultsList');
                    if (skuListEl && typeof cp.skuListScrollTop === 'number' && cp.skuListScrollTop > 0) {
                        skuListEl.scrollTop = cp.skuListScrollTop;
                    }
                    const galEl = document.getElementById('inboxGalleryContainer');
                    if (galEl && typeof cp.galleryScrollTop === 'number' && cp.galleryScrollTop > 0) {
                        galEl.scrollTop = cp.galleryScrollTop;
                    }
                    if (typeof cp.windowScrollY === 'number' && cp.windowScrollY > 0) {
                        window.scrollTo({ top: cp.windowScrollY, behavior: 'auto' });
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
        return target === 'prompts' ? './prompts.html' : './inventario.html?embed=1';
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
            btn.textContent = _fotosSplitActive ? '⬛⬜ Cerrar División' : '⬛⬜ Dividir con Cotizador';
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
        if (d.type === 'CREATA_SPLIT_PHOTO_SAVED' && d.source !== 'fotos' && d.sku) {
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

    function initFotosApp() {
        try {
            if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
                navigator.serviceWorker.register('./fotos-sw.js', { scope: './fotos-productos' }).catch(() => {});
            }
        } catch (eSw) {}

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

        // Sincronización en vivo con el Cotizador (Pantalla Dividida y Pestañas Hermanas)
        window.addEventListener('message', (ev) => {
            handleIncomingPeerMessageInFotos(ev && ev.data);
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

        const skuListEl = document.getElementById('skuResultsList');
        let skuScrollTimer = null;
        if (skuListEl) {
            skuListEl.addEventListener('scroll', () => {
                if (skuScrollTimer) clearTimeout(skuScrollTimer);
                skuScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        const galEl = document.getElementById('inboxGalleryContainer');
        let galScrollTimer = null;
        if (galEl) {
            galEl.addEventListener('scroll', () => {
                if (galScrollTimer) clearTimeout(galScrollTimer);
                galScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
            }, { passive: true });
        }

        let winScrollTimer = null;
        window.addEventListener('scroll', () => {
            if (winScrollTimer) clearTimeout(winScrollTimer);
            winScrollTimer = setTimeout(() => saveFotosUiCheckpointNow(), 250);
        }, { passive: true });

        window.addEventListener('pagehide', () => saveFotosUiCheckpointNow());
        window.addEventListener('beforeunload', () => saveFotosUiCheckpointNow());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') saveFotosUiCheckpointNow();
            else if (document.visibilityState === 'visible' && state.unlocked) sendFotosPresenceHeartbeat(false);
        });
        window.addEventListener('focus', () => {
            if (state.unlocked) sendFotosPresenceHeartbeat(false);
        });

        window.addEventListener('online', () => {
            if (state.unlocked) {
                showAssignFeedback('🌐 En línea · sincronizando...', true);
                flushFotosOfflineOutbox();
                sendFotosPresenceHeartbeat(false);
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
                const ids = ['secSkuFinder', 'secProductCard', 'secInboxGallery'];
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFotosApp);
    } else {
        initFotosApp();
    }
})();
