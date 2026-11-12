// CREATA MUEBLES — RECORTE INTELIGENTE, COMPRESIÓN Y PIEZAS MODULARES
(function (global) {
    'use strict';
    function parseCurrencyValue(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isFinite(val) ? val : 0;
        const clean = val.toString().replace(/[^0-9.-]/g, '');
        const n = parseFloat(clean);
        return isNaN(n) ? 0 : n;
    }
    function formatCurrencyMXN(num) {
        const val = isFinite(num) ? Number(num) : 0;
        return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function detectProductPieces(product, skuDb, knownCatalog) {
        if (!product) return { isMultiPiece: false, count: 1, source: 'none', modules: [] };
        if (Array.isArray(product.sala_modules) && product.sala_modules.length > 1) {
            return {
                isMultiPiece: true,
                count: product.sala_modules.length,
                source: 'saved',
                modules: JSON.parse(JSON.stringify(product.sala_modules))
            };
        }
        const pSku = (product.sku || product.id || '').toUpperCase();
        const pModel = (product.model_name || '').toUpperCase();
        const cat = (product.category || '').toUpperCase();
        const mat = (product.materials || '').toUpperCase();
        const widthStr = (product.width || '').toString();
        const pkgStr = (product.packages || '').toString();
        if (knownCatalog && typeof knownCatalog === 'object') {
            const matchedKey = Object.keys(knownCatalog).find((k) => {
                const aliasMap = {
                    'SALA-CARRARA': 'CARRARA', 'ARMCAR': 'CARRARA',
                    'SALA-DONATI': 'DONATI', 'ARMDON': 'DONATI',
                    'SALA-DYLAN': 'DYLAN', 'ARMDYL': 'DYLAN',
                    'SALA-LUGANO': 'LUGANO', 'ARMLUG': 'LUGANO',
                    'SALA-MARENO': 'MARENO', 'ARMMAR': 'MARENO',
                    'SALA-MATERA': 'MATERA', 'ARMMAT': 'MATERA',
                    'SALA-MONACO': 'MONACO', 'ARMMONACO': 'MONACO',
                    'SALA-MONET': 'MONET', 'ARMMON': 'MONET',
                    'SALA-SHELBY': 'SHELBY', 'ARMSHE': 'SHELBY'
                };
                const modelAlias = aliasMap[k] || k;
                return pSku.includes(k) || pModel.includes(modelAlias);
            });
            if (matchedKey) {
                const mods = JSON.parse(JSON.stringify(knownCatalog[matchedKey])).map((m) => ({
                    ...m,
                    qty: m.qty || 1,
                    checked: m.checked !== false
                }));
                return {
                    isMultiPiece: mods.length > 1,
                    count: mods.length,
                    source: 'known_catalog',
                    modules: mods
                };
            }
        }
        if (skuDb && typeof skuDb === 'object') {
            const basePrefix = pSku.replace(/[^A-Z0-9]/g, '').slice(0, 6);
            const modelRoot = pModel.replace(/^(SALA|SOFA|SOFÁ|COMEDOR|MESA|RECÁMARA|RECAMARA)\s+/i, '').trim();
            if (basePrefix.length >= 5 || modelRoot.length >= 4) {
                const siblingMatches = [];
                const seenSkus = new Set();
                Object.keys(skuDb).forEach((k) => {
                    const item = skuDb[k];
                    if (!item) return;
                    const itemSku = (item.sku || k).toUpperCase();
                    const itemModel = (item.model_name || '').toUpperCase();
                    const cleanSku = itemSku.replace(/[^A-Z0-9]/g, '');
                    const sameRoot = (basePrefix.length >= 6 && cleanSku.startsWith(basePrefix)) ||
                                     (modelRoot.length >= 4 && itemModel.includes(modelRoot));
                    const isComponentToken = /(1P|2P|3P|DER|IZQ|CHAISE|CEN|LAT|TAB|OTT|MOD|SILLA|BURO|BURÓ|CABECERA|BASE|BANCA)/i.test(itemSku + ' ' + itemModel);
                    if (sameRoot && isComponentToken && !seenSkus.has(itemSku)) {
                        seenSkus.add(itemSku);
                        siblingMatches.push({
                            name: item.model_name || itemSku,
                            code: itemSku.slice(-5),
                            sku: itemSku,
                            price: parseCurrencyValue(item.price),
                            width: item.width || '',
                            depth: item.depth || '',
                            height: item.height || '',
                            qty: 1,
                            checked: true,
                            photoSlot: `view${Math.min(4, siblingMatches.length + 1)}`
                        });
                    }
                });
                if (siblingMatches.length > 1) {
                    return {
                        isMultiPiece: true,
                        count: siblingMatches.length,
                        source: 'sku_database',
                        modules: siblingMatches
                    };
                }
            }
        }
        const dimParts = widthStr.split('/').map((s) => s.trim()).filter(Boolean);
        const pkgMatch = pkgStr.match(/(\d+)/);
        const pkgNum = pkgMatch ? parseInt(pkgMatch[1], 10) : 1;
        const textHintMulti = /(\+|CHAISE|LOVE\s*SEAT|ESQUINERA|MODULAR|MÓDULO|SILLAS|BUR[ÓO]S|PIEZA)/i.test(pModel + ' ' + mat);
        const isLikelyMulti = dimParts.length > 1 || pkgNum > 1 || textHintMulti || cat.includes('SALA') || cat.includes('COMEDOR');
        const totalPrice = parseCurrencyValue(product.price);
        if (dimParts.length > 1) {
            const count = dimParts.length;
            const splitPrice = totalPrice > 0 ? Math.round((totalPrice / count) * 100) / 100 : 0;
            const mods = dimParts.map((dimVal, idx) => ({
                name: cat.includes('SALA')
                    ? (count === 2 ? (idx === 0 ? 'Sofá / Módulo Principal' : 'Love Seat / Módulo 2') : `Módulo ${idx + 1}`)
                    : `Pieza ${idx + 1}`,
                code: `PZA-${idx + 1}`,
                sku: pSku ? `${pSku}-P${idx + 1}` : `MOD-${idx + 1}`,
                price: splitPrice,
                width: dimVal.includes('cm') ? dimVal : `${dimVal} cm`,
                depth: product.depth || '',
                height: product.height || '',
                qty: 1,
                checked: true,
                photoSlot: `view${Math.min(4, idx + 1)}`
            }));
            return { isMultiPiece: true, count: mods.length, source: 'dimensions', modules: mods };
        }
        if (isLikelyMulti) {
            const count = Math.max(2, Math.min(4, pkgNum > 1 ? pkgNum : 2));
            const splitPrice = totalPrice > 0 ? Math.round((totalPrice / count) * 100) / 100 : 0;
            const mods = [];
            for (let i = 0; i < count; i++) {
                let label = `Pieza ${i + 1}`;
                let code = `PZA-${i + 1}`;
                if (cat.includes('SALA')) {
                    label = i === 0 ? 'Módulo Derecho / 3P' : (i === 1 ? 'Módulo Izquierdo / 2P' : `Módulo ${i + 1}`);
                    code = i === 0 ? 'MOD-DER' : (i === 1 ? 'MOD-IZQ' : `MOD-${i + 1}`);
                } else if (cat.includes('COMEDOR')) {
                    label = i === 0 ? 'Mesa de Comedor' : 'Juego de Sillas';
                    code = i === 0 ? 'MESA' : 'SILLAS';
                } else if (cat.includes('REC')) {
                    label = i === 0 ? 'Cama / Cabecera' : `Buró / Complemento ${i}`;
                    code = i === 0 ? 'CAMA' : `PZA-${i + 1}`;
                }
                mods.push({
                    name: label,
                    code: code,
                    sku: pSku ? `${pSku}-${code}` : code,
                    price: splitPrice,
                    width: '',
                    depth: '',
                    height: '',
                    qty: 1,
                    checked: true,
                    photoSlot: `view${Math.min(4, i + 1)}`
                });
            }
            return { isMultiPiece: true, count: mods.length, source: 'structural', modules: mods };
        }
        return {
            isMultiPiece: false,
            count: 1,
            source: 'single',
            modules: [{
                name: product.model_name || 'Pieza Única',
                code: 'UNICA',
                sku: pSku || 'PIEZA-1',
                price: totalPrice,
                width: product.width || '',
                depth: product.depth || '',
                height: product.height || '',
                qty: 1,
                checked: true,
                photoSlot: 'view1'
            }]
        };
    }
    let __imglyRemoveBgFn = null;
    async function loadImglyBackgroundRemover() {
        if (__imglyRemoveBgFn) return __imglyRemoveBgFn;
        const cdnUrls = [
            'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm',
            'https://esm.sh/@imgly/background-removal@1.5.5'
        ];
        for (let i = 0; i < cdnUrls.length; i++) {
            try {
                const mod = await import(cdnUrls[i]);
                const fn = mod.removeBackground || mod.default || null;
                if (typeof fn === 'function') {
                    __imglyRemoveBgFn = fn;
                    return __imglyRemoveBgFn;
                }
            } catch (err) {
                console.warn('[Creata BG AI CDN Attempt]', cdnUrls[i], err);
            }
        }
        return null;
    }

    function decontaminateCutoutCanvas(canvas) {
        const w = canvas.width;
        const h = canvas.height;
        if (!w || !h) return canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPx = w * h;
        const solidCore = new Uint8Array(totalPx);
        for (let p = 0; p < totalPx; p++) {
            const a = data[p * 4 + 3];
            if (a < 26) {
                data[p * 4 + 3] = 0;
            } else if (a > 215) {
                solidCore[p] = 1;
            }
        }
        // Erode solidCore by 2px to isolate semi-transparent boundary rim
        const eroded = new Uint8Array(totalPx);
        for (let y = 2; y < h - 2; y++) {
            const rOff = y * w;
            for (let x = 2; x < w - 2; x++) {
                const p = rOff + x;
                if (
                    solidCore[p] &&
                    solidCore[p - 1] && solidCore[p + 1] &&
                    solidCore[p - w] && solidCore[p + w] &&
                    solidCore[p - 2] && solidCore[p + 2] &&
                    solidCore[p - w * 2] && solidCore[p + w * 2]
                ) {
                    eroded[p] = 1;
                }
            }
        }
        for (let p = 0; p < totalPx; p++) {
            const idx = p * 4;
            const a = data[idx + 3];
            if (a > 0 && !eroded[p]) {
                const aNorm = Math.max(0.18, Math.min(1, a / 255));
                const invWhite = (1 - aNorm) * 252;
                data[idx] = Math.max(0, Math.min(255, Math.round((data[idx] - invWhite) / aNorm)));
                data[idx + 1] = Math.max(0, Math.min(255, Math.round((data[idx + 1] - invWhite) / aNorm)));
                data[idx + 2] = Math.max(0, Math.min(255, Math.round((data[idx + 2] - invWhite) / aNorm)));
                data[idx + 3] = Math.max(0, Math.min(255, Math.round((a - 14) * 1.06)));
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    function createPaddedBlobCanvas(srcImg, pad = 36, maxDim = 1200) {
        const origW = srcImg.naturalWidth || srcImg.width;
        const origH = srcImg.naturalHeight || srcImg.height;
        const scale = Math.min(1, maxDim / Math.max(1, origW, origH));
        const w = Math.max(2, Math.round(origW * scale));
        const h = Math.max(2, Math.round(origH * scale));
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tCtx = tmp.getContext('2d', { willReadFrequently: true });
        tCtx.drawImage(srcImg, 0, 0, w, h);
        const d = tCtx.getImageData(0, 0, w, h).data;
        let transCount = 0;
        const step = 16;
        for (let i = 3; i < d.length; i += step) {
            if (d[i] < 25) transCount++;
        }
        const transRatio = transCount / Math.max(1, Math.floor((w * h) / 4));
        if (transRatio > 0.05) {
            return { alreadyTransparent: true, canvas: tmp, pad: 0, innerW: w, innerH: h };
        }
        const corners = [
            0,
            (w - 1) * 4,
            ((h - 1) * w) * 4,
            ((h - 1) * w + (w - 1)) * 4
        ];
        const rs = corners.map((c) => d[c]).sort((a, b) => a - b);
        const gs = corners.map((c) => d[c + 1]).sort((a, b) => a - b);
        const bs = corners.map((c) => d[c + 2]).sort((a, b) => a - b);
        const bgR = Math.round((rs[1] + rs[2]) / 2);
        const bgG = Math.round((gs[1] + gs[2]) / 2);
        const bgB = Math.round((bs[1] + bs[2]) / 2);

        const padded = document.createElement('canvas');
        padded.width = w + pad * 2;
        padded.height = h + pad * 2;
        const pCtx = padded.getContext('2d');
        pCtx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
        pCtx.fillRect(0, 0, padded.width, padded.height);
        pCtx.drawImage(tmp, pad, pad);
        return { alreadyTransparent: false, canvas: padded, rawCanvas: tmp, pad, innerW: w, innerH: h };
    }

    function analyzeAndStripBackgroundCanvas(srcImg, maxWorkDim = 1000) {
        const origW = srcImg.naturalWidth || srcImg.width;
        const origH = srcImg.naturalHeight || srcImg.height;
        if (!origW || !origH) return null;
        const wScale = Math.min(1, maxWorkDim / Math.max(origW, origH));
        const w = Math.max(2, Math.round(origW * wScale));
        const h = Math.max(2, Math.round(origH * wScale));
        const workCanvas = document.createElement('canvas');
        workCanvas.width = w;
        workCanvas.height = h;
        const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(srcImg, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPx = w * h;
        let transparentCount = 0;
        for (let i = 3; i < data.length; i += 16) {
            if (data[i] < 25) transparentCount++;
        }
        const approxTransRatio = transparentCount / Math.max(1, Math.floor(totalPx / 4));
        if (approxTransRatio > 0.04) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: true, complexBg: false };
        }
        const borderSamples = [];
        const stepX = Math.max(1, Math.floor(w / 60));
        const stepY = Math.max(1, Math.floor(h / 60));
        const margin = Math.max(1, Math.min(4, Math.floor(Math.min(w, h) * 0.015)));
        const pushPx = (px, py) => {
            const idx = (py * w + px) * 4;
            if (data[idx + 3] > 200) {
                borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
        };
        for (let x = 0; x < w; x += stepX) {
            pushPx(x, margin);
            pushPx(x, Math.max(0, h - 1 - margin));
        }
        for (let y = 0; y < h; y += stepY) {
            pushPx(margin, y);
            pushPx(Math.max(0, w - 1 - margin), y);
        }
        if (borderSamples.length < 8) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: false };
        }
        let sumR = 0, sumG = 0, sumB = 0;
        borderSamples.forEach((s) => { sumR += s[0]; sumG += s[1]; sumB += s[2]; });
        const meanR = sumR / borderSamples.length;
        const meanG = sumG / borderSamples.length;
        const meanB = sumB / borderSamples.length;
        let varSum = 0;
        borderSamples.forEach((s) => {
            const dr = s[0] - meanR, dg = s[1] - meanG, db = s[2] - meanB;
            varSum += (dr * dr + dg * dg + db * db) / 3;
        });
        const borderStdDev = Math.sqrt(varSum / borderSamples.length);
        const isComplexScene = borderStdDev > 30;
        const lum = new Float32Array(totalPx);
        for (let i = 0, p = 0; p < totalPx; p++, i += 4) {
            lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const edgeGrad = new Float32Array(totalPx);
        for (let y = 1; y < h - 1; y++) {
            const rowOff = y * w;
            for (let x = 1; x < w - 1; x++) {
                const p = rowOff + x;
                const gx = Math.abs(lum[p + 1] - lum[p - 1]);
                const gy = Math.abs(lum[p + w] - lum[p - w]);
                edgeGrad[p] = gx + gy;
            }
        }
        const bgMask = new Uint8Array(totalPx);
        const visited = new Uint8Array(totalPx);
        const queue = new Int32Array(totalPx);
        let qHead = 0, qTail = 0;
        // Strict tolerances so white/ivory upholstery is never eaten by offline fallback
        const globalTolSq = isComplexScene ? (20 * 20) : (26 * 26);
        const stepTolSq = isComplexScene ? (7 * 7) : (9 * 9);
        const edgeBarrier = isComplexScene ? 8 : 10;
        const colorDistSqMean = (idx4) => {
            const dr = data[idx4] - meanR;
            const dg = data[idx4 + 1] - meanG;
            const db = data[idx4 + 2] - meanB;
            return dr * dr + dg * dg + db * db;
        };
        const trySeed = (x, y) => {
            const p = y * w + x;
            if (visited[p]) return;
            const idx4 = p * 4;
            const isPureEdgeWhite = data[idx4] > 248 && data[idx4 + 1] > 248 && data[idx4 + 2] > 248;
            if (isPureEdgeWhite || colorDistSqMean(idx4) <= globalTolSq) {
                visited[p] = 1;
                bgMask[p] = 1;
                queue[qTail++] = p;
            }
        };
        for (let x = 0; x < w; x++) {
            trySeed(x, 0);
            trySeed(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
            trySeed(0, y);
            trySeed(w - 1, y);
        }
        const dirsX = [-1, 1, 0, 0, -1, 1, -1, 1];
        const dirsY = [0, 0, -1, 1, -1, -1, 1, 1];
        while (qHead < qTail) {
            const curr = queue[qHead++];
            const cx = curr % w;
            const cy = (curr - cx) / w;
            const cIdx4 = curr * 4;
            const cr = data[cIdx4], cg = data[cIdx4 + 1], cb = data[cIdx4 + 2];
            for (let d = 0; d < 8; d++) {
                const nx = cx + dirsX[d];
                const ny = cy + dirsY[d];
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const np = ny * w + nx;
                if (visited[np]) continue;
                visited[np] = 1;
                if (edgeGrad[np] > edgeBarrier) continue;
                const nIdx4 = np * 4;
                const nr = data[nIdx4], ng = data[nIdx4 + 1], nb = data[nIdx4 + 2];
                const sdr = nr - cr, sdg = ng - cg, sdb = nb - cb;
                const stepD = sdr * sdr + sdg * sdg + sdb * sdb;
                if (stepD > stepTolSq) continue;
                if (colorDistSqMean(nIdx4) > globalTolSq * 1.15) continue;
                bgMask[np] = 1;
                queue[qTail++] = np;
            }
        }
        const removedRatio = qTail / totalPx;
        if (removedRatio < 0.03 || removedRatio > 0.94) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: true };
        }
        const alphaOut = new Uint8Array(totalPx);
        for (let p = 0; p < totalPx; p++) {
            alphaOut[p] = bgMask[p] ? 0 : data[p * 4 + 3];
        }
        for (let p = 0; p < totalPx; p++) {
            data[p * 4 + 3] = alphaOut[p];
        }
        ctx.putImageData(imgData, 0, 0);
        decontaminateCutoutCanvas(workCanvas);
        return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: isComplexScene };
    }

    function frameTransparentFurnitureCanvas(sourceCanvas, targetW = 1000, targetH = 750, quality = 0.92) {
        const sw = sourceCanvas.width;
        const sh = sourceCanvas.height;
        const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        const data = sCtx.getImageData(0, 0, sw, sh).data;
        let minX = sw, minY = sh, maxX = 0, maxY = 0;
        let solidCount = 0;
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                if (data[idx + 3] > 28) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    solidCount++;
                }
            }
        }
        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;
        const cropX = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? minX : 0;
        const cropY = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? minY : 0;
        const cropW = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? boxW : sw;
        const cropH = (solidCount > 30 && boxW >= 12 && boxH >= 12) ? boxH : sh;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetW;
        outCanvas.height = targetH;
        const outCtx = outCanvas.getContext('2d');
        outCtx.clearRect(0, 0, targetW, targetH);
        // Uniform optical studio proportions matching Matera, Mareno & Lexy
        const maxAllowedW = targetW * 0.88;
        const maxAllowedH = targetH * 0.82;
        const maxOpticalArea = targetW * targetH * 0.50;
        const areaScale = Math.sqrt(maxOpticalArea / Math.max(1, cropW * cropH));
        const scale = Math.min(maxAllowedW / cropW, maxAllowedH / cropH, areaScale);
        const drawW = Math.max(1, Math.round(cropW * scale));
        const drawH = Math.max(1, Math.round(cropH * scale));
        const drawX = Math.round((targetW - drawW) / 2);
        const drawY = Math.round((targetH - drawH) * 0.52);
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
        try {
            const webp = outCanvas.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return outCanvas.toDataURL('image/png');
    }

    function encodeOpaqueSwatchOrScene(img, maxDim = 800, quality = 0.90) {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(1, srcW, srcH));
        const outW = Math.max(1, Math.round(srcW * scale));
        const outH = Math.max(1, Math.round(srcH * scale));
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        try {
            const webp = c.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return c.toDataURL('image/png');
    }

    function loadImageElementFromAnySource(src) {
        return new Promise((resolve) => {
            if (!src) { resolve(null); return; }
            if (typeof src === 'string') {
                const img = new Image();
                if (src.startsWith('https://') || src.startsWith('http://')) {
                    img.crossOrigin = 'anonymous';
                }
                img.onload = () => resolve({ img, rawDataUrl: src, blob: null });
                img.onerror = () => {
                    // Retry via fetch->blob if CORS cache interfered
                    if (src.startsWith('https://') || src.startsWith('http://')) {
                        fetch(src, { mode: 'cors', cache: 'reload' })
                            .then((r) => (r.ok ? r.blob() : null))
                            .then((b) => {
                                if (!b) { resolve(null); return; }
                                const objUrl = URL.createObjectURL(b);
                                const img2 = new Image();
                                img2.onload = () => { URL.revokeObjectURL(objUrl); resolve({ img: img2, rawDataUrl: src, blob: b }); };
                                img2.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
                                img2.src = objUrl;
                            })
                            .catch(() => resolve(null));
                        return;
                    }
                    resolve(null);
                };
                img.src = src;
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const rawB64 = ev.target.result;
                const img = new Image();
                img.onload = () => resolve({ img, rawDataUrl: rawB64, blob: src });
                img.onerror = () => resolve(null);
                img.src = rawB64;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(src);
        });
    }

    function canvasToBlobAsync(canvas, mime = 'image/png', quality = 0.95) {
        return new Promise((resolve) => {
            if (canvas.toBlob) {
                canvas.toBlob((b) => resolve(b), mime, quality);
            } else {
                try {
                    const du = canvas.toDataURL(mime, quality);
                    fetch(du).then((r) => r.blob()).then(resolve).catch(() => resolve(null));
                } catch (e) {
                    resolve(null);
                }
            }
        });
    }

    // Clasificador heurístico instantáneo (respaldo sin API key) para carga masiva inteligente
    function classifyPhotoRoleHeuristic(img, fileName = '') {
        const fn = String(fileName || '').toLowerCase();
        if (/(ambiente|room|lifestyle|escena|sala[-_\s]*completa|decor)/i.test(fn)) return 'ambiente';
        if (/(finish|acabado|tela|swatch|textura|madera|color|muestra)/i.test(fn)) return 'finish';
        if (/(hero|portada|inicio|view|vista|frente|lateral|planta)/i.test(fn)) return 'cutout';
        try {
            const w = 120, h = 120;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const d = ctx.getImageData(0, 0, w, h).data;
            let transPx = 0;
            let whiteBorderPx = 0;
            let borderTotal = 0;
            const borderVals = [];
            for (let x = 0; x < w; x++) {
                [0, 1, h - 2, h - 1].forEach((y) => {
                    const i = (y * w + x) * 4;
                    borderTotal++;
                    if (d[i + 3] < 30) transPx++;
                    if (d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238) whiteBorderPx++;
                    borderVals.push((d[i] + d[i + 1] + d[i + 2]) / 3);
                });
            }
            for (let y = 2; y < h - 2; y++) {
                [0, 1, w - 2, w - 1].forEach((x) => {
                    const i = (y * w + x) * 4;
                    borderTotal++;
                    if (d[i + 3] < 30) transPx++;
                    if (d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238) whiteBorderPx++;
                    borderVals.push((d[i] + d[i + 1] + d[i + 2]) / 3);
                });
            }
            if (transPx / borderTotal > 0.12 || whiteBorderPx / borderTotal > 0.62) {
                return 'cutout';
            }
            // Check if uniform close-up swatch texture (low macro variance between quadrants, high micro texture)
            const qMeans = [0, 0, 0, 0];
            const qCounts = [0, 0, 0, 0];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    const q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
                    qMeans[q] += lum;
                    qCounts[q]++;
                }
            }
            for (let q = 0; q < 4; q++) qMeans[q] /= Math.max(1, qCounts[q]);
            const avgQ = (qMeans[0] + qMeans[1] + qMeans[2] + qMeans[3]) / 4;
            const qSpread = Math.max(...qMeans.map((m) => Math.abs(m - avgQ)));
            const aspect = (img.naturalWidth || img.width) / Math.max(1, img.naturalHeight || img.height);
            if (qSpread < 11 && aspect >= 0.80 && aspect <= 1.25) {
                return 'finish';
            }
            return 'ambiente';
        } catch (e) {
            return 'cutout';
        }
    }

    // Agente Google AI Studio (Gemini 2.5 Flash Vision) para auditar y clasificar fotos automáticamente
    async function classifyPhotoRoleWithGemini(src, fileName = '') {
        const loaded = await loadImageElementFromAnySource(src);
        if (!loaded || !loaded.img) return 'cutout';
        const fallbackRole = classifyPhotoRoleHeuristic(loaded.img, fileName);
        let apiKey = '';
        try {
            if (global.CREATA_CLOUD_CONFIG && typeof global.CREATA_CLOUD_CONFIG.getGeminiApiKey === 'function') {
                apiKey = global.CREATA_CLOUD_CONFIG.getGeminiApiKey();
            }
        } catch (e) {}
        if (!apiKey) return fallbackRole;
        try {
            const thumbDataUrl = encodeOpaqueSwatchOrScene(loaded.img, 512, 0.82);
            const commaIdx = thumbDataUrl.indexOf(',');
            const mimeMatch = thumbDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
            const b64Payload = commaIdx >= 0 ? thumbDataUrl.slice(commaIdx + 1) : '';
            if (!b64Payload) return fallbackRole;
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: 'Classify this furniture catalog image into EXACTLY ONE word from [ambiente, finish, cutout]. "ambiente" = full room lifestyle scene with walls/rug/decor; "finish" = close-up texture swatch of fabric/wood/material; "cutout" = standalone furniture product view meant to have its background removed. Reply with ONLY one lowercase word.'
                            },
                            { inline_data: { mime_type: mimeType, data: b64Payload } }
                        ]
                    }],
                    generationConfig: { temperature: 0, maxOutputTokens: 12 }
                })
            });
            if (resp.ok) {
                const json = await resp.json();
                const txt = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toLowerCase();
                if (txt.includes('ambiente')) return 'ambiente';
                if (txt.includes('finish') || txt.includes('swatch')) return 'finish';
                if (txt.includes('cutout')) return 'cutout';
            }
        } catch (err) {
            console.warn('[Creata Gemini Vision Fallback]', err);
        }
        return fallbackRole;
    }

    async function compressImageFast(src, maxWidth = 1000, maxHeight = 750, quality = 0.92, options = {}) {
        if (!src) return null;
        const mode = (options && options.mode) || 'cutout'; // 'cutout' | 'swatch' | 'keep'
        const loaded = await loadImageElementFromAnySource(src);
        if (!loaded || !loaded.img) {
            return typeof src === 'string' ? src : null;
        }
        const { img, rawDataUrl } = loaded;
        // REGLA ESTRICTA 1: Acabado / Color conserva textura íntegra al 100%
        if (mode === 'swatch') {
            try {
                return encodeOpaqueSwatchOrScene(img, Math.min(maxWidth || 700, 700), quality);
            } catch (e) {
                return rawDataUrl;
            }
        }
        // REGLA ESTRICTA 2: Ambiente conserva su habitación / fondo original al 100%
        if (mode === 'keep' || mode === 'original' || mode === 'ambiente') {
            try {
                return encodeOpaqueSwatchOrScene(img, Math.max(maxWidth || 1200, 1200), quality);
            } catch (e) {
                return rawDataUrl;
            }
        }
        // REGLA ESTRICTA 3: Portada (hero) y Vistas 1..4 SIEMPRE eliminan fondo con IA neuronal IS-Net fp16 + descontaminación de bordes + encuadre uniforme 1000x750
        try {
            const prep = createPaddedBlobCanvas(img, 36, Math.max(maxWidth || 1200, 1200));
            if (prep.alreadyTransparent) {
                decontaminateCutoutCanvas(prep.canvas);
                return frameTransparentFurnitureCanvas(prep.canvas, 1000, 750, quality);
            }
            const aiRemove = await loadImglyBackgroundRemover();
            if (aiRemove) {
                try {
                    const paddedBlob = await canvasToBlobAsync(prep.canvas, 'image/png');
                    if (paddedBlob) {
                        const outBlob = await aiRemove(paddedBlob, {
                            model: 'medium', // isnet_fp16: máxima precisión en telas claras/blancas y patas finas
                            output: { format: 'image/png', quality: 0.95 }
                        });
                        const aiLoaded = await loadImageElementFromAnySource(outBlob);
                        if (aiLoaded && aiLoaded.img) {
                            const cropCanvas = document.createElement('canvas');
                            cropCanvas.width = prep.innerW;
                            cropCanvas.height = prep.innerH;
                            cropCanvas.getContext('2d').drawImage(
                                aiLoaded.img,
                                prep.pad, prep.pad, prep.innerW, prep.innerH,
                                0, 0, prep.innerW, prep.innerH
                            );
                            decontaminateCutoutCanvas(cropCanvas);
                            return frameTransparentFurnitureCanvas(cropCanvas, 1000, 750, quality);
                        }
                    }
                } catch (aiErr) {
                    console.warn('[Creata AI IS-Net Fallback]', aiErr);
                }
            }
            const stripResult = analyzeAndStripBackgroundCanvas(img, Math.max(maxWidth || 1000, 1000));
            if (stripResult && stripResult.canvas) {
                return frameTransparentFurnitureCanvas(stripResult.canvas, 1000, 750, quality);
            }
        } catch (err) {
            console.warn('[Creata Cutout Warning]', err);
        }
        try {
            return encodeOpaqueSwatchOrScene(img, Math.max(maxWidth || 1000, 1000), quality);
        } catch (e) {
            return rawDataUrl;
        }
    }

    global.CreataImg = {
        parseCurrencyValue: parseCurrencyValue,
        formatCurrencyMXN: formatCurrencyMXN,
        detectProductPieces: detectProductPieces,
        compressImageFast: compressImageFast,
        classifyPhotoRoleHeuristic: classifyPhotoRoleHeuristic,
        classifyPhotoRoleWithGemini: classifyPhotoRoleWithGemini
    };
})(window);
