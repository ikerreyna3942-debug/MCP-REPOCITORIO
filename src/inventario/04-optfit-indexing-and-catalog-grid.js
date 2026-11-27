    const THUMB_PLACEHOLDER_SVG =
        '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';

    const failedDrivePhotoIds = new Set();
    const OPTFIT_STORAGE_KEY = 'creata_optfit_bbox_v2';
    const OPTFIT_MAX_ENTRIES = 800;
    const OPTFIT_TARGET_FILL = 0.78;
    let optFitMap = null;
    let optFitSaveTimer = null;
    let optFitCanvas = null;
    let optFitCtx = null;
    const optFitQueue = [];
    let optFitScheduled = false;

    function loadOptFitMap() {
        if (optFitMap) return optFitMap;
        optFitMap = {};
        try {
            const raw = sessionStorage.getItem(OPTFIT_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') optFitMap = parsed;
            }
        } catch (e) {
            optFitMap = {};
        }
        return optFitMap;
    }

    function scheduleSaveOptFitMap() {
        if (optFitSaveTimer) return;
        optFitSaveTimer = setTimeout(function () {
            optFitSaveTimer = null;
            try {
                const map = loadOptFitMap();
                const keys = Object.keys(map);
                if (keys.length > OPTFIT_MAX_ENTRIES) {
                    const excess = keys.length - OPTFIT_MAX_ENTRIES;
                    for (let i = 0; i < excess; i++) delete map[keys[i]];
                }
                sessionStorage.setItem(OPTFIT_STORAGE_KEY, JSON.stringify(map));
            } catch (e) {}
        }, 500);
    }

    /**
     * Detecta la caja de contenido del producto sobre fondo uniforme de estudio
     * (blanco/transparente/gris claro) muestreando ÚNICAMENTE los píxeles reales
     * de la imagen (sin franjas letterbox) y filtrando motas aisladas de 1px.
     */
    function detectStudioContentBounds(rgba, w, h, naturalWidth, naturalHeight) {
        if (!rgba || !w || !h || w < 12 || h < 12) return null;
        const ring = (w < 24 || h < 24) ? 1 : 2;
        let borderCount = 0;
        let transCount = 0;
        let sumR = 0, sumG = 0, sumB = 0;
        const bSamples = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
                const idx = (y * w + x) * 4;
                const a = rgba[idx + 3];
                borderCount++;
                if (a < 24) {
                    transCount++;
                } else {
                    sumR += rgba[idx];
                    sumG += rgba[idx + 1];
                    sumB += rgba[idx + 2];
                    bSamples.push(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
                }
            }
        }
        const transRatio = borderCount > 0 ? (transCount / borderCount) : 0;
        const useAlpha = transRatio >= 0.08;
        const opaqueBorder = bSamples.length / 3;
        const mR = opaqueBorder > 0 ? sumR / opaqueBorder : 255;
        const mG = opaqueBorder > 0 ? sumG / opaqueBorder : 255;
        const mB = opaqueBorder > 0 ? sumB / opaqueBorder : 255;
        let varSum = 0;
        for (let i = 0; i < bSamples.length; i += 3) {
            const dr = bSamples[i] - mR;
            const dg = bSamples[i + 1] - mG;
            const db = bSamples[i + 2] - mB;
            varSum += (dr * dr + dg * dg + db * db) / 3;
        }
        const borderStdDev = opaqueBorder > 0 ? Math.sqrt(varSum / opaqueBorder) : 0;

        const maxCh = Math.max(mR, mG, mB);
        const minCh = Math.min(mR, mG, mB);
        const isPureWhiteBg = useAlpha || (minCh >= 244 && (maxCh - minCh) <= 12);
        if (!useAlpha) {
            if (isPureWhiteBg) {
                if (borderStdDev > 24) return null;
            } else {
                // Fondo gris claro uniforme de estudio permitido; fotos ambiente/oscuras se respetan intactas
                if (borderStdDev > 20 || minCh < 212 || (maxCh - minCh) > 20) return null;
            }
        }

        const thresh = Math.max(30, Math.min(64, Math.round(28 + borderStdDev * 2.2)));
        const mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            const rowOff = y * w;
            for (let x = 0; x < w; x++) {
                const idx = (rowOff + x) * 4;
                const a = rgba[idx + 3];
                if (a <= 24) continue;
                if (useAlpha) {
                    mask[rowOff + x] = 1;
                } else {
                    const dist = Math.abs(rgba[idx] - mR) + Math.abs(rgba[idx + 1] - mG) + Math.abs(rgba[idx + 2] - mB);
                    if (dist > thresh) mask[rowOff + x] = 1;
                }
            }
        }

        // Filtro 8-vecinos: elimina píxeles aislados de polvo/compresión conservando patas delgadas
        let minX = w, minY = h, maxX = -1, maxY = -1, fgCount = 0;
        for (let y = 0; y < h; y++) {
            const rowOff = y * w;
            const y0 = y > 0 ? y - 1 : 0;
            const y1 = y < h - 1 ? y + 1 : h - 1;
            for (let x = 0; x < w; x++) {
                if (!mask[rowOff + x]) continue;
                const x0 = x > 0 ? x - 1 : 0;
                const x1 = x < w - 1 ? x + 1 : w - 1;
                let hasNeighbor = false;
                for (let ny = y0; ny <= y1 && !hasNeighbor; ny++) {
                    const nRow = ny * w;
                    for (let nx = x0; nx <= x1; nx++) {
                        if (nx === x && ny === y) continue;
                        if (mask[nRow + nx]) {
                            hasNeighbor = true;
                            break;
                        }
                    }
                }
                if (!hasNeighbor) continue;
                fgCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        const minFg = Math.max(24, Math.floor(w * h * 0.008));
        if (fgCount < minFg || maxX <= minX || maxY <= minY) return null;
        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;
        if (boxW / w < 0.08 || boxH / h < 0.08) return null;

        return {
            nw: Number(naturalWidth) || w,
            nh: Number(naturalHeight) || h,
            uMin: +(minX / w).toFixed(4),
            uMax: +((maxX + 1) / w).toFixed(4),
            vMin: +(minY / h).toFixed(4),
            vMax: +((maxY + 1) / h).toFixed(4),
            isWhiteBg: !!isPureWhiteBg
        };
    }

    /**
     * Calcula escala y traslación exactas para CSS `translate(tx%, ty%) scale(s)`
     * centrando el producto al ~78% parejo del contenedor sin recortar bordes ni mostrar costuras grises.
     */
    function computeOpticalFitForBox(bbox, boxRatio, opts) {
        if (!bbox || bbox === 'skip' || !bbox.nw || !bbox.nh) return { s: 1, tx: 0, ty: 0 };
        const o = opts || {};
        const targetFill = Number(o.targetFill) || OPTFIT_TARGET_FILL;
        const maxScale = Number(o.maxScale) || 1.65;
        const bRatio = (Number(boxRatio) > 0.1) ? Number(boxRatio) : 1;
        const imgRatio = bbox.nw / bbox.nh;

        let rw = 1;
        let rh = 1;
        if (imgRatio >= bRatio) {
            rw = 1;
            rh = bRatio / imgRatio;
        } else {
            rw = imgRatio / bRatio;
            rh = 1;
        }

        const bw = Math.max(0.01, (bbox.uMax - bbox.uMin) * rw);
        const bh = Math.max(0.01, (bbox.vMax - bbox.vMin) * rh);
        const occ = Math.max(bw, bh);
        if (occ <= 0.05) return { s: 1, tx: 0, ty: 0 };

        const minScale = bbox.isWhiteBg ? 0.76 : 1.0;
        const rawScale = targetFill / occ;
        const s = Math.max(minScale, Math.min(maxScale, rawScale));

        const uc = (bbox.uMin + bbox.uMax) / 2;
        const vc = (bbox.vMin + bbox.vMax) / 2;
        const ex = (uc - 0.5) * rw;
        const ey = (vc - 0.5) * rh;

        // Con transform: translate(tx, ty) scale(s) desde el centro,
        // un punto (ex, ey) termina en (s*ex + tx, s*ey + ty) => tx = -s*ex, ty = -s*ey.
        // En fondos gris claro no blancos, limitar el desplazamiento al sobrante real para evitar costuras.
        const maxShiftX = bbox.isWhiteBg ? 0.38 : Math.max(0, Math.min(0.12, (s * rw - 1) / 2));
        const maxShiftY = bbox.isWhiteBg ? 0.38 : Math.max(0, Math.min(0.12, (s * rh - 1) / 2));
        const txFrac = Math.max(-maxShiftX, Math.min(maxShiftX, -s * ex));
        const tyFrac = Math.max(-maxShiftY, Math.min(maxShiftY, -s * ey));

        const finalS = +s.toFixed(3);
        const finalTx = +(txFrac * 100).toFixed(2);
        const finalTy = +(tyFrac * 100).toFixed(2);

        if (Math.abs(finalS - 1) < 0.03 && Math.abs(finalTx) < 1.2 && Math.abs(finalTy) < 1.2) {
            return { s: 1, tx: 0, ty: 0 };
        }
        return { s: finalS, tx: finalTx, ty: finalTy };
    }

    function detectProductStudioBoundsFromSource(sourceEl, maxSampleSide) {
        if (!sourceEl) return null;
        const nw = sourceEl.naturalWidth || sourceEl.width || 0;
        const nh = sourceEl.naturalHeight || sourceEl.height || 0;
        if (nw < 16 || nh < 16) return null;
        try {
            const cap = Number(maxSampleSide) || 96;
            const ratio = Math.min(1, cap / Math.max(nw, nh));
            const dw = Math.max(16, Math.round(nw * ratio));
            const dh = Math.max(16, Math.round(nh * ratio));
            if (!optFitCanvas) {
                optFitCanvas = document.createElement('canvas');
                optFitCtx = optFitCanvas.getContext('2d', { willReadFrequently: true });
            }
            if (!optFitCtx) return null;
            if (optFitCanvas.width !== dw) optFitCanvas.width = dw;
            if (optFitCanvas.height !== dh) optFitCanvas.height = dh;
            optFitCtx.clearRect(0, 0, dw, dh);
            optFitCtx.drawImage(sourceEl, 0, 0, dw, dh);
            const data = optFitCtx.getImageData(0, 0, dw, dh).data;
            return detectStudioContentBounds(data, dw, dh, nw, nh);
        } catch (e) {
            return null;
        }
    }

    function resolveImgBoxRatio(imgEl, overrideRatio) {
        if (Number(overrideRatio) > 0.1) return Number(overrideRatio);
        if (imgEl) {
            const attrRatio = Number(imgEl.getAttribute && imgEl.getAttribute('data-box-ratio'));
            if (attrRatio > 0.1) return attrRatio;
            const cw = imgEl.clientWidth || 0;
            const ch = imgEl.clientHeight || 0;
            if (cw >= 24 && ch >= 24) return cw / ch;
        }
        return 1;
    }

    function applyOptFitVars(imgEl, bboxOrFit, overrideRatio) {
        if (!imgEl) return;
        if (!bboxOrFit || bboxOrFit === 'skip') {
            imgEl.style.removeProperty('--opt-scale');
            imgEl.style.removeProperty('--opt-tx');
            imgEl.style.removeProperty('--opt-ty');
            return;
        }
        const fit = (typeof bboxOrFit.uMin === 'number')
            ? computeOpticalFitForBox(bboxOrFit, resolveImgBoxRatio(imgEl, overrideRatio))
            : bboxOrFit;
        if (!fit || fit === 'skip') {
            imgEl.style.removeProperty('--opt-scale');
            imgEl.style.removeProperty('--opt-tx');
            imgEl.style.removeProperty('--opt-ty');
            return;
        }
        if (fit.s && Math.abs(fit.s - 1) > 0.01) {
            imgEl.style.setProperty('--opt-scale', String(fit.s));
        } else {
            imgEl.style.removeProperty('--opt-scale');
        }
        if (fit.tx && Math.abs(fit.tx) >= 0.5) {
            imgEl.style.setProperty('--opt-tx', String(fit.tx) + '%');
        } else {
            imgEl.style.removeProperty('--opt-tx');
        }
        if (fit.ty && Math.abs(fit.ty) >= 0.5) {
            imgEl.style.setProperty('--opt-ty', String(fit.ty) + '%');
        } else {
            imgEl.style.removeProperty('--opt-ty');
        }
    }

    function analyzeImageOpticalFit(imgEl) {
        const bbox = detectProductStudioBoundsFromSource(imgEl, 96);
        return bbox || 'skip';
    }

    window.__CREATA_OPTFIT_TEST__ = {
        detectStudioContentBounds: detectStudioContentBounds,
        computeOpticalFitForBox: computeOpticalFitForBox,
        OPTFIT_STORAGE_KEY: OPTFIT_STORAGE_KEY,
        OPTFIT_TARGET_FILL: OPTFIT_TARGET_FILL
    };

    function buildOptFitKey(fid, rev) {
        if (!fid) return '';
        return rev ? (fid + ':' + rev) : fid;
    }

    function drainOptFitQueue() {
        optFitScheduled = false;
        const map = loadOptFitMap();
        let processed = 0;
        let dirty = false;
        while (optFitQueue.length > 0 && processed < 8) {
            const imgEl = optFitQueue.shift();
            if (!imgEl || !imgEl.isConnected) continue;
            const fid = imgEl.getAttribute('data-fid') || '';
            const rev = imgEl.getAttribute('data-rev') || '';
            const fitKey = buildOptFitKey(fid, rev);
            if (fitKey && Object.prototype.hasOwnProperty.call(map, fitKey)) {
                applyOptFitVars(imgEl, map[fitKey]);
                continue;
            }
            const bbox = analyzeImageOpticalFit(imgEl);
            if (fitKey) {
                map[fitKey] = bbox;
                dirty = true;
            }
            applyOptFitVars(imgEl, bbox);
            processed++;
        }
        if (dirty) scheduleSaveOptFitMap();
        if (optFitQueue.length > 0) scheduleOptFitDrain();
    }

    function scheduleOptFitDrain() {
        if (optFitScheduled) return;
        optFitScheduled = true;
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(drainOptFitQueue, { timeout: 300 });
        } else {
            setTimeout(drainOptFitQueue, 16);
        }
    }

    window.__invOnCardImgLoad = function (imgEl) {
        if (!imgEl || !imgEl.getAttribute('data-card-img')) return;
        const fid = imgEl.getAttribute('data-fid') || '';
        const rev = imgEl.getAttribute('data-rev') || '';
        const fitKey = buildOptFitKey(fid, rev);
        const map = loadOptFitMap();
        if (fitKey && Object.prototype.hasOwnProperty.call(map, fitKey)) {
            applyOptFitVars(imgEl, map[fitKey]);
            return;
        }
        optFitQueue.push(imgEl);
        scheduleOptFitDrain();
    };

    window.__invHandleCardImgError = function (imgEl) {
        if (!imgEl) return;
        const fid = imgEl.getAttribute('data-fid') || '';
        const rev = imgEl.getAttribute('data-rev') || '';
        const revAmp = rev ? ('&v=' + encodeURIComponent(rev)) : '';
        const step = parseInt(imgEl.getAttribute('data-fb-step') || '0', 10);
        if (fid && /^[a-zA-Z0-9_-]{15,}$/.test(fid)) {
            if (step === 0) {
                imgEl.setAttribute('data-fb-step', '1');
                try { imgEl.removeAttribute('crossorigin'); } catch (e) {}
                imgEl.crossOrigin = null;
                imgEl.src = buildDriveLh3Url(encodeURIComponent(fid), '=w600', rev);
                return;
            }
            if (step === 1) {
                imgEl.setAttribute('data-fb-step', '2');
                try { imgEl.removeAttribute('crossorigin'); } catch (e) {}
                imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fid) + '&sz=w800' + revAmp;
                return;
            }
            if (step === 2) {
                imgEl.setAttribute('data-fb-step', '3');
                try { imgEl.removeAttribute('crossorigin'); } catch (e) {}
                imgEl.src = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fid) + revAmp;
                return;
            }
        }
        imgEl.onerror = null;
        if (fid) failedDrivePhotoIds.add(fid);
        const stage = imgEl.parentElement;
        if (stage) {
            stage.classList.add('is-empty');
            stage.innerHTML = '<div class="inv-thumb-placeholder">' + THUMB_PLACEHOLDER_SVG + '</div>';
        }
    };

    window.__invHandleSwatchImgError = function (imgEl) {
        if (!imgEl) return;
        const fid = imgEl.getAttribute('data-fid') || '';
        const step = parseInt(imgEl.getAttribute('data-fb-step') || '0', 10);
        if (fid && /^[a-zA-Z0-9_-]{15,}$/.test(fid)) {
            if (step === 0) {
                imgEl.setAttribute('data-fb-step', '1');
                try { imgEl.removeAttribute('crossorigin'); } catch (e) {}
                imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fid) + '&sz=w600';
                return;
            }
            if (step === 1) {
                imgEl.setAttribute('data-fb-step', '2');
                imgEl.src = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fid);
                return;
            }
        }
        imgEl.onerror = null;
        imgEl.style.display = 'none';
        const parentEl = imgEl.parentElement;
        if (parentEl && parentEl.classList && parentEl.classList.contains('inv-fabric-choice-stage') && !parentEl.querySelector('.inv-fabric-choice-empty')) {
            const zoomBtn = parentEl.querySelector('.inv-fabric-choice-zoom');
            if (zoomBtn) zoomBtn.style.display = 'none';
            const fbDiv = document.createElement('div');
            fbDiv.className = 'inv-fabric-choice-empty';
            fbDiv.innerHTML = '<span class="inv-fabric-choice-empty-ico" aria-hidden="true">🧵</span><span>Tela / Color</span>';
            parentEl.appendChild(fbDiv);
        }
    };

    function buildThumbHtml(it, opts) {
        const o = opts || {};
        const url = photoUrlForItem(it);
        const fid = it ? extractDriveFileId(it.f) : '';
        const rev = it ? extractDrivePhotoRev(it.f) : '';
        if (!url || (fid && failedDrivePhotoIds.has(fid))) {
            return '<div class="inv-thumb"><div class="inv-thumb-stage is-empty"><div class="inv-thumb-placeholder">' + THUMB_PLACEHOLDER_SVG + '</div></div></div>';
        }
        let targetUrl = url;
        if (fid) {
            const sz = o.compact
                ? '=w160'
                : (o.card && typeof window !== 'undefined' && window.innerWidth >= 768 ? '=w600' : '=w400');
            targetUrl = buildDriveLh3Url(fid, sz, rev);
        }
        const loadingAttr = o.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
        const enableOptFit = !!(o.card || o.compact);
        const boxRatio = Number(o.boxRatio) > 0.1 ? Number(o.boxRatio) : 1;
        const imgW = o.compact ? 80 : 400;
        const imgH = o.compact ? 80 : Math.max(100, Math.round(400 / boxRatio));
        const cardAttr = enableOptFit ? (' data-card-img="1" data-box-ratio="' + boxRatio.toFixed(4) + '"') : '';
        let inlineFitStyle = '';
        if (enableOptFit && fid) {
            const fitKey = buildOptFitKey(fid, rev);
            const cachedBbox = loadOptFitMap()[fitKey];
            if (cachedBbox && cachedBbox !== 'skip') {
                const cachedFit = (typeof cachedBbox.uMin === 'number')
                    ? computeOpticalFitForBox(cachedBbox, boxRatio)
                    : cachedBbox;
                if (cachedFit && cachedFit !== 'skip') {
                    const parts = [];
                    if (cachedFit.s && Math.abs(cachedFit.s - 1) > 0.01) parts.push('--opt-scale:' + cachedFit.s);
                    if (cachedFit.tx && Math.abs(cachedFit.tx) >= 0.5) parts.push('--opt-tx:' + cachedFit.tx + '%');
                    if (cachedFit.ty && Math.abs(cachedFit.ty) >= 0.5) parts.push('--opt-ty:' + cachedFit.ty + '%');
                    if (parts.length) inlineFitStyle = ' style="' + parts.join(';') + '"';
                }
            }
        }
        return '<div class="inv-thumb"><div class="inv-thumb-stage">' +
            '<img width="' + imgW + '" height="' + imgH + '" ' + loadingAttr + ' decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" draggable="false" alt=""' +
            cardAttr + (fid ? (' data-fid="' + escapeHtml(fid) + '"') : '') + (rev ? (' data-rev="' + escapeHtml(rev) + '"') : '') + inlineFitStyle +
            ' src="' + escapeHtml(targetUrl) + '"' +
            (enableOptFit ? ' onload="window.__invOnCardImgLoad&&window.__invOnCardImgLoad(this)"' : '') +
            ' onerror="window.__invHandleCardImgError&&window.__invHandleCardImgError(this)">' +
            '</div></div>';
    }
    window.__INV_THUMB_PH = THUMB_PLACEHOLDER_SVG;

    function formatTitleWithPriceHtml(titleText, priceStr) {
        const cleanTitle = escapeHtml(titleText || '');
        const cleanPr = formatPrice(priceStr);
        if (!cleanPr) return cleanTitle;
        return cleanTitle + ' <span class="font-extrabold" style="color:#A38251;">— ' + escapeHtml(cleanPr) + '</span>';
    }

    function formatTitleWithPricePlain(titleText, priceStr) {
        const cleanTitle = String(titleText || '').trim();
        const cleanPr = formatPrice(priceStr);
        if (!cleanPr) return cleanTitle;
        return cleanTitle + ' — ' + cleanPr;
    }

    function parseSheetDate(rawStr) {
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

    // Holgura operativa solicitada: +2 semanas (+14 días) sobre la Fecha compromiso del proveedor (LPPT Col F)
    const SUPPLIER_COMMITMENT_BUFFER_DAYS = 14;

    function formatDateDMY(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    function addDaysLocal(dt, days) {
        if (!dt || isNaN(dt.getTime())) return null;
        const copy = new Date(dt.getTime());
        copy.setDate(copy.getDate() + (Number(days) || 0));
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    function shiftDateStringDays(rawStr, days) {
        const clean = cleanStr(rawStr);
        if (!clean) return '';
        const parsed = parseSheetDate(clean);
        if (!parsed) return clean;
        const shifted = addDaysLocal(parsed, days);
        return shifted ? formatDateDMY(shifted) : clean;
    }

    function formatSpanishDayMonth(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dayNum = dt.getDate();
        const monthName = MONTHS_ES[dt.getMonth()] || '';
        return dayNum + ' de ' + monthName;
    }

    function itemRequiresComprasDateNotice(it) {
        if (!it) return false;
        if (isComprasManagedDateProvider(it.p)) return true;
        const feNorm = cleanStr(it.fe).toLowerCase();
        if (feNorm && feNorm === COMPRAS_DATE_NOTICE.toLowerCase()) return true;
        const skuU = cleanStr(it.s).toUpperCase();
        if (skuU && !cleanStr(it.p)) {
            const lpptArr = liveLpptBySku.get(skuU);
            if (lpptArr && lpptArr.length > 0 && lpptArr.some(e => isComprasManagedDateProvider(e && e.prov))) {
                return true;
            }
        }
        return false;
    }

    // Días restantes para la llegada de la pieza en LPPT (null si no hay dato o no tiene piezas en LPPT)
    function getItemLpptRemainingDays(it) {
        if (!it || getLpptStock(it) <= 0) return null;
        if (itemRequiresComprasDateNotice(it)) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const feRaw = cleanStr(it.fe);
        if (feRaw && feRaw !== 'Sin piezas solicitadas') {
            const dFe = parseSheetDate(feRaw);
            if (dFe) {
                return Math.max(0, Math.round((dFe.getTime() - today.getTime()) / 86400000));
            }
        }

        const fcompRaw = cleanStr(it.fcomp);
        if (fcompRaw) {
            const dComp = parseSheetDate(fcompRaw);
            if (dComp) {
                return Math.max(0, Math.round((dComp.getTime() - today.getTime()) / 86400000));
            }
        }

        if (it.lt !== '' && it.lt !== null && it.lt !== undefined) {
            const ltNum = Number(it.lt);
            if (!isNaN(ltNum) && isFinite(ltNum) && ltNum >= 0) {
                return Math.round(ltNum);
            }
        }
        return null;
    }

    function getItemLpptDaysBucket(it) {
        const days = getItemLpptRemainingDays(it);
        if (days === null || days === undefined || !isFinite(days)) return '';
        const d = Math.round(days);
        for (let i = 0; i < LPPT_DAY_RANGES.length; i++) {
            const r = LPPT_DAY_RANGES[i];
            if (d >= r.min && d <= r.max) return r.key;
        }
        return '';
    }

    // Construye el mensaje de LPPT mostrando los días faltantes y, si existe, la fecha compromiso del proveedor
    function formatLpptArrivalText(it, lpptQty) {
        const qty = Math.max(0, Number(lpptQty) || 0);
        if (qty <= 0) return '';

        const dispWord = qty === 1 ? 'disponible' : 'disponibles';
        if (itemRequiresComprasDateNotice(it)) {
            return 'LPPT: ' + qty + ' ' + dispWord + ' · ' + COMPRAS_DATE_NOTICE;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let arrivalDate = null;
        const feRaw = cleanStr(it && it.fe);
        if (feRaw && feRaw !== 'Sin piezas solicitadas') {
            arrivalDate = parseSheetDate(feRaw);
        }

        const fcompRaw = cleanStr(it && it.fcomp);
        const compDate = fcompRaw ? parseSheetDate(fcompRaw) : null;

        const remDays = getItemLpptRemainingDays(it);
        if (!arrivalDate && remDays !== null) {
            const d = new Date(today.getTime());
            d.setDate(d.getDate() + remDays);
            arrivalDate = d;
        }

        const parts = ['LPPT: ' + qty + ' ' + dispWord];

        if (remDays !== null) {
            if (remDays === 0) {
                parts.push('Por llegar (0 días restantes)');
            } else if (remDays === 1) {
                parts.push('Falta 1 día por llegar');
            } else {
                parts.push('Faltan ' + remDays + ' días por llegar');
            }
        }

        if (compDate) {
            parts.push('Fecha compromiso proveedor: ' + formatDateDMY(compDate) + ' (' + formatSpanishDayMonth(compDate) + ')');
        } else if (arrivalDate) {
            const dayMonth = formatSpanishDayMonth(arrivalDate);
            if (dayMonth) parts.push('Entrega estimada: ' + dayMonth);
        }

        return parts.join(' · ');
    }

    function buildSinglePieceCoverGroup(it, skuKey, fallbackGroupTitle) {
        const pieceTitle = (
            it._singleTitle ||
            stripDimensionsFromProductText(it.n) ||
            fallbackGroupTitle ||
            skuKey
        ).toUpperCase();
        const wordList = Array.from(new Set((it._search || '').split(/\s+/).filter(w => w.length >= 2)));
        return {
            key: 'all_sku_' + skuKey,
            title: pieceTitle,
            displayTitle: pieceTitle,
            tp: cleanStr(it.tp).toUpperCase(),
            mo: cleanStr(it.mo).toUpperCase(),
            items: [it],
            totalStock: getBodegaPisoStock(it),
            lpptStock: getLpptStock(it),
            _hasPhoto: it._hasPhoto ? 1 : 0,
            _mainRank: it._mainRank,
            _subRank: it._subRank,
            _typeRank: it._typeRank,
            _plain: it._plain || '',
            _search: it._search || '',
            _titleSearch: normSearch(pieceTitle),
            _compact: (it._search || '').replace(/\s+/g, ''),
            _words: wordList,
            _stems: new Set(wordList.map(stemEs)),
            _roots: new Set(wordList.map(rootEs)),
            _titleTokens: normSearch(pieceTitle).split(/\s+/).filter(Boolean),
            _modelTokens: it.mo ? normSearch(it.mo).split(/\s+/).filter(Boolean) : []
        };
    }

    const FOTOS_SAVED_OVERRIDES_STORAGE_KEY = 'creata_fotos_saved_overrides_v1';
    const FOTOS_DELETED_QUEUE_STORAGE_KEY = 'creata_fotos_deleted_queue_v1';
    const FOTOS_SYNC_BROADCAST_CHANNEL = 'creata_fotos_cotizador_sync_v1';

    function applyStoredFotosOverridesToItems(itemsArr) {
        if (!Array.isArray(itemsArr) || !itemsArr.length) return false;
        let savedBySku = null;
        let delSkus = null;
        let delFiles = null;
        const now = Date.now();
        const maxSavedAgeMs = 7 * 24 * 60 * 60 * 1000;
        const maxDelAgeMs = 24 * 60 * 60 * 1000;

        try {
            const rawDel = localStorage.getItem(FOTOS_DELETED_QUEUE_STORAGE_KEY);
            if (rawDel) {
                const parsedDel = JSON.parse(rawDel);
                if (parsedDel && typeof parsedDel === 'object') {
                    if (parsedDel.skus && typeof parsedDel.skus === 'object') {
                        delSkus = parsedDel.skus;
                    }
                    if (parsedDel.fileIds && typeof parsedDel.fileIds === 'object') {
                        delFiles = {};
                        Object.keys(parsedDel.fileIds).forEach(function (fid) {
                            const ts = Number(parsedDel.fileIds[fid] || 0);
                            if (!ts || (now - ts) <= maxDelAgeMs) {
                                delFiles[fid] = 1;
                            }
                        });
                    }
                }
            }
        } catch (eDel) {}

        try {
            const rawSaved = localStorage.getItem(FOTOS_SAVED_OVERRIDES_STORAGE_KEY);
            if (rawSaved) {
                const list = JSON.parse(rawSaved);
                if (Array.isArray(list) && list.length > 0) {
                    savedBySku = new Map();
                    for (let i = 0; i < list.length; i++) {
                        const ov = list[i];
                        if (!ov || !ov.sku || !ov.newUrl) continue;
                        const cleanUrl = sanitizeVisualOverrideUrl(cleanStr(ov.newUrl));
                        if (!cleanUrl) continue;
                        if (ov.ts && (now - Number(ov.ts)) > maxSavedAgeMs) continue;
                        const sk = cleanStr(ov.sku).toUpperCase();
                        if (!sk || savedBySku.has(sk)) continue;
                        const fid = cleanStr(ov.fileId || extractDriveFileId(cleanUrl));
                        if ((delSkus && delSkus[sk]) || (fid && delFiles && delFiles[fid])) continue;
                        const versionedUrl = (fid && ov.ts && !extractDrivePhotoRev(cleanUrl))
                            ? (cleanUrl + (cleanUrl.indexOf('?') !== -1 ? '&' : '?') + 'v=' + Math.trunc(Number(ov.ts)))
                            : cleanUrl;
                        savedBySku.set(sk, {
                            newUrl: versionedUrl,
                            rawUrl: cleanUrl,
                            fileId: fid,
                            previousUrl: cleanStr(ov.previousUrl)
                        });
                    }
                }
            }
        } catch (eSaved) {}

        if (!savedBySku && !delSkus && !delFiles) return false;

        let mutated = false;
        for (let i = 0; i < itemsArr.length; i++) {
            const it = itemsArr[i];
            if (!it || !it.s) continue;
            const skuKey = String(it.s).trim().toUpperCase();
            const curFid = extractDriveFileId(it.f);

            if ((delSkus && delSkus[skuKey]) || (curFid && delFiles && delFiles[curFid])) {
                if (it.f) {
                    it.f = '';
                    mutated = true;
                }
                continue;
            }

            if (savedBySku && savedBySku.has(skuKey)) {
                const ov = savedBySku.get(skuKey);
                const savedFid = ov.fileId;
                const prevFid = extractDriveFileId(ov.previousUrl);
                const curRev = extractDrivePhotoRev(it.f);
                const ovExplicitRev = extractDrivePhotoRev(ov.rawUrl);
                const isPendingFidPropagation = !curFid || (prevFid && curFid === prevFid && curFid !== savedFid);
                const canUpgradeSameFidRev = curFid === savedFid && (!curRev || (ovExplicitRev && curRev !== ovExplicitRev));
                if (isPendingFidPropagation || canUpgradeSameFidRev) {
                    if (it.f !== ov.newUrl) {
                        it.f = ov.newUrl;
                        if (savedFid) failedDrivePhotoIds.delete(savedFid);
                        mutated = true;
                    }
                }
            }
        }
        return mutated;
    }

    function indexItemsAndGroups() {
        applyStoredFotosOverridesToItems(allItems);
        rebuildLiveAutoVocab(allItems);
        allItems.sort((a, b) =>
            compareAlphaEs(a && (a.n || a.s), b && (b.n || b.s)) ||
            String((a && a.s) || '').localeCompare(String((b && b.s) || ''))
        );

        bySkuMap.clear();
        bySkuNormMap.clear();
        singleBySkuMap.clear();
        groupsByKey.clear();
        activeFilteredGroupsByKey.clear();
        allSingleGroups = [];
        allGroups = [];

        sofaAndLoveseatModels = new Set();
        exteriorSofaAndLoveseatModels = new Set();
        exteriorSalaSetModels = new Set();
        exteriorModularModels = new Set();
        dynamicSofaCamaModels = new Set();
        bedUnifiedModels = new Set();

        // Pre-pasada 1: normalizar campos base, validar tela/color contra nombre y detectar modelos con Sofá Cama (ej. CITY)
        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = emptyStocks();
            it.pr = formatPrice(it.pr);
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;
            const curFabSig = [it.n || '', it.tp || '', it.tl || '', it.ct || '', it.cm || ''].join('\x1f');
            if (it._fabValSig !== curFabSig) {
                validateAndNormalizeFabricColorAgainstName(it, { mutate: true });
            }
            it._avail = getItemAvailabilityKind(it);
            const pairMoKey = extractPlainModelKeyForPairing(it);
            if (pairMoKey) {
                const prodTok = (plainModelToken(stripDimensionsFromProductText(it.tp)) + ' ' + plainModelToken(stripDimensionsFromProductText(it.n))).trim();
                if (/\b(SOFAS?\s*CAMAS?|SOFA-CAMA)\b/.test(prodTok)) {
                    dynamicSofaCamaModels.add(pairMoKey);
                }
            }
        }

        // Pre-pasada 2: clasificar subcategorías y detectar pares Sofá + Love Seat, colecciones de Exterior y familias de Camas/Bases/Cabeceras
        const salaPairFlags = new Map();
        const extSeatFlags = new Map();
        const bedFamilyFlags = new Map();
        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;
            it._cat = resolveItemSubcategory(it, resolveItemCategory(it));
            it._main = MAIN_OF_SUB[it._cat] || 'ESPEJOS Y ACCESORIOS';
            if (!it._avail || !isQuotableItem(it)) continue;

            const pairMoKey = extractPlainModelKeyForPairing(it);
            if (!pairMoKey) continue;
            const tpTok = plainModelToken(stripDimensionsFromProductText(it.tp));
            const nomTok = plainModelToken(stripDimensionsFromProductText(it.n));
            const prodTok = (tpTok + ' ' + nomTok).trim();

            if (it._cat === 'SOFAS & LOVESEATS') {
                let f = salaPairFlags.get(pairMoKey);
                if (!f) { f = { hasSofa: false, hasLoveSeat: false }; salaPairFlags.set(pairMoKey, f); }
                if (/^(LOVE\s*SEAT|LOVESEAT)\b/.test(tpTok) || /\b(LOVE\s*SEATS?|LOVESEATS?)\b/.test(prodTok)) {
                    f.hasLoveSeat = true;
                } else if (/^SOFA\b/.test(tpTok) || /\bSOFAS?\b/.test(prodTok)) {
                    f.hasSofa = true;
                }
            } else if ((it._cat === 'CAMAS' || it._cat === 'BASES' || it._cat === 'CABECERAS') && tpTok !== 'LITERA' && tpTok !== 'CUNA') {
                let bf = bedFamilyFlags.get(pairMoKey);
                if (!bf) { bf = { hasCama: false, hasBase: false, hasCabecera: false }; bedFamilyFlags.set(pairMoKey, bf); }
                if (it._cat === 'CAMAS') bf.hasCama = true;
                else if (it._cat === 'BASES') bf.hasBase = true;
                else if (it._cat === 'CABECERAS') bf.hasCabecera = true;
            } else if (it._cat === 'EXTERIOR') {
                const isNonSeatExt = /\b(MESA|COMEDOR|CAMASTRO|COLUMPIO|SOMBRILLA)\b/.test(prodTok) || /^SILLA\b/.test(tpTok);
                if (!isNonSeatExt && /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|ESQUINEROS?|CHAISE|OTTOMAN|OTOMAN|MODULAR|MODULO|REMATE|SILLON(?:ES)?)\b/.test(prodTok)) {
                    let f = extSeatFlags.get(pairMoKey);
                    if (!f) {
                        f = { hasModular: false, hasSofa: false, hasLoveSeat: false, hasSillon: false, hasOttoman: false };
                        extSeatFlags.set(pairMoKey, f);
                    }
                    if (/\b(MODULAR(?:ES)?|MODULOS?|ESQUINEROS?|REMATES?|SIN\s+BRAZOS?|BRAZO\s+(?:DER|IZQ)|DERECHO|DEREHO|IZQUIERDO)\b/.test(prodTok)) {
                        f.hasModular = true;
                    }
                    if (/^(LOVE\s*SEAT|LOVESEAT)\b/.test(tpTok) || /\b(LOVE\s*SEATS?|LOVESEATS?)\b/.test(prodTok)) {
                        f.hasLoveSeat = true;
                    } else if (/^SOFA\b/.test(tpTok) || /\bSOFAS?\b/.test(prodTok)) {
                        f.hasSofa = true;
                    } else if (/^SILLON\b/.test(tpTok) || /\bSILLON(?:ES)?\b/.test(prodTok)) {
                        f.hasSillon = true;
                    } else if (/\b(OTTOMAN|OTOMAN|POUF|PUFF)\b/.test(prodTok)) {
                        f.hasOttoman = true;
                    }
                }
            }
        }
        salaPairFlags.forEach((f, moKey) => {
            if (f.hasSofa && f.hasLoveSeat) sofaAndLoveseatModels.add(moKey);
        });
        bedFamilyFlags.forEach((bf, moKey) => {
            const typeCount = (bf.hasCama ? 1 : 0) + (bf.hasBase ? 1 : 0) + (bf.hasCabecera ? 1 : 0);
            if (typeCount >= 2) bedUnifiedModels.add(moKey);
        });
        extSeatFlags.forEach((f, moKey) => {
            if (f.hasModular) {
                exteriorModularModels.add(moKey);
            } else if (f.hasSofa && f.hasLoveSeat) {
                exteriorSofaAndLoveseatModels.add(moKey);
            } else {
                const kindCount = (f.hasSofa ? 1 : 0) + (f.hasLoveSeat ? 1 : 0) + (f.hasSillon ? 1 : 0) + (f.hasOttoman ? 1 : 0);
                if (kindCount >= 2) exteriorSalaSetModels.add(moKey);
            }
        });

        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;

            const grpId = computeCategoryGroupIdentity(it);
            const title = grpId.title;
            const gKey = grpId.key;
            it._groupKey = gKey;
            it._groupTitle = title;
            it._singleTitle = grpId.singleTitle || title;
            it._grpMo = grpId.mo || '';
            it._typeKey = grpId.typeKey || '';
            it._typeLabel = grpId.typeLabel || '';
            it._typeRank = typeof grpId.typeRank === 'number' ? grpId.typeRank : 999;

            it._lpptBucket = getLpptStock(it) >= 1 ? getItemLpptDaysBucket(it) : '';
            it._hasPhoto = photoUrlForItem(it) ? 1 : 0;
            it._mainRank = getMainCategoryRank(it._main);
            it._subRank = getSubCategoryRank(it._cat);

            const rawText = [
                it.s, title, it._singleTitle, it.n, it.vr, it.tp, it._typeLabel, it.mo, grpId.mo, it._cat, it._main,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p, it.pr
            ].join(' ');
            it._plain = normalizePlain(rawText);
            it._search = normSearch(rawText);

            bySkuMap.set(skuKey, it);
            const skuNormKey = skuKey.replace(/[^A-Z0-9]+/g, '');
            if (skuNormKey) {
                const prevNorm = bySkuNormMap.get(skuNormKey);
                if (!prevNorm || (!isQuotableItem(prevNorm) && isQuotableItem(it))) {
                    bySkuNormMap.set(skuNormKey, it);
                }
            }

            // Cotizador: solo se muestran piezas con al menos 1 pz en Bodega/Piso
            // o piezas de LPPT con registro y precio en S Mueblería (excluyendo ARCHIVADO/ELIMINADO).
            // El resto queda oculto (sigue en bySkuMap para conservar partidas previas).
            if (!it._avail || !isQuotableItem(it)) continue;

            // Vista separada pieza por pieza para CATEGORÍAS
            const singleEntry = buildSinglePieceCoverGroup(it, skuKey, title);
            singleBySkuMap.set(skuKey, singleEntry);
            allSingleGroups.push(singleEntry);

            // Vista agrupada por Tipo de Mueble + Modelo en TODOS y en subcategorías por tamaño (Camas / Bases / Cabeceras)
            let grp = groupsByKey.get(gKey);
            if (!grp) {
                grp = {
                    key: gKey,
                    title: title,
                    tp: cleanStr(it.tp).toUpperCase(),
                    typeKey: grpId.typeKey || '',
                    typeLabel: grpId.typeLabel || '',
                    mo: grpId.mo || cleanStr(it.mo).toUpperCase(),
                    items: [],
                    _plainParts: [],
                    _searchParts: []
                };
                groupsByKey.set(gKey, grp);
                allGroups.push(grp);
            }
            grp.items.push(it);
            grp._plainParts.push(it._plain);
            grp._searchParts.push(it._search);
            if (!grp.cats) grp.cats = new Set();
            if (!grp.mains) grp.mains = new Set();
            if (!grp.avails) grp.avails = new Set();
            if (!grp.lpptBuckets) grp.lpptBuckets = new Set();
            if (it._cat) grp.cats.add(it._cat);
            if (it._main) grp.mains.add(it._main);
            grp.avails.add(it._avail);
            if (it._lpptBucket) grp.lpptBuckets.add(it._lpptBucket);
        }

        for (let i = 0; i < allGroups.length; i++) {
            const grp = allGroups[i];
            grp.items.sort((a, b) =>
                compareAlphaEs(a.n || a.vr || a.s, b.n || b.vr || b.s) ||
                String(a.s || '').localeCompare(String(b.s || ''))
            );
            if (grp.items.length > 1 && grp.mo) {
                let bestMo = grp.mo;
                for (let j = 0; j < grp.items.length; j++) {
                    const candMo = grp.items[j]._grpMo;
                    if (!candMo) continue;
                    const candPlain = normalizePlain(candMo);
                    const isTypo = Object.prototype.hasOwnProperty.call(MODEL_TYPO_ALIASES, candPlain) && candPlain !== 'benzio iii';
                    if (isTypo) continue;
                    if (/\s+(?:SW|II|III|IV)$/.test(plainModelToken(candMo))) {
                        bestMo = candMo;
                        break;
                    }
                    if (candMo.length < bestMo.length || Object.prototype.hasOwnProperty.call(MODEL_TYPO_ALIASES, normalizePlain(bestMo))) {
                        bestMo = candMo;
                    }
                }
                grp.mo = bestMo;

                let chosenPrefix = grp.typeLabel || stripDimensionsFromProductText(grp.items[0].tp).toUpperCase();
                if (grp.typeKey === 'MESA_COMEDOR') {
                    const anyExplicitDining = grp.items.some(x => x._typeLabel === 'MESA DE COMEDOR');
                    chosenPrefix = anyExplicitDining ? 'MESA DE COMEDOR' : 'MESA';
                } else if (grp.typeKey === 'COMODA') {
                    const allCajonera = grp.items.every(x => x._typeLabel === 'CAJONERA');
                    chosenPrefix = allCajonera ? 'CAJONERA' : 'CÓMODA';
                } else if (grp.typeKey === 'CAMA_CONJUNTO') {
                    chosenPrefix = resolveBedUnifiedTitlePrefix(grp.items);
                }
                if (chosenPrefix) {
                    const fpPad = ' ' + plainModelToken(chosenPrefix) + ' ';
                    const moPad = ' ' + plainModelToken(bestMo) + ' ';
                    grp.title = (fpPad.indexOf(moPad) !== -1 ? chosenPrefix : (chosenPrefix + ' ' + bestMo)).toUpperCase();
                    for (let j = 0; j < grp.items.length; j++) {
                        grp.items[j]._groupTitle = grp.title;
                    }
                }

                // NUNCA mezclar ni propagar Madera, Color de madera, Materiales, Medidas ni Modelo entre SKUs distintos:
                // cada SKU conserva estrictamente los datos propios de su fila en CONTROL DE PRODUCTOS PRESENTACIÓN (INVENTARIO_EN_VIVO).
            }
            grp.displayTitle = (grp.items.length > 1
                ? grp.title
                : (grp.items[0]._singleTitle || stripDimensionsFromProductText(grp.items[0].n) || grp.title || grp.items[0].s)
            ).toUpperCase();
            grp.moduleCount = countDistinctModulesForGroup(grp.typeKey, grp.items);
            grp.variationCount = countDistinctFabricsForGroup(grp.typeKey, grp.items);
            grp.bedSizeCount = countDistinctBedSizesForGroup(grp.typeKey, grp.items);
            grp.bedColorCount = countDistinctBedColorsForGroup(grp.typeKey, grp.items);
            grp.bedWoodOnly = !!(grp.typeKey && BED_GROUPABLE_TYPE_KEYS.has(grp.typeKey) && isBedGroupWoodOnly(grp.items));
            grp.totalStock = grp.items.reduce((acc, x) => acc + getBodegaPisoStock(x), 0);
            grp.lpptStock = grp.items.reduce((acc, x) => acc + getLpptStock(x), 0);
            grp._hasPhoto = (getGroupVisualCoverPhotoUrl(grp.key) || firstPhotoItem(grp.items)) ? 1 : 0;
            grp._mainRank = grp.items.reduce((m, x) => Math.min(m, typeof x._mainRank === 'number' ? x._mainRank : 99), 99);
            grp._subRank = grp.items.reduce((m, x) => Math.min(m, typeof x._subRank === 'number' ? x._subRank : 999), 999);
            grp._typeRank = grp.items.reduce((m, x) => Math.min(m, typeof x._typeRank === 'number' ? x._typeRank : 999), 999);
            grp._plain = grp._plainParts.join(' ');
            grp._search = grp._searchParts.join(' ');
            grp._titleSearch = normSearch(grp.displayTitle || grp.title);
            grp._compact = grp._search.replace(/\s+/g, '');
            const wordList = Array.from(new Set(grp._search.split(/\s+/).filter(w => w.length >= 2)));
            grp._words = wordList;
            grp._stems = new Set(wordList.map(stemEs));
            grp._roots = new Set(wordList.map(rootEs));
            grp._titleTokens = normSearch(grp.title).split(/\s+/).filter(Boolean);
            grp._modelTokens = grp.mo ? normSearch(grp.mo).split(/\s+/).filter(Boolean) : [];
            delete grp._plainParts;
            delete grp._searchParts;
        }

        allSingleGroups.sort(compareCommercialGroupOrder);
        allGroups.sort(compareCommercialGroupOrder);

        // Publicar índice compacto de modelos (Portadas) y telas/colores (VFAB) para la App de Subida de Fotos
        try {
            if (typeof localStorage !== 'undefined') {
                const coversIdx = [];
                const fabricsMap = new Map();
                for (let gIdx = 0; gIdx < allGroups.length; gIdx++) {
                    const g = allGroups[gIdx];
                    if (!g || !Array.isArray(g.items) || g.items.length < 2) continue;
                    const isModType = !!(g.typeKey && MODULE_GROUPABLE_TYPE_KEYS.has(g.typeKey));
                    const subCat = g.cats && g.cats.size ? Array.from(g.cats)[0] : '';
                    const mainCat = g.mains && g.mains.size ? Array.from(g.mains)[0] : '';
                    const samplePhotoIt = firstPhotoItem(g.items);
                    coversIdx.push({
                        groupKey: g.key,
                        overrideKey: buildVisualCoverOverrideKey(g.key),
                        title: g.displayTitle || g.title,
                        subCat: subCat,
                        mainCat: mainCat,
                        isModular: isModType ? 1 : 0,
                        itemCount: g.items.length,
                        fabricCount: g.variationCount || g.bedColorCount || 0,
                        samplePhoto: samplePhotoIt ? sanitizeVisualOverrideUrl(samplePhotoIt.f) : ''
                    });
                    if (isModType) {
                        const seenFabInModel = new Set();
                        for (let mIdx = 0; mIdx < g.items.length; mIdx++) {
                            const fab = resolveItemFabricVariation(g.items[mIdx], g);
                            if (!fab || !fab.key) continue;
                            if (!fabricsMap.has(fab.key)) {
                                fabricsMap.set(fab.key, {
                                    fabricKey: fab.key,
                                    overrideKey: buildFabricSwatchOverrideKey(fab.key),
                                    label: fab.label,
                                    colorHint: fab.colorHint || '',
                                    modelCount: 0,
                                    moduleCount: 0,
                                    sampleModels: []
                                });
                            }
                            const fEntry = fabricsMap.get(fab.key);
                            fEntry.moduleCount++;
                            if (!fEntry.colorHint && fab.colorHint) fEntry.colorHint = fab.colorHint;
                            if (!seenFabInModel.has(fab.key)) {
                                seenFabInModel.add(fab.key);
                                fEntry.modelCount++;
                                if (fEntry.sampleModels.length < 4) fEntry.sampleModels.push(g.displayTitle || g.title);
                            }
                        }
                    }
                }
                // Incluir también telas declaradas en productos no modulares (sillones, sofás, sillas, camas, etc.)
                for (let iIdx = 0; iIdx < allItems.length; iIdx++) {
                    const it = allItems[iIdx];
                    if (!it || !cleanStr(it.tl)) continue;
                    const grp = it._groupKey ? groupsByKey.get(it._groupKey) : null;
                    if (grp && grp.items && grp.items.length >= 2 && grp.typeKey && MODULE_GROUPABLE_TYPE_KEYS.has(grp.typeKey)) continue;
                    const fab = resolveItemFabricVariation(it, grp || null);
                    if (!fab || !fab.key || fab.key === 'ESTANDAR') continue;
                    if (!fabricsMap.has(fab.key)) {
                        fabricsMap.set(fab.key, {
                            fabricKey: fab.key,
                            overrideKey: buildFabricSwatchOverrideKey(fab.key),
                            label: fab.label,
                            colorHint: fab.colorHint || '',
                            modelCount: 0,
                            moduleCount: 0,
                            sampleModels: []
                        });
                    }
                    const fEntry = fabricsMap.get(fab.key);
                    fEntry.moduleCount++;
                    const mTitle = (grp && (grp.displayTitle || grp.title)) || cleanStr(it.mo) || cleanStr(it.n) || it.s;
                    if (mTitle && fEntry.sampleModels.indexOf(mTitle) === -1) {
                        fEntry.modelCount++;
                        if (fEntry.sampleModels.length < 4) fEntry.sampleModels.push(mTitle);
                    }
                }
                const fabricsIdx = Array.from(fabricsMap.values()).sort((a, b) =>
                    (b.moduleCount - a.moduleCount) || compareAlphaEs(a.label, b.label)
                );
                localStorage.setItem('creata_visual_targets_index_v1', JSON.stringify({
                    ts: Date.now(),
                    covers: coversIdx,
                    fabrics: fabricsIdx
                }));
            }
        } catch (eVisIdx) {}
    }

    function loadCart() {
        try {
            const saved = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
            return (saved && typeof saved === 'object') ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function saveCart() {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
        if (typeof syncActiveQuoteDraftStorage === 'function') syncActiveQuoteDraftStorage();
        updateCartBadge();
    }

    function updateCartBadge() {
        const isLockedDone = (typeof isActiveQuoteCompleted === 'function' && isActiveQuoteCompleted());
        const guestMode = (typeof isGuestSession === 'function' && isGuestSession());
        const totalQty = (isLockedDone || guestMode)
            ? 0
            : Object.values(cart).reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
        const el = document.getElementById('headerCartCount');
        if (el) el.textContent = String(totalQty);
        const fabBadge = document.getElementById('invFabBadge');
        if (fabBadge) {
            fabBadge.textContent = String(totalQty);
            fabBadge.classList.toggle('hidden', totalQty <= 0 || guestMode);
        }
    }

    // ------------------------------------------------------------------------
    // PORTADA PRINCIPAL (TODOS): AGRUPADO POR TIPO DE MUEBLE + MODELO EN ORDEN COMERCIAL (CON FOTO ARRIBA Y SIN FOTO AL FINAL)
    // ------------------------------------------------------------------------
    function getMainCoverGroups() {
        return allGroups;
    }

    let activeCategory = 'ALL';
    let activeSubCategory = 'ALL';

    function itemMatchesActiveFilter(it, cat, sub) {
        if (!it || !it._avail || !isQuotableItem(it)) return false;
        if (!cat || cat === 'ALL') return true;
        if (cat === 'STOCK') {
            if (getBodegaPisoStock(it) < 1) return false;
            if (sub && sub !== 'ALL') return it._main === sub;
            return true;
        }
        if (cat === 'LPPT_STOCK') return it._avail === 'LPPT_STOCK';
        if (cat === 'LPPT') {
            if (getLpptStock(it) < 1) return false;
            if (sub && sub !== 'ALL') return it._lpptBucket === sub;
            return true;
        }
        if (it._main !== cat) return false;
        if (sub && sub !== 'ALL') return it._cat === sub;
        return true;
    }

    function formatGroupBadgeLabel(grp) {
        if (!grp || !Array.isArray(grp.items)) return '';
        const modCnt = Number(grp.moduleCount) || 0;
        const varCnt = Number(grp.variationCount) || 0;
        if (modCnt >= 2 && varCnt >= 2) {
            return varCnt + ' colores · ' + grp.items.length + ' mód.';
        }
        if (modCnt >= 2) {
            return modCnt + ' módulos · ' + grp.items.length + ' var.';
        }
        if (grp.typeKey && BED_GROUPABLE_TYPE_KEYS.has(grp.typeKey)) {
            const szCnt = Number(grp.bedSizeCount) || 0;
            const colCnt = Number(grp.bedColorCount) || 0;
            if (szCnt >= 2 && colCnt >= 2) {
                return szCnt + ' tam. · ' + colCnt + (grp.bedWoodOnly ? ' acab.' : ' colores');
            }
            if (szCnt >= 2) {
                return szCnt + ' tamaños · ' + grp.items.length + ' var.';
            }
            if (colCnt >= 2) {
                return colCnt + (grp.bedWoodOnly ? ' acabados · ' : ' colores · ') + grp.items.length + ' pzas';
            }
        }
        return grp.items.length + ' variantes';
    }

    function buildFilteredGroupView(baseGrp, matchedItems) {
        if (!baseGrp || !matchedItems || matchedItems.length === 0) return null;
        if (matchedItems.length === baseGrp.items.length) return baseGrp;
        let multiTitle = baseGrp.title;
        if (matchedItems.length > 1 && baseGrp.typeKey === 'CAMA_CONJUNTO' && baseGrp.mo) {
            const narrowPrefix = resolveBedUnifiedTitlePrefix(matchedItems);
            const fpPad = ' ' + plainModelToken(narrowPrefix) + ' ';
            const moPad = ' ' + plainModelToken(baseGrp.mo) + ' ';
            multiTitle = (fpPad.indexOf(moPad) !== -1 ? narrowPrefix : (narrowPrefix + ' ' + baseGrp.mo)).toUpperCase();
        }
        const singleTitle = (matchedItems.length > 1
            ? multiTitle
            : (matchedItems[0]._singleTitle || stripDimensionsFromProductText(matchedItems[0].n) || baseGrp.title || matchedItems[0].s)
        ).toUpperCase();
        return Object.assign({}, baseGrp, {
            items: matchedItems,
            displayTitle: singleTitle,
            moduleCount: countDistinctModulesForGroup(baseGrp.typeKey, matchedItems),
            variationCount: countDistinctFabricsForGroup(baseGrp.typeKey, matchedItems),
            bedSizeCount: countDistinctBedSizesForGroup(baseGrp.typeKey, matchedItems),
            bedColorCount: countDistinctBedColorsForGroup(baseGrp.typeKey, matchedItems),
            bedWoodOnly: !!(baseGrp.typeKey && BED_GROUPABLE_TYPE_KEYS.has(baseGrp.typeKey) && isBedGroupWoodOnly(matchedItems)),
            totalStock: matchedItems.reduce((acc, x) => acc + getBodegaPisoStock(x), 0),
            lpptStock: matchedItems.reduce((acc, x) => acc + getLpptStock(x), 0),
            _hasPhoto: (getGroupVisualCoverPhotoUrl(baseGrp.key) || firstPhotoItem(matchedItems)) ? 1 : 0,
            _mainRank: matchedItems.reduce((m, x) => Math.min(m, typeof x._mainRank === 'number' ? x._mainRank : 99), 99),
            _subRank: matchedItems.reduce((m, x) => Math.min(m, typeof x._subRank === 'number' ? x._subRank : 999), 999),
            _typeRank: matchedItems.reduce((m, x) => Math.min(m, typeof x._typeRank === 'number' ? x._typeRank : 999), 999)
        });
    }

    // Vista individual por pieza para el botón STOCK: toma únicamente la cantidad física en Bodega + Piso (sin contar LPPT)
    function buildSinglePieceStockView(baseGrp, it) {
        const ownQty = getBodegaPisoStock(it);
        if (!it || ownQty < 1) return null;
        const skuKey = String(it.s || '').trim().toUpperCase();
        const pieceTitle = (
            it._singleTitle ||
            stripDimensionsFromProductText(it.n) ||
            (baseGrp && baseGrp.title) ||
            skuKey
        ).toUpperCase();
        return {
            key: 'stock_sku_' + skuKey,
            title: pieceTitle,
            displayTitle: pieceTitle,
            tp: cleanStr(it.tp).toUpperCase(),
            mo: cleanStr(it.mo).toUpperCase(),
            items: [it],
            totalStock: ownQty,
            lpptStock: 0,
            _hasPhoto: it._hasPhoto ? 1 : 0,
            _mainRank: it._mainRank,
            _subRank: it._subRank,
            _typeRank: it._typeRank
        };
    }

    function filterItemsMatchingSearchIfSubset(matchedItems, rawTrim) {
        if (!rawTrim || matchedItems.length <= 1) return matchedItems;
        const qNorm = normSearch(rawTrim);
        const rawTokens = qNorm.split(/\s+/).filter(Boolean);
        const meaningful = rawTokens.filter(t => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
        const qTokens = meaningful.length > 0 ? meaningful : rawTokens;
        if (!qTokens.length) return matchedItems;
        const directHits = matchedItems.filter(it => {
            const s = it._search || '';
            const words = s.split(/\s+/).filter(Boolean);
            return qTokens.every(tok => {
                const st = stemEs(tok);
                if (st === 'siya' || st === 'siyon') {
                    return words.some(w => stemEs(w) === st);
                }
                return s.indexOf(tok) !== -1;
            });
        });
        return directHits.length > 0 ? directHits : matchedItems;
    }

    function formatActiveFilterLabel() {
        if (activeCategory === 'ALL') return 'TODOS';
        let baseLabel = activeCategory === 'LPPT_STOCK' ? 'LPPT+STOCK' : activeCategory;
        if (activeSubCategory && activeSubCategory !== 'ALL') {
            if (activeCategory === 'LPPT') {
                baseLabel += ' (' + activeSubCategory + ' días)';
            } else {
                baseLabel += ' · ' + activeSubCategory;
            }
        }
        return baseLabel;
    }

    function searchGroupCollection(sourceGroups, rawTrim, scoreByKey) {
        const qNorm = normSearch(rawTrim);
        const rawTokens = qNorm.split(/\s+/).filter(Boolean);
        const meaningfulTokens = rawTokens.filter(t => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
        const qTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
        const compactQ = qNorm.replace(/\s+/g, '');

        if (qTokens.length === 0) {
            return sourceGroups;
        }

        const reqSilla = qTokens.some(t => stemEs(t) === 'siya');
        const reqSillon = qTokens.some(t => stemEs(t) === 'siyon');

        const candidateList = [];
        for (let i = 0; i < sourceGroups.length; i++) {
            const grp = sourceGroups[i];
            if (reqSilla && !reqSillon && (!grp._stems || !grp._stems.has('siya'))) continue;
            if (reqSillon && !reqSilla && (!grp._stems || !grp._stems.has('siyon'))) continue;
            let matchedCount = 0;
            let totalScore = 0;
            for (let t = 0; t < qTokens.length; t++) {
                const sc = scoreTokenInGroup(qTokens[t], grp);
                if (sc > 0) {
                    matchedCount++;
                    totalScore += sc;
                }
            }
            if (compactQ.length >= 4 && grp._compact && grp._compact.indexOf(compactQ) !== -1) {
                totalScore += 18;
                if (matchedCount === 0) matchedCount = 1;
            }
            if (matchedCount > 0) {
                candidateList.push({ grp: grp, matched: matchedCount, score: totalScore });
            }
        }

        // Prioridad 1: productos donde coinciden todos los términos relevantes de búsqueda
        let selected = candidateList.filter(entry => entry.matched === qTokens.length);

        // Prioridad 2: si hay varias palabras y ninguna coincide al 100%, mostrar las mejores coincidencias parciales
        if (selected.length === 0 && candidateList.length > 0) {
            selected = candidateList;
        }

        // Prioridad 3: si tampoco hubo coincidencia en búsqueda de 1 palabra, intentar tolerancia extra (2 ediciones / prefijo)
        if (selected.length === 0 && qTokens.length === 1 && qTokens[0].length >= 4 && !/\d/.test(qTokens[0]) && !reqSilla && !reqSillon) {
            const tok = qTokens[0];
            const maxExtraDist = tok.length >= 5 ? 2 : 1;
            const prefix = tok.slice(0, 3);
            for (let i = 0; i < sourceGroups.length; i++) {
                const grp = sourceGroups[i];
                let extraScore = 0;
                for (let wi = 0; wi < grp._words.length; wi++) {
                    const w = grp._words[wi];
                    if (w.length < 3) continue;
                    const wSt = stemEs(w);
                    if (wSt === 'siya' || wSt === 'siyon') continue;
                    const d = editDistanceBounded(tok, w, maxExtraDist);
                    if (d <= maxExtraDist) {
                        extraScore = Math.max(extraScore, d === 1 ? 8 : 5);
                    } else if (prefix.length >= 3 && w.startsWith(prefix)) {
                        extraScore = Math.max(extraScore, 4);
                    }
                }
                if (extraScore > 0) {
                    selected.push({ grp: grp, matched: 1, score: extraScore });
                }
            }
        }

        selected.forEach(entry => {
            scoreByKey.set(entry.grp.key, entry);
        });
        return selected.map(entry => entry.grp);
    }

    // ------------------------------------------------------------------------
    // FILTRADO: EN TODOS AGRUPADO POR TIPO + MODELO; EN CATEGORÍAS SEPARADO PIEZA POR PIEZA
    // EXCEPTO CAMAS, BASES Y CABECERAS (POR TAMAÑO) QUE SE MANTIENEN AGRUPADAS EN RECÁMARAS
    // (BOTÓN STOCK: PIEZAS CON MAYOR CANTIDAD FÍSICA SIN CONTAR LPPT)
    // ------------------------------------------------------------------------
    let lastRenderedCardKeys = [];

    function applyFilter(query, preserveCount, explicitMinCount) {
        const rawTrim = String(query || '').trim();
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) {
            clearBtn.style.display = '';
            clearBtn.classList.toggle('hidden', !rawTrim);
        }

        isMainCoverActive = (!rawTrim && activeCategory === 'ALL');
        activeFilteredGroupsByKey.clear();

        const exactSkuUpper = rawTrim ? rawTrim.toUpperCase() : '';
        const exactHitItem = exactSkuUpper ? bySkuMap.get(exactSkuUpper) : null;
        const isExactSkuHit = !!(exactHitItem && isQuotableItem(exactHitItem));
        const scoreByKey = new Map();
        const isMainCatSeparated = !!SUBCATEGORIES_BY_MAIN[activeCategory];

        if (activeCategory === 'ALL') {
            if (!rawTrim) {
                filteredGroups = getMainCoverGroups().slice();
            } else if (exactHitItem && !isQuotableItem(exactHitItem)) {
                filteredGroups = [];
            } else if (isExactSkuHit && singleBySkuMap.has(exactSkuUpper)) {
                filteredGroups = [singleBySkuMap.get(exactSkuUpper)];
            } else {
                const searchedGroups = searchGroupCollection(allGroups, rawTrim, scoreByKey);
                const nextFiltered = [];
                for (let i = 0; i < searchedGroups.length; i++) {
                    const grp = searchedGroups[i];
                    const matchedItems = filterItemsMatchingSearchIfSubset(grp.items, rawTrim);
                    const viewGrp = buildFilteredGroupView(grp, matchedItems);
                    if (viewGrp) {
                        activeFilteredGroupsByKey.set(viewGrp.key, viewGrp);
                        nextFiltered.push(viewGrp);
                    }
                }
                filteredGroups = nextFiltered;
            }
        } else if (isMainCatSeparated) {
            const subList = SUBCATEGORIES_BY_MAIN[activeCategory] || [];
            const isExplicitGroupedSub = activeSubCategory !== 'ALL' && GROUPED_SUBCATEGORIES.has(activeSubCategory);
            const hasAnyGroupedSub = activeSubCategory === 'ALL' && subList.some(sub => GROUPED_SUBCATEGORIES.has(sub));

            if (exactHitItem && !isQuotableItem(exactHitItem)) {
                filteredGroups = [];
            } else if (isExactSkuHit && singleBySkuMap.has(exactSkuUpper)) {
                filteredGroups = [singleBySkuMap.get(exactSkuUpper)];
            } else if (isExplicitGroupedSub || hasAnyGroupedSub) {
                const catPool = [];
                for (let i = 0; i < allGroups.length; i++) {
                    const grp = allGroups[i];
                    const matchedItems = grp.items.filter(it =>
                        itemMatchesActiveFilter(it, activeCategory, activeSubCategory) &&
                        (isExplicitGroupedSub || GROUPED_SUBCATEGORIES.has(it._cat))
                    );
                    if (matchedItems.length > 0) {
                        const viewGrp = buildFilteredGroupView(grp, matchedItems);
                        if (viewGrp) {
                            activeFilteredGroupsByKey.set(viewGrp.key, viewGrp);
                            catPool.push(viewGrp);
                        }
                    }
                }
                if (hasAnyGroupedSub) {
                    for (let i = 0; i < allSingleGroups.length; i++) {
                        const sg = allSingleGroups[i];
                        const it0 = sg.items[0];
                        if (itemMatchesActiveFilter(it0, activeCategory, activeSubCategory) && !GROUPED_SUBCATEGORIES.has(it0._cat)) {
                            catPool.push(sg);
                        }
                    }
                }
                if (!rawTrim) {
                    filteredGroups = catPool;
                } else {
                    const searchedPool = searchGroupCollection(catPool, rawTrim, scoreByKey);
                    const nextFiltered = [];
                    for (let i = 0; i < searchedPool.length; i++) {
                        const grp = searchedPool[i];
                        if (grp.items.length > 1) {
                            const matchedItems = filterItemsMatchingSearchIfSubset(grp.items, rawTrim);
                            const viewGrp = buildFilteredGroupView(grp, matchedItems);
                            if (viewGrp) {
                                activeFilteredGroupsByKey.set(viewGrp.key, viewGrp);
                                nextFiltered.push(viewGrp);
                            }
                        } else {
                            nextFiltered.push(grp);
                        }
                    }
                    filteredGroups = nextFiltered;
                }
            } else if (!rawTrim) {
                filteredGroups = allSingleGroups.filter(grp =>
                    itemMatchesActiveFilter(grp.items[0], activeCategory, activeSubCategory)
                );
            } else {
                const catSingles = allSingleGroups.filter(grp =>
                    itemMatchesActiveFilter(grp.items[0], activeCategory, activeSubCategory)
                );
                filteredGroups = searchGroupCollection(catSingles, rawTrim, scoreByKey);
            }
        } else {
            let baseGroups = [];
            if (!rawTrim) {
                baseGroups = allGroups;
            } else if (exactHitItem && !isQuotableItem(exactHitItem)) {
                baseGroups = [];
            } else if (isExactSkuHit && singleBySkuMap.has(exactSkuUpper)) {
                baseGroups = [singleBySkuMap.get(exactSkuUpper)];
            } else if (isExactSkuHit && groupsByKey.has(exactHitItem._groupKey)) {
                baseGroups = [groupsByKey.get(exactHitItem._groupKey)];
            } else {
                baseGroups = searchGroupCollection(allGroups, rawTrim, scoreByKey);
            }

            if (!isExactSkuHit) {
                const nextFiltered = [];
                if (activeCategory === 'STOCK') {
                    // Desglose por pieza individual con existencia física en Bodega/Piso (sin contar LPPT)
                    for (let i = 0; i < baseGroups.length; i++) {
                        const grp = baseGroups[i];
                        let matchedItems = grp.items.filter(it => itemMatchesActiveFilter(it, 'STOCK', activeSubCategory));
                        if (matchedItems.length > 0) {
                            matchedItems = filterItemsMatchingSearchIfSubset(matchedItems, rawTrim);
                            const parentScore = scoreByKey.get(grp.key);
                            for (let j = 0; j < matchedItems.length; j++) {
                                const pieceView = buildSinglePieceStockView(grp, matchedItems[j]);
                                if (pieceView) {
                                    if (parentScore) scoreByKey.set(pieceView.key, parentScore);
                                    nextFiltered.push(pieceView);
                                }
                            }
                        }
                    }
                } else {
                    for (let i = 0; i < baseGroups.length; i++) {
                        const grp = baseGroups[i];
                        let matchedItems = grp.items.filter(it => itemMatchesActiveFilter(it, activeCategory, activeSubCategory));
                        if (matchedItems.length > 0) {
                            if (rawTrim) {
                                matchedItems = filterItemsMatchingSearchIfSubset(matchedItems, rawTrim);
                            }
                            const viewGrp = buildFilteredGroupView(grp, matchedItems);
                            if (viewGrp) {
                                activeFilteredGroupsByKey.set(viewGrp.key, viewGrp);
                                nextFiltered.push(viewGrp);
                            }
                        }
                    }
                }
                filteredGroups = nextFiltered;
            } else {
                filteredGroups = baseGroups.slice();
            }
        }

        // En STOCK: mayor a menor cantidad física; en búsquedas: relevancia + orden comercial; en TODOS y CATEGORÍAS: foto arriba + jerarquía comercial + A-Z
        if (activeCategory === 'STOCK' && !isExactSkuHit) {
            if (rawTrim && scoreByKey.size > 0) {
                filteredGroups.sort((a, b) => {
                    const sa = scoreByKey.get(a.key) || { matched: 0, score: 0 };
                    const sb = scoreByKey.get(b.key) || { matched: 0, score: 0 };
                    const tierA = sa.score >= 12 ? 2 : 1;
                    const tierB = sb.score >= 12 ? 2 : 1;
                    return (sb.matched - sa.matched) ||
                        (tierB - tierA) ||
                        ((Number(b.totalStock) || 0) - (Number(a.totalStock) || 0)) ||
                        compareAlphaEs(a.displayTitle || a.title, b.displayTitle || b.title) ||
                        String(a.key || '').localeCompare(String(b.key || ''));
                });
            } else {
                filteredGroups.sort((a, b) =>
                    ((Number(b.totalStock) || 0) - (Number(a.totalStock) || 0)) ||
                    compareAlphaEs(a.displayTitle || a.title, b.displayTitle || b.title) ||
                    String(a.key || '').localeCompare(String(b.key || ''))
                );
            }
        } else if (rawTrim && !isExactSkuHit && scoreByKey.size > 0) {
            filteredGroups.sort((a, b) => {
                const sa = scoreByKey.get(a.key) || { matched: 0, score: 0 };
                const sb = scoreByKey.get(b.key) || { matched: 0, score: 0 };
                const tierA = sa.score >= 12 ? 2 : 1;
                const tierB = sb.score >= 12 ? 2 : 1;
                return (sb.matched - sa.matched) ||
                    (tierB - tierA) ||
                    compareCommercialGroupOrder(a, b);
            });
        } else {
            filteredGroups.sort(compareCommercialGroupOrder);
        }

        renderCategoryBar();

        const initialCap = getAdaptivePageSize();
        const minWanted = (typeof explicitMinCount === 'number' && explicitMinCount > 0)
            ? Math.max(initialCap, explicitMinCount)
            : initialCap;
        const targetInitial = preserveCount ? Math.max(minWanted, renderedCount) : minWanted;
        const container = document.getElementById('invListContainer');

        // Actualización in-place sin recargar fotos cuando la lista filtrada conserva los mismos SKUs
        if (preserveCount && container && filteredGroups.length > 0) {
            const nextCount = Math.min(filteredGroups.length, targetInitial);
            if (nextCount === lastRenderedCardKeys.length && nextCount > 0) {
                let sameKeys = true;
                for (let i = 0; i < nextCount; i++) {
                    if (String(filteredGroups[i].key || '') !== lastRenderedCardKeys[i]) {
                        sameKeys = false;
                        break;
                    }
                }
                if (sameKeys) {
                    const cards = container.children;
                    if (cards && cards.length === nextCount) {
                        for (let i = 0; i < nextCount; i++) {
                            const grp = filteredGroups[i];
                            const cardEl = cards[i];
                            const titleEl = cardEl.querySelector('[data-card-title]');
                            const subEl = cardEl.querySelector('[data-card-sub]');
                            const stockEl = cardEl.querySelector('[data-card-stock]');
                            if (grp.items.length > 1) {
                                const nextTitle = grp.displayTitle || grp.title || '';
                                if (titleEl && titleEl.textContent !== nextTitle) titleEl.textContent = nextTitle;
                                const nextSub = formatGroupBadgeLabel(grp);
                                if (subEl && subEl.textContent !== nextSub) subEl.textContent = nextSub;
                                if (stockEl) stockEl.remove();
                            } else {
                                const it = grp.items[0];
                                const nextTitle = grp.displayTitle || stripDimensionsFromProductText(it.n) || grp.title || it.s || '';
                                if (titleEl && titleEl.textContent !== nextTitle) titleEl.textContent = nextTitle;
                                const nextSub = it.s || '';
                                if (subEl && subEl.textContent !== nextSub) subEl.textContent = nextSub;
                                const ownPhysQty = getBodegaPisoStock(it);
                                if (activeCategory === 'STOCK' && ownPhysQty > 0) {
                                    const badgeTxt = ownPhysQty + ' pz';
                                    if (stockEl) {
                                        if (stockEl.textContent !== badgeTxt) stockEl.textContent = badgeTxt;
                                    } else {
                                        const metaEl = cardEl.querySelector('.inv-card-meta');
                                        if (metaEl) {
                                            const sp = document.createElement('span');
                                            sp.className = 'inv-card-stock';
                                            sp.setAttribute('data-card-stock', '1');
                                            sp.textContent = badgeTxt;
                                            metaEl.appendChild(sp);
                                        }
                                    }
                                } else if (stockEl) {
                                    stockEl.remove();
                                }
                            }
                        }
                        const moreWrap = document.getElementById('invLoadMoreWrap');
                        if (moreWrap) moreWrap.classList.toggle('hidden', renderedCount >= filteredGroups.length);
                        return;
                    }
                }
            }
        }

        renderedCount = 0;
        lastRenderedCardKeys = [];
        if (container) container.innerHTML = '';
        renderMoreItems(targetInitial);
    }

    let lastRenderedMainCat = null;
    let lastRenderedSubCat = null;
    let catStripListenersBound = false;

    function updateHorizontalStripFade(stripEl) {
        if (!stripEl || stripEl.style.display === 'none') return;
        const maxScroll = stripEl.scrollWidth - stripEl.clientWidth;
        if (maxScroll <= 2) {
            stripEl.classList.remove('can-scroll-left', 'can-scroll-right');
            return;
        }
        stripEl.classList.toggle('can-scroll-left', stripEl.scrollLeft > 3);
        stripEl.classList.toggle('can-scroll-right', stripEl.scrollLeft < maxScroll - 3);
    }

    function syncActivePillInStrip(stripEl, prevScrollLeft, shouldCenterActive, animate) {
        if (!stripEl || stripEl.style.display === 'none') return;
        stripEl.scrollLeft = prevScrollLeft || 0;
        if (shouldCenterActive && stripEl.scrollWidth > stripEl.clientWidth + 2) {
            const activeBtn = stripEl.querySelector('.active');
            if (activeBtn) {
                const targetLeft = Math.max(
                    0,
                    Math.min(
                        stripEl.scrollWidth - stripEl.clientWidth,
                        activeBtn.offsetLeft - Math.round((stripEl.clientWidth - activeBtn.offsetWidth) / 2)
                    )
                );
                if (animate && typeof stripEl.scrollTo === 'function') {
                    stripEl.scrollTo({ left: targetLeft, behavior: 'smooth' });
                } else {
                    stripEl.scrollLeft = targetLeft;
                }
            }
        }
        updateHorizontalStripFade(stripEl);
        if (animate) {
            setTimeout(() => updateHorizontalStripFade(stripEl), 280);
        }
    }

    function attachDesktopStripScroll(stripEl) {
        if (!stripEl) return;
        stripEl.addEventListener('scroll', () => updateHorizontalStripFade(stripEl), { passive: true });
        stripEl.addEventListener('wheel', (ev) => {
            const maxScroll = stripEl.scrollWidth - stripEl.clientWidth;
            if (maxScroll <= 2) return;
            if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && ev.deltaY !== 0) {
                const prev = stripEl.scrollLeft;
                const next = Math.max(0, Math.min(maxScroll, prev + ev.deltaY));
                if (Math.abs(next - prev) >= 1) {
                    ev.preventDefault();
                    stripEl.scrollLeft = next;
                    updateHorizontalStripFade(stripEl);
                }
            }
        }, { passive: false });

        let isDown = false;
        let startX = 0;
        let startScroll = 0;
        let dragged = false;
        stripEl.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0 || stripEl.scrollWidth <= stripEl.clientWidth + 2) return;
            isDown = true;
            dragged = false;
            startX = ev.clientX;
            startScroll = stripEl.scrollLeft;
        });
        window.addEventListener('mousemove', (ev) => {
            if (!isDown) return;
            const dx = ev.clientX - startX;
            if (Math.abs(dx) > 5) {
                dragged = true;
                stripEl.classList.add('is-dragging');
            }
            if (dragged) {
                stripEl.scrollLeft = startScroll - dx;
                updateHorizontalStripFade(stripEl);
            }
        });
        window.addEventListener('mouseup', () => {
            if (!isDown) return;
            isDown = false;
            stripEl.classList.remove('is-dragging');
            if (dragged) {
                setTimeout(() => { dragged = false; }, 0);
            }
        });
        stripEl.addEventListener('click', (ev) => {
            if (dragged) {
                ev.preventDefault();
                ev.stopPropagation();
                dragged = false;
            }
        }, true);
    }

    function bindCategoryStripScrollListeners(bar, subBar) {
        if (catStripListenersBound) return;
        catStripListenersBound = true;
        attachDesktopStripScroll(bar);
        attachDesktopStripScroll(subBar);
        window.addEventListener('resize', () => {
            updateHorizontalStripFade(document.getElementById('invCategoryBar'));
            updateHorizontalStripFade(document.getElementById('invSubCategoryBar'));
        }, { passive: true });
    }

    function renderCategoryBar() {
        const bar = document.getElementById('invCategoryBar');
        if (!bar) return;
        const subBar = document.getElementById('invSubCategoryBar');
        bindCategoryStripScrollListeners(bar, subBar);

        const prevMainScroll = bar.scrollLeft || 0;
        const prevSubScroll = subBar ? (subBar.scrollLeft || 0) : 0;
        const mainCatChanged = activeCategory !== lastRenderedMainCat;
        const animateMain = mainCatChanged && lastRenderedMainCat !== null;
        const subCatKey = activeCategory + '::' + activeSubCategory;
        const subCatChanged = subCatKey !== lastRenderedSubCat;
        const animateSub = subCatChanged && !mainCatChanged && lastRenderedSubCat !== null;
        lastRenderedMainCat = activeCategory;
        lastRenderedSubCat = subCatKey;

        const mainCounts = new Map();
        const subCounts = new Map();
        const availCounts = new Map();
        const lpptRangeCounts = new Map();
        const stockMainCounts = new Map();
        let stockPieceCount = 0;
        let lpptGroupCount = 0;

        for (let i = 0; i < allGroups.length; i++) {
            const g = allGroups[i];
            if (g.avails) {
                g.avails.forEach(a => {
                    if (a && a !== 'STOCK' && a !== 'LPPT') availCounts.set(a, (availCounts.get(a) || 0) + 1);
                });
            }
            if ((Number(g.lpptStock) || 0) >= 1) {
                lpptGroupCount++;
            }
            if (Array.isArray(g.items)) {
                const groupedCatsInGroup = new Set();
                for (let j = 0; j < g.items.length; j++) {
                    const it = g.items[j];
                    const isGroupedSub = !!(it._cat && GROUPED_SUBCATEGORIES.has(it._cat));
                    if (isGroupedSub) {
                        groupedCatsInGroup.add(it._cat);
                    } else {
                        if (it._main) {
                            mainCounts.set(it._main, (mainCounts.get(it._main) || 0) + 1);
                        }
                        if (SUBCATEGORIES_BY_MAIN[activeCategory] && it._cat && MAIN_OF_SUB[it._cat] === activeCategory) {
                            subCounts.set(it._cat, (subCounts.get(it._cat) || 0) + 1);
                        }
                    }
                    if (getBodegaPisoStock(it) >= 1) {
                        stockPieceCount++;
                        if (it._main) {
                            stockMainCounts.set(it._main, (stockMainCounts.get(it._main) || 0) + 1);
                        }
                    }
                }
                if (groupedCatsInGroup.size > 0) {
                    const countedMains = new Set();
                    groupedCatsInGroup.forEach(catName => {
                        const mCat = MAIN_OF_SUB[catName];
                        if (mCat && !countedMains.has(mCat)) {
                            countedMains.add(mCat);
                            mainCounts.set(mCat, (mainCounts.get(mCat) || 0) + 1);
                        }
                        if (SUBCATEGORIES_BY_MAIN[activeCategory] && mCat === activeCategory) {
                            subCounts.set(catName, (subCounts.get(catName) || 0) + 1);
                        }
                    });
                }
            }
            if (activeCategory === 'LPPT' && g.lpptBuckets) {
                g.lpptBuckets.forEach(b => {
                    if (b) lpptRangeCounts.set(b, (lpptRangeCounts.get(b) || 0) + 1);
                });
            }
        }
        availCounts.set('STOCK', stockPieceCount);
        availCounts.set('LPPT', lpptGroupCount);

        const pill = (cls, attr, val, label, isActive) =>
            '<button type="button" class="' + cls + (isActive ? ' active' : '') + '" ' + attr + '="' + escapeHtml(val) + '">' + escapeHtml(label) + '</button>';

        const pills = [
            pill('inv-cat-pill', 'data-cat', 'ALL', 'TODOS (' + allGroups.length + ')', activeCategory === 'ALL')
        ];
        MAIN_CATEGORY_ORDER.forEach(c => {
            const cnt = mainCounts.get(c) || 0;
            pills.push(pill('inv-cat-pill', 'data-cat', c, c + ' (' + cnt + ')', activeCategory === c));
        });
        AVAILABILITY_FILTERS.forEach(af => {
            const cnt = availCounts.get(af.key) || 0;
            pills.push(pill('inv-cat-pill stock-pill', 'data-cat', af.key, af.label + ' (' + cnt + ')', activeCategory === af.key));
        });
        bar.innerHTML = pills.join('');
        bar.querySelectorAll('.inv-cat-pill[data-cat]').forEach(btn => {
            btn.onclick = function () { setInvCategory(btn.getAttribute('data-cat')); };
        });
        syncActivePillInStrip(bar, prevMainScroll, mainCatChanged, animateMain);

        if (!subBar) return;

        if (SUBCATEGORIES_BY_MAIN[activeCategory]) {
            const subs = SUBCATEGORIES_BY_MAIN[activeCategory].slice();
            if (activeCategory === 'ESPEJOS Y ACCESORIOS' && (subCounts.get('OTROS') || 0) > 0 && subs.indexOf('OTROS') === -1) {
                subs.push('OTROS');
            }
            const subPills = [
                pill('inv-cat-pill inv-sub-pill', 'data-sub', 'ALL', 'TODO ' + activeCategory + ' (' + (mainCounts.get(activeCategory) || 0) + ')', activeSubCategory === 'ALL')
            ];
            subs.forEach(c => {
                subPills.push(pill('inv-cat-pill inv-sub-pill', 'data-sub', c, c + ' (' + (subCounts.get(c) || 0) + ')', activeSubCategory === c));
            });
            subBar.innerHTML = subPills.join('');
            subBar.style.display = '';
            subBar.querySelectorAll('.inv-sub-pill[data-sub]').forEach(btn => {
                btn.onclick = function () { setInvSubCategory(btn.getAttribute('data-sub')); };
            });
            syncActivePillInStrip(subBar, mainCatChanged ? 0 : prevSubScroll, subCatChanged, animateSub);
            return;
        }

        if (activeCategory === 'STOCK') {
            const subPills = [
                pill('inv-cat-pill inv-sub-pill', 'data-sub', 'ALL', 'TODO STOCK (' + stockPieceCount + ')', activeSubCategory === 'ALL')
            ];
            MAIN_CATEGORY_ORDER.forEach(c => {
                const cnt = stockMainCounts.get(c) || 0;
                subPills.push(pill('inv-cat-pill inv-sub-pill', 'data-sub', c, c + ' (' + cnt + ')', activeSubCategory === c));
            });
            subBar.innerHTML = subPills.join('');
            subBar.style.display = '';
            subBar.querySelectorAll('.inv-sub-pill[data-sub]').forEach(btn => {
                btn.onclick = function () { setInvSubCategory(btn.getAttribute('data-sub')); };
            });
            syncActivePillInStrip(subBar, mainCatChanged ? 0 : prevSubScroll, subCatChanged, animateSub);
            return;
        }

        if (activeCategory === 'LPPT') {
            const lpptTotal = availCounts.get('LPPT') || 0;
            const subPills = [
                pill('inv-cat-pill inv-sub-pill', 'data-sub', 'ALL', 'TODO LPPT (' + lpptTotal + ')', activeSubCategory === 'ALL')
            ];
            LPPT_DAY_RANGES.forEach(r => {
                const cnt = lpptRangeCounts.get(r.key) || 0;
                subPills.push(pill('inv-cat-pill inv-sub-pill', 'data-sub', r.key, r.label + ' (' + cnt + ')', activeSubCategory === r.key));
            });
            subBar.innerHTML = subPills.join('');
            subBar.style.display = '';
            subBar.querySelectorAll('.inv-sub-pill[data-sub]').forEach(btn => {
                btn.onclick = function () { setInvSubCategory(btn.getAttribute('data-sub')); };
            });
            syncActivePillInStrip(subBar, mainCatChanged ? 0 : prevSubScroll, subCatChanged, animateSub);
            return;
        }

        subBar.innerHTML = '';
        subBar.style.display = 'none';
        subBar.classList.remove('can-scroll-left', 'can-scroll-right');
    }

    window.setInvCategory = function (cat) {
        const next = cat || 'ALL';
        activeSubCategory = 'ALL';
        activeCategory = next;
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
        if (activeCategory !== 'ALL') notifyInvBackStatePush('inv_category');
    };

    window.setInvSubCategory = function (sub) {
        activeSubCategory = sub || 'ALL';
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
        if (activeSubCategory !== 'ALL') notifyInvBackStatePush('inv_subcategory');
    };

    function buildCardCartControlHtml(skuKey) {
        if (typeof isGuestSession === 'function' && isGuestSession()) {
            return '';
        }
        const key = String(skuKey || '').trim().toUpperCase();
        const inCartQty = cart[key] ? (Number(cart[key].qty) || 0) : 0;
        if (inCartQty > 0) {
            return '<div class="cart-ctrl-wrap" data-sku-ctrl="' + escapeHtml(key) + '">' +
                '<div class="cart-qty-pill">' +
                    '<button type="button" class="cart-qty-step minus" data-cart-act="sub" title="Quitar 1 de Cotización">−</button>' +
                    '<span class="cart-qty-num">' + inCartQty + '</span>' +
                    '<button type="button" class="cart-qty-step plus" data-cart-act="add" title="Agregar 1 más a Cotización">+</button>' +
                '</div>' +
            '</div>';
        }
        return '<div class="cart-ctrl-wrap" data-sku-ctrl="' + escapeHtml(key) + '">' +
            '<button type="button" title="Agregar a Cotización" data-cart-act="add" class="cart-plus-btn">+</button>' +
        '</div>';
    }

    function bindCardCartControlEvents(ctrlWrapEl, skuRaw) {
        if (!ctrlWrapEl) return;
        ctrlWrapEl.onclick = function (ev) {
            ev.stopPropagation();
            if (typeof isGuestSession === 'function' && isGuestSession()) return;
            const actBtn = ev.target && ev.target.closest ? ev.target.closest('[data-cart-act]') : null;
            if (!actBtn) return;
            const act = actBtn.getAttribute('data-cart-act');
            addToCart(skuRaw, act === 'sub' ? -1 : 1);
        };
    }

    window.renderMoreItems = function (batchSize) {
        const container = document.getElementById('invListContainer');
        const moreWrap = document.getElementById('invLoadMoreWrap');
        if (!container) return;

        const maxAllowed = filteredGroups.length;

        if (maxAllowed === 0) {
            lastRenderedCardKeys = [];
            if (isMainCoverActive) {
                container.innerHTML =
                    '<div class="rounded-xl border px-4 py-6 text-center text-[11px] font-semibold" ' +
                    'style="grid-column: 1 / -1; border-color:#E6E1D8; color:#1A1816; background:#FFFFFF;">' +
                    'Sin productos disponibles.' +
                    '</div>';
            } else {
                const inp = document.getElementById('invSearchInput');
                const curQ = cleanStr(inp && inp.value);
                const filterLbl = formatActiveFilterLabel();
                container.innerHTML =
                    '<div class="rounded-xl border px-4 py-6 text-center text-[11px] font-semibold space-y-1.5" ' +
                    'style="grid-column: 1 / -1; border-color:#E6E1D8; color:#1A1816; background:#FFFFFF;">' +
                    '<div>Sin resultados' +
                        (curQ ? (' para <strong>“' + escapeHtml(curQ) + '”</strong>') : '') +
                        (activeCategory !== 'ALL' ? (' en <strong>' + escapeHtml(filterLbl) + '</strong>') : '') +
                    '.</div>' +
                    '</div>';
            }
            if (moreWrap) moreWrap.classList.add('hidden');
            return;
        }

        const step = (typeof batchSize === 'number' && batchSize > 0) ? batchSize : getAdaptivePageSize();
        const nextEnd = Math.min(renderedCount + step, maxAllowed);
        const eagerCount = (typeof window !== 'undefined' && window.innerWidth >= 768) ? 6 : 4;
        const frag = document.createDocumentFragment();

        for (let i = renderedCount; i < nextEnd; i++) {
            const grp = filteredGroups[i];
            const row = document.createElement('div');
            row.className = 'inv-row';
            row.setAttribute('data-card-key', String(grp.key || ''));
            lastRenderedCardKeys.push(String(grp.key || ''));

            if (grp.items.length > 1) {
                const visualCoverUrl = getGroupVisualCoverPhotoUrl(grp.key);
                row.onclick = function () {
                    openGroupModal(grp.key);
                };
                row.innerHTML =
                    '<div class="inv-card-top-right">' +
                        '<span class="inv-card-variant-badge" data-card-sub="1">' + escapeHtml(formatGroupBadgeLabel(grp)) + '</span>' +
                    '</div>' +
                    buildThumbHtml(visualCoverUrl ? { f: visualCoverUrl } : firstPhotoItem(grp.items), { card: true, eager: i < eagerCount, boxRatio: 1 }) +
                    '<div class="inv-card-body">' +
                        '<div class="inv-card-title" data-card-title="1">' + escapeHtml(grp.displayTitle || grp.title) + '</div>' +
                    '</div>';
            } else {
                const it = grp.items[0];
                const skuKey = String(it.s || '').toUpperCase();
                row.setAttribute('data-card-sku', skuKey);
                row.setAttribute('data-sku', String(it.s || ''));
                const ownPhysQty = getBodegaPisoStock(it);
                const stockBadgeHtml = (activeCategory === 'STOCK' && ownPhysQty > 0)
                    ? '<span class="inv-card-stock" data-card-stock="1">' + ownPhysQty + ' pz</span>'
                    : '';
                row.onclick = function () {
                    openProductDetail(it.s, false);
                };
                row.innerHTML =
                    '<div class="inv-card-top-right">' + buildCardCartControlHtml(skuKey) + '</div>' +
                    buildThumbHtml(it, { card: true, eager: i < eagerCount, boxRatio: 1 }) +
                    '<div class="inv-card-body">' +
                        '<div class="inv-card-title" data-card-title="1">' + escapeHtml(grp.displayTitle || stripDimensionsFromProductText(it.n) || grp.title || it.s) + '</div>' +
                        '<div class="inv-card-meta"><span data-card-sub="1">' + escapeHtml(it.s) + '</span>' + stockBadgeHtml + '</div>' +
                    '</div>';

                const ctrlWrap = row.querySelector('[data-sku-ctrl]');
                bindCardCartControlEvents(ctrlWrap, it.s);
            }

            frag.appendChild(row);
        }

        container.appendChild(frag);
        renderedCount = nextEnd;

        if (window.CreataGuard && typeof window.CreataGuard.protectImages === 'function') {
            window.CreataGuard.protectImages(container);
        }

        if (moreWrap) {
            if (renderedCount < maxAllowed) moreWrap.classList.remove('hidden');
            else moreWrap.classList.add('hidden');
        }
    };

    let searchDebounceTimer = null;
    window.clearInvSearch = function () {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.value = '';
        }
        _invPrevSearchNonEmpty = false;
        applyFilter('');
        scheduleSaveInvWorkspaceCheckpoint();
    };
