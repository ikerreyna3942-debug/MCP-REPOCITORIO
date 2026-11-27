    // ------------------------------------------------------------------------
    // ESCÁNER DE CÁMARA Y LECTURA SILENCIOSA BLUETOOTH HID (P2300L · ANDROID / APPLE iOS / PC)
    // ------------------------------------------------------------------------
    const SCAN_LIB_URLS = [
        'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
        'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
    ];
    let scanLibPromise = null;
    let scanInstance = null;
    let scanHandled = false;
    let btLastProcessedCode = '';
    let btLastProcessedTs = 0;
    let btLastResultObj = null;

    function loadScanLib() {
        if (window.Html5Qrcode) return Promise.resolve();
        if (scanLibPromise) return scanLibPromise;
        scanLibPromise = new Promise((resolve, reject) => {
            let idx = 0;
            const tryNext = () => {
                if (idx >= SCAN_LIB_URLS.length) {
                    scanLibPromise = null;
                    reject(new Error('No se pudo cargar el lector de códigos.'));
                    return;
                }
                const s = document.createElement('script');
                s.src = SCAN_LIB_URLS[idx++];
                s.async = true;
                s.onload = () => (window.Html5Qrcode ? resolve() : tryNext());
                s.onerror = tryNext;
                document.head.appendChild(s);
            };
            tryNext();
        });
        return scanLibPromise;
    }

    function setScanStatus(msg, isError) {
        const el = document.getElementById('scanStatus');
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? '#991B1B' : '#252C32';
    }

    function normalizeScannedBarcodeText(rawText) {
        let s = String(rawText == null ? '' : rawText);
        // Eliminar caracteres de control (NUL, GS, RS, EOT, etc.) conservando espacios
        s = s.replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f]+/g, '').trim();
        // Eliminar prefijos AIM estándar que algunos lectores 2D envían (]C1, ]Q1, ]E0, ]d2...)
        s = s.replace(/^\][A-Za-z][0-9]/, '').trim();
        s = s.replace(/\s+/g, ' ');
        return s;
    }

    function repairUsToEsScannerLayout(text) {
        const out = [];
        const base = String(text || '').trim();
        if (!base) return out;
        out.push(base);
        // Cuando un P2300L en layout US envía hacia Android/iPhone en Español (MX/ES):
        // '-' llega como "'", '_' como '?', ':' como 'Ñ', '/' como '-', '=' como '¡', '&' como '/'
        const urlRepaired = base
            .replace(/^https?[Ññ]--/i, m => m.replace(/[Ññ]/g, ':').replace(/--/g, '//'))
            .replace(/['’]/g, '-')
            .replace(/[¡]/g, '=')
            .replace(/\?/g, '_');
        if (urlRepaired !== base) out.push(urlRepaired);
        const hyphenOnly = base.replace(/['’]/g, '-');
        if (hyphenOnly !== base && out.indexOf(hyphenOnly) === -1) out.push(hyphenOnly);
        const ampRepaired = base.replace(/\//g, '&');
        if (ampRepaired !== base && out.indexOf(ampRepaired) === -1) out.push(ampRepaired);
        const hyphenAndAmp = hyphenOnly.replace(/\//g, '&');
        if (hyphenAndAmp !== base && out.indexOf(hyphenAndAmp) === -1) out.push(hyphenAndAmp);
        return out;
    }

    function extractBarcodeCandidates(rawText) {
        const cleaned = normalizeScannedBarcodeText(rawText);
        if (!cleaned) return [];
        const seen = new Set();
        const list = [];
        function addCand(v) {
            const c = String(v || '').trim().toUpperCase();
            if (!c || seen.has(c)) return;
            seen.add(c);
            list.push(c);
        }

        const variants = repairUsToEsScannerLayout(cleaned);
        for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            addCand(v);

            // Prefijos comunes de etiquetas (SKU: XXX, COD: XXX, MODELO: XXX)
            const prefMatch = v.match(/^(?:SKU|COD|C[OÓ]DIGO|CODE|REF|ITEM|ID|MODELO)\s*[:=#\-]\s*(.+)$/i);
            if (prefMatch && prefMatch[1]) {
                addCand(prefMatch[1]);
            }

            // QR con URL (ej. https://.../?sku=API1P o /producto/API1P)
            if (/^https?:\/\//i.test(v)) {
                try {
                    const u = new URL(v);
                    ['sku', 's', 'codigo', 'code', 'id', 'item', 'p', 'q'].forEach(param => {
                        const pv = u.searchParams.get(param);
                        if (pv) addCand(pv);
                    });
                    const segs = u.pathname.split('/').map(seg => decodeURIComponent(seg || '').trim()).filter(Boolean);
                    for (let k = segs.length - 1; k >= 0; k--) {
                        if (segs[k].length >= 4 && !/\.html?$/i.test(segs[k])) addCand(segs[k]);
                    }
                } catch (e) {}
            }

            // Etiquetas con varios campos separados por espacio, |, ; o ,
            const parts = v.split(/[\s|;,]+/).map(p => p.trim()).filter(Boolean);
            for (let j = 0; j < parts.length; j++) {
                const tok = parts[j].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9&]+$/g, '');
                if (tok.length >= 4) addCand(tok);
            }
        }
        return list;
    }

    function resolveScannedBarcode(rawText) {
        const rawCode = normalizeScannedBarcodeText(rawText);
        if (!rawCode) return null;
        const candidates = extractBarcodeCandidates(rawCode);

        // 1. Coincidencia exacta en bySkuMap
        for (let i = 0; i < candidates.length; i++) {
            const hit = bySkuMap.get(candidates[i]);
            if (hit) {
                return {
                    status: isQuotableItem(hit) ? 'quotable' : 'out_of_stock',
                    item: hit,
                    rawCode: rawCode,
                    matchedCode: hit.s
                };
            }
        }

        // 2. Coincidencia normalizada alfanumérica en bySkuNormMap
        for (let i = 0; i < candidates.length; i++) {
            const norm = candidates[i].replace(/[^A-Z0-9]+/g, '');
            if (norm.length >= 4) {
                const hit = bySkuNormMap.get(norm);
                if (hit) {
                    return {
                        status: isQuotableItem(hit) ? 'quotable' : 'out_of_stock',
                        item: hit,
                        rawCode: rawCode,
                        matchedCode: hit.s
                    };
                }
            }
        }

        // 3. Búsqueda inteligente en el catálogo disponible (sin mutar la vista principal)
        try {
            if (typeof searchGroupCollection === 'function' && Array.isArray(allGroups) && allGroups.length > 0) {
                const scoreMap = new Map();
                const hits = searchGroupCollection(allGroups, rawCode, scoreMap);
                if (hits.length === 1) {
                    const g = hits[0];
                    if (g.items && g.items.length === 1 && isQuotableItem(g.items[0])) {
                        return {
                            status: 'quotable',
                            item: g.items[0],
                            rawCode: rawCode,
                            matchedCode: g.items[0].s
                        };
                    }
                    return {
                        status: 'search_group',
                        group: g,
                        rawCode: rawCode,
                        matchedCode: rawCode
                    };
                }
                if (hits.length > 1) {
                    return {
                        status: 'search_multi',
                        count: hits.length,
                        rawCode: rawCode,
                        matchedCode: rawCode
                    };
                }
            }
        } catch (e) {}

        return {
            status: 'raw_only',
            rawCode: rawCode,
            matchedCode: rawCode
        };
    }

    function playBtScanFeedback() {
        try {
            if (navigator && typeof navigator.vibrate === 'function') {
                navigator.vibrate(65);
            }
        } catch (e) {}
    }

    function processScannedBarcode(rawText, opts) {
        const o = opts || {};
        const cleaned = normalizeScannedBarcodeText(rawText);
        if (!cleaned) return null;

        // Evitar doble disparo si el lector envía keydown + input casi simultáneos
        const nowTs = Date.now();
        if (!o.force && cleaned.toUpperCase() === btLastProcessedCode && (nowTs - btLastProcessedTs) < 420) {
            return btLastResultObj;
        }
        btLastProcessedCode = cleaned.toUpperCase();
        btLastProcessedTs = nowTs;

        const res = resolveScannedBarcode(cleaned);
        if (!res) return null;

        res.source = o.source || 'Bluetooth HID (P2300L)';
        btLastResultObj = res;
        playBtScanFeedback();

        if (isModalOpenById('scanModal')) {
            closeBarcodeScanner();
        }
        if (isModalOpenById('priceCalculatorModal') && typeof handleScannedBarcodeForPriceCalculator === 'function') {
            return handleScannedBarcodeForPriceCalculator(res, cleaned);
        }
        if (isModalOpenById('cartModal') && (res.status === 'quotable' || res.status === 'search_group' || res.status === 'search_multi')) {
            closeCartModal();
        }

        const inp = document.getElementById('invSearchInput');
        if (res.status === 'quotable' && res.item) {
            if (inp) inp.value = res.item.s;
            applyFilter(res.item.s);
            openProductDetail(res.item.s, false);
            showToast('✓ Escaneado: ' + res.item.s);
        } else if (res.status === 'search_group' && res.group) {
            if (inp) inp.value = res.rawCode;
            applyFilter(res.rawCode);
            openGroupModal(res.group.key);
            showToast('✓ Escaneado: ' + res.rawCode);
        } else if (res.status === 'search_multi') {
            if (inp) inp.value = res.rawCode;
            applyFilter(res.rawCode);
            showToast('Código leído: ' + res.rawCode + ' · ' + res.count + ' coincidencias');
        } else if (res.status === 'out_of_stock') {
            // Respetar filtro de disponibilidad: no exponer en catálogo cotizable ni abrir ficha
            showToast('⚠ Código leído (' + res.matchedCode + '): sin stock en Bodega/Piso ni LPPT');
        } else {
            if (inp) inp.value = res.rawCode;
            applyFilter(res.rawCode);
            showToast('Código leído: ' + res.rawCode);
        }
        return res;
    }

    function handleScannedCode(rawText) {
        if (scanHandled) return;
        const code = normalizeScannedBarcodeText(rawText);
        if (!code) return;
        scanHandled = true;
        processScannedBarcode(code, { source: 'Cámara' });
    }

    function isScanModalOpen() {
        const modal = document.getElementById('scanModal');
        return Boolean(modal && modal.classList.contains('open'));
    }

    async function startLiveBarcodeCamera() {
        if (!isScanModalOpen()) return;
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setScanStatus('Este navegador no permite video en vivo. Usa el botón "Tomar foto del código".', true);
            loadScanLib().catch(() => {});
            return;
        }
        setScanStatus('Iniciando cámara...', false);
        try {
            await loadScanLib();
            if (!isScanModalOpen()) return;
            if (scanInstance) {
                const prevInst = scanInstance;
                scanInstance = null;
                try {
                    if (prevInst.isScanning) await prevInst.stop();
                    prevInst.clear();
                } catch (ePrev) {}
            }
            if (!isScanModalOpen()) return;
            const reader = document.getElementById('scanReader');
            if (reader) reader.innerHTML = '';
            const inst = new window.Html5Qrcode('scanReader', {
                verbose: false,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true }
            });
            scanInstance = inst;
            if (!isScanModalOpen()) {
                scanInstance = null;
                try { inst.clear(); } catch (eClr) {}
                return;
            }
            const scanConfig = {
                fps: 12,
                qrbox: function (w, h) {
                    const bw = Math.floor(Math.min(w * 0.85, 360));
                    const bh = Math.floor(Math.min(h * 0.5, 180));
                    return { width: Math.max(bw, 120), height: Math.max(bh, 80) };
                }
            };
            const onDecodeSuccess = function (decodedText) { handleScannedCode(decodedText); };
            const onDecodeFailure = function () {};
            let startedCamera = false;
            try {
                await inst.start({ facingMode: 'environment' }, scanConfig, onDecodeSuccess, onDecodeFailure);
                startedCamera = true;
            } catch (envErr) {
                // Fallback automático para computadora (PC / Mac / Laptop / Webcam USB) sin cámara trasera
                if (!isScanModalOpen() || scanInstance !== inst) return;
                let cameras = [];
                try {
                    if (typeof window.Html5Qrcode.getCameras === 'function') {
                        cameras = await window.Html5Qrcode.getCameras();
                    }
                } catch (eCamList) {}
                if (!isScanModalOpen() || scanInstance !== inst) return;
                if (Array.isArray(cameras) && cameras.length > 0) {
                    const preferred = cameras.find(c => /back|rear|trasera|environment/i.test(String((c && c.label) || ''))) || cameras[0];
                    await inst.start(preferred.id, scanConfig, onDecodeSuccess, onDecodeFailure);
                    startedCamera = true;
                } else {
                    await inst.start({ facingMode: 'user' }, scanConfig, onDecodeSuccess, onDecodeFailure);
                    startedCamera = true;
                }
            }
            if (!startedCamera) {
                throw new Error('No se encontró cámara disponible.');
            }
            // Si el usuario cerró el modal mientras la cámara arrancaba, apagarla
            if (scanInstance !== inst || !isScanModalOpen()) {
                try { await inst.stop(); inst.clear(); } catch (e) {}
                return;
            }
            setScanStatus('Apunta la cámara al código de barras o QR del producto.', false);
        } catch (err) {
            console.error('[Escáner]', err);
            setScanStatus('No fue posible abrir la cámara en vivo. Da permiso de cámara, usa "Tomar foto del código" o escanea con lector USB/Bluetooth.', true);
        }
    }

    window.openBarcodeScanner = async function () {
        const modal = document.getElementById('scanModal');
        if (!modal) return;
        scanHandled = false;
        modal.classList.add('open');
        notifyInvBackStatePush('scan_modal');
        await startLiveBarcodeCamera();
    };

    // Respaldo: tomar una foto del código con la cámara del teléfono y leerla
    window.scanBarcodeFromPhoto = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        let hadLiveCamera = false;
        setScanStatus('Leyendo código de la foto...', false);
        try {
            await loadScanLib();
            if (scanInstance && scanInstance.isScanning) {
                hadLiveCamera = true;
                try { await scanInstance.stop(); } catch (e) {}
            }
            const tmpId = 'scanFileTmp';
            let tmp = document.getElementById(tmpId);
            if (!tmp) {
                tmp = document.createElement('div');
                tmp.id = tmpId;
                tmp.style.display = 'none';
                document.body.appendChild(tmp);
            }
            const fileReader = new window.Html5Qrcode(tmpId, { verbose: false });
            const text = await fileReader.scanFile(file, false);
            try { fileReader.clear(); } catch (e) {}
            handleScannedCode(text);
        } catch (err) {
            console.error('[Escáner foto]', err);
            if (isScanModalOpen() && hadLiveCamera) {
                await startLiveBarcodeCamera();
            }
            setScanStatus('No se encontró un código en la foto. Acércate más y que el código se vea nítido.', true);
        } finally {
            inputEl.value = '';
        }
    };

    window.closeBarcodeScanner = function () {
        const modal = document.getElementById('scanModal');
        if (modal) modal.classList.remove('open');
        const inst = scanInstance;
        scanInstance = null;
        if (inst) {
            try {
                const p = inst.isScanning ? inst.stop() : Promise.resolve();
                Promise.resolve(p).then(() => { try { inst.clear(); } catch (e) {} }).catch(() => {});
            } catch (e) {}
        }
    };

    window.__creataBtScanner = {
        normalizeScannedBarcodeText: normalizeScannedBarcodeText,
        repairUsToEsScannerLayout: repairUsToEsScannerLayout,
        extractBarcodeCandidates: extractBarcodeCandidates,
        resolveScannedBarcode: resolveScannedBarcode,
        processScannedBarcode: processScannedBarcode,
        getLastResult: function () { return btLastResultObj; }
    };

    // ------------------------------------------------------------------------
    // PASO 1: MODAL DE VARIANTES DISPONIBLES DEL MODELO (ej. SILLON APIENZO)
    // ------------------------------------------------------------------------
    function renderGroupVariantsStep(grp, forcedFabricKey, forcedSizeKey) {
        currentGroup = grp;
        currentDetailItem = null;
        if (forcedFabricKey !== undefined) {
            currentGroupFabricKey = String(forcedFabricKey || '').trim();
        }
        if (forcedSizeKey !== undefined) {
            currentGroupBedSizeKey = String(forcedSizeKey || '').trim();
        }

        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const actionsRow = document.getElementById('detHeaderActionsRow');
        const addPillWrap = document.getElementById('detAddPillWrap');
        const addBtn = document.getElementById('detAddCartBtn');
        const subBtn = document.getElementById('detSubCartBtn');
        const remAllBtn = document.getElementById('detRemoveAllCartBtn');
        const oosBtn = document.getElementById('detOutOfStockRequestBtn');
        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        const varList = document.getElementById('detVariantsList');
        const guestModeGrp = typeof isGuestSession === 'function' && isGuestSession();

        if (crumbEl) {
            crumbEl.textContent = '';
            crumbEl.classList.add('hidden');
        }
        if (skuEl) {
            skuEl.textContent = '';
            skuEl.classList.add('hidden');
        }
        if (nameEl) {
            nameEl.textContent = grp.displayTitle || grp.title;
        }
        if (priceEl) priceEl.textContent = '';
        if (priceWrapEl) priceWrapEl.classList.add('hidden');
        if (actionsRow) actionsRow.classList.add('hidden');
        if (addPillWrap) addPillWrap.classList.add('hidden');
        if (addBtn) addBtn.classList.add('hidden');
        if (subBtn) subBtn.classList.add('hidden');
        if (remAllBtn) remAllBtn.classList.add('hidden');
        if (oosBtn) oosBtn.classList.add('hidden');

        function normWordForVariant(w) {
            return String(w || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
        }

        function buildVariantLabel(it, groupObj, extraSkipTokens) {
            const rawName = stripDimensionsFromProductText(it.n).toUpperCase();
            const vr = cleanStr(it.vr).toUpperCase();
            const titleWords = new Set(
                String(groupObj && groupObj.title ? groupObj.title : '')
                    .toUpperCase()
                    .split(/\s+/)
                    .map(normWordForVariant)
                    .filter(Boolean)
            );
            if (Array.isArray(extraSkipTokens)) {
                for (let s = 0; s < extraSkipTokens.length; s++) {
                    const st = normWordForVariant(extraSkipTokens[s]);
                    if (st) titleWords.add(st);
                }
            }

            const tokens = rawName.split(/\s+/).filter(Boolean);
            const rem = [];
            for (let i = 0; i < tokens.length; i++) {
                const nw = normWordForVariant(tokens[i]);
                if (!nw) continue;
                if ((nw === 'DE' || nw === 'DEL' || nw === 'CON' || nw === 'SIN' || nw === 'PARA') && i + 1 < tokens.length && titleWords.has(normWordForVariant(tokens[i + 1]))) {
                    continue;
                }
                if (titleWords.has(nw)) continue;
                rem.push(tokens[i]);
            }
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|CON|SIN|PARA|EN|Y|-|\/|·)$/.test(normWordForVariant(rem[0]))) rem.shift();
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|CON|SIN|PARA|EN|Y|-|\/|·)$/.test(normWordForVariant(rem[rem.length - 1]))) rem.pop();

            let label = rem.join(' ').replace(/\s+/g, ' ').trim();
            if (!label || normWordForVariant(label) === normWordForVariant(it.s)) {
                const fallbackPieces = [
                    cleanStr(it.tl).toUpperCase(),
                    cleanStr(it.ct).toUpperCase()
                ].filter(Boolean);
                const fabricFallback = fallbackPieces.join(' ').trim();
                label = vr || fabricFallback || cleanStr(it.md).toUpperCase() || cleanStr(it.m).toUpperCase() || rawName || it.s;
            }
            return label;
        }

        function renderVariantCardHtml(entry) {
            const it = entry.it;
            const skuKey = String(it.s || '').toUpperCase();
            const varLabel = entry.varLabel;
            const matchedFab = (!currentGroupFabricKey) ? findMatchingFabricSwatchForItem(it, grp) : null;
            const matchedWood = (!matchedFab) ? findMatchingWoodSwatchForItem(it, grp) : null;
            let fabricPillHtml = '';
            if (matchedFab && matchedFab.url) {
                const fabThumb = resolveVisualImgSrc(matchedFab.url, 120);
                const fabFid = extractDriveFileId(matchedFab.url);
                fabricPillHtml =
                    '<div class="inv-var-fabric-pill" data-fabric-zoom-url="' + escapeHtml(matchedFab.url) + '" data-fabric-zoom-label="' + escapeHtml('Tela · ' + matchedFab.label) + '" title="Ver tela">' +
                        '<img class="inv-var-fabric-thumb" width="22" height="22" src="' + escapeHtml(fabThumb) + '" alt="' + escapeHtml(matchedFab.label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
                        (fabFid ? (' data-fid="' + escapeHtml(fabFid) + '"') : '') +
                        ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                        '<span class="inv-var-fabric-lbl">' + escapeHtml(matchedFab.label) + '</span>' +
                    '</div>';
            } else if (matchedWood && matchedWood.url) {
                const woodThumb = resolveVisualImgSrc(matchedWood.url, 120);
                const woodFid = extractDriveFileId(matchedWood.url);
                fabricPillHtml =
                    '<div class="inv-var-fabric-pill is-wood" data-fabric-zoom-url="' + escapeHtml(matchedWood.url) + '" data-fabric-zoom-label="' + escapeHtml('Madera · ' + matchedWood.label) + '" title="Ver madera">' +
                        '<img class="inv-var-fabric-thumb" width="22" height="22" src="' + escapeHtml(woodThumb) + '" alt="' + escapeHtml(matchedWood.label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
                        (woodFid ? (' data-fid="' + escapeHtml(woodFid) + '"') : '') +
                        ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                        '<span class="inv-var-fabric-lbl">🪵 ' + escapeHtml(matchedWood.label) + '</span>' +
                    '</div>';
            }
            return '<div class="inv-row inv-variant-card" data-var-sku="' + escapeHtml(skuKey) + '">' +
                '<div class="inv-card-top-right">' +
                    buildCardCartControlHtml(skuKey) +
                '</div>' +
                buildThumbHtml(it, { card: true, eager: true, boxRatio: 4 / 3 }) +
                '<div class="inv-variant-card-body">' +
                    '<div class="inv-det-uniform-text font-bold uppercase leading-snug" style="color:#1A1816;">' +
                        formatTitleWithPriceHtml(varLabel, it.pr) +
                    '</div>' +
                    '<div class="inv-det-uniform-text font-semibold tracking-wider mt-0.5" style="color:#9E7B4F;">' + escapeHtml(it.s) + '</div>' +
                    fabricPillHtml +
                '</div>' +
            '</div>';
        }

        // Cotizador es vista comercial limpia: la edición de portadas visuales y fotos de tela vive en la App de Subida de Fotos
        const coverBarEl = document.getElementById('detGroupCoverBar');
        if (coverBarEl) {
            coverBarEl.innerHTML = '';
            coverBarEl.classList.add('hidden');
        }

        if (varList) {
            const canGroupByFabricModules = !!(grp && grp.typeKey && MODULE_GROUPABLE_TYPE_KEYS.has(grp.typeKey) && grp.items.length >= 2);
            const fabricBucketsByKey = new Map();
            const distinctModKeys = new Set();

            if (canGroupByFabricModules) {
                for (let i = 0; i < grp.items.length; i++) {
                    const it = grp.items[i];
                    const fab = resolveItemFabricVariation(it, grp);
                    const modB = resolveItemModuleBucket(it) || { key: 'OTRO_MODULO', label: 'PIEZA', rank: 99, stripTokens: [] };
                    distinctModKeys.add(modB.key);
                    if (!fabricBucketsByKey.has(fab.key)) {
                        fabricBucketsByKey.set(fab.key, {
                            key: fab.key,
                            label: fab.label,
                            colorHint: fab.colorHint || '',
                            items: []
                        });
                    }
                    const fb = fabricBucketsByKey.get(fab.key);
                    if (!fb.colorHint && fab.colorHint) fb.colorHint = fab.colorHint;
                    fb.items.push({ it: it, mod: modB });
                }
            }

            const useFabricModuleSections = canGroupByFabricModules && (distinctModKeys.size >= 2 || fabricBucketsByKey.size >= 2);

            const canGroupByBedSizeColor = !useFabricModuleSections && !!(grp && grp.typeKey && BED_GROUPABLE_TYPE_KEYS.has(grp.typeKey) && grp.items.length >= 2);

            if (useFabricModuleSections) {
                currentGroupBedSizeKey = '';
                if (currentGroupFabricKey && !fabricBucketsByKey.has(currentGroupFabricKey)) {
                    currentGroupFabricKey = '';
                }
                const orderedFabrics = Array.from(fabricBucketsByKey.values()).sort((a, b) =>
                    (b.items.length - a.items.length) || compareAlphaEs(a.label, b.label)
                );

                if (!currentGroupFabricKey) {
                    // CLICK 2: Selector de Color / Tela con foto de la tela
                    if (crumbEl) {
                        const colTxt = orderedFabrics.length === 1 ? '1 color / tela' : (orderedFabrics.length + ' colores / telas');
                        const modTxt = grp.items.length === 1 ? '1 módulo' : (grp.items.length + ' módulos');
                        crumbEl.textContent = colTxt + ' · ' + modTxt;
                        crumbEl.style.pointerEvents = 'none';
                        crumbEl.style.cursor = 'default';
                        crumbEl.classList.remove('hidden');
                    }
                    currentGroupFabricSingleSkuMap = new Map();
                    const choiceHtml = [];
                    for (let fIdx = 0; fIdx < orderedFabrics.length; fIdx++) {
                        const fb = orderedFabrics[fIdx];
                        const sampleIt = (fb.items && fb.items[0] && fb.items[0].it) || null;
                        if (fb.items && fb.items.length === 1 && sampleIt && sampleIt.s) {
                            currentGroupFabricSingleSkuMap.set(fb.key, sampleIt.s);
                        }
                        const swatchUrl = getFabricSwatchPhotoUrl(fb.key, sampleIt);
                        const swatchSrc = swatchUrl ? resolveVisualImgSrc(swatchUrl, 600) : '';
                        const swatchFid = swatchUrl ? extractDriveFileId(swatchUrl) : '';
                        const modCountTxt = fb.items.length === 1 ? '1 módulo disponible' : (fb.items.length + ' módulos disponibles');
                        const subMeta = fb.colorHint ? (fb.colorHint + ' · ' + modCountTxt) : modCountTxt;

                        const stageInner = swatchSrc
                            ? ('<img class="inv-fabric-choice-img" width="160" height="120" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" src="' + escapeHtml(swatchSrc) + '" alt="' + escapeHtml(fb.label) + '"' +
                               (swatchFid ? (' data-fid="' + escapeHtml(swatchFid) + '"') : '') +
                               ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                               '<button type="button" class="inv-fabric-choice-zoom" data-fabric-zoom-url="' + escapeHtml(swatchUrl) + '" data-fabric-zoom-label="' + escapeHtml('Tela · ' + fb.label) + '" title="Ampliar foto de tela" aria-label="Ampliar foto de tela">🔍</button>')
                            : ('<div class="inv-fabric-choice-empty"><span class="inv-fabric-choice-empty-ico" aria-hidden="true">🧵</span><span>Tela / Color</span></div>');

                        choiceHtml.push(
                            '<div class="inv-row inv-variant-card inv-fabric-choice-card" data-fabric-select-key="' + escapeHtml(fb.key) + '">' +
                                '<div class="inv-fabric-choice-stage">' + stageInner + '</div>' +
                                '<div class="inv-fabric-choice-body">' +
                                    '<div class="inv-fabric-choice-meta">' +
                                        '<div class="inv-fabric-choice-title">' + escapeHtml(fb.label) + '</div>' +
                                        '<div class="inv-fabric-choice-sub">' + escapeHtml(subMeta) + '</div>' +
                                    '</div>' +
                                    '<span class="inv-fabric-choice-arrow">Módulos →</span>' +
                                '</div>' +
                            '</div>'
                        );
                    }
                    varList.innerHTML = choiceHtml.join('');
                } else {
                    // CLICK 3: Módulos disponibles del Color / Tela seleccionado
                    const selectedFb = fabricBucketsByKey.get(currentGroupFabricKey);
                    if (nameEl) {
                        nameEl.textContent = grp.title + ' · ' + selectedFb.label;
                    }
                    if (crumbEl) {
                        crumbEl.textContent = '← Colores / Telas (' + orderedFabrics.length + ')';
                        crumbEl.style.pointerEvents = 'auto';
                        crumbEl.style.cursor = 'pointer';
                        crumbEl.classList.remove('hidden');
                    }

                    const sampleSelIt = (selectedFb.items && selectedFb.items[0] && selectedFb.items[0].it) || null;
                    const swatchUrl = getFabricSwatchPhotoUrl(selectedFb.key, sampleSelIt);
                    const swatchThumb = swatchUrl ? resolveVisualImgSrc(swatchUrl, 160) : '';
                    const swatchSelFid = swatchUrl ? extractDriveFileId(swatchUrl) : '';
                    const modCountTxt = selectedFb.items.length === 1 ? '1 módulo disponible' : (selectedFb.items.length + ' módulos disponibles');
                    const subMeta = selectedFb.colorHint ? (selectedFb.colorHint + ' · ' + modCountTxt) : modCountTxt;
                    const swatchInner = swatchThumb
                        ? '<img width="48" height="48" loading="lazy" decoding="async" src="' + escapeHtml(swatchThumb) + '" alt="' + escapeHtml(selectedFb.label) + '" referrerpolicy="no-referrer"' +
                          (swatchSelFid ? (' data-fid="' + escapeHtml(swatchSelFid) + '"') : '') +
                          ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">'
                        : '<span aria-hidden="true">🧵</span>';
                    const swatchClasses = 'inv-fabric-swatch' + (swatchThumb ? '' : ' is-empty is-readonly');
                    const swatchAttrs = swatchUrl
                        ? (' data-fabric-zoom-url="' + escapeHtml(swatchUrl) + '" data-fabric-zoom-label="' + escapeHtml('Tela · ' + selectedFb.label) + '" title="Ver foto de la tela"')
                        : ' disabled';

                    const htmlChunks = [
                        '<div class="inv-fabric-selected-bar" data-fabric-key="' + escapeHtml(selectedFb.key) + '">' +
                            '<div class="inv-fabric-head-left">' +
                                '<button type="button" class="' + swatchClasses + '"' + swatchAttrs + '>' + swatchInner + '</button>' +
                                '<div class="inv-fabric-meta">' +
                                    '<span class="inv-fabric-title">' + escapeHtml(selectedFb.label) + '</span>' +
                                    '<span class="inv-fabric-sub">' + escapeHtml(subMeta) + '</span>' +
                                '</div>' +
                            '</div>' +
                            '<button type="button" class="inv-fabric-back-btn" data-fabric-back="1">← Colores</button>' +
                        '</div>'
                    ];

                    const sortedMods = selectedFb.items.slice().sort((a, b) =>
                        (a.mod.rank - b.mod.rank) ||
                        compareAlphaEs(a.mod.label, b.mod.label) ||
                        compareAlphaEs(a.it.n || a.it.s, b.it.n || b.it.s) ||
                        String(a.it.s || '').localeCompare(String(b.it.s || ''))
                    );
                    const modLabelCounts = new Map();
                    for (let mIdx = 0; mIdx < sortedMods.length; mIdx++) {
                        const lbl = sortedMods[mIdx].mod.label;
                        modLabelCounts.set(lbl, (modLabelCounts.get(lbl) || 0) + 1);
                    }
                    for (let mIdx = 0; mIdx < sortedMods.length; mIdx++) {
                        const pair = sortedMods[mIdx];
                        let cardLabel = pair.mod.label;
                        if (modLabelCounts.get(cardLabel) > 1) {
                            const extraDetail = cleanStr(pair.it.m).toUpperCase() || cleanStr(pair.it.md).toUpperCase() || buildVariantLabel(pair.it, grp, pair.mod.stripTokens);
                            if (extraDetail && plainModelToken(extraDetail) !== plainModelToken(selectedFb.label) && cardLabel.indexOf(extraDetail) === -1) {
                                cardLabel = cardLabel + ' · ' + extraDetail;
                            }
                        }
                        htmlChunks.push(renderVariantCardHtml({ it: pair.it, varLabel: cardLabel }));
                    }
                    varList.innerHTML = htmlChunks.join('');
                }
            } else if (canGroupByBedSizeColor) {
                const grpHeadTitle = grp.displayTitle || grp.title;
                const sizeBucketsByKey = new Map();
                const allColorsSet = new Set();
                let allWoodOnly = true;

                for (let i = 0; i < grp.items.length; i++) {
                    const it = grp.items[i];
                    const sz = resolveItemBedSize(it);
                    const col = resolveItemBedColorOrFinish(it, grp);
                    const piece = resolveItemBedPieceInfo(it);
                    allColorsSet.add(col.key);
                    if (!col.isWood) allWoodOnly = false;

                    if (!sizeBucketsByKey.has(sz.key)) {
                        sizeBucketsByKey.set(sz.key, {
                            key: sz.key,
                            label: sz.label,
                            rank: sz.rank,
                            items: [],
                            pieceShortLabels: new Set(),
                            colorsByKey: new Map()
                        });
                    }
                    const sb = sizeBucketsByKey.get(sz.key);
                    sb.items.push(it);
                    if (piece && piece.shortLabel) sb.pieceShortLabels.add(piece.shortLabel);
                    if (!sb.colorsByKey.has(col.key)) {
                        sb.colorsByKey.set(col.key, {
                            key: col.key,
                            label: col.label,
                            colorHint: col.colorHint || '',
                            isWood: !!col.isWood,
                            items: []
                        });
                    }
                    const cb = sb.colorsByKey.get(col.key);
                    if (!cb.colorHint && col.colorHint) cb.colorHint = col.colorHint;
                    if (!col.isWood) cb.isWood = false;
                    cb.items.push({ it: it, piece: piece });
                }

                const orderedSizes = Array.from(sizeBucketsByKey.values()).sort((a, b) =>
                    (a.rank - b.rank) || compareAlphaEs(a.label, b.label)
                );
                for (let sIdx = 0; sIdx < orderedSizes.length; sIdx++) {
                    const sb = orderedSizes[sIdx];
                    sb.orderedColors = Array.from(sb.colorsByKey.values()).sort((a, b) =>
                        (b.items.length - a.items.length) || compareAlphaEs(a.label, b.label)
                    );
                }

                if (currentGroupBedSizeKey && !sizeBucketsByKey.has(currentGroupBedSizeKey)) {
                    currentGroupBedSizeKey = '';
                    currentGroupFabricKey = '';
                }

                const hasMultiSizes = orderedSizes.length >= 2;
                const effectiveSizeKey = hasMultiSizes ? currentGroupBedSizeKey : (orderedSizes[0] ? orderedSizes[0].key : '');

                if (hasMultiSizes && !effectiveSizeKey) {
                    // PASO 1 CAMAS: Selector de Tamaño (Individual, Matrimonial, Queen Size, King Size, etc.)
                    currentGroupFabricKey = '';
                    currentGroupFabricSingleSkuMap = new Map();
                    if (nameEl) nameEl.textContent = grpHeadTitle;
                    if (crumbEl) {
                        const szTxt = orderedSizes.length + ' tamaños';
                        const colCountAll = allColorsSet.size;
                        const colTxt = colCountAll === 1
                            ? (allWoodOnly ? '1 acabado' : '1 color / tela')
                            : (colCountAll + (allWoodOnly ? ' acabados' : ' colores / telas'));
                        const pzTxt = grp.items.length === 1 ? '1 pieza' : (grp.items.length + ' piezas');
                        crumbEl.textContent = szTxt + ' · ' + colTxt + ' · ' + pzTxt;
                        crumbEl.style.pointerEvents = 'none';
                        crumbEl.style.cursor = 'default';
                        crumbEl.classList.remove('hidden');
                    }

                    const sizeHtml = [];
                    for (let sIdx = 0; sIdx < orderedSizes.length; sIdx++) {
                        const sb = orderedSizes[sIdx];
                        const samplePhotoIt = firstPhotoItem(sb.items);
                        const photoUrl = samplePhotoIt ? photoUrlForItem(samplePhotoIt) : '';
                        const photoSrc = photoUrl ? resolveVisualImgSrc(photoUrl, 520) : '';
                        const photoFid = photoUrl ? extractDriveFileId(photoUrl) : '';
                        const sbAllWood = sb.orderedColors.length > 0 && sb.orderedColors.every(c => c.isWood);
                        const colCountTxt = sb.orderedColors.length === 1
                            ? (sbAllWood ? '1 acabado' : '1 color')
                            : (sb.orderedColors.length + (sbAllWood ? ' acabados' : ' colores'));
                        const pieceTxt = Array.from(sb.pieceShortLabels).join(' + ');
                        const pzTxt = sb.items.length === 1 ? '1 pza' : (sb.items.length + ' pzas');
                        const subMeta = [colCountTxt, pieceTxt, pzTxt].filter(Boolean).join(' · ');
                        const arrowTxt = sb.orderedColors.length >= 2
                            ? (sbAllWood ? 'Acabados →' : 'Colores →')
                            : 'Piezas →';

                        const stageInner = photoSrc
                            ? ('<img class="inv-bed-size-img" width="160" height="120" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" src="' + escapeHtml(photoSrc) + '" alt="' + escapeHtml(grpHeadTitle + ' ' + sb.label) + '"' +
                               (photoFid ? (' data-fid="' + escapeHtml(photoFid) + '"') : '') +
                               ' onerror="window.__invHandleCardImgError&&window.__invHandleCardImgError(this)">')
                            : ('<div class="inv-fabric-choice-empty"><span class="inv-fabric-choice-empty-ico" aria-hidden="true">🛏️</span><span>' + escapeHtml(sb.label) + '</span></div>');

                        sizeHtml.push(
                            '<div class="inv-row inv-variant-card inv-bed-size-card" data-bed-size-select-key="' + escapeHtml(sb.key) + '">' +
                                '<div class="inv-bed-size-stage">' +
                                    '<span class="inv-bed-size-pill">' + escapeHtml(sb.label) + '</span>' +
                                    stageInner +
                                '</div>' +
                                '<div class="inv-fabric-choice-body">' +
                                    '<div class="inv-fabric-choice-meta">' +
                                        '<div class="inv-bed-size-title">' + escapeHtml(sb.label) + '</div>' +
                                        '<div class="inv-fabric-choice-sub">' + escapeHtml(subMeta) + '</div>' +
                                    '</div>' +
                                    '<span class="inv-fabric-choice-arrow">' + escapeHtml(arrowTxt) + '</span>' +
                                '</div>' +
                            '</div>'
                        );
                    }
                    varList.innerHTML = sizeHtml.join('');
                } else {
                    const selectedSb = sizeBucketsByKey.get(effectiveSizeKey) || orderedSizes[0];
                    if (currentGroupFabricKey && !selectedSb.colorsByKey.has(currentGroupFabricKey)) {
                        currentGroupFabricKey = '';
                    }
                    const sbAllWood = selectedSb.orderedColors.length > 0 && selectedSb.orderedColors.every(c => c.isWood);
                    const hasMultiColorsInSize = selectedSb.orderedColors.length >= 2;

                    if (hasMultiColorsInSize && !currentGroupFabricKey) {
                        // PASO 2 CAMAS: Selector de Color de Tela / Acabado Madera dentro del Tamaño
                        if (nameEl) {
                            nameEl.textContent = selectedSb.key === 'UNSPECIFIED'
                                ? grpHeadTitle
                                : (grpHeadTitle + ' · ' + selectedSb.label);
                        }
                        if (crumbEl) {
                            if (hasMultiSizes) {
                                crumbEl.textContent = '← Tamaños (' + orderedSizes.length + ')';
                                crumbEl.style.pointerEvents = 'auto';
                                crumbEl.style.cursor = 'pointer';
                            } else {
                                const colTxt = selectedSb.orderedColors.length + (sbAllWood ? ' acabados' : ' colores / telas');
                                const pzTxt = selectedSb.items.length === 1 ? '1 pieza' : (selectedSb.items.length + ' piezas');
                                crumbEl.textContent = selectedSb.label + ' · ' + colTxt + ' · ' + pzTxt;
                                crumbEl.style.pointerEvents = 'none';
                                crumbEl.style.cursor = 'default';
                            }
                            crumbEl.classList.remove('hidden');
                        }

                        const choiceHtml = [];
                        if (hasMultiSizes) {
                            const barSub = selectedSb.orderedColors.length + (sbAllWood ? ' acabados disponibles' : ' colores / telas disponibles');
                            choiceHtml.push(
                                '<div class="inv-fabric-selected-bar inv-bed-selected-bar" data-bed-size-key="' + escapeHtml(selectedSb.key) + '">' +
                                    '<div class="inv-fabric-head-left">' +
                                        '<span class="inv-bed-size-chip">' + escapeHtml(selectedSb.label) + '</span>' +
                                        '<div class="inv-fabric-meta">' +
                                            '<span class="inv-fabric-sub">' + escapeHtml(barSub) + '</span>' +
                                        '</div>' +
                                    '</div>' +
                                    '<button type="button" class="inv-fabric-back-btn" data-bed-size-back="1">← Tamaños</button>' +
                                '</div>'
                            );
                        }

                        currentGroupFabricSingleSkuMap = new Map();
                        for (let cIdx = 0; cIdx < selectedSb.orderedColors.length; cIdx++) {
                            const fb = selectedSb.orderedColors[cIdx];
                            const sampleIt = (fb.items && fb.items[0] && fb.items[0].it) || null;
                            if (fb.items && fb.items.length === 1 && sampleIt && sampleIt.s) {
                                currentGroupFabricSingleSkuMap.set(fb.key, sampleIt.s);
                            }
                            const swatchUrl = fb.isWood ? getWoodSwatchPhotoUrl(fb.key, sampleIt) : getFabricSwatchPhotoUrl(fb.key, sampleIt);
                            const swatchSrc = swatchUrl ? resolveVisualImgSrc(swatchUrl, 600) : '';
                            const swatchFid = swatchUrl ? extractDriveFileId(swatchUrl) : '';
                            const pzCountTxt = fb.items.length === 1 ? '1 pieza disponible' : (fb.items.length + ' piezas disponibles');
                            const subMeta = fb.colorHint ? (fb.colorHint + ' · ' + pzCountTxt) : (fb.isWood ? ('🪵 Acabado Madera · ' + pzCountTxt) : pzCountTxt);
                            const zoomTitle = fb.isWood ? 'Ampliar foto de madera' : 'Ampliar foto de tela';
                            const zoomPrefix = fb.isWood ? 'Madera · ' : 'Tela · ';

                            const stageInner = swatchSrc
                                ? ('<img class="inv-fabric-choice-img" width="160" height="120" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" src="' + escapeHtml(swatchSrc) + '" alt="' + escapeHtml(fb.label) + '"' +
                                   (swatchFid ? (' data-fid="' + escapeHtml(swatchFid) + '"') : '') +
                                   ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                                   '<button type="button" class="inv-fabric-choice-zoom" data-fabric-zoom-url="' + escapeHtml(swatchUrl) + '" data-fabric-zoom-label="' + escapeHtml(zoomPrefix + fb.label) + '" title="' + zoomTitle + '" aria-label="' + zoomTitle + '">🔍</button>')
                                : (fb.isWood
                                    ? '<div class="inv-fabric-choice-empty"><span class="inv-fabric-choice-empty-ico" aria-hidden="true">🪵</span><span>Acabado Madera</span></div>'
                                    : '<div class="inv-fabric-choice-empty"><span class="inv-fabric-choice-empty-ico" aria-hidden="true">🧵</span><span>Tela / Color</span></div>');

                            choiceHtml.push(
                                '<div class="inv-row inv-variant-card inv-fabric-choice-card" data-fabric-select-key="' + escapeHtml(fb.key) + '">' +
                                    '<div class="inv-fabric-choice-stage">' + stageInner + '</div>' +
                                    '<div class="inv-fabric-choice-body">' +
                                        '<div class="inv-fabric-choice-meta">' +
                                            '<div class="inv-fabric-choice-title">' + escapeHtml(fb.label) + '</div>' +
                                            '<div class="inv-fabric-choice-sub">' + escapeHtml(subMeta) + '</div>' +
                                        '</div>' +
                                        '<span class="inv-fabric-choice-arrow">Piezas →</span>' +
                                    '</div>' +
                                '</div>'
                            );
                        }
                        varList.innerHTML = choiceHtml.join('');
                    } else {
                        // PASO 3 CAMAS: Piezas disponibles (Cama / Base de Cama / Cabecera) para (Tamaño, Color/Madera)
                        const selectedFb = (hasMultiColorsInSize && currentGroupFabricKey)
                            ? selectedSb.colorsByKey.get(currentGroupFabricKey)
                            : selectedSb.orderedColors[0];
                        if (nameEl) {
                            nameEl.textContent = grpHeadTitle + ' · ' + selectedSb.label + ' · ' + selectedFb.label;
                        }
                        if (crumbEl) {
                            if (hasMultiColorsInSize) {
                                crumbEl.textContent = '← ' + (selectedFb.isWood ? 'Acabados' : 'Colores / Telas') + ' (' + selectedSb.orderedColors.length + ') · ' + selectedSb.label;
                                crumbEl.style.pointerEvents = 'auto';
                                crumbEl.style.cursor = 'pointer';
                            } else if (hasMultiSizes) {
                                crumbEl.textContent = '← Tamaños (' + orderedSizes.length + ')';
                                crumbEl.style.pointerEvents = 'auto';
                                crumbEl.style.cursor = 'pointer';
                            } else {
                                crumbEl.textContent = selectedSb.label + ' · ' + selectedFb.label + ' · ' + selectedFb.items.length + ' piezas';
                                crumbEl.style.pointerEvents = 'none';
                                crumbEl.style.cursor = 'default';
                            }
                            crumbEl.classList.remove('hidden');
                        }

                        const sampleSelIt = (selectedFb.items && selectedFb.items[0] && selectedFb.items[0].it) || null;
                        const swatchUrl = selectedFb.isWood ? getWoodSwatchPhotoUrl(selectedFb.key, sampleSelIt) : getFabricSwatchPhotoUrl(selectedFb.key, sampleSelIt);
                        const swatchThumb = swatchUrl ? resolveVisualImgSrc(swatchUrl, 160) : '';
                        const swatchSelFid = swatchUrl ? extractDriveFileId(swatchUrl) : '';
                        const pzCountTxt = selectedFb.items.length === 1 ? '1 pieza disponible' : (selectedFb.items.length + ' piezas disponibles');
                        const subMeta = selectedFb.colorHint ? (selectedFb.colorHint + ' · ' + pzCountTxt) : (selectedFb.isWood ? ('🪵 Acabado Madera · ' + pzCountTxt) : pzCountTxt);
                        const swatchInner = swatchThumb
                            ? '<img width="48" height="48" loading="lazy" decoding="async" src="' + escapeHtml(swatchThumb) + '" alt="' + escapeHtml(selectedFb.label) + '" referrerpolicy="no-referrer"' +
                              (swatchSelFid ? (' data-fid="' + escapeHtml(swatchSelFid) + '"') : '') +
                              ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">'
                            : '<span aria-hidden="true">' + (selectedFb.isWood ? '🪵' : '🧵') + '</span>';
                        const swatchClasses = 'inv-fabric-swatch' + (swatchThumb ? '' : ' is-empty is-readonly');
                        const selZoomPrefix = selectedFb.isWood ? 'Madera · ' : 'Tela · ';
                        const selZoomTitle = selectedFb.isWood ? 'Ver foto de la madera' : 'Ver foto de la tela';
                        const swatchAttrs = swatchUrl
                            ? (' data-fabric-zoom-url="' + escapeHtml(swatchUrl) + '" data-fabric-zoom-label="' + escapeHtml(selZoomPrefix + selectedFb.label) + '" title="' + selZoomTitle + '"')
                            : ' disabled';
                        let backBtnHtml = '';
                        if (hasMultiColorsInSize) {
                            backBtnHtml = '<button type="button" class="inv-fabric-back-btn" data-fabric-back="1">← ' + (selectedFb.isWood ? 'Acabados' : 'Colores') + '</button>';
                        } else if (hasMultiSizes) {
                            backBtnHtml = '<button type="button" class="inv-fabric-back-btn" data-bed-size-back="1">← Tamaños</button>';
                        }

                        const htmlChunks = [
                            '<div class="inv-fabric-selected-bar inv-bed-selected-bar" data-fabric-key="' + escapeHtml(selectedFb.key) + '" data-bed-size-key="' + escapeHtml(selectedSb.key) + '">' +
                                '<div class="inv-fabric-head-left">' +
                                    '<button type="button" class="' + swatchClasses + '"' + swatchAttrs + '>' + swatchInner + '</button>' +
                                    '<div class="inv-fabric-meta">' +
                                        '<span class="inv-fabric-title">' + escapeHtml(selectedFb.label) + ' <span class="inv-bed-size-chip">' + escapeHtml(selectedSb.label) + '</span></span>' +
                                        '<span class="inv-fabric-sub">' + escapeHtml(subMeta) + '</span>' +
                                    '</div>' +
                                '</div>' +
                                backBtnHtml +
                            '</div>'
                        ];

                        const sortedPieces = selectedFb.items.slice().sort((a, b) =>
                            (a.piece.rank - b.piece.rank) ||
                            compareAlphaEs(a.piece.label, b.piece.label) ||
                            compareAlphaEs(a.it.n || a.it.s, b.it.n || b.it.s) ||
                            String(a.it.s || '').localeCompare(String(b.it.s || ''))
                        );
                        const pieceBuckets = new Map();
                        for (let pIdx = 0; pIdx < sortedPieces.length; pIdx++) {
                            const lbl = sortedPieces[pIdx].piece.label;
                            if (!pieceBuckets.has(lbl)) pieceBuckets.set(lbl, []);
                            pieceBuckets.get(lbl).push(sortedPieces[pIdx]);
                        }
                        for (let pIdx = 0; pIdx < sortedPieces.length; pIdx++) {
                            const pair = sortedPieces[pIdx];
                            let cardLabel = pair.piece.label;
                            const siblings = pieceBuckets.get(cardLabel) || [];
                            if (siblings.length > 1) {
                                // Desambiguación general cuando varias piezas comparten Tamaño + Color + Tipo (ej. madera Parota vs Rosa Morada, Tabaco vs Tacuba, Sin Cinchos)
                                const distinctMds = new Set(siblings.map(s => plainModelToken(cleanStr(s.it.md))).filter(Boolean));
                                const distinctCms = new Set(siblings.map(s => plainModelToken(cleanStr(s.it.cm)).replace(/^LACA\s+/, '')).filter(Boolean));
                                let diffDetail = '';
                                if (distinctMds.size > 1 && cleanStr(pair.it.md)) {
                                    diffDetail = cleanStr(pair.it.md).toUpperCase();
                                } else if (distinctCms.size > 1 && cleanStr(pair.it.cm)) {
                                    diffDetail = cleanStr(pair.it.cm).toUpperCase();
                                } else {
                                    // Buscar tokens diferenciadores únicos en el nombre entre hermanos (ej. "SIN CINCHOS")
                                    const tokenSets = siblings.map(s => new Set(plainModelToken(stripDimensionsFromProductText(s.it.n)).split(/\s+/).filter(Boolean)));
                                    const myTokens = plainModelToken(stripDimensionsFromProductText(pair.it.n)).split(/\s+/).filter(Boolean);
                                    const uniqueToks = myTokens.filter(tok => tokenSets.some(ts => !ts.has(tok)));
                                    if (uniqueToks.length > 0) {
                                        diffDetail = uniqueToks.join(' ');
                                    } else {
                                        const cmVal = cleanStr(pair.it.cm).toUpperCase();
                                        const mdVal = cleanStr(pair.it.md).toUpperCase();
                                        const medVal = cleanStr(pair.it.m).toUpperCase();
                                        diffDetail = cmVal || mdVal || medVal || pair.it.s;
                                    }
                                }
                                if (diffDetail && plainModelToken(diffDetail) !== plainModelToken(selectedFb.label) && cardLabel.indexOf(diffDetail) === -1) {
                                    cardLabel = cardLabel + ' · ' + diffDetail;
                                }
                            }
                            htmlChunks.push(renderVariantCardHtml({ it: pair.it, varLabel: cardLabel }));
                        }
                        varList.innerHTML = htmlChunks.join('');
                    }
                }
            } else {
                currentGroupFabricKey = '';
                currentGroupBedSizeKey = '';
                currentGroupFabricSingleSkuMap = new Map();
                const baseLabels = grp.items.map(it => buildVariantLabel(it, grp, null));
                const labelCounts = new Map();
                for (let i = 0; i < baseLabels.length; i++) {
                    labelCounts.set(baseLabels[i], (labelCounts.get(baseLabels[i]) || 0) + 1);
                }

                const variantEntries = grp.items.map((it, idx) => {
                    let varLabel = baseLabels[idx];
                    const medUpper = cleanStr(it.m).toUpperCase();
                    if (medUpper && labelCounts.get(varLabel) > 1 && varLabel.indexOf(medUpper) === -1) {
                        varLabel = varLabel + ' · ' + medUpper;
                    }
                    return { it: it, varLabel: varLabel };
                });

                variantEntries.sort((a, b) =>
                    compareAlphaEs(a.varLabel, b.varLabel) ||
                    compareAlphaEs(a.it.n || a.it.s, b.it.n || b.it.s) ||
                    String(a.it.s || '').localeCompare(String(b.it.s || ''))
                );

                varList.innerHTML = variantEntries.map(renderVariantCardHtml).join('');
            }

            if (varList.classList) {
                const rawVarHtml = String(varList.innerHTML || '');
                const isCompactChoiceGrid = rawVarHtml.indexOf('inv-fabric-choice-card') !== -1 || rawVarHtml.indexOf('inv-bed-size-card') !== -1;
                varList.classList.toggle('inv-variants-compact-choices', isCompactChoiceGrid);
            }

            varList.querySelectorAll('[data-bed-size-select-key]').forEach(cardEl => {
                cardEl.onclick = function () {
                    const sKey = cardEl.getAttribute('data-bed-size-select-key') || '';
                    if (sKey) window.selectGroupBedSizeStep(sKey);
                };
            });
            varList.querySelectorAll('[data-bed-size-back]').forEach(btnEl => {
                btnEl.onclick = function (ev) {
                    if (ev && ev.stopPropagation) ev.stopPropagation();
                    window.backToCurrentGroupVariants();
                };
            });
            varList.querySelectorAll('[data-fabric-select-key]').forEach(cardEl => {
                cardEl.onclick = function () {
                    const fKey = cardEl.getAttribute('data-fabric-select-key') || '';
                    if (fKey) window.selectGroupFabricStep(fKey);
                };
            });
            varList.querySelectorAll('[data-fabric-back]').forEach(btnEl => {
                btnEl.onclick = function (ev) {
                    if (ev && ev.stopPropagation) ev.stopPropagation();
                    window.backToCurrentGroupVariants();
                };
            });
            varList.querySelectorAll('[data-fabric-zoom-url]').forEach(btnEl => {
                btnEl.onclick = function (ev) {
                    if (ev && ev.stopPropagation) ev.stopPropagation();
                    const zUrl = btnEl.getAttribute('data-fabric-zoom-url');
                    const zLbl = btnEl.getAttribute('data-fabric-zoom-label') || 'Foto de tela';
                    openVisualPhotoLightbox(zUrl, zLbl);
                };
            });
            varList.querySelectorAll('.inv-row[data-var-sku]').forEach(rowEl => {
                const sku = rowEl.getAttribute('data-var-sku');
                rowEl.onclick = function () {
                    openProductDetail(sku, true);
                };
                const ctrlWrap = rowEl.querySelector('[data-sku-ctrl]');
                bindCardCartControlEvents(ctrlWrap, sku);
            });
            if (window.CreataGuard && typeof window.CreataGuard.protectImages === 'function') {
                window.CreataGuard.protectImages(varList);
            }
        }

        if (varStep) varStep.classList.remove('hidden');
        if (singleStep) singleStep.classList.add('hidden');
        prepareRelatedInStockSection(grp && grp.items && grp.items.length ? grp.items[0] : null, false);
    }

    window.selectGroupBedSizeStep = function (sizeKey) {
        if (!currentGroup || !sizeKey) return false;
        currentGroupBedSizeKey = String(sizeKey).trim();
        currentGroupFabricKey = '';
        renderGroupVariantsStep(currentGroup, '', currentGroupBedSizeKey);
        if (!invWorkspaceRestoring) notifyInvBackStatePush('product_bed_size_step');
        return true;
    };

    window.selectGroupFabricStep = function (fabricKey) {
        if (!currentGroup || !fabricKey) return false;
        const cleanKey = String(fabricKey).trim();
        const singleSku = currentGroupFabricSingleSkuMap.get(cleanKey) || '';
        if (singleSku) {
            currentGroupFabricKey = '';
            return openProductDetail(singleSku, true);
        }
        currentGroupFabricKey = cleanKey;
        renderGroupVariantsStep(currentGroup, currentGroupFabricKey, currentGroupBedSizeKey);
        if (!invWorkspaceRestoring) notifyInvBackStatePush('product_fabric_modules');
        return true;
    };

    function resolveActiveGroup(groupKey) {
        if (!groupKey) return null;
        if (activeFilteredGroupsByKey.has(groupKey)) {
            return activeFilteredGroupsByKey.get(groupKey);
        }
        return groupsByKey.get(groupKey) || null;
    }

    window.openGroupModal = function (groupKey, preserveFabricKey) {
        const grp = resolveActiveGroup(groupKey);
        if (!grp) return false;
        if (grp.items.length === 1) {
            currentGroupFabricKey = '';
            currentGroupBedSizeKey = '';
            return openProductDetail(grp.items[0].s, false);
        }

        if (!preserveFabricKey) {
            currentGroupFabricKey = '';
            currentGroupBedSizeKey = '';
        }
        renderGroupVariantsStep(grp);

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        if (!invWorkspaceRestoring && !preserveFabricKey) notifyInvBackStatePush('product_group_modal');
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
        refreshLiveSheetNow(false);
        return true;
    };

    window.backToCurrentGroupVariants = function () {
        if (!currentGroup || currentGroup.items.length <= 1) return;
        const singleStep = document.getElementById('detSingleStep');
        const inSingleDetail = !!(currentDetailItem || (singleStep && !singleStep.classList.contains('hidden')));
        if (inSingleDetail) {
            // Desde Detalle de SKU regresar a los Módulos / Piezas del tamaño y color seleccionado
            openGroupModal(currentGroup.key, true);
            return;
        }
        if (currentGroupFabricKey) {
            // Desde Paso 3 regresar a Colores / Telas (conservando tamaño si aplica)
            currentGroupFabricKey = '';
            renderGroupVariantsStep(currentGroup, '', currentGroupBedSizeKey);
            return;
        }
        if (currentGroupBedSizeKey) {
            // Desde Paso 2 (o Paso 3 con 1 solo color) de Camas regresar a Tamaños
            currentGroupBedSizeKey = '';
            renderGroupVariantsStep(currentGroup, '', '');
        }
    };

    // ------------------------------------------------------------------------
    // PASO 2: DETALLE DE VARIANTE SELECCIONADA O ESCANEADA DIRECTO POR SKU
    // ------------------------------------------------------------------------
    window.openProductDetail = function (skuRaw, fromGroupList, allowHidden) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return false;
        // Piezas sin existencia en Bodega/Piso ni LPPT (con precio ERP) no se muestran en el cotizador
        // (solo se permite abrirlas desde una partida que ya estaba en la cotización).
        if (!allowHidden && !isQuotableItem(it)) return false;

        currentDetailItem = it;
        if (!fromGroupList) {
            const grp = resolveActiveGroup(it._groupKey);
            currentGroup = (grp && grp.items.length > 1) ? grp : null;
            currentGroupFabricKey = '';
            currentGroupBedSizeKey = '';
        }

        renderDetailModal(it, !!fromGroupList);

        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        if (varStep) varStep.classList.add('hidden');
        if (singleStep) singleStep.classList.remove('hidden');

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        try {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.id === 'invSearchInput') {
                if (typeof activeEl.select === 'function') activeEl.select();
                if (typeof activeEl.setSelectionRange === 'function') {
                    activeEl.setSelectionRange(0, String(activeEl.value || '').length);
                }
                if (typeof activeEl.blur === 'function') activeEl.blur();
            }
        } catch (eBlur) {}
        if (!invWorkspaceRestoring) notifyInvBackStatePush('product_detail_modal');
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
        refreshLiveSheetNow(false);
        return true;
    };

    let visualDiscActiveSku = '';

    window.updateDetailVisualDiscount = function () {
        const discBox = document.getElementById('detVisualDiscBox');
        const discInp = document.getElementById('detVisualDiscInput');
        const finalBox = document.getElementById('detVisualFinalBox');
        const finalLbl = document.getElementById('detVisualFinalLabel');
        const finalPriceEl = document.getElementById('detVisualFinalPrice');
        const guestMode = typeof isGuestSession === 'function' && isGuestSession();
        if (guestMode) {
            if (discInp) discInp.value = '';
            if (discBox) discBox.classList.add('hidden');
            if (finalBox) finalBox.classList.add('hidden');
            if (finalPriceEl) finalPriceEl.textContent = '';
            return;
        }
        if (discBox) discBox.classList.remove('hidden');
        if (finalBox) finalBox.classList.remove('hidden');
        if (!finalPriceEl) return;

        const baseNum = currentDetailItem ? parsePriceNum(currentDetailItem.pr) : 0;
        if (baseNum <= 0) {
            finalPriceEl.textContent = '';
            return;
        }

        const rawStr = discInp ? String(discInp.value || '').replace(',', '.').trim() : '';
        let pct = rawStr === '' ? 0 : parseFloat(rawStr);
        if (isNaN(pct) || !isFinite(pct) || pct < 0) {
            pct = 0;
        } else if (pct > 100) {
            pct = 100;
            if (discInp) discInp.value = '100';
        }

        const discountedNum = Math.max(0, Math.round((baseNum * (1 - pct / 100)) * 100) / 100);
        finalPriceEl.textContent = '$' + discountedNum.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const hasActiveDisc = pct > 0;
        if (finalBox) {
            finalBox.style.borderColor = hasActiveDisc ? '#A7F3D0' : '#E1DBC5';
            finalBox.style.background = hasActiveDisc ? '#ECFDF5' : '#FAF9F6';
        }
        if (finalLbl) {
            finalLbl.style.color = hasActiveDisc ? '#065F46' : '#252C32';
        }
        finalPriceEl.style.color = hasActiveDisc ? '#065F46' : '#252C32';
    };

    window.closeProductDetail = function () {
        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.remove('open');
        currentDetailItem = null;
        currentGroup = null;
        currentGroupFabricKey = '';
        currentGroupBedSizeKey = '';
        currentGroupFabricSingleSkuMap = new Map();
        relatedStockExpanded = false;
        const relPanel = document.getElementById('detRelatedStockPanel');
        if (relPanel) relPanel.classList.add('hidden');
        visualDiscActiveSku = '';
        if (!invWorkspaceRestoring) {
            pendingWorkspaceDetailRestore = null;
        }
        const discInp = document.getElementById('detVisualDiscInput');
        if (discInp) discInp.value = '';
        if (typeof scheduleSaveInvWorkspaceCheckpoint === 'function') {
            scheduleSaveInvWorkspaceCheckpoint();
        }
    };

    function renderDetailModal(it, showGroupBack) {
        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const discInp = document.getElementById('detVisualDiscInput');
        const actionsRow = document.getElementById('detHeaderActionsRow');
        const addPillWrap = document.getElementById('detAddPillWrap');
        const addBtn = document.getElementById('detAddCartBtn');
        const subBtn = document.getElementById('detSubCartBtn');
        const remAllBtn = document.getElementById('detRemoveAllCartBtn');
        const oosBtn = document.getElementById('detOutOfStockRequestBtn');
        const guestMode = typeof isGuestSession === 'function' && isGuestSession();

        if (crumbEl) {
            if (showGroupBack && currentGroup && currentGroup.items.length > 1) {
                const grpLbl = currentGroup.displayTitle || currentGroup.title;
                const crumbParts = [];
                if (currentGroupBedSizeKey) {
                    const szObj = resolveItemBedSize(it);
                    crumbParts.push(szObj && szObj.key === currentGroupBedSizeKey ? szObj.label : currentGroupBedSizeKey);
                }
                if (currentGroupFabricKey) crumbParts.push(currentGroupFabricKey);
                crumbParts.push(grpLbl);
                crumbEl.textContent = '← ' + crumbParts.join(' · ');
                crumbEl.style.pointerEvents = 'auto';
                crumbEl.style.cursor = 'pointer';
                crumbEl.classList.remove('hidden');
            } else {
                crumbEl.textContent = '';
                crumbEl.style.pointerEvents = 'none';
                crumbEl.style.cursor = 'default';
                crumbEl.classList.add('hidden');
            }
        }

        if (skuEl) {
            skuEl.textContent = it.s || '';
            skuEl.classList.toggle('hidden', !it.s);
        }

        const keyUpperForDisc = String(it.s || '').toUpperCase();
        if (visualDiscActiveSku !== keyUpperForDisc || guestMode) {
            visualDiscActiveSku = keyUpperForDisc;
            if (discInp) discInp.value = '';
        }

        const baseTitle = cleanStr(it.n) || cleanStr(it._groupTitle) || it.s || '';
        const formattedPrice = formatPrice(it.pr);
        if (nameEl) {
            nameEl.textContent = baseTitle;
        }
        // Precio adentro del recuadro de inventario + calculadora visual de descuento al costado (oculta para Invitados Solo Ver)
        if (priceEl && priceWrapEl) {
            if (formattedPrice) {
                priceEl.textContent = formattedPrice;
                priceWrapEl.classList.remove('hidden');
                updateDetailVisualDiscount();
            } else {
                priceEl.textContent = '';
                priceWrapEl.classList.add('hidden');
            }
        }

        const key = String(it.s || '').toUpperCase();
        const q = (!guestMode && cart[key]) ? (Number(cart[key].qty) || 0) : 0;
        if (guestMode) {
            if (actionsRow) actionsRow.classList.add('hidden');
            if (addPillWrap) addPillWrap.classList.add('hidden');
            if (addBtn) addBtn.classList.add('hidden');
            if (subBtn) subBtn.classList.add('hidden');
            if (remAllBtn) remAllBtn.classList.add('hidden');
            if (oosBtn) oosBtn.classList.add('hidden');
        } else {
            if (actionsRow) actionsRow.classList.remove('hidden');
            if (addPillWrap) addPillWrap.classList.remove('hidden');
            if (addBtn) {
                addBtn.classList.remove('hidden');
                addBtn.textContent = q > 0 ? ('Agregar (' + q + ')') : 'Agregar';
            }
            if (subBtn) {
                subBtn.classList.toggle('hidden', q <= 0);
            }
            if (remAllBtn) {
                remAllBtn.classList.add('hidden');
            }
            if (oosBtn) {
                oosBtn.classList.remove('hidden');
            }
        }

        // Cuadro de foto renderizado en canvas protegido con auto-encuadre parejo (78%)
        const driveId = extractDriveFileId(it.f);
        const photoUrl = driveId ? ('https://lh3.googleusercontent.com/d/' + driveId + '=w1000') : resolveDriveOrImgUrl(it.f);
        const stageEl = document.getElementById('detPhotoCanvasStage');
        const imgEl = document.getElementById('detPhotoImg');
        const emptyEl = document.getElementById('detPhotoEmpty');
        if (imgEl) {
            imgEl.onerror = null;
            imgEl.onload = null;
            imgEl.src = '';
            imgEl.style.removeProperty('--opt-scale');
            imgEl.style.removeProperty('--opt-tx');
            imgEl.style.removeProperty('--opt-ty');
            imgEl.classList.add('hidden');
        }
        if (photoUrl && !(driveId && failedDrivePhotoIds.has(driveId))) {
            if (emptyEl) emptyEl.classList.add('hidden');
            if (stageEl && window.CreataGuard && typeof window.CreataGuard.renderCanvasImage === 'function') {
                stageEl.innerHTML = '';
                stageEl.classList.remove('hidden');
                window.CreataGuard.renderCanvasImage(stageEl, photoUrl, baseTitle, function (reason) {
                    const reasonMsg = typeof reason === 'string' ? reason : (reason && reason.message ? String(reason.message) : '');
                    if (reasonMsg === 'image_load_error') {
                        if (driveId) failedDrivePhotoIds.add(driveId);
                        stageEl.innerHTML = '';
                        stageEl.classList.add('hidden');
                        if (emptyEl) emptyEl.classList.remove('hidden');
                    }
                }, { autoFrame: true, targetFill: OPTFIT_TARGET_FILL });
            } else if (imgEl) {
                if (stageEl) {
                    stageEl.innerHTML = '';
                    stageEl.classList.add('hidden');
                }
                imgEl.setAttribute('referrerpolicy', 'no-referrer');
                imgEl.setAttribute('crossorigin', 'anonymous');
                imgEl.setAttribute('draggable', 'false');
                imgEl.setAttribute('data-card-img', '1');
                imgEl.setAttribute('data-box-ratio', (4 / 3).toFixed(4));
                if (driveId) imgEl.setAttribute('data-fid', driveId);
                else imgEl.removeAttribute('data-fid');
                imgEl.onload = function () {
                    if (typeof window.__invOnCardImgLoad === 'function') window.__invOnCardImgLoad(imgEl);
                };
                imgEl.src = photoUrl;
                imgEl.classList.remove('hidden');
                imgEl.onerror = function () {
                    const step = parseInt(imgEl.getAttribute('data-fb-step') || '0', 10);
                    if (driveId && step === 0) {
                        imgEl.setAttribute('data-fb-step', '1');
                        try { imgEl.removeAttribute('crossorigin'); } catch (e) {}
                        imgEl.crossOrigin = null;
                        imgEl.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(driveId) + '=w1000';
                        return;
                    }
                    if (driveId && step === 1) {
                        imgEl.setAttribute('data-fb-step', '2');
                        imgEl.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveId) + '&sz=w1000';
                        return;
                    }
                    if (driveId && step === 2) {
                        imgEl.setAttribute('data-fb-step', '3');
                        imgEl.src = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(driveId);
                        return;
                    }
                    imgEl.onerror = null;
                    if (driveId) failedDrivePhotoIds.add(driveId);
                    imgEl.classList.add('hidden');
                    if (emptyEl) emptyEl.classList.remove('hidden');
                };
                if (window.CreataGuard && typeof window.CreataGuard.protectImages === 'function') {
                    window.CreataGuard.protectImages(document.getElementById('detPhotoWrap'));
                }
            }
        } else {
            if (stageEl) {
                stageEl.innerHTML = '';
                stageEl.classList.add('hidden');
            }
            if (emptyEl) emptyEl.classList.remove('hidden');
        }

        const sameSkuRefresh = !!(relatedStockRefSku && relatedStockRefSku === key);
        refreshDetailManagerPhotoControls(it, sameSkuRefresh);

        // Stock Total (solo las 10 ubicaciones físicas Bodega/Piso) y Semáforo + LPPT
        const stocks = Array.isArray(it.st) ? it.st : emptyStocks();
        let totalBodegaPiso = 0;
        const whHtml = [];

        for (let i = 0; i < WAREHOUSES.length; i++) {
            const whName = WAREHOUSES[i];
            const isLppt = isLpptWarehouse(whName);
            const qty = Math.max(0, Number(stocks[i]) || 0);
            if (!isLppt) {
                totalBodegaPiso += qty;
            }

            let semClass = 'sem-green';
            let dotColor = '#10B981';
            if (qty <= 0) {
                semClass = 'sem-red';
                dotColor = '#EF4444';
            } else if (qty <= DEFAULT_MIN_STOCK) {
                semClass = 'sem-yellow';
                dotColor = '#F59E0B';
            }

            const spanClass = isLppt ? ' inv-det-info-btn-span' : '';

            if (isLppt && qty > 0) {
                const lpptMsg = formatLpptArrivalText(it, qty);
                whHtml.push(
                    '<div class="inv-det-info-btn ' + semClass + spanClass + '">' +
                        '<span class="inv-det-info-lbl"><span class="inv-det-dot" style="background:' + dotColor + ';"></span><span>' + escapeHtml(lpptMsg) + '</span></span>' +
                        '<span class="inv-det-info-val">' + qty + '</span>' +
                    '</div>'
                );
            } else {
                const whLabelOut = (isLppt && itemRequiresComprasDateNotice(it))
                    ? (whName + ' · ' + COMPRAS_DATE_NOTICE)
                    : whName;
                whHtml.push(
                    '<div class="inv-det-info-btn ' + semClass + spanClass + '">' +
                        '<span class="inv-det-info-lbl"><span class="inv-det-dot" style="background:' + dotColor + ';"></span><span>' + escapeHtml(whLabelOut) + '</span></span>' +
                        '<span class="inv-det-info-val">' + qty + '</span>' +
                    '</div>'
                );
            }
        }

        document.getElementById('detTotalStock').textContent = String(totalBodegaPiso);
        document.getElementById('detWarehousesGrid').innerHTML = whHtml.join('');

        // Ficha de información limpia + muestras automáticas de Tela (VFAB:) y Madera (VWOD:)
        const specsWrap = document.getElementById('detSpecsWrap');
        const specsGrid = document.getElementById('detSpecsGrid');
        const specRows = buildCleanProductSpecRows(it);
        const matchedDetailFabric = findMatchingFabricSwatchForItem(it, currentGroup);
        const matchedDetailWood = findMatchingWoodSwatchForItem(it, currentGroup);
        if (specsGrid) {
            let swatchCardsHtml = '';
            if (matchedDetailFabric && matchedDetailFabric.url) {
                const fabThumb = resolveVisualImgSrc(matchedDetailFabric.url, 180);
                const fabFid = extractDriveFileId(matchedDetailFabric.url);
                swatchCardsHtml +=
                    '<button type="button" class="inv-det-fabric-swatch-card inv-det-info-btn-span" data-det-fabric-zoom-url="' + escapeHtml(matchedDetailFabric.url) + '" data-det-fabric-zoom-label="' + escapeHtml('Tela · ' + matchedDetailFabric.label) + '" title="Toca para ampliar la tela">' +
                        '<span class="inv-det-fabric-swatch-img-wrap">' +
                            '<img width="48" height="48" src="' + escapeHtml(fabThumb) + '" alt="' + escapeHtml(matchedDetailFabric.label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
                            (fabFid ? (' data-fid="' + escapeHtml(fabFid) + '"') : '') +
                            ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                        '</span>' +
                        '<span class="inv-det-fabric-swatch-meta">' +
                            '<span class="inv-det-fabric-swatch-tag">🧵 Tela</span>' +
                            '<span class="inv-det-fabric-swatch-name">' + escapeHtml(matchedDetailFabric.label) + '</span>' +
                        '</span>' +
                        '<span class="inv-det-fabric-swatch-zoom">🔍 Ver</span>' +
                    '</button>';
            }
            if (matchedDetailWood && matchedDetailWood.url) {
                const woodThumb = resolveVisualImgSrc(matchedDetailWood.url, 180);
                const woodFid = extractDriveFileId(matchedDetailWood.url);
                swatchCardsHtml +=
                    '<button type="button" class="inv-det-fabric-swatch-card is-wood inv-det-info-btn-span" data-det-fabric-zoom-url="' + escapeHtml(matchedDetailWood.url) + '" data-det-fabric-zoom-label="' + escapeHtml('Madera · ' + matchedDetailWood.label) + '" title="Toca para ampliar la madera">' +
                        '<span class="inv-det-fabric-swatch-img-wrap">' +
                            '<img width="48" height="48" src="' + escapeHtml(woodThumb) + '" alt="' + escapeHtml(matchedDetailWood.label) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
                            (woodFid ? (' data-fid="' + escapeHtml(woodFid) + '"') : '') +
                            ' onerror="window.__invHandleSwatchImgError&&window.__invHandleSwatchImgError(this)">' +
                        '</span>' +
                        '<span class="inv-det-fabric-swatch-meta">' +
                            '<span class="inv-det-fabric-swatch-tag">🪵 Madera</span>' +
                            '<span class="inv-det-fabric-swatch-name">' + escapeHtml(matchedDetailWood.label) + '</span>' +
                        '</span>' +
                        '<span class="inv-det-fabric-swatch-zoom">🔍 Ver</span>' +
                    '</button>';
            }
            specsGrid.innerHTML = swatchCardsHtml + specRows.map(r =>
                '<div class="inv-det-info-btn" style="border-color:#E8E4DE; background:#FAF9F6; color:#252C32;">' +
                    '<span class="inv-det-info-lbl" style="opacity:0.75;">' + escapeHtml(r[0]) + ':</span>' +
                    '<span class="inv-det-info-val">' + escapeHtml(r[1]) + '</span>' +
                '</div>'
            ).join('');
            const zoomBtns = specsGrid.querySelectorAll('[data-det-fabric-zoom-url]');
            if (zoomBtns && zoomBtns.length) {
                zoomBtns.forEach(function (swatchBtn) {
                    swatchBtn.onclick = function (ev) {
                        if (ev && ev.stopPropagation) ev.stopPropagation();
                        openVisualPhotoLightbox(
                            swatchBtn.getAttribute('data-det-fabric-zoom-url') || '',
                            swatchBtn.getAttribute('data-det-fabric-zoom-label') || 'Muestra'
                        );
                    };
                });
            }
        }
        if (specsWrap) specsWrap.classList.toggle('hidden', specRows.length === 0 && !matchedDetailFabric && !matchedDetailWood);

        prepareRelatedInStockSection(it, sameSkuRefresh ? relatedStockExpanded : false);
        if (typeof notifyInvSplitFotosOfSku === 'function' && it && it.s) {
            notifyInvSplitFotosOfSku(it.s);
        }
    }

    function buildCleanProductSpecRows(it) {
        if (!it) return [];
        const normSpec = s => String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const singularizeEs = s => normSpec(s)
            .split(' ')
            .filter(Boolean)
            .map(w => {
                if (w.length > 4 && w.endsWith('ES') && !/[AEIOU]ES$/.test(w)) return w.slice(0, -2);
                if (w.length > 3 && w.endsWith('S')) return w.slice(0, -1);
                return w;
            })
            .join(' ');

        const sku = cleanStr(it.s);
        const cat = it._cat && it._cat !== 'OTROS' ? cleanStr(it._cat) : cleanStr(it.c);
        let tp = cleanStr(it.tp);
        const mo = cleanStr(it.mo);
        const med = cleanStr(it.m);
        const tl = cleanStr(it.tl);
        let ct = cleanStr(it.ct);
        const md = cleanStr(it.md);
        let cm = cleanStr(it.cm);
        let vr = cleanStr(it.vr);
        const mtRaw = cleanStr(it.mt);

        const normSku = normSpec(sku);
        const normNom = normSpec(stripDimensionsFromProductText(it.n));
        const normCat = normSpec(cat);
        const normTp = normSpec(tp);
        const normMo = normSpec(mo);
        const normTl = normSpec(tl);
        const normCt = normSpec(ct);
        const normMd = normSpec(md);
        const normCm = normSpec(cm);

        // 1) Evitar repetir Tipo de producto si equivale a Categoría (ej. SILLONES vs SILLON)
        if (normCat && normTp && (normCat === normTp || singularizeEs(normCat) === singularizeEs(normTp))) {
            tp = '';
        }

        // 2) Evitar repetir Color de tela cuando ya está contenido en Tela (ej. LUXOR IVORY -> IVORY)
        if (normTl && normCt) {
            const tlPad = ' ' + normTl + ' ';
            const ctWords = normCt.split(' ').filter(Boolean);
            if (normTl === normCt || (ctWords.length > 0 && ctWords.every(w => tlPad.indexOf(' ' + w + ' ') !== -1))) {
                ct = '';
            }
        }

        // 3) Evitar repetir Color de madera cuando ya está contenido en Madera (ej. CHAPA DE NOGAL -> NOGAL)
        if (normMd && normCm) {
            const mdPad = ' ' + normMd + ' ';
            const cmWords = normCm.split(' ').filter(Boolean);
            if (normMd === normCm || (cmWords.length > 0 && cmWords.every(w => mdPad.indexOf(' ' + w + ' ') !== -1))) {
                cm = '';
            }
        }

        // 4) Limpiar Materiales quitando prefijos "TELA:", "MADERA:" y valores ya mostrados en Tela / Madera / Color
        let mtClean = '';
        if (mtRaw) {
            const coveredTokens = new Set(
                [normTl, normCt, normMd, normCm]
                    .filter(Boolean)
                    .join(' ')
                    .split(' ')
                    .filter(Boolean)
            );
            const seenMat = new Set();
            const keptParts = [];
            const segments = mtRaw.split(/[,;|\/]+|\s+·\s+/);
            for (let i = 0; i < segments.length; i++) {
                let seg = cleanStr(segments[i])
                    .replace(/^(?:MATERIAL(?:ES)?|ACABADO(?:S)?|TAPIZ(?:ADO)?|TELA|MADERA)\s*:\s*/i, '')
                    .trim();
                if (!seg) continue;
                const nSeg = normSpec(seg);
                if (!nSeg) continue;
                if ((nSeg === 'TELA' || nSeg === 'TAPIZ') && normTl) continue;
                if (nSeg === 'MADERA' && normMd) continue;
                if (nSeg === normTl || nSeg === normCt || nSeg === normMd || nSeg === normCm) continue;
                const segWords = nSeg.split(' ').filter(w => !/^(DE|DEL|LA|EL|EN|CON|Y|TELA|MADERA)$/.test(w));
                if (segWords.length > 0 && segWords.every(w => coveredTokens.has(w))) continue;
                if (seenMat.has(nSeg)) continue;
                seenMat.add(nSeg);
                keptParts.push(seg);
            }
            mtClean = keptParts.join(', ');
        }

        // 5) Conservar Variante siempre que aporte información de la variante (acabado, pieza, tamaño, tela, madera o tono),
        //    omitiendo únicamente "ESTÁNDAR" o repeticiones literales del nombre completo, modelo, tipo o SKU.
        if (vr) {
            const vrSegments = vr.split(/\s*·\s*/).map(cleanStr).filter(Boolean).filter(seg => {
                const nSeg = normSpec(seg);
                if (!nSeg || nSeg === 'ESTANDAR' || nSeg === normNom || nSeg === normMo || nSeg === normTp || nSeg === normSku) {
                    return false;
                }
                return true;
            });
            vr = vrSegments.join(' · ');
        }
        if (!vr) {
            const fallbackVrParts = [];
            if (tl) fallbackVrParts.push(tl);
            if (md) fallbackVrParts.push(md + (cm && normMd.indexOf(normCm) === -1 ? ' ' + cm : ''));
            else if (cm) fallbackVrParts.push(cm);
            if (fallbackVrParts.length > 0) vr = fallbackVrParts.join(' · ');
        }

        const candidateRows = [
            ['SKU / Clave', sku],
            ['Categoría', cat],
            ['Tipo de producto', tp],
            ['Modelo', mo],
            ['Variante', vr],
            ['Medidas', med],
            ['Tela', tl],
            ['Color de tela', ct],
            ['Madera', md],
            ['Color de madera', cm],
            ['Materiales', mtClean]
        ];

        const ALWAYS_KEEP_LABELS = new Set(['SKU / Clave', 'Categoría', 'Modelo', 'Variante', 'Medidas', 'Tela', 'Color de tela', 'Madera', 'Color de madera']);
        const seenBoxValues = new Set();
        const finalRows = [];
        for (let i = 0; i < candidateRows.length; i++) {
            const label = candidateRows[i][0];
            const val = cleanStr(candidateRows[i][1]);
            if (!val) continue;
            const nVal = normSpec(val);
            if (!nVal) continue;
            if (!ALWAYS_KEEP_LABELS.has(label) && seenBoxValues.has(nVal)) continue;
            seenBoxValues.add(nVal);
            finalRows.push([label, val]);
        }
        return finalRows;
    }
