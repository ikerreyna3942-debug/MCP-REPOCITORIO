    const DEFAULT_WAREHOUSES = [
        'LPPT',
        'CEDIS (BODEGA)',
        'CEDIS (PISO)',
        'CASA CREATA (BODEGA)',
        'CASA CREATA (PISO)',
        'PUERTO CANCUN (BODEGA)',
        'PUERTO CANCUN (PISO)',
        'COLOSIO (BODEGA)',
        'COLOSIO (PISO)',
        'PLAYA (BODEGA)',
        'PLAYA (PISO)'
    ];
    const META = window.CREATA_INV_META || {
        fileName: 'CONTROL DE PRODUCTOS PRESENTACIÓN',
        sheetId: '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8',
        gid: 690403633,
        tabName: 'INVENTARIO_EN_VIVO',
        lpptSheetId: '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE',
        lpptGid: 1025729459,
        warehouses: DEFAULT_WAREHOUSES
    };
    const WAREHOUSES = Array.isArray(META.warehouses) && META.warehouses.length > 0
        ? META.warehouses
        : DEFAULT_WAREHOUSES;
    const LPPT_SHEET_ID = META.lpptSheetId || '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE';
    const LPPT_GID = META.lpptGid || 1025729459;

    const MONTHS_ES = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const PAGE_SIZE_MOBILE = 24;
    const PAGE_SIZE_DESKTOP = 32;
    function getAdaptivePageSize() {
        return (typeof window !== 'undefined' && window.innerWidth >= 768) ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
    }
    const PAGE_SIZE = getAdaptivePageSize();
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';
    const CART_KEY = 'creata_inv_open_cart_v1';
    const DEFAULT_MIN_STOCK = 2;

    try {
        localStorage.removeItem('creata_inv_top_cloud_v1');
        localStorage.removeItem('creata_inv_top_pending_v1');
    } catch (e) {}

    let allItems = Array.isArray(window.CREATA_INV_DATA) ? window.CREATA_INV_DATA : [];
    const bySkuMap = new Map();
    const bySkuNormMap = new Map();
    const singleBySkuMap = new Map();
    const groupsByKey = new Map();
    const activeFilteredGroupsByKey = new Map();
    let allSingleGroups = [];
    let allGroups = [];
    let filteredGroups = [];
    let renderedCount = 0;

    let isMainCoverActive = true;

    let currentGroup = null;
    let currentGroupFabricKey = '';
    let currentGroupBedSizeKey = '';
    let currentGroupFabricSingleSkuMap = new Map();
    let currentDetailItem = null;
    let cart = loadCart();
    let lastLiveSignature = '';
    let liveLpptBySku = new Map();
    let liveErpPricesBySku = new Map();
    let liveErpCatalogBySku = new Map();

    function emptyStocks() {
        return new Array(WAREHOUSES.length).fill(0);
    }

    function isLpptWarehouse(label) {
        return /^(LPPT|LLPT)$/i.test(String(label || '').trim());
    }

    // Suma únicamente las 10 ubicaciones físicas (CEDIS, CASA CREATA, PUERTO CANCUN, COLOSIO, PLAYA en BODEGA y PISO)
    function getBodegaPisoStock(it) {
        if (!it || !Array.isArray(it.st)) return 0;
        let total = 0;
        for (let i = 0; i < WAREHOUSES.length; i++) {
            if (isLpptWarehouse(WAREHOUSES[i])) continue;
            total += Math.max(0, Number(it.st[i]) || 0);
        }
        return total;
    }

    // Piezas disponibles en LPPT (columna LPPT del inventario)
    function getLpptStock(it) {
        if (!it || !Array.isArray(it.st)) return 0;
        let total = 0;
        for (let i = 0; i < WAREHOUSES.length; i++) {
            if (!isLpptWarehouse(WAREHOUSES[i])) continue;
            total += Math.max(0, Number(it.st[i]) || 0);
        }
        return total;
    }

    function parsePriceNum(raw) {
        if (raw === null || raw === undefined) return 0;
        if (typeof raw === 'number') return isFinite(raw) && raw > 0 ? raw : 0;
        const cleaned = String(raw).replace(/[^0-9.-]/g, '');
        if (!cleaned) return 0;
        const n = Number(cleaned);
        return (!isNaN(n) && isFinite(n) && n > 0) ? n : 0;
    }

    function formatPrice(raw) {
        const n = parsePriceNum(raw);
        if (n <= 0) return '';
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Verifica que el producto tenga registro y precio válido en S Mueblería
    function hasValidErpPrice(it) {
        if (!it) return false;
        if (parsePriceNum(it.pr) > 0) return true;
        const skuKey = String(it.s || '').trim().toUpperCase();
        if (!skuKey) return false;
        if (parsePriceNum(liveErpPricesBySku.get(skuKey)) > 0) return true;
        const erpEntry = liveErpCatalogBySku.get(skuKey);
        return !!(erpEntry && parsePriceNum(erpEntry.pr) > 0);
    }

    // Clasificación de disponibilidad para todos los productos con >= 1 pz:
    // - 'STOCK': piezas físicas en las 5 ubicaciones (Bodega + Piso >= 1) sin LPPT
    // - 'LPPT': piezas en LPPT (>= 1) con 0 en ubicaciones físicas
    // - 'LPPT_STOCK': piezas tanto en inventario físico (>= 1) como en LPPT (>= 1)
    function getItemAvailabilityKind(it) {
        const stock = getBodegaPisoStock(it);
        const lppt = getLpptStock(it);
        if (stock >= 1 && lppt >= 1) return 'LPPT_STOCK';
        if (stock >= 1) return 'STOCK';
        if (lppt >= 1) return 'LPPT';
        return '';
    }

    function sanitizeVisualOverrideUrl(rawUrl, opts) {
        const s = String(rawUrl == null ? '' : rawUrl).trim();
        if (!s) return '';
        if (/^(?:blob|javascript|vbscript|file):/i.test(s)) return '';
        if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(s)) {
            return (opts && opts.allowDataImage === true) ? s : '';
        }
        if (/^data:/i.test(s)) return '';
        if (!/^https?:\/\/[^\s"'<>]+$/i.test(s)) return '';
        try {
            const u = new URL(s);
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
            if (!u.hostname || u.hostname.indexOf('.') === -1) return '';
            return s;
        } catch (e) {
            return '';
        }
    }

    function sanitizeProductOverridesMap(rawMap) {
        const out = {};
        if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
        const keys = Object.keys(rawMap);
        for (let i = 0; i < keys.length; i++) {
            const rawKey = keys[i];
            const k = String(rawKey || '').trim().toUpperCase();
            const ovr = rawMap[rawKey];
            if (!k || !ovr || typeof ovr !== 'object') continue;
            const isVisual = k.indexOf('VFAB:') === 0 || k.indexOf('VCOV:') === 0 || k.indexOf('VWOD:') === 0 ||
                ovr.category === 'FABRIC_SWATCH' || ovr.category === 'VISUAL_COVER' || ovr.category === 'WOOD_SWATCH';
            if (isVisual) {
                const safeNote = sanitizeVisualOverrideUrl(ovr.note);
                out[k] = Object.assign({}, ovr, { sku: k, note: safeNote });
            } else {
                out[k] = ovr;
            }
        }
        return out;
    }

    const INV_PRODUCT_OVERRIDES_STORAGE = 'creata_inv_product_overrides_v1';
    let invProductOverridesMap = (function loadInitialProductOverrides() {
        try {
            const raw = localStorage.getItem(INV_PRODUCT_OVERRIDES_STORAGE);
            const parsed = raw ? JSON.parse(raw) : null;
            return sanitizeProductOverridesMap(parsed);
        } catch (e) {
            return {};
        }
    })();

    function getProductOverrideForSku(skuRaw) {
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key || !invProductOverridesMap) return null;
        return invProductOverridesMap[key] || null;
    }

    function applyProductOverrideToItem(it) {
        if (!it || !it.s) return it;
        if (it._origN === undefined) it._origN = it.n;
        if (it._origC === undefined) it._origC = it.c;
        if (it._origPr === undefined) it._origPr = it.pr;
        const ovr = getProductOverrideForSku(it.s);
        if (!ovr) {
            it.n = it._origN;
            it.c = it._origC;
            it.pr = it._origPr;
            return it;
        }
        it.n = (ovr.name && String(ovr.name).trim()) ? String(ovr.name).trim() : it._origN;
        it.c = (ovr.category && String(ovr.category).trim()) ? String(ovr.category).trim() : it._origC;
        if (ovr.price !== null && ovr.price !== undefined && ovr.price !== '' && isFinite(Number(ovr.price))) {
            it.pr = formatPrice(Number(ovr.price)) || String(Number(ovr.price));
        } else {
            it.pr = it._origPr;
        }
        return it;
    }

    function applyAllProductOverridesToCatalog() {
        if (!Array.isArray(allItems)) return;
        for (let i = 0; i < allItems.length; i++) {
            applyProductOverrideToItem(allItems[i]);
        }
    }

    // El cotizador muestra piezas con stock físico o piezas de LPPT con registro/precio en S Mueblería
    // (excluyendo SKUs archivados o eliminados por Kevin en _INV_PRODUCT_OVERRIDES)
    function isQuotableItem(it) {
        if (!it) return false;
        const ovr = getProductOverrideForSku(it.s);
        if (ovr && (ovr.status === 'ARCHIVADO' || ovr.status === 'ELIMINADO')) {
            return false;
        }
        return getItemAvailabilityKind(it) !== '';
    }

    function computeItemsSignature(items) {
        const parts = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const st = Array.isArray(it.st) ? it.st.join(',') : '';
            parts[i] = [
                it.s, it.tp, it.mo, it.n, it.vr, it.f, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p,
                it.lt, it.pr, it.fe, it.fcomp || '', st
            ].join('\x1f');
        }
        return parts.join('\n');
    }

    function cleanStr(val) {
        if (val === null || val === undefined) return '';
        const s = String(val).trim();
        if (!s) return '';
        if (/^(n\/?a|null|undefined|-|\.|sin\s+especificar|no\s+especificado|no\s+aplica|pendiente|por\s+clasificar)$/i.test(s)) {
            return '';
        }
        if (/^(?:frente|largo|alto|altura|ancho|fondo)\s*[x×*]\s*(?:fondo|ancho|alto|altura|frente|largo)(?:\s*[x×*]\s*(?:alto|altura|fondo|ancho|frente|largo))?$/i.test(s)) {
            return '';
        }
        return s;
    }

    function normalizePlain(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    // Normalización fonética/ortográfica para español (ll/y, c/z/s, b/v, qu/c/k, g/j, h muda)
    function normSearch(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/ll/g, 'y')
            .replace(/c([ei])/g, 's$1')
            .replace(/z/g, 's')
            .replace(/v/g, 'b')
            .replace(/qu([ei])/g, 'k$1')
            .replace(/c(?![ehi])/g, 'k')
            .replace(/g([ei])/g, 'j$1')
            .replace(/(^|[^c])h/g, '$1')
            .replace(/([a-z])\1+/g, '$1')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    const SEARCH_STOPWORDS = new Set([
        'de', 'del', 'la', 'el', 'los', 'las', 'para', 'por',
        'con', 'en', 'y', 'o', 'un', 'una', 'unos', 'unas', 'al', 'a'
    ]);

    function stemEs(w) {
        let s = String(w || '');
        if (s.length >= 5 && s.endsWith('es')) s = s.slice(0, -2);
        else if (s.length >= 4 && s.endsWith('s')) s = s.slice(0, -1);
        return s;
    }

    function rootEs(w) {
        const s = stemEs(w);
        if (s.length >= 5 && (s.endsWith('a') || s.endsWith('o'))) return s.slice(0, -1);
        return s;
    }

    function editDistanceBounded(a, b, maxDist) {
        const la = a.length;
        const lb = b.length;
        if (Math.abs(la - lb) > maxDist) return maxDist + 1;
        const prev = new Array(lb + 1);
        const curr = new Array(lb + 1);
        for (let j = 0; j <= lb; j++) prev[j] = j;
        for (let i = 1; i <= la; i++) {
            curr[0] = i;
            let rowMin = curr[0];
            for (let j = 1; j <= lb; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
                if (curr[j] < rowMin) rowMin = curr[j];
            }
            if (rowMin > maxDist) return maxDist + 1;
            for (let j = 0; j <= lb; j++) prev[j] = curr[j];
        }
        return prev[lb];
    }

    function scoreTokenInGroup(tok, grp) {
        if (!tok || !grp) return 0;
        const st = stemEs(tok);
        const rt = rootEs(tok);

        // Frontera estricta entre SILLA (siya) y SILLÓN (siyon): nunca deben cruzarse ni coincidir por aproximación
        if (st === 'siya' || st === 'siyon') {
            if (!grp._stems || !grp._stems.has(st)) return 0;
            if (grp._titleTokens && grp._titleTokens.some(t => stemEs(t) === st)) {
                return grp._titleTokens[0] && stemEs(grp._titleTokens[0]) === st ? 40 : 32;
            }
            return 22;
        }

        let best = 0;

        if (grp._titleSearch && grp._titleSearch.indexOf(tok) !== -1) {
            best = Math.max(best, grp._titleSearch.startsWith(tok) ? 40 : 30);
        }
        if (grp._search.indexOf(tok) !== -1 || grp._plain.indexOf(tok) !== -1) {
            best = Math.max(best, 20);
        }
        if (st !== tok && (grp._search.indexOf(st) !== -1 || (grp._stems && grp._stems.has(st)))) {
            best = Math.max(best, (grp._titleSearch && grp._titleSearch.indexOf(st) !== -1) ? 26 : 16);
        }
        if (best === 0 && rt.length >= 4 && grp._roots && grp._roots.has(rt)) {
            best = 14;
        }
        if (best === 0 && tok.length >= 4 && grp._compact && grp._compact.indexOf(tok) !== -1) {
            best = 12;
        }
        if (best === 0 && tok.length >= 4 && !/\d/.test(tok) && grp._words) {
            const maxD = tok.length >= 7 ? 2 : 1;
            for (let i = 0; i < grp._words.length; i++) {
                const w = grp._words[i];
                if (w.length < 3) continue;
                const wSt = stemEs(w);
                if (wSt === 'siya' || wSt === 'siyon') continue;
                const d = editDistanceBounded(tok, w, maxD);
                if (d <= maxD) {
                    best = Math.max(best, d === 1 ? 10 : 6);
                    break;
                }
                if (st.length >= 4) {
                    const ds = editDistanceBounded(st, wSt, 1);
                    if (ds <= 1) {
                        best = Math.max(best, 8);
                        break;
                    }
                }
            }
        }
        return best;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function extractDriveFileId(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return m ? m[1] : '';
    }

    function extractDrivePhotoRev(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const m = s.match(/[?&]v=([a-zA-Z0-9._-]{1,32})/);
        return m ? m[1] : '';
    }

    function buildDriveLh3Url(fid, sizeToken, rev) {
        if (!fid) return '';
        return 'https://lh3.googleusercontent.com/d/' + fid + (sizeToken || '=w1000') + (rev ? ('?v=' + encodeURIComponent(rev)) : '');
    }

    function resolveDriveOrImgUrl(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const fid = extractDriveFileId(s);
        if (fid) return buildDriveLh3Url(fid, '=w1000', extractDrivePhotoRev(s));
        if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) return s;
        return '';
    }

    const LIVE_DIM_PATTERNS = [
        /\b(?:CON\s+)?MEDIDAS?\s*:?\s*ALTO\s*:\s*\d+(?:[.,]\d+)?\s*ANCHO\s*:\s*\d+(?:[.,]\d+)?\s*LARGO\s*:\s*\d+(?:[.,]\d+)?(?:\s*CM\.?)?/gi,
        /\b(?:CON\s+)?MEDIDAS?\s*:?\s*(?:DE\s+)?\.?\d+(?:[.,]\d+)?\s*(?:CM\.?|MTS?\.?|M\.?|DIAM(?:ETRO)?\.?)?\s*[xX*×]\s*\.?\d+(?:[.,]\d+)?(?:\s*(?:CM\.?|MTS?\.?|M\.?)?\s*[xX*×]\s*\.?\d+(?:[.,]\d+)?)?\s*(?:CM\.?|MTS?\.?|M\.?)?(?:\s*(?:C\/U|DIAMETRO|DIÁMETRO|DIAM\.?|Ø))?\.?/gi,
        /\b(?:DE\s+)?(?:DIAM(?:ETRO)?\.?|Ø)\s*\d+(?:[.,]\d+)?(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?)?\s*(?:CM\.?|MTS?\.?|M\.?)?\.?/gi,
        /\b(?:DE\s+)?\d+(?:[.,]\d+)?\s*(?:CM\.?|MTS?\.?|M\.?)?\s*(?:DE\s+)?(?:DIAMETRO|DIÁMETRO|DIAM\.?|Ø)(?:\s*[xX*×]\s*\d+(?:[.,]\d+)?\s*(?:CM\.?|MTS?\.?|M\.?)?)?\.?/gi,
        /(?:\bDE\s+)?(?:^|(?<=[\s(,\/]))[HL]?\d+(?:[.,]\d+)?\s*(?:CM\.?|MTS?\.?|M\.?)?\s*[xX*×]\s*\.?\d+(?:[.,]\d+)?(?:\s*(?:CM\.?|MTS?\.?|M\.?)?\s*[xX*×]\s*\.?\d+(?:[.,]\d+)?)?\s*(?:CM\.?|MTS?\.?|M\.?)?(?:\s*(?:C\/U|DIAMETRO|DIÁMETRO|DIAM\.?|Ø))?\.?/gi,
        /\b\d+(?:[.,]\d+)?\s*CM\.?(?:\s*,?\s*\d+(?:[.,]\d+)?\s*CM\.?)*(?:\s+Y\s+\d+(?:[.,]\d+)?\s*CM\.?)/gi,
        /(?:^|(?<=[\s(,\/]))\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)+(?:\s+Y\s+\d+(?:\.\d+)?)?\s*(?:CM\.?|MTS?\.?)\b/gi,
        /(?:\bDE\s+)?(?:^|(?<=[\s(,\/]))[HL]?\d+(?:-\d+)?(?:[.,]\d+)?\s*(?:CM\.?|MTS\.?|MT\.?|MM\.?)(?!\w)\.?/gi
    ];

    function normalizeExtractedDimLive(rawDim) {
        let s = cleanStr(rawDim).toUpperCase();
        if (!s) return '';
        s = s.replace(/^(?:CON\s+)?MEDIDAS?\s*:?\s*/, '');
        const mAal = s.match(/ALTO\s*:\s*(\d+(?:[.,]\d+)?)\s*ANCHO\s*:\s*(\d+(?:[.,]\d+)?)\s*LARGO\s*:\s*(\d+(?:[.,]\d+)?)/);
        if (mAal) {
            return mAal[3].replace(',', '.') + 'X' + mAal[2].replace(',', '.') + 'X' + mAal[1].replace(',', '.') + ' CM';
        }
        if (/^\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)+/.test(s)) {
            return s.replace(/\s*(?:CM\.?|MTS?\.?)$/i, '').replace(/\s*,\s*/g, ', ') + ' CM';
        }
        if (/^[HL]?\d+-\d+\s*CM/i.test(s)) {
            const rClean = s.replace(/^[HL]/i, '').replace(/\s*CM\.?$/i, '').trim();
            return rClean + ' CM';
        }
        const isDiam = /DIAM|Ø/.test(s);
        s = s.replace(/\b(?:DIAMETRO|DIÁMETRO|DIAM\.?|Ø|DE|C\/U)\b/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/[*,×]/g, 'X');
        const hasMeters = /\bMTS?\.?\b|\bM\b/.test(s) || /\b[1-4]\.\d{2}\s*X\s*[0-5]\.\d{2}\b/.test(s);
        const nums = s.match(/(?:\d+\.\d+|\.\d+|\d+)/g) || [];
        while (nums.length >= 2 && parseFloat(nums[0]) === 0) nums.shift();
        if (!nums.length) return '';
        const allSmallDec = nums.every(n => n.indexOf('.') !== -1 && parseFloat(n) < 6.5);
        const conv = nums.slice(0, 3).map(n => {
            const fn = parseFloat(n);
            if ((hasMeters || allSmallDec) && fn < 10 && (n.indexOf('.') !== -1 || fn <= 5)) {
                const cmVal = Math.round(fn * 1000) / 10;
                return String(cmVal);
            }
            return n.indexOf('.') === -1 ? String(parseInt(n, 10)) : n;
        });
        return (isDiam ? 'DIAM ' : '') + conv.join('X') + ' CM';
    }

    function stripDimensionsAndExtractLive(rawText) {
        let s = cleanStr(rawText);
        if (!s) return { text: '', med: '' };
        const extracted = [];
        const mGlue = s.match(/\b([1234]\d0)\s*[xX*×]\s*([1234]\d0)(\d{4,6})\b/);
        if (mGlue) {
            extracted.push(mGlue[1] + 'X' + mGlue[2]);
            s = s.slice(0, mGlue.index) + mGlue[3] + s.slice(mGlue.index + mGlue[0].length);
        }
        s = s
            .replace(/([A-Za-zÁÉÍÓÚáéíóúÑñ]{3,})(\d{2,3}\s*(?:[xX*×]\s*\d{2,3}(?:\s*[xX*×]\s*\d{1,3})?(?:\s*CM)?|DIAMETRO\b|DIÁMETRO\b|DIAM\b))/gi, '$1 $2')
            .replace(/\b(\d{2,3})(DIAMETRO\b|DIÁMETRO\b|DIAM\b)/gi, '$1 $2');
        for (let i = 0; i < LIVE_DIM_PATTERNS.length; i++) {
            const pat = LIVE_DIM_PATTERNS[i];
            pat.lastIndex = 0;
            let m;
            while ((m = pat.exec(s)) !== null) {
                extracted.push(m[0]);
            }
            s = s.replace(pat, ' ');
        }
        if (extracted.length > 0) {
            s = s
                .replace(/\(\s*\)/g, ' ')
                .replace(/\s+([,.])/g, '$1')
                .replace(/\b(?:FRENTE|FONDO|ALTO|ALTURA|LARGO|ANCHO)\s*(?:[xX*×yY]\s*(?:FRENTE|FONDO|ALTO|ALTURA|LARGO|ANCHO)\b)+/gi, ' ')
                .replace(/\b(?:CON\s+MEDIDAS?|MEDIDAS?|DIAMETRO|DIÁMETRO|DIAM)\b\.?\s*:?/gi, ' ')
                .replace(/\s+\b(?:DE|CON\s+MEDIDA|FRENTE|FONDO|LARGO|ANCHO|ALTO)\s*$/i, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/^[,\s.\-·\/]+|[,\s.\-·\/]+$/g, '')
                .trim();
        } else {
            s = s
                .replace(/\s{2,}/g, ' ')
                .trim();
        }
        let bestMed = '';
        for (let i = 0; i < extracted.length; i++) {
            const nm = normalizeExtractedDimLive(extracted[i]);
            if (nm && (!bestMed || nm.length > bestMed.length)) bestMed = nm;
        }
        return { text: s, med: bestMed };
    }

    function stripDimensionsFromProductText(rawText) {
        const res = stripDimensionsAndExtractLive(rawText);
        return (res.text && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(res.text)) ? res.text : cleanStr(rawText);
    }

    function sortKeyAlphaEs(raw) {
        return String(raw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/^[^A-Za-z0-9]+/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function compareAlphaEs(aRaw, bRaw) {
        const ka = sortKeyAlphaEs(aRaw);
        const kb = sortKeyAlphaEs(bRaw);
        if (!ka && !kb) return 0;
        if (!ka) return 1;
        if (!kb) return -1;
        const aIsLetter = /^[A-Z]/.test(ka);
        const bIsLetter = /^[A-Z]/.test(kb);
        if (aIsLetter !== bIsLetter) return aIsLetter ? -1 : 1;
        return ka.localeCompare(kb, 'es', { numeric: true, sensitivity: 'base' });
    }

    const FABRIC_CANONICAL_ALIASES = [
        [/\bCOLLETE\b/g, 'COLETTE'],
        [/\bFLOFFLY\b/g, 'FLOFFY'],
        [/\bTITTUS\b/g, 'TITUS'],
        [/\bDARKGREY\b/g, 'DARK GREY'],
        [/\bHIGHLIVING\b/g, 'HIGH LIVING'],
        [/\bBRAXON\b/g, 'BRAXTON'],
        [/\bNATRUAL\b/g, 'NATURAL'],
        [/\bBRIKE\b/g, 'BRICK'],
        [/\bKIMMI\b/g, 'KIMI'],
        [/\bPORCELAINE\b/g, 'PORCELAIN'],
        [/\bNUDE\s+BRACH\b/g, 'NUDE BEACH'],
        [/\bCOPENHAGEN\b/g, 'COPENHAGUE'],
        [/\bWITHE\b/g, 'WHITE'],
        [/\bBAIGE\b/g, 'BEIGE']
    ];

    function canonicalizeFabricAliases(rawText) {
        let s = String(rawText || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
        if (!s) return '';
        for (let i = 0; i < FABRIC_CANONICAL_ALIASES.length; i++) {
            s = s.replace(FABRIC_CANONICAL_ALIASES[i][0], FABRIC_CANONICAL_ALIASES[i][1]);
        }
        return s.replace(/\s+/g, ' ').trim();
    }

    function stripFabricGradeAndVendorNoise(rawText) {
        let s = String(rawText || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
        if (!s) return '';
        // 1) Quitar prefijos de grado (G1..G9, GG)
        s = s.replace(/^(?:(?:G[1-9]|GG)\s+)+/i, '').trim();
        // 2) Quitar prefijo "TELA DE " / "TELA " excepto frases protegidas
        if (!/^(?:TELA\s+(?:ARTELL|MANTEL|REPELENTE|ECOLOGICA))$/.test(s)) {
            s = s.replace(/^TELA(?:\s+DE)?\s+/i, '').trim();
        }
        // 3) Quitar sufijo " - MODELO" accidental en tela (ej. "BEIGE - LEONI" -> "BEIGE")
        s = s.replace(/^([A-Z0-9][A-Z0-9\s]{1,40}?)\s+-\s+[A-Z0-9]{3,}$/, '$1').trim();
        // 4) Quitar sufijos de proveedor al final cuando van precedidos de al menos un token
        s = s.replace(/^(.+?)\s+(?:ARMONY|ATX\.?|BARSA|YOI)\s*$/i, '$1').trim();
        const mSkanor = s.match(/^(.+?)\s+SKANOR\s*$/i);
        if (mSkanor && !/\b(?:PAROTA|TECA|TEKA|ROSA\s+MORADA|ENCINO|NOGAL|PINO|ROBLE|FRESNO|TZALAM|MADERA)\b/i.test(mSkanor[1])) {
            s = mSkanor[1].trim();
        }
        return s.replace(/\s+/g, ' ').trim();
    }

    function normalizeFabricLookupKey(rawText) {
        const cleaned = cleanFabricVariationName(rawText);
        return canonicalizeFabricAliases(stripFabricGradeAndVendorNoise(cleaned));
    }

    const LIVE_EXTRA_FABRICS = {
        'SORRENTO IVORY': 'MARFIL / IVORY',
        'VOIRON OLIVO': 'VERDE OLIVO',
        'VOIRON PERLA': 'BLANCO PERLA',
        'VOIRON CREAM': 'CREMA',
        'BOLTON FLAX': 'ARENA / LINO',
        'LINEN NATURE': 'LINO NATURAL',
        'NATURE LINEN': 'LINO NATURAL',
        'OSI FLAX': 'ARENA / FLAX',
        'OSI IVORY': 'MARFIL / IVORY',
        'BAKER LINEN': 'ARENA / LINO',
        'BAKER MUSHROOM': 'TAUPE / MUSHROOM',
        'BAKER OLIVE': 'VERDE OLIVO',
        'FOREVER PLUS MOSS': 'VERDE MUSGO',
        'FOREVER PLUS BUTTERMILK': 'CREMA / BUTTERMILK',
        'FOREVER MOSS': 'VERDE MUSGO',
        'REFLECT PLATINUM': 'GRIS PLATINO',
        'REFLECT CHARCOAL': 'GRIS OXFORD / CHARCOAL',
        'REFLECT DOVE': 'GRIS PALOMA',
        'LULLABY OLIVE': 'VERDE OLIVO',
        'LULLABY OYSTER': 'OSTIÓN / MARFIL',
        'AVALANCHE BONE': 'HUESO',
        'DISTRACTION NATURAL': 'ARENA / LINO NATURAL',
        'DISTRACTION MIDNIGHT': 'AZUL MEDIANOCHE',
        'DISTRACTION DOMINO': 'BLANCO / NEGRO',
        'LOVEME SAND': 'ARENA',
        'LOVEME COTTON': 'BLANCO ALGODÓN',
        'GELLAR MARBLE': 'BLANCO MÁRMOL',
        'GELLAR JUTE': 'YUTE NATURAL',
        'NIZA FOSSIL': 'GRIS FÓSIL',
        'TITUS PEARL': 'BLANCO PERLA',
        'TITUS CHALK': 'BLANCO TIZA',
        'MADISON SAND': 'ARENA',
        'COPENHAGUE NATURAL': 'NATURAL',
        'COPENHAGUE LINEN': 'LINO',
        'PIXEL FOSIL': 'GRIS FÓSIL',
        'PIXEL LINEN': 'LINO',
        'GLOSS COTTON': 'BLANCO ALGODÓN',
        'SUNSET IVORY': 'MARFIL / IVORY',
        'FRANCE BEIGE': 'BEIGE',
        'MOHAIR 4 CURRY': 'MOSTAZA / CURRY',
        'MOHAIR CURRY': 'MOSTAZA / CURRY',
        'MOHAIR COFFE': 'CAFÉ',
        'SAILCLOTH SUMMER SAND': 'ARENA',
        'SESAME RICE': 'BLANCO ARROZ',
        'NOSTALGIA BONE BROWN': 'HUESO / CAFÉ',
        'MIST GRAY': 'GRIS NIEBLA',
        'BAJA TUSK': 'MARFIL / TUSK',
        'BERKELEY NATURAL': 'NATURAL',
        'HADI LINEN': 'LINO',
        'HADY IVORY': 'MARFIL / IVORY',
        'BRAXTON OAT': 'AVENA / OAT',
        'BRAXTON SNOW': 'BLANCO NIEVE',
        'ALTMAN COTTON': 'BLANCO ALGODÓN',
        'MERCURY PEYOTE': 'TAUPE / PEYOTE',
        'KELSI COTTON': 'BLANCO ALGODÓN',
        'SCAR PUTTY': 'ARENA / PUTTY',
        'SCAR ECRU': 'CRUDO',
        'WINDSOR ECRU': 'CRUDO',
        'FRESH FLAX': 'ARENA / FLAX',
        'LUXOR IVORY': 'MARFIL / IVORY',
        'RHONA ECRU': 'CRUDO / ECRU',
        'RHONA IVORY': 'MARFIL / IVORY',
        'RHONA BONE': 'HUESO',
        'RHONA SAND': 'ARENA',
        'BELOVED FLAX': 'ARENA / LINO',
        'FRESNO OYSTER': 'GRIS OSTRA',
        'WOODWARD DOVE': 'GRIS PALOMA',
        'GLACIER ICE': 'BLANCO HIELO',
        'BLOIS PINO': 'VERDE PINO',
        'KIRBY FLAX': 'LINO',
        'RUSTY NATURAL': 'NATURAL',
        'KIMI PORCELAIN': 'BLANCO PORCELANA',
        'PRISMA OLIVE': 'VERDE OLIVO',
        'ALINE CASHMERE': 'CACHEMIRA / BEIGE',
        'ALINE TOAST': 'TOSTADO / TOAST',
        'LILA LINEN': 'LINO / LILA',
        'NANTES CREAM': 'CREMA',
        'ELITE GREY': 'GRIS',
        'ELITE FLAX': 'LINO',
        'ATENEA SNOW': 'BLANCO NIEVE',
        'MAGIC METAL': 'GRIS METÁLICO',
        'LILLIE SNOW': 'BLANCO NIEVE',
        'LILLIE SILVER': 'GRIS PLATA',
        'ISMALIA LINEN': 'LINO',
        'PRESTIGE IVORY': 'MARFIL',
        'SOUL IVORY': 'MARFIL',
        'TESSA KHAKI': 'KHAKI',
        'TESSA VAINILLA': 'CREMA VAINILLA',
        'RONDA SILVER': 'GRIS PLATA',
        'RONDA MUSTARD': 'MOSTAZA',
        'BLEND NATURAL': 'ARENA / NATURAL',
        'BLEND MINERAL': 'GRIS MINERAL',
        'BLEND TEAL': 'AQUA / TEAL',
        'OUTRIGGER WHITE': 'BLANCO',
        'OUTRIGGER CREAM': 'CREMA',
        'DYNAMIC TAUPE': 'TAUPE',
        'NILE BRICK': 'TERRACOTA',
        'FLOFFY PORCELAIN': 'BLANCO PORCELANA',
        'FLOFFY ALABASTER': 'BLANCO ALABASTRO',
        'COLETTE CREAM': 'CREMA',
        'COLETTE WHITE': 'BLANCO',
        'COLETTE DUNE': 'ARENA / DUNE',
        'COLETTE FLAX': 'ARENA / LINO',
        'HIGH LIVING NATURAL': 'BEIGE NATURAL',
        'HIGH LIVING WHITE': 'BLANCO',
        'HIGH LIVING CHARCOAL': 'GRIS OXFORD',
        'OSLO AVENA': 'AVENA',
        'DUNDEE NATURAL': 'NATURAL',
        'MODENA TUSK': 'MARFIL',
        'SAND 07': 'ARENA',
        'NAPOLI 01': 'ARENA CLARO',
        'ROBLE 01': 'CRUDO / ARENA',
        'BRONI 01': 'GRIS ARENA',
        'BIKENDI LINEN': 'LINO CRUDO',
        'BOSTON PERLA': 'PERLA / CRUDO',
        'NUDE BEACH BLUE': 'AZUL',
        'NUDE BEACH GREY': 'GRIS',
        'NUDE BEACH SKY': 'AZUL CIELO',
        'NUDE BEACH TEAL': 'AQUA / TEAL',
        'NUDE BEACH LINEN': 'BEIGE / LINO',
        'NUDE BEACH APPLE': 'VERDE MANZANA',
        'NUDE BEACH ORANGE': 'NARANJA',
        'NUDE BEACH WHITE': 'BLANCO',
        'OLIVETO CORAL': 'CORAL',
        'OLIVETO MARINO': 'AZUL MARINO',
        'OLIVETO VERDE': 'VERDE',
        'OLIVETO ARENA': 'ARENA',
        'OLIVETO OLIVA': 'VERDE OLIVO',
        'OLIVETO ORO': 'ORO / DORADO'
    };

    const LIVE_WOOD_PATTERNS = [
        [/\bPAROTA\s+LAMINAD[OA]\b/, 'PAROTA LAMINADO'],
        [/\bROSA\s+MORADA\s+SOLID[OA]\b/, 'ROSA MORADA SOLIDA'],
        [/\bROSA\s+MORADA\b|\bRM\b/, 'ROSA MORADA'],
        [/\bPAROTA\b/, 'PAROTA'],
        [/\bCHAPA\s+(?:DE\s+)?NOGAL\b/, 'CHAPA DE NOGAL'],
        [/\bNOGAL\b/, 'NOGAL'],
        [/\bENCINO\b/, 'ENCINO'],
        [/\bTECA\b|\bTEKA\b/, 'TECA'],
        [/\bPINO\b/, 'PINO'],
        [/\bTZALAM\b/, 'TZALAM'],
        [/\bROBLE\b/, 'ROBLE'],
        [/\bFRESNO\b/, 'FRESNO'],
        [/\bPALO\s+DE\s+ROSA\b/, 'PALO DE ROSA'],
        [/\bCAOBILLA\b/, 'CAOBILLA'],
        [/\bBEJUCO\b/, 'BEJUCO'],
        [/\bRATTAN\b|\bRATAN\b/, 'RATTAN']
    ];

    const LIVE_WOOD_COLOR_PATTERNS = [
        [/\bLACA\s+BELLOTA\b/, 'LACA BELLOTA'],
        [/\bLACA\s+TACUBA\b/, 'LACA TACUBA'],
        [/\bLACA\s+BLANCA\b/, 'LACA BLANCA'],
        [/\bLACA\s+NEGRA\b/, 'LACA NEGRA'],
        [/\bTONO\s+NATURAL\b/, 'TONO NATURAL'],
        [/\bBARNIZ\s+MATTE\b|\bACABADO\s+NATURAL\s+BARNIZ\s+MATTE\b/, 'NATURAL BARNIZ MATTE'],
        [/\bTABACO\s+CLARO\b/, 'TABACO CLARO'],
        [/\bTABACO\b/, 'TABACO'],
        [/\bWARM\s+SAND\b/, 'WARM SAND'],
        [/\bROSA\s+MORADA\s+CLAR[OA]\b|\bRM\s+CLAR[OA]\b/, 'CLARA'],
        [/\bROSA\s+MORADA\s+CAFE\b/, 'CAFÉ'],
        [/\bENTINTAD[OA]\b/, 'ENTINTADO'],
        [/\bSPALTED\s+HABANO\b/, 'SPALTED HABANO'],
        [/\bSPALTED\b/, 'SPALTED'],
        [/\bHABANO\b/, 'HABANO'],
        [/\bBELLOTA\b/, 'LACA BELLOTA'],
        [/\bTACUBA\b/, 'LACA TACUBA'],
        [/\bESPIGA\b/, 'ESPIGA'],
        [/\bNUEZ\b/, 'NUEZ']
    ];

    const LIVE_MATERIAL_PATTERNS = [
        [/\bMARMOL\s+CALACATA\s+ROMA\b/, 'MÁRMOL CALACATTA ROMA'],
        [/\bMARMOL\s+OJINAGA\s+GREY\b/, 'MÁRMOL OJINAGA GREY'],
        [/\bMARMOL\b/, 'MÁRMOL'],
        [/\bPIEDRA\s+SINTERIZADA\b/, 'PIEDRA SINTERIZADA'],
        [/\bTRAVERTIN[OE]\b/, 'TRAVERTINO'],
        [/\bONIX\b/, 'ÓNIX'],
        [/\bGRANITO\b/, 'GRANITO'],
        [/\bCRISTAL\b|\bVIDRIO\b/, 'CRISTAL'],
        [/\bCEMENTO\b|\bCONCRETO\b/, 'CEMENTO'],
        [/\bCUERDA\b/, 'CUERDA'],
        [/\bNIQUEL\b/, 'NÍQUEL'],
        [/\bMETAL\b|\bACERO\b|\bHIERRO\b|\bFIERRO\b/, 'METAL'],
        [/\bPIEL\b|\bCUERO\b/, 'PIEL'],
        [/\bCERAMICA\b|\bPORCELANA\b/, 'CERÁMICA'],
        [/\bFIBRA\s+DE\s+VIDRIO\b|\bRESINA\b/, 'RESINA / FIBRA'],
        [/\bMECATE\b|\bYUTE\b/, 'FIBRA NATURAL']
    ];

    const LIVE_BAD_FABRICS = new Set([
        'TELA', 'TELA ARTELL', 'ARTELL', 'SIN TELA', 'VARIOS', 'ESTANDAR', 'NATURAL',
        'ALGODON', 'LINO', 'POLIESTER', 'TERCIOPELO', 'PIEL', 'GAMUZA', 'YUTE'
    ]);

    const liveKnownFabrics = new Map();
    const liveCuratedFabrics = new Set();
    let liveFabricsListSorted = [];
    const liveSkuPrefixProv = new Map();

    const COMPRAS_DATE_NOTICE = 'Solicitar información con compras';
    function isComprasManagedDateProvider(provRaw) {
        return /\b(?:SKANOR|BARSA)\b/i.test(cleanStr(provRaw));
    }
