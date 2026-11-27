    function isHeicImageFile(f) {
        if (!f) return false;
        const mime = String(f.type || '').toLowerCase();
        return mime === 'image/heic' || mime === 'image/heif' || /\.(heic|heif)$/i.test(f.name || '');
    }

    function inferImageMimeFromName(fileName) {
        const lower = String(fileName || '').toLowerCase();
        if (/\.png$/.test(lower)) return 'image/png';
        if (/\.webp$/.test(lower)) return 'image/webp';
        if (/\.gif$/.test(lower)) return 'image/gif';
        if (/\.avif$/.test(lower)) return 'image/avif';
        if (/\.bmp$/.test(lower)) return 'image/bmp';
        if (/\.heic$/.test(lower)) return 'image/heic';
        if (/\.heif$/.test(lower)) return 'image/heif';
        return 'image/jpeg';
    }

    function normalizeImageDataUrl(rawDataUrl, fileName) {
        const s = String(rawDataUrl || '').trim();
        const commaIdx = s.indexOf(',');
        const inferredMime = inferImageMimeFromName(fileName);
        if (commaIdx > 0 && /^data:[^;]*;base64$/i.test(s.slice(0, commaIdx))) {
            const header = s.slice(0, commaIdx).toLowerCase();
            // Evitar etiquetar bytes HEIC/HEIF crudos como image/jpeg cuando el navegador no los decodificó
            if ((inferredMime === 'image/heic' || inferredMime === 'image/heif') && header.indexOf('image/jpeg') !== -1) {
                return 'data:' + inferredMime + ';base64,' + s.slice(commaIdx + 1);
            }
            if (/^data:image\/[a-zA-Z0-9.+-]+;base64$/i.test(header)) return s;
            return 'data:' + inferredMime + ';base64,' + s.slice(commaIdx + 1);
        }
        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(s)) return s;
        return s;
    }

    function autoFrameStudioProductToDataUrl(source, maxDim, jpegQ) {
        const nw = (source && (source.naturalWidth || source.width)) || 0;
        const nh = (source && (source.naturalHeight || source.height)) || 0;
        if (!nw || !nh) return '';

        // Muestreo compacto (máx 96px) sobre píxeles reales sin letterbox para detectar fondo de estudio
        let sx = 0, sy = 0, sw = nw, sh = nh, isStudio = false;
        let probe = null;
        try {
            const cap = 96;
            const sScale = Math.min(1, cap / Math.max(nw, nh));
            const sdw = Math.max(16, Math.round(nw * sScale));
            const sdh = Math.max(16, Math.round(nh * sScale));
            probe = document.createElement('canvas');
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
        } catch (eProbe) {
        } finally {
            if (probe) {
                probe.width = 0;
                probe.height = 0;
            }
        }

        const canvas = document.createElement('canvas');
        try {
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
        } finally {
            canvas.width = 0;
            canvas.height = 0;
        }
    }

    async function readFileAsOptimizedDataUrl(file) {
        const MAX_DIM = 2048;
        const JPEG_Q = 0.86;
        const fileName = (file && file.name) || 'foto.jpg';
        const isHeic = isHeicImageFile(file);
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
                img.onerror = () => {
                    if (isHeic) {
                        // Preservar MIME real image/heic o image/heif sin corromper como image/jpeg falso
                        const heicMime = /\.heif$/i.test(fileName) ? 'image/heif' : 'image/heic';
                        const comma = normalized.indexOf(',');
                        const safeHeicDataUrl = (comma > 0)
                            ? ('data:' + heicMime + ';base64,' + normalized.slice(comma + 1))
                            : normalized;
                        showAssignFeedback(
                            'ℹ️ Archivo HEIC (' + escapeHtml(fileName) + ') subido en formato original. Para vista previa local en este navegador usa JPG/PNG o Safari.',
                            true
                        );
                        resolve(safeHeicDataUrl);
                        return;
                    }
                    resolve(normalized);
                };
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
        const files = rawList.filter(isAcceptedInboxFile);
        if (!files.length) {
            if (rawList.length > 0) {
                showAssignFeedback('⚠️ Selecciona una imagen o documento válido (PDF, Word, Excel, CSV, TXT, PPT).', false);
            }
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            return [];
        }

        // 1) CARGA INSTANTÁNEA EN UI (0ms): Mostrar fotos y documentos al instante antes de subir a la nube
        const stagedEntries = [];
        const skippedOversize = [];
        const nowTs = Date.now();
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const isDoc = !isAcceptedImageFile(f) && isAcceptedDocumentFile(f);
            const safeFileName = cleanStr(f.name) || ((isDoc ? 'doc_' : 'foto_') + nowTs + '_' + (i + 1) + (isDoc ? '.pdf' : '.jpg'));
            if (isDoc && f.size && f.size > MAX_INBOX_DOCUMENT_BYTES) {
                skippedOversize.push(safeFileName);
                continue;
            }
            const localId = 'local_inb_' + nowTs + '_' + i + '_' + Math.floor(Math.random() * 9000 + 1000);
            const mimeType = isDoc ? inferDocumentMimeFromName(safeFileName, f.type) : (cleanStr(f.type) || inferImageMimeFromName(safeFileName));
            const ext = getFileExtensionLower(safeFileName);
            const lastModified = Number(f.lastModified || 0) || 0;
            const localSig = cleanStr(safeFileName).toLowerCase() + '|' + (Number(f.size || 0) || 0) + '|' + lastModified;
            let blobUrl = '';
            if (!isDoc) {
                try {
                    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                        blobUrl = URL.createObjectURL(f);
                    }
                } catch (eBlob) {}
            }

            const instantItem = enrichInboxFileItem({
                id: localId,
                name: safeFileName,
                mimeType: mimeType,
                kind: isDoc ? 'document' : 'image',
                ext: ext,
                sizeBytes: f.size || 0,
                lastModified: lastModified,
                localSig: localSig,
                updatedAt: new Date().toISOString(),
                viewUrl: isDoc ? '' : blobUrl,
                url: isDoc ? '' : blobUrl,
                localDataUrl: isDoc ? '' : blobUrl,
                thumbDataUrl: isDoc ? '' : blobUrl,
                isUploadingNow: true
            });
            state.rawInboxFromDrive.unshift(instantItem);
            state.inboxFiles.unshift(instantItem);
            stagedEntries.push({
                file: f,
                fileName: safeFileName,
                localId: localId,
                blobUrl: blobUrl,
                isDoc: isDoc,
                mimeType: mimeType,
                ext: ext,
                lastModified: lastModified,
                localSig: localSig,
                item: instantItem
            });
        }

        if (!stagedEntries.length) {
            if (skippedOversize.length > 0) {
                showAssignFeedback('⚠️ Supera el límite de 15 MB: ' + escapeHtml(skippedOversize.join(', ')), false);
            }
            if (inputEl && typeof inputEl.value === 'string') {
                try { inputEl.value = ''; } catch (eClr) {}
            }
            return [];
        }

        if (stagedEntries.length > 0) {
            const firstImageEntry = stagedEntries.find((e) => e && !e.isDoc) || null;
            if (firstImageEntry && !uploadOpts.preserveSelection) {
                state.selectedInboxFileId = firstImageEntry.localId;
                state.selectedPhotoItem = {
                    id: firstImageEntry.localId,
                    name: firstImageEntry.fileName,
                    viewUrl: firstImageEntry.blobUrl,
                    thumbDataUrl: firstImageEntry.blobUrl,
                    localDataUrl: firstImageEntry.blobUrl,
                    fromLoaded: false,
                    skuOrigin: ''
                };
                if (!state.selectedSku && firstImageEntry.item._suggestedSku && state.productBySku.has(firstImageEntry.item._suggestedSku)) {
                    window.selectSkuProduct(firstImageEntry.item._suggestedSku, { skipBackSync: true });
                }
            }
            state.galleryMode = 'INBOX';
            window.setGalleryMode('INBOX');
            renderSelectedProductStage();
            updateAssignButtonState();
            if (firstImageEntry && !uploadOpts.preserveSelection) {
                syncFotosBackNav('selected_photo');
            }
        }

        const hasDocs = stagedEntries.some((e) => e.isDoc);
        const hasImgs = stagedEntries.some((e) => !e.isDoc);
        const batchUnitLabel = (hasDocs && !hasImgs) ? 'documento(s)' : ((hasDocs && hasImgs) ? 'archivo(s)' : 'foto(s)');
        if (!uploadOpts.suppressSummaryFeedback) {
            showAssignFeedback('⚡ Subiendo ' + stagedEntries.length + ' ' + batchUnitLabel + '...', true);
        }

        // 2) SUBIDA EN SEGUNDO PLANO (2 WORKERS EN PARALELO PARA EVITAR CONGESTIÓN / TIMEOUTS EN GAS)
        let uploadedCount = 0;
        let queuedOfflineCount = 0;
        let failedCount = 0;
        let rateLimitedHit = false;
        let authFailed = false;
        let lastUploadError = '';
        let completedCount = 0;
        const CONCURRENCY = 2;
        let cursor = 0;

        const removeFailedTempEntry = (localId, optBlobUrl) => {
            revokeBlobUrlSafe(optBlobUrl);
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
                    const dataUrl = entry.isDoc
                        ? await readDocumentFileAsRawDataUrl(f)
                        : await readFileAsOptimizedDataUrl(f);
                    const validDataUrl = entry.isDoc
                        ? /^data:[^;]+;base64,.+/.test(String(dataUrl || ''))
                        : /^data:image\/[a-zA-Z0-9.+-]+;base64,.+/.test(String(dataUrl || ''));
                    if (!validDataUrl) {
                        failedCount++;
                        lastUploadError = (entry.isDoc ? 'Formato de documento no compatible (' : 'Formato de imagen no compatible (') + uploadName + ').';
                        removeFailedTempEntry(localId, entry.blobUrl);
                        entry.blobUrl = '';
                        completedCount++;
                        return { ok: false, error: lastUploadError };
                    }

                    // Actualizar localDataUrl con el base64 real (sin mantener blobUrl colgado)
                    if (!entry.isDoc) {
                        entry.item.localDataUrl = dataUrl;
                        entry.item.thumbDataUrl = dataUrl;
                        if (!entry.item.viewUrl || entry.item.viewUrl === entry.blobUrl) {
                            entry.item.viewUrl = dataUrl;
                            entry.item.url = dataUrl;
                        }
                        if (state.selectedPhotoItem && state.selectedPhotoItem.id === localId) {
                            state.selectedPhotoItem.localDataUrl = dataUrl;
                            state.selectedPhotoItem.thumbDataUrl = dataUrl;
                            if (!state.selectedPhotoItem.viewUrl || state.selectedPhotoItem.viewUrl === entry.blobUrl) {
                                state.selectedPhotoItem.viewUrl = dataUrl;
                            }
                        }
                    }

                    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
                    const res = isOfflineNow
                        ? { ok: false, unavailable: true }
                        : await callWebAppPost('fotos_subir_upload_inbox', Object.assign({
                            fileName: uploadName,
                            mimeType: entry.mimeType,
                            kind: entry.isDoc ? 'document' : 'image',
                            dataUrl: dataUrl,
                            deviceId: getFotosPresenceDeviceId(),
                            skipListReturn: true
                        }, buildOwnerAuthPayload()), 45000);

                    completedCount++;
                    if (res && res.ok && res.file && res.file.id) {
                        uploadedCount++;
                        const realId = res.file.id;
                        entry.realId = realId;
                        if (cleanStr(res.rev)) {
                            state.inboxRev = cleanStr(res.rev);
                            _backendSupportsInboxRev = true;
                        }
                        if (Array.isArray(res.recentUploads)) {
                            mergeSharedRecentUploadsFromServer(res.recentUploads);
                        }
                        const newFile = enrichInboxFileItem(Object.assign({}, res.file, {
                            kind: res.file.kind || (entry.isDoc ? 'document' : 'image'),
                            mimeType: res.file.mimeType || entry.mimeType,
                            ext: res.file.ext || entry.ext,
                            lastModified: entry.lastModified,
                            localSig: entry.localSig,
                            localDataUrl: entry.isDoc ? '' : dataUrl,
                            thumbDataUrl: entry.isDoc ? '' : dataUrl
                        }));
                        state.rawInboxFromDrive = state.rawInboxFromDrive.map((it) => (it && it.id === localId ? newFile : it));
                        state.inboxFiles = state.inboxFiles.map((it) => (it && it.id === localId ? newFile : it));
                        if (state.selectedInboxFileId === localId) {
                            state.selectedInboxFileId = realId;
                        }
                        if (state.selectedPhotoItem && state.selectedPhotoItem.id === localId) {
                            state.selectedPhotoItem.id = realId;
                            state.selectedPhotoItem.viewUrl = newFile.viewUrl || dataUrl;
                            state.selectedPhotoItem.localDataUrl = dataUrl;
                            state.selectedPhotoItem.thumbDataUrl = dataUrl;
                        }
                        return { ok: true, realId: realId, file: newFile, dataUrl: dataUrl };
                    }
                    if (res && res.rateLimited) {
                        rateLimitedHit = true;
                        _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                        setFotosLiveStatus('syncing', 'Sincronizando...');
                        queuedOfflineCount++;
                        await putOfflinePhotoBlobIdb({
                            id: localId,
                            fileName: uploadName,
                            mimeType: entry.mimeType,
                            kind: entry.isDoc ? 'document' : 'image',
                            ext: entry.ext,
                            dataUrl: dataUrl,
                            sizeBytes: f.size || 0,
                            createdAt: Date.now()
                        });
                        enqueueFotosOfflineOutbox({
                            id: 'op_up_' + localId,
                            type: 'upload_inbox',
                            localFileId: localId,
                            fileName: uploadName,
                            mimeType: entry.mimeType,
                            kind: entry.isDoc ? 'document' : 'image',
                            sizeBytes: f.size || 0,
                            queuedAt: Date.now()
                        });
                        entry.item.isOfflinePending = true;
                        entry.item.isUploadingNow = false;
                        return { ok: false, offlineQueued: true, rateLimited: true, localId: localId, dataUrl: dataUrl };
                    }
                    if (res && res.authRequired) {
                        authFailed = true;
                        lastUploadError = cleanStr(res.error) || 'Sesión expirada.';
                        removeFailedTempEntry(localId, entry.blobUrl);
                        entry.blobUrl = '';
                        return { ok: false, authRequired: true, error: lastUploadError };
                    }
                    if (isOfflineNow || !res || res.unavailable) {
                        queuedOfflineCount++;
                        await putOfflinePhotoBlobIdb({
                            id: localId,
                            fileName: uploadName,
                            mimeType: entry.mimeType,
                            kind: entry.isDoc ? 'document' : 'image',
                            ext: entry.ext,
                            dataUrl: dataUrl,
                            sizeBytes: f.size || 0,
                            createdAt: Date.now()
                        });
                        enqueueFotosOfflineOutbox({
                            id: 'op_up_' + localId,
                            type: 'upload_inbox',
                            localFileId: localId,
                            fileName: uploadName,
                            mimeType: entry.mimeType,
                            kind: entry.isDoc ? 'document' : 'image',
                            sizeBytes: f.size || 0,
                            queuedAt: Date.now()
                        });
                        entry.item.isOfflinePending = true;
                        entry.item.isUploadingNow = false;
                        return { ok: false, offlineQueued: true, localId: localId, dataUrl: dataUrl };
                    }

                    failedCount++;
                    lastUploadError = cleanStr(res && res.error) || 'Error al subir ' + uploadName + '.';
                    removeFailedTempEntry(localId, entry.blobUrl);
                    entry.blobUrl = '';
                    return { ok: false, error: lastUploadError };
                } catch (errUp) {
                    completedCount++;
                    failedCount++;
                    lastUploadError = (errUp && errUp.message) ? errUp.message : ('Error al subir ' + uploadName + '.');
                    removeFailedTempEntry(localId, entry.blobUrl);
                    entry.blobUrl = '';
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
        // Liberar todos los blob: URLs temporales una vez el DOM ya usa data: / Drive URL
        for (let r = 0; r < stagedEntries.length; r++) {
            if (stagedEntries[r] && stagedEntries[r].blobUrl) {
                revokeBlobUrlSafe(stagedEntries[r].blobUrl);
                stagedEntries[r].blobUrl = '';
            }
        }
        scheduleSaveFastCache();
        saveFotosUiCheckpointNow();
        updateAssignButtonState();
        if (uploadedCount > 0) {
            notifyFotosInboxChanged('upload_inbox');
        }

        if (authFailed) {
            showAssignFeedback('❌ ' + escapeHtml(lastUploadError || 'Sesión expirada.'), false);
            window.lockFotosPortal();
        } else if (!uploadOpts.suppressSummaryFeedback) {
            if (skippedOversize.length > 0 && uploadedCount === 0 && queuedOfflineCount === 0) {
                showAssignFeedback('⚠️ Supera el límite de 15 MB: ' + escapeHtml(skippedOversize.join(', ')), false);
            } else if (failedCount > 0 && uploadedCount === 0 && queuedOfflineCount === 0) {
                showAssignFeedback('❌ ' + escapeHtml(lastUploadError || 'Error al subir.'), false);
            } else if (queuedOfflineCount > 0 && uploadedCount === 0) {
                showAssignFeedback(rateLimitedHit
                    ? ('⏳ Sincronizando... ' + queuedOfflineCount + ' en cola automática.')
                    : ('⚡ ' + queuedOfflineCount + ' en cola (sin red).'), true);
            } else if (queuedOfflineCount > 0) {
                showAssignFeedback('✅ Subidos: ' + uploadedCount + ' · Cola: ' + queuedOfflineCount + '.', true);
            } else if (uploadedCount > 0 && failedCount > 0) {
                showAssignFeedback('⚠️ Subidos: ' + uploadedCount + ' · Error: ' + failedCount + '.', false);
            } else if (uploadedCount > 0) {
                const extraSkip = skippedOversize.length ? (' · Omitidos (>15 MB): ' + skippedOversize.length) : '';
                showAssignFeedback('✅ ' + uploadedCount + ' ' + batchUnitLabel + ' en SUBIR PREN' + extraSkip + '.', true);
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
                    const isImgOrDoc = mime.indexOf('image/') === 0 ||
                        /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name || '') ||
                        isAcceptedDocumentFile(file);
                    if (isImgOrDoc) out.push(file);
                } catch (eFile) {}
            } else if (entry.kind === 'directory' && curDepth < 1) {
                const subFiles = await collectImageFilesFromDirHandle(entry, curDepth + 1);
                for (let s = 0; s < subFiles.length; s++) out.push(subFiles[s]);
            }
        }
        return out;
    }

    function buildLocalFileDedupSignature(f) {
        if (!f) return '';
        const nameLower = cleanStr(f.name).toLowerCase();
        const sizeNum = Number(f.size !== undefined ? f.size : f.sizeBytes) || 0;
        const modNum = Number(f.lastModified || 0) || 0;
        return nameLower + '|' + sizeNum + '|' + modNum;
    }

    async function ingestLocalSubirPrenFilesDeduped(files, sourceLabel) {
        const validFiles = (Array.isArray(files) ? files : []).filter((f) => {
            if (!f) return false;
            const mime = String(f.type || '').toLowerCase();
            return mime.indexOf('image/') === 0 ||
                /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(f.name || '') ||
                isAcceptedDocumentFile(f);
        });
        if (!validFiles.length) {
            showAssignFeedback('ℹ️ Sin imágenes o documentos válidos en ' + escapeHtml(sourceLabel || 'SUBIR PREN') + '.', false);
            return [];
        }

        const isGenericCameraFilename = (nm) => /^(?:image|photo|foto|img|dsc|pxl|screenshot|captura)(?:[\s_-]*\d*)?\.(?:jpe?g|png|heic|heif|webp)$/i.test(String(nm || '').trim());
        const existingSigMap = new Map();
        const existingDriveNameMap = new Map();
        const existingNameSizeMap = new Map();
        for (let i = 0; i < state.inboxFiles.length; i++) {
            const ex = state.inboxFiles[i];
            if (!ex || !ex.name) continue;
            const exNameLower = String(ex.name || '').trim().toLowerCase();
            const exSize = Number(ex.sizeBytes || ex.size || 0) || 0;
            const sig = cleanStr(ex.localSig) || (ex.lastModified ? buildLocalFileDedupSignature(ex) : '');
            if (sig && !existingSigMap.has(sig)) {
                existingSigMap.set(sig, ex.id);
            }
            if (exNameLower && exSize > 0 && !existingNameSizeMap.has(exNameLower + '|' + exSize)) {
                existingNameSizeMap.set(exNameLower + '|' + exSize, ex.id);
            }
            if (exNameLower && !isGenericCameraFilename(exNameLower) && !existingDriveNameMap.has(exNameLower)) {
                existingDriveNameMap.set(exNameLower, ex.id);
            }
        }

        const brandNewFiles = [];
        const batchSeenSigs = new Set();
        let firstExistingMatchId = '';
        for (let j = 0; j < validFiles.length; j++) {
            const f = validFiles[j];
            const fNameLower = String(f.name || '').trim().toLowerCase();
            const fSize = Number(f.size || 0) || 0;
            const sig = buildLocalFileDedupSignature(f);
            const nameSizeKey = (fNameLower && fSize > 0) ? (fNameLower + '|' + fSize) : '';
            const existingId = (sig && existingSigMap.get(sig)) ||
                (nameSizeKey && existingNameSizeMap.get(nameSizeKey)) ||
                (!isGenericCameraFilename(fNameLower) && existingDriveNameMap.get(fNameLower)) ||
                '';
            if (existingId) {
                if (!firstExistingMatchId) firstExistingMatchId = existingId;
            } else if (sig && batchSeenSigs.has(sig)) {
                continue;
            } else {
                if (sig) batchSeenSigs.add(sig);
                brandNewFiles.push(f);
            }
        }

        state.galleryMode = 'INBOX';
        window.setGalleryMode('INBOX');

        if (!brandNewFiles.length) {
            if (firstExistingMatchId && !state.selectedInboxFileId) {
                const existingObj = state.inboxFiles.find((it) => it && it.id === firstExistingMatchId);
                if (existingObj && !isDocumentInboxItem(existingObj)) {
                    window.selectInboxPhoto(firstExistingMatchId);
                }
            }
            renderInboxGallery();
            showAssignFeedback('✅ ' + validFiles.length + ' archivo(s) ya en bandeja.', true);
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
            showAssignFeedback('ℹ️ Usa "+ Archivo" para agregar fotos o documentos a SUBIR PREN.', false);
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
                        if (res && res.rateLimited) {
                            _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                            setFotosLiveStatus('syncing', 'Sincronizando...');
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
                            showAssignFeedback('⏳ Sincronizando... en cola: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
                        } else if (res && res.authRequired) {
                            window.lockFotosPortal();
                            return;
                        } else if (res && res.unavailable) {
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
                        if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
                        if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
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
                        notifyFotosInboxChanged('direct_upload');
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
                const stagedRest = await window.uploadLocalFilesToSubir(
                    { files: files.slice(1) },
                    { suppressSummaryFeedback: true, preserveSelection: true }
                );
                const restIds = new Set((stagedRest || []).map((e) => cleanStr(e && (e.realId || e.localId))).filter(Boolean));
                const userActiveSkuBeforeRest = state.selectedSku;
                await window.autoAssignMatchedInboxByCategory(true, restIds);
                if (userActiveSkuBeforeRest && state.selectedSku !== userActiveSkuBeforeRest && state.productBySku.has(userActiveSkuBeforeRest)) {
                    state.selectedSku = userActiveSkuBeforeRest;
                    renderSelectedProductStage();
                    updateAssignButtonState();
                }
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
            if (!f || !f.id || isDocumentInboxItem(f)) continue;
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

        const preservedSku = state.selectedSku;
        const destSel = document.getElementById('destFolderSelect');
        const preservedDestVal = destSel ? destSel.value : '';
        let assignedCount = 0;
        const lastCategories = [];
        for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            const prod = state.productBySku.get(item.sku);
            if (!prod) continue;
            const catDest = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
            prod.destFolderId = catDest.id;
            prod.destFolderName = catDest.name;

            const explicitPhotoItem = {
                id: item.file.id,
                name: item.file.name,
                shortcutId: cleanStr(item.file.shortcutId),
                viewUrl: item.file.viewUrl || ('https://drive.google.com/file/d/' + item.file.id + '/view?usp=sharing'),
                thumbDataUrl: item.file.thumbDataUrl || '',
                localDataUrl: item.file.localDataUrl || '',
                fromLoaded: false,
                skuOrigin: cleanStr(item.file.skuOrigin)
            };
            await window.assignSelectedPhotoToProduct({
                sku: prod.sku,
                photoItem: explicitPhotoItem,
                preserveActiveSku: true
            });
            assignedCount++;
            if (lastCategories.indexOf(catDest.name) === -1) lastCategories.push(catDest.name);
        }

        if (preservedSku && state.selectedSku !== preservedSku && state.productBySku.has(preservedSku)) {
            state.selectedSku = preservedSku;
            if (destSel && preservedDestVal) destSel.value = preservedDestVal;
            renderSelectedProductStage();
            updateAssignButtonState();
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

    window.assignSelectedPhotoToProduct = async function (explicitOpts) {
        const optsObj = (explicitOpts && typeof explicitOpts === 'object') ? explicitOpts : null;
        const targetSku = optsObj && optsObj.sku ? cleanStr(optsObj.sku).toUpperCase() : state.selectedSku;
        const prod = targetSku ? state.productBySku.get(targetSku) : null;
        const selPhoto = (optsObj && optsObj.photoItem) ? optsObj.photoItem : getActiveSelectedPhotoObject();
        if (!prod || !selPhoto || isDocumentInboxItem(selPhoto)) return;
        const preserveActiveSku = Boolean(optsObj && optsObj.preserveActiveSku);

        // Carpeta siempre auto-resuelta según Sheets (categoría/tipo/nombre del producto)
        const autoDestMeta = resolveCategoryDestFolderForProduct(prod.categoria, prod.tipo, prod.displayName);
        const targetDestMeta = (autoDestMeta && DEST_FOLDER_BY_ID.get(autoDestMeta.id)) || autoDestMeta;
        const targetFolderId = targetDestMeta.id;
        const destSelect = document.getElementById('destFolderSelect');
        if (!preserveActiveSku && destSelect && targetFolderId) destSelect.value = targetFolderId;

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

        // Seguridad: quitar selección del producto y de la foto inmediatamente al guardar (sin alterar selección activa en auto-asignación en segundo plano)
        if (!preserveActiveSku || state.selectedSku === prod.sku) {
            state.selectedSku = '';
        }
        if (!preserveActiveSku || state.selectedInboxFileId === activeFileId) {
            state.selectedInboxFileId = '';
        }
        if (!preserveActiveSku || (state.selectedPhotoItem && state.selectedPhotoItem.id === activeFileId)) {
            state.selectedPhotoItem = null;
        }

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

        // Incrementar assignInFlight ANTES de esperar pendingUploadPromises para que el live poll no pise subidas en curso
        state.assignInFlight++;
        try {
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
                if (res && res.rateLimited) {
                    _inboxRateLimitBackoffUntilMs = Math.max(_inboxRateLimitBackoffUntilMs, Date.now() + RATE_LIMIT_BACKOFF_MS);
                    setFotosLiveStatus('syncing', 'Sincronizando...');
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
                    showAssignFeedback('⏳ Sincronizando... en cola: <strong>' + escapeHtml(prod.sku) + '</strong>.', true);
                    return;
                }
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

            if (cleanStr(res.rev)) state.inboxRev = cleanStr(res.rev);
            if (Array.isArray(res.recentUploads)) mergeSharedRecentUploadsFromServer(res.recentUploads);
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
            notifyFotosInboxChanged('assign_photo');
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

    window.openPhotoLightbox = function (url, optDriveId) {
        const clean = cleanStr(url);
        if (!clean) return;
        const box = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImg');
        if (!box || !img) return;
        const rawDriveId = cleanStr(optDriveId) || extractDriveFileId(clean);
        const safeDriveId = isLocalTempPhotoId(rawDriveId) ? '' : rawDriveId;
        if (img.style) img.style.display = '';
        if (typeof img.removeAttribute === 'function') img.removeAttribute('data-fb-step');
        if (typeof img.setAttribute === 'function') img.setAttribute('data-drive-id', safeDriveId);
        try {
            const prevDash = (typeof box.querySelector === 'function') ? box.querySelector('.img-fallback-dash') : null;
            if (prevDash && prevDash.parentNode) prevDash.parentNode.removeChild(prevDash);
        } catch (eDash) {}
        img.onerror = function () {
            if (typeof window.handlePhotoImgError === 'function') window.handlePhotoImgError(img);
        };
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
        if (box) {
            box.classList.add('hidden');
            try {
                const prevDash = (typeof box.querySelector === 'function') ? box.querySelector('.img-fallback-dash') : null;
                if (prevDash && prevDash.parentNode) prevDash.parentNode.removeChild(prevDash);
            } catch (eDash) {}
        }
        if (img) {
            img.onerror = null;
            if (img.style) img.style.display = '';
            if (typeof img.removeAttribute === 'function') img.removeAttribute('data-fb-step');
            if (typeof img.setAttribute === 'function') img.setAttribute('data-drive-id', '');
            img.src = '';
        }
        state.lightboxOpen = false;
        if (state.lightboxUrl) {
            state.lightboxUrl = '';
            saveFotosUiCheckpointNow();
        }
    };
