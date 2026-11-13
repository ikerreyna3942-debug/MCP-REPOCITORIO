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
    const groupsByKey = new Map();
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

    function computeItemsSignature(items) {
        const parts = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const st = Array.isArray(it.st) ? it.st.join(',') : '';
            parts[i] = [
                it.s, it.tp, it.mo, it.n, it.vr, it.f, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p,
                it.lt, it.pr, it.fe, st
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

    // Normalización fonética/ortográfica para español (z/s/c, b/v, ll/y) -> "Apienso" == "Apienzo"
    function normSearch(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/ll/g, 'y')
            .replace(/c([ei])/g, 's$1')
            .replace(/z/g, 's')
            .replace(/v/g, 'b')
            .replace(/([a-z])\1+/g, '$1')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function isOneEditOrTransposition(a, b) {
        if (a === b) return true;
        const la = a.length;
        const lb = b.length;
        if (Math.abs(la - lb) > 1) return false;

        let i = 0;
        while (i < la && i < lb && a[i] === b[i]) i++;
        if (i === la && i === lb) return true;

        if (la === lb) {
            if (a.slice(i + 1) === b.slice(i + 1)) return true;
            if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) {
                return true;
            }
            return false;
        }
        if (la > lb) return a.slice(i + 1) === b.slice(i);
        return a.slice(i) === b.slice(i + 1);
    }

    function tokenMatchesGroup(tok, grp) {
        if (grp._search.indexOf(tok) !== -1 || grp._plain.indexOf(tok) !== -1) return true;
        if (tok.length >= 5 && !/\d/.test(tok)) {
            for (let i = 0; i < grp._words.length; i++) {
                if (isOneEditOrTransposition(tok, grp._words[i])) return true;
            }
        }
        return false;
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
            .replace(/\b(?:CON\s+MEDIDAS?|MEDIDAS?|DIAMETRO|DIÁMETRO|DIAM)\b\.?\s*:?/gi, ' ')
            .replace(/\s+\b(?:DE|CON\s+MEDIDA)\s*$/i, '')
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

    let liveErpCatalogBySku = new Map();
    let livePhotosBySku = new Map();

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
        [/\bARBOTANTE\b|^ARB\s+[A-Z]/, 'ARBOTANTE'],
        [/\bCANDIL\b/, 'CANDIL'],
        [/\bLAMPARA\s+(?:DE\s+)?(?:PIE|PISO)\b/, 'LAMPARA DE PISO'],
        [/\bLAMPARA\s+(?:DE\s+)?MESA\b|\bLAMPARA\s+BURO\b/, 'LAMPARA DE MESA'],
        [/\bLAMPARA\s+COLGANTE\b|\bCOLGANTE\b/, 'LAMPARA COLGANTE'],
        [/\bLAMPARA\b|\bLUMINARIA\b/, 'LAMPARA'],
        [/\bCANDELABRO\b|\bPORTAVELAS?\b|\bVELA\b|\bANTORCHA\b/, 'CANDELABRO'],
        [/\bLINTERNA\b|\bFAROL\b/, 'LINTERNA'],
        [/\bMACETA\b|\bMATERA\b/, 'MACETA'],
        [/\bPLANTA\b|\bARBOL\b|\bPALMA\b|\bFOLLAJE\b|\bVARA\b|\bRAMA\b|\bORQUIDEA\b|\bBONSAI\b/, 'PLANTA DECORATIVA'],
        [/\bFLORERO\b|\bJARRON\b|\bBOTELLA\b|\bBOTELLON\b|\bTIBOR\b|\bCILINDRO\b|^BASE\b/, 'FLORERO'],
        [/\bCHAROLA\b|\bBANDEJA\b|\bFRUTERO\b|\bENSALADERA\b|\bPLATO\b|\bBOWL\b|\bCENTRO\s+DE\s+MESA\b|\bBATEA\b/, 'CHAROLA'],
        [/\bESCULTURA\b|\bFIGURA\b|\bESFERA\b|\bCORALES?\b|\bCONCHA\b|\bBALLENA\b|\bPECES?\b|\bTORTUGAS?\b|\bPEDESTAL\b/, 'ESCULTURA'],
        [/\bFUNDA\b/, 'FUNDA DECORATIVA'],
        [/\bRELLENO\b|\bDRACON\b/, 'RELLENO'],
        [/\bALMOHADA\b|\bCOJIN\b/, 'COJIN'],
        [/\bFRAZADA\b|\bMANTA\b|\bDUVET\b|\bEDREDON\b|\bSABANA\b|\bCOLCHA\b|\bCUBRECAMA\b/, 'BLANCOS'],
        [/\bTEL-ARTELL\b|^TELA\s+ARTELL\b|^TELA\b/, 'TELA'],
        [/\bLAMINA\s+DE\s+PVC\b|\bLAMBRIN\b|\bPANEL\b/, 'LAMINA DE PVC'],
        [/\bMESA\b/, 'MESA'],
        [/\bCRISTAL\b|\bCUBIERTA\b/, 'CRISTAL'],
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
        if (!cleanStr(it.f) && skuUpper && livePhotosBySku.has(skuUpper)) {
            it.f = livePhotosBySku.get(skuUpper);
        }
        if (!cleanStr(it.pr) && erpRef && erpRef.pr) {
            it.pr = erpRef.pr;
        }
        return it;
    }

    function computeGroupTitle(it) {
        const tp = stripDimensionsFromProductText(it.tp).toUpperCase();
        const mo = stripDimensionsFromProductText(it.mo).toUpperCase();
        if (tp && mo) return tp + ' ' + mo;
        return stripDimensionsFromProductText(it.n || it.s).toUpperCase();
    }

    // ------------------------------------------------------------------------
    // CATEGORÍAS NORMALIZADAS (COLUMNA CATEGORIA; SI ESTÁ VACÍA SE DEDUCE DEL TIPO DE PRODUCTO)
    // ------------------------------------------------------------------------
    const CATEGORY_ORDER = [
        'SALAS & SOFÁS',
        'SILLAS & SILLONES',
        'COMEDORES',
        'BUFETERAS & CREDENZAS',
        'MESAS DE CENTRO & LATERALES',
        'RECÁMARAS',
        'OFICINA',
        'EXTERIOR',
        'ESPEJOS',
        'CUADROS',
        'LÁMPARAS',
        'COJINES & TEXTILES',
        'ACCESORIOS DECORATIVOS',
        'COMPLEMENTOS',
        'OTROS'
    ];
    const CATEGORY_RULES = [
        [/EXTERIOR|CAMASTRO/, 'EXTERIOR'],
        [/ESPEJO/, 'ESPEJOS'],
        [/CUADRO|ARTE OBJETO|DECORATIVO PARED/, 'CUADROS'],
        [/LAMPARA|CANDIL|ARBOTANTE/, 'LÁMPARAS'],
        [/COJIN|FUNDA|DUVET|FRAZADA|BLANCOS|ALMOHADA|TAPETE|TELA|RELLENO/, 'COJINES & TEXTILES'],
        [/BUFETERA|CREDENZA|TRINCHADOR|CONSOLA|CAVA/, 'BUFETERAS & CREDENZAS'],
        [/COMEDOR/, 'COMEDORES'],
        [/MESA DE CENTRO|MESAS? LATERAL|MESA AUXILIAR|MESAS DE SALA|ESQUINERO|AUXILIAR/, 'MESAS DE CENTRO & LATERALES'],
        [/RECAMARA|CAMA|CABECERA|BURO|COMODA|CAJONERA|COLCHON|BOX|LITERA|BEBE|BAUL/, 'RECÁMARAS'],
        [/ESCRITORIO|ARCHIVERO|OFICINA|LIBRERO/, 'OFICINA'],
        [/SALA|SOFA|LOVE SEAT|CHAISE|OTTOMAN|FUTTON|FUTON/, 'SALAS & SOFÁS'],
        [/SILLA|SILLON|TABURETE|BANCO|BANCA/, 'SILLAS & SILLONES'],
        [/MESA/, 'COMEDORES'],
        [/FLORERO|ESCULTURA|CHAROLA|CANDELABRO|MACETA|PLANTA|FOLLAJE|ACCESORIO|ACCECORIO|VELA|LIBRO|BOTELLON|PLATO|ENSALADERA|CANASTO|LINTERNA|DECORATIV/, 'ACCESORIOS DECORATIVOS'],
        [/COMPLEMENTO|MUEBLE DE TV|PERCHERO|CENTRO DE ENTRETENIMIENTO|CENTRO DE ENCETRENIMIENTO/, 'COMPLEMENTOS']
    ];

    function resolveItemCategory(it) {
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const cat = norm(cleanStr(it.c));
        const tp = norm(cleanStr(it.tp));
        // Si no hay categoría ni tipo, se intenta con el nombre del producto
        const sources = (cat || tp) ? [cat, tp] : [norm(cleanStr(it.n))];
        for (let s = 0; s < sources.length; s++) {
            const txt = sources[s];
            if (!txt) continue;
            for (let r = 0; r < CATEGORY_RULES.length; r++) {
                if (CATEGORY_RULES[r][0].test(txt)) return CATEGORY_RULES[r][1];
            }
        }
        return 'OTROS';
    }

    // CATEGORÍAS PRINCIPALES (COMEDORES / SALAS / RECÁMARAS / COMPLEMENTOS) → SUBCATEGORÍAS
    const MAIN_CATEGORY_ORDER = ['COMEDORES', 'SALAS', 'RECÁMARAS', 'COMPLEMENTOS'];
    const SUBCATEGORY_ORDER = [
        'MESAS DE COMEDOR', 'SILLAS', 'BUFETERAS & CREDENZAS',
        'SALAS & SOFÁS', 'SILLONES', 'MESAS DE CENTRO & LATERALES',
        'CAMAS & CABECERAS', 'BURÓS', 'CÓMODAS & CAJONERAS', 'COLCHONES & BOX', 'OTROS DE RECÁMARA',
        'OFICINA', 'EXTERIOR', 'ESPEJOS', 'CUADROS', 'LÁMPARAS', 'COJINES & TEXTILES',
        'ACCESORIOS DECORATIVOS', 'COMPLEMENTOS', 'OTROS'
    ];
    const MAIN_OF_SUB = {
        'MESAS DE COMEDOR': 'COMEDORES', 'SILLAS': 'COMEDORES', 'BUFETERAS & CREDENZAS': 'COMEDORES',
        'SALAS & SOFÁS': 'SALAS', 'SILLONES': 'SALAS', 'MESAS DE CENTRO & LATERALES': 'SALAS',
        'CAMAS & CABECERAS': 'RECÁMARAS', 'BURÓS': 'RECÁMARAS', 'CÓMODAS & CAJONERAS': 'RECÁMARAS',
        'COLCHONES & BOX': 'RECÁMARAS', 'OTROS DE RECÁMARA': 'RECÁMARAS'
    };

    function resolveItemSubcategory(it, baseCat) {
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const txt = norm([cleanStr(it.tp), cleanStr(it.n)].join(' '));
        if (baseCat === 'COMEDORES') return 'MESAS DE COMEDOR';
        if (baseCat === 'SILLAS & SILLONES') return /SILLON|BUTACA|MECEDORA|RECLINABLE/.test(txt) ? 'SILLONES' : 'SILLAS';
        if (baseCat === 'RECÁMARAS') {
            if (/BURO/.test(txt)) return 'BURÓS';
            if (/COMODA|CAJONERA|CHIFONIER|TOCADOR/.test(txt)) return 'CÓMODAS & CAJONERAS';
            if (/COLCHON|\bBOX\b|BOX SPRING/.test(txt)) return 'COLCHONES & BOX';
            if (/CAMA|CABECERA|LITERA|BASE/.test(txt)) return 'CAMAS & CABECERAS';
            return 'OTROS DE RECÁMARA';
        }
        return baseCat;
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

    function formatDateDMY(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    function formatSpanishDayMonth(dt) {
        if (!dt || isNaN(dt.getTime())) return '';
        const dayNum = dt.getDate();
        const monthName = MONTHS_ES[dt.getMonth()] || '';
        return dayNum + ' de ' + monthName;
    }

    // Construye el mensaje limpio para LPPT cuando existen piezas disponibles (> 0); vacío si no hay piezas
    function formatLpptArrivalText(it, lpptQty) {
        const qty = Math.max(0, Number(lpptQty) || 0);
        if (qty <= 0) return '';

        let arrivalDate = null;
        const feRaw = cleanStr(it && it.fe);
        if (feRaw && feRaw !== 'Sin piezas solicitadas') {
            arrivalDate = parseSheetDate(feRaw);
        }
        if (!arrivalDate && it && it.lt !== '' && it.lt !== null && it.lt !== undefined) {
            const ltNum = Number(it.lt);
            if (!isNaN(ltNum) && isFinite(ltNum) && ltNum >= 0) {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + Math.round(ltNum));
                arrivalDate = d;
            }
        }

        const dispWord = qty === 1 ? 'disponible' : 'disponibles';
        const dayMonth = arrivalDate ? formatSpanishDayMonth(arrivalDate) : '';
        if (dayMonth) {
            return 'LPPT: ' + qty + ' ' + dispWord + ' · Para entregar a partir del día ' + dayMonth;
        }
        return 'LPPT: ' + qty + ' ' + dispWord;
    }

    function indexItemsAndGroups() {
        rebuildLiveAutoVocab(allItems);
        allItems.sort((a, b) =>
            compareAlphaEs(a && (a.n || a.s), b && (b.n || b.s)) ||
            String((a && a.s) || '').localeCompare(String((b && b.s) || ''))
        );

        bySkuMap.clear();
        groupsByKey.clear();
        allGroups = [];

        for (let i = 0; i < allItems.length; i++) {
            const it = allItems[i];
            if (!Array.isArray(it.st)) it.st = emptyStocks();
            it.pr = formatPrice(it.pr);
            const skuKey = String(it.s || '').trim().toUpperCase();
            if (!skuKey) continue;

            const title = computeGroupTitle(it);
            const gKey = normalizePlain(title) || skuKey.toLowerCase();
            it._groupKey = gKey;
            it._groupTitle = title;

            const rawText = [
                it.s, title, it.n, it.vr, it.tp, it.mo, it.c,
                it.tl, it.ct, it.md, it.cm, it.mt, it.m, it.p, it.pr
            ].join(' ');
            it._plain = normalizePlain(rawText);
            it._search = normSearch(rawText);

            bySkuMap.set(skuKey, it);

            let grp = groupsByKey.get(gKey);
            if (!grp) {
                grp = {
                    key: gKey,
                    title: title,
                    tp: cleanStr(it.tp).toUpperCase(),
                    mo: cleanStr(it.mo).toUpperCase(),
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
            it._cat = resolveItemSubcategory(it, resolveItemCategory(it));
            it._main = MAIN_OF_SUB[it._cat] || 'COMPLEMENTOS';
            if (!grp.cats) grp.cats = new Set();
            if (!grp.mains) grp.mains = new Set();
            grp.cats.add(it._cat);
            grp.mains.add(it._main);
        }

        for (let i = 0; i < allGroups.length; i++) {
            const grp = allGroups[i];
            grp.items.sort((a, b) =>
                compareAlphaEs(a.n || a.vr || a.s, b.n || b.vr || b.s) ||
                String(a.s || '').localeCompare(String(b.s || ''))
            );
            grp.displayTitle = (grp.items.length > 1
                ? grp.title
                : (stripDimensionsFromProductText(grp.items[0].n) || grp.title || grp.items[0].s)
            ).toUpperCase();
            grp._plain = grp._plainParts.join(' ');
            grp._search = grp._searchParts.join(' ');
            grp._words = Array.from(new Set(grp._search.split(/\s+/).filter(w => w.length >= 4)));
            grp._titleTokens = normSearch(grp.title).split(/\s+/).filter(Boolean);
            grp._modelTokens = grp.mo ? normSearch(grp.mo).split(/\s+/).filter(Boolean) : [];
            delete grp._plainParts;
            delete grp._searchParts;
        }

        allGroups.sort((a, b) =>
            compareAlphaEs(a.displayTitle || a.title, b.displayTitle || b.title) ||
            String(a.key || '').localeCompare(String(b.key || ''))
        );
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
        updateCartBadge();
    }

    function updateCartBadge() {
        const totalQty = Object.values(cart).reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
        const el = document.getElementById('headerCartCount');
        if (el) el.textContent = String(totalQty);
    }

    // ------------------------------------------------------------------------
    // PORTADA PRINCIPAL: TODOS LOS PRODUCTOS CON FOTOGRAFÍA EN ORDEN ALFABÉTICO (A-Z)
    // ------------------------------------------------------------------------
    function getMainCoverGroups() {
        const withPhotos = allGroups.filter(g => !!firstPhotoItem(g.items));
        if (withPhotos.length === 0) {
            return allGroups.slice(0, PAGE_SIZE);
        }
        return withPhotos;
    }

    // ------------------------------------------------------------------------
    // FILTRADO AGRUPADO POR MODELO + TOLERANCIA ORTOGRÁFICA + ESCÁNER SKU
    // ------------------------------------------------------------------------
    function applyFilter(query, preserveCount) {
        const rawTrim = String(query || '').trim();
        const clearBtn = document.getElementById('invClearBtn');
        if (clearBtn) clearBtn.style.display = rawTrim ? 'block' : 'none';

        isMainCoverActive = (!rawTrim && activeCategory === 'ALL');

        if (isMainCoverActive) {
            filteredGroups = getMainCoverGroups();
        } else if (!rawTrim) {
            filteredGroups = allGroups;
        } else {
            const exactSkuItem = bySkuMap.get(rawTrim.toUpperCase());
            if (exactSkuItem && groupsByKey.has(exactSkuItem._groupKey)) {
                filteredGroups = [groupsByKey.get(exactSkuItem._groupKey)];
            } else {
                const qNorm = normSearch(rawTrim);
                const qTokens = qNorm.split(/\s+/).filter(Boolean);

                let matches = allGroups.filter(grp => {
                    for (let i = 0; i < qTokens.length; i++) {
                        if (!tokenMatchesGroup(qTokens[i], grp)) return false;
                    }
                    return true;
                });

                if (matches.length === 0 && qTokens.length >= 2) {
                    matches = allGroups.filter(grp => {
                        if (!grp.mo || grp._titleTokens.length === 0) return false;
                        for (let t = 0; t < grp._titleTokens.length; t++) {
                            const gTok = grp._titleTokens[t];
                            const foundInQuery = qTokens.some(qt =>
                                qt === gTok ||
                                (qt.length >= 4 && gTok.length >= 4 && isOneEditOrTransposition(qt, gTok))
                            );
                            if (!foundInQuery) return false;
                        }
                        return true;
                    });
                }

                if (matches.length === 0 && qTokens.length >= 1) {
                    matches = allGroups.filter(grp => {
                        if (!grp.mo || grp._modelTokens.length === 0) return false;
                        const modLongEnough = grp._modelTokens.some(mt => mt.length >= 5);
                        if (!modLongEnough) return false;
                        return grp._modelTokens.every(mt =>
                            qTokens.some(qt => qt === mt || (qt.length >= 5 && isOneEditOrTransposition(qt, mt)))
                        );
                    });
                }

                filteredGroups = matches;
            }
        }

        const isExactSkuHit = !!(rawTrim && bySkuMap.get(rawTrim.toUpperCase()));
        if (activeCategory !== 'ALL' && !isExactSkuHit) {
            filteredGroups = filteredGroups.filter(grp => grp.mains && grp.mains.has(activeCategory));
            if (activeSubCategory !== 'ALL') {
                filteredGroups = filteredGroups.filter(grp => grp.cats && grp.cats.has(activeSubCategory));
            }
        }
        renderCategoryBar();

        const targetInitial = isMainCoverActive
            ? filteredGroups.length
            : (preserveCount ? Math.max(PAGE_SIZE, renderedCount) : PAGE_SIZE);
        renderedCount = 0;
        const container = document.getElementById('invListContainer');
        if (container) container.innerHTML = '';
        renderMoreItems(targetInitial);
    }

    let activeCategory = 'ALL';
    let activeSubCategory = 'ALL';

    function renderCategoryBar() {
        const bar = document.getElementById('invCategoryBar');
        if (!bar) return;
        const mainCounts = new Map();
        const subCounts = new Map();
        for (let i = 0; i < allGroups.length; i++) {
            const g = allGroups[i];
            if (g.mains) g.mains.forEach(c => mainCounts.set(c, (mainCounts.get(c) || 0) + 1));
            if (activeCategory !== 'ALL' && g.mains && g.mains.has(activeCategory) && g.cats) {
                g.cats.forEach(c => {
                    if ((MAIN_OF_SUB[c] || 'COMPLEMENTOS') === activeCategory) subCounts.set(c, (subCounts.get(c) || 0) + 1);
                });
            }
        }
        const pill = (cls, attr, val, label, isActive) =>
            '<button type="button" class="' + cls + (isActive ? ' active' : '') + '" ' + attr + '="' + escapeHtml(val) + '">' + escapeHtml(label) + '</button>';

        const pills = [pill('inv-cat-pill', 'data-cat', 'ALL', 'TODOS (' + allGroups.length + ')', activeCategory === 'ALL')];
        MAIN_CATEGORY_ORDER.forEach(c => {
            if (mainCounts.get(c) > 0) pills.push(pill('inv-cat-pill', 'data-cat', c, c + ' (' + mainCounts.get(c) + ')', activeCategory === c));
        });
        bar.innerHTML = pills.join('');
        bar.querySelectorAll('.inv-cat-pill').forEach(btn => {
            btn.onclick = function () { setInvCategory(btn.getAttribute('data-cat')); };
        });

        const subBar = document.getElementById('invSubCategoryBar');
        if (!subBar) return;
        if (activeCategory === 'ALL') {
            subBar.innerHTML = '';
            subBar.style.display = 'none';
            return;
        }
        const subs = SUBCATEGORY_ORDER.filter(c => subCounts.get(c) > 0);
        const subPills = [pill('inv-cat-pill inv-sub-pill', 'data-sub', 'ALL', 'TODO ' + activeCategory + ' (' + (mainCounts.get(activeCategory) || 0) + ')', activeSubCategory === 'ALL')];
        subs.forEach(c => subPills.push(pill('inv-cat-pill inv-sub-pill', 'data-sub', c, c + ' (' + subCounts.get(c) + ')', activeSubCategory === c)));
        subBar.innerHTML = subPills.join('');
        subBar.style.display = '';
        subBar.querySelectorAll('.inv-sub-pill').forEach(btn => {
            btn.onclick = function () { setInvSubCategory(btn.getAttribute('data-sub')); };
        });
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
                container.innerHTML = '';
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
                    '</div>' +
                    '<svg class="w-4 h-4 shrink-0" style="color:#A38251;" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"></path>' +
                    '</svg>';
            } else {
                const it = grp.items[0];
                const skuKey = String(it.s || '').toUpperCase();
                row.onclick = function () {
                    openProductDetail(it.s, false);
                };
                row.innerHTML =
                    buildThumbHtml(it) +
                    '<div class="min-w-0 flex-1 pr-2">' +
                        '<div class="text-sm font-bold uppercase leading-snug" style="color:#252C32;">' + escapeHtml(grp.displayTitle || stripDimensionsFromProductText(it.n) || grp.title || it.s) + '</div>' +
                        '<div class="text-xs font-semibold tracking-wider mt-0.5" style="color:#A38251;">' + escapeHtml(it.s) + '</div>' +
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

            varList.innerHTML = grp.items.map((it, idx) => {
                const skuKey = String(it.s || '').toUpperCase();
                let varLabel = baseLabels[idx];
                const medUpper = cleanStr(it.m).toUpperCase();
                if (medUpper && labelCounts.get(varLabel) > 1 && varLabel.indexOf(medUpper) === -1) {
                    varLabel = varLabel + ' · ' + medUpper;
                }
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

    window.openGroupModal = function (groupKey) {
        const grp = groupsByKey.get(groupKey);
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
    window.openProductDetail = function (skuRaw, fromGroupList) {
        const key = String(skuRaw || '').trim().toUpperCase();
        const it = bySkuMap.get(key);
        if (!it) return false;

        currentDetailItem = it;
        if (!fromGroupList) {
            const grp = groupsByKey.get(it._groupKey);
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

    window.closeProductDetail = function () {
        const modal = document.getElementById('productDetailModal');
        if (modal) modal.classList.remove('open');
        currentDetailItem = null;
        currentGroup = null;
    };

    function renderDetailModal(it, showGroupBack) {
        const crumbEl = document.getElementById('detGroupCrumb');
        const skuEl = document.getElementById('detSku');
        const nameEl = document.getElementById('detName');
        const priceWrapEl = document.getElementById('detPriceWrap');
        const priceEl = document.getElementById('detPrice');
        const addBtn = document.getElementById('detAddCartBtn');
        const subBtn = document.getElementById('detSubCartBtn');
        const remAllBtn = document.getElementById('detRemoveAllCartBtn');

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

        const baseTitle = stripDimensionsFromProductText(it.n) || cleanStr(it._groupTitle) || it.s || '';
        const formattedPrice = formatPrice(it.pr);
        if (nameEl) {
            nameEl.textContent = baseTitle;
        }
        // Precio adentro del recuadro de inventario (junto a Stock Total)
        if (priceEl && priceWrapEl) {
            if (formattedPrice) {
                priceEl.textContent = formattedPrice;
                priceWrapEl.classList.remove('hidden');
            } else {
                priceEl.textContent = '';
                priceWrapEl.classList.add('hidden');
            }
        }

        const key = String(it.s || '').toUpperCase();
        const q = cart[key] ? (Number(cart[key].qty) || 0) : 0;
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

        // Ficha de información del producto (sin Proveedor / Tiempo de entrega, según BORRAR.png)
        const specsWrap = document.getElementById('detSpecsWrap');
        const specsGrid = document.getElementById('detSpecsGrid');
        const specRows = [
            ['SKU / Clave', it.s],
            ['Categoría', it._cat && it._cat !== 'OTROS' ? it._cat : cleanStr(it.c)],
            ['Tipo de producto', cleanStr(it.tp)],
            ['Modelo', cleanStr(it.mo)],
            ['Variante', cleanStr(it.vr)],
            ['Medidas', cleanStr(it.m)],
            ['Tela', cleanStr(it.tl)],
            ['Color de tela', cleanStr(it.ct)],
            ['Madera', cleanStr(it.md)],
            ['Color de madera', cleanStr(it.cm)],
            ['Materiales', cleanStr(it.mt)]
        ].filter(r => cleanStr(r[1]));
        if (specsGrid) {
            specsGrid.innerHTML = specRows.map(r =>
                '<div class="rounded-lg border px-3 py-2" style="border-color:#E8E4DE;">' +
                    '<div class="text-[10px] font-extrabold uppercase tracking-wider opacity-60" style="color:#252C32;">' + escapeHtml(r[0]) + '</div>' +
                    '<div class="text-xs font-bold uppercase mt-0.5 break-words" style="color:#252C32;">' + escapeHtml(r[1]) + '</div>' +
                '</div>'
            ).join('');
        }
        if (specsWrap) specsWrap.classList.toggle('hidden', specRows.length === 0);

        const sameSkuRefresh = !!(relatedStockRefSku && relatedStockRefSku === key);
        prepareRelatedInStockSection(it, sameSkuRefresh ? relatedStockExpanded : false);
    }

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
            if (b.hasPhoto !== a.hasPhoto) return b.hasPhoto - a.hasPhoto;
            if (b.stock !== a.stock) return b.stock - a.stock;
            return compareAlphaEs(a.it.n || a.it.s, b.it.n || b.it.s);
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
        }
    ];

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
        return 'Serie ' + pfx + ' (En vivo)';
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
        }
        if (storeUp) {
            for (let j = 0; j < USER_BRANCH_TABS.length; j++) {
                if (USER_BRANCH_TABS[j].erpStore.toUpperCase() === storeUp) return USER_BRANCH_TABS[j];
            }
        }
        return null;
    }

    function enrichAdvisorLocation(u) {
        if (!u || typeof u !== 'object') return u;
        const cfg = findBranchConfig(u.sheetTab || u.branchKey, u.erpStore);
        const adminFlag = isEmailOrRoleAdmin(u) || !!(cfg && cfg.isAdmin);
        const resolvedStore = cleanStr(u.erpAdvisorBranch && adminFlag ? u.erpAdvisorBranch : '') ||
            cleanStr(u.erpStore) ||
            (cfg ? cfg.erpStore : '') ||
            'CREATA PUERTO CANCUN';
        const isProy = !adminFlag && (cfg ? !!cfg.isProyecto : (!!u.isProyecto || String(u.branchKey || u.sheetTab || '').toUpperCase() === 'PROYECTOS'));
        const prefix = getStoreFolioPrefix(resolvedStore, u.orderPrefix || (cfg ? cfg.orderPrefix : (isProy ? 'PRO' : 'PTC')));
        const parsedDisc = parseDiscountPctCell(u.maxDiscountPct);
        return Object.assign({}, u, {
            isAdmin: adminFlag,
            maxDiscountPct: parsedDisc !== null ? parsedDisc : (u.maxDiscountPct !== undefined ? u.maxDiscountPct : null),
            branchKey: adminFlag ? 'ADMIN' : (u.branchKey || (cfg ? cfg.branchKey : '')),
            branchLabel: u.branchLabel || (cfg ? cfg.label : (u.sheetTab || '')),
            erpStore: resolvedStore,
            orderPrefix: prefix,
            quoteType: adminFlag ? 'ADMINISTRATIVO' : (u.quoteType || (cfg ? cfg.quoteType : (isProy ? 'PROYECTO' : 'SUCURSAL'))),
            isProyecto: isProy,
            serieLabel: u.serieLabel || (cfg ? cfg.serieLabel : '')
        });
    }

    let erpStoresCatalog = DEFAULT_ERP_STORES.slice();
    let erpAdvisorsCatalog = [];
    let activeAdvisorSession = loadAdvisorSession();
    let pendingAuthContext = null; // { email, inputKey, locations, switchingFromActive }
    let quoteDraftMeta = loadQuoteDraftMeta();
    let quoteSubmitInFlight = false;
    let currentNextOrderCode = '';
    let myRecentQuotesList = [];
    let recentQuotesStoreFilter = 'ALL';
    let lastSubmittedQuoteMeta = null;
    let pendingQuoteRetrySendToErp = null;

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

    function loadQuoteDraftMeta() {
        const fallback = {
            erpStore: '',
            erpAdvisorLabel: '',
            erpAdvisorId: '',
            clientMode: 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)',
            categoryLabel: 'COTIZACIONES [ID: 2]',
            clientName: '',
            clientPhone: '',
            deliveryDateIso: getDefaultDeliveryIsoDate(),
            notes: '',
            extraDiscount: 0
        };
        try {
            const saved = JSON.parse(localStorage.getItem(QUOTE_META_STORAGE) || 'null');
            if (saved && typeof saved === 'object') {
                return Object.assign(fallback, saved, {
                    deliveryDateIso: saved.deliveryDateIso || getDefaultDeliveryIsoDate()
                });
            }
        } catch (e) {}
        return fallback;
    }

    window.saveQuoteDraftMeta = function () {
        const modeEl = document.getElementById('quoteClientModeSelect');
        const catEl = document.getElementById('quoteCategorySelect');
        const nameEl = document.getElementById('quoteClientNameInput');
        const phoneEl = document.getElementById('quoteClientPhoneInput');
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
        if (modeEl) quoteDraftMeta.clientMode = modeEl.value;
        if (catEl) quoteDraftMeta.categoryLabel = catEl.value;
        if (nameEl) quoteDraftMeta.clientName = nameEl.value;
        if (phoneEl) quoteDraftMeta.clientPhone = phoneEl.value;
        if (dateEl && dateEl.value) quoteDraftMeta.deliveryDateIso = dateEl.value;
        if (notesEl) quoteDraftMeta.notes = notesEl.value;
        if (extraEl) quoteDraftMeta.extraDiscount = Math.max(0, Number(extraEl.value) || 0);

        try {
            localStorage.setItem(QUOTE_META_STORAGE, JSON.stringify(quoteDraftMeta));
        } catch (e) {}
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
            fetchSheetCsvRows('1', 'range=A2:D5500').catch(() => null)
        ]);
        const stores = DEFAULT_ERP_STORES.slice();
        const advisors = [];
        const nextPrices = new Map();
        const nextErpCatalog = new Map();
        const nextPhotos = new Map();

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
                const hFoto = cleanStr(hr[3]) || (cleanStr(hr[2]).indexOf('http') === 0 ? cleanStr(hr[2]) : '');
                if (hFoto) nextPhotos.set(hSku, hFoto);
                if (hNom && /^DESC[-\s]|DESCONTINUAD/i.test(hNom)) continue;
                const prevEntry = nextErpCatalog.get(hSku);
                if (prevEntry) {
                    if (!prevEntry.n && hNom) prevEntry.n = hNom;
                    if (hFoto) prevEntry.f = hFoto;
                } else if (hNom || hFoto) {
                    nextErpCatalog.set(hSku, {
                        sku: hSkuRaw,
                        mo: '',
                        n: hNom || hSkuRaw,
                        pr: nextPrices.get(hSku) || '',
                        f: hFoto
                    });
                }
            }
        }

        if (stores.length > 0) erpStoresCatalog = stores;
        if (advisors.length > 0) erpAdvisorsCatalog = advisors;
        if (nextPrices.size > 0) liveErpPricesBySku = nextPrices;
        if (nextPhotos.size > 0) livePhotosBySku = nextPhotos;
        if (nextErpCatalog.size > 0) liveErpCatalogBySku = nextErpCatalog;
        lastErpCatalogSyncMs = Date.now();
    }

    async function fetchAllAdvisorRowsLiveGviz() {
        await loadErpCatalogLiveFromSheet();
        const localKeyUpdates = loadUpdatedKeysMap();
        const results = await Promise.all(USER_BRANCH_TABS.map(async (cfg) => {
            const rows = await fetchSheetCsvRows(cfg.tab);
            if (!rows || rows.length < 2) return [];
            let headerIdx = -1;
            for (let h = 0; h < Math.min(rows.length, 4); h++) {
                const hdrRow = rows[h] || [];
                if (/^CORREO/i.test(cleanStr(hdrRow[4])) || /^NOMBRE/i.test(cleanStr(hdrRow[2]))) {
                    headerIdx = h;
                    break;
                }
            }
            if (headerIdx === -1) return [];
            const tabUsers = [];
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const r = rows[i] || [];
                const nombre = cleanStr(r[2]);
                const puesto = cleanStr(r[3]);
                const correo = cleanStr(r[4]).toLowerCase();
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
        return results.flat();
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

        if (!bar) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            bar.classList.add('hidden');
            return;
        }

        if (nameEl) nameEl.textContent = activeAdvisorSession.nombre || activeAdvisorSession.correo;
        if (branchEl) {
            const prefix = getStoreFolioPrefix(activeAdvisorSession.erpStore, activeAdvisorSession.orderPrefix);
            if (activeAdvisorSession.isAdmin) {
                branchEl.textContent = 'ADMINISTRADOR · TODAS LAS TIENDAS';
            } else if (activeAdvisorSession.isProyecto) {
                branchEl.textContent = 'PROYECTO · FOLIO ' + prefix;
            } else {
                branchEl.textContent = (activeAdvisorSession.branchLabel || activeAdvisorSession.sheetTab || '') + ' · FOLIO ' + prefix;
            }
        }
        if (erpEl) {
            if (activeAdvisorSession.erpAdvisorId) {
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
        if (!activeAdvisorSession) return;
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
        refreshMyLiveQuotesInfo();
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
            const modeTag = loc.isAdmin
                ? 'ADMIN · VER TODO'
                : (loc.isProyecto ? ('PROYECTO · FOLIO ' + pfx) : ('FOLIO ' + pfx));
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

    function finalizeLocationChoice(chosenLoc, allLocs, nextOrderFromLogin) {
        const enrichedChosen = enrichAdvisorLocation(chosenLoc);
        const cleanAll = (allLocs || [enrichedChosen]).map(rawU => {
            const u = enrichAdvisorLocation(rawU);
            return {
                sheetTab: u.sheetTab,
                rowNum: u.rowNum,
                isAdmin: !!u.isAdmin,
                maxDiscountPct: u.maxDiscountPct !== undefined ? u.maxDiscountPct : null,
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
                authToken: u.authToken || ''
            };
        });

        const sessionObj = {
            sheetTab: enrichedChosen.sheetTab,
            rowNum: enrichedChosen.rowNum,
            isAdmin: !!enrichedChosen.isAdmin,
            maxDiscountPct: enrichedChosen.maxDiscountPct !== undefined ? enrichedChosen.maxDiscountPct : null,
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
            allLocations: cleanAll
        };

        lastSubmittedQuoteMeta = null;
        const cleanLoginFolio = (nextOrderFromLogin && !/^[A-Z]+-\d+$/i.test(String(nextOrderFromLogin)))
            ? cleanStr(nextOrderFromLogin)
            : '';
        if (cleanLoginFolio && sessionObj.erpStore) {
            liveNextFolioByStore[String(sessionObj.erpStore).toUpperCase()] = cleanLoginFolio;
        }
        currentNextOrderCode = cleanLoginFolio || getEstimatedStoreFolio(sessionObj.erpStore, sessionObj.orderPrefix);
        saveAdvisorSession(sessionObj);
        applyAdvisorDefaultsToQuoteForm(true);

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
        refreshMyLiveQuotesInfo();

        if (pendingQuoteRetrySendToErp !== null) {
            const retrySendFlag = pendingQuoteRetrySendToErp;
            pendingQuoteRetrySendToErp = null;
            submitQuoteToSystem(retrySendFlag);
            return;
        }

        const cartModalEl = document.getElementById('cartModal');
        if (!cartModalEl || !cartModalEl.classList.contains('open')) {
            const searchInp = document.getElementById('invSearchInput');
            if (searchInp) setTimeout(() => searchInp.focus(), 60);
        }
    }

    window.submitAdvisorLogin = async function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const emailEl = document.getElementById('authEmailInput');
        const keyEl = document.getElementById('authKeyInput');
        const btnEl = document.getElementById('authLoginSubmitBtn');

        const email = cleanStr(emailEl ? emailEl.value : '').toLowerCase();
        const inputKey = cleanStr(keyEl ? keyEl.value : '');
        if (!email || !inputKey) {
            showAuthBanner('authLoginMsg', 'Ingresa tu correo electrónico y tu contraseña.', 'err');
            return;
        }

        const preferredTab = (pendingQuoteRetrySendToErp !== null && activeAdvisorSession && activeAdvisorSession.correo === email)
            ? (activeAdvisorSession.sheetTab || '')
            : '';

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Verificando cuenta...';
        }
        showAuthBanner('authLoginMsg', '', 'err');

        try {
            // 1) Validación directa y emisión de token firmado vía Apps Script WebApp
            const cloudRes = await callInvWebAppPost('inv_login', {
                email: email,
                accessKey: inputKey,
                sheetTab: preferredTab
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
                showAuthBanner('authLoginMsg', cloudRes.error, 'err');
                return;
            }

            // 2) Respaldo de lectura directa en vivo desde las hojas de usuarios y plantilla
            const allUsers = await fetchAllAdvisorRowsLiveGviz();
            if (!allUsers.length) {
                showAuthBanner('authLoginMsg', 'No fue posible consultar las hojas de usuarios. Verifica tu conexión a internet.', 'err');
                return;
            }

            const emailMatches = allUsers.filter(u => u.correo === email);
            if (!emailMatches.length) {
                showAuthBanner('authLoginMsg', 'El correo ingresado no aparece registrado en ninguna hoja de sucursal.', 'err');
                return;
            }

            const validMatches = emailMatches.filter(u => {
                if (u.defKey) return keysMatchNormalized(inputKey, u.defKey);
                if (u.tempKey) return keysMatchNormalized(inputKey, u.tempKey);
                return false;
            });

            if (!validMatches.length) {
                showAuthBanner('authLoginMsg', 'Contraseña incorrecta. Verifica tu contraseña temporal o personal.', 'err');
                return;
            }

            const preparedLocs = validMatches.map(u => {
                const usedTemp = !u.defKey && !!u.tempKey && keysMatchNormalized(inputKey, u.tempKey);
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
            'Selecciona la ubicación autorizada de tu correo en la que emitirás tus cotizaciones:'
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
            populateQuoteAdvisorControls();
            refreshMyLiveQuotesInfo();

            if (pendingQuoteRetrySendToErp !== null) {
                const retrySendFlag = pendingQuoteRetrySendToErp;
                pendingQuoteRetrySendToErp = null;
                submitQuoteToSystem(retrySendFlag);
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
        lastSubmittedQuoteMeta = null;
        renderAdvisorHeaderBar();
        renderMyRecentQuotes([]);
        const keyInp = document.getElementById('authKeyInput');
        if (keyInp) keyInp.value = '';
        closeCartModal();
        openAuthModalForStartup();
    };

    // ------------------------------------------------------------------------
    // PLANTILLA DE COTIZACIÓN · BLOQUEADA AL CORREO Y EN VIVO CON S MUEBLERÍA
    // ------------------------------------------------------------------------
    window.onRecentQuotesStoreFilterChange = function () {
        const sel = document.getElementById('quoteRecentStoreFilter');
        recentQuotesStoreFilter = sel ? (sel.value || 'ALL') : 'ALL';
        renderMyRecentQuotes(myRecentQuotesList);
    };

    function renderMyRecentQuotes(list) {
        const wrap = document.getElementById('quoteMyRecentWrap');
        const listEl = document.getElementById('quoteMyRecentList');
        const headingEl = document.getElementById('quoteRecentHeading');
        const filterSel = document.getElementById('quoteRecentStoreFilter');
        if (!wrap || !listEl) return;

        if (!Array.isArray(list) || !list.length || !activeAdvisorSession) {
            listEl.innerHTML = '';
            wrap.classList.add('hidden');
            return;
        }

        const isAdmin = !!activeAdvisorSession.isAdmin;
        if (headingEl) {
            headingEl.textContent = isAdmin
                ? 'Cotizaciones en Vivo · Todas las Tiendas y Bodegas (Modo Administrador)'
                : 'Mis Cotizaciones Enviadas a S Mueblería';
        }

        for (let i = 0; i < list.length; i++) {
            const qi = list[i] || {};
            if (qi.folio) registerObservedFolio(qi.folio, qi.erpStore);
            else if (qi.orderCode) registerObservedFolio(qi.orderCode, qi.erpStore);
        }

        if (filterSel) {
            if (isAdmin) {
                const storesSeen = [];
                list.forEach(q => {
                    const st = cleanStr(q && q.erpStore);
                    if (st && storesSeen.indexOf(st) === -1) storesSeen.push(st);
                });
                const prevVal = recentQuotesStoreFilter || 'ALL';
                filterSel.innerHTML = '<option value="ALL">Todas las tiendas y bodegas (' + list.length + ')</option>' +
                    storesSeen.map(st => '<option value="' + escapeHtml(st) + '">' + escapeHtml(st) + '</option>').join('');
                filterSel.value = storesSeen.indexOf(prevVal) !== -1 ? prevVal : 'ALL';
                recentQuotesStoreFilter = filterSel.value;
                filterSel.classList.toggle('hidden', storesSeen.length <= 1);
            } else {
                filterSel.classList.add('hidden');
                recentQuotesStoreFilter = 'ALL';
            }
        }

        const filtered = (isAdmin && recentQuotesStoreFilter !== 'ALL')
            ? list.filter(q => cleanStr(q && q.erpStore).toUpperCase() === recentQuotesStoreFilter.toUpperCase())
            : list;

        if (!filtered.length) {
            listEl.innerHTML = '<div class="text-xs font-semibold opacity-70 py-2">No hay cotizaciones registradas para el filtro seleccionado.</div>';
            wrap.classList.remove('hidden');
            return;
        }

        listEl.innerHTML = filtered.map(q => {
            const isProy = String(q.quoteType || '').toUpperCase() === 'PROYECTO' || /PROYECTO/i.test(String(q.erpStore || ''));
            const rawOrder = cleanStr(q.orderCode);
            const cleanFolio = cleanStr(q.folio) || ((rawOrder && !/^[A-Z]+-\d+$/i.test(rawOrder)) ? rawOrder : '') || (q.quoteId ? ('ID-' + q.quoteId) : 'En proceso');
            const storeTag = cleanStr(q.erpStore || q.branchTab) || (isProy ? 'PROYECTOS' : 'TIENDA');
            const advTag = isAdmin && cleanStr(q.advisorName || q.erpAdvisor)
                ? (' · Asesor: ' + cleanStr(q.advisorName || q.erpAdvisor))
                : '';
            return '<div class="rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-white" style="border-color:#E1DBC5;">' +
                '<div class="min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                        '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase" style="background:' + (isProy ? '#252C32' : '#A38251') + '; color:#FFFFFF;">' +
                            escapeHtml(cleanFolio) +
                        '</span>' +
                        '<span class="text-[11px] font-extrabold uppercase" style="color:#252C32;">' + escapeHtml(storeTag) + '</span>' +
                        (q.quoteId ? ('<span class="text-[10px] font-bold opacity-70" style="color:#252C32;">(ID ERP ' + escapeHtml(q.quoteId) + ')</span>') : '') +
                    '</div>' +
                    '<div class="text-[11px] font-semibold truncate mt-0.5" style="color:#252C32;">' +
                        escapeHtml(q.clientName || 'Prospecto') +
                        escapeHtml(advTag) +
                        (q.skusSummary ? (' · ' + escapeHtml(q.skusSummary)) : '') +
                    '</div>' +
                '</div>' +
                '<div class="text-right shrink-0 ml-auto">' +
                    '<div class="text-xs font-black" style="color:#A38251;">' + escapeHtml(q.total || '') + '</div>' +
                    '<div class="text-[10px] font-semibold opacity-70" style="color:#252C32;">' + escapeHtml(q.createdAt || '') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        wrap.classList.remove('hidden');
    }

    async function fetchQuotesLedgerGvizFallback() {
        if (!activeAdvisorSession) return [];
        const rows = await fetchSheetCsvRows('COTIZACIONES_EN_VIVO');
        if (!rows || rows.length < 2) return [];
        const hdr = rows[0] || [];
        if (!/ORDEN|FOLIO/i.test(cleanStr(hdr[0]) + ' ' + cleanStr(hdr[1]))) return [];
        const isAdmin = !!activeAdvisorSession.isAdmin;
        const emailNorm = String(activeAdvisorSession.correo || '').trim().toLowerCase();
        const limit = isAdmin ? 40 : 10;
        const out = [];
        for (let i = rows.length - 1; i >= 1; i--) {
            const r = rows[i] || [];
            const folioVal = cleanStr(r[1]) || cleanStr(r[0]);
            const storeVal = cleanStr(r[6]);
            if (folioVal) registerObservedFolio(folioVal, storeVal);
            const rowEmail = cleanStr(r[7]).toLowerCase();
            if (!isAdmin && rowEmail !== emailNorm) continue;
            if (out.length < limit) {
                out.push({
                    orderCode: cleanStr(r[0]),
                    folio: cleanStr(r[1]),
                    quoteId: cleanStr(r[2]),
                    createdAt: cleanStr(r[3]),
                    quoteType: cleanStr(r[4]),
                    branchTab: cleanStr(r[5]),
                    erpStore: storeVal,
                    advisorEmail: rowEmail,
                    advisorName: cleanStr(r[8]),
                    erpAdvisor: cleanStr(r[9]),
                    clientName: cleanStr(r[11]),
                    itemsCount: cleanStr(r[16]),
                    skusSummary: cleanStr(r[17]),
                    total: cleanStr(r[21]),
                    status: cleanStr(r[22])
                });
            }
        }
        return out;
    }

    async function refreshMyLiveQuotesInfo() {
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
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
                if (res.advisor) {
                    const updatedAdv = enrichAdvisorLocation(res.advisor);
                    if (updatedAdv.erpAdvisorLabel) activeAdvisorSession.erpAdvisorLabel = updatedAdv.erpAdvisorLabel;
                    if (updatedAdv.erpAdvisorId) activeAdvisorSession.erpAdvisorId = updatedAdv.erpAdvisorId;
                    if (updatedAdv.maxDiscountPct !== null && updatedAdv.maxDiscountPct !== undefined) {
                        activeAdvisorSession.maxDiscountPct = updatedAdv.maxDiscountPct;
                    }
                    if (updatedAdv.isAdmin) activeAdvisorSession.isAdmin = true;
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

        // Respaldo directo por lectura de COTIZACIONES_EN_VIVO + LPPT
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
    };

    window.onAdminAdvisorChange = function () {
        const advSel = document.getElementById('quoteAdminAdvisorSelect');
        if (!advSel || !activeAdvisorSession || !activeAdvisorSession.isAdmin) return;
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
    };

    function populateQuoteAdvisorControls() {
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
                titleEl.textContent = 'Cotización S Mueblería · Modo Administrador (Acceso Total)';
            } else {
                titleEl.textContent = isProy
                    ? 'Cotización de Proyecto · S Mueblería En Vivo'
                    : 'Cotización de Tienda / Bodega · S Mueblería En Vivo';
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

        if (modeSel && quoteDraftMeta.clientMode) modeSel.value = quoteDraftMeta.clientMode;
        if (catSel && quoteDraftMeta.categoryLabel) catSel.value = quoteDraftMeta.categoryLabel;
        if (nameInp && document.activeElement !== nameInp) nameInp.value = quoteDraftMeta.clientName || '';
        if (phoneInp && document.activeElement !== phoneInp) phoneInp.value = quoteDraftMeta.clientPhone || '';
        if (dateInp && document.activeElement !== dateInp) {
            dateInp.value = quoteDraftMeta.deliveryDateIso || getDefaultDeliveryIsoDate();
        }
        if (notesInp && document.activeElement !== notesInp) notesInp.value = quoteDraftMeta.notes || '';
        if (extraInp && document.activeElement !== extraInp) {
            extraInp.value = String(Math.max(0, Number(quoteDraftMeta.extraDiscount) || 0));
        }
        renderQuoteTotalsOnly();
    }

    window.onExtraDiscountChange = function () {
        saveQuoteDraftMeta();
        renderQuoteTotalsOnly();
    };

    // ------------------------------------------------------------------------
    // LÍMITE DE DESCUENTO (COLUMNA DESCUENTO EN HOJA DE USUARIOS / PUESTO)
    // ASESOR: 24% · GERENTE / SUBGERENTE / ADMINISTRADOR: 100%
    // ------------------------------------------------------------------------
    const ADVISOR_MAX_DISCOUNT_PCT = 24;
    const MANAGER_MAX_DISCOUNT_PCT = 100;

    function getAdvisorRoleInfo() {
        const sess = activeAdvisorSession;
        const puestoRaw = cleanStr(sess && sess.puesto);
        const p = String(puestoRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const isAdmin = !!(sess && sess.isAdmin) || /ADMINISTRADOR/.test(p);
        const isManager = isAdmin || /GERENTE|\bSUB/.test(p);
        const sheetPct = sess ? parseDiscountPctCell(sess.maxDiscountPct) : null;
        const maxPct = isAdmin
            ? MANAGER_MAX_DISCOUNT_PCT
            : (sheetPct !== null ? sheetPct : (isManager ? MANAGER_MAX_DISCOUNT_PCT : ADVISOR_MAX_DISCOUNT_PCT));
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

    window.setCartItemDiscount = function (skuRaw, rawPct) {
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
        const q = cart[key] ? (Number(cart[key].qty) || 0) : 0;

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
        const key = String(skuRaw || '').trim().toUpperCase();
        if (!key) return;
        const stepDelta = (typeof delta === 'number' && !isNaN(delta)) ? delta : 1;
        const it = bySkuMap.get(key);
        if (!cart[key]) {
            if (stepDelta <= 0 || !it) return;
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
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
            return;
        }
        if (!erpAdvisorsCatalog.length) {
            loadErpCatalogLiveFromSheet().then(() => populateQuoteAdvisorControls());
        }
        populateQuoteAdvisorControls();
        renderCartItems();
        renderMyRecentQuotes(myRecentQuotesList);
        document.getElementById('cartModal').classList.add('open');
        refreshMyLiveQuotesInfo();
    };

    window.closeCartModal = function () {
        document.getElementById('cartModal').classList.remove('open');
    };

    window.clearCart = function () {
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
            let html = 'Puesto: <strong>' + escapeHtml(role.puesto) + '</strong> · Descuento autorizado: <strong>' + role.maxPct + '%</strong>' +
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

        wrap.innerHTML = bd.lines.map((ln, idx) => {
            const unitStr = ln.unitList > 0 ? formatPrice(ln.unitList) : 'Sin precio';
            const lineSubStr = ln.lineSubtotal > 0 ? formatPrice(ln.lineSubtotal) : '$0.00';
            return '<div class="rounded-xl border p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5" style="border-color:#E8E4DE; background:#FFFFFF;">' +
                (function () { const liveIt = bySkuMap.get(ln.key); return liveIt ? buildThumbHtml(liveIt) : ''; })() +
                '<div class="min-w-0 flex-1 cursor-pointer" onclick="closeCartModal(); openProductDetail(\'' + escapeHtml(ln.key) + '\', false)">' +
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
                        '<input type="number" min="0" max="' + bd.maxPct + '" step="0.5" value="' + (ln.discountPct || 0) + '" ' +
                               'onchange="setCartItemDiscount(\'' + escapeHtml(ln.key) + '\', this.value)" ' +
                               'class="w-14 rounded-lg border px-1.5 py-1 text-center text-xs font-bold outline-none" ' +
                               'style="border-color:#E1DBC5; color:#252C32;">' +
                    '</div>' +
                    '<div class="flex items-center gap-1">' +
                        '<button type="button" title="Restar 1 pieza" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', -1)" class="w-7 h-7 rounded-full border text-sm font-bold hover:bg-red-50" style="border-color:#E1DBC5;">−</button>' +
                        '<span class="w-6 text-center text-xs font-extrabold">' + ln.qty + '</span>' +
                        '<button type="button" title="Sumar 1 pieza" onclick="addToCart(\'' + escapeHtml(ln.key) + '\', 1)" class="w-7 h-7 rounded-full border text-sm font-bold" style="border-color:#A38251; background:#A38251; color:#FFF;">+</button>' +
                        '<button type="button" title="Quitar producto de la cotización" onclick="removeFromCart(\'' + escapeHtml(ln.key) + '\')" class="ml-1 px-2.5 h-7 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition" style="border-color:#FECACA; background:#FEF2F2; color:#991B1B;">✕ Quitar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        renderQuoteTotalsOnly();
    }

    function collectQuoteSubmissionPayload(sendToErp) {
        saveQuoteDraftMeta();
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
            categoryLabel: quoteDraftMeta.categoryLabel || 'COTIZACIONES [ID: 2]',
            clientMode: quoteDraftMeta.clientMode || 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)',
            clientName: cleanStr(quoteDraftMeta.clientName) || (isProy ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA'),
            clientPhone: cleanStr(quoteDraftMeta.clientPhone),
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
            'Categoría: ' + payload.categoryLabel,
            'Modalidad Cliente: ' + payload.clientMode,
            (payload.isProyecto ? 'Proyecto / Cliente: ' : 'Cliente / Prospecto: ') + payload.clientName,
            payload.clientPhone ? ('Teléfono: ' + payload.clientPhone) : '',
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

    window.printQuoteTemplate = function () {
        const bd = computeQuoteBreakdown();
        if (!bd.lines.length) return;
        const payload = collectQuoteSubmissionPayload(false);
        const todayStr = formatDateDMY(new Date());
        const logoSrc = window.CREATA_LOGO_B64 || '';
        const folioTxt = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.folio) || payload.orderCode || '';
        const qidTxt = (lastSubmittedQuoteMeta && lastSubmittedQuoteMeta.quoteId) ? lastSubmittedQuoteMeta.quoteId : '';
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

    window.submitQuoteToSystem = async function (sendToErp) {
        if (quoteSubmitInFlight) return;
        if (!activeAdvisorSession || activeAdvisorSession.mustChangeKey) {
            openAuthModalForStartup();
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

        const btnRev = document.getElementById('btnLoadPlantillaReview');
        const btnSend = document.getElementById('btnSendQuoteErp');
        quoteSubmitInFlight = true;
        if (btnRev) btnRev.disabled = true;
        if (btnSend) btnSend.disabled = true;

        renderQuoteStatusBanner(
            'warn',
            '<div class="font-extrabold uppercase">' +
                (sendToErp
                    ? ('Enviando ' + (payload.isProyecto ? 'Cotización de Proyecto' : 'Cotización') + ' en vivo a S Mueblería...')
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
                    res.error || 'Confirma tu contraseña personal para emitir tu cotización en vivo en S Mueblería.',
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
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización cargada en revisión en Google Sheets (Serie ' + escapeHtml(payload.orderPrefix) + ')</div>' +
                        '<div>Tienda / Bodega: <strong>' + escapeHtml(res.erpStore || payload.erpStore) + '</strong>' +
                            ' · Usuario S Mueblería: <strong>' + escapeHtml(res.erpAdvisor || payload.erpAdvisorLabel) + '</strong></div>' +
                        (res.erpStatus ? ('<div>Estado: ' + escapeHtml(res.erpStatus) + '</div>') : '')
                    );
                    return;
                }

                // Flujo directo 24/7 en vivo hacia sistema.smuebleria.com
                if (res.sentLiveToErp) {
                    const folioTxt = folioFromRes || assignedFolio || ('ID-' + cleanStr(res.quoteId));
                    const qidTxt = cleanStr(res.quoteId);
                    lastSubmittedQuoteMeta = {
                        orderCode: folioTxt,
                        folio: folioTxt,
                        quoteId: qidTxt,
                        createdAt: cleanStr(res.lastSync),
                        quoteType: res.quoteType || payload.quoteType
                    };
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización creada en vivo en el sistema S Mueblería</div>' +
                        '<div>Folio S Mueblería (' + escapeHtml(payload.erpStore) + '): <strong>' + escapeHtml(folioTxt) + '</strong>' +
                            (qidTxt ? (' · ID Cotización ERP: <strong>' + escapeHtml(qidTxt) + '</strong>') : '') +
                        '</div>' +
                        '<div>Emitida con usuario S Mueblería: <strong>' + escapeHtml(payload.erpAdvisorLabel) + '</strong></div>' +
                        '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Comprobante / PDF con Folio S Mueblería →</button></div>'
                    );
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
                    lastSubmittedQuoteMeta = {
                        orderCode: folioFallback || assignedFolio,
                        folio: folioFallback,
                        quoteId: qidFallback,
                        createdAt: cleanStr(latest && latest.lastSync),
                        quoteType: payload.quoteType
                    };
                    populateQuoteAdvisorControls();
                    renderQuoteStatusBanner(
                        'ok',
                        '<div class="font-extrabold uppercase">✓ Cotización registrada en S Mueblería</div>' +
                        '<div>Folio S Mueblería: <strong>' + escapeHtml(folioFallback || assignedFolio) + '</strong>' +
                            (qidFallback ? (' · ID Cotización: <strong>' + escapeHtml(qidFallback) + '</strong>') : '') +
                        '</div>' +
                        '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Comprobante / PDF con Folio S Mueblería →</button></div>'
                    );
                } else if (res.queuedForDaemon) {
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">⏳ Cotización guardada en cola automática hacia S Mueblería</div>' +
                        '<div>La sesión directa en nube estaba por renovarse, así que la cotización quedó lista en <code>plantilla</code> (<strong>ENVIAR COTIZACIÓN A S MUEBLERÍA</strong>). En cuanto <code>servicio_en_vivo.py</code> esté activo en la PC sincronizadora, se cargará automáticamente con su folio oficial.</div>' +
                        '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Comprobante / PDF provisional →</button></div>'
                    );
                } else {
                    renderQuoteStatusBanner(
                        'warn',
                        '<div class="font-extrabold uppercase">Plantilla registrada · Falta activar nueva versión de Apps Script para envío directo 24/7</div>' +
                        '<div>Para que la cotización se inserte directo en vivo en <strong>sistema.smuebleria.com</strong> sin depender de ninguna computadora encendida, pega el código actualizado de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em>.</div>'
                    );
                }
                return;
            }

            if (res && !res.ok && !res.unavailable && !res.needsRedeploy && res.error) {
                renderQuoteStatusBanner(
                    'err',
                    '<div class="font-extrabold uppercase">No se pudo registrar la cotización en S Mueblería</div>' +
                    '<div>' + escapeHtml(res.error) + '</div>'
                );
                return;
            }

            window.copyCartSummary();
            renderQuoteStatusBanner(
                'warn',
                '<div class="font-extrabold uppercase">Plantilla generada y copiada al portapapeles</div>' +
                '<div>Actualiza la versión publicada de <code>AppsScript_Creata_Drive_Sheets.gs</code> en <em>Extensiones → Apps Script → Implementar → Administrar implementaciones → Editar → Nueva versión</em> para enviar en vivo directo a S Mueblería.</div>' +
                '<div class="pt-1"><button type="button" onclick="printQuoteTemplate()" class="underline font-extrabold">Abrir Vista / PDF de esta Cotización →</button></div>'
            );
        } finally {
            quoteSubmitInFlight = false;
            if (btnRev) btnRev.disabled = false;
            if (btnSend) btnSend.disabled = false;
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
                const comComp = (r.length > 18 ? cleanStr(r[18]) : '').toUpperCase();
                if (folio || cliente || comComp.indexOf('NO DISPONIBLE') !== -1 || comComp.indexOf('GARANTIA') !== -1) {
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
                }
                const freeQty = Math.max(0, cant - reserved);
                if (freeQty <= 0) continue;

                const fcStr = cleanStr(r[2]); // Columna C: Fecha compra
                const fcompStr = r.length > 5 ? cleanStr(r[5]) : '';
                let list = nextMap.get(sku);
                if (!list) {
                    list = [];
                    nextMap.set(sku, list);
                }
                list.push({
                    fc: parseSheetDate(fcStr),
                    fcStr: fcStr,
                    oc: oc,
                    fcomp: parseSheetDate(fcompStr),
                    free: freeQty
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

            for (let k = 0; k < entries.length; k++) {
                const e = entries[k];
                lpptQty += e.free;

                let dCompraLt = null;
                if (e.fc && validBaseLt) {
                    dCompraLt = new Date(e.fc.getTime());
                    dCompraLt.setDate(dCompraLt.getDate() + validBaseLt);
                }
                let arr = dCompraLt;
                if ((!arr || arr < today) && e.fcomp && (!arr || e.fcomp > arr)) {
                    arr = e.fcomp;
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
            const remDays = bestArr
                ? Math.max(0, Math.round((bestArr.getTime() - today.getTime()) / 86400000))
                : validBaseLt;

            return {
                lpptQty: lpptQty,
                lt: remDays,
                baseLt: validBaseLt,
                fe: feFormatted
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
            fe: feClean
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
                f: cleanStr(gvizCellRaw(rowCells, colFoto)) || (prevIt && prevIt.f) || '',
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
                    f: (erpMeta && erpMeta.f) || (prevIt && prevIt.f) || '',
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
                            const updatedGrp = groupsByKey.get(refreshed._groupKey);
                            currentGroup = (updatedGrp && updatedGrp.items.length > 1) ? updatedGrp : null;
                        }
                        const crumbVisible = !document.getElementById('detGroupCrumb').classList.contains('hidden');
                        renderDetailModal(currentDetailItem, crumbVisible && !!currentGroup);
                    } else {
                        closeProductDetail();
                    }
                } else if (currentGroup) {
                    const refreshedGrp = groupsByKey.get(currentGroup.key);
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
                try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
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
                await tryWebAppLiveSync();
            }
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
                            baseLt: cols.length > 20 ? normalizeLeadTimeVal(cols[20][i]) : normalizeLeadTimeVal(cols[14][i])
                        }, null);
                    }
                    allItems = unpacked;
                    window.CREATA_INV_DATA = unpacked;
                }
            } catch (err) {
                console.error('[Inventario Unpack Error]', err);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async function () {
        openAuthModalForStartup();
        loadErpCatalogLiveFromSheet().then(() => {
            if ((liveErpPricesBySku.size > 0 || liveErpCatalogBySku.size > 0 || livePhotosBySku.size > 0) && Array.isArray(allItems) && allItems.length > 0) {
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
                    if (!it.f && livePhotosBySku.has(skuU)) {
                        it.f = livePhotosBySku.get(skuU);
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
                        f: erpMeta.f || '',
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
        refreshLiveSheetNow();
        setInterval(function () {
            if (document.visibilityState !== 'hidden') {
                refreshLiveSheetNow();
            }
        }, 12000);
        window.addEventListener('focus', refreshLiveSheetNow);
        window.addEventListener('online', refreshLiveSheetNow);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                refreshLiveSheetNow();
            }
        });
    });
})();
