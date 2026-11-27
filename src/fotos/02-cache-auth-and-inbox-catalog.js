    const DELETED_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
    let _drainingDeletedQueue = false;

    function readDeletedQueue() {
        if (state.deletedQueue) return state.deletedQueue;
        try {
            const raw = localStorage.getItem(DELETED_QUEUE_STORAGE);
            if (!raw) {
                state.deletedQueue = { fileIds: {}, skus: {}, shortcutIds: {} };
                return state.deletedQueue;
            }
            const parsed = JSON.parse(raw);
            const rawFileIds = (parsed && typeof parsed.fileIds === 'object' && parsed.fileIds) ? parsed.fileIds : {};
            const rawSkus = (parsed && typeof parsed.skus === 'object' && parsed.skus) ? parsed.skus : {};
            const rawShortcutIds = (parsed && typeof parsed.shortcutIds === 'object' && parsed.shortcutIds) ? parsed.shortcutIds : {};
            const now = Date.now();
            const cleanFileIds = {};
            const cleanShortcutIds = {};
            let pruned = false;
            Object.keys(rawFileIds).forEach((fid) => {
                const entryVal = rawFileIds[fid];
                const ts = (entryVal && typeof entryVal === 'object') ? Number(entryVal.ts || 0) : Number(entryVal || 0);
                const scFromEntry = (entryVal && typeof entryVal === 'object') ? cleanStr(entryVal.shortcutId) : '';
                if (ts > 0 && (now - ts) > DELETED_QUEUE_TTL_MS) {
                    pruned = true;
                    return;
                }
                cleanFileIds[fid] = ts || now;
                const sc = cleanStr(rawShortcutIds[fid]) || scFromEntry;
                if (sc) cleanShortcutIds[fid] = sc;
            });
            state.deletedQueue = {
                fileIds: cleanFileIds,
                skus: rawSkus,
                shortcutIds: cleanShortcutIds
            };
            if (pruned) {
                try {
                    localStorage.setItem(DELETED_QUEUE_STORAGE, JSON.stringify(state.deletedQueue));
                } catch (eSavePrune) {}
            }
            return state.deletedQueue;
        } catch (e) {
            state.deletedQueue = { fileIds: {}, skus: {}, shortcutIds: {} };
            return state.deletedQueue;
        }
    }

    function writeDeletedQueue(qObj) {
        state.deletedQueue = {
            fileIds: (qObj && qObj.fileIds) || {},
            skus: (qObj && qObj.skus) || {},
            shortcutIds: (qObj && qObj.shortcutIds) || {}
        };
        try {
            localStorage.setItem(DELETED_QUEUE_STORAGE, JSON.stringify(state.deletedQueue));
        } catch (e) {}
    }

    function markDeletedInQueue(fileIdRaw, skuRaw, shortcutIdRaw) {
        const fid = cleanStr(fileIdRaw);
        const sku = cleanStr(skuRaw).toUpperCase();
        const scId = cleanStr(shortcutIdRaw);
        const q = readDeletedQueue();
        if (!q.shortcutIds) q.shortcutIds = {};
        if (fid) {
            q.fileIds[fid] = Date.now();
            if (scId) q.shortcutIds[fid] = scId;
        }
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
        if (fid && q.shortcutIds && q.shortcutIds[fid]) {
            delete q.shortcutIds[fid];
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
                    if (q.shortcutIds && q.shortcutIds[fid]) delete q.shortcutIds[fid];
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
        if (Date.now() < _inboxRateLimitBackoffUntilMs) return;
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
                    if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                    unmarkSkuDeletedInQueue(sku, fid);
                } else if (res && (res.authRequired || res.rateLimited)) {
                    break;
                }
            }
            for (let j = 0; j < pendingFileIds.length; j++) {
                const fid = pendingFileIds[j];
                const curQ = readDeletedQueue();
                if (!curQ.fileIds[fid]) continue;
                const scId = cleanStr(curQ.shortcutIds && curQ.shortcutIds[fid]);
                const res = await callWebAppPost('fotos_delete', Object.assign({
                    driveFileId: fid,
                    shortcutId: scId,
                    source: 'INBOX',
                    skipListReturn: true
                }, buildOwnerAuthPayload()), 25000);
                if (res && res.ok) {
                    if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                    unmarkSkuDeletedInQueue('', fid);
                } else if (res && (res.authRequired || res.rateLimited)) {
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
                mimeType: f.mimeType || '',
                kind: f.kind || '',
                ext: f.ext || '',
                shortcutId: f.shortcutId || '',
                skuOrigin: f.skuOrigin || '',
                sizeBytes: f.sizeBytes || f.size || 0,
                updatedAt: f.updatedAt || '',
                url: f.url || f.viewUrl || '',
                viewUrl: f.viewUrl || f.url || '',
                downloadUrl: f.downloadUrl || '',
                subfolder: f.subfolder || ''
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

    const MAX_INBOX_DOCUMENT_BYTES = 15 * 1024 * 1024;
    const ACCEPTED_DOC_EXT_RE = /\.(pdf|docx?|xlsx?|csv|txt|pptx?|zip)$/i;
    const ACCEPTED_DOC_MIME_SET = new Set([
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/csv',
        'text/plain',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-zip-compressed'
    ]);

    function getFileExtensionLower(nameOrPath) {
        const s = cleanStr(nameOrPath).toLowerCase();
        const m = s.match(/\.([a-z0-9]{1,8})$/);
        return m ? m[1] : '';
    }

    function isAcceptedDocumentFile(f) {
        if (!f) return false;
        const mime = String(f.type || '').toLowerCase().split(';')[0].trim();
        const name = cleanStr(f.name);
        if (ACCEPTED_DOC_EXT_RE.test(name)) return true;
        if (mime && ACCEPTED_DOC_MIME_SET.has(mime)) return true;
        return false;
    }

    function isAcceptedInboxFile(f) {
        return isAcceptedImageFile(f) || isAcceptedDocumentFile(f);
    }

    function isDocumentInboxItem(item) {
        if (!item || typeof item !== 'object') return false;
        const kind = cleanStr(item.kind).toLowerCase();
        if (kind === 'document' || kind === 'doc') return true;
        if (kind === 'image') return false;
        const mime = cleanStr(item.mimeType).toLowerCase().split(';')[0].trim();
        if (mime && mime.indexOf('image/') === 0) return false;
        if (mime && (ACCEPTED_DOC_MIME_SET.has(mime) || mime.indexOf('application/vnd.google-apps.') === 0)) return true;
        const ext = cleanStr(item.ext).toLowerCase().replace(/^\./, '') || getFileExtensionLower(item.name);
        if (ext && /^(pdf|docx?|xlsx?|csv|txt|pptx?|zip)$/.test(ext)) return true;
        return false;
    }

    function getDocumentBadgeInfo(item) {
        const ext = cleanStr(item && item.ext).toLowerCase().replace(/^\./, '') || getFileExtensionLower(item && item.name);
        const mime = cleanStr(item && item.mimeType).toLowerCase();
        if (ext === 'pdf' || mime === 'application/pdf') return { icon: '📄', label: 'PDF', cls: 'is-pdf' };
        if (/^(xlsx?|csv)$/.test(ext) || /spreadsheet|excel|csv/.test(mime)) return { icon: '📊', label: ext ? ext.toUpperCase() : 'XLS', cls: 'is-xls' };
        if (/^(docx?|txt)$/.test(ext) || /wordprocessing|msword|text\/plain/.test(mime)) return { icon: '📝', label: ext ? ext.toUpperCase() : 'DOC', cls: 'is-doc' };
        if (/^pptx?$/.test(ext) || /presentation|powerpoint/.test(mime)) return { icon: '📽️', label: ext ? ext.toUpperCase() : 'PPT', cls: 'is-ppt' };
        if (ext === 'zip' || /zip/.test(mime)) return { icon: '🗜️', label: 'ZIP', cls: 'is-zip' };
        return { icon: '📎', label: ext ? ext.toUpperCase() : 'ARCHIVO', cls: 'is-other' };
    }

    function inferDocumentMimeFromName(fileName, fallbackMime) {
        const m = cleanStr(fallbackMime).toLowerCase().split(';')[0].trim();
        if (m && m !== 'application/octet-stream') return m;
        const ext = getFileExtensionLower(fileName);
        if (ext === 'pdf') return 'application/pdf';
        if (ext === 'doc') return 'application/msword';
        if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (ext === 'xls') return 'application/vnd.ms-excel';
        if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (ext === 'csv') return 'text/csv';
        if (ext === 'txt') return 'text/plain';
        if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
        if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        if (ext === 'zip') return 'application/zip';
        return 'application/octet-stream';
    }

    function readDocumentFileAsRawDataUrl(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error('Archivo inválido.')); return; }
            if (file.size && file.size > MAX_INBOX_DOCUMENT_BYTES) {
                reject(new Error('El documento "' + cleanStr(file.name) + '" supera el límite de 15 MB.'));
                return;
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer el documento.'));
            reader.onload = () => {
                let raw = String(reader.result || '').trim();
                const commaIdx = raw.indexOf(',');
                if (commaIdx > 0 && /^data:[^;]*;base64$/i.test(raw.slice(0, commaIdx))) {
                    const head = raw.slice(0, commaIdx);
                    const semiIdx = head.indexOf(';');
                    const curMime = semiIdx > 5 ? head.slice(5, semiIdx).toLowerCase() : '';
                    if (!curMime || curMime === 'application/octet-stream') {
                        raw = 'data:' + inferDocumentMimeFromName(file.name, file.type) + ';base64,' + raw.slice(commaIdx + 1);
                    }
                }
                resolve(raw);
            };
            reader.readAsDataURL(file);
        });
    }

    function revokeBlobUrlSafe(url) {
        try {
            if (url && String(url).indexOf('blob:') === 0 && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(url);
            }
        } catch (eRev) {}
    }

    function enrichInboxFileItem(f) {
        const name = cleanStr(f.name);
        const skuOrigin = cleanStr(f.skuOrigin);
        const sizeNum = Number(f.sizeBytes || f.size || 0) || 0;
        f.sizeBytes = sizeNum;
        f.size = sizeNum;
        f.mimeType = cleanStr(f.mimeType);
        f.ext = cleanStr(f.ext || getFileExtensionLower(name)).toLowerCase().replace(/^\./, '');
        const isDoc = isDocumentInboxItem(f);
        f.kind = isDoc ? 'document' : 'image';
        f.isDocument = isDoc;
        if (!f.viewUrl && f.url) f.viewUrl = cleanStr(f.url);
        if (!f.url && f.viewUrl) f.url = cleanStr(f.viewUrl);
        f.downloadUrl = cleanStr(f.downloadUrl);
        f.subfolder = cleanStr(f.subfolder);
        f._searchNorm = normalizeSearchText(name + ' ' + skuOrigin + ' ' + f.ext + ' ' + f.subfolder + (isDoc ? ' documento doc archivo' : ''));
        f._suggestedSku = isDoc ? '' : (findSuggestedSkuForFileName(name) || skuOrigin);
        f._sizeText = formatFileSize(sizeNum);
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

    function mergeLoadedFileNamesFromServer(rawLoadedNames) {
        if (!rawLoadedNames) return false;
        const prevMap = state.loadedFileNamesById || {};
        const nextMap = Object.assign({}, prevMap);
        let changed = false;
        if (Array.isArray(rawLoadedNames)) {
            for (let i = 0; i < rawLoadedNames.length; i++) {
                const entry = rawLoadedNames[i];
                if (!entry || typeof entry !== 'object') continue;
                const id = cleanStr(entry.id || entry.fileId);
                const name = cleanStr(entry.name || entry.fileName);
                if (id && name && nextMap[id] !== name) {
                    nextMap[id] = name;
                    changed = true;
                }
            }
        } else if (typeof rawLoadedNames === 'object') {
            const keys = Object.keys(rawLoadedNames);
            for (let i = 0; i < keys.length; i++) {
                const id = cleanStr(keys[i]);
                const name = cleanStr(rawLoadedNames[keys[i]]);
                if (id && name && nextMap[id] !== name) {
                    nextMap[id] = name;
                    changed = true;
                }
            }
        }
        if (changed) {
            state.loadedFileNamesById = nextMap;
            invalidateLoadedPhotosCache();
        }
        return changed;
    }

    function normalizeSharedRecentUploadItem(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (isDocumentInboxItem(raw)) return null;
        const rawUrl = cleanStr(raw.viewUrl || raw.url || raw.newUrl);
        const fid = cleanStr(raw.id || raw.fileId || extractDriveFileId(rawUrl));
        if (!fid || isLocalTempPhotoId(fid) || !/^[a-zA-Z0-9_-]{15,}$/.test(fid)) return null;
        const targetKey = cleanStr(raw.targetKey || raw.sku || raw.overrideKey).toUpperCase();
        const rawKind = cleanStr(raw.targetKind || raw.kind).toUpperCase();
        let targetKind = 'SKU';
        if (rawKind === 'TELA' || rawKind === 'FABRIC' || targetKey.indexOf('VFAB:') === 0) targetKind = 'TELA';
        else if (rawKind === 'MADERA' || rawKind === 'WOOD' || targetKey.indexOf('VWOD:') === 0) targetKind = 'MADERA';
        else if (rawKind === 'PORTADA' || rawKind === 'COVER' || targetKey.indexOf('VCOV:') === 0) targetKind = 'PORTADA';
        const fileName = cleanStr(raw.fileName || raw.name);
        const targetLabel = cleanStr(raw.targetLabel || raw.productName || raw.label || targetKey || fileName);
        const tsNum = Number(raw.ts || 0) || parseMxDateTimestamp(raw.updatedAt || raw.timestamp) || 0;
        const viewUrl = (!/^blob:/i.test(rawUrl) && rawUrl) || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing');
        return {
            id: fid,
            targetKey: targetKey,
            targetLabel: targetLabel,
            targetKind: targetKind,
            fileName: fileName,
            viewUrl: viewUrl,
            localDataUrl: '',
            destFolderName: cleanStr(raw.destFolderName || raw.folderName || (targetKind === 'TELA' ? 'Tela' : (targetKind === 'MADERA' ? 'Madera' : (targetKind === 'PORTADA' ? 'Portada' : '')))),
            ts: tsNum
        };
    }

    function mergeSharedRecentUploadsFromServer(serverList) {
        if (!Array.isArray(serverList)) return false;
        const normalized = [];
        const seen = new Set();
        for (let i = 0; i < serverList.length; i++) {
            const item = normalizeSharedRecentUploadItem(serverList[i]);
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            normalized.push(item);
            if (item.fileName) {
                state.loadedFileNamesById[item.id] = item.fileName;
            }
        }
        const fp = normalized.map((x) => x.id + ':' + x.targetKey + ':' + x.targetKind + ':' + x.ts + ':' + x.fileName).join('|');
        const changed = fp !== _lastSharedRecentFp;
        _lastSharedRecentFp = fp;
        state.recentUploads = normalized;
        if (changed && normalized.length > 0) {
            const localPrev = readRecentUploadsStore();
            const mergedById = new Map();
            for (let i = 0; i < normalized.length; i++) {
                mergedById.set(normalized[i].id, normalized[i]);
            }
            for (let j = 0; j < localPrev.length; j++) {
                const lp = localPrev[j];
                if (!lp || !lp.id) continue;
                const ex = mergedById.get(lp.id);
                if (!ex) {
                    mergedById.set(lp.id, lp);
                } else {
                    if (!ex.localDataUrl && lp.localDataUrl) ex.localDataUrl = lp.localDataUrl;
                    if (!ex.fileName && lp.fileName) ex.fileName = lp.fileName;
                    if ((Number(lp.ts || 0)) > (Number(ex.ts || 0))) ex.ts = lp.ts;
                }
            }
            const sortedMerged = Array.from(mergedById.values())
                .sort((a, b) => (Number(b.ts || 0) - Number(a.ts || 0)))
                .slice(0, 40);
            writeRecentUploadsStore(sortedMerged);
            invalidateLoadedPhotosCache();
        }
        return changed;
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

        // 0) Recién cargadas compartidas en tiempo real entre todos los dispositivos
        const sharedRecent = Array.isArray(state.recentUploads) ? state.recentUploads : [];
        for (let r = 0; r < sharedRecent.length; r++) {
            pushCandidate(sharedRecent[r]);
        }

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

        // 4) Archivos directos en carpetas de categorías / FOTOS NUEVAS CARGADO (incluyendo fotos desvinculadas con "Quitar del producto" o subidas directo en Drive)
        const seenFileOnly = new Set(items.map((it) => it.id));
        const liveLoadedDrive = Array.isArray(state.loadedDriveFiles) ? state.loadedDriveFiles : [];
        for (let d = 0; d < liveLoadedDrive.length; d++) {
            const df = liveLoadedDrive[d];
            if (!df || !df.id) continue;
            const fid = cleanStr(df.id);
            if (!fid || delFileMap[fid] || seenFileOnly.has(fid)) continue;
            seenFileOnly.add(fid);
            const fName = cleanStr(df.name || fileNameMap[fid] || fid);
            const fldName = cleanStr(df.folderName || 'CATEGORIAS MUEBLES Y ACCESORIOS');
            const shortFolder = fldName.replace(/^FOTOS\s+(DE\s+)?/i, '') || 'Drive';
            items.push({
                id: fid,
                sku: '',
                name: 'Sin SKU asignado',
                fileName: fName,
                viewUrl: df.viewUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing'),
                localDataUrl: '',
                destFolderName: fldName,
                shortFolder: shortFolder,
                rowNumber: null,
                fromLoaded: true,
                unlinkedInDrive: true,
                _searchNorm: normalizeSearchText(fName + ' ' + fldName + ' ' + shortFolder + ' sin sku libre')
            });
        }

        state.cachedLoadedList = items;
        return items;
    }

    function getArchivedPhotosList() {
        const q = readDeletedQueue();
        const delFileMap = q.fileIds || {};
        const rawArch = Array.isArray(state.archivedFiles) ? state.archivedFiles : [];
        const out = [];
        const seen = new Set();
        for (let i = 0; i < rawArch.length; i++) {
            const af = rawArch[i];
            if (!af || !af.id) continue;
            const fid = cleanStr(af.id);
            if (!fid || delFileMap[fid] || seen.has(fid)) continue;
            seen.add(fid);
            const name = cleanStr(af.name || (state.loadedFileNamesById && state.loadedFileNamesById[fid]) || fid);
            out.push({
                id: fid,
                name: name,
                fileName: name,
                kind: af.kind || 'image',
                mimeType: af.mimeType || '',
                sizeBytes: Number(af.sizeBytes || 0) || 0,
                _sizeText: (typeof formatBytesShort === 'function' && af.sizeBytes) ? formatBytesShort(af.sizeBytes) : '',
                viewUrl: af.viewUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing'),
                thumbUrl: af.thumbUrl || '',
                folderName: cleanStr(af.folderName || 'FOTOS ARCHIVADAS'),
                fromLoaded: true,
                fromArchived: true,
                _searchNorm: normalizeSearchText(name + ' archivada fotos archivadas')
            });
        }
        return out;
    }

    function reconcileLiveDriveInventory(inboxList, loadedDriveList, archivedList, isComplete) {
        let changed = false;
        if (Array.isArray(loadedDriveList)) {
            const prevSig = (state.loadedDriveFiles || []).map((x) => x.id + ':' + (x.name || '')).join('|');
            const nextSig = loadedDriveList.map((x) => (x && x.id) + ':' + ((x && x.name) || '')).join('|');
            if (prevSig !== nextSig) {
                state.loadedDriveFiles = loadedDriveList.slice();
                changed = true;
            }
        }
        if (Array.isArray(archivedList)) {
            const prevArchSig = (state.archivedFiles || []).map((x) => x.id + ':' + (x.name || '')).join('|');
            const nextArchSig = archivedList.map((x) => (x && x.id) + ':' + ((x && x.name) || '')).join('|');
            if (prevArchSig !== nextArchSig) {
                state.archivedFiles = archivedList.slice();
                changed = true;
            }
        }

        if (!isComplete || state.assignInFlight > 0) {
            if (changed) invalidateLoadedPhotosCache();
            return changed;
        }

        const liveIds = new Set();
        const addIds = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
                const id = cleanStr(arr[i] && arr[i].id);
                if (id) liveIds.add(id);
            }
        };
        addIds(inboxList);
        addIds(state.loadedDriveFiles);
        addIds(state.archivedFiles);

        // 1) Depurar nombres cacheados cuyos archivos fueron eliminados directamente en Google Drive
        const nextNames = {};
        const prevNames = state.loadedFileNamesById || {};
        Object.keys(prevNames).forEach((fid) => {
            if (isLocalTempPhotoId(fid) || liveIds.has(fid)) {
                nextNames[fid] = prevNames[fid];
            } else {
                changed = true;
            }
        });
        (state.loadedDriveFiles || []).forEach((f) => { if (f && f.id && f.name) nextNames[f.id] = f.name; });
        (state.archivedFiles || []).forEach((f) => { if (f && f.id && f.name) nextNames[f.id] = f.name; });
        state.loadedFileNamesById = nextNames;

        // 2) Depurar carrusel "Recién cargadas" local y compartido si se quitó el archivo de Drive
        if (Array.isArray(state.recentUploads) && state.recentUploads.length > 0) {
            const nextShared = state.recentUploads.filter((it) => !it || isLocalTempPhotoId(it.id) || liveIds.has(cleanStr(it.id)));
            if (nextShared.length !== state.recentUploads.length) {
                state.recentUploads = nextShared;
                changed = true;
            }
        }
        const localRec = readRecentUploadsStore();
        if (localRec.length > 0) {
            const nextLocalRec = localRec.filter((it) => !it || isLocalTempPhotoId(it.id) || liveIds.has(cleanStr(it.id)));
            if (nextLocalRec.length !== localRec.length) {
                writeRecentUploadsStore(nextLocalRec);
                changed = true;
            }
        }

        // 3) Depurar guardados de sesión (>15s) cuyo archivo ya fue borrado de Drive
        const nowMs = Date.now();
        let savedPruned = false;
        state.sessionSavedBySku.forEach((meta, sku) => {
            const fid = cleanStr(meta && (meta.fileId || extractDriveFileId(meta.newUrl)));
            const ts = Number((meta && (meta.savedAt || meta.ts)) || 0);
            if (fid && !isLocalTempPhotoId(fid) && !liveIds.has(fid) && (!ts || (nowMs - ts) > 15000)) {
                state.sessionSavedBySku.delete(sku);
                state.sessionSavedLogs = state.sessionSavedLogs.filter((l) => l.sku !== sku);
                const prod = state.productBySku.get(sku);
                if (prod && prod.photoFileId === fid) {
                    prod.photoUrl = '';
                    prod.photoFileId = '';
                }
                savedPruned = true;
                changed = true;
            }
        });
        if (savedPruned) saveSavedOverridesNow();

        // 4) Si la foto seleccionada fue eliminada directamente en Drive, limpiar la selección
        if (state.selectedPhotoItem && state.selectedPhotoItem.id && !isLocalTempPhotoId(state.selectedPhotoItem.id) && !liveIds.has(state.selectedPhotoItem.id)) {
            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;
            changed = true;
        }

        if (changed) invalidateLoadedPhotosCache();
        return changed;
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
                    fetchSheetRows('INVENTARIO_EN_VIVO', 'A:AX'),
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
