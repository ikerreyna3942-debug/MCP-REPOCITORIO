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
                    const isDocBlob = b.kind === 'document' || isDocumentInboxItem({ name: b.fileName, mimeType: b.mimeType, ext: b.ext, kind: b.kind });
                    const localItem = enrichInboxFileItem({
                        id: b.id,
                        name: b.fileName || (isDocBlob ? 'Documento pendiente' : 'Foto pendiente'),
                        mimeType: b.mimeType || '',
                        kind: isDocBlob ? 'document' : 'image',
                        ext: b.ext || '',
                        sizeBytes: b.sizeBytes || 0,
                        updatedAt: new Date(b.createdAt || Date.now()).toISOString(),
                        viewUrl: isDocBlob ? '' : b.dataUrl,
                        url: isDocBlob ? '' : b.dataUrl,
                        localDataUrl: isDocBlob ? '' : b.dataUrl,
                        isOfflinePending: true
                    });
                    state.rawInboxFromDrive.unshift(localItem);
                    state.inboxFiles.unshift(localItem);
                    changed = true;
                }
            }

            state.inboxFiles.forEach((f) => {
                if (f && String(f.id || '').indexOf('local_inb_') === 0 && !isDocumentInboxItem(f) && !f.localDataUrl && blobById.has(f.id)) {
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
        if (Date.now() < _inboxRateLimitBackoffUntilMs) return;
        const queue = readFotosOfflineOutbox();
        if (!queue.length) return;

        _fotosFlushingOutbox = true;
        updateOfflineSyncBanner();
        try {
            const localToRealId = {};
            const droppedLocalUploadIds = new Set();
            const remaining = [];
            let syncedAny = false;
            let syncedVisualAny = false;

            for (let i = 0; i < queue.length; i++) {
                const entry = queue[i];
                if (!entry) continue;

                if (entry.type === 'direct_upload_assign') {
                    const blobRec = await getOfflinePhotoBlobIdb(entry.localFileId);
                    if (!blobRec || !blobRec.dataUrl) {
                        if (entry.localFileId) await deleteOfflinePhotoBlobIdb(entry.localFileId);
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
                        if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                        if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
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
                    } else if (res && res.rateLimited) {
                        _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                        remaining.push(...queue.slice(i));
                        break;
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
                        } else if (entry.localFileId) {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
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
                    if (!dataUrl && !directUrl && (!resolvedInboxId || droppedLocalUploadIds.has(resolvedInboxId))) {
                        if (entry.localFileId) await deleteOfflinePhotoBlobIdb(entry.localFileId);
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
                        if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                        if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
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
                    } else if (res && res.rateLimited) {
                        _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                        remaining.push(...queue.slice(i));
                        break;
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
                        } else if (entry.localFileId) {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }
                    }
                } else if (entry.type === 'upload_inbox') {
                    const blobRec = await getOfflinePhotoBlobIdb(entry.localFileId);
                    if (!blobRec || !blobRec.dataUrl) {
                        if (entry.localFileId) {
                            droppedLocalUploadIds.add(entry.localFileId);
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }
                        continue;
                    }
                    const isDocEntry = entry.kind === 'document' || blobRec.kind === 'document' || isDocumentInboxItem({ name: entry.fileName || blobRec.fileName, mimeType: entry.mimeType || blobRec.mimeType });
                    const res = await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                        fileName: entry.fileName || blobRec.fileName || 'foto.jpg',
                        mimeType: entry.mimeType || blobRec.mimeType || '',
                        kind: isDocEntry ? 'document' : 'image',
                        dataUrl: blobRec.dataUrl,
                        deviceId: getFotosPresenceDeviceId(),
                        skipListReturn: true
                    }, buildOwnerAuthPayload()), 30000);

                    if (res && res.ok && res.file && res.file.id) {
                        const realId = res.file.id;
                        localToRealId[entry.localFileId] = realId;
                        syncedAny = true;
                        if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                        if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);

                        const hasPendingAssign = queue.slice(i + 1).some((nx) => nx && nx.type === 'assign_photo' && nx.driveFileId === entry.localFileId);
                        if (!hasPendingAssign) {
                            await deleteOfflinePhotoBlobIdb(entry.localFileId);
                        }

                        state.rawInboxFromDrive = state.rawInboxFromDrive.map((f) => {
                            if (f && f.id === entry.localFileId) {
                                return enrichInboxFileItem(Object.assign({}, res.file, { localDataUrl: isDocEntry ? '' : blobRec.dataUrl }));
                            }
                            return f;
                        });
                        state.inboxFiles = state.inboxFiles.map((f) => {
                            if (f && f.id === entry.localFileId) {
                                return enrichInboxFileItem(Object.assign({}, res.file, { localDataUrl: isDocEntry ? '' : blobRec.dataUrl }));
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
                    } else if (res && res.rateLimited) {
                        _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                        remaining.push(...queue.slice(i));
                        break;
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
                            if (entry.localFileId) {
                                droppedLocalUploadIds.add(entry.localFileId);
                                await deleteOfflinePhotoBlobIdb(entry.localFileId);
                                state.rawInboxFromDrive = state.rawInboxFromDrive.filter((f) => f && f.id !== entry.localFileId);
                                state.inboxFiles = state.inboxFiles.filter((f) => f && f.id !== entry.localFileId);
                            }
                        }
                    }
                } else if (entry.type === 'assign_photo') {
                    const resolvedFid = localToRealId[entry.driveFileId] || entry.driveFileId;
                    if (String(resolvedFid || '').indexOf('local_inb_') === 0) {
                        if (droppedLocalUploadIds.has(resolvedFid)) {
                            await deleteOfflinePhotoBlobIdb(resolvedFid);
                            continue;
                        }
                        const hasMatchingUpload = remaining.some((r) => r && r.type === 'upload_inbox' && r.localFileId === resolvedFid) ||
                            queue.slice(i + 1).some((nx) => nx && nx.type === 'upload_inbox' && nx.localFileId === resolvedFid);
                        if (!hasMatchingUpload) {
                            await deleteOfflinePhotoBlobIdb(resolvedFid);
                            continue;
                        }
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
                        if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                        if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
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
                    } else if (res && res.rateLimited) {
                        entry.driveFileId = resolvedFid;
                        _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                        remaining.push(...queue.slice(i));
                        break;
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
                        } else if (String(entry.driveFileId || '').indexOf('local_inb_') === 0) {
                            await deleteOfflinePhotoBlobIdb(entry.driveFileId);
                        }
                    }
                }
            }

            // Limpiar cualquier assign_photo emparejado con un upload_inbox que se haya descartado
            const finalRemaining = droppedLocalUploadIds.size > 0
                ? remaining.filter((it) => !(it && it.type === 'assign_photo' && droppedLocalUploadIds.has(it.driveFileId)))
                : remaining;
            writeFotosOfflineOutbox(finalRemaining);
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
                notifyFotosInboxChanged('offline_flush');
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

            const delQ = readDeletedQueue();
            const delFileSet = new Set(Array.isArray(delQ.fileIds) ? delQ.fileIds : []);
            const delSkuSet = new Set(Array.isArray(delQ.skus) ? delQ.skus : []);

            state.selectedInboxFileId = '';
            state.selectedPhotoItem = null;

            if (cp.selectedPhotoItem && cp.selectedPhotoItem.id) {
                const cpId = cleanStr(cp.selectedPhotoItem.id);
                const cpSkuOrigin = cleanStr(cp.selectedPhotoItem.skuOrigin).toUpperCase();
                const isDeletedItem = Boolean(
                    (cpId && delFileSet.has(cpId)) ||
                    (cpSkuOrigin && delSkuSet.has(cpSkuOrigin))
                );
                if (!isDeletedItem && cpId) {
                    if (cp.selectedPhotoItem.fromLoaded) {
                        const loadedList = getLoadedPhotosList();
                        const matchLoaded = loadedList.find((it) => it && (
                            (it.id && it.id === cpId) ||
                            (cpSkuOrigin && cleanStr(it.sku).toUpperCase() === cpSkuOrigin)
                        ));
                        if (matchLoaded) {
                            state.selectedPhotoItem = {
                                id: matchLoaded.id || cpId,
                                name: matchLoaded.name || cp.selectedPhotoItem.name || '',
                                viewUrl: matchLoaded.viewUrl || cp.selectedPhotoItem.viewUrl || '',
                                thumbDataUrl: '',
                                localDataUrl: '',
                                fromLoaded: true,
                                skuOrigin: cleanStr(matchLoaded.sku || cpSkuOrigin).toUpperCase()
                            };
                        }
                    } else {
                        const matchInb = state.inboxFiles.find((f) => f && f.id === cpId && !isDocumentInboxItem(f));
                        if (matchInb) {
                            state.selectedInboxFileId = matchInb.id;
                            state.selectedPhotoItem = {
                                id: matchInb.id,
                                name: matchInb.name || cp.selectedPhotoItem.name || '',
                                viewUrl: matchInb.viewUrl || cp.selectedPhotoItem.viewUrl || '',
                                thumbDataUrl: matchInb.thumbDataUrl || '',
                                localDataUrl: matchInb.localDataUrl || '',
                                shortcutId: matchInb.shortcutId || '',
                                fromLoaded: false,
                                skuOrigin: ''
                            };
                        }
                    }
                }
            } else if (cp.selectedInboxFileId) {
                const cpInbId = cleanStr(cp.selectedInboxFileId);
                if (cpInbId && !delFileSet.has(cpInbId)) {
                    const matchInbOnly = state.inboxFiles.find((f) => f && f.id === cpInbId && !isDocumentInboxItem(f));
                    if (matchInbOnly) {
                        state.selectedInboxFileId = matchInbOnly.id;
                        state.selectedPhotoItem = {
                            id: matchInbOnly.id,
                            name: matchInbOnly.name || '',
                            viewUrl: matchInbOnly.viewUrl || '',
                            thumbDataUrl: matchInbOnly.thumbDataUrl || '',
                            localDataUrl: matchInbOnly.localDataUrl || '',
                            shortcutId: matchInbOnly.shortcutId || '',
                            fromLoaded: false,
                            skuOrigin: ''
                        };
                    }
                }
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
