(function () {
    'use strict';

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

    const PAGE_SIZE = 80;
    const CANONICAL_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwWdasvfk3W5FJVZvbEylibYXFxGAr0W4zVb3dq-ws0BqStyiSYQ8oZWLqOPagQBrxv/exec';
    const CART_KEY = 'creata_inv_open_cart_v1';
    const DEFAULT_MIN_STOCK = 2;

    try {
        localStorage.removeItem('creata_inv_top_cloud_v1');
        localStorage.removeItem('creata_inv_top_pending_v1');
    } catch (e) {}

    let allItems = Array.isArray(window.CREATA_INV_DATA) ? window.CREATA_INV_DATA : [];
    const bySkuMap = new Map();
    const singleBySkuMap = new Map();
    const groupsByKey = new Map();
    const activeFilteredGroupsByKey = new Map();
    let allSingleGroups = [];
    let allGroups = [];
    let filteredGroups = [];
    let renderedCount = 0;

    let isMainCoverActive = true;

    let currentGroup = null;
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

    // El cotizador muestra piezas con stock físico o piezas de LPPT con registro/precio en S Mueblería
    function isQuotableItem(it) {
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
                const d = editDistanceBounded(tok, w, maxD);
                if (d <= maxD) {
                    best = Math.max(best, d === 1 ? 10 : 6);
                    break;
                }
                if (st.length >= 4) {
                    const ds = editDistanceBounded(st, stemEs(w), 1);
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
            .replace(/"/g, '&quot;');
    }

    function extractDriveFileId(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const m = s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return m ? m[1] : '';
    }

    function resolveDriveOrImgUrl(raw) {
        const s = cleanStr(raw);
        if (!s) return '';
        const fid = extractDriveFileId(s);
        if (fid) return 'https://lh3.googleusercontent.com/d/' + fid + '=w1000';
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
        s = s
            .replace(/\(\s*\)/g, ' ')
            .replace(/\s+([,.])/g, '$1')
            .replace(/\b(?:FRENTE|FONDO|ALTO|ALTURA|LARGO|ANCHO)\s*(?:[xX*×yY]\s*(?:FRENTE|FONDO|ALTO|ALTURA|LARGO|ANCHO)\b)+/gi, ' ')
            .replace(/\b(?:CON\s+MEDIDAS?|MEDIDAS?|DIAMETRO|DIÁMETRO|DIAM)\b\.?\s*:?/gi, ' ')
            .replace(/\s+\b(?:DE|CON\s+MEDIDA|FRENTE|FONDO|LARGO|ANCHO|ALTO)\s*$/i, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[,\s.\-·\/]+|[,\s.\-·\/]+$/g, '')
            .trim();
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

    const LIVE_EXTRA_FABRICS = {
        'SORRENTO IVORY': 'MARFIL / IVORY',
        'VOIRON OLIVO': 'VERDE OLIVO',
        'VOIRON PERLA': 'BLANCO PERLA',
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
        'LULLABY OLIVE': 'VERDE OLIVO',
        'LULLABY OYSTER': 'OSTIÓN / MARFIL',
        'DISTRACTION NATURAL': 'ARENA / LINO NATURAL',
        'LOVEME SAND': 'ARENA',
        'LOVEME COTTON': 'BLANCO ALGODÓN',
        'GELLAR MARBLE': 'BLANCO MÁRMOL',
        'GELLAR JUTE': 'YUTE NATURAL',
        'NIZA FOSSIL': 'GRIS FÓSIL',
        'TITTUS PEARL': 'BLANCO PERLA',
        'MADISON SAND': 'ARENA',
        'COPENHAGUE NATURAL': 'NATURAL',
        'COPENHAGUE LINEN': 'LINO',
        'PIXEL FOSIL': 'GRIS FÓSIL',
        'PIXEL LINEN': 'LINO',
        'GLOSS COTTON': 'BLANCO ALGODÓN',
        'SUNSET IVORY': 'MARFIL / IVORY',
        'FRANCE BEIGE': 'BEIGE',
        'GG FRANCE BEIGE': 'BEIGE',
        'MOHAIR 4 CURRY': 'MOSTAZA / CURRY',
        'MOHAIR CURRY': 'MOSTAZA / CURRY',
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
        'FRESH FLAX': 'ARENA / FLAX',
        'LUXOR IVORY': 'MARFIL / IVORY',
        'RHONA ECRU': 'CRUDO / ECRU',
        'RHONA IVORY': 'MARFIL / IVORY',
        'RUSTY NATURAL': 'NATURAL',
        'KIMI PORCELAINE': 'BLANCO PORCELANA',
        'PRISMA OLIVE': 'VERDE OLIVO',
        'ALINE CASHMERE': 'CACHEMIRA / BEIGE',
        'ALINE TOAST': 'TOSTADO / TOAST',
        'LILA LINEN': 'LINO',
        'NANTES CREAM': 'CREMA',
        'ELITE GREY': 'GRIS'
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
    let liveFabricsListSorted = [];
    const liveSkuPrefixProv = new Map();

    function seedBaseLiveVocab() {
        Object.keys(LIVE_EXTRA_FABRICS).forEach(k => {
            const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            if (!liveKnownFabrics.has(kn)) {
                liveKnownFabrics.set(kn, { tl: k, ct: LIVE_EXTRA_FABRICS[k] });
            }
        });
        liveFabricsListSorted = Array.from(liveKnownFabrics.keys()).sort((a, b) => b.length - a.length);
    }
    seedBaseLiveVocab();

    function rebuildLiveAutoVocab(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        const pfxCounts = new Map();
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it) continue;
            const tl = cleanStr(it.tl);
            const ct = cleanStr(it.ct);
            if (tl && tl.length >= 4) {
                const tln = tl.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
                if (!LIVE_BAD_FABRICS.has(tln) && tln.indexOf(' ') !== -1) {
                    const prev = liveKnownFabrics.get(tln);
                    if (!prev || (ct && !prev.ct)) {
                        liveKnownFabrics.set(tln, { tl: tl.toUpperCase(), ct: ct ? ct.toUpperCase() : (prev ? prev.ct : '') });
                    }
                }
            }
            const skuU = cleanStr(it.s).toUpperCase();
            const prov = cleanStr(it.p).toUpperCase();
            const mPfx = skuU.match(/^([A-Z]{2,5})/);
            if (mPfx && prov) {
                const pfx = mPfx[1];
                let cmap = pfxCounts.get(pfx);
                if (!cmap) {
                    cmap = new Map();
                    pfxCounts.set(pfx, cmap);
                }
                cmap.set(prov, (cmap.get(prov) || 0) + 1);
            }
        }
        liveFabricsListSorted = Array.from(liveKnownFabrics.keys()).sort((a, b) => b.length - a.length);
        pfxCounts.forEach((cmap, pfx) => {
            let bestP = '';
            let bestN = 0;
            cmap.forEach((cnt, prName) => {
                if (cnt > bestN) {
                    bestN = cnt;
                    bestP = prName;
                }
            });
            if (bestP) liveSkuPrefixProv.set(pfx, bestP);
        });
    }

    function deduceCategoryLive(tp, nom, curCat) {
        const plainUpper = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const pairs = [[curCat, true], [tp, true], [nom, false]];
        for (let i = 0; i < pairs.length; i++) {
            const txt = plainUpper(pairs[i][0]);
            const allowTelaWord = pairs[i][1];
            if (!txt || /\d.*X.*\d/.test(txt)) continue;
            if (/EXTERIOR|CAMASTRO|COLUMPIO/.test(txt)) return 'EXTERIOR';
            if (/ESPEJO/.test(txt)) return 'ESPEJOS';
            if (/CUADRO|ARTE OBJETO|DECORATIVO PARED|PINTURA|LIENZO/.test(txt)) return 'CUADROS';
            if (/LAMPARA|CANDIL|ARBOTANTE|LUMINARIA/.test(txt)) return 'LÁMPARAS';
            if (allowTelaWord) {
                if (/COJIN|FUNDA|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|^T\.\s|\bTELA\b|RELLENO|DRACON/.test(txt)) return 'COJINES & TEXTILES';
            } else {
                if (/COJIN|FUNDA|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|^T\.\s|^TELA\s+ARTELL\b|RELLENO|DRACON/.test(txt)) return 'COJINES & TEXTILES';
            }
            if (/BUFETERA|BUFETERO|CREDENZA|TRINCHADOR|APARADOR|CONSOLA|CAVA/.test(txt)) return 'BUFETERAS & CREDENZAS';
            if (/MESA DE CENTRO|MESA CENTRAL|MESA LATERAL|MESA AUXILIAR|MESAS DE SALA/.test(txt)) return 'MESAS DE CENTRO & LATERALES';
            if (/RECAMARA|CAMA|CABECERA|BURO|COMODA|CAJONERA|TOCADOR|COLCHON|BOX|LITERA|BAUL/.test(txt)) return 'RECÁMARAS';
            if (/ESCRITORIO|SECRETAIRE|ARCHIVERO|OFICINA|LIBRERO/.test(txt)) return 'OFICINA';
            if (/SALA|SOFA|LOVE SEAT|CHAISE|OTTOMAN|FUTTON|FUTON|ESQUINERO/.test(txt)) return 'SALAS & SOFÁS';
            if (/SILLA|SILLON|TABURETE|BANCO|BANCA/.test(txt)) return 'SILLAS & SILLONES';
            if (/COMEDOR|MESA/.test(txt)) return 'COMEDORES';
            if (/FLORERO|JARRON|ESCULTURA|CHAROLA|CANDELABRO|MACETA|PLANTA|PALMA|FOLLAJE|ACCESORIO|VELA|LIBRO|BOTELLA|BOTELLON|PLATO|ENSALADERA|CANASTO|LINTERNA|CORAL|CONCHA|AJEDREZ|ESFERA/.test(txt)) {
                return 'ACCESORIOS DECORATIVOS';
            }
        }
        return 'COMPLEMENTOS';
    }

    const LIVE_TYPE_RULES = [
        [/\bARBOTANTE\b|^ARB\s+[A-Z]/, 'ARBOTANTE'],
        [/\bCANDIL\b/, 'CANDIL'],
        [/\bLAMPARA\s+(?:DE\s+)?(?:PIE|PISO)\b/, 'LAMPARA DE PISO'],
        [/\bLAMPARA\s+(?:DE\s+)?(?:MESA|BURO)\b/, 'LAMPARA DE MESA'],
        [/\bLAMPARA\s+(?:DE\s+TECHO\s+)?COLGANTE\b/, 'LAMPARA COLGANTE'],
        [/\bLAMPARA\b|\bLUMINARIA\b/, 'LAMPARA'],
        [/\bCAMINO\s+(?:DE\s+)?MESA\b/, 'CAMINO DE MESA'],
        [/\bMANTEL\b|\bMANTA\s+DE\s+MESA\b/, 'MANTEL'],
        [/\bSILLON\s+OCASIONAL\b/, 'SILLON OCASIONAL'],
        [/\bSOFA\s+CAMA\b/, 'SOFA CAMA'],
        [/^SALA\b|\bSALA\s+MODULAR\b|\bSALA\s+ESQUINERA\b/, 'SALA'],
        [/\bCHAISE\s+LONGUE\b|\bCHAISE\b/, 'CHAISE LONGUE'],
        [/\bLOVE\s*SEAT\b|\bLOVESEAT\b/, 'LOVE SEAT'],
        [/\bESQUINERO\b|\bRINCONERA\b/, 'ESQUINERO'],
        [/\bSALA\b/, 'SALA'],
        [/\bFUTTON\b|\bFUTON\b/, 'FUTTON'],
        [/\bSOFA\b/, 'SOFA'],
        [/\bOTTOMAN\b|\bOTOMAN\b|\bPOUF\b|\bPUFF?\b/, 'OTTOMAN'],
        [/\bTABURETE\b/, 'TABURETE'],
        [/\bBANCO\b/, 'BANCO'],
        [/\bBANCA\b/, 'BANCA'],
        [/\bCOLUMPIO\b|\bSILLA\s+COLGANTE\b/, 'COLUMPIO'],
        [/\bCAMASTRO\b/, 'CAMASTRO'],
        [/\bSILLON\b|\bBUTACA\b|\bMECEDORA\b|\bRECLINABLE\b/, 'SILLON'],
        [/\bSILLA\b/, 'SILLA'],
        [/\bMESA\s+(?:DE\s+)?CENTRO\b|\bMESA\s+CENTRAL\b|\bMESA\s+.*?\bCENTRAL\b/, 'MESA DE CENTRO'],
        [/\bMESA\s+LATERAL\b|\bMESA\s+.*?\bLATERAL\b|\bMESA\s+AUXILIAR\b/, 'MESA LATERAL'],
        [/\bMESA\s+(?:DE\s+)?COMEDOR\b|\bANTECOMEDOR\b|\bDESAYUNADOR\b/, 'MESA DE COMEDOR'],
        [/\bCOMEDOR\b/, 'COMEDOR'],
        [/\bBUFETERA\b|\bBUFETERO\b|\bTRINCHADOR\b|\bAPARADOR\b/, 'BUFETERA'],
        [/\bCREDENZA\b/, 'CREDENZA'],
        [/\bCAVA\b|\bCONTRABARRA\b|\bBAR\b/, 'CAVA'],
        [/\bCONSOLA\b/, 'CONSOLA'],
        [/\bMUEBLE\s+(?:DE\s+|PARA\s+)?TV\b|\bCENTRO\s+DE\s+ENTRETENIMIENTO\b/, 'MUEBLE DE TV'],
        [/\bLIBRERO\b|\bREPISA\b|\bESTANTE\b/, 'LIBRERO'],
        [/\bESCRITORIO\b|\bSECRETAIRE\b/, 'ESCRITORIO'],
        [/\bARCHIVERO\b/, 'ARCHIVERO'],
        [/\bCABECERA\b/, 'CABECERA'],
        [/\bBASE\s+(?:DE\s+)?CAMA\b|\bBASE\s+(?:KS|QS|MAT|IND|KING|QUEEN|MATRIMONIAL|INDIVIDUAL)\b/, 'BASE DE CAMA'],
        [/\bCAMA\b|\bLITERA\b|\bRECAMARA\b/, 'CAMA'],
        [/\bCOLCHON\b/, 'COLCHON'],
        [/\bBURO\b/, 'BURO'],
        [/\bCAJONERA\b|\bCHIFONIER\b/, 'CAJONERA'],
        [/\bTOCADOR\b/, 'TOCADOR'],
        [/\bCOMODA\b/, 'COMODA'],
        [/\bBAUL\b/, 'BAUL'],
        [/\bMAMPARA\b|\bBIOMBO\b/, 'MAMPARA'],
        [/\bESPEJO\b|\bMARCO\b/, 'ESPEJO'],
        [/\bCUADRO\b|\bPINTURA\b|\bLIENZO\b|\bGICLEE\b/, 'CUADRO'],
        [/\bPAPEL\s+TAPIZ\b|\bDESC-WALL\b|^WALL\b/, 'PAPEL TAPIZ'],
        [/\bARTE\s+OBJETO\b|\bDECORATIVO\s+(?:DE\s+)?PARED\b|\bACCESORIO\s+DE\s+PARED\b/, 'DECORATIVO PARED'],
        [/\bTAPETE\b|\bALFOMBRAS?\b|^T\.\s+[A-Z]/, 'TAPETE'],
        [/\bCANDELABRO\b|\bPORTAVELAS?\b|\bVELA\b|\bANTORCHA\b/, 'CANDELABRO'],
        [/\bLINTERNA\b|\bFAROL\b/, 'LINTERNA'],
        [/\bMACETA\b|\bMATERA\b/, 'MACETA'],
        [/\bPLANTA\b|\bARBOL\b|\bPALMA\b|\bFOLLAJE\b|\bVARA\b|\bRAMA\b|\bORQUIDEA\b|\bBONSAI\b|\bSUCULENTAS?\b/, 'PLANTA DECORATIVA'],
        [/\bFLORERO\b|\bJARRON\b|\bBOTELLA\b|\bBOTELLON\b|\bTIBOR\b|\bCILINDRO\b|^BASE\b/, 'FLORERO'],
        [/\bCHAROLA\b|\bBANDEJA\b|\bFRUTERO\b|\bENSALADERA\b|\bPLATO\b|\bBOWL\b|\bCENTRO\s+DE\s+MESA\b|\bBATEA\b/, 'CHAROLA'],
        [/\bESCULTURA\b|\bFIGURA\b|\bESFERA\b|\bCORALES?\b|\bCONCHA\b|\bBALLENA\b|\bPECES?\b|\bTORTUGAS?\b|\bPEDESTAL\b/, 'ESCULTURA'],
        [/\bCOLGANTE\b/, 'LAMPARA COLGANTE'],
        [/\bFUNDA\b/, 'FUNDA DECORATIVA'],
        [/\bRELLENO\b|\bDRACON\b/, 'RELLENO'],
        [/\bALMOHADA\b|\bCOJIN\b/, 'COJIN'],
        [/\bFRAZADA\b|\bMANTA\b|\bDUVET\b|\bEDREDON\b|\bSABANA\b|\bCOLCHA\b|\bCUBRECAMA\b/, 'BLANCOS'],
        [/\bTEL-ARTELL\b|^TELA\s+ARTELL\b|^TELA\b/, 'TELA'],
        [/\bLAMINA\s+DE\s+PVC\b|\bLAMBRIN\b|\bPANEL\b/, 'LAMINA DE PVC'],
        [/\bCRISTAL\b|\bCUBIERTA\b/, 'CRISTAL'],
        [/\bMESA\b/, 'MESA'],
        [/\bACCESORIO\b|\bCAJA\b|\bALHAJERO\b|\bLIBRO\b|\bCANAST[OA]\b|\bCESTA\b|\bPORTARRETRATO\b|\bRELOJ\b|\bPERCHERO\b/, 'ACCESORIO DECORATIVO']
    ];

    function deduceProductTypeLive(nom, cat, mo) {
        const plainUpper = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const nomFull = plainUpper(nom);
        const nomHead = nomFull.split(/\bINCLUYE\b/)[0].trim();
        const sources = [nomHead, nomFull, plainUpper(cat), plainUpper(mo)];
        for (let s = 0; s < sources.length; s++) {
            const txt = sources[s];
            if (!txt) continue;
            for (let r = 0; r < LIVE_TYPE_RULES.length; r++) {
                if (LIVE_TYPE_RULES[r][0].test(txt)) return LIVE_TYPE_RULES[r][1];
            }
        }
        return '';
    }

    const LIVE_MODEL_STOPWORDS = new Set([
        'SILLON', 'OCASIONAL', 'INDIVIDUAL', 'SILLA', 'COMEDOR', 'SIN', 'BRAZOS', 'BRAZO', 'CON',
        'DERECHO', 'IZQUIERDO', 'DERECHA', 'IZQUIERDA', 'DER', 'IZQ', 'MESA', 'DE', 'DEL', 'LA', 'EL',
        'LOS', 'LAS', 'Y', 'EN', 'PARA', 'P', 'POR', 'CENTRO', 'CENTRAL', 'LATERAL', 'AUXILIAR',
        'SALA', 'SOFA', 'CAMA', 'LOVE', 'SEAT', 'CHAISE', 'LONGUE', 'ESQUINERO', 'TABURETE', 'OTTOMAN',
        'FUTTON', 'FUTON', 'BANCO', 'BANCA', 'CREDENZA', 'BUFETERA', 'BUFETERO', 'TRINCHADOR', 'APARADOR',
        'CAVA', 'CONSOLA', 'LIBRERO', 'ESCRITORIO', 'SECRETAIRE', 'CABECERA', 'BASE', 'BURO', 'COMODA',
        'CAJONERA', 'TOCADOR', 'BAUL', 'KING', 'SIZE', 'QUEEN', 'MATRIMONIAL', 'KS', 'QS', 'MAT', 'IND',
        'ESPEJO', 'MARCO', 'CUADRO', 'ARTE', 'OBJETO', 'ACCESORIO', 'ACCESORIOS', 'DECORATIVO', 'DECORATIVA',
        'PARED', 'MAMPARA', 'BIOMBO', 'SET', 'JUEGO', 'TAPETE', 'T', 'LAMPARA', 'PIE', 'PISO', 'COLGANTE',
        'ARBOTANTE', 'ARB', 'CANDIL', 'CANDELABRO', 'LINTERNA', 'MACETA', 'JARRON', 'FLORERO', 'BOTELLA',
        'PLANTA', 'PALMA', 'CHAROLA', 'ESCULTURA', 'CAMASTRO', 'COLUMPIO', 'EXTERIOR', 'CHICA', 'CHICO',
        'MEDIANA', 'MEDIANO', 'MED', 'GRANDE', 'GDE', 'ESPECIAL', 'PATA', 'PATAS', 'NEGRA', 'NEGRO',
        'BLANCA', 'BLANCO', 'ORO', 'DORADO', 'CAFE', 'NATURAL', 'TONO', 'TELA', 'ARTELL', 'MADERA',
        'PAROTA', 'ROSA', 'MORADA', 'RM', 'NOGAL', 'ENCINO', 'TECA', 'PINO', 'TZALAM', 'ROBLE', 'CRISTAL',
        'MARMOL', 'LUZ', 'INTERIOR', 'INCLUYE', 'MODULARES', 'MODULAR', 'EMCL', 'PEMCL', 'EMA', 'T1', 'T2'
    ]);

    function cleanOrExtractModelLive(rawMo, cleanNom, tp) {
        const plainUpper = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        let moClean = stripDimensionsAndExtractLive(rawMo).text
            .replace(/^(?:T[12]\s+)?(?:P?EMCL|EMA)\s+/i, '')
            .replace(/^TEL-ARTELL\s+/i, '')
            .trim();
        const moNorm = plainUpper(moClean);
        const words = moClean ? moClean.split(/\s+/) : [];
        const isBad = !moClean ||
            /^[\d\s.,xX*×\/-]+$/.test(moClean) ||
            words.length >= 4 ||
            LIVE_MODEL_STOPWORDS.has(moNorm) ||
            moNorm === plainUpper(tp) ||
            moNorm === plainUpper(cleanNom) ||
            words.some(w => /^(SILLA|SILLON|MESA|SALA|CREDENZA|BUFETERA|CAMA|ESPEJO|CUADRO|TAPETE|LAMPARA)$/i.test(plainUpper(w)));
        if (!isBad) return moClean.toUpperCase();

        const nomTokens = plainUpper(cleanNom.replace(/^T\.\s+/i, 'TAPETE ')).match(/[A-Z0-9]+(?:-[A-Z0-9]+)?/g) || [];
        const cand = [];
        for (let i = 0; i < nomTokens.length; i++) {
            const tok = nomTokens[i];
            if (LIVE_MODEL_STOPWORDS.has(tok)) {
                if (cand.length) break;
                continue;
            }
            if (/^\d+$/.test(tok) && !cand.length) continue;
            cand.push(tok);
            if (cand.length >= 2) {
                if (!/^(SAN|SANTA|GRAN|MONTE|VILLA|CASA|MANABO)$/.test(cand[0]) && !/^(II|III|IV|\d+)$/.test(cand[1])) {
                    cand.pop();
                }
                break;
            }
        }
        return cand.join(' ') || (moClean && !/^[\d\s.,xX*×\/-]+$/.test(moClean) ? moClean.toUpperCase() : '');
    }

    function normalizeInventoryItemLive(it, prevIt) {
        if (!it) return it;
        const plainUpper = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
        const sku = cleanStr(it.s);
        const skuUpper = sku.toUpperCase();
        const erpRef = skuUpper ? liveErpCatalogBySku.get(skuUpper) : null;

        let nom = cleanStr(it.n);
        let mo = cleanStr(it.mo) || (erpRef && erpRef.mo) || '';
        let tp = cleanStr(it.tp);
        let vr = cleanStr(it.vr);
        let med = cleanStr(it.m);
        let cat = cleanStr(it.c);

        if ((!nom || nom.toUpperCase() === skuUpper) && erpRef && erpRef.n) {
            nom = erpRef.n;
        }

        // 1) Si NOMBRE trae únicamente medidas ("MEDIDAS: 0 x 150 x 150" / "2.80 mts."), recuperar el nombre real
        if (/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(nom)) {
            const badParsed = stripDimensionsAndExtractLive(nom);
            if (!med && badParsed.med) med = badParsed.med;
            const prevClean = prevIt && cleanStr(prevIt.n) && !/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(cleanStr(prevIt.n))
                ? cleanStr(prevIt.n)
                : '';
            const erpClean = erpRef && erpRef.n && !/^(?:MEDIDAS?\s*:|[\d\s.,xX*×]+(?:CM|MTS?|M)?\.?$)/i.test(erpRef.n)
                ? erpRef.n
                : '';
            const moAlt = (mo && !/^[\d\s.,xX*×]+$/.test(mo)) ? mo.replace(/^TEL-ARTELL\s+/i, 'TELA ARTELL ') : '';
            nom = prevClean || erpClean || moAlt || sku;
        }
        if (/^T\.\s+[A-Z]/i.test(nom)) nom = nom.replace(/^T\.\s+/i, 'TAPETE ');
        if (/^TEL-ARTELL\s+/i.test(nom)) nom = nom.replace(/^TEL-ARTELL\s+/i, 'TELA ARTELL ');

        // 2) Quitar medidas incrustadas en NOMBRE y guardarlas en MEDIDAS si estaba vacío
        const parsedNom = stripDimensionsAndExtractLive(nom);
        if (parsedNom.text && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(parsedNom.text)) {
            nom = parsedNom.text;
        }
        if (!med && parsedNom.med) med = parsedNom.med;
        if (!med && mo) {
            const parsedMo = stripDimensionsAndExtractLive(mo);
            if (parsedMo.med) med = parsedMo.med;
        }
        if (!med && prevIt && cleanStr(prevIt.m)) med = cleanStr(prevIt.m);
        if (med && /^\d+(?:\.\d+)?(?:\s*[xX*×]\s*\d+(?:\.\d+)?)+$/.test(med)) {
            med = med.replace(/\s*[xX*×]\s*/g, 'X') + ' CM';
        }

        // 3) Completar automáticamente TIPO DE PRODUCTO, MODELO, CATEGORÍA, TELA, MADERA, MATERIALES, VARIANTE y PROVEEDOR
        if (!tp) tp = (prevIt && cleanStr(prevIt.tp)) || deduceProductTypeLive(nom, cat, mo) || 'ACCESORIO DECORATIVO';
        const nomHeadLive = plainUpper(nom).split(/\b(?:INCLUYE|INCL|CON\s+\d|C\/\s*FUNDAS)\b/)[0].trim();
        if (/^SALA\b/.test(nomHeadLive) && !/^SALA\s+(?:DE\s+)?COMEDOR\b/.test(nomHeadLive)) {
            tp = 'SALA';
        } else if (/^RECAMARA\b/.test(nomHeadLive)) {
            tp = 'RECÁMARA';
        }
        let cleanedMo = cleanOrExtractModelLive(mo, nom, tp);
        if (!cleanedMo) {
            cleanedMo = (prevIt && cleanStr(prevIt.mo) ? stripDimensionsFromProductText(prevIt.mo).toUpperCase() : '');
        }
        if (!cleanedMo) {
            const tpWords = new Set(plainUpper(tp).split(/\s+/));
            const remWords = (nom.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9]+/g) || [])
                .map(w => w.toUpperCase())
                .filter(w => !tpWords.has(plainUpper(w)) && !/^(DE|DEL|LA|EL|Y|CON|EN)$/.test(plainUpper(w)));
            cleanedMo = remWords[0] || skuUpper;
        }
        mo = cleanedMo;

        if (!cat || /\d.*x.*\d/i.test(cat)) {
            cat = (prevIt && cleanStr(prevIt.c) && !/\d.*x.*\d/i.test(prevIt.c))
                ? cleanStr(prevIt.c)
                : deduceCategoryLive(tp, nom, cat);
        }

        let tl = cleanStr(it.tl) || (prevIt && cleanStr(prevIt.tl)) || '';
        let ct = cleanStr(it.ct) || (prevIt && cleanStr(prevIt.ct)) || '';
        let md = cleanStr(it.md) || (prevIt && cleanStr(prevIt.md)) || '';
        let cm = cleanStr(it.cm) || (prevIt && cleanStr(prevIt.cm)) || '';
        let mt = cleanStr(it.mt) || (prevIt && cleanStr(prevIt.mt)) || '';
        let prov = cleanStr(it.p) || (prevIt && cleanStr(prevIt.p)) || '';

        const searchBlob = ' ' + plainUpper(nom) + ' ';
        if (tp === 'TELA' && !tl && mo) tl = mo;
        if (!tl && liveFabricsListSorted.length > 0) {
            for (let f = 0; f < liveFabricsListSorted.length; f++) {
                const fk = liveFabricsListSorted[f];
                if (searchBlob.indexOf(' ' + fk + ' ') !== -1) {
                    const fInfo = liveKnownFabrics.get(fk);
                    if (fInfo) {
                        tl = fInfo.tl;
                        if (!ct && fInfo.ct) ct = fInfo.ct;
                    }
                    break;
                }
            }
        } else if (tl && !ct) {
            const fInfo = liveKnownFabrics.get(plainUpper(tl));
            if (fInfo && fInfo.ct) ct = fInfo.ct;
        }

        if (!md) {
            for (let w = 0; w < LIVE_WOOD_PATTERNS.length; w++) {
                if (LIVE_WOOD_PATTERNS[w][0].test(searchBlob)) {
                    md = LIVE_WOOD_PATTERNS[w][1];
                    break;
                }
            }
        }
        if (!cm) {
            for (let w = 0; w < LIVE_WOOD_COLOR_PATTERNS.length; w++) {
                if (LIVE_WOOD_COLOR_PATTERNS[w][0].test(searchBlob)) {
                    cm = LIVE_WOOD_COLOR_PATTERNS[w][1];
                    break;
                }
            }
        }
        if (!mt) {
            const mats = [];
            for (let mIdx = 0; mIdx < LIVE_MATERIAL_PATTERNS.length; mIdx++) {
                if (LIVE_MATERIAL_PATTERNS[mIdx][0].test(searchBlob) && mats.indexOf(LIVE_MATERIAL_PATTERNS[mIdx][1]) === -1) {
                    mats.push(LIVE_MATERIAL_PATTERNS[mIdx][1]);
                }
            }
            if (mats.length > 0) mt = mats.slice(0, 3).join(', ');
        }

        if (vr) {
            const vrParsed = stripDimensionsAndExtractLive(vr);
            if (vrParsed.text && /[A-Za-z]{2,}/.test(vrParsed.text)) vr = vrParsed.text;
        } else if (prevIt && cleanStr(prevIt.vr)) {
            vr = stripDimensionsFromProductText(prevIt.vr);
        }
        if (!vr) {
            const vParts = [];
            if (tl) vParts.push(tl);
            if (md) vParts.push(md + (cm && md.indexOf(cm) === -1 ? ' ' + cm : ''));
            else if (cm) vParts.push(cm);
            if (mt && vParts.length === 0) vParts.push(mt);
            if (vParts.length > 0) {
                vr = vParts.join(' · ');
            } else {
                const usedWords = new Set(plainUpper(tp + ' ' + mo).split(/\s+/));
                const remVar = (nom || '').split(/\s+/).filter(w => {
                    const nw = plainUpper(w);
                    return nw && !usedWords.has(nw) && !/^(DE|DEL|LA|EL|EN|CON|Y)$/.test(nw);
                });
                vr = remVar.join(' ').trim() || 'ESTÁNDAR';
            }
        }

        if (!prov && skuUpper) {
            const mPfx = skuUpper.match(/^([A-Z]{2,5})/);
            if (mPfx && liveSkuPrefixProv.has(mPfx[1])) {
                prov = liveSkuPrefixProv.get(mPfx[1]);
            }
        }

        it.n = nom || sku;
        it.tp = tp;
        it.mo = mo;
        it.vr = vr;
        it.m = med;
        it.c = cat;
        it.tl = tl;
        it.ct = ct;
        it.md = md;
        it.cm = cm;
        it.mt = mt;
        it.p = prov;
        it.f = cleanStr(it.f);
        if (!cleanStr(it.pr) && erpRef && erpRef.pr) {
            it.pr = erpRef.pr;
        }
        return it;
    }

    const GENERIC_GROUP_MODELS = new Set([
        'FUNDA', 'FUNDAS', 'COJIN', 'COJINES', 'RELLENO', 'RELLENOS', 'ALMOHADA', 'ALMOHADAS', 'ALHOMADA',
        'BLANCOS', 'SABANA', 'SABANAS', 'CUBRECAMA', 'COLCHA', 'EDREDON', 'DUVET', 'FRAZADA', 'MANTA', 'MANTAS',
        'SERVILLETA', 'SERVILLETAS', 'INDIVIDUAL', 'INDIVIDUALES', 'MANTEL', 'CAMINO', 'PORTAVASO', 'TOALLA',
        'HILOS', 'SATIN', 'PERCAL', 'MUSELINA', 'WAFFLE', 'TELAR', 'FRANCES', 'STONE', 'WASH', 'RAW', 'EDGE',
        'MICROGEL', 'PLUMA', 'SINT', 'SINTETICO', 'SINTETICA', 'PREMIUM',
        'BOHO', 'RAYA', 'RAYAS', 'FRANJA', 'FRANJAS', 'LINEA', 'LINEAS', 'PUNTOS', 'BLOQUES', 'ESPIGA', 'TEXTURA', 'MANUAL',
        'FLECOS', 'BORLAS', 'POMPON', 'POMPONES', 'LISO', 'LISA', 'BORDADO', 'BORDADA', 'EURO', 'LUMBAR', 'CAL', 'FULL',
        'VERTICALES', 'BANDA', 'BANDAS', 'BAJO',
        'FOLLAJE', 'ARBOL', 'VARA', 'HOJA', 'HOJAS', 'FLOR', 'FLORES', 'PLANTA', 'PALMA', 'RAMA',
        'MAPLE', 'EUCALIPTO', 'FICUS', 'OLIVO', 'SUCULENTA', 'SUCULENTAS',
        'MACETA', 'MACETAS', 'MACETERO', 'MACETEROS', 'FLORERO', 'JARRON', 'CILINDRO', 'BOTELLON', 'BOTELLA', 'BOLA',
        'CORAL', 'FIGURA', 'ESCULTURA', 'BALLENA', 'PEZ', 'PECES', 'CARACOL', 'CONCHA', 'ESFERA', 'CANGREJO', 'TIBURON', 'TORTUGA', 'ESTRELLA', 'ESTRELLAS', 'BARCO', 'BARCOS',
        'GICLEE', 'ABSTRACTO', 'CUADRO', 'CUADROS', 'LIENZO', 'PINTURA', 'ARTE', 'ATADO', 'DIPTICO', 'TRIPTICO', 'POLIPTICO', 'HORIZONTAL', 'VERTICAL', 'MAR',
        'PLATO', 'PLATON', 'TAZON', 'BOWL', 'CHAROLA', 'CHAROLAS', 'BANDEJA', 'BANDEJAS', 'FRUTERO', 'ENSALADERA', 'TORTILLERO', 'BATEA', 'BOTANERO', 'SERVILLETERO', 'COPA', 'TABLA', 'TABLAS',
        'PORTAVELA', 'PORTAVELAS', 'CANDELABRO', 'VELA', 'VELAS', 'FAROL', 'LINTERNA', 'ANTORCHA', 'COLGANTE', 'COLGANTES', 'HONGO', 'PIE', 'CAPELO', 'CAPELOS',
        'CAJA', 'RELOJ', 'LIBRO', 'LIBROS', 'PORTARRETRATO', 'CANASTO', 'CANASTOS', 'CANASTA', 'CESTA', 'BOLSA', 'BOSA', 'BOTE', 'ALHAJERO', 'CORDON', 'CORDONES',
        'PEDESTAL', 'ACCESORIO', 'ACCESORIOS', 'ACCECORIO', 'DECORATIVO', 'DECORATIVA', 'NAVIDAD', 'NOCHE', 'PRODUCTO',
        'JGO', 'JUEGO', 'SET', 'PIEZA', 'PIEZAS', 'PC', 'PZ', 'PZAS', 'TAG', 'DBL', 'OROL',
        'ESTANDAR', 'ESPECIAL', 'PROYECTO', 'UNIT', 'WALL', 'GABINETE', 'MODULO', 'MODULAR', 'NIDO', 'SERVICIO',
        'ESQUINA', 'ESQUINAS', 'FILO', 'BORDES', 'REDONDEADO', 'REDONDEADOS', 'READONDEADOS', 'CANTOS', 'PULIDO', 'PULIDOS',
        'COSTADOS', 'CAPAS', 'CUELLO', 'PATA', 'PATAS', 'PARA', 'PUERTAS', 'CORREDIZAS', 'ENTREPA', 'ENTREPANO', 'VOLADA', 'VOLADAS', 'EXTENDIBLE', 'MOD',
        'EJECUTIVO', 'SEMI', 'BAR', 'CIRCULAR', 'CONTACTO',
        'COLCHON', 'COLCHONES', 'DESC-COLCHON', 'DESC', 'DTO', 'DESC-DTO', 'CREATA', 'RESORTES', 'BOX', 'SPRING', 'AIR', 'MEMORY', 'FOAM', 'FIRME',
        'TELA', 'TAPIZ', 'TAPICERIA', 'YUTE', 'JUTE', 'PAJA', 'ALGODON', 'LINO', 'PIEL', 'VINIL', 'MADERA', 'CRISTAL', 'MARMOL', 'PANEL',
        'METAL', 'CERAMICA', 'VIDRIO', 'RATTAN', 'HENEQUEN', 'CUERDA', 'TEJIDO', 'TEJIDA', 'BARRO', 'PIEDRA', 'TEMPLADO', 'LAMINADO', 'LAMINADA', 'SOLIDA', 'SOLIDO',
        'TECA', 'TEKA', 'NOGAL', 'PAROTA', 'ENCINO', 'TZALAM', 'PINO', 'ROBLE',
        'BLANCO', 'BLANCA', 'BLANCAS', 'NEGRO', 'NEGRA', 'NEGROS', 'NEGRAS', 'GRIS', 'GRISES',
        'BEIGE', 'NATURAL', 'NAT', 'CAFE', 'CHOCOLATE', 'MARRON', 'ORO', 'DORADO', 'DORADA', 'DORADAS', 'COBRE', 'BRONCE',
        'PLATA', 'AZUL', 'AZULES', 'MARINO', 'MARINA', 'MARINAS', 'AQUA', 'TURQUESA',
        'VERDE', 'VERDES', 'OLIVA', 'SALVIA', 'ROJO', 'ROJA', 'ROJOS', 'ROJAS', 'VINO', 'TINTO', 'BRICK',
        'AMARILLO', 'AMARILLA', 'MOSTAZA', 'OCRE', 'NARANJA', 'ROSA', 'MORADO', 'MORADA', 'VIOLETA', 'TERRACOTA',
        'ARENA', 'HUMO', 'CREMA', 'IVORY', 'AMBAR', 'CAMEL', 'TAUPE', 'TOPO', 'MINERAL', 'PERLA', 'HUESO', 'CRUDO', 'CARBON', 'GRAFITO', 'ACERO',
        'CLARO', 'CLARA', 'OSCURO', 'OSCURA', 'OBSCURO', 'OBSCURA',
        'RECTANGULAR', 'CUADRADO', 'CUADRADA', 'REDONDO', 'REDONDA', 'OVAL', 'OVALADO', 'OVALADA',
        'LARGO', 'LARGA', 'ALTO', 'ALTA', 'CHICO', 'CHICA', 'MEDIANO', 'MEDIANA', 'GRANDE',
        'KING', 'QUEEN', 'MATRIMONIAL',
        'SALA', 'SALAS', 'SOFA', 'SOFAS', 'LOVESEAT', 'LOVESEATS', 'SILLON', 'SILLONES', 'SILLA', 'SILLAS',
        'MESA', 'MESAS', 'COMEDOR', 'COMEDORES', 'RECAMARA', 'RECAMARAS', 'CAMA', 'CAMAS', 'CABECERA', 'CABECERAS', 'BASE', 'BASES', 'BURO', 'BUROS',
        'COMODA', 'COMODAS', 'TOCADOR', 'TOCADORES', 'CAJONERA', 'CAJONERAS', 'CREDENZA', 'CREDENZAS', 'BUFETERA', 'BUFETERAS', 'BUFETERO', 'BUFETEROS',
        'LIBRERO', 'LIBREROS', 'ESCRITORIO', 'ESCRITORIOS', 'ARCHIVERO', 'ARCHIVEROS', 'BANCA', 'BANCAS', 'BANCO', 'BANCOS', 'TABURETE', 'TABURETES',
        'OTTOMAN', 'OTOMAN', 'POUF', 'PUFF', 'ESQUINERO', 'ESQUINEROS', 'CHAISE', 'LONGUE', 'FUTTON', 'FUTON',
        'ESPEJO', 'ESPEJOS', 'LAMPARA', 'LAMPARAS', 'CANDIL', 'CANDILES', 'TAPETE', 'TAPETES'
    ]);

    const MODEL_TYPO_ALIASES = {
        'mikonis': 'mikonos',
        'sarich': 'saric',
        'sienna': 'siena',
        'zenit': 'zenith',
        'mostera': 'monstera',
        'licualo': 'licuala',
        'mangnolia': 'magnolia',
        'enrredadera': 'enredadera',
        'pigen': 'pigeon',
        'seashells': 'seashell',
        'benzio iii': 'benzio'
    };

    function plainModelToken(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isContextuallyValidModel(tok, domName) {
        if (tok === 'NIDO' && (domName === 'SALAS_TAPIZ' || domName === 'COMEDORES')) return true;
        if (tok === 'YUTE' && domName === 'RECAMARAS_MUEBLE') return true;
        if (tok === 'MARINA' && /^(MESAS_SALA|COMEDORES|SALAS_TAPIZ|RECAMARAS_MUEBLE)$/.test(domName)) return true;
        return false;
    }

    function resolveDistinctGroupModel(it, domInfo) {
        if (!it) return '';
        const domName = (domInfo && domInfo.domain) || '';
        const skuNorm = plainModelToken(it.s);
        const tpNorm = plainModelToken(stripDimensionsFromProductText(it.tp));
        let moClean = stripDimensionsFromProductText(it.mo).toUpperCase()
            .replace(/^OBJETO\s+/i, '')
            .replace(/-CHAROLA$/i, '')
            .trim();
        const moNorm = plainModelToken(moClean);

        if (/^(?:LINEA|MODELO|SERIE)\s+\d+[A-Z]?$/.test(moNorm)) {
            return moClean;
        }
        if (isContextuallyValidModel(moNorm, domName)) {
            return moClean;
        }

        if (
            moNorm &&
            moNorm.length >= 2 &&
            !moNorm.startsWith('DESC-') &&
            moNorm !== 'MAQ FOR' &&
            !GENERIC_GROUP_MODELS.has(moNorm) &&
            moNorm !== tpNorm &&
            moNorm !== skuNorm &&
            !/^[\d\s.,xX*×\/-]+$/.test(moNorm)
        ) {
            const moWords = moNorm.split(' ').filter(Boolean);
            const allGeneric = moWords.every(w => (GENERIC_GROUP_MODELS.has(w) && !isContextuallyValidModel(w, domName)) || /^\d+$/.test(w));
            if (!allGeneric) return moClean;
        }

        // Respaldo: extraer nombre real de colección/modelo desde NOMBRE cuando MODELO venía genérico (ej. "COLCHON BERRY KING SIZE" -> "BERRY")
        const nomClean = plainModelToken(stripDimensionsFromProductText(it.n));
        const mModCode = nomClean.match(/\bMOD\.?\s+([A-Z]{1,4}-\d{2,5}[A-Z]?)\b/);
        if (mModCode) return mModCode[1];
        const mKnownTwo = nomClean.match(/\b(NUDE\s+BEACH|PALM\s+BEACH|NEW\s+YORK|SANTA\s+MONICA(?:\s+II)?|SANTA\s+FE|SAN\s+MARINO|SAN\s+MIGUEL|SAN\s+THOMAS|EN\s+LA\s+COSTA|GEOMETRIA\s+ARENA|OJO\s+DE\s+GATO|HILO\s+DE\s+ORO|PATA\s+DE\s+GALLO)\b/);
        if (mKnownTwo) return mKnownTwo[1];

        const tpWords = new Set(tpNorm.split(' ').filter(Boolean));
        const tokens = nomClean.match(/[A-Z0-9]+/g) || [];
        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            if (isContextuallyValidModel(tok, domName)) return tok;
            if (tok.length < 3 || /^\d/.test(tok) || /\d$/.test(tok)) continue;
            if (i > 0 && tokens[i - 1] === 'GRIS' && tok === 'OXFORD') continue;
            if (tok === skuNorm || tpWords.has(tok) || GENERIC_GROUP_MODELS.has(tok)) continue;
            if (/^(DE|DEL|LA|EL|LOS|LAS|CON|SIN|EN|Y|PARA|POR|SIZE|KS|QS|MAT|IND|PC|PZ|PZAS|MTS|CM|EXPO|ORIGINAL|PRINT|BCO|NGO|GRS|CL|OSC|RED|DBL|OROL|TAG|VIDRIO|OCASIONAL|CARDEADO|BARNIZ|MATTE|ESTRUCTURA|CUBIERTA|IMITACION|RECUBRIMIENTO|POLVO|ALUMBRE|ACABADO|PANTALLA|COLOR|INALAMBRICA|CARGA|MATE|ROCOSA|BRILLANTE|TIPO)$/.test(tok)) {
                continue;
            }
            return tok;
        }
        return '';
    }

    function canonicalizeGroupModelKey(distinctMo, domInfo) {
        const domName = (domInfo && domInfo.domain) || '';
        let k = plainModelToken(distinctMo)
            .replace(/^DMX-[MN]\b/, 'DMX');

        if (!/^(?:LINEA|MODELO|SERIE)\s+\d/.test(k) && !/^CUADROS/.test(domName)) {
            k = k.replace(/\s+\d{1,6}$/, '');
        }
        if (domName === 'SALAS_TAPIZ') {
            k = k.replace(/\s+SW$/, '');
        }
        const parts = k.split(' ').filter(Boolean);
        if (
            parts.length >= 2 &&
            parts[0].length >= 4 &&
            !/^(SANTA|SAN|GRAN|CASA|VILLA|LINEA|MODELO|SERIE|BOSQUE|GEOMETRIA|TEXTURA|NUDE|PALM|PATA)$/.test(parts[0]) &&
            /^(TALL|LOW|HIGH|COBRE|OCRE|CHICO|CHICA|MEDIANO|MEDIANA|GRANDE|GDE|CH|MED|CUADRADO|CUADRADA|CIRCULAR|REDONDO|REDONDA|RECTANGULAR|OVALADO|OVALADA)$/.test(parts[parts.length - 1])
        ) {
            parts.pop();
            k = parts.join(' ');
        }
        let norm = normalizePlain(k);
        if (Object.prototype.hasOwnProperty.call(MODEL_TYPO_ALIASES, norm)) {
            norm = MODEL_TYPO_ALIASES[norm];
        }
        return norm;
    }

    // Tipo de mueble canónico e independiente de formas/medidas (cuadrado, circular, redondo, rectangular, ovalado, chico, grande)
    function resolveCanonicalFurnitureInfo(it) {
        const subCat = (it && it._cat) || resolveItemSubcategory(it, resolveItemCategory(it));
        const mainCat = (it && it._main) || MAIN_OF_SUB[subCat] || 'ESPEJOS Y ACCESORIOS';
        const tpTok = plainModelToken(stripDimensionsFromProductText(it && it.tp));
        const nomTok = plainModelToken(stripDimensionsFromProductText(it && it.n));

        if (mainCat === 'SALAS') {
            if (subCat === 'MESAS DE CENTRO') {
                return { domain: 'MESAS_SALA', typeKey: 'MESA_CENTRO', typeLabel: 'MESA DE CENTRO', typeRank: 50 };
            }
            if (subCat === 'MESAS LATERALES') {
                return { domain: 'MESAS_SALA', typeKey: 'MESA_LATERAL', typeLabel: 'MESA LATERAL', typeRank: 55 };
            }
            if (subCat === 'FUTONES & SOFÁ CAMAS') {
                if (/\b(FUTTON|FUTON)\b/.test(tpTok + ' ' + nomTok)) {
                    return { domain: 'SALAS_TAPIZ', typeKey: 'FUTON', typeLabel: 'FUTÓN', typeRank: 42 };
                }
                return { domain: 'SALAS_TAPIZ', typeKey: 'SOFA_CAMA', typeLabel: 'SOFÁ CAMA', typeRank: 40 };
            }
            if (subCat === 'SILLONES' || /^SILLON\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SILLON', typeLabel: 'SILLÓN', typeRank: 30 };
            }
            if (/^(OTTOMAN|OTOMAN|POUF|PUFF|TABURETE)$/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'OTTOMAN', typeLabel: 'OTOMÁN', typeRank: 45 };
            }
            if (/^ESQUINERO\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'ESQUINERO', typeLabel: 'ESQUINERO', typeRank: 12 };
            }
            if (/^CHAISE\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'CHAISE_LONGUE', typeLabel: 'CHAISE LONGUE', typeRank: 14 };
            }
            if (/^(REMATE|MODULO)\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'MODULO_SALA', typeLabel: 'MÓDULO DE SALA', typeRank: 16 };
            }
            if (/^(LOVE\s*SEAT|LOVESEAT)\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'LOVE_SEAT', typeLabel: 'LOVE SEAT', typeRank: 25 };
            }
            if (/^SOFA\b/.test(tpTok)) {
                return { domain: 'SALAS_TAPIZ', typeKey: 'SOFA', typeLabel: 'SOFÁ', typeRank: 20 };
            }
            return { domain: 'SALAS_TAPIZ', typeKey: 'SALA', typeLabel: 'SALA', typeRank: 10 };
        }

        if (mainCat === 'COMEDORES') {
            if (subCat === 'SILLAS' || /^SILLA\b/.test(tpTok)) {
                return { domain: 'COMEDORES', typeKey: 'SILLA_COMEDOR', typeLabel: 'SILLA', typeRank: 65 };
            }
            if (subCat === 'BANCOS & BANCAS') {
                if (/^BANCA\b/.test(tpTok)) return { domain: 'COMEDORES', typeKey: 'BANCA', typeLabel: 'BANCA', typeRank: 70 };
                if (/^TABURETE\b/.test(tpTok)) return { domain: 'COMEDORES', typeKey: 'TABURETE', typeLabel: 'TABURETE', typeRank: 74 };
                return { domain: 'COMEDORES', typeKey: 'BANCO', typeLabel: 'BANCO', typeRank: 72 };
            }
            if (subCat === 'BUFETERAS' || /^BUFET/.test(tpTok)) {
                return { domain: 'COMEDORES', typeKey: 'BUFETERA', typeLabel: 'BUFETERA', typeRank: 76 };
            }
            if (/^CUBIERTA\b/.test(tpTok)) {
                return { domain: 'COMEDORES', typeKey: 'CUBIERTA_MESA', typeLabel: 'CUBIERTA DE MESA', typeRank: 62 };
            }
            const isComedorExplicit = /\bCOMEDOR\b|\b(?:4|6|8|10|12)P\b/.test(tpTok + ' ' + nomTok);
            return {
                domain: 'COMEDORES',
                typeKey: 'MESA_COMEDOR',
                typeLabel: isComedorExplicit ? 'MESA DE COMEDOR' : 'MESA',
                typeRank: isComedorExplicit ? 60 : 61
            };
        }

        if (mainCat === 'RECÁMARAS') {
            if (subCat === 'COLCHONES') {
                return { domain: 'COLCHONES', typeKey: 'COLCHON', typeLabel: 'COLCHÓN', typeRank: 86 };
            }
            if (subCat === 'CABECERAS') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'CABECERA', typeLabel: 'CABECERA', typeRank: 82 };
            }
            if (subCat === 'BASES') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'BASE_CAMA', typeLabel: 'BASE DE CAMA', typeRank: 84 };
            }
            if (subCat === 'BURÓS') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'BURO', typeLabel: 'BURÓ', typeRank: 88 };
            }
            if (subCat === 'COMODAS Y TOCADORES') {
                const isCajonera = tpTok === 'CAJONERA';
                return {
                    domain: 'RECAMARAS_MUEBLE',
                    typeKey: 'COMODA',
                    typeLabel: isCajonera ? 'CAJONERA' : 'CÓMODA',
                    typeRank: isCajonera ? 91 : 90
                };
            }
            if (subCat === 'PIE DE CAMA') {
                return { domain: 'RECAMARAS_MUEBLE', typeKey: 'PIE_CAMA', typeLabel: 'PIE DE CAMA', typeRank: 92 };
            }
            if (tpTok === 'LITERA') return { domain: 'RECAMARAS_MUEBLE', typeKey: 'LITERA', typeLabel: 'LITERA', typeRank: 80.5 };
            if (tpTok === 'CUNA') return { domain: 'RECAMARAS_MUEBLE', typeKey: 'CUNA', typeLabel: 'CUNA', typeRank: 81 };
            return { domain: 'RECAMARAS_MUEBLE', typeKey: 'CAMA', typeLabel: 'CAMA', typeRank: 80 };
        }

        if (mainCat === 'COMPLEMENTOS') {
            if (subCat === 'MUEBLES PARA TV') return { domain: 'MUEBLES_TV', typeKey: 'MUEBLE_TV', typeLabel: 'MUEBLE DE TV', typeRank: 100 };
            if (subCat === 'CREDENZAS') return { domain: 'CREDENZAS', typeKey: 'CREDENZA', typeLabel: 'CREDENZA', typeRank: 102 };
            if (subCat === 'MUEBLES DE BAR') {
                const isMuebleBar = tpTok === 'BAR';
                return { domain: 'MUEBLES_BAR', typeKey: 'CAVA', typeLabel: isMuebleBar ? 'MUEBLE DE BAR' : 'CAVA', typeRank: isMuebleBar ? 105 : 104 };
            }
            if (subCat === 'LIBREROS') return { domain: 'OFICINA_ESTUDIO', typeKey: 'LIBRERO', typeLabel: 'LIBRERO', typeRank: 106 };
            if (subCat === 'ESCRITORIOS') return { domain: 'OFICINA_ESTUDIO', typeKey: 'ESCRITORIO', typeLabel: 'ESCRITORIO', typeRank: 108 };
            if (tpTok === 'CAMASTRO') return { domain: 'EXTERIOR', typeKey: 'CAMASTRO', typeLabel: 'CAMASTRO', typeRank: 110 };
            if (tpTok === 'COLUMPIO') return { domain: 'EXTERIOR', typeKey: 'COLUMPIO', typeLabel: 'COLUMPIO', typeRank: 111 };
            return { domain: 'EXTERIOR', typeKey: 'EXT_' + (tpTok || 'MUEBLE'), typeLabel: tpTok || 'MUEBLE EXTERIOR', typeRank: 112 };
        }

        if (subCat === 'ESPEJOS') {
            return { domain: 'ACC_ESPEJOS', typeKey: 'ESPEJO', typeLabel: 'ESPEJO', typeRank: 120 };
        }
        if (subCat === 'CUADROS') {
            const provTok = plainModelToken(it && it.p).replace(/\bCUADRO\s+/g, '').trim();
            const artKey = provTok && provTok !== 'AJUSTE DE INVENTARIO' ? ('CUADRO_' + provTok) : 'CUADRO';
            const isDecPared = tpTok === 'DECORATIVO PARED';
            return {
                domain: 'CUADROS_' + artKey,
                typeKey: artKey,
                typeLabel: isDecPared ? 'DECORATIVO DE PARED' : 'CUADRO',
                typeRank: isDecPared ? 126 : 125
            };
        }
        if (subCat === 'LÁMPARAS') {
            if (tpTok === 'LAMPARA DE MESA') return { domain: 'ACC_LAMPARAS', typeKey: 'LAMPARA_MESA', typeLabel: 'LÁMPARA DE MESA', typeRank: 130 };
            if (tpTok === 'LAMPARA DE PISO') return { domain: 'ACC_LAMPARAS', typeKey: 'LAMPARA_PISO', typeLabel: 'LÁMPARA DE PISO', typeRank: 131 };
            if (tpTok === 'CANDIL') return { domain: 'ACC_LAMPARAS', typeKey: 'CANDIL', typeLabel: 'CANDIL', typeRank: 132 };
            if (tpTok === 'LAMPARA COLGANTE') return { domain: 'ACC_LAMPARAS', typeKey: 'LAMPARA_COLGANTE', typeLabel: 'LÁMPARA COLGANTE', typeRank: 133 };
            if (tpTok === 'ARBOTANTE') return { domain: 'ACC_LAMPARAS', typeKey: 'ARBOTANTE', typeLabel: 'ARBOTANTE', typeRank: 134 };
            if (tpTok === 'LINTERNA') return { domain: 'ACC_LAMPARAS', typeKey: 'LINTERNA', typeLabel: 'LINTERNA', typeRank: 135 };
            return { domain: 'ACC_LAMPARAS', typeKey: 'LAMPARA', typeLabel: 'LÁMPARA', typeRank: 136 };
        }
        if (subCat === 'COJINES & TEXTILES') {
            if (tpTok === 'TAPETE') {
                return { domain: 'TEX_TAPETE', typeKey: 'TAPETE', typeLabel: 'TAPETE', typeRank: 140 };
            }
            if (/^FUNDA\b/.test(tpTok) || /^FUNDA\b/.test(nomTok)) {
                return { domain: 'TEX_HOGAR', typeKey: 'FUNDA_DECORATIVA', typeLabel: 'FUNDA DECORATIVA', typeRank: 142 };
            }
            if (tpTok === 'RELLENO' || /^RELLENO\b/.test(nomTok)) {
                return { domain: 'TEX_HOGAR', typeKey: 'RELLENO_COJIN', typeLabel: 'RELLENO DE COJÍN', typeRank: 145 };
            }
            if (tpTok === 'COJIN') {
                return { domain: 'TEX_HOGAR', typeKey: 'COJIN', typeLabel: 'COJÍN', typeRank: 144 };
            }
            if (/^(TELA|TAPICERIA|COMPONENTES TAPICERIA|SINTETICO)$/.test(tpTok)) {
                return { domain: 'TEX_TELA', typeKey: 'TELA', typeLabel: 'TELA', typeRank: 152 };
            }
            if (/\b(CAMINO|MANTEL|SERVILLETA|SERVILLETAS|INDIVIDUAL|INDIVIDUALES|PORTAVASO|SERVILLETERO)\b/.test(tpTok + ' ' + nomTok)) {
                let mLbl = tpTok || 'TEXTIL DE MESA';
                let mRank = 151;
                if (/\bINDIVIDUAL/.test(tpTok + ' ' + nomTok)) { mLbl = 'INDIVIDUAL DE MESA'; mRank = 148; }
                else if (/\bSERVILLETA/.test(tpTok + ' ' + nomTok)) { mLbl = 'SERVILLETA'; mRank = 149; }
                else if (/\bCAMINO\b/.test(tpTok + ' ' + nomTok)) { mLbl = 'CAMINO DE MESA'; mRank = 150; }
                else if (/\bMANTEL/.test(tpTok + ' ' + nomTok)) { mLbl = 'MANTEL'; mRank = 150.5; }
                return { domain: 'TEX_MESA', typeKey: 'TEX_MESA_' + mLbl, typeLabel: mLbl, typeRank: mRank };
            }
            return { domain: 'TEX_BLANCOS', typeKey: 'BLANCOS_' + (tpTok || 'BLANCOS'), typeLabel: tpTok || 'BLANCOS', typeRank: 146 };
        }

        if (/^MACETA\b/.test(tpTok)) return { domain: 'DEC_VASOS_MACETAS', typeKey: 'MACETA', typeLabel: 'MACETA', typeRank: 160 };
        if (/^(FLORERO|JARRON|BOTELLON|BOTELLA|TIBOR|CILINDRO)$/.test(tpTok)) {
            const isBotellon = tpTok === 'BOTELLON';
            return { domain: 'DEC_VASOS_MACETAS', typeKey: 'FLORERO', typeLabel: isBotellon ? 'BOTELLÓN' : 'FLORERO', typeRank: isBotellon ? 163 : 162 };
        }
        if (/^(PLANTA DECORATIVA|PLANTA|FOLLAJE|ARBOL|PALMA)$/.test(tpTok)) {
            return { domain: 'DEC_BOTANICA', typeKey: 'PLANTA_DECORATIVA', typeLabel: 'PLANTA DECORATIVA', typeRank: 164 };
        }
        if (/^(CHAROLA|BANDEJA|BATEA)$/.test(tpTok)) {
            return { domain: 'DEC_MESA_SERVICIO', typeKey: 'CHAROLA', typeLabel: 'CHAROLA', typeRank: 166 };
        }
        if (/^(PLATON|PLATO|PLATO DECORATIVO|PLATO HONDO|PLATO HONDO DECORATIVO|SET PLATO|ENSALADERA|FRUTERO|TAZON|BOWL)$/.test(tpTok)) {
            return { domain: 'DEC_MESA_SERVICIO', typeKey: 'PLATO_DECORATIVO', typeLabel: 'PLATO DECORATIVO', typeRank: 167 };
        }
        if (/^(CANDELABRO|PORTAVELA|PORTAVELAS|VELA|VELAS|LINTERNA|FAROL)$/.test(tpTok)) {
            const isVela = /^VELA/.test(tpTok);
            return { domain: 'DEC_VELAS', typeKey: 'CANDELABRO', typeLabel: isVela ? 'VELA' : 'CANDELABRO', typeRank: isVela ? 169 : 168 };
        }
        if (/^(ESCULTURA|FIGURA)$/.test(tpTok)) {
            return { domain: 'DEC_OBJETOS', typeKey: 'ESCULTURA', typeLabel: 'ESCULTURA', typeRank: 170 };
        }
        if (tpTok === 'CRISTAL') {
            return { domain: 'DEC_CRISTAL', typeKey: 'CRISTAL', typeLabel: 'CRISTAL', typeRank: 172 };
        }
        if (/^(LAMBRIN|LAMBRIN DECORATIVO|LAMINA DE PVC|PISOS MODULARES|PAPEL TAPIZ|MAMPARA|BAUL|PERCHERO|PEDESTAL|ARCHIVERO|LIBRO DECORATIVO)$/.test(tpTok)) {
            return { domain: 'DEC_' + tpTok, typeKey: tpTok, typeLabel: tpTok === 'BAUL' ? 'BAÚL' : tpTok, typeRank: 176 };
        }
        return { domain: 'DEC_OBJETOS', typeKey: 'ACCESORIO_DECORATIVO', typeLabel: 'ACCESORIO DECORATIVO', typeRank: 185 };
    }

    const TYPE_SYNONYM_TOKENS_BY_KEY = {
        'SILLON': ['SILLON', 'SILLONES'],
        'SOFA': ['SOFA', 'SOFAS'],
        'LOVE_SEAT': ['LOVE', 'SEAT', 'LOVESEAT', 'LOVESEATS'],
        'SOFA_CAMA': ['SOFA', 'CAMA'],
        'FUTON': ['FUTTON', 'FUTON'],
        'OTTOMAN': ['OTTOMAN', 'OTOMAN', 'POUF', 'PUFF', 'TABURETE'],
        'MESA_CENTRO': ['MESA', 'MESAS', 'CENTRO', 'CENTRAL'],
        'MESA_LATERAL': ['MESA', 'MESAS', 'LATERAL', 'LATERALES', 'AUXILIAR'],
        'MESA_COMEDOR': ['MESA', 'MESAS', 'COMEDOR'],
        'SILLA_COMEDOR': ['SILLA', 'SILLAS', 'COMEDOR'],
        'BUFETERA': ['BUFETERA', 'BUFETERO', 'BUFERETERA'],
        'CABECERA': ['CABECERA'],
        'COLCHON': ['COLCHON'],
        'COMODA': ['COMODA', 'CAJONERA'],
        'BASE_CAMA': ['BASE', 'CAMA'],
        'MUEBLE_TV': ['MUEBLE', 'TV', 'PTV', 'CENTRO', 'ENTRETENIMIENTO', 'ENCETRENIMIENTO'],
        'LAMPARA_MESA': ['LAMPARA', 'MESA'],
        'LAMPARA_PISO': ['LAMPARA', 'PISO'],
        'LAMPARA_COLGANTE': ['LAMPARA', 'COLGANTE'],
        'FUNDA_DECORATIVA': ['FUNDA', 'DECORATIVA'],
        'RELLENO_COJIN': ['RELLENO', 'COJIN'],
        'PLANTA_DECORATIVA': ['PLANTA', 'DECORATIVA', 'FOLLAJE', 'ARBOL', 'PALMA'],
        'PLATO_DECORATIVO': ['PLATO', 'PLATON', 'DECORATIVO']
    };

    // Coloca SIEMPRE al inicio "[TIPO DE MUEBLE] [MODELO]" seguido del resto de atributos de la pieza
    function formatStructuredSingleTitle(it, furnInfo, distinctMo) {
        const rawClean = stripDimensionsFromProductText((it && (it.n || it.s)) || '')
            .replace(/\bME\s+SA\b/gi, 'MESA')
            .toUpperCase()
            .trim();
        if (!distinctMo || !furnInfo || !furnInfo.typeLabel) {
            return rawClean || String((it && it.s) || '').toUpperCase();
        }
        const typeLabel = furnInfo.typeLabel.toUpperCase();
        const moUpper = distinctMo.toUpperCase();
        const tpPad = ' ' + plainModelToken(typeLabel) + ' ';
        const moPad = ' ' + plainModelToken(moUpper) + ' ';
        const headTitle = tpPad.indexOf(moPad) !== -1 ? typeLabel : (typeLabel + ' ' + moUpper);

        const skipWords = new Set();
        plainModelToken(headTitle).split(/\s+/).filter(Boolean).forEach(w => {
            if (w !== 'DE' && w !== 'DEL' && w !== 'LA' && w !== 'EL' && w !== 'PARA') skipWords.add(w);
        });
        const extraSyn = TYPE_SYNONYM_TOKENS_BY_KEY[furnInfo.typeKey];
        if (extraSyn) extraSyn.forEach(w => skipWords.add(w));

        const normTok = w => plainModelToken(w).replace(/[^A-Z0-9]/g, '');
        const rawTokens = rawClean.split(/\s+/).filter(Boolean);
        const rest = [];
        for (let i = 0; i < rawTokens.length; i++) {
            const nw = normTok(rawTokens[i]);
            if (!nw) continue;
            if ((nw === 'DE' || nw === 'DEL' || nw === 'PARA') && i + 1 < rawTokens.length && skipWords.has(normTok(rawTokens[i + 1]))) {
                continue;
            }
            if (skipWords.has(nw)) continue;
            rest.push(rawTokens[i]);
        }
        while (rest.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|EN|-|\/|·)$/.test(normTok(rest[0]))) rest.shift();
        while (rest.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|EN|-|\/|·)$/.test(normTok(rest[rest.length - 1]))) rest.pop();

        return rest.length > 0 ? (headTitle + ' · ' + rest.join(' ')) : headTitle;
    }

    function computeCategoryGroupIdentity(it) {
        const skuKey = String((it && it.s) || '').trim().toUpperCase();
        const furnInfo = resolveCanonicalFurnitureInfo(it);
        const distinctMo = resolveDistinctGroupModel(it, furnInfo);
        if (distinctMo) {
            const canonMoKey = canonicalizeGroupModelKey(distinctMo, furnInfo);
            const basePrefix = furnInfo.typeLabel;
            const tpPad = ' ' + plainModelToken(basePrefix) + ' ';
            const moPad = ' ' + plainModelToken(distinctMo) + ' ';
            const title = (tpPad.indexOf(moPad) !== -1 ? basePrefix : (basePrefix + ' ' + distinctMo)).toUpperCase();
            return {
                key: 'type_' + normalizePlain(furnInfo.typeKey) + '__mo_' + (canonMoKey || normalizePlain(distinctMo)),
                title: title,
                singleTitle: formatStructuredSingleTitle(it, furnInfo, distinctMo),
                mo: distinctMo,
                typeKey: furnInfo.typeKey,
                typeLabel: furnInfo.typeLabel,
                typeRank: furnInfo.typeRank
            };
        }
        const fallbackTitle = stripDimensionsFromProductText((it && (it.n || it.s)) || '')
            .replace(/\bME\s+SA\b/gi, 'MESA')
            .toUpperCase();
        return {
            key: 'sku_' + skuKey.toLowerCase(),
            title: fallbackTitle || skuKey,
            singleTitle: fallbackTitle || skuKey,
            mo: cleanStr(it && it.mo).toUpperCase(),
            typeKey: furnInfo.typeKey,
            typeLabel: furnInfo.typeLabel,
            typeRank: furnInfo.typeRank
        };
    }

    function computeGroupTitle(it) {
        return computeCategoryGroupIdentity(it).title;
    }

    // ------------------------------------------------------------------------
    // CATEGORÍAS PRINCIPALES, SUBCATEGORÍAS (ORDEN COMERCIAL PROTAGONISTA) Y FILTROS DE DISPONIBILIDAD
    // ------------------------------------------------------------------------
    const MAIN_CATEGORY_ORDER = [
        'SALAS',
        'COMEDORES',
        'RECÁMARAS',
        'COMPLEMENTOS',
        'ESPEJOS Y ACCESORIOS'
    ];

    const SUBCATEGORIES_BY_MAIN = {
        'SALAS': [
            'SALAS MODULARES',
            'SALAS EN L',
            'SOFAS & LOVESEATS',
            'SILLONES',
            'FUTONES & SOFÁ CAMAS',
            'MESAS DE CENTRO',
            'MESAS LATERALES'
        ],
        'COMEDORES': [
            'MESAS',
            'SILLAS',
            'BANCOS & BANCAS',
            'BUFETERAS'
        ],
        'RECÁMARAS': [
            'CAMAS',
            'CABECERAS',
            'COLCHONES',
            'BASES',
            'BURÓS',
            'COMODAS Y TOCADORES',
            'PIE DE CAMA'
        ],
        'COMPLEMENTOS': [
            'MUEBLES PARA TV',
            'CREDENZAS',
            'MUEBLES DE BAR',
            'LIBREROS',
            'ESCRITORIOS',
            'EXTERIOR'
        ],
        'ESPEJOS Y ACCESORIOS': [
            'ESPEJOS',
            'CUADROS',
            'LÁMPARAS',
            'COJINES & TEXTILES',
            'ACCESORIOS DECORATIVOS'
        ]
    };

    const MAIN_OF_SUB = {};
    const MAIN_CAT_RANK = {};
    const SUB_CAT_RANK = {};
    let __subRankSeq = 0;
    MAIN_CATEGORY_ORDER.forEach((mainCat, mIdx) => {
        MAIN_CAT_RANK[mainCat] = mIdx;
        (SUBCATEGORIES_BY_MAIN[mainCat] || []).forEach(subCat => {
            MAIN_OF_SUB[subCat] = mainCat;
            SUB_CAT_RANK[subCat] = __subRankSeq++;
        });
    });
    MAIN_OF_SUB['OTROS'] = 'ESPEJOS Y ACCESORIOS';
    SUB_CAT_RANK['OTROS'] = 999;

    function getMainCategoryRank(mainCat) {
        return Object.prototype.hasOwnProperty.call(MAIN_CAT_RANK, mainCat) ? MAIN_CAT_RANK[mainCat] : 99;
    }

    function getSubCategoryRank(subCat) {
        return Object.prototype.hasOwnProperty.call(SUB_CAT_RANK, subCat) ? SUB_CAT_RANK[subCat] : 999;
    }

    function compareCommercialGroupOrder(a, b) {
        const pa = (a && a._hasPhoto) ? 1 : 0;
        const pb = (b && b._hasPhoto) ? 1 : 0;
        if (pb !== pa) return pb - pa;
        const ma = (a && typeof a._mainRank === 'number') ? a._mainRank : 99;
        const mb = (b && typeof b._mainRank === 'number') ? b._mainRank : 99;
        if (ma !== mb) return ma - mb;
        const ta = (a && typeof a._typeRank === 'number') ? a._typeRank : 999;
        const tb = (b && typeof b._typeRank === 'number') ? b._typeRank : 999;
        if (ta !== tb) return ta - tb;
        if (ta === 999 && tb === 999) {
            const sa = (a && typeof a._subRank === 'number') ? a._subRank : 999;
            const sb = (b && typeof b._subRank === 'number') ? b._subRank : 999;
            if (sa !== sb) return sa - sb;
        }
        return compareAlphaEs(a && (a.displayTitle || a.title), b && (b.displayTitle || b.title)) ||
            String((a && a.key) || '').localeCompare(String((b && b.key) || ''));
    }

    const AVAILABILITY_FILTERS = [
        { key: 'STOCK', label: 'STOCK' },
        { key: 'LPPT', label: 'LPPT' },
        { key: 'LPPT_STOCK', label: 'LPPT+STOCK' }
    ];

    // Submenú de días restantes para LPPT (rangos separados excluyendo 0)
    const LPPT_DAY_RANGES = [
        { key: '-15', label: '-15', min: 1, max: 15 },
        { key: '-30', label: '-30', min: 16, max: 30 },
        { key: '-45', label: '-45', min: 31, max: 45 },
        { key: '-75', label: '-75', min: 46, max: 75 },
        { key: '-90', label: '-90', min: 76, max: 90 }
    ];

    const MODULAR_SALA_MODELS = new Set([
        'CARRARA', 'DYLAN', 'LUGANO', 'MONACO', 'SHELBY', 'ARIA', 'LUNNO', 'NILO',
        'ASPEN', 'AVALANCHE', 'AVENZANO', 'GALARDI', 'KASSIA', 'PONZETTA', 'TRENTO', 'SANTHOMAS'
    ]);

    const SALA_EN_L_MODELS = new Set([
        'DONATI', 'MATERA', 'AMARETO', 'DOVELLI', 'GALES', 'IBIZA',
        'LEXY', 'MAWI', 'PIERO', 'TEREANI', 'VALENTI', 'VARENA',
        'CITY', 'LUNA', 'MELODY', 'MEMPHIS', 'PERRY'
    ]);

    function classifyItemSubcategory(it) {
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
        const cat = norm(cleanStr(it && it.c));
        const tp = norm(cleanStr(it && it.tp));
        const mo = norm(cleanStr(it && it.mo));
        const nom = norm(cleanStr(it && it.n));
        const prodTxt = (tp + ' ' + nom).trim();
        const allTxt = (tp + ' ' + nom + ' ' + mo + ' ' + cat).trim();

        // 0) Muebles de TV explícitos antes de cualquier exclusión de recubrimientos (ej. "WALL UNIT MESA DE TV")
        if (
            /^PTV\b/.test(tp) ||
            /\b(MUEBLES?\s+(?:PARA\s+|DE\s+)?TV|MESAS?\s+(?:PARA\s+|DE\s+)?TV|MODULOS?\s+(?:PARA\s+|DE\s+)?TV|CENTROS?\s+DE\s+TV|CENTROS?\s+DE\s+ENTRETENIMIENTO|CENTROS?\s+DE\s+ENCETRENIMIENTO|\bPTV\b)\b/.test(prodTxt)
        ) {
            return 'MUEBLES PARA TV';
        }

        // 1) Exclusión temprana de exterior, iluminación, textiles, colchones y decoración (evita falsos positivos como "LAMPARA DE MESA", "CAMINO MESA", "CHAROLA BAR", etc.)
        if (/\b(EXTERIOR|CAMASTRO|COLUMPIO|SOMBRILLA)\b/.test(allTxt)) {
            return 'EXTERIOR';
        }
        if (/\b(LAMPARA|CANDIL|ARBOTANTE|LUMINARIA|PLAFON)\b/.test(prodTxt) || cat === 'ILUMINACION') {
            return 'LÁMPARAS';
        }
        const isFurniturePiece = /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|SILLON(?:ES)?|BUTACAS?|CHAISE|ESQUINEROS?|FUTTON(?:ES)?|FUTON(?:ES)?|OTTOMAN|OTOMAN|POUF|PUFF?|MESAS?\s+(?:DE\s+)?(?:COMEDOR|CENTRO|CENTRAL|LATERAL|AUXILIAR|BAR|TV)|ANTECOMEDOR(?:ES)?|COMEDOR(?:ES)?|SILLAS?|BANCOS?|BANCAS?|TABURETES?|BUFETERAS?|CREDENZAS?|CONSOLAS?|CAVAS?|LIBREROS?|ESCRITORIOS?|CAMAS?|CABECERAS?|BASES?\s+(?:DE\s+)?CAMA|BUROS?|COMODAS?|TOCADOR(?:ES)?|CAJONERAS?|LITERAS?|CUNAS?|COLCHON(?:ES)?|PIE\s+DE\s+CAMA|CAMASTROS?|COLUMPIOS?)\b/.test(tp) ||
            /^(?:SALA|SOFA|LOVE\s*SEAT|LOVESEAT|SILLON|MESA\s+(?:DE\s+)?(?:COMEDOR|CENTRO|CENTRAL|LATERAL|AUXILIAR)|COMEDOR|SILLA|BANCO|BANCA|BUFETERA|CREDENZA|CAMA|BASE\s+(?:DE\s+)?CAMA|CABECERA|BURO|COMODA|COLCHON)\b/.test(nom);

        if (
            !isFurniturePiece && (
                /\b(COJIN(?:ES)?|FUNDA(?:\s+DECORATIVA|\s+RINONERA)?|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|RELLENO|DRACON|COLCHA|EDREDON|SABANA|CUBRECAMA|TOALLA|CAMINO\s+(?:DE\s+)?MESA|MANTEL|PORTAVASO|SERVILLETERO)\b/.test(prodTxt) ||
                /^INDIVIDUAL(?:ES)?$/.test(tp) ||
                /^(?:SET\s+(?:DE\s+)?(?:\d+\s+)?)?INDIVIDUAL(?:ES)?\b/.test(nom) ||
                /^(?:T\.\s+|TELA\s+|TEL-ARTELL\b|TEL-?FOR\b|TELART\b)/.test(nom) ||
                /^(?:TELA(?:\s+ARTELL)?|TEL-?FOR|TELART|TAPICERIA|COMPONENTES\s+TAPICERIA|SINTETICO)$/.test(tp)
            )
        ) {
            return 'COJINES & TEXTILES';
        }
        if (/\b(COLCHON|CUBRE\s*COLCHON|PROTECTOR\s+DE\s+COLCHON)\b/.test(nom) || /^COLCHON$/.test(tp)) {
            return 'COLCHONES';
        }
        if (/\bESPEJOS?\b/.test(tp) || (/^ESPEJO\b/.test(nom) && !/\b(TOCADOR|COMODA)\b/.test(prodTxt))) {
            return 'ESPEJOS';
        }
        if (/\b(CUADRO|ARTE\s+OBJETO|DECORATIVO\s+(?:DE\s+)?PARED|PINTURA|LIENZO|GICLEE)\b/.test(prodTxt)) {
            return 'CUADROS';
        }
        if (
            /^(?:ACCESORIOS?(?:\s+DECORATIVOS?)?|ACCECORIO|FLORERO|JARRON|ESCULTURA|CHAROLA|BANDEJA|FRUTERO|ENSALADERA|CANDELABRO|PORTAVELAS?|PORTARRETRATO|MACETA|PLANTA(?:\s+DECORATIVA)?|FOLLAJE|VELAS?|LIBRO(?:\s+DECORATIVO)?|BOTELLA|BOTELLON|PLATO(?:\s+HONDO)?(?:\s+DECORATIVO)?|PLATON|SET\s+PLATO|TAZON|BATEA|BOLSA|CANAST[OA]|CESTA|LINTERNA|FAROL|CORAL|CONCHA|BOWL|CORDON\s+DECORATIVO|DECORATIVO\s+NAVIDAD|PERCHERO|MAMPARA|BIOMBO|PAPEL\s+TAPIZ|LAMBRIN(?:\s+DECORATIVO)?|LAMINA\s+DE\s+PVC|PISOS?\s+MODULARES?|ARCHIVERO|PEDESTAL|GARANTIA|MAQFOR|PRODUCTO\s+ESPECIAL|BAUL)$/.test(tp) ||
            /\b(CENTRO\s+DE\s+MESA|RELOJ\s+DE\s+MESA|ADORNO\s+DE\s+MESA|LIBRO\s+DECORATIVO|PLANTA\s+DECORATIVA)\b/.test(prodTxt) ||
            (tp === 'ESCUADRA' && /\b(PATA|CARPINTERIA)\b/.test(allTxt))
        ) {
            return 'ACCESORIOS DECORATIVOS';
        }

        // 2) Subcategorías de RECÁMARAS, COMEDORES, SALAS y COMPLEMENTOS
        if (/\bPIE\s+DE\s+CAMA\b/.test(prodTxt) || (/\bBANCAS?\b/.test(prodTxt) && /\bPIE\s+DE\s+CAMA\b/.test(allTxt))) {
            return 'PIE DE CAMA';
        }
        if (/\b(BANCOS?|BANCAS?|TABURETES?)\b/.test(prodTxt) && !/\bSALA\b/.test(tp)) {
            return 'BANCOS & BANCAS';
        }
        if (
            /\b(MUEBLES?\s+(?:DE\s+|PARA\s+)?BAR|CARRITOS?\s+(?:DE\s+)?BAR|CAVAS?|CONTRABARRAS?|CANTINAS?|BAR\s+GABINETE|GABINETES?\s+(?:DE\s+)?BAR)\b/.test(prodTxt) ||
            /^BAR\b/.test(tp)
        ) {
            return 'MUEBLES DE BAR';
        }
        if (/\b(ESCRITORIOS?|SECRETAIRES?)\b/.test(prodTxt)) {
            return 'ESCRITORIOS';
        }
        if (/\b(SOFAS?\s*CAMAS?|SOFA-CAMA|FUTON(?:ES)?|FUTTON(?:ES)?|DAYBED)\b/.test(prodTxt)) {
            return 'FUTONES & SOFÁ CAMAS';
        }
        if (/\bCABECERAS?\b/.test(prodTxt) && tp !== 'CAMA') {
            return 'CABECERAS';
        }
        if (
            /\b(BASES?\s+(?:DE\s+)?CAMA|BASES?\s+(?:PARA\s+)?COLCHON|BASES?\s+(?:KS|QS|MAT|IND|KING(?:\s+SIZE)?|QUEEN(?:\s+SIZE)?|MATRIMONIAL|INDIVIDUAL)|BOX\s*SPRING)\b/.test(prodTxt) ||
            tp === 'BOX' ||
            (/^BASES?\b/.test(tp) && !/\b(COMEDOR|MESA|CUBIERTA|CRISTAL|MARMOL|LAMPARA)\b/.test(allTxt))
        ) {
            return 'BASES';
        }
        if (/\b(CAMAS?|LITERAS?|CUNAS?)\b/.test(prodTxt)) {
            return 'CAMAS';
        }
        if (/\bBUROS?\b/.test(prodTxt)) {
            return 'BURÓS';
        }
        if (/\b(COMODAS?|TOCADOR(?:ES)?|CHIFONIERS?|CAJONERAS?)\b/.test(prodTxt)) {
            return 'COMODAS Y TOCADORES';
        }
        if (
            /\b(LIBREROS?|ESTANTERIAS?|ESTANTES?|REPISAS?|VITRINAS?|PUERTAS\s+PARA\s+LIBRERO)\b/.test(prodTxt) ||
            (tp === 'SET DE PUERTAS' && /\b(LIBRERO|TRITON)\b/.test(allTxt))
        ) {
            return 'LIBREROS';
        }
        if (/\b(CREDENZAS?|CONSOLAS?|RECIBIDOR(?:ES)?)\b/.test(prodTxt)) {
            return 'CREDENZAS';
        }
        if (/\b(BUFETERAS?|BUFERETERAS?|BUFETEROS?|TRINCHADOR(?:ES)?|APARADOR(?:ES)?)\b/.test(prodTxt)) {
            return 'BUFETERAS';
        }
        if (/^SILLAS?\b/.test(tp)) {
            return 'SILLAS';
        }
        const isExplicitSala = tp === 'SALA' || (/^SALA\b/.test(nom) && !/^SALA\s+COMEDOR\b/.test(nom));
        if (!isExplicitSala) {
            if (/\b(MESAS?\s+(?:DE\s+)?CENTRO|MESAS?\s+CENTRAL(?:ES)?|SETS?\s+(?:DE\s+)?MESAS?\s+(?:DE\s+)?CENTRO)\b/.test(prodTxt)) {
                return 'MESAS DE CENTRO';
            }
            if (/\b(MESAS?\s+LATERAL(?:ES)?|MESAS?\s+AUXILIAR(?:ES)?|MESAS?\s+DE\s+RINCON|MESAS?\s+NIDO|MESAS?\s+OCASIONAL(?:ES)?)\b/.test(prodTxt)) {
                return 'MESAS LATERALES';
            }
            if (/\b(MESAS?\s+(?:DE\s+|PARA\s+)?COMEDOR|COMEDOR(?:ES)?|ANTECOMEDOR(?:ES)?|DESAYUNADOR(?:ES)?|CUBIERTAS?\s+(?:DE\s+|PARA\s+)?(?:COMEDOR|MESA|CRISTAL)|BASES?\s+(?:DE\s+|PARA\s+)?(?:COMEDOR|MESA)|EXTENSIONES?\s+DE\s+MESA|SET\s+DE\s+EXTENSIONES)\b/.test(prodTxt)) {
                return 'MESAS';
            }
            if (/\bCRISTAL\b/.test(tp)) {
                if (/\bCOMEDOR\b/.test(allTxt)) return 'MESAS';
                if (/\bLATERAL|AUXILIAR\b/.test(allTxt)) return 'MESAS LATERALES';
                if (/\bCENTRO|SALA|MESA\b/.test(allTxt)) return 'MESAS DE CENTRO';
                return 'ACCESORIOS DECORATIVOS';
            }
            if (/\bMESAS?\b/.test(prodTxt)) {
                if (/\b(LATERAL|AUXILIAR|RINCON|NIDO)\b/.test(allTxt)) return 'MESAS LATERALES';
                if (/\b(CENTRO|CENTRAL|SALA)\b/.test(allTxt)) return 'MESAS DE CENTRO';
                return 'MESAS';
            }
            if (/\b(SILLON(?:ES)?|BUTACAS?|MECEDORAS?|RECLINABLES?|BERGERE)\b/.test(prodTxt)) {
                return 'SILLONES';
            }
            if (/\bSILLAS?\b/.test(prodTxt)) {
                return 'SILLAS';
            }
        }
        if (
            /\b(SALAS?|SOFAS?|LOVE\s*SEATS?|LOVESEATS?|MODULOS?|MODULAR(?:ES)?|ESQUINEROS?|ESQUINERAS?|RINCONERAS?|CHAISE(?:\s+LONGUE)?|OTTOMAN|OTOMAN|POUF|PUFF?|SECCIONAL(?:ES)?|REMATES?)\b/.test(prodTxt)
        ) {
            const moFirst = mo.split(/\s+/)[0] || '';
            if (/\b(SALAS?\s+EN\s+L|SECCIONAL(?:ES)?\s+EN\s+L|EN\s+ESCUADRA)\b/.test(prodTxt)) {
                return 'SALAS EN L';
            }
            if (
                /\b(MODULAR(?:ES)?|MODULOS?|ESQUINEROS?|REMATES?)\b/.test(prodTxt) ||
                MODULAR_SALA_MODELS.has(mo) ||
                MODULAR_SALA_MODELS.has(moFirst)
            ) {
                return 'SALAS MODULARES';
            }
            if (
                /\b(CHAISE(?:\s+LONGUE)?|EN\s+L|ESQUINERAS?|SECCIONAL(?:ES)?)\b/.test(prodTxt) ||
                SALA_EN_L_MODELS.has(mo) ||
                SALA_EN_L_MODELS.has(moFirst) ||
                (/\b(SOFAS?|LOVE\s*SEATS?|LOVESEATS?|SALAS?)\b/.test(prodTxt) && /\b(BRAZO\s+DER(?:ECHO)?|BRAZO\s+IZQ(?:UIERDO)?|B\/DER|B\/IZQ|DERECHO|IZQUIERDO|DER|IZQ)\b/.test(prodTxt))
            ) {
                return 'SALAS EN L';
            }
            return 'SOFAS & LOVESEATS';
        }

        return 'OTROS';
    }

    function resolveItemCategory(it) {
        return classifyItemSubcategory(it);
    }

    function resolveItemSubcategory(it, baseCat) {
        return baseCat || classifyItemSubcategory(it);
    }

    function photoUrlForItem(it) {
        return it ? resolveDriveOrImgUrl(it.f) : '';
    }

    function firstPhotoItem(items) {
        for (let i = 0; i < items.length; i++) {
            if (photoUrlForItem(items[i])) return items[i];
        }
        return null;
    }

    const THUMB_PLACEHOLDER_SVG =
        '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';

    // Miniatura con respaldo a la miniatura de Drive y luego al ícono vacío
    function buildThumbHtml(it) {
        const url = photoUrlForItem(it);
        if (!url) return '<div class="inv-thumb">' + THUMB_PLACEHOLDER_SVG + '</div>';
        const fid = extractDriveFileId(it.f);
        const small = fid ? ('https://lh3.googleusercontent.com/d/' + fid + '=w400') : url;
        const fallback = fid ? ('https://drive.google.com/thumbnail?id=' + fid + '&sz=w400') : '';
        return '<div class="inv-thumb"><img loading="lazy" decoding="async" alt="" src="' + escapeHtml(small) + '" ' +
            'data-fb="' + escapeHtml(fallback) + '" ' +
            'onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb=\'\';}else{this.parentNode.innerHTML=window.__INV_THUMB_PH||\'\';}"></div>';
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

    // Días restantes para la llegada de la pieza en LPPT (null si no hay dato o no tiene piezas en LPPT)
    function getItemLpptRemainingDays(it) {
        if (!it || getLpptStock(it) <= 0) return null;
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

        const dispWord = qty === 1 ? 'disponible' : 'disponibles';
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

    function indexItemsAndGroups() {
        rebuildLiveAutoVocab(allItems);
        allItems.sort((a, b) =>
            compareAlphaEs(a && (a.n || a.s), b && (b.n || b.s)) ||
            String((a && a.s) || '').localeCompare(String((b && b.s) || ''))
        );

        bySkuMap.clear();
        singleBySkuMap.clear();
        groupsByKey.clear();
        activeFilteredGroupsByKey.clear();
        allSingleGroups = [];
        allGroups = [];

        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = emptyStocks();
            it.pr = formatPrice(it.pr);
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;

            it._cat = resolveItemSubcategory(it, resolveItemCategory(it));
            it._main = MAIN_OF_SUB[it._cat] || 'ESPEJOS Y ACCESORIOS';

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

            it._avail = getItemAvailabilityKind(it);
            it._lpptBucket = getLpptStock(it) >= 1 ? getItemLpptDaysBucket(it) : '';
            it._hasPhoto = photoUrlForItem(it) ? 1 : 0;
            it._mainRank = getMainCategoryRank(it._main);
            it._subRank = getSubCategoryRank(it._cat);

            const rawText = [
                it.s, title, it._singleTitle, it.n, it.vr, it.tp, it._typeLabel, it.mo, grpId.mo, it.c, it._cat, it._main,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p, it.pr
            ].join(' ');
            it._plain = normalizePlain(rawText);
            it._search = normSearch(rawText);

            bySkuMap.set(skuKey, it);

            // Cotizador: solo se muestran piezas con al menos 1 pz en Bodega/Piso
            // o piezas de LPPT con registro y precio en S Mueblería. El resto queda
            // oculto (sigue en bySkuMap para conservar partidas previas).
            if (!it._avail) continue;

            // Vista separada pieza por pieza para CATEGORÍAS
            const singleEntry = buildSinglePieceCoverGroup(it, skuKey, title);
            singleBySkuMap.set(skuKey, singleEntry);
            allSingleGroups.push(singleEntry);

            // Vista agrupada por Tipo de Mueble + Modelo en TODOS
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
                }
                if (chosenPrefix) {
                    const fpPad = ' ' + plainModelToken(chosenPrefix) + ' ';
                    const moPad = ' ' + plainModelToken(bestMo) + ' ';
                    grp.title = (fpPad.indexOf(moPad) !== -1 ? chosenPrefix : (chosenPrefix + ' ' + bestMo)).toUpperCase();
                    for (let j = 0; j < grp.items.length; j++) {
                        grp.items[j]._groupTitle = grp.title;
                    }
                }
            }
            grp.displayTitle = (grp.items.length > 1
                ? grp.title
                : (grp.items[0]._singleTitle || stripDimensionsFromProductText(grp.items[0].n) || grp.title || grp.items[0].s)
            ).toUpperCase();
            grp.totalStock = grp.items.reduce((acc, x) => acc + getBodegaPisoStock(x), 0);
            grp.lpptStock = grp.items.reduce((acc, x) => acc + getLpptStock(x), 0);
            grp._hasPhoto = firstPhotoItem(grp.items) ? 1 : 0;
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
        const totalQty = isLockedDone
            ? 0
            : Object.values(cart).reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
        const el = document.getElementById('headerCartCount');
        if (el) el.textContent = String(totalQty);
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
        if (!it || !it._avail) return false;
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

    function buildFilteredGroupView(baseGrp, matchedItems) {
        if (!baseGrp || !matchedItems || matchedItems.length === 0) return null;
        if (matchedItems.length === baseGrp.items.length) return baseGrp;
        const singleTitle = (matchedItems.length > 1
            ? baseGrp.title
            : (matchedItems[0]._singleTitle || stripDimensionsFromProductText(matchedItems[0].n) || baseGrp.title || matchedItems[0].s)
        ).toUpperCase();
        return Object.assign({}, baseGrp, {
            items: matchedItems,
            displayTitle: singleTitle,
            totalStock: matchedItems.reduce((acc, x) => acc + getBodegaPisoStock(x), 0),
            lpptStock: matchedItems.reduce((acc, x) => acc + getLpptStock(x), 0),
            _hasPhoto: firstPhotoItem(matchedItems) ? 1 : 0,
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
            return qTokens.every(tok => s.indexOf(tok) !== -1);
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

        const candidateList = [];
        for (let i = 0; i < sourceGroups.length; i++) {
            const grp = sourceGroups[i];
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
        if (selected.length === 0 && qTokens.length === 1 && qTokens[0].length >= 4 && !/\d/.test(qTokens[0])) {
            const tok = qTokens[0];
            const maxExtraDist = tok.length >= 5 ? 2 : 1;
            const prefix = tok.slice(0, 3);
            for (let i = 0; i < sourceGroups.length; i++) {
                const grp = sourceGroups[i];
                let extraScore = 0;
                for (let wi = 0; wi < grp._words.length; wi++) {
                    const w = grp._words[wi];
                    if (w.length < 3) continue;
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
    // FILTRADO: EN TODOS AGRUPADO POR MISMO MODELO + VARIANTES · EN CATEGORÍAS TODAS LAS PIEZAS SEPARADAS
    // (BOTÓN STOCK: PIEZAS CON MAYOR CANTIDAD FÍSICA SIN CONTAR LPPT)
    // ------------------------------------------------------------------------
    function applyFilter(query, preserveCount) {
        const rawTrim = String(query || '').trim();
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) clearBtn.style.display = rawTrim ? 'block' : 'none';

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
            if (!rawTrim) {
                filteredGroups = allSingleGroups.filter(grp =>
                    itemMatchesActiveFilter(grp.items[0], activeCategory, activeSubCategory)
                );
            } else if (exactHitItem && !isQuotableItem(exactHitItem)) {
                filteredGroups = [];
            } else if (isExactSkuHit && singleBySkuMap.has(exactSkuUpper)) {
                filteredGroups = [singleBySkuMap.get(exactSkuUpper)];
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

        const initialCap = isMainCoverActive ? 120 : PAGE_SIZE;
        const targetInitial = preserveCount ? Math.max(initialCap, renderedCount) : initialCap;
        renderedCount = 0;
        const container = document.getElementById('invListContainer');
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
                for (let j = 0; j < g.items.length; j++) {
                    const it = g.items[j];
                    if (it._main) {
                        mainCounts.set(it._main, (mainCounts.get(it._main) || 0) + 1);
                    }
                    if (SUBCATEGORIES_BY_MAIN[activeCategory] && it._cat && MAIN_OF_SUB[it._cat] === activeCategory) {
                        subCounts.set(it._cat, (subCounts.get(it._cat) || 0) + 1);
                    }
                    if (getBodegaPisoStock(it) >= 1) {
                        stockPieceCount++;
                        if (it._main) {
                            stockMainCounts.set(it._main, (stockMainCounts.get(it._main) || 0) + 1);
                        }
                    }
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
        if (next !== activeCategory) activeSubCategory = 'ALL';
        activeCategory = next;
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
    };

    window.setInvSubCategory = function (sub) {
        activeSubCategory = sub || 'ALL';
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
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
            if (isMainCoverActive) {
                container.innerHTML =
                    '<div class="rounded-xl border px-4 py-6 text-center text-xs font-semibold leading-relaxed" ' +
                    'style="grid-column: 1 / -1; border-color:#E8E4DE; color:#252C32; background:#FFFFFF;">' +
                    'No hay productos para mostrar en este momento.' +
                    '</div>';
            } else {
                const inp = document.getElementById('invSearchInput');
                const curQ = cleanStr(inp && inp.value);
                const filterLbl = formatActiveFilterLabel();
                container.innerHTML =
                    '<div class="rounded-xl border px-4 py-6 text-center text-xs font-semibold leading-relaxed space-y-2" ' +
                    'style="grid-column: 1 / -1; border-color:#E8E4DE; color:#252C32; background:#FFFFFF;">' +
                    '<div>No se encontraron productos que coincidan' +
                        (curQ ? (' con <strong>“' + escapeHtml(curQ) + '”</strong>') : '') +
                        (activeCategory !== 'ALL' ? (' en <strong>' + escapeHtml(filterLbl) + '</strong>') : '') +
                    '.</div>' +
                    '<div class="text-[11px] opacity-75">Prueba con otras palabras o cambia a <strong>TODOS</strong> para buscar en todo el inventario.</div>' +
                    '</div>';
            }
            if (moreWrap) moreWrap.classList.add('hidden');
            return;
        }

        const step = (typeof batchSize === 'number' && batchSize > 0) ? batchSize : PAGE_SIZE;
        const nextEnd = Math.min(renderedCount + step, maxAllowed);
        const frag = document.createDocumentFragment();

        for (let i = renderedCount; i < nextEnd; i++) {
            const grp = filteredGroups[i];
            const row = document.createElement('div');
            row.className = 'inv-row';

            if (grp.items.length > 1) {
                // Listado limpio sin precio afuera (el precio se muestra adentro al abrir el inventario del producto)
                row.onclick = function () {
                    openGroupModal(grp.key);
                };
                row.innerHTML =
                    buildThumbHtml(firstPhotoItem(grp.items)) +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.displayTitle || grp.title) + '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + grp.items.length + ' variantes</div>' +
                    '</div>' +
                    '<svg class="w-4 h-4 shrink-0" style="color:#A38251;" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"></path>' +
                    '</svg>';
            } else {
                const it = grp.items[0];
                const skuKey = String(it.s || '').toUpperCase();
                const ownPhysQty = getBodegaPisoStock(it);
                const stockBadgeHtml = (activeCategory === 'STOCK' && ownPhysQty > 0)
                    ? ' <span class="inline-flex items-center ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold border align-middle" style="background:#ECFDF5; border-color:#A7F3D0; color:#065F46;">Stock: ' + ownPhysQty + ' pz</span>'
                    : '';
                row.onclick = function () {
                    openProductDetail(it.s, false);
                };
                row.innerHTML =
                    buildThumbHtml(it) +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.displayTitle || stripDimensionsFromProductText(it.n) || grp.title || it.s) + '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + stockBadgeHtml + '</div>' +
                    '</div>' +
                    buildCardCartControlHtml(skuKey);

                const ctrlWrap = row.querySelector('[data-sku-ctrl]');
                bindCardCartControlEvents(ctrlWrap, it.s);
            }

            frag.appendChild(row);
        }

        container.appendChild(frag);
        renderedCount = nextEnd;

        if (moreWrap) {
            if (renderedCount < maxAllowed) moreWrap.classList.remove('hidden');
            else moreWrap.classList.add('hidden');
        }
    };

    window.clearInvSearch = function () {
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.value = '';
            inp.focus();
        }
        applyFilter('');
    };

    // ------------------------------------------------------------------------
    // ESCÁNER CON LA CÁMARA DEL TELÉFONO (CÓDIGO DE BARRAS / QR → SKU)
    // ------------------------------------------------------------------------
    const SCAN_LIB_URLS = [
        'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
        'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
    ];
    let scanLibPromise = null;
    let scanInstance = null;
    let scanHandled = false;

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

    function handleScannedCode(rawText) {
        if (scanHandled) return;
        const code = String(rawText || '').trim();
        if (!code) return;
        scanHandled = true;
        if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
        closeBarcodeScanner();
        const inp = document.getElementById('invSearchInput');
        if (inp) inp.value = code;
        applyFilter(code);
        const exact = bySkuMap.get(code.toUpperCase());
        if (exact) {
            openProductDetail(exact.s, false);
        }
    }

    window.openBarcodeScanner = async function () {
        const modal = document.getElementById('scanModal');
        if (!modal) return;
        scanHandled = false;
        modal.classList.add('open');
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Navegadores dentro de apps (WhatsApp, Facebook...) no dan video en vivo: usar "Tomar foto del código"
            setScanStatus('Este navegador no permite video en vivo. Usa el botón "Tomar foto del código".', true);
            loadScanLib().catch(() => {});
            return;
        }
        setScanStatus('Iniciando cámara...', false);
        try {
            await loadScanLib();
            const reader = document.getElementById('scanReader');
            if (reader) reader.innerHTML = '';
            const inst = new window.Html5Qrcode('scanReader', {
                verbose: false,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true }
            });
            scanInstance = inst;
            await inst.start(
                { facingMode: 'environment' },
                {
                    fps: 12,
                    qrbox: function (w, h) {
                        const bw = Math.floor(Math.min(w * 0.85, 360));
                        const bh = Math.floor(Math.min(h * 0.5, 180));
                        return { width: Math.max(bw, 120), height: Math.max(bh, 80) };
                    }
                },
                function (decodedText) { handleScannedCode(decodedText); },
                function () {}
            );
            // Si el usuario cerró el modal mientras la cámara arrancaba, apagarla
            if (scanInstance !== inst || !modal.classList.contains('open')) {
                try { await inst.stop(); inst.clear(); } catch (e) {}
                return;
            }
            setScanStatus('Apunta la cámara al código de barras o QR del producto.', false);
        } catch (err) {
            console.error('[Escáner]', err);
            setScanStatus('No fue posible abrir la cámara en vivo. Da permiso de cámara al navegador o usa "Tomar foto del código".', true);
        }
    };

    // Respaldo: tomar una foto del código con la cámara del teléfono y leerla
    window.scanBarcodeFromPhoto = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        setScanStatus('Leyendo código de la foto...', false);
        try {
            await loadScanLib();
            if (scanInstance && scanInstance.isScanning) {
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

    // ------------------------------------------------------------------------
    // PASO 1: MODAL DE VARIANTES DISPONIBLES DEL MODELO (ej. SILLON APIENZO)
    // ------------------------------------------------------------------------
    function renderGroupVariantsStep(grp) {
        currentGroup = grp;
        currentDetailItem = null;

        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const addBtn = document.getElementById('detAddCartBtn');
        const subBtn = document.getElementById('detSubCartBtn');
        const remAllBtn = document.getElementById('detRemoveAllCartBtn');
        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        const varList = document.getElementById('detVariantsList');

        if (crumbEl) {
            crumbEl.textContent = '';
            crumbEl.classList.add('hidden');
        }
        if (skuEl) {
            skuEl.textContent = '';
            skuEl.classList.add('hidden');
        }
        if (nameEl) {
            nameEl.textContent = grp.title;
        }
        if (priceEl) priceEl.textContent = '';
        if (priceWrapEl) priceWrapEl.classList.add('hidden');
        if (addBtn) addBtn.classList.add('hidden');
        if (subBtn) subBtn.classList.add('hidden');
        if (remAllBtn) remAllBtn.classList.add('hidden');

        function normWordForVariant(w) {
            return String(w || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
        }

        function buildVariantLabel(it, groupObj) {
            const rawName = stripDimensionsFromProductText(it.n).toUpperCase();
            const vr = cleanStr(it.vr).toUpperCase();
            const titleWords = new Set(
                String(groupObj && groupObj.title ? groupObj.title : '')
                    .toUpperCase()
                    .split(/\s+/)
                    .map(normWordForVariant)
                    .filter(Boolean)
            );

            const tokens = rawName.split(/\s+/).filter(Boolean);
            const rem = [];
            for (let i = 0; i < tokens.length; i++) {
                const nw = normWordForVariant(tokens[i]);
                if (!nw) continue;
                if ((nw === 'DE' || nw === 'DEL') && i + 1 < tokens.length && titleWords.has(normWordForVariant(tokens[i + 1]))) {
                    continue;
                }
                if (titleWords.has(nw)) continue;
                rem.push(tokens[i]);
            }
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|-|\/|·)$/.test(normWordForVariant(rem[0]))) rem.shift();
            while (rem.length > 0 && /^(DE|DEL|LA|EL|LOS|LAS|PARA|-|\/|·)$/.test(normWordForVariant(rem[rem.length - 1]))) rem.pop();

            let label = rem.join(' ').replace(/\s+/g, ' ').trim();
            if (!label || normWordForVariant(label) === normWordForVariant(it.s)) {
                label = vr || cleanStr(it.m).toUpperCase() || cleanStr(it.tl).toUpperCase() || cleanStr(it.md).toUpperCase() || rawName || it.s;
            }
            return label;
        }

        if (varList) {
            const baseLabels = grp.items.map(it => buildVariantLabel(it, grp));
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

            varList.innerHTML = variantEntries.map(entry => {
                const it = entry.it;
                const skuKey = String(it.s || '').toUpperCase();
                const varLabel = entry.varLabel;
                return '<div class="inv-row" data-var-sku="' + escapeHtml(skuKey) + '">' +
                    buildThumbHtml(it) +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' +
                            formatTitleWithPriceHtml(varLabel, it.pr) +
                        '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
                    '</div>' +
                    buildCardCartControlHtml(skuKey) +
                '</div>';
            }).join('');

            varList.querySelectorAll('.inv-row[data-var-sku]').forEach(rowEl => {
                const sku = rowEl.getAttribute('data-var-sku');
                rowEl.onclick = function () {
                    openProductDetail(sku, true);
                };
                const ctrlWrap = rowEl.querySelector('[data-sku-ctrl]');
                bindCardCartControlEvents(ctrlWrap, sku);
            });
        }

        if (varStep) varStep.classList.remove('hidden');
        if (singleStep) singleStep.classList.add('hidden');
        prepareRelatedInStockSection(grp && grp.items && grp.items.length ? grp.items[0] : null, false);
    }

    function resolveActiveGroup(groupKey) {
        if (!groupKey) return null;
        if (activeFilteredGroupsByKey.has(groupKey)) {
            return activeFilteredGroupsByKey.get(groupKey);
        }
        return groupsByKey.get(groupKey) || null;
    }

    window.openGroupModal = function (groupKey) {
        const grp = resolveActiveGroup(groupKey);
        if (!grp) return false;
        if (grp.items.length === 1) {
            return openProductDetail(grp.items[0].s, false);
        }

        renderGroupVariantsStep(grp);

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        refreshLiveSheetNow();
        return true;
    };

    window.backToCurrentGroupVariants = function () {
        if (currentGroup && currentGroup.items.length > 1) {
            openGroupModal(currentGroup.key);
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
        }

        renderDetailModal(it, !!fromGroupList);

        const varStep = document.getElementById('detVariantsStep');
        const singleStep = document.getElementById('detSingleStep');
        if (varStep) varStep.classList.add('hidden');
        if (singleStep) singleStep.classList.remove('hidden');

        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.add('open');
        refreshLiveSheetNow();
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
        visualDiscActiveSku = '';
        const discInp = document.getElementById('detVisualDiscInput');
        if (discInp) discInp.value = '';
    };

    function renderDetailModal(it, showGroupBack) {
        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const discInp = document.getElementById('detVisualDiscInput');
        const addBtn = document.getElementById('detAddCartBtn');
        const subBtn = document.getElementById('detSubCartBtn');
        const remAllBtn = document.getElementById('detRemoveAllCartBtn');
        const guestMode = typeof isGuestSession === 'function' && isGuestSession();

        if (crumbEl) {
            if (showGroupBack && currentGroup && currentGroup.items.length > 1) {
                crumbEl.textContent = '← ' + currentGroup.title;
                crumbEl.classList.remove('hidden');
            } else {
                crumbEl.textContent = '';
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

        const baseTitle = stripDimensionsFromProductText(it.n) || cleanStr(it._groupTitle) || it.s || '';
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
            if (addBtn) addBtn.classList.add('hidden');
            if (subBtn) subBtn.classList.add('hidden');
            if (remAllBtn) remAllBtn.classList.add('hidden');
        } else {
            if (addBtn) {
                addBtn.classList.remove('hidden');
                addBtn.textContent = q > 0 ? ('+ Cotización (' + q + ')') : '+ Cotización';
            }
            if (subBtn) {
                subBtn.classList.toggle('hidden', q <= 0);
            }
            if (remAllBtn) {
                remAllBtn.classList.toggle('hidden', q <= 0);
            }
        }

        // Cuadro de 1 sola foto
        const driveId = extractDriveFileId(it.f);
        const photoUrl = resolveDriveOrImgUrl(it.f);
        const imgEl = document.getElementById('detPhotoImg');
        const emptyEl = document.getElementById('detPhotoEmpty');
        if (photoUrl) {
            imgEl.dataset.fallbackTried = '';
            imgEl.src = photoUrl;
            imgEl.classList.remove('hidden');
            emptyEl.classList.add('hidden');
            imgEl.onerror = function () {
                if (driveId && !imgEl.dataset.fallbackTried) {
                    imgEl.dataset.fallbackTried = '1';
                    imgEl.src = 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w1000';
                    return;
                }
                imgEl.classList.add('hidden');
                emptyEl.classList.remove('hidden');
            };
        } else {
            imgEl.dataset.fallbackTried = '';
            imgEl.src = '';
            imgEl.classList.add('hidden');
            emptyEl.classList.remove('hidden');
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

            const spanClass = (i === 0 && WAREHOUSES.length % 2 === 1 && isLppt)
                ? ' sm:col-span-2'
                : '';

            if (isLppt) {
                // Si no hay piezas en LPPT (qty <= 0), no colocar nada de LPPT; mencionar la cantidad una sola vez
                if (qty > 0) {
                    const lpptMsg = formatLpptArrivalText(it, qty);
                    whHtml.push(
                        '<div class="rounded-xl border px-3.5 py-3 flex items-center gap-2.5 ' + semClass + spanClass + '">' +
                            '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                            '<span class="text-xs font-extrabold leading-snug">' + escapeHtml(lpptMsg) + '</span>' +
                        '</div>'
                    );
                }
            } else {
                whHtml.push(
                    '<div class="rounded-xl border px-3.5 py-3 flex items-center justify-between ' + semClass + spanClass + '">' +
                        '<div class="flex items-center gap-2 min-w-0 pr-2">' +
                            '<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + dotColor + ';"></span>' +
                            '<span class="text-xs font-extrabold uppercase tracking-wide truncate">' + escapeHtml(whName) + '</span>' +
                        '</div>' +
                        '<span class="text-lg font-black shrink-0">' + qty + '</span>' +
                    '</div>'
                );
            }
        }

        document.getElementById('detTotalStock').textContent = String(totalBodegaPiso);
        document.getElementById('detWarehousesGrid').innerHTML = whHtml.join('');

        // Ficha de información limpia sin datos repetidos (Variante / Tela / Color de tela / Madera / Materiales)
        const specsWrap = document.getElementById('detSpecsWrap');
        const specsGrid = document.getElementById('detSpecsGrid');
        const specRows = buildCleanProductSpecRows(it);
        if (specsGrid) {
            specsGrid.innerHTML = specRows.map(r =>
                '<div class="rounded-lg border px-3 py-2" style="border-color:#E8E4DE;">' +
                    '<div class="text-[10px] font-extrabold uppercase tracking-wider opacity-60" style="color:#252C32;">' + escapeHtml(r[0]) + '</div>' +
                    '<div class="text-xs font-bold uppercase mt-0.5 break-words" style="color:#252C32;">' + escapeHtml(r[1]) + '</div>' +
                '</div>'
            ).join('');
        }
        if (specsWrap) specsWrap.classList.toggle('hidden', specRows.length === 0);

        prepareRelatedInStockSection(it, sameSkuRefresh ? relatedStockExpanded : false);
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

        // 5) Limpiar u omitir Variante cuando es ESTÁNDAR, igual al nombre/modelo/SKU, o repite Tela / Madera / Materiales / Medidas
        if (vr) {
            const alreadyCovered = new Set(
                [normTp, normMo, normTl, normCt, normMd, normCm, normSpec(mtClean), normSpec(med)]
                    .filter(Boolean)
                    .join(' ')
                    .split(' ')
                    .filter(Boolean)
            );
            const vrSegments = vr.split(/\s*·\s*/).map(cleanStr).filter(Boolean).filter(seg => {
                const nSeg = normSpec(seg);
                if (!nSeg || nSeg === 'ESTANDAR' || nSeg === normNom || nSeg === normMo || nSeg === normSku || nSeg === normTl || nSeg === normMd) {
                    return false;
                }
                const words = nSeg.split(' ').filter(w => !/^(DE|DEL|LA|EL|EN|CON|Y)$/.test(w));
                return !(words.length > 0 && words.every(w => alreadyCovered.has(w)));
            });
            vr = vrSegments.join(' · ');
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

        const seenBoxValues = new Set();
        const finalRows = [];
        for (let i = 0; i < candidateRows.length; i++) {
            const label = candidateRows[i][0];
            const val = cleanStr(candidateRows[i][1]);
            if (!val) continue;
            const nVal = normSpec(val);
            if (!nVal) continue;
            if (i > 0 && seenBoxValues.has(nVal)) continue;
            seenBoxValues.add(nVal);
            finalRows.push([label, val]);
        }
        return finalRows;
    }

    // ------------------------------------------------------------------------
    // EXCLUSIVO GERENTES / SUBGERENTES Y ADMINISTRADORES:
    // SUBIR ARCHIVO DESCARGABLE A CARPETA DRIVE "FOTOS NUEVAS CARGADO"
    // (SIN COLOCAR EN EL DOCUMENTO DE GOOGLE SHEETS NI REEMPLAZAR COLUMNA "F" DE INVENTARIO_EN_VIVO)
    // ------------------------------------------------------------------------
    let managerPhotoUploadInFlight = false;

    function canManageProductPhotos() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) return false;
        if (typeof isGuestSession === 'function' && isGuestSession()) return false;
        return !!getAdvisorRoleInfo().isManager;
    }

    function setDetailUploadPhotoStatus(text, tone, htmlContent) {
        const el = document.getElementById('detUploadPhotoStatus');
        if (!el) return;
        if (!text && !htmlContent) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        if (htmlContent) {
            el.innerHTML = htmlContent;
        } else {
            el.textContent = text;
        }
        el.className = 'rounded-xl border px-3.5 py-2.5 text-xs font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    function refreshDetailManagerPhotoControls(it, preserveStatus) {
        const wrap = document.getElementById('detManagerPhotoWrap');
        const btnTxt = document.getElementById('detUploadPhotoBtnText');
        const inp = document.getElementById('detUploadPhotoInput');
        if (!preserveStatus) {
            setDetailUploadPhotoStatus('', '');
        }
        if (!wrap) return;
        if (!it || !canManageProductPhotos()) {
            wrap.classList.add('hidden');
            if (inp) inp.disabled = true;
            return;
        }
        wrap.classList.remove('hidden');
        if (inp) inp.disabled = managerPhotoUploadInFlight;
        if (btnTxt && !managerPhotoUploadInFlight) {
            btnTxt.textContent = '📷 Subir foto a Drive';
        }
    }

    function compressImageFileToDataUrl(file, maxDim, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen seleccionado.'));
            reader.onload = function () {
                const rawDataUrl = String(reader.result || '');
                if (!rawDataUrl.startsWith('data:image/')) {
                    reject(new Error('Selecciona un archivo de imagen válido (JPG, PNG o WEBP).'));
                    return;
                }
                const img = new Image();
                img.onerror = function () {
                    // Si el navegador no decodifica en canvas (ej. HEIC convertido parcial), enviar dataUrl original si es moderado
                    resolve(rawDataUrl);
                };
                img.onload = function () {
                    try {
                        const w = img.naturalWidth || img.width || 1;
                        const h = img.naturalHeight || img.height || 1;
                        const limit = maxDim || 1200;
                        const scale = Math.min(1, limit / Math.max(w, h));
                        const nw = Math.max(1, Math.round(w * scale));
                        const nh = Math.max(1, Math.round(h * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = nw;
                        canvas.height = nh;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, nw, nh);
                        ctx.drawImage(img, 0, 0, nw, nh);
                        resolve(canvas.toDataURL('image/jpeg', quality || 0.84));
                    } catch (eCanvas) {
                        resolve(rawDataUrl);
                    }
                };
                img.src = rawDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    window.uploadManagerProductPhoto = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0] ? inputEl.files[0] : null;
        if (inputEl) inputEl.value = '';
        if (!file || managerPhotoUploadInFlight) return;

        if (!canManageProductPhotos()) {
            setDetailUploadPhotoStatus('Acceso restringido: únicamente Gerentes y Administradores pueden subir fotos a la carpeta Drive.', 'err');
            return;
        }
        if (!currentDetailItem || !currentDetailItem.s) return;

        const targetSku = String(currentDetailItem.s).trim().toUpperCase();
        const targetName = stripDimensionsFromProductText(currentDetailItem.n) || targetSku;
        const btnTxt = document.getElementById('detUploadPhotoBtnText');

        managerPhotoUploadInFlight = true;
        if (inputEl) inputEl.disabled = true;
        if (btnTxt) btnTxt.textContent = '⏳ Subiendo a Drive...';
        setDetailUploadPhotoStatus('Guardando archivo descargable en carpeta Drive ("FOTOS NUEVAS CARGADO") sin colocarlo en el documento...', 'warn');

        try {
            const dataUrl = await compressImageFileToDataUrl(file, 1200, 0.84);
            const res = await callInvWebAppPost('inv_upload_product_photo', {
                authToken: activeAdvisorSession.authToken || '',
                sheetTab: activeAdvisorSession.sheetTab || '',
                advisorEmail: activeAdvisorSession.correo || '',
                advisorName: activeAdvisorSession.nombre || '',
                sku: targetSku,
                productName: targetName,
                targetFolderId: FOTOS_NUEVAS_CARGADO_FOLDER_ID,
                driveOnly: true,
                skipSheetWrite: true,
                dataUrl: dataUrl
            }, 35000);

            if (res && res.authRequired) {
                setDetailUploadPhotoStatus('Confirma tu contraseña personal para guardar el archivo en la carpeta Drive "FOTOS NUEVAS CARGADO".', 'warn');
                promptSessionReauth(res.error || 'Confirma tu contraseña para subir fotografías a la carpeta Drive "FOTOS NUEVAS CARGADO".', null);
                return;
            }

            if (!res || res.needsRedeploy || res.unavailable) {
                reportSystemHistoryEvent({
                    classification: 'ALERTA TÉCNICA',
                    module: 'inventario-app.js · uploadManagerProductPhoto',
                    event: 'SUBIDA DE FOTO PENDIENTE DE ACTUALIZAR WEBAPP',
                    status: '⚠️ ALERTA',
                    ref: targetSku + ' · ' + targetName,
                    detail: 'El endpoint inv_upload_product_photo requiere publicar Nueva versión de AppsScript_Creata_Drive_Sheets.gs.',
                    analysis: 'Publicar Nueva versión en Extensiones → Apps Script → Implementar → Administrar implementaciones.'
                });
                setDetailUploadPhotoStatus('Para activar el guardado únicamente en carpeta Drive (sin colocar en Google Sheets), publica una Nueva versión de AppsScript_Creata_Drive_Sheets.gs en Extensiones → Apps Script → Implementar → Administrar implementaciones.', 'warn');
                return;
            }

            if (!res.ok) {
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'inventario-app.js · uploadManagerProductPhoto',
                    event: 'ERROR AL GUARDAR ARCHIVO DE FOTO EN DRIVE',
                    status: '❌ ERROR',
                    ref: targetSku + ' · ' + targetName,
                    detail: res.error || 'Respuesta sin éxito al subir fotografía.',
                    analysis: 'Revisar permisos de carpeta Drive FOTOS NUEVAS CARGADO o sesión del usuario.'
                });
                setDetailUploadPhotoStatus(res.error || 'No se pudo guardar la fotografía en Drive.', 'err');
                return;
            }

            const fileId = cleanStr(res.fileId) || extractDriveFileId(res.downloadUrl || res.driveUrl || res.url || '');
            const downloadUrl = cleanStr(res.downloadUrl) || (fileId ? ('https://drive.google.com/uc?export=download&id=' + fileId) : cleanStr(res.url));
            const folderUrl = cleanStr(res.folderUrl) || ('https://drive.google.com/drive/folders/' + FOTOS_NUEVAS_CARGADO_FOLDER_ID);

            // NO se modifica it.f ni se coloca en la ficha del producto:
            // inventario.html muestra exclusivamente las fotografías oficiales de la Columna "F" de INVENTARIO_EN_VIVO.
            const statusHtml =
                '<div class="space-y-1.5">' +
                    '<div>✓ Archivo guardado en carpeta Drive <strong>FOTOS NUEVAS CARGADO</strong> (' + escapeHtml(targetSku + ' · ' + targetName) + '). No se colocó en el documento ni en la ficha.</div>' +
                    '<div class="flex flex-wrap items-center gap-2 pt-0.5">' +
                        (downloadUrl
                            ? ('<a href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noopener" download class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-extrabold uppercase tracking-wider text-[10px]" style="background:#FFFFFF; border-color:#059669; color:#065F46;">⬇ Descargar archivo</a>')
                            : '') +
                        '<a href="' + escapeHtml(folderUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-extrabold uppercase tracking-wider text-[10px]" style="background:#FFFFFF; border-color:#E1DBC5; color:#252C32;">Abrir carpeta Drive</a>' +
                    '</div>' +
                '</div>';
            setDetailUploadPhotoStatus('', 'ok', statusHtml);
        } catch (err) {
            const msgErr = err && err.message ? err.message : 'Error al procesar la fotografía.';
            reportSystemHistoryEvent({
                classification: 'FALLO DE CÓDIGO',
                module: 'inventario-app.js · uploadManagerProductPhoto',
                event: 'EXCEPCIÓN PROCESANDO FOTOGRAFÍA',
                status: '❌ ERROR',
                ref: targetSku + ' · ' + targetName,
                detail: msgErr,
                analysis: cleanStr(err && err.stack) || 'Error en compresión canvas o envío de imagen.'
            });
            setDetailUploadPhotoStatus(msgErr, 'err');
        } finally {
            managerPhotoUploadInFlight = false;
            if (currentDetailItem) {
                refreshDetailManagerPhotoControls(currentDetailItem, true);
            }
        }
    };

    let relatedStockExpanded = false;
    let relatedStockRefItem = null;
    let relatedStockRefSku = '';

    function normProductTypeKey(val) {
        return String(cleanStr(val) || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
    }

    function getRelatedTypeDisplayLabel(refItem) {
        if (!refItem) return 'RELACIONADOS';
        const tpClean = cleanStr(refItem.tp).toUpperCase();
        if (tpClean) return tpClean;
        if (refItem._cat && refItem._cat !== 'OTROS') return refItem._cat;
        if (refItem._main) return refItem._main;
        return 'RELACIONADOS';
    }

    function getRelatedInStockItems(refItem) {
        if (!refItem) return [];
        const curSku = currentDetailItem ? String(currentDetailItem.s || '').trim().toUpperCase() : '';
        const refTp = normProductTypeKey(refItem.tp);
        const refCat = refItem._cat || '';
        const refMain = refItem._main || '';

        const matches = [];
        for (let i = 0; i < allItems.length; i++) {
            const cand = allItems[i];
            if (!cand || !cand.s) continue;
            const candSku = String(cand.s).trim().toUpperCase();
            if (curSku && candSku === curSku) continue;

            const delivStock = getBodegaPisoStock(cand);
            if (delivStock <= 0) continue;

            const candTp = normProductTypeKey(cand.tp);
            let tier = 0;
            if (refTp && candTp && candTp === refTp) {
                tier = 1;
            } else if (refCat && refCat !== 'OTROS' && cand._cat === refCat) {
                tier = 2;
            } else if (!refTp && (!refCat || refCat === 'OTROS') && refMain && cand._main === refMain) {
                tier = 3;
            }
            if (!tier) continue;

            matches.push({
                it: cand,
                tier: tier,
                stock: delivStock,
                hasPhoto: photoUrlForItem(cand) ? 1 : 0
            });
        }

        matches.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            if (b.stock !== a.stock) return b.stock - a.stock;
            return compareAlphaEs(
                stripDimensionsFromProductText(a.it.n) || a.it.s,
                stripDimensionsFromProductText(b.it.n) || b.it.s
            ) || String(a.it.s || '').localeCompare(String(b.it.s || ''));
        });

        return matches;
    }

    function buildDeliveryStockSummary(it) {
        const stocks = Array.isArray(it && it.st) ? it.st : [];
        const byLoc = new Map();
        const shortNames = {
            'CEDIS': 'CEDIS',
            'CASA CREATA': 'Casa Creata',
            'PUERTO CANCUN': 'PTC',
            'COLOSIO': 'Colosio',
            'PLAYA': 'Playa'
        };
        for (let i = 0; i < WAREHOUSES.length; i++) {
            const wh = WAREHOUSES[i];
            if (isLpptWarehouse(wh)) continue;
            const q = Math.max(0, Number(stocks[i]) || 0);
            if (q <= 0) continue;
            const baseLoc = String(wh).replace(/\s*\([^)]*\)\s*/g, '').trim().toUpperCase();
            const label = shortNames[baseLoc] || baseLoc;
            byLoc.set(label, (byLoc.get(label) || 0) + q);
        }
        if (byLoc.size === 1) {
            return Array.from(byLoc.keys())[0];
        }
        const parts = [];
        byLoc.forEach((val, key) => parts.push(key + ': ' + val));
        return parts.join(' · ');
    }

    function prepareRelatedInStockSection(refItem, keepExpanded) {
        const secEl = document.getElementById('detRelatedStockSection');
        const btnLbl = document.getElementById('detRelatedStockBtnLabel');
        const panelEl = document.getElementById('detRelatedStockPanel');
        const listEl = document.getElementById('detRelatedStockList');
        if (!secEl || !btnLbl || !panelEl || !listEl) return;

        if (!refItem) {
            relatedStockExpanded = false;
            relatedStockRefItem = null;
            relatedStockRefSku = '';
            secEl.classList.add('hidden');
            panelEl.classList.add('hidden');
            listEl.innerHTML = '';
            return;
        }

        relatedStockRefItem = refItem;
        relatedStockRefSku = currentDetailItem ? String(currentDetailItem.s || '').trim().toUpperCase() : '';
        relatedStockExpanded = !!keepExpanded;

        const matches = getRelatedInStockItems(refItem);
        const typeLabel = getRelatedTypeDisplayLabel(refItem);
        secEl.classList.remove('hidden');

        const prefixVerb = relatedStockExpanded ? 'Ocultar' : 'Ver';
        btnLbl.textContent = prefixVerb + ' productos con stock para entrega · ' + typeLabel + ' (' + matches.length + ')';

        if (relatedStockExpanded) {
            renderRelatedInStockList(matches, typeLabel);
            panelEl.classList.remove('hidden');
        } else {
            panelEl.classList.add('hidden');
            listEl.innerHTML = '';
        }
    }

    function renderRelatedInStockList(precomputedMatches, precomputedLabel) {
        const subEl = document.getElementById('detRelatedStockSubhead');
        const listEl = document.getElementById('detRelatedStockList');
        if (!listEl || !relatedStockRefItem) return;

        const matches = Array.isArray(precomputedMatches) ? precomputedMatches : getRelatedInStockItems(relatedStockRefItem);
        const typeLabel = precomputedLabel || getRelatedTypeDisplayLabel(relatedStockRefItem);

        if (subEl) {
            subEl.textContent = matches.length > 0
                ? ('Disponibles para entrega inmediata relacionados con ' + typeLabel + ' (' + matches.length + ')')
                : ('Sin otros productos de ' + typeLabel + ' con stock físico para entrega inmediata');
        }

        if (!matches.length) {
            listEl.innerHTML =
                '<div class="rounded-xl border px-3.5 py-4 text-center text-xs font-semibold" style="border-color:#E8E4DE; background:#FFFFFF; color:#252C32;">' +
                    'Por el momento no hay otros artículos de este mismo tipo con existencia física en bodega o piso.' +
                '</div>';
            return;
        }

        listEl.innerHTML = matches.map(entry => {
            const it = entry.it;
            const skuKey = String(it.s || '').trim().toUpperCase();
            const titleTxt = stripDimensionsFromProductText(it.n) || cleanStr(it._groupTitle) || it.s;
            const locSummary = buildDeliveryStockSummary(it);
            const dispTxt = entry.stock === 1 ? '1 disponible para entrega' : (entry.stock + ' disponibles para entrega');
            return '<div class="inv-row" data-rel-sku="' + escapeHtml(skuKey) + '" style="background:#FFFFFF;">' +
                buildThumbHtml(it) +
                '<div class="min-w-0 flex-1 pr-2">' +
                    '<div class="text-xs sm:text-sm font-bold uppercase leading-snug" style="color:#252C32;">' +
                        formatTitleWithPriceHtml(titleTxt, it.pr) +
                    '</div>' +
                    '<div class="text-[11px] font-semibold tracking-wider mt-0.5 flex flex-wrap items-center gap-1.5">' +
                        '<span style="color:#A38251;">' + escapeHtml(it.s) + '</span>' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold sem-green">' + escapeHtml(dispTxt) + '</span>' +
                        (locSummary ? ('<span class="text-[10px] font-bold opacity-75" style="color:#252C32;">(' + escapeHtml(locSummary) + ')</span>') : '') +
                    '</div>' +
                '</div>' +
                buildCardCartControlHtml(skuKey) +
            '</div>';
        }).join('');

        listEl.querySelectorAll('.inv-row[data-rel-sku]').forEach(rowEl => {
            const sku = rowEl.getAttribute('data-rel-sku');
            rowEl.onclick = function () {
                openProductDetail(sku, false);
                const modalCard = document.querySelector('#productDetailModal > div');
                if (modalCard) modalCard.scrollTo({ top: 0, behavior: 'smooth' });
            };
            const ctrlWrap = rowEl.querySelector('[data-sku-ctrl]');
            bindCardCartControlEvents(ctrlWrap, sku);
        });
    }

    window.toggleRelatedInStockProducts = function () {
        if (!relatedStockRefItem) return;
        relatedStockExpanded = !relatedStockExpanded;
        prepareRelatedInStockSection(relatedStockRefItem, relatedStockExpanded);
        if (relatedStockExpanded) {
            const secEl = document.getElementById('detRelatedStockSection');
            if (secEl && secEl.scrollIntoView) {
                setTimeout(() => secEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
            }
        }
    };

    // ------------------------------------------------------------------------
    // USUARIOS POR UBICACIÓN, CONTRASEÑA TEMPORAL Y PLANTILLA S MUEBLERÍA
    // ------------------------------------------------------------------------
    const AUTH_SESSION_KEY = 'creata_inv_advisor_session_v1';
    const PENDING_KEYS_STORAGE = 'creata_inv_updated_keys_v1';
    const QUOTE_META_STORAGE = 'creata_inv_quote_draft_meta_v1';

    const USER_BRANCH_TABS = [
        {
            tab: 'PLAYA',
            branchKey: 'PLAYA',
            label: 'Playa del Carmen',
            erpStore: 'CREATA LIVING PLAYA',
            orderPrefix: 'PL',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE PL · PLAYA'
        },
        {
            tab: 'COLOCIO',
            branchKey: 'COLOSIO',
            label: 'Colosio',
            erpStore: 'CREATA LIVING COLOSIO',
            orderPrefix: 'DTC',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE DTC · COLOSIO'
        },
        {
            tab: 'OUTLET COLOSIO',
            branchKey: 'OUTLET COLOSIO',
            label: 'Outlet Colosio',
            erpStore: 'OUTLET COLOSIO',
            orderPrefix: 'OUT',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE OUT · OUTLET COLOSIO'
        },
        {
            tab: 'PTC',
            branchKey: 'PTC',
            label: 'Puerto Cancún (PTC)',
            erpStore: 'CREATA PUERTO CANCUN',
            orderPrefix: 'PTC',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE PTC · PUERTO CANCÚN'
        },
        {
            tab: 'CASA CREATA',
            branchKey: 'CASA CREATA',
            label: 'Casa Creata',
            erpStore: 'CASA CREATA BONAMPAK',
            orderPrefix: 'CCB',
            quoteType: 'SUCURSAL',
            isProyecto: false,
            serieLabel: 'SERIE CCB · CASA CREATA'
        },
        {
            tab: 'PROYECTOS',
            branchKey: 'PROYECTOS',
            label: 'Proyectos',
            erpStore: 'PROYECTOS ANIPA INTERIOR',
            orderPrefix: 'PRO',
            quoteType: 'PROYECTO',
            isProyecto: true,
            serieLabel: 'MODALIDAD PROYECTO · SERIE PRO'
        },
        {
            tab: 'CUENTAS ADMINISTRATIVAS',
            branchKey: 'ADMIN',
            label: 'Administración General',
            erpStore: 'CEDIS',
            orderPrefix: 'CED',
            quoteType: 'ADMINISTRATIVO',
            isProyecto: false,
            isAdmin: true,
            serieLabel: 'ADMINISTRADOR · TODAS LAS TIENDAS'
        },
        {
            tab: 'INVITADOS',
            branchKey: 'INVITADOS',
            label: 'Invitado (Solo Ver)',
            erpStore: 'SOLO LECTURA',
            orderPrefix: 'INV',
            quoteType: 'SOLO_VER',
            isProyecto: false,
            isGuest: true,
            serieLabel: 'SOLO VER · INVITADO (SIN COTIZAR NI DESCUENTOS)'
        }
    ];

    const MAX_GUEST_PLACES_PER_EMAIL = 2;
    const DEVICE_ID_STORAGE_KEY = 'creata_inv_device_id_v1';
    const DEVICE_ID_COOKIE_NAME = 'creata_inv_dev_id';
    const GUEST_DEVICES_LOCAL_STORAGE_KEY = 'creata_inv_guest_devices_v1';

    function getOrCreateClientDeviceId() {
        let devId = '';
        try {
            devId = cleanStr(localStorage.getItem(DEVICE_ID_STORAGE_KEY) || '');
        } catch (e) {}
        if (!devId && typeof document !== 'undefined' && document.cookie) {
            const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + DEVICE_ID_COOKIE_NAME + '=([^;]+)'));
            if (m && m[1]) {
                try { devId = cleanStr(decodeURIComponent(m[1])); } catch (e) {}
            }
        }
        if (!devId || devId.length < 6) {
            const randPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
                : (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8));
            devId = 'dev_' + Date.now().toString(36) + '_' + randPart;
        }
        try {
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, devId);
        } catch (e) {}
        try {
            if (typeof document !== 'undefined') {
                document.cookie = DEVICE_ID_COOKIE_NAME + '=' + encodeURIComponent(devId) + '; path=/; max-age=' + (400 * 24 * 60 * 60) + '; SameSite=Lax';
            }
        } catch (e) {}
        return devId;
    }

    function getClientDeviceLabel() {
        try {
            const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
            let os = 'Dispositivo';
            if (/iPhone/i.test(ua)) os = 'iPhone';
            else if (/iPad/i.test(ua)) os = 'iPad';
            else if (/Android/i.test(ua)) os = 'Android';
            else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
            else if (/Windows/i.test(ua)) os = 'Windows PC';
            else if (/Linux/i.test(ua)) os = 'Linux';

            let browser = 'Web';
            if (/Edg\//i.test(ua)) browser = 'Edge';
            else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
            else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
            else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
            else if (/Firefox\//i.test(ua)) browser = 'Firefox';

            return os + ' · ' + browser;
        } catch (e) {
            return 'Navegador Web';
        }
    }

    function parseGuestDevicesFromTextClient(rawText) {
        const s = cleanStr(rawText);
        if (!s) return [];
        const list = [];
        const seen = {};
        const re = /(?:(\d+)\)\s*)?([^\[\]|]*?)\[DEV:([A-Za-z0-9_.-]+)\](?:\s*\(([^)]*)\))?/g;
        let m;
        while ((m = re.exec(s)) !== null) {
            const id = cleanStr(m[3]).slice(0, 64);
            if (!id || seen[id]) continue;
            seen[id] = true;
            list.push({
                id: id,
                label: cleanStr(m[2]) || 'Dispositivo',
                stamp: cleanStr(m[4]) || ''
            });
            if (list.length >= MAX_GUEST_PLACES_PER_EMAIL) break;
        }
        return list;
    }

    function loadLocalGuestDeviceRegistry() {
        try {
            const parsed = JSON.parse(localStorage.getItem(GUEST_DEVICES_LOCAL_STORAGE_KEY) || '{}');
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveLocalGuestDeviceRegistry(regObj) {
        try {
            localStorage.setItem(GUEST_DEVICES_LOCAL_STORAGE_KEY, JSON.stringify(regObj || {}));
        } catch (e) {}
    }

    function checkGuestDeviceLimitClient(guestRowUser, deviceId, deviceLabel) {
        const email = String((guestRowUser && guestRowUser.correo) || '').trim().toLowerCase();
        const devId = cleanStr(deviceId) || getOrCreateClientDeviceId();
        const devLbl = cleanStr(deviceLabel) || getClientDeviceLabel();
        const reg = loadLocalGuestDeviceRegistry();

        const sheetDevices = Array.isArray(guestRowUser && guestRowUser.guestDevices)
            ? guestRowUser.guestDevices
            : parseGuestDevicesFromTextClient(guestRowUser && guestRowUser.guestDevicesRaw);
        const colHTxt = cleanStr(guestRowUser && guestRowUser.guestPlacesText);
        const sheetExplicitZero = /^0\s*\/\s*\d+$/.test(colHTxt) && sheetDevices.length === 0;
        if (sheetExplicitZero && reg[email]) {
            delete reg[email];
            saveLocalGuestDeviceRegistry(reg);
        }

        const merged = [];
        const seen = {};
        const pushDev = function (d) {
            if (!d || !d.id || seen[d.id] || merged.length >= MAX_GUEST_PLACES_PER_EMAIL) return;
            seen[d.id] = true;
            merged.push({
                id: String(d.id),
                label: cleanStr(d.label) || 'Dispositivo',
                stamp: cleanStr(d.stamp) || ''
            });
        };

        sheetDevices.forEach(pushDev);
        if (Array.isArray(reg[email])) {
            reg[email].forEach(pushDev);
        }

        let slotIdx = -1;
        for (let i = 0; i < merged.length; i++) {
            if (merged[i].id === devId) {
                slotIdx = i;
                break;
            }
        }

        // Si en la hoja Col H dice "2/2" sin IDs explícitos y este dispositivo no estaba registrado localmente
        const colHUsedMatch = colHTxt.match(/^(\d+)\s*\/\s*(\d+)$/);
        const colHUsedNum = colHUsedMatch ? (parseInt(colHUsedMatch[1], 10) || 0) : 0;
        if (slotIdx === -1 && (merged.length >= MAX_GUEST_PLACES_PER_EMAIL || (sheetDevices.length === 0 && colHUsedNum >= MAX_GUEST_PLACES_PER_EMAIL))) {
            const usedLabels = merged.map((d, idx) => 'Lugar ' + (idx + 1) + ': ' + (d.label || 'Dispositivo')).join(' · ');
            return {
                ok: false,
                limitReached: true,
                activePlaces: MAX_GUEST_PLACES_PER_EMAIL,
                maxPlaces: MAX_GUEST_PLACES_PER_EMAIL,
                error: 'Este correo de Invitado (' + email + ') ya alcanzó el límite máximo de ' + MAX_GUEST_PLACES_PER_EMAIL + ' lugares/dispositivos abiertos' +
                    (usedLabels ? (' (' + usedLabels + ')') : '') + '. Solo se permite abrir en 2 lugares por correo.'
            };
        }

        const nowStamp = new Date().toLocaleString('es-MX');
        if (slotIdx >= 0) {
            merged[slotIdx].label = devLbl || merged[slotIdx].label;
            merged[slotIdx].stamp = nowStamp;
        } else {
            merged.push({
                id: devId,
                label: devLbl,
                stamp: nowStamp
            });
            slotIdx = merged.length - 1;
        }

        reg[email] = merged;
        saveLocalGuestDeviceRegistry(reg);

        // Sincronizar con Apps Script en segundo plano para dejar constancia en las Columnas H e I de INVITADOS
        callInvWebAppPost('inv_guest_heartbeat', {
            email: email,
            deviceId: devId,
            deviceLabel: devLbl
        }, 9000).catch(() => {});

        return {
            ok: true,
            slotNumber: slotIdx + 1,
            activePlaces: merged.length,
            maxPlaces: MAX_GUEST_PLACES_PER_EMAIL,
            devices: merged
        };
    }

    function isGuestUserObject(u) {
        if (!u || typeof u !== 'object') return false;
        if (u.isAdmin || ADMIN_MASTER_EMAILS[String(u.correo || '').trim().toLowerCase()]) return false;
        if (u.isGuest || u.soloLectura) return true;
        const tabUp = String(u.sheetTab || u.branchKey || '').trim().toUpperCase();
        if (tabUp === 'INVITADOS' || tabUp === 'INVITADO') return true;
        const qtUp = String(u.quoteType || '').trim().toUpperCase();
        if (qtUp === 'SOLO_VER' || qtUp === 'SOLO LECTURA') return true;
        const pNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return /INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pNorm);
    }

    function isGuestSession(sessOpt) {
        const s = sessOpt !== undefined ? sessOpt : activeAdvisorSession;
        return isGuestUserObject(s);
    }

    const DEFAULT_ERP_STORES = [
        'CREATA PUERTO CANCUN',
        'CASA CREATA BONAMPAK',
        'CREATA LIVING COLOSIO',
        'CREATA LIVING PLAYA',
        'OUTLET COLOSIO',
        'PROYECTOS ANIPA INTERIOR',
        'CEDIS',
        'ADMINISTRACION'
    ];

    const ADMIN_MASTER_EMAILS = {
        'santiago.torres@grupoanipa.com': true,
        'kevin.reyna@grupoanipa.com': true
    };

    // Series oficiales de folios en S Mueblería según tienda o bodega (sin guion artificial)
    const ERP_STORE_FOLIO_SERIES = {
        'CREATA LIVING PLAYA': 'PL',
        'CREATA LIVING COLOSIO': 'DTC',
        'OUTLET COLOSIO': 'OUT',
        'CREATA PUERTO CANCUN': 'PTC',
        'CASA CREATA BONAMPAK': 'CCB',
        'PROYECTOS ANIPA INTERIOR': 'PRO',
        'CEDIS': 'CED',
        'ADMINISTRACION': 'ADM'
    };

    const liveMaxFolioNumByPrefix = {};
    const liveNextFolioByStore = {};

    function getStoreFolioPrefix(erpStore, fallbackPrefix) {
        const up = String(erpStore || '').trim().toUpperCase();
        if (ERP_STORE_FOLIO_SERIES[up]) return ERP_STORE_FOLIO_SERIES[up];
        const cfg = findBranchConfig('', up);
        if (cfg && cfg.orderPrefix) return cfg.orderPrefix;
        const fb = String(fallbackPrefix || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        return fb || 'PTC';
    }

    function registerObservedFolio(rawFolio, erpStoreHint) {
        const s = cleanStr(rawFolio).toUpperCase();
        if (!s) return false;
        // Ignorar consecutivos viejos artificiales con guion como PL-0001
        if (/^[A-Z]+-\d+$/.test(s)) return false;
        const m = s.match(/^([A-Z]{2,5})\s*(\d{2,8})$/);
        if (!m) return false;
        const pfx = m[1];
        const num = parseInt(m[2], 10);
        if (!num || num <= 0) return false;
        let updated = false;
        if (!liveMaxFolioNumByPrefix[pfx] || num > liveMaxFolioNumByPrefix[pfx]) {
            liveMaxFolioNumByPrefix[pfx] = num;
            updated = true;
        }
        const storeUp = String(erpStoreHint || '').trim().toUpperCase();
        if (storeUp && (!liveNextFolioByStore[storeUp] || num >= (parseInt((liveNextFolioByStore[storeUp].match(/\d+$/) || ['0'])[0], 10) || 0))) {
            liveNextFolioByStore[storeUp] = pfx + String(num + 1);
            updated = true;
        }
        return updated;
    }

    function applyServerFolioMap(mapObj) {
        if (!mapObj || typeof mapObj !== 'object') return;
        Object.keys(mapObj).forEach(stKey => {
            const val = cleanStr(mapObj[stKey]).toUpperCase();
            const up = String(stKey || '').trim().toUpperCase();
            if (!up || !val || /^[A-Z]+-\d+$/.test(val)) return;
            liveNextFolioByStore[up] = val;
            const m = val.match(/^([A-Z]{2,5})(\d{2,8})$/);
            if (m) {
                const pfx = m[1];
                const prevNum = Math.max(0, (parseInt(m[2], 10) || 1) - 1);
                if (prevNum > (liveMaxFolioNumByPrefix[pfx] || 0)) {
                    liveMaxFolioNumByPrefix[pfx] = prevNum;
                }
            }
        });
    }

    function getEstimatedStoreFolio(erpStore, fallbackPrefix) {
        const storeUp = String(erpStore || '').trim().toUpperCase();
        if (storeUp && liveNextFolioByStore[storeUp]) {
            return liveNextFolioByStore[storeUp];
        }
        const pfx = getStoreFolioPrefix(storeUp, fallbackPrefix);
        if (liveMaxFolioNumByPrefix[pfx] && liveMaxFolioNumByPrefix[pfx] > 0) {
            return pfx + String(liveMaxFolioNumByPrefix[pfx] + 1);
        }
        return 'Serie ' + pfx;
    }

    function isEmailOrRoleAdmin(u) {
        if (!u || typeof u !== 'object') return false;
        if (u.isAdmin) return true;
        const email = String(u.correo || '').trim().toLowerCase();
        if (ADMIN_MASTER_EMAILS[email]) return true;
        const bKey = String(u.branchKey || u.sheetTab || '').trim().toUpperCase();
        if (bKey === 'ADMIN' || bKey === 'CUENTAS ADMINISTRATIVAS') return true;
        const pNorm = String(u.puesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return /ADMINISTRADOR/.test(pNorm);
    }

    function parseDiscountPctCell(rawVal) {
        if (rawVal === null || rawVal === undefined) return null;
        const s = String(rawVal).trim();
        if (!s) return null;
        // Evitar confundir nombres o etiquetas de asesor con descuento
        if (/[A-Za-z]{3,}/.test(s)) return null;
        const hasPctSign = s.indexOf('%') !== -1;
        const cleaned = s.replace(/[^0-9.,-]/g, '').replace(',', '.');
        if (!cleaned) return null;
        const n = Number(cleaned);
        if (isNaN(n) || !isFinite(n) || n < 0) return null;
        if (!hasPctSign && n > 0 && n <= 1) {
            return Math.min(100, Math.round(n * 10000) / 100);
        }
        return Math.min(100, Math.round(n * 100) / 100);
    }

    function findBranchConfig(tabOrKey, erpStoreHint) {
        const up = String(tabOrKey || '').trim().toUpperCase();
        const storeUp = String(erpStoreHint || '').trim().toUpperCase();
        for (let i = 0; i < USER_BRANCH_TABS.length; i++) {
            const cfg = USER_BRANCH_TABS[i];
            if (cfg.tab.toUpperCase() === up || cfg.branchKey.toUpperCase() === up) return cfg;
            if (up === 'COLOSIO' && cfg.tab === 'COLOCIO') return cfg;
            if ((up === 'INVITADO' || up === 'SOLO VER') && cfg.tab === 'INVITADOS') return cfg;
        }
        if (storeUp) {
            for (let j = 0; j < USER_BRANCH_TABS.length; j++) {
                if (USER_BRANCH_TABS[j].erpStore.toUpperCase() === storeUp) return USER_BRANCH_TABS[j];
            }
        }
        return null;
    }

    function isManagerSessionUser(uOrPuesto) {
        if (!uOrPuesto) return false;
        if (typeof uOrPuesto === 'object' && (isEmailOrRoleAdmin(uOrPuesto) || isGuestUserObject(uOrPuesto))) return false;
        const rawPuesto = typeof uOrPuesto === 'object' ? (uOrPuesto.puesto || '') : String(uOrPuesto || '');
        const pNorm = String(rawPuesto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (/INVITAD|SOLO\s*VER|SOLO\s*LECTURA/.test(pNorm)) return false;
        return /GERENTE|\bSUB/.test(pNorm);
    }

    function normalizeQuoteErpStoreClient(rawStore, rawBranchTab) {
        const candidates = [rawStore, rawBranchTab];
        for (let c = 0; c < candidates.length; c++) {
            const s = String(candidates[c] || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toUpperCase();
            if (!s) continue;
            for (let i = 0; i < USER_BRANCH_TABS.length; i++) {
                const cfg = USER_BRANCH_TABS[i];
                const cfgStore = String(cfg.erpStore || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgTab = String(cfg.tab || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgKey = String(cfg.branchKey || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                const cfgLbl = String(cfg.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                if (!cfg.isAdmin && !cfg.isGuest && (cfgStore === s || cfgTab === s || cfgKey === s || cfgLbl === s)) {
                    return cfgStore;
                }
            }
            if (s === 'COLOSIO' || s === 'COLOCIO') return 'CREATA LIVING COLOSIO';
            if (s === 'PLAYA') return 'CREATA LIVING PLAYA';
            if (s === 'PTC' || s === 'PUERTO CANCUN') return 'CREATA PUERTO CANCUN';
            if (s === 'CASA CREATA') return 'CASA CREATA BONAMPAK';
            if (s === 'PROYECTOS') return 'PROYECTOS ANIPA INTERIOR';
            return s;
        }
        return '';
    }

    function enrichAdvisorLocation(u) {
        if (!u || typeof u !== 'object') return u;
        const cfg = findBranchConfig(u.sheetTab || u.branchKey, u.erpStore);
        const guestFlag = !!(cfg && cfg.isGuest) || isGuestUserObject(u);
        if (guestFlag) {
            return Object.assign({}, u, {
                sheetTab: u.sheetTab || 'INVITADOS',
                isAdmin: false,
                isManager: false,
                isGuest: true,
                soloLectura: true,
                maxDiscountPct: 0,
                branchKey: 'INVITADOS',
                branchLabel: u.branchLabel || 'Invitado (Solo Ver)',
                erpStore: 'SOLO LECTURA',
                orderPrefix: 'INV',
                quoteType: 'SOLO_VER',
                isProyecto: false,
                mustChangeKey: !!u.mustChangeKey,
                serieLabel: 'SOLO VER · INVITADO (SIN COTIZAR NI DESCUENTOS)',
                guestSlotNum: Math.max(1, Math.min(MAX_GUEST_PLACES_PER_EMAIL, Number(u.guestSlotNum) || 1)),
                guestActivePlaces: Math.max(1, Math.min(MAX_GUEST_PLACES_PER_EMAIL, Number(u.guestActivePlaces) || 1)),
                guestMaxPlaces: MAX_GUEST_PLACES_PER_EMAIL
            });
        }
        const adminFlag = isEmailOrRoleAdmin(u) || !!(cfg && cfg.isAdmin);
        const managerFlag = !adminFlag && (!!u.isManager || isManagerSessionUser(u));
        const resolvedStore = cleanStr(u.erpAdvisorBranch && adminFlag ? u.erpAdvisorBranch : '') ||
            cleanStr(u.erpStore) ||
            (cfg ? cfg.erpStore : '') ||
            'CREATA PUERTO CANCUN';
        const isProy = !adminFlag && (cfg ? !!cfg.isProyecto : (!!u.isProyecto || String(u.branchKey || u.sheetTab || '').toUpperCase() === 'PROYECTOS'));
        const prefix = getStoreFolioPrefix(resolvedStore, u.orderPrefix || (cfg ? cfg.orderPrefix : (isProy ? 'PRO' : 'PTC')));
        const parsedDisc = parseDiscountPctCell(u.maxDiscountPct);
        const enrichedObj = Object.assign({}, u, {
            isAdmin: adminFlag,
            isManager: managerFlag,
            isGuest: false,
            soloLectura: false,
            maxDiscountPct: parsedDisc !== null ? parsedDisc : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
            branchKey: adminFlag ? 'ADMIN' : (u.branchKey || (cfg ? cfg.branchKey : '')),
            branchLabel: u.branchLabel || (cfg ? cfg.label : (u.sheetTab || '')),
            erpStore: resolvedStore,
            orderPrefix: prefix,
            quoteType: adminFlag ? 'ADMINISTRATIVO' : (u.quoteType || (cfg ? cfg.quoteType : (isProy ? 'PROYECTO' : 'SUCURSAL'))),
            isProyecto: isProy,
            serieLabel: u.serieLabel || (cfg ? cfg.serieLabel : '')
        });
        if (Array.isArray(u.branchAdvisorEmails)) {
            enrichedObj.branchAdvisorEmails = u.branchAdvisorEmails
                .map(em => String(em || '').trim().toLowerCase())
                .filter(Boolean);
        }
        return enrichedObj;
    }

    const FIXED_QUOTE_CLIENT_MODE = 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)';
    const FIXED_QUOTE_CATEGORY_LABEL = 'COTIZACIONES [ID: 2]';

    let erpStoresCatalog = DEFAULT_ERP_STORES.slice();
    let erpAdvisorsCatalog = [];
    let activeAdvisorSession = loadAdvisorSession();
    let pendingAuthContext = null; // { email, inputKey, locations, switchingFromActive }
    let quoteDraftMeta = loadQuoteDraftMeta();
    let quoteSubmitInFlight = false;
    let currentNextOrderCode = '';
    let myRecentQuotesList = [];
    let newlyGeneratedQuoteHighlightKey = '';
    let lastSubmittedQuoteMeta = null;
    let pendingQuoteRetrySendToErp = null;
    let pendingPdfDownloadRetryOpts = null;
    let erpPdfDownloadInFlight = false;

    function loadAdvisorSession() {
        try {
            const raw = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
            if (raw && typeof raw === 'object' && raw.correo && (raw.branchLabel || raw.sheetTab)) {
                const enriched = enrichAdvisorLocation(raw);
                if (Array.isArray(enriched.allLocations)) {
                    enriched.allLocations = enriched.allLocations.map(enrichAdvisorLocation);
                }
                return enriched;
            }
        } catch (e) {}
        return null;
    }

    function saveAdvisorSession(sess) {
        activeAdvisorSession = sess ? enrichAdvisorLocation(sess) : null;
        try {
            if (activeAdvisorSession) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(activeAdvisorSession));
            else localStorage.removeItem(AUTH_SESSION_KEY);
        } catch (e) {}
    }

    function loadUpdatedKeysMap() {
        try {
            const obj = JSON.parse(localStorage.getItem(PENDING_KEYS_STORAGE) || '{}');
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (e) {
            return {};
        }
    }

    function saveUpdatedKeysMap(mapObj) {
        try {
            localStorage.setItem(PENDING_KEYS_STORAGE, JSON.stringify(mapObj || {}));
        } catch (e) {}
    }

    function getDefaultDeliveryIsoDate() {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
    }

    function isoDateToDMY(isoStr) {
        const s = cleanStr(isoStr);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        return s;
    }

    function createBlankQuoteMeta() {
        return {
            erpStore: '',
            erpAdvisorLabel: '',
            erpAdvisorId: '',
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
            clientName: '',
            clientPhone: '',
            clientEmail: '',
            erpClientId: 0,
            erpLeadId: 0,
            erpNoCliente: '',
            erpClientAddress: '',
            deliveryDateIso: getDefaultDeliveryIsoDate(),
            notes: '',
            extraDiscount: 0
        };
    }

    function loadQuoteDraftMeta() {
        const fallback = createBlankQuoteMeta();
        try {
            const saved = JSON.parse(localStorage.getItem(QUOTE_META_STORAGE) || 'null');
            if (saved && typeof saved === 'object') {
                return Object.assign(fallback, saved, {
                    clientMode: FIXED_QUOTE_CLIENT_MODE,
                    categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
                    deliveryDateIso: saved.deliveryDateIso || getDefaultDeliveryIsoDate()
                });
            }
        } catch (e) {}
        return fallback;
    }

    window.saveQuoteDraftMeta = function () {
        if (typeof isActiveQuoteCompleted === 'function' && isActiveQuoteCompleted()) return;
        const modeEl = document.getElementById('quoteClientModeSelect');
        const catEl = document.getElementById('quoteCategorySelect');
        const nameEl = document.getElementById('quoteClientNameInput');
        const phoneEl = document.getElementById('quoteClientPhoneInput');
        const emailEl = document.getElementById('quoteClientEmailInput');
        const dateEl = document.getElementById('quoteDeliveryDateInput');
        const notesEl = document.getElementById('quoteNotesInput');
        const extraEl = document.getElementById('quoteExtraDiscountInput');
        const adminStoreEl = document.getElementById('quoteAdminStoreSelect');
        const adminAdvEl = document.getElementById('quoteAdminAdvisorSelect');

        if (activeAdvisorSession) {
            if (activeAdvisorSession.isAdmin) {
                if (adminStoreEl && adminStoreEl.value) {
                    quoteDraftMeta.erpStore = adminStoreEl.value;
                } else if (!quoteDraftMeta.erpStore) {
                    quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || 'CEDIS';
                }
                if (adminAdvEl && adminAdvEl.value) {
                    const selOpt = adminAdvEl.options[adminAdvEl.selectedIndex];
                    quoteDraftMeta.erpAdvisorId = adminAdvEl.value;
                    quoteDraftMeta.erpAdvisorLabel = selOpt ? (selOpt.getAttribute('data-label') || selOpt.textContent || '') : '';
                } else if (!quoteDraftMeta.erpAdvisorId) {
                    quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
                    quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
                }
            } else {
                // Para asesores y gerentes de tienda queda bloqueado exclusivamente a su correo en sesión
                quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || '';
                quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
                quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
            }
        }
        if (modeEl) modeEl.value = FIXED_QUOTE_CLIENT_MODE;
        if (catEl) catEl.value = FIXED_QUOTE_CATEGORY_LABEL;
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        if (nameEl) quoteDraftMeta.clientName = nameEl.value;
        if (phoneEl) quoteDraftMeta.clientPhone = phoneEl.value;
        if (emailEl) quoteDraftMeta.clientEmail = emailEl.value;
        if (dateEl && dateEl.value) quoteDraftMeta.deliveryDateIso = dateEl.value;
        if (notesEl) quoteDraftMeta.notes = notesEl.value;
        if (extraEl) quoteDraftMeta.extraDiscount = Math.max(0, Number(extraEl.value) || 0);

        try {
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
        } catch (e) {}
        if (typeof syncActiveQuoteDraftStorage === 'function') {
            syncActiveQuoteDraftStorage();
        }
    };

    function cleanKeyCellValue(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') {
            return Number.isInteger(val) ? String(val) : String(Math.trunc(val));
        }
        let s = String(val).trim();
        if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
        return s;
    }

    function keysMatchNormalized(a, b) {
        const s1 = String(a || '').trim();
        const s2 = String(b || '').trim();
        if (!s1 || !s2) return false;
        if (s1 === s2) return true;
        const c1 = s1.replace(/\s+/g, '');
        const c2 = s2.replace(/\s+/g, '');
        return !!c1 && c1 === c2;
    }

    function normAdvisorTokens(txt) {
        const clean = String(txt || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\bLUPITA\b/g, 'GUADALUPE')
            .replace(/\bDADVID\b/g, 'DAVID')
            .replace(/\bJOHANNA\b/g, 'JOHANA')
            .replace(/\bRODRIGUEZ\b/g, 'RODRIGEZ');
        const words = clean.match(/[A-Z]+/g) || [];
        const stop = { DE: 1, LA: 1, DEL: 1, LOS: 1, LAS: 1, Y: 1, PROYECTOS: 1, OUTLET: 1, ADMON: 1 };
        return words.filter(w => w.length >= 2 && !stop[w]);
    }

    function matchBestErpAdvisorClient(userName, targetErpStore, advisorsList) {
        const uToks = normAdvisorTokens(userName);
        if (!uToks.length || !Array.isArray(advisorsList) || !advisorsList.length) return null;
        const uSet = new Set(uToks);
        let best = null;
        let bestScore = -1;
        for (let i = 0; i < advisorsList.length; i++) {
            const a = advisorsList[i];
            const aToks = a.tokens || normAdvisorTokens((a.label || '').split('|')[0]);
            let overlap = 0;
            for (let j = 0; j < aToks.length; j++) {
                if (uSet.has(aToks[j])) overlap++;
            }
            if (overlap <= 0) continue;
            const sameStore = String(a.branch || '').toUpperCase() === String(targetErpStore || '').toUpperCase() ? 1 : 0;
            const ratio = overlap / Math.max(1, Math.min(uToks.length, aToks.length));
            const score = (sameStore * 100) + (overlap * 10) + ratio;
            if (score > bestScore) {
                bestScore = score;
                best = a;
            }
        }
        return best;
    }

    function extractErpIdFromLabel(label) {
        const m = String(label || '').match(/\[ID:\s*(\d+)\]/i) || String(label || '').match(/\bID[:\s#]*(\d{3,7})\b/i);
        return m ? m[1] : '';
    }

    async function callInvWebAppPost(action, payloadObj, timeoutMs) {
        const cfgUrl = (window.CREATA_CLOUD_CONFIG && window.CREATA_CLOUD_CONFIG.getApiUrl)
            ? window.CREATA_CLOUD_CONFIG.getApiUrl()
            : '';
        const primaryUrl = cfgUrl || CANONICAL_WEBAPP_URL;
        if (!primaryUrl) return { ok: false, unavailable: true };

        const postOnce = async function (targetUrl) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 12000) : null;
            try {
                const body = Object.assign({}, payloadObj || {}, { action: action });
                const resp = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(body),
                    signal: controller ? controller.signal : undefined
                });
                if (!resp.ok) return { ok: false, unavailable: true, httpStatus: resp.status };
                const json = await resp.json();
                if (json && !json.ok && /PIN de administrador|Acci[óo]n no reconocida/i.test(String(json.error || ''))) {
                    return { ok: false, needsRedeploy: true, error: json.error };
                }
                return json || { ok: false, unavailable: true };
            } catch (err) {
                return { ok: false, unavailable: true, error: err && err.message ? err.message : String(err) };
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        const res = await postOnce(primaryUrl);
        if (
            CANONICAL_WEBAPP_URL &&
            primaryUrl !== CANONICAL_WEBAPP_URL &&
            res &&
            (res.unavailable || res.needsRedeploy)
        ) {
            const fallbackRes = await postOnce(CANONICAL_WEBAPP_URL);
            if (fallbackRes && fallbackRes.ok) {
                try {
                    if (window.CREATA_CLOUD_CONFIG && typeof window.CREATA_CLOUD_CONFIG.setApiUrl === 'function') {
                        window.CREATA_CLOUD_CONFIG.setApiUrl('');
                    }
                } catch (e) {}
                return fallbackRes;
            }
        }
        return res;
    }

    // ------------------------------------------------------------------------
    // BITÁCORA EXCLUSIVA EN HOJA "HISTORIAL": FALLOS DE CÓDIGO Y MOVIMIENTOS
    // ------------------------------------------------------------------------
    const FOTOS_NUEVAS_CARGADO_FOLDER_ID = '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9';
    const FOTOS_NUEVAS_CARGADO_SHEET = 'FOTOS NUEVAS CARGADO';
    const historySentSignatures = new Map();
    let historyEventsSentCount = 0;

    function reportSystemHistoryEvent(opts) {
        try {
            if (!opts || historyEventsSentCount >= 20) return;
            const sig = [
                cleanStr(opts.classification),
                cleanStr(opts.module),
                cleanStr(opts.event),
                cleanStr(opts.ref),
                cleanStr(opts.detail).slice(0, 120)
            ].join('|');
            const now = Date.now();
            const prevTs = historySentSignatures.get(sig) || 0;
            if (now - prevTs < 300000) return; // Evitar duplicados en ventana de 5 min
            historySentSignatures.set(sig, now);
            historyEventsSentCount++;

            const sess = activeAdvisorSession;
            const userStr = cleanStr(opts.user) ||
                (sess ? ((sess.nombre ? (sess.nombre + ' (' + sess.correo + ')') : sess.correo)) : 'Visitante / Sin sesión');
            const branchStr = cleanStr(opts.branch) ||
                (sess ? (sess.erpStore || sess.branchLabel || sess.sheetTab || '') : '');

            callInvWebAppPost('inv_log_event', {
                classification: cleanStr(opts.classification) || 'FALLO DE CÓDIGO',
                module: cleanStr(opts.module) || 'inventario-app.js',
                event: cleanStr(opts.event) || 'EVENTO SISTEMA',
                status: cleanStr(opts.status) || '⚠️ ALERTA',
                user: userStr,
                branch: branchStr,
                ref: cleanStr(opts.ref) || '',
                detail: cleanStr(opts.detail) || '',
                analysis: cleanStr(opts.analysis) || ''
            }, 9000).catch(() => {});
        } catch (eHist) {}
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('error', function (ev) {
            try {
                const msg = cleanStr(ev && ev.message);
                if (!msg || /ResizeObserver loop/i.test(msg)) return;
                if (/^Script error\.?$/i.test(msg) && !cleanStr(ev && ev.filename) && !(ev && ev.lineno) && !(ev && ev.error)) return;
                const fileStr = cleanStr(ev && ev.filename).split('/').pop() || 'inventario.html';
                const loc = (ev && ev.lineno) ? (fileStr + ':' + ev.lineno + (ev.colno ? (':' + ev.colno) : '')) : fileStr;
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'JS Cliente · ' + loc,
                    event: 'ERROR DE EJECUCIÓN JAVASCRIPT',
                    status: '❌ ERROR',
                    ref: (currentDetailItem && currentDetailItem.s) ? currentDetailItem.s : '',
                    detail: msg,
                    analysis: cleanStr(ev && ev.error && ev.error.stack) || ('Excepción capturada en ventana (' + loc + ').')
                });
            } catch (e) {}
        });

        window.addEventListener('unhandledrejection', function (ev) {
            try {
                const r = ev ? ev.reason : null;
                const msg = cleanStr((r && r.message) ? r.message : r);
                if (!msg || /AbortError|The user aborted a request/i.test(msg)) return;
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'JS Cliente · Promise',
                    event: 'PROMESA NO CONTROLADA (UNHANDLED REJECTION)',
                    status: '❌ ERROR',
                    ref: (currentDetailItem && currentDetailItem.s) ? currentDetailItem.s : '',
                    detail: msg,
                    analysis: cleanStr(r && r.stack) || 'Promesa asíncrona rechazada sin bloque catch.'
                });
            } catch (e) {}
        });
    }

    async function fetchSheetCsvRows(sheetName, extraParams) {
        if (!META.sheetId) return null;
        const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(META.sheetId) +
            '/gviz/tq?tqx=out:csv&headers=0&sheet=' + encodeURIComponent(sheetName) +
            (extraParams ? ('&' + extraParams) : '') + '&_t=' + Date.now();
        try {
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) return null;
            const txt = await resp.text();
            if (!txt || txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) return null;
            return parseCsvText(txt);
        } catch (e) {
            return null;
        }
    }

    let lastErpCatalogSyncMs = 0;

    async function loadErpCatalogLiveFromSheet() {
        const [rows, h1Rows] = await Promise.all([
            fetchSheetCsvRows('plantilla', 'range=AA2:AH5500'),
            fetchSheetCsvRows('1', 'range=A2:B5500').catch(() => null)
        ]);
        const stores = DEFAULT_ERP_STORES.slice();
        const advisors = [];
        const nextPrices = new Map();
        const nextErpCatalog = new Map();

        if (Array.isArray(rows)) {
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i] || [];
                const st = cleanStr(r[0]);
                if (st && stores.indexOf(st) === -1) stores.push(st);
                const label = cleanStr(r[1]);
                const branch = cleanStr(r[2]);
                if (branch && stores.indexOf(branch) === -1) stores.push(branch);
                const idVal = cleanKeyCellValue(r[3]) || extractErpIdFromLabel(label);
                if (label && label.toUpperCase() !== 'ASESOR_ERP_ETIQUETA') {
                    advisors.push({
                        label: label,
                        branch: branch,
                        id: idVal,
                        tokens: normAdvisorTokens(label.split('|')[0])
                    });
                }
                const erpSku = cleanStr(r[4]).toUpperCase();
                if (erpSku && erpSku !== 'SKU_ERP') {
                    const prFmt = formatPrice(r[7]);
                    if (prFmt) nextPrices.set(erpSku, prFmt);
                    const rawAf = cleanStr(r[5]);
                    const erpMo = (rawAf && !/^\d+$/.test(rawAf) && !/^(ID_PRODUCTO_ERP|MODELO_ERP)$/i.test(rawAf)) ? rawAf : '';
                    const erpNom = cleanStr(r[6]);
                    if (erpNom && erpNom.toUpperCase() !== 'NOMBRE_ERP' && !/^DESC[-\s]|DESCONTINUAD/i.test(erpNom)) {
                        nextErpCatalog.set(erpSku, {
                            sku: cleanStr(r[4]),
                            mo: erpMo,
                            n: erpNom,
                            pr: prFmt,
                            f: ''
                        });
                    }
                }
            }
        }

        if (Array.isArray(h1Rows)) {
            for (let j = 0; j < h1Rows.length; j++) {
                const hr = h1Rows[j] || [];
                const hSkuRaw = cleanStr(hr[0]);
                const hSku = hSkuRaw.toUpperCase();
                if (!hSku || hSku === 'SKU') continue;
                const hNom = cleanStr(hr[1]);
                if (hNom && /^DESC[-\s]|DESCONTINUAD/i.test(hNom)) continue;
                const prevEntry = nextErpCatalog.get(hSku);
                if (prevEntry) {
                    if (!prevEntry.n && hNom) prevEntry.n = hNom;
                } else if (hNom) {
                    nextErpCatalog.set(hSku, {
                        sku: hSkuRaw,
                        mo: '',
                        n: hNom,
                        pr: nextPrices.get(hSku) || '',
                        f: ''
                    });
                }
            }
        }

        if (stores.length > 0) erpStoresCatalog = stores;
        if (advisors.length > 0) erpAdvisorsCatalog = advisors;
        if (nextPrices.size > 0) liveErpPricesBySku = nextPrices;
        if (nextErpCatalog.size > 0) liveErpCatalogBySku = nextErpCatalog;
        lastErpCatalogSyncMs = Date.now();
    }

    function extractEmailFromGuestRowClient(rowArr) {
        if (!Array.isArray(rowArr)) return '';
        const preferredOrder = [4, 2, 1, 0, 3];
        for (let k = 0; k < preferredOrder.length; k++) {
            const idx = preferredOrder[k];
            const cell = cleanStr(rowArr[idx]).toLowerCase();
            if (cell && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
                return cell;
            }
        }
        return '';
    }

    function deriveGuestNameFromRowClient(rowArr, email) {
        const c2 = cleanStr(rowArr && rowArr[2]);
        if (c2 && c2.indexOf('@') === -1 && !/^NOMBRE$/i.test(c2)) return c2;
        const c1 = cleanStr(rowArr && rowArr[1]);
        if (c1 && c1.indexOf('@') === -1 && !/^(INVITADO|SOLO\s*VER|MODALIDAD|SUC)$/i.test(c1)) return c1;
        const localPart = String(email || '').split('@')[0] || 'INVITADO';
        return localPart.replace(/[._-]+/g, ' ').toUpperCase();
    }

    async function fetchAllAdvisorRowsLiveGviz() {
        await loadErpCatalogLiveFromSheet();
        const localKeyUpdates = loadUpdatedKeysMap();
        const results = await Promise.all(USER_BRANCH_TABS.map(async (cfg) => {
            let rows = await fetchSheetCsvRows(cfg.tab);
            if (cfg.isGuest && (!rows || !rows.length)) {
                rows = await fetchSheetCsvRows('invitados');
                if (!rows || !rows.length) {
                    rows = await fetchSheetCsvRows('Invitados');
                }
                if (!rows || !rows.length) {
                    callInvWebAppPost('inv_ensure_invitados', {}, 8000).catch(() => {});
                }
            }
            if (!rows || rows.length < 1) return [];
            let headerIdx = -1;
            for (let h = 0; h < Math.min(rows.length, 4); h++) {
                const hdrRow = rows[h] || [];
                const joinedHdr = hdrRow.map(c => cleanStr(c).toUpperCase()).join(' ');
                if (/^CORREO/i.test(cleanStr(hdrRow[4])) || /^NOMBRE/i.test(cleanStr(hdrRow[2])) || (cfg.isGuest && /\bCORREO\b/.test(joinedHdr))) {
                    headerIdx = h;
                    break;
                }
            }
            if (headerIdx === -1 && !cfg.isGuest) return [];
            const startIdx = headerIdx >= 0 ? (headerIdx + 1) : 0;
            const tabUsers = [];
            for (let i = startIdx; i < rows.length; i++) {
                const r = rows[i] || [];
                const correo = cfg.isGuest
                    ? extractEmailFromGuestRowClient(r)
                    : cleanStr(r[4]).toLowerCase();
                if (!correo || correo.indexOf('@') === -1) continue;
                let tempKey = cleanKeyCellValue(r[5]);
                let defKey = cleanKeyCellValue(r[6]);
                const colH = cleanStr(r[7]);
                const colI = cleanStr(r[8]);

                // Si la hoja ya tiene clave definitiva en Col G, limpiar caché pendiente local
                const localUpd = localKeyUpdates[correo];
                if (defKey && localUpd && keysMatchNormalized(defKey, localUpd.newKey)) {
                    delete localKeyUpdates[correo];
                    saveUpdatedKeysMap(localKeyUpdates);
                } else if (!defKey && localUpd && localUpd.newKey) {
                    defKey = localUpd.newKey;
                    tempKey = '';
                }

                if (cfg.isGuest) {
                    const guestNombre = deriveGuestNameFromRowClient(r, correo);
                    const guestPuesto = cleanStr(r[3]) && cleanStr(r[3]).indexOf('@') === -1
                        ? cleanStr(r[3])
                        : 'Invitado (Solo Ver)';
                    const parsedDevs = parseGuestDevicesFromTextClient(colI);
                    tabUsers.push({
                        sheetTab: 'INVITADOS',
                        rowNum: i + 1,
                        isAdmin: false,
                        isManager: false,
                        isGuest: true,
                        soloLectura: true,
                        noPasswordRequired: (!tempKey && !defKey),
                        maxDiscountPct: 0,
                        branchKey: 'INVITADOS',
                        branchLabel: cfg.label,
                        erpStore: 'SOLO LECTURA',
                        orderPrefix: 'INV',
                        quoteType: 'SOLO_VER',
                        isProyecto: false,
                        serieLabel: cfg.serieLabel,
                        nombre: guestNombre,
                        puesto: guestPuesto,
                        correo: correo,
                        tempKey: tempKey,
                        defKey: defKey,
                        mustChangeKey: !defKey,
                        erpAdvisorLabel: '',
                        erpAdvisorId: '',
                        erpAdvisorBranch: '',
                        guestPlacesText: colH,
                        guestDevicesRaw: colI,
                        guestDevices: parsedDevs,
                        guestMaxPlaces: MAX_GUEST_PLACES_PER_EMAIL
                    });
                    continue;
                }

                const nombre = cleanStr(r[2]);
                const puesto = cleanStr(r[3]);

                // Columna H: Nombre y ID del asesor en S Mueblería; Columna I (al costado): Descuento (%)
                let explicitAdvisorLabel = '';
                let explicitAdvisorId = '';
                let explicitDiscountPct = parseDiscountPctCell(colI);
                if (explicitDiscountPct === null && parseDiscountPctCell(colH) !== null && !extractErpIdFromLabel(colH)) {
                    explicitDiscountPct = parseDiscountPctCell(colH);
                } else if (colH) {
                    explicitAdvisorId = extractErpIdFromLabel(colH) || (/^\d{3,7}$/.test(colH) ? colH : '');
                    if (colH.indexOf('|') !== -1 || explicitAdvisorId) {
                        explicitAdvisorLabel = colH;
                    }
                }

                let matchedErp = null;
                if (explicitAdvisorId && erpAdvisorsCatalog.length > 0) {
                    matchedErp = erpAdvisorsCatalog.find(a => String(a.id) === String(explicitAdvisorId)) || null;
                }
                if (!matchedErp) {
                    matchedErp = matchBestErpAdvisorClient(nombre, cfg.erpStore, erpAdvisorsCatalog);
                }

                const resolvedErpLabel = (matchedErp && matchedErp.label) || explicitAdvisorLabel || '';
                const resolvedErpId = (matchedErp && matchedErp.id) || explicitAdvisorId || '';
                const resolvedErpBranch = (matchedErp && matchedErp.branch) || '';
                const isAdminUser = !!cfg.isAdmin || ADMIN_MASTER_EMAILS[correo] || /ADMINISTRADOR/i.test(puesto);
                const userErpStore = (isAdminUser && resolvedErpBranch) ? resolvedErpBranch : cfg.erpStore;

                tabUsers.push({
                    sheetTab: cfg.tab,
                    rowNum: i + 1,
                    isAdmin: isAdminUser,
                    isManager: !isAdminUser && isManagerSessionUser(puesto),
                    isGuest: false,
                    soloLectura: false,
                    maxDiscountPct: explicitDiscountPct,
                    branchKey: isAdminUser ? 'ADMIN' : cfg.branchKey,
                    branchLabel: cfg.label,
                    erpStore: userErpStore,
                    orderPrefix: getStoreFolioPrefix(userErpStore, cfg.orderPrefix),
                    quoteType: isAdminUser ? 'ADMINISTRATIVO' : cfg.quoteType,
                    isProyecto: !isAdminUser && !!cfg.isProyecto,
                    serieLabel: cfg.serieLabel,
                    nombre: nombre,
                    puesto: puesto,
                    correo: correo,
                    tempKey: tempKey,
                    defKey: defKey,
                    mustChangeKey: !defKey && !!tempKey,
                    erpAdvisorLabel: resolvedErpLabel,
                    erpAdvisorId: resolvedErpId,
                    erpAdvisorBranch: resolvedErpBranch
                });
            }
            return tabUsers;
        }));
        const flatUsers = results.flat();
        for (let m = 0; m < flatUsers.length; m++) {
            const mu = flatUsers[m];
            if (!mu || mu.isAdmin || mu.isGuest || !mu.isManager) continue;
            const mgrStoreNorm = normalizeQuoteErpStoreClient(mu.erpStore, mu.sheetTab);
            const allowedEmails = [String(mu.correo || '').trim().toLowerCase()];
            for (let k = 0; k < flatUsers.length; k++) {
                const cu = flatUsers[k];
                if (!cu || !cu.correo || cu.isAdmin || cu.isGuest || cu.isManager) continue;
                const cuStoreNorm = normalizeQuoteErpStoreClient(cu.erpStore, cu.sheetTab);
                const cuEmail = String(cu.correo).trim().toLowerCase();
                if (cuEmail && cuStoreNorm === mgrStoreNorm && allowedEmails.indexOf(cuEmail) === -1) {
                    allowedEmails.push(cuEmail);
                }
            }
            mu.branchAdvisorEmails = allowedEmails;
        }
        return flatUsers;
    }

    async function syncPendingKeyUpdatesToCloud() {
        const mapObj = loadUpdatedKeysMap();
        const emails = Object.keys(mapObj);
        if (!emails.length) return;
        let changed = false;
        for (let i = 0; i < emails.length; i++) {
            const em = emails[i];
            const item = mapObj[em];
            if (!item || !item.newKey) continue;
            const res = await callInvWebAppPost('inv_update_key', {
                email: em,
                currentKey: item.prevKey || '',
                newKey: item.newKey
            }, 9000);
            if (res && res.ok) {
                if (activeAdvisorSession && activeAdvisorSession.correo === em && res.authToken) {
                    activeAdvisorSession.authToken = res.authToken;
                    saveAdvisorSession(activeAdvisorSession);
                }
                delete mapObj[em];
                changed = true;
            }
        }
        if (changed) saveUpdatedKeysMap(mapObj);
    }

    function showAuthBanner(elId, text, tone) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = text;
        el.className = 'rounded-xl border px-3.5 py-2.5 text-xs font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    function setAuthStepVisible(stepName) {
        const sLogin = document.getElementById('authStepLogin');
        const sBranch = document.getElementById('authStepBranch');
        const sNewKey = document.getElementById('authStepNewKey');
        if (sLogin) sLogin.classList.toggle('hidden', stepName !== 'login');
        if (sBranch) sBranch.classList.toggle('hidden', stepName !== 'branch');
        if (sNewKey) sNewKey.classList.toggle('hidden', stepName !== 'newkey');
    }

    window.toggleAuthInputVisibility = function (inputId, btnEl) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        const isHidden = inp.type === 'password';
        inp.type = isHidden ? 'text' : 'password';
        if (btnEl) btnEl.textContent = isHidden ? 'Ocultar' : 'Ver';
    };

    function renderAdvisorHeaderBar() {
        const bar = document.getElementById('advisorSessionBar');
        const nameEl = document.getElementById('sessionUserName');
        const branchEl = document.getElementById('sessionBranchBadge');
        const erpEl = document.getElementById('sessionErpBadge');
        const switchBtn = document.getElementById('sessionSwitchBranchBtn');
        const trackQuoteBtn = document.getElementById('headerTrackQuoteBtn');
        const cartBtn = document.getElementById('headerCartBtn');
        const guestBadgeWrap = document.getElementById('headerGuestBadgeWrap');
        const guestBadgeText = document.getElementById('headerGuestBadgeText');

        const guestMode = isGuestSession();
        if (trackQuoteBtn) {
            trackQuoteBtn.classList.toggle('hidden', guestMode);
            trackQuoteBtn.style.display = guestMode ? 'none' : '';
        }
        if (cartBtn) {
            cartBtn.classList.toggle('hidden', guestMode);
            cartBtn.style.display = guestMode ? 'none' : '';
        }
        if (guestBadgeWrap) {
            if (guestMode && activeAdvisorSession) {
                const slotNum = Math.max(1, Math.min(MAX_GUEST_PLACES_PER_EMAIL, Number(activeAdvisorSession.guestSlotNum) || 1));
                if (guestBadgeText) {
                    guestBadgeText.textContent = 'SOLO VER · LUGAR ' + slotNum + '/' + MAX_GUEST_PLACES_PER_EMAIL + ' · ' + (activeAdvisorSession.nombre || activeAdvisorSession.correo || 'INVITADO');
                }
                guestBadgeWrap.classList.remove('hidden');
                guestBadgeWrap.style.display = 'inline-flex';
            } else {
                guestBadgeWrap.classList.add('hidden');
                guestBadgeWrap.style.display = 'none';
            }
        }

        if (currentDetailItem && typeof refreshDetailManagerPhotoControls === 'function') {
            refreshDetailManagerPhotoControls(currentDetailItem, true);
        }

        if (!bar) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            bar.classList.add('hidden');
            return;
        }

        if (nameEl) nameEl.textContent = activeAdvisorSession.nombre || activeAdvisorSession.correo;
        if (branchEl) {
            const prefix = getStoreFolioPrefix(activeAdvisorSession.erpStore, activeAdvisorSession.orderPrefix);
            if (guestMode) {
                branchEl.textContent = 'INVITADO · SOLO VER (SIN COTIZAR NI DESCUENTOS)';
            } else if (activeAdvisorSession.isAdmin) {
                branchEl.textContent = 'ADMINISTRADOR · TODAS LAS TIENDAS';
            } else if (activeAdvisorSession.isProyecto) {
                branchEl.textContent = 'PROYECTO · FOLIO ' + prefix;
            } else {
                branchEl.textContent = (activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || '') + ' · FOLIO ' + prefix;
            }
        }
        if (erpEl) {
            if (guestMode) {
                const slotNum = Math.max(1, Math.min(MAX_GUEST_PLACES_PER_EMAIL, Number(activeAdvisorSession.guestSlotNum) || 1));
                erpEl.textContent = 'Lugar ' + slotNum + ' de ' + MAX_GUEST_PLACES_PER_EMAIL + ' autorizado';
                erpEl.classList.remove('hidden');
            } else if (activeAdvisorSession.erpAdvisorId) {
                erpEl.textContent = 'Usuario S Mueblería #' + activeAdvisorSession.erpAdvisorId;
                erpEl.classList.remove('hidden');
            } else {
                erpEl.textContent = '';
                erpEl.classList.add('hidden');
            }
        }
        const multiLocs = Array.isArray(activeAdvisorSession.allLocations) ? activeAdvisorSession.allLocations : [];
        if (switchBtn) {
            switchBtn.classList.toggle('hidden', multiLocs.length <= 1);
        }
        bar.classList.remove('hidden');
    }

    function applyAdvisorDefaultsToQuoteForm(forceOverwriteStoreAndUser) {
        if (!activeAdvisorSession || isGuestSession()) return;
        if (!activeAdvisorSession.isAdmin || forceOverwriteStoreAndUser || !quoteDraftMeta.erpStore) {
            quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || 'CREATA PUERTO CANCUN';
            quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || '';
            quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || '';
        }
        try {
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
        } catch (e) {}
        populateQuoteAdvisorControls();
    }

    function openAuthModalForStartup() {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        showAuthBanner('authLoginMsg', '', 'err');
        showAuthBanner('authNewKeyMsg', '', 'err');

        if (activeAdvisorSession && activeAdvisorSession.mustChangeKey) {
            setAuthStepVisible('newkey');
            modal.classList.add('open');
            return;
        }
        if (!activeAdvisorSession) {
            setAuthStepVisible('login');
            modal.classList.add('open');
            const emInp = document.getElementById('authEmailInput');
            if (emInp) setTimeout(() => emInp.focus(), 60);
            return;
        }
        modal.classList.remove('open');
        renderAdvisorHeaderBar();
        if (isGuestSession()) {
            verifyActiveGuestSessionLive();
        } else {
            refreshMyLiveQuotesInfo();
        }
    }

    function promptSessionReauth(reasonMsg, retrySendFlag) {
        pendingQuoteRetrySendToErp = (typeof retrySendFlag === 'boolean') ? retrySendFlag : null;
        const modal = document.getElementById('authModal');
        const emInp = document.getElementById('authEmailInput');
        const keyInp = document.getElementById('authKeyInput');
        if (emInp && activeAdvisorSession && activeAdvisorSession.correo) {
            emInp.value = activeAdvisorSession.correo;
        }
        if (keyInp) keyInp.value = '';
        setAuthStepVisible('login');
        showAuthBanner('authLoginMsg', reasonMsg || 'Confirma tu contraseña personal para emitir la cotización con tu usuario exclusivo.', 'warn');
        if (modal) modal.classList.add('open');
        if (keyInp) setTimeout(() => keyInp.focus(), 60);
    }

    function renderBranchChoicesStep(locations, subtitleText) {
        const subEl = document.getElementById('authBranchSubtitle');
        const listEl = document.getElementById('authBranchOptionsList');
        if (subEl && subtitleText) subEl.textContent = subtitleText;
        if (!listEl) return;

        listEl.innerHTML = locations.map((rawLoc, idx) => {
            const loc = enrichAdvisorLocation(rawLoc);
            const isCurrent = activeAdvisorSession &&
                activeAdvisorSession.sheetTab === loc.sheetTab &&
                activeAdvisorSession.correo === loc.correo;
            const pfx = getStoreFolioPrefix(loc.erpStore, loc.orderPrefix);
            const modeTag = loc.isGuest
                ? 'SOLO VER · MÁX 2 LUGARES'
                : (loc.isAdmin
                    ? 'ADMIN · VER TODO'
                    : (loc.isProyecto ? ('PROYECTO · FOLIO ' + pfx) : ('FOLIO ' + pfx)));
            return '<button type="button" data-branch-idx="' + idx + '" ' +
                'class="w-full text-left rounded-xl border p-3.5 transition flex items-center justify-between gap-3 hover:shadow-sm" ' +
                'style="border-color:' + (isCurrent ? '#A38251' : '#E1DBC5') + '; background:' + (isCurrent ? '#FAF9F6' : '#FFFFFF') + ';">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="text-xs font-extrabold uppercase tracking-wider" style="color:#252C32;">' + escapeHtml(loc.branchLabel || loc.sheetTab) + '</span>' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (loc.isProyecto || loc.isAdmin ? '#252C32' : '#E1DBC5') + '; color:' + (loc.isProyecto || loc.isAdmin ? '#FFFFFF' : '#252C32') + ';">' + escapeHtml(modeTag) + '</span>' +
                    '</div>' +
                    '<div class="text-[11px] font-semibold mt-0.5" style="color:#A38251;">' +
                        escapeHtml((loc.puesto ? (loc.puesto + ' · ') : '') + (loc.erpStore || '')) +
                    '</div>' +
                '</div>' +
                '<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase shrink-0" style="background:#A38251; color:#FFFFFF;">Elegir</span>' +
            '</button>';
        }).join('');

        listEl.querySelectorAll('button[data-branch-idx]').forEach(btn => {
            btn.onclick = function () {
                const idx = parseInt(btn.getAttribute('data-branch-idx'), 10) || 0;
                const chosen = locations[idx];
                if (chosen) finalizeLocationChoice(chosen, locations, '');
            };
        });

        setAuthStepVisible('branch');
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.add('open');
    }

    function refreshGuestReadOnlyUIState() {
        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (Array.isArray(allItems) && allItems.length > 0) {
            applyFilter(inp ? inp.value : '', true);
        }
        const detailModal = document.getElementById('productDetailModal');
        if (detailModal && detailModal.classList.contains('open')) {
            if (currentDetailItem) {
                const crumbEl = document.getElementById('detGroupCrumb');
                const crumbVisible = !!(crumbEl && !crumbEl.classList.contains('hidden'));
                renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
            } else if (currentGroup) {
                renderGroupVariantsStep(currentGroup);
            }
        }
    }

    function finalizeLocationChoice(chosenLoc, allLocs, nextOrderFromLogin) {
        const enrichedChosen = enrichAdvisorLocation(chosenLoc);
        const cleanAll = (allLocs || [enrichedChosen]).map(rawU => {
            const u = enrichAdvisorLocation(rawU);
            const locObj = {
                sheetTab: u.sheetTab,
                rowNum: u.rowNum,
                isAdmin: !!u.isAdmin,
                isManager: !!u.isManager,
                isGuest: !!u.isGuest,
                soloLectura: !!u.soloLectura,
                maxDiscountPct: u.isGuest ? 0 : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
                branchKey: u.branchKey,
                branchLabel: u.branchLabel,
                erpStore: u.erpStore,
                orderPrefix: u.orderPrefix,
                quoteType: u.quoteType,
                isProyecto: !!u.isProyecto,
                serieLabel: u.serieLabel,
                nombre: u.nombre,
                puesto: u.puesto,
                correo: u.correo,
                mustChangeKey: !!u.mustChangeKey,
                erpAdvisorLabel: u.erpAdvisorLabel || '',
                erpAdvisorId: u.erpAdvisorId || '',
                erpAdvisorBranch: u.erpAdvisorBranch || '',
                authToken: u.authToken || '',
                guestSlotNum: u.guestSlotNum || 1,
                guestActivePlaces: u.guestActivePlaces || 1,
                guestMaxPlaces: u.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL
            };
            if (Array.isArray(u.branchAdvisorEmails)) {
                locObj.branchAdvisorEmails = u.branchAdvisorEmails;
            }
            return locObj;
        });

        const sessionObj = {
            sheetTab: enrichedChosen.sheetTab,
            rowNum: enrichedChosen.rowNum,
            isAdmin: !!enrichedChosen.isAdmin,
            isManager: !!enrichedChosen.isManager,
            isGuest: !!enrichedChosen.isGuest,
            soloLectura: !!enrichedChosen.soloLectura,
            maxDiscountPct: enrichedChosen.isGuest ? 0 : (enrichedChosen.maxDiscountPct !== undefined ? enrichedChosen.maxDiscountPct : null),
            branchKey: enrichedChosen.branchKey,
            branchLabel: enrichedChosen.branchLabel,
            erpStore: enrichedChosen.erpStore,
            orderPrefix: enrichedChosen.orderPrefix,
            quoteType: enrichedChosen.quoteType,
            isProyecto: !!enrichedChosen.isProyecto,
            serieLabel: enrichedChosen.serieLabel,
            nombre: enrichedChosen.nombre,
            puesto: enrichedChosen.puesto,
            correo: enrichedChosen.correo,
            mustChangeKey: !!enrichedChosen.mustChangeKey,
            erpAdvisorLabel: enrichedChosen.erpAdvisorLabel || '',
            erpAdvisorId: enrichedChosen.erpAdvisorId || '',
            erpAdvisorBranch: enrichedChosen.erpAdvisorBranch || '',
            authToken: enrichedChosen.authToken || '',
            guestSlotNum: enrichedChosen.guestSlotNum || 1,
            guestActivePlaces: enrichedChosen.guestActivePlaces || 1,
            guestMaxPlaces: enrichedChosen.guestMaxPlaces || MAX_GUEST_PLACES_PER_EMAIL,
            allLocations: cleanAll
        };
        if (Array.isArray(enrichedChosen.branchAdvisorEmails)) {
            sessionObj.branchAdvisorEmails = enrichedChosen.branchAdvisorEmails;
        }

        lastSubmittedQuoteMeta = null;
        myRecentQuotesList = [];
        newlyGeneratedQuoteHighlightKey = '';
        if (sessionObj.isGuest) {
            cart = {};
            closeCartModal();
            currentNextOrderCode = '';
        } else {
            const cleanLoginFolio = (nextOrderFromLogin && !/^[A-Z]+-\d+$/i.test(String(nextOrderFromLogin)))
                ? cleanStr(nextOrderFromLogin)
                : '';
            if (cleanLoginFolio && sessionObj.erpStore) {
                liveNextFolioByStore[String(sessionObj.erpStore).toUpperCase()] = cleanLoginFolio;
            }
            currentNextOrderCode = cleanLoginFolio || getEstimatedStoreFolio(sessionObj.erpStore, sessionObj.orderPrefix);
        }

        saveAdvisorSession(sessionObj);
        renderMyRecentQuotes([]);
        if (!sessionObj.isGuest) {
            applyAdvisorDefaultsToQuoteForm(true);
        }

        if (sessionObj.mustChangeKey) {
            showAuthBanner('authNewKeyMsg', '', 'err');
            const nk = document.getElementById('authNewKeyInput');
            const ck = document.getElementById('authConfirmKeyInput');
            if (nk) nk.value = '';
            if (ck) ck.value = '';
            setAuthStepVisible('newkey');
            const modal = document.getElementById('authModal');
            if (modal) modal.classList.add('open');
            if (nk) setTimeout(() => nk.focus(), 60);
            return;
        }

        pendingAuthContext = null;
        const modal = document.getElementById('authModal');
        if (modal) modal.classList.remove('open');
        renderAdvisorHeaderBar();
        refreshGuestReadOnlyUIState();
        if (!sessionObj.isGuest) {
            refreshMyLiveQuotesInfo();
        }

        if (!sessionObj.isGuest && pendingPdfDownloadRetryOpts) {
            const retryPdfOpts = pendingPdfDownloadRetryOpts;
            pendingPdfDownloadRetryOpts = null;
            window.downloadOriginalErpQuotePdf(retryPdfOpts);
            return;
        }

        if (!sessionObj.isGuest && pendingQuoteRetrySendToErp !== null) {
            const retrySendFlag = pendingQuoteRetrySendToErp;
            pendingQuoteRetrySendToErp = null;
            submitQuoteToSystem(retrySendFlag, true);
            return;
        }

        const cartModalEl = document.getElementById('cartModal');
        if (!cartModalEl || !cartModalEl.classList.contains('open')) {
            const searchInp = document.getElementById('invSearchInput');
            if (searchInp) setTimeout(() => searchInp.focus(), 60);
        }
    }

    let lastGuestHeartbeatMs = 0;
    async function verifyActiveGuestSessionLive(forceNow) {
        if (!activeAdvisorSession || !isGuestSession(activeAdvisorSession)) return;
        const now = Date.now();
        if (!forceNow && (now - lastGuestHeartbeatMs) < 45000) return;
        lastGuestHeartbeatMs = now;

        const email = String(activeAdvisorSession.correo || '').trim().toLowerCase();
        const deviceId = getOrCreateClientDeviceId();
        const deviceLabel = getClientDeviceLabel();
        const localKeyUpdates = loadUpdatedKeysMap();
        const hasPendingLocalNewKey = !!(localKeyUpdates[email] && localKeyUpdates[email].newKey);

        try {
            const hbRes = await callInvWebAppPost('inv_guest_heartbeat', {
                email: email,
                deviceId: deviceId,
                deviceLabel: deviceLabel
            }, 9000);

            if (hbRes && hbRes.ok) {
                if (hbRes.slotNumber) activeAdvisorSession.guestSlotNum = hbRes.slotNumber;
                if (hbRes.activePlaces) activeAdvisorSession.guestActivePlaces = hbRes.activePlaces;
                if (hbRes.mustChangeKey && !hasPendingLocalNewKey) {
                    activeAdvisorSession.mustChangeKey = true;
                    saveAdvisorSession(activeAdvisorSession);
                    openAuthModalForStartup();
                    return;
                }
                saveAdvisorSession(activeAdvisorSession);
                renderAdvisorHeaderBar();
                return;
            }
            if (hbRes && !hbRes.unavailable && !hbRes.needsRedeploy && (hbRes.authRequired || hbRes.limitReached || hbRes.revoked)) {
                const msg = hbRes.error || 'Tu acceso de Invitado alcanzó el límite de 2 lugares o fue actualizado.';
                window.logoutAdvisorSession();
                showAuthBanner('authLoginMsg', msg, 'err');
                return;
            }
        } catch (e) {}

        // Respaldo por lectura directa de la hoja INVITADOS (GViz)
        try {
            const allUsers = await fetchAllAdvisorRowsLiveGviz();
            const guestRow = allUsers.find(u => u && u.correo === email && u.isGuest);
            if (guestRow && guestRow.mustChangeKey && !hasPendingLocalNewKey) {
                activeAdvisorSession.mustChangeKey = true;
                saveAdvisorSession(activeAdvisorSession);
                openAuthModalForStartup();
            }
        } catch (eGviz) {}
    }

    window.submitAdvisorLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailEl = document.getElementById('authEmailInput');
        const keyEl = document.getElementById('authKeyInput');
        const btnEl = document.getElementById('authLoginSubmitBtn');

        const email = cleanStr(emailEl ? emailEl.value : '').toLowerCase();
        const inputKey = cleanStr(keyEl ? keyEl.value : '');
        if (!email) {
            showAuthBanner('authLoginMsg', 'Ingresa tu correo electrónico.', 'err');
            return;
        }

        const deviceId = getOrCreateClientDeviceId();
        const deviceLabel = getClientDeviceLabel();
        const preferredTab = ((pendingQuoteRetrySendToErp !== null || pendingPdfDownloadRetryOpts !== null) && activeAdvisorSession && activeAdvisorSession.correo === email)
            ? (activeAdvisorSession.sheetTab || '')
            : '';

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Verificando cuenta...';
        }
        showAuthBanner('authLoginMsg', '', 'err');

        try {
            // 1) Validación directa y emisión de token firmado vía Apps Script WebApp (con control de 2 lugares en INVITADOS)
            const cloudRes = await callInvWebAppPost('inv_login', {
                email: email,
                accessKey: inputKey,
                sheetTab: preferredTab,
                deviceId: deviceId,
                deviceLabel: deviceLabel
            }, 10000);

            if (cloudRes && cloudRes.ok) {
                if (cloudRes.nextFolioByStore) {
                    applyServerFolioMap(cloudRes.nextFolioByStore);
                }
                if (Array.isArray(cloudRes.stores) && cloudRes.stores.length > 0) {
                    const mergedStores = DEFAULT_ERP_STORES.slice();
                    cloudRes.stores.forEach(s => {
                        const cs = cleanStr(s);
                        if (cs && mergedStores.indexOf(cs) === -1) mergedStores.push(cs);
                    });
                    erpStoresCatalog = mergedStores;
                }
                if (Array.isArray(cloudRes.advisors) && cloudRes.advisors.length > 0) {
                    erpAdvisorsCatalog = cloudRes.advisors.map(a => ({
                        label: a.label,
                        branch: a.branch,
                        id: a.id || extractErpIdFromLabel(a.label),
                        tokens: normAdvisorTokens((a.label || '').split('|')[0])
                    }));
                }

                if (cloudRes.chooseBranch && Array.isArray(cloudRes.locations) && cloudRes.locations.length > 1) {
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: cloudRes.locations,
                        switchingFromActive: false
                    };
                    renderBranchChoicesStep(
                        cloudRes.locations,
                        'Hola ' + (cloudRes.locations[0].nombre || '') + '. Tu correo está registrado en varias hojas; selecciona en cuál ubicación estarás:'
                    );
                    return;
                }

                if (cloudRes.user) {
                    pendingAuthContext = {
                        email: email,
                        inputKey: inputKey,
                        locations: cloudRes.allLocationsForEmail || [cloudRes.user],
                        switchingFromActive: false
                    };
                    finalizeLocationChoice(
                        cloudRes.user,
                        cloudRes.allLocationsForEmail || [cloudRes.user],
                        cloudRes.nextOrderCode || ''
                    );
                    return;
                }
            } else if (cloudRes && !cloudRes.unavailable && !cloudRes.needsRedeploy && cloudRes.error) {
                // Si el WebApp aún no conoce la pestaña INVITADOS (implementación anterior), permitir verificar por lectura directa GViz antes de mostrar error de correo no registrado
                const isUnknownGuestInOldWebApp = /no est[aá] registrado/i.test(String(cloudRes.error || '')) || /Ingresa tu contrase/i.test(String(cloudRes.error || ''));
                if (!isUnknownGuestInOldWebApp || cloudRes.limitReached) {
                    showAuthBanner('authLoginMsg', cloudRes.error, 'err');
                    return;
                }
            }

            // 2) Respaldo de lectura directa en vivo desde las hojas de usuarios, INVITADOS y plantilla
            const allUsers = await fetchAllAdvisorRowsLiveGviz();
            if (!allUsers.length) {
                showAuthBanner('authLoginMsg', 'No fue posible consultar las hojas de usuarios. Verifica tu conexión a internet.', 'err');
                return;
            }

            const emailMatches = allUsers.filter(u => u.correo === email);
            if (!emailMatches.length) {
                showAuthBanner('authLoginMsg', 'El correo ingresado no aparece registrado en ninguna hoja de sucursal ni en la hoja INVITADOS.', 'err');
                return;
            }

            const validMatches = emailMatches.filter(u => {
                if (u.isGuest && u.noPasswordRequired) return true;
                if (!inputKey) return false;
                if (u.defKey) return keysMatchNormalized(inputKey, u.defKey);
                if (u.tempKey) return keysMatchNormalized(inputKey, u.tempKey);
                return false;
            });

            if (!validMatches.length) {
                if (!inputKey) {
                    showAuthBanner('authLoginMsg', 'Ingresa tu contraseña (temporal o personal) para acceder con tu cuenta.', 'err');
                } else {
                    showAuthBanner('authLoginMsg', 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.', 'err');
                }
                return;
            }

            // Validar límite estricto de 2 lugares por correo para cuentas de la hoja INVITADOS
            const checkedMatches = [];
            let guestLimitErr = '';
            for (let mIdx = 0; mIdx < validMatches.length; mIdx++) {
                const cand = validMatches[mIdx];
                if (cand.isGuest) {
                    const devRes = checkGuestDeviceLimitClient(cand, deviceId, deviceLabel);
                    if (!devRes.ok) {
                        guestLimitErr = devRes.error;
                        continue;
                    }
                    cand.guestSlotNum = devRes.slotNumber;
                    cand.guestActivePlaces = devRes.activePlaces;
                    cand.guestMaxPlaces = devRes.maxPlaces;
                }
                checkedMatches.push(cand);
            }

            if (!checkedMatches.length && guestLimitErr) {
                showAuthBanner('authLoginMsg', guestLimitErr, 'err');
                return;
            }

            const preparedLocs = checkedMatches.map(u => {
                const usedTemp = !u.defKey && ((!!u.tempKey && keysMatchNormalized(inputKey, u.tempKey)) || (u.isGuest && u.noPasswordRequired));
                return Object.assign({}, u, { mustChangeKey: usedTemp });
            });

            pendingAuthContext = {
                email: email,
                inputKey: inputKey,
                locations: preparedLocs,
                switchingFromActive: false
            };

            if (preparedLocs.length > 1 && !preferredTab) {
                renderBranchChoicesStep(
                    preparedLocs,
                    'Hola ' + (preparedLocs[0].nombre || '') + '. Tu correo aparece en varias hojas; selecciona en cuál ubicación estarás:'
                );
            } else {
                const picked = preferredTab
                    ? (preparedLocs.find(u => u.sheetTab === preferredTab) || preparedLocs[0])
                    : preparedLocs[0];
                finalizeLocationChoice(picked, preparedLocs, '');
            }
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Ingresar';
            }
        }
    };

    window.cancelBranchSelection = function () {
        if (pendingAuthContext && pendingAuthContext.switchingFromActive && activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
            pendingAuthContext = null;
            const modal = document.getElementById('authModal');
            if (modal) modal.classList.remove('open');
            return;
        }
        setAuthStepVisible('login');
    };

    window.openSwitchBranchSelector = function () {
        if (!activeAdvisorSession || !Array.isArray(activeAdvisorSession.allLocations) || activeAdvisorSession.allLocations.length <= 1) {
            return;
        }
        pendingAuthContext = {
            email: activeAdvisorSession.correo,
            inputKey: '',
            locations: activeAdvisorSession.allLocations,
            switchingFromActive: true
        };
        renderBranchChoicesStep(
            activeAdvisorSession.allLocations,
            'Selecciona la ubicación autorizada de tu correo en la que operarás:'
        );
    };

    window.submitNewPersonalKey = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (!activeAdvisorSession) return;

        const newKeyEl = document.getElementById('authNewKeyInput');
        const confKeyEl = document.getElementById('authConfirmKeyInput');
        const saveBtn = document.getElementById('authSaveNewKeyBtn');

        const newKey = cleanStr(newKeyEl ? newKeyEl.value : '');
        const confKey = cleanStr(confKeyEl ? confKeyEl.value : '');
        const prevTempKey = (pendingAuthContext && pendingAuthContext.inputKey) ? pendingAuthContext.inputKey : '';

        if (newKey.length < 4) {
            showAuthBanner('authNewKeyMsg', 'La nueva contraseña debe tener mínimo 4 caracteres.', 'err');
            return;
        }
        if (newKey !== confKey) {
            showAuthBanner('authNewKeyMsg', 'Las contraseñas no coinciden. Verifícalas por favor.', 'err');
            return;
        }
        if (prevTempKey && keysMatchNormalized(newKey, prevTempKey)) {
            showAuthBanner('authNewKeyMsg', 'Elige una contraseña nueva diferente a la contraseña temporal.', 'err');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando nueva contraseña...';
        }
        showAuthBanner('authNewKeyMsg', '', 'err');

        try {
            const res = await callInvWebAppPost('inv_update_key', {
                email: activeAdvisorSession.correo,
                currentKey: prevTempKey,
                newKey: newKey,
                sheetTab: activeAdvisorSession.sheetTab || '',
                authToken: activeAdvisorSession.authToken || ''
            }, 12000);

            if (res && res.ok) {
                if (res.authToken) {
                    activeAdvisorSession.authToken = res.authToken;
                }
                if (res.tokensByTab && Array.isArray(activeAdvisorSession.allLocations)) {
                    activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l =>
                        Object.assign({}, l, {
                            mustChangeKey: false,
                            authToken: res.tokensByTab[l.sheetTab] || l.authToken || res.authToken || ''
                        })
                    );
                }
            } else {
                // Guardar actualización pendiente para sincronizar apenas responda el WebApp y reemplazar la temporal de inmediato
                const mapObj = loadUpdatedKeysMap();
                mapObj[activeAdvisorSession.correo] = {
                    prevKey: prevTempKey,
                    newKey: newKey,
                    updatedAt: new Date().toISOString()
                };
                saveUpdatedKeysMap(mapObj);
            }

            activeAdvisorSession.mustChangeKey = false;
            if (Array.isArray(activeAdvisorSession.allLocations)) {
                activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(l =>
                    Object.assign({}, l, { mustChangeKey: false })
                );
            }
            saveAdvisorSession(activeAdvisorSession);
            pendingAuthContext = null;

            const keyInp = document.getElementById('authKeyInput');
            if (keyInp) keyInp.value = '';

            const modal = document.getElementById('authModal');
            if (modal) modal.classList.remove('open');
            renderAdvisorHeaderBar();
            refreshGuestReadOnlyUIState();
            if (!isGuestSession()) {
                populateQuoteAdvisorControls();
                refreshMyLiveQuotesInfo();
            } else {
                verifyActiveGuestSessionLive(true);
            }

            if (pendingQuoteRetrySendToErp !== null) {
                const retrySendFlag = pendingQuoteRetrySendToErp;
                pendingQuoteRetrySendToErp = null;
                submitQuoteToSystem(retrySendFlag, true);
                return;
            }

            const searchInp = document.getElementById('invSearchInput');
            if (searchInp) setTimeout(() => searchInp.focus(), 60);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar nueva contraseña y continuar';
            }
        }
    };

    window.logoutAdvisorSession = function () {
        saveAdvisorSession(null);
        pendingAuthContext = null;
        pendingQuoteRetrySendToErp = null;
        currentNextOrderCode = '';
        myRecentQuotesList = [];
        newlyGeneratedQuoteHighlightKey = '';
        lastSubmittedQuoteMeta = null;
        renderAdvisorHeaderBar();
        refreshGuestReadOnlyUIState();
        renderMyRecentQuotes([]);
        const keyInp = document.getElementById('authKeyInput');
        if (keyInp) keyInp.value = '';
        closeCartModal();
        openAuthModalForStartup();
    };

    // ------------------------------------------------------------------------
    // SECCIÓN DE PDFs DE COTIZACIÓN GENERADOS · VISIBILIDAD ESTRICTA POR ROL Y BODEGA ACTIVA
    // - Asesor: solo sus propios PDFs generados en su bodega/tienda activa.
    // - Gerente: solo sus propios PDFs y los de los asesores de su bodega/tienda activa.
    // - Administrador: PDFs generados en la tienda/bodega seleccionada en #quoteAdminStoreSelect.
    // ------------------------------------------------------------------------
    function hasGeneratedErpQuotePdfClient(q) {
        if (!q || typeof q !== 'object') return false;
        const qidNum = parseInt(String(q.quoteId || '').replace(/[^\d]/g, ''), 10) || 0;
        if (qidNum > 0) return true;
        const rawOrder = cleanStr(q.orderCode);
        const fol = cleanStr(q.folio) || ((rawOrder && !/^[A-Z]+-\d+$/i.test(rawOrder)) ? rawOrder : '');
        if (!fol || /^[A-Z]+-\d+$/i.test(fol) || /^(EN PROCESO|PENDIENTE)$/i.test(fol)) return false;
        if (/EN COLA|REVISION/i.test(String(q.status || ''))) return false;
        return true;
    }

    function filterAllowedGeneratedQuotesClient(rawList) {
        if (!activeAdvisorSession || isGuestSession() || !Array.isArray(rawList) || !rawList.length) return [];
        const sess = activeAdvisorSession;
        const isAdmin = !!sess.isAdmin;
        const isManager = !isAdmin && (!!sess.isManager || isManagerSessionUser(sess));
        const sessEmail = String(sess.correo || '').trim().toLowerCase();

        const activeStoreNorm = isAdmin
            ? normalizeQuoteErpStoreClient(quoteDraftMeta.erpStore || sess.erpStore, '')
            : normalizeQuoteErpStoreClient(sess.erpStore, sess.sheetTab);

        const allowedManagerSet = new Set();
        if (sessEmail) allowedManagerSet.add(sessEmail);
        if (isManager && Array.isArray(sess.branchAdvisorEmails)) {
            for (let i = 0; i < sess.branchAdvisorEmails.length; i++) {
                const em = String(sess.branchAdvisorEmails[i] || '').trim().toLowerCase();
                if (em) allowedManagerSet.add(em);
            }
        }

        const seenKeys = new Set();
        const out = [];
        for (let i = 0; i < rawList.length; i++) {
            const q = rawList[i];
            if (!hasGeneratedErpQuotePdfClient(q)) continue;

            const rowStoreNorm = normalizeQuoteErpStoreClient(q.erpStore, q.branchTab);
            const rowEmail = String(q.advisorEmail || '').trim().toLowerCase();

            if (isAdmin) {
                if (activeStoreNorm && rowStoreNorm !== activeStoreNorm) continue;
            } else {
                if (!activeStoreNorm || rowStoreNorm !== activeStoreNorm) continue;
                if (isManager) {
                    if (!rowEmail || !allowedManagerSet.has(rowEmail)) continue;
                } else {
                    if (!sessEmail || rowEmail !== sessEmail) continue;
                }
            }

            const qidClean = cleanStr(q.quoteId);
            const folClean = cleanStr(q.folio) || cleanStr(q.orderCode);
            const dedupeKey = (qidClean ? ('ID:' + qidClean) : '') || (folClean ? ('F:' + folClean) : '');
            if (dedupeKey && seenKeys.has(dedupeKey)) continue;
            if (dedupeKey) seenKeys.add(dedupeKey);
            out.push(q);
        }
        return out;
    }

    window.scrollToGeneratedQuotePdfs = function () {
        const sec = document.getElementById('quoteGeneratedPdfsSection');
        if (sec && !sec.classList.contains('hidden') && sec.scrollIntoView) {
            sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    function renderMyRecentQuotes(list) {
        const wrap = document.getElementById('quoteGeneratedPdfsSection');
        const listEl = document.getElementById('quoteGeneratedPdfsList');
        const titleEl = document.getElementById('quoteGeneratedPdfsTitle');
        const countBadge = document.getElementById('quoteGeneratedPdfsCountBadge');
        const hintEl = document.getElementById('quoteGeneratedPdfsRuleHint');
        const jumpBtn = document.getElementById('quoteJumpToPdfsBtn');
        const jumpCount = document.getElementById('quoteJumpToPdfsCount');
        if (!wrap || !listEl) return;

        if (Array.isArray(list)) {
            for (let i = 0; i < list.length; i++) {
                const qi = list[i] || {};
                if (qi.folio) registerObservedFolio(qi.folio, qi.erpStore);
                else if (qi.orderCode) registerObservedFolio(qi.orderCode, qi.erpStore);
            }
        }

        const filtered = filterAllowedGeneratedQuotesClient(list);
        if (!filtered.length || !activeAdvisorSession) {
            listEl.innerHTML = '';
            wrap.classList.add('hidden');
            if (jumpBtn) jumpBtn.classList.add('hidden');
            if (jumpCount) jumpCount.textContent = '0';
            return;
        }

        const sess = activeAdvisorSession;
        const isAdmin = !!sess.isAdmin;
        const isManager = !isAdmin && (!!sess.isManager || isManagerSessionUser(sess));
        const sessEmail = String(sess.correo || '').trim().toLowerCase();
        const activeStoreDisplay = isAdmin
            ? (cleanStr(quoteDraftMeta.erpStore) || cleanStr(sess.erpStore) || 'TIENDA ACTIVA')
            : (cleanStr(sess.erpStore) || cleanStr(sess.branchLabel) || cleanStr(sess.sheetTab) || 'MI BODEGA');

        if (titleEl) {
            if (isAdmin) {
                titleEl.textContent = '📄 PDFs de Cotización Generados · ' + activeStoreDisplay;
            } else if (isManager) {
                titleEl.textContent = '📄 PDFs de Cotización (Mi Bodega y Asesores) · ' + activeStoreDisplay;
            } else {
                titleEl.textContent = '📄 Mis PDFs de Cotización · ' + activeStoreDisplay;
            }
        }
        if (hintEl) {
            if (isAdmin) {
                hintEl.textContent = ' PDFs generados en la tienda/bodega activa seleccionada (' + activeStoreDisplay + ').';
            } else if (isManager) {
                hintEl.textContent = 'Gerente: muestra únicamente tus propios PDFs y los generados por los asesores de ' + activeStoreDisplay + '.';
            } else {
                hintEl.textContent = 'Asesor: muestra únicamente tus propios PDFs generados en tu bodega activa (' + activeStoreDisplay + ').';
            }
        }
        if (countBadge) countBadge.textContent = String(filtered.length);
        if (jumpCount) jumpCount.textContent = String(filtered.length);
        if (jumpBtn) jumpBtn.classList.remove('hidden');

        listEl.innerHTML = filtered.map(q => {
            const isProy = String(q.quoteType || '').toUpperCase() === 'PROYECTO' || /PROYECTO/i.test(String(q.erpStore || ''));
            const rawOrder = cleanStr(q.orderCode);
            const folioOfficial = cleanStr(q.folio) || ((rawOrder && !/^[A-Z]+-\d+$/i.test(rawOrder)) ? rawOrder : '');
            const qidVal = cleanStr(q.quoteId);
            const cleanFolio = folioOfficial || (qidVal ? ('ID-' + qidVal) : 'PDF');
            const storeTag = cleanStr(q.erpStore || q.branchTab) || activeStoreDisplay;
            const rowEmail = String(q.advisorEmail || '').trim().toLowerCase();
            const isOwnRow = !!(sessEmail && rowEmail === sessEmail);
            const advDisplayName = cleanStr(q.advisorName || q.erpAdvisor);
            const showAdvisorTag = (isAdmin || isManager) && advDisplayName;
            const cardKey = (qidVal ? ('ID:' + qidVal) : '') || (folioOfficial ? ('F:' + folioOfficial) : '');
            const isJustGenerated = !!(newlyGeneratedQuoteHighlightKey && cardKey === newlyGeneratedQuoteHighlightKey);

            return '<div class="rounded-lg border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-white transition" ' +
                'style="border-color:' + (isJustGenerated ? '#10B981' : '#E1DBC5') + ';' + (isJustGenerated ? ' box-shadow:0 0 0 1px rgba(16,185,129,0.25);' : '') + '">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (isProy ? '#252C32' : '#A38251') + '; color:#FFFFFF;">' +
                            escapeHtml(cleanFolio) +
                        '</span>' +
                        '<span class="text-[11px] font-extrabold uppercase" style="color:#252C32;">' + escapeHtml(storeTag) + '</span>' +
                        '<span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase" style="background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0;">' +
                            (isJustGenerated ? '✓ PDF RECIÉN GENERADO' : '✓ PDF LISTO') +
                        '</span>' +
                        (qidVal ? ('<span class="text-[10px] font-bold opacity-70" style="color:#252C32;">(ID ERP ' + escapeHtml(qidVal) + ')</span>') : '') +
                    '</div>' +
                    '<div class="text-[11px] font-semibold truncate mt-0.5" style="color:#252C32;">' +
                        escapeHtml(q.clientName || 'Prospecto') +
                        (showAdvisorTag
                            ? (' · <span class="font-extrabold" style="color:#A38251;">' +
                                (isManager && isOwnRow ? ('Mi cotización (' + escapeHtml(advDisplayName) + ')') : ('Asesor: ' + escapeHtml(advDisplayName))) +
                               '</span>')
                            : '') +
                        (q.skusSummary ? (' · ' + escapeHtml(q.skusSummary)) : '') +
                    '</div>' +
                '</div>' +
                '<div class="text-right shrink-0 ml-auto flex flex-col items-end gap-1">' +
                    '<div>' +
                        '<div class="text-xs font-black" style="color:#A38251;">' + escapeHtml(q.total || '') + '</div>' +
                        '<div class="text-[10px] font-semibold opacity-70" style="color:#252C32;">' + escapeHtml(q.createdAt || '') + '</div>' +
                    '</div>' +
                    '<button type="button" data-erp-pdf-btn="1" ' +
                        'data-q-id="' + escapeHtml(qidVal) + '" ' +
                        'data-q-folio="' + escapeHtml(folioOfficial) + '" ' +
                        'data-q-uid="' + escapeHtml(cleanStr(q.erpUserId)) + '" ' +
                        'data-q-client="' + escapeHtml(cleanStr(q.clientName)) + '" ' +
                        'data-q-store="' + escapeHtml(cleanStr(q.erpStore || q.branchTab)) + '" ' +
                        'class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition hover:opacity-90" ' +
                        'style="background:#252C32; color:#FFFFFF;" ' +
                        'title="Descargar PDF original generado por S Mueblería">' +
                        '⬇ Descargar PDF' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');

        listEl.querySelectorAll('button[data-erp-pdf-btn]').forEach(btn => {
            btn.addEventListener('click', function () {
                window.downloadOriginalErpQuotePdf({
                    quoteId: btn.getAttribute('data-q-id') || '',
                    folio: btn.getAttribute('data-q-folio') || '',
                    erpUserId: btn.getAttribute('data-q-uid') || '',
                    clientName: btn.getAttribute('data-q-client') || '',
                    erpStore: btn.getAttribute('data-q-store') || '',
                    autoTriggered: false,
                    triggerBtn: btn
                });
            });
        });

        wrap.classList.remove('hidden');
    }

    async function fetchQuotesLedgerGvizFallback() {
        if (!activeAdvisorSession) return [];
        if (!activeAdvisorSession.isAdmin && isManagerSessionUser(activeAdvisorSession) && !Array.isArray(activeAdvisorSession.branchAdvisorEmails)) {
            try {
                const liveUsers = await fetchAllAdvisorRowsLiveGviz();
                const mgrStoreNorm = normalizeQuoteErpStoreClient(activeAdvisorSession.erpStore, activeAdvisorSession.sheetTab);
                const allowed = [String(activeAdvisorSession.correo || '').trim().toLowerCase()];
                for (let uIdx = 0; uIdx < liveUsers.length; uIdx++) {
                    const u = liveUsers[uIdx];
                    if (!u || !u.correo || u.isAdmin || u.isManager) continue;
                    const uStoreNorm = normalizeQuoteErpStoreClient(u.erpStore, u.sheetTab);
                    const uEmail = String(u.correo).trim().toLowerCase();
                    if (uEmail && uStoreNorm === mgrStoreNorm && allowed.indexOf(uEmail) === -1) {
                        allowed.push(uEmail);
                    }
                }
                activeAdvisorSession.branchAdvisorEmails = allowed;
                saveAdvisorSession(activeAdvisorSession);
            } catch (e) {}
        }

        const rows = await fetchSheetCsvRows('COTIZACIONES_EN_VIVO');
        if (!rows || rows.length < 2) return [];
        const hdr = rows[0] || [];
        if (!/ORDEN|FOLIO/i.test(cleanStr(hdr[0]) + ' ' + cleanStr(hdr[1]))) return [];

        const rawItems = [];
        const minIdx = Math.max(1, rows.length - 400);
        for (let i = rows.length - 1; i >= minIdx; i--) {
            const r = rows[i] || [];
            const folioVal = cleanStr(r[1]) || cleanStr(r[0]);
            const storeVal = cleanStr(r[6]);
            if (folioVal) registerObservedFolio(folioVal, storeVal);
            rawItems.push({
                orderCode: cleanStr(r[0]),
                folio: cleanStr(r[1]),
                quoteId: cleanStr(r[2]),
                createdAt: cleanStr(r[3]),
                quoteType: cleanStr(r[4]),
                branchTab: cleanStr(r[5]),
                erpStore: storeVal,
                advisorEmail: cleanStr(r[7]).toLowerCase(),
                advisorName: cleanStr(r[8]),
                erpAdvisor: cleanStr(r[9]),
                erpUserId: cleanStr(r[10]),
                clientName: cleanStr(r[11]),
                itemsCount: cleanStr(r[16]),
                skusSummary: cleanStr(r[17]),
                total: cleanStr(r[21]),
                status: cleanStr(r[22])
            });
        }
        const limit = activeAdvisorSession.isAdmin ? 30 : (isManagerSessionUser(activeAdvisorSession) ? 25 : 15);
        return filterAllowedGeneratedQuotesClient(rawItems).slice(0, limit);
    }

    async function refreshMyLiveQuotesInfo() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey || isGuestSession()) {
            renderMyRecentQuotes([]);
            return;
        }
        const activeTargetStore = (activeAdvisorSession.isAdmin && quoteDraftMeta.erpStore)
            ? quoteDraftMeta.erpStore
            : activeAdvisorSession.erpStore;
        currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, activeAdvisorSession.orderPrefix);
        const nextBadge = document.getElementById('quoteNextOrderBadge');
        if (nextBadge) nextBadge.textContent = 'Folio S Mueblería: ' + currentNextOrderCode;

        if (activeAdvisorSession.authToken) {
            const res = await callInvWebAppPost('inv_my_quotes', {
                authToken: activeAdvisorSession.authToken,
                advisorEmail: activeAdvisorSession.correo,
                sheetTab: activeAdvisorSession.sheetTab || '',
                erpStore: activeTargetStore || ''
            }, 12000);

            if (res && res.ok) {
                if (res.nextFolioByStore) {
                    applyServerFolioMap(res.nextFolioByStore);
                }
                let sessionChanged = false;
                if (Array.isArray(res.branchAdvisorEmails) && res.branchAdvisorEmails.length > 0) {
                    activeAdvisorSession.branchAdvisorEmails = res.branchAdvisorEmails
                        .map(em => String(em || '').trim().toLowerCase())
                        .filter(Boolean);
                    if (Array.isArray(activeAdvisorSession.allLocations)) {
                        activeAdvisorSession.allLocations = activeAdvisorSession.allLocations.map(loc => {
                            if (loc && loc.sheetTab === activeAdvisorSession.sheetTab) {
                                return Object.assign({}, loc, { branchAdvisorEmails: activeAdvisorSession.branchAdvisorEmails });
                            }
                            return loc;
                        });
                    }
                    sessionChanged = true;
                }
                if (res.advisor) {
                    const updatedAdv = enrichAdvisorLocation(res.advisor);
                    if (updatedAdv.erpAdvisorLabel) activeAdvisorSession.erpAdvisorLabel = updatedAdv.erpAdvisorLabel;
                    if (updatedAdv.erpAdvisorId) activeAdvisorSession.erpAdvisorId = updatedAdv.erpAdvisorId;
                    if (updatedAdv.maxDiscountPct !== null && updatedAdv.maxDiscountPct !== undefined) {
                        activeAdvisorSession.maxDiscountPct = updatedAdv.maxDiscountPct;
                    }
                    if (updatedAdv.isAdmin) activeAdvisorSession.isAdmin = true;
                    if (updatedAdv.isManager) activeAdvisorSession.isManager = true;
                    if (Array.isArray(updatedAdv.branchAdvisorEmails) && updatedAdv.branchAdvisorEmails.length > 0) {
                        activeAdvisorSession.branchAdvisorEmails = updatedAdv.branchAdvisorEmails;
                    }
                    sessionChanged = true;
                }
                if (sessionChanged) {
                    saveAdvisorSession(activeAdvisorSession);
                    renderAdvisorHeaderBar();
                }
                if (res.nextOrderCode && !/^[A-Z]+-\d+$/i.test(String(res.nextOrderCode))) {
                    currentNextOrderCode = cleanStr(res.nextOrderCode);
                    if (activeTargetStore) {
                        liveNextFolioByStore[String(activeTargetStore).toUpperCase()] = currentNextOrderCode;
                    }
                } else {
                    currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, activeAdvisorSession.orderPrefix);
                }
                myRecentQuotesList = Array.isArray(res.recentQuotes) ? res.recentQuotes : [];
                populateQuoteAdvisorControls();
                renderMyRecentQuotes(myRecentQuotesList);
                return;
            }
        }

        // Respaldo directo por lectura de COTIZACIONES_EN_VIVO filtrada estrictamente por rol y bodega activa
        const gvizQuotes = await fetchQuotesLedgerGvizFallback();
        currentNextOrderCode = getEstimatedStoreFolio(activeTargetStore, activeAdvisorSession.orderPrefix);
        myRecentQuotesList = gvizQuotes;
        populateQuoteAdvisorControls();
        renderMyRecentQuotes(myRecentQuotesList);
    }

    function populateAdminSelectorsUI(sess) {
        const adminWrap = document.getElementById('quoteAdminSelectorsWrap');
        const lockedGrid = document.getElementById('quoteLockedInfoGrid');
        const storeSel = document.getElementById('quoteAdminStoreSelect');
        const advSel = document.getElementById('quoteAdminAdvisorSelect');
        if (!adminWrap || !storeSel || !advSel) return;

        if (!sess || !sess.isAdmin) {
            adminWrap.classList.add('hidden');
            if (lockedGrid) lockedGrid.classList.remove('hidden');
            return;
        }

        adminWrap.classList.remove('hidden');
        if (lockedGrid) lockedGrid.classList.add('hidden');

        const storesList = erpStoresCatalog.length > 0 ? erpStoresCatalog.slice() : DEFAULT_ERP_STORES.slice();
        DEFAULT_ERP_STORES.forEach(ds => {
            if (storesList.indexOf(ds) === -1) storesList.push(ds);
        });

        const targetStore = cleanStr(quoteDraftMeta.erpStore) || cleanStr(sess.erpStore) || 'CREATA PUERTO CANCUN';
        if (storesList.indexOf(targetStore) === -1) storesList.unshift(targetStore);

        storeSel.innerHTML = storesList.map(st => {
            const pfx = getStoreFolioPrefix(st, '');
            const est = getEstimatedStoreFolio(st, pfx);
            return '<option value="' + escapeHtml(st) + '">' + escapeHtml(st + ' · Folio ' + est) + '</option>';
        }).join('');
        storeSel.value = targetStore;
        quoteDraftMeta.erpStore = targetStore;

        const targetStoreUp = targetStore.toUpperCase();
        const sameStoreAdvs = [];
        const otherAdvs = [];
        for (let i = 0; i < erpAdvisorsCatalog.length; i++) {
            const a = erpAdvisorsCatalog[i];
            if (!a || !a.id) continue;
            if (String(a.branch || '').trim().toUpperCase() === targetStoreUp) {
                sameStoreAdvs.push(a);
            } else {
                otherAdvs.push(a);
            }
        }

        let optsHtml = '';
        if (sameStoreAdvs.length > 0) {
            optsHtml += '<optgroup label="Usuarios de ' + escapeHtml(targetStore) + '">';
            sameStoreAdvs.forEach(a => {
                optsHtml += '<option value="' + escapeHtml(a.id) + '" data-label="' + escapeHtml(a.label) + '" data-branch="' + escapeHtml(a.branch || '') + '">' + escapeHtml(a.label) + '</option>';
            });
            optsHtml += '</optgroup>';
        }
        if (otherAdvs.length > 0) {
            optsHtml += '<optgroup label="Otros Usuarios Activos S Mueblería">';
            otherAdvs.forEach(a => {
                optsHtml += '<option value="' + escapeHtml(a.id) + '" data-label="' + escapeHtml(a.label) + '" data-branch="' + escapeHtml(a.branch || '') + '">' + escapeHtml(a.label) + '</option>';
            });
            optsHtml += '</optgroup>';
        }
        if (!optsHtml && sess.erpAdvisorId) {
            const ownLbl = sess.erpAdvisorLabel || (sess.nombre + ' | ' + targetStore + ' [ID: ' + sess.erpAdvisorId + ']');
            optsHtml = '<option value="' + escapeHtml(sess.erpAdvisorId) + '" data-label="' + escapeHtml(ownLbl) + '" data-branch="' + escapeHtml(targetStore) + '">' + escapeHtml(ownLbl) + '</option>';
        }
        advSel.innerHTML = optsHtml;

        let desiredAdvId = cleanStr(quoteDraftMeta.erpAdvisorId);
        const hasDesiredInSameStore = desiredAdvId && sameStoreAdvs.some(a => String(a.id) === desiredAdvId);
        if (!hasDesiredInSameStore) {
            if (sess.erpAdvisorId && sameStoreAdvs.some(a => String(a.id) === String(sess.erpAdvisorId))) {
                desiredAdvId = String(sess.erpAdvisorId);
            } else if (sameStoreAdvs.length > 0) {
                desiredAdvId = String(sameStoreAdvs[0].id);
            } else if (sess.erpAdvisorId) {
                desiredAdvId = String(sess.erpAdvisorId);
            } else if (otherAdvs.length > 0) {
                desiredAdvId = String(otherAdvs[0].id);
            }
        }
        if (desiredAdvId) {
            advSel.value = desiredAdvId;
        }
        const selectedOpt = advSel.options[advSel.selectedIndex];
        if (selectedOpt) {
            quoteDraftMeta.erpAdvisorId = selectedOpt.value;
            quoteDraftMeta.erpAdvisorLabel = selectedOpt.getAttribute('data-label') || selectedOpt.textContent || '';
        }
    }

    window.onAdminStoreChange = function () {
        const storeSel = document.getElementById('quoteAdminStoreSelect');
        if (!storeSel || !activeAdvisorSession || !activeAdvisorSession.isAdmin) return;
        quoteDraftMeta.erpStore = storeSel.value;
        // Al cambiar de tienda/bodega, elegir automáticamente un usuario de esa tienda para que S Mueblería emita el folio de esa tienda
        quoteDraftMeta.erpAdvisorId = '';
        quoteDraftMeta.erpAdvisorLabel = '';
        lastSubmittedQuoteMeta = null;
        populateQuoteAdvisorControls();
        saveQuoteDraftMeta();
        renderMyRecentQuotes(myRecentQuotesList);
        refreshMyLiveQuotesInfo();
    };

    window.onAdminAdvisorChange = function () {
        const advSel = document.getElementById('quoteAdminAdvisorSelect');
        if (!advSel || !activeAdvisorSession || !activeAdvisorSession.isAdmin) return;
        const prevStore = cleanStr(quoteDraftMeta.erpStore);
        const opt = advSel.options[advSel.selectedIndex];
        if (opt) {
            quoteDraftMeta.erpAdvisorId = opt.value;
            quoteDraftMeta.erpAdvisorLabel = opt.getAttribute('data-label') || opt.textContent || '';
            const advBranch = cleanStr(opt.getAttribute('data-branch'));
            if (advBranch) {
                quoteDraftMeta.erpStore = advBranch;
            }
        }
        lastSubmittedQuoteMeta = null;
        saveQuoteDraftMeta();
        populateQuoteAdvisorControls();
        renderMyRecentQuotes(myRecentQuotesList);
        if (cleanStr(quoteDraftMeta.erpStore) !== prevStore) {
            refreshMyLiveQuotesInfo();
        }
    };

    function populateQuoteAdvisorControls(forceInputs) {
        const titleEl = document.getElementById('quoteModalTitle');
        const hdrInfo = document.getElementById('quoteHeaderAdvisorInfo');
        const originBadge = document.getElementById('quoteOriginTypeBadge');
        const nextOrderBadge = document.getElementById('quoteNextOrderBadge');
        const idBadge = document.getElementById('quoteErpUserIdBadge');
        const storeLbl = document.getElementById('quoteLockedStoreLabel');
        const storeTxt = document.getElementById('quoteLockedStoreText');
        const advTxt = document.getElementById('quoteLockedAdvisorText');
        const emailTxt = document.getElementById('quoteLockedEmailText');
        const switchLocBtn = document.getElementById('quoteSwitchLocationBtn');
        const clientNameLbl = document.getElementById('quoteClientNameLabel');

        const modeSel = document.getElementById('quoteClientModeSelect');
        const catSel = document.getElementById('quoteCategorySelect');
        const nameInp = document.getElementById('quoteClientNameInput');
        const phoneInp = document.getElementById('quoteClientPhoneInput');
        const emailInp = document.getElementById('quoteClientEmailInput');
        const dateInp = document.getElementById('quoteDeliveryDateInput');
        const notesInp = document.getElementById('quoteNotesInput');
        const extraInp = document.getElementById('quoteExtraDiscountInput');

        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        if (sess && !sess.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
            const matched = matchBestErpAdvisorClient(sess.nombre, sess.erpStore, erpAdvisorsCatalog);
            if (matched) {
                sess.erpAdvisorLabel = matched.label;
                sess.erpAdvisorId = matched.id;
                sess.erpAdvisorBranch = matched.branch;
                saveAdvisorSession(sess);
            }
        }

        populateAdminSelectorsUI(sess);

        const isAdmin = !!(sess && sess.isAdmin);
        const effectiveStore = isAdmin
            ? (cleanStr(quoteDraftMeta.erpStore) || (sess && sess.erpStore) || 'CEDIS')
            : ((sess && sess.erpStore) || 'CREATA PUERTO CANCUN');
        const isProy = /PROYECTO/i.test(effectiveStore) || (!isAdmin && !!(sess && sess.isProyecto));
        const prefix = getStoreFolioPrefix(effectiveStore, sess && sess.orderPrefix);
        const folioEstimate = getEstimatedStoreFolio(effectiveStore, prefix);
        currentNextOrderCode = folioEstimate;

        const effectiveAdvisorLabel = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorLabel) || (sess && sess.erpAdvisorLabel) || '')
            : ((sess && sess.erpAdvisorLabel) || '');
        const effectiveAdvisorId = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorId) || extractErpIdFromLabel(effectiveAdvisorLabel) || (sess && sess.erpAdvisorId) || '')
            : ((sess && sess.erpAdvisorId) || extractErpIdFromLabel(effectiveAdvisorLabel) || '');

        if (titleEl) {
            if (isAdmin) {
                titleEl.textContent = 'Cotización · Modo Administrador (Acceso Total)';
            } else {
                titleEl.textContent = isProy
                    ? 'Cotización de Proyecto'
                    : 'Cotización de Tienda / Bodega';
            }
        }

        if (hdrInfo) {
            if (sess) {
                hdrInfo.textContent = (sess.nombre || sess.correo) + ' · ' +
                    (isAdmin ? ('ADMIN · ' + effectiveStore) : (isProy ? 'MODALIDAD PROYECTO' : ('Tienda: ' + (sess.branchLabel || sess.sheetTab)))) +
                    ' · Folio S Mueblería: ' + folioEstimate;
            } else {
                hdrInfo.textContent = '';
            }
        }

        if (originBadge) {
            originBadge.textContent = isAdmin
                ? ('ADMIN · SERIE ' + prefix)
                : (isProy ? ('PROYECTO · SERIE ' + prefix) : ('TIENDA · SERIE ' + prefix));
            originBadge.style.background = (isProy || isAdmin) ? '#252C32' : '#A38251';
            originBadge.style.color = '#FFFFFF';
        }

        if (nextOrderBadge) {
            nextOrderBadge.textContent = 'Folio S Mueblería: ' + folioEstimate;
        }

        if (idBadge) {
            idBadge.textContent = effectiveAdvisorId ? ('ID S Mueblería: ' + effectiveAdvisorId) : 'Usuario Vinculado';
        }

        if (storeLbl) {
            storeLbl.textContent = isProy ? 'Área / Modalidad Proyecto' : 'Tienda / Bodega S Mueblería';
        }
        if (storeTxt) {
            storeTxt.textContent = sess ? (effectiveStore || '—') : 'Inicia sesión';
        }
        if (advTxt) {
            if (sess) {
                advTxt.textContent = effectiveAdvisorLabel ||
                    ((sess.nombre || sess.correo).toUpperCase() + ' | ' + effectiveStore);
            } else {
                advTxt.textContent = '—';
            }
        }
        if (emailTxt) {
            if (sess) {
                emailTxt.textContent = isAdmin
                    ? ('Sesión Administrador (' + sess.correo + ') · Viendo todas las tiendas · Emitiendo con serie ' + prefix + ' (' + effectiveStore + ')')
                    : ('Cuenta autenticada: ' + sess.correo + ' · Folio serie ' + prefix + ' (' + effectiveStore + ')');
            } else {
                emailTxt.textContent = '';
            }
        }
        if (switchLocBtn) {
            const multiLocs = (sess && Array.isArray(sess.allLocations)) ? sess.allLocations : [];
            switchLocBtn.classList.toggle('hidden', multiLocs.length <= 1);
        }

        if (clientNameLbl) {
            clientNameLbl.textContent = isProy ? 'Nombre del Proyecto / Cliente *' : 'Nombre del Cliente / Prospecto *';
        }
        if (nameInp) {
            nameInp.placeholder = isProy
                ? 'Ej. Proyecto Residencial / Nombre del cliente...'
                : 'Nombre completo del cliente o prospecto...';
        }

        syncDynamicClientModeOption();
        if (modeSel) modeSel.value = FIXED_QUOTE_CLIENT_MODE;
        if (catSel) catSel.value = FIXED_QUOTE_CATEGORY_LABEL;
        if (nameInp && (forceInputs || document.activeElement !== nameInp)) nameInp.value = quoteDraftMeta.clientName || '';
        if (phoneInp && (forceInputs || document.activeElement !== phoneInp)) phoneInp.value = quoteDraftMeta.clientPhone || '';
        if (emailInp && (forceInputs || document.activeElement !== emailInp)) emailInp.value = quoteDraftMeta.clientEmail || '';
        if (dateInp && (forceInputs || document.activeElement !== dateInp)) {
            dateInp.value = quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate();
        }
        if (notesInp && (forceInputs || document.activeElement !== notesInp)) notesInp.value = quoteDraftMeta.notes || '';
        if (extraInp && (forceInputs || document.activeElement !== extraInp)) {
            extraInp.value = String(Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0));
        }
        renderSelectedErpClientBadge();
        renderQuoteTotalsOnly();
    }

    window.onExtraDiscountChange = function () {
        saveQuoteDraftMeta();
        renderQuoteTotalsOnly();
    };

    // ------------------------------------------------------------------------
    // LÍMITE DE DESCUENTO (COLUMNA DESCUENTO EN HOJA DE USUARIOS / PUESTO)
    // ASESOR: 30% HASTA EL 30/11/2026 (24% A PARTIR DEL 01/12/2026) · GERENTE / SUBGERENTE / ADMINISTRADOR: 100%
    // ------------------------------------------------------------------------
    const ADVISOR_BASE_MAX_DISCOUNT_PCT = 24;
    const ADVISOR_PROMO_MAX_DISCOUNT_PCT = 30;
    const ADVISOR_PROMO_END_YMD = '2026-11-30'; // Vigencia inclusive hasta el 30 de noviembre de 2026 (America/Cancun)
    const MANAGER_MAX_DISCOUNT_PCT = 100;

    function getCancunTodayYmd() {
        try {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Cancun',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date());
            const y = (parts.find(p => p.type === 'year') || {}).value;
            const m = (parts.find(p => p.type === 'month') || {}).value;
            const d = (parts.find(p => p.type === 'day') || {}).value;
            if (y && m && d) return y + '-' + m + '-' + d;
        } catch (e) {}
        const now = new Date();
        return now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
    }

    function isAdvisorDiscount30Active() {
        return getCancunTodayYmd() <= ADVISOR_PROMO_END_YMD;
    }

    function getEffectiveAdvisorMaxDiscountPct() {
        return isAdvisorDiscount30Active() ? ADVISOR_PROMO_MAX_DISCOUNT_PCT : ADVISOR_BASE_MAX_DISCOUNT_PCT;
    }

    function getAdvisorRoleInfo() {
        const sess = activeAdvisorSession;
        if (isGuestSession()) {
            return {
                puesto: 'INVITADO (SOLO VER)',
                isAdmin: false,
                isManager: false,
                isGuest: true,
                maxPct: 0
            };
        }
        const puestoRaw = cleanStr(sess && sess.puesto);
        const p = String(puestoRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const isAdmin = !!(sess && sess.isAdmin) || /ADMINISTRADOR/.test(p);
        const isManager = isAdmin || /GERENTE|\bSUB/.test(p);
        const sheetPct = sess ? parseDiscountPctCell(sess.maxDiscountPct) : null;
        const promoActive = isAdvisorDiscount30Active();
        const advisorDefaultPct = getEffectiveAdvisorMaxDiscountPct();

        let maxPct;
        if (isAdmin) {
            maxPct = MANAGER_MAX_DISCOUNT_PCT;
        } else if (isManager) {
            maxPct = sheetPct !== null ? sheetPct : MANAGER_MAX_DISCOUNT_PCT;
        } else if (sheetPct !== null) {
            // Sincronizar automáticamente sesiones cacheadas en localStorage:
            // - Vigente hasta 30/11/2026: si la sesión guardó 24%, elevar a 30%
            // - A partir del 01/12/2026: si la sesión guardó 30%, regresar automáticamente a 24%
            if (promoActive && sheetPct === ADVISOR_BASE_MAX_DISCOUNT_PCT) {
                maxPct = ADVISOR_PROMO_MAX_DISCOUNT_PCT;
            } else if (!promoActive && sheetPct === ADVISOR_PROMO_MAX_DISCOUNT_PCT) {
                maxPct = ADVISOR_BASE_MAX_DISCOUNT_PCT;
            } else {
                maxPct = sheetPct;
            }
        } else {
            maxPct = advisorDefaultPct;
        }

        return {
            puesto: puestoRaw ? puestoRaw.toUpperCase() : (isAdmin ? 'ADMINISTRADOR GENERAL' : 'ASESOR'),
            isAdmin: isAdmin,
            isManager: isManager,
            maxPct: maxPct
        };
    }

    function getMaxDiscountPct() {
        return getAdvisorRoleInfo().maxPct;
    }

    // ------------------------------------------------------------------------
    // MÚLTIPLES COTIZACIONES ABIERTAS SIN GUARDAR (VIGENCIA MÁXIMA: 3 HORAS)
    // Y BLOQUEO / REINICIO AUTOMÁTICO AL TERMINAR Y CERRAR LA COTIZACIÓN
    // ------------------------------------------------------------------------
    const QUOTE_DRAFTS_KEY = 'creata_inv_quote_drafts_v1';
    const QUOTE_DRAFT_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas límite para cotizaciones sin guardar
    let quoteDrafts = [];
    let activeQuoteDraftId = '';
    let quoteDraftsTimer = null;

    function cloneCartMap(src) {
        const out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(src).forEach(k => {
            if (src[k] && typeof src[k] === 'object') {
                out[k] = Object.assign({}, src[k]);
            }
        });
        return out;
    }

    function isDraftUntouchedBlank(d) {
        if (!d || d.completed) return false;
        const hasItems = d.cart && Object.keys(d.cart).length > 0;
        const m = d.meta || {};
        const hasClient = !!(cleanStr(m.clientName) || cleanStr(m.clientPhone) || cleanStr(m.clientEmail) || cleanStr(m.notes) || Number(m.erpClientId) > 0 || Number(m.erpLeadId) > 0);
        return !hasItems && !hasClient;
    }

    function buildFreshDraftObject(initialCart, initialMeta) {
        const now = Date.now();
        return {
            id: 'qd_' + now + '_' + Math.random().toString(36).slice(2, 7),
            createdAt: now,
            updatedAt: now,
            expiresAt: now + QUOTE_DRAFT_TTL_MS,
            completed: false,
            submittedMeta: null,
            cart: cloneCartMap(initialCart || {}),
            meta: Object.assign(createBlankQuoteMeta(), initialMeta || {}, {
                clientMode: FIXED_QUOTE_CLIENT_MODE,
                categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
            })
        };
    }

    function getActiveQuoteDraft() {
        for (let i = 0; i < quoteDrafts.length; i++) {
            if (quoteDrafts[i].id === activeQuoteDraftId) return quoteDrafts[i];
        }
        return quoteDrafts[0] || null;
    }

    function isActiveQuoteCompleted() {
        const d = getActiveQuoteDraft();
        return !!(d && d.completed);
    }

    function persistQuoteDraftsToStorage() {
        try {
            localStorage.setItem(QUOTE_DRAFTS_KEY, JSON.stringify({
                activeId: activeQuoteDraftId,
                drafts: quoteDrafts
            }));
        } catch (e) {}
    }

    function syncActiveQuoteDraftStorage() {
        let d = getActiveQuoteDraft();
        if (!d) {
            d = buildFreshDraftObject(cart, quoteDraftMeta);
            quoteDrafts.push(d);
            activeQuoteDraftId = d.id;
        } else {
            const wasBlank = isDraftUntouchedBlank(d);
            d.cart = cloneCartMap(cart);
            d.meta = Object.assign(createBlankQuoteMeta(), quoteDraftMeta, {
                clientMode: FIXED_QUOTE_CLIENT_MODE,
                categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
            });
            d.submittedMeta = lastSubmittedQuoteMeta ? Object.assign({}, lastSubmittedQuoteMeta) : null;
            d.updatedAt = Date.now();
            // Si el borrador estaba completamente en blanco y apenas se empieza a usar, iniciar su ventana de 3 horas desde este momento
            if (wasBlank && !isDraftUntouchedBlank(d)) {
                d.createdAt = d.updatedAt;
                d.expiresAt = d.updatedAt + QUOTE_DRAFT_TTL_MS;
            }
        }
        persistQuoteDraftsToStorage();
        renderQuoteDraftsBar();
    }

    function loadActiveDraftIntoMemory(d) {
        if (!d) return;
        activeQuoteDraftId = d.id;
        cart = cloneCartMap(d.cart || {});
        quoteDraftMeta = Object.assign(createBlankQuoteMeta(), d.meta || {}, {
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
        });
        if (activeAdvisorSession && !activeAdvisorSession.isAdmin) {
            quoteDraftMeta.erpStore = activeAdvisorSession.erpStore || quoteDraftMeta.erpStore || '';
            quoteDraftMeta.erpAdvisorLabel = activeAdvisorSession.erpAdvisorLabel || quoteDraftMeta.erpAdvisorLabel || '';
            quoteDraftMeta.erpAdvisorId = activeAdvisorSession.erpAdvisorId || quoteDraftMeta.erpAdvisorId || '';
        }
        lastSubmittedQuoteMeta = d.submittedMeta ? Object.assign({}, d.submittedMeta) : null;
        try {
            if (d.completed) {
                localStorage.removeItem(CART_KEY);
                localStorage.removeItem(QUOTE_META_STORAGE);
            } else {
                localStorage.setItem(CART_KEY, JSON.stringify(cart));
                localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
            }
        } catch (e) {}
        persistQuoteDraftsToStorage();
        updateCartBadge();
    }

    function syncAllCartControlsUI() {
        const seen = new Set();
        document.querySelectorAll('[data-sku-ctrl]').forEach(el => {
            const k = el.getAttribute('data-sku-ctrl');
            if (k && !seen.has(k)) {
                seen.add(k);
                syncSkuCartControls(k);
            }
        });
        Object.keys(cart).forEach(k => {
            if (!seen.has(k)) syncSkuCartControls(k);
        });
        if (currentDetailItem && currentDetailItem.s) {
            syncSkuCartControls(String(currentDetailItem.s).toUpperCase());
        }
        updateCartBadge();
    }

    function formatRemainingDraftTime(expiresAt) {
        const remMs = Math.max(0, (Number(expiresAt) || 0) - Date.now());
        const totalMin = Math.ceil(remMs / 60000);
        if (totalMin <= 0) return '0m';
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
        return m + 'm';
    }

    function pruneExpiredQuoteDrafts(refreshUiIfChanged) {
        const now = Date.now();
        const beforeIds = quoteDrafts.map(d => d.id).join(',');
        quoteDrafts = quoteDrafts.filter(d => {
            if (!d || typeof d !== 'object') return false;
            if (d.completed) return true;
            return (Number(d.expiresAt) || 0) > now;
        });
        if (quoteDrafts.length === 0) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            loadActiveDraftIntoMemory(fresh);
        } else if (!quoteDrafts.some(d => d.id === activeQuoteDraftId)) {
            loadActiveDraftIntoMemory(quoteDrafts[0]);
        }
        const afterIds = quoteDrafts.map(d => d.id).join(',');
        if (beforeIds !== afterIds) {
            persistQuoteDraftsToStorage();
            syncAllCartControlsUI();
            if (refreshUiIfChanged) {
                populateQuoteAdvisorControls(true);
                renderCartItems();
                applyQuoteCompletedLockUI();
            }
        }
        renderQuoteDraftsBar();
    }

    function initQuoteDraftsSystem() {
        let loaded = null;
        try {
            loaded = JSON.parse(localStorage.getItem(QUOTE_DRAFTS_KEY) || 'null');
        } catch (e) {}

        const now = Date.now();
        if (loaded && Array.isArray(loaded.drafts) && loaded.drafts.length > 0) {
            // Al abrir / recargar la pestaña del navegador, las cotizaciones ya terminadas quedan descartadas automáticamente
            quoteDrafts = loaded.drafts
                .filter(d => d && !d.completed && (Number(d.expiresAt) || 0) > now)
                .map(d => {
                    d.meta = Object.assign(createBlankQuoteMeta(), d.meta || {}, {
                        clientMode: FIXED_QUOTE_CLIENT_MODE,
                        categoryLabel: FIXED_QUOTE_CATEGORY_LABEL
                    });
                    return d;
                });
            activeQuoteDraftId = String(loaded.activeId || '');
        } else {
            // Migrar carrito / metadatos previos en caso de existir
            const legacyCart = loadCart();
            const legacyMeta = loadQuoteDraftMeta();
            const initial = buildFreshDraftObject(legacyCart, legacyMeta);
            quoteDrafts = [initial];
            activeQuoteDraftId = initial.id;
        }

        if (quoteDrafts.length === 0) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts = [fresh];
            activeQuoteDraftId = fresh.id;
        }
        const chosen = getActiveQuoteDraft() || quoteDrafts[0];
        loadActiveDraftIntoMemory(chosen);

        if (quoteDraftsTimer) clearInterval(quoteDraftsTimer);
        quoteDraftsTimer = setInterval(function () {
            pruneExpiredQuoteDrafts(true);
        }, 15000);
    }

    function purgeCompletedQuoteDraftsOnExit() {
        const hadCompleted = quoteDrafts.some(d => d && d.completed);
        if (!hadCompleted) return;
        const now = Date.now();
        quoteDrafts = quoteDrafts.filter(d => d && !d.completed && (Number(d.expiresAt) || 0) > now);
        if (!quoteDrafts.some(d => isDraftUntouchedBlank(d))) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            activeQuoteDraftId = fresh.id;
        } else {
            const blank = quoteDrafts.find(d => isDraftUntouchedBlank(d)) || quoteDrafts[0];
            activeQuoteDraftId = blank.id;
        }
        const activeNow = getActiveQuoteDraft();
        try {
            localStorage.setItem(CART_KEY, JSON.stringify((activeNow && activeNow.cart) || {}));
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify((activeNow && activeNow.meta) || createBlankQuoteMeta()));
        } catch (e) {}
        persistQuoteDraftsToStorage();
    }

    function purgeCompletedAndActivateBlankDraft() {
        const prevAdminStore = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpStore) : '';
        const prevAdminAdvId = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpAdvisorId) : '';
        const prevAdminAdvLbl = (activeAdvisorSession && activeAdvisorSession.isAdmin) ? cleanStr(quoteDraftMeta.erpAdvisorLabel) : '';
        const now = Date.now();
        quoteDrafts = quoteDrafts.filter(d => d && !d.completed && (Number(d.expiresAt) || 0) > now);
        let nextBlank = quoteDrafts.find(d => isDraftUntouchedBlank(d));
        if (!nextBlank) {
            const blankMeta = createBlankQuoteMeta();
            if (prevAdminStore) {
                blankMeta.erpStore = prevAdminStore;
                blankMeta.erpAdvisorId = prevAdminAdvId;
                blankMeta.erpAdvisorLabel = prevAdminAdvLbl;
            }
            nextBlank = buildFreshDraftObject({}, blankMeta);
            quoteDrafts.push(nextBlank);
        } else if (prevAdminStore && nextBlank.meta && !cleanStr(nextBlank.meta.erpStore)) {
            nextBlank.meta.erpStore = prevAdminStore;
            nextBlank.meta.erpAdvisorId = prevAdminAdvId;
            nextBlank.meta.erpAdvisorLabel = prevAdminAdvLbl;
        }
        loadActiveDraftIntoMemory(nextBlank);
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        toggleNewErpClientForm(false);
        const resEl = document.getElementById('quoteErpClientResults');
        if (resEl) {
            resEl.innerHTML = '';
            resEl.classList.add('hidden');
        }
        const searchEl = document.getElementById('quoteErpClientSearchInput');
        if (searchEl) searchEl.value = '';
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
        renderMyRecentQuotes(myRecentQuotesList);
    }

    function markActiveQuoteCompleted(submittedMetaObj) {
        const d = getActiveQuoteDraft();
        if (d) {
            d.completed = true;
            d.submittedMeta = submittedMetaObj ? Object.assign({}, submittedMetaObj) : null;
            d.updatedAt = Date.now();
        }
        try {
            localStorage.removeItem(CART_KEY);
            localStorage.removeItem(QUOTE_META_STORAGE);
        } catch (e) {}
        persistQuoteDraftsToStorage();
        syncAllCartControlsUI();
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    }

    function applyQuoteCompletedLockUI() {
        const locked = isActiveQuoteCompleted();
        const banner = document.getElementById('quoteCompletedBanner');
        if (banner) banner.classList.toggle('hidden', !locked);

        const sec2 = document.getElementById('quoteSection2Fieldset');
        if (sec2) {
            sec2.querySelectorAll('input, select, textarea, button').forEach(el => {
                el.disabled = locked;
            });
            sec2.style.opacity = locked ? '0.68' : '1';
        }
        const extraInp = document.getElementById('quoteExtraDiscountInput');
        if (extraInp) extraInp.disabled = locked;
        const adminStoreSel = document.getElementById('quoteAdminStoreSelect');
        const adminAdvSel = document.getElementById('quoteAdminAdvisorSelect');
        if (adminStoreSel) adminStoreSel.disabled = locked;
        if (adminAdvSel) adminAdvSel.disabled = locked;

        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        const btnClear = document.querySelector('#cartModal button[onclick="clearCart()"]');
        if (btnRev) {
            btnRev.disabled = locked || quoteSubmitInFlight;
            btnRev.style.opacity = locked ? '0.45' : '1';
        }
        if (btnSend) {
            btnSend.disabled = locked || quoteSubmitInFlight;
            btnSend.style.opacity = locked ? '0.45' : '1';
        }
        if (btnClear) {
            btnClear.disabled = locked;
            btnClear.style.opacity = locked ? '0.45' : '1';
        }
    }

    function renderQuoteDraftsBar() {
        const listEl = document.getElementById('quoteDraftsTabsList');
        if (!listEl) return;

        const html = quoteDrafts.map((d, idx) => {
            const isAct = d.id === activeQuoteDraftId;
            const qtySum = Object.values(d.cart || {}).reduce((s, r) => s + (Number(r && r.qty) || 0), 0);
            const cliShort = cleanStr(d.meta && d.meta.clientName);
            const titleTxt = cliShort
                ? (cliShort.length > 18 ? (cliShort.slice(0, 18) + '…') : cliShort)
                : ('Cotización ' + (idx + 1));
            const statusPart = d.completed
                ? ('✓ Emitida' + (d.submittedMeta && d.submittedMeta.folio ? (' · ' + d.submittedMeta.folio) : ''))
                : ((qtySum > 0 ? (qtySum + ' pz · ') : '') + '⏱ ' + formatRemainingDraftTime(d.expiresAt));

            const bg = isAct ? '#252C32' : '#FFFFFF';
            const fg = isAct ? '#FFFFFF' : '#252C32';
            const brd = isAct ? '#252C32' : (d.completed ? '#A7F3D0' : '#E1DBC5');
            const subColor = isAct ? '#E1DBC5' : '#A38251';
            const canDiscard = quoteDrafts.length > 1 || !isDraftUntouchedBlank(d) || d.completed;

            return '<div class="inline-flex items-center rounded-full border text-[11px] font-bold transition overflow-hidden" ' +
                'style="background:' + bg + '; color:' + fg + '; border-color:' + brd + ';">' +
                '<button type="button" onclick="switchQuoteDraft(\'' + escapeHtml(d.id) + '\')" class="px-2.5 py-1 flex items-center gap-1.5 text-left">' +
                    '<span class="font-extrabold uppercase truncate max-w-[130px]">' + escapeHtml(titleTxt) + '</span>' +
                    '<span class="text-[10px] font-bold" style="color:' + subColor + ';">(' + escapeHtml(statusPart) + ')</span>' +
                '</button>' +
                (canDiscard
                    ? ('<button type="button" title="Cerrar / descartar esta cotización" onclick="discardQuoteDraft(\'' + escapeHtml(d.id) + '\')" ' +
                        'class="pr-2.5 pl-1 py-1 text-[11px] font-extrabold opacity-75 hover:opacity-100">✕</button>')
                    : '') +
            '</div>';
        }).join('');

        listEl.innerHTML = html;
    }

    window.createNewQuoteDraft = function (switchNow) {
        pruneExpiredQuoteDrafts(false);
        // Si la cotización activa ya estaba terminada, descartarla de inmediato al abrir la nueva
        if (isActiveQuoteCompleted()) {
            quoteDrafts = quoteDrafts.filter(d => d && !d.completed);
        } else {
            syncActiveQuoteDraftStorage();
        }
        const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
        quoteDrafts.push(fresh);
        if (switchNow !== false) {
            loadActiveDraftIntoMemory(fresh);
            syncAllCartControlsUI();
            renderQuoteStatusBanner('', '');
            toggleNewErpClientForm(false);
            populateQuoteAdvisorControls(true);
            renderCartItems();
            applyQuoteCompletedLockUI();
        } else {
            persistQuoteDraftsToStorage();
        }
        renderQuoteDraftsBar();
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !nameInp.disabled) setTimeout(() => nameInp.focus(), 40);
    };

    window.switchQuoteDraft = function (draftId) {
        if (!draftId || draftId === activeQuoteDraftId) return;
        pruneExpiredQuoteDrafts(false);
        const target = quoteDrafts.find(d => d.id === draftId);
        if (!target) return;
        if (!isActiveQuoteCompleted()) {
            syncActiveQuoteDraftStorage();
        }
        loadActiveDraftIntoMemory(target);
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        toggleNewErpClientForm(false);
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    };

    window.discardQuoteDraft = function (draftId) {
        const target = quoteDrafts.find(d => d.id === draftId);
        if (!target) return;
        quoteDrafts = quoteDrafts.filter(d => d.id !== draftId);
        if (quoteDrafts.length === 0) {
            const fresh = buildFreshDraftObject({}, createBlankQuoteMeta());
            quoteDrafts.push(fresh);
            loadActiveDraftIntoMemory(fresh);
        } else if (activeQuoteDraftId === draftId) {
            loadActiveDraftIntoMemory(quoteDrafts[quoteDrafts.length - 1]);
        } else {
            persistQuoteDraftsToStorage();
        }
        syncAllCartControlsUI();
        renderQuoteStatusBanner('', '');
        populateQuoteAdvisorControls(true);
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderQuoteDraftsBar();
    };

    window.startFreshQuoteAfterCompleted = function () {
        purgeCompletedAndActivateBlankDraft();
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !nameInp.disabled) setTimeout(() => nameInp.focus(), 40);
    };

    // ------------------------------------------------------------------------
    // BUSCADOR Y ALTA DE CLIENTES REGISTRADOS
    // ------------------------------------------------------------------------
    let lastErpClientSearchResults = [];
    let erpClientSearchInFlight = false;
    let erpClientCreateInFlight = false;

    function syncDynamicClientModeOption() {
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        const sel = document.getElementById('quoteClientModeSelect');
        if (sel) sel.value = FIXED_QUOTE_CLIENT_MODE;
        const catSel = document.getElementById('quoteCategorySelect');
        if (catSel) catSel.value = FIXED_QUOTE_CATEGORY_LABEL;
    }

    function renderSelectedErpClientBadge() {
        const badge = document.getElementById('quoteSelectedErpClientBadge');
        if (!badge) return;
        const cid = Number(quoteDraftMeta.erpClientId) || 0;
        const lid = Number(quoteDraftMeta.erpLeadId) || 0;
        if (cid <= 0 && lid <= 0) {
            badge.innerHTML = '';
            badge.classList.add('hidden');
            return;
        }
        const nm = cleanStr(quoteDraftMeta.clientName) || 'Cliente seleccionado';
        const tag = cid > 0
            ? ('Cliente S Mueblería #' + cid + (quoteDraftMeta.erpNoCliente ? (' · No. ' + quoteDraftMeta.erpNoCliente) : ''))
            : ('Prospecto S Mueblería #' + lid);
        const extraInfo = [cleanStr(quoteDraftMeta.clientPhone), cleanStr(quoteDraftMeta.clientEmail), cleanStr(quoteDraftMeta.erpClientAddress)]
            .filter(Boolean)
            .join(' · ');
        badge.innerHTML =
            '<div class="min-w-0">' +
                '<div class="font-extrabold uppercase truncate">✓ ' + escapeHtml(tag) + ': ' + escapeHtml(nm) + '</div>' +
                (extraInfo ? ('<div class="text-[11px] font-semibold opacity-85 truncate">' + escapeHtml(extraInfo) + '</div>') : '') +
            '</div>' +
            '<button type="button" onclick="clearSelectedErpClient()" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border shrink-0" style="border-color:#065F46; background:#FFFFFF; color:#065F46;">Desvincular</button>';
        badge.classList.remove('hidden');
    }

    window.onQuoteClientModeSelectChange = function () {
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        saveQuoteDraftMeta();
    };

    window.clearSelectedErpClient = function () {
        if (isActiveQuoteCompleted()) return;
        quoteDraftMeta.erpClientId = 0;
        quoteDraftMeta.erpLeadId = 0;
        quoteDraftMeta.erpNoCliente = '';
        quoteDraftMeta.erpClientAddress = '';
        quoteDraftMeta.clientMode = FIXED_QUOTE_CLIENT_MODE;
        quoteDraftMeta.categoryLabel = FIXED_QUOTE_CATEGORY_LABEL;
        const sel = document.getElementById('quoteClientModeSelect');
        if (sel) sel.value = FIXED_QUOTE_CLIENT_MODE;
        renderSelectedErpClientBadge();
        saveQuoteDraftMeta();
    };

    function selectErpClientObject(cli) {
        if (!cli || typeof cli !== 'object') return;
        const cid = parseInt(cli.idCliente, 10) || 0;
        const lid = cid > 0 ? 0 : (parseInt(cli.idLead, 10) || 0);
        const fullName = cleanStr(cli.nombre || cli.nombreCompleto);
        const phone = cleanStr(cli.celular || cli.telefono);
        const email = cleanStr(cli.correo);
        const addr = cleanStr(cli.direccion);

        quoteDraftMeta.erpClientId = cid;
        quoteDraftMeta.erpLeadId = lid;
        quoteDraftMeta.erpNoCliente = cleanStr(cli.noCliente);
        quoteDraftMeta.erpClientAddress = addr;
        if (fullName) quoteDraftMeta.clientName = fullName;
        if (phone) quoteDraftMeta.clientPhone = phone;
        if (email) quoteDraftMeta.clientEmail = email;

        const nameInp = document.getElementById('quoteClientNameInput');
        const phoneInp = document.getElementById('quoteClientPhoneInput');
        const emailInp = document.getElementById('quoteClientEmailInput');
        if (nameInp && fullName) nameInp.value = fullName;
        if (phoneInp && phone) phoneInp.value = phone;
        if (emailInp && email) emailInp.value = email;

        syncDynamicClientModeOption();
        renderSelectedErpClientBadge();
        const resEl = document.getElementById('quoteErpClientResults');
        if (resEl) {
            resEl.innerHTML = '';
            resEl.classList.add('hidden');
        }
        saveQuoteDraftMeta();
    }

    window.selectErpClientFromSearch = function (idx) {
        if (isActiveQuoteCompleted()) return;
        const cli = lastErpClientSearchResults[idx];
        if (cli) selectErpClientObject(cli);
    };

    window.searchErpClientsLive = async function () {
        if (isGuestSession() || erpClientSearchInFlight || isActiveQuoteCompleted()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        const inp = document.getElementById('quoteErpClientSearchInput');
        const btn = document.getElementById('btnSearchErpClients');
        const resEl = document.getElementById('quoteErpClientResults');
        if (!resEl) return;

        const q = cleanStr(inp ? inp.value : '');
        if (q.length < 2) {
            resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-xs font-bold sem-yellow">Escribe al menos 2 letras o dígitos (nombre, teléfono, correo o No. de cliente) para buscar en S Mueblería.</div>';
            resEl.classList.remove('hidden');
            if (inp) inp.focus();
            return;
        }

        erpClientSearchInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Buscando...';
        }
        resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-xs font-semibold bg-white" style="border-color:#E1DBC5; color:#252C32;">Consultando base de datos de clientes...</div>';
        resEl.classList.remove('hidden');

        try {
            const res = await callInvWebAppPost('inv_search_erp_clients', {
                authToken: activeAdvisorSession.authToken || '',
                sheetTab: activeAdvisorSession.sheetTab || '',
                advisorEmail: activeAdvisorSession.correo || '',
                query: q
            }, 25000);

            if (res && res.authRequired) {
                resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-xs font-bold sem-yellow">Confirma tu contraseña personal para consultar clientes en S Mueblería.</div>';
                promptSessionReauth(res.error || 'Confirma tu contraseña para buscar clientes en S Mueblería.', null);
                return;
            }

            if (!res || res.needsRedeploy || res.unavailable) {
                resEl.innerHTML =
                    '<div class="rounded-lg border px-3 py-2 text-xs font-bold sem-yellow">' +
                    'Para activar la búsqueda directa en la base de datos de S Mueblería, publica una <strong>Nueva versión</strong> de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones</em>.' +
                    '</div>';
                return;
            }

            if (!res.ok) {
                resEl.innerHTML = '<div class="rounded-lg border px-3 py-2 text-xs font-bold sem-red">' + escapeHtml(res.error || 'No se pudo realizar la búsqueda en S Mueblería.') + '</div>';
                return;
            }

            lastErpClientSearchResults = Array.isArray(res.clients) ? res.clients : [];
            if (!lastErpClientSearchResults.length) {
                resEl.innerHTML =
                    '<div class="rounded-lg border px-3 py-2.5 text-xs font-semibold bg-white flex flex-wrap items-center justify-between gap-2" style="border-color:#E1DBC5; color:#252C32;">' +
                        '<span>Sin coincidencias en S Mueblería para <strong>' + escapeHtml(q) + '</strong>.</span>' +
                        '<button type="button" onclick="toggleNewErpClientForm(true)" class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase" style="background:#A38251; color:#FFFFFF;">+ Dar de alta cliente</button>' +
                    '</div>';
                return;
            }

            resEl.innerHTML = lastErpClientSearchResults.map((c, idx) => {
                const isCli = Number(c.idCliente) > 0;
                const badgeTxt = isCli
                    ? ('CLIENTE #' + c.idCliente + (c.noCliente ? (' · No. ' + c.noCliente) : ''))
                    : ('PROSPECTO #' + c.idLead);
                const subParts = [cleanStr(c.telefono || c.celular), cleanStr(c.correo), cleanStr(c.direccion)].filter(Boolean);
                return '<div class="rounded-lg border px-3 py-2 bg-white flex items-center justify-between gap-2 hover:shadow-sm transition" style="border-color:#E1DBC5;">' +
                    '<div class="min-w-0">' +
                        '<div class="flex flex-wrap items-center gap-1.5">' +
                            '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (isCli ? '#252C32' : '#A38251') + '; color:#FFFFFF;">' + escapeHtml(badgeTxt) + '</span>' +
                            '<span class="text-xs font-extrabold uppercase truncate" style="color:#252C32;">' + escapeHtml(c.nombre || '') + '</span>' +
                        '</div>' +
                        (subParts.length ? ('<div class="text-[11px] font-semibold opacity-80 truncate mt-0.5" style="color:#252C32;">' + escapeHtml(subParts.join(' · ')) + '</div>') : '') +
                    '</div>' +
                    '<button type="button" onclick="selectErpClientFromSearch(' + idx + ')" class="px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase shrink-0" style="background:#A38251; color:#FFFFFF;">Elegir</button>' +
                '</div>';
            }).join('');
        } finally {
            erpClientSearchInFlight = false;
            if (btn) {
                btn.disabled = isActiveQuoteCompleted();
                btn.textContent = 'Buscar cliente';
            }
        }
    };

    window.toggleNewErpClientForm = function (forceState) {
        const panel = document.getElementById('quoteNewErpClientPanel');
        const msg = document.getElementById('newErpClientMsg');
        if (!panel) return;
        const nextOpen = (typeof forceState === 'boolean') ? forceState : panel.classList.contains('hidden');
        if (nextOpen && isActiveQuoteCompleted()) return;
        panel.classList.toggle('hidden', !nextOpen);
        if (msg) {
            msg.textContent = '';
            msg.classList.add('hidden');
        }
        if (nextOpen) {
            const searchInp = document.getElementById('quoteErpClientSearchInput');
            const nomInp = document.getElementById('newCliNombre');
            if (nomInp && !cleanStr(nomInp.value) && searchInp && cleanStr(searchInp.value) && !/\d{4,}/.test(searchInp.value)) {
                nomInp.value = cleanStr(searchInp.value);
            }
            if (nomInp) setTimeout(() => nomInp.focus(), 40);
        }
    };

    function showNewErpClientMsg(text, tone) {
        const el = document.getElementById('newErpClientMsg');
        if (!el) return;
        if (!text) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = text;
        el.className = 'rounded-lg border px-3 py-2 text-xs font-bold ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
    }

    window.submitNewErpClientLive = async function () {
        if (isGuestSession() || erpClientCreateInFlight || isActiveQuoteCompleted()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }

        const valOf = id => cleanStr((document.getElementById(id) || {}).value);
        const nombre = valOf('newCliNombre');
        const paterno = valOf('newCliPaterno');
        const materno = valOf('newCliMaterno');
        const telefono = valOf('newCliTelefono');
        const correo = valOf('newCliCorreo');
        const empresa = valOf('newCliEmpresa');
        const rfc = valOf('newCliRfc').toUpperCase();
        const calle = valOf('newCliCalle');
        const colonia = valOf('newCliColonia');
        const cp = valOf('newCliCp');
        const ciudad = valOf('newCliCiudad');
        const estado = valOf('newCliEstado') || 'QUINTANA ROO';

        if (!nombre) {
            showNewErpClientMsg('Ingresa el nombre del cliente.', 'err');
            const nEl = document.getElementById('newCliNombre');
            if (nEl) nEl.focus();
            return;
        }
        if (!telefono) {
            showNewErpClientMsg('Ingresa el teléfono o celular del cliente.', 'err');
            const tEl = document.getElementById('newCliTelefono');
            if (tEl) tEl.focus();
            return;
        }

        const btn = document.getElementById('btnSaveNewErpClient');
        erpClientCreateInFlight = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando en S Mueblería...';
        }
        showNewErpClientMsg('Registrando nuevo cliente...', 'warn');

        try {
            const sess = enrichAdvisorLocation(activeAdvisorSession);
            const effAdvId = sess.isAdmin
                ? (cleanStr(quoteDraftMeta.erpAdvisorId) || cleanStr(sess.erpAdvisorId))
                : cleanStr(sess.erpAdvisorId);

            const res = await callInvWebAppPost('inv_create_erp_client', {
                authToken: sess.authToken || '',
                sheetTab: sess.sheetTab || '',
                advisorEmail: sess.correo || '',
                erpStore: cleanStr(quoteDraftMeta.erpStore) || cleanStr(sess.erpStore),
                erpAdvisorId: effAdvId,
                nombre: nombre,
                paterno: paterno,
                materno: materno,
                telefono: telefono,
                celular: telefono,
                correo: correo,
                empresa: empresa,
                rfc: rfc,
                calle: calle,
                colonia: colonia,
                cp: cp,
                ciudad: ciudad,
                estado: estado
            }, 30000);

            if (res && res.authRequired) {
                showNewErpClientMsg('Confirma tu contraseña personal para registrar clientes en S Mueblería.', 'warn');
                promptSessionReauth(res.error || 'Confirma tu contraseña para dar de alta clientes en S Mueblería.', null);
                return;
            }

            if (!res || res.needsRedeploy || res.unavailable) {
                showNewErpClientMsg('Publica una Nueva versión de AppsScript_Creata_Drive_Sheets.gs en Extensiones → Apps Script → Implementar para activar el alta directa en S Mueblería.', 'warn');
                return;
            }

            if (!res.ok || !res.client) {
                showNewErpClientMsg(res.error || 'No fue posible registrar al cliente en S Mueblería.', 'err');
                return;
            }

            selectErpClientObject(res.client);
            ['newCliNombre', 'newCliPaterno', 'newCliMaterno', 'newCliTelefono', 'newCliCorreo', 'newCliEmpresa', 'newCliRfc', 'newCliCalle', 'newCliColonia', 'newCliCp', 'newCliCiudad'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            toggleNewErpClientForm(false);
        } finally {
            erpClientCreateInFlight = false;
            if (btn) {
                btn.disabled = isActiveQuoteCompleted();
                btn.textContent = 'Guardar cliente en S Mueblería';
            }
        }
    };

    window.setCartItemDiscount = function (skuRaw, rawPct) {
        if (isGuestSession() || isActiveQuoteCompleted()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!cart[key]) return;
        let pct = Number(rawPct);
        if (isNaN(pct) || !isFinite(pct)) pct = 0;
        const maxPct = getMaxDiscountPct();
        if (pct > maxPct) {
            alert('Tu cuenta (' + getAdvisorRoleInfo().puesto + ') permite un descuento máximo de ' + maxPct + '% por partida.');
        }
        pct = Math.max(0, Math.min(maxPct, pct));
        cart[key].discountPct = pct;
        saveCart();
        renderCartItems();
    };

    function syncSkuCartControls(key) {
        if (isGuestSession()) {
            const ctrlWraps = document.querySelectorAll('[data-sku-ctrl="' + CSS.escape(key) + '"]');
            ctrlWraps.forEach(wrapEl => {
                if (wrapEl.parentNode) wrapEl.parentNode.removeChild(wrapEl);
            });
            const addBtn = document.getElementById('detAddCartBtn');
            const subBtn = document.getElementById('detSubCartBtn');
            const remAllBtn = document.getElementById('detRemoveAllCartBtn');
            if (addBtn) addBtn.classList.add('hidden');
            if (subBtn) subBtn.classList.add('hidden');
            if (remAllBtn) remAllBtn.classList.add('hidden');
            return;
        }
        const q = (!isActiveQuoteCompleted() && cart[key]) ? (Number(cart[key].qty) || 0) : 0;

        // Actualizar controles inline (- qty + / +) en fichas de portada, listado y variantes
        const ctrlWraps = document.querySelectorAll('[data-sku-ctrl="' + CSS.escape(key) + '"]');
        ctrlWraps.forEach(wrapEl => {
            const parent = wrapEl.parentNode;
            if (!parent) return;
            const prevOnclick = wrapEl.onclick;
            const temp = document.createElement('div');
            temp.innerHTML = buildCardCartControlHtml(key);
            const nextWrap = temp.firstElementChild;
            if (nextWrap) {
                nextWrap.onclick = prevOnclick;
                parent.replaceChild(nextWrap, wrapEl);
            }
        });

        // Compatibilidad si existe algún botón simple con data-sku-btn
        const btns = document.querySelectorAll('[data-sku-btn="' + CSS.escape(key) + '"]');
        btns.forEach(b => {
            b.textContent = q > 0 ? ('+' + q) : '+';
            b.classList.toggle('in-cart', q > 0);
        });

        if (currentDetailItem && String(currentDetailItem.s).toUpperCase() === key) {
            const addBtn = document.getElementById('detAddCartBtn');
            const subBtn = document.getElementById('detSubCartBtn');
            const remAllBtn = document.getElementById('detRemoveAllCartBtn');
            if (addBtn) {
                addBtn.textContent = q > 0 ? ('+ Cotización (' + q + ')') : '+ Cotización';
            }
            if (subBtn) {
                subBtn.classList.toggle('hidden', q <= 0);
            }
            if (remAllBtn) {
                remAllBtn.classList.toggle('hidden', q <= 0);
            }
        }
    }

    window.addToCart = function (skuRaw, delta) {
        if (isGuestSession()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key) return;
        const stepDelta = (typeof delta === 'number' && !isNaN(delta)) ? delta : 1;
        // Si había una cotización recién terminada y se agrega un producto nuevo, abrir en automático una cotización nueva limpia
        if (isActiveQuoteCompleted()) {
            if (stepDelta <= 0) return;
            purgeCompletedAndActivateBlankDraft();
        }
        const it = bySkuMap.get(key);
        if (!cart[key]) {
            if (stepDelta <= 0 || !it || !isQuotableItem(it)) return;
            cart[key] = {
                sku: it.s,
                name: stripDimensionsFromProductText(it.n) || it.s,
                price: formatPrice(it.pr),
                qty: 0,
                discountPct: 0
            };
        } else if (it && it.pr) {
            cart[key].price = formatPrice(it.pr);
            cart[key].name = stripDimensionsFromProductText(it.n) || stripDimensionsFromProductText(cart[key].name) || it.s;
        }
        cart[key].qty = Math.max(0, (Number(cart[key].qty) || 0) + stepDelta);
        if (cart[key].qty <= 0) {
            delete cart[key];
        }
        saveCart();
        syncSkuCartControls(key);

        const cartModalEl = document.getElementById('cartModal');
        if (cartModalEl && cartModalEl.classList.contains('open')) {
            renderCartItems();
        }
    };

    window.removeFromCart = function (skuRaw) {
        if (isActiveQuoteCompleted()) return;
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key || !cart[key]) return;
        delete cart[key];
        saveCart();
        syncSkuCartControls(key);

        const cartModalEl = document.getElementById('cartModal');
        if (cartModalEl && cartModalEl.classList.contains('open')) {
            renderCartItems();
        }
    };

    window.addCurrentDetailToCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, 1);
    };

    window.subtractCurrentDetailFromCart = function () {
        if (!currentDetailItem) return;
        addToCart(currentDetailItem.s, -1);
    };

    window.removeCurrentDetailFromCart = function () {
        if (!currentDetailItem) return;
        removeFromCart(currentDetailItem.s);
    };

    window.openCartModal = async function () {
        if (isGuestSession()) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        pruneExpiredQuoteDrafts(false);
        if (!erpAdvisorsCatalog.length) {
            loadErpCatalogLiveFromSheet().then(() => populateQuoteAdvisorControls());
        }
        populateQuoteAdvisorControls();
        renderQuoteDraftsBar();
        renderCartItems();
        applyQuoteCompletedLockUI();
        renderMyRecentQuotes(myRecentQuotesList);
        document.getElementById('cartModal').classList.add('open');
        refreshMyLiveQuotesInfo();
    };

    window.closeCartModal = function () {
        if (typeof window.closeQuoteConfirmCreateModal === 'function') {
            window.closeQuoteConfirmCreateModal();
        }
        const modalEl = document.getElementById('cartModal');
        if (modalEl) modalEl.classList.remove('open');
        // Cuando se termina una cotización y se cierra la pestaña/ventana, descartar la terminada y dejar lista únicamente una nueva cotización
        if (quoteDrafts.some(d => d && d.completed)) {
            purgeCompletedAndActivateBlankDraft();
        }
    };

    window.clearCart = function () {
        if (isActiveQuoteCompleted()) return;
        const prevKeys = Object.keys(cart);
        cart = {};
        lastSubmittedQuoteMeta = null;
        saveCart();
        prevKeys.forEach(k => syncSkuCartControls(k));
        const statusBox = document.getElementById('quoteSystemStatusBox');
        if (statusBox) {
            statusBox.innerHTML = '';
            statusBox.classList.add('hidden');
        }
        renderCartItems();
        const inp = document.getElementById('invSearchInput');
        applyFilter(inp ? inp.value : '');
    };

    function computeQuoteBreakdown() {
        const entries = Object.values(cart);
        const lines = [];
        let sumLines = 0;
        let sumList = 0;
        const maxPct = getMaxDiscountPct();

        for (let i = 0; i < entries.length; i++) {
            const row = entries[i];
            const key = String(row.sku || '').toUpperCase();
            const liveIt = bySkuMap.get(key);
            const rawCartName = (row.name && String(row.name).trim().toUpperCase() !== key) ? row.name : '';
            const itemName = stripDimensionsFromProductText((liveIt && cleanStr(liveIt.n)) || rawCartName) || 'PRODUCTO COTIZADO';
            const itemPriceStr = (liveIt && formatPrice(liveIt.pr)) || formatPrice(row.price);
            const unitList = parsePriceNum(itemPriceStr);
            const qty = Math.max(1, Number(row.qty) || 1);
            const discPct = Math.max(0, Math.min(maxPct, Number(row.discountPct) || 0));
            const unitFinal = unitList * (1 - (discPct / 100));
            const lineSubtotal = unitFinal * qty;
            sumLines += lineSubtotal;
            sumList += unitList * qty;

            lines.push({
                key: key,
                sku: row.sku,
                name: itemName,
                qty: qty,
                discountPct: discPct,
                unitList: unitList,
                unitFinal: unitFinal,
                lineSubtotal: lineSubtotal,
                photoUrl: liveIt ? photoUrlForItem(liveIt) : '',
                measures: liveIt ? cleanStr(liveIt.m) : '',
                variant: liveIt ? cleanStr(liveIt.vr) : ''
            });
        }

        // El descuento total (partidas + descuento extra en $) no puede superar el % permitido en la columna Descuento
        const minAllowedTotal = sumList * (1 - (maxPct / 100));
        const maxExtraAllowed = Math.max(0, Math.floor((sumLines - minAllowedTotal) * 100) / 100);
        const requestedExtra = Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0);
        const extraDiscount = Math.min(requestedExtra, maxExtraAllowed);
        const totalWithIva = Math.max(0, sumLines - extraDiscount);
        const subtotalNoIva = totalWithIva / 1.16;
        const ivaAmount = totalWithIva - subtotalNoIva;

        return {
            lines: lines,
            sumLines: sumLines,
            sumList: sumList,
            maxPct: maxPct,
            maxExtraAllowed: maxExtraAllowed,
            requestedExtra: requestedExtra,
            extraDiscount: extraDiscount,
            subtotalNoIva: subtotalNoIva,
            ivaAmount: ivaAmount,
            totalWithIva: totalWithIva
        };
    }

    function renderQuoteTotalsOnly() {
        const totalBar = document.getElementById('cartTotalBar');
        const subEl = document.getElementById('quoteSubtotalNoIva');
        const ivaEl = document.getElementById('quoteIvaAmount');
        const totalAmtEl = document.getElementById('cartTotalAmount');
        const limitEl = document.getElementById('quoteDiscountLimitInfo');
        const bd = computeQuoteBreakdown();

        if (!bd.lines.length) {
            if (totalBar) totalBar.classList.add('hidden');
            return;
        }
        if (totalBar) totalBar.classList.remove('hidden');
        if (limitEl) {
            const role = getAdvisorRoleInfo();
            const effPct = bd.sumList > 0 ? ((bd.sumList - bd.totalWithIva) / bd.sumList) * 100 : 0;
            const promoSuffix = (!role.isManager && isAdvisorDiscount30Active() && role.maxPct === ADVISOR_PROMO_MAX_DISCOUNT_PCT)
                ? ' (vigente hasta 30/11/2026)'
                : '';
            let html = 'Puesto: <strong>' + escapeHtml(role.puesto) + '</strong> · Descuento autorizado: <strong>' + role.maxPct + '%' + promoSuffix + '</strong>' +
                ' · Descuento aplicado: <strong>' + effPct.toFixed(1) + '%</strong>';
            if (bd.requestedExtra > bd.extraDiscount + 0.004) {
                html += '<div style="color:#991B1B;margin-top:3px;">El descuento extra se ajustó a ' + escapeHtml(formatPrice(bd.extraDiscount) || '$0.00') +
                    ' para no superar el ' + role.maxPct + '% autorizado.</div>';
            }
            limitEl.innerHTML = html;
        }
        if (subEl) subEl.textContent = formatPrice(bd.subtotalNoIva) || '$0.00';
        if (ivaEl) ivaEl.textContent = formatPrice(bd.ivaAmount) || '$0.00';
        if (totalAmtEl) totalAmtEl.textContent = formatPrice(bd.totalWithIva) || '$0.00';
    }

    function renderCartItems() {
        const wrap = document.getElementById('cartItemsContainer');
        const countLbl = document.getElementById('quoteItemsCountLabel');
        if (!wrap) return;

        const locked = isActiveQuoteCompleted();
        const bd = computeQuoteBreakdown();
        if (countLbl) {
            countLbl.textContent = bd.lines.length + (bd.lines.length === 1 ? ' partida' : ' partidas') +
                (bd.lines.length > 15 ? ' (excede límite de 15)' : '');
            countLbl.style.color = bd.lines.length > 15 ? '#991B1B' : '#252C32';
        }

        if (!bd.lines.length) {
            wrap.innerHTML = '<div class="text-center py-6 rounded-xl border text-xs font-semibold opacity-60" style="border-color:#E8E4DE;">No hay productos agregados a la plantilla de cotización.</div>';
            renderQuoteTotalsOnly();
            return;
        }

        const disAttr = locked ? ' disabled' : '';
        wrap.innerHTML = bd.lines.map((ln, idx) => {
            const unitStr = ln.unitList > 0 ? formatPrice(ln.unitList) : 'Sin precio';
            const lineSubStr = ln.lineSubtotal > 0 ? formatPrice(ln.lineSubtotal) : '$0.00';
            return '<div class="rounded-xl border p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5" style="border-color:#E8E4DE; background:#FFFFFF;">' +
                (function () { const liveIt = bySkuMap.get(ln.key); return liveIt ? buildThumbHtml(liveIt) : ''; })() +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(ln.key) + '\', false, true)">' +
                    '<div class="text-xs font-extrabold uppercase leading-snug" style="color:#252C32;">' +
                        '<span class="opacity-50 mr-1">' + (idx + 1) + '.</span>' +
                        escapeHtml(ln.name) +
                    '</div>' +
                    '<div class="text-[11px] font-bold mt-0.5 flex flex-wrap items-center gap-2" style="color:#A38251;">' +
                        '<span>P. Lista: ' + escapeHtml(unitStr) + '</span>' +
                        '<span style="color:#252C32;">· Importe: ' + escapeHtml(lineSubStr) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="flex flex-wrap items-center gap-2 shrink-0 ml-auto">' +
                    '<div class="flex items-center gap-1" title="Porcentaje de descuento en esta partida">' +
                        '<span class="text-[10px] font-bold uppercase opacity-70">Desc% (máx ' + bd.maxPct + ')</span>' +
                        '<input type="number" min="0" max="' + bd.maxPct + '" step="0.5" value="' + (ln.discountPct || 0) + '"' + disAttr + ' ' +
                               'onchange="setCartItemDiscount(\'' + escapeHtml(ln.key) + '\', this.value)" ' +
                               'class="w-14 rounded-lg border px-1.5 py-1 text-center text-xs font-bold outline-none" ' +
                               'style="border-color:#E1DBC5; color:#252C32;">' +
                    '</div>' +
                    (locked
                        ? ('<span class="px-2.5 py-1 rounded-full text-xs font-extrabold border" style="border-color:#E1DBC5; color:#252C32;">Cant: ' + ln.qty + '</span>')
                        : ('<div class="flex items-center gap-1">' +
                            '<button type="button" title="Restar 1 pieza" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', -1)" class="w-7 h-7 rounded-full border text-sm font-bold hover:bg-red-50" style="border-color:#E1DBC5;">−</button>' +
                            '<span class="w-6 text-center text-xs font-extrabold">' + ln.qty + '</span>' +
                            '<button type="button" title="Sumar 1 pieza" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', 1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#A38251; background:#A38251; color:#FFF;">+</button>' +
                            '<button type="button" title="Quitar producto de la cotización" onclick="removeFromCart(\'' + escapeHtml(ln.key) + '\')" class="ml-1 px-2.5 h-7 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition" style="border-color:#FECACA; background:#FEF2F2; color:#991B1B;">✕ Quitar</button>' +
                        '</div>')) +
                '</div>' +
            '</div>';
        }).join('');

        renderQuoteTotalsOnly();
    }

    function collectQuoteSubmissionPayload(sendToErp) {
        if (!isActiveQuoteCompleted()) {
            saveQuoteDraftMeta();
        }
        const bd = computeQuoteBreakdown();
        const sess = activeAdvisorSession ? enrichAdvisorLocation(activeAdvisorSession) : null;
        const isAdmin = !!(sess && sess.isAdmin);
        const erpStore = isAdmin
            ? (cleanStr(quoteDraftMeta.erpStore) || (sess && sess.erpStore) || 'CEDIS')
            : ((sess && sess.erpStore) || 'CREATA PUERTO CANCUN');
        const isProy = /PROYECTO/i.test(erpStore) || (!isAdmin && !!(sess && sess.isProyecto));
        const prefix = getStoreFolioPrefix(erpStore, sess && sess.orderPrefix);
        const erpAdvisorLabel = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorLabel) || (sess && sess.erpAdvisorLabel) || ((sess ? (sess.nombre || sess.correo).toUpperCase() : '') + ' | ' + erpStore))
            : ((sess && sess.erpAdvisorLabel) || (sess ? ((sess.nombre || sess.correo).toUpperCase() + ' | ' + erpStore) : ''));
        const erpAdvisorId = isAdmin
            ? (cleanStr(quoteDraftMeta.erpAdvisorId) || extractErpIdFromLabel(erpAdvisorLabel) || (sess && sess.erpAdvisorId) || '')
            : ((sess && sess.erpAdvisorId) || extractErpIdFromLabel(erpAdvisorLabel) || '');

        const activeFolio = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio)
            || (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.orderCode)
            || getEstimatedStoreFolio(erpStore, prefix);

        return {
            sendToErp: !!sendToErp,
            authToken: sess ? (sess.authToken || '') : '',
            sheetTab: sess ? (sess.sheetTab || '') : '',
            advisorEmail: sess ? sess.correo : '',
            advisorName: sess ? sess.nombre : '',
            branchLabel: isAdmin ? erpStore : (sess ? sess.branchLabel : ''),
            orderPrefix: prefix,
            orderCode: activeFolio,
            quoteType: isProy ? 'PROYECTO' : (isAdmin ? 'ADMINISTRATIVO' : (sess ? sess.quoteType : 'SUCURSAL')),
            isProyecto: isProy,
            isAdmin: isAdmin,
            erpStore: erpStore,
            erpAdvisorLabel: erpAdvisorLabel,
            erpAdvisorId: erpAdvisorId,
            categoryLabel: FIXED_QUOTE_CATEGORY_LABEL,
            clientMode: FIXED_QUOTE_CLIENT_MODE,
            clientName: cleanStr(quoteDraftMeta.clientName) || (isProy ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA'),
            clientPhone: cleanStr(quoteDraftMeta.clientPhone),
            clientEmail: cleanStr(quoteDraftMeta.clientEmail),
            erpClientId: Number(quoteDraftMeta.erpClientId) || 0,
            erpLeadId: Number(quoteDraftMeta.erpLeadId) || 0,
            deliveryDate: isoDateToDMY(quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate()),
            notes: cleanStr(quoteDraftMeta.notes),
            extraDiscount: bd.extraDiscount,
            items: bd.lines.map(ln => ({
                sku: ln.sku,
                name: ln.name,
                qty: ln.qty,
                discountPct: ln.discountPct,
                unitList: ln.unitList,
                lineSubtotal: ln.lineSubtotal
            })),
            breakdown: bd
        };
    }

    function buildFormattedQuoteText(payload) {
        const bd = payload.breakdown;
        const officialFolio = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio) || payload.orderCode || '';
        const qidPart = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.quoteId)
            ? (' (ID ERP ' + lastSubmittedQuoteMeta.quoteId + ')')
            : '';
        const lines = [
            payload.isProyecto
                ? 'COTIZACIÓN DE PROYECTO — CREATA MUEBLES'
                : 'COTIZACIÓN DE TIENDA / BODEGA — CREATA MUEBLES',
            'Folio S Mueblería: ' + officialFolio + qidPart,
            (payload.isProyecto ? 'Modalidad / Área: PROYECTO · ' : 'Tienda / Bodega S Mueblería: ') + payload.erpStore,
            'Asesor S Mueblería: ' + (payload.erpAdvisorLabel || payload.advisorName || ''),
            'Cuenta Cotizador: ' + (payload.advisorEmail || ''),
            (payload.isProyecto ? 'Proyecto / Cliente: ' : 'Cliente / Prospecto: ') + payload.clientName,
            payload.clientPhone ? ('Teléfono: ' + payload.clientPhone) : '',
            payload.clientEmail ? ('Correo Cliente: ' + payload.clientEmail) : '',
            'Entrega Tentativa: ' + payload.deliveryDate,
            payload.notes ? ('Notas: ' + payload.notes) : '',
            '----------------------------------------',
            'PARTIDAS:'
        ].filter(Boolean);

        bd.lines.forEach((ln, i) => {
            const discTxt = ln.discountPct > 0 ? (' (-' + ln.discountPct + '%)') : '';
            lines.push(
                (i + 1) + '. ' + ln.name +
                ' | Cant: ' + ln.qty +
                ' | P. Lista: ' + (formatPrice(ln.unitList) || '$0.00') +
                discTxt +
                ' | Importe: ' + (formatPrice(ln.lineSubtotal) || '$0.00')
            );
        });

        lines.push('----------------------------------------');
        if (bd.extraDiscount > 0) {
            lines.push('Descuento Extra: -' + formatPrice(bd.extraDiscount));
        }
        lines.push('Subtotal (sin IVA): ' + (formatPrice(bd.subtotalNoIva) || '$0.00'));
        lines.push('IVA (16%): ' + (formatPrice(bd.ivaAmount) || '$0.00'));
        lines.push('TOTAL COTIZACIÓN: ' + (formatPrice(bd.totalWithIva) || '$0.00'));
        return lines.join('\n');
    }

    window.copyCartSummary = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        const text = buildFormattedQuoteText(payload);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        }
        const btn = document.getElementById('copyCartBtn');
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = prev; }, 1100);
        }
    };

    let lastAcceptedQuoteSnapshot = null;

    function openPrintableQuoteWindow(payload, submittedMeta) {
        if (!payload || !payload.breakdown || !Array.isArray(payload.breakdown.lines) || !payload.breakdown.lines.length) return;
        const bd = payload.breakdown;
        const todayStr = formatDateDMY(new Date());
        const logoSrc = window.CREATA_LOGO_B64 || '';
        const folioTxt = (submittedMeta && submittedMeta.folio) || payload.orderCode || '';
        const qidTxt = (submittedMeta && submittedMeta.quoteId) ? submittedMeta.quoteId : '';
        const docHeading = payload.isProyecto ? 'Cotización de Proyecto' : 'Cotización CREATA Muebles';

        const rowsHtml = bd.lines.map((ln, idx) =>
            '<tr>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;">' + (idx + 1) + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid #E8E4DE;text-align:center;">' +
                    (ln.photoUrl ? ('<img src="' + escapeHtml(ln.photoUrl) + '" style="width:64px;height:64px;object-fit:contain;border:1px solid #E8E4DE;border-radius:6px;background:#FFF;">') : '') +
                '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;font-weight:600;">' + escapeHtml(ln.name) +
                    (ln.measures ? ('<div style="font-size:10px;color:#6B7280;margin-top:2px;font-weight:400;">Medidas: ' + escapeHtml(ln.measures) + '</div>') : '') +
                '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;font-weight:700;">' + ln.qty + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:right;">' + escapeHtml(formatPrice(ln.unitList) || '$0.00') + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:center;">' + (ln.discountPct > 0 ? (ln.discountPct + '%') : '0%') + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid #E8E4DE;text-align:right;font-weight:700;">' + escapeHtml(formatPrice(ln.lineSubtotal) || '$0.00') + '</td>' +
            '</tr>'
        ).join('');

        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + escapeHtml(docHeading) + ' — ' + escapeHtml(folioTxt) + ' — ' + escapeHtml(payload.clientName) + '</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap" rel="stylesheet">' +
            '<style>body{font-family:Raleway,sans-serif;color:#252C32;margin:28px;font-size:12px;} ' +
            'table{width:100%;border-collapse:collapse;margin-top:16px;} th{background:#252C32;color:#FFF;padding:9px 8px;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;} ' +
            '.box{border:1px solid #E1DBC5;border-radius:10px;padding:12px 14px;margin-top:12px;background:#FAF9F6;} ' +
            '@media print{.no-print{display:none!important;}}</style></head><body>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;background:#252C32;color:#FFF;padding:16px 20px;border-radius:12px;">' +
                '<div>' + (logoSrc ? ('<img src="' + logoSrc + '" style="height:48px;object-fit:contain;">') : '<strong>CREATA MUEBLES</strong>') + '</div>' +
                '<div style="text-align:right;">' +
                    '<div style="font-size:15px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">' + escapeHtml(docHeading) + '</div>' +
                    '<div style="color:#E1DBC5;font-size:11px;margin-top:3px;">Folio S Mueblería: <strong>' + escapeHtml(folioTxt) + '</strong>' +
                        (qidTxt ? (' (ID ERP ' + escapeHtml(qidTxt) + ')') : '') +
                    '</div>' +
                    '<div style="color:#E1DBC5;font-size:11px;margin-top:2px;">Fecha: ' + escapeHtml(todayStr) + ' · ' + escapeHtml(payload.erpStore) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="box" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                '<div><strong>' + (payload.isProyecto ? 'Proyecto / Cliente:' : 'Cliente / Prospecto:') + '</strong> ' + escapeHtml(payload.clientName) + '</div>' +
                '<div><strong>Tienda / Bodega S Mueblería:</strong> ' + escapeHtml(payload.erpStore) + '</div>' +
                '<div><strong>Teléfono:</strong> ' + escapeHtml(payload.clientPhone || 'Por definir') + '</div>' +
                '<div><strong>Entrega Tentativa:</strong> ' + escapeHtml(payload.deliveryDate) + '</div>' +
                (payload.clientEmail ? ('<div><strong>Correo Cliente:</strong> ' + escapeHtml(payload.clientEmail) + '</div>') : '') +
                '<div><strong>Asesor S Mueblería:</strong> ' + escapeHtml(payload.erpAdvisorLabel || payload.advisorName) + '</div>' +
                '<div><strong>Correo Cuenta:</strong> ' + escapeHtml(payload.advisorEmail || '') + '</div>' +
                (payload.notes ? ('<div style="grid-column:span 2;"><strong>Notas:</strong> ' + escapeHtml(payload.notes) + '</div>') : '') +
            '</div>' +
            '<table><thead><tr><th>#</th><th>Imagen</th><th style="text-align:left;">Descripción</th><th>Cant.</th><th style="text-align:right;">Precio Lista</th><th>% Desc.</th><th style="text-align:right;">Importe</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table>' +
            '<div style="margin-left:auto;max-width:300px;margin-top:16px;border:1px solid #E1DBC5;border-radius:10px;padding:12px 14px;background:#FAF9F6;">' +
                (bd.extraDiscount > 0 ? ('<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Descuento Extra:</span><strong>-' + escapeHtml(formatPrice(bd.extraDiscount)) + '</strong></div>') : '') +
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Subtotal (sin IVA):</span><strong>' + escapeHtml(formatPrice(bd.subtotalNoIva) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>IVA (16%):</span><strong>' + escapeHtml(formatPrice(bd.ivaAmount) || '$0.00') + '</strong></div>' +
                '<div style="display:flex;justify-content:space-between;border-top:1px solid #E1DBC5;padding-top:8px;font-size:14px;font-weight:800;color:#A38251;"><span>TOTAL COTIZACIÓN:</span><span>' + escapeHtml(formatPrice(bd.totalWithIva) || '$0.00') + '</span></div>' +
            '</div>' +
            '<div class="no-print" style="margin-top:20px;text-align:right;">' +
                '<button onclick="window.print()" style="background:#A38251;color:#FFF;border:none;padding:10px 20px;border-radius:999px;font-weight:800;cursor:pointer;text-transform:uppercase;">Imprimir / Guardar PDF</button>' +
            '</div>' +
            '</body></html>'
        );
        win.document.close();
    }

    window.printQuoteTemplate = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        openPrintableQuoteWindow(payload, lastSubmittedQuoteMeta);
    };

    function openQuoteConfirmCreateModal(payload) {
        const modalEl = document.getElementById('quoteConfirmCreateModal');
        const titleEl = document.getElementById('quoteConfirmCreateTitle');
        const sumEl = document.getElementById('quoteConfirmCreateSummary');
        if (!modalEl || !sumEl) return;

        const bd = (payload && payload.breakdown) || computeQuoteBreakdown();
        const lines = (bd && Array.isArray(bd.lines)) ? bd.lines : [];
        const totalQty = lines.reduce((s, ln) => s + (Number(ln && ln.qty) || 0), 0);

        if (titleEl) {
            titleEl.textContent = payload && payload.isProyecto
                ? 'Confirmar Creación · Cotización Proyecto'
                : 'Confirmar Creación de Cotización';
        }

        const linesHtml = lines.map((ln, idx) => {
            const discBadge = (Number(ln.discountPct) || 0) > 0
                ? (' <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold" style="background:#ECFDF5;color:#065F46;">-' + escapeHtml(String(ln.discountPct)) + '%</span>')
                : '';
            return '<div class="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0" style="border-color:#E8E4DE;">' +
                '<div class="min-w-0">' +
                    '<div class="font-bold leading-snug">' + (idx + 1) + '. ' + escapeHtml(ln.name || ln.sku) + discBadge + '</div>' +
                    '<div class="text-[10px] font-semibold opacity-75">SKU: ' + escapeHtml(ln.sku) + ' · Cant: <strong>' + ln.qty + '</strong> · P. Lista: ' + escapeHtml(formatPrice(ln.unitList) || '$0.00') + '</div>' +
                '</div>' +
                '<div class="font-extrabold shrink-0 text-right">' + escapeHtml(formatPrice(ln.lineSubtotal) || '$0.00') + '</div>' +
            '</div>';
        }).join('');

        sumEl.innerHTML =
            '<div class="font-extrabold uppercase tracking-wider text-[11px]" style="color:#A38251;">' +
                'Resumen de la cotización' +
            '</div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">' +
                '<div><span class="opacity-75">' + (payload && payload.isProyecto ? 'Proyecto / Cliente:' : 'Cliente / Prospecto:') + '</span> <strong>' + escapeHtml((payload && payload.clientName) || '') + '</strong></div>' +
                '<div><span class="opacity-75">Tienda / Bodega:</span> <strong>' + escapeHtml((payload && payload.erpStore) || '') + '</strong></div>' +
                '<div><span class="opacity-75">Folio estimado:</span> <strong>' + escapeHtml((payload && payload.orderCode) || '') + '</strong></div>' +
                '<div><span class="opacity-75">Entrega tentativa:</span> <strong>' + escapeHtml((payload && payload.deliveryDate) || '') + '</strong></div>' +
                '<div class="sm:col-span-2"><span class="opacity-75">Asesor S Mueblería:</span> <strong>' + escapeHtml((payload && (payload.erpAdvisorLabel || payload.advisorName)) || '') + '</strong></div>' +
                (payload && payload.clientPhone ? ('<div><span class="opacity-75">Teléfono:</span> <strong>' + escapeHtml(payload.clientPhone) + '</strong></div>') : '') +
            '</div>' +
            '<div class="pt-1.5 border-t" style="border-color:#E1DBC5;">' +
                '<div class="text-[10px] font-extrabold uppercase tracking-wider mb-1 opacity-80">Partidas (' + lines.length + ' · ' + totalQty + (totalQty === 1 ? ' pieza' : ' piezas') + ')</div>' +
                '<div class="max-h-40 overflow-y-auto pr-1">' + linesHtml + '</div>' +
            '</div>' +
            '<div class="pt-2 border-t space-y-1 text-[11px]" style="border-color:#E1DBC5;">' +
                (bd && bd.extraDiscount > 0
                    ? ('<div class="flex items-center justify-between"><span>Descuento extra:</span><strong style="color:#065F46;">-' + escapeHtml(formatPrice(bd.extraDiscount)) + '</strong></div>')
                    : '') +
                '<div class="flex items-center justify-between"><span>Subtotal (sin IVA):</span><strong>' + escapeHtml(formatPrice(bd && bd.subtotalNoIva) || '$0.00') + '</strong></div>' +
                '<div class="flex items-center justify-between"><span>IVA (16%):</span><strong>' + escapeHtml(formatPrice(bd && bd.ivaAmount) || '$0.00') + '</strong></div>' +
                '<div class="flex items-center justify-between pt-1 border-t text-xs font-extrabold uppercase" style="border-color:#E1DBC5;">' +
                    '<span>Total Cotización:</span>' +
                    '<span class="text-sm font-black" style="color:#A38251;">' + escapeHtml(formatPrice(bd && bd.totalWithIva) || '$0.00') + '</span>' +
                '</div>' +
            '</div>';

        const confirmBtn = document.getElementById('btnConfirmCreateQuoteErp');
        if (confirmBtn) confirmBtn.disabled = false;
        modalEl.classList.add('open');
        if (confirmBtn) setTimeout(() => confirmBtn.focus(), 40);
    }

    window.closeQuoteConfirmCreateModal = function () {
        const modalEl = document.getElementById('quoteConfirmCreateModal');
        if (modalEl) modalEl.classList.remove('open');
    };

    window.confirmCreateQuoteInErp = function () {
        const confirmBtn = document.getElementById('btnConfirmCreateQuoteErp');
        if (confirmBtn) confirmBtn.disabled = true;
        window.closeQuoteConfirmCreateModal();
        window.submitQuoteToSystem(true, true);
    };

    function setAcceptedModalPdfStatus(tone, htmlText) {
        const stEl = document.getElementById('quoteAcceptedPdfStatus');
        if (!stEl) return;
        if (!htmlText) {
            stEl.innerHTML = '';
            stEl.classList.add('hidden');
            return;
        }
        if (tone === 'ok') {
            stEl.style.background = '#ECFDF5';
            stEl.style.borderColor = '#6EE7B7';
            stEl.style.color = '#065F46';
        } else if (tone === 'warn') {
            stEl.style.background = '#FFFBEB';
            stEl.style.borderColor = '#FDE68A';
            stEl.style.color = '#92400E';
        } else {
            stEl.style.background = '#FEF2F2';
            stEl.style.borderColor = '#FECACA';
            stEl.style.color = '#991B1B';
        }
        stEl.innerHTML = htmlText;
        stEl.classList.remove('hidden');
    }

    function triggerBase64PdfBrowserDownload(base64Str, fileName) {
        const cleanB64 = String(base64Str || '').replace(/\s+/g, '');
        const binaryStr = window.atob(cleanB64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        const safeName = cleanStr(fileName) || 'Cotizacion_SMuebleria.pdf';
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = /\.pdf$/i.test(safeName) ? safeName : (safeName + '.pdf');
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (link.parentNode) link.parentNode.removeChild(link);
        }, 250);
        setTimeout(() => {
            try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        }, 60000);
    }

    window.downloadOriginalErpQuotePdf = async function (opts) {
        const o = opts || {};
        if (isGuestSession() || erpPdfDownloadInFlight) return false;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            if (!o.autoTriggered) openAuthModalForStartup();
            return false;
        }

        const qid = cleanStr(o.quoteId);
        const rawFolio = cleanStr(o.folio);
        const folio = (!/^(EN PROCESO|PENDIENTE)$/i.test(rawFolio) && !/^ID-\d+$/i.test(rawFolio)) ? rawFolio : '';
        const qidClean = qid || ((/^ID-(\d+)$/i.test(rawFolio)) ? rawFolio.replace(/^ID-/i, '') : '');
        const uid = cleanStr(o.erpUserId || activeAdvisorSession.erpAdvisorId);
        const cli = cleanStr(o.clientName);
        const store = cleanStr(o.erpStore || activeAdvisorSession.erpStore);

        if (!qidClean && !folio) {
            if (!o.autoTriggered) {
                setAcceptedModalPdfStatus('warn', '⏳ Esta cotización aún está en cola y todavía no cuenta con ID oficial en S Mueblería.');
            }
            return false;
        }

        const modalEl = document.getElementById('quoteAcceptedModal');
        const modalOpen = !!(modalEl && modalEl.classList.contains('open'));
        const modalPdfBtn = document.getElementById('btnDownloadErpPdfModal');
        const activeBtn = o.triggerBtn || (modalOpen ? modalPdfBtn : null);
        const prevBtnHtml = activeBtn ? activeBtn.innerHTML : '';

        erpPdfDownloadInFlight = true;
        if (activeBtn) {
            activeBtn.disabled = true;
            activeBtn.innerHTML = '⏳ Descargando PDF S Mueblería...';
        }
        if (modalPdfBtn && modalPdfBtn !== activeBtn) {
            modalPdfBtn.disabled = true;
        }
        if (modalOpen) {
            setAcceptedModalPdfStatus('warn', '⏳ Obteniendo el PDF original directo desde <strong>S Mueblería</strong>...');
        }

        let downloadedOk = false;
        try {
            const res = await callInvWebAppPost('inv_download_erp_quote_pdf', {
                authToken: activeAdvisorSession.authToken || '',
                sheetTab: activeAdvisorSession.sheetTab || '',
                advisorEmail: activeAdvisorSession.correo || '',
                quoteId: qidClean,
                folio: folio,
                erpUserId: uid,
                clientName: cli,
                erpStore: store
            }, 45000);

            if (res && res.authRequired) {
                if (o.autoTriggered) {
                    if (modalOpen) {
                        setAcceptedModalPdfStatus(
                            'warn',
                            '<div>Presiona <strong>⬇ Descargar PDF Original S Mueblería</strong> para confirmar tu contraseña y bajar el archivo.</div>'
                        );
                    }
                } else {
                    pendingPdfDownloadRetryOpts = {
                        quoteId: qidClean,
                        folio: folio,
                        erpUserId: uid,
                        clientName: cli,
                        erpStore: store,
                        autoTriggered: false,
                        triggerBtn: o.triggerBtn || null
                    };
                    promptSessionReauth(
                        res.error || 'Confirma tu contraseña personal para descargar el PDF original de S Mueblería.',
                        null
                    );
                }
                return false;
            }

            if (res && res.ok && res.pdfBase64) {
                const finalFile = cleanStr(res.fileName) || ('Cotizacion_SMuebleria_' + (folio || ('ID_' + qidClean)) + '.pdf');
                triggerBase64PdfBrowserDownload(res.pdfBase64, finalFile);
                downloadedOk = true;
                if (modalOpen) {
                    setAcceptedModalPdfStatus(
                        'ok',
                        '✓ PDF original de S Mueblería descargado: <strong>' + escapeHtml(finalFile) + '</strong>'
                    );
                } else if (!o.triggerBtn) {
                    renderQuoteStatusBanner(
                        'ok',
                        '<div>✓ PDF original de S Mueblería descargado: <strong>' + escapeHtml(finalFile) + '</strong></div>'
                    );
                }
                if (activeBtn) {
                    activeBtn.innerHTML = '✓ PDF S Mueblería Descargado';
                    setTimeout(() => {
                        if (activeBtn) activeBtn.innerHTML = prevBtnHtml;
                    }, 2600);
                }
                return true;
            }

            if (res && (res.needsRedeploy || res.unavailable)) {
                const redeployHtml =
                    '<div>Para activar la descarga automática del PDF original de S Mueblería, publica una <strong>Nueva versión</strong> de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em>.</div>';
                if (modalOpen) {
                    setAcceptedModalPdfStatus('warn', redeployHtml);
                } else {
                    renderQuoteStatusBanner('warn', redeployHtml);
                }
                return false;
            }

            const errMsg = cleanStr((res && res.error) || 'S Mueblería no entregó el PDF en este intento.');
            if (modalOpen) {
                setAcceptedModalPdfStatus('err', '⚠️ ' + escapeHtml(errMsg));
            } else {
                renderQuoteStatusBanner('err', '<div>⚠️ ' + escapeHtml(errMsg) + '</div>');
            }
            return false;
        } catch (dlErr) {
            const msg = cleanStr((dlErr && dlErr.message) || dlErr || 'Error de conexión al descargar el PDF.');
            if (modalOpen) {
                setAcceptedModalPdfStatus('err', '⚠️ ' + escapeHtml(msg));
            } else {
                renderQuoteStatusBanner('err', '<div>⚠️ ' + escapeHtml(msg) + '</div>');
            }
            return false;
        } finally {
            erpPdfDownloadInFlight = false;
            if (activeBtn) {
                activeBtn.disabled = false;
                if (!downloadedOk) activeBtn.innerHTML = prevBtnHtml;
            }
            if (modalPdfBtn && modalPdfBtn !== activeBtn) {
                modalPdfBtn.disabled = false;
            }
        }
    };

    window.downloadAcceptedQuoteOriginalPdf = function (btnEl) {
        const snap = lastAcceptedQuoteSnapshot;
        const meta = (snap && snap.submittedMeta) || lastSubmittedQuoteMeta || {};
        const pay = (snap && snap.payload) || {};
        return window.downloadOriginalErpQuotePdf({
            quoteId: meta.quoteId || '',
            folio: meta.folio || meta.orderCode || '',
            erpUserId: meta.erpUserId || pay.erpAdvisorId || '',
            clientName: pay.clientName || '',
            erpStore: pay.erpStore || '',
            autoTriggered: false,
            triggerBtn: btnEl || document.getElementById('btnDownloadErpPdfModal')
        });
    };

    function openQuoteAcceptedModal(payload, metaObj, opts) {
        const o = opts || {};
        const folioTxt = cleanStr((metaObj && (metaObj.folio || metaObj.orderCode)) || (payload && payload.orderCode));
        const qidTxt = cleanStr(metaObj && metaObj.quoteId);
        const bd = (payload && payload.breakdown) || computeQuoteBreakdown();
        const totalQty = (bd && Array.isArray(bd.lines))
            ? bd.lines.reduce((s, ln) => s + (Number(ln && ln.qty) || 0), 0)
            : 0;
        lastAcceptedQuoteSnapshot = {
            payload: payload,
            submittedMeta: metaObj ? Object.assign({}, metaObj) : null,
            isQueued: !!o.isQueued
        };

        const modalEl = document.getElementById('quoteAcceptedModal');
        const titleEl = document.getElementById('quoteAcceptedTitle');
        const sumEl = document.getElementById('quoteAcceptedSummary');
        const pdfBtn = document.getElementById('btnDownloadErpPdfModal');
        if (!modalEl || !sumEl) return;

        setAcceptedModalPdfStatus('', '');
        if (pdfBtn) {
            const hasErpRef = !o.isQueued && !!(qidTxt || folioTxt);
            pdfBtn.classList.toggle('hidden', !hasErpRef);
            pdfBtn.disabled = false;
            pdfBtn.innerHTML = '⬇ Descargar PDF Original S Mueblería';
        }

        if (titleEl) {
            titleEl.textContent = o.isQueued ? 'Cotización en Cola Automática' : 'Cotización Creada en S Mueblería';
        }
        sumEl.style.background = o.isQueued ? '#FFFBEB' : '#ECFDF5';
        sumEl.style.borderColor = o.isQueued ? '#FDE68A' : '#A7F3D0';
        sumEl.style.color = o.isQueued ? '#92400E' : '#065F46';

        sumEl.innerHTML =
            '<div class="font-extrabold uppercase">' +
                (o.isQueued ? '⏳ Cotización guardada en cola automática' : '✓ Cotización creada correctamente') +
            '</div>' +
            (folioTxt ? ('<div>Folio S Mueblería: <strong class="text-sm">' + escapeHtml(folioTxt) + '</strong>' + (qidTxt ? (' · ID ERP: <strong>' + escapeHtml(qidTxt) + '</strong>') : '') + '</div>') : '') +
            '<div>Cliente / Proyecto: <strong>' + escapeHtml((payload && payload.clientName) || 'Por definir') + '</strong></div>' +
            '<div>Asesor S Mueblería: <strong>' + escapeHtml((payload && (payload.erpAdvisorLabel || payload.advisorName)) || '') + '</strong></div>' +
            '<div>Tienda / Bodega: <strong>' + escapeHtml((payload && payload.erpStore) || '') + '</strong> · Piezas: <strong>' + totalQty + '</strong> · Total: <strong>' + escapeHtml(formatPrice(bd && bd.totalWithIva) || '$0.00') + '</strong></div>';

        modalEl.classList.add('open');
        const acceptBtn = document.getElementById('btnAcceptGeneratedQuote');
        if (acceptBtn) setTimeout(() => acceptBtn.focus(), 40);
    }

    window.acceptGeneratedQuoteAndReset = function () {
        const modalEl = document.getElementById('quoteAcceptedModal');
        if (modalEl) modalEl.classList.remove('open');
        purgeCompletedAndActivateBlankDraft();
        const cartScroll = document.querySelector('#cartModal .overflow-y-auto');
        if (cartScroll) cartScroll.scrollTop = 0;
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !nameInp.disabled) setTimeout(() => nameInp.focus(), 40);
    };

    window.printAcceptedQuoteSnapshot = function () {
        if (lastAcceptedQuoteSnapshot && lastAcceptedQuoteSnapshot.payload) {
            openPrintableQuoteWindow(lastAcceptedQuoteSnapshot.payload, lastAcceptedQuoteSnapshot.submittedMeta);
        } else {
            window.printQuoteTemplate();
        }
    };

    function renderQuoteStatusBanner(tone, htmlContent) {
        const box = document.getElementById('quoteSystemStatusBox');
        if (!box) return;
        if (!htmlContent) {
            box.innerHTML = '';
            box.classList.add('hidden');
            return;
        }
        box.className = 'rounded-xl border p-3.5 text-xs space-y-1.5 ' +
            (tone === 'ok' ? 'sem-green' : (tone === 'warn' ? 'sem-yellow' : 'sem-red'));
        box.innerHTML = htmlContent;
        box.classList.remove('hidden');
        if (box.scrollIntoView) {
            setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
        }
    }

    async function readLivePlantillaHeaderStatus() {
        const rows = await fetchSheetCsvRows('plantilla', 'range=A5:M11');
        if (!rows || rows.length < 5) return null;
        return {
            ok: true,
            erpStore: cleanStr(rows[0] && rows[0][2]),
            erpAdvisor: cleanStr(rows[1] && rows[1][2]),
            erpUserId: cleanStr(rows[1] && rows[1][6]),
            actionState: cleanStr(rows[0] && rows[0][10]),
            erpStatus: cleanStr(rows[1] && rows[1][10]),
            quoteId: cleanStr(rows[2] && rows[2][10]),
            folio: cleanStr(rows[2] && rows[2][12]),
            lastSync: cleanStr(rows[4] && rows[4][10])
        };
    }

    window.submitQuoteToSystem = async function (sendToErp, confirmed) {
        if (isGuestSession() || quoteSubmitInFlight) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        if (isActiveQuoteCompleted()) {
            renderQuoteStatusBanner(
                'warn',
                '<div>Esta cotización ya fue terminada y cerrada. Presiona <strong>+ Agregar nueva cotización</strong> o cierra esta ventana para capturar una nueva.</div>'
            );
            return;
        }

        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) {
            renderQuoteStatusBanner('err', '<div>Agrega al menos un producto antes de generar o enviar la cotización.</div>');
            return;
        }
        if (bd.lines.length > 15) {
            renderQuoteStatusBanner('err', '<div>La hoja <strong>plantilla</strong> admite máximo 15 partidas por cotización (actualmente tienes ' + bd.lines.length + ').</div>');
            return;
        }

        const payload = collectQuoteSubmissionPayload(sendToErp);
        const nameInp = document.getElementById('quoteClientNameInput');
        if (nameInp && !cleanStr(nameInp.value)) {
            nameInp.focus();
            renderQuoteStatusBanner(
                'warn',
                '<div>Ingresa el <strong>' +
                    (payload.isProyecto ? 'Nombre del Proyecto / Cliente' : 'Nombre del Cliente / Prospecto') +
                '</strong> para registrar la cotización.</div>'
            );
            return;
        }

        // Solicitar confirmación explícita antes de crear la cotización
        if (sendToErp && !confirmed) {
            openQuoteConfirmCreateModal(payload);
            return;
        }

        window.closeQuoteConfirmCreateModal();

        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        quoteSubmitInFlight = true;
        if (btnRev) btnRev.disabled = true;
        if (btnSend) btnSend.disabled = true;

        renderQuoteStatusBanner(
            'warn',
            '<div class="font-extrabold uppercase">' +
                (sendToErp
                    ? ('Enviando ' + (payload.isProyecto ? 'Cotización de Proyecto' : 'Cotización') + '...')
                    : 'Cargando cotización en revisión en Google Sheets...') +
            '</div>' +
            '<div>Tienda / Bodega: <strong>' + escapeHtml(payload.erpStore) + '</strong> · Folio S Mueblería estimado: <strong>' + escapeHtml(payload.orderCode) + '</strong> · Usuario ERP: <strong>' + escapeHtml(payload.erpAdvisorLabel || payload.advisorEmail) + '</strong></div>'
        );

        try {
            const res = await callInvWebAppPost('inv_submit_quote', payload, 38000);

            if (res && res.authRequired) {
                renderQuoteStatusBanner(
                    'warn',
                    '<div class="font-extrabold uppercase">Verificación de titular requerida</div>' +
                    '<div>' + escapeHtml(res.error || 'Confirma tu contraseña personal para emitir esta cotización.') + '</div>'
                );
                promptSessionReauth(
                    res.error || 'Confirma tu contraseña personal para emitir tu cotización.',
                    !!sendToErp
                );
                return;
            }

            if (res && res.ok) {
                if (res.nextFolioByStore) {
                    applyServerFolioMap(res.nextFolioByStore);
                }
                const folioFromRes = cleanStr(res.folio);
                if (folioFromRes) {
                    registerObservedFolio(folioFromRes, payload.erpStore);
                }
                const assignedFolio = folioFromRes ||
                    ((res.orderCode && !/^[A-Z]+-\d+$/i.test(String(res.orderCode))) ? cleanStr(res.orderCode) : '') ||
                    payload.orderCode;

                if (res.nextOrderCode && !/^[A-Z]+-\d+$/i.test(String(res.nextOrderCode))) {
                    currentNextOrderCode = cleanStr(res.nextOrderCode);
                    liveNextFolioByStore[String(payload.erpStore).toUpperCase()] = currentNextOrderCode;
                } else {
                    currentNextOrderCode = getEstimatedStoreFolio(payload.erpStore, payload.orderPrefix);
                }
                if (Array.isArray(res.recentQuotes)) {
                    myRecentQuotesList = res.recentQuotes;
                    renderMyRecentQuotes(myRecentQuotesList);
                }
                populateQuoteAdvisorControls();

                if (!sendToErp) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedFolio,
                        folio: '',
                        quoteId: '',
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    syncActiveQuoteDraftStorage();
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización cargada en revisión en Google Sheets (Serie ' + escapeHtml(payload.orderPrefix) + ')</div>' +
                        '<div>Tienda / Bodega: <strong>' + escapeHtml(res.erpStore || payload.erpStore) + '</strong>' +
                            ' · Usuario S Mueblería: <strong>' + escapeHtml(res.erpAdvisor || payload.erpAdvisorLabel) + '</strong></div>' +
                        (res.erpStatus ? ('<div>Estado: ' + escapeHtml(res.erpStatus) + '</div>') : '')
                    );
                    return;
                }

                const prependNewlyGeneratedQuotePdfToView = function (metaObj) {
                    if (!metaObj) return;
                    const qidClean = cleanStr(metaObj.quoteId);
                    const folClean = cleanStr(metaObj.folio || metaObj.orderCode);
                    if (!qidClean && (!folClean || /^[A-Z]+-\d+$/i.test(folClean))) return;
                    newlyGeneratedQuoteHighlightKey = (qidClean ? ('ID:' + qidClean) : '') || (folClean ? ('F:' + folClean) : '');
                    const alreadyPresent = Array.isArray(myRecentQuotesList) && myRecentQuotesList.some(existing => {
                        if (!existing) return false;
                        if (qidClean && cleanStr(existing.quoteId) === qidClean) return true;
                        if (folClean && (cleanStr(existing.folio) === folClean || cleanStr(existing.orderCode) === folClean)) return true;
                        return false;
                    });
                    if (!alreadyPresent) {
                        const skusTxt = Array.isArray(bd.lines)
                            ? bd.lines.map(ln => cleanStr(ln.sku) + ' x' + (Number(ln.qty) || 1)).join(', ')
                            : '';
                        const newEntry = {
                            orderCode: folClean || qidClean,
                            folio: folClean,
                            quoteId: qidClean,
                            createdAt: cleanStr(metaObj.createdAt) || new Date().toLocaleString('es-MX'),
                            quoteType: cleanStr(metaObj.quoteType || payload.quoteType),
                            branchTab: cleanStr(activeAdvisorSession && activeAdvisorSession.sheetTab),
                            erpStore: cleanStr(payload.erpStore),
                            advisorEmail: String((activeAdvisorSession && activeAdvisorSession.correo) || payload.advisorEmail || '').trim().toLowerCase(),
                            advisorName: cleanStr((activeAdvisorSession && activeAdvisorSession.nombre) || payload.advisorName),
                            erpAdvisor: cleanStr(payload.erpAdvisorLabel),
                            erpUserId: cleanStr(metaObj.erpUserId || payload.erpAdvisorId),
                            clientName: cleanStr(payload.clientName),
                            itemsCount: String(Array.isArray(bd.lines) ? bd.lines.length : 0),
                            skusSummary: skusTxt,
                            total: formatPrice(bd && bd.totalWithIva) || '',
                            status: 'COTIZACIÓN REGISTRADA'
                        };
                        myRecentQuotesList = [newEntry].concat(Array.isArray(myRecentQuotesList) ? myRecentQuotesList : []);
                    }
                    renderMyRecentQuotes(myRecentQuotesList);
                };

                // Flujo directo 24/7 hacia sistema.smuebleria.com
                if (res.sentLiveToErp) {
                    const folioTxt = folioFromRes || assignedFolio || ('ID-' + cleanStr(res.quoteId));
                    const qidTxt = cleanStr(res.quoteId);
                    const uidTxt = cleanStr(res.erpUserId || payload.erpAdvisorId);
                    lastSubmittedQuoteMeta = {
                        orderCode: folioTxt,
                        folio: folioTxt,
                        quoteId: qidTxt,
                        erpUserId: uidTxt,
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    prependNewlyGeneratedQuotePdfToView(lastSubmittedQuoteMeta);
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización creada correctamente</div>' +
                        '<div>Folio S Mueblería (' + escapeHtml(payload.erpStore) + '): <strong>' + escapeHtml(folioTxt) + '</strong>' +
                            (qidTxt ? (' · ID Cotización ERP: <strong>' + escapeHtml(qidTxt) + '</strong>') : '') +
                        '</div>' +
                        '<div>Emitida con usuario S Mueblería: <strong>' + escapeHtml(payload.erpAdvisorLabel) + '</strong></div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="downloadAcceptedQuoteOriginalPdf(this)" class="underline font-extrabold" style="color:#065F46;">⬇ Descargar PDF Original S Mueblería →</button>' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / Impresión CREATA →</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#252C32;">+ Iniciar nueva cotización →</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: false });
                    window.downloadOriginalErpQuotePdf({
                        quoteId: qidTxt,
                        folio: folioTxt,
                        erpUserId: uidTxt,
                        clientName: payload.clientName,
                        erpStore: payload.erpStore,
                        autoTriggered: true,
                        triggerBtn: document.getElementById('btnDownloadErpPdfModal')
                    });
                    return;
                }

                // Compatibilidad en caso de que la implementación WebApp aún no se haya actualizado a la nueva versión
                let latest = res;
                for (let attempt = 0; attempt < 6; attempt++) {
                    if (latest && (cleanStr(latest.folio) || cleanStr(latest.quoteId) || /COTIZACI[ÓO]N CREADA|ENVIADA EN VIVO|ERROR/i.test(String(latest.erpStatus || '')))) {
                        break;
                    }
                    await new Promise(r => setTimeout(r, 3000));
                    const polled = await readLivePlantillaHeaderStatus();
                    if (polled) latest = polled;
                }

                const folioFallback = cleanStr(latest && latest.folio);
                const qidFallback = cleanStr(latest && latest.quoteId);
                if (folioFallback || qidFallback) {
                    if (folioFallback) registerObservedFolio(folioFallback, payload.erpStore);
                    const uidFallback = cleanStr((latest && latest.erpUserId) || payload.erpAdvisorId);
                    lastSubmittedQuoteMeta = {
                        orderCode: folioFallback || assignedFolio,
                        folio: folioFallback,
                        quoteId: qidFallback,
                        erpUserId: uidFallback,
                        createdAt: cleanStr(latest && latest.lastSync),
                        quoteType: payload.quoteType
                    };
                    prependNewlyGeneratedQuotePdfToView(lastSubmittedQuoteMeta);
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    populateQuoteAdvisorControls();
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización registrada correctamente</div>' +
                        '<div>Folio S Mueblería: <strong>' + escapeHtml(folioFallback || assignedFolio) + '</strong>' +
                            (qidFallback ? (' · ID Cotización: <strong>' + escapeHtml(qidFallback) + '</strong>') : '') +
                        '</div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="downloadAcceptedQuoteOriginalPdf(this)" class="underline font-extrabold" style="color:#065F46;">⬇ Descargar PDF Original S Mueblería →</button>' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / Impresión CREATA →</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#252C32;">+ Iniciar nueva cotización →</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: false });
                    window.downloadOriginalErpQuotePdf({
                        quoteId: qidFallback,
                        folio: folioFallback || assignedFolio,
                        erpUserId: uidFallback,
                        clientName: payload.clientName,
                        erpStore: payload.erpStore,
                        autoTriggered: true,
                        triggerBtn: document.getElementById('btnDownloadErpPdfModal')
                    });
                } else if (res.queuedForDaemon) {
                    lastSubmittedQuoteMeta = {
                        orderCode: assignedFolio,
                        folio: '',
                        quoteId: '',
                        createdAt: cleanStr(res.lastSync),
                        quoteType: payload.quoteType
                    };
                    markActiveQuoteCompleted(lastSubmittedQuoteMeta);
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">⏳ Cotización guardada en cola automática</div>' +
                        '<div>La sesión directa en nube estaba por renovarse, así que la cotización quedó lista en <code>plantilla</code> (<strong>ENVIAR COTIZACIÓN A S MUEBLERÍA</strong>). En cuanto <code>servicio_en_vivo.py</code> esté activo en la PC sincronizadora, se cargará automáticamente con su folio oficial.</div>' +
                        '<div class="pt-1 flex flex-wrap items-center gap-3">' +
                            '<button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Comprobante / PDF provisional →</button>' +
                            '<button type="button" onclick="startFreshQuoteAfterCompleted()" class="underline font-extrabold" style="color:#252C32;">+ Iniciar nueva cotización →</button>' +
                        '</div>'
                    );
                    openQuoteAcceptedModal(payload, lastSubmittedQuoteMeta, { isQueued: true });
                } else {
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">Plantilla registrada · Falta activar nueva versión de Apps Script para envío directo 24/7</div>' +
                        '<div>Para que la cotización se registre directamente sin depender de ninguna computadora encendida, pega el código actualizado de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em>.</div>'
                    );
                }
                return;
            }

            if (res && !res.ok && !res.unavailable && !res.needsRedeploy && res.error) {
                renderQuoteStatusBanner(
                    'err',
                    '<div class="font-extrabold uppercase">No se pudo registrar la cotización</div>' +
                    '<div>' + escapeHtml(res.error) + '</div>'
                );
                return;
            }

            reportSystemHistoryEvent({
                classification: 'ALERTA TÉCNICA',
                module: 'inventario-app.js · submitQuoteOrder',
                event: 'RESPALDO PORTAPAPELES EN COTIZACIÓN',
                status: '⚠️ ALERTA',
                ref: payload.orderCode || '',
                detail: 'Respuesta WebApp no disponible o requiere publicar nueva versión (' + cleanStr((res && res.error) || 'sin conexión directa') + ').',
                analysis: 'Verificar conexión de red o publicar Nueva versión de AppsScript_Creata_Drive_Sheets.gs en Administrar implementaciones.'
            });

            window.copyCartSummary();
            renderQuoteStatusBanner(
                'warn',
                '<div class="font-extrabold uppercase">Plantilla generada y copiada al portapapeles</div>' +
                '<div>Actualiza la versión publicada de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em> para registrar directamente la cotización.</div>' +
                '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / PDF de esta Cotización →</button></div>'
            );
        } catch (quoteErr) {
            const msgErr = (quoteErr && quoteErr.message) ? quoteErr.message : String(quoteErr);
            reportSystemHistoryEvent({
                classification: 'FALLO DE CÓDIGO',
                module: 'inventario-app.js · submitQuoteOrder',
                event: 'EXCEPCIÓN EN ENVÍO DE COTIZACIÓN',
                status: '❌ ERROR',
                ref: payload.orderCode || '',
                detail: msgErr,
                analysis: cleanStr(quoteErr && quoteErr.stack) || 'Excepción en cliente durante el flujo de envío de cotización.'
            });
            renderQuoteStatusBanner(
                'err',
                '<div class="font-extrabold uppercase">Ocurrió un error al procesar la cotización</div>' +
                '<div>' + escapeHtml(msgErr) + '</div>'
            );
        } finally {
            quoteSubmitInFlight = false;
            const lockedNow = isActiveQuoteCompleted();
            if (btnRev) btnRev.disabled = lockedNow;
            if (btnSend) btnSend.disabled = lockedNow;
        }
    };


    // ------------------------------------------------------------------------
    // ESCÁNER BLUETOOTH (HID KEYBOARD WEDGE) + ENTER DIRECTO EN BUSCADOR
    // ------------------------------------------------------------------------
    let scanBuffer = '';
    let lastKeyTime = 0;

    document.addEventListener('keydown', function (ev) {
        const authModalEl = document.getElementById('authModal');
        if (authModalEl && authModalEl.classList.contains('open')) {
            return;
        }

        if (ev.key === 'Escape') {
            const confirmCreateEl = document.getElementById('quoteConfirmCreateModal');
            if (confirmCreateEl && confirmCreateEl.classList.contains('open')) {
                window.closeQuoteConfirmCreateModal();
                return;
            }
            const acceptedModalEl = document.getElementById('quoteAcceptedModal');
            if (acceptedModalEl && acceptedModalEl.classList.contains('open')) {
                acceptGeneratedQuoteAndReset();
                return;
            }
            closeProductDetail();
            closeCartModal();
            return;
        }
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isSearchFocused = document.activeElement && document.activeElement.id === 'invSearchInput';

        if (isSearchFocused && ev.key === 'Enter') {
            const val = String(document.activeElement.value || '').trim();
            if (val) {
                if (openProductDetail(val, false)) {
                    ev.preventDefault();
                    document.activeElement.select();
                    return;
                }
                if (filteredGroups.length === 1) {
                    ev.preventDefault();
                    const g = filteredGroups[0];
                    if (g.items.length > 1) openGroupModal(g.key);
                    else openProductDetail(g.items[0].s, false);
                    return;
                }
            }
        }

        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

        const now = Date.now();
        if (now - lastKeyTime > 120) {
            scanBuffer = '';
        }
        lastKeyTime = now;

        if (ev.key === 'Enter' || ev.key === 'Tab') {
            const code = scanBuffer.trim();
            scanBuffer = '';
            if (code.length >= 3) {
                ev.preventDefault();
                const inp = document.getElementById('invSearchInput');
                if (inp) inp.value = code;
                applyFilter(code);
                if (!openProductDetail(code, false) && filteredGroups.length === 1) {
                    const g = filteredGroups[0];
                    if (g.items.length > 1) openGroupModal(g.key);
                    else openProductDetail(g.items[0].s, false);
                }
            }
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            scanBuffer += ev.key;
        }
    });

    // ------------------------------------------------------------------------
    // LECTURA EN VIVO (SOLO LECTURA) DE LPPT Y SINCRONIZACIÓN CON INVENTARIO_EN_VIVO
    // ------------------------------------------------------------------------
    let liveSyncInFlight = false;

    // ------------------------------------------------------------------------
    // RESPALDO SIN CONEXIÓN: último inventario en vivo guardado en este dispositivo
    // (Bodega/Piso de CEDIS, CASA CREATA, PTC, COLOSIO, PLAYA + LPPT y fecha estimada)
    // ------------------------------------------------------------------------
    const LIVE_CACHE_KEY = 'creata_inv_live_cache_v3';
    const LIVE_OK_TS_KEY = 'creata_inv_live_ok_ts_v1';
    const LIVE_CACHE_FIELDS = ['s', 'tp', 'mo', 'n', 'vr', 'f', 'c', 'tl', 'ct', 'md', 'cm', 'mt', 'm', 'p', 'pr', 'lt', 'baseLt', 'fe', 'fcomp'];
    const LIVE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    let liveCacheSaveTimer = null;
    let liveSyncFailStreak = 0;
    let lastLiveOkMs = 0;
    try {
        localStorage.removeItem('creata_inv_live_cache_v2');
        lastLiveOkMs = Number(localStorage.getItem(LIVE_OK_TS_KEY) || 0) || 0;
    } catch (e) {}

    async function gzipTextToB64(text) {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = new Uint8Array(await new Response(stream).arrayBuffer());
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }

    async function gunzipB64ToText(b64) {
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
    }

    function scheduleSaveLiveInventoryCache(items) {
        if (typeof CompressionStream === 'undefined' || !Array.isArray(items) || items.length === 0) return;
        if (liveCacheSaveTimer) clearTimeout(liveCacheSaveTimer);
        liveCacheSaveTimer = setTimeout(async function () {
            liveCacheSaveTimer = null;
            try {
                const rows = new Array(items.length);
                for (let i = 0; i < items.length; i++) {
                    const it = items[i] || {};
                    const r = LIVE_CACHE_FIELDS.map(k => (it[k] === null || it[k] === undefined) ? '' : it[k]);
                    r.push(Array.isArray(it.st) ? it.st : []);
                    rows[i] = r;
                }
                const gz = await gzipTextToB64(JSON.stringify({ v: 2, fields: LIVE_CACHE_FIELDS, wh: WAREHOUSES, rows: rows }));
                localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ ts: Date.now(), gz: gz }));
            } catch (e) {
                // Si el almacenamiento del navegador está lleno, simplemente no se guarda el respaldo
            }
        }, 1500);
    }

    async function restoreLiveInventoryCacheIfAny() {
        if (typeof DecompressionStream === 'undefined') return false;
        try {
            const raw = localStorage.getItem(LIVE_CACHE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || !obj.gz || !obj.ts || (Date.now() - Number(obj.ts)) > LIVE_CACHE_MAX_AGE_MS) return false;
            const data = JSON.parse(await gunzipB64ToText(obj.gz));
            if (!data || !Array.isArray(data.rows) || !Array.isArray(data.wh)) return false;
            if (data.wh.join('|') !== WAREHOUSES.join('|')) return false;
            const fieldList = Array.isArray(data.fields)
                ? data.fields
                : ((Number(data.v) || 1) >= 2 ? LIVE_CACHE_FIELDS : LIVE_CACHE_FIELDS.slice(0, 18));
            const items = [];
            for (let i = 0; i < data.rows.length; i++) {
                const r = data.rows[i];
                if (!Array.isArray(r)) continue;
                const it = {};
                for (let k = 0; k < fieldList.length; k++) it[fieldList[k]] = r[k];
                if (it.fcomp === undefined) it.fcomp = '';
                const st = r[fieldList.length];
                it.st = (Array.isArray(st) && st.length === WAREHOUSES.length) ? st.map(v => Math.max(0, Number(v) || 0)) : emptyStocks();
                if (cleanStr(it.s)) items.push(it);
            }
            if (items.length === 0) return false;
            allItems = items;
            window.CREATA_INV_DATA = items;
            if (!lastLiveOkMs) lastLiveOkMs = Number(obj.ts) || 0;
            return true;
        } catch (e) {
            return false;
        }
    }

    function formatLiveOkStamp(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        return formatDateDMY(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function setLiveConnectionStatus(ok) {
        let el = document.getElementById('invLiveStatus');
        if (ok) {
            liveSyncFailStreak = 0;
            lastLiveOkMs = Date.now();
            try { localStorage.setItem(LIVE_OK_TS_KEY, String(lastLiveOkMs)); } catch (e) {}
            if (el) el.style.display = 'none';
            return;
        }
        liveSyncFailStreak++;
        const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
        if (!isOffline && liveSyncFailStreak < 2) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'invLiveStatus';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:70;max-width:calc(100vw - 24px);' +
                'padding:8px 14px;border-radius:999px;background:#252C32;color:#FFFFFF;font-size:11px;font-weight:700;' +
                'letter-spacing:.02em;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;';
            document.body.appendChild(el);
        }
        const stamp = formatLiveOkStamp(lastLiveOkMs);
        el.textContent = 'Sin conexión · mostrando el último inventario guardado' + (stamp ? ' (' + stamp + ')' : '');
        el.style.display = '';
    }

    function normHeader(h) {
        return String(h || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseCsvText(csvText) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < csvText.length; i++) {
            const ch = csvText[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (csvText[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    row.push(field);
                    field = '';
                } else if (ch === '\r') {
                    // ignore
                } else if (ch === '\n') {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = '';
                } else {
                    field += ch;
                }
            }
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        return rows;
    }

    async function fetchLiveLpptOrders() {
        if (!LPPT_SHEET_ID) return;
        try {
            const url = 'https://docs.google.com/spreadsheets/d/' + LPPT_SHEET_ID +
                '/export?format=csv&gid=' + encodeURIComponent(LPPT_GID);
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return;
            const text = await res.text();
            const rows = parseCsvText(text);
            if (rows.length < 3) return;

            const normUp = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            const nextMap = new Map();
            let observedAnyFolio = false;
            for (let i = 2; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length <= 9) continue;

                const folio = r.length > 12 ? cleanStr(r[12]) : '';
                const comAses = r.length > 19 ? String(r[19] || '') : '';
                if (folio && registerObservedFolio(folio, '')) {
                    observedAnyFolio = true;
                }
                if (comAses) {
                    const fMatches = comAses.match(/\b(?:PTC|CCB|DTC|PL|PRO|OUT|CED|ADM)\s*\d{2,7}\b/gi);
                    if (fMatches) {
                        for (let fm = 0; fm < fMatches.length; fm++) {
                            if (registerObservedFolio(fMatches[fm], '')) observedAnyFolio = true;
                        }
                    }
                }

                const sku = cleanStr(r[9]).toUpperCase();
                const oc = cleanStr(r[3]); // Columna D: Orden de compra
                if (!sku || !oc || sku === 'CLA00E') continue;

                const cliente = r.length > 15 ? cleanStr(r[15]) : '';
                const estatus = r.length > 16 ? normUp(r[16]) : '';
                const garantia = r.length > 17 ? normUp(r[17]) : '';
                const comComp = r.length > 18 ? normUp(r[18]) : '';
                const comAsesNorm = normUp(comAses);
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
                const matches = comAses.match(/\((\d+)\)/g);
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

                const fcStr = cleanStr(r[2]); // Columna C: Fecha compra
                const fcompStr = r.length > 5 ? cleanStr(r[5]) : ''; // Columna F: Fecha compromiso proveedor
                const rawFcompDate = parseSheetDate(fcompStr);
                const bufferedFcompDate = rawFcompDate ? addDaysLocal(rawFcompDate, SUPPLIER_COMMITMENT_BUFFER_DAYS) : null;
                let list = nextMap.get(sku);
                if (!list) {
                    list = [];
                    nextMap.set(sku, list);
                }
                list.push({
                    fc: parseSheetDate(fcStr),
                    fcStr: fcStr,
                    oc: oc,
                    fcomp: bufferedFcompDate,
                    fcompOrig: rawFcompDate,
                    free: freeQty,
                    nom: r.length > 8 ? cleanStr(r[8]) : '',
                    prov: r.length > 1 ? cleanStr(r[1]) : ''
                });
            }
            if (nextMap.size > 0) {
                liveLpptBySku = nextMap;
            }
            if (observedAnyFolio && activeAdvisorSession) {
                populateQuoteAdvisorControls();
            }
        } catch (err) {
            // Conservar último mapa LPPT en memoria si falla la red
        }
    }

    function gvizCellRaw(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.v !== null && c.v !== undefined) return c.v;
        if (c.f !== null && c.f !== undefined) return c.f;
        return '';
    }

    function gvizCellFormatted(rowCells, idx) {
        if (idx < 0 || idx >= rowCells.length) return '';
        const c = rowCells[idx];
        if (!c) return '';
        if (c.f !== null && c.f !== undefined && String(c.f).trim() !== '') return c.f;
        if (c.v !== null && c.v !== undefined) return c.v;
        return '';
    }

    function normalizeLeadTimeVal(rawVal) {
        const s = cleanStr(rawVal);
        if (!s) return '';
        const n = Number(s);
        if (!isNaN(n)) return n >= 0 ? Math.round(n) : '';
        return s;
    }

    function computeLpptAndLeadTime(skuUpper, baseLtRaw, invLpptVal, invFeStr, prevItem) {
        const baseLtNum = Number(baseLtRaw);
        const validBaseLt = (!isNaN(baseLtNum) && isFinite(baseLtNum) && baseLtNum > 0) ? Math.round(baseLtNum) : '';
        const entries = liveLpptBySku.get(skuUpper);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (entries && entries.length > 0) {
            let lpptQty = 0;
            let bestArr = null;
            let bestComp = null;

            for (let k = 0; k < entries.length; k++) {
                const e = entries[k];
                lpptQty += e.free;

                if (e.fcomp) {
                    if (
                        !bestComp ||
                        (e.fcomp >= today && (bestComp < today || e.fcomp < bestComp)) ||
                        (e.fcomp < today && bestComp < today && e.fcomp > bestComp)
                    ) {
                        bestComp = e.fcomp;
                    }
                }

                let dCompraLt = null;
                if (e.fc && validBaseLt) {
                    dCompraLt = new Date(e.fc.getTime());
                    dCompraLt.setDate(dCompraLt.getDate() + validBaseLt);
                }

                let arr = null;
                if (e.fcomp && e.fcomp >= today) {
                    arr = e.fcomp;
                } else if (dCompraLt && (!e.fcomp || dCompraLt > e.fcomp)) {
                    arr = dCompraLt;
                } else {
                    arr = e.fcomp || dCompraLt;
                }

                if (arr) {
                    if (
                        !bestArr ||
                        (arr >= today && (bestArr < today || arr < bestArr)) ||
                        (arr < today && bestArr < today && arr > bestArr)
                    ) {
                        bestArr = arr;
                    }
                }
            }

            if (!bestArr && invFeStr) {
                bestArr = parseSheetDate(invFeStr);
            }
            const feFormatted = bestArr
                ? formatDateDMY(bestArr)
                : (cleanStr(invFeStr) || 'Sin piezas solicitadas');
            const fcompFormatted = bestComp ? formatDateDMY(bestComp) : '';
            const remDays = bestArr
                ? Math.max(0, Math.round((bestArr.getTime() - today.getTime()) / 86400000))
                : validBaseLt;

            return {
                lpptQty: lpptQty,
                lt: remDays,
                baseLt: validBaseLt,
                fe: feFormatted,
                fcomp: fcompFormatted
            };
        }

        const fallbackQty = Math.max(0, Number(invLpptVal) || 0);
        const feClean = cleanStr(invFeStr) || (prevItem && cleanStr(prevItem.fe)) || 'Sin piezas solicitadas';
        const parsedFe = parseSheetDate(feClean);
        let ltOut = validBaseLt;
        if (fallbackQty > 0 && parsedFe) {
            ltOut = Math.max(0, Math.round((parsedFe.getTime() - today.getTime()) / 86400000));
        } else if (prevItem && prevItem.lt !== undefined && prevItem.lt !== '') {
            ltOut = prevItem.lt;
        }

        return {
            lpptQty: fallbackQty,
            lt: ltOut,
            baseLt: validBaseLt || (prevItem && prevItem.baseLt) || '',
            fe: feClean,
            fcomp: fallbackQty > 0 ? ((prevItem && cleanStr(prevItem.fcomp)) || '') : ''
        };
    }

    function applyLiveGvizTable(table) {
        if (!table || !Array.isArray(table.rows) || !Array.isArray(table.cols)) return false;

        let headers = table.cols.map(c => normHeader((c && c.label) || ''));
        let startRowIdx = 0;

        if (!headers[0] && table.rows.length > 0 && Array.isArray(table.rows[0].c)) {
            headers = table.rows[0].c.map(cell => normHeader((cell && cell.v != null) ? cell.v : ''));
            startRowIdx = 1;
        }

        function findCol(names) {
            const list = Array.isArray(names) ? names : [names];
            for (let k = 0; k < list.length; k++) {
                const idx = headers.indexOf(normHeader(list[k]));
                if (idx !== -1) return idx;
            }
            return -1;
        }

        function resolveWarehouseCol(whLabel) {
            const raw = String(whLabel || '').trim();
            const noParens = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
            const candidates = [raw, noParens];
            if (/^(LPPT|LLPT)$/i.test(noParens)) {
                candidates.push('LPPT', 'LLPT');
            }
            return findCol(candidates);
        }

        const colSku = findCol('SKU');
        const colCedis = findCol(['CEDIS BODEGA', 'CEDIS (BODEGA)', 'CEDIS']);
        const colCasa = findCol(['CASA CREATA BODEGA', 'CASA CREATA (BODEGA)', 'CASA CREATA']);

        if (colSku === -1 || colCedis === -1 || colCasa === -1) {
            return false;
        }

        const colTp = findCol('TIPO DE PRODUCTO');
        const colMo = findCol('MODELO');
        const colNombre = findCol('NOMBRE');
        const colVar = findCol('VARIANTE');
        const colFoto = findCol('FOTO');
        const colCat = findCol('CATEGORIA');
        const colTela = findCol('TELA');
        const colColorTela = findCol('COLOR DE TELA');
        const colMadera = findCol('MADERA');
        const colColorMadera = findCol('COLOR DE MADERA');
        const colMat = findCol('MATERIALES');
        const colMed = findCol('MEDIDAS');
        const colProv = findCol('PROVEEDOR');
        const colPrecio = findCol(['PRECIO DE LISTA', 'PRECIO LISTA', 'PRECIO']);
        const colLt = findCol(['TIEMPO DE ENTREGA (DIAS)', 'TIEMPO DE ENTREGA']);
        const colFe = findCol(['FECHA ESTIMADA DE LLEGADA', 'FECHA ESTIMADA']);
        const whCols = WAREHOUSES.map(wh => resolveWarehouseCol(wh));

        const liveItems = [];
        const seenLiveSkus = new Set();

        for (let i = startRowIdx; i < table.rows.length; i++) {
            const rowCells = (table.rows[i] && table.rows[i].c) || [];
            const sku = cleanStr(gvizCellRaw(rowCells, colSku));
            if (!sku || sku.toUpperCase() === 'SKU') continue;
            const skuUpper = sku.toUpperCase();
            seenLiveSkus.add(skuUpper);
            const prevIt = bySkuMap.get(skuUpper);

            const st = new Array(WAREHOUSES.length);
            for (let w = 0; w < WAREHOUSES.length; w++) {
                const wIdx = whCols[w];
                const rawStock = wIdx !== -1 ? gvizCellRaw(rowCells, wIdx) : 0;
                const numStock = Number(rawStock);
                st[w] = (!isNaN(numStock) && isFinite(numStock)) ? Math.max(0, Math.round(numStock)) : 0;
            }

            const baseLtVal = normalizeLeadTimeVal(gvizCellRaw(rowCells, colLt));
            const rawFe = colFe !== -1 ? cleanStr(gvizCellFormatted(rowCells, colFe)) : '';
            const lpptInfo = computeLpptAndLeadTime(skuUpper, baseLtVal, st[0], rawFe, prevIt);

            if (isLpptWarehouse(WAREHOUSES[0])) {
                st[0] = lpptInfo.lpptQty;
            }

            const rawPrCell = colPrecio !== -1 ? gvizCellRaw(rowCells, colPrecio) : '';
            const rawPr = (rawPrCell !== '' && rawPrCell !== null && rawPrCell !== undefined)
                ? rawPrCell
                : (colPrecio !== -1 ? gvizCellFormatted(rowCells, colPrecio) : '');
            const erpFallbackPr = liveErpPricesBySku.get(skuUpper) || '';
            const prFormatted = formatPrice(rawPr) || formatPrice(erpFallbackPr) || (prevIt && formatPrice(prevIt.pr)) || '';

            liveItems.push(normalizeInventoryItemLive({
                s: sku,
                tp: cleanStr(gvizCellRaw(rowCells, colTp)) || (prevIt && prevIt.tp) || '',
                mo: cleanStr(gvizCellRaw(rowCells, colMo)) || (prevIt && prevIt.mo) || '',
                n: cleanStr(gvizCellRaw(rowCells, colNombre)) || (prevIt && prevIt.n) || sku,
                vr: cleanStr(gvizCellRaw(rowCells, colVar)) || (prevIt && prevIt.vr) || '',
                f: colFoto >= 0 ? cleanStr(gvizCellRaw(rowCells, colFoto)) : ((prevIt && prevIt.f) || ''),
                c: cleanStr(gvizCellRaw(rowCells, colCat)) || (prevIt && prevIt.c) || '',
                tl: cleanStr(gvizCellRaw(rowCells, colTela)) || (prevIt && prevIt.tl) || '',
                ct: cleanStr(gvizCellRaw(rowCells, colColorTela)) || (prevIt && prevIt.ct) || '',
                md: cleanStr(gvizCellRaw(rowCells, colMadera)) || (prevIt && prevIt.md) || '',
                cm: cleanStr(gvizCellRaw(rowCells, colColorMadera)) || (prevIt && prevIt.cm) || '',
                mt: cleanStr(gvizCellRaw(rowCells, colMat)) || (prevIt && prevIt.mt) || '',
                m: cleanStr(gvizCellRaw(rowCells, colMed)) || (prevIt && prevIt.m) || '',
                p: cleanStr(gvizCellRaw(rowCells, colProv)) || (prevIt && prevIt.p) || '',
                pr: prFormatted,
                lt: lpptInfo.lt,
                baseLt: lpptInfo.baseLt,
                fe: lpptInfo.fe,
                fcomp: lpptInfo.fcomp,
                st: st
            }, prevIt));
        }

        // Si existe un producto nuevo en el catálogo ERP de S Mueblería (plantilla!AE:AH) que aún no está en INVENTARIO_EN_VIVO, agregarlo y completarlo en automático
        if (liveErpCatalogBySku.size > 0) {
            rebuildLiveAutoVocab(liveItems);
            liveErpCatalogBySku.forEach((erpMeta, skuUpper) => {
                if (!skuUpper || seenLiveSkus.has(skuUpper)) return;
                seenLiveSkus.add(skuUpper);
                const prevIt = bySkuMap.get(skuUpper) || null;
                const st = emptyStocks();
                const lpptInfo = computeLpptAndLeadTime(skuUpper, '', 0, '', prevIt);
                if (isLpptWarehouse(WAREHOUSES[0])) {
                    st[0] = lpptInfo.lpptQty;
                }
                liveItems.push(normalizeInventoryItemLive({
                    s: erpMeta.sku || skuUpper,
                    tp: (prevIt && prevIt.tp) || '',
                    mo: (erpMeta && erpMeta.mo) || (prevIt && prevIt.mo) || '',
                    n: (erpMeta && erpMeta.n) || (prevIt && prevIt.n) || skuUpper,
                    vr: (prevIt && prevIt.vr) || '',
                    f: '',
                    c: (prevIt && prevIt.c) || '',
                    tl: (prevIt && prevIt.tl) || '',
                    ct: (prevIt && prevIt.ct) || '',
                    md: (prevIt && prevIt.md) || '',
                    cm: (prevIt && prevIt.cm) || '',
                    mt: (prevIt && prevIt.mt) || '',
                    m: (prevIt && prevIt.m) || '',
                    p: (prevIt && prevIt.p) || '',
                    pr: formatPrice(erpMeta && erpMeta.pr) || (prevIt && formatPrice(prevIt.pr)) || '',
                    lt: lpptInfo.lt,
                    baseLt: lpptInfo.baseLt,
                    fe: lpptInfo.fe,
                    fcomp: lpptInfo.fcomp,
                    st: st
                }, prevIt));
            });
        }

        // Si viene una pieza nueva en la LPPT que aún no está en INVENTARIO_EN_VIVO ni en plantilla!AE:AH, registrarla en memoria (solo será cotizable si tiene precio ERP válido)
        if (liveLpptBySku.size > 0) {
            rebuildLiveAutoVocab(liveItems);
            liveLpptBySku.forEach((entries, skuUpper) => {
                if (!skuUpper || seenLiveSkus.has(skuUpper) || !entries || entries.length === 0) return;
                seenLiveSkus.add(skuUpper);
                const prevIt = bySkuMap.get(skuUpper) || null;
                const firstEntry = entries[0] || {};
                const st = emptyStocks();
                const lpptInfo = computeLpptAndLeadTime(skuUpper, '', 0, '', prevIt);
                if (isLpptWarehouse(WAREHOUSES[0])) {
                    st[0] = lpptInfo.lpptQty;
                }
                if (st[0] <= 0) return;
                const erpFallbackPr = liveErpPricesBySku.get(skuUpper) || '';
                liveItems.push(normalizeInventoryItemLive({
                    s: skuUpper,
                    tp: (prevIt && prevIt.tp) || '',
                    mo: (prevIt && prevIt.mo) || '',
                    n: firstEntry.nom || (prevIt && prevIt.n) || skuUpper,
                    vr: (prevIt && prevIt.vr) || '',
                    f: '',
                    c: (prevIt && prevIt.c) || '',
                    tl: (prevIt && prevIt.tl) || '',
                    ct: (prevIt && prevIt.ct) || '',
                    md: (prevIt && prevIt.md) || '',
                    cm: (prevIt && prevIt.cm) || '',
                    mt: (prevIt && prevIt.mt) || '',
                    m: (prevIt && prevIt.m) || '',
                    p: firstEntry.prov || (prevIt && prevIt.p) || '',
                    pr: formatPrice(erpFallbackPr) || (prevIt && formatPrice(prevIt.pr)) || '',
                    lt: lpptInfo.lt,
                    baseLt: lpptInfo.baseLt,
                    fe: lpptInfo.fe,
                    fcomp: lpptInfo.fcomp,
                    st: st
                }, prevIt));
            });
        }

        if (liveItems.length === 0) return false;

        liveItems.sort((a, b) =>
            compareAlphaEs(a.n || a.s, b.n || b.s) ||
            String(a.s || '').localeCompare(String(b.s || ''))
        );

        const nextSig = computeItemsSignature(liveItems);
        if (nextSig !== lastLiveSignature) {
            lastLiveSignature = nextSig;
            allItems = liveItems;
            window.CREATA_INV_DATA = liveItems;
            indexItemsAndGroups();
            scheduleSaveLiveInventoryCache(liveItems);

            const inp = document.getElementById('invSearchInput');
            applyFilter(inp ? inp.value : '', true);

            const modalEl = document.getElementById('productDetailModal');
            const isModalOpen = modalEl && modalEl.classList.contains('open');
            if (isModalOpen) {
                if (currentDetailItem) {
                    const refreshed = bySkuMap.get(String(currentDetailItem.s).toUpperCase());
                    if (refreshed) {
                        currentDetailItem = refreshed;
                        if (currentGroup) {
                            const updatedGrp = resolveActiveGroup(refreshed._groupKey);
                            currentGroup = (updatedGrp && updatedGrp.items.length > 1) ? updatedGrp : null;
                        }
                        const crumbVisible = !document.getElementById('detGroupCrumb').classList.contains('hidden');
                        renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                    } else {
                        closeProductDetail();
                    }
                } else if (currentGroup) {
                    const refreshedGrp = resolveActiveGroup(currentGroup.key);
                    if (refreshedGrp && refreshedGrp.items.length > 1) {
                        renderGroupVariantsStep(refreshedGrp);
                    } else if (refreshedGrp && refreshedGrp.items.length === 1) {
                        openProductDetail(refreshedGrp.items[0].s, false);
                    } else {
                        closeProductDetail();
                    }
                }
            }
        }

        return true;
    }

    function tryGvizSource(sheetId, queryParam) {
        return new Promise((resolve) => {
            if (!sheetId) {
                resolve(false);
                return;
            }
            const cbName = '__creataInvGviz_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, 7000);

            function cleanup() {
                clearTimeout(timer);
                window[cbName] = function () {};
                setTimeout(() => {
                    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                }, 60000);
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[cbName] = function (resp) {
                cleanup();
                if (!resp || !resp.table) {
                    resolve(false);
                    return;
                }
                resolve(applyLiveGvizTable(resp.table));
            };

            script.onerror = function () {
                cleanup();
                resolve(false);
            };
            script.src = 'https://docs.google.com/spreadsheets/d/' + sheetId +
                '/gviz/tq?tqx=responseHandler:' + cbName +
                '&' + queryParam + '&_t=' + Date.now();
            document.head.appendChild(script);
        });
    }

    async function tryWebAppLiveSync() {
        try {
            const apiUrl = (window.CREATA_CLOUD_CONFIG && window.CREATA_CLOUD_CONFIG.getApiUrl)
                ? window.CREATA_CLOUD_CONFIG.getApiUrl()
                : '';
            if (!apiUrl) return false;
            const res = await fetch(apiUrl + '?action=cm_inventory&sheetId=' + encodeURIComponent(META.sheetId) + '&tab=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO') + '&_t=' + Date.now());
            if (!res.ok) return false;
            const json = await res.json();
            if (json && json.ok && Array.isArray(json.rows) && json.rows.length > 1) {
                const fakeTable = {
                    cols: json.rows[0].map(h => ({ label: String(h || '') })),
                    rows: json.rows.slice(1).map(r => ({ c: r.map(v => ({ v: v })) }))
                };
                return applyLiveGvizTable(fakeTable);
            }
        } catch (e) {}
        return false;
    }

    window.refreshLiveSheetNow = async function () {
        if (liveSyncInFlight) return;
        liveSyncInFlight = true;
        try {
            syncPendingKeyUpdatesToCloud().catch(() => {});
            if (isGuestSession()) {
                verifyActiveGuestSessionLive().catch(() => {});
            }
            if (Date.now() - lastErpCatalogSyncMs > 60000) {
                await loadErpCatalogLiveFromSheet().catch(() => {});
            }
            await fetchLiveLpptOrders();
            let ok = false;
            if (META.gid != null) {
                ok = await tryGvizSource(META.sheetId, 'gid=' + encodeURIComponent(META.gid));
            }
            if (!ok) {
                ok = await tryGvizSource(META.sheetId, 'sheet=' + encodeURIComponent(META.tabName || 'INVENTARIO_EN_VIVO'));
            }
            if (!ok) {
                ok = await tryWebAppLiveSync();
            }
            setLiveConnectionStatus(!!ok);
        } catch (e) {
            setLiveConnectionStatus(false);
        } finally {
            liveSyncInFlight = false;
        }
    };

    async function unpackInitialInventoryIfNeeded() {
        if (Array.isArray(allItems) && allItems.length > 0) return;
        if (typeof window.CREATA_INV_GZ === 'string' && window.CREATA_INV_GZ.length > 0 && typeof DecompressionStream !== 'undefined') {
            try {
                const binStr = atob(window.CREATA_INV_GZ);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const ds = new DecompressionStream('gzip');
                const stream = new Blob([bytes]).stream().pipeThrough(ds);
                const jsonText = await new Response(stream).text();
                const cols = JSON.parse(jsonText);
                if (Array.isArray(cols) && cols.length >= 16 && Array.isArray(cols[0])) {
                    const len = cols[0].length;
                    const unpacked = new Array(len);
                    for (let i = 0; i < len; i++) {
                        const sku = cleanStr(cols[0][i]);
                        unpacked[i] = normalizeInventoryItemLive({
                            s: sku,
                            tp: cleanStr(cols[1][i]),
                            mo: cleanStr(cols[2][i]),
                            n: cleanStr(cols[3][i]) || sku,
                            vr: cleanStr(cols[4][i]),
                            f: cleanStr(cols[5][i]),
                            c: cleanStr(cols[6][i]),
                            tl: cleanStr(cols[7][i]),
                            ct: cleanStr(cols[8][i]),
                            md: cleanStr(cols[9][i]),
                            cm: cleanStr(cols[10][i]),
                            mt: cleanStr(cols[11][i]),
                            m: cleanStr(cols[12][i]),
                            p: cleanStr(cols[13][i]),
                            lt: normalizeLeadTimeVal(cols[14][i]),
                            st: Array.isArray(cols[15][i]) ? cols[15][i] : emptyStocks(),
                            pr: cols.length > 16 ? formatPrice(cols[16][i]) : '',
                            fe: cols.length > 17 ? cleanStr(cols[17][i]) : '',
                            baseLt: cols.length > 20 ? normalizeLeadTimeVal(cols[20][i]) : normalizeLeadTimeVal(cols[14][i]),
                            fcomp: cols.length > 21 ? shiftDateStringDays(cols[21][i], SUPPLIER_COMMITMENT_BUFFER_DAYS) : ''
                        }, null);
                    }
                    allItems = unpacked;
                    window.CREATA_INV_DATA = unpacked;
                }
            } catch (err) {
                console.error('[Inventario Unpack Error]', err);
                reportSystemHistoryEvent({
                    classification: 'FALLO DE CÓDIGO',
                    module: 'inventario-app.js · unpackInitialInventoryIfNeeded',
                    event: 'ERROR DESCOMPRIMIENDO INVENTARIO BASE',
                    status: '❌ ERROR',
                    detail: (err && err.message) ? err.message : String(err),
                    analysis: 'Fallo al descomprimir CREATA_INV_GZ con DecompressionStream; el sistema continuará cargando en vivo desde Google Sheets.'
                });
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async function () {
        initQuoteDraftsSystem();
        openAuthModalForStartup();
        loadErpCatalogLiveFromSheet().then(() => {
            if ((liveErpPricesBySku.size > 0 || liveErpCatalogBySku.size > 0) && Array.isArray(allItems) && allItems.length > 0) {
                let updatedCatalog = false;
                const existingSkus = new Set();
                for (let i = 0; i < allItems.length; i++) {
                    const it = allItems[i];
                    if (!it || !it.s) continue;
                    const skuU = String(it.s).toUpperCase();
                    existingSkus.add(skuU);
                    if (!it.pr) {
                        const livePr = liveErpPricesBySku.get(skuU);
                        if (livePr) {
                            it.pr = livePr;
                            updatedCatalog = true;
                        }
                    }
                    if (!it._avail && getLpptStock(it) >= 1 && hasValidErpPrice(it)) {
                        updatedCatalog = true;
                    }
                }
                liveErpCatalogBySku.forEach((erpMeta, skuU) => {
                    if (!skuU || existingSkus.has(skuU)) return;
                    existingSkus.add(skuU);
                    const st = emptyStocks();
                    const lpptInfo = computeLpptAndLeadTime(skuU, '', 0, '', null);
                    if (isLpptWarehouse(WAREHOUSES[0])) st[0] = lpptInfo.lpptQty;
                    allItems.push(normalizeInventoryItemLive({
                        s: erpMeta.sku || skuU,
                        tp: '',
                        mo: erpMeta.mo || '',
                        n: erpMeta.n || skuU,
                        vr: '',
                        f: '',
                        c: '',
                        tl: '',
                        ct: '',
                        md: '',
                        cm: '',
                        mt: '',
                        m: '',
                        p: '',
                        pr: formatPrice(erpMeta.pr) || '',
                        lt: lpptInfo.lt,
                        baseLt: lpptInfo.baseLt,
                        fe: lpptInfo.fe,
                        fcomp: lpptInfo.fcomp,
                        st: st
                    }, null));
                    updatedCatalog = true;
                });
                if (updatedCatalog) {
                    indexItemsAndGroups();
                    lastLiveSignature = computeItemsSignature(allItems);
                    const curInp = document.getElementById('invSearchInput');
                    applyFilter(curInp ? curInp.value : '', true);
                }
            }
            if (activeAdvisorSession) {
                if (!activeAdvisorSession.erpAdvisorLabel && erpAdvisorsCatalog.length > 0) {
                    const matched = matchBestErpAdvisorClient(activeAdvisorSession.nombre, activeAdvisorSession.erpStore, erpAdvisorsCatalog);
                    if (matched) {
                        activeAdvisorSession.erpAdvisorLabel = matched.label;
                        activeAdvisorSession.erpAdvisorId = matched.id;
                        activeAdvisorSession.erpAdvisorBranch = matched.branch;
                        saveAdvisorSession(activeAdvisorSession);
                        renderAdvisorHeaderBar();
                    }
                }
                populateQuoteAdvisorControls();
            }
        });

        await unpackInitialInventoryIfNeeded();
        // Usar el último inventario en vivo guardado en este dispositivo (sirve si no hay conexión);
        // en cuanto responde Google Sheets se reemplaza por el inventario en vivo.
        await restoreLiveInventoryCacheIfAny();
        indexItemsAndGroups();
        lastLiveSignature = computeItemsSignature(allItems);
        updateCartBadge();
        const inp = document.getElementById('invSearchInput');
        if (inp) {
            inp.addEventListener('input', function () {
                applyFilter(this.value);
            });
            if (activeAdvisorSession && !activeAdvisorSession.mustChangeKey) {
                inp.focus();
            }
        }
        applyFilter('');
        const loadMoreSentinel = document.getElementById('invLoadMoreWrap');
        if (loadMoreSentinel && typeof IntersectionObserver !== 'undefined') {
            const moreObs = new IntersectionObserver(function (entries) {
                if (entries && entries.some(e => e.isIntersecting) && renderedCount < filteredGroups.length) {
                    renderMoreItems(isMainCoverActive ? 120 : PAGE_SIZE);
                }
            }, { rootMargin: '420px 0px' });
            moreObs.observe(loadMoreSentinel);
        }
        refreshLiveSheetNow();
        setInterval(function () {
            if (document.visibilityState !== 'hidden') {
                refreshLiveSheetNow();
            }
        }, 12000);
        window.addEventListener('focus', refreshLiveSheetNow);
        window.addEventListener('online', refreshLiveSheetNow);
        window.addEventListener('offline', function () {
            setLiveConnectionStatus(false);
        });
        window.addEventListener('pagehide', purgeCompletedQuoteDraftsOnExit);
        window.addEventListener('beforeunload', purgeCompletedQuoteDraftsOnExit);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                pruneExpiredQuoteDrafts(true);
                refreshLiveSheetNow();
            }
        });

        // Abrir inventario.html aun sin internet (solo controla esta página; Catálogo/Admin no se tocan)
        if ('serviceWorker' in navigator && window.isSecureContext) {
            navigator.serviceWorker.register('inventario-sw.js', { scope: './inventario' }).catch(function () {});
        }
    });
})();
