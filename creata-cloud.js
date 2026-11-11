// ==========================================================================
// CREATA MUEBLES — NUBE, COMPRESIÓN DE FOTOS, DETECCIÓN DE PIEZAS Y SEGURIDAD
// ==========================================================================
(function (global) {
    'use strict';

    const DEFAULT_WEBAPP_URL = '';

    const CREATA_CLOUD_CONFIG = {
        sheetId: '13ZwLgY_jXfOsGdjZqz-DDZjoGUvLBWApb_-M9Usir1M',
        driveFolderId: '1umQvzMJLXFiOwSyWL8d5v0aCWDpx8hQT',
        githubOwner: 'ikerreyna3942-debug',
        githubRepo: 'MCP-REPOCITORIO',
        getApiUrl: function () {
            try {
                const localUrl = localStorage.getItem('creata_sheets_webapp_url');
                if (localUrl && /^https:\/\/script\.google(usercontent)?\.com\//i.test(localUrl.trim())) {
                    return localUrl.trim();
                }
            } catch (e) {}
            return DEFAULT_WEBAPP_URL;
        },
        setApiUrl: function (url) {
            const clean = (url || '').trim();
            if (!clean) {
                localStorage.removeItem('creata_sheets_webapp_url');
            } else {
                localStorage.setItem('creata_sheets_webapp_url', clean);
            }
            return clean;
        },
        getAdminPin: function () {
            try {
                return (localStorage.getItem('creata_admin_pin') || '').trim();
            } catch (e) {
                return '';
            }
        },
        setAdminPin: function (pin) {
            const clean = (pin || '').trim();
            if (!clean) {
                localStorage.removeItem('creata_admin_pin');
            } else {
                localStorage.setItem('creata_admin_pin', clean);
            }
            return clean;
        },
        isConfigured: function () {
            return !!this.getApiUrl();
        }
    };

    function isValidPhotoUrl(val) {
        if (!val || typeof val !== 'string') return false;
        const s = val.trim();
        if (!s || s === 'undefined' || s === 'null' || s === '#') return false;
        return s.startsWith('data:image/') || s.startsWith('https://') || s.startsWith('http://') || s.startsWith('./') || s.startsWith('fotos/');
    }

    function scrubForbiddenPublicText(txt) {
        if (!txt || typeof txt !== 'string') return txt || '';
        return txt
            .replace(/JUEGO COMPLETO\s*\([^)]*\)/gi, '')
            .replace(/JUEGO COMPLETO/gi, '')
            .replace(/JUEGO MODULAR COMPLETO/gi, '')
            .replace(/\n?\[Composición\]:[\s\S]*$/i, '')
            .replace(/\bSin descripción\b\.?/gi, '')
            .trim();
    }

    function sanitizePublicProduct(prod) {
        if (!prod || typeof prod !== 'object') return null;
        const clone = {};
        const forbiddenKeys = new Set([
            'sku', 'sku_base', 'sku_mode', 'is_unified_sku',
            'temp_unified_sku', 'piece_composition', 'cost',
            'sheet_specs', 'drive_file_id'
        ]);
        Object.keys(prod).forEach((k) => {
            if (forbiddenKeys.has(k)) return;
            clone[k] = prod[k];
        });

        clone.model_name = scrubForbiddenPublicText(clone.model_name);
        clone.materials = scrubForbiddenPublicText(clone.materials);

        if (Array.isArray(clone.variants)) {
            clone.variants = clone.variants.map((v) => {
                const vc = {};
                Object.keys(v || {}).forEach((vk) => {
                    if (forbiddenKeys.has(vk)) return;
                    vc[vk] = v[vk];
                });
                vc.color_label = scrubForbiddenPublicText(vc.color_label);
                vc.materials = scrubForbiddenPublicText(vc.materials);
                vc.hero_b64 = isValidPhotoUrl(vc.hero_b64) ? vc.hero_b64.trim() : '';
                vc.swatch_img = isValidPhotoUrl(vc.swatch_img) ? vc.swatch_img.trim() : '';
                if (vc.gallery && typeof vc.gallery === 'object') {
                    const g = Object.assign({}, vc.gallery);
                    g.ambiente = isValidPhotoUrl(g.ambiente) ? g.ambiente.trim() : '';
                    g.finish = isValidPhotoUrl(g.finish) ? g.finish.trim() : '';
                    g.fabric = isValidPhotoUrl(g.fabric) ? g.fabric.trim() : '';
                    ['view1', 'view2', 'view3', 'view4'].forEach((k) => {
                        g[k] = isValidPhotoUrl(g[k]) ? g[k].trim() : '';
                    });
                    if (Array.isArray(g.all_views)) {
                        g.all_views = g.all_views.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')).filter(Boolean);
                    }
                    if (Array.isArray(g.finishes)) {
                        g.finishes = g.finishes.map((u) => (isValidPhotoUrl(u) ? u.trim() : '')).filter(Boolean);
                    }
                    vc.gallery = g;
                }
                return vc;
            });
        } else {
            clone.variants = [];
        }

        if (Array.isArray(clone.sala_modules)) {
            clone.sala_modules = clone.sala_modules.map((m) => ({
                name: scrubForbiddenPublicText(m.name),
                price: parseFloat(m.price) || 0,
                width: m.width || '',
                depth: m.depth || '',
                height: m.height || '',
                qty: parseInt(m.qty, 10) || 1,
                checked: m.checked !== false
            }));
        }

        return clone;
    }

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

        // 1. Coincidencia exacta en catálogo modular conocido
        if (knownCatalog && typeof knownCatalog === 'object') {
            const matchedKey = Object.keys(knownCatalog).find((k) => {
                const modelAlias = k
                    .replace('CVVSALAARIO', 'ARIA')
                    .replace('CVVSALPIE', 'PIERO')
                    .replace('ARMMAT', 'MATERA')
                    .replace('ARMMAR', 'MARENO')
                    .replace('ARMMON', 'MONET')
                    .replace('ARMDON', 'DONATI');
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

        // 2. Búsqueda automática de piezas hermanas en SKU_DATABASE
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

        // 3. Detección inteligente por estructura de dimensiones, bultos o texto
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

    function fastAutoCropBox(img, maxScan = 220) {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) return null;

        const scale = Math.min(1, maxScan / Math.max(srcW, srcH));
        const scanW = Math.max(1, Math.round(srcW * scale));
        const scanH = Math.max(1, Math.round(srcH * scale));

        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = scanW;
        scanCanvas.height = scanH;
        const scanCtx = scanCanvas.getContext('2d');
        scanCtx.drawImage(img, 0, 0, scanW, scanH);

        const data = scanCtx.getImageData(0, 0, scanW, scanH).data;
        let minX = scanW, minY = scanH, maxX = 0, maxY = 0;
        let nonWhiteCount = 0;

        for (let y = 0; y < scanH; y++) {
            for (let x = 0; x < scanW; x++) {
                const idx = (y * scanW + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                if (a > 30 && (r < 245 || g < 245 || b < 245)) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    nonWhiteCount++;
                }
            }
        }

        const boxW = maxX - minX;
        const boxH = maxY - minY;
        if (nonWhiteCount < 16 || boxW < 8 || boxH < 8) return null;

        const inv = 1 / scale;
        const origMinX = Math.floor(minX * inv);
        const origMinY = Math.floor(minY * inv);
        const origBoxW = Math.ceil(boxW * inv);
        const origBoxH = Math.ceil(boxH * inv);

        const padX = Math.round(origBoxW * 0.03);
        const padY = Math.round(origBoxH * 0.03);
        const cropX = Math.max(0, origMinX - padX);
        const cropY = Math.max(0, origMinY - padY);
        const cropW = Math.min(srcW - cropX, origBoxW + padX * 2);
        const cropH = Math.min(srcH - cropY, origBoxH + padY * 2);

        return { cropX, cropY, cropW, cropH, srcW, srcH };
    }

    function encodeNormalizedCanvas(img, cropBox, maxDim = 1000, quality = 0.85) {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const box = cropBox || { cropX: 0, cropY: 0, cropW: srcW, cropH: srcH };

        const scale = Math.min(1, maxDim / Math.max(box.cropW, box.cropH));
        const outW = Math.max(1, Math.round(box.cropW * scale));
        const outH = Math.max(1, Math.round(box.cropH * scale));

        const outCanvas = document.createElement('canvas');
        outCanvas.width = outW;
        outCanvas.height = outH;
        const outCtx = outCanvas.getContext('2d');
        outCtx.fillStyle = '#FFFFFF';
        outCtx.fillRect(0, 0, outW, outH);
        outCtx.drawImage(img, box.cropX, box.cropY, box.cropW, box.cropH, 0, 0, outW, outH);

        // Preferimos WebP compacto si el navegador soporta data:image/webp, sino JPEG
        try {
            const webp = outCanvas.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) return webp;
        } catch (e) {}
        return outCanvas.toDataURL('image/jpeg', quality);
    }

    function compressImageFast(src, maxWidth = 1000, maxHeight = 1000, quality = 0.85) {
        const maxDim = Math.max(maxWidth || 1000, maxHeight || 1000);
        return new Promise((resolve) => {
            if (!src) { resolve(null); return; }

            if (typeof src === 'string') {
                if (src.startsWith('https://') || src.startsWith('http://')) {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        try {
                            let cropBox = null;
                            try { cropBox = fastAutoCropBox(img); } catch (corsErr) {}
                            resolve(encodeNormalizedCanvas(img, cropBox, maxDim, quality));
                        } catch (e) {
                            resolve(src);
                        }
                    };
                    img.onerror = () => resolve(src);
                    img.src = src;
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    try {
                        let cropBox = null;
                        try { cropBox = fastAutoCropBox(img); } catch (e) {}
                        resolve(encodeNormalizedCanvas(img, cropBox, maxDim, quality));
                    } catch (e) {
                        resolve(src);
                    }
                };
                img.onerror = () => resolve(src);
                img.src = src;
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                const rawB64 = ev.target.result;
                const img = new Image();
                img.onload = () => {
                    try {
                        let cropBox = null;
                        try { cropBox = fastAutoCropBox(img); } catch (e) {}
                        resolve(encodeNormalizedCanvas(img, cropBox, maxDim, quality));
                    } catch (e) {
                        resolve(rawB64);
                    }
                };
                img.onerror = () => resolve(rawB64);
                img.src = rawB64;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(src);
        });
    }

    async function fetchCloudCatalog(mode = 'public', timeoutMs = 5500) {
        const apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
        if (!apiUrl) return null;

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const sep = apiUrl.includes('?') ? '&' : '?';
            let targetUrl = `${apiUrl}${sep}mode=${encodeURIComponent(mode)}&_t=${Date.now()}`;
            if (mode === 'admin') {
                const pin = CREATA_CLOUD_CONFIG.getAdminPin();
                if (pin) targetUrl += `&pin=${encodeURIComponent(pin)}`;
            }
            const resp = await fetch(targetUrl, {
                method: 'GET',
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            if (data && data.ok && Array.isArray(data.products)) {
                return data.products;
            }
            return null;
        } catch (err) {
            console.warn('[Creata Cloud Fetch]', err);
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function cloudPost(action, payload, timeoutMs = 25000) {
        const apiUrl = CREATA_CLOUD_CONFIG.getApiUrl();
        if (!apiUrl) return { ok: false, offline: true, error: 'Apps Script no conectado' };

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const body = Object.assign({}, payload || {}, {
                action: action,
                pin: CREATA_CLOUD_CONFIG.getAdminPin()
            });
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            console.warn(`[Creata Cloud POST:${action}]`, err);
            return { ok: false, error: err.message || 'Error de red' };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function cloudUploadPhoto(product, variantIdx, slotKey, dataUrl) {
        if (!CREATA_CLOUD_CONFIG.isConfigured()) {
            return { ok: true, localOnly: true, url: dataUrl };
        }
        const safeId = ((product && (product.id || product.model_name)) || 'mueble')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
        const res = await cloudPost('upload_photo', {
            productId: (product && product.id) || '',
            modelName: (product && product.model_name) || '',
            variantIndex: variantIdx || 0,
            slot: slotKey || 'hero',
            filePrefix: safeId,
            dataUrl: dataUrl
        }, 35000);
        if (res && res.ok && res.url) {
            return { ok: true, localOnly: false, url: res.url };
        }
        return { ok: false, fallbackUrl: dataUrl, error: (res && res.error) || 'No se pudo subir a la nube' };
    }

    global.CREATA_CLOUD_CONFIG = CREATA_CLOUD_CONFIG;
    global.CreataCloud = {
        config: CREATA_CLOUD_CONFIG,
        isValidPhotoUrl,
        scrubForbiddenPublicText,
        sanitizePublicProduct,
        parseCurrencyValue,
        formatCurrencyMXN,
        detectProductPieces,
        compressImageFast,
        fetchCloudCatalog,
        cloudPost,
        cloudUploadPhoto
    };
})(window);
