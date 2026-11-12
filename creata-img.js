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
        try {
            const mod = await import('https://esm.sh/@imgly/background-removal@1.5.5');
            __imglyRemoveBgFn = mod.removeBackground || mod.default || null;
            return __imglyRemoveBgFn;
        } catch (err) {
            console.warn('[Creata BG AI fallback]', err);
            return null;
        }
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
        const isComplexScene = borderStdDev > 36;
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
        const bgMask = new Uint8Array(totalPx); // 1 = fondo confirmado
        const visited = new Uint8Array(totalPx);
        const queue = new Int32Array(totalPx);
        let qHead = 0, qTail = 0;
        const globalTolSq = isComplexScene ? (30 * 30) : (48 * 48);
        const stepTolSq = isComplexScene ? (13 * 13) : (18 * 18);
        const edgeBarrier = isComplexScene ? 18 : 26;
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
            const isNearWhite = data[idx4] > 232 && data[idx4 + 1] > 232 && data[idx4 + 2] > 232;
            if (isNearWhite || colorDistSqMean(idx4) <= globalTolSq * 1.35) {
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
                const isPureStudioWhite = nr > 240 && ng > 240 && nb > 240;
                if (!isPureStudioWhite && colorDistSqMean(nIdx4) > globalTolSq * 1.6) continue;
                bgMask[np] = 1;
                queue[qTail++] = np;
            }
        }
        const removedRatio = qTail / totalPx;
        if (removedRatio < 0.03 || removedRatio > 0.96) {
            return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: true };
        }
        const alphaOut = new Uint8Array(totalPx);
        for (let p = 0; p < totalPx; p++) {
            alphaOut[p] = bgMask[p] ? 0 : data[p * 4 + 3];
        }
        for (let y = 1; y < h - 1; y++) {
            const rOff = y * w;
            for (let x = 1; x < w - 1; x++) {
                const p = rOff + x;
                if (bgMask[p]) continue;
                let bgNeighbors = 0;
                if (bgMask[p - 1]) bgNeighbors++;
                if (bgMask[p + 1]) bgNeighbors++;
                if (bgMask[p - w]) bgNeighbors++;
                if (bgMask[p + w]) bgNeighbors++;
                if (bgMask[p - w - 1]) bgNeighbors++;
                if (bgMask[p - w + 1]) bgNeighbors++;
                if (bgMask[p + w - 1]) bgNeighbors++;
                if (bgMask[p + w + 1]) bgNeighbors++;
                if (bgNeighbors > 0) {
                    const idx4 = p * 4;
                    const factor = Math.max(0.22, 1 - (bgNeighbors * 0.11));
                    alphaOut[p] = Math.round(alphaOut[p] * factor);
                    const invA = 1 - factor;
                    data[idx4] = Math.max(0, Math.min(255, Math.round((data[idx4] - meanR * invA * 0.65) / (1 - invA * 0.65))));
                    data[idx4 + 1] = Math.max(0, Math.min(255, Math.round((data[idx4 + 1] - meanG * invA * 0.65) / (1 - invA * 0.65))));
                    data[idx4 + 2] = Math.max(0, Math.min(255, Math.round((data[idx4 + 2] - meanB * invA * 0.65) / (1 - invA * 0.65))));
                }
            }
        }
        for (let p = 0; p < totalPx; p++) {
            data[p * 4 + 3] = alphaOut[p];
        }
        ctx.putImageData(imgData, 0, 0);
        return { canvas: workCanvas, width: w, height: h, alreadyTransparent: false, complexBg: isComplexScene };
    }
    function frameTransparentFurnitureCanvas(sourceCanvas, targetW = 1000, targetH = 750, quality = 0.90) {
        const sw = sourceCanvas.width;
        const sh = sourceCanvas.height;
        const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        const data = sCtx.getImageData(0, 0, sw, sh).data;
        let minX = sw, minY = sh, maxX = 0, maxY = 0;
        let solidCount = 0;
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                if (data[idx + 3] > 22) {
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
        const maxAllowedW = targetW * 0.95;
        const maxAllowedH = targetH * 0.94;
        const maxOpticalArea = targetW * targetH * 0.88;
        const areaScale = Math.sqrt(maxOpticalArea / Math.max(1, cropW * cropH));
        const scale = Math.min(maxAllowedW / cropW, maxAllowedH / cropH, areaScale);
        const drawW = Math.max(1, Math.round(cropW * scale));
        const drawH = Math.max(1, Math.round(cropH * scale));
        const drawX = Math.round((targetW - drawW) / 2);
        const drawY = Math.round((targetH - drawH) * 0.50);
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
        try {
            const webp = outCanvas.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return outCanvas.toDataURL('image/png');
    }
    function encodeOpaqueSwatchOrScene(img, maxDim = 800, quality = 0.88) {
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
                img.onerror = () => resolve(null);
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
    async function compressImageFast(src, maxWidth = 1000, maxHeight = 750, quality = 0.90, options = {}) {
        if (!src) return null;
        const mode = (options && options.mode) || 'cutout'; // 'cutout' | 'swatch' | 'auto'
        const forceAi = !!(options && options.forceAi);
        const loaded = await loadImageElementFromAnySource(src);
        if (!loaded || !loaded.img) {
            return typeof src === 'string' ? src : null;
        }
        const { img, rawDataUrl, blob } = loaded;
        if (mode === 'swatch') {
            try {
                return encodeOpaqueSwatchOrScene(img, Math.min(maxWidth || 600, 600), quality);
            } catch (e) {
                return rawDataUrl;
            }
        }
        try {
            let stripResult = null;
            if (!forceAi) {
                stripResult = analyzeAndStripBackgroundCanvas(img, Math.max(maxWidth || 1000, 1000));
            }
            if (forceAi || (stripResult && stripResult.complexBg && mode === 'cutout')) {
                const aiRemove = await loadImglyBackgroundRemover();
                if (aiRemove) {
                    try {
                        let inputForAi = blob;
                        if (!inputForAi && rawDataUrl) {
                            const resp = await fetch(rawDataUrl);
                            inputForAi = await resp.blob();
                        }
                        if (inputForAi) {
                            const outBlob = await aiRemove(inputForAi, {
                                model: 'small',
                                output: { format: 'image/png', quality: 0.92 }
                            });
                            const aiLoaded = await loadImageElementFromAnySource(outBlob);
                            if (aiLoaded && aiLoaded.img) {
                                const c = document.createElement('canvas');
                                c.width = aiLoaded.img.naturalWidth || aiLoaded.img.width;
                                c.height = aiLoaded.img.naturalHeight || aiLoaded.img.height;
                                c.getContext('2d').drawImage(aiLoaded.img, 0, 0);
                                return frameTransparentFurnitureCanvas(c, 1000, 750, quality);
                            }
                        }
                    } catch (aiErr) {
                        console.warn('[Creata AI BG Fallback to FloodFill]', aiErr);
                        if (!stripResult) {
                            stripResult = analyzeAndStripBackgroundCanvas(img, Math.max(maxWidth || 1000, 1000));
                        }
                    }
                }
            }
            if (mode === 'auto' && stripResult && stripResult.complexBg && !stripResult.alreadyTransparent && !forceAi) {
                return encodeOpaqueSwatchOrScene(img, Math.max(maxWidth || 1200, 1200), quality);
            }
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
        compressImageFast: compressImageFast
    };
})(window);
